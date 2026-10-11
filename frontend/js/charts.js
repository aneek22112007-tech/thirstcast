/** Inline SVG charts. Flagged days use a hatch, not colour alone. */
import { esc, formatNumber } from "./format.js";

const HATCH = `
  <defs>
    <pattern id="hatch-et0" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--chart-et0)"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-et0-line)" stroke-width="2"/>
    </pattern>
    <pattern id="hatch-tmax" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--chart-tmax)"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-tmax-line)" stroke-width="2"/>
    </pattern>
  </defs>`;

function axis(y, ymax, pad, width) {
  let s = "";
  const step = Math.max(1, Math.round(ymax / 4));
  for (let g = 0; g <= ymax; g += step) {
    s += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(g)}" y2="${y(g)}" stroke="var(--chart-grid)" stroke-width="1"/>`;
    s += `<text x="${pad.l - 6}" y="${y(g) + 4}" text-anchor="end" fill="var(--chart-ink)">${g}</text>`;
  }
  return s;
}

function barChart(days, opts) {
  const width = 640;
  const height = opts.height || 240;
  const pad = { l: 42, r: 12, t: 18, b: opts.dense ? 32 : 40 };
  const valueOf = opts.valueOf;
  const thresholdOf = opts.thresholdOf;
  const flagOf = opts.flagOf;
  const vals = days.flatMap((d) => [valueOf(d) || 0, thresholdOf(d) || 0]);
  const ymax = Math.max(1, Math.ceil(Math.max(...vals, 1) + 0.4));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const bw = innerW / Math.max(days.length, 1);
  const y = (v) => pad.t + innerH - (v / ymax) * innerH;
  let s = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.label)}" style="color:var(--chart-ink)">${HATCH}`;
  s += axis(y, ymax, pad, width);
  days.forEach((d, i) => {
    const x = pad.l + i * bw + bw * 0.16;
    const v = valueOf(d) || 0;
    const h = Math.max(0, (v / ymax) * innerH);
    const flagged = !!flagOf(d);
    const fill = flagged ? opts.hatch : opts.plain;
    const hi = opts.highlight === i ? ' stroke="var(--chart-mark)" stroke-width="2"' : "";
    const title = `${d.date}: ${opts.seriesName} ${formatNumber(v, 2)}, p90 ${formatNumber(thresholdOf(d), 2)}${flagged ? ", above p90" : ""}`;
    s += `<rect x="${x}" y="${pad.t + innerH - h}" width="${bw * 0.68}" height="${h}" fill="${fill}" rx="2"${hi}><title>${esc(title)}</title></rect>`;
    const step = opts.dense ? 5 : 1;
    if (i % step === 0 || i === days.length - 1) {
      const label = opts.dense ? String(Number(String(d.date).slice(8))) : shortDay(d.date);
      s += `<text x="${x + bw * 0.34}" y="${height - 8}" text-anchor="middle" fill="var(--chart-ink)">${esc(label)}</text>`;
    }
  });
  const pts = days.map((d, i) => `${pad.l + i * bw + bw / 2},${y(thresholdOf(d) || 0)}`).join(" ");
  s += `<polyline points="${pts}" fill="none" stroke="var(--chart-ink)" stroke-width="2" stroke-dasharray="5 3"/>`;
  s += `</svg>`;
  return s;
}

function shortDay(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function et0Chart(days, opts = {}) {
  if (!days || !days.length) return "";
  return barChart(days, {
    label: opts.label || "ET0 versus the day-of-year p90",
    valueOf: (d) => d.et0,
    thresholdOf: (d) => d.p90,
    flagOf: (d) => d.flag,
    seriesName: "ET0",
    hatch: "url(#hatch-et0)",
    plain: "var(--chart-plain)",
    dense: opts.dense,
    highlight: opts.highlight,
    height: opts.height,
  });
}

export function tmaxChart(days, opts = {}) {
  if (!days || !days.length) return "";
  return barChart(days, {
    label: opts.label || "Maximum temperature versus its day-of-year p90",
    valueOf: (d) => d.tmax,
    thresholdOf: (d) => d.tmax_p90,
    flagOf: (d) => d.tmax_flag,
    seriesName: "Tmax",
    hatch: "url(#hatch-tmax)",
    plain: "var(--chart-tmax-plain)",
    dense: opts.dense,
    highlight: opts.highlight,
    height: opts.height || 200,
  });
}

export function climateChart(series, markDoy, label) {
  const p90 = series.et0_p90;
  const mean = series.et0_mean;
  const width = 720;
  const height = 280;
  const pad = { l: 42, r: 12, t: 16, b: 36 };
  const ymax = Math.ceil(Math.max(...p90, ...mean) + 0.6);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i) => pad.l + (i / 364) * innerW;
  const y = (v) => pad.t + innerH - (v / ymax) * innerH;
  const line = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const months = [
    [0, "Jan"], [31, "Feb"], [59, "Mar"], [90, "Apr"], [120, "May"], [151, "Jun"],
    [181, "Jul"], [212, "Aug"], [243, "Sep"], [273, "Oct"], [304, "Nov"], [334, "Dec"],
  ];
  let s = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" style="color:var(--chart-ink)">`;
  s += axis(y, ymax, pad, width);
  months.forEach(([i, name]) => {
    s += `<text x="${x(i)}" y="${height - 8}" fill="var(--chart-ink)">${name}</text>`;
  });
  s += `<polyline points="${line(mean)}" fill="none" stroke="var(--chart-mean)" stroke-width="2"/>`;
  s += `<polyline points="${line(p90)}" fill="none" stroke="var(--chart-p90)" stroke-width="2" stroke-dasharray="5 3"/>`;
  if (markDoy >= 1 && markDoy <= 365) {
    const mx = x(markDoy - 1);
    s += `<line x1="${mx}" x2="${mx}" y1="${pad.t}" y2="${pad.t + innerH}" stroke="var(--chart-mark)" stroke-width="2"/>`;
    s += `<circle cx="${mx}" cy="${y(p90[markDoy - 1])}" r="4" fill="var(--chart-mark)"/>`;
  }
  s += `</svg>`;
  return s;
}

/** One bar per April. `highlightYear` is drawn in the mark colour. Each bar is focusable. */
export function aprilChart(series, label, highlightYear) {
  const width = 640;
  const height = 220;
  const pad = { l: 36, r: 8, t: 12, b: 28 };
  const ymax = Math.max(1, Math.ceil(Math.max(...series.map((row) => Number(row.cum_excess_mm) || 0), 1)));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const bw = innerW / Math.max(series.length, 1);
  const y = (v) => pad.t + innerH - (v / ymax) * innerH;
  let s = `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(label)}" style="color:var(--chart-ink)">`;
  s += axis(y, ymax, pad, width);
  series.forEach((row, i) => {
    const value = Number(row.cum_excess_mm) || 0;
    const h = Math.max(0, (value / ymax) * innerH);
    const x = pad.l + i * bw + bw * 0.18;
    const marked = row.year === highlightYear;
    const tip = `${row.year}: rank ${row.rank} of ${series.length}, ${row.days_above_p90} days above p90, ${value} mm cumulative excess`;
    s += `<g tabindex="0" data-year="${row.year}" role="img" aria-label="${esc(tip)}">`;
    s += `<rect x="${x}" y="${y(value)}" width="${(bw * 0.64).toFixed(2)}" height="${h.toFixed(2)}" fill="${marked ? "var(--chart-mark)" : "var(--chart-plain)"}" rx="1"><title>${esc(tip)}</title></rect>`;
    s += `</g>`;
  });
  if (series.length) {
    s += `<text x="${pad.l}" y="${height - 6}" fill="var(--chart-ink)">${series[0].year}</text>`;
    s += `<text x="${width - pad.r}" y="${height - 6}" text-anchor="end" fill="var(--chart-ink)">${series[series.length - 1].year}</text>`;
  }
  s += `</svg>`;
  return s;
}

export function dataTable(days, columns) {
  const head = columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join("");
  const body = days.map((d) => {
    const cells = columns.map((c) => `<td>${esc(c.value(d))}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
