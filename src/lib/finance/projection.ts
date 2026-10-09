import type { Company, FinancialYear, ScenarioAssumptions, ScenarioKey } from "../types";

export function statement(p: { year: number; label?: string; revenue: number; cogs: number; ebitda: number; da: number; sbc?: number; interest: number; capex: number; deltaNwc: number; taxRate?: number; taxes?: number; fcfOverride?: number; isLtm?: boolean }): FinancialYear {
  const sbc = p.sbc ?? 0;
  const grossProfit = p.revenue - p.cogs;
  const opex = grossProfit - p.ebitda;
  const ebit = p.ebitda - p.da - sbc;
  const ebt = ebit - p.interest;
  const taxes = p.taxes ?? Math.max(0, ebt) * (p.taxRate ?? 0.25);
  const netIncome = ebt - taxes;
  const fcf = p.fcfOverride ?? netIncome + p.da + sbc - p.capex - p.deltaNwc;
  return { label: p.label, year: p.year, isLtm: p.isLtm, revenue: p.revenue, cogs: p.cogs, grossProfit, opex, ebitda: p.ebitda, da: p.da, sbc, ebit, interest: p.interest, ebt, taxes, netIncome, capex: p.capex, deltaNwc: p.deltaNwc, fcf };
}

export interface RefiEvent {
  trancheId: string; year: number; balanceAtMaturity: number; beginDebt: number; beginCash: number; ebitda: number;
  netLeverage: number | null; maxNetLeverage: number; proFormaInterest: number; coverage: number | null; minCoverage: number;
  refiRate: number; passes: boolean; interestAfter: number; repaid: number; unpaid: number;
  resolution: "Refinanced" | "Repaid from cash" | "Partly repaid from cash; remainder refinanced" | "Partially repaid; payment default" | "Payment default";
}

export interface ProjectionYear extends FinancialYear {
  debt: Record<string, number>;
  rates: Record<string, number>;
  cashInterest: number; pikInterest: number; mandatoryAmort: number; revolverDraw: number; maturityRepaid: number; sweep: number;
  totalDebt: number; securedDebt: number; cash: number; netDebt: number;
  grossLeverage: number | null; netLeverage: number | null; interestCoverage: number | null; dscr: number | null;
  liquidity: number;
  refinanced: string[]; repaid: string[]; refiEvents: RefiEvent[];
  fundingGap: number; unpaid: number; defaulted: boolean; firstDefault: boolean;
}

export interface Projection {
  scenario: ScenarioKey | "custom";
  years: ProjectionYear[];
  defaultYear: number | null;
}

const EPS = 0.001;

/** Mirrors the Excel Operating Model / Debt Schedule / Cash Flow logic line for line (see scripts/build_model.py). */
export function project(c: Company, a: ScenarioAssumptions, scenario: ScenarioKey | "custom" = "custom"): Projection {
  const last = c.history[c.history.length - 1];
  const daPct = last.da / last.revenue;
  const T = c.tranches;
  const n = T.length;
  const principal = T.map((t) => t.principal);
  let bal = [...principal];
  let refiedPrev = T.map(() => false);
  let cash = c.cash;
  let prevRev = last.revenue;
  const years: ProjectionYear[] = [];
  let defaultYear: number | null = null;

  for (let i = 0; i < 5; i++) {
    const year = c.baseYear + 1 + i;
    const revenue = prevRev * (1 + a.revenueGrowth[i]);
    const cogs = revenue * (1 - a.grossMargin[i]);
    const ebitda = revenue * a.ebitdaMargin[i];
    const da = revenue * daPct;
    const sbc = revenue * c.sbcPct;
    const sofr = c.sofr[i];
    const baseRate = T.map((t) => (t.floating ? Math.max(sofr, t.floor ?? 0) + (t.spread ?? 0) + a.rateShock : t.rate));
    const rate = T.map((_, k) => (refiedPrev[k] ? a.refiRate : baseRate[k]));
    const cashInt = bal.map((b, k) => b * rate[k]);
    const pik = bal.map((b, k) => b * (T[k].pik ?? 0));
    const icash = cashInt.reduce((s, x) => s + x, 0);
    const ipik = pik.reduce((s, x) => s + x, 0);
    const itot = icash + ipik;
    const st = statement({ year, revenue, cogs, ebitda, da, sbc, interest: itot, capex: revenue * a.capexPct, deltaNwc: a.nwcPctOfRevChange * (revenue - prevRev) + a.nwcExtraOutflowPct * revenue, taxRate: c.taxRate });
    const fcf = st.netIncome + da + sbc + ipik - st.capex - st.deltaNwc;

    const am = bal.map((b, k) => Math.min(b, T[k].amortPct * principal[k]));
    const cashA = cash + fcf + a.assetSales[i] - am.reduce((s, x) => s + x, 0);
    const draw = bal.map((b, k) => (T[k].kind === "revolver" && (year < T[k].maturityYear || refiedPrev[k]) ? Math.min(Math.max(0, -cashA), Math.max(0, (T[k].commitment ?? 0) - b)) : 0));
    const cashB = cashA + draw.reduce((s, x) => s + x, 0);
    const due = T.map((t) => (year === t.maturityYear ? 1 : 0));
    const begDebt = bal.reduce((s, x) => s + x, 0);
    const pfInt = bal.reduce((s, b, k) => s + b * (due[k] === 1 || refiedPrev[k] ? a.refiRate : baseRate[k]), 0);
    const netLevTest = ebitda > 0 ? (begDebt - cash) / ebitda : null;
    const covTest = pfInt > 0 ? ebitda / pfInt : null;
    const access = ebitda > 0 && (netLevTest as number) <= a.maxRefiNetLeverage && (covTest ?? Infinity) >= a.minRefiCoverage ? 1 : 0;
    const mt: number[] = [];
    let mtSum = 0;
    for (let k = 0; k < n; k++) {
      const v = due[k] * Math.min(bal[k] - am[k] + pik[k], Math.max(0, cashB - c.minCash * access - mtSum));
      mt.push(v); mtSum += v;
    }
    const cashC = cashB - mtSum;
    const gap = Math.max(0, -cashC);
    const sweepAv = Math.max(0, cashC - c.minCash) * c.sweepPct;
    const op: number[] = [];
    let opSum = 0;
    for (let k = 0; k < n; k++) {
      const v = (T[k].prepay ? 1 : 0) * Math.min(bal[k] + draw[k] + pik[k] - am[k] - mt[k], Math.max(0, sweepAv - opSum));
      op.push(v); opSum += v;
    }
    const cashEnd = cashC - opSum;
    const unpaidArr = bal.map((b, k) => due[k] * (1 - access) * (b - am[k] + pik[k] - mt[k]));
    const unpaid = unpaidArr.reduce((s, x) => s + x, 0);
    const dflag = gap > EPS || unpaid > EPS;
    const firstDefault = dflag && defaultYear == null;
    if (firstDefault) defaultYear = year;

    const refiEvents: RefiEvent[] = [];
    T.forEach((t, k) => {
      if (due[k] !== 1) return;
      const balanceAtMaturity = bal[k] - am[k] + pik[k];
      const passes = access === 1;
      refiEvents.push({
        trancheId: t.id, year, balanceAtMaturity, beginDebt: begDebt, beginCash: cash, ebitda, netLeverage: netLevTest, maxNetLeverage: a.maxRefiNetLeverage,
        proFormaInterest: pfInt, coverage: covTest, minCoverage: a.minRefiCoverage, refiRate: a.refiRate, passes, interestAfter: passes ? Math.max(0, balanceAtMaturity - mt[k]) * a.refiRate : 0,
        repaid: mt[k], unpaid: unpaidArr[k],
        resolution: mt[k] >= balanceAtMaturity - EPS ? "Repaid from cash" : passes ? (mt[k] > EPS ? "Partly repaid from cash; remainder refinanced" : "Refinanced") : unpaidArr[k] > EPS ? (mt[k] > EPS ? "Partially repaid; payment default" : "Payment default") : "Repaid from cash",
      });
    });

    const end = bal.map((b, k) => b + draw[k] + pik[k] - am[k] - mt[k] - op[k]);
    const totalDebt = end.reduce((s, x) => s + x, 0);
    const secured = end.reduce((s, x, k) => s + (T[k].secured ? x : 0), 0);
    const undrawn = T.reduce((s, t, k) => s + (t.kind === "revolver" ? Math.max(0, (t.commitment ?? 0) - end[k]) : 0), 0);
    const netDebt = totalDebt - cashEnd;
    const mand = am.reduce((s, x) => s + x, 0);
    years.push({
      ...st, fcf, debt: Object.fromEntries(T.map((t, k) => [t.id, end[k]])), rates: Object.fromEntries(T.map((t, k) => [t.id, rate[k]])),
      cashInterest: icash, pikInterest: ipik, mandatoryAmort: mand, revolverDraw: draw.reduce((s, x) => s + x, 0), maturityRepaid: mtSum, sweep: opSum,
      totalDebt, securedDebt: secured, cash: cashEnd, netDebt,
      grossLeverage: ebitda > 0 ? totalDebt / ebitda : null, netLeverage: ebitda > 0 ? netDebt / ebitda : null, interestCoverage: icash > 0 ? ebitda / icash : null,
      dscr: icash + mand > 0 ? (ebitda - st.capex - st.taxes) / (icash + mand) : null,
      liquidity: Math.max(0, cashEnd) + undrawn,
      refinanced: T.filter((_, k) => due[k] === 1 && access === 1).map((t) => t.id), repaid: T.filter((_, k) => mt[k] > EPS).map((t) => t.id), refiEvents,
      fundingGap: gap, unpaid, defaulted: defaultYear != null && year >= defaultYear, firstDefault,
    });
    refiedPrev = refiedPrev.map((r, k) => r || (due[k] === 1 && access === 1));
    bal = end; cash = cashEnd; prevRev = revenue;
  }
  return { scenario, years, defaultYear };
}
