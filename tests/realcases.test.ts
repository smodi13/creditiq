import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { amcx, bdn } from "@/data/real";
import { analyze } from "@/lib/analysis";
import { webMetrics, liveReconcile } from "@/lib/recon";
import { companies } from "@/data/companies";

const dp = (c: "amcx" | "bdn") => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "real", `${c}.datapoints.json`), "utf8")) as { datapoints: { id: string; metric: string; period: string; value: number; accession: string; url: string; page: string | null; section: string; filingDate: string; retrieved: string; rawText: string }[]; disclosures: { id: string }[] };
const v = (d: ReturnType<typeof dp>, m: string, p: string) => d.datapoints.find((x) => x.metric === m && x.period === p)!.value;

describe("public-filing datapoints (AMC Networks, Brandywine)", () => {
  const a = dp("amcx"), b = dp("bdn");
  it("every datapoint carries filing, accession, date, URL, section and retrieval metadata", () => {
    for (const d of [...a.datapoints, ...b.datapoints]) {
      expect(d.accession).toMatch(/^\d{10}-\d{2}-\d{6}$/);
      expect(d.url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
      expect(d.section.length).toBeGreaterThan(3);
      expect(d.filingDate).toMatch(/^2026|^2025/);
      expect(d.retrieved).toBe("2026-10-07");
      expect(d.rawText.length).toBeGreaterThan(0);
    }
  });
  it("AMC: model-calculated AOI equals company-reported AOI in all five periods (identity check on extracted data)", () => {
    for (const p of ["FY2023", "FY2024", "FY2025", "H1-2025", "H1-2026"]) {
      const calc = v(a, "revenue", p) - v(a, "direct_costs", p) - v(a, "sga", p) + v(a, "sbc", p) + v(a, "cloud_amort", p) + v(a, "jv_aoi", p);
      expect(calc, p).toBeCloseTo(v(a, "aoi_reported", p), 3);
    }
  });
  it("BDN: calculated NOI equals company-reported NOI in FY2023–FY2025", () => {
    for (const p of ["FY2023", "FY2024", "FY2025"]) expect(v(b, "revenue", p) - v(b, "prop_opex", p) - v(b, "re_taxes", p) - v(b, "mgmt_exp", p), p).toBeCloseTo(v(b, "noi_reported", p), 3);
  });
  it("debt tables foot: AMC 6/30/26 instruments sum to the reported total; BDN pro-forma principal ties to the 10-Q schedule", () => {
    expect(v(a, "debt_2032_secured", "2026-06-30") + v(a, "debt_2029_unsecured", "2026-06-30") + v(a, "debt_2029_convert", "2026-06-30")).toBeCloseTo(v(a, "debt_total", "2026-06-30"), 3);
    const reported = ["debt_revolver", "debt_term_loan", "debt_n2027", "debt_n2028", "debt_n2029a", "debt_n2029b", "debt_n2031", "debt_avira", "debt_cpace", "debt_trups"].reduce((s, k) => s + v(b, k, "2026-06-30"), 0) + 25.774 * 2;
    expect(reported).toBeCloseTo(2624.934, 3); // 10-Q scheduled principal payments table
    const pf = bdn.tranches.reduce((s, t) => s + t.principal, 0);
    expect(pf).toBeCloseTo(reported - v(b, "debt_revolver", "2026-06-30") - v(b, "debt_term_loan", "2026-06-30") + 400, 3);
  });
});

describe("public cases flow through the model", () => {
  it("LTM = FY2025 + H1-2026 − H1-2025 for revenue and EBITDA", () => {
    const a = dp("amcx");
    const ltm = amcx.history[3];
    expect(ltm.revenue).toBeCloseTo(v(a, "revenue", "FY2025") + v(a, "revenue", "H1-2026") - v(a, "revenue", "H1-2025"), 6);
    expect(ltm.ebitda).toBeCloseTo(v(a, "aoi_reported", "FY2025") + v(a, "aoi_reported", "H1-2026") - v(a, "aoi_reported", "H1-2025"), 3);
    expect(ltm.isLtm).toBe(true);
  });
  it("historical FCF is reported CFO − capex and the derived plug closes the bridge", () => {
    for (const c of [amcx, bdn]) for (const h of c.history) expect(h.netIncome + h.da + h.sbc - h.capex - h.deltaNwc).toBeCloseTo(h.fcf, 6);
    const a = dp("amcx");
    expect(amcx.history[2].fcf).toBeCloseTo(v(a, "cfo", "FY2025") - v(a, "capex", "FY2025"), 6);
  });
  it("AMC headline credit stats at 2026-06-30: net leverage ≈ 4.1x, EBITDA/interest ≈ 1.8x, no revolver", () => {
    const x = analyze(amcx);
    expect(x.metrics.find((m) => m.key === "netLev")!.value).toBeCloseTo(4.06, 1);
    expect(x.metrics.find((m) => m.key === "ebitdaInt")!.value).toBeCloseTo(1.84, 1);
    expect(amcx.undrawnRevolver).toBe(0);
    expect(amcx.tranches.every((t) => !t.floating)).toBe(true);
  });
  it("BDN: hypothetical loan is first-lien with a collateral pool and the pro-forma structure keeps the 2027–29 notes", () => {
    const t = bdn.tranches.find((x) => x.id === "new")!;
    expect(t.secured && t.seniority === 1 && t.collateralPct === 0.3 && t.floor === 0.01).toBe(true);
    const x = analyze(bdn);
    expect(x.recovery.severe.waterfall.rows.find((r) => r.id === "new")!.recoveryPct).toBeGreaterThan(0.99);
    expect(x.assetValue.base).toBeGreaterThan(4000);
  });
  it("public-case provenance is attached to the company object", () => {
    expect(amcx.provenance.length).toBeGreaterThan(60);
    expect(bdn.provenance.length).toBeGreaterThan(60);
    expect(amcx.provenance.every((p) => p.accession && p.url)).toBe(true);
  });
});

describe("Excel ⇄ web reconciliation (snapshot of the recalculated workbooks vs live web engine)", () => {
  for (const id of ["brightwater", "amcx", "bdn"]) {
    it(`${id}: every compared metric agrees within tolerance`, () => {
      const snap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "recon", `${id}.json`), "utf8"));
      const rows = liveReconcile(companies.find((c) => c.id === id)!, snap);
      const fails = rows.filter((r) => r.status === "FAIL");
      expect(fails.map((r) => `${r.key}: excel ${r.excel} web ${r.web}`)).toEqual([]);
      expect(rows.length).toBeGreaterThan(60);
    });
  }
  it("webMetrics covers every scenario output", () => {
    const m = webMetrics(amcx);
    for (const s of ["base", "downside", "severe"]) for (const k of ["revenue.p1", "ebitda.p5", "irr", "moic", "recovery.target"]) expect(m[`${s}.${k}`]).not.toBeUndefined();
  });
});
