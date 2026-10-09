"""detector Lambda (daily 06:00 IST via EventBridge, or on demand).

Live mode (default / scheduled event), per district in Config:
  1. Open-Meteo forecast (forecast_days=7, past_days=35) -> S3 cache/forecast/{district}/{date}.json
  2. ERA5 archive (models=era5_seamless) for days 6-30 ago -> S3 cache/archive/{district}/{date}.json
  3. offset = mean(forecast - archive) ET0; et0_adj = et0 - offset; bias_note if |offset| > 0.5 mm/day
  4. thirstcast_core.pipeline.build_status (flags, runs, status, excess, litres)
  5. put_status; SNS publish if the status changed to ACTIVE and ALERT_TOPIC_ARN is set
  If Open-Meteo fails, the latest cached S3 response is used (item marked stale); the run never crashes.

Replay mode: {"mode": "replay", "district": "Bengaluru_Urban", "notify": true}
  Runs the same pipeline over April 2024 from S3 raw/archive_{district}_2024.json (archive data, no bias
  correction), never writes Status, and (if notify) publishes "[REPLAY April 2024]" for the first ACTIVE day.
"""
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone

import boto3

from dynamo_repo import DynamoRepo
from thirstcast_core.bias import compute_offset
from thirstcast_core.openmeteo import PAST_DAYS, daily_rows, fetch_archive, fetch_forecast
from thirstcast_core.pipeline import build_status

log = logging.getLogger()
log.setLevel(logging.INFO)
IST = timezone(timedelta(hours=5, minutes=30))
BUCKET = os.environ.get("BUCKET_NAME", "")
TOPIC = os.environ.get("ALERT_TOPIC_ARN", "")
SITE_URL = os.environ.get("SITE_URL", "")
s3 = boto3.client("s3")
sns = boto3.client("sns")


def put_cache(key, payload):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(payload).encode(), ContentType="application/json")


def latest_cache(prefix):
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    keys = sorted(o["Key"] for o in resp.get("Contents", []))
    if not keys:
        return None, None
    obj = s3.get_object(Bucket=BUCKET, Key=keys[-1])
    return json.loads(obj["Body"].read()), keys[-1]


def fetch_cached(kind, district, today, fn):
    """Call Open-Meteo; cache to S3; on failure fall back to the latest cached object. Returns (payload, stale_key)."""
    prefix = f"cache/{kind}/{district}/"
    try:
        payload = fn()
        put_cache(f"{prefix}{today}.json", payload)
        return payload, None
    except Exception as e:  # noqa: BLE001
        log.warning("Open-Meteo %s failed for %s: %r; using S3 cache", kind, district, e)
        payload, key = latest_cache(prefix)
        if payload is None:
            raise RuntimeError(f"no {kind} data and no cache for {district}") from e
        return payload, key


def districts(cfg):
    return {k.split("#", 1)[1]: v for k, v in cfg.items() if k.startswith("district#")}


def fmt_alert(item, replay=False):
    name = item["district"].replace("_", " ")
    crops = "; ".join(f"{c}: {lo:,}-{hi:,} L/acre" for c, (lo, hi) in item.get("extra_litres_per_acre", {}).items())
    lakes = "; ".join(f"{l}: {v['value']:,} L" for l, v in item.get("extra_litres_lakes", {}).items() if v.get("value"))
    prefix = "[REPLAY April 2024] " if replay else ""
    subject = f"{prefix}ThirstCast alert: thirstwave in {name}"[:100]
    body = "\n".join(filter(None, [
        f"{prefix}ThirstCast: {name} is in a thirstwave (status ACTIVE, day {item['day_in_wave']}) on {item['run_date']}.",
        "Replay of historical data (April 2024), not a live alert." if replay else "",
        f"Excess ET0 over the 7-day window: {item['excess_mm_7d']:.1f} mm "
        "(sum of daily ET0 above the local day-of-year p90 threshold).",
        f"Extra crop water (estimate, Kc +-10%): {crops}" if crops else "",
        f"Extra lake/reservoir evaporation (estimate, upper bound): {lakes}" if lakes else "",
        f"Caveat: {item['caveat']}. All litre figures are estimates.",
        f"Dashboard: {SITE_URL}" if SITE_URL else "",
    ]))
    return subject, body


def publish(item, replay=False):
    if not TOPIC:
        log.info("ALERT_TOPIC_ARN not set; skipping alert for %s", item["district"])
        return False
    subject, body = fmt_alert(item, replay)
    sns.publish(TopicArn=TOPIC, Subject=subject, Message=body)
    log.info("alert published: %s", subject)
    return True


def run_live(repo, only=None):
    cfg = repo.get_config()
    today = datetime.now(IST).date()
    t = today.isoformat()
    results = {}
    for did, d in districts(cfg).items():
        if only and did != only:
            continue
        try:
            fc, fc_stale = fetch_cached("forecast", did, t, lambda: fetch_forecast(d["lat"], d["lon"], PAST_DAYS))
            start, end = (today - timedelta(days=30)).isoformat(), (today - timedelta(days=6)).isoformat()
            try:
                ar, _ = fetch_cached("archive", did, t, lambda: fetch_archive(d["lat"], d["lon"], start, end))
                offset = compute_offset(daily_rows(fc), daily_rows(ar), today)
            except Exception as e:  # noqa: BLE001
                log.warning("bias offset unavailable for %s: %r; using 0", did, e)
                offset = 0.0
            rows = [r for r in daily_rows(fc) if r["et0"] is not None]
            run_date = t if any(r["date"] == t for r in rows) else rows[-7]["date"]
            item = build_status(did, rows, repo.get_climatology(did), cfg, run_date, offset,
                                updated_at=datetime.now(IST).isoformat(timespec="seconds"))
            if fc_stale:
                item["stale"] = True
                item["bias_note"] = (item["bias_note"] + " " if item["bias_note"] else "") + \
                    f"Live forecast unavailable; using cached forecast {fc_stale.rsplit('/', 1)[-1][:-5]}."
            prev = repo.get_status(did) or {}
            repo.put_status(item)
            alerted = prev.get("status") != "ACTIVE" and item["status"] == "ACTIVE" and publish(item)
            results[did] = {"status": item["status"], "day_in_wave": item["day_in_wave"],
                            "excess_mm_7d": item["excess_mm_7d"], "offset": item["bias_offset_mm"],
                            "stale": bool(fc_stale), "alerted": bool(alerted)}
            log.info(json.dumps({"district": did, **results[did]}))
        except Exception as e:  # noqa: BLE001 - one district failing must not stop the others
            log.exception("detector failed for %s", did)
            results[did] = {"error": repr(e)}
    return results


def run_replay(repo, did, notify=True):
    cfg = repo.get_config()
    obj = s3.get_object(Bucket=BUCKET, Key=f"raw/archive_{did}_2024.json")
    rows = daily_rows(json.loads(obj["Body"].read()))
    clim = repo.get_climatology(did)
    first_active, timeline = None, []
    d = date(2024, 4, 1)
    while d <= date(2024, 4, 30):
        run = d.isoformat()
        item = build_status(did, rows, clim, cfg, run, 0.0, updated_at=f"{run}T06:00:00+05:30")
        timeline.append({"date": run, "status": item["status"], "day_in_wave": item["day_in_wave"]})
        if item["status"] == "ACTIVE" and first_active is None:
            first_active = item
        d += timedelta(days=1)
    alerted = bool(first_active and notify and publish(first_active, replay=True))
    put_cache(f"cache/replay_runs/{did}_{datetime.now(IST).strftime('%Y%m%dT%H%M%S')}.json", timeline)
    return {"mode": "replay", "district": did, "first_active": first_active and first_active["run_date"],
            "active_days": sum(1 for x in timeline if x["status"] == "ACTIVE"), "alerted": alerted}


def lambda_handler(event, context):
    event = event or {}
    repo = DynamoRepo()
    if event.get("mode") == "replay":
        return run_replay(repo, event.get("district", "Bengaluru_Urban"), event.get("notify", True))
    return {"mode": "live", "results": run_live(repo, event.get("district"))}
