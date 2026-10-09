import type { Company } from "./types";

/**
 * Collateral-coverage stress for a specifically secured target tranche (collateralPct > 0), e.g. the hypothetical BDN term loan.
 * Recovery from the pledged pool = MIN(1, pool% × asset value × (1 − realization cost) × (1 − admin costs) ÷ claim).
 * Basis: asset-based (liquidation-style) value only — ignores going-concern value, balance-sheet cash and any deficiency recovery from the general pool,
 * so it is the floor the secured claim has on its own pledged pool. Claim = principal at close (no amortization or accrued interest).
 * Mirrors the Excel "Collateral coverage stress" block on the Sensitivities tab.
 */
export const COLL_AXES = {
  cap: [0.065, 0.075, 0.09, 0.105, 0.12, 0.14], noi: [0, -0.1, -0.2, -0.3, -0.4, -0.5],
  pool: [0.1, 0.2, 0.3, 0.4, 0.6, 1], liq: [1, 0.85, 0.7, 0.55, 0.4, 0.25],
  claim: [1, 1.5, 2, 3], decl: [0, 0.2, 0.4, 0.6, 0.7, 0.8],
} as const;

export interface CollateralStress {
  applies: boolean; poolPct: number; claim: number; admin: number; liq: number; noi: number; other: number; capBase: number; assets: number; hasCapRate: boolean;
  tableCap: number[][]; // [cap rate][NOI change]
  tablePool: number[][]; // [pool share][realization factor]
  tableClaim: number[][]; // [claim multiple][asset value decline]
  breakEvenValue: number; breakEvenAssetDecline: number; breakEvenCapRate: number | null; breakEvenNoiDecline: number | null;
}

export function collateralStress(c: Company, noiLtm: number, severeLiq: number): CollateralStress {
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const poolPct = t.collateralPct ?? 0;
  const claim = t.principal, admin = c.adminPct, assets = c.assetBase;
  const capBase = c.assetCapRate ?? 0, hasCapRate = !!c.assetCapRate;
  const other = hasCapRate ? assets - noiLtm / capBase : assets;
  const rec = (pool: number, value: number, liq: number, cl: number) => (cl <= 0 ? 1 : Math.min(1, (pool * value * liq * (1 - admin)) / cl));
  const tableCap = hasCapRate ? COLL_AXES.cap.map((cap) => COLL_AXES.noi.map((d) => rec(poolPct, (noiLtm * (1 + d)) / cap + other, severeLiq, claim))) : [];
  const tablePool = COLL_AXES.pool.map((p) => COLL_AXES.liq.map((l) => rec(p, assets, l, claim)));
  const tableClaim = COLL_AXES.claim.map((m) => COLL_AXES.decl.map((d) => rec(poolPct, assets * (1 - d), severeLiq, claim * m)));
  const breakEvenValue = poolPct > 0 ? claim / (poolPct * severeLiq * (1 - admin)) : NaN;
  return {
    applies: poolPct > 0, poolPct, claim, admin, liq: severeLiq, noi: noiLtm, other, capBase, assets, hasCapRate, tableCap, tablePool, tableClaim,
    breakEvenValue, breakEvenAssetDecline: 1 - breakEvenValue / assets,
    breakEvenCapRate: hasCapRate && breakEvenValue > other ? noiLtm / (breakEvenValue - other) : null,
    breakEvenNoiDecline: hasCapRate ? Math.max(-1, (breakEvenValue - other) * capBase / noiLtm - 1) : null,
  };
}
