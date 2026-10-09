"""End-to-end evaluation for one district: the SAME function is used by the detector Lambda,
the local scripts (golden test) and the mock generator, so numbers match everywhere."""
from .bias import apply_offset
from .constants import CAVEAT, FORECAST_DAYS
from .detection import excess_mm, find_runs, flag_days, status_for_date
from .litres import farmer_range, lake_litres

# |offset| above this (mm/day) is disclosed in bias_note (see docs/numbers.md, bias section).
BIAS_LARGE_MM = 0.5


def district_config(config, district):
    """Return (district_item, {crop: item}, {lake: item}) from a Repo.get_config() dict."""
    d = config.get(f"district#{district}")
    if d is None:
        raise KeyError(f"unknown district {district}")
    crops = {c: config.get(f"crop#{c}") for c in d.get("crops", [])}
    lakes = {l: config.get(f"lake#{l}") for l in d.get("lakes", [])}
    return d, crops, lakes


def litres_block(total_excess, crops, lakes, acres=1.0):
    per_acre = {}
    for name, item in crops.items():
        if item and item.get("kc"):
            per_acre[name] = farmer_range(total_excess, float(item["kc"]), acres)
    lake_out = {}
    for name, item in lakes.items():
        if not item:
            continue
        if item.get("verified") and item.get("area_m2"):
            lake_out[name] = lake_litres(total_excess, float(item["area_m2"]), float(item.get("kc", 1.05)))
        else:
            lake_out[name] = {"value": None, "label": "estimate", "note": "area unverified, not shown"}
    return per_acre, lake_out


def build_status(district, days, clim, config, today, offset=0.0, updated_at=None,
                 large_threshold=BIAS_LARGE_MM, horizon=FORECAST_DAYS):
    """Build a Status item (docs/api-contract.md, DynamoDB shape 3.5).

    days: past + forecast days [{date, et0 (raw), tmax}], sorted, including `today`.
    offset: forecast-minus-archive ET0 bias (mm/day), subtracted from et0.
    """
    adj = apply_offset(days, offset) if offset else [dict(d) for d in days]
    flagged = flag_days(adj, clim)
    status, day_in_wave = status_for_date(flagged, today, horizon)
    t = [d["date"] for d in flagged].index(today)
    window = flagged[t:t + horizon]
    forecast = []
    for d in window:
        row = {"date": d["date"], "et0": round(d["et0"], 2) if d.get("et0") is not None else None,
               "p90": d["p90"], "flag": d["flag"]}
        if "tmax_p90" in d:
            row.update({"tmax": round(d["tmax"], 1), "tmax_p90": d["tmax_p90"], "tmax_flag": d["tmax_flag"]})
        forecast.append(row)
    total = excess_mm(window)
    # first thirstwave (run of 3+, counting past days) that overlaps the forecast window
    wave = None
    for s, e in find_runs([d["flag"] for d in flagged]):
        if e >= t and s < t + horizon:
            wave = {"start": flagged[s]["date"], "end": flagged[e]["date"], "days": e - s + 1,
                    "ongoing": s <= t, "extends_past_forecast": e >= t + horizon - 1}
            break
    _, crops, lakes = district_config(config, district)
    per_acre, lake_out = litres_block(total, crops, lakes)
    note = ""
    if offset and abs(offset) > large_threshold:
        note = (f"Forecast ET0 was corrected by {offset:+.2f} mm/day (forecast minus archive over "
                f"days 6-30 ago). The offset is large, so treat flags near the threshold with caution.")
    return {
        "district": district,
        "status": status,
        "day_in_wave": day_in_wave,
        "run_date": today,
        "forecast": forecast,
        "excess_mm_7d": total,
        "forecast_wave": wave,
        "excess_definition": "Sum over the 7 forecast days of max(bias-adjusted ET0 - day-of-year p90, 0)",
        "extra_litres_per_acre": per_acre,
        "extra_litres_lakes": lake_out,
        "bias_offset_mm": round(offset or 0.0, 2),
        "bias_note": note,
        "updated_at": updated_at,
        "caveat": CAVEAT,
    }
