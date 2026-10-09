import { describe, expect, it } from "vitest";
import { runWaterfall } from "@/lib/finance/waterfall";

const stack = [
  { id: "ss", name: "Senior Secured", amount: 100, rank: 1 },
  { id: "2l", name: "Second Lien", amount: 50, rank: 2 },
  { id: "un", name: "Unsecured", amount: 75, rank: 3 },
];

describe("recovery waterfall (spec example: $180M of value)", () => {
  const w = runWaterfall(180, stack);
  it("pays senior secured in full, second lien in full, unsecured gets the residual", () => {
    expect(w.rows.map((r) => r.recovery)).toEqual([100, 50, 30]);
    expect(w.rows.map((r) => r.recoveryPct)).toEqual([1, 1, 0.4]);
    expect(w.rows[2].loss).toBe(45);
    expect(w.rows[2].lossPct).toBeCloseTo(0.6, 9);
    expect(w.equity).toBe(0);
  });
  it("conserves value", () => expect(w.rows.reduce((s, r) => s + r.recovery, 0) + w.equity + w.adminClaims).toBeCloseTo(180, 9));
  it("wipes out junior classes in order as value falls", () => {
    expect(runWaterfall(120, stack).rows.map((r) => r.recovery)).toEqual([100, 20, 0]);
    expect(runWaterfall(60, stack).rows.map((r) => r.recoveryPct)).toEqual([0.6, 0, 0]);
  });
  it("gives equity the residual when value exceeds claims", () => expect(runWaterfall(300, stack).equity).toBe(75));
  it("shares pro rata inside a rank and charges admin costs first", () => {
    const w2 = runWaterfall(100, [{ id: "a", name: "A", amount: 60, rank: 1 }, { id: "b", name: "B", amount: 40, rank: 1 }, { id: "c", name: "C", amount: 100, rank: 2 }], 0.1);
    expect(w2.adminClaims).toBe(10);
    expect(w2.rows[0].recovery).toBeCloseTo(54, 9);
    expect(w2.rows[1].recovery).toBeCloseTo(36, 9);
    expect(w2.rows[2].recovery).toBe(0);
  });
  it("handles zero value and negative input", () => expect(runWaterfall(-5, stack).rows.every((r) => r.recovery === 0)).toBe(true));
});

describe("collateral pools and deficiency claims", () => {
  const claims = [
    { id: "sec", name: "Secured on a pool", amount: 400, rank: 1, collateralPct: 0.3 },
    { id: "u1", name: "Unsecured A", amount: 300, rank: 2 },
    { id: "u2", name: "Unsecured B", amount: 200, rank: 2 },
  ];
  it("secured claim is paid from its own pool only; its shortfall shares with unsecured at the deficiency rank", () => {
    const w = runWaterfall(1000, claims, 0, 2); // pool = 300 < 400 claim → deficiency 100 joins rank 2
    const [s, a, b] = w.rows;
    expect(s.fromCollateral).toBeCloseTo(300, 9);
    // general pool = 1000 − 300 = 700 for claims 100 + 300 + 200 = 600 → all paid in full
    expect(s.recovery).toBeCloseTo(400, 9);
    expect(a.recoveryPct).toBeCloseTo(1, 9);
    expect(b.recoveryPct).toBeCloseTo(1, 9);
    expect(w.equity).toBeCloseTo(100, 9);
  });
  it("when value is short, the deficiency dilutes the unsecured creditors pro rata", () => {
    const w = runWaterfall(600, claims, 0, 2); // pool 180; general = 420 for 220 + 300 + 200 = 720 (deficiency 220)
    const [s, a, b] = w.rows;
    expect(s.fromCollateral).toBeCloseTo(180, 9);
    expect(s.fromGeneral).toBeCloseTo((220 / 720) * 420, 6);
    expect(a.recovery / a.amount).toBeCloseTo(420 / 720, 9);
    expect(b.recovery / b.amount).toBeCloseTo(420 / 720, 9);
    expect(w.rows.reduce((t, r) => t + r.recovery, 0) + w.equity).toBeCloseTo(600, 9);
  });
});
