import { buildCompany, tr } from "@/data/build";
import type { CompanySpec } from "@/lib/types";

/** Deterministic fixture: revenue 1,000, 20% EBITDA margin, $600M debt across 3 tranches. Not a seed company. */
export const spec: CompanySpec = {
  id: "fx", name: "Fixture Co", ticker: "FX", sector: "Industrials", industry: "Test", hq: "NA", status: "Watch", description: "",
  rev: [900, 950, 1000, 1000], margin: [0.2, 0.2, 0.2, 0.2], grossMargin: 0.4, daPct: 0.05, capexPct: 0.04, nwcPct: 0.1,
  cash: 100, currentAssets: 300, currentLiabExDebt: 150, assetBase: 900, ev: 1800, baseGrowth: 0.03, cyc: 0.5, baseRefiRate: 0.08,
  entryMultiple: 8, distressMultiple: 5, liqRecovery: 0.5,
  tranches: [
    tr("tl", "Term Loan", "term_loan", 1, true, 300, 0.08, true, "2029-06-30", { amortPct: 0.05, price: 98, maxNetLeverage: 5.0 }),
    tr("2l", "Second Lien", "second_lien", 2, true, 100, 0.11, false, "2030-06-30", { price: 85 }),
    tr("sn", "Senior Notes", "senior_notes", 3, false, 200, 0.07, false, "2027-06-30", { price: 90 }),
  ],
  target: { trancheId: "2l", holdYears: 3, feePct: 0 },
  catalystScore: 2, thesis: "", upside: [], risks: [], catalysts: [], diligence: [], industryView: "",
};
export const fx = buildCompany(spec);
