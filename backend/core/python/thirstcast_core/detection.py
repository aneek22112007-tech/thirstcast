"""Thirstwave detection.

Conventions (see docs/methods.md):
* Day-of-year is non-leap 1..365; Feb 29 is folded into Feb 28 (doy 59).
* A day is flagged when ET0 (bias-adjusted for forecasts) > its doy p90 threshold.
* A thirstwave is a run of >= 3 consecutive flagged days.
* Status for a run date (team convention, docs/api-contract.md):
    ACTIVE: the run date is inside a run of >= 3 consecutive flagged days;
    WATCH:  not ACTIVE, but at least one flagged day from the run date through the forecast;
    NONE:   otherwise.
"""
from datetime import date as _date

from .constants import FORECAST_DAYS, MIN_RUN

_CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def doy_noleap(d):
    """Non-leap day of year 1..365 (Feb 29 -> 59, same as Feb 28)."""
    if isinstance(d, str):
        d = _date.fromisoformat(d[:10])
    if d.month == 2 and d.day == 29:
        return 59
    return _CUM[d.month - 1] + d.day


def clim_index(clim):
    """Accept a list of climatology items or a {doy: item} dict; return {int doy: item}."""
    if isinstance(clim, dict):
        return {int(k): v for k, v in clim.items()}
    return {int(c["doy"]): c for c in clim}


def flag_days(days, clim):
    """Annotate days.

    days: list of {"date": "YYYY-MM-DD", "et0": float, optional "tmax": float}
    clim: climatology items for ONE district.
    Returns new dicts with p90, flag, excess_mm and (if tmax present) tmax_p90, tmax_flag.
    """
    idx = clim_index(clim)
    out = []
    for d in days:
        c = idx[doy_noleap(d["date"])]
        et0 = d.get("et0")
        row = dict(d)
        row["p90"] = round(float(c["et0_p90"]), 2)
        if et0 is None:
            row["flag"] = False
            row["excess_mm"] = 0.0
        else:
            row["flag"] = bool(et0 > c["et0_p90"])
            row["excess_mm"] = round(max(et0 - c["et0_p90"], 0.0), 2)
        if d.get("tmax") is not None and c.get("tmax_p90") is not None:
            row["tmax_p90"] = round(float(c["tmax_p90"]), 1)
            row["tmax_flag"] = bool(d["tmax"] > c["tmax_p90"])
        out.append(row)
    return out


def find_runs(flags, min_len=MIN_RUN):
    """Return [(start_idx, end_idx_inclusive), ...] of consecutive True runs with length >= min_len."""
    runs, start = [], None
    for i, f in enumerate(list(flags) + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            if i - start >= min_len:
                runs.append((start, i - 1))
            start = None
    return runs


def in_wave_mask(flags, min_len=MIN_RUN):
    mask = [False] * len(flags)
    for s, e in find_runs(flags, min_len):
        for i in range(s, e + 1):
            mask[i] = True
    return mask


def status_for_date(days, run_date, horizon=FORECAST_DAYS):
    """(status, day_in_wave) for run_date. `days` must be flagged (flag_days) and sorted by date,
    and should include past days so an ongoing run is counted."""
    dates = [d["date"] for d in days]
    if run_date not in dates:
        raise ValueError(f"run date {run_date} not in days")
    t = dates.index(run_date)
    flags = [bool(d["flag"]) for d in days]
    for s, e in find_runs(flags):
        if s <= t <= e:
            return "ACTIVE", t - s + 1
    if any(flags[t:t + horizon]):
        return "WATCH", 0
    return "NONE", 0


def excess_mm(days):
    """Sum of max(et0 - p90, 0) over the given flagged days (mm)."""
    return round(sum(max((d.get("et0") or 0.0) - d["p90"], 0.0) for d in days), 2)
