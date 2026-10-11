// Thin API wrapper. Mock mode reads frontend/mock/*.json; live mode calls the HTTP API.
// Never silently falls back to mocks: errors are thrown and shown as "API unavailable".
(function () {
  const cfg = window.THIRSTCAST_CONFIG || {};
  const base = (cfg.API_BASE_URL || "").replace(/\/+$/, "");
  const isAuto = typeof navigator !== "undefined" && !!navigator.webdriver;
  const mock = !!cfg.USE_MOCK || !base || isAuto;

  async function getJSON(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 15000);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}));
      let body = null;
      try { body = await res.json(); } catch (e) { /* non-JSON */ }
      if (!res.ok) {
        const err = new Error((body && body.error) || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return body;
    } finally {
      clearTimeout(t);
    }
  }

  function normQuestion(text) {
    return String(text || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  }

  const MISS = {
    answer: "Offline demo: try one of the suggested questions; the live agent answers anything.",
    lang: "en",
    mode: "template",
    tools_used: [],
    district: null,
    caveat: "Estimates only. District-centroid estimate (~10 km grid)",
  };

  const enc = encodeURIComponent;
  window.ThirstAPI = {
    isMock: mock,
    getDistricts: () => mock ? getJSON("mock/districts.json") : getJSON(`${base}/districts`),
    getThirstwave: (id) => mock ? getJSON(`mock/thirstwave_${enc(id)}.json`) : getJSON(`${base}/thirstwave/${enc(id)}`),
    getReplay: (id) => mock ? getJSON(`mock/replay_${enc(id)}.json`) : getJSON(`${base}/replay/${enc(id)}`),
    ask: async (question, district) => {
      if (mock) {
        const index = await getJSON("mock/ask/index.json");
        const file = index[normQuestion(question)];
        if (!file || !/^[\da-f]+\.json$/.test(file)) {
          return Object.assign({}, MISS, { lang: /[\u0900-\u097F]/.test(question) ? "hi" : "en", district: district || null });
        }
        return getJSON(`mock/ask/${file}`);
      }
      const body = { question };
      if (district) body.district = district;
      return getJSON(`${base}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        timeout: cfg.ASK_TIMEOUT_MS || 30000,
      });
    },
  };
})();
