# Data sources

| Class | Source | Use |
|---|---|---|
| PUBLIC FILING | SEC EDGAR 10-K FY2024, FY2025 and 10-Q Jun-2026 for AMC Networks; 10-K FY2025 and 10-Q Jun-2026 for Brandywine Realty Trust | Revenue, costs, AOI/NOI, D&A, interest, taxes, capex, CFO, cash, debt by tranche (coupon, maturity, face), covenants, liquidity |
| PUBLIC FILING (derived) | Computed from the above | LTM = FY + H1 current − H1 prior; EBITDA = AOI (AMCX) or NOI − G&A (BDN); FCF = CFO − capex; ΔNWC and other = derived plug. Each carries its formula |
| UNDERWRITING ASSUMPTION / HYPOTHETICAL INVESTMENT TERMS | Analyst | Entry price, BDN loan terms (S+525, 1% floor, price 98), collateral pool %, cap rate, exit multiples, recovery haircuts, probabilities, thresholds |
| ANALYST PROJECTION | CreditIQ engine | Base, Downside and Severe projections |
| DEMO DATA | This repo | 16 fictional companies, portfolio positions and prior snapshots; never presented as filed |
| Optional live | SEC company facts (Settings → SEC lookup), FRED CSV | Lookup tool and macro page; labelled LIVE or SAMPLE per datapoint |

## What is reported, derived, assumed or demo
| Item | AMCX | BDN |
|---|---|---|
| **Reported (filing)** | Revenue, costs, AOI add-backs, D&A, interest expense, taxes, CFO, capex, cash, debt by instrument at 2026-06-30 (10-Q Note 9: 10.50% 2032 secured notes $1,315.098M, 4.25% 2029 senior $276.706M, 4.25% 2029 convertible $143.750M; principal, not carrying value $1,661.0M net), coupons, maturities, call schedule, payment dates (semiannual 15 Jan / 15 Jul), covenant terms | Revenue, property opex, RE taxes, G&A, interest, CFO, capex, cash, debt by instrument at 2026-06-30 (10-Q Note 7; total principal $2,624.934M = secured 147.324 + unsecured 2,477.610), revolver availability $425.5M net of $25.5M letters of credit, covenant thresholds |
| **Derived (formula, carried with each datapoint)** | LTM = FY2025 + H1-26 − H1-25; EBITDA = AOI (rebuilt from components and tied to reported AOI in every period); FCF = CFO − capex; ΔNWC & other = plug | LTM as left; NOI = revenue − property opex − RE taxes − management expenses (tied to reported NOI FY2023–25); EBITDA = NOI − G&A |
| **Underwriting assumption / hypothetical** | Purchase price 95; hold 3 years; scenario drivers and probabilities (45/35/20); hypothetical maintenance covenants; distressed multiples; 30% liquidation recovery on book asset base; hurdle/thresholds | $400M first-lien term loan, S+525, 1% SOFR floor, price 98, 1% amortization, 0.5% fee; **30% pool share**; 7.5% cap rate; property-level collateral shares for Avira (3.3%) and C-PACE (2.1%) at an assumed 60% LTV; hypothetical covenants; scenario drivers and probabilities (50/35/15) |
| **Not disclosed / not in the model** | Market price of the notes; indenture-level collateral schedules; guarantor financials | Property-level values and the actual unencumbered pool; appraisal evidence for the cap rate; lease-expiry ladder |

## Public-data fields (every datapoint in `data/real/*.datapoints.json`)
`id, company, metric, value ($M), unit, period, filing, accession, filingDate, url, section, page, retrieved (2026-10-07), kind ("reported"), rawText (as printed, US$ thousands), note`. `page` is the solitary page-footer number following the cited statement when recoverable (10-K/10-Q text extraction); the Q2-2026 AMCX 10-Q cites section only. Derived quantities are not stored as raw inputs: they are rebuilt by formulas (TypeScript and Excel) and checked against reported subtotals.

## Verification
`python3 scripts/real_cases.py` (`npm run data:verify`) re-reads the cached filings in `data/sec/` and, for every datapoint, requires (1) the raw figure within 600 characters of its label in the cited section, (2) **the figure on the label's own table row (or the wrapped continuation lines)** and, where a row carries several periods, in the listed column order — a stricter row/column test added in the release audit. Result at release: **AMCX 88 numeric + 13 text datapoints, BDN 102 numeric + 10 text datapoints (four numeric BDN inputs were added in this release to source the trust-preferred tranches and debt totals), 0 failures**. (Earlier documentation spoke of "~200 datapoints per case"; the real counts are ~100 per case.) Additional reconciliations done by hand against the 10-Q text for this release: the AMCX debt table foots (1,315.098 + 276.706 + 143.750 = 1,735.554 principal), the March 2026 exchange foots (400.0 existing + 884 early + ~31.1 final 2032 notes = 1,315.1; $861.3M of the $875M 2029 secured notes tendered, $13.7M redeemed 6 April at 105.125%), and the BDN tranche inputs sum to the reported $2,624.934M total principal (enforced at build time in `bdn.ts`).

**Provenance of live values.** SOFR 3.90% (observation 2026-10-06) was re-checked against the FRED CSV on 2026-10-08 (series shows 3.90% for 2026-10-06; 3.88% for 2026-10-07). The cached filings are local only and are not needed at run time: the verified datapoints are packaged JSON imported into the build.

## Run-time data behaviour (production)
- Real underwriting cases load from the packaged JSON; nothing is fetched at run time. A clean checkout with `data/sec/` and `models/` removed builds and serves all 30+ routes.
- Macro page: FRED values are fetched live with a 5 s timeout and 6 h cache; on failure the row shows **SAMPLE** with the error and the sample is never used in a model. Sample rows carry a "(sample)" date.
- SEC lookup (Settings): server route validates the ticker, requires `SEC_USER_AGENT` (no placeholder identity is sent), validates responses with Zod, returns a structured error (HTTP 400/502) and the UI states that no data was substituted.
- No API keys exist in the project; no local filesystem paths are rendered.

## Not used
Vendor prices and live bond marks. Prices are explicit inputs, so no price is claimed as a market quote.
