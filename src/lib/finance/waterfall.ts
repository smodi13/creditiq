export interface Claim {
  id: string;
  name: string;
  amount: number;
  rank: number; // 1 = most senior; equal ranks share pro rata
  collateralPct?: number; // specific lien: share of net value ring-fenced for this claim (sum ≤ 1). undefined = all-asset / pari
}
export interface WaterfallRow extends Claim {
  fromCollateral: number;
  fromGeneral: number;
  recovery: number;
  recoveryPct: number;
  loss: number;
  lossPct: number;
}
export interface Waterfall {
  distributable: number;
  adminClaims: number;
  netDistributable: number;
  rows: WaterfallRow[];
  equity: number;
  totalClaims: number;
}

/**
 * Absolute-priority waterfall.
 * 1) admin costs come off the top;
 * 2) claims with a specific lien are paid from their own collateral pool (collateralPct × net value), capped at the claim;
 * 3) the remaining value goes to general claims by rank (pro rata within a rank); a specific-lien claim's shortfall
 *    (deficiency) joins the general pool at `deficiencyRank`;
 * 4) residual to equity.
 */
export function runWaterfall(value: number, claims: Claim[], adminPct = 0, deficiencyRank = Number.MAX_SAFE_INTEGER): Waterfall {
  const distributable = Math.max(0, value);
  const adminClaims = distributable * adminPct;
  const net = distributable - adminClaims;
  const paid = claims.map((c) => (c.collateralPct && c.collateralPct > 0 ? Math.min(c.amount, c.collateralPct * net) : 0));
  const general = claims.map((c, i) => (c.collateralPct && c.collateralPct > 0 ? c.amount - paid[i] : c.amount));
  const grank = claims.map((c) => (c.collateralPct && c.collateralPct > 0 ? deficiencyRank : c.rank));
  let remaining = net - paid.reduce((s, x) => s + x, 0);
  const gRec = claims.map(() => 0);
  const ranks = [...new Set(grank)].sort((a, b) => a - b);
  for (const r of ranks) {
    const idx = grank.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);
    const tierTotal = idx.reduce((s, i) => s + general[i], 0);
    const pay = Math.min(remaining, tierTotal);
    for (const i of idx) gRec[i] = tierTotal === 0 ? 0 : (pay * general[i]) / tierTotal;
    remaining -= pay;
  }
  const rows = claims.map((c, i) => {
    const recovery = paid[i] + gRec[i];
    return { ...c, fromCollateral: paid[i], fromGeneral: gRec[i], recovery, recoveryPct: c.amount === 0 ? 1 : recovery / c.amount, loss: c.amount - recovery, lossPct: c.amount === 0 ? 0 : 1 - recovery / c.amount };
  });
  return { distributable, adminClaims, netDistributable: net, rows, equity: remaining, totalClaims: claims.reduce((s, c) => s + c.amount, 0) };
}
