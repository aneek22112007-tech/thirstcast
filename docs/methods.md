# ThirstCast methods

## 1. What we measure: ET0

Reference evapotranspiration (**ET0**, mm/day) is how much water a well-watered reference grass surface would lose
to the air in a day: the "thirst" of the atmosphere. It combines temperature, humidity, wind and sunshine (FAO-56
Penman-Monteith). We use Open-Meteo's daily `et0_fao_evapotranspiration`.

## 2. Thirstwave definition

A **thirstwave** is a run of **3 or more consecutive days** on which ET0 is above its local
**90th-percentile (p90)** threshold for that day of the year (Kukal & Hobbins 2025, *Earth's Future*,
DOI 10.1029/2024EF004870, adapted to a local, day-of-year threshold).

## 3. Thresholds (climatology)

* Data: Open-Meteo historical API, `models=era5_seamless` (ERA5 + ERA5-Land, ~0.1° / ~10 km grid), 1994-2023,
  one point per district (polygon centroid of the DataMeet Census-2011 boundary), `timezone=Asia/Kolkata`.
* Day of year: non-leap 1-365; 29 February is counted as 28 February (doy 59).
* For each day of year *d*, all 30 years' values with day of year in *d*−7 … *d*+7 (wrapping around the year end,
  about 450 values) → `et0_p90` = 90th percentile (numpy default "linear" method), `et0_mean`, and `tmax_p90` for
  daily maximum temperature.
* Why not Open-Meteo's default model? Its `best_match` series switches from ERA5 to ECMWF IFS from about 2017 and
  runs higher in ET0 (+0.45 mm/day at our Bengaluru point in 2024). Mixing the two inflates recent excesses, so
  thresholds, replay and bias reference all use one ERA5 series. See `docs/numbers.md`.

![p90 thresholds](img/p90_climatology.png)

## 4. Detection and status

* Flag a day when ET0 > p90 for its day of year (bias-adjusted ET0 for forecasts).
* **ACTIVE** (red): today is inside a run of 3+ flagged days (past days count, so an ongoing run is detected);
  `day_in_wave` = position of today in that run.
* **WATCH** (amber): not active, but at least one flagged day today or in the next 6 days.
* **NONE** (green): no flagged day in the 7-day window.
* `excess_mm_7d` = Σ max(ET0_adj − p90, 0) over the 7 forecast days.

## 5. Forecast and bias correction

* Daily at 06:00 IST (EventBridge `cron(30 0 * * ? *)`) the detector calls the Open-Meteo forecast API
  (`forecast_days=7`, `past_days=35`) for each district and caches the response in S3.
* The forecast model is not ERA5. We compare the forecast API's past days with the ERA5 archive for the same dates,
  **days 6-30 before today** (the archive lags about 5 days):
  offset = mean(forecast ET0 − archive ET0), and ET0_adj = max(ET0 − offset, 0).
* Measured on 9 Oct 2026: +0.10 mm/day (Bengaluru Urban), +0.09 (Kolar), −0.20 (Mandya); daily SD ≈ 0.45-0.49
  mm/day. If |offset| > 0.5 mm/day the API returns a `bias_note` and the UI shows it.

![bias](img/bias_offset.png)

## 6. From millimetres to litres (all estimates)

* 1 mm of water over 1 m² = 1 litre; over 1 acre (4,046.86 m²) ≈ **4,047 L**.
* **Farmer layer:** extra litres per acre = Σexcess × Kc × 4,047, shown as a range with Kc ±10%.
  Kc (FAO-56 Table 12, mid-season): paddy 1.20, sugarcane 1.25, tomato 1.15, ragi 1.00 (generic millet row).
* **Lake / reservoir layer:** extra litres = Σexcess × 1.05 × area (m²) (FAO-56 open water Kc 1.05).
  Areas: Bellandur 366.89 ha, Varthur 180.8 ha (IISc 2017, lake extents), KRS 130 km² at full reservoir level
  (IRJET 2019). These are maximum areas, so lake litres are **upper bounds**.
* Reference-crop figure (replay): Σexcess × 4,047 L/acre (Kc = 1).

## 7. Evidence: April 2024 replay (historical data, no bias correction)

| District | Days ET0 > p90 | Cumulative excess* | Ref. crop L/acre (estimate) | Tmax > its p90 | April rank since 1994 |
|---|---|---|---|---|---|
| Bengaluru Urban | 22 of 30 | +13.3 mm | ≈ 53,700 | 24 of 30 | 1st of 31 |
| Kolar | 23 of 30 | +12.2 mm | ≈ 49,600 | 22 of 30 | 1st of 31 |
| Mandya | 20 of 30 | +11.7 mm | ≈ 47,400 | 24 of 30 | 1st of 31 |

\* **Cumulative excess = sum of daily ET0 above the local day-of-year p90 threshold.**

Temperature was also above its own p90 on most of these days, so we do **not** claim heat alerts missed April 2024.
Bengaluru's 2024 water crisis was fundamentally a supply failure (poor 2023 monsoon, failing borewells, Cauvery
shortfalls); we do not claim thirstwaves caused it. We show the demand side nobody was measuring.

![April 2024 Bengaluru](img/april2024_Bengaluru_Urban.png)

## 8. Blindspots: thirst without heat

Across 1994-2024 we found 129 thirstwaves (all three districts) during which Tmax never rose above its own
day-of-year p90, so a temperature-threshold alert would have stayed silent. Hot-season example: **Mandya,
8-14 April 2023**, 7 days, +2.6 mm above p90, Tmax peaked at 36.2 °C. Full list: `data/out/blindspot_report.md`.

## 9. Limits

* One point per district (district centroid, ~10 km grid); not field- or lake-level.
* All litre figures are estimates with ranges; lake figures are upper bounds.
* ET0 is reference demand; actual crop use depends on crop stage, soil water and irrigation.
* Forecast skill drops after a few days; the bias correction is a mean offset only.
* City household demand is not modelled.
* 1994-2023 events are in-sample for the thresholds.

## 10. Thirst percentile ("why today")

The overview reports where today's ET₀ sits inside the same ±7 day climatology used for the p90.
`frontend/scripts/build_percentiles.py` reads `data/raw/archive_*_1994_2023.json` and stores, for each
non-leap day of year, the sorted ET₀ values in that window as integer hundredths of a millimetre
(`frontend/data/percentiles.json`). It does not store the expanded window twice.

The page rebuilds day *d*−7 … *d*+7, wrapping with `(k−1) mod 365 + 1`, quantises today's ET₀ with
`round(ET₀ × 100)`, and sets the percentile to `round(100 × count(value ≤ today) / N)`. A value of 100
means today is at or above every reference value in the window. The panel also shows today's ET₀ and
Tmax beside their own p90, the count of days above the ET₀ p90 in the 7-day window, the signed bias
offset in mm/day, and the cumulative excess. It does not attribute the day to a weather driver,
because no separate driver series was fetched.

## 11. Thirty Aprils

`data/scripts/april_history.py` reads the ERA5 archive and writes `data/out/april_history.json`
(copied to `frontend/data/april_history.json`). For each district and each April from 1994 through 2024
it records days with ET₀ above the day-of-year p90, the cumulative excess in millimetres, and the rank
among those 31 Aprils. Rank 1 is the largest cumulative excess. The chart is April only; other months
are not computed. 2024 is the marked bar.

## 12. Thirsty, not hot

`frontend/scripts/build_static_data.py` writes `frontend/data/blindspot_timeline.json` from the blindspot
events. Each event is a thirstwave during which maximum temperature stayed at or below its own
day-of-year p90: ET0 above its p90 while Tmax stayed below its own p90. The landing page reads the
hero event (district and start date) from that file and displays the days, excess and peak Tmax
stored on the event. It does not keep a second copy of those figures in the page.

## 17. Crop stage

The farmer calculator can switch the FAO-56 Table 12 stage. The stored `kc` field stays the
mid-season value the pipeline uses, so the default view is unchanged. Initial and late stages
are read from `stages` on the same crop row in `data/config/crops.json`, copied into
`frontend/data/catalog.json` by `frontend/scripts/build_static_data.py`. Rice is 1.05, 1.20,
and 0.60–0.90. Sugar cane is 0.40, 1.25, and 0.75. Tomato is 0.60, 1.15, and 0.70–0.90.
The Table 12 footnote gives stalk tomatoes a mid-season Kc of 1.20; this project keeps 1.15.
Millet is 0.30, 1.00, and 0.30. A single Kc is still shown with ±10%. When the table gives a
range, that range is the band and the ±10% is not applied again.

## 18. Print bulletin

The print button fills one A4 page from the district already on screen: status, today's ET₀
and the cumulative excess, the 7-day chart, the forecast table, the mid-season litre range,
the caveat, the source line, and the run date. It does not fetch a new response.

## 19. Map keyboard

When the map has focus, the left and right arrow keys move through the three pilot districts
and a polite live region reads the district name and status. The order is Bengaluru Urban,
Kolar, Mandya.

## 13. Sources

Open-Meteo (Zippenfeld 2023, doi:10.5281/ZENODO.7970649; ERA5/ERA5-Land © Copernicus C3S); Allen et al. 1998,
FAO-56; Kukal & Hobbins 2025, Earth's Future; The Hindu, 24 June 2025; Ramachandra et al. 2017 (IISc ETR-116);
IRJET 6(9) 2019 (KRS); DataMeet India district boundaries (CC BY 2.5 IN). Details: `docs/sources.md`.

## 14. Compare view

The compare view (`app.html#view=compare`) places the three pilot districts side by side.
It reads the district list and each district's thirstwave response, the same JSON the map
already loads. It does not call a new endpoint and it does not compute a new statistic.
Arrow keys move between the three columns.

## 15. Share card

The share card is drawn in the browser on a 1200 by 630 canvas, in the same navy, gold and
water colours as `frontend/og.svg`. It copies the numbers already on the district overview
or the April 2024 replay summary, and it bakes in the caveat, the date, a mock or historical
label, and the page URL. No image library is loaded.

## 16. Offline copy

`frontend/sw.js` is a network-first service worker. On install it stores the pages, styles,
scripts, vendored Leaflet (including marker images) and vendored marked. Responses under
`data/` and `mock/`, and the last successful live `GET /districts`, `GET /thirstwave/{d}` and
`GET /replay/{d}`, are stored when they arrive. A saved live response is used only if it is
under 24 hours old. OpenStreetMap tiles are stored only after the map requests that tile.
Nothing prefetches tiles. When a saved response is shown because the network failed, the page
says which time that copy was saved. The methods page reads `frontend/vendor/marked/` instead
of a CDN.

## 20. Kannada

The Kannada strings in `frontend/i18n/kn.json` are machine-assisted and need a native review.
District names on that setting are ಬೆಂಗಳೂರು, ಕೋಲಾರ and ಮಂಡ್ಯ. The typeface is Noto Sans Kannada,
vendored as `frontend/vendor/fonts/NotoSansKannada.woff2` (SIL Open Font License). The agent
still answers in English or Hindi. The Kannada screen says so. It does not detect Kannada.
