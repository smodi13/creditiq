/** IRR for irregular times (years). Bisection on NPV: robust for a single sign change; null if none. */
export function irr(times: number[], flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, times[i]), 0);
  let lo = -0.9999, hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface BondInputs {
  price: number; // purchase price, % of face
  face: number; // legal claim held, $M
  coupons: number[]; // cash coupon rate for year 1..N (floating coupons differ by year)
  holdYears: number; // whole years
  exitPrice: number; // % of face, used when no default
  defaultYear?: number | null; // year index (1..5) of default; coupons stop after it
  recoveryProceeds?: number; // $M received if default
  resolutionLag?: number; // whole years from default to recovery cash
  feePct?: number;
}
export interface ReturnResult {
  face: number; purchasePrice: number; cost: number; cashInterest: number; exitProceeds: number; capitalGain: number; totalProceeds: number;
  profit: number; moic: number; irr: number | null; currentYield: number; defaulted: boolean; times: number[]; flows: number[];
  coupons: number[]; principal: number[]; // per annual period t=0..6 (coupon cash and exit/recovery proceeds), used to re-time coupons
}

export const currentYield = (price: number, coupon: number) => (price === 0 ? 0 : (coupon * 100) / price);

/** Annual-period cash flows, identical timing to the Excel Returns tab: t=0 purchase, coupons at t=1.., principal at hold or default+lag. */
export function bondReturn(b: BondInputs): ReturnResult {
  const cost = (b.face * b.price) / 100 * (1 + (b.feePct ?? 0));
  const defaulted = b.defaultYear != null && b.defaultYear > 0;
  const lastC = defaulted ? b.defaultYear! : b.holdYears;
  const tp = defaulted ? b.defaultYear! + (b.resolutionLag ?? 1) : b.holdYears;
  const T = 6;
  const times: number[] = [], flows: number[] = [], coupons: number[] = [], principal: number[] = [];
  let cashInterest = 0, exitProceeds = 0;
  for (let t = 0; t <= T; t++) {
    let f = 0, cc = 0, pp = 0;
    if (t === 0) f = -cost;
    else {
      if (t <= lastC) { const c = b.face * (b.coupons[t - 1] ?? b.coupons[b.coupons.length - 1] ?? 0); cashInterest += c; f += c; cc = c; }
      if (!defaulted && t === tp) { exitProceeds = (b.face * b.exitPrice) / 100; f += exitProceeds; pp = exitProceeds; }
      if (defaulted && t === tp) { exitProceeds = b.recoveryProceeds ?? 0; f += exitProceeds; pp = exitProceeds; }
    }
    times.push(t); flows.push(f); coupons.push(cc); principal.push(pp);
  }
  const inflow = cashInterest + exitProceeds;
  const guess = inflow > 0 ? irr(times, flows) : -1;
  return { face: b.face, purchasePrice: b.price, cost, cashInterest, exitProceeds, capitalGain: exitProceeds - (b.face * b.price) / 100, totalProceeds: inflow, profit: inflow - cost, moic: inflow / cost, irr: inflow <= 0 ? -1 : guess, currentYield: currentYield(b.price, b.coupons[0] ?? 0), defaulted, times, flows, coupons, principal };
}

export function ytm(price: number, coupon: number, years: number): number | null {
  const times: number[] = [0]; const flows: number[] = [-price];
  for (let t = 1; t <= Math.floor(years + 1e-9); t++) { times.push(t); flows.push(coupon * 100); }
  const stub = years - Math.floor(years + 1e-9);
  if (stub > 1e-6) { times.push(years); flows.push(coupon * 100 * stub); }
  times.push(years); flows.push(100);
  return irr(times, flows);
}

/**
 * Contractual-timing IRR: the annual model's coupon cash is re-timed to `freq` payments per year (quarterly grid, 24 sub-periods);
 * exit / recovery proceeds stay on the annual dates. Settlement on a coupon date (no accrued interest). freq = 1 reproduces the annual IRR.
 * Mirrors the Excel Returns tab block "Contractual-timing cross-check".
 */
export function contractualFlows(r: Pick<ReturnResult, "coupons" | "principal" | "flows">, freq: number): number[] {
  const out: number[] = [r.flows[0]];
  for (let q = 1; q <= 24; q++) {
    let f = 0;
    if (q <= 20 && q % (4 / freq) === 0) f += r.coupons[Math.ceil(q / 4)] / freq;
    if (q % 4 === 0) f += r.principal[q / 4];
    out.push(f);
  }
  return out;
}
export function contractualIrr(r: Pick<ReturnResult, "coupons" | "principal" | "flows">, freq: number): number | null {
  const fl = contractualFlows(r, freq);
  if (fl.slice(1).reduce((a, b) => a + b, 0) <= 0) return -1;
  const q = irr(fl.map((_, i) => i), fl);
  return q == null ? null : Math.pow(1 + q, 4) - 1;
}
