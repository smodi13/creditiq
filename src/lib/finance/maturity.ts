import { MATURITY_MATERIAL_PCT } from "../config";
import type { Company, Tranche } from "../types";
import type { Projection } from "./projection";

export interface MaturityBucket {
  year: number; label: string; amount: number; pctOfDebt: number; tranches: string[];
  liquidityAvailable: number; // projected cash + undrawn revolver entering the period + that period's positive FCF
  refiRequirement: number; // amount not covered by projected liquidity
  coverage: number | null; // liquidity ÷ amount
  risk: "Low" | "Medium" | "High";
  flag: string | null;
}
export interface MaturityAlert { level: "none" | "watch" | "critical"; amount: number; pct: number; message: string }

/** Maturity wall in model periods, enriched with projected liquidity (selected scenario) and the refinancing requirement. */
export function maturityWall(c: Pick<Company, "tranches" | "baseYear" | "periodLabels" | "cash" | "undrawnRevolver">, proj?: Projection): MaturityBucket[] {
  const total = c.tranches.reduce((s, x) => s + x.principal, 0) || 1;
  const years = [...new Set(c.tranches.map((x) => x.maturityYear))].sort((a, b) => a - b);
  return years.map((year) => {
    const ts = c.tranches.filter((x) => x.maturityYear === year);
    const amount = ts.reduce((s, x) => s + x.principal, 0);
    const idx = year - c.baseYear - 1;
    let liq = c.cash + c.undrawnRevolver;
    const beyond = idx >= 5;
    if (proj && beyond) liq = Math.max(0, proj.years[4].cash) + (proj.years[4].liquidity - Math.max(0, proj.years[4].cash)); // beyond the horizon: liquidity at the end of period 5
    if (proj && idx >= 0 && idx < 5) {
      const prev = idx === 0 ? null : proj.years[idx - 1];
      const begCash = prev ? prev.cash : c.cash;
      const undrawn = prev ? prev.liquidity - Math.max(0, prev.cash) : c.undrawnRevolver;
      liq = Math.max(0, begCash) + undrawn + Math.max(0, proj.years[idx].fcf);
    }
    const refi = Math.max(0, amount - liq);
    const coverage = amount > 0 ? liq / amount : null;
    const pct = amount / total;
    const risk: MaturityBucket["risk"] = beyond ? (refi > 0 ? "Medium" : "Low") : refi > 0 && pct >= MATURITY_MATERIAL_PCT ? "High" : refi > 0 || pct >= 0.3 ? "Medium" : "Low";
    const label = idx >= 0 && idx < 5 ? c.periodLabels[idx] : beyond ? `${year} (beyond horizon)` : String(year);
    const flag = risk === "High" ? `$${amount.toFixed(0)}M maturity in ${label}; only $${liq.toFixed(0)}M projected liquidity; $${refi.toFixed(0)}M refinancing requirement` : null;
    return { year, label, amount, pctOfDebt: pct, tranches: ts.map((x) => x.name), liquidityAvailable: liq, refiRequirement: refi, coverage, risk, flag };
  });
}

/** Alert when material debt is due within `windowPeriods` model periods. */
export function maturityAlert(c: Pick<Company, "tranches" | "baseYear">, liquidity: number, windowPeriods: number, materialPct = MATURITY_MATERIAL_PCT): MaturityAlert {
  const total = c.tranches.reduce((s, x) => s + x.principal, 0) || 1;
  const amount = c.tranches.filter((x: Tranche) => x.maturityYear <= c.baseYear + windowPeriods).reduce((s, x) => s + x.principal, 0);
  const pct = amount / total;
  if (pct < materialPct) return { level: "none", amount, pct, message: `No material maturities within ${windowPeriods} period(s)` };
  const level = amount > liquidity ? "critical" : "watch"; // critical = near-term maturities exceed liquidity
  return { level, amount, pct, message: `${(pct * 100).toFixed(0)}% of debt ($${amount.toFixed(0)}M) due within ${windowPeriods} period(s); liquidity covers ${((liquidity / (amount || 1)) * 100).toFixed(0)}%` };
}
