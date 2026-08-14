/** Schema/network strings can be unset; never show the word "undefined". */
export function displayLabel(v: unknown, fallback = ''): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!s || s === 'undefined' || s === 'null') return fallback;
  return s;
}
