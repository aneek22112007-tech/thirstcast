"""KD-03: pull daily ET0 (FAO-56, Open-Meteo) and Tmax from the Open-Meteo archive (ERA5, models=era5_seamless).

Usage:
  python data/scripts/pull_archive.py --district all --start 1994-01-01 --end 2023-12-31
  python data/scripts/pull_archive.py --district all --start 2024-01-01 --end 2024-12-31

Saves the untouched responses to data/raw/archive_{district}_{label}.json and never
re-downloads a file that already exists (use --force to override). Free tier is
non-commercial and rate-limited: one request at a time, 1 s pause, back-off on 429/5xx.
If a long request fails, it is split into 10-year chunks and merged.
"""
import argparse
import json
from datetime import date

from common import ARCHIVE_MODEL, ARCHIVE_URL, DAILY_VARS, RAW, TZ, district_ids, load_districts, polite_get


def label_for(start, end):
    s, e = start[:4], end[:4]
    return s if s == e else f"{s}_{e}"


def fetch(lat, lon, start, end, args_model=ARCHIVE_MODEL):
    params = {"latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
              "daily": DAILY_VARS, "timezone": TZ, "models": args_model}
    try:
        return polite_get(ARCHIVE_URL, params, retries=3)
    except RuntimeError:
        s, e = int(start[:4]), int(end[:4])
        if e - s < 10:
            raise
        print("  long request failed, splitting into 10-year chunks")
        merged = None
        for cs in range(s, e + 1, 10):
            ce = min(cs + 9, e)
            part = polite_get(ARCHIVE_URL, {**params, "start_date": f"{cs}-01-01" if cs != s else start,
                                            "end_date": f"{ce}-12-31" if ce != e else end})
            if merged is None:
                merged = part
            else:
                for k in merged["daily"]:
                    merged["daily"][k] += part["daily"][k]
        return merged


def sanity(name, data, start, end):
    d = data["daily"]
    n = len(d["time"])
    expected = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    et0 = [v for v in d["et0_fao_evapotranspiration"] if v is not None]
    tx = [v for v in d["temperature_2m_max"] if v is not None]
    miss = (n - len(et0), n - len(tx))
    print(f"  {name}: {n} days (expected {expected}), missing et0/tmax={miss}, "
          f"ET0 {min(et0):.2f}..{max(et0):.2f} mm, Tmax {min(tx):.1f}..{max(tx):.1f} C, "
          f"grid {data.get('latitude')},{data.get('longitude')} elev {data.get('elevation')}")
    return n == expected and miss == (0, 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="all")
    ap.add_argument("--start", default="1994-01-01")
    ap.add_argument("--end", default="2023-12-31")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--model", default=ARCHIVE_MODEL,
                    help="Open-Meteo archive model (default era5_seamless; 'best_match' goes to data/raw/best_match/)")
    args = ap.parse_args()

    cfg = {d["id"]: d for d in load_districts()}
    raw = RAW if args.model == ARCHIVE_MODEL else RAW / args.model
    raw.mkdir(parents=True, exist_ok=True)
    ok = True
    for did in district_ids(args.district):
        path = raw / f"archive_{did}_{label_for(args.start, args.end)}.json"
        if path.exists() and not args.force:
            print(f"{path.name} exists, skipping download")
            data = json.loads(path.read_text())
        else:
            print(f"pulling {did} {args.start}..{args.end}")
            data = fetch(cfg[did]["lat"], cfg[did]["lon"], args.start, args.end, args.model)
            path.write_text(json.dumps(data, separators=(",", ":")))
        ok &= sanity(path.name, data, args.start, args.end)
    print("all checks OK" if ok else "WARNING: gaps found, list them in data/raw/README.md")


if __name__ == "__main__":
    main()
