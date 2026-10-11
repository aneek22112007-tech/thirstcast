import { bindLangToggle, getLang, initI18n, initTheme, onLang, t } from "./i18n.js";
import { initPwa, warmPwa } from "./pwa.js";
import { aprilChart, et0Chart, tmaxChart } from "./charts.js";
import { esc, formatMm, formatNumber, formatScale, prefersReducedMotion } from "./format.js";

const $ = (id) => document.getElementById(id);
const QUESTIONS = [
  { district: "Mandya", q: "Will Mandya face a thirstwave this week?" },
  { district: "Mandya", q: "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?" },
  { district: "Mandya", q: "How much extra water do 2 acres of paddy in Mandya need this week?" },
  { district: "Bengaluru_Urban", q: "Compare Bengaluru Urban and Kolar." },
  { district: "Bengaluru_Urban", q: "Explain ET₀ in simple Hindi." },
];

// ─── Premium UI: scroll-linked nav + reveal ──────────────────────────────────
function initScrollNav() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;
  const THRESH = 60;
  const update = () => {
    if (window.scrollY > THRESH) {
      topbar.classList.remove("topbar--transparent");
      topbar.classList.add("scrolled");
    } else {
      topbar.classList.add("topbar--transparent");
      topbar.classList.remove("scrolled");
    }
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

function initScrollReveal() {
  if (prefersReducedMotion()) {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("visible");
    });
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } }),
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
}

let replays = null;
let districtsPayload = null;
let aprilHistory = null;
let aprilDistrict = "Bengaluru_Urban";
let timeline = null;
let timelineDistrict = "all";
let timelineSeason = "all";
let evidenceDrawn = false;

function showError(message) {
  const banner = $("error-banner");
  banner.hidden = !message;
  banner.textContent = message || "";
}

function animateNumber(el, target, render) {
  if (prefersReducedMotion()) {
    el.textContent = render(target);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / 700);
    el.textContent = render(target * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = render(target);
  };
  requestAnimationFrame(tick);
}

function renderEvidence() {
  if (!replays) return;
  const lang = getLang();
  const b = replays.Bengaluru_Urban;
  const s = b.summary;
  const litres = s.litres_per_acre_reference;
  const scale = formatScale(litres, lang);
  const box = $("evidence-stats");
  box.innerHTML = `
    <article class="stat"><div class="num" id="stat-days">0</div><div class="lbl">${esc(t("evidence.days"))}</div></article>
    <article class="stat"><div class="num" id="stat-mm">0</div><div class="lbl">${esc(t("evidence.mm"))}<br><span class="small">${esc(t("app.excessDef"))}</span></div></article>
    <article class="stat"><div class="num" id="stat-l">0</div><div class="lbl">${esc(t("evidence.litres"))}${scale ? `<br><span class="small">≈ ${esc(scale)}</span>` : ""}</div></article>
    <article class="stat"><div class="num" id="stat-rank">0</div><div class="lbl">${esc(t("evidence.rank"))}</div></article>`;
  const paint = evidenceDrawn || prefersReducedMotion()
    ? (el, target, render) => { el.textContent = render(target); }
    : animateNumber;
  paint($("stat-days"), s.days_above_p90, (n) => `${Math.round(n)} ${t("evidence.of")} ${s.days_total}`);
  paint($("stat-mm"), s.cum_excess_mm, (n) => formatMm(n));
  paint($("stat-l"), litres, (n) => formatNumber(Math.round(n)));
  paint($("stat-rank"), s.april_rank_1994_2024, (n) => `${Math.round(n)} / ${s.april_years_compared}`);
  evidenceDrawn = true;
  $("evidence-chart").innerHTML = et0Chart(b.days, { dense: true, label: t("evidence.chart") });
  $("evidence-chart").setAttribute("aria-busy", "false");
  $("evidence-tmax").textContent = t("evidence.tmax", { n: s.tmax_days_above_p90, total: s.days_total });
  const rows = ["Bengaluru_Urban", "Kolar", "Mandya"].map((id) => {
    const r = replays[id];
    const sum = r.summary;
    const per = sum.litres_per_acre_reference;
    return `<tr><th scope="row">${esc(r.name)}</th><td>${sum.days_above_p90}/${sum.days_total}</td><td>${esc(formatMm(sum.cum_excess_mm))} mm</td><td>${esc(formatNumber(per))} L</td><td>${sum.tmax_days_above_p90}/${sum.days_total}</td><td>${sum.april_rank_1994_2024}/${sum.april_years_compared}</td></tr>`;
  }).join("");
  $("evidence-compare").innerHTML = `<div class="table-scroll"><table class="compare"><thead><tr><th scope="col">${esc(t("app.district"))}</th><th scope="col">ET₀ &gt; p90</th><th scope="col">${esc(t("evidence.mm"))}</th><th scope="col">L/acre</th><th scope="col">Tmax &gt; p90</th><th scope="col">${esc(t("evidence.rank"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const PILOT_META = {
  Bengaluru_Urban: {
    imgClass: "pilot-card-img-bengaluru",
    imgLabel: "URBAN LAKES",
    context: "Lakes, urban surface-water, and the KRS impact zone.",
  },
  Kolar: {
    imgClass: "pilot-card-img-kolar",
    imgLabel: "DRYLAND AGRICULTURE",
    context: "Rain-fed and irrigated agriculture, groundwater stress.",
  },
  Mandya: {
    imgClass: "pilot-card-img-mandya",
    imgLabel: "KRS RESERVOIR",
    context: "Paddy crops, KRS reservoir surface-water evaporation.",
  },
};

function renderPilots(catalog) {
  if (!districtsPayload) return;
  const byId = Object.fromEntries(catalog.districts.map((d) => [d.id, d]));
  const label = (group, id) => {
    const key = `${group}.${id}`;
    const text = t(key);
    return text === key ? id : text;
  };
  $("pilot-grid").innerHTML = districtsPayload.districts.map((d) => {
    const meta = byId[d.id] || { crops: [], lakes: [] };
    const pmeta = PILOT_META[d.id] || { imgClass: "pilot-card-img-bengaluru", imgLabel: d.id, context: "" };
    const crops = meta.crops.length ? meta.crops.map((id) => label("crops", id)).join(", ") : t("pilots.none");
    const lakes = meta.lakes.length ? meta.lakes.map((id) => label("lakes", id)).join(", ") : t("pilots.none");
    const status = d.status || "UNKNOWN";
    return `<article class="pilot-card">
      <div class="${esc(pmeta.imgClass)}">${esc(pmeta.imgLabel)}</div>
      <div class="pilot-card-body">
        <h3>${esc(d.name)}</h3>
        <p><span class="badge badge-${esc(status).toLowerCase()}">${esc(t("status." + status))}</span></p>
        <p>${esc(pmeta.context)}</p>
        <p class="small muted"><strong>${esc(t("pilots.crops"))}:</strong> ${esc(crops)}</p>
        <p class="small muted"><strong>${esc(t("pilots.lakes"))}:</strong> ${esc(lakes)}</p>
        <div class="pilot-action"><a class="btn btn-outline" href="app.html#d=${encodeURIComponent(d.id)}">${esc(t("pilots.open"))} →</a></div>
      </div>
    </article>`;
  }).join("");
}

function paintMockBanner() {
  if (!districtsPayload || !districtsPayload.mock_note) return;
  const date = String((districtsPayload.districts && districtsPayload.districts[0] && districtsPayload.districts[0].updated_at) || "").slice(0, 10);
  const banner = $("error-banner");
  banner.className = "banner banner-info";
  banner.hidden = false;
  banner.textContent = t("app.mockNote", { date });
}

function districtLabel(id) {
  const row = districtsPayload && (districtsPayload.districts || []).find((d) => d.id === id);
  return row ? row.name : id;
}

function renderTimeline() {
  if (!timeline || !$("timeline-list")) return;
  const hero = (timeline.events || []).find((event) => event.district === timeline.hero.district && event.start === timeline.hero.start);
  if (hero) {
    $("timeline-hero").textContent = t("timeline.hero", {
      district: districtLabel(hero.district),
      start: hero.start,
      end: hero.end,
      days: hero.days,
      excess: formatNumber(hero.excess_mm, 2),
      tmax: formatNumber(hero.max_tmax_c, 1),
    });
  }
  const filters = $("timeline-filters");
  filters.replaceChildren();
  const add = (group, value, label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = label;
    const on = (group === "district" ? timelineDistrict : timelineSeason) === value;
    btn.setAttribute("aria-pressed", String(on));
    btn.addEventListener("click", () => {
      if (group === "district") timelineDistrict = value;
      else timelineSeason = value;
      renderTimeline();
    });
    filters.appendChild(btn);
  };
  add("district", "all", t("timeline.allDistricts"));
  [...new Set((timeline.events || []).map((event) => event.district))].forEach((id) => add("district", id, districtLabel(id)));
  add("season", "all", t("timeline.allSeasons"));
  (timeline.seasons || []).forEach((season) => add("season", season, t(`timeline.season.${season}`)));
  const rows = (timeline.events || []).filter((event) => (
    (timelineDistrict === "all" || event.district === timelineDistrict)
    && (timelineSeason === "all" || event.season === timelineSeason)
  ));
  $("timeline-count").textContent = t("timeline.shown", { n: rows.length, total: timeline.count });
  const list = $("timeline-list");
  list.replaceChildren();
  rows.forEach((event) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = `${event.start} · ${districtLabel(event.district)} · ${event.days}`;
    btn.addEventListener("click", () => {
      $("timeline-detail").innerHTML = `
        <h3>${esc(event.start)} – ${esc(event.end)} · ${esc(districtLabel(event.district))}</h3>
        <div class="chart-wrap">${et0Chart(event.daily, { label: t("timeline.et0"), height: 200 })}</div>
        <div class="chart-wrap">${tmaxChart(event.daily, { label: t("timeline.tmax"), height: 180 })}</div>`;
    });
    list.appendChild(btn);
  });
}

function renderApril() {
  if (!aprilHistory || !$("april-chart")) return;
  const switcher = $("april-switch");
  switcher.replaceChildren();
  Object.entries(aprilHistory.districts).forEach(([id, district]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = district.name;
    btn.setAttribute("aria-pressed", String(id === aprilDistrict));
    btn.addEventListener("click", () => {
      aprilDistrict = id;
      renderApril();
    });
    switcher.appendChild(btn);
  });
  const district = aprilHistory.districts[aprilDistrict];
  $("april-chart").innerHTML = aprilChart(district.series, t("april.title"), district.highlight);
}

function renderTry() {
  const lang = getLang();
  $("try-chips").innerHTML = QUESTIONS.map((item) => {
    const href = `app.html#d=${encodeURIComponent(item.district)}&ask=1&lang=${lang}&q=${encodeURIComponent(item.q)}`;
    return `<a class="chip" href="${href}">${esc(item.q)}</a>`;
  }).join("");
  const replay = $("replay-link");
  if (replay) replay.href = `app.html#d=Bengaluru_Urban&replay=1&lang=${lang}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const toast = $("toast");
  toast.hidden = false;
  toast.textContent = t("api.copied");
  setTimeout(() => { toast.hidden = true; }, 1600);
}

async function boot() {
  initPwa();
  bindLangToggle();
  initScrollNav();
  await initI18n("meta.landingTitle");
  initScrollReveal();
  initTheme();
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", t("meta.landingDescription"));
  if (window.ThirstAPI && window.ThirstAPI.isMock) $("mock-badge").hidden = false;
  renderTry();
  $("copy-curl").addEventListener("click", () => copyText($("curl-block").textContent));
  $("copy-json").addEventListener("click", () => copyText($("json-block").textContent));
  onLang(() => {
    document.title = t("meta.landingTitle");
    if (replays) renderEvidence();
    renderTry();
    if (window.__catalog && districtsPayload) renderPilots(window.__catalog);
    renderApril();
    renderTimeline();
    paintMockBanner();
  });
  try {
    const [districts, bengaluru, kolar, mandya, catalog, april, story] = await Promise.all([
      window.ThirstAPI.getDistricts(),
      window.ThirstAPI.getReplay("Bengaluru_Urban"),
      window.ThirstAPI.getReplay("Kolar"),
      window.ThirstAPI.getReplay("Mandya"),
      fetch("data/catalog.json").then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); }),
      fetch("data/april_history.json").then((r) => { if (!r.ok) throw new Error(`april ${r.status}`); return r.json(); }),
      fetch("data/blindspot_timeline.json").then((r) => { if (!r.ok) throw new Error(`timeline ${r.status}`); return r.json(); }),
    ]);
    districtsPayload = districts;
    replays = { Bengaluru_Urban: bengaluru, Kolar: kolar, Mandya: mandya };
    window.__catalog = catalog;
    aprilHistory = april;
    timeline = story;
    renderApril();
    renderTimeline();
    renderEvidence();
    renderPilots(catalog);
    const snippet = {
      districts: districts.districts,
      caveat: districts.caveat,
    };
    $("json-block").textContent = JSON.stringify(snippet, null, 2);
    paintMockBanner();
    warmPwa();
  } catch (err) {
    showError(`${t("app.unavailable")}: ${err.message}`);
    warmPwa();
    $("evidence-stats").innerHTML = "";
    $("pilot-grid").innerHTML = "";
    $("json-block").textContent = "";
  }
}

boot();
