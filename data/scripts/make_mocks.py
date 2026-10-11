"""RS-03: build frontend/mock/*.json from REAL historical data with the same thirstcast_core pipeline.

Mock /thirstwave files evaluate the ERA5 archive as if it were a 7-day forecast, for a historical run
date chosen so the three colours (ACTIVE / WATCH / NONE) all appear. Each file says so in `mock_note`.
The UI shows a "MOCK DATA" badge whenever USE_MOCK is true, so mocks never reach the demo.

Ask files are the real template-mode agent (handle_ask mode="template") against
agent/tests/fixtures/status/, one file per suggested or Try-it question.
frontend/mock/alert_sample.json is the detector's fmt_alert() for the Mandya fixture.
"""
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import unicodedata
from datetime import date, timedelta

from common import OUT, RAW, ROOT, load_daily
from thirstcast_core.pipeline import build_status
from thirstcast_core.repo import LocalRepo

# Suggested questions (dashboard), Try-it questions (landing), plus lakes, water gap and heat.
ASK_QUESTIONS = [
    "Will Mandya face a thirstwave this week?",
    "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?",
    "How much extra water do 2 acres of paddy in Mandya need this week?",
    "Is Kolar just hot this week, or also thirsty?",
    "कोलार में 1 एकड़ टमाटर को इस हफ्ते कितना अतिरिक्त पानी चाहिए?",
    "How much extra water will Bengaluru's lakes lose this week?",
    "बेंगलुरु की झीलों से इस हफ्ते कितना अतिरिक्त पानी उड़ेगा?",
    "कोलार में इस हफ्ते सिर्फ़ गर्मी है या प्यास भी?",
    "मंड्या में 2 एकड़ धान को इस हफ्ते कितना अतिरिक्त पानी चाहिए?",
    "Will the KRS reservoir lose extra water to evaporation?",
    "What is the 7-day evaporative demand outlook for Kolar?",
    "Did thirstwaves cause the Bengaluru water crisis?",
]


def norm_question(text):
    """Same key the UI uses: NFC, trimmed, collapsed whitespace, casefold."""
    text = unicodedata.normalize("NFC", text or "")
    return re.sub(r"\s+", " ", text.strip()).casefold()

MOCK = ROOT / "frontend" / "mock"
WANT = ["Bengaluru_Urban", "Kolar", "Mandya"]  # all three colours must appear on the chosen date


def main():
    repo = LocalRepo()
    cfg = repo.get_config()
    rows = {d: load_daily(RAW / f"archive_{d}_1994_2023.json") + load_daily(RAW / f"archive_{d}_2024.json") for d in WANT}
    clim = {d: repo.get_climatology(d) for d in WANT}

    def status_on(did, run):
        idx = [r["date"] for r in rows[did]].index(run)
        days = rows[did][idx - 10: idx + 7]
        return build_status(did, days, clim[did], cfg, run, 0.0, updated_at=f"{run}T06:00:00+05:30")

    chosen = None
    d = date(2024, 4, 30)
    while d > date(2015, 1, 1):
        run = d.isoformat()
        st = {k: status_on(k, run) for k in WANT}
        if {v["status"] for v in st.values()} == {"ACTIVE", "WATCH", "NONE"}:
            chosen = (run, st)
            break
        d -= timedelta(days=1)
    assert chosen, "no date with all three colours"
    run, st = chosen
    print("mock run date:", run, {k: (v["status"], v["day_in_wave"]) for k, v in st.items()})
    MOCK.mkdir(parents=True, exist_ok=True)
    note = (f"MOCK: historical ERA5 data for {run} evaluated as if it were a forecast "
            f"(no bias correction). Not live.")
    for k, v in st.items():
        v["mock_note"] = note
        (MOCK / f"thirstwave_{k}.json").write_text(json.dumps(v, indent=1, ensure_ascii=False) + "\n")
    districts = {"districts": [{"id": k, "name": cfg[f"district#{k}"]["name"], "lat": cfg[f"district#{k}"]["lat"],
                                "lon": cfg[f"district#{k}"]["lon"], "status": st[k]["status"],
                                "day_in_wave": st[k]["day_in_wave"], "updated_at": st[k]["updated_at"]} for k in WANT],
                 "caveat": "District-centroid estimate (~10 km grid)", "mock_note": note}
    (MOCK / "districts.json").write_text(json.dumps(districts, indent=1, ensure_ascii=False) + "\n")
    for k in WANT:
        shutil.copy(OUT / "replay" / f"{k}_2024-04.json", MOCK / f"replay_{k}.json")
    write_ask_mocks()
    write_alert_sample()
    for stale in ("ask_llm.json", "ask_template.json"):
        path = MOCK / stale
        if path.exists():
            path.unlink()
    print("wrote", sorted(p.name for p in MOCK.iterdir()))


def write_ask_mocks():
    """Real template answers. The UI looks them up by the normalised question."""
    sys.path[:0] = [str(ROOT / "agent"), str(ROOT / "backend" / "core" / "python")]
    os.environ["MODEL_PROVIDER"] = "none"
    from thirstcast_agent.handler_core import handle_ask
    status_dir = ROOT / "agent" / "tests" / "fixtures" / "status"
    repo = LocalRepo(status_dir=status_dir)
    out = MOCK / "ask"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    index = {}
    for question in ASK_QUESTIONS:
        key = norm_question(question)
        name = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16] + ".json"
        answer = handle_ask(question, repo=repo, mode="template")
        payload = {
            "answer": answer["answer"],
            "lang": answer["lang"],
            "mode": answer["mode"],
            "tools_used": answer["tools_used"],
            "district": answer["district"],
            "caveat": answer["caveat"],
        }
        (out / name).write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
        index[key] = name
    (out / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"ask mocks: {len(index)} questions")


def write_alert_sample():
    """Call the detector's real subject/body builder on the Mandya fixture. Do not hand-write it."""
    os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
    os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
    det_dir = ROOT / "backend" / "functions" / "detector"
    sys.path.insert(0, str(ROOT / "backend" / "functions" / "common"))
    sys.path.insert(0, str(det_dir))
    spec = importlib.util.spec_from_file_location("thirstcast_detector_app", det_dir / "app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    item = json.loads((ROOT / "agent" / "tests" / "fixtures" / "status" / "Mandya.json").read_text())
    subject, body = mod.fmt_alert(item, replay=False)
    payload = {
        "generated_by": "data/scripts/make_mocks.py",
        "builder": "backend/functions/detector/app.py:fmt_alert",
        "district": item["district"],
        "run_date": item["run_date"],
        "subject": subject,
        "body": body,
    }
    (MOCK / "alert_sample.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    print("alert sample:", subject)


if __name__ == "__main__":
    main()
