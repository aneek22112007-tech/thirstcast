"""pytest backend/core  (pure Python, no AWS)."""
from datetime import date, timedelta

import pytest

from thirstcast_core.bias import apply_offset, compute_offset, offset_stats
from thirstcast_core.detection import doy_noleap, excess_mm, find_runs, flag_days, in_wave_mask, status_for_date
from thirstcast_core.litres import farmer_range, lake_litres, reference_litres_per_acre
from thirstcast_core.pipeline import build_status
from thirstcast_core.repo import LocalRepo, MemoryRepo

CLIM = [{"district": "X", "doy": d, "et0_p90": 5.0, "tmax_p90": 33.0, "et0_mean": 4.0} for d in range(1, 366)]
CONFIG = {
    "district#X": {"pk": "district#X", "name": "X", "lat": 0, "lon": 0, "crops": ["paddy"], "lakes": ["L", "U"]},
    "crop#paddy": {"pk": "crop#paddy", "kc": 1.2},
    "lake#L": {"pk": "lake#L", "area_m2": 1_000_000, "kc": 1.05, "verified": True},
    "lake#U": {"pk": "lake#U", "area_m2": 5, "kc": 1.05, "verified": False},
}


def mkdays(et0s, start="2026-04-01", tmax=34.0):
    d0 = date.fromisoformat(start)
    return [{"date": (d0 + timedelta(i)).isoformat(), "et0": v, "tmax": tmax} for i, v in enumerate(et0s)]


def test_doy_noleap():
    assert doy_noleap("2023-01-01") == 1
    assert doy_noleap("2023-12-31") == 365
    assert doy_noleap("2024-02-29") == 59
    assert doy_noleap("2024-03-01") == 60
    assert doy_noleap("2024-12-31") == 365


def test_find_runs_and_mask():
    f = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1]
    assert find_runs(f) == [(3, 5), (7, 10)]
    assert in_wave_mask([1, 1, 1, 0]) == [True, True, True, False]
    assert find_runs([1, 1]) == []


def test_three_day_run_active_day3():
    days = flag_days(mkdays([6, 6, 6, 4, 4, 4, 4, 4, 4]), CLIM)
    assert status_for_date(days, "2026-04-03") == ("ACTIVE", 3)


def test_two_day_run_watch():
    days = flag_days(mkdays([4, 6, 6, 4, 4, 4, 4, 4]), CLIM)
    assert status_for_date(days, "2026-04-01") == ("WATCH", 0)
    assert status_for_date(days, "2026-04-03") == ("WATCH", 0)


def test_none():
    days = flag_days(mkdays([4] * 8), CLIM)
    assert status_for_date(days, "2026-04-01") == ("NONE", 0)


def test_flags_strictly_above_and_excess():
    days = flag_days(mkdays([5.0, 5.5, 7.25]), CLIM)
    assert [d["flag"] for d in days] == [False, True, True]
    assert excess_mm(days) == 2.75
    assert days[0]["tmax_flag"] is True and days[0]["tmax_p90"] == 33.0


def test_farmer_range_kc_band():
    lo, hi = farmer_range(6.3, 1.2)
    base = 6.3 * 1.2 * 4047
    assert lo == round(base * 0.9) and hi == round(base * 1.1)
    assert (lo, hi) == (27536, 33655)  # NOT the illustrative 24000-31000 of the source example
    assert farmer_range(1.0, 1.0, acres=2) == [7285, 8903]
    assert reference_litres_per_acre(10) == 40470


def test_lake_formula():
    assert lake_litres(2.0, 1_000_000) == {"value": 2_100_000, "label": "estimate"}
    assert lake_litres(2.0, None)["value"] is None


def test_offset_synthetic():
    today = date(2026, 10, 9)
    arch = [{"date": (today - timedelta(a)).isoformat(), "et0": 4.0} for a in range(1, 40)]
    fc = [{"date": (today - timedelta(a)).isoformat(), "et0": 4.5} for a in range(0, 40)]
    fc[3]["et0"] = 99  # age 3 must be ignored (outside 6..30)
    s = offset_stats(fc, arch, today)
    assert s["n"] == 25 and s["offset"] == 0.5 and s["sd"] == 0.0
    assert compute_offset(fc, [], today) == 0.0
    adj = apply_offset([{"date": "x", "et0": 0.3}, {"date": "y", "et0": 5.0}], 0.5)
    assert adj[0]["et0"] == 0.0 and adj[1]["et0"] == 4.5 and adj[1]["et0_raw"] == 5.0


def test_build_status_shape_and_bias():
    days = mkdays([6, 6, 6, 6, 4, 4, 4, 4, 4, 4], start="2026-04-01")
    st = build_status("X", days, CLIM, CONFIG, "2026-04-03", offset=0.0, updated_at="2026-04-03T06:00:00+05:30")
    assert st["status"] == "ACTIVE" and st["day_in_wave"] == 3
    assert len(st["forecast"]) == 7 and st["forecast"][0]["date"] == "2026-04-03"
    assert st["excess_mm_7d"] == 2.0
    assert st["extra_litres_per_acre"]["paddy"] == farmer_range(2.0, 1.2)
    assert st["extra_litres_lakes"]["L"]["value"] == 2_100_000
    assert st["extra_litres_lakes"]["U"]["value"] is None  # unverified area never shown
    assert st["caveat"] == "District-centroid estimate (~10 km grid)"
    assert st["forecast_wave"]["start"] == "2026-04-01" and st["forecast_wave"]["ongoing"]
    # a +1.5 mm offset removes every flag and adds a disclosure note
    st2 = build_status("X", days, CLIM, CONFIG, "2026-04-03", offset=1.5)
    assert st2["status"] == "NONE" and st2["bias_note"]


def test_memory_repo_roundtrip():
    r = MemoryRepo(CLIM, CONFIG)
    r.put_status({"district": "X", "status": "NONE"})
    assert r.get_status("X")["status"] == "NONE" and len(r.get_climatology("X")) == 365


def test_local_repo_real_files():
    r = LocalRepo()
    try:
        clim = r.get_climatology("Mandya")
    except FileNotFoundError:
        pytest.skip("data/out not built")
    assert len(clim) == 365 and set(clim[0]) == {"district", "doy", "et0_p90", "tmax_p90", "et0_mean"}
    cfg = r.get_config()
    assert {"district#Mandya", "crop#paddy", "lake#KRS"} <= set(cfg)
