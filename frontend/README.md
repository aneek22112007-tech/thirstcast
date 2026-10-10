# frontend/

Static site. No build step. Landing page is `index.html`. The map is `app.html`. Methods are `methods.html`.

```bash
cd frontend && python3 -m http.server 8000   # http://127.0.0.1:8000
```

* `config.js`: `API_BASE_URL` (stack output `ApiUrl`, no trailing slash) and `USE_MOCK`. While `USE_MOCK` is true
  (or the URL is empty) a yellow **MOCK DATA** badge shows. Set `USE_MOCK: false` when the live API is up.
* `i18n/en.json` and `i18n/hi.json`: every UI string. Hindi is machine-assisted and needs review (`_comment` in `hi.json`).
* `styles/tokens.css`: shared colours, type and spacing.
* `mock/`: generated from real historical data by `data/scripts/make_mocks.py` (contract shapes).
* `data/pilot_districts.geojson`: DataMeet Census-2011 boundaries.
* `data/climatology_curves.json`, `data/blindspot.json`, `data/catalog.json`: built by `scripts/build_static_data.py` from `data/out/` and `data/config/`. Re-run that script after the pipeline changes. Do not edit the JSON by hand.
* `methods.html` renders `content/methods.md`; run `./sync_docs.sh` after changing `docs/methods.md` or `docs/img/`.
* Amplify: `amplify.yml` at the repo root (monorepo, `appRoot: frontend`, no build).
* A failed live API shows "API unavailable". The page does not silently switch to mocks.
* UI smoke test: `npm install && npx playwright install chromium && npm run test:ui`.
