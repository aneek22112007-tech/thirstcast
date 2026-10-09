"""KD-11: charts for the methods page and slides -> docs/img/*.png (bias plot comes from bias_offset.py)."""
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from common import DOCS, OUT, district_ids  # noqa: E402

IMG = DOCS / "img"


def april_chart(did):
    r = json.loads((OUT / "replay" / f"{did}_2024-04.json").read_text())
    days = r["days"]
    x = [int(d["date"][-2:]) for d in days]
    et0 = [d["et0"] for d in days]
    p90 = [d["p90"] for d in days]
    fig, ax = plt.subplots(figsize=(9, 4))
    ax.plot(x, et0, "o-", color="#c0392b", label="Daily ET0 (mm)")
    ax.plot(x, p90, "--", color="#555", label="Day-of-year p90 threshold")
    ax.fill_between(x, p90, et0, where=[e > p for e, p in zip(et0, p90)], color="#e74c3c", alpha=0.3,
                    interpolate=True, label="Excess above p90")
    s = r["summary"]
    ax.set_title(f"{r['name']}, April 2024: {s['days_above_p90']}/30 days above p90, "
                 f"cumulative excess +{s['cum_excess_mm']:.1f} mm")
    ax.set_xlabel("Day of April 2024")
    ax.set_ylabel("ET0 (mm/day)")
    ax.legend(loc="lower right", fontsize=8)
    ax.text(0.01, 0.02, "ERA5 (Open-Meteo era5_seamless), district-centroid estimate (~10 km grid)",
            transform=ax.transAxes, fontsize=7, color="#555")
    fig.tight_layout()
    fig.savefig(IMG / f"april2024_{did}.png", dpi=110)
    plt.close(fig)


def p90_chart():
    clim = json.loads((OUT / "climatology.json").read_text())
    fig, ax = plt.subplots(figsize=(9, 4))
    for did in district_ids("all"):
        c = [i for i in clim if i["district"] == did]
        ax.plot([i["doy"] for i in c], [i["et0_p90"] for i in c], label=did.replace("_", " "))
    ax.set_title("ET0 p90 threshold by day of year (1994-2023, +-7-day window)")
    ax.set_xlabel("Day of year")
    ax.set_ylabel("ET0 p90 (mm/day)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(IMG / "p90_climatology.png", dpi=110)
    plt.close(fig)


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    for did in district_ids("all"):
        april_chart(did)
    p90_chart()
    print("charts written to docs/img/")


if __name__ == "__main__":
    main()
