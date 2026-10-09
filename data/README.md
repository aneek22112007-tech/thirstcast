# data/ (KD tasks)

All local, no AWS. Python 3.12:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r data/requirements.txt
cd data/scripts
python make_geojson.py --src dists11.geojson     # RS-01/KD-02: GeoJSON + districts.json (DataMeet source)
python pull_archive.py                           # KD-03: 1994-2023 (era5_seamless), cached in data/raw
python pull_archive.py --start 2024-01-01 --end 2024-12-31
python build_climatology.py                      # KD-04: data/out/climatology.json/.csv (1,095 items)
python merge_config.py                           # KD-09: data/out/config_items.json
python replay_april_2024.py                      # KD-06/08: data/out/replay/*.json + docs/numbers.md
python blindspot_finder.py                       # KD-10: data/out/blindspot_report.md
python bias_offset.py                            # KD-07: data/out/bias_offsets.json + docs/img/bias_offset.png
python make_charts.py                            # KD-11: docs/img/*.png
python run_detector_local.py                     # detector logic locally -> data/out/status/*.json
cd ../.. && python -m pytest backend/core -q     # KD-05 tests
```

| Output | For |
|---|---|
| `out/climatology.json` | Aneek: `load_dynamo.py --table <ClimatologyTable>` |
| `out/config_items.json` | Aneek: `load_dynamo.py --table <ConfigTable>` |
| `out/replay/*.json` | Aneek: `upload_s3.sh` (S3 `replay/`); frontend replay |
| `out/bias_offsets.json` | detector params (past_days=35, days 6-30, large threshold 0.5 mm/day) |
| `out/blindspot_report.md` | pitch slide decision |
