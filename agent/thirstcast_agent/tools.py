"""Data tools for the agent. Plain functions (used by the template fallback and tests) plus Strands
@tool wrappers (used by the LLM agent). All numbers come from the Repo (Status/Config) and thirstcast_core;
nothing is hard-coded."""
import contextvars

from thirstcast_core.constants import CAVEAT
from thirstcast_core.litres import farmer_range

from .lang import DISTRICT_NAMES

_repo = None
TOOLS_USED = contextvars.ContextVar("tools_used", default=None)
VALID = tuple(DISTRICT_NAMES)


def set_repo(repo):
    global _repo
    _repo = repo


def _mark(name):
    used = TOOLS_USED.get()
    if used is not None and name not in used:
        used.append(name)


def _status(district):
    if district not in VALID:
        return None, {"error": f"unknown district '{district}'. Covered districts: {', '.join(VALID)}"}
    st = _repo.get_status(district) if _repo else None
    if not st or not st.get("forecast"):
        return None, {"district": district, "error": "no data: the detector has not produced a forecast yet"}
    return st, None


def status_data(district):
    _mark("get_status")
    st, err = _status(district)
    if err:
        return err
    return {
        "district": district, "status": st.get("status"), "day_in_wave": st.get("day_in_wave", 0),
        "excess_mm_7d": st.get("excess_mm_7d"),
        "excess_definition": "sum over the 7 forecast days of daily bias-adjusted ET0 above the local day-of-year p90",
        "forecast_wave": st.get("forecast_wave"),
        "extra_litres_per_acre": st.get("extra_litres_per_acre", {}),
        "extra_litres_lakes": st.get("extra_litres_lakes", {}),
        "bias_offset_mm": st.get("bias_offset_mm"), "bias_note": st.get("bias_note", ""),
        "updated_at": st.get("updated_at"), "caveat": CAVEAT, "units": "litres are estimates; crop values are [low, high] per acre",
    }


def forecast_data(district):
    _mark("get_forecast")
    st, err = _status(district)
    if err:
        return err
    days = [{"date": d["date"], "et0": d.get("et0"), "p90": d.get("p90"), "flag": d.get("flag")} for d in st["forecast"]]
    return {"district": district, "days": days, "flagged_days": sum(1 for d in days if d["flag"]),
            "units": "mm/day; flag = bias-adjusted ET0 above the day-of-year p90", "caveat": CAVEAT}


def water_gap_data(district, crop, acres=1.0):
    _mark("water_gap")
    st, err = _status(district)
    if err:
        return err
    cfg = _repo.get_config()
    item = cfg.get(f"crop#{crop}")
    if not item or not item.get("kc"):
        crops = sorted(k.split("#", 1)[1] for k in cfg if k.startswith("crop#"))
        return {"error": f"no crop coefficient for '{crop}'. Known crops: {', '.join(crops)}"}
    try:
        acres = float(acres)
    except (TypeError, ValueError):
        acres = 1.0
    acres = min(max(acres, 0.1), 1000.0)
    excess = float(st.get("excess_mm_7d") or 0.0)
    lo, hi = farmer_range(excess, float(item["kc"]), acres)
    return {"district": district, "crop": crop, "acres": acres, "kc": item["kc"], "excess_mm_7d": excess,
            "extra_litres_range": [lo, hi], "label": "estimate",
            "formula": "excess_mm_7d x Kc (+-10%) x 4047 L per acre per mm x acres", "caveat": CAVEAT}


def heat_compare_data(district):
    _mark("compare_with_heat")
    st, err = _status(district)
    if err:
        return err
    days = []
    for d in st["forecast"]:
        days.append({"date": d["date"], "thirst_flag": bool(d.get("flag")), "heat_flag": bool(d.get("tmax_flag")),
                     "tmax": d.get("tmax"), "tmax_p90": d.get("tmax_p90")})
    thirst_only = sum(1 for d in days if d["thirst_flag"] and not d["heat_flag"])
    heat_only = sum(1 for d in days if d["heat_flag"] and not d["thirst_flag"])
    both = sum(1 for d in days if d["heat_flag"] and d["thirst_flag"])
    return {"district": district, "days": days, "thirst_only_days": thirst_only, "heat_only_days": heat_only,
            "both_days": both, "note": "heat_flag = Tmax above its own day-of-year p90; thirst_flag = ET0 above its p90",
            "caveat": CAVEAT}


# ---- Strands tools (imported lazily so template mode works without strands installed) ----
def strands_tools():
    from strands import tool

    @tool
    def get_status(district: str) -> dict:
        """Current thirstwave status for one district: status (ACTIVE = thirstwave now, WATCH = high-demand day(s)
        in the next 7 days, NONE), day_in_wave, excess_mm_7d (sum of bias-adjusted ET0 above the local p90 over
        the 7 forecast days), any forecast thirstwave window, extra litres per acre per crop as [low, high]
        estimates, lake/reservoir estimates (value null = not verified, do not quote), bias note, updated_at.

        Args:
            district: one of Bengaluru_Urban, Kolar, Mandya (use these exact IDs).
        """
        return status_data(district)

    @tool
    def get_forecast(district: str) -> dict:
        """7-day forecast for one district: per day date, et0 (bias-adjusted mm/day), p90 threshold (mm/day) and
        flag (true when et0 > p90).

        Args:
            district: one of Bengaluru_Urban, Kolar, Mandya.
        """
        return forecast_data(district)

    @tool
    def water_gap(district: str, crop: str, acres: float = 1.0) -> dict:
        """Extra irrigation water a farm needs over the next 7 days because of above-threshold evaporative demand,
        as a [low, high] litre range (estimate) = excess_mm_7d x Kc (+-10%) x 4047 x acres.

        Args:
            district: one of Bengaluru_Urban, Kolar, Mandya.
            crop: one of paddy, sugarcane, tomato, ragi.
            acres: farm size in acres (default 1).
        """
        return water_gap_data(district, crop, acres)

    @tool
    def compare_with_heat(district: str) -> dict:
        """Compare thirst (ET0 above its p90) with heat (Tmax above its own p90) for each of the 7 forecast days,
        to show whether it is hot, thirsty, or both.

        Args:
            district: one of Bengaluru_Urban, Kolar, Mandya.
        """
        return heat_compare_data(district)

    return [get_status, get_forecast, water_gap, compare_with_heat]
