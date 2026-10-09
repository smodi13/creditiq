import { describe, expect, it } from "vitest";
import { fx } from "./fixtures";
import { assumptionsFor } from "@/lib/finance/scenarios";
import { project } from "@/lib/finance/projection";
import { testCovenants, rawMetric } from "@/lib/finance/covenants";
import type { Company, Covenant } from "@/lib/types";

const withCov = (cov: Covenant[]): Company => ({ ...fx, covenants: cov });
const base = (c: Company) => project(c, assumptionsFor(c, "base"));

describe("covenant engine", () => {
  it("maximum net leverage: current metric, covenant, headroom and PASS status", () => {
    const c = withCov([{ id: "l", label: "Max net leverage", type: "maxNetLeverage", thresholds: Array(5).fill(5.0), basis: "hypothetical" }]);
    const t = testCovenants(c, base(c), 900)[0].tests[0];
    expect(t.status).toBe("PASS");
    expect(t.headroom).toBeCloseTo(5.0 - t.metric!, 9);
    expect(t.headroomPct).toBeCloseTo((5.0 - t.metric!) / 5.0, 9);
  });
  it("breach shows negative headroom and the first breach period (spec example: 5.7x vs 5.0x)", () => {
    const c = withCov([{ id: "l", label: "Max net leverage", type: "maxNetLeverage", thresholds: Array(5).fill(1.0), basis: "hypothetical" }]);
    const r = testCovenants(c, base(c), 900)[0];
    expect(r.tests[0].status).toBe("BREACH");
    expect(r.tests[0].headroom!).toBeLessThan(0);
    expect(r.firstBreachYear).toBe(2026);
    expect(r.minHeadroomPct!).toBeLessThan(0);
  });
  it("minimum interest coverage is a higher-is-better test", () => {
    const c = withCov([{ id: "c", label: "Min coverage", type: "minInterestCoverage", thresholds: Array(5).fill(2.0), basis: "disclosed" }]);
    const t = testCovenants(c, base(c), 900)[0].tests[0];
    expect(t.metric!).toBeGreaterThan(2.0);
    expect(t.headroom).toBeCloseTo(t.metric! - 2.0, 9);
    expect(t.status).toBe("PASS");
  });
  it("supports LTV, secured LTV, liquidity and EBITDA tests; thresholds can step by period", () => {
    const c = withCov([
      { id: "a", label: "LTV", type: "maxLTV", thresholds: [0.9, 0.8, 0.7, 0.6, 0.5], basis: "hypothetical" },
      { id: "b", label: "Secured LTV", type: "maxSecuredLTV", thresholds: Array(5).fill(0.5), basis: "hypothetical" },
      { id: "c", label: "Liquidity", type: "minLiquidity", thresholds: Array(5).fill(50), basis: "hypothetical" },
      { id: "d", label: "EBITDA", type: "minEBITDA", thresholds: Array(5).fill(150), basis: "hypothetical" },
    ]);
    const p = base(c);
    const r = testCovenants(c, p, 900);
    expect(r[0].tests.map((t) => t.threshold)).toEqual([0.9, 0.8, 0.7, 0.6, 0.5]);
    expect(rawMetric("maxLTV", p.years[0], 900)).toBeCloseTo(p.years[0].totalDebt / 900, 9);
    expect(r[1].tests[0].metric).toBeCloseTo(p.years[0].securedDebt / 900, 9);
    expect(r[2].tests[0].metric).toBeCloseTo(p.years[0].liquidity, 9);
    expect(r[3].tests[0].status).toBe("PASS");
  });
  it("inactive (terminated / reference-only) covenants are not tested", () => {
    const c = withCov([{ id: "x", label: "Terminated", type: "maxNetLeverage", thresholds: Array(5).fill(0.1), basis: "disclosed", active: false }]);
    expect(testCovenants(c, base(c), 900)).toHaveLength(0);
  });
  it("downside breaches covenants that the base case passes (seed: AMC Networks hypothetical package)", async () => {
    const { analyze } = await import("@/lib/analysis");
    const { getCompany } = await import("@/data/companies");
    const a = analyze(getCompany("amcx")!);
    const breaches = (k: "base" | "downside" | "severe") => a.covenants[k].reduce((s, x) => s + x.tests.filter((t) => t.status === "BREACH").length, 0);
    expect(breaches("base")).toBe(0);
    expect(breaches("downside")).toBeGreaterThan(0);
    expect(breaches("severe")).toBeGreaterThanOrEqual(breaches("downside"));
  });
});
