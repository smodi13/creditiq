import { DISTRESS_FLAGS, DISTRESS_WEIGHTS } from "./config";
import { type Claim, type Waterfall, runWaterfall } from "./finance/waterfall";
import { bondReturn, contractualFlows, contractualIrr, type ReturnResult, ytm, irr } from "./finance/returns";
import { assumptionsFor } from "./finance/scenarios";
import { creditMetrics, debtDue12m, metric, totalDebt, type MetricRow } from "./finance/metrics";
import { project, type Projection, type RefiEvent } from "./finance/projection";
import { creditScore, projectedScore, scale, scoreChange, type ScoreChange, type ScoreResult } from "./finance/score";
import { maturityWall, type MaturityBucket } from "./finance/maturity";
import { testCovenants, type CovenantResult } from "./finance/covenants";
import { SCENARIOS, type Company, type ScenarioAssumptions, type ScenarioKey, type Snapshot } from "./types";

export interface RecoveryCase {
  eventYear: number; eventLabel: string; actualDefault: boolean; goingConcern: number; liquidation: number; basis: "going concern" | "liquidation";
  cashAtEvent: number; value: number; waterfall: Waterfall;
}
export interface ScenarioReturn extends ReturnResult {
  scenario: ScenarioKey; recoveryPct: number; exitPrice: number; probability: number; defaultYear: number | null; irrContractual: number | null;
}
export interface DriverScore { key: string; label: string; score: number; weight: number; group: "Opportunity" | "Risk"; detail: string }
export interface DistressResult { score: number; opportunity: number; safety: number; drivers: DriverScore[]; flags: string[] }
export interface Evidence { key: string; label: string; pass: boolean; core: boolean; actual: string; required: string }
export interface RecommendationResult { decision: "PROCEED" | "HOLD" | "PASS"; evidence: Evidence[]; reasons: string[]; coreFails: number }
export interface Breakevens {
  hurdleEntryPrice: number | null; breakevenRecoveryPct: number | null; ebitdaDeclineToLeverageCovenant: number | null; ebitdaDeclineToCoverageCovenant: number | null;
  ebitdaDeclineToOneTimesCoverage: number | null; ltvThroughTranche: number | null; attachment: number | null; valueDeclineToImpairment: number | null;
  multipleForPrincipal: number | null; // lowest distressed EV/EBITDA multiple at which the severe-case valuation recovery still covers the purchase price
}
export interface Analysis {
  company: Company; assumptions: Record<ScenarioKey, ScenarioAssumptions>; projections: Record<ScenarioKey, Projection>; metrics: MetricRow[];
  score: ScoreResult; scoreProjected: Record<ScenarioKey, ScoreResult>; scoreChange: ScoreChange | null; recovery: Record<ScenarioKey, RecoveryCase>; returns: Record<ScenarioKey, ScenarioReturn>;
  expected: { irr: number | null; irrContractual: number | null; avgIrr: number | null; flows: number[]; moic: number; recoveryPct: number; pDefault: number; lgd: number };
  covenants: Record<ScenarioKey, CovenantResult[]>; refi: Record<ScenarioKey, RefiEvent[]>; maturity: Record<ScenarioKey, MaturityBucket[]>;
  distress: DistressResult; recommendation: RecommendationResult; breakevens: Breakevens; ytm: number | null; yearsToMaturity: number; assetValue: Record<ScenarioKey, number>;
  yieldMetrics: { currentYield: number; ytm: number | null; cashInvestment: number };
}

const yearsBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / (365.25 * 86400000);

export function claimsAt(c: Company, balances: Record<string, number>, rates: Record<string, number> | null): Claim[] {
  return c.tranches.filter((t) => (balances[t.id] ?? 0) > 0).map((t) => ({
    id: t.id, name: t.name, rank: t.seniority, collateralPct: t.collateralPct,
    amount: balances[t.id] * (1 + (rates ? (rates[t.id] * c.accruedMonths) / 12 : 0)),
  }));
}

export function recoveryCase(c: Company, a: ScenarioAssumptions, p: Projection, overrideValue?: number | null): RecoveryCase {
  const actual = p.defaultYear != null;
  let idx = p.years.findIndex((y) => y.year === p.defaultYear);
  if (idx < 0) idx = p.years.reduce((m, y, i) => (y.ebitda < p.years[m].ebitda ? i : m), 0); // trough year
  const row = p.years[idx];
  const cashAtEvent = Math.max(0, row.cash);
  const goingConcern = Math.max(0, row.ebitda) * a.distressMultiple;
  const liquidation = c.assetBase * (1 - a.assetValueDecline) * a.liquidationRecovery;
  const value = overrideValue != null ? overrideValue : Math.max(goingConcern, liquidation) + cashAtEvent;
  const waterfall = runWaterfall(value, claimsAt(c, row.debt, row.rates), c.adminPct, c.deficiencyRank);
  return { eventYear: row.year, eventLabel: c.periodLabels[idx], actualDefault: actual, goingConcern, liquidation, basis: goingConcern >= liquidation ? "going concern" : "liquidation", cashAtEvent, value, waterfall };
}

/** Return on the target tranche under one assumption set. Pure: used by the web app, the labs and the Excel reconciliation. */
export function scenarioReturn(c: Company, a: ScenarioAssumptions, p: Projection, rc: RecoveryCase, scenario: ScenarioKey | "custom", probability = 0, price?: number): ScenarioReturn {
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const px = price ?? t.price ?? 100;
  const hold = c.target.holdYears;
  const face = c.target.face ?? 100;
  const row = rc.waterfall.rows.find((r) => r.id === t.id);
  const defIdx = p.defaultYear != null ? p.defaultYear - c.baseYear : null;
  const balEvent = p.years[(rc.eventYear - c.baseYear) - 1].debt[t.id];
  const recoveryProceeds = row && balEvent > 0 ? row.recovery * (face / balEvent) : 0;
  // exit price when no default: lesser of the scenario assumption and valuation coverage at the exit multiple
  const hy = p.years[Math.min(hold, 5) - 1];
  const xev = Math.max(0, hy.ebitda) * a.exitMultiple + Math.max(0, hy.cash);
  const xw = runWaterfall(xev, claimsAt(c, hy.debt, null), 0, c.deficiencyRank);
  const cover = xw.rows.find((r) => r.id === t.id)?.recoveryPct ?? 1;
  const exitPrice = Math.min(a.exitPrice, 100 * cover);
  const r = bondReturn({ price: px, face, coupons: p.years.map((y) => y.rates[t.id]), holdYears: hold, exitPrice, defaultYear: defIdx, recoveryProceeds, resolutionLag: c.resolutionLag, feePct: c.target.feePct });
  return { ...r, scenario: scenario === "custom" ? "base" : scenario, recoveryPct: p.defaultYear != null ? (row?.recoveryPct ?? 0) : 1, exitPrice, probability, defaultYear: p.defaultYear, irrContractual: contractualIrr(r, t.payFreq ?? 1) };
}

const cache = new Map<string, Analysis>();

export function analyze(c: Company): Analysis {
  const hit = cache.get(c.id);
  if (hit) return hit;
  const assumptions = Object.fromEntries(SCENARIOS.map((s) => [s, assumptionsFor(c, s)])) as Record<ScenarioKey, ScenarioAssumptions>;
  const projections = Object.fromEntries(SCENARIOS.map((s) => [s, project(c, assumptions[s], s)])) as Record<ScenarioKey, Projection>;
  const recovery = Object.fromEntries(SCENARIOS.map((s) => [s, recoveryCase(c, assumptions[s], projections[s])])) as Record<ScenarioKey, RecoveryCase>;
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const price = t.price ?? 100;
  const returns = Object.fromEntries(SCENARIOS.map((s) => [s, scenarioReturn(c, assumptions[s], projections[s], recovery[s], s, c.probabilities[s])])) as Record<ScenarioKey, ScenarioReturn>;
  const P = c.probabilities;
  // Expected return = IRR of the probability-weighted cash flows (all scenarios share the t=0..6 timeline). The simple average of scenario IRRs is kept separately (avgIrr): IRR is non-linear, so the two differ.
  const wIrr = SCENARIOS.every((s) => returns[s].irr != null) ? SCENARIOS.reduce((sum, s) => sum + (returns[s].irr as number) * P[s], 0) : null;
  const expFlows = returns.base.flows.map((_, i) => SCENARIOS.reduce((sum, s) => sum + returns[s].flows[i] * P[s], 0));
  const expIrr = expFlows.slice(1).reduce((x, y) => x + y, 0) <= 0 ? -1 : irr(returns.base.times, expFlows);
  const freq = c.tranches.find((x) => x.id === c.target.trancheId)?.payFreq ?? 1;
  const cf = SCENARIOS.map((s) => contractualFlows(returns[s], freq));
  const expC = cf[0].map((_, i) => SCENARIOS.reduce((sum, s, j) => sum + cf[j][i] * P[s], 0));
  const expIrrC = expC.slice(1).reduce((x, y) => x + y, 0) <= 0 ? -1 : (() => { const q = irr(expC.map((_, i) => i), expC); return q == null ? null : Math.pow(1 + q, 4) - 1; })();
  const pDefault = SCENARIOS.reduce((s, k) => s + (returns[k].defaulted ? P[k] : 0), 0);
  const expected = {
    irr: expIrr, avgIrr: wIrr, flows: expFlows, irrContractual: expIrrC, moic: SCENARIOS.reduce((s, k) => s + returns[k].moic * P[k], 0),
    recoveryPct: SCENARIOS.reduce((s, k) => s + returns[k].recoveryPct * P[k], 0), pDefault,
    lgd: pDefault > 0 ? SCENARIOS.reduce((s, k) => s + (returns[k].defaulted ? (1 - returns[k].recoveryPct) * P[k] : 0), 0) / pDefault : 0,
  };
  const assetValue = Object.fromEntries(SCENARIOS.map((s) => [s, c.assetBase * (1 - assumptions[s].assetValueDecline)])) as Record<ScenarioKey, number>;
  const covenants = Object.fromEntries(SCENARIOS.map((s) => [s, testCovenants(c, projections[s], assetValue[s])])) as Record<ScenarioKey, CovenantResult[]>;
  const refi = Object.fromEntries(SCENARIOS.map((s) => [s, projections[s].years.flatMap((y) => y.refiEvents)])) as Record<ScenarioKey, RefiEvent[]>;
  const maturity = Object.fromEntries(SCENARIOS.map((s) => [s, maturityWall(c, projections[s])])) as Record<ScenarioKey, MaturityBucket[]>;
  const metrics = creditMetrics(c);
  const score = creditScore(c);
  const ytmYears = Math.max(0.1, yearsBetween(c.asOf, t.maturityDate));
  const coupon0 = projections.base.years[0].rates[t.id];
  const a: Analysis = {
    company: c, assumptions, projections, metrics, score, scoreProjected: Object.fromEntries(SCENARIOS.map((s) => [s, projectedScore(c, projections[s].years[0])])) as Record<ScenarioKey, ScoreResult>, scoreChange: null, recovery, returns, expected, covenants, refi, maturity,
    ytm: ytm(price, coupon0, ytmYears), distress: { score: 0, opportunity: 0, safety: 0, drivers: [], flags: [] }, recommendation: { decision: "HOLD", evidence: [], reasons: [], coreFails: 0 },
    breakevens: { hurdleEntryPrice: null, breakevenRecoveryPct: null, ebitdaDeclineToLeverageCovenant: null, ebitdaDeclineToCoverageCovenant: null, ebitdaDeclineToOneTimesCoverage: null, ltvThroughTranche: null, attachment: null, valueDeclineToImpairment: null, multipleForPrincipal: null },
    yearsToMaturity: ytmYears, assetValue, yieldMetrics: { currentYield: (coupon0 * 100) / price, ytm: null, cashInvestment: ((c.target.face ?? 100) * price) / 100 * (1 + c.target.feePct) },
  };
  a.yieldMetrics.ytm = a.ytm;
  a.scoreChange = scoreChange(c, priorSnapshot(c));
  a.distress = distressScore(a);
  a.breakevens = breakevens(a);
  a.recommendation = recommend(a);
  cache.set(c.id, a);
  return a;
}

/** Prior-period snapshot: explicit for public cases (the 10-K balance sheet), else the previous annual period on today's capital structure. */
export function priorSnapshot(c: Company): Snapshot {
  if (c.priorSnapshot) return c.priorSnapshot;
  const h = c.history.filter((x) => !x.isLtm);
  const p = h[h.length - 2] ?? h[0];
  return { label: `${p.label ?? "prior year"} (same capital structure)`, totalDebt: totalDebt(c.tranches), cash: c.cash, undrawnRevolver: c.undrawnRevolver, ebitda: p.ebitda, interest: p.interest, fcf: p.fcf };
}

export function distressScore(a: Analysis): DistressResult {
  const c = a.company;
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const price = t.price ?? 100;
  const W = DISTRESS_WEIGHTS;
  const liq = metric(a.metrics, "liqRatio");
  const nl = metric(a.metrics, "netLev");
  const ic = metric(a.metrics, "ebitdaInt");
  const debt = totalDebt(c.tranches);
  const rank = t.seniority;
  const near = c.tranches.filter((x) => x.maturityYear <= c.baseYear + 2).reduce((s, x) => s + x.principal, 0);
  const baseRefiPass = a.refi.base.length === 0 || a.refi.base.every((e) => e.passes);
  const nearEvent = c.tranches.some((x) => x.maturityYear <= c.baseYear + 2);
  const sevRec = a.recovery.severe.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
  const d = (key: string, label: string, group: DriverScore["group"], score: number, detail: string): DriverScore => ({ key, label, score: Math.round(Math.max(0, Math.min(100, score)) * 10) / 10, weight: W[key as keyof typeof W], group, detail });
  const drivers: DriverScore[] = [
    d("recovery", "Recovery (severe case)", "Opportunity", 100 * scale(sevRec, 1.0, 0.3), `Severe-case recovery ${(sevRec * 100).toFixed(0)}%`),
    d("entryDiscount", "Entry discount", "Opportunity", 100 * scale((100 - price) / 100, 0.3, 0), `Mark ${price.toFixed(1)} → ${(100 - price).toFixed(1)} pts below par`),
    d("catalyst", "Catalyst potential", "Opportunity", (c.catalystScore / 5) * 100, `Analyst catalyst score ${c.catalystScore}/5`),
    d("position", "Capital-structure position", "Opportunity", Math.max(10, 100 - 30 * (rank - 1)) * (t.secured ? 1 : 0.75), `Rank ${rank}, ${t.secured ? "secured" : "unsecured"}`),
    d("refiEvent", "Refinancing event", "Opportunity", nearEvent ? (baseRefiPass ? 80 : 40) : 20, nearEvent ? `Maturity within 2 periods; base-case refinancing ${baseRefiPass ? "passes" : "fails"}` : "No maturity within 2 periods"),
    d("defaultSafety", "Default risk (safety)", "Risk", (1 - a.expected.pDefault) * 100, `Probability-weighted default ${(a.expected.pDefault * 100).toFixed(0)}%`),
    d("liquidity", "Liquidity (safety)", "Risk", 100 * scale(liq, 2.0, 0.5), `Liquidity ratio ${liq?.toFixed(2) ?? "n/m"}x`),
    d("leverage", "Leverage (safety)", "Risk", 100 * scale(nl, 2, 7), `Net leverage ${nl?.toFixed(1) ?? "n/m"}x`),
    d("coverage", "Coverage (safety)", "Risk", 100 * scale(ic, 5, 1), `EBITDA / interest ${ic?.toFixed(1) ?? "n/m"}x`),
    d("maturity", "Maturity (safety)", "Risk", 100 * scale(a.score.factors.find((f) => f.key === "maturity")!.raw, 0, 0.5), "Share of debt due within the window"),
    d("fcf", "Free cash flow (safety)", "Risk", 100 * scale(metric(a.metrics, "fcfDebt"), 0.12, -0.02), "LTM FCF / debt"),
  ];
  const sum = (g: DriverScore["group"]) => drivers.filter((x) => x.group === g).reduce((s, x) => s + x.score * x.weight, 0);
  const wsum = (g: DriverScore["group"]) => drivers.filter((x) => x.group === g).reduce((s, x) => s + x.weight, 0);
  const F = DISTRESS_FLAGS;
  const flags: string[] = [];
  if (nl != null && nl >= F.highLeverage) flags.push(`High leverage (${nl.toFixed(1)}x)`);
  if (ic != null && ic < F.lowCoverage) flags.push(`Low coverage (${ic.toFixed(1)}x)`);
  if (near / debt >= F.nearTermMaturityPct) flags.push(`Near-term maturity (${((near / debt) * 100).toFixed(0)}% within 2 periods)`);
  const h = c.history.filter((x) => !x.isLtm);
  if (h.length > 1) { const g = h[h.length - 1].ebitda / h[h.length - 2].ebitda - 1; if (g <= F.ebitdaDecline) flags.push(`Declining EBITDA (${(g * 100).toFixed(0)}% YoY)`); }
  const last = c.history[c.history.length - 1];
  if (last.fcf < 0) flags.push("Negative FCF");
  if (t.price != null && t.price < F.priceDiscount) flags.push(`Debt discount (${t.price.toFixed(0)})`);
  const rr = a.recovery.severe.waterfall.rows.find((r) => r.id === t.id);
  if (t.price != null && rr && price < 100 && (rr.recoveryPct * 100) / price >= F.recoveryToPrice) flags.push("Severe recovery ≥ 1.2x price");
  return { score: Math.round((sum("Opportunity") + sum("Risk")) / 10) / 10, opportunity: Math.round(sum("Opportunity") / wsum("Opportunity") * 10) / 10, safety: Math.round(sum("Risk") / wsum("Risk") * 10) / 10, drivers, flags };
}

export function recommend(a: Analysis): RecommendationResult {
  const c = a.company;
  const T = c.thresholds;
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const price = t.price ?? 100;
  const R = a.returns;
  const pct = (v: number | null) => (v == null ? "n/m" : `${(v * 100).toFixed(1)}%`);
  const baseCov = a.covenants.base.map((x) => x.minHeadroomPct).filter((x): x is number => x != null);
  const minHead = baseCov.length ? Math.min(...baseCov) : null;
  const baseRefiPass = a.refi.base.every((e) => e.passes);
  const nl = metric(a.metrics, "netLev");
  const valRec = (k: ScenarioKey) => a.recovery[k].waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
  const hi = c.diligenceItems.filter((d) => d.priority === "High" && d.status !== "Complete").length;
  const ev: Evidence[] = [
    { key: "baseIrr", label: "Base-case IRR clears hurdle", core: true, pass: (R.base.irr ?? -1) >= T.hurdleIrr, actual: pct(R.base.irr), required: `≥ ${pct(T.hurdleIrr)}` },
    { key: "pwIrr", label: "Expected-cash-flow IRR (probability-weighted) clears hurdle", core: true, pass: (a.expected.irr ?? -1) >= T.hurdleIrr, actual: pct(a.expected.irr), required: `≥ ${pct(T.hurdleIrr)}` },
    { key: "downIrr", label: "Downside IRR stays above floor", core: true, pass: (R.downside.irr ?? -1) >= T.minDownsideIrr, actual: pct(R.downside.irr), required: `≥ ${pct(T.minDownsideIrr)}` },
    { key: "downRec", label: "Downside recovery meets minimum (valuation waterfall)", core: true, pass: valRec("downside") >= T.minRecovery, actual: pct(valRec("downside")), required: `≥ ${pct(T.minRecovery)}` },
    { key: "refi", label: "Base-case refinancing succeeds", core: true, pass: baseRefiPass, actual: baseRefiPass ? "PASS" : "FAILURE", required: "PASS" },
    { key: "yield", label: "Entry yield meets minimum", core: false, pass: (a.yieldMetrics.ytm ?? 0) >= T.minYield, actual: pct(a.yieldMetrics.ytm), required: `≥ ${pct(T.minYield)}` },
    { key: "lev", label: "Net leverage within maximum", core: false, pass: (nl ?? 99) <= T.maxNetLeverage, actual: nl == null ? "n/m" : `${nl.toFixed(1)}x`, required: `≤ ${T.maxNetLeverage.toFixed(1)}x` },
    { key: "cov", label: "Covenant headroom (base case, minimum)", core: false, pass: minHead == null || minHead >= T.minCovenantHeadroom, actual: pct(minHead), required: `≥ ${pct(T.minCovenantHeadroom)}` },
    { key: "protect", label: "Principal protected in severe case (recovery ≥ price)", core: false, pass: valRec("severe") * 100 >= price, actual: `${(valRec("severe") * 100).toFixed(0)} vs ${price.toFixed(1)}`, required: "recovery ≥ price" },
    { key: "dd", label: "No unresolved high-priority diligence", core: false, pass: hi === 0, actual: `${hi} open`, required: "0 open" },
  ];
  const coreFails = ev.filter((e) => e.core && !e.pass).length;
  const secFails = ev.filter((e) => !e.core && !e.pass).length;
  const decision: RecommendationResult["decision"] = coreFails === 0 && secFails <= 2 ? "PROCEED" : !ev[0].pass && !ev[2].pass || coreFails >= 3 ? "PASS" : "HOLD";
  const reasons = ev.map((e) => `${e.pass ? "✓" : "✗"} ${e.label}: ${e.actual} (required ${e.required})`);
  return { decision, evidence: ev, reasons, coreFails };
}

export function breakevens(a: Analysis): Breakevens {
  const c = a.company;
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const l = c.history[c.history.length - 1];
  const base = a.returns.base;
  const hurdle = c.thresholds.hurdleIrr;
  // entry price at which base IRR = hurdle (cost changes, forward cash flows do not)
  let hurdlePrice: number | null = null;
  if (base.flows.slice(1).some((f) => f > 0)) {
    let lo = 30, hi = 140;
    const f = (p: number) => { const fl = [...base.flows]; fl[0] = -((c.target.face ?? 100) * p / 100) * (1 + c.target.feePct); return irr(base.times, fl) ?? -1; };
    if (f(lo) >= hurdle && f(hi) <= hurdle) { for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > hurdle) lo = mid; else hi = mid; } hurdlePrice = (lo + hi) / 2; }
  }
  const def = a.returns.downside.defaulted ? a.returns.downside : a.returns.severe;
  const be = ((def.cost - def.cashInterest) / def.face) * 100;
  const debt = totalDebt(c.tranches);
  const nd = debt - c.cash;
  const levCov = a.covenants.base.find((x) => x.covenant.type === "maxNetLeverage");
  const covCov = a.covenants.base.find((x) => x.covenant.type === "minInterestCoverage");
  const decl = (thr: number | undefined, lev: boolean) => {
    if (!thr) return null;
    const e = lev ? nd / thr : thr * l.interest;
    return Math.max(0, 1 - e / l.ebitda);
  };
  const senior = c.tranches.filter((x) => x.seniority < t.seniority || x.id === t.id).reduce((s, x) => s + x.principal, 0);
  const ahead = c.tranches.filter((x) => x.seniority < t.seniority).reduce((s, x) => s + x.principal, 0);
  const V = a.recovery.base.value > 0 ? Math.max(l.ebitda * a.assumptions.base.distressMultiple, c.assetBase * a.assumptions.base.liquidationRecovery) : 0;
  return {
    hurdleEntryPrice: hurdlePrice, breakevenRecoveryPct: be,
    ebitdaDeclineToLeverageCovenant: decl(levCov?.covenant.thresholds[0], true),
    ebitdaDeclineToCoverageCovenant: decl(covCov?.covenant.thresholds[0], false),
    ebitdaDeclineToOneTimesCoverage: Math.max(0, 1 - l.interest / l.ebitda),
    ltvThroughTranche: V > 0 ? senior / V : null, attachment: V > 0 ? ahead / V : null,
    valueDeclineToImpairment: V > 0 ? Math.max(0, 1 - (senior * (1 + c.adminPct)) / V) : null,
    multipleForPrincipal: (() => {
      const price = t.price ?? 100;
      const rec = (m: number) => recoveryCase(c, { ...a.assumptions.severe, distressMultiple: m }, a.projections.severe).waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
      if (rec(40) * 100 < price) return null;
      let lo = 0, hi = 40;
      for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (rec(mid) * 100 >= price) hi = mid; else lo = mid; }
      return hi;
    })(),
  };
}

export const nearTermDebt = (c: Company) => debtDue12m(c);
