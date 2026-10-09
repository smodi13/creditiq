/**
 * Exports every company as models/cases/<id>.json (inputs consumed by scripts/build_model.py) and
 * models/cases/<id>.web.json (the web engine's outputs, used for Excel ⇄ web reconciliation).
 * Run: npm run export:cases
 */
import fs from "node:fs";
import path from "node:path";
import { companies } from "@/data/companies";
import { analyze } from "@/lib/analysis";
import { webMetrics } from "@/lib/recon";
import { INDUSTRY_RISK, RISK_BANDS, SCORE_MATURITY_WINDOW, SCORE_THRESHOLDS, SCORE_WEIGHTS, MATURITY_MATERIAL_PCT, MATURITY_WINDOW_YEARS } from "@/lib/config";
import { SCENARIOS, type Company, type HistoricalSpec } from "@/lib/types";

const OUT = path.join(import.meta.dirname, "..", "models", "cases");
fs.mkdirSync(OUT, { recursive: true });

function demoSpec(c: Company): HistoricalSpec {
  const cols = c.history.map((h) => ({ id: `FY${h.year}`, label: h.label ?? `FY${h.year}A`, kind: "fy" as const, year: h.year }));
  const mk = (key: string, label: string, f: (h: Company["history"][number]) => number, group: "income" | "cash" = "income") => ({ key, label, group, values: Object.fromEntries(c.history.map((h) => [`FY${h.year}`, f(h)])) });
  return {
    mode: "bridge", columns: cols,
    inputs: [mk("revenue", "Revenue", (h) => h.revenue), mk("cogs", "COGS", (h) => h.cogs), mk("opex", "Operating expenses (cash, ex-D&A)", (h) => h.opex), mk("da", "Depreciation & amortization", (h) => h.da), mk("interest", "Interest expense", (h) => h.interest),
      mk("taxes", "Taxes", (h) => h.taxes), mk("capex", "Capex", (h) => h.capex, "cash"), mk("dnwc", "Increase in working capital", (h) => h.deltaNwc, "cash")],
    lines: { revenue: [["revenue", 1]], cogs: [["cogs", 1]], opexAdj: [["opex", 1]], da: [["da", 1]], sbc: [], interest: [["interest", 1]], taxes: [["taxes", 1]], capex: [["capex", 1]], dnwc: [["dnwc", 1]] },
  };
}

for (const c of companies) {
  const a = analyze(c);
  const tIdx = c.tranches.findIndex((t) => t.id === c.target.trancheId) + 1;
  const openHigh = c.diligenceItems.filter((d) => d.priority === "High" && d.status !== "Complete").length;
  const spec = c.historicalSpec ?? demoSpec(c);
  const model = {
    id: c.id, name: c.name, ticker: c.ticker, dataClass: c.dataClass, termsLabel: c.termsLabel, caseTitle: c.caseTitle ?? null, description: c.description,
    asOf: c.asOf, fyEndMonth: c.fyEndMonth, baseYear: c.baseYear, baseLabel: c.baseLabel, periodLabels: c.periodLabels, sofr: c.sofr, taxRate: c.taxRate,
    minCash: c.minCash, sweepPct: c.sweepPct, adminPct: c.adminPct, accruedMonths: c.accruedMonths, resolutionLag: c.resolutionLag, deficiencyRank: c.deficiencyRank,
    cash: c.cash, assetBase: c.assetBase, assetComponents: c.assetComponents ?? null, assetCapRate: c.assetCapRate ?? null, assetValueBasis: c.assetValueBasis,
    evMultiple: c.entryMultiple, industryFactor: INDUSTRY_RISK[c.sector] ?? 0.5,
    tranches: c.tranches.map((t) => ({ id: t.id, name: t.name, kind: t.kind, seniority: t.seniority, secured: t.secured, principal: t.principal, commitment: t.commitment ?? 0, rate: t.rate, spread: t.spread ?? 0, floor: t.floor ?? 0, pik: t.pik ?? 0, floating: t.floating, maturityDate: t.maturityDate, amortPct: t.amortPct, prepay: !!t.prepay, collateralPct: t.collateralPct ?? 0, price: t.price ?? 100, collateral: t.collateral ?? "", callProtection: t.callProtection ?? "" })),
    target: { trancheId: c.target.trancheId, index: tIdx, holdYears: c.target.holdYears, feePct: c.target.feePct, face: c.target.face ?? 100, payFreq: c.tranches.find((t) => t.id === c.target.trancheId)?.payFreq ?? 1 },
    assumptions: Object.fromEntries(SCENARIOS.map((s) => [s, a.assumptions[s]])), probabilities: c.probabilities, thresholds: c.thresholds,
    covenants: c.covenants, openHighDiligence: openHigh, historicalSpec: spec, sources: c.sources, provenance: c.provenance, notes: c.notes, thesis: c.thesis,
    config: { scoreWeights: SCORE_WEIGHTS, scoreThresholds: SCORE_THRESHOLDS, riskBands: RISK_BANDS, scoreWindow: SCORE_MATURITY_WINDOW, maturityMaterial: MATURITY_MATERIAL_PCT, maturityWindow: MATURITY_WINDOW_YEARS },
  };
  fs.writeFileSync(path.join(OUT, `${c.id}.json`), JSON.stringify(model, null, 1));

  const out = webMetrics(c);
  fs.writeFileSync(path.join(OUT, `${c.id}.web.json`), JSON.stringify(out, null, 1));
}
console.log(`exported ${companies.length} cases to ${OUT}`);
