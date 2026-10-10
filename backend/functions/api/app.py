"""api Lambda: GET /districts, GET /thirstwave/{district}, GET /replay/{district} (HTTP API, payload v2).

Data: Config + Status tables via DynamoRepo (CommonLayer), replay JSON from S3 replay/{district}_2024-04.json.
CORS is handled by the HttpApi CorsConfiguration (Amplify domain + localhost), not here.
"""
import json
import logging
import os

import boto3

from dynamo_repo import DynamoRepo
from thirstcast_core.constants import CAVEAT

log = logging.getLogger()
log.setLevel(logging.INFO)

_repo = None
_s3 = None
_replay_cache = {}


def repo():
    global _repo
    if _repo is None:
        _repo = DynamoRepo()
    return _repo


def s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3


def resp(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json", "Cache-Control": "max-age=60"},
            "body": json.dumps(body, ensure_ascii=False)}


def district_items():
    cfg = repo().get_config()
    return {v["id"] if "id" in v else k.split("#", 1)[1]: v for k, v in cfg.items() if k.startswith("district#")}


def get_districts():
    out = []
    for did, d in district_items().items():
        st = repo().get_status(did) or {}
        out.append({"id": did, "name": d.get("name", did), "lat": d.get("lat"), "lon": d.get("lon"),
                    "status": st.get("status", "NONE" if st else "UNKNOWN"), "day_in_wave": st.get("day_in_wave", 0),
                    "updated_at": st.get("updated_at")})
    order = ["Bengaluru_Urban", "Kolar", "Mandya"]
    out.sort(key=lambda x: order.index(x["id"]) if x["id"] in order else 99)
    return resp(200, {"districts": out, "caveat": CAVEAT})


def get_thirstwave(did):
    if did not in district_items():
        return resp(404, {"error": "unknown district"})
    st = repo().get_status(did)
    if not st:
        return resp(200, {"district": did, "status": "NONE", "day_in_wave": 0, "forecast": [], "excess_mm_7d": 0.0,
                          "extra_litres_per_acre": {}, "extra_litres_lakes": {}, "note": "detector has not run yet",
                          "caveat": CAVEAT})
    st["caveat"] = CAVEAT
    return resp(200, st)


def get_replay(did):
    if did not in district_items():
        return resp(404, {"error": "unknown district"})
    if did not in _replay_cache:
        obj = s3().get_object(Bucket=os.environ["BUCKET_NAME"], Key=f"replay/{did}_2024-04.json")
        _replay_cache[did] = json.loads(obj["Body"].read())
    return resp(200, _replay_cache[did])


def lambda_handler(event, context):
    route = event.get("routeKey", "")
    params = event.get("pathParameters") or {}
    try:
        if route == "GET /districts":
            return get_districts()
        if route == "GET /thirstwave/{district}":
            return get_thirstwave(params.get("district", ""))
        if route == "GET /replay/{district}":
            return get_replay(params.get("district", ""))
        return resp(404, {"error": "not found"})
    except Exception:  # noqa: BLE001
        log.exception("api error on %s", route)
        return resp(500, {"error": "internal error"})
