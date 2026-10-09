import { describe, expect, it } from "vitest";
import { bondReturn, contractualFlows, contractualIrr, currentYield, irr, ytm } from "@/lib/finance/returns";
import { analyze } from "@/lib/analysis";
import { getCompany } from "@/data/companies";
import { collateralStress } from "@/lib/collateral";

describe("IRR", () => {
  it("solves a simple two-flow case", () => expect(irr([0, 1], [-100, 110])).toBeCloseTo(0.1, 8));
  it("handles irregular timing", () => expect(irr([0, 0.5], [-100, 105])).toBeCloseTo(1.05 ** 2 - 1, 6));
  it("returns null without a sign change", () => expect(irr([0, 1], [100, 100])).toBeNull());
});

describe("bond returns: face value, purchase price, coupon, yield and recovery are distinct", () => {
  it("par bond held to par: IRR = coupon, MOIC = 1 + coupon × years", () => {
    const r = bondReturn({ price: 100, face: 100, coupons: [0.08, 0.08, 0.08], holdYears: 3, exitPrice: 100 });
    expect(r.irr).toBeCloseTo(0.08, 6);
    expect(r.moic).toBeCloseTo(1.24, 9);
    expect(r.profit).toBeCloseTo(24, 9);
    expect(r.cashInterest).toBeCloseTo(24, 9);
    expect(r.capitalGain).toBeCloseTo(0, 9);
  });
  it("discount purchase (92): cash investment 92, capital gain 8, IRR above coupon; fees reduce the return", () => {
    const a = bondReturn({ price: 92, face: 100, coupons: [0.1, 0.1], holdYears: 2, exitPrice: 100 });
    const b = bondReturn({ price: 92, face: 100, coupons: [0.1, 0.1], holdYears: 2, exitPrice: 100, feePct: 0.01 });
    expect(a.cost).toBeCloseTo(92, 9);
    expect(a.capitalGain).toBeCloseTo(8, 9);
    expect(a.totalProceeds).toBeCloseTo(120, 9);
    expect(a.currentYield).toBeCloseTo(10 / 92, 9);
    expect(a.irr!).toBeGreaterThan(0.1);
    expect(b.irr!).toBeLessThan(a.irr!);
    expect(b.cost).toBeCloseTo(92.92, 9);
  });
  it("default: coupons stop, recovery arrives after the lag, loss shows in MOIC (spec example: buy 92, recover 78)", () => {
    const r = bondReturn({ price: 92, face: 100, coupons: [0.1, 0.1, 0.1, 0.1, 0.1], holdYears: 5, exitPrice: 100, defaultYear: 2, recoveryProceeds: 78, resolutionLag: 1 });
    expect(r.defaulted).toBe(true);
    expect(r.flows.slice(0, 4)).toEqual([-92, 10, 10, 78]);
    expect(r.moic).toBeCloseTo(98 / 92, 9);
    expect(r.capitalGain).toBeCloseTo(78 - 92, 9);
  });
  it("floating coupons differ by year", () => {
    const r = bondReturn({ price: 100, face: 100, coupons: [0.06, 0.08, 0.1], holdYears: 3, exitPrice: 100 });
    expect(r.flows.slice(0, 4)).toEqual([-100, 6, 8, 110]);
  });
  it("total loss gives MOIC of coupons only and IRR of −100%", () => {
    const r = bondReturn({ price: 50, face: 100, coupons: [0], holdYears: 3, exitPrice: 0, defaultYear: 1, recoveryProceeds: 0 });
    expect(r.moic).toBe(0);
    expect(r.irr).toBe(-1);
  });
  it("current yield and yield to maturity", () => {
    expect(currentYield(80, 0.08)).toBeCloseTo(0.1, 9);
    expect(ytm(100, 0.07, 5)).toBeCloseTo(0.07, 6);
    expect(ytm(90, 0.07, 5)!).toBeGreaterThan(0.07);
  });
});

describe("known-answer returns", () => {
  it("[-100, 10, 10, 110] has an IRR of exactly 10%", () => expect(irr([0, 1, 2, 3], [-100, 10, 10, 110])).toBeCloseTo(0.1, 9));
  it("contractual timing with 1 payment per year reproduces the annual IRR; semiannual par bond yields (1 + 8%/2)^2 − 1", () => {
    const r = bondReturn({ price: 100, face: 100, coupons: [0.08, 0.08, 0.08], holdYears: 3, exitPrice: 100 });
    expect(contractualIrr(r, 1)).toBeCloseTo(r.irr!, 7);
    expect(contractualIrr(r, 2)).toBeCloseTo(1.04 ** 2 - 1, 7);
    expect(contractualFlows(r, 2).reduce((a, b) => a + b, 0)).toBeCloseTo(r.profit, 9); // re-timing never changes total cash
  });
});

describe("probability-weighted return = IRR of expected cash flows", () => {
  it("probabilities sum to 1 and expected IRR is the IRR of Σ p × flows (not the average of IRRs)", () => {
    for (const id of ["amcx", "bdn"]) {
      const c = getCompany(id)!, a = analyze(c);
      expect(Object.values(c.probabilities).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
      const fl = a.returns.base.flows.map((_, i) => (["base", "downside", "severe"] as const).reduce((s, k) => s + a.returns[k].flows[i] * c.probabilities[k], 0));
      expect(a.expected.irr!).toBeCloseTo(irr(a.returns.base.times, fl)!, 10);
      expect(Math.abs(a.expected.irr! - a.expected.avgIrr!)).toBeGreaterThan(1e-6);
    }
  });
});

describe("BDN collateral stress", () => {
  it("recovery is 100% at the base inputs, falls below 100% exactly at the break-even asset value, and is monotonic in the pool share", () => {
    const c = getCompany("bdn")!, a = analyze(c);
    const h = c.history[c.history.length - 1];
    const s = collateralStress(c, h.revenue - h.cogs, a.assumptions.severe.liquidationRecovery);
    expect(s.applies).toBe(true);
    expect(s.tablePool[2][1]).toBe(1); // 30% pool, 85% realization
    const be = s.breakEvenValue, f = (v: number) => Math.min(1, (s.poolPct * v * s.liq * (1 - s.admin)) / s.claim);
    expect(f(be * 1.0001)).toBe(1);
    expect(f(be * 0.99)).toBeLessThan(1);
    expect(f(be)).toBeCloseTo(1, 12);
    for (const row of s.tablePool[0].keys()) if (row > 0) expect(s.tablePool[0][row]).toBeLessThanOrEqual(s.tablePool[0][row - 1]);
  });
});
