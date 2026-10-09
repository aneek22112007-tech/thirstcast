"""KD-07: forecast-vs-archive bias offset.

Per district: Open-Meteo forecast API with past_days=35, forecast_days=7 (same daily vars as
the detector) and the archive API for the same past dates. Compare days 6-30 ago
(the archive lags ~5 days). Offset = mean(forecast - archive). Reports ET0 and Tmax.

Writes data/raw/bias/{forecast,archive}_{district}_{date}.json (cache, never re-downloaded),
data/out/bias_offsets.json and docs/img/bias_offset.png.
Usage: python data/scripts/bias_offset.py [--today YYYY-MM-DD]
"""
import argparse
import json
from datetime import date, timedelta

from common import ARCHIVE_MODEL, ARCHIVE_URL, DAILY_VARS, DOCS, FORECAST_URL, OUT, RAW, TZ, load_daily, load_districts, polite_get
from thirstcast_core.bias import offset_stats
from thirstcast_core.pipeline import BIAS_LARGE_MM

PAST_DAYS = 35
MIN_AGE, MAX_AGE = 6, 30


def cached(path, url, params):
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(polite_get(url, params), separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=date.today().isoformat())
    args = ap.parse_args()
    today = date.fromisoformat(args.today)
    start = (today - timedelta(days=MAX_AGE)).isoformat()
    end = (today - timedelta(days=MIN_AGE)).isoformat()
    result = {"run_date": args.today, "window": f"days {MIN_AGE}-{MAX_AGE} before run date ({start}..{end})",
              "forecast_params": {"past_days": PAST_DAYS, "forecast_days": 7, "daily": DAILY_VARS, "timezone": TZ},
              "large_threshold_mm": BIAS_LARGE_MM, "districts": {}}
    plot = {}
    for d in load_districts():
        did = d["id"]
        fpath = RAW / "bias" / f"forecast_{did}_{args.today}.json"
        apath = RAW / "bias" / f"archive_{did}_{start}_{end}.json"
        cached(fpath, FORECAST_URL, {"latitude": d["lat"], "longitude": d["lon"], "daily": DAILY_VARS,
                                     "timezone": TZ, "past_days": PAST_DAYS, "forecast_days": 7})
        cached(apath, ARCHIVE_URL, {"latitude": d["lat"], "longitude": d["lon"], "daily": DAILY_VARS,
                                    "timezone": TZ, "start_date": start, "end_date": end, "models": ARCHIVE_MODEL})
        fc, ar = load_daily(fpath), load_daily(apath)
        et0 = offset_stats(fc, ar, today, MIN_AGE, MAX_AGE, key="et0")
        tmax = offset_stats(fc, ar, today, MIN_AGE, MAX_AGE, key="tmax")
        mae = round(sum(abs(x["diff"]) for x in et0["diffs"]) / max(et0["n"], 1), 3)
        result["districts"][did] = {
            "et0_offset_mm": et0["offset"], "et0_sd_mm": et0["sd"], "et0_mae_mm": mae, "n_days": et0["n"],
            "tmax_offset_c": tmax["offset"], "tmax_sd_c": tmax["sd"],
            "large": et0["offset"] is not None and abs(et0["offset"]) > BIAS_LARGE_MM,
            "daily_et0_diffs": et0["diffs"]}
        plot[did] = (fc, ar)
        print(f"{did}: ET0 offset {et0['offset']:+.3f} mm/day (sd {et0['sd']}, MAE {mae}, n={et0['n']}), "
              f"Tmax offset {tmax['offset']:+.2f} C")
    (OUT / "bias_offsets.json").write_text(json.dumps(result, indent=1) + "\n")
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(3, 1, figsize=(9, 8), sharex=True)
        for ax, (did, (fc, ar)) in zip(axes, plot.items()):
            a = {r["date"]: r["et0"] for r in ar}
            dates = [r["date"] for r in fc if r["date"] in a]
            ax.plot(dates, [next(r["et0"] for r in fc if r["date"] == x) for x in dates], label="forecast API (past_days)")
            ax.plot(dates, [a[x] for x in dates], label="archive (ERA5, era5_seamless)")
            ax.set_title(f"{did}: offset {result['districts'][did]['et0_offset_mm']:+.2f} mm/day")
            ax.set_ylabel("ET0 mm/day")
            ax.tick_params(axis="x", rotation=60, labelsize=7)
        axes[0].legend()
        fig.tight_layout()
        (DOCS / "img").mkdir(parents=True, exist_ok=True)
        fig.savefig(DOCS / "img" / "bias_offset.png", dpi=110)
        print("wrote docs/img/bias_offset.png")
    except ImportError:
        print("matplotlib not installed, skipping plot")


if __name__ == "__main__":
    main()
