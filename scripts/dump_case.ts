import { getCompany } from "@/data/companies";
import { analyze } from "@/lib/analysis";
const id = process.argv[2];
const a = analyze(getCompany(id)!);
const c = a.company;
const f = (x: number | null) => (x == null ? "n/a" : x.toFixed(4));
for (const s of ["base", "downside", "severe"] as const) {
  const r = a.returns[s], p = a.projections[s], rc = a.recovery[s];
  console.log(s, "P", c.probabilities[s], "IRR", f(r.irr), "MOIC", f(r.moic), "def", p.defaultYear, "rec%", f(r.recoveryPct), "exitPx", f(r.exitPrice), "cost", f(r.cost), "int", f(r.cashInterest), "exit", f(r.exitProceeds));
  console.log("  flows", r.flows.map((x) => x.toFixed(2)).join(","));
  console.log("  recovery value", f(rc.value), "GC", f(rc.goingConcern), "liq", f(rc.liquidation), rc.basis, "event", rc.eventLabel);
  console.log("  netLev", p.years.map((y) => f(y.netLeverage)).join(","), "cov", p.years.map((y) => f(y.interestCoverage)).join(","));
}
console.log("expected", JSON.stringify(a.expected), "rec", a.recommendation.decision, a.recommendation.evidence.map((e) => `${e.key}:${e.pass ? "P" : "F"}(${e.actual} vs ${e.required})`).join(" | "));
console.log("ytm", a.ytm, "assetBase", c.assetBase, "score", a.score.total);
console.log("breakevens", JSON.stringify(a.breakevens));
