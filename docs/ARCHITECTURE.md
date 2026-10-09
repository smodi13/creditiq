# Architecture

```
src/lib/types.ts        Zod schemas + domain types (Tranche, Covenant, Company, DataPoint, Thresholds…)
src/lib/config.ts       every methodology parameter: score weights, thresholds, distress weights, alerts
src/lib/finance/        pure, unit-tested modules (no React, no I/O)
  projection  scenarios  waterfall  returns  covenants  metrics  score  maturity  alerts
src/lib/analysis.ts     composes modules into one memoised Analysis per company; recommend(), breakevens(), distressScore()
src/lib/{sensitivities,collateral,recon,narrative,portfolio}.ts   7 sensitivity tables, collateral-coverage stress (secured tranches), web metrics for reconciliation, memo text, portfolio stats
src/data/               real/{amcx,bdn}.ts (public-filing cases), companies.ts (16 DEMO), portfolio.ts, macro.ts, diligence.ts
src/app/                App Router: dashboard, cases, companies/[id]/{case,financials,credit,capital-structure,scenarios,recovery,returns,diligence,memo,investment-committee}, opportunities, portfolio, macro, settings(/reconciliation)
src/components/         tables, charts, interactive labs (client); everything else is server-rendered
scripts/                real_cases.py (datapoint extraction + verification), export_cases.ts (company → JSON),
                        build_model.py (Excel generator), reconcile.py, audit_model.py (static audit + independent recomputation), model_harness.py (change-impact tests, per workbook, JSON report), validation_report.py, dump_case.ts (print an analysed case)
data/real/              provenance JSON per datapoint; data/sec/ cached filings (local, large); data/validation/ audit + harness logs
models/                 CreditIQ_{AMCX,BDN,BRIGHTWATER}_Model.xlsx, models/cases/*.json (+ .web.json, .xlsmap.json)
```

## Principles
- **One engine, two implementations.** The TypeScript engine and the Excel Calc Engine share semantics (interest on beginning balances, floating rate = MAX(SOFR, floor) + spread + shock, cash-first maturity repayment, market-access test on the remainder, collateral pools, deficiency claims). `reconcile.py` compares 178 metrics per case (276 for BDN, which adds the collateral-stress tables); `audit_model.py` adds independent Python recomputation of revenue/EBITDA/capex, interest, debt roll-forward, net debt/leverage/coverage, maturities, recovery waterfall and bounds, credit score, IRR/XIRR/MOIC, expected-cash-flow IRR and contractual-timing IRR.
- **Formulas never live in components.** Pages are server components; only interactive labs are client-side. Inputs from users or the network are parsed with Zod.
- **Provenance is typed.** Public values are `DataPoint`s (company, metric, value, period, filing, filing date, URL, page/section, retrieved date, notes); derived values carry their formula. The Excel Sources tab links live to the Historical inputs.
- **Data classes** (PUBLIC FILING / ANALYST PROJECTION / UNDERWRITING ASSUMPTION / DEMO DATA) and the hypothetical-terms label are rendered on the pages.
- **Excel generation** is JSON-driven: `models/cases/<id>.json` → `build_model.py` → LibreOffice recalculation. 63 Calc Engine blocks (3 scenarios plus 15 each for margin, growth, SOFR and multiple shifts) feed the sensitivity tables with ordinary formulas (no data tables).

## Deployment shape
Everything the app needs at run time is bundled: public-case JSON (`data/real/*.json`, imported), reconciliation snapshots (`data/recon/*.json`, statically imported — no `fs` at run time), company data in TypeScript. Only two routes touch the network: `/macro` (FRED, with labelled fallback) and `/api/sec/[ticker]` (needs `SEC_USER_AGENT`). The Excel workbooks in `models/` are repository deliverables; the app does not serve them.
