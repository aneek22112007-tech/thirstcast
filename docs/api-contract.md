# API contract (frozen; changes need Aneek's OK + a line in decisions.md)

Base URL: stack output `ApiUrl` (`https://<api-id>.execute-api.<region>.amazonaws.com`). JSON everywhere.
CORS: localhost dev ports + the Amplify origin (`AmplifyOrigin` stack parameter).
District IDs: `Bengaluru_Urban`, `Kolar`, `Mandya`. Unknown ID → `404 {"error": "unknown district"}`.
Status: `ACTIVE` (red) = today inside a run of 3+ flagged days; `WATCH` (amber) = a flagged day in the 7-day
window; `NONE` (green); `UNKNOWN` (grey, /districts only) = detector has not run yet.

## GET /districts
```json
{"districts": [{"id": "Mandya", "name": "Mandya", "lat": 12.6104, "lon": 76.798, "status": "WATCH",
                "day_in_wave": 0, "updated_at": "2026-10-09T21:12:04+05:30"}],
 "caveat": "District-centroid estimate (~10 km grid)"}
```

## GET /thirstwave/{district}
The Status item (`thirstcast_core.pipeline.build_status`) plus `caveat`:
```json
{"district": "Mandya", "status": "WATCH", "day_in_wave": 0, "run_date": "2026-10-09",
 "forecast": [{"date": "2026-10-09", "et0": 4.41, "p90": 4.81, "flag": false,
               "tmax": 30.4, "tmax_p90": 29.6, "tmax_flag": true}],
 "excess_mm_7d": 6.27,
 "excess_definition": "Sum over the 7 forecast days of max(bias-adjusted ET0 - day-of-year p90, 0)",
 "forecast_wave": {"start": "2026-10-10", "end": "2026-10-15", "days": 6, "ongoing": false, "extends_past_forecast": true},
 "extra_litres_per_acre": {"paddy": [27405, 33495], "sugarcane": [28547, 34890]},
 "extra_litres_lakes": {"KRS": {"value": 855855000, "label": "estimate"}},
 "bias_offset_mm": -0.2, "bias_note": "", "updated_at": "2026-10-09T06:00:05+05:30",
 "caveat": "District-centroid estimate (~10 km grid)"}
```
* `forecast[]`: 7 days from the run date; `et0` is bias-adjusted (mm/day); `flag` = et0 > p90.
* `extra_litres_per_acre`: per crop `[low, high]` = Σexcess × Kc × 4047 with Kc ±10% (estimate).
* `extra_litres_lakes`: Σexcess × 1.05 × area_m² (estimate, upper bound). `value: null` = area not verified, do not show.
* `bias_note`: non-empty when |offset| > 0.5 mm/day or the forecast came from cache (`stale: true`).
* Before the detector's first run: `status: "NONE"`, `forecast: []`, `note: "detector has not run yet"`.
* (Example values from a local run on 2026-10-09; not live.)

## GET /replay/{district}
Pre-computed `s3://<bucket>/replay/{district}_2024-04.json` (built by `data/scripts/replay_april_2024.py`):
`district, name, period{start,end}, days[{date, et0, p90, flag, in_wave, excess_mm, cum_excess_mm, tmax, tmax_p90, tmax_flag}],
summary{days_above_p90, days_total, days_in_wave, cum_excess_mm, cum_excess_definition, litres_per_acre_reference,
extra_litres_per_acre, tmax_days_above_p90, lakes, april_rank_1994_2024, april_years_compared, runs, bias_correction}, caveat, source`.

## POST /ask
Request `{"question": "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?", "district": "Mandya"}` (`district` optional; ≤ 500 chars).
Response:
```json
{"answer": "…", "lang": "hi", "mode": "llm", "tools_used": ["get_status", "get_forecast"],
 "district": "Mandya", "caveat": "Estimates only. District-centroid estimate (~10 km grid)"}
```
`mode`: `llm` (Strands + Bedrock) or `template` (non-LLM fallback; UI shows "Template advisory (non-LLM mode)").
Any agent error/timeout returns a template answer. Bad body → `400 {"error": ...}`. Route throttle: 1 req/s, burst 2.
