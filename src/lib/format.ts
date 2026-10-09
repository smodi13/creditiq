export const fmtM = (v: number, d = 1): string => {
  if (!Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(Math.max(d, 1))}B` : `$${a.toFixed(d)}M`;
  return v < 0 ? `(${s})` : s;
};
export const fmtX = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "n/m" : `${v.toFixed(d)}x`;
export const fmtPct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "n/m" : `${(v * 100).toFixed(d)}%`;
export const fmtPx = (v: number | undefined) => (v == null ? "n/a" : v.toFixed(1));
export const fmtDate = (s: string) => s;
