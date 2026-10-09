"""Shared helpers for the data scripts (paths, district config, polite HTTP)."""
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "out"
CONFIG = ROOT / "data" / "config"
DOCS = ROOT / "docs"

# make thirstcast_core importable from the scripts (same code the Lambdas use)
sys.path.insert(0, str(ROOT / "backend" / "core" / "python"))

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DAILY_VARS = "et0_fao_evapotranspiration,temperature_2m_max"
TZ = "Asia/Kolkata"
# Homogeneous ERA5 series (ERA5 + ERA5-Land, ~0.1 deg grid). Open-Meteo's default "best_match"
# switches to ECMWF IFS from ~2017, which runs warmer/drier in ET0 here (see docs/numbers.md),
# so the climatology, the replay and the bias reference all use era5_seamless.
ARCHIVE_MODEL = "era5_seamless"
USER_AGENT = "ThirstCast hackathon prototype (non-commercial; github.com/aneek22112007-tech/thirstcast)"


def load_districts():
    return json.loads((CONFIG / "districts.json").read_text())


def district_ids(arg):
    ids = [d["id"] for d in load_districts()]
    if arg in (None, "all"):
        return ids
    if arg not in ids:
        raise SystemExit(f"unknown district {arg}; choose from {ids} or 'all'")
    return [arg]


def polite_get(url, params, retries=5, pause=1.0, timeout=120):
    """GET with back-off on 429/5xx. Sleeps `pause` seconds after every call."""
    delay = 5
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, params=params, timeout=timeout, headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                time.sleep(pause)
                return r.json()
            if r.status_code in (429, 500, 502, 503, 504):
                print(f"  HTTP {r.status_code}, retry {attempt}/{retries} in {delay}s", flush=True)
            else:
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
        except requests.RequestException as e:
            print(f"  network error {e!r}, retry {attempt}/{retries} in {delay}s", flush=True)
        time.sleep(delay)
        delay = min(delay * 2, 120)
    raise RuntimeError(f"giving up on {url} after {retries} tries")


def load_daily(path):
    """Return list of {date, et0, tmax} from a raw Open-Meteo JSON file."""
    d = json.loads(Path(path).read_text())["daily"]
    return [{"date": t, "et0": e, "tmax": x}
            for t, e, x in zip(d["time"], d["et0_fao_evapotranspiration"], d["temperature_2m_max"])]


def load_archive(district, years=("1994_2023", "2024"), subdir=""):
    rows = []
    for y in years:
        rows += load_daily(RAW / subdir / f"archive_{district}_{y}.json")
    return rows
