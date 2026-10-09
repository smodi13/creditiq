// Macro indicators for credit. Every indicator answers: why does this matter to a credit investor?
// `fred` series are fetched live (FRED CSV); when unreachable, a clearly labelled SAMPLE value is shown instead.
export interface Indicator { id: string; label: string; fredId?: string; unit: string; transform?: "level" | "yoy"; sample: number; sampleDate: string; chain: string; matters: string; howUsed: string }

export const indicators: Indicator[] = [
  { id: "sofr", label: "SOFR (secured overnight financing rate)", fredId: "SOFR", unit: "%", sample: 3.9, sampleDate: "2026-10-06 (sample)", chain: "SOFR ↑ → floating interest ↑ → FCF ↓ → coverage ↓ → refinancing risk ↑",
    matters: "Sets the base rate on every floating-rate loan and the starting point for refinancing coupons.", howUsed: "Base-rate curve in every model; scenario shocks of +150 / +300 bp; SOFR sensitivity table (Excel Table 5, web Returns tab)." },
  { id: "ff", label: "Effective federal funds rate", fredId: "FEDFUNDS", unit: "%", sample: 3.9, sampleDate: "sample", chain: "Policy rate ↑ → bank funding costs ↑ → lending standards tighten → refinancing access ↓",
    matters: "Anchor for short rates and for how willing banks are to roll maturities.", howUsed: "Context for the refinancing-access test (max leverage / min coverage) in each scenario." },
  { id: "t10", label: "10-year Treasury yield", fredId: "DGS10", unit: "%", sample: 4.2, sampleDate: "sample", chain: "Long yields ↑ → fixed-rate refinancing coupons ↑ → interest burden on maturing fixed debt ↑",
    matters: "Benchmark for the fixed-rate refinancing cost of 2027–2031 maturities.", howUsed: "Refinancing-rate assumption for each case (base / downside / severe)." },
  { id: "hy", label: "US high-yield option-adjusted spread", fredId: "BAMLH0A0HYM2", unit: "%", sample: 3.1, sampleDate: "sample", chain: "Spreads ↑ → new-issue cost ↑ and market window narrows → refinancing probability ↓",
    matters: "Price of credit risk; widening signals closed markets for weaker names.", howUsed: "Informs the stress refinancing rates (+250 / +500 bp over base) and the entry-discount screen." },
  { id: "sloos", label: "Net % of banks tightening C&I standards (large firms)", fredId: "DRTSCILM", unit: "%", sample: 8, sampleDate: "sample", chain: "Tighter standards → fewer bank takeouts → more reliance on private credit / asset sales",
    matters: "Leading indicator of bank refinancing availability for mid-market borrowers.", howUsed: "Context for the 'market access' thresholds and the revolver-availability assumption." },
  { id: "cre", label: "Delinquency rate: CRE loans ex-farmland, all banks", fredId: "DRCRELEXFACBS", unit: "%", sample: 1.6, sampleDate: "sample", chain: "CRE delinquency ↑ → lender caution ↑ → appraised values ↓ → LTV ↑ → refinancing gap",
    matters: "Directly relevant to the Brandywine / Tidewater office cases: collateral values and lender appetite.", howUsed: "Asset-value decline and cap-rate assumptions (0% / 15% / 30%) in real-estate cases." },
  { id: "un", label: "Unemployment rate", fredId: "UNRATE", unit: "%", sample: 4.4, sampleDate: "sample", chain: "Unemployment ↑ → consumer demand ↓ → retail / consumer EBITDA ↓ → leverage ↑",
    matters: "Drives consumer-facing cash flows and office demand.", howUsed: "Cyclicality factor in the default scenario shapes (revenue sensitivity k = 0.5 + cyc)." },
  { id: "cpi", label: "CPI inflation (YoY)", fredId: "CPIAUCSL", unit: "%", transform: "yoy", sample: 3.0, sampleDate: "sample", chain: "Inflation ↑ → costs ↑ (margin squeeze) and rates stay higher for longer",
    matters: "Margin pressure for fixed-price contractors, retailers, healthcare services.", howUsed: "Margin assumptions in downside / severe cases." },
];
