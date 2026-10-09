import { describe, expect, it } from "vitest";
import { fx } from "./fixtures";
import { creditMetrics, metric, annualInterest, totalDebt, debtDue12m, debtDueWithin } from "@/lib/finance/metrics";

describe("credit metrics (fixture: EBITDA 200, debt 600, cash 100)", () => {
  const m = creditMetrics(fx);
  it("computes debt, net debt and leverage", () => {
    expect(totalDebt(fx.tranches)).toBe(600);
    expect(metric(m, "netDebt")).toBe(500);
    expect(metric(m, "grossLev")).toBeCloseTo(3.0, 6);
    expect(metric(m, "netLev")).toBeCloseTo(2.5, 6);
    expect(metric(m, "securedLev")).toBeCloseTo(2.0, 6);
  });
  it("computes interest coverage on EBITDA and EBIT", () => {
    const interest = 300 * 0.08 + 100 * 0.11 + 200 * 0.07; // 49
    expect(annualInterest(fx)).toBeCloseTo(49, 9);
    expect(metric(m, "ebitdaInt")).toBeCloseTo(200 / 49, 9);
    expect(metric(m, "intCov")).toBeCloseTo((200 - 50) / interest, 9);
  });
  it("computes DSCR, FCF/debt, liquidity ratio and short-term debt", () => {
    const l = fx.history[3];
    const amort = 300 * 0.05;
    expect(metric(m, "dscr")).toBeCloseTo((l.ebitda - l.capex - l.taxes) / (49 + amort), 9);
    expect(metric(m, "fcfDebt")).toBeCloseTo(l.fcf / 600, 9);
    expect(debtDue12m(fx)).toBe(0); // nothing matures in 2026
    expect(debtDueWithin(fx, 2)).toBe(200); // notes mature in 2027
    expect(metric(m, "stDebtLiq")).toBe(0);
  });
});
