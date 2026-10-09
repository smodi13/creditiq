import type { Company, ScenarioAssumptions, ScenarioKey } from "../types";

interface Basis {
  cyc: number; baseGrowth: number; capexPct: number; nwcPct: number; baseRefiRate: number; entryMultiple: number; distressMultiple: number; liqRecovery: number;
  overrides?: Company["overrides"]; ltmMargin: number; ltmGrossMargin: number;
}

/** Default assumption sets derived from LTM results + cyclicality; per-company overrides win (real cases override everything explicitly). */
export function defaultAssumptions(c: Basis, key: ScenarioKey): ScenarioAssumptions {
  const m = c.ltmMargin, gm = c.ltmGrossMargin;
  const k = 0.5 + c.cyc; // revenue sensitivity
  const km = 0.4 + c.cyc; // margin sensitivity
  const five = (f: (i: number) => number) => [0, 1, 2, 3, 4].map(f);
  const base: ScenarioAssumptions = {
    revenueGrowth: five(() => c.baseGrowth),
    grossMargin: five((i) => gm + 0.002 * i),
    ebitdaMargin: five((i) => m + 0.002 * i),
    capexPct: c.capexPct, nwcPctOfRevChange: c.nwcPct, nwcExtraOutflowPct: 0, rateShock: 0, refiRate: c.baseRefiRate,
    maxRefiNetLeverage: 8.5, minRefiCoverage: 1.2, exitMultiple: c.entryMultiple, exitPrice: 100, distressMultiple: c.distressMultiple, assetValueDecline: 0, liquidationRecovery: c.liqRecovery, assetSales: [0, 0, 0, 0, 0],
  };
  let out: ScenarioAssumptions;
  if (key === "base") out = base;
  else if (key === "downside") {
    const g = [-0.06, -0.03, 0.0, 0.02, 0.02];
    const dm = [0.025, 0.035, 0.03, 0.025, 0.02];
    out = {
      ...base,
      revenueGrowth: g.map((x, i) => (x < 0 ? x * k : i === 2 ? c.baseGrowth / 2 : Math.min(x, c.baseGrowth))),
      ebitdaMargin: dm.map((x) => m - x * km),
      grossMargin: dm.map((x) => gm - x * km),
      capexPct: c.capexPct * 0.95, nwcExtraOutflowPct: 0.002, rateShock: 0.015, refiRate: c.baseRefiRate + 0.025,
      maxRefiNetLeverage: 5.5, minRefiCoverage: 1.8, exitMultiple: Math.max(3, c.entryMultiple - 1.5), exitPrice: 90, assetValueDecline: 0.15,
    };
  } else {
    const g = [-0.18, -0.1, -0.02, 0.01, 0.02];
    const dm = [0.06, 0.08, 0.07, 0.06, 0.05];
    out = {
      ...base,
      revenueGrowth: g.map((x) => (x < 0 ? x * k : Math.min(x, c.baseGrowth))),
      ebitdaMargin: dm.map((x) => Math.max(0.01, m - x * km)),
      grossMargin: dm.map((x, i) => Math.max(0.05, gm - x * km) + 0 * i),
      capexPct: c.capexPct * 0.8, nwcExtraOutflowPct: 0.006, rateShock: 0.03, refiRate: c.baseRefiRate + 0.05,
      maxRefiNetLeverage: 5.0, minRefiCoverage: 2.0, exitMultiple: Math.max(3, c.entryMultiple - 3), exitPrice: 70, assetValueDecline: 0.35,
    };
  }
  const o = c.overrides?.[key] ?? {};
  const res = { ...out, ...o };
  // opex ratio held at its LTM level: margin changes pass through gross margin unless the case overrides gross margin explicitly
  if (!o.grossMargin) res.grossMargin = res.ebitdaMargin.map((x) => x + (gm - m));
  return res;
}

export const assumptionsFor = (c: Company, key: ScenarioKey): ScenarioAssumptions => {
  const l = c.history[c.history.length - 1];
  return defaultAssumptions({ ...c, ltmMargin: l.ebitda / l.revenue, ltmGrossMargin: l.grossProfit / l.revenue }, key);
};
