import { z } from "zod";

export const ScenarioKey = z.enum(["base", "downside", "severe"]);
export type ScenarioKey = z.infer<typeof ScenarioKey>;
export const SCENARIOS: ScenarioKey[] = ["base", "downside", "severe"];
export const SCENARIO_LABEL: Record<ScenarioKey, string> = { base: "Base Case", downside: "Downside", severe: "Severe Downside" };

export const Recommendation = z.enum(["Attractive", "Watch", "Avoid", "Distressed Opportunity", "Requires Further Diligence"]);
export type Recommendation = z.infer<typeof Recommendation>;

/** Where a number comes from. Shown as a badge wherever a figure is displayed. */
export type DataClass = "public" | "demo";
export type DataKind = "reported" | "derived" | "assumption" | "projection" | "demo";

export const SourceRef = z.object({
  id: z.string(),
  source: z.string(),
  document: z.string(),
  url: z.string().optional(),
  documentDate: z.string(),
  retrievedDate: z.string(),
  dataType: z.string(),
  period: z.string().optional(),
  accession: z.string().optional(),
  isDemo: z.boolean(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** One sourced datapoint (public-filing cases). Mirrors data/real/*.datapoints.json. */
export interface DataPoint {
  id: string; company: string; metric: string; value: number | null; unit: string; period: string;
  filing: string; accession: string; filingDate: string; url: string; section: string; page: string | null;
  retrieved: string; kind: "reported"; rawText: string; note: string;
}

export const TrancheKind = z.enum(["revolver", "term_loan", "senior_notes", "second_lien", "unsecured_notes", "subordinated", "mortgage", "convertible", "preferred"]);

export const Tranche = z.object({
  id: z.string(),
  name: z.string(),
  kind: TrancheKind,
  seniority: z.number().int().min(1), // 1 = most senior; equal rank = pari passu
  secured: z.boolean(),
  principal: z.number().min(0), // face value / legal claim, $M
  commitment: z.number().min(0).optional(),
  rate: z.number().min(0).max(0.5), // fixed coupon (when !floating)
  spread: z.number().min(0).max(0.5).optional(), // over SOFR (when floating)
  floor: z.number().min(0).max(0.2).optional(), // SOFR floor
  pik: z.number().min(0).max(0.5).optional(), // PIK rate, accrues to principal
  floating: z.boolean(),
  maturityYear: z.number().int(), // model period in which the tranche matures (derived from maturityDate)
  maturityDate: z.string(),
  amortPct: z.number().min(0).max(1),
  prepay: z.boolean().optional(), // eligible for cash sweep
  covenants: z.array(z.string()),
  price: z.number().min(0).max(150).optional(), // mark / purchase price, % of par
  collateral: z.string().optional(),
  collateralPct: z.number().min(0).max(1).optional(), // share of recovery value ring-fenced for this tranche (specific lien); undefined = all-asset / pari
  callProtection: z.string().optional(),
  payFreq: z.number().optional(), // coupon payments per year (contractual-timing cross-check); default 1
  refiAssumption: z.string().optional(),
  maxNetLeverage: z.number().optional(), // legacy per-tranche maintenance covenants (demo data); converted to company covenants
  minInterestCoverage: z.number().optional(),
});
export type Tranche = z.infer<typeof Tranche>;

export interface FinancialYear {
  label?: string;
  year: number;
  isLtm?: boolean;
  revenue: number; cogs: number; grossProfit: number; opex: number; ebitda: number; da: number; sbc: number; ebit: number;
  interest: number; ebt: number; taxes: number; netIncome: number; capex: number; deltaNwc: number; fcf: number;
}

export const ScenarioAssumptions = z.object({
  revenueGrowth: z.array(z.number().min(-0.9).max(2)).length(5),
  grossMargin: z.array(z.number().min(-1).max(1)).length(5),
  ebitdaMargin: z.array(z.number().min(-0.5).max(0.95)).length(5),
  capexPct: z.number().min(0).max(1),
  nwcPctOfRevChange: z.number().min(-1).max(1),
  nwcExtraOutflowPct: z.number().min(-0.2).max(0.2), // other cash items, % of revenue (+ = outflow)
  rateShock: z.number().min(-0.05).max(0.2), // added to floating rates
  refiRate: z.number().min(0).max(0.4),
  maxRefiNetLeverage: z.number().min(0).max(30),
  minRefiCoverage: z.number().min(0).max(10),
  exitMultiple: z.number().min(0).max(40),
  exitPrice: z.number().min(0).max(150), // cap on non-default exit price, % of par
  distressMultiple: z.number().min(0).max(40),
  assetValueDecline: z.number().min(0).max(1),
  liquidationRecovery: z.number().min(0).max(1),
  assetSales: z.array(z.number().min(0)).length(5), // net disposition proceeds by period, $M (revenue/EBITDA effects must be in the growth/margin arrays)
});
export type ScenarioAssumptions = z.infer<typeof ScenarioAssumptions>;

export type CovenantType = "maxNetLeverage" | "minInterestCoverage" | "maxLTV" | "maxSecuredLTV" | "minLiquidity" | "minEBITDA";
export interface Covenant {
  id: string; label: string; type: CovenantType;
  thresholds: number[]; // one per projection period
  basis: "disclosed" | "hypothetical"; // disclosed = in the issuer's documents; hypothetical = underwriting assumption
  active?: boolean; // false = shown for reference (e.g. terminated) but not tested
  reported?: number; // company-reported ratio at the reporting date (reference only)
  reportedLabel?: string;
  note?: string;
}

export type DiligenceStatus = "Not Started" | "In Progress" | "Complete" | "Issue Identified";
export interface DiligenceItem {
  id: string; category: "Financial" | "Business" | "Debt" | "Legal" | "Asset / Real Estate" | "Commercial";
  item: string; status: DiligenceStatus; priority: "High" | "Medium" | "Low"; notes: string; source: string; date: string; question: string;
}

export interface Thresholds { hurdleIrr: number; minYield: number; maxNetLeverage: number; minRecovery: number; minCovenantHeadroom: number; minDownsideIrr: number }

export interface HistInput { key: string; label: string; group: "income" | "cash" | "memo"; values: Record<string, number>; src?: Record<string, string> }
/** Source-level historical inputs, so the Excel model can reproduce the standardized statements by formula. */
export interface HistoricalSpec {
  mode: "bridge" | "cfo"; // bridge: FCF = NI + D&A + SBC − capex − ΔNWC (ΔNWC is an input); cfo: FCF = CFO − capex (ΔNWC & other is the derived plug)
  columns: { id: string; label: string; kind: "fy" | "ytd" | "ltm"; year?: number }[];
  ltm?: { base: string; add: string; sub: string };
  inputs: HistInput[];
  lines: Record<string, [string, number][]>; // standardized line -> components (input key, sign)
  checks?: { label: string; calcLine: string; reportedKey: string }[]; // model-calculated EBITDA/NOI vs company-reported
}

export interface Snapshot { label: string; totalDebt: number; cash: number; undrawnRevolver: number; ebitda: number; interest: number; fcf: number }

export interface MonitoringActuals {
  label: string; source: string;
  revenueYoY: number; ebitdaYoY: number; netLeverage: number; coverage: number; liquidity: number; ltmEbitda: number; ltmRevenue: number; debt: number; cash: number;
}

export interface ThesisPlan {
  statement: string;
  entryDate: string;
  entryBasis: string; // what the entry metrics were measured on
  entryMetrics: { revenue: number; ebitda: number; netLeverage: number; coverage: number; liquidity: number }; // measured at entry from the filing
  plan: { revenueGrowthYoY: number; ebitdaGrowthYoY: number; netLeverageMax: number; coverageMin: number; liquidityMin: number };
}

export interface CompanySpec {
  id: string; name: string; ticker: string; sector: string; industry: string; hq: string;
  status: Recommendation; description: string;
  dataClass?: DataClass;
  caseTitle?: string; // real cases
  rev: number[]; margin: number[]; grossMargin: number; daPct: number; capexPct: number; nwcPct: number; // demo history generator
  cash: number; currentAssets: number; currentLiabExDebt: number;
  assetBase: number; ev: number;
  baseGrowth: number; cyc: number; baseRefiRate: number; entryMultiple: number; distressMultiple: number; liqRecovery: number;
  tranches: Tranche[];
  target: { trancheId: string; holdYears: number; feePct: number; face?: number };
  catalystScore: number;
  thesis: string; upside: string[]; risks: string[]; catalysts: string[]; diligence: string[]; industryView: string;
  overrides?: Partial<Record<ScenarioKey, Partial<ScenarioAssumptions>>>;
}

export interface Company extends Omit<CompanySpec, "dataClass"> {
  dataClass: DataClass;
  priorSnapshot?: Snapshot;
  historicalSpec?: HistoricalSpec;
  assetComponents?: { label: string; value: number; dp?: string }[];
  assetCapRate?: number; // when set: asset base = LTM NOI ÷ capRate + components
  monitoring?: MonitoringActuals;
  history: FinancialYear[];
  undrawnRevolver: number;
  sources: SourceRef[];
  baseYear: number; // label of the base (LTM / last actual) period; projection periods are baseYear+1..+5
  baseLabel: string;
  periodLabels: string[]; // 5 projection period labels
  asOf: string;
  fyEndMonth: number; // 12 = calendar FY; 6 = LTM June periods
  sofr: number[]; // base-rate curve for the 5 projection periods (macro assumption)
  taxRate: number;
  sbcPct: number;
  minCash: number;
  sweepPct: number;
  adminPct: number;
  accruedMonths: number;
  resolutionLag: number;
  deficiencyRank: number; // rank at which secured deficiency claims share with general creditors
  covenants: Covenant[];
  diligenceItems: DiligenceItem[];
  thresholds: Thresholds;
  termsLabel: "HYPOTHETICAL INVESTMENT TERMS" | "DEMO INVESTMENT TERMS";
  probabilities: Record<ScenarioKey, number>;
  provenance: DataPoint[];
  thesisPlan?: ThesisPlan;
  assetValueBasis: string;
  notes: string[]; // analyst notes: data-quality, derivation and modeling caveats
}
