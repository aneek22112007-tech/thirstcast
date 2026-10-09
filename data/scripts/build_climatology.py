"""KD-04: day-of-year climatology (p90 thresholds) from the 1994-2023 archive.

For each district and each non-leap doy d (1..365) take every value from 1994-2023 whose
doy is within d-7..d+7 (wrapping around the year end), then
  et0_p90  = numpy.percentile(et0, 90)   (numpy default "linear" method)
  tmax_p90 = numpy.percentile(tmax, 90)
  et0_mean = mean(et0)
rounded to 2 decimals. Feb 29 is folded into doy 59 (Feb 28).

Writes data/out/climatology.json (DynamoDB item shape) and data/out/climatology.csv.
"""
import csv
import json
from collections import defaultdict

import numpy as np

from common import OUT, district_ids, load_daily, RAW
from thirstcast_core.detection import doy_noleap

WINDOW = 7


def build(district, raw_dir=RAW):
    rows = load_daily(raw_dir / f"archive_{district}_1994_2023.json")
    by_doy = defaultdict(lambda: ([], []))
    for r in rows:
        e, t = by_doy[doy_noleap(r["date"])]
        e.append(r["et0"])
        t.append(r["tmax"])
    items = []
    for d in range(1, 366):
        et0, tmax = [], []
        for k in range(d - WINDOW, d + WINDOW + 1):
            kk = (k - 1) % 365 + 1
            et0 += by_doy[kk][0]
            tmax += by_doy[kk][1]
        et0, tmax = np.array(et0), np.array(tmax)
        items.append({"district": district, "doy": d,
                      "et0_p90": round(float(np.percentile(et0, 90)), 2),
                      "tmax_p90": round(float(np.percentile(tmax, 90)), 2),
                      "et0_mean": round(float(et0.mean()), 2),
                      "_n": int(et0.size)})
    return items


def main():
    allitems = []
    for did in district_ids("all"):
        items = build(did)
        ns = {i.pop("_n") for i in items}
        assert len(items) == 365 and items[0]["doy"] == 1 and items[-1]["doy"] == 365
        assert all(i["et0_p90"] >= i["et0_mean"] for i in items), "p90 < mean somewhere"
        p = [i["et0_p90"] for i in items]
        print(f"{did}: 365 doys, values per doy {min(ns)}..{max(ns)}, ET0 p90 {min(p)}..{max(p)} mm/day, "
              f"max day-to-day jump {max(abs(a-b) for a, b in zip(p, p[1:] + p[:1])):.2f}")
        allitems += items
    assert len(allitems) == 1095
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "climatology.json").write_text(json.dumps(allitems, indent=1) + "\n")
    with open(OUT / "climatology.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["district", "doy", "et0_p90", "tmax_p90", "et0_mean"])
        w.writeheader()
        w.writerows(allitems)
    print(f"wrote {len(allitems)} items to data/out/climatology.json and .csv")


if __name__ == "__main__":
    main()
