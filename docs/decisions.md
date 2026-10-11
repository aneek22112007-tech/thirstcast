# Decisions

## Region
* **ap-south-1 (Mumbai)**. Stack `thirstcast`, first deployed 2026-10-11.

## Bedrock model ID
* **None yet: `ModelId` empty, `AskMode=template`** (MODEL_PROVIDER=none). On 2026-10-11 every Bedrock
  `converse` call from this new account returned `ValidationException: Operation not allowed`
  (tried apac.amazon.nova-lite-v1:0, apac.amazon.nova-micro-v1:0, apac.anthropic.claude-3-haiku-20240307-v1:0,
  in.anthropic.claude-haiku-4-5-20251001-v1:0, global.amazon.nova-2-lite-v1:0), most likely because account
  verification was still in progress. /ask serves the template advisory (EN + HI), which uses the same tool data.
* When Bedrock works: preferred `apac.amazon.nova-lite-v1:0`; redeploy with `ModelId=apac.amazon.nova-lite-v1:0 AskMode=llm`.
* `ReservedConcurrentExecutions` was removed from AgentFunction: the new account's concurrency quota is 10, so
  any reservation fails. The /ask route throttle (1 rps, burst 2) caps cost.

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
* 2026-10-11 DECISION: before the detector's first run, `GET /thirstwave/{district}` returns `status: "UNKNOWN"`
  (same as `/districts`), not `NONE`. `NONE` stays "no flagged day in the window".
* 2026-10-09 DECISION: April 2024 numbers come from the ERA5 pipeline (22/30 days, +13.3 mm, Tmax 24/30, worst April
  since 1994) instead of the source plan's 27/30, +26.9 mm, 28/30 (only reproducible with the mixed best_match series).
* 2026-10-09 DECISION: paper wording corrected: 17% intensity, 7% frequency, 23% duration (docs/sources.md).
