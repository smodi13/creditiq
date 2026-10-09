import { ALERTS, THESIS } from "../config";
import type { Company, ThesisPlan } from "../types";

export interface Snapshot {
  netLeverage: number; interestCoverage: number; liquidity: number; ebitda: number; recoveryPct: number; // recovery in % points
}
export interface AlertInput {
  current: Snapshot; prior: Snapshot; nextMaturityYear: number; asOfYear: number; covenantHeadroomPct: number | null;
}
export type Severity = "HIGH" | "MEDIUM" | "LOW";
export interface RiskAlert { code: string; severity: Severity; message: string; forward?: boolean }

/** Snapshot-vs-prior alerts (period-over-period deterioration). */
export function portfolioAlerts(i: AlertInput): RiskAlert[] {
  const out: RiskAlert[] = [];
  const { current: c, prior: p } = i;
  if (c.netLeverage - p.netLeverage >= ALERTS.leverageIncrease)
    out.push({ code: "LEVERAGE", severity: c.netLeverage - p.netLeverage >= 1 ? "HIGH" : "MEDIUM", message: `Net leverage up ${(c.netLeverage - p.netLeverage).toFixed(1)}x to ${c.netLeverage.toFixed(1)}x` });
  if (p.interestCoverage - c.interestCoverage >= ALERTS.coverageDecline)
    out.push({ code: "COVERAGE", severity: "MEDIUM", message: `Interest coverage down ${(p.interestCoverage - c.interestCoverage).toFixed(1)}x to ${c.interestCoverage.toFixed(1)}x` });
  if (p.liquidity > 0 && (p.liquidity - c.liquidity) / p.liquidity >= ALERTS.liquidityDeclinePct)
    out.push({ code: "LIQUIDITY", severity: "MEDIUM", message: `Liquidity down ${(((p.liquidity - c.liquidity) / p.liquidity) * 100).toFixed(0)}%` });
  if (i.nextMaturityYear - i.asOfYear <= ALERTS.maturityYears)
    out.push({ code: "MATURITY", severity: i.nextMaturityYear - i.asOfYear <= 1 ? "HIGH" : "MEDIUM", message: `Debt maturity in ${i.nextMaturityYear}` });
  if (p.ebitda > 0 && (p.ebitda - c.ebitda) / p.ebitda >= ALERTS.ebitdaDeclinePct)
    out.push({ code: "EBITDA", severity: "HIGH", message: `EBITDA down ${(((p.ebitda - c.ebitda) / p.ebitda) * 100).toFixed(0)}% vs prior` });
  if (i.covenantHeadroomPct != null && i.covenantHeadroomPct < ALERTS.covenantHeadroomPct)
    out.push({ code: "COVENANT", severity: i.covenantHeadroomPct < 0 ? "HIGH" : "MEDIUM", message: i.covenantHeadroomPct < 0 ? "Maintenance covenant breached" : `Covenant headroom ${(i.covenantHeadroomPct * 100).toFixed(0)}%` });
  if (p.recoveryPct - c.recoveryPct >= ALERTS.recoveryDeclinePts)
    out.push({ code: "RECOVERY", severity: "MEDIUM", message: `Downside recovery est. down ${(p.recoveryPct - c.recoveryPct).toFixed(0)} pts to ${c.recoveryPct.toFixed(0)}%` });
  return out;
}

export interface ThesisActuals { revenueYoY: number; ebitdaYoY: number; netLeverage: number; coverage: number; liquidity: number }
export interface ThesisRow { metric: string; plan: string; actual: string; gap: string; status: "OK" | "WATCH" | "BELOW THESIS"; severity: Severity | null }
export interface ThesisAssessment { status: "ON TRACK" | "WATCH" | "THESIS DETERIORATION"; rows: ThesisRow[]; alerts: RiskAlert[] }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Compares actual reported performance with the plan set at entry. Pure data comparison, no free text. */
export function assessThesis(plan: ThesisPlan, a: ThesisActuals, extra: { baseBreachPeriod: string | null; maturityFlag: string | null; severeRecovery: number; minRecovery: number }): ThesisAssessment {
  const rows: ThesisRow[] = [];
  const alerts: RiskAlert[] = [];
  const add = (r: ThesisRow, code: string, message: string, forward = false) => { rows.push(r); if (r.severity) alerts.push({ code, severity: r.severity, message, forward }); };
  const rg = plan.plan.revenueGrowthYoY - a.revenueYoY; // positive = shortfall
  add({ metric: "Revenue growth (YoY, YTD)", plan: pct(plan.plan.revenueGrowthYoY), actual: pct(a.revenueYoY), gap: `${(-rg * 100).toFixed(1)} pts`, status: rg >= THESIS.revenueShortfall ? "BELOW THESIS" : rg > 0 ? "WATCH" : "OK", severity: rg >= THESIS.revenueShortfall ? (rg >= 0.1 ? "HIGH" : rg >= 0.05 ? "MEDIUM" : "LOW") : null },
    "REVENUE", `Revenue ${pct(a.revenueYoY)} vs plan ${pct(plan.plan.revenueGrowthYoY)}`);
  const eg = plan.plan.ebitdaGrowthYoY - a.ebitdaYoY;
  add({ metric: "EBITDA growth (YoY, YTD)", plan: pct(plan.plan.ebitdaGrowthYoY), actual: pct(a.ebitdaYoY), gap: `${(-eg * 100).toFixed(1)} pts`, status: eg >= THESIS.ebitdaShortfall ? "BELOW THESIS" : eg > 0 ? "WATCH" : "OK", severity: eg >= THESIS.ebitdaShortfall ? (eg >= 0.15 ? "HIGH" : eg >= 0.08 ? "MEDIUM" : "LOW") : null },
    "EBITDA", `EBITDA ${pct(a.ebitdaYoY)} vs plan ${pct(plan.plan.ebitdaGrowthYoY)}`);
  const lg = a.netLeverage - plan.plan.netLeverageMax;
  add({ metric: "Net leverage (LTM, model basis)", plan: `≤ ${plan.plan.netLeverageMax.toFixed(1)}x`, actual: `${a.netLeverage.toFixed(1)}x`, gap: `${lg >= 0 ? "+" : ""}${lg.toFixed(1)}x`, status: lg > THESIS.leverageSlack ? "BELOW THESIS" : lg > 0 ? "WATCH" : "OK", severity: lg > THESIS.leverageSlack ? (lg >= 0.75 ? "HIGH" : lg >= 0.5 ? "MEDIUM" : "LOW") : null },
    "LEVERAGE", `Net leverage ${a.netLeverage.toFixed(1)}x vs max ${plan.plan.netLeverageMax.toFixed(1)}x`);
  const cg = plan.plan.coverageMin - a.coverage;
  add({ metric: "EBITDA / interest (LTM)", plan: `≥ ${plan.plan.coverageMin.toFixed(1)}x`, actual: `${a.coverage.toFixed(2)}x`, gap: `${(-cg).toFixed(2)}x`, status: cg > THESIS.coverageSlack ? "BELOW THESIS" : cg > 0 ? "WATCH" : "OK", severity: cg > THESIS.coverageSlack ? (cg >= 0.4 ? "HIGH" : cg >= 0.25 ? "MEDIUM" : "LOW") : null },
    "COVERAGE", `Coverage ${a.coverage.toFixed(2)}x vs min ${plan.plan.coverageMin.toFixed(1)}x`);
  const lq = (plan.plan.liquidityMin - a.liquidity) / plan.plan.liquidityMin;
  add({ metric: "Liquidity ($M)", plan: `≥ ${plan.plan.liquidityMin.toFixed(0)}`, actual: a.liquidity.toFixed(0), gap: `${(-lq * 100).toFixed(0)}%`, status: lq > THESIS.liquiditySlack ? "BELOW THESIS" : lq > 0 ? "WATCH" : "OK", severity: lq > THESIS.liquiditySlack ? (lq >= 0.25 ? "HIGH" : "MEDIUM") : null },
    "LIQUIDITY", `Liquidity $${a.liquidity.toFixed(0)}M vs min $${plan.plan.liquidityMin.toFixed(0)}M`);
  add({ metric: "Covenants (base-case projection)", plan: "No breach", actual: extra.baseBreachPeriod ? `Breach in ${extra.baseBreachPeriod}` : "No breach", gap: "", status: extra.baseBreachPeriod ? "BELOW THESIS" : "OK", severity: extra.baseBreachPeriod ? "MEDIUM" : null }, "COVENANT", `Projected covenant breach in ${extra.baseBreachPeriod}`, true);
  add({ metric: "Maturity wall (base case)", plan: "No refinancing shortfall", actual: extra.maturityFlag ?? "No shortfall", gap: "", status: extra.maturityFlag ? "BELOW THESIS" : "OK", severity: extra.maturityFlag ? "HIGH" : null }, "MATURITY", extra.maturityFlag ?? "", true);
  add({ metric: "Severe-case recovery", plan: `≥ ${pct(extra.minRecovery)}`, actual: pct(extra.severeRecovery), gap: "", status: extra.severeRecovery < extra.minRecovery ? "BELOW THESIS" : "OK", severity: extra.severeRecovery < extra.minRecovery ? "MEDIUM" : null }, "RECOVERY", `Severe-case recovery ${pct(extra.severeRecovery)}`, true);
  // status is driven by reported actual-vs-plan metrics; forward-looking model flags (covenants, maturities, recovery) raise WATCH but never alone declare deterioration
  const act = alerts.filter((x) => !x.forward);
  const highs = act.filter((x) => x.severity === "HIGH").length, meds = act.filter((x) => x.severity === "MEDIUM").length;
  const status = highs >= 1 || meds >= 3 ? "THESIS DETERIORATION" : alerts.length || rows.some((r) => r.status === "WATCH") ? "WATCH" : "ON TRACK";
  return { status, rows, alerts };
}

export function thesisFor(c: Company, a: { covenants: { base: { firstBreachYear: number | null }[] }; maturity: { base: { flag: string | null }[] }; recovery: { severe: { waterfall: { rows: { id: string; recoveryPct: number }[] } } } }): ThesisAssessment | null {
  if (!c.thesisPlan || !c.monitoring) return null;
  const firstBreach = a.covenants.base.map((x) => x.firstBreachYear).filter((x): x is number => x != null).sort()[0];
  const label = firstBreach != null ? c.periodLabels[firstBreach - c.baseYear - 1] : null;
  const flag = a.maturity.base.find((m) => m.flag)?.flag ?? null;
  const sev = a.recovery.severe.waterfall.rows.find((r) => r.id === c.target.trancheId)?.recoveryPct ?? 0;
  return assessThesis(c.thesisPlan, c.monitoring, { baseBreachPeriod: label, maturityFlag: flag, severeRecovery: sev, minRecovery: c.thresholds.minRecovery });
}
