import { bindLangToggle, getLang, initI18n, initTheme, onLang, t } from "./i18n.js";
import { climateChart, dataTable, et0Chart, tmaxChart } from "./charts.js";
import { dayOfYear, esc, formatDate, formatMm, formatNumber, formatScale, prefersReducedMotion } from "./format.js";

const TABS = ["overview", "farmers", "lakes", "heat", "history"];
const SUGGESTIONS = [
  { district: "Mandya", q: "Will Mandya face a thirstwave this week?" },
  { district: "Mandya", q: "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?" },
  { district: "Kolar", q: "Is Kolar just hot this week, or also thirsty?" },
  { district: "Kolar", q: "कोलार में 1 एकड़ टमाटर को इस हफ्ते कितना अतिरिक्त पानी चाहिए?" },
];
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const $ = (id) => document.getElementById(id);

const state = {
  districts: {},
  layers: {},
  selected: null,
  tab: "overview",
  detail: {},
  replay: {},
  replayOn: false,
  replayDay: 1,
  timer: null,
  speed: 900,
  catalog: null,
  curves: null,
  blind: null,
  acres: 1,
  crop: null,
  chatOpened: false,
};

function showError(message) {
  const banner = $("error-banner");
  banner.hidden = !message;
  banner.textContent = message || "";
}

function toast(message) {
  const el = $("toast");
  el.hidden = false;
  el.textContent = message;
  setTimeout(() => { el.hidden = true; }, 1600);
}

function hashParams() {
  return new URLSearchParams(location.hash.replace(/^#/, ""));
}

function writeHash() {
  const params = hashParams();
  const next = new URLSearchParams();
  if (state.selected) next.set("d", state.selected);
  next.set("tab", state.tab);
  if (state.replayOn) next.set("replay", String(state.replayDay));
  next.set("lang", getLang());
  const q = params.get("q");
  const input = $("question");
  if (q && input && input.value === q) next.set("q", q);
  if (params.get("ask") === "1" && !state.chatOpened) next.set("ask", "1");
  const href = `#${next.toString()}`;
  if (location.hash !== href) history.replaceState(null, "", href);
}

function loadAsset(kind, href) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind === "css" ? "link" : "script");
    if (kind === "css") {
      el.rel = "stylesheet";
      el.href = href;
    } else {
      el.src = href;
      el.async = true;
    }
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(href));
    document.head.appendChild(el);
  });
}

function installPatterns() {
  const svg = document.querySelector(".leaflet-overlay-pane svg");
  if (!svg || svg.querySelector("#thirst-patterns")) return;
  svg.insertAdjacentHTML("afterbegin", `
    <defs id="thirst-patterns">
      <pattern id="pat-none" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#146844"/><line x1="0" y1="0" x2="0" y2="8" stroke="#d9efe4" stroke-width="3"/>
      </pattern>
      <pattern id="pat-watch" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#f0c36a"/><circle cx="2" cy="2" r="1.3" fill="#1a1203"/>
      </pattern>
      <pattern id="pat-unknown" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#5c6b7a"/><rect width="4" height="8" fill="#d5dbe1"/>
      </pattern>
    </defs>`);
}

function paint(id, status, tooltip) {
  const layer = state.layers[id];
  if (!layer) return;
  const fills = { NONE: "#146844", WATCH: "#f0c36a", ACTIVE: "#8f291f", UNKNOWN: "#5c6b7a" };
  layer.setStyle({
    color: state.selected === id ? "#0c2340" : "#142033",
    weight: state.selected === id ? 3 : 1.4,
    fillOpacity: 0.78,
    fillColor: fills[status] || fills.UNKNOWN,
  });
  const el = layer.getElement();
  if (el) {
    ["st-none", "st-watch", "st-active", "st-unknown"].forEach((c) => el.classList.remove(c));
    el.classList.add(`st-${(status || "unknown").toLowerCase()}`);
  }
  const name = (state.districts[id] && state.districts[id].name) || id;
  const text = tooltip || `${name}: ${status}. ${t("status." + status + "_long")}`;
  layer.setTooltipContent(text);
}

function statusFor(id) {
  if (state.replayOn && state.replay[id]) {
    const current = state.replay[id].days[state.replayDay - 1];
    if (current) return current.in_wave ? "ACTIVE" : current.flag ? "WATCH" : "NONE";
  }
  return (state.districts[id] && state.districts[id].status) || "UNKNOWN";
}

function renderLegend() {
  const rows = ["NONE", "WATCH", "ACTIVE"].map((status) => `
    <div class="legend-row"><span class="swatch swatch-${status.toLowerCase()}" aria-hidden="true"></span>
    <span><strong>${esc(t("status." + status))}</strong> · ${esc(t("status." + status + "_long"))}</span></div>`).join("");
  $("legend").innerHTML = `<div class="small" style="font-weight:700">${esc(t("app.legend"))}</div>${rows}`;
}

function renderList() {
  const box = $("district-list");
  const select = $("district-select");
  box.replaceChildren();
  select.replaceChildren();
  Object.values(state.districts).forEach((d) => {
    const status = statusFor(d.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "district-btn";
    btn.setAttribute("aria-pressed", String(state.selected === d.id));
    btn.innerHTML = `<span>${esc(d.name)}</span><span class="badge badge-${esc(status).toLowerCase()}">${esc(t("status." + status))}</span>`;
    btn.addEventListener("click", () => selectDistrict(d.id));
    box.appendChild(btn);
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.name} · ${t("status." + status)}`;
    opt.selected = state.selected === d.id;
    select.appendChild(opt);
  });
}

function renderTabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  TABS.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = `tab-${id}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(state.tab === id));
    btn.setAttribute("aria-controls", "tab-panel");
    btn.tabIndex = state.tab === id ? 0 : -1;
    btn.textContent = t("tabs." + id);
    btn.addEventListener("click", () => setTab(id));
    btn.addEventListener("keydown", (event) => {
      const index = TABS.indexOf(id);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
        setTab(next);
        document.getElementById(`tab-${next}`).focus();
      }
    });
    tabs.appendChild(btn);
  });
  $("tab-panel").setAttribute("aria-labelledby", `tab-${state.tab}`);
}

function setTab(id) {
  if (!TABS.includes(id)) id = "overview";
  state.tab = id;
  renderTabs();
  renderActiveTab();
  writeHash();
}

function summarySentence(detail) {
  const status = detail.status || "UNKNOWN";
  if (status === "ACTIVE") return t("app.summaryActive");
  if (status === "WATCH") return t("app.summaryWatch");
  if (status === "NONE") return t("app.summaryNone");
  return t("app.summaryUnknown");
}

function forecastTable(days) {
  return dataTable(days, [
    { label: t("app.colDate"), value: (d) => d.date },
    { label: t("app.colEt0"), value: (d) => formatNumber(d.et0, 2) },
    { label: t("app.colP90"), value: (d) => formatNumber(d.p90, 2) },
    { label: t("app.colFlag"), value: (d) => (d.flag ? t("app.yes") : t("app.no")) },
    { label: t("app.colTmax"), value: (d) => formatNumber(d.tmax, 1) },
    { label: t("app.colTmaxP90"), value: (d) => formatNumber(d.tmax_p90, 1) },
    { label: t("app.colTmaxFlag"), value: (d) => (d.tmax_flag ? t("app.yes") : t("app.no")) },
  ]);
}

function renderOverview(detail) {
  const status = detail.status || "UNKNOWN";
  const days = detail.forecast || [];
  const wave = detail.forecast_wave;
  let waveText = "";
  if (wave) {
    waveText = `<p class="note">${esc(t("app.wave", wave))}${wave.ongoing ? " " + esc(t("app.waveOngoing")) : ""}${wave.extends_past_forecast ? " " + esc(t("app.waveExtends")) : ""}</p>`;
  }
  const excess = detail.excess_mm_7d;
  return `
    <h2>${esc(state.districts[detail.district]?.name || detail.district)} <span class="badge badge-${esc(status).toLowerCase()}">${esc(t("status." + status))}</span></h2>
    <p class="big-range">${esc(summarySentence(detail))}</p>
    <p>${status === "ACTIVE" ? esc(t("app.dayInWave", { n: detail.day_in_wave })) : esc(t("app.noWaveDay"))}</p>
    ${detail.note ? `<p class="note note-info">${esc(detail.note)}</p>` : ""}
    ${detail.mock_note ? `<p class="note">${esc(detail.mock_note)}</p>` : ""}
    ${waveText}
    <div class="chart-wrap">${days.length ? et0Chart(days, { label: t("evidence.chart") }) : ""}</div>
    <p class="small">${esc(t("evidence.legend"))}</p>
    <dl class="kv">
      <dt>${esc(t("evidence.mm"))}</dt>
      <dd><strong>${excess == null ? "–" : esc(formatMm(excess))} mm</strong><br><span class="small">${esc(detail.excess_definition || t("app.excessDef"))}</span></dd>
      <dt>${esc(t("app.bias"))}</dt>
      <dd>${detail.bias_offset_mm == null ? "–" : esc(formatNumber(detail.bias_offset_mm, 2))} <span class="small">${esc(t("app.biasUnit"))}</span></dd>
      <dt>${esc(t("app.updated"))}</dt>
      <dd>${esc(detail.updated_at || "–")}</dd>
    </dl>
    ${detail.bias_note ? `<p class="note">${esc(detail.bias_note)}</p>` : ""}
    ${days.length ? `<details><summary>${esc(t("app.dataTable"))}</summary>${forecastTable(days)}</details>` : ""}
    <p class="small">${esc(detail.caveat || t("app.caveat"))}</p>`;
}

function cropMeta(id) {
  return (state.catalog.crops || []).find((crop) => crop.id === id);
}

function renderFarmers(detail) {
  const district = (state.catalog.districts || []).find((d) => d.id === detail.district);
  const crops = (district && district.crops) || [];
  if (!crops.length) return `<p class="note">${esc(t("app.noCrop"))}</p>`;
  if (!state.crop || !crops.includes(state.crop)) state.crop = crops[0];
  const options = crops.map((id) => {
    const meta = cropMeta(id);
    const name = meta ? (getLang() === "hi" ? meta.name_hi : meta.name) : id;
    return `<option value="${esc(id)}"${id === state.crop ? " selected" : ""}>${esc(name)}</option>`;
  }).join("");
  const range = (detail.extra_litres_per_acre || {})[state.crop];
  const meta = cropMeta(state.crop);
  const acres = Number(state.acres) > 0 ? Number(state.acres) : 1;
  let result = `<p class="note">${esc(t("app.unavailable"))}</p>`;
  if (Array.isArray(range)) {
    const low = Math.round(range[0] * acres);
    const high = Math.round(range[1] * acres);
    const tankLow = low / 10000;
    const tankHigh = high / 10000;
    const scaleLow = formatScale(low, getLang());
    const scaleHigh = formatScale(high, getLang());
    result = `
      <p class="small">${esc(t("app.perAcre"))}: ${esc(formatNumber(range[0]))}–${esc(formatNumber(range[1]))} L</p>
      <p class="big-range">${esc(formatNumber(low))}–${esc(formatNumber(high))} L</p>
      <p>${esc(t("app.estimate"))}${scaleLow ? ` · ≈ ${esc(scaleLow)}–${esc(scaleHigh)}` : ""}</p>
      <p>${esc(t("app.tankers", { n: `${formatNumber(tankLow, 2)}–${formatNumber(tankHigh, 2)}` }))}</p>
      <details class="formula"><summary>${esc(t("app.howCalc"))}</summary>
        <p>${esc(t("app.formula", { crop: meta ? meta.name : state.crop, kc: meta ? meta.kc : "–" }))}</p>
        <p class="small">${esc(detail.excess_definition || t("app.excessDef"))}: ${detail.excess_mm_7d == null ? "–" : esc(formatNumber(detail.excess_mm_7d, 2))} mm.</p>
        ${meta ? `<p class="small"><a href="${esc(meta.url)}">${esc(meta.source)}</a></p>` : ""}
      </details>`;
  }
  return `
    <div class="calc-row">
      <label class="field">${esc(t("app.crop"))}<select id="crop-select">${options}</select></label>
      <label class="field">${esc(t("app.acres"))}<input id="acres" type="number" min="0.1" max="10000" step="0.1" value="${esc(acres)}"></label>
    </div>
    <p class="small">${esc(t("app.range"))}</p>
    ${result}
    <p class="small">${esc(detail.caveat || t("app.caveat"))}. ${esc(t("app.kcNote"))}.</p>`;
}

function renderLakes(detail) {
  const entries = Object.entries(detail.extra_litres_lakes || {});
  if (!entries.length) return `<p class="note">${esc(t("app.noLake"))}</p>`;
  const cards = entries.map(([id, value]) => {
    const meta = (state.catalog.lakes || []).find((lake) => lake.id === id);
    if (meta && meta.verified === false) return "";
    if (!value || value.value == null) {
      return `<article class="card lake-card"><h3>${esc((meta && meta.name) || id)}</h3><p>${esc((value && value.note) || t("app.noLake"))}</p></article>`;
    }
    const scale = formatScale(value.value, getLang());
    return `<article class="card lake-card">
      <h3>${esc((meta && meta.name) || id)}</h3>
      <p class="big-range">${esc(formatNumber(value.value))} L</p>
      <p>${esc(t("app.upper"))}${scale ? ` · ≈ ${esc(scale)}` : ""}</p>
      ${meta ? `<p class="small">${esc(meta.area_text)}. ${esc(meta.area_basis)}</p>` : ""}
      ${meta ? `<p class="small">${esc(t("app.sources"))}: <a href="${esc(meta.url)}">${esc(meta.source)}</a></p>` : ""}
    </article>`;
  }).join("");
  if (!cards.trim()) return `<p class="note">${esc(t("app.noLake"))}</p>`;
  return `${cards}<p class="small">${esc(detail.caveat || t("app.caveat"))}</p>`;
}

function renderHeat(detail) {
  const days = detail.forecast || [];
  const et = days.filter((d) => d.flag).length;
  const tx = days.filter((d) => d.tmax_flag).length;
  const both = days.filter((d) => d.flag && d.tmax_flag).length;
  const example = state.blind && state.blind.example;
  const counts = state.blind ? state.blind.by_district : {};
  const blind = example ? `
    <article class="card">
      <p class="small">${esc(t("common.historical"))}</p>
      <h3>${esc(t("app.blindTitle"))}</h3>
      <p>${esc(t("app.blindBody", {
        days: example.days,
        excess: formatNumber(example.excess_mm, 2),
        tmax: formatNumber(example.max_tmax_c, 1),
      }))}</p>
      <p class="small">${esc(t("app.blindCount", {
        n: state.blind.blindspot_events,
        b: counts.Bengaluru_Urban || 0,
        k: counts.Kolar || 0,
        m: counts.Mandya || 0,
      }))}</p>
      <div class="chart-wrap">${et0Chart(example.daily, { label: t("app.blindTitle"), height: 200 })}</div>
      <div class="chart-wrap">${tmaxChart(example.daily, { label: t("app.colTmax"), height: 180 })}</div>
      <p class="small">${esc(state.blind.caveat)}</p>
    </article>` : "";
  return `
    <p>${esc(t("app.heatIntro"))}</p>
    <p>${days.length ? esc(t("app.heatCount", { et, tx, both })) : ""}</p>
    <div class="chart-wrap">${et0Chart(days, { label: t("evidence.chart") })}</div>
    <div class="chart-wrap">${tmaxChart(days, { label: t("app.colTmax") })}</div>
    <p class="small">${esc(t("evidence.legend"))}</p>
    ${days.length ? `<details><summary>${esc(t("app.dataTable"))}</summary>${forecastTable(days)}</details>` : ""}
    ${blind}`;
}

function renderHistory(detail) {
  const series = state.curves && state.curves.series[detail.district];
  if (!series) return `<p class="note">${esc(t("app.unavailable"))}</p>`;
  const iso = (detail.run_date || "").slice(0, 10);
  const doy = iso ? dayOfYear(iso) : null;
  return `
    <h3>${esc(t("app.historyTitle"))}</h3>
    <p>${esc(t("app.historyBody"))}</p>
    <p><strong>${iso ? esc(t("app.historyMark", { date: formatDate(iso, getLang()), doy })) : "–"}</strong></p>
    <div class="chart-wrap">${climateChart(series, doy || 0, t("app.historyTitle"))}</div>
    <p class="small">${esc(t("app.historyLegend"))} ${esc(state.curves.period)}. ${esc(t("app.caveat"))}.</p>`;
}

function renderActiveTab() {
  if (state.replayOn) return;
  const detail = state.detail[state.selected];
  const panel = $("tab-panel");
  if (!detail) {
    panel.innerHTML = `<p>${esc(t("app.selectPrompt"))}</p>`;
    return;
  }
  const views = { overview: renderOverview, farmers: renderFarmers, lakes: renderLakes, heat: renderHeat, history: renderHistory };
  panel.innerHTML = views[state.tab](detail);
  const crop = $("crop-select");
  const acres = $("acres");
  if (crop) crop.addEventListener("change", () => { state.crop = crop.value; renderActiveTab(); });
  if (acres) acres.addEventListener("change", () => { state.acres = acres.value; renderActiveTab(); });
}

async function selectDistrict(id, opts = {}) {
  if (!state.districts[id]) return;
  state.selected = id;
  Object.keys(state.layers).forEach((key) => {
    const d = state.districts[key];
    if (!state.replayOn && d) paint(key, d.status || "UNKNOWN");
  });
  renderList();
  if (!opts.keepHash) writeHash();
  if (state.replayOn) {
    setReplayDay(state.replayDay);
    return;
  }
  if (!state.detail[id]) {
    $("tab-panel").innerHTML = `<div class="skeleton" style="height:180px"></div>`;
    try {
      state.detail[id] = await window.ThirstAPI.getThirstwave(id);
    } catch (err) {
      $("tab-panel").innerHTML = `<p class="note">${esc(t("app.unavailableDetail", { message: err.message }))}</p>`;
      return;
    }
  }
  renderTabs();
  renderActiveTab();
}

function renderReplay() {
  const id = state.selected;
  const replay = state.replay[id];
  if (!replay) return;
  const day = Math.min(state.replayDay, replay.days.length);
  const cur = replay.days[day - 1];
  const soFar = replay.days.slice(0, day);
  const summary = replay.summary || {};
  const flagged = soFar.filter((d) => d.flag).length;
  const frac = summary.cum_excess_mm ? cur.cum_excess_mm / summary.cum_excess_mm : 0;
  const litres = (summary.litres_per_acre_reference || 0) * frac;
  const lakes = Object.entries(summary.lakes || {}).filter(([, v]) => v && v.value != null);
  const first = replay.days.find((d) => d.flag);
  const longest = (summary.runs || []).slice().sort((a, b) => b.days - a.days)[0];
  let note = "";
  if (first && cur.date === first.date) note = t("replay.first");
  if (longest && cur.date >= longest.start && cur.date <= longest.end) {
    note = [note, t("replay.longest", longest)].filter(Boolean).join(" · ");
  }
  const done = day === replay.days.length;
  $("replay-panel").innerHTML = `
    <div class="slider-row">
      <button class="btn" type="button" id="replay-play" aria-label="${esc(state.timer ? t("replay.pause") : t("replay.play"))}">${state.timer ? "II" : "▶"}</button>
      <input id="replay-slider" type="range" min="1" max="${replay.days.length}" value="${day}" aria-label="${esc(t("replay.day"))}">
      <output id="replay-date">${esc(formatDate(cur.date, getLang()))}</output>
      <label class="field">${esc(t("replay.speed"))}
        <select id="replay-speed">
          <option value="1400"${state.speed === 1400 ? " selected" : ""}>0.5×</option>
          <option value="900"${state.speed === 900 ? " selected" : ""}>1×</option>
          <option value="450"${state.speed === 450 ? " selected" : ""}>2×</option>
        </select>
      </label>
      <button class="btn" type="button" id="replay-share">${esc(t("replay.share"))}</button>
      <button class="btn" type="button" id="replay-stop">${esc(t("replay.back"))}</button>
    </div>
    <p class="note">${esc(t("replay.banner"))}</p>
    ${note ? `<p><strong>${esc(note)}</strong></p>` : ""}
    <div class="counters">
      <article class="stat"><div class="num">${flagged}/${soFar.length}</div><div class="lbl">${esc(t("replay.days"))}</div></article>
      <article class="stat"><div class="num">${esc(formatMm(cur.cum_excess_mm))} mm</div><div class="lbl">${esc(t("replay.mm"))}<br><span class="small">${esc(summary.cum_excess_definition || t("app.excessDef"))}</span></div></article>
      <article class="stat"><div class="num">≈ ${esc(formatNumber(Math.round(litres)))} L</div><div class="lbl">${esc(t("replay.litres"))}</div></article>
      ${lakes.length ? `<article class="stat"><div class="num small">${lakes.map(([name, v]) => `${esc(name)}: ≈ ${esc(formatNumber(Math.round(v.value * frac)))} L`).join("<br>")}</div><div class="lbl">${esc(t("replay.lakes"))}</div></article>` : ""}
    </div>
    <div class="chart-wrap">${et0Chart(replay.days, { dense: true, highlight: day - 1, label: t("evidence.chart") })}</div>
    ${done ? `<article class="card summary-card" id="replay-summary">
      <h3>${esc(t("replay.summaryTitle"))}</h3>
      <p><strong>${esc(replay.name)}</strong> · ${summary.days_above_p90} / ${summary.days_total}</p>
      <p>${esc(formatMm(summary.cum_excess_mm))} mm · ${esc(summary.cum_excess_definition || t("app.excessDef"))}</p>
      <p>${esc(formatNumber(summary.litres_per_acre_reference))} L/acre · ${esc(t("app.estimate"))}${formatScale(summary.litres_per_acre_reference, getLang()) ? ` · ≈ ${esc(formatScale(summary.litres_per_acre_reference, getLang()))}` : ""}</p>
      <p>${esc(t("evidence.tmax", { n: summary.tmax_days_above_p90, total: summary.days_total }))}</p>
      <p>${esc(t("replay.rank", { rank: summary.april_rank_1994_2024, years: summary.april_years_compared }))}</p>
      <p class="small">${esc(t("replay.endNote"))} ${esc(replay.caveat || t("app.caveat"))}</p>
    </article>` : ""}`;
  $("replay-play").addEventListener("click", () => play(!state.timer));
  $("replay-slider").addEventListener("input", (event) => { play(false); setReplayDay(Number(event.target.value)); });
  $("replay-speed").addEventListener("change", (event) => {
    state.speed = Number(event.target.value);
    if (state.timer) play(true);
  });
  $("replay-stop").addEventListener("click", stopReplay);
  $("replay-share").addEventListener("click", async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); } catch (e) { /* ignore */ }
    toast(t("api.copied"));
  });
}

function setReplayDay(day) {
  state.replayDay = day;
  Object.entries(state.replay).forEach(([id, replay]) => {
    const current = replay.days[day - 1];
    if (!current) return;
    const status = current.in_wave ? "ACTIVE" : current.flag ? "WATCH" : "NONE";
    const text = `${replay.name} ${current.date}: ET0 ${current.et0} mm, p90 ${current.p90} mm. ${t("replay.banner")}`;
    paint(id, status, text);
  });
  renderList();
  renderReplay();
  writeHash();
  if (day === (state.replay[state.selected] && state.replay[state.selected].days.length) && !state.timer) {
    const card = $("replay-summary");
    if (card) card.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
}

function play(on) {
  clearInterval(state.timer);
  state.timer = null;
  if (!on) {
    renderReplay();
    return;
  }
  const replay = state.replay[state.selected];
  if (replay && state.replayDay >= replay.days.length) setReplayDay(1);
  state.timer = setInterval(() => {
    const current = state.replay[state.selected];
    if (!current || state.replayDay >= current.days.length) {
      play(false);
      return;
    }
    setReplayDay(state.replayDay + 1);
  }, prefersReducedMotion() ? 1400 : state.speed);
  renderReplay();
}

async function startReplay(day) {
  $("replay-start").disabled = true;
  try {
    await Promise.all(Object.keys(state.layers).map(async (id) => {
      if (!state.replay[id]) state.replay[id] = await window.ThirstAPI.getReplay(id);
    }));
    state.replayOn = true;
    $("shell").classList.add("replay-on");
    $("live-panel").hidden = true;
    $("replay-panel").hidden = false;
    $("replay-banner").hidden = false;
    $("replay-banner").textContent = t("replay.banner");
    const startDay = day || 1;
    setReplayDay(startDay);
    const length = state.replay[state.selected].days.length;
    if (startDay < length) play(true);
    requestAnimationFrame(() => {
      if (!state.map || !Object.keys(state.layers).length) return;
      state.map.invalidateSize();
      state.map.fitBounds(window.L.featureGroup(Object.values(state.layers)).getBounds(), { padding: [12, 12] });
    });
  } catch (err) {
    showError(t("app.unavailableDetail", { message: err.message }));
  } finally {
    $("replay-start").disabled = false;
  }
}

function stopReplay() {
  clearInterval(state.timer);
  state.timer = null;
  state.replayOn = false;
  $("shell").classList.remove("replay-on");
  $("live-panel").hidden = false;
  $("replay-panel").hidden = true;
  $("replay-panel").innerHTML = "";
  $("replay-banner").hidden = true;
  Object.values(state.districts).forEach((d) => paint(d.id, d.status || "UNKNOWN"));
  renderList();
  renderActiveTab();
  writeHash();
}

function openChat(prefill) {
  state.chatOpened = true;
  $("chat").hidden = false;
  $("chat-backdrop").hidden = false;
  if (prefill) $("question").value = prefill;
  $("question").focus();
  writeHash();
}

function closeChat() {
  $("chat").hidden = true;
  $("chat-backdrop").hidden = true;
  $("open-chat").focus();
}

function addMessage(kind, html) {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  div.innerHTML = html;
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return div;
}

async function ask(question) {
  const q = (question || "").trim();
  if (!q) {
    addMessage("bot", esc(t("chat.empty")));
    return;
  }
  if (q.length > 500) {
    addMessage("bot", esc(t("chat.tooLong")));
    return;
  }
  addMessage("user", esc(q));
  const pending = addMessage("bot", `<span class="typing" aria-hidden="true"></span> ${esc(t("chat.thinking"))}`);
  pending.setAttribute("aria-busy", "true");
  $("ask-btn").disabled = true;
  try {
    const response = await window.ThirstAPI.ask(q, state.selected);
    const mode = response.mode === "llm"
      ? `<span class="badge badge-mode-llm">${esc(t("chat.modeLlm"))}</span>`
      : `<span class="badge badge-mode-template">${esc(t("chat.modeTemplate"))}</span>`;
    const tools = (response.tools_used || []).length
      ? `<span>${esc(t("chat.tools"))}: ${esc(response.tools_used.join(", "))}</span>` : "";
    pending.removeAttribute("aria-busy");
    pending.innerHTML = `<div lang="${esc(response.lang || "en")}">${esc(response.answer)}</div>
      <div class="meta">${mode}${tools}<span>${esc(response.caveat || t("app.caveat"))}</span>
      <button class="btn" type="button" data-copy>${esc(t("chat.copy"))}</button></div>`;
    pending.querySelector("[data-copy]").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(response.answer || ""); } catch (e) { /* ignore */ }
      toast(t("api.copied"));
    });
  } catch (err) {
    const aborted = err.name === "AbortError" || /abort|timeout/i.test(err.message || "");
    pending.innerHTML = `<p class="note">${esc(aborted ? t("chat.timeout") : t("chat.error", { message: err.message }))}</p>`;
  } finally {
    $("ask-btn").disabled = false;
  }
}

function renderSuggestions() {
  $("suggest").innerHTML = "";
  SUGGESTIONS.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = item.q;
    btn.addEventListener("click", () => {
      if (state.districts[item.district]) selectDistrict(item.district);
      $("question").value = item.q;
      ask(item.q);
    });
    $("suggest").appendChild(btn);
  });
}

function bindChrome() {
  bindLangToggle();
  $("district-select").addEventListener("change", (event) => selectDistrict(event.target.value));
  $("replay-start").addEventListener("click", () => startReplay(1));
  $("open-chat").addEventListener("click", () => openChat());
  $("close-chat").addEventListener("click", closeChat);
  $("chat-backdrop").addEventListener("click", closeChat);
  $("ask-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = $("question").value;
    $("question").value = "";
    ask(value);
  });
  $("open-alerts").addEventListener("click", () => {
    $("alert-dialog").hidden = false;
    $("alert-backdrop").hidden = false;
    $("alert-email").value = "";
    $("alert-result").hidden = true;
    $("alert-email").focus();
  });
  const closeAlerts = () => {
    $("alert-dialog").hidden = true;
    $("alert-backdrop").hidden = true;
    $("alert-email").value = "";
    $("open-alerts").focus();
  };
  $("close-alerts").addEventListener("click", closeAlerts);
  $("alert-backdrop").addEventListener("click", closeAlerts);
  $("alert-form").addEventListener("submit", (event) => {
    event.preventDefault();
    $("alert-email").value = "";
    const result = $("alert-result");
    result.hidden = false;
    result.textContent = t("alerts.soon");
  });
  $("sheet-toggle").addEventListener("click", () => {
    const panel = $("panel");
    const open = panel.classList.toggle("expanded");
    $("sheet-toggle").setAttribute("aria-expanded", String(open));
    $("sheet-toggle").textContent = open ? t("app.collapse") : t("app.expand");
    setTimeout(() => state.map && state.map.invalidateSize(), 220);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("chat").hidden) closeChat();
    if (!$("alert-dialog").hidden) closeAlerts();
  });
  window.addEventListener("hashchange", () => applyHash(false));
}

async function applyHash(initial) {
  const params = hashParams();
  const tab = params.get("tab");
  if (tab && TABS.includes(tab)) state.tab = tab;
  const district = params.get("d");
  if (district && state.districts[district] && (initial || district !== state.selected)) {
    await selectDistrict(district, { keepHash: true });
  }
  const replay = params.get("replay");
  if (replay) {
    const day = Math.max(1, Number(replay) || 1);
    if (!state.replayOn || state.replayDay !== day) await startReplay(day);
  } else if (state.replayOn) {
    stopReplay();
  }
  if (params.get("ask") === "1" && initial) openChat(params.get("q") || "");
  renderTabs();
  if (!state.replayOn) renderActiveTab();
}

async function boot() {
  bindChrome();
  await initI18n("meta.appTitle");
  initTheme();
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = t("meta.appDescription");
  if (window.ThirstAPI.isMock) $("mock-badge").hidden = false;
  renderLegend();
  renderSuggestions();
  onLang(() => {
    document.title = t("meta.appTitle");
    renderLegend();
    renderList();
    renderSuggestions();
    renderTabs();
    if (state.replayOn) {
      $("replay-banner").textContent = t("replay.banner");
      renderReplay();
    } else renderActiveTab();
  });
  try {
    await loadAsset("css", LEAFLET_CSS);
    await loadAsset("script", LEAFLET_JS);
  } catch (err) {
    showError(t("app.unavailableDetail", { message: err.message }));
    return;
  }
  const map = state.map = window.L.map("map", { scrollWheelZoom: true });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · DataMeet (CC BY 2.5 IN)',
  }).addTo(map);
  map.setView([12.9, 77.4], 8);
  let geo;
  try {
    const [geoRes, catalog, curves, blind] = await Promise.all([
      fetch("data/pilot_districts.geojson").then((r) => { if (!r.ok) throw new Error(`geojson ${r.status}`); return r.json(); }),
      fetch("data/catalog.json").then((r) => r.json()),
      fetch("data/climatology_curves.json").then((r) => r.json()),
      fetch("data/blindspot.json").then((r) => r.json()),
    ]);
    geo = geoRes;
    state.catalog = catalog;
    state.curves = curves;
    state.blind = blind;
  } catch (err) {
    showError(t("app.unavailableDetail", { message: err.message }));
    return;
  }
  const layer = window.L.geoJSON(geo, {
    style: () => ({ color: "#142033", weight: 1.4, fillOpacity: 0.3, fillColor: "#5c6b7a" }),
    onEachFeature: (feature, path) => {
      const id = feature.properties.id;
      state.layers[id] = path;
      path.bindTooltip(feature.properties.name, { sticky: true });
      path.on("click", () => selectDistrict(id));
    },
  }).addTo(map);
  installPatterns();
  map.fitBounds(layer.getBounds(), { padding: [16, 16] });
  map.on("zoomend moveend", installPatterns);
  (state.catalog.lakes || []).forEach((lake) => {
    const marker = window.L.circleMarker([lake.lat, lake.lon], {
      radius: 7, color: "#0c2340", weight: 2, fillColor: "#7ec8e8", fillOpacity: 0.95,
    }).addTo(map);
    marker.bindTooltip(lake.name);
    marker.bindPopup(`<strong>${esc(lake.name)}</strong><br>${esc(lake.marker_source)}<br><a href="${esc(lake.marker_url)}">${esc(lake.marker_url)}</a>`);
  });
  try {
    const data = await window.ThirstAPI.getDistricts();
    (data.districts || []).forEach((d) => {
      d.status = d.status || "UNKNOWN";
      state.districts[d.id] = d;
      paint(d.id, d.status);
    });
    if (data.caveat) $("map-caveat").textContent = data.caveat;
    if (data.mock_note) {
      $("info-banner").hidden = false;
      $("info-banner").textContent = data.mock_note;
    }
    renderList();
    const params = hashParams();
    const first = (params.get("d") && state.districts[params.get("d")] && params.get("d"))
      || Object.values(state.districts).find((d) => d.status === "ACTIVE")?.id
      || Object.keys(state.districts)[0];
    if (first) await selectDistrict(first, { keepHash: true });
    await applyHash(true);
    window.addEventListener("resize", () => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 200);
  } catch (err) {
    showError(t("app.unavailableDetail", { message: err.message }));
  }
}

boot();
