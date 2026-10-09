# Sources (PD-01 verification)

Verified on 2026-10-09. Exact quotes are copied from the source; check again before the final slide.

## 1. Thirstwaves paper (Earth's Future)

Kukal, M. S. & Hobbins, M. (2025). *Thirstwaves: Prolonged Periods of Agricultural Exposure to Extreme Atmospheric
Evaporative Demand for Water.* Earth's Future. DOI [10.1029/2024EF004870](https://doi.org/10.1029/2024EF004870)
(abstract retrieved from the Crossref record of the DOI).

Exact abstract sentences:

> "Weighted for cropland area harvested, thirstwave intensity, duration, and frequency have increased by 0.06 mm d⁻¹
> decade⁻¹, 0.10 days decade⁻¹, and 0.39 events decade⁻¹, respectively during 1981–2021. Statistically significant
> trends appear across 17%, 7%, and 23% of cropland area for intensity, frequency, and duration."

**Mismatch with our plan:** the plan says "17% (intensity) and 23% (frequency)". The abstract lists the three
percentages in the order **intensity, frequency, duration**, so it is **17% intensity, 7% frequency, 23% duration**.

**Safe wording to use:** "For US cropland, 1981–2021, the paper finds statistically significant increasing trends in
thirstwave intensity over 17% of cropland area and in duration over 23%, with frequency rising about 0.39 events per
decade (cropland-weighted)." Never "17% more intense".

## 2. The Hindu (June 2025)

"Rising evaporative demand spotlights India's data and research gap", The Hindu, Science, 24 June 2025.
https://www.thehindu.com/sci-tech/energy-and-environment/rising-evaporative-demand-spotlights-indias-data-and-research-gap/article69728191.ece

Exact quote:

> "This said, according to experts, there is essentially no data about extreme thirstwaves over India."

## 3. FAO-56 crop coefficients (Kc mid-season)

Allen, R. G., Pereira, L. S., Raes, D. & Smith, M. (1998). *Crop evapotranspiration: Guidelines for computing crop
water requirements.* FAO Irrigation and Drainage Paper 56, Table 12. https://www.fao.org/4/x0490e/x0490e0b.htm

| Our crop | FAO-56 Table 12 row | Kc ini | **Kc mid (used)** | Kc end |
|---|---|---|---|---|
| paddy | i. Cereals: Rice | 1.05 | **1.20** | 0.90-0.60 |
| sugarcane | k. Sugar Cane | 0.40 | **1.25** | 0.75 |
| tomato | b. Vegetables, Solanum family: Tomato | (group 0.6) | **1.15** | 0.70-0.90 |
| ragi (finger millet) | i. Cereals: Millet (no finger-millet row in FAO-56) | (group 0.3) | **1.00** | 0.30 |
| lakes / reservoir | Open Water, < 2 m depth or in subhumid climates or tropics | 1.05 | **1.05** | - |

All four values in the source plan (1.2, 1.25, 1.15, 1.0) are confirmed. Stored in `data/config/crops.json`.

## 4. Lake and reservoir areas

| Lake | Area used | What it is | Source |
|---|---|---|---|
| Bellandur | 366.89 ha = 3,668,900 m² | legal lake extent (revenue records, 906 acres 25 guntas) | Ramachandra T.V. et al. 2017, *Bellandur and Varthur Lakes Rejuvenation Blueprint*, ENVIS Technical Report 116, EWRG, CES, IISc, sec. 2.1.1 — https://wgbis.ces.iisc.ac.in/energy/water/paper/ETR116/sec2.html |
| Varthur | 180.8 ha = 1,808,000 m² | legal lake extent (447 acres 14 guntas) | same report, sec. 2.1.2 |
| KRS | 130 km² = 130,000,000 m² | water-spread area at full reservoir level (124.8 ft) | IRJET Vol 6 Issue 9 (2019), "Assessment of sedimentation in Krishnaraja Sagar reservoir ... using remote sensing" — https://irjet.net/archives/V6/i9/IRJET-V6I9196.pdf |

All three are **upper bounds** of the open-water surface (lake extents / full reservoir). Other published figures:
Bellandur water spread 794 acres 26 guntas (KTCDA compliance report to the NGT, 2026, via Bangalore Mirror); Varthur
220 ha water spread (IISc, Ramachandra et al., IJETM). Always label lake litres "estimate (upper bound)".

## 5. Data

* Open-Meteo historical weather API, `models=era5_seamless` (ERA5 + ERA5-Land; Copernicus C3S) — climatology, replay.
  Open-Meteo forecast API — live detection. CC BY 4.0; free tier non-commercial, so everything is cached.
  Zippenfeld, P. (2023). Open-Meteo.com Weather API. https://doi.org/10.5281/ZENODO.7970649
* District boundaries: DataMeet India community, `maps` repository, Census 2011 districts
  (`website/docs/data/geojson/dists11.geojson`), https://github.com/datameet/maps — licence CC BY 2.5 India
  (Districts README; repository default CC BY 4.0). Census 2011 names: "Bangalore" = Bengaluru Urban.
* Basemap: © OpenStreetMap contributors (ODbL).

## 6. Not found / do not claim

* "~30% less evaporation by irrigating pre-dawn": no source found, **do not use**.
