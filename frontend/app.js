/* ThirstCast dashboard: map, detail panel, April 2024 replay, chat. Plain JS, no build step. */
(function () {
  "use strict";
  const API = window.ThirstAPI;
  const CAVEAT = "District-centroid estimate (~10 km grid)";
  const COLORS = { ACTIVE: "#c0392b", WATCH: "#e69f00", NONE: "#2e8b57", UNKNOWN: "#8a8a8a" };
  const STATUS_TEXT = {
    ACTIVE: "Thirstwave active", WATCH: "Watch: high-demand day(s) ahead", NONE: "No thirstwave signal", UNKNOWN: "No data",
  };
  const TRY_IT = [
    "Will Mandya face a thirstwave this week?",
    "क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?",
    "How much extra water do 2 acres of paddy in Mandya need this week?",
    "Is Kolar just hot this week, or also thirsty?",
    "कोलार में 1 एकड़ टमाटर को इस हफ्ते कितना अतिरिक्त पानी चाहिए?",
    "How much extra water will Bengaluru's lakes lose this week?",
  ];
  const state = { districts: {}, layers: {}, selected: null, replay: {}, replayTimer: null, replayDay: 1, replayOn: false };
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n === null || n === undefined || isNaN(n)) ? "-" : Math.round(n).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const niceName = (id) => (state.districts[id] && state.districts[id].name) || id.replace(/_/g, " ");

  function showError(msg) {
    const b = $("error-banner");
    b.textContent = msg;
    b.hidden = !msg;
  }

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Boundaries: DataMeet (CC BY 2.5 IN)',
  }).addTo(map);
  map.setView([12.9, 77.5], 8);

  function styleFor(status) {
    return { color: "#333", weight: 1.5, fillColor: COLORS[status] || COLORS.UNKNOWN, fillOpacity: 0.55 };
  }

  function colourDistrict(id, status, tooltip) {
    const layer = state.layers[id];
    if (!layer) return;
    layer.setStyle(styleFor(status));
    layer.setTooltipContent(tooltip || `${niceName(id)}: ${status} (${STATUS_TEXT[status] || ""})`);
  }

  async function loadGeo() {
    const res = await fetch("data/pilot_districts.geojson");
    const geo = await res.json();
    const gl = L.geoJSON(geo, {
      style: () => styleFor("UNKNOWN"),
      onEachFeature: (f, layer) => {
        state.layers[f.properties.id] = layer;
        layer.bindTooltip(f.properties.name, { sticky: true });
        layer.on("click", () => selectDistrict(f.properties.id));
      },
    }).addTo(map);
    map.invalidateSize();
    map.fitBounds(gl.getBounds(), { padding: [10, 10] });
    window.addEventListener("resize", () => map.invalidateSize());
  }

  function renderList() {
    const box = $("district-list");
    box.innerHTML = "";
    Object.values(state.districts).forEach((d) => {
      const b = document.createElement("button");
      b.className = "district-btn";
      b.setAttribute("aria-pressed", String(state.selected === d.id));
      b.innerHTML = `<span>${esc(d.name)}</span><span class="badge ${esc(d.status)}">${esc(d.status)}</span>`;
      b.addEventListener("click", () => selectDistrict(d.id));
      box.appendChild(b);
    });
  }

  async function loadDistricts() {
    const data = await API.getDistricts();
    (data.districts || []).forEach((d) => {
      d.status = d.status || "UNKNOWN";
      state.districts[d.id] = d;
      colourDistrict(d.id, d.status);
    });
    if (data.caveat) $("map-caveat").textContent = data.caveat;
    renderList();
  }

  // ---------- chart (inline SVG) ----------
  function barChart(days, opts) {
    opts = opts || {};
    const W = 560, H = 220, pad = { l: 34, r: 8, t: 12, b: opts.dense ? 30 : 42 };
    const vals = days.flatMap((d) => [d.et0 || 0, d.p90 || 0]);
    const ymax = Math.ceil(Math.max(1, ...vals) + 0.5);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const bw = iw / days.length;
    const y = (v) => pad.t + ih - (v / ymax) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "ET0 versus p90 threshold")}">`;
    for (let g = 0; g <= ymax; g += Math.max(1, Math.round(ymax / 4))) {
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(g)}" y2="${y(g)}" stroke="#eee"/><text x="${pad.l - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
    }
    days.forEach((d, i) => {
      const x = pad.l + i * bw + bw * 0.15;
      const h = Math.max(0, (d.et0 || 0) / ymax * ih);
      const hl = opts.highlight === i ? ' stroke="#000" stroke-width="2"' : "";
      s += `<rect class="bar${d.flag ? " flag" : ""}" x="${x}" y="${pad.t + ih - h}" width="${bw * 0.7}" height="${h}"${hl}><title>${esc(d.date)}: ET0 ${d.et0} mm, p90 ${d.p90} mm${d.flag ? " (above p90)" : ""}</title></rect>`;
      const step = opts.dense ? 5 : 1;
      if (i % step === 0 || i === days.length - 1) {
        const lbl = opts.dense ? String(+d.date.slice(8)) : new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
        s += `<text x="${x + bw * 0.35}" y="${H - pad.b + 16}" text-anchor="middle">${esc(lbl)}</text>`;
      }
    });
    const pts = days.map((d, i) => `${pad.l + i * bw + bw / 2},${y(d.p90 || 0)}`).join(" ");
    s += `<polyline class="p90" points="${pts}"/>`;
    s += `<text x="${pad.l}" y="${H - 4}">Bars: ET0 mm/day (red = above p90) · dashed line: day-of-year p90</text></svg>`;
    return s;
  }

  // ---------- detail panel ----------
  async function selectDistrict(id) {
    state.selected = id;
    renderList();
    const box = $("detail");
    box.innerHTML = `<p><span class="spinner"></span> Loading ${esc(niceName(id))}…</p>`;
    try {
      const t = await API.getThirstwave(id);
      renderDetail(t);
    } catch (e) {
      box.innerHTML = `<div class="note">API unavailable for ${esc(niceName(id))} (${esc(e.message)}). Try again.</div>`;
    }
  }

  function litresRows(obj, unit) {
    const rows = Object.entries(obj || {});
    if (!rows.length) return "";
    return rows.map(([k, v]) => {
      if (Array.isArray(v)) return `<li><b>${esc(k)}</b>: ≈ ${fmt(v[0])}–${fmt(v[1])} ${unit} (estimate)</li>`;
      if (v && v.value !== null && v.value !== undefined) return `<li><b>${esc(k)}</b>: ≈ ${fmt(v.value)} L (${esc(v.label || "estimate")}, upper bound)</li>`;
      return `<li><b>${esc(k)}</b>: not shown (${esc((v && v.note) || "area unverified")})</li>`;
    }).join("");
  }

  function renderDetail(t) {
    const st = t.status || "UNKNOWN";
    const fc = t.forecast || [];
    let h = `<h3>${esc(niceName(t.district))} <span class="badge ${esc(st)}">${esc(st)}</span></h3>`;
    h += `<p><b>${esc(STATUS_TEXT[st] || st)}</b>${st === "ACTIVE" ? ` · day ${esc(t.day_in_wave)} of the thirstwave` : ""}</p>`;
    if (t.mock_note) h += `<div class="note">${esc(t.mock_note)}</div>`;
    if (t.note) h += `<div class="note info">${esc(t.note)}</div>`;
    if (t.forecast_wave) {
      const w = t.forecast_wave;
      h += `<div class="note">${w.ongoing ? "Ongoing" : "Forecast"} thirstwave: ${esc(w.start)} to ${esc(w.end)} (${esc(w.days)} days${w.extends_past_forecast ? ", may continue past the forecast" : ""}).</div>`;
    }
    if (fc.length) h += `<div class="chart">${barChart(fc, { label: "7-day ET0 forecast vs p90" })}</div>`;
    h += `<dl class="kv">
      <dt>Excess next 7 days</dt><dd><b>${t.excess_mm_7d !== undefined ? (+t.excess_mm_7d).toFixed(1) : "-"} mm</b><br><small>Sum of daily bias-adjusted ET0 above the local day-of-year p90 threshold</small></dd>`;
    const crops = litresRows(t.extra_litres_per_acre, "L/acre");
    if (crops) h += `<dt>Extra crop water</dt><dd><ul>${crops}</ul></dd>`;
    const lakes = litresRows(t.extra_litres_lakes, "L");
    if (lakes) h += `<dt>Extra lake loss</dt><dd><ul>${lakes}</ul></dd>`;
    if (t.bias_offset_mm !== undefined) h += `<dt>Bias offset</dt><dd>${(+t.bias_offset_mm).toFixed(2)} mm/day subtracted</dd>`;
    h += `<dt>Updated</dt><dd>${esc(t.updated_at ? new Date(t.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "-")}</dd></dl>`;
    if (t.bias_note) h += `<div class="note">${esc(t.bias_note)}</div>`;
    h += `<p class="muted small">${esc(t.caveat || CAVEAT)}. Litres are estimates (crop Kc ±10%).</p>`;
    $("detail").innerHTML = h;
  }

  // ---------- replay ----------
  async function startReplay() {
    const btn = $("replay-start");
    btn.disabled = true;
    try {
      const ids = Object.keys(state.layers);
      await Promise.all(ids.map(async (id) => { if (!state.replay[id]) state.replay[id] = await API.getReplay(id); }));
      state.replayOn = true;
      $("replay-ui").hidden = false;
      $("replay-banner").hidden = false;
      setReplayDay(1);
      play(true);
      $("map-section").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      showError(`API unavailable: could not load the April 2024 replay (${e.message}).`);
    } finally {
      btn.disabled = false;
    }
  }

  function play(on) {
    clearInterval(state.replayTimer);
    state.replayTimer = null;
    $("replay-play").textContent = on ? "⏸" : "▶";
    $("replay-play").setAttribute("aria-label", on ? "Pause" : "Play");
    if (!on) return;
    state.replayTimer = setInterval(() => {
      if (state.replayDay >= 30) { play(false); return; }
      setReplayDay(state.replayDay + 1);
    }, 1000);
  }

  function setReplayDay(day) {
    state.replayDay = day;
    $("replay-slider").value = day;
    Object.entries(state.replay).forEach(([id, r]) => {
      const d = r.days[day - 1];
      if (!d) return;
      const st = d.in_wave ? "ACTIVE" : d.flag ? "WATCH" : "NONE";
      colourDistrict(id, st, `${niceName(id)} ${d.date}: ET0 ${d.et0} mm vs p90 ${d.p90} mm${d.in_wave ? " (thirstwave)" : d.flag ? " (above p90)" : ""}`);
    });
    const sel = $("replay-district").value;
    const r = state.replay[sel];
    if (!r) return;
    const days = r.days.slice(0, day);
    const cur = days[days.length - 1];
    const s = r.summary || {};
    const frac = s.cum_excess_mm ? cur.cum_excess_mm / s.cum_excess_mm : 0;
    $("replay-date").textContent = new Date(cur.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    $("c-days").textContent = days.filter((d) => d.flag).length;
    $("c-total").textContent = days.length;
    $("c-mm").textContent = `+${cur.cum_excess_mm.toFixed(1)} mm`;
    $("c-litres").textContent = `≈ ${fmt((s.litres_per_acre_reference || 0) * frac)} L`;
    const lakes = Object.entries(s.lakes || {}).filter(([, v]) => v && v.value);
    $("c-lakes-wrap").hidden = !lakes.length;
    $("c-lakes").innerHTML = lakes.map(([k, v]) => `${esc(k)}: ≈ ${fmt(v.value * frac)} L`).join("<br>");
    $("replay-chart").innerHTML = barChart(r.days, { dense: true, highlight: day - 1, label: "April 2024 ET0 vs p90" });
    $("replay-foot").textContent = `${r.name || sel}, April 2024 final: ${s.days_above_p90} of ${s.days_total} days above p90, ` +
      `+${(s.cum_excess_mm || 0).toFixed(1)} mm cumulative excess, Tmax above its p90 on ${s.tmax_days_above_p90} days` +
      (s.april_rank_1994_2024 === 1 ? ", worst April since 1994" : "") + `. ${r.caveat || CAVEAT}. Litres are estimates.`;
  }

  function stopReplay() {
    play(false);
    state.replayOn = false;
    $("replay-ui").hidden = true;
    $("replay-banner").hidden = true;
    Object.values(state.districts).forEach((d) => colourDistrict(d.id, d.status));
  }

  // ---------- chat ----------
  function addMsg(cls, html) {
    const div = document.createElement("div");
    div.className = `msg ${cls}`;
    div.innerHTML = html;
    $("messages").appendChild(div);
    $("messages").scrollTop = $("messages").scrollHeight;
    return div;
  }

  async function ask(q) {
    q = (q || "").trim();
    if (!q) return;
    if (q.length > 500) { addMsg("bot", "Please keep questions under 500 characters."); return; }
    addMsg("user", esc(q));
    const pending = addMsg("bot", `<span class="spinner"></span> Thinking… (can take up to ~25 s)`);
    $("ask-btn").disabled = true;
    try {
      const r = await API.ask(q, null);
      const mode = r.mode === "llm" ? `<span class="mode llm">AI agent</span>` : `<span class="mode template">Template advisory (non-LLM mode)</span>`;
      const tools = (r.tools_used || []).length ? `<span>tools: ${esc(r.tools_used.join(", "))}</span>` : "";
      pending.innerHTML = `<div lang="${esc(r.lang || "en")}">${esc(r.answer)}</div><div class="meta">${mode}${tools}<span>${esc(r.caveat || CAVEAT)}</span></div>`;
    } catch (e) {
      pending.innerHTML = `<div class="note">API unavailable (${esc(e.message)}). Please try again.</div>`;
    } finally {
      $("ask-btn").disabled = false;
    }
  }

  function initChat() {
    const chips = $("chips");
    TRY_IT.forEach((q) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = q;
      b.addEventListener("click", () => { $("question").value = q; ask(q); });
      chips.appendChild(b);
    });
    $("ask-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("question").value; $("question").value = ""; ask(q); });
  }

  // ---------- boot ----------
  async function boot() {
    $("mock-badge").hidden = !API.isMock;
    initChat();
    $("replay-start").addEventListener("click", startReplay);
    $("replay-play").addEventListener("click", () => play(!state.replayTimer));
    $("replay-stop").addEventListener("click", stopReplay);
    $("replay-slider").addEventListener("input", (e) => { play(false); setReplayDay(+e.target.value); });
    $("replay-district").addEventListener("change", () => setReplayDay(state.replayDay));
    try {
      await loadGeo();
    } catch (e) {
      showError("Could not load district boundaries.");
      return;
    }
    try {
      await loadDistricts();
      const first = Object.values(state.districts).find((d) => d.status === "ACTIVE") || Object.values(state.districts)[0];
      if (first) selectDistrict(first.id);
    } catch (e) {
      showError(`API unavailable: ${e.message}. The map cannot show live status right now; please try again.`);
    }
  }
  boot();
})();
