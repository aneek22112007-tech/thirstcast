# Decisions

## Region

## Bedrock model ID

## District IDs
* Bengaluru_Urban
* Kolar
* Mandya

## Conventions
* Archive data: Open-Meteo `models=era5_seamless` (ERA5 + ERA5-Land) for climatology, replay and the bias reference.
  The default `best_match` switches to ECMWF IFS from ~2017 and inflates recent ET0 (see docs/numbers.md).
* Day of year: non-leap 1-365, Feb 29 folded into doy 59. Percentile: numpy default (linear), +-7-day window with wrap.
* Status: ACTIVE = run date inside a run of 3+ flagged days; WATCH = any flagged day in the 7-day window; NONE otherwise.
* Bias: offset = mean(forecast - archive) ET0, days 6-30 before the run date, forecast `past_days=35`;
  disclosed in `bias_note` when |offset| > 0.5 mm/day.
* Config table pk: `district#<id>`, `crop#<id>`, `lake#<id>`. Lakes with `verified: false` are never shown as litres.
* Schedule: `cron(30 0 * * ? *)` UTC = 06:00 IST daily.

## Change log
* 2026-10-09 DECISION: April 2024 numbers come from the ERA5 pipeline (22/30 days, +13.3 mm, Tmax 24/30, worst April
  since 1994) instead of the source plan's 27/30, +26.9 mm, 28/30 (only reproducible with the mixed best_match series).
* 2026-10-09 DECISION: paper wording corrected: 17% intensity, 7% frequency, 23% duration (docs/sources.md).
