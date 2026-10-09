import type { Analysis } from "./analysis";
import { totalDebt } from "./finance/metrics";
import { fmtM, fmtPct, fmtX } from "./format";
import type { Company } from "./types";

export interface Narrative {
  risks: { text: string; weight: number }[]; protections: { text: string; weight: number }[]; catalysts: string[]; changeMyMind: string[]; rationale: string[];
  opportunity: string; question: string; thesis: string; base: string; downside: string; recoveryText: string; decisionText: string;
}

/** Everything here is generated from the model's own numbers (plus the analyst-written risk / protection lists on the company object). */
export function narrative(c: Company, a: Analysis): Narrative {
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const price = t.price ?? 100;
  const R = a.returns;
  const th = c.thresholds;
  const b = a.breakevens;
  const lbl = (y: number | null | undefined) => (y == null ? "n/a" : c.periodLabels[y - c.baseYear - 1] ?? String(y));
  const rec = (s: "base" | "downside" | "severe") => a.recovery[s].waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
  const nl = a.metrics.find((m) => m.key === "netLev")?.value ?? 0, ic = a.metrics.find((m) => m.key === "ebitdaInt")?.value ?? 0;
  const debt = totalDebt(c.tranches);
  const firstBreach = (s: "base" | "downside" | "severe") => a.covenants[s].map((x) => x.firstBreachYear).filter((x): x is number => x != null).sort()[0];
  const bigWall = a.maturity.base.filter((m) => m.flag);
  const risks: Narrative["risks"] = [];
  const prot: Narrative["protections"] = [];
  if (rec("severe") * 100 < price) risks.push({ weight: 10 - rec("severe") * 5, text: `Severe-case valuation recovery of ${fmtPct(rec("severe"), 0)} is below the ${price.toFixed(1)} purchase price: a ${fmtPct(1 - rec("severe"), 0)} loss given default.` });
  else prot.push({ weight: 8, text: `Severe-case valuation recovery of ${fmtPct(rec("severe"), 0)} covers the ${price.toFixed(1)} purchase price (principal protected).` });
  if (rec("downside") * 100 < price) risks.push({ weight: 8, text: `Downside-case recovery of ${fmtPct(rec("downside"), 0)} falls short of the purchase price.` });
  if (ic < 2) risks.push({ weight: 9, text: `Thin interest coverage: EBITDA / interest ${fmtX(ic, 2)} at ${c.baseLabel} (EBITDA could fall ${fmtPct(b.ebitdaDeclineToOneTimesCoverage, 0)} before coverage hits 1.0x).` });
  else prot.push({ weight: 5, text: `Coverage of ${fmtX(ic, 2)} EBITDA / interest; EBITDA can fall ${fmtPct(b.ebitdaDeclineToOneTimesCoverage, 0)} before coverage reaches 1.0x.` });
  if (nl > 6) risks.push({ weight: 8, text: `High leverage: net debt / EBITDA ${fmtX(nl)} (maximum in policy ${fmtX(th.maxNetLeverage)}).` });
  else if (nl > 4) risks.push({ weight: 5, text: `Elevated leverage: net debt / EBITDA ${fmtX(nl)}.` });
  else prot.push({ weight: 5, text: `Moderate leverage: net debt / EBITDA ${fmtX(nl)}.` });
  for (const w of bigWall.slice(0, 1)) risks.push({ weight: 9, text: `Refinancing: ${w.flag}.` });
  const pf = a.refi.base.filter((e) => !e.passes);
  if (pf.length) risks.push({ weight: 9, text: `Base-case refinancing fails for ${pf.length} maturing tranche(s).` });
  else if (a.refi.base.length) prot.push({ weight: 4, text: `Base-case refinancing tests pass for all ${a.refi.base.length} maturing tranche(s); ${a.refi.base.filter((e) => e.resolution === "Repaid from cash").length} are repaid from cash.` });
  if (firstBreach("downside") != null) risks.push({ weight: 6, text: `Covenants breach in the Downside case (${lbl(firstBreach("downside"))}); ${firstBreach("base") != null ? "and already in the Base case" : "none in the Base case"}.` });
  else prot.push({ weight: 4, text: "No covenant breach in the Downside case." });
  if (a.projections.severe.defaultYear) risks.push({ weight: 7, text: `Severe case produces a payment default in ${lbl(a.projections.severe.defaultYear)}.` });
  if (t.secured && t.seniority === 1) prot.push({ weight: 9, text: `First-priority secured position${t.collateralPct ? ` on a ring-fenced collateral pool (${fmtPct(t.collateralPct, 0)} of asset value)` : " on substantially all assets"}; ${fmtPct(b.attachment ?? 0, 0)} of recovery value is senior to us and ${fmtPct(b.ltvThroughTranche ?? 0, 0)} through our tranche.` });
  else if (t.secured) prot.push({ weight: 6, text: `Secured, rank ${t.seniority}: ${fmtM(c.tranches.filter((x) => x.seniority < t.seniority).reduce((s, x) => s + x.principal, 0), 0)} ranks ahead.` });
  else risks.push({ weight: 7, text: `Unsecured, rank ${t.seniority}: ${fmtM(c.tranches.filter((x) => x.seniority < t.seniority).reduce((s, x) => s + x.principal, 0), 0)} of debt ranks ahead.` });
  const liq = c.cash + c.undrawnRevolver;
  if (liq >= debt * 0.2) prot.push({ weight: 5, text: `Liquidity of ${fmtM(liq, 0)} (${fmtPct(liq / debt, 0)} of total debt).` });
  const weakest = [...a.score.factors].sort((x, y) => x.points / x.weight - y.points / y.weight)[0];
  risks.push({ weight: 4, text: `Weakest credit-score factor: ${weakest.label} (${weakest.points.toFixed(1)} of ${weakest.weight} points).` });
  for (const u of c.risks.slice(0, 2)) risks.push({ weight: 3, text: u });
  for (const u of c.upside.slice(0, 2)) prot.push({ weight: 3, text: u });
  const top = <T extends { weight: number }>(xs: T[]) => [...xs].sort((x, y) => y.weight - x.weight).slice(0, 5);

  const changeMyMind: string[] = [];
  if (b.ebitdaDeclineToOneTimesCoverage != null) changeMyMind.push(`EBITDA declines more than ${fmtPct(b.ebitdaDeclineToOneTimesCoverage, 0)} from ${c.baseLabel} (coverage < 1.0x) — or more than ${fmtPct(b.ebitdaDeclineToLeverageCovenant ?? b.ebitdaDeclineToCoverageCovenant, 0)} (first covenant breaks).`);
  if (b.hurdleEntryPrice != null) changeMyMind.push(`The entry price is above ${b.hurdleEntryPrice.toFixed(1)}: the base case no longer earns the ${fmtPct(th.hurdleIrr, 0)} hurdle (assumed price ${price.toFixed(1)}).`);
  if (b.multipleForPrincipal != null) changeMyMind.push(`Severe-case recovery returns the purchase price only if the distressed valuation multiple is at least ${fmtX(b.multipleForPrincipal)} EBITDA (the severe case assumes ${fmtX(a.assumptions.severe.distressMultiple)}); the question is how much cushion we want.`);
  if (b.valueDeclineToImpairment != null) changeMyMind.push(`Collateral / enterprise value falls more than ${fmtPct(b.valueDeclineToImpairment, 0)} from the base-case valuation: the tranche starts to take losses.`);
  const base = a.refi.base[0];
  if (base) changeMyMind.push(`Market access weakens: base-case pro-forma coverage at refinancing is ${fmtX(base.coverage, 2)} vs the ${fmtX(base.minCoverage, 2)} test, at an assumed ${fmtPct(base.refiRate)} refinancing rate — a higher spread or lower EBITDA flips the test.`);
  const lq = c.covenants.find((x) => x.type === "minLiquidity" && x.active !== false);
  if (lq) changeMyMind.push(`Liquidity falls below ${fmtM(lq.thresholds[0], 0)} (hypothetical minimum-liquidity covenant).`);
  if (c.dataClass === "public") changeMyMind.push("A new filing shows AOI / NOI below the Downside path, a further liability-management transaction primes our collateral, or open high-priority diligence items turn into findings.");

  const rationale = a.recommendation.evidence.map((e) => `${e.pass ? "✓" : "✗"} ${e.label}: ${e.actual} (required ${e.required})`);
  const dec = a.recommendation.decision;
  const failed = a.recommendation.evidence.filter((e) => !e.pass);
  const decisionText = dec === "PROCEED"
    ? `PROCEED: the investment clears the return hurdle in the base case and on a probability-weighted basis, the downside stays above the floor, recovery covers the purchase price and refinancing passes.`
    : dec === "PASS"
      ? `PASS: ${failed.slice(0, 3).map((e) => e.label).join("; ")}. The return does not compensate for the modelled downside.`
      : `HOLD (do not size yet): ${failed.slice(0, 3).map((e) => `${e.label} (${e.actual} vs ${e.required})`).join("; ")}.`;
  return {
    risks: top(risks), protections: top(prot), catalysts: c.catalysts, changeMyMind, rationale,
    opportunity: `${c.dataClass === "public" ? "Hypothetical" : "Demo"} purchase of $${c.target.face ?? 100}M face of ${t.name} at ${price.toFixed(1)} (cash investment ${fmtM(R.base.cost)}): current yield ${fmtPct(a.yieldMetrics.currentYield)}, yield to maturity ${fmtPct(a.yieldMetrics.ytm)}.`,
    question: c.thesis.split(". ").slice(-1)[0].includes("?") ? c.thesis.split(". ").slice(-1)[0] : `Does a ${fmtPct(a.yieldMetrics.ytm)} yield on a rank-${t.seniority} ${t.secured ? "secured" : "unsecured"} claim compensate for ${fmtPct(a.expected.pDefault, 0)} probability-weighted default risk and ${fmtPct(1 - rec("severe"), 0)} severe-case loss?`,
    thesis: c.thesis,
    base: `Base case (${fmtPct(c.probabilities.base, 0)}): revenue ${fmtPct(a.assumptions.base.revenueGrowth[0])} in ${c.periodLabels[0]}, EBITDA margin ${fmtPct(a.assumptions.base.ebitdaMargin[0])}; ${a.projections.base.defaultYear ? "payment default in " + lbl(a.projections.base.defaultYear) : "no default"}; IRR ${fmtPct(R.base.irr)}, MOIC ${R.base.moic.toFixed(2)}x vs ${fmtPct(th.hurdleIrr, 0)} hurdle.`,
    downside: `Downside (${fmtPct(c.probabilities.downside, 0)}): EBITDA ${fmtM(Math.min(...a.projections.downside.years.map((y) => y.ebitda)), 0)} at the trough, peak net leverage ${fmtX(Math.max(...a.projections.downside.years.map((y) => y.netLeverage ?? 99)))}, covenants ${firstBreach("downside") != null ? "breach in " + lbl(firstBreach("downside")) : "hold"}; ${a.projections.downside.defaultYear ? "default in " + lbl(a.projections.downside.defaultYear) : "no default"}; IRR ${fmtPct(R.downside.irr)}. Severe (${fmtPct(c.probabilities.severe, 0)}): ${a.projections.severe.defaultYear ? "default in " + lbl(a.projections.severe.defaultYear) : "no default"}, IRR ${fmtPct(R.severe.irr)}.`,
    recoveryText: `If the company defaults, recovery value is ${fmtM(a.recovery.severe.value, 0)} (${a.recovery.severe.basis}) in the severe case → ${fmtPct(rec("severe"), 0)} recovery (${fmtPct(1 - rec("severe"), 0)} LGD) on the target tranche; downside ${fmtPct(rec("downside"), 0)}.`,
    decisionText,
  };
}
