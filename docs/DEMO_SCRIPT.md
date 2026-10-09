# Demo script — 2–3 minutes (AMCX, with a 20-second BDN coda)

**Framing line (say it first):** "CreditIQ is an independent research project. The notes, the price of 95 and the scenarios are my hypothetical assumptions — not a market quote, and not a Fortress position or process."

Run: `npm run dev` → http://localhost:3000. Keep the Excel file `models/CreditIQ_AMCX_Model.xlsx` open in a second window.

| Time | Page (exact name) | What to do | Talking point (investment reasoning first) |
|---|---|---|---|
| 0:00 | **Dashboard** (`/dashboard`) | Point at the ranked opportunities and the HOLD badges | "Every number carries a class — public filing, projection, assumption or demo. Two real cases: AMC Networks and Brandywine; sixteen fictional demo names are labelled DEMO." |
| 0:15 | **Real Underwriting Cases → AMC Networks** (`/companies/amcx`) | Read the question box | "Would a lender be paid enough to own the first-lien 10.50% notes due 2032 of a linear-TV network whose AOI fell 46% in H1-26 — at a hypothetical 95?" |
| 0:30 | **Financials** (`/companies/amcx/financials`) → *Sources & data lineage* | Open the source panel, click one filing link | "LTM Jun-26 is FY2025 + H1-26 − H1-25; EBITDA is AOI rebuilt from components and ties to the company's reported AOI. Each input has filing, date, section, retrieved date. The 2029 secured notes were exchanged into 2032 notes in March and the revolver was terminated in May, so debt is taken at 30 June 2026, not the 10-K." |
| 0:55 | **Capital Structure & Maturities** (`/companies/amcx/capital-structure`) | Show the three tranches and the maturity wall | "$1.3B of first-lien notes, only $420M of unsecured/convertible behind them, due Feb-2029; $464M of cash; no revolver, so no maintenance covenants — liquidity is cash." |
| 1:10 | **Scenarios** (`/companies/amcx/scenarios`) | In the Scenario engine click **Base Case → Downside → Severe Downside** | "Downside: revenue −8%, margin 12%→10%: leverage 4.9x→7.3x, coverage 1.6x→1.2x, covenants breach in 2028, the 2029 refinancing test fails. Severe: payment default in 2029." Then type `-25` in the period-1 growth box to show it flow through to default. |
| 1:40 | **Recovery** (`/companies/amcx/recovery`) | Scroll to the downside waterfall | "Value = higher of going-concern (4.5x trough AOI) and liquidation, plus cash, less 4% costs, paid by priority. The secured notes recover 61% in the downside and 34% in severe — collateral is mostly content library and receivables." |
| 2:00 | **Returns** (`/companies/amcx/returns`) | Point at IRR rows and the *Expected* column | "Base 12.6%, downside 6.5%, severe −10.8%. The 10.5% coupon is not the return. The expected return is the IRR of the probability-weighted cash flows — 6.1%, not the 5.8% average of IRRs. Semiannual timing adds ~30 bp to the base IRR." |
| 2:20 | **Investment Committee** (`/companies/amcx/investment-committee`) | Show the evidence table | "HOLD follows from the rules: base IRR passes, expected IRR and downside recovery fail. What would change my mind: a price near 82, or evidence that recovery exceeds 70%." |
| 2:35 | **Excel** (`CreditIQ_AMCX_Model.xlsx`) | Open *Assumptions* (blue inputs), change *ACTIVE SCENARIO* to 3, show *Recovery* and *Returns* update | "Same engine in formulas: blue inputs, black same-sheet formulas, green cross-sheet links; 38 audit checks and 29 change-impact tests pass." |
| 2:50 (coda) | **BDN → Recovery** (`/companies/bdn/recovery`) | Scroll to *Collateral coverage stress* | "The hypothetical $400M loan shows 100% recovery everywhere — but only because I assumed a 30% pool. At a 10% pool it already recovers 92% at 85% realization. That assumption, not the headline, is what I would diligence first." |

**Do not say:** that Fortress holds or priced these notes, that the price is a market quote, or that the 30% BDN pool is a disclosed asset allocation.

**If asked about validation:** 103 unit tests; 110 workbook audit checks across three workbooks; 89 change-impact tests (29 AMCX, 30 BDN, 30 Brightwater); Excel and web reconcile on 178 metrics per case (276 for BDN); datapoints re-verified against the filings with a row/column check. Details: `docs/MODEL_VALIDATION.md`.
