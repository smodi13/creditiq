import { describe, expect, it } from "vitest";
import { fx } from "./fixtures";
import { assumptionsFor } from "@/lib/finance/scenarios";
import { project } from "@/lib/finance/projection";
import { maturityAlert, maturityWall } from "@/lib/finance/maturity";

describe("debt schedule", () => {
  const base = project(fx, assumptionsFor(fx, "base"), "base");
  it("amortizes the term loan 5% of original principal per year", () => {
    expect(base.years.slice(0, 3).map((y) => y.debt.tl)).toEqual([285, 270, 255]);
  });
  it("annual interest = beginning balance × rate (floating gets scenario shock)", () => {
    expect(base.years[0].cashInterest).toBeCloseTo(300 * 0.08 + 100 * 0.11 + 200 * 0.07, 9);
    const dn = project(fx, assumptionsFor(fx, "downside"), "downside");
    expect(dn.years[0].cashInterest).toBeCloseTo(300 * (0.08 + 0.015) + 100 * 0.11 + 200 * 0.07, 9);
  });
  it("a remainder that is refinanced reprices at the refinancing rate the following period", () => {
    const c = { ...fx, cash: 0 };
    const a = assumptionsFor(c, "base");
    const y = project(c, { ...a, capexPct: 0.12 }).years; // little cash: notes cannot be repaid from cash but market access passes
    expect(y[1].refiEvents[0].passes).toBe(true);
    expect(y[1].debt.sn).toBeGreaterThan(0);
    expect(y[2].rates.sn).toBeCloseTo(a.refiRate, 9);
  });
});

describe("maturity wall", () => {
  it("groups principal by maturity period", () => {
    const w = maturityWall(fx);
    expect(w.map((x) => [x.year, x.amount])).toEqual([[2027, 200], [2029, 300], [2030, 100]]);
    expect(w[0].pctOfDebt).toBeCloseTo(1 / 3, 9);
  });
  it("adds projected liquidity and the refinancing requirement for each maturity", () => {
    const proj = project(fx, assumptionsFor(fx, "severe"), "severe");
    const w = maturityWall(fx, proj);
    expect(w[0].liquidityAvailable).toBeGreaterThan(0);
    expect(w[0].refiRequirement).toBeCloseTo(Math.max(0, 200 - w[0].liquidityAvailable), 9);
    const tight = maturityWall({ ...fx, cash: 10 }, proj);
    expect(tight.some((b) => b.flag)).toBe(true);
  });
  it("alerts when material debt is due inside the window, scaled to liquidity", () => {
    expect(maturityAlert(fx, 100, 2).level).toBe("critical"); // 200 due vs 100 liquidity
    expect(maturityAlert(fx, 500, 2).level).toBe("watch");
    expect(maturityAlert(fx, 500, 1).level).toBe("none");
  });
});
