"""Filter the DataMeet India district GeoJSON (Census 2011) to the 3 pilot districts,
simplify it, and compute centroids for data/config/districts.json.

Source: https://github.com/datameet/maps (website/docs/data/geojson/dists11.geojson),
DataMeet India community, CC BY 2.5 India (Districts) / CC BY 4.0 (repo default).

Usage: python data/scripts/make_geojson.py --src /path/to/dists11.geojson
"""
import argparse
import json
from pathlib import Path

from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[2]
SRC_URL = "https://raw.githubusercontent.com/datameet/maps/master/website/docs/data/geojson/dists11.geojson"

# DataMeet name (Census 2011 spelling) -> our ID and display name
PILOTS = {
    "Bangalore": ("Bengaluru_Urban", "Bengaluru Urban"),
    "Kolar": ("Kolar", "Kolar"),
    "Mandya": ("Mandya", "Mandya"),
}
ASSETS = {
    "Bengaluru_Urban": {"crops": [], "lakes": ["Bellandur", "Varthur"]},
    "Kolar": {"crops": ["tomato", "ragi"], "lakes": []},
    "Mandya": {"crops": ["paddy", "sugarcane"], "lakes": ["KRS"]},
}


def _round_coords(obj, nd=4):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], nd), round(obj[1], nd)]
        return [_round_coords(o, nd) for o in obj]
    return obj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="path to DataMeet dists11.geojson (%s)" % SRC_URL)
    ap.add_argument("--tolerance", type=float, default=0.002, help="simplify tolerance in degrees")
    args = ap.parse_args()

    src = json.loads(Path(args.src).read_text())
    feats, districts = [], []
    for f in src["features"]:
        p = f["properties"]
        if p.get("ST_NM") != "Karnataka" or p.get("DISTRICT") not in PILOTS:
            continue
        did, name = PILOTS[p["DISTRICT"]]
        geom = shape(f["geometry"])
        simple = geom.simplify(args.tolerance, preserve_topology=True)
        c = geom.centroid
        if not geom.contains(c):
            c = geom.representative_point()
        feats.append({
            "type": "Feature",
            "properties": {"id": did, "name": name, "datameet_name": p["DISTRICT"],
                           "census_2011_code": p.get("censuscode")},
            "geometry": {"type": mapping(simple)["type"],
                         "coordinates": _round_coords(mapping(simple)["coordinates"])},
        })
        districts.append({"id": did, "name": name, "lat": round(c.y, 4), "lon": round(c.x, 4),
                          **ASSETS[did],
                          "centroid_source": "Polygon centroid of DataMeet Census-2011 district boundary"})
    assert len(feats) == 3, f"expected 3 districts, got {len(feats)}"
    order = ["Bengaluru_Urban", "Kolar", "Mandya"]
    feats.sort(key=lambda f: order.index(f["properties"]["id"]))
    districts.sort(key=lambda d: order.index(d["id"]))

    out_geo = ROOT / "frontend/data/pilot_districts.geojson"
    out_geo.write_text(json.dumps({"type": "FeatureCollection",
                                   "attribution": "District boundaries: DataMeet India community (Census 2011), CC BY 2.5 India",
                                   "features": feats}, separators=(",", ":")))
    (ROOT / "data/config/districts.json").write_text(json.dumps(districts, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out_geo} ({out_geo.stat().st_size/1024:.0f} KB)")
    for d in districts:
        print(d["id"], d["lat"], d["lon"])


if __name__ == "__main__":
    main()
