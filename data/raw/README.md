# Raw Open-Meteo data (KD-03)

Untouched JSON responses from the Open-Meteo historical weather API
(`https://archive-api.open-meteo.com/v1/archive`), daily `et0_fao_evapotranspiration` (FAO-56 Penman-Monteith,
mm) and `temperature_2m_max` (C), `timezone=Asia/Kolkata`, at the centroids in `data/config/districts.json`.

| Files | Model | Used for |
|---|---|---|
| `archive_{district}_1994_2023.json` | `era5_seamless` (ERA5 + ERA5-Land, ~0.1 deg) | climatology (p90 thresholds), blindspot finder |
| `archive_{district}_2024.json` | `era5_seamless` | April 2024 replay, "worst April" ranking |
| `best_match/archive_*.json` | Open-Meteo default `best_match` (ERA5 until ~2016, ECMWF IFS after) | sensitivity check only (docs/numbers.md) |
| `bias/forecast_*`, `bias/archive_*` | forecast API (`past_days=35`) and `era5_seamless` archive | bias-offset analysis (KD-07) |

Sanity checks (pull_archive.py): 10,957 days for 1994-2023 and 366 for 2024 per district; **no missing values**.
Re-running the script never re-downloads an existing file (`--force` to override).

Licence: Open-Meteo data is CC BY 4.0 (free tier non-commercial); ERA5 / ERA5-Land: Copernicus Climate Change Service.
Cite: Zippenfeld, P. (2023). Open-Meteo.com Weather API. https://doi.org/10.5281/ZENODO.7970649
