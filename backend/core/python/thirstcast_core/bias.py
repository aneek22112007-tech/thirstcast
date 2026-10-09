"""Forecast-vs-archive bias correction.

The archive (ERA5-based) lags ~5 days, so the overlap used is days `min_age`..`max_age`
before `today`. offset = mean(forecast_past_et0 - archive_et0) on matching dates.
The detector subtracts the offset from forecast ET0 (et0_adj = et0 - offset, floored at 0).
"""
from datetime import date, timedelta
from statistics import mean, pstdev


def _by_date(rows, key):
    return {r["date"]: r[key] for r in rows if r.get(key) is not None}


def offset_stats(forecast_past, archive, today, min_age=6, max_age=30, key="et0"):
    """Return {"offset": mean diff, "sd": ..., "n": ..., "diffs": [{date, diff}]} or offset None."""
    if isinstance(today, str):
        today = date.fromisoformat(today)
    f, a = _by_date(forecast_past, key), _by_date(archive, key)
    diffs = []
    for age in range(max_age, min_age - 1, -1):
        d = (today - timedelta(days=age)).isoformat()
        if d in f and d in a:
            diffs.append({"date": d, "diff": round(f[d] - a[d], 3)})
    if not diffs:
        return {"offset": None, "sd": None, "n": 0, "diffs": []}
    vals = [x["diff"] for x in diffs]
    return {"offset": round(mean(vals), 3), "sd": round(pstdev(vals), 3), "n": len(vals), "diffs": diffs}


def compute_offset(forecast_past, archive, today, min_age=6, max_age=30):
    """Mean(forecast - archive) ET0 over days min_age..max_age ago; 0.0 if there is no overlap."""
    s = offset_stats(forecast_past, archive, today, min_age, max_age)
    return s["offset"] if s["offset"] is not None else 0.0


def apply_offset(days, offset, key="et0"):
    """Return copies of days with `key` reduced by offset (floored at 0) and the raw value kept."""
    out = []
    for d in days:
        row = dict(d)
        if d.get(key) is not None:
            row[key + "_raw"] = d[key]
            row[key] = round(max(d[key] - offset, 0.0), 2)
        out.append(row)
    return out
