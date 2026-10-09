// Public-company underwriting case: Brandywine Realty Trust (NYSE: BDN) — office REIT.
// Historical numbers come ONLY from data/real/bdn.datapoints.json (verified against SEC filings). Hypothetical-loan terms and
// analyst valuation assumptions are labelled as such throughout.
import { tr } from "../build";
import { DEFAULT_THRESHOLDS } from "@/lib/config";
import type { Company, Covenant, DiligenceItem, HistoricalSpec, SourceRef, Tranche } from "@/lib/types";
import raw from "../../../data/real/bdn.datapoints.json";
import { lookup, ltmOf, realYear, type DpFile, type StdLines } from "./util";

const L = lookup(raw as unknown as DpFile);
const q2Avail = parseFloat(/\$([\d.]+) million of available/.exec(L.disclosure("q2_available_revolver").rawText)![1]); // 425.5 at 2026-06-30, net of $25.5M letters of credit
const std = (p: string): StdLines => ({
  revenue: L.v("revenue", p), cogs: L.v("prop_opex", p) + L.v("re_taxes", p) + L.v("mgmt_exp", p), opexAdj: L.v("ga", p), da: L.v("da", p), sbc: 0,
  interest: L.v("interest_expense", p), taxes: L.v("taxes", p), capex: L.v("capex_ti", p) + L.v("capex_redev", p) + L.v("capex_dev", p) + L.v("leasing_costs", p), cfo: L.v("cfo", p),
});
const fy23 = std("FY2023"), fy24 = std("FY2024"), fy25 = std("FY2025"), h125 = std("H1-2025"), h126 = std("H1-2026");
const ltm = ltmOf(fy25, h126, h125);
const history = [realYear(2023, "FY2023A", fy23), realYear(2024, "FY2024A", fy24), realYear(2025, "FY2025A", fy25), realYear(2026, "LTM Jun-26", ltm, true)];
const ltmNoi = ltm.revenue - ltm.cogs;
const CAP = 0.075; // analyst cap rate on LTM NOI (assumption)
const cip = L.v("cip", "2026-06-30"), land = L.v("land", "2026-06-30"), jv = L.v("jv_investment", "2026-06-30");
const assetBase = ltmNoi / CAP + cip + land + jv;

const T = (id: string, name: string, kind: Tranche["kind"], rank: number, secured: boolean, principal: number, rate: number, floating: boolean, date: string, o: Partial<Tranche> = {}) =>
  ({ ...tr(id, name, kind, rank, secured, principal, rate, floating, date, o, 6), principal });
const notes = (id: string, label: string, metric: string, rate: number, date: string) =>
  T(id, label, "senior_notes", 2, false, L.v(metric, "2026-06-30"), rate, false, date, { collateral: "Unsecured (guaranteed by Brandywine Realty Trust)", covenants: ["Indenture: debt/asset, secured-debt and interest-coverage incurrence tests"] });

const NEW_LOAN = 400, REV_DRAWN = L.v("debt_revolver", "2026-06-30"), TL_REPAID = L.v("debt_term_loan", "2026-06-30");
const tranches: Tranche[] = [
  T("new", "Hypothetical Senior Secured Term Loan (S+525, 1% floor)", "term_loan", 1, true, NEW_LOAN, 0, true, "2031-06-30", {
    spread: 0.0525, floor: 0.01, amortPct: 0.01, price: 98, payFreq: 4, collateralPct: 0.3, collateral: "First-lien mortgages on a pledged pool of unencumbered properties (assumed 30% of asset value)", callProtection: "102 / 101 / par (hypothetical)",
    refiAssumption: "Bullet at Jun-2031 (outside horizon)", covenants: ["Hypothetical: max pool LTV 55%, min DSCR 1.60x, min liquidity $100M"],
  }),
  T("avira", "Avira Secured Term Loan (swapped to 5.81%)", "term_loan", 1, true, L.v("debt_avira", "2026-06-30"), 0.0581, false, "2033-06-30", { collateralPct: 0.033, collateral: "3025 JFK residential component (assumed collateral value = loan ÷ 60% LTV)", covenants: ["Property-level loan"] }),
  T("cpace", "3151 Market C-PACE Loan", "mortgage", 1, true, L.v("debt_cpace", "2026-06-30"), 0.0731, false, "2054-03-31", { collateralPct: 0.021, collateral: "3151 Market Street (assumed collateral value = loan ÷ 60% LTV)", covenants: ["Property assessment financing"] }),
  T("rcf", "Unsecured Revolver ($600M less LCs; hypothetically undrawn pro forma)", "revolver", 2, false, REV_DRAWN - REV_DRAWN, 0, true, "2027-06-30", {
    commitment: q2Avail + REV_DRAWN, spread: 0.015, prepay: true, collateral: "Unsecured", refiAssumption: "Extended to 2026-12-30; one further six-month extension to 2027-06-30 assumed exercised", covenants: ["Credit agreement: FCCR ≥ 1.5x; leverage ≤ 0.60; secured debt ≤ 0.40; unsecured/unencumbered ≤ 0.60; unencumbered CF / unsecured interest > 1.75x"],
  }),
  notes("n27", "3.95% Guaranteed Notes due Nov-2027", "debt_n2027", 0.0395, "2027-11-15"),
  notes("n28", "8.30% Guaranteed Notes due Mar-2028", "debt_n2028", 0.083, "2028-03-15"),
  notes("n29a", "8.875% Guaranteed Notes due Apr-2029", "debt_n2029a", 0.08875, "2029-04-15"),
  notes("n29b", "4.55% Guaranteed Notes due Oct-2029", "debt_n2029b", 0.0455, "2029-10-01"),
  notes("n31", "6.125% Guaranteed Notes due Jan-2031", "debt_n2031", 0.06125, "2031-01-15"),
  T("tp", "Junior subordinated trust-preferred indentures", "subordinated", 3, false, L.v("debt_trups", "2026-06-30") + L.v("debt_trups_ib", "2026-06-30") + L.v("debt_trups_ii", "2026-06-30"), 0, true, "2035-03-30", { spread: 0.0151, collateral: "Unsecured, junior subordinated", covenants: ["Trust-preferred indentures"] }),
];
// pro-forma note: reported 2026-06-30 debt less revolver and swapped term loan (repaid by the hypothetical loan) plus the loan itself
const pfDebt = tranches.reduce((s, t) => s + t.principal, 0);
const reportedDebt = L.v("debt_revolver", "2026-06-30") + L.v("debt_term_loan", "2026-06-30") + L.v("debt_n2027", "2026-06-30") + L.v("debt_n2028", "2026-06-30") + L.v("debt_n2029a", "2026-06-30") + L.v("debt_n2029b", "2026-06-30") + L.v("debt_n2031", "2026-06-30") + L.v("debt_avira", "2026-06-30") + L.v("debt_cpace", "2026-06-30") + L.v("debt_trups", "2026-06-30") + L.v("debt_trups_ib", "2026-06-30") + L.v("debt_trups_ii", "2026-06-30");
if (Math.abs(reportedDebt - L.v("debt_total_principal_all", "2026-06-30")) > 1e-6) throw new Error(`BDN tranche inputs (${reportedDebt}) do not reconcile to the reported total principal`);
const cash = L.v("cash", "2026-06-30");
L.disclosure("fy25_available_revolver"); L.disclosure("compliance");
const fy25Debt = L.v("debt_total_principal_all", "FY2025"); // 10-K Note 8, total principal payments
const fy25Avail = parseFloat(/\$([\d.]+) million of available/.exec(L.disclosure("fy25_available_revolver").rawText)![1]); // 564.5

const cd = (id: string, label: string, type: Covenant["type"], thr: number, reported: number | undefined, note: string, active = true): Covenant => ({ id, label, type, thresholds: Array(5).fill(thr), basis: "disclosed", active, note, reported });
const covenants: Covenant[] = [
  { ...cd("c_lev", "Credit agreement: leverage ratio ≤ 0.60 (debt ÷ total asset value) — PROXY at analyst cap rate", "maxLTV", 0.6, undefined, "Disclosed threshold (10-K Note 8). Test uses the model's asset value (LTM NOI ÷ 7.5% + CIP + land + JV book); credit-agreement 'total asset value' differs. Company states compliance at 2026-06-30."), },
  cd("c_fccr", "Credit agreement: fixed-charge coverage ≥ 1.5x — PROXY (EBITDA ÷ cash interest)", "minInterestCoverage", 1.5, undefined, "Disclosed threshold; proxy ignores preferred dividends / capitalized interest definitions."),
  cd("c_sec", "Credit agreement: secured debt ÷ total asset value ≤ 0.40 — PROXY", "maxSecuredLTV", 0.4, undefined, "Disclosed threshold (10-K Note 8). The hypothetical loan adds $400M of secured debt."),
  { id: "h_liq", label: "Hypothetical maintenance covenant on the new loan: min liquidity ($M)", type: "minLiquidity", thresholds: Array(5).fill(100), basis: "hypothetical", note: "UNDERWRITING ASSUMPTION." },
  { id: "h_lev", label: "Hypothetical maintenance covenant on the new loan: max net debt / EBITDA", type: "maxNetLeverage", thresholds: [10.5, 10.5, 10.0, 10.0, 9.5], basis: "hypothetical", note: "UNDERWRITING ASSUMPTION: LTM 9.8x pro forma." },
];

const dd = (id: string, category: DiligenceItem["category"], item: string, status: DiligenceItem["status"], priority: DiligenceItem["priority"], notes: string, source: string, question: string): DiligenceItem => ({ id: `bdn-${id}`, category, item, status, priority, notes, source, date: "2026-10-07", question });
const diligenceItems: DiligenceItem[] = [
  dd("f1", "Financial", "Historical financials tied to filings", "Complete", "High", "All 98 numeric inputs verified against the FY2025 10-K and Q2-2026 10-Q text; calculated NOI equals company-reported NOI in FY2023–FY2025.", "scripts/real_cases.py", "—"),
  dd("f2", "Financial", "Interest expense trajectory", "Issue Identified", "High", "H1-2026 interest expense $82.8M vs $64.2M (+29%) as 8.3–8.9% notes replaced 4% debt and capitalized interest fell.", "10-Q Q2-2026", "Where does LTM coverage of 1.7x trough as the 2027–28 notes refinance?"),
  dd("f3", "Financial", "Capex, leasing costs and distributions", "In Progress", "High", "Capex + leasing costs were $126M in FY2025 (26% of revenue); distributions $93M in FY2025, $28M in H1-2026.", "10-K FY2025 Cash flow", "How much capex is discretionary once developments complete?"),
  dd("a1", "Asset / Real Estate", "Independent appraisal of the pledged pool", "Not Started", "High", "Value is NOT disclosed; model uses LTM NOI ÷ 7.5% cap rate + book CIP, land and JV investments. Company states covenant compliance, implying cap rate ≤ ~7.8%.", "Analyst assumption", "Third-party appraisals and cap-rate evidence for Philadelphia / Austin office?"),
  dd("a2", "Asset / Real Estate", "Occupancy, rollover and NOI by property", "In Progress", "High", "Core occupancy 88.3% at 2025-12-31 (87.8% prior year).", "10-K FY2025 MD&A", "Lease expiry ladder and mark-to-market on the pledged pool?"),
  dd("a3", "Asset / Real Estate", "Assets held for sale ($232.9M)", "In Progress", "Medium", "Reclassified at 2026-06-30; proceeds expected to repay debt (base case assumes $200M net in period 1).", "10-Q Q2-2026 Balance sheet", "Pricing, buyer, timing; effect on NOI?"),
  dd("d1", "Debt", "Maturity wall: $849M in 2027, $350M in 2028, $900M in 2029", "Issue Identified", "High", "Revolver ($149M drawn), $250M term loan and 3.95% notes ($450M) fall due in 2027; revolver extended to 2026-12-30.", "10-Q Q2-2026 Note 7", "Can the company refinance $0.8–1.2B of 2027–28 maturities at current coverage?"),
  dd("d2", "Debt", "Covenant headroom and secured-debt basket", "In Progress", "High", "Credit agreement caps secured debt at 40% of asset value; secured debt is $147M today and $547M with the hypothetical loan.", "10-K FY2025 Note 8", "Is the loan permitted under all indentures (negative pledge / secured-debt caps)?"),
  dd("d3", "Debt", "Rating-linked coupon step-ups", "Complete", "Low", "8.30% 2028 notes carry coupon adjustments after Ba1 / BB+ downgrades.", "10-K FY2025 Note 8 footnote (h)", "—"),
  dd("l1", "Legal", "Liens, guarantees and structural subordination", "Not Started", "Medium", "Notes are guaranteed by the Parent; property-level debt is secured by specific assets.", "10-K FY2025 Note 8", "Does the pledged pool sit in a bankruptcy-remote SPE?"),
  dd("l2", "Legal", "Joint-venture and ground-lease constraints", "Not Started", "Low", "$336.9M of unconsolidated JV investments (equity-method book value).", "10-Q Q2-2026", "Are JV interests pledgeable or structurally subordinated?"),
  dd("c1", "Commercial", "Office market conditions (Philadelphia, Austin)", "In Progress", "Medium", "Impairments of $63.4M (FY2025) and $11.9M (H1-2026) signal continued value pressure.", "10-K FY2025, 10-Q Q2-2026", "Is the impairment cycle over?"),
  dd("c2", "Commercial", "Macro sensitivity: SOFR and credit spreads", "Not Started", "Low", "New loan is floating (S+525, 1% floor).", "Analyst", "—"),
];

const mkInputs = (metrics: [string, string, "income" | "cash" | "memo"][], periods: string[]) => metrics.map(([key, label, group]) => ({
  key, label, group, values: Object.fromEntries(periods.map((p) => [p, L.o(key, p)])), src: Object.fromEntries(periods.filter((p) => raw.datapoints.some((d: { metric: string; period: string }) => d.metric === key && d.period === p)).map((p) => [p, `bdn.${key}.${p}`])),
}));
const PERIODS = ["FY2023", "FY2024", "FY2025", "H1-2025", "H1-2026"];
const historicalSpec: HistoricalSpec = {
  mode: "cfo",
  columns: [{ id: "FY2023", label: "FY2023A", kind: "fy", year: 2023 }, { id: "FY2024", label: "FY2024A", kind: "fy", year: 2024 }, { id: "FY2025", label: "FY2025A", kind: "fy", year: 2025 }, { id: "H1-2025", label: "H1-25A", kind: "ytd" }, { id: "H1-2026", label: "H1-26A", kind: "ytd" }, { id: "LTM", label: "LTM Jun-26", kind: "ltm" }],
  ltm: { base: "FY2025", add: "H1-2026", sub: "H1-2025" },
  inputs: mkInputs([
    ["revenue", "Total revenue", "income"], ["prop_opex", "Property operating expenses", "income"], ["re_taxes", "Real estate taxes", "income"], ["mgmt_exp", "Third-party management expenses", "income"], ["ga", "General and administrative expenses", "income"],
    ["da", "Depreciation and amortization", "income"], ["interest_expense", "Interest expense (excl. financing-cost amortization)", "income"], ["taxes", "Income tax provision", "income"], ["cfo", "Net cash provided by operating activities", "cash"],
    ["capex_ti", "Capex: tenant improvements", "cash"], ["capex_redev", "Capex: redevelopments", "cash"], ["capex_dev", "Capex: developments", "cash"], ["leasing_costs", "Leasing costs paid", "cash"],
    ["impairment", "Provision for impairment (memo, excluded from EBITDA)", "memo"], ["cash_interest", "Cash paid for interest (memo)", "memo"], ["noi_reported", "Net operating income — company reported (check)", "memo"],
  ], PERIODS),
  lines: { revenue: [["revenue", 1]], cogs: [["prop_opex", 1], ["re_taxes", 1], ["mgmt_exp", 1]], opexAdj: [["ga", 1]], da: [["da", 1]], sbc: [], interest: [["interest_expense", 1]], taxes: [["taxes", 1]], capex: [["capex_ti", 1], ["capex_redev", 1], ["capex_dev", 1], ["leasing_costs", 1]], cfo: [["cfo", 1]] },
  checks: [{ label: "Calculated NOI (revenue − direct costs) vs company-reported NOI", calcLine: "noi", reportedKey: "noi_reported" }],
};

export const bdnSources: SourceRef[] = Object.entries((raw as unknown as DpFile).documents).map(([k, d]) => ({
  id: k, source: "SEC EDGAR", document: `${d.company} — Form ${d.form}, period ended ${d.period}`, url: d.url, documentDate: d.filed, retrievedDate: "2026-10-07", dataType: d.form === "10-K" ? "Annual report" : "Quarterly report",
  period: d.period, accession: d.acc, isDemo: false,
}));
bdnSources.push({ id: "fred-sofr", source: "FRED (Federal Reserve Bank of St. Louis)", document: "SOFR — Secured Overnight Financing Rate (3.90% on 2026-10-06)", url: "https://fred.stlouisfed.org/series/SOFR", documentDate: "2026-10-06", retrievedDate: "2026-10-07", dataType: "Macro rate", isDemo: false });

const ltmEbitda = history[3].ebitda;
const entryNetLev = (fy25Debt - L.v("cash", "FY2025")) / history[2].ebitda;
const ebitdaH1 = (s: StdLines) => s.revenue - s.cogs - s.opexAdj;
const undrawnNow = q2Avail; // 10-Q 2026-06-30: availability net of drawings ($149.0M) and $25.5M of letters of credit

export const bdn: Company = {
  id: "bdn", name: "Brandywine Realty Trust", ticker: "BDN", sector: "Real Estate", industry: "Office REIT (Philadelphia / Austin)", hq: "Philadelphia, PA",
  status: "Requires Further Diligence", dataClass: "public", caseTitle: "Real estate credit — first-lien secured loan to an office REIT with a 2027–29 maturity wall",
  description: "Self-administered REIT owning urban and suburban office, life-science and mixed-use properties, concentrated in Philadelphia and Austin. Occupancy 88%; $2.6B of debt, mostly unsecured notes; $1.9B due 2027–2029 after the 3025 JFK construction loan was retired in June 2026.",
  rev: [], margin: [], grossMargin: 0, daPct: 0, capexPct: 0, nwcPct: 0,
  cash, currentAssets: 0, currentLiabExDebt: 0, assetBase, ev: assetBase, baseGrowth: 0.02, cyc: 0.4, baseRefiRate: 0.08, entryMultiple: 12.5, distressMultiple: 10, liqRecovery: 0.85,
  tranches, target: { trancheId: "new", holdYears: 3, feePct: 0.005, face: 100 }, catalystScore: 3,
  thesis: "Hypothetical: lend into the 2027–28 maturity wall with a $400M first-lien term loan (we hold $100M) secured by a pool of properties worth ~30% of the portfolio. At ~$1.4B of pledged value the loan attaches at ~30% LTV, so the question is not collateral — it is whether S+525 / 98 OID is enough yield for a lender that must also tolerate a 1.4–1.7x coverage corporate credit and a 40% secured-debt cap.",
  upside: ["First-lien on a ring-fenced pool: ~30% LTV before haircuts", "Floating rate with a 1% SOFR floor and 1% amortization", "OID of 2 points plus call protection", "Loan proceeds extend the runway on $849M of 2027 maturities"],
  risks: ["Corporate coverage ~1.7x LTM and falling as 4% debt refinances at 8–9%", "Office valuations: cap-rate expansion would erode pool value (each +100bp ≈ −12% value)", "Secured-debt capacity under unsecured indentures and the 40% credit-agreement cap", "Capex / distributions consume cash flow; asset sales ($233M held for sale) are needed for liquidity"],
  catalysts: ["Close of the $233M asset sale", "2027 revolver / term-loan / 3.95% notes maturities", "Rating actions on the unsecured notes"],
  diligence: [], industryView: "Office REITs are repricing: leverage and lease-rollover risk are concentrated in older, sub-institutional assets, while newer, well-leased assets still finance. Senior secured lenders with low LTV on high-quality pools are being paid a premium to unsecured paper because unsecured lenders have largely left the market.",
  overrides: {
    base: { revenueGrowth: [-0.03, 0.02, 0.02, 0.02, 0.02], ebitdaMargin: [0.53, 0.533, 0.536, 0.538, 0.54], capexPct: 0.22, nwcPctOfRevChange: 0, nwcExtraOutflowPct: 0.11, rateShock: 0, refiRate: 0.08, maxRefiNetLeverage: 11.0, minRefiCoverage: 1.2, exitMultiple: 12.5, exitPrice: 100, distressMultiple: 10, assetValueDecline: 0, liquidationRecovery: 0.85, assetSales: [200, 0, 0, 0, 0] },
    downside: { revenueGrowth: [-0.06, -0.03, 0, 0.01, 0.01], ebitdaMargin: [0.50, 0.485, 0.485, 0.49, 0.495], capexPct: 0.18, nwcExtraOutflowPct: 0.05, rateShock: 0.015, refiRate: 0.10, maxRefiNetLeverage: 9.5, minRefiCoverage: 1.5, exitMultiple: 11, exitPrice: 95, distressMultiple: 9, assetValueDecline: 0.15, liquidationRecovery: 0.85, assetSales: [150, 0, 0, 0, 0] },
    severe: { revenueGrowth: [-0.1, -0.07, -0.03, 0, 0.01], ebitdaMargin: [0.46, 0.43, 0.425, 0.43, 0.44], capexPct: 0.13, nwcExtraOutflowPct: 0, rateShock: 0.03, refiRate: 0.12, maxRefiNetLeverage: 9.0, minRefiCoverage: 1.75, exitMultiple: 9.5, exitPrice: 85, distressMultiple: 8, assetValueDecline: 0.3, liquidationRecovery: 0.85, assetSales: [100, 0, 0, 0, 0] },
  },
  history, historicalSpec, undrawnRevolver: undrawnNow + REV_DRAWN, sources: bdnSources, assetCapRate: CAP,
  assetComponents: [{ label: "Construction-in-progress", value: cip, dp: "bdn.cip.2026-06-30" }, { label: "Land held for development", value: land, dp: "bdn.land.2026-06-30" }, { label: "Investment in unconsolidated real estate ventures (book)", value: jv, dp: "bdn.jv_investment.2026-06-30" }],
  baseYear: 2026, baseLabel: "LTM Jun-26", periodLabels: [2027, 2028, 2029, 2030, 2031].map((y) => `LTM Jun-${String(y).slice(2)}E`), asOf: "2026-06-30", fyEndMonth: 6,
  sofr: [0.039, 0.0375, 0.035, 0.035, 0.035], taxRate: 0, sbcPct: 0, minCash: 25, sweepPct: 0, adminPct: 0.04, accruedMonths: 3, resolutionLag: 1, deficiencyRank: 99,
  covenants, diligenceItems, thresholds: { ...DEFAULT_THRESHOLDS, hurdleIrr: 0.1, minYield: 0.085, maxNetLeverage: 10.5, minRecovery: 0.9 }, termsLabel: "HYPOTHETICAL INVESTMENT TERMS",
  probabilities: { base: 0.5, downside: 0.35, severe: 0.15 }, provenance: [],
  priorSnapshot: { label: "FY2025A (10-K, 2025-12-31)", totalDebt: fy25Debt, cash: L.v("cash", "FY2025"), undrawnRevolver: fy25Avail, ebitda: history[2].ebitda, interest: history[2].interest, fcf: history[2].fcf },
  thesisPlan: {
    statement: "A first-lien loan at ~30% pool LTV is money-good even if office values fall 30%; corporate coverage stabilises as asset sales delever.",
    entryDate: "2026-02-23", entryBasis: "FY2025A (10-K filed 2026-02-23), model basis",
    entryMetrics: { revenue: history[2].revenue, ebitda: history[2].ebitda, netLeverage: entryNetLev, coverage: history[2].ebitda / history[2].interest, liquidity: L.v("cash", "FY2025") + fy25Avail },
    plan: { revenueGrowthYoY: 0.02, ebitdaGrowthYoY: 0.01, netLeverageMax: 10.2, coverageMin: 1.8, liquidityMin: 450 },
  },
  monitoring: {
    label: "H1-2026 (10-Q filed 2026-07-28)", source: "BDN_Q2",
    revenueYoY: L.v("revenue", "H1-2026") / L.v("revenue", "H1-2025") - 1, ebitdaYoY: ebitdaH1(h126) / ebitdaH1(h125) - 1,
    netLeverage: (reportedDebt - cash) / ltmEbitda, coverage: ltmEbitda / ltm.interest, liquidity: cash + undrawnNow, ltmEbitda, ltmRevenue: ltm.revenue, debt: reportedDebt, cash,
  },
  assetValueBasis: "LTM NOI ÷ 7.5% analyst cap rate + construction-in-progress + land held for development + unconsolidated JV book value (6/30/2026). Property values are NOT disclosed in the filings.",
  notes: [
    "EBITDA = NOI − G&A, where NOI = total revenue − property operating expenses − real estate taxes − third-party management expenses (the company's definition; calculated NOI equals reported NOI FY2023–FY2025).",
    "LTM Jun-26 = FY2025 + H1-2026 − H1-2025 for every flow line (formula in Excel). Capex = tenant-improvement + redevelopment + development spend + leasing costs.",
    `Capital structure is pro forma for a HYPOTHETICAL $400M senior secured term loan whose proceeds repay the $${REV_DRAWN.toFixed(0)}M revolver drawing and the $${TL_REPAID.toFixed(0)}M term loan (reported debt $${reportedDebt.toFixed(1)}M → pro forma $${pfDebt.toFixed(1)}M).`,
    "Property values are not disclosed; asset value uses an analyst cap rate (7.5%). Pledged-pool share (30%) and the property-level collateral shares are assumptions.",
    "Equity distributions are discretionary; the model carries them in 'other cash items' (11% of revenue in the base case, cut to 5% / 0% in the downside / severe cases).",
    "Disclosed covenants (leverage 0.60, FCCR 1.5x, secured debt 0.40) are tested on a proxy basis; the company states it was in compliance at 2026-06-30.",
    "Tax rate 0%: REIT; reported provisions are immaterial.",
  ],
};
bdn.provenance = L.provenance();
