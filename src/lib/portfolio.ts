import { analyze, type Analysis } from "./analysis";
import { portfolioAlerts, thesisFor, type RiskAlert, type Snapshot, type ThesisAssessment } from "./finance/alerts";
import { irr } from "./finance/returns";
import { metric } from "./finance/metrics";
import { demoCompanies } from "@/data/companies";
import { positions, type Position } from "@/data/portfolio";
import { amcx, bdn } from "@/data/real";
import type { Company } from "./types";

export interface PositionView {
  key: string; hypothetical: boolean; pos?: Position; company: Company; analysis: Analysis; trancheName: string; face: number; entryPrice: number; price: number;
  cost: number; value: number; coupons: number; moic: number; irr: number | null; yieldNow: number; current: Snapshot; alerts: RiskAlert[]; nextMaturity: number; covenantStatus: "PASS" | "BREACH" | "n/a";
  covenantHeadroom: number | null; recoveryEstimate: number; risk: string; thesisStatus: string; latestUpdate: string; updateDate: string; thesis: string; assessment: ThesisAssessment | null;
}

const yrs = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / (365.25 * 86400000);

function view(c: Company, o: { key: string; hypothetical: boolean; face: number; entryPrice: number; entryDate: string; pos?: Position; prior?: Snapshot; latestUpdate: string; updateDate: string; thesis: string; thesisStatus?: string }): PositionView {
  const a = analyze(c);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const price = t.price ?? 100;
  const years = Math.max(0.01, yrs(o.entryDate, c.asOf));
  const cost = (o.face * o.entryPrice) / 100;
  const value = (o.face * price) / 100;
  const rate = a.projections.base.years[0].rates[t.id];
  const coupons = o.face * rate * years;
  const times = [0], flows = [-cost];
  for (let k = 1; k <= Math.floor(years); k++) { times.push(k); flows.push(o.face * rate); }
  times.push(years); flows.push(value + o.face * rate * (years - Math.floor(years)));
  const nl = metric(a.metrics, "netLev") ?? 0, ic = metric(a.metrics, "ebitdaInt") ?? 0;
  const last = c.history[c.history.length - 1];
  const rec = a.recovery.downside.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
  const current: Snapshot = { netLeverage: nl, interestCoverage: ic, liquidity: c.cash + c.undrawnRevolver, ebitda: last.ebitda, recoveryPct: rec * 100 };
  const heads = a.covenants.base.map((x) => x.tests[0]?.headroomPct).filter((x): x is number => x != null);
  const covenantHeadroom = heads.length ? Math.min(...heads) : null;
  const nextMaturity = Math.min(...c.tranches.map((x) => x.maturityYear));
  const assessment = thesisFor(c, a);
  const alerts = assessment ? assessment.alerts : portfolioAlerts({ current, prior: o.prior!, nextMaturityYear: nextMaturity, asOfYear: c.baseYear, covenantHeadroomPct: covenantHeadroom });
  const thesisStatus = assessment ? assessment.status : alerts.some((x) => x.severity === "HIGH") ? "Impaired" : alerts.length ? "Under review" : "On track";
  return {
    key: o.key, hypothetical: o.hypothetical, pos: o.pos, company: c, analysis: a, trancheName: t.name, face: o.face, entryPrice: o.entryPrice, price, cost, value, coupons, moic: (value + coupons) / cost, irr: irr(times, flows), yieldNow: (rate * 100) / price, current,
    alerts, nextMaturity, covenantStatus: a.covenants.base.length ? (a.covenants.base.some((x) => x.tests[0]?.status === "BREACH") ? "BREACH" : "PASS") : "n/a", covenantHeadroom, recoveryEstimate: rec, risk: a.score.risk,
    thesisStatus: o.thesisStatus ?? thesisStatus, latestUpdate: o.latestUpdate, updateDate: o.updateDate, thesis: o.thesis, assessment,
  };
}

export const positionView = (pos: Position): PositionView => {
  const c = demoCompanies.find((x) => x.id === pos.companyId)!;
  return view(c, { key: pos.companyId, hypothetical: false, face: pos.face, entryPrice: pos.entryPrice, entryDate: pos.entryDate, pos, prior: pos.prior, latestUpdate: pos.latestUpdate, updateDate: pos.updateDate, thesis: pos.thesis, thesisStatus: pos.thesisStatus });
};

/** Real public cases tracked as HYPOTHETICAL positions entered on the filing date of the FY2025 10-K. */
export const realPositionViews = (): PositionView[] => [amcx, bdn].map((c) => view(c, {
  key: c.id, hypothetical: true, face: c.target.face ?? 100, entryPrice: c.tranches.find((t) => t.id === c.target.trancheId)!.price ?? 100, entryDate: c.thesisPlan!.entryDate,
  latestUpdate: `${c.monitoring!.label}: revenue ${(c.monitoring!.revenueYoY * 100).toFixed(1)}% YoY, EBITDA ${(c.monitoring!.ebitdaYoY * 100).toFixed(1)}% YoY.`, updateDate: c.asOf, thesis: c.thesisPlan!.statement,
}));
export const portfolioViews = () => positions.map(positionView);

export interface PortfolioStats {
  totalCost: number; totalValue: number; wYield: number; wIrr: number | null; wLeverage: number; wCoverage: number;
  byIndustry: { name: string; cost: number; pct: number }[]; byRisk: { name: string; cost: number; pct: number }[];
  maturity: { year: number; cost: number }[]; covenantBreaches: number; distressedPct: number; recoveryWeighted: number; lowRecoveryPct: number;
}
export function portfolioStats(vs: PositionView[]): PortfolioStats {
  const cost = vs.reduce((s, v) => s + v.cost, 0);
  const w = (f: (v: PositionView) => number) => vs.reduce((s, v) => s + f(v) * v.cost, 0) / cost;
  const group = (k: (v: PositionView) => string) => Object.entries(vs.reduce<Record<string, number>>((m, v) => ({ ...m, [k(v)]: (m[k(v)] ?? 0) + v.cost }), {})).map(([name, c]) => ({ name, cost: c, pct: c / cost })).sort((a, b) => b.cost - a.cost);
  const mat = Object.entries(vs.reduce<Record<number, number>>((m, v) => ({ ...m, [v.nextMaturity]: (m[v.nextMaturity] ?? 0) + v.cost }), {})).map(([y, c]) => ({ year: Number(y), cost: c })).sort((a, b) => a.year - b.year);
  const irrs = vs.map((v) => v.irr);
  return {
    totalCost: cost, totalValue: vs.reduce((s, v) => s + v.value, 0), wYield: w((v) => v.yieldNow), wIrr: irrs.every((x) => x != null) ? w((v) => v.irr as number) : null,
    wLeverage: w((v) => v.current.netLeverage), wCoverage: w((v) => v.current.interestCoverage), byIndustry: group((v) => v.company.sector), byRisk: group((v) => v.risk), maturity: mat,
    covenantBreaches: vs.filter((v) => v.covenantStatus === "BREACH").length, distressedPct: vs.filter((v) => v.analysis.distress.flags.length >= 3).reduce((s, v) => s + v.cost, 0) / cost,
    recoveryWeighted: w((v) => v.recoveryEstimate), lowRecoveryPct: vs.filter((v) => v.recoveryEstimate < 0.6).reduce((s, v) => s + v.cost, 0) / cost,
  };
}
