import { bindLangToggle, getLang, initI18n, initTheme, onLang, t } from "./i18n.js";
import { et0Chart } from "./charts.js";
import { esc, formatMm, formatNumber, formatScale, prefersReducedMotion } from "./format.js";

const $ = (id) => document.getElementById(id);
const QUESTIONS = [
  { district: "Mandya", q: "Will Mandya face a thirstwave this week?" },
  { district: "Mandya", q: "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?" },
  { district: "Mandya", q: "How much extra water do 2 acres of paddy in Mandya need this week?" },
];

let replays = null;
let districtsPayload = null;
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
    <article class="stat"><div class="num" id="stat-mm">0</div><div class="lbl">${esc(t("evidence.mm"))}<br><span class="small">${esc(s.cum_excess_definition)}</span></div></article>
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

function renderPilots(catalog) {
  if (!districtsPayload) return;
  const byId = Object.fromEntries(catalog.districts.map((d) => [d.id, d]));
  const cropNames = Object.fromEntries(catalog.crops.map((c) => [c.id, getLang() === "hi" ? c.name_hi : c.name]));
  $("pilot-grid").innerHTML = districtsPayload.districts.map((d) => {
    const meta = byId[d.id] || { crops: [], lakes: [] };
    const crops = meta.crops.length ? meta.crops.map((id) => cropNames[id] || id).join(", ") : t("pilots.none");
    const lakes = meta.lakes.length ? meta.lakes.join(", ") : t("pilots.none");
    const status = d.status || "UNKNOWN";
    return `<article class="card pilot-card">
      <h3>${esc(d.name)}</h3>
      <p><span class="badge badge-${esc(status).toLowerCase()}">${esc(t("status." + status))}</span></p>
      <p class="small">${esc(t("status." + status + "_long"))}</p>
      <p class="small"><strong>${esc(t("pilots.crops"))}:</strong> ${esc(crops)}</p>
      <p class="small"><strong>${esc(t("pilots.lakes"))}:</strong> ${esc(lakes)}</p>
      <p class="small">${esc(t("pilots.updated"))}: ${esc(d.updated_at || "–")}</p>
      <a class="btn" href="app.html#d=${encodeURIComponent(d.id)}">${esc(t("pilots.open"))}</a>
    </article>`;
  }).join("");
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
  bindLangToggle();
  await initI18n("meta.landingTitle");
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
  });
  try {
    const [districts, bengaluru, kolar, mandya, catalog] = await Promise.all([
      window.ThirstAPI.getDistricts(),
      window.ThirstAPI.getReplay("Bengaluru_Urban"),
      window.ThirstAPI.getReplay("Kolar"),
      window.ThirstAPI.getReplay("Mandya"),
      fetch("data/catalog.json").then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); }),
    ]);
    districtsPayload = districts;
    replays = { Bengaluru_Urban: bengaluru, Kolar: kolar, Mandya: mandya };
    window.__catalog = catalog;
    if (districts.caveat) document.querySelectorAll("[data-i18n='limits.l1']").forEach((el) => { el.textContent = districts.caveat; });
    renderEvidence();
    renderPilots(catalog);
    const snippet = {
      districts: districts.districts,
      caveat: districts.caveat,
    };
    $("json-block").textContent = JSON.stringify(snippet, null, 2);
    if (districts.mock_note) {
      const banner = $("error-banner");
      banner.className = "banner banner-info";
      banner.hidden = false;
      banner.textContent = districts.mock_note;
    }
  } catch (err) {
    showError(`${t("app.unavailable")}: ${err.message}`);
    $("evidence-stats").innerHTML = "";
    $("pilot-grid").innerHTML = "";
    $("json-block").textContent = "";
  }
}

boot();
