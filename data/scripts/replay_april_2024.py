"""KD-06 + KD-08: April 2024 replay for every district.

* Flags are computed over the whole of 2024 so a run that starts in March still counts on
  April 1 (in_wave = day is part of a run of >= 3 flagged days).
* Archive data only, so NO bias correction applies to the replay.
* Writes data/out/replay/{district}_2024-04.json (exact /replay contract shape + extras)
  and docs/numbers.md (Bengaluru claims vs the source plan, all districts' numbers).

Usage: python data/scripts/replay_april_2024.py [--district all]
"""
import argparse
import json
import subprocess
from datetime import datetime

from common import DOCS, OUT, RAW, district_ids, load_daily
from thirstcast_core.constants import CAVEAT, CUM_EXCESS_DEFINITION, L_PER_MM_ACRE
from thirstcast_core.detection import flag_days, in_wave_mask
from thirstcast_core.litres import farmer_range, lake_litres, reference_litres_per_acre

SOURCE_CLAIMS = {"days_above_p90": 27, "cum_excess_mm": 26.9, "litres_per_acre": 110000,
                 "tmax_days_above_p90": 28}


def load_clim(did):
    return [c for c in json.loads((OUT / "climatology.json").read_text()) if c["district"] == did]


def config_items():
    p = OUT / "config_items.json"
    return {i["pk"]: i for i in json.loads(p.read_text())} if p.exists() else {}


def april_stats(rows, clim, year):
    f = flag_days([r for r in rows if r["date"].startswith(f"{year}-04")], clim)
    return {"year": year, "days_above_p90": sum(d["flag"] for d in f),
            "cum_excess_mm": round(sum(max(d["et0"] - d["p90"], 0) for d in f), 2),
            "tmax_days_above_p90": sum(d["tmax_flag"] for d in f)}


def replay(did):
    clim = load_clim(did)
    rows2024 = load_daily(RAW / f"archive_{did}_2024.json")
    flagged = flag_days(rows2024, clim)
    wave = in_wave_mask([d["flag"] for d in flagged])
    days, cum = [], 0.0
    for d, w in zip(flagged, wave):
        if not d["date"].startswith("2024-04"):
            continue
        exc = max(d["et0"] - d["p90"], 0.0)
        cum += exc
        days.append({"date": d["date"], "et0": round(d["et0"], 2), "p90": d["p90"], "flag": d["flag"],
                     "in_wave": w, "excess_mm": round(exc, 2), "cum_excess_mm": round(cum, 2),
                     "tmax": round(d["tmax"], 1), "tmax_p90": d["tmax_p90"], "tmax_flag": d["tmax_flag"]})
    cum = round(cum, 2)

    cfg = config_items()
    dist = cfg.get(f"district#{did}", {})
    crops = {}
    for c in dist.get("crops", []):
        item = cfg.get(f"crop#{c}")
        if item and item.get("kc"):
            crops[c] = farmer_range(cum, float(item["kc"]))
    lakes = {}
    for l in dist.get("lakes", []):
        item = cfg.get(f"lake#{l}") or {}
        if item.get("verified") and item.get("area_m2"):
            lakes[l] = lake_litres(cum, float(item["area_m2"]), float(item.get("kc", 1.05)))
        else:
            lakes[l] = {"value": None, "label": "estimate", "note": "area unverified, not shown"}

    # "worst April" ranking over 1994-2023 + 2024
    hist = load_daily(RAW / f"archive_{did}_1994_2023.json")
    ranking = [april_stats(hist, clim, y) for y in range(1994, 2024)] + [april_stats(rows2024, clim, 2024)]
    ranking.sort(key=lambda r: -r["cum_excess_mm"])
    rank = [r["year"] for r in ranking].index(2024) + 1
    runs = []
    cur = None
    for d in days:
        if d["in_wave"]:
            if cur is None:
                cur = {"start": d["date"], "end": d["date"], "days": 0}
            cur["end"], cur["days"] = d["date"], cur["days"] + 1
        elif cur:
            runs.append(cur)
            cur = None
    if cur:
        runs.append(cur)

    return {
        "district": did,
        "name": dist.get("name", did),
        "period": {"start": "2024-04-01", "end": "2024-04-30"},
        "days": days,
        "summary": {
            "days_above_p90": sum(d["flag"] for d in days),
            "days_total": len(days),
            "days_in_wave": sum(d["in_wave"] for d in days),
            "cum_excess_mm": cum,
            "cum_excess_definition": CUM_EXCESS_DEFINITION,
            "litres_per_acre_reference": reference_litres_per_acre(cum),
            "litres_per_acre_reference_note": f"Reference crop (Kc = 1): cum_excess_mm x {L_PER_MM_ACRE} L/acre per mm. Estimate.",
            "extra_litres_per_acre": crops,
            "tmax_days_above_p90": sum(d["tmax_flag"] for d in days),
            "lakes": lakes,
            "april_rank_1994_2024": rank,
            "april_years_compared": len(ranking),
            "runs": runs,
            "bias_correction": "none (archive data only)",
        },
        "caveat": CAVEAT,
        "source": "Open-Meteo historical weather API, models=era5_seamless (ERA5 + ERA5-Land), et0_fao_evapotranspiration, temperature_2m_max",
    }, ranking


def git_sha():
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def fmt_lakh(v):
    return f"{v/1e5:.2f} lakh"


def best_match_variant(did):
    """Sensitivity: same method on Open-Meteo's default best_match series (ERA5 until ~2016, ECMWF IFS after)."""
    from build_climatology import build
    bm = RAW / "best_match"
    if not (bm / f"archive_{did}_2024.json").exists():
        return None
    clim = build(did, bm)
    rows = load_daily(bm / f"archive_{did}_2024.json")
    hist = load_daily(bm / f"archive_{did}_1994_2023.json")
    st = april_stats(rows, clim, 2024)
    ranking = sorted([april_stats(hist, clim, y) for y in range(1994, 2024)] + [st], key=lambda r: -r["cum_excess_mm"])
    st["rank"] = [r["year"] for r in ranking].index(2024) + 1
    return st


def model_drift(did, years=(2016, 2017, 2020, 2024)):
    """Mean annual ET0 difference best_match - era5_seamless at the same district."""
    e5 = {r["date"]: r["et0"] for r in load_daily(RAW / f"archive_{did}_1994_2023.json") + load_daily(RAW / f"archive_{did}_2024.json")}
    bm = load_daily(RAW / "best_match" / f"archive_{did}_1994_2023.json") + load_daily(RAW / "best_match" / f"archive_{did}_2024.json")
    out = {}
    for y in years:
        ds = [r["et0"] - e5[r["date"]] for r in bm if r["date"].startswith(str(y)) and r["date"] in e5]
        out[y] = round(sum(ds) / len(ds), 2)
    return out


def write_numbers(results):
    b, branking = results["Bengaluru_Urban"]
    bm = best_match_variant("Bengaluru_Urban")
    s = b["summary"]
    worst_hist = max((r for r in branking if r["year"] != 2024), key=lambda r: r["cum_excess_mm"])
    def ok(a, bb):
        return "reproduced" if a == bb else "differs, use ours"
    lines = [
        "# Numbers (KD-06)",
        "",
        "Every number used in the UI, slides, video and README comes from this file.",
        f"Generated by `data/scripts/replay_april_2024.py` at {datetime.now().strftime('%Y-%m-%d %H:%M')} IST "
        f"(parent commit `{git_sha()}`). Re-run the script to regenerate; do not edit by hand.",
        "",
        "Data: Open-Meteo historical weather API, `models=era5_seamless` (ERA5 + ERA5-Land), daily `et0_fao_evapotranspiration` and "
        "`temperature_2m_max`, `timezone=Asia/Kolkata`, at the district centroid in `data/config/districts.json`. "
        "Thresholds: `data/out/climatology.json` (1994-2023, +-7-day window, p90). "
        "**No bias correction** is applied to the replay (archive data only).",
        "",
        "## Bengaluru Urban, April 2024: source claims vs our pipeline",
        "",
        "| Claim | Source plan | **Ours (ERA5, homogeneous; USE THIS)** | Open-Meteo default `best_match` (sensitivity) |",
        "|---|---|---|---|",
        f"| Days with ET0 above the day-of-year p90 | 27 of 30 | **{s['days_above_p90']} of {s['days_total']}** | {bm['days_above_p90'] if bm else '-'} of 30 |",
        f"| Cumulative excess ET0 | +26.9 mm | **+{s['cum_excess_mm']:.1f} mm** | +{bm['cum_excess_mm']:.1f} mm |" if bm else "",
        f"| Reference-crop litres per acre (x 4,047) | ~1.1 lakh L/acre | **{s['litres_per_acre_reference']:,} L/acre (~{fmt_lakh(s['litres_per_acre_reference'])})** | {int(round(bm['cum_excess_mm']*L_PER_MM_ACRE)):,} L/acre |" if bm else "",
        f"| Days with Tmax above its p90 | 28 of 30 | **{s['tmax_days_above_p90']} of {s['days_total']}** | {bm['tmax_days_above_p90'] if bm else '-'} of 30 |",
        f"| Worst April in the record | yes (1994-2023) | **rank {s['april_rank_1994_2024']} of {s['april_years_compared']} Aprils 1994-2024** (next: {worst_hist['year']}, +{worst_hist['cum_excess_mm']:.1f} mm) | rank {bm['rank'] if bm else '-'} of 31 |",
        "",
        "**What happened:** the source numbers (27/30, ~+26.9 mm, 28/30) reproduce only with Open-Meteo's default "
        "`best_match` archive, which silently switches from ERA5 to the ECMWF IFS analysis from about 2017. For our "
        f"Bengaluru point the mean annual ET0 difference (best_match minus ERA5) is {', '.join(f'{v:+.2f} mm/day in {y}' for y, v in model_drift('Bengaluru_Urban').items())}, so "
        "a 2024 day is compared against a threshold built mostly from ERA5 years, and the excess is inflated. Our "
        "pipeline uses `models=era5_seamless` (ERA5 + ERA5-Land, one consistent ~0.1 deg / ~10 km series) for both the "
        "thresholds and the replay. **Slides, UI, README and video must use the ERA5 column.** The headline still holds: "
        "April 2024 is the worst April since 1994 in all 3 districts, by a wide margin.",
        "",
        "**Definition (always state it):** cumulative excess = sum of daily ET0 above the local day-of-year p90 threshold.",
        "",
        f"**Use these numbers:** {s['days_above_p90']} of 30 days above p90; worst April since 1994; +{s['cum_excess_mm']:.1f} mm cumulative excess; "
        f"about {fmt_lakh(s['litres_per_acre_reference'])} litres per acre of reference-crop demand (estimate); "
        f"Tmax above its p90 on {s['tmax_days_above_p90']} of 30 days (so we never claim temperature alerts missed April 2024).",
        "",
        "Litres per acre are for the reference crop (Kc = 1) and are estimates.",
        "",
        "## All districts, April 2024",
        "",
        "| District | Days ET0 > p90 | Days in a thirstwave (runs of 3+) | Cum. excess (mm) | Ref. L/acre (estimate) | Tmax > p90 days | April rank 1994-2024 |",
        "|---|---|---|---|---|---|---|",
    ]
    for did, (r, _) in results.items():
        x = r["summary"]
        lines.append(f"| {r['name']} | {x['days_above_p90']}/30 | {x['days_in_wave']} | {x['cum_excess_mm']:.1f} | "
                     f"{x['litres_per_acre_reference']:,} | {x['tmax_days_above_p90']}/30 | {x['april_rank_1994_2024']} of {x['april_years_compared']} |")
    lines += ["", "Crop ranges (Kc +-10%, per acre, estimate) and lake estimates are in each replay file's `summary`.", "",
              "## Bengaluru Urban: April cumulative excess by year (top 10)", "",
              "| Rank | Year | Days > p90 | Cum. excess (mm) | Tmax > p90 days |", "|---|---|---|---|---|"]
    for i, r in enumerate(branking[:10], 1):
        lines.append(f"| {i} | {r['year']} | {r['days_above_p90']} | {r['cum_excess_mm']:.1f} | {r['tmax_days_above_p90']} |")
    lines += ["", "Note: the 1994-2023 Aprils are in-sample (they are part of the climatology); 2024 is out-of-sample.", ""]
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="all")
    args = ap.parse_args()
    (OUT / "replay").mkdir(parents=True, exist_ok=True)
    results = {}
    for did in district_ids(args.district):
        r, ranking = replay(did)
        results[did] = (r, ranking)
        (OUT / "replay" / f"{did}_2024-04.json").write_text(json.dumps(r, indent=1, ensure_ascii=False) + "\n")
        s = r["summary"]
        print(f"{did}: {s['days_above_p90']}/30 days > p90, +{s['cum_excess_mm']} mm, "
              f"{s['litres_per_acre_reference']} L/acre ref, Tmax>p90 {s['tmax_days_above_p90']}/30, "
              f"April rank {s['april_rank_1994_2024']}/{s['april_years_compared']}")
    if "Bengaluru_Urban" in results and len(results) == 3:
        existing = (DOCS / "numbers.md").read_text() if (DOCS / "numbers.md").exists() else ""
        marker = "<!-- BEGIN GENERATED -->"
        tail = ""
        if "<!-- END GENERATED -->" in existing:
            tail = existing.split("<!-- END GENERATED -->", 1)[1]
        body = "\n".join(write_numbers(results))
        (DOCS / "numbers.md").write_text(f"{marker}\n{body}\n<!-- END GENERATED -->{tail}")
        print("wrote docs/numbers.md")


if __name__ == "__main__":
    main()
