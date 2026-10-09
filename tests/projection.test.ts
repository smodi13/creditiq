import { describe, expect, it } from "vitest";
import { fx } from "./fixtures";
import { assumptionsFor } from "@/lib/finance/scenarios";
import { project, statement } from "@/lib/finance/projection";
import { analyze } from "@/lib/analysis";
import { ScenarioAssumptions, SCENARIOS } from "@/lib/types";

describe("income statement identities", () => {
  it("derives every line from revenue, COGS, EBITDA, D&A, SBC, interest, tax", () => {
    const s = statement({ year: 2026, revenue: 1000, cogs: 600, ebitda: 200, da: 50, sbc: 10, interest: 40, capex: 40, deltaNwc: 10 });
    expect(s.grossProfit).toBe(400);
    expect(s.opex).toBe(200);
    expect(s.ebit).toBe(140);
    expect(s.ebt).toBe(100);
    expect(s.taxes).toBeCloseTo(25, 9);
    expect(s.netIncome).toBeCloseTo(75, 9);
    expect(s.fcf).toBeCloseTo(75 + 50 + 10 - 40 - 10, 9);
  });
  it("does not book a tax benefit on losses", () => {
    expect(statement({ year: 1, revenue: 100, cogs: 50, ebitda: 5, da: 10, interest: 10, capex: 0, deltaNwc: 0 }).taxes).toBe(0);
  });
  it("accepts reported FCF and a reported tax charge (public-filing history)", () => {
    const s = statement({ year: 1, revenue: 100, cogs: 50, ebitda: 30, da: 5, interest: 10, capex: 2, deltaNwc: 0, taxes: 3, fcfOverride: 11 });
    expect(s.taxes).toBe(3);
    expect(s.fcf).toBe(11);
  });
});

describe("scenario assumptions validate with zod", () => {
  it.each(SCENARIOS)("%s assumptions are valid and stress-ordered", (k) => {
    expect(ScenarioAssumptions.safeParse(assumptionsFor(fx, k)).success).toBe(true);
  });
  it("downside < base and severe < downside on margin, gross margin and multiple; rate shock rises", () => {
    const [b, d, s] = SCENARIOS.map((k) => assumptionsFor(fx, k));
    for (let i = 0; i < 5; i++) {
      expect(d.ebitdaMargin[i]).toBeLessThan(b.ebitdaMargin[i]);
      expect(s.ebitdaMargin[i]).toBeLessThan(d.ebitdaMargin[i]);
      expect(d.grossMargin[i] - d.ebitdaMargin[i]).toBeCloseTo(b.grossMargin[i] - b.ebitdaMargin[i], 9); // opex ratio held
    }
    expect(d.exitMultiple).toBeLessThan(b.exitMultiple);
    expect(s.rateShock).toBeGreaterThan(d.rateShock);
  });
  it("rejects out-of-range user input", () => {
    expect(ScenarioAssumptions.safeParse({ ...assumptionsFor(fx, "base"), capexPct: 3 }).success).toBe(false);
    expect(ScenarioAssumptions.safeParse({ ...assumptionsFor(fx, "base"), revenueGrowth: [0.1] }).success).toBe(false);
  });
});

describe("projections (fixture)", () => {
  const p = Object.fromEntries(SCENARIOS.map((k) => [k, project(fx, assumptionsFor(fx, k), k)]));
  it("base case: revenue grows 3%, margin held, no default; 2027 notes repaid from cash", () => {
    const y = p.base.years;
    expect(y[0].revenue).toBeCloseTo(1000 * 1.03, 6);
    expect(y[0].ebitda / y[0].revenue).toBeCloseTo(0.2, 6);
    expect(p.base.defaultYear).toBeNull();
    expect(y[1].refiEvents[0].resolution).toBe("Repaid from cash");
    expect(y[1].debt.sn).toBe(0);
  });
  it("downside and severe are below base every period; interest higher on floating debt", () => {
    for (let i = 0; i < 5; i++) {
      expect(p.downside.years[i].ebitda).toBeLessThan(p.base.years[i].ebitda);
      expect(p.severe.years[i].ebitda).toBeLessThan(p.downside.years[i].ebitda);
    }
    expect(p.downside.years[0].cashInterest).toBeGreaterThan(p.base.years[0].cashInterest);
  });
  it("severe downside: first-period revenue falls 18% × cyclicality factor", () => {
    expect(p.severe.years[0].revenue).toBeCloseTo(1000 * (1 - 0.18 * 1.0), 6);
  });
  it("cash and debt roll forward consistently", () => {
    const y = p.base.years;
    expect(y[0].cash).toBeCloseTo(100 + y[0].fcf - 300 * 0.05, 6);
    expect(y[0].debt.tl).toBeCloseTo(285, 9);
    expect(y[0].netDebt).toBeCloseTo(y[0].totalDebt - y[0].cash, 9);
  });
  it("maturity with too little cash and no market access is a payment default and stays a claim", () => {
    const a = { ...assumptionsFor(fx, "base"), maxRefiNetLeverage: 0, minRefiCoverage: 99, ebitdaMargin: [0.2, 0.02, 0.02, 0.02, 0.02] };
    const pr = project({ ...fx, cash: 20 }, a);
    expect(pr.defaultYear).toBe(2027);
    expect(pr.years[1].debt.sn).toBeGreaterThan(0);
    expect(pr.years[1].unpaid).toBeGreaterThan(0);
    expect(pr.years[2].fundingGap).toBeGreaterThan(0); // cash exhausted the following period
    expect(pr.years[1].refiEvents[0].passes).toBe(false);
    expect(["Payment default", "Partially repaid; payment default"]).toContain(pr.years[1].refiEvents[0].resolution);
  });
  it("PIK interest accrues to principal and floors bind", () => {
    const withPik = { ...fx, tranches: fx.tranches.map((t) => (t.id === "2l" ? { ...t, pik: 0.02 } : t)) };
    const y = project(withPik, assumptionsFor(withPik, "base")).years;
    expect(y[0].pikInterest).toBeCloseTo(2, 9);
    expect(y[0].debt["2l"]).toBeCloseTo(102, 9);
    const floored = { ...fx, tranches: fx.tranches.map((t) => (t.id === "tl" ? { ...t, floor: 0.06 } : t)), sofr: [0.01, 0.01, 0.01, 0.01, 0.01] };
    const r = project(floored, assumptionsFor(floored, "base")).years[0].rates.tl;
    expect(r).toBeCloseTo(0.06 + (0.08 - 0.0425), 9); // floor replaces SOFR in the all-in rate
  });
  it("analysis ties together: recoveries bounded by claims", () => {
    const a = analyze(fx);
    for (const k of SCENARIOS) for (const r of a.recovery[k].waterfall.rows) expect(r.recoveryPct).toBeLessThanOrEqual(1 + 1e-12);
  });
});
