import { recoveryCase, scenarioReturn, type Analysis } from "./analysis";
import { bondReturn } from "./finance/returns";
import { project } from "./finance/projection";
import { SCENARIOS, type Company, type ScenarioAssumptions, type ScenarioKey } from "./types";

export type SensKind = "irr" | "recovery" | "moic";
export interface SensTable {
  key: "price" | "rec" | "margin" | "growth" | "sofr" | "mult" | "mrec"; title: string; axisLabel: string; axisFmt: "px" | "pts" | "x" | "pct";
  axis: number[]; kind: SensKind; cells: number[][]; // [axis point][scenario base, downside, severe]
}
export const SENS_AXES = {
  price: [-8, -4, 0, 4, 8], rec: [20, 40, 60, 80, 100], margin: [-0.04, -0.02, 0, 0.02, 0.04], growth: [-0.1, -0.05, 0, 0.05, 0.1],
  sofr: [-0.01, -0.005, 0, 0.01, 0.02], mult: [-2, -1, 0, 1, 2],
} as const;

const run = (c: Company, a: ScenarioAssumptions, s: ScenarioKey) => {
  const p = project(c, a, s);
  const rc = recoveryCase(c, a, p);
  return { p, rc, ret: scenarioReturn(c, a, p, rc, s, c.probabilities[s]) };
};
const targetRec = (c: Company, rc: ReturnType<typeof recoveryCase>) => rc.waterfall.rows.find((r) => r.id === c.target.trancheId)?.recoveryPct ?? 0;

/** The seven sensitivity tables of the Excel model (Sensitivities tab), computed with the same engine. */
export function sensitivities(c: Company, an: Analysis): SensTable[] {
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const px0 = t.price ?? 100, face = c.target.face ?? 100;
  const per = (f: (s: ScenarioKey, i: number) => number, n = 5) => Array.from({ length: n }, (_, i) => SCENARIOS.map((s) => f(s, i)));
  const flows = (s: ScenarioKey) => an.returns[s];
  const mod = (s: ScenarioKey, f: (a: ScenarioAssumptions, x: number) => ScenarioAssumptions, x: number) => run(c, f(an.assumptions[s], x), s);
  const price = SENS_AXES.price.map((o) => px0 + o);
  const tp = (s: ScenarioKey) => (an.projections[s].defaultYear != null ? an.projections[s].defaultYear! - c.baseYear + c.resolutionLag : c.target.holdYears);
  const recIrr = (s: ScenarioKey, v: number) => {
    const R = flows(s);
    const fl = R.flows.map((f, i) => (i === 0 ? f : f - (i === tp(s) ? R.exitProceeds : 0) + (i === tp(s) ? (face * v) / 100 : 0)));
    return bondReturnIrr(R.times, fl, R.cashInterest + (face * v) / 100);
  };
  return [
    { key: "price", title: "Purchase price vs IRR", axisLabel: "Purchase price (% of face)", axisFmt: "px", axis: price, kind: "irr",
      cells: per((s, i) => { const R = flows(s); const fl = [...R.flows]; fl[0] = -(face * price[i]) / 100 * (1 + c.target.feePct); return bondReturnIrr(R.times, fl, R.totalProceeds); }) },
    { key: "rec", title: "Exit / recovery value (% of face) vs IRR", axisLabel: "Proceeds (% of face)", axisFmt: "px", axis: [...SENS_AXES.rec], kind: "irr", cells: per((s, i) => recIrr(s, SENS_AXES.rec[i])) },
    { key: "margin", title: "EBITDA margin shift vs IRR (full model re-run)", axisLabel: "EBITDA margin shift", axisFmt: "pts", axis: [...SENS_AXES.margin], kind: "irr",
      cells: per((s, i) => mod(s, (a, x) => ({ ...a, ebitdaMargin: a.ebitdaMargin.map((m) => m + x) }), SENS_AXES.margin[i]).ret.irr ?? -1) },
    { key: "growth", title: "Revenue growth shift vs IRR (full model re-run)", axisLabel: "Revenue growth shift", axisFmt: "pts", axis: [...SENS_AXES.growth], kind: "irr",
      cells: per((s, i) => mod(s, (a, x) => ({ ...a, revenueGrowth: a.revenueGrowth.map((g) => g + x) }), SENS_AXES.growth[i]).ret.irr ?? -1) },
    { key: "sofr", title: "Interest rate (SOFR) shift vs IRR (full model re-run)", axisLabel: "SOFR shift", axisFmt: "pts", axis: [...SENS_AXES.sofr], kind: "irr",
      cells: per((s, i) => mod(s, (a, x) => ({ ...a, rateShock: a.rateShock + x }), SENS_AXES.sofr[i]).ret.irr ?? -1) },
    { key: "mult", title: "Distressed valuation multiple shift vs target-tranche recovery %", axisLabel: "Multiple shift (x EBITDA)", axisFmt: "x", axis: [...SENS_AXES.mult], kind: "recovery",
      cells: per((s, i) => { const r = mod(s, (a, x) => ({ ...a, distressMultiple: a.distressMultiple + x }), SENS_AXES.mult[i]); return targetRec(c, r.rc); }) },
    { key: "mrec", title: "Recovery / exit value (% of face) vs MOIC", axisLabel: "Proceeds (% of face)", axisFmt: "px", axis: [...SENS_AXES.rec], kind: "moic",
      cells: per((s, i) => (flows(s).cashInterest + (face * SENS_AXES.rec[i]) / 100) / flows(s).cost) },
  ];
}

import { irr } from "./finance/returns";
function bondReturnIrr(times: number[], flows: number[], inflow: number): number {
  if (inflow <= 0) return -1;
  return irr(times, flows) ?? -1;
}
void bondReturn;

/** Effect of a +100 bp move in SOFR on the first projected period, using the Base-case structure. */
export function rateSensitivity(c: Company, an: Analysis, bump = 0.01) {
  const y = an.projections.base.years[0];
  const sofr = c.sofr[0];
  const floatBal = c.tranches.filter((t) => t.floating).reduce((s, t) => s + t.principal, 0);
  const dInt = c.tranches.reduce((s, t) => s + (t.floating ? t.principal * (Math.max(sofr + bump, t.floor ?? 0) - Math.max(sofr, t.floor ?? 0)) : 0), 0);
  const tax = c.taxRate;
  const dFcf = -(dInt) * (y.ebt > 0 ? 1 - tax : 1);
  return { floatingShare: floatBal / c.tranches.reduce((s, t) => s + t.principal, 0), dInterest: dInt, dFcf, coverageBefore: y.interestCoverage, coverageAfter: y.interestCoverage != null ? y.ebitda / (y.cashInterest + dInt) : null };
}
