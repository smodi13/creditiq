import type { Thresholds } from "./types";

// All tunable methodology parameters live here. Nothing in the UI hardcodes these.
export const SCORE_WEIGHTS = {
  leverage: 15, coverage: 15, liquidity: 10, fcf: 10, maturity: 10, marginStability: 10, revenueStability: 8, assetCoverage: 12, industry: 10,
} as const; // sums to 100

/** Linear scale: value at/better than `best` earns full weight, at/worse than `worst` earns zero. */
export const SCORE_THRESHOLDS = {
  leverage: { best: 2.0, worst: 7.0, unit: "x net debt / EBITDA" },
  coverage: { best: 5.0, worst: 1.0, unit: "x EBITDA / interest" },
  liquidity: { best: 2.0, worst: 0.5, unit: "x liquidity / 12m obligations" },
  fcf: { best: 0.12, worst: -0.02, unit: "FCF / total debt" },
  maturity: { best: 0.0, worst: 0.5, unit: "% of debt due within window" },
  marginStability: { best: 0.01, worst: 0.05, unit: "std-dev of EBITDA margin (pts)" },
  revenueStability: { best: 0.03, worst: 0.15, unit: "std-dev of revenue growth" },
  assetCoverage: { best: 2.0, worst: 0.6, unit: "x asset base / total debt" },
} as const;
export const SCORE_MATURITY_WINDOW = 3; // periods

/** Industry risk factor, 1.0 = lowest risk. Analyst judgment, not a model output. */
export const INDUSTRY_RISK: Record<string, number> = {
  Software: 0.8, Healthcare: 0.8, Infrastructure: 0.85, "Real Estate": 0.5, Industrials: 0.55, Materials: 0.45, Energy: 0.4,
  Consumer: 0.45, Telecom: 0.45, Transportation: 0.5, Autos: 0.35, Retail: 0.25, Media: 0.3, "Office REIT": 0.4,
};

export const MATURITY_WINDOW_YEARS = 3;
export const MATURITY_MATERIAL_PCT = 0.15;
export const SCENARIO_PROBABILITY = { base: 0.55, downside: 0.3, severe: 0.15 } as const;

export const RECOVERY = { adminClaimPct: 0.04, accruedMonths: 3, resolutionLagYears: 1.0 } as const;
export const SWEEP = { minCashPctRev: 0.0, sweepPct: 0.0 } as const;

export const DEFAULT_THRESHOLDS: Thresholds = { hurdleIrr: 0.12, minYield: 0.09, maxNetLeverage: 6.0, minRecovery: 0.6, minCovenantHeadroom: 0.15, minDownsideIrr: 0.0 };

/** Distressed Opportunity Score: opportunity drivers + safety (inverse risk) drivers, each 0-100, weights sum to 100. */
export const DISTRESS_WEIGHTS = {
  recovery: 20, entryDiscount: 15, catalyst: 10, position: 10, refiEvent: 5, // opportunity
  defaultSafety: 15, liquidity: 10, leverage: 5, coverage: 5, maturity: 3, fcf: 2, // risk (higher = safer)
} as const;

export const DISTRESS_FLAGS = {
  highLeverage: 5.0, lowCoverage: 2.0, nearTermMaturityPct: 0.25, nearTermYears: 2, ebitdaDecline: -0.05, priceDiscount: 90, recoveryToPrice: 1.2,
} as const;

export const ALERTS = {
  leverageIncrease: 0.5, coverageDecline: 0.5, liquidityDeclinePct: 0.2, maturityYears: 2, ebitdaDeclinePct: 0.1, covenantHeadroomPct: 0.15, recoveryDeclinePts: 5,
} as const;

export const RISK_BANDS = [
  { min: 75, label: "Low" }, { min: 60, label: "Moderate" }, { min: 45, label: "Elevated" }, { min: 0, label: "High" },
] as const;

/** Thesis-monitoring tolerances (actual vs entry plan). */
export const THESIS = { revenueShortfall: 0.02, ebitdaShortfall: 0.05, leverageSlack: 0.25, coverageSlack: 0.15, liquiditySlack: 0.10 } as const;
