/** Thirst percentile from per-day sorted hundredths of a millimetre. */

export function thirstPercentile(byDoy, doy, et0) {
  if (!byDoy || !doy || et0 == null || Number.isNaN(Number(et0))) return null;
  const vals = [];
  for (let k = doy - 7; k <= doy + 7; k += 1) {
    const kk = ((k - 1) % 365 + 365) % 365 + 1;
    const row = byDoy[String(kk)];
    if (row) vals.push(...row);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const q = Math.round(Number(et0) * 100);
  let lo = 0;
  let hi = vals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vals[mid] <= q) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((100 * lo) / vals.length);
}

/** Percent the value sits above its threshold. Positive means above. */
export function percentVs(value, threshold) {
  const base = Number(threshold);
  if (!Number.isFinite(base) || base === 0) return null;
  return Math.round(((Number(value) - base) / base) * 100);
}
