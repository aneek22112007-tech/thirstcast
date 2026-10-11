#!/usr/bin/env python3
"""Thirst percentile reference values, 1994–2023.

For each district and each non-leap day of year d, collect every ET0 from
data/raw/archive_*_1994_2023.json whose day of year is in d−7…d+7 (wrapping),
the same window as data/scripts/build_climatology.py. Quantise to 0.01 mm
(stored as integer hundredths of a millimetre) and sort ascending.

The UI percentile is 100 × (count of reference values ≤ today's ET0) / N.
100 means today's ET0 is at or above every value in that window.

Writes frontend/data/percentiles.json. Does not fetch anything.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "core" / "python"))
from thirstcast_core.detection import doy_noleap  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "frontend" / "data" / "percentiles.json"
WANT = ["Bengaluru_Urban", "Kolar", "Mandya"]
WINDOW = 7


def rows(district):
    daily = json.loads((RAW / f"archive_{district}_1994_2023.json").read_text())["daily"]
    out = []
    for iso, et0 in zip(daily["time"], daily["et0_fao_evapotranspiration"]):
        if et0 is None:
            continue
        out.append((doy_noleap(iso), int(round(float(et0) * 100))))
    return out


def build(district):
    """Sorted values whose non-leap day of year IS d. The UI adds the ±7-day window."""
    by_doy = defaultdict(list)
    for doy, centi in rows(district):
        by_doy[doy].append(centi)
    return {str(day): sorted(by_doy[day]) for day in range(1, 366)}


def main():
    payload = {
        "generated_by": "frontend/scripts/build_percentiles.py",
        "source": "data/raw/archive_*_1994_2023.json (era5_seamless)",
        "period": "1994-2023",
        "window_days": WINDOW,
        "unit": "0.01 mm",
        "definition": (
            "For each non-leap day of year, the sorted ET0 values (hundredths of a millimetre) "
            "that fell on that day in 1994–2023. The thirst percentile uses the same ±7-day "
            "wrapping window as the p90: 100 × count(value ≤ today's ET0, quantised to 0.01 mm) / N."
        ),
        "districts": {did: build(did) for did in WANT},
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")
    sample = payload["districts"]["Mandya"]["98"]
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes); Mandya doy 98 has {len(sample)} values")


if __name__ == "__main__":
    main()
