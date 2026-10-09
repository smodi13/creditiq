import { describe, expect, it } from "vitest";
import { portfolioAlerts, assessThesis, type Snapshot } from "@/lib/finance/alerts";
import { positionView, realPositionViews, portfolioStats, portfolioViews } from "@/lib/portfolio";
import { positions } from "@/data/portfolio";
import { companies, demoCompanies } from "@/data/companies";
import { Tranche } from "@/lib/types";

const prior: Snapshot = { netLeverage: 3, interestCoverage: 4, liquidity: 100, ebitda: 100, recoveryPct: 80 };
const input = (c: Partial<Snapshot>, extra = {}) => ({ current: { ...prior, ...c }, prior, nextMaturityYear: 2032, asOfYear: 2026, covenantHeadroomPct: 0.4 as number | null, ...extra });
const codes = (i: ReturnType<typeof input>) => portfolioAlerts(i).map((a) => a.code);

describe("portfolio risk alerts", () => {
  it("is quiet when nothing changed", () => expect(codes(input({}))).toEqual([]));
  it("leverage increased materially", () => expect(codes(input({ netLeverage: 3.6 }))).toContain("LEVERAGE"));
  it("small leverage drift is ignored", () => expect(codes(input({ netLeverage: 3.3 }))).not.toContain("LEVERAGE"));
  it("interest coverage deteriorated", () => expect(codes(input({ interestCoverage: 3.2 }))).toContain("COVERAGE"));
  it("liquidity decreased", () => expect(codes(input({ liquidity: 70 }))).toContain("LIQUIDITY"));
  it("upcoming maturity", () => expect(codes(input({}, { nextMaturityYear: 2028 }))).toContain("MATURITY"));
  it("EBITDA decline is HIGH severity", () => {
    expect(codes(input({ ebitda: 85 }))).toContain("EBITDA");
    expect(portfolioAlerts(input({ ebitda: 85 })).find((a) => a.code === "EBITDA")!.severity).toBe("HIGH");
  });
  it("covenant concern, and breach is HIGH severity", () => {
    expect(codes(input({}, { covenantHeadroomPct: 0.1 }))).toContain("COVENANT");
    expect(portfolioAlerts(input({}, { covenantHeadroomPct: -0.02 })).find((x) => x.code === "COVENANT")!.severity).toBe("HIGH");
  });
  it("recovery estimate declined", () => expect(codes(input({ recoveryPct: 70 }))).toContain("RECOVERY"));
  it("seed portfolio: the deteriorating names raise alerts", () => {
    const v = Object.fromEntries(positions.map((p) => [p.companyId, positionView(p)]));
    expect(v.evergreen.alerts.map((a) => a.code)).toEqual(expect.arrayContaining(["COVERAGE", "EBITDA"]));
    expect(v.atlas.alerts.map((a) => a.code)).toContain("LEVERAGE");
    expect(v.halcyon.alerts.some((a) => a.severity === "HIGH")).toBe(false);
  });
});

describe("thesis vs actual performance (real cases, driven by filing data)", () => {
  const plan = { statement: "", entryDate: "", entryBasis: "", entryMetrics: { revenue: 0, ebitda: 0, netLeverage: 0, coverage: 0, liquidity: 0 }, plan: { revenueGrowthYoY: -0.045, ebitdaGrowthYoY: -0.15, netLeverageMax: 3.6, coverageMin: 2.0, liquidityMin: 500 } };
  const ok = { baseBreachPeriod: null, maturityFlag: null, severeRecovery: 0.8, minRecovery: 0.7 };
  it("on track when actuals meet the plan", () => {
    const t = assessThesis(plan, { revenueYoY: -0.04, ebitdaYoY: -0.1, netLeverage: 3.4, coverage: 2.1, liquidity: 520 }, ok);
    expect(t.status).toBe("ON TRACK");
    expect(t.alerts).toHaveLength(0);
  });
  it("raises LOW / MEDIUM / HIGH alerts from data, and labels THESIS DETERIORATION", () => {
    const t = assessThesis(plan, { revenueYoY: -0.12, ebitdaYoY: -0.46, netLeverage: 4.5, coverage: 1.7, liquidity: 420 }, ok);
    expect(t.status).toBe("THESIS DETERIORATION");
    const sev = Object.fromEntries(t.alerts.map((a) => [a.code, a.severity]));
    expect(sev.EBITDA).toBe("HIGH");
    expect(sev.LEVERAGE).toBe("HIGH");
    expect(sev.REVENUE).toBe("MEDIUM");
    expect(sev.COVERAGE).toBe("MEDIUM");
    expect(sev.LIQUIDITY).toBe("MEDIUM");
  });
  it("AMC Networks 10-Q data triggers THESIS DETERIORATION; Brandywine does not", () => {
    const v = Object.fromEntries(realPositionViews().map((x) => [x.company.id, x]));
    expect(v.amcx.thesisStatus).toBe("THESIS DETERIORATION");
    expect(v.amcx.assessment!.alerts.some((a) => a.code === "EBITDA" && a.severity === "HIGH")).toBe(true);
    expect(v.bdn.thesisStatus).toBe("WATCH");
    expect(v.bdn.assessment!.alerts.filter((a) => !a.forward && a.severity === "HIGH")).toHaveLength(0);
    expect(v.amcx.hypothetical).toBe(true);
  });
  it("portfolio-level statistics aggregate cost-weighted metrics", () => {
    const s = portfolioStats(portfolioViews());
    expect(s.byIndustry.reduce((t, x) => t + x.pct, 0)).toBeCloseTo(1, 9);
    expect(s.byRisk.reduce((t, x) => t + x.pct, 0)).toBeCloseTo(1, 9);
    expect(s.wLeverage).toBeGreaterThan(0);
    expect(s.totalCost).toBeCloseTo(portfolioViews().reduce((t, v) => t + v.cost, 0), 9);
  });
});

describe("seed data integrity", () => {
  it("has 18 companies (2 public-filing cases + 16 demo) with unique ids and valid tranches (zod)", () => {
    expect(companies).toHaveLength(18);
    expect(demoCompanies).toHaveLength(16);
    expect(new Set(companies.map((c) => c.id)).size).toBe(18);
    for (const c of companies) {
      for (const t of c.tranches) expect(Tranche.safeParse(t).success, `${c.id}/${t.id}`).toBe(true);
      expect(c.tranches.some((t) => t.id === c.target.trancheId)).toBe(true);
      expect(c.sources.length).toBeGreaterThan(0);
      expect(c.diligenceItems.length).toBeGreaterThan(8);
    }
  });
  it("labels data classes: public cases are PUBLIC with hypothetical terms; demos are DEMO", () => {
    for (const c of companies) {
      expect(c.dataClass).toBe(["amcx", "bdn"].includes(c.id) ? "public" : "demo");
      expect(c.termsLabel).toBe(c.dataClass === "public" ? "HYPOTHETICAL INVESTMENT TERMS" : "DEMO INVESTMENT TERMS");
      expect(c.sources.some((s) => s.isDemo)).toBe(c.dataClass === "demo");
    }
  });
  it("includes at least three distressed situations", () => expect(companies.filter((c) => c.status === "Distressed Opportunity").length).toBeGreaterThanOrEqual(3));
});
