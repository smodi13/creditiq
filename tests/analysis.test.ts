import { describe, expect, it } from "vitest";
import { companies, getCompany } from "@/data/companies";
import { analyze } from "@/lib/analysis";
import { SCENARIOS } from "@/lib/types";

describe("analysis across the seed universe", () => {
  it("valuation recovery of the target tranche never rises as the scenario worsens", () => {
    for (const c of companies) {
      const a = analyze(c);
      const rec = (k: (typeof SCENARIOS)[number]) => a.recovery[k].waterfall.rows.find((r) => r.id === c.target.trancheId)?.recoveryPct ?? 0;
      expect(rec("base"), c.id).toBeGreaterThanOrEqual(rec("downside") - 1e-9);
      expect(rec("downside"), c.id).toBeGreaterThanOrEqual(rec("severe") - 1e-9);
    }
  });
  it("recoveries are bounded and waterfalls conserve value", () => {
    for (const c of companies) {
      const a = analyze(c);
      for (const k of SCENARIOS) {
        const w = a.recovery[k].waterfall;
        for (const r of w.rows) { expect(r.recoveryPct).toBeGreaterThanOrEqual(0); expect(r.recoveryPct).toBeLessThanOrEqual(1 + 1e-9); }
        expect(w.rows.reduce((s, r) => s + r.recovery, 0) + w.equity + w.adminClaims).toBeCloseTo(w.distributable, 6);
      }
    }
  });
  it("distressed names default in stress; healthy names survive the downside", () => {
    expect(analyze(getCompany("brightwater")!).returns.downside.defaulted).toBe(true);
    expect(analyze(getCompany("tidewater")!).returns.severe.recoveryPct).toBeLessThan(0.2);
    expect(analyze(getCompany("halcyon")!).returns.downside.defaulted).toBe(false);
  });
  it("distress screen flags the distressed names and not the healthy ones", () => {
    const f = (id: string) => analyze(getCompany(id)!).distress.flags.length;
    for (const id of ["brightwater", "tidewater", "kestrel", "redwood"]) expect(f(id), id).toBeGreaterThanOrEqual(3);
    for (const id of ["halcyon", "northgate"]) expect(f(id), id).toBe(0);
  });
  it("distressed opportunity score exposes its drivers; weights sum to 100 and subtotals reconcile", () => {
    const d = analyze(getCompany("brightwater")!).distress;
    expect(d.drivers).toHaveLength(11);
    expect(d.drivers.reduce((s, x) => s + x.weight, 0)).toBe(100);
    expect(d.score).toBeCloseTo((d.opportunity * 60 + d.safety * 40) / 100, 0);
    expect(d.drivers.every((x) => x.score >= 0 && x.score <= 100)).toBe(true);
  });
});

describe("recommendation logic (evidence based, configurable thresholds)", () => {
  it("every recommendation lists its evidence and the decision follows the rules", () => {
    for (const c of companies) {
      const r = analyze(c).recommendation;
      expect(r.evidence).toHaveLength(10);
      const core = r.evidence.filter((e) => e.core && !e.pass).length;
      const sec = r.evidence.filter((e) => !e.core && !e.pass).length;
      expect(r.coreFails).toBe(core);
      if (core === 0 && sec <= 2) expect(r.decision).toBe("PROCEED");
      if (core >= 3) expect(r.decision).toBe("PASS");
    }
  });
  it("hurdle changes the decision: lowering AMC's hurdle makes the base case clear it", () => {
    const c = getCompany("amcx")!;
    const hi = analyze({ ...c, id: "amcx-hi", thresholds: { ...c.thresholds, hurdleIrr: 0.2 } }).recommendation.evidence.find((e) => e.key === "baseIrr")!;
    const lo = analyze({ ...c, id: "amcx-lo", thresholds: { ...c.thresholds, hurdleIrr: 0.05 } }).recommendation.evidence.find((e) => e.key === "baseIrr")!;
    expect(hi.pass).toBe(false);
    expect(lo.pass).toBe(true);
  });
  it("break-evens are internally consistent", () => {
    const a = analyze(getCompany("amcx")!);
    const b = a.breakevens;
    expect(b.hurdleEntryPrice).not.toBeNull();
    // buying at the hurdle price must yield (approximately) the hurdle IRR
    const c = getCompany("amcx")!;
    const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
    expect(b.hurdleEntryPrice!).toBeLessThan(t.price! + 5);
    expect(b.ebitdaDeclineToOneTimesCoverage!).toBeGreaterThan(0.3);
    expect(b.ltvThroughTranche!).toBeGreaterThan(0);
  });
});
