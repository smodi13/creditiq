# Release readiness

Audit date 2026-10-08 (public filings as retrieved 2026-10-07). Everything below was run or inspected in this release pass; where something was **not** done it says so.

## Status
**Ready to share as an independently developed research / underwriting project, with the limitations in §6.** All gates below pass. A hosted deployment was **not** performed (no credentials were used); the exact remaining action is in §5.

## 1. Gate results (actual)
| Gate | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **103 passed** (11 files; 99 existing + 4 new: known-answer IRR, contractual timing, expected-cash-flow IRR, collateral stress) |
| Types / lint | `npm run typecheck`, `npm run lint` | clean |
| Production build | `npm run build` | passes; 209 static pages. A clean copy **without** `data/sec/` and `models/` also installs (`npm ci`) and builds, and serves all tested routes |
| Public data | `npm run data:verify` | AMCX 88 numeric + 13 text, BDN 102 numeric + 10 text datapoints, **0 failures**, now including a row/column check |
| Workbook build + reconcile | `npm run model:build` | 3 workbooks rebuilt; Excel ⇄ web **178/178 (AMCX), 276/276 (BDN), 178/178 (Brightwater)** |
| Workbook audit | `npm run model:audit` | **110/110** (AMCX 38, BDN 38, Brightwater 34) |
| Change-impact | `npm run model:harness:all` | **AMCX 29/29, BDN 30/30, Brightwater 30/30** (89 tests); SHA-256 of each committed workbook identical before and after |
| Report | `python3 scripts/validation_report.py` | `docs/MODEL_VALIDATION.md` regenerated from the run artefacts |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities. `npm audit` (incl. dev tooling) reports 5 high advisories in the `eslint-config-next → fast-glob` chain; dev-only, not shipped |

Commands per workbook: `npm run model:harness:amcx` · `:bdn` · `:brightwater` · `:all` (parallel). Structured results: `data/validation/harness_<case>.json`.

## 2. Material findings and what was done
| # | Finding | Impact | Action |
|---|---|---|---|
| 1 | "Probability-weighted IRR" was the simple average of scenario IRRs | AMCX 5.8% vs 6.1% as the IRR of expected cash flows; the average is not an expected return | Now the IRR of Σ p × cash flow (web, Excel, reconciliation, recommendation test); the average is kept as a labelled memo. Decision unchanged (HOLD/HOLD) |
| 2 | Annual coupon grid understated semiannual (AMCX) and quarterly (BDN) yields | AMCX base 12.60% → 12.95% contractual; BDN 9.58% → 9.91% | Added contractual-timing IRR (web + Excel + audit + independent actual-date XIRR check ±5 bp); annual IRR kept and labelled |
| 3 | BDN liquidity used the FY2025 letters of credit ($35.5M) with 30 Jun 2026 balances | Revolver availability understated $10M (415.5 vs **425.5**); pro forma commitment 564.5 vs 574.5 | Sourced from the 10-Q; BDN datapoints for trust-preferred tranches and total principal added; build fails if tranches ≠ reported $2,624.934M |
| 4 | BDN "100% downside recovery" had no stress; severe IRR (9.9%) > base IRR (9.6%) | Looks like low risk; actually an artefact of an assumed 30% pool | Collateral coverage stress (cap rate × NOI, pool share × realization, loan balance × value decline, break-evens) in web and Excel, reconciled; artefact disclosed in the case document |
| 5 | Return/IRR methodology and "pool 30%" undocumented | Reader could take the pool as a verified allocation | Methodology §5, §6b, §6c; UI text on the recovery page; case documents |
| 6 | Harness: BDN T8 failed by design (tightening an already-breached covenant); most tests were directional only; report consumed Brightwater only | False failure; weak assertions | Rewritten: exact checks (revenue, EBITDA, interest, cost, going-concern, liquidation value), covenant threshold crossing for every active covenant × period, waterfall bounds, refinancing on/off, price, JSON report per workbook, workbook-unchanged proof. One non-monotone response (Brightwater downside IRR rises when revenue falls: lower revolver draw → smaller senior claim from a working-capital release) is asserted only if fully explained |
| 7 | Verification of datapoints was a 600-character window | A figure from another column/period could pass | Row + column-order check added; 0 failures. Counts corrected in docs (docs previously implied ~200/case) |
| 8 | Docs inconsistent with code (distress-score weights, 55/30/15 probabilities, exit-price rule, secondary tests) | Misleading methodology | Corrected |
| 9 | UI: typing a negative growth rate key-by-key flipped its sign; capital-structure table overflowed on desktop; layout unusable at 390 px; unnamed inputs; favicon 404 | Usability and credibility | `NumInput`, scroll containers, responsive sidebar, aria-labels, icon |
| 10 | Production: reconciliation page read `data/` with `fs` at run time; SEC route sent a placeholder contact in its User-Agent | Fails on serverless; violates SEC fair-access | Static JSON import; `SEC_USER_AGENT` is required (structured error otherwise) |
| 11 | Excel literal-in-formula check (S4) flagged the new contractual-timing formulas | — | Formulas rewritten without literals; the check was **not** weakened |

No change was made to any scenario assumption, hurdle or threshold to alter a conclusion. AMCX remains HOLD and BDN HOLD because the rules produce them.

## 3. Audit conclusions by case
- **AMCX debt:** principal by instrument ties to Note 9 at 2026-06-30 (1,315.098 + 276.706 + 143.750 = 1,735.554); the $875M 10.25% 2029 secured notes are fully extinguished (tender $861.3M + redemption $13.7M) and not carried alongside the 2032 notes; coupons, maturities, seniority, security, semiannual payment dates, call schedule, the Feb-2026 consent amendments and the May-2026 revolver/TLA termination are reflected; credit-agreement covenants are shown as terminated, not tested. Principal vs carrying value ($1,661.0M) distinguished.
- **BDN:** all 12 debt instruments tie to Note 7 ($2,624.934M); hypothetical loan terms and the 30% pool, 7.5% cap rate and 60% LTV collateral shares are labelled assumptions; real information (NOI, interest, occupancy 88.3%, maturities, covenants, company's compliance statement) separated.
- **Not independently re-downloaded:** the checks run against the cached filing text retrieved 2026-10-07; EDGAR was not re-queried in this pass (only FRED SOFR: 3.90% on 2026-10-06 confirmed). Narrative figures in the diligence notes (e.g. BDN core occupancy 88.3%, confirmed by text search of the 10-K) are not stored datapoints and are not covered by `data:verify`.

## 4. Browser QA coverage (Playwright, production build, desktop 1440 px)
- **53 routes loaded** (all main pages, plus all 11 company sub-pages for AMCX, BDN, Brightwater and Northgate): HTTP 200, no console errors, no `NaN/undefined`, no horizontal overflow, expected company text present. Screenshots of the 30 principal routes are in `docs/screenshots/qa/`; README images refreshed.
- **Interactions exercised:** scenario buttons (Base/Downside/Severe) and Reset; editing assumptions (including typing `-25` key by key) with downstream result and covenant count updating; Recovery lab override; Returns calculator price change; Sources & data lineage panel open/close; navigation from capital structure → recovery → returns; company switch AMCX ↔ BDN; Print button (the call to `window.print` was verified with a stub — **the OS print dialog / PDF output was not exercised**); SEC lookup error path.
- **Responsive:** 30 pages at 390, 768, 1024, 1440 px: no page-level horizontal scroll after fixes (wide tables scroll inside their box). Accessible names: inputs/buttons audited; the three labs have labels. **Not done:** formal colour-contrast measurement, full keyboard-only traversal, screen-reader testing.
- Not every one of the 18 demo companies' pages was visited; Northgate and Brightwater were sampled.

## 5. Deployment
Nothing at run time depends on local files (`data/sec/` and `models/` are not needed); core features need no development server behaviour; `.env.example` documents `SEC_USER_AGENT` (optional; only the SEC lookup uses it). No secrets are in the repository (grep for key/secret/password patterns: none). The Excel workbooks are repository files, not served by the app. **Remaining action:** `npx vercel` (link project, accept defaults, optionally set `SEC_USER_AGENT`), then open `/dashboard` and `/companies/amcx/returns`. Note: `/macro` fetches FRED at request time (6 h cache) and falls back to labelled SAMPLE rows.

## 6. Remaining limitations that could affect conclusions
1. Hypothetical purchase prices, loan terms, BDN pool share, cap rate and scenario probabilities drive the results; none is a market observation.
2. Recovery value = MAX(going concern, liquidation) + cash is generous; book values stand in for appraised collateral (AMCX program rights; BDN NOI/cap-rate value plus book CIP/land/JV).
3. Annual operating model; contractual-timing IRR re-times coupons only, assumes settlement on a coupon date.
4. BDN: recovery is 100% in all scenarios because of the pool assumption; the severe IRR exceeds the base IRR; post-default projection periods are mechanical (negative cash).
5. Disclosed covenants are tested on proxy definitions; BDN proxy tests show breaches while the company reports compliance.
6. Credit score and distress score are ordinal rankings with analyst-chosen weights/thresholds, not calibrated default probabilities or industry standards.
7. Working-capital release when revenue falls can lift a distressed scenario's recovery slightly (Brightwater downside), an explained but debatable mechanic.
8. Indentures were not reviewed clause by clause; post-2026-06-30 events are not reflected; 16 demo companies are fictional.
