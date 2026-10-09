"use client";
import { NumInput } from "./NumInput";
import { useMemo, useState } from "react";
import { ScenarioAssumptions, SCENARIO_LABEL, type Company, type ScenarioKey } from "@/lib/types";
import { project, type ProjectionYear } from "@/lib/finance/projection";
import { recoveryCase, scenarioReturn } from "@/lib/analysis";
import { testCovenants } from "@/lib/finance/covenants";
import { ScenarioLines } from "./Charts";
import { fmtM, fmtPct, fmtX } from "@/lib/format";

type Defaults = Record<ScenarioKey, ScenarioAssumptions>;
const SCALARS: [keyof ScenarioAssumptions, string, number, boolean][] = [
  ["capexPct", "Capex % rev", 0.005, true], ["nwcPctOfRevChange", "NWC % Δrev", 0.01, true], ["nwcExtraOutflowPct", "Other cash items % rev", 0.001, true],
  ["rateShock", "Floating-rate shock", 0.0025, true], ["refiRate", "Refinancing rate", 0.0025, true], ["maxRefiNetLeverage", "Max refi net lev (x)", 0.25, false],
  ["minRefiCoverage", "Min refi coverage (x)", 0.1, false], ["exitMultiple", "Exit multiple (x)", 0.25, false], ["exitPrice", "Exit price cap (%)", 1, false], ["distressMultiple", "Distressed multiple (x)", 0.25, false],
  ["assetValueDecline", "Asset value decline", 0.05, true], ["liquidationRecovery", "Liquidation recovery", 0.05, true],
];

export function ScenarioLab({ company, defaults }: { company: Company; defaults: Defaults }) {
  const [key, setKey] = useState<ScenarioKey>("downside");
  const [a, setA] = useState<ScenarioAssumptions>(defaults.downside);
  const parsed = ScenarioAssumptions.safeParse(a);
  const base = useMemo(() => project(company, defaults.base), [company, defaults]);
  const out = useMemo(() => {
    if (!parsed.success) return null;
    const p = project(company, parsed.data);
    const rc = recoveryCase(company, parsed.data, p);
    const cov = testCovenants(company, p, company.assetBase * (1 - parsed.data.assetValueDecline));
    return { p, rc, r: scenarioReturn(company, parsed.data, p, rc, "custom"), breaches: cov.reduce((s, x) => s + x.tests.filter((t) => t.status === "BREACH").length, 0) };
  }, [company, parsed]);
  const pick = (k: ScenarioKey) => { setKey(k); setA(defaults[k]); };
  const setArr = (f: "revenueGrowth" | "ebitdaMargin" | "assetSales", i: number, v: number) => setA({ ...a, [f]: a[f].map((x, j) => (j === i ? v : x)) });
  const t = company.tranches.find((x) => x.id === company.target.trancheId)!;
  const gap0 = company.history[company.history.length - 1].grossProfit / company.history[company.history.length - 1].revenue - company.history[company.history.length - 1].ebitda / company.history[company.history.length - 1].revenue;
  const setMargin = (i: number, v: number) => setA({ ...a, ebitdaMargin: a.ebitdaMargin.map((x, j) => (j === i ? v : x)), grossMargin: a.grossMargin.map((x, j) => (j === i ? v + gap0 : x)) });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-semibold">Start from:</span>
        {(Object.keys(SCENARIO_LABEL) as ScenarioKey[]).map((k) => <button key={k} onClick={() => pick(k)} className={`px-2 py-1 rounded border ${key === k ? "bg-navy text-white border-navy" : "border-line bg-white"}`}>{SCENARIO_LABEL[k]}</button>)}
        <button onClick={() => pick(key)} className="px-2 py-1 rounded border border-line bg-white">Reset</button>
        <span className="text-muted">Edits flow through statements → debt → metrics → covenants → refinancing → default → recovery → returns.</span>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
        <div className="bg-white border border-line rounded-sm p-3">
          <h3 className="text-[12px] font-semibold uppercase mb-2">Assumptions (edit)</h3>
          <table>
            <thead><tr><th></th>{company.periodLabels.map((y) => <th key={y} className="num">{y}</th>)}</tr></thead>
            <tbody>
              <tr><td>Revenue growth</td>{a.revenueGrowth.map((v, i) => <td key={i} className="num"><NumInput aria-label={`Revenue growth, period ${i + 1}`} step="0.5" value={+(v * 100).toFixed(2)} onChange={(e) => setArr("revenueGrowth", i, Number(e.target.value) / 100)} />%</td>)}</tr>
              <tr><td>EBITDA margin</td>{a.ebitdaMargin.map((v, i) => <td key={i} className="num"><NumInput aria-label={`EBITDA margin, period ${i + 1}`} step="0.5" value={+(v * 100).toFixed(2)} onChange={(e) => setMargin(i, Number(e.target.value) / 100)} />%</td>)}</tr>
              <tr><td>Asset sales ($M)</td>{a.assetSales.map((v, i) => <td key={i} className="num"><NumInput aria-label={`Asset sales, period ${i + 1}`} step="10" value={v} onChange={(e) => setArr("assetSales", i, Number(e.target.value))} /></td>)}</tr>
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
            {SCALARS.map(([k, label, step, pct]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-[12px]">{label}
                <span><NumInput step={pct ? step * 100 : step} value={pct ? +((a[k] as number) * 100).toFixed(2) : (a[k] as number)} onChange={(e) => setA({ ...a, [k]: pct ? Number(e.target.value) / 100 : Number(e.target.value) })} />{pct ? "%" : ""}</span>
              </label>
            ))}
          </div>
          {!parsed.success && <p className="text-bad text-[12px] mt-2">Invalid input: {parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}</p>}
        </div>
        {out && (
          <div className="space-y-3">
            <div className="bg-white border border-line rounded-sm p-3">
              <h3 className="text-[12px] font-semibold uppercase mb-2">Result — {t.name} @ {t.price}</h3>
              <div className="grid grid-cols-5 gap-2 text-center">
                {[["Default?", out.p.defaultYear ? `Yes — ${company.periodLabels[out.p.defaultYear - company.baseYear - 1]}` : "No"], ["Covenant breaches", String(out.breaches)], ["Recovery", fmtPct(out.rc.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0, 0)], ["IRR", fmtPct(out.r.irr)], ["MOIC", out.r.moic.toFixed(2) + "x"]].map(([l, v]) => (
                  <div key={l} className="border border-line rounded-sm py-1"><div className="text-[10px] uppercase text-muted">{l}</div><div className={`text-base font-semibold ${(l === "Default?" && v !== "No") || (l === "Covenant breaches" && v !== "0") ? "text-bad" : ""}`}>{v}</div></div>
                ))}
              </div>
              <div className="mt-2"><ScenarioLines data={out.p.years.map((y, i) => ({ year: company.baseYear + 1 + i, base: base.years[i].ebitda, downside: y.ebitda, severe: null }))} /></div>
              <p className="text-[11px] text-muted">Lines: Base EBITDA (blue) vs your custom case (orange), $M.</p>
            </div>
            <div className="bg-white border border-line rounded-sm p-3 overflow-x-auto">
              <table>
                <thead><tr><th>$M</th>{company.periodLabels.map((y) => <th key={y} className="num">{y}</th>)}</tr></thead>
                <tbody>
                  {([["Revenue", (y) => fmtM(y.revenue, 0)], ["EBITDA", (y) => fmtM(y.ebitda, 0)], ["Cash interest", (y) => fmtM(y.cashInterest, 0)], ["FCF", (y) => fmtM(y.fcf, 0)], ["Cash", (y) => fmtM(y.cash, 0)], ["Total debt", (y) => fmtM(y.totalDebt, 0)], ["Net lev.", (y) => fmtX(y.netLeverage)], ["EBITDA/int.", (y) => fmtX(y.interestCoverage)]] as [string, (y: ProjectionYear) => string][]).map(([l, f]) => (
                    <tr key={l}><td>{l}</td>{out.p.years.map((y) => <td key={y.year} className={`num ${y.defaulted ? "text-bad" : ""}`}>{f(y)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
