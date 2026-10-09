import { INDUSTRY_RISK, RISK_BANDS, SCORE_MATURITY_WINDOW, SCORE_THRESHOLDS, SCORE_WEIGHTS } from "../config";
import type { Company, Snapshot } from "../types";
import { annualInterest, debtDue12m, debtDueWithin, totalDebt } from "./metrics";

export interface ScoreFactor {
  key: keyof typeof SCORE_WEIGHTS; label: string; raw: number | null; unit: string; best: number | null; worst: number | null; weight: number; points: number; note: string;
}
export interface ScoreResult { total: number; factors: ScoreFactor[]; risk: string }

/** Raw inputs to the score, so the same function scores today's snapshot and a prior one. */
export interface ScoreInputs {
  netLev: number | null; coverage: number | null; liqRatio: number | null; fcfDebt: number | null; maturityShare: number; marginStd: number; revStd: number; assetCov: number | null; industry: number;
}

export const scale = (v: number | null, best: number, worst: number): number => {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, (v - worst) / (best - worst)));
};
export const riskLabel = (score: number) => RISK_BANDS.find((b) => score >= b.min)!.label;
const std = (xs: number[]) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };

export function currentSnapshot(c: Company): Snapshot {
  const l = c.history[c.history.length - 1];
  return { label: c.baseLabel, totalDebt: totalDebt(c.tranches), cash: c.cash, undrawnRevolver: c.undrawnRevolver, ebitda: l.ebitda, interest: l.interest, fcf: l.fcf };
}

export function scoreInputs(c: Company, s: Snapshot = currentSnapshot(c)): ScoreInputs {
  const fy = c.history.filter((h) => !h.isLtm);
  const margins = fy.map((h) => h.ebitda / h.revenue);
  const growth = fy.slice(1).map((h, i) => h.revenue / fy[i].revenue - 1);
  const amort = c.tranches.reduce((a, t) => a + Math.min(t.principal, t.amortPct * t.principal), 0);
  const obligations = debtDue12m(c) + amort + s.interest;
  return {
    netLev: s.ebitda > 0 ? (s.totalDebt - s.cash) / s.ebitda : null,
    coverage: s.interest > 0 ? s.ebitda / s.interest : null,
    liqRatio: obligations > 0 ? (s.cash + s.undrawnRevolver) / obligations : null,
    fcfDebt: s.totalDebt > 0 ? s.fcf / s.totalDebt : null,
    maturityShare: debtDueWithin(c, SCORE_MATURITY_WINDOW) / (totalDebt(c.tranches) || 1),
    marginStd: std(margins), revStd: std(growth.length ? growth : [0]),
    assetCov: s.totalDebt > 0 ? c.assetBase / s.totalDebt : null,
    industry: INDUSTRY_RISK[c.sector] ?? 0.5,
  };
}

export function scoreFrom(i: ScoreInputs, weights: Record<string, number> = SCORE_WEIGHTS): ScoreResult {
  const T = SCORE_THRESHOLDS;
  const raw: Record<string, number | null> = { leverage: i.netLev, coverage: i.coverage, liquidity: i.liqRatio, fcf: i.fcfDebt, maturity: i.maturityShare, marginStability: i.marginStd, revenueStability: i.revStd, assetCoverage: i.assetCov };
  const mk = (key: keyof typeof SCORE_WEIGHTS, label: string, note: string): ScoreFactor => {
    const w = weights[key];
    if (key === "industry") return { key, label, raw: i.industry, unit: "analyst sector factor 0–1", best: 1, worst: 0, weight: w, points: w * i.industry, note };
    const t = T[key as keyof typeof T];
    return { key, label, raw: raw[key], unit: t.unit, best: t.best, worst: t.worst, weight: w, points: w * scale(raw[key], t.best, t.worst), note };
  };
  const factors = [
    mk("leverage", "Leverage", "Net debt / LTM EBITDA"), mk("coverage", "Coverage", "LTM EBITDA / interest expense"),
    mk("liquidity", "Liquidity", "Cash + undrawn revolver vs next-period obligations"), mk("fcf", "Free cash flow", "LTM FCF / total debt"),
    mk("maturity", "Maturity risk", `Share of debt maturing within ${SCORE_MATURITY_WINDOW} periods`), mk("marginStability", "Margin stability", "Std-dev of annual EBITDA margin"),
    mk("revenueStability", "Revenue stability", "Std-dev of annual revenue growth"), mk("assetCoverage", "Asset coverage", "Asset base / total debt"), mk("industry", "Industry risk", "Sector factor (config.ts)"),
  ];
  const total = Math.round(factors.reduce((s, f) => s + f.points, 0) * 10) / 10;
  return { total, factors, risk: riskLabel(total) };
}
import type { ProjectionYear } from "./projection";
/** Score with the leverage / coverage / liquidity / FCF factors measured on the first projected period of a scenario (forward-looking). */
export function projectedScore(c: Company, y: ProjectionYear, weights: Record<string, number> = SCORE_WEIGHTS): ScoreResult {
  const base = scoreInputs(c);
  const amort = c.tranches.reduce((a, t) => a + Math.min(t.principal, t.amortPct * t.principal), 0);
  const obligations = debtDue12m(c) + amort + c.history[c.history.length - 1].interest;
  return scoreFrom({ ...base, netLev: y.netLeverage, coverage: y.interestCoverage, liqRatio: obligations > 0 ? y.liquidity / obligations : null, fcfDebt: y.totalDebt > 0 ? y.fcf / y.totalDebt : null }, weights);
}
export const creditScore = (c: Company, weights: Record<string, number> = SCORE_WEIGHTS): ScoreResult => scoreFrom(scoreInputs(c), weights);

export interface ScoreDelta { key: string; label: string; prior: number | null; current: number | null; pointsDelta: number; direction: "positive" | "negative" | "neutral"; text: string }
export interface ScoreChange { priorLabel: string; currentLabel: string; priorTotal: number; currentTotal: number; deltas: ScoreDelta[] }

const FMT: Record<string, (v: number | null) => string> = {
  leverage: (v) => (v == null ? "n/m" : `${v.toFixed(1)}x`), coverage: (v) => (v == null ? "n/m" : `${v.toFixed(1)}x`), liquidity: (v) => (v == null ? "n/m" : `${v.toFixed(1)}x`),
  fcf: (v) => (v == null ? "n/m" : `${(v * 100).toFixed(1)}%`), maturity: (v) => (v == null ? "n/m" : `${(v * 100).toFixed(0)}%`), assetCoverage: (v) => (v == null ? "n/m" : `${v.toFixed(2)}x`),
  marginStability: (v) => (v == null ? "n/m" : `${(v * 100).toFixed(1)} pts`), revenueStability: (v) => (v == null ? "n/m" : `${(v * 100).toFixed(1)} pts`), industry: (v) => (v == null ? "n/m" : v.toFixed(2)),
};
const VERB: Record<string, [string, string]> = {
  leverage: ["Net leverage", "x"], coverage: ["Interest coverage", "x"], liquidity: ["Liquidity ratio", "x"], fcf: ["FCF / debt", ""], maturity: ["Near-term maturity share", ""], assetCoverage: ["Asset coverage", ""],
  marginStability: ["Margin volatility", ""], revenueStability: ["Revenue volatility", ""], industry: ["Industry risk factor", ""],
};

/** Why did the score change? Compares today's score to a prior snapshot, factor by factor. */
export function scoreChange(c: Company, prior: Snapshot): ScoreChange {
  const p = scoreFrom(scoreInputs(c, prior));
  const n = scoreFrom(scoreInputs(c));
  const deltas = n.factors.map((f, i): ScoreDelta => {
    const pf = p.factors[i];
    const d = f.points - pf.points;
    const dir = Math.abs(d) < 0.25 ? "neutral" : d > 0 ? "positive" : "negative";
    const [name] = VERB[f.key];
    const fmt = FMT[f.key];
    const verb = f.raw == null || pf.raw == null ? "changed" : f.raw > pf.raw ? "increased" : f.raw < pf.raw ? "fell" : "was unchanged";
    const text = dir === "neutral" ? `${name} ${verb === "was unchanged" ? "unchanged" : "broadly stable"} at ${fmt(f.raw)}` : `${name} ${verb} from ${fmt(pf.raw)} to ${fmt(f.raw)} (${d > 0 ? "+" : ""}${d.toFixed(1)} pts, ${dir})`;
    return { key: f.key, label: f.label, prior: pf.raw, current: f.raw, pointsDelta: d, direction: dir, text };
  });
  return { priorLabel: prior.label, currentLabel: c.baseLabel, priorTotal: p.total, currentTotal: n.total, deltas };
}
export { annualInterest };
