/** Number and date formatting. Indian grouping in every language. */

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Python-style round half to even, so 12.25 mm displays as 12.2, matching docs/numbers.md. */
export function roundHalfEven(value, digits) {
  const sign = value < 0 ? -1 : 1;
  const p = 10 ** digits;
  const n = Math.abs(value) * p;
  const floor = Math.floor(n + 1e-8);
  const frac = n - floor;
  let rounded;
  if (Math.abs(frac - 0.5) < 1e-6) rounded = floor % 2 === 0 ? floor : floor + 1;
  else rounded = Math.round(n);
  return (sign * rounded) / p;
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "–";
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatMm(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "–";
  const n = roundHalfEven(Number(value), 1);
  const text = n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (n > 0 ? "+" : "") + text;
}

export function scaleUnit(lang) {
  return lang === "hi"
    ? { crore: "करोड़", lakh: "लाख" }
    : { crore: "crore", lakh: "lakh" };
}

/** Indian scale words for a litre count. Returns null under 1 lakh. */
export function formatScale(value, lang) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  const abs = Math.abs(n);
  const unit = scaleUnit(lang);
  if (abs >= 1e7) return `${formatNumber(n / 1e7, 2)} ${unit.crore}`;
  if (abs >= 1e5) return `${formatNumber(n / 1e5, 2)} ${unit.lakh}`;
  return null;
}

export function formatDate(iso, lang) {
  if (!iso) return "–";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Non-leap day of year. 29 February folds into doy 59, matching the climatology. */
export function dayOfYear(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (m === 2 && d === 29) return 59;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  let n = Math.round((cur - start) / 86400000) + 1;
  if (leap && n > 60) n -= 1;
  return n;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
