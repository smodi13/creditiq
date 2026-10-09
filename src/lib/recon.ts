import { collateralStress } from "./collateral";
import { analyze } from "./analysis";
import { metric } from "./finance/metrics";
import { SCENARIOS, type Company } from "./types";
import { sensitivities } from "./sensitivities";

export type ReconValue = number | string | null;
const r = (x: number | null | undefined): number | null => (x == null || !Number.isFinite(x) ? null : x);

/** The web engine's outputs, keyed exactly like the Excel reconciliation map (models/cases/<id>.xlsmap.json). */
export function webMetrics(c: Company): Record<string, ReconValue> {
  const a = analyze(c);
  const out: Record<string, ReconValue> = {};
  const tr = c.tranches.find((t) => t.id === c.target.trancheId)!;
  for (const s of SCENARIOS) {
    const p = a.projections[s], y1 = p.years[0], y5 = p.years[4], R = a.returns[s];
    out[`${s}.revenue.p1`] = r(y1.revenue); out[`${s}.revenue.p5`] = r(y5.revenue);
    out[`${s}.ebitda.p1`] = r(y1.ebitda); out[`${s}.ebitda.p5`] = r(y5.ebitda);
    out[`${s}.fcf.sum`] = r(p.years.reduce((t, y) => t + y.fcf, 0));
    out[`${s}.debt.p5`] = r(y5.totalDebt); out[`${s}.cash.p5`] = r(y5.cash);
    out[`${s}.netlev.p1`] = r(y1.netLeverage); out[`${s}.coverage.p1`] = r(y1.interestCoverage); out[`${s}.liquidity.p1`] = r(y1.liquidity);
    out[`${s}.default`] = p.defaultYear != null ? 1 : 0; out[`${s}.defaultYear`] = p.defaultYear ?? 0;
    out[`${s}.covbreaches`] = a.covenants[s].reduce((t, x) => t + x.tests.filter((q) => q.status === "BREACH").length, 0);
    out[`${s}.refifail`] = a.refi[s].filter((e) => !e.passes).length;
    out[`${s}.recoveryValue`] = r(a.recovery[s].value);
    out[`${s}.recovery.target`] = r(a.recovery[s].waterfall.rows.find((q) => q.id === tr.id)?.recoveryPct ?? 0);
    out[`${s}.irr_ctr`] = r(R.irrContractual); out[`${s}.exitprice`] = r(R.exitPrice); out[`${s}.irr`] = r(R.irr); out[`${s}.moic`] = r(R.moic); out[`${s}.profit`] = r(R.profit);
  }
  out["pw.irr"] = r(a.expected.irr); out["pw.avgirr"] = r(a.expected.avgIrr); out["pw.irr_ctr"] = r(a.expected.irrContractual); out["pw.moic"] = r(a.expected.moic); out["pw.default"] = r(a.expected.pDefault);
  const cs = collateralStress(c, c.history[c.history.length - 1].revenue - c.history[c.history.length - 1].cogs, a.assumptions.severe.liquidationRecovery);
  if (cs.applies) {
    cs.tableCap.forEach((row, i) => row.forEach((v, j) => { out[`coll.cap.${i}.${j}`] = r(v); }));
    cs.tablePool.forEach((row, i) => row.forEach((v, j) => { out[`coll.pool.${i}.${j}`] = r(v); }));
    cs.tableClaim.forEach((row, i) => row.forEach((v, j) => { out[`coll.claim.${i}.${j}`] = r(v); }));
    out["coll.be.value"] = r(cs.breakEvenValue); out["coll.be.decline"] = r(cs.breakEvenAssetDecline);
  }
  out["decision"] = a.recommendation.decision; out["score.total"] = r(a.score.total);
  out["ltm.netlev"] = r(metric(a.metrics, "netLev")); out["ltm.coverage"] = r(metric(a.metrics, "ebitdaInt")); out["ytm"] = r(a.ytm);
  for (const t of sensitivities(c, a)) t.cells.forEach((row, i) => row.forEach((v, j) => { out[`sens.${t.key}.${SCENARIOS[j]}.${i}`] = r(v); }));
  return out;
}

export interface ReconRow { key: string; label: string; excel: ReconValue; web: ReconValue; diff: number | null; tol: number; kind: string; status: "PASS" | "FAIL" }
export const reconTolerance = (kind: string) => ({ usd: 0.05, ratio: 0.005, pct: 0.0005, flag: 0, price: 0.05 }[kind] ?? 0);

/** Live comparison: Excel values come from the committed snapshot (data/recon/<id>.json, produced from the recalculated workbook); web values are recomputed now. */
export function liveReconcile(c: Company, snapshot: { rows: { key: string; label: string; excel: ReconValue; kind: string; tol: number }[] }): ReconRow[] {
  const web = webMetrics(c);
  return snapshot.rows.map((row) => {
    const w = web[row.key] ?? (row.key.endsWith(".defaultYear") ? web[row.key] : null);
    let diff: number | null = null, ok: boolean;
    if (typeof row.excel === "number" && typeof w === "number") { diff = row.excel - w; ok = Math.abs(diff) <= reconTolerance(row.kind); }
    else ok = row.excel === w;
    return { key: row.key, label: row.label, excel: row.excel, web: w ?? null, diff, tol: reconTolerance(row.kind), kind: row.kind, status: ok ? "PASS" : "FAIL" };
  });
}
