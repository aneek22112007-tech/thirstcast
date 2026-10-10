"""Local Lambda tests with moto (fake DynamoDB/S3/SNS; no AWS account, no network).
Run: pip install "moto[dynamodb,s3,sns]" pytest boto3 && python -m pytest backend/tests -q
sys.path mimics the Lambda layers: /opt/python = core + common + agent."""
import importlib.util
import json
import sys
from decimal import Decimal
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend/core/python"), str(ROOT / "backend/functions/common"), str(ROOT / "agent")]
boto3 = pytest.importorskip("boto3")
moto = pytest.importorskip("moto")


def load(name):
    spec = importlib.util.spec_from_file_location(f"{name}_app", ROOT / f"backend/functions/{name}/app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def dec(o):
    return json.loads(json.dumps(o), parse_float=Decimal)


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    for k, v in {"CLIMATOLOGY_TABLE": "clim", "STATUS_TABLE": "status", "CONFIG_TABLE": "config", "BUCKET_NAME": "tc-data"}.items():
        monkeypatch.setenv(k, v)
    with moto.mock_aws():
        ddb = boto3.resource("dynamodb")
        ddb.create_table(TableName="clim", BillingMode="PAY_PER_REQUEST",
                         KeySchema=[{"AttributeName": "district", "KeyType": "HASH"}, {"AttributeName": "doy", "KeyType": "RANGE"}],
                         AttributeDefinitions=[{"AttributeName": "district", "AttributeType": "S"}, {"AttributeName": "doy", "AttributeType": "N"}])
        ddb.create_table(TableName="status", BillingMode="PAY_PER_REQUEST",
                         KeySchema=[{"AttributeName": "district", "KeyType": "HASH"}],
                         AttributeDefinitions=[{"AttributeName": "district", "AttributeType": "S"}])
        ddb.create_table(TableName="config", BillingMode="PAY_PER_REQUEST",
                         KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
                         AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}])
        with ddb.Table("clim").batch_writer() as b:
            for it in json.loads((ROOT / "data/out/climatology.json").read_text()):
                b.put_item(Item=dec(it))
        with ddb.Table("config").batch_writer() as b:
            for it in json.loads((ROOT / "data/out/config_items.json").read_text()):
                b.put_item(Item=dec(it))
        s3 = boto3.client("s3")
        s3.create_bucket(Bucket="tc-data", CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
        for p in (ROOT / "data/out/replay").glob("*.json"):
            s3.put_object(Bucket="tc-data", Key=f"replay/{p.name}", Body=p.read_bytes())
        for p in (ROOT / "data/raw").glob("archive_*_2024.json"):
            s3.put_object(Bucket="tc-data", Key=f"raw/{p.name}", Body=p.read_bytes())
        topic = boto3.client("sns").create_topic(Name="alerts")["TopicArn"]
        monkeypatch.setenv("ALERT_TOPIC_ARN", topic)
        yield {"ddb": ddb, "s3": s3, "topic": topic}


def fake_forecast(today, et0):
    from datetime import date, timedelta
    t = date.fromisoformat(today)
    days = [(t + timedelta(i)).isoformat() for i in range(-35, 7)]
    return {"daily": {"time": days, "et0_fao_evapotranspiration": [et0] * len(days), "temperature_2m_max": [30.0] * len(days)}}


def test_detector_live_then_api(aws, monkeypatch):
    det = load("detector")
    from datetime import datetime
    today = datetime.now(det.IST).date().isoformat()
    monkeypatch.setattr(det, "fetch_forecast", lambda *a, **k: fake_forecast(today, 9.5))  # far above any p90
    monkeypatch.setattr(det, "fetch_archive", lambda lat, lon, s, e: fake_forecast(today, 9.0))
    out = det.lambda_handler({}, None)
    assert {r["status"] for r in out["results"].values()} == {"ACTIVE"}
    assert all(r["alerted"] for r in out["results"].values())
    assert all(abs(r["offset"] - 0.5) < 1e-6 for r in out["results"].values())
    keys = [o["Key"] for o in aws["s3"].list_objects_v2(Bucket="tc-data", Prefix="cache/forecast/")["Contents"]]
    assert len(keys) == 3

    api = load("api")
    r = api.lambda_handler({"routeKey": "GET /districts"}, None)
    body = json.loads(r["body"])
    assert r["statusCode"] == 200 and len(body["districts"]) == 3 and body["caveat"].startswith("District-centroid")
    assert {d["status"] for d in body["districts"]} == {"ACTIVE"} and body["districts"][0]["lat"]
    r = api.lambda_handler({"routeKey": "GET /thirstwave/{district}", "pathParameters": {"district": "Mandya"}}, None)
    t = json.loads(r["body"])
    assert t["status"] == "ACTIVE" and len(t["forecast"]) == 7 and t["extra_litres_per_acre"]["paddy"][0] > 0
    assert t["extra_litres_lakes"]["KRS"]["label"] == "estimate"
    r = api.lambda_handler({"routeKey": "GET /thirstwave/{district}", "pathParameters": {"district": "Atlantis"}}, None)
    assert r["statusCode"] == 404 and json.loads(r["body"]) == {"error": "unknown district"}
    r = api.lambda_handler({"routeKey": "GET /replay/{district}", "pathParameters": {"district": "Bengaluru_Urban"}}, None)
    rp = json.loads(r["body"])
    assert rp["summary"]["days_total"] == 30 and rp["period"]["start"] == "2024-04-01"


def test_detector_uses_cache_when_open_meteo_down(aws, monkeypatch):
    det = load("detector")
    from datetime import datetime
    today = datetime.now(det.IST).date().isoformat()
    aws["s3"].put_object(Bucket="tc-data", Key="cache/forecast/Kolar/2020-01-01.json", Body=json.dumps(fake_forecast(today, 1.0)))

    def boom(*a, **k):
        raise RuntimeError("Open-Meteo down")
    monkeypatch.setattr(det, "fetch_forecast", boom)
    monkeypatch.setattr(det, "fetch_archive", boom)
    out = det.lambda_handler({"district": "Kolar"}, None)
    assert out["results"]["Kolar"]["stale"] is True and out["results"]["Kolar"]["status"] == "NONE"
    out = det.lambda_handler({"district": "Mandya"}, None)  # no cache at all -> error captured, no crash
    assert "error" in out["results"]["Mandya"]


def test_detector_replay_does_not_touch_status(aws):
    det = load("detector")
    out = det.lambda_handler({"mode": "replay", "district": "Bengaluru_Urban"}, None)
    assert out["first_active"].startswith("2024-04") and out["alerted"] is True and out["active_days"] > 0
    assert "Item" not in aws["ddb"].Table("status").get_item(Key={"district": "Bengaluru_Urban"})
    subj, body = det.fmt_alert({"district": "Bengaluru_Urban", "day_in_wave": 3, "run_date": "2024-04-05",
                                "excess_mm_7d": 4.2, "extra_litres_per_acre": {}, "extra_litres_lakes": {},
                                "caveat": "District-centroid estimate (~10 km grid)"}, replay=True)
    assert subj.startswith("[REPLAY April 2024]") and "not a live alert" in body


def test_api_before_detector_runs(aws):
    api = load("api")
    t = json.loads(api.lambda_handler({"routeKey": "GET /thirstwave/{district}", "pathParameters": {"district": "Kolar"}}, None)["body"])
    assert t["status"] == "NONE" and t["forecast"] == [] and "detector has not run" in t["note"]
    d = json.loads(api.lambda_handler({"routeKey": "GET /districts"}, None)["body"])
    assert {x["status"] for x in d["districts"]} == {"UNKNOWN"}


def test_agent_lambda(aws, monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "none")
    ag = load("agent")
    r = ag.lambda_handler({"body": json.dumps({"question": "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?"})}, None)
    b = json.loads(r["body"])
    assert r["statusCode"] == 200 and b["mode"] == "template" and b["lang"] == "hi"  # no status yet -> no-data template
    assert ag.lambda_handler({"body": "{}"}, None)["statusCode"] == 400
    assert ag.lambda_handler({"body": "not json"}, None)["statusCode"] == 400
    assert ag.lambda_handler({"body": json.dumps({"question": "x" * 501})}, None)["statusCode"] == 400
