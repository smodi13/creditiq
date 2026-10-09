# Investment methodology

This is CreditIQ's own framework for a demonstration project. It is **not** Fortress's process, and no hypothetical position here is a Fortress transaction.

## Philosophy
Credit first: a lender is paid par plus coupon and takes the loss if value falls short, so the analysis starts with downside, not equity upside. Compare **yield vs recovery vs loss given default** at the price paid. Face, price, coupon, yield and recovery are kept separate (OID and call protection matter to yield; seniority, collateral and valuation determine recovery).

## Decision rule (analysis.ts `recommend`)
Five core tests (base IRR ≥ hurdle, probability-weighted IRR (of expected cash flows) ≥ hurdle, downside IRR ≥ floor, downside recovery ≥ minimum, base-case refinancing passes) and five secondary tests (entry yield, net leverage, base-case covenant headroom, principal protected in the severe case, no unresolved high-priority diligence). **PROCEED** if 0 core fail and ≤2 secondary fail; **PASS** if both base and downside IRR fail or ≥3 core fail; otherwise **HOLD**. Thresholds live in `config.ts` (`DEFAULT_THRESHOLDS`) and can be overridden per case; every test shows actual vs required.

## Covenants, refinancing, maturities
Covenant headroom is reported per period (types: max net leverage, min interest coverage, max LTV, max secured LTV, min liquidity, min EBITDA); terminated covenants are shown for reference only. At maturity, debt is repaid from cash above minimum cash; a market-access test (beginning net leverage, EBITDA ÷ pro-forma interest) governs only the remainder. Unpaid amounts are a payment default. The maturity wall shows liquidity, refinancing requirement and a risk flag.

## Recovery
Value = MAX(going concern = distressed multiple × event EBITDA, liquidation = asset base × (1 − decline) × recovery factor) + cash at the event, less administrative costs (4%), distributed by strict seniority with collateral pools and deficiency claims. The event is the modelled default period or, if none, the trough-EBITDA period.

## Monitoring
Thesis status comes only from actual-vs-plan metrics. Forward-looking flags (covenant, maturity, recovery) raise WATCH but never alone declare deterioration.

---
## Reference (calculation detail)

## Question
Should we own this instrument, at this price, and what do we get back if the company underperforms? Everything is built around **downside first**: seniority, collateral/enterprise value coverage, liquidity and the maturity profile determine the answer before upside does.

## 1. Credit metrics (src/lib/finance/metrics.ts)
| Metric | Formula |
|---|---|
| Gross leverage (= Debt/EBITDA) | Total debt ÷ EBITDA |
| Net leverage | (Debt − cash) ÷ EBITDA |
| Secured leverage | Secured debt ÷ EBITDA |
| EBITDA / interest | EBITDA ÷ cash interest |
| Interest coverage | EBIT ÷ cash interest |
| FCF / debt | (NI + D&A − capex − ΔNWC) ÷ debt |
| DSCR | (EBITDA − capex − taxes) ÷ (interest + mandatory amortisation) |
| Cash conversion | (EBITDA − capex) ÷ EBITDA |
| Liquidity ratio | (cash + undrawn revolver) ÷ (debt due ≤12m + amortisation + interest) |
| Current ratio | Current assets ÷ (current liabilities ex-debt + debt due ≤12m) |
| ST debt / liquidity | Debt due ≤12m ÷ liquidity |
The UI shows each formula next to the raw inputs.

## 2. Scenario engine (projection.ts, scenarios.ts)
Each year: revenue = prior × (1+g); EBITDA = revenue × margin; COGS passes margin changes through gross margin; D&A at LTM % of revenue; capex % revenue; ΔNWC = % × Δrevenue + stress drag; tax 25% on positive EBT only. Interest = beginning balance × rate (no circularity). Floating tranches add the scenario shock.
**Maturities:** at maturity a tranche refinances for 5 years at the scenario refinancing rate if (a) EBITDA > 0, (b) net leverage ≤ scenario limit and (c) EBITDA ÷ pro-forma interest ≥ scenario minimum. Otherwise it is repaid from cash (senior first); the revolver funds operating shortfalls; any remaining gap is a **payment default**, and unpaid balances stay as claims. Maintenance covenants (max net leverage / min coverage) are tested each year.
Defaults are derived from LTM margin and a cyclicality score; every assumption can be edited in the Scenario Lab (validated with Zod) or overridden per company.

## 3. Credit score (score.ts, config.ts)
Nine factors (weights): leverage 15, coverage 15, liquidity 10, FCF 10, maturity 10, margin stability 10, revenue stability 8, asset coverage 12, industry 10. Each earns `weight × clamp((value − worst)/(best − worst))`. Bands: ≥75 Low, ≥60 Moderate, ≥45 Elevated, else High. Industry factor is an explicit analyst input, not a model output.

## 4. Recovery (waterfall.ts, analysis.ts)
Valuation event = default year if a default is modelled, else the trough-EBITDA year (a hypothetical). Value = max(going-concern, liquidation) + cash; going-concern = distressed multiple × EBITDA; liquidation = asset base × (1 − scenario decline) × liquidation recovery. Less administrative costs (4%). Claims = balance + 3 months accrued interest. Absolute priority by rank; equal ranks share pro rata; residual to equity. Output per tranche: claim, recovery, recovery %, loss, loss %.

## 5. Returns (returns.ts, analysis.ts)
Per $100 face unless stated. Every metric below is defined by the cash flows it uses.

| Metric | Cash flows | Timing | Notes |
|---|---|---|---|
| **IRR (annual periods)** — per scenario | t=0: −(face × price × (1 + fee%)); coupons = face × scenario coupon; exit or recovery proceeds | Annual grid t=0…6: coupons at each period end, performing exit at the hold period, default → coupons stop after the default period and recovery arrives `resolutionLag` (1) period later | Fees are paid at t=0; no other costs. Solved by bisection on NPV. Annual coupons **understate** a semiannual bond's IRR |
| **IRR (contractual timing)** | Same dollars as above, with each period's coupon cash re-timed to the tranche's payments per year (AMCX 2, BDN loan 4) | Quarterly sub-grid (24 sub-periods); principal/recovery stay on annual dates; settlement on a coupon date (no accrued interest) | Effective annual rate = (1 + sub-period IRR)^4 − 1. With 1 payment per year it equals the annual IRR exactly. Independently cross-checked with an actual/365 XIRR on calendar dates (±5 bp). For AMCX this adds ~30–35 bp |
| **Probability-weighted IRR** | IRR of Σ p_s × (scenario cash flow at each t) — the *expected cash flows* | Same grid | Used by the recommendation test. IRR is non-linear, so this differs from the simple average of scenario IRRs, which is kept as a memo line (`avgIrr`) and never used for decisions |
| **MOIC** | total inflows ÷ cost | — | Linear in cash flows: the probability-weighted MOIC equals the MOIC of the expected flows |
| **XIRR (Excel Returns tab)** | selected scenario's annual flows | entry date + 12 months × t | Cross-check of the IRR on actual/365 day counts |
| **Current yield / YTM** | year-1 coupon ÷ price; YTM = RATE to maturity at par with annual coupons | — | Marketing-style yields; the returns above are the underwriting measures |

Default case: the recovery proceeds to the position = tranche waterfall recovery (claim = balance + 3 months accrued interest, so a defaulted loan can receive slightly more than face) × share of the tranche held. Performing case: exit price = MIN(scenario exit-price cap, 100 × valuation coverage of the tranche at the exit multiple × final-year EBITDA). Interest is counted once (coupons) and principal once (exit **or** recovery, never both). Scenario weights are per case (`probabilities`; AMCX 45/35/20, BDN 50/35/15) and must sum to 100% (checked in the unit tests and in the audit). Expected loss = P(default) × LGD, LGD = 1 − recovery %.

**Limitations.** Annual operating periods; coupons are re-timed but principal/recovery dates are not; no accrued interest at entry (for AMCX settled on 2026-06-30 the accrued-interest convention changes the IRR by <1 bp (12.932% vs 12.929% in an independent actual-date check)); the model has no tax, funding cost or hedging at the investor level; fees are one flat percentage.

## 6. Distressed screen (analysis.ts, config.ts `DISTRESS_WEIGHTS`)
Flags: net leverage ≥5x, EBITDA/interest <2x, ≥25% of debt due within 2 years, EBITDA −5% YoY, negative FCF, mark <90, severe recovery ≥1.2× price. ≥3 flags = distressed situation. **Distressed Opportunity Score (0–100)** is a weighted sum of eleven 0–100 drivers: opportunity side — severe-case recovery 20, entry discount 15, catalyst 10, capital-structure position 10, refinancing event 5; safety side — default risk 15, liquidity 10, leverage 5, coverage 5, maturity 3, FCF 2. It rewards *protected* distress, so a stressed name with thin recovery scores low. It is a ranking aid with analyst-chosen weights, not a probability.

## 6b. Recommendation, credit score and status labels — what each means
- **Recommendation (PROCEED / HOLD / PASS)** — rule on 10 tests (above). Thresholds (`DEFAULT_THRESHOLDS`: hurdle 12%, min yield 9%, max net leverage 6x, min recovery 60%, min covenant headroom 15%, min downside IRR 0%) are analyst-chosen defaults overridden per case (AMCX: yield 10%, recovery 70%; BDN: hurdle 10%, yield 8.5%, leverage 10.5x, recovery 90%). They are **not** industry standards and no external source is claimed for them.
- **Credit score (0–100)** — transparent weighted scale of nine factors (§3). It is an ordinal ranking tool. **It is not a calibrated probability of default** and is not mapped to any rating agency scale.
- **Covenant status** — per period headroom = threshold − metric (max tests) or metric − threshold (min tests); BREACH iff headroom < 0 (equality passes). Disclosed covenants are tested on proxy definitions (stated on the page); hypothetical covenants are labelled.
- **Refinancing status** — PASS if maturing debt is repaid from cash above minimum cash and/or the market-access test (beginning net leverage ≤ scenario cap and pro-forma coverage ≥ scenario floor) passes for the remainder; otherwise FAILURE → unpaid balance → payment default.
- **Recovery severity** — recovery % and loss % of the target tranche in the valuation waterfall (§4). Value = MAX(going concern, liquidation) + cash is a deliberate (generous) convention: creditors are assumed to take the higher-value path.
- **Expected return** — probability-weighted IRR of expected cash flows (§5).

## 6c. Collateral coverage stress (collateral.ts; Excel Sensitivities tab "Collateral coverage stress")
For a specifically secured target tranche (BDN): recovery from the pledged pool = MIN(100%, pool share × asset value × (1 − realization cost) × (1 − admin costs) ÷ claim). Asset value = LTM NOI ÷ cap rate + book-value non-operating assets. This is an **asset-based floor**: no going-concern value, no cash, no deficiency recovery, claim = principal at close. Tables: cap rate × NOI change; pool share × realization factor; loan balance × asset-value decline; plus break-evens. The "30% pool" is a share of the **recovery value of the whole issuer** in the waterfall, an analyst assumption — not a verified allocation of properties.

## 7. Portfolio monitoring (alerts.ts)
Compared with the prior-quarter snapshot: leverage +0.5x, coverage −0.5x, liquidity −20%, maturity within 2 years, EBITDA −10%, covenant headroom <15% (negative = breach), downside recovery −5 pts.

## Judgment vs. calculation
Calculated: everything above. Judgment (flagged in code/UI): scenario shapes and probabilities, industry factor, asset-base values, distress multiples, catalyst scores, recommendation labels in the seed data.
