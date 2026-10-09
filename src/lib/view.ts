import { analyze } from "./analysis";
import { metric, totalDebt } from "./finance/metrics";
import { companies } from "@/data/companies";

export const rows = () =>
  companies.map((c) => {
    const a = analyze(c);
    const last = c.history[c.history.length - 1];
    const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
    const next = Math.min(...c.tranches.map((x) => x.maturityYear));
    const covBreach = (k: "base" | "downside" | "severe") => a.covenants[k].filter((x) => x.firstBreachYear != null).length;
    return {
      c, a, last, t, next,
      debt: totalDebt(c.tranches),
      netLev: metric(a.metrics, "netLev"),
      cov: metric(a.metrics, "ebitdaInt"),
      covBreach,
      sevRec: a.recovery.severe.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0,
      downRec: a.recovery.downside.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0,
    };
  });
export type Row = ReturnType<typeof rows>[number];
