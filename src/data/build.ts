import { type Company, type CompanySpec, type Covenant, type FinancialYear, type SourceRef, type Tranche } from "@/lib/types";
import { statement } from "@/lib/finance/projection";
import { DEFAULT_THRESHOLDS, SCENARIO_PROBABILITY } from "@/lib/config";
import { demoDiligence } from "./diligence";

type K = Tranche["kind"];
export const DEMO_SOFR0 = 0.0425;
/** Demo tranche helper: `rate` is the all-in rate at the as-of date; floating tranches get spread = rate − SOFR(0). */
export const tr = (
  id: string, name: string, kind: K, seniority: number, secured: boolean, principal: number, rate: number,
  floating: boolean, maturityDate: string, o: Partial<Tranche> = {}, fyEndMonth = 12,
): Tranche => {
  const y = Number(maturityDate.slice(0, 4)), m = Number(maturityDate.slice(5, 7));
  return {
    id, name, kind, seniority, secured, principal, rate, floating, maturityDate, maturityYear: y + (m > fyEndMonth ? 1 : 0), amortPct: 0, covenants: [],
    spread: floating ? Math.round((rate - DEMO_SOFR0) * 100000) / 100000 : undefined, prepay: kind === "revolver", ...o,
  };
};

const INT_HIST = [0.85, 0.9, 0.95, 1];

export function buildHistory(s: CompanySpec): FinancialYear[] {
  const interestLtm = s.tranches.reduce((a, t) => a + t.principal * (t.floating ? DEMO_SOFR0 + (t.spread ?? 0) : t.rate), 0);
  const lastM = s.margin[s.margin.length - 1];
  return s.rev.map((revenue, i) => {
    const prev = i === 0 ? revenue / (1 + s.baseGrowth) : s.rev[i - 1];
    const gm = s.grossMargin + (s.margin[i] - lastM);
    return statement({
      year: 2022 + i, label: `FY${2022 + i}A`, revenue, cogs: revenue * (1 - gm), ebitda: revenue * s.margin[i], da: revenue * s.daPct,
      interest: interestLtm * INT_HIST[i], capex: revenue * s.capexPct, deltaNwc: s.nwcPct * (revenue - prev),
    });
  });
}

const demoSources = (s: CompanySpec): SourceRef[] => [
  { id: `${s.id}-fin`, source: "CreditIQ demo dataset", document: `${s.name} — illustrative financial statements FY2022–FY2025`, documentDate: "2026-03-31", retrievedDate: "2026-03-31", dataType: "Income statement / cash flow", period: "FY2022–FY2025", isDemo: true },
  { id: `${s.id}-debt`, source: "CreditIQ demo dataset", document: `${s.name} — illustrative capital structure & covenants`, documentDate: "2026-03-31", retrievedDate: "2026-03-31", dataType: "Debt schedule", period: "As of 2026-03-31", isDemo: true },
  { id: `${s.id}-px`, source: "CreditIQ demo dataset", document: "Illustrative indicative bid marks (% of par)", documentDate: "2026-03-31", retrievedDate: "2026-03-31", dataType: "Market price", period: "2026-03-31", isDemo: true },
];

/** Demo companies carry their old per-tranche maintenance covenants; convert them to company-level covenant objects (hypothetical basis). */
function legacyCovenants(s: CompanySpec): Covenant[] {
  const out: Covenant[] = [];
  const lev = s.tranches.filter((t) => t.maxNetLeverage != null).map((t) => t.maxNetLeverage as number);
  const cov = s.tranches.filter((t) => t.minInterestCoverage != null).map((t) => t.minInterestCoverage as number);
  if (lev.length) out.push({ id: "lev", label: "Maximum net leverage", type: "maxNetLeverage", thresholds: Array(5).fill(Math.min(...lev)), basis: "hypothetical", note: "Demo covenant (illustrative)" });
  if (cov.length) out.push({ id: "cov", label: "Minimum interest coverage", type: "minInterestCoverage", thresholds: Array(5).fill(Math.max(...cov)), basis: "hypothetical", note: "Demo covenant (illustrative)" });
  return out;
}

export function buildCompany(s: CompanySpec): Company {
  const rev = s.tranches.find((t) => t.kind === "revolver");
  return {
    ...s, dataClass: "demo", history: buildHistory(s), undrawnRevolver: rev ? Math.max(0, (rev.commitment ?? rev.principal) - rev.principal) : 0, sources: demoSources(s),
    baseYear: 2025, baseLabel: "FY2025A", periodLabels: [2026, 2027, 2028, 2029, 2030].map((y) => `FY${y}E`), asOf: "2026-03-31", fyEndMonth: 12,
    sofr: [0.0425, 0.04, 0.0375, 0.0375, 0.0375], taxRate: 0.25, sbcPct: 0, minCash: 0, sweepPct: 1, adminPct: 0.04, accruedMonths: 3, resolutionLag: 1, deficiencyRank: 99,
    covenants: legacyCovenants(s), diligenceItems: demoDiligence(s.id, s.assetBase > s.ev), thresholds: DEFAULT_THRESHOLDS, termsLabel: "DEMO INVESTMENT TERMS",
    probabilities: { ...SCENARIO_PROBABILITY }, provenance: [], assetValueBasis: "Illustrative appraised / collateral value (DEMO)", notes: ["All figures are fictional and illustrative."],
  };
}
