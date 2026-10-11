"""April cumulative excess for every year 1994–2024.

Uses april_stats() from replay_april_2024.py, so the ranking rule matches
docs/numbers.md: cumulative excess is the sum of daily ET0 above the local
day-of-year p90, archive only, no bias correction.

Writes data/out/april_history.json and a copy at frontend/data/april_history.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from common import OUT, RAW, load_daily  # noqa: E402
from replay_april_2024 import april_stats, config_items, load_clim  # noqa: E402

ROOT = HERE.parents[1]
WANT = ["Bengaluru_Urban", "Kolar", "Mandya"]
FRONT = ROOT / "frontend" / "data" / "april_history.json"


def history(did):
    clim = load_clim(did)
    hist = load_daily(RAW / f"archive_{did}_1994_2023.json")
    rows2024 = load_daily(RAW / f"archive_{did}_2024.json")
    series = [april_stats(hist, clim, year) for year in range(1994, 2024)]
    series.append(april_stats(rows2024, clim, 2024))
    order = sorted(series, key=lambda row: -row["cum_excess_mm"])
    rank = {row["year"]: index + 1 for index, row in enumerate(order)}
    for row in series:
        row["rank"] = rank[row["year"]]
    name = config_items().get(f"district#{did}", {}).get("name", did)
    return {"name": name, "highlight": 2024, "series": series}


def main():
    payload = {
        "generated_by": "data/scripts/april_history.py",
        "source": "data/raw/archive_*_{1994_2023,2024}.json joined to data/out/climatology.json",
        "month": 4,
        "years": list(range(1994, 2025)),
        "definition": "Cumulative excess = sum of daily ET0 above the local day-of-year p90 threshold. No bias correction (archive).",
        "rank_rule": "Rank 1 is the largest April cumulative excess. Ties keep sort order, matching replay_april_2024.py.",
        "districts": {did: history(did) for did in WANT},
    }
    text = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
    out = OUT / "april_history.json"
    out.write_text(text)
    FRONT.parent.mkdir(parents=True, exist_ok=True)
    FRONT.write_text(text)
    highlight = {did: next(r for r in payload["districts"][did]["series"] if r["year"] == 2024) for did in WANT}
    print("wrote", out)
    for did, row in highlight.items():
        print(f"  {did} 2024 rank {row['rank']} of {len(payload['years'])}: "
              f"{row['days_above_p90']} days, {row['cum_excess_mm']} mm")


if __name__ == "__main__":
    main()
