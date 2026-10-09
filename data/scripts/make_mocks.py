"""RS-03: build frontend/mock/*.json from REAL historical data with the same thirstcast_core pipeline.

Mock /thirstwave files evaluate the ERA5 archive as if it were a 7-day forecast, for a historical run
date chosen so the three colours (ACTIVE / WATCH / NONE) all appear. Each file says so in `mock_note`.
The UI shows a "MOCK DATA" badge whenever USE_MOCK is true, so mocks never reach the demo.
"""
import json
import shutil
from datetime import date, timedelta

from common import OUT, RAW, ROOT, load_daily
from thirstcast_core.pipeline import build_status
from thirstcast_core.repo import LocalRepo

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
    base = {"tools_used": [], "district": None, "caveat": "Estimates only. District-centroid estimate (~10 km grid)"}
    (MOCK / "ask_llm.json").write_text(json.dumps({**base, "answer": "MOCK answer (AI agent mode). Connect the live API "
                                                   "(USE_MOCK=false) to get a real answer built from tool output.",
                                                   "lang": "en", "mode": "llm"}, indent=1) + "\n")
    (MOCK / "ask_template.json").write_text(json.dumps({**base, "answer": "MOCK answer (template mode). Connect the "
                                                        "live API (USE_MOCK=false) to get a real template advisory.",
                                                        "lang": "en", "mode": "template"}, indent=1) + "\n")
    print("wrote", sorted(p.name for p in MOCK.iterdir()))


if __name__ == "__main__":
    main()
