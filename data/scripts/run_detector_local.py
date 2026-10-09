"""Run the detector logic locally (no AWS): live Open-Meteo forecast -> bias offset vs ERA5 archive
-> detection -> litres -> Status items written by LocalRepo to data/out/status/{district}.json.

This is the same thirstcast_core.pipeline.build_status the detector Lambda uses, so it doubles as the
KD-12 golden test: run it on the cached forecast JSON Aneek shares and compare with GET /thirstwave.
Usage:
  python data/scripts/run_detector_local.py                  # live call, cached in data/raw/forecast/
  python data/scripts/run_detector_local.py --forecast-file f.json --district Mandya --today 2026-10-09
"""
import argparse
import json
from datetime import date, datetime, timedelta, timezone

from common import RAW
from thirstcast_core.bias import compute_offset
from thirstcast_core.openmeteo import daily_rows, fetch_archive, fetch_forecast
from thirstcast_core.pipeline import build_status
from thirstcast_core.repo import LocalRepo

IST = timezone(timedelta(hours=5, minutes=30))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="all")
    ap.add_argument("--today", default=date.today().isoformat())
    ap.add_argument("--forecast-file")
    ap.add_argument("--archive-file")
    args = ap.parse_args()
    repo = LocalRepo()
    cfg = repo.get_config()
    today = date.fromisoformat(args.today)
    ids = [k.split("#", 1)[1] for k in cfg if k.startswith("district#")]
    if args.district != "all":
        ids = [args.district]
    cache = RAW / "forecast"
    cache.mkdir(parents=True, exist_ok=True)
    for did in ids:
        d = cfg[f"district#{did}"]
        if args.forecast_file:
            fc = json.loads(open(args.forecast_file).read())
        else:
            p = cache / f"forecast_{did}_{args.today}.json"
            if not p.exists():
                p.write_text(json.dumps(fetch_forecast(d["lat"], d["lon"])))
            fc = json.loads(p.read_text())
        if args.archive_file:
            ar = json.loads(open(args.archive_file).read())
        else:
            s, e = (today - timedelta(days=30)).isoformat(), (today - timedelta(days=6)).isoformat()
            p = cache / f"archive_{did}_{s}_{e}.json"
            if not p.exists():
                p.write_text(json.dumps(fetch_archive(d["lat"], d["lon"], s, e)))
            ar = json.loads(p.read_text())
        rows = [r for r in daily_rows(fc) if r["et0"] is not None]
        offset = compute_offset(rows, daily_rows(ar), today)
        item = build_status(did, rows, repo.get_climatology(did), cfg, args.today, offset,
                            updated_at=datetime.now(IST).isoformat(timespec="seconds"))
        repo.put_status(item)
        print(f"{did}: {item['status']} day_in_wave={item['day_in_wave']} excess_7d={item['excess_mm_7d']} "
              f"offset={item['bias_offset_mm']} litres={item['extra_litres_per_acre']}")


if __name__ == "__main__":
    main()
