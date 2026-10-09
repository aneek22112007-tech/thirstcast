"""KD-09: merge districts.json + crops.json + lakes.json into data/out/config_items.json
(Config table item shapes, docs/api-contract.md / plan 3.5)."""
import json

from common import CONFIG, OUT


def main():
    districts = json.loads((CONFIG / "districts.json").read_text())
    crops = json.loads((CONFIG / "crops.json").read_text())
    lakes = json.loads((CONFIG / "lakes.json").read_text())
    items = []
    for d in districts:
        items.append({"pk": f"district#{d['id']}", "type": "district", "id": d["id"], "name": d["name"],
                      "lat": d["lat"], "lon": d["lon"], "crops": d["crops"], "lakes": d["lakes"]})
    for c in crops:
        items.append({"pk": f"crop#{c['id']}", "type": "crop", "id": c["id"], "name": c["name"],
                      "name_hi": c["name_hi"], "kc": c["kc"],
                      "source": f"{c['source']} ({c['fao56_row']})", "url": c["url"], "verified": c["verified"]})
    for l in lakes:
        items.append({"pk": f"lake#{l['id']}", "type": "lake", "id": l["id"], "name": l["name"],
                      "district": l["district"], "area_m2": l["area_m2"], "area_text": l["area_text"],
                      "area_basis": l["area_basis"], "kc": l["kc"], "source": l["source"], "url": l["url"],
                      "verified": l["verified"]})
    # every district's crops/lakes must exist
    pks = {i["pk"] for i in items}
    for d in districts:
        for c in d["crops"]:
            assert f"crop#{c}" in pks, c
        for l in d["lakes"]:
            assert f"lake#{l}" in pks, l
    (OUT / "config_items.json").write_text(json.dumps(items, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {len(items)} config items: {len(districts)} districts, {len(crops)} crops, {len(lakes)} lakes")


if __name__ == "__main__":
    main()
