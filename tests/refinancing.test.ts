import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis";
import { getCompany } from "@/data/companies";
import { project } from "@/lib/finance/projection";
import { assumptionsFor } from "@/lib/finance/scenarios";
import { fx } from "./fixtures";

describe("refinancing risk engine", () => {
  it("records every test input for each maturing tranche", () => {
    const e = project(fx, assumptionsFor(fx, "base")).years.flatMap((y) => y.refiEvents)[0];
    expect(e.trancheId).toBe("sn");
    expect(e.balanceAtMaturity).toBeCloseTo(200, 9);
    expect(e.maxNetLeverage).toBe(8.5);
    expect(e.minCoverage).toBe(1.2);
    expect(e.coverage).toBeGreaterThan(e.minCoverage);
    expect(typeof e.proFormaInterest).toBe("number");
  });
  it("AMC Networks: base-case 2029 maturities pass and are repaid from cash; severe fails and defaults", () => {
    const a = analyze(getCompany("amcx")!);
    expect(a.refi.base.every((e) => e.passes)).toBe(true);
    expect(a.refi.base.map((e) => e.resolution)).toEqual(["Repaid from cash", "Repaid from cash"]);
    expect(a.refi.severe.some((e) => !e.passes)).toBe(true);
    expect(a.projections.severe.defaultYear).toBe(2029);
  });
  it("failure flows into recovery: the defaulted scenario carries a valuation event in the default period", () => {
    const a = analyze(getCompany("amcx")!);
    expect(a.recovery.severe.actualDefault).toBe(true);
    expect(a.recovery.severe.eventYear).toBe(2029);
    expect(a.returns.severe.defaulted).toBe(true);
    expect(a.returns.severe.recoveryPct).toBeLessThan(0.5);
  });
  it("maturity wall flags a refinancing shortfall (e.g. $X maturity, $Y liquidity, $Z requirement)", () => {
    const a = analyze(getCompany("bdn")!);
    const flagged = a.maturity.downside.filter((m) => m.flag);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0].flag).toMatch(/maturity in .*projected liquidity.*refinancing requirement/);
  });
});
