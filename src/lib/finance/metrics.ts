import type { Company, FinancialYear, Tranche } from "../types";

export interface MetricRow {
  key: string; label: string; value: number | null; kind: "x" | "pct" | "$"; formula: string; inputs: Record<string, number>;
}
const div = (a: number, b: number): number | null => (b === 0 ? null : a / b);

export const totalDebt = (t: Tranche[]) => t.reduce((s, x) => s + x.principal, 0);
/** Principal due in model periods up to `baseYear + periods` (period 1 = first projection period). */
export const debtDueWithin = (c: Pick<Company, "tranches" | "baseYear">, periods: number) =>
  c.tranches.filter((x) => x.maturityYear <= c.baseYear + periods).reduce((s, x) => s + x.principal, 0);
export const debtDue12m = (c: Pick<Company, "tranches" | "baseYear">) => debtDueWithin(c, 1);

/** Cash interest at today's balances and the first projected period's rates (used for forward-looking obligation sizing). */
export function annualInterest(c: Pick<Company, "tranches" | "sofr">): number {
  return c.tranches.reduce((s, t) => s + t.principal * (t.floating ? Math.max(c.sofr[0], t.floor ?? 0) + (t.spread ?? 0) : t.rate), 0);
}

export function creditMetrics(c: Company, ltm: FinancialYear = c.history[c.history.length - 1]): MetricRow[] {
  const debt = totalDebt(c.tranches);
  const netDebt = debt - c.cash;
  const interest = ltm.interest;
  const amort = c.tranches.reduce((s, t) => s + Math.min(t.principal, t.amortPct * t.principal), 0);
  const liquidity = c.cash + c.undrawnRevolver;
  const std = debtDue12m(c);
  const stObl = std + amort + interest;
  const curLiab = c.currentLiabExDebt + std;
  const secured = c.tranches.filter((t) => t.secured).reduce((s, t) => s + t.principal, 0);
  const row = (key: string, label: string, value: number | null, kind: MetricRow["kind"], formula: string, inputs: Record<string, number>): MetricRow => ({ key, label, value, kind, formula, inputs });
  return [
    row("totalDebt", "Total debt", debt, "$", "Σ tranche principal (face value)", { debt }),
    row("netDebt", "Net debt", netDebt, "$", "Total debt − cash", { debt, cash: c.cash }),
    row("grossLev", "Gross leverage (Debt / EBITDA)", div(debt, ltm.ebitda), "x", "Total debt ÷ EBITDA", { debt, ebitda: ltm.ebitda }),
    row("securedLev", "Secured leverage", div(secured, ltm.ebitda), "x", "Secured debt ÷ EBITDA", { secured, ebitda: ltm.ebitda }),
    row("netLev", "Net leverage", div(netDebt, ltm.ebitda), "x", "Net debt ÷ EBITDA", { netDebt, ebitda: ltm.ebitda }),
    row("intCov", "Interest coverage (EBIT / interest)", div(ltm.ebit, interest), "x", "EBIT ÷ interest expense", { ebit: ltm.ebit, interest }),
    row("ebitdaInt", "EBITDA / interest", div(ltm.ebitda, interest), "x", "EBITDA ÷ interest expense", { ebitda: ltm.ebitda, interest }),
    row("fcfDebt", "FCF / debt", div(ltm.fcf, debt), "pct", "Free cash flow ÷ total debt", { fcf: ltm.fcf, debt }),
    row("dscr", "Debt service coverage", div(ltm.ebitda - ltm.capex - ltm.taxes, interest + amort), "x", "(EBITDA − capex − taxes) ÷ (interest + mandatory amortization)", { ebitda: ltm.ebitda, capex: ltm.capex, taxes: ltm.taxes, interest, amort }),
    row("cashConv", "Cash conversion", div(ltm.ebitda - ltm.capex, ltm.ebitda), "pct", "(EBITDA − capex) ÷ EBITDA", { ebitda: ltm.ebitda, capex: ltm.capex }),
    row("liqRatio", "Liquidity ratio", div(liquidity, stObl), "x", "(Cash + undrawn revolver) ÷ (debt due next period + amortization + interest)", { liquidity, stObl }),
    row("curRatio", "Current ratio", div(c.currentAssets, curLiab), "x", "Current assets ÷ (current liabilities ex-debt + debt due next period)", { currentAssets: c.currentAssets, curLiab }),
    row("stDebtLiq", "Short-term debt / liquidity", div(std, liquidity), "x", "Debt due next period ÷ (cash + undrawn revolver)", { std, liquidity }),
  ];
}
export const metric = (rows: MetricRow[], key: string): number | null => rows.find((r) => r.key === key)?.value ?? null;
