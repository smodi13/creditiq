import type { Company, Covenant } from "../types";
import type { Projection, ProjectionYear } from "./projection";

export interface CovenantTest {
  year: number; metric: number | null; threshold: number; headroom: number | null; headroomPct: number | null; status: "PASS" | "BREACH" | "N/M";
}
export interface CovenantResult {
  covenant: Covenant;
  tests: CovenantTest[];
  firstBreachYear: number | null;
  minHeadroomPct: number | null;
}

const higherIsBetter = (t: Covenant["type"]) => t === "minInterestCoverage" || t === "minLiquidity" || t === "minEBITDA";

/** Model-basis value of a covenant metric in a projection year (before calibration). */
export function rawMetric(type: Covenant["type"], y: ProjectionYear, assetValue: number): number | null {
  switch (type) {
    case "maxNetLeverage": return y.netLeverage;
    case "minInterestCoverage": return y.interestCoverage;
    case "maxLTV": return assetValue > 0 ? y.totalDebt / assetValue : null;
    case "maxSecuredLTV": return assetValue > 0 ? y.securedDebt / assetValue : null;
    case "minLiquidity": return y.liquidity;
    case "minEBITDA": return y.ebitda;
  }
}

export function testCovenants(c: Company, p: Projection, assetValue: number): CovenantResult[] {
  return c.covenants.filter((cov) => cov.active !== false).map((cov) => {
    const tests = p.years.map((y, i): CovenantTest => {
      const raw = rawMetric(cov.type, y, assetValue);
      const metric = raw;
      const thr = cov.thresholds[i];
      if (metric == null) return { year: y.year, metric: null, threshold: thr, headroom: null, headroomPct: null, status: y.ebitda <= 0 && !higherIsBetter(cov.type) ? "BREACH" : "N/M" };
      const headroom = higherIsBetter(cov.type) ? metric - thr : thr - metric;
      return { year: y.year, metric, threshold: thr, headroom, headroomPct: thr === 0 ? null : headroom / Math.abs(thr), status: headroom >= 0 ? "PASS" : "BREACH" };
    });
    const first = tests.find((t) => t.status === "BREACH");
    const hp = tests.map((t) => t.headroomPct).filter((x): x is number => x != null);
    return { covenant: cov, tests, firstBreachYear: first ? first.year : null, minHeadroomPct: hp.length ? Math.min(...hp) : null };
  });
}
