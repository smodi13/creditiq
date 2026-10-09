// Public-company underwriting case: AMC Networks Inc. (now AMC Global Media Inc.), NASDAQ: AMCX.
// Historical numbers come ONLY from data/real/amcx.datapoints.json (verified against the SEC filings by scripts/real_cases.py).
// Everything labelled "assumption"/"hypothetical" below is the analyst's, not the company's, and not a real transaction.
import { tr } from "../build";
import { DEFAULT_THRESHOLDS } from "@/lib/config";
import type { Company, Covenant, DiligenceItem, HistoricalSpec, SourceRef, Tranche } from "@/lib/types";
import raw from "../../../data/real/amcx.datapoints.json";
import { lookup, ltmOf, realYear, type DpFile, type StdLines } from "./util";

const L = lookup(raw as unknown as DpFile);
const std = (p: string): StdLines => {
  const sbc = L.v("sbc", p);
  return { revenue: L.v("revenue", p), cogs: L.v("direct_costs", p), opexAdj: L.v("sga", p) - sbc - L.v("cloud_amort", p) - L.v("jv_aoi", p), da: L.v("da", p), sbc, interest: L.v("interest_expense", p), taxes: L.v("taxes", p), capex: L.v("capex", p), cfo: L.v("cfo", p) };
};
const fy23 = std("FY2023"), fy24 = std("FY2024"), fy25 = std("FY2025"), h125 = std("H1-2025"), h126 = std("H1-2026");
const ltm = ltmOf(fy25, h126, h125);
const history = [realYear(2023, "FY2023A", fy23), realYear(2024, "FY2024A", fy24), realYear(2025, "FY2025A", fy25), realYear(2026, "LTM Jun-26", ltm, true)];
const mdy = (d: string) => d;

const N = (id: string, name: string, kind: Tranche["kind"], rank: number, secured: boolean, metric: string, rate: number, date: string, o: Partial<Tranche>) =>
  tr(id, name, kind, rank, secured, L.v(metric, "2026-06-30"), rate, false, date, o, 6);

const tranches: Tranche[] = [
  N("n32", "10.50% Senior Secured Notes due 2032", "senior_notes", 1, true, "debt_2032_secured", 0.105, "2032-07-15", {
    price: 95, payFreq: 2, collateral: "First-priority lien on substantially all assets of AMC Networks and guarantors", callProtection: "Non-call to 2028-07-15; 105.250% in 2028, 102.625% in 2029, par from 2030 (10-K Note 9)",
    refiAssumption: "Matures after the 5-period horizon; no refinancing required inside the model", covenants: ["Incurrence-based indenture covenants only (no maintenance covenants) — revolver and credit-agreement covenants terminated May 2026"],
  }),
  N("n29", "4.25% Senior Notes due 2029", "unsecured_notes", 2, false, "debt_2029_unsecured", 0.0425, "2029-02-15", { collateral: "Unsecured (guaranteed by domestic restricted subsidiaries)", refiAssumption: "$277M due Feb-2029; refinanced only if the market-access test passes", covenants: ["Incurrence-based indenture covenants"] }),
  N("cv29", "4.25% Convertible Senior Notes due 2029", "convertible", 2, false, "debt_2029_convert", 0.0425, "2029-02-15", { collateral: "Unsecured; convertible at 78.5083 Class A shares per $1,000", refiAssumption: "Treated as straight debt (conversion option ignored); $144M due Feb-2029", covenants: ["Indenture covenants; fundamental-change put"] }),
];
const cash = L.v("cash", "2026-06-30");
const assetBase = L.v("program_rights", "2026-06-30") + L.v("ar", "2026-06-30") + L.v("ppe", "2026-06-30") + L.v("intangibles", "2026-06-30");
const fy25debt = L.v("debt_total", "FY2025");
const revolver25 = 175; // FY2025 10-K: undrawn $175.0M revolver (text disclosure fy25_undrawn_revolver)
L.disclosure("fy25_undrawn_revolver");

const covDisclosed = (id: string, label: string, type: Covenant["type"], thr: number[], reported: number, note: string): Covenant => ({ id, label, type, thresholds: thr, basis: "disclosed", active: false, reported, reportedLabel: "reported at 2025-12-31", note });
const covenants: Covenant[] = [
  covDisclosed("cl_lev", "Credit agreement: max total net leverage (5.75x to 3/31/26, then 5.50x) — TERMINATED 2026-05-12", "maxNetLeverage", [5.5, 5.5, 5.5, 5.5, 5.5], parseFloat(L.disclosure("cov_net_lev_reported").rawText), "Defined on the credit-agreement basis (4.41x reported at FY2025). Applied only while the Term Loan A / revolver existed."),
  covDisclosed("cl_icr", "Credit agreement: min interest coverage (1.50x; 1.75x from 12/31/28) — TERMINATED 2026-05-12", "minInterestCoverage", [1.5, 1.5, 1.5, 1.75, 1.75], parseFloat(L.disclosure("cov_icr_reported").rawText), "Reported 2.01x at FY2025."),
  { id: "h_lev", label: "Hypothetical maintenance covenant: max net leverage (AOI basis)", type: "maxNetLeverage", thresholds: [5.25, 5.25, 5.0, 5.0, 5.0], basis: "hypothetical", note: "UNDERWRITING ASSUMPTION: a private-credit style package would add maintenance tests; set ~25% above LTM 4.1x." },
  { id: "h_icr", label: "Hypothetical maintenance covenant: min interest coverage (AOI / interest)", type: "minInterestCoverage", thresholds: [1.4, 1.4, 1.4, 1.5, 1.5], basis: "hypothetical", note: "UNDERWRITING ASSUMPTION: set ~25% below LTM 1.84x." },
  { id: "h_liq", label: "Hypothetical maintenance covenant: min liquidity ($M)", type: "minLiquidity", thresholds: [200, 200, 200, 200, 200], basis: "hypothetical", note: "UNDERWRITING ASSUMPTION: revolver is gone, so liquidity = cash." },
];

const dd = (id: string, category: DiligenceItem["category"], item: string, status: DiligenceItem["status"], priority: DiligenceItem["priority"], notes: string, source: string, question: string): DiligenceItem => ({ id: `amcx-${id}`, category, item, status, priority, notes, source, date: "2026-10-07", question });
const diligenceItems: DiligenceItem[] = [
  dd("f1", "Financial", "Historical financials tied to filings", "Complete", "High", "All 88 numeric inputs verified against the FY2025 10-K / FY2024 10-K / Q2-2026 10-Q text; calculated AOI equals company-reported AOI in all five periods.", "scripts/real_cases.py", "—"),
  dd("f2", "Financial", "Quality of earnings: AOI vs cash", "Issue Identified", "High", "AOI adds back share-based comp, cloud-computing amortization and JV AOI; AOI fell 46% in H1-2026 while CFO−capex stayed positive on program-rights timing.", "10-Q Q2-2026, Non-GAAP reconciliation", "How much of LTM FCF of ~$190M is timing from program-rights amortization vs spend?"),
  dd("f3", "Financial", "Programming spend vs amortization", "In Progress", "High", "Amortization of program rights $846.8M vs net program-rights cash investment $815.2M in FY2025; the gap is a one-off cash benefit if content spend rises.", "10-K FY2025, Cash flow statement", "What is the steady-state content cash need?"),
  dd("f4", "Financial", "Capex and working-capital run-rate", "Complete", "Low", "Capex 1.3% of revenue; asset-light.", "10-K FY2025", "—"),
  dd("b1", "Business", "Linear subscriber and ad-revenue decline", "In Progress", "High", "Subscription −2.9%, advertising −5.5%, content licensing −20.3% (H1-2026 vs H1-2025).", "10-Q Q2-2026, MD&A", "Is the decline rate accelerating beyond the base case (−4.5%)?"),
  dd("b2", "Business", "Streaming profitability and affiliate renewals", "Not Started", "Medium", "Streaming price increases are offsetting basic-subscriber losses.", "10-Q Q2-2026", "Which carriage agreements renew inside the hold period?"),
  dd("d1", "Debt", "Indenture review: priming and drop-down protections", "Not Started", "High", "Feb-2026 consent solicitation amended the 2032 indenture (restricted payments up to $50M; trademark transfers limited to non-exclusive licences).", "10-Q Q2-2026, Note 9", "Can collateral be moved to unrestricted subsidiaries?"),
  dd("d2", "Debt", "Maturity profile and refinancing plan", "In Progress", "High", "2029 Secured Notes ($875M) were exchanged into additional 2032 secured notes in March 2026; $420M of unsecured/convertible notes remain due Feb-2029; cash $464M.", "10-Q Q2-2026, Note 9", "Will the company pre-fund the Feb-2029 maturities from cash or refinance?"),
  dd("d3", "Debt", "Covenant package after revolver termination", "Issue Identified", "High", "Revolver and Term Loan A were terminated May 2026, so maintenance covenants no longer apply; liquidity is cash only.", "10-Q Q2-2026, Note 9", "Do we require maintenance covenants / a minimum-liquidity test in new money?"),
  dd("d4", "Debt", "Collateral and lien perfection", "Not Started", "Medium", "First-priority lien on substantially all assets of AMC Networks and guarantors.", "10-K FY2025, Note 9", "Which subsidiaries are non-guarantors (International)?"),
  dd("l1", "Legal", "Litigation / contingencies", "Not Started", "Low", "See 10-K Item 3 and Note 14.", "10-K FY2025", "Any claims ranking ahead of secured creditors?"),
  dd("l2", "Legal", "Program-rights obligations and leases (claims in distress)", "Not Started", "Medium", "$382M of program-rights obligations and $89M of leases at 2026-06-30 would be general claims.", "10-Q Q2-2026, Balance sheet", "Priority of programming creditors vs secured notes?"),
  dd("c1", "Commercial", "Industry conditions and valuation multiples", "In Progress", "Medium", "Linear TV network EV/AOI multiples compressed; model uses 4.0x–5.0x in distress.", "Analyst assumption", "Transaction comps for cable-network portfolios?"),
  dd("c2", "Commercial", "Macro sensitivity: advertising cycle", "Not Started", "Low", "Advertising is ~25% of revenue.", "10-K FY2025", "—"),
];

const mkInputs = (metrics: [string, string, "income" | "cash" | "memo"][], periods: string[]) => metrics.map(([key, label, group]) => ({
  key, label, group, values: Object.fromEntries(periods.map((p) => [p, L.o(key, p)])), src: Object.fromEntries(periods.filter((p) => raw.datapoints.some((d: { metric: string; period: string }) => d.metric === key && d.period === p)).map((p) => [p, `amcx.${key}.${p}`])),
}));
const PERIODS = ["FY2023", "FY2024", "FY2025", "H1-2025", "H1-2026"];
const historicalSpec: HistoricalSpec = {
  mode: "cfo",
  columns: [{ id: "FY2023", label: "FY2023A", kind: "fy", year: 2023 }, { id: "FY2024", label: "FY2024A", kind: "fy", year: 2024 }, { id: "FY2025", label: "FY2025A", kind: "fy", year: 2025 }, { id: "H1-2025", label: "H1-25A", kind: "ytd" }, { id: "H1-2026", label: "H1-26A", kind: "ytd" }, { id: "LTM", label: "LTM Jun-26", kind: "ltm" }],
  ltm: { base: "FY2025", add: "H1-2026", sub: "H1-2025" },
  inputs: mkInputs([
    ["revenue", "Revenues, net", "income"], ["direct_costs", "Technical and operating (excl. D&A)", "income"], ["sga", "Selling, general and administrative", "income"], ["sbc", "Share-based compensation (AOI add-back)", "income"],
    ["cloud_amort", "Cloud computing amortization (AOI add-back)", "income"], ["jv_aoi", "Majority-owned equity-investee AOI (AOI add-back)", "income"], ["da", "Depreciation and amortization", "income"],
    ["interest_expense", "Interest expense", "income"], ["taxes", "Income tax expense (benefit)", "income"], ["cfo", "Net cash provided by operating activities", "cash"], ["capex", "Capital expenditures", "cash"],
    ["impairment", "Impairment and other charges (memo, excluded from EBITDA)", "memo"], ["restructuring", "Restructuring and other related charges (memo, excluded)", "memo"], ["cash_interest", "Cash interest paid (memo)", "memo"], ["aoi_reported", "Adjusted operating income — company reported (check)", "memo"],
  ], PERIODS),
  lines: { revenue: [["revenue", 1]], cogs: [["direct_costs", 1]], opexAdj: [["sga", 1], ["sbc", -1], ["cloud_amort", -1], ["jv_aoi", -1]], da: [["da", 1]], sbc: [["sbc", 1]], interest: [["interest_expense", 1]], taxes: [["taxes", 1]], capex: [["capex", 1]], cfo: [["cfo", 1]] },
  checks: [{ label: "Calculated AOI vs company-reported AOI", calcLine: "ebitda", reportedKey: "aoi_reported" }],
};

export const amcxSources: SourceRef[] = Object.entries((raw as unknown as DpFile).documents).map(([k, d]) => ({
  id: k, source: "SEC EDGAR", document: `${d.company} — Form ${d.form}, period ended ${d.period}`, url: d.url, documentDate: d.filed, retrievedDate: "2026-10-07", dataType: d.form === "10-K" ? "Annual report" : "Quarterly report",
  period: d.period, accession: d.acc, isDemo: false,
}));
amcxSources.push({ id: "fred-sofr", source: "FRED (Federal Reserve Bank of St. Louis)", document: "SOFR — Secured Overnight Financing Rate (3.90% on 2026-10-06)", url: "https://fred.stlouisfed.org/series/SOFR", documentDate: "2026-10-06", retrievedDate: "2026-10-07", dataType: "Macro rate", isDemo: false });

const ltmEbitda = history[3].ebitda;
const entryNetLev = (fy25debt - L.v("cash", "FY2025")) / history[2].ebitda;

export const amcx: Company = {
  id: "amcx", name: "AMC Networks (AMC Global Media)", ticker: "AMCX", sector: "Media", industry: "Cable networks & streaming", hq: "New York, NY",
  status: "Requires Further Diligence", dataClass: "public", caseTitle: "Corporate credit — senior secured notes of a levered, declining linear-TV network",
  description: "Owner of AMC, BBC America, IFC, SundanceTV and WE tv plus the AMC+ / Acorn / Shudder streaming services and AMC Studios. Linear affiliate and advertising revenue is in secular decline while streaming grows; the company refinanced most of its 2029 debt into 10.50% secured notes due 2032 in 2026.",
  rev: [], margin: [], grossMargin: 0, daPct: 0, capexPct: 0, nwcPct: 0,
  cash, currentAssets: L.v("current_assets", "2026-06-30"), currentLiabExDebt: L.v("current_liabilities", "2026-06-30"), assetBase, ev: ltmEbitda * 5.5,
  baseGrowth: -0.045, cyc: 0.5, baseRefiRate: 0.11, entryMultiple: 5.5, distressMultiple: 5.0, liqRecovery: 0.3,
  tranches, target: { trancheId: "n32", holdYears: 3, feePct: 0, face: 100 }, catalystScore: 2,
  thesis: "Hypothetical: buy $100M face of the public 10.50% Senior Secured Notes due 2032 at an assumed 95. The notes are first-lien on substantially all assets and now sit ahead of only $420M of unsecured/convertible debt, but AOI fell 46% in H1-2026, coverage is below 2x, there is no revolver, and the $1.3B of secured claims is covered only ~1.1x by a going-concern value at 4.5x LTM AOI (and about 0.6x at the Downside trough). The question is whether a ~12% yield compensates for thin collateral coverage if linear decline accelerates.",
  upside: ["10.5% fixed coupon with a pull-to-par from an assumed 95 purchase price", "First-priority lien on substantially all assets; only $420M of debt ranks behind us", "Cash of $464M covers the Feb-2029 unsecured/convertible maturities", "Streaming price increases and cost actions could stabilise AOI"],
  risks: ["Linear subscriber, advertising and licensing revenue declining 3–20% YoY; AOI −46% in H1-2026", "Interest coverage 1.84x (AOI / interest) and falling; no revolver backstop", "Collateral is largely content library, receivables and brands — liquidation value is a fraction of book", "Priming / drop-down risk: indenture permits unrestricted-subsidiary investments up to specified baskets"],
  catalysts: ["Feb-2029 maturity of $420M unsecured/convertible notes", "Call protection steps down from 2028-07-15 (105.250% → par in 2030)", "H2-2026 content slate and affiliate renewals"],
  diligence: [], industryView: "Cable networks face a structural decline in basic subscribers and linear advertising. Creditors are paid by the cash flows of the existing library and by affiliate/streaming revenue; value in distress depends on the going-concern multiple placed on a shrinking AOI base.",
  overrides: {
    base: { revenueGrowth: [-0.045, -0.04, -0.035, -0.03, -0.03], ebitdaMargin: [0.14, 0.14, 0.138, 0.136, 0.134], capexPct: 0.014, nwcPctOfRevChange: 0, nwcExtraOutflowPct: -0.01, rateShock: 0, refiRate: 0.11, maxRefiNetLeverage: 6.0, minRefiCoverage: 1.25, exitMultiple: 5.5, exitPrice: 100, distressMultiple: 5.0, assetValueDecline: 0, liquidationRecovery: 0.3 },
    downside: { revenueGrowth: [-0.08, -0.07, -0.06, -0.05, -0.05], ebitdaMargin: [0.12, 0.11, 0.105, 0.10, 0.10], capexPct: 0.013, nwcExtraOutflowPct: 0.005, rateShock: 0.015, refiRate: 0.13, maxRefiNetLeverage: 5.5, minRefiCoverage: 1.5, exitMultiple: 5.0, exitPrice: 95, distressMultiple: 4.5, assetValueDecline: 0.15, liquidationRecovery: 0.3 },
    severe: { revenueGrowth: [-0.14, -0.12, -0.10, -0.08, -0.06], ebitdaMargin: [0.09, 0.075, 0.07, 0.07, 0.07], capexPct: 0.011, nwcExtraOutflowPct: 0.015, rateShock: 0.03, refiRate: 0.15, maxRefiNetLeverage: 5.0, minRefiCoverage: 1.75, exitMultiple: 4.0, exitPrice: 80, distressMultiple: 4.0, assetValueDecline: 0.35, liquidationRecovery: 0.3 },
  },
  history, historicalSpec, undrawnRevolver: 0, sources: amcxSources,
  assetComponents: [{ label: "Program rights, net", value: L.v("program_rights", "2026-06-30"), dp: "amcx.program_rights.2026-06-30" }, { label: "Accounts receivable, trade", value: L.v("ar", "2026-06-30"), dp: "amcx.ar.2026-06-30" }, { label: "Property and equipment, net", value: L.v("ppe", "2026-06-30"), dp: "amcx.ppe.2026-06-30" }, { label: "Intangible assets, net", value: L.v("intangibles", "2026-06-30"), dp: "amcx.intangibles.2026-06-30" }],
  baseYear: 2026, baseLabel: "LTM Jun-26", periodLabels: [2027, 2028, 2029, 2030, 2031].map((y) => `LTM Jun-${String(y).slice(2)}E`), asOf: "2026-06-30", fyEndMonth: 6,
  sofr: [0.039, 0.0375, 0.035, 0.035, 0.035], taxRate: 0.25, sbcPct: ltm.sbc / ltm.revenue, minCash: 150, sweepPct: 0, adminPct: 0.04, accruedMonths: 3, resolutionLag: 1, deficiencyRank: 99,
  covenants, diligenceItems, thresholds: { ...DEFAULT_THRESHOLDS, minYield: 0.10, minRecovery: 0.7 }, termsLabel: "HYPOTHETICAL INVESTMENT TERMS",
  probabilities: { base: 0.45, downside: 0.35, severe: 0.2 }, provenance: [],
  priorSnapshot: { label: "FY2025A (10-K, 2025-12-31)", totalDebt: fy25debt, cash: L.v("cash", "FY2025"), undrawnRevolver: revolver25, ebitda: history[2].ebitda, interest: history[2].interest, fcf: history[2].fcf },
  thesisPlan: {
    statement: "Senior secured notes remain money-good because AOI decline moderates, cash covers 2029 maturities and the first lien is covered by going-concern value.",
    entryDate: "2026-02-11", entryBasis: "FY2025A (10-K filed 2026-02-11), model basis",
    entryMetrics: { revenue: history[2].revenue, ebitda: history[2].ebitda, netLeverage: entryNetLev, coverage: history[2].ebitda / history[2].interest, liquidity: L.v("cash", "FY2025") + revolver25 },
    plan: { revenueGrowthYoY: -0.045, ebitdaGrowthYoY: -0.15, netLeverageMax: 3.6, coverageMin: 2.0, liquidityMin: 500 },
  },
  monitoring: {
    label: "H1-2026 (10-Q filed 2026-07-30)", source: "AMCX_Q2",
    revenueYoY: L.v("revenue", "H1-2026") / L.v("revenue", "H1-2025") - 1,
    ebitdaYoY: (h126.revenue - h126.cogs - h126.opexAdj) / (h125.revenue - h125.cogs - h125.opexAdj) - 1,
    netLeverage: (L.v("debt_total", "2026-06-30") - cash) / ltmEbitda, coverage: ltmEbitda / ltm.interest, liquidity: cash, ltmEbitda, ltmRevenue: ltm.revenue, debt: L.v("debt_total", "2026-06-30"), cash,
  },
  assetValueBasis: "Book value of program rights, receivables, PP&E and intangibles at 2026-06-30 (derived from the 10-Q balance sheet); liquidation recovery on that base is an analyst assumption (30%).",
  notes: [
    "EBITDA = Adjusted Operating Income (AOI), the company's non-GAAP measure: revenue − technical & operating − SG&A + share-based compensation + cloud-computing amortization + majority-owned equity-investee AOI. Model-calculated AOI equals reported AOI in every period.",
    "LTM Jun-26 = FY2025 + H1-2026 − H1-2025 for every flow line (formula in Excel). Balance-sheet and debt are as reported at 2026-06-30.",
    "FCF = reported CFO − capex; 'ΔNWC & other' is the derived plug (program-rights timing, restructuring, interest income, taxes paid vs provision).",
    "Impairment and restructuring charges are shown as reported but excluded from EBITDA; they are captured in the cash plug rather than estimated.",
    "The 2029 Secured Notes were exchanged into additional 2032 Secured Notes (Feb–Mar 2026) and the revolver / Term Loan A terminated (May 2026): debt is therefore taken at 2026-06-30, not at the FY2025 10-K.",
    "Hypothetical purchase price of 95.0 is an underwriting assumption; no market price is available in the filings.",
    "Credit-agreement covenants (max net leverage 5.50x, min interest coverage 1.50x) are real but terminated; they are listed for reference and not tested. Tested covenants are hypothetical.",
  ],
};
amcx.provenance = L.provenance();
void mdy;
