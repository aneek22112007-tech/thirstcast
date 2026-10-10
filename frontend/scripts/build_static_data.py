#!/usr/bin/env python3
"""Build frontend/data JSON from the repo pipeline outputs.

Run from the repo root:
    python3 frontend/scripts/build_static_data.py

Reads data/out and data/config (and the ERA5 Mandya archive for the
documented blindspot days). Writes only files under frontend/data/.
Does not invent measurements: every figure is copied or summed from those inputs.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "data"

# Marker positions are geographic facts, not ET0 measurements.
# Bellandur and Varthur: OpenStreetMap water-body relation centroids (ODbL).
# KRS: Wikipedia infobox coordinate for the dam.
MARKERS = {
    "Bellandur": {
        "lat": 12.9371445,
        "lon": 77.6720227,
        "marker_source": "OpenStreetMap relation 19751547 centroid (ODbL)",
        "marker_url": "https://www.openstreetmap.org/relation/19751547",
    },
    "Varthur": {
        "lat": 12.9483533,
        "lon": 77.7392630,
        "marker_source": "OpenStreetMap relation 19306126 centroid (ODbL)",
        "marker_url": "https://www.openstreetmap.org/relation/19306126",
    },
    "KRS": {
        "lat": 12.42472,
        "lon": 76.57222,
        "marker_source": "Wikipedia, Krishna Raja Sagara (dam infobox)",
        "marker_url": "https://en.wikipedia.org/wiki/Krishna_Raja_Sagara",
    },
}


def doy_non_leap(iso: str) -> int:
    """Match thirstcast_core: non-leap day of year, 29 Feb folded into 59."""
    y, m, d = (int(p) for p in iso.split("-"))
    if m == 2 and d == 29:
        return 59
    leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
    n = date(y, m, d).timetuple().tm_yday
    if leap and n > 60:
        n -= 1
    return n


def load(path: Path):
    with path.open() as f:
        return json.load(f)


def write(name: str, payload: dict) -> None:
    path = OUT / name
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def build_climatology() -> None:
    rows = load(ROOT / "data" / "out" / "climatology.json")
    series: dict[str, dict[str, list]] = {}
    for row in rows:
        bucket = series.setdefault(
            row["district"], {"et0_p90": [None] * 365, "et0_mean": [None] * 365, "tmax_p90": [None] * 365}
        )
        i = int(row["doy"]) - 1
        if not 0 <= i < 365:
            raise SystemExit(f"unexpected doy {row['doy']}")
        bucket["et0_p90"][i] = row["et0_p90"]
        bucket["et0_mean"][i] = row["et0_mean"]
        bucket["tmax_p90"][i] = row["tmax_p90"]
    for district, bucket in series.items():
        for key, values in bucket.items():
            if any(v is None for v in values):
                raise SystemExit(f"missing {key} for {district}")
    write(
        "climatology_curves.json",
        {
            "generated_by": "frontend/scripts/build_static_data.py",
            "source": "data/out/climatology.json",
            "period": "1994-2023",
            "doy": "non-leap 1-365; 29 February folded into doy 59",
            "series": series,
        },
    )


def build_blindspot() -> None:
    events = load(ROOT / "data" / "out" / "blindspot_events.json")
    below = [e for e in events if e.get("all_below_p90")]
    by_district: dict[str, int] = {}
    for event in below:
        by_district[event["district"]] = by_district.get(event["district"], 0) + 1
    example = next(
        e for e in events if e["district"] == "Mandya" and e["start"] == "2023-04-08" and e["end"] == "2023-04-14"
    )
    archive = load(ROOT / "data" / "raw" / "archive_Mandya_1994_2023.json")
    times = archive["daily"]["time"]
    index = {t: i for i, t in enumerate(times)}
    clim = {(row["district"], int(row["doy"])): row for row in load(ROOT / "data" / "out" / "climatology.json")}
    daily = []
    excess_sum = 0.0
    cursor = date.fromisoformat(example["start"])
    end = date.fromisoformat(example["end"])
    while cursor <= end:
        iso = cursor.isoformat()
        i = index[iso]
        d = doy_non_leap(iso)
        threshold = clim[("Mandya", d)]
        et0 = archive["daily"]["et0_fao_evapotranspiration"][i]
        tmax = archive["daily"]["temperature_2m_max"][i]
        excess = round(et0 - threshold["et0_p90"], 2)
        excess_sum = round(excess_sum + max(excess, 0), 2)
        daily.append(
            {
                "date": iso,
                "doy": d,
                "et0": et0,
                "p90": threshold["et0_p90"],
                "flag": et0 > threshold["et0_p90"],
                "excess_mm": excess,
                "tmax": tmax,
                "tmax_p90": threshold["tmax_p90"],
                "tmax_flag": tmax > threshold["tmax_p90"],
            }
        )
        cursor = date.fromordinal(cursor.toordinal() + 1)
    if round(excess_sum, 2) != example["excess_mm"]:
        raise SystemExit(f"blindspot excess {excess_sum} != event {example['excess_mm']}")
    if max(day["tmax"] for day in daily) != example["max_tmax"]:
        raise SystemExit("blindspot max tmax does not match the event file")
    write(
        "blindspot.json",
        {
            "generated_by": "frontend/scripts/build_static_data.py",
            "events_source": "data/out/blindspot_events.json",
            "daily_source": "data/raw/archive_Mandya_1994_2023.json (era5_seamless) joined to data/out/climatology.json",
            "definition": "A blindspot event is a thirstwave (3+ days with ET0 above its day-of-year p90) during which Tmax stayed at or below its own day-of-year p90 on every day.",
            "blindspot_events": len(below),
            "by_district": by_district,
            "example": {
                "district": example["district"],
                "name": "Mandya",
                "start": example["start"],
                "end": example["end"],
                "days": example["days"],
                "excess_mm": example["excess_mm"],
                "max_tmax_c": example["max_tmax"],
                "max_tmax_minus_p90_c": example["max_tmax_minus_p90"],
                "tmax_days_above_p90": example["tmax_days_above_p90"],
                "in_sample": True,
                "daily": daily,
            },
            "caveat": "1994-2023 events are in-sample for the thresholds. District-centroid estimate (~10 km grid). Tmax p90 is a statistical threshold, not an official IMD heatwave criterion.",
        },
    )


def build_catalog() -> None:
    districts = load(ROOT / "data" / "config" / "districts.json")
    crops = load(ROOT / "data" / "config" / "crops.json")
    lakes = []
    for lake in load(ROOT / "data" / "config" / "lakes.json"):
        marker = MARKERS.get(lake["id"])
        if marker is None:
            raise SystemExit(f"no marker source for {lake['id']}")
        lakes.append({**lake, **marker})
    write(
        "catalog.json",
        {
            "generated_by": "frontend/scripts/build_static_data.py",
            "sources": ["data/config/districts.json", "data/config/crops.json", "data/config/lakes.json"],
            "districts": districts,
            "crops": crops,
            "lakes": lakes,
            "litres_per_mm_per_acre": 4047,
            "tanker_litres": 10000,
            "caveat": "District-centroid estimate (~10 km grid)",
        },
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    build_climatology()
    build_blindspot()
    build_catalog()


if __name__ == "__main__":
    main()
