# frontend/ (RS tasks)

Static site: plain HTML/CSS/JS + Leaflet (CDN). No build step.

```bash
cd frontend && python -m http.server 8080   # open http://localhost:8080
```

* `config.js`: `API_BASE_URL` (stack output `ApiUrl`, no trailing slash) and `USE_MOCK`. While `USE_MOCK` is true
  (or the URL is empty) a yellow **MOCK DATA** badge shows. Set `USE_MOCK: false` for the demo.
* `mock/`: generated from real historical data by `data/scripts/make_mocks.py` (contract shapes).
* `data/pilot_districts.geojson`: DataMeet Census-2011 boundaries for the 3 districts (from `data/scripts/make_geojson.py`).
* `methods.html` renders `content/methods.md`; run `./sync_docs.sh` after changing `docs/methods.md` or `docs/img/`.
* Amplify: the build spec is `amplify.yml` at the repo root (monorepo, `appRoot: frontend`).
* Errors show an "API unavailable" banner; the page never silently falls back to mocks in live mode.
