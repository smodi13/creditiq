import { describe, expect, it } from "vitest";
import { fx } from "./fixtures";
import { creditScore, scale, riskLabel, scoreChange, projectedScore } from "@/lib/finance/score";
import { SCORE_WEIGHTS } from "@/lib/config";
import { companies, getCompany } from "@/data/companies";
import { analyze, priorSnapshot } from "@/lib/analysis";

describe("credit score", () => {
  it("weights sum to 100", () => expect(Object.values(SCORE_WEIGHTS).reduce((s, x) => s + x, 0)).toBe(100));
  it("scale is linear and clamped in both directions", () => {
    expect(scale(2, 2, 7)).toBe(1);
    expect(scale(7, 2, 7)).toBe(0);
    expect(scale(4.5, 2, 7)).toBeCloseTo(0.5, 9);
    expect(scale(10, 2, 7)).toBe(0);
    expect(scale(5, 5, 1)).toBe(1); // higher-is-better direction
    expect(scale(null, 5, 1)).toBe(0);
  });
  it("factor points add up to the total and never exceed their weight", () => {
    const s = creditScore(fx);
    expect(s.factors.reduce((a, f) => a + f.points, 0)).toBeCloseTo(s.total, 0);
    for (const f of s.factors) expect(f.points).toBeLessThanOrEqual(f.weight + 1e-9);
    expect(s.total).toBeGreaterThan(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });
  it("fixture leverage factor: 2.5x net → (7−2.5)/5 of 15 pts", () => {
    const f = creditScore(fx).factors.find((x) => x.key === "leverage")!;
    expect(f.raw).toBeCloseTo(2.5, 9);
    expect(f.points).toBeCloseTo(15 * 0.9, 9);
  });
  it("weights are configurable", () => {
    const heavy = creditScore(fx, { ...SCORE_WEIGHTS, leverage: 30 });
    expect(heavy.factors.find((x) => x.key === "leverage")!.points).toBeCloseTo(30 * 0.9, 9);
  });
  it("risk bands", () => expect([80, 65, 50, 20].map(riskLabel)).toEqual(["Low", "Moderate", "Elevated", "High"]));
  it("orders the seed universe sensibly: healthy > leveraged > distressed", () => {
    const sc = (id: string) => creditScore(getCompany(id)!).total;
    expect(sc("halcyon")).toBeGreaterThan(sc("evergreen"));
    expect(sc("evergreen")).toBeGreaterThan(sc("brightwater"));
    expect(sc("northgate")).toBeGreaterThan(70);
    expect(sc("brightwater")).toBeLessThan(45);
  });
});

describe("why did the score change? (deterministic factor-by-factor explanation)", () => {
  it("AMC Networks: leverage and coverage deteriorated between FY2025A and LTM Jun-26", () => {
    const c = getCompany("amcx")!;
    const ch = scoreChange(c, priorSnapshot(c));
    expect(ch.currentTotal).toBeLessThan(ch.priorTotal);
    const lev = ch.deltas.find((d) => d.key === "leverage")!, cov = ch.deltas.find((d) => d.key === "coverage")!;
    expect(lev.prior!).toBeCloseTo(3.10, 1);
    expect(lev.current!).toBeCloseTo(4.06, 1);
    expect(lev.direction).toBe("negative");
    expect(cov.direction).toBe("negative");
    expect(lev.text).toMatch(/increased from 3\.1x to 4\.1x/);
    expect(ch.deltas.reduce((s, d) => s + d.pointsDelta, 0)).toBeCloseTo(ch.currentTotal - ch.priorTotal, 1);
  });
  it("forward-looking score responds to scenario stress", () => {
    const a = analyze(fx);
    expect(a.scoreProjected.severe.total).toBeLessThan(a.scoreProjected.base.total);
    expect(projectedScore(fx, a.projections.base.years[0]).total).toBeCloseTo(a.scoreProjected.base.total, 9);
  });
  it("covers every seeded company without NaN", () => {
    for (const c of companies) {
      const a = analyze(c);
      expect(Number.isFinite(a.score.total), c.id).toBe(true);
      expect(a.scoreChange!.deltas).toHaveLength(9);
    }
  });
});
