"""Tiny Open-Meteo client using only the standard library (works inside Lambda without extra deps)."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

FORECAST_URL = os.environ.get("OPEN_METEO_FORECAST_URL", "https://api.open-meteo.com/v1/forecast")
ARCHIVE_URL = os.environ.get("OPEN_METEO_ARCHIVE_URL", "https://archive-api.open-meteo.com/v1/archive")
DAILY_VARS = "et0_fao_evapotranspiration,temperature_2m_max"
TZ = "Asia/Kolkata"
ARCHIVE_MODEL = "era5_seamless"
PAST_DAYS = 35  # covers days 6-30 ago for the bias offset plus recent days for an ongoing run
USER_AGENT = "ThirstCast/1.0 (hackathon prototype, non-commercial)"


def get_json(url, params, timeout=15, retries=2, pause=2.0):
    q = url + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(q, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except (urllib.error.URLError, TimeoutError, ValueError) as e:  # HTTPError is a URLError
            last = e
            if attempt < retries:
                time.sleep(pause * (attempt + 1))
    raise RuntimeError(f"Open-Meteo request failed: {last!r}")


def fetch_forecast(lat, lon, past_days=PAST_DAYS, forecast_days=7, url=None, **kw):
    return get_json(url or FORECAST_URL, {"latitude": lat, "longitude": lon, "daily": DAILY_VARS,
                                          "timezone": TZ, "past_days": past_days, "forecast_days": forecast_days}, **kw)


def fetch_archive(lat, lon, start, end, model=ARCHIVE_MODEL, url=None, **kw):
    return get_json(url or ARCHIVE_URL, {"latitude": lat, "longitude": lon, "daily": DAILY_VARS, "timezone": TZ,
                                         "start_date": start, "end_date": end, "models": model}, **kw)


def daily_rows(payload):
    """[{date, et0, tmax}] from an Open-Meteo daily payload (None values kept as None)."""
    d = payload["daily"]
    return [{"date": t, "et0": e, "tmax": x}
            for t, e, x in zip(d["time"], d["et0_fao_evapotranspiration"], d["temperature_2m_max"])]
