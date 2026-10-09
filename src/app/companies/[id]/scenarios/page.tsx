import { Card, ClassBadge, StatusPill } from "@/components/ui";
import { ScenarioLab } from "@/components/ScenarioLab";
import { ScenarioLines } from "@/components/Charts";
import { load } from "@/lib/page";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { SCENARIOS, SCENARIO_LABEL } from "@/lib/types";

export default async function Scenarios({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const series = (f: (y: (typeof a.projections.base.years)[number]) => number | null) =>
    a.projections.base.years.map((_, i) => ({ year: c.baseYear + 1 + i, ...Object.fromEntries(SCENARIOS.map((s) => [s, f(a.projections[s].years[i])])) })) as Record<string, number | null>[];
  const rec = (s: (typeof SCENARIOS)[number]) => a.recovery[s].waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
  const sh = (s: (typeof SCENARIOS)[number]) => a.assumptions[s];
  const first = (s: (typeof SCENARIOS)[number]) => a.covenants[s].map((x) => x.firstBreachYear).filter((x): x is number => x != null).sort()[0];
  const lbl = (y: number | null | undefined) => (y == null ? "none" : c.periodLabels[y - c.baseYear - 1]);
  const flow: [string, (s: (typeof SCENARIOS)[number]) => React.ReactNode][] = [
    ["① Revenue growth (avg) → revenue (period 5)", (s) => `${fmtPct(sh(s).revenueGrowth.reduce((x, y) => x + y, 0) / 5)} → ${fmtM(a.projections[s].years[4].revenue, 0)}`],
    ["② EBITDA margin (period 1 → 5) → trough EBITDA", (s) => `${fmtPct(sh(s).ebitdaMargin[0])} → ${fmtPct(sh(s).ebitdaMargin[4])} → ${fmtM(Math.min(...a.projections[s].years.map((y) => y.ebitda)), 0)}`],
    ["③ Cumulative FCF (5 periods)", (s) => fmtM(a.projections[s].years.reduce((t2, y) => t2 + y.fcf, 0), 0)],
    ["④ Rate shock → period-1 cash interest", (s) => `+${(sh(s).rateShock * 10000).toFixed(0)}bp → ${fmtM(a.projections[s].years[0].cashInterest, 0)}`],
    ["⑤ Peak net leverage · min EBITDA/interest", (s) => `${fmtX(Math.max(...a.projections[s].years.map((y) => y.netLeverage ?? 99)))} · ${fmtX(Math.min(...a.projections[s].years.map((y) => y.interestCoverage ?? 0)), 2)}`],
    ["⑥ Covenants: first breach", (s) => (first(s) != null ? <span className="text-bad font-semibold">{lbl(first(s))}</span> : <span className="text-good font-semibold">none</span>)],
    ["⑦ Refinancing tests (pass / fail)", (s) => `${a.refi[s].filter((e) => e.passes).length} / ${a.refi[s].filter((e) => !e.passes).length}`],
    ["⑧ Payment default", (s) => (a.projections[s].defaultYear ? <span className="text-bad font-semibold">{lbl(a.projections[s].defaultYear)}</span> : "none")],
    ["⑨ Recovery value → target-tranche recovery", (s) => `${fmtM(a.recovery[s].value, 0)} (${a.recovery[s].basis}) → ${fmtPct(rec(s), 0)}`],
    ["⑩ IRR · MOIC", (s) => <b>{fmtPct(a.returns[s].irr)} · {a.returns[s].moic.toFixed(2)}x</b>],
  ];
  return (
    <div className="space-y-3">
      <Card title="How one assumption propagates: statements → cash flow → debt → metrics → covenants → refinancing → default → recovery → returns" right={<ClassBadge k="projection" />}>
        <table>
          <thead><tr><th>Stage</th>{SCENARIOS.map((s) => <th key={s} className="num">{SCENARIO_LABEL[s]}</th>)}</tr></thead>
          <tbody>{flow.map(([l, f]) => <tr key={l}><td>{l}</td>{SCENARIOS.map((s) => <td key={s} className="num">{f(s)}</td>)}</tr>)}</tbody>
        </table>
        <p className="text-[11px] text-muted mt-2">Scenario probabilities: {SCENARIOS.map((s) => `${SCENARIO_LABEL[s]} ${fmtPct(c.probabilities[s], 0)}`).join(" · ")} (analyst assumption). Edit any assumption in the lab below to watch every stage move.</p>
      </Card>
      <Card title="Scenario assumptions">
        <table>
          <thead><tr><th></th>{SCENARIOS.map((s) => <th key={s} className="num">{SCENARIO_LABEL[s]}</th>)}</tr></thead>
          <tbody>
            {([
              ["Revenue growth (period 1 / period 5)", (s) => `${fmtPct(sh(s).revenueGrowth[0])} / ${fmtPct(sh(s).revenueGrowth[4])}`], ["EBITDA margin (period 1 / period 5)", (s) => `${fmtPct(sh(s).ebitdaMargin[0])} / ${fmtPct(sh(s).ebitdaMargin[4])}`],
              ["Capex % revenue", (s) => fmtPct(sh(s).capexPct)], ["Other cash items % revenue (+ outflow)", (s) => fmtPct(sh(s).nwcExtraOutflowPct)], ["Net asset sales (period 1, $M)", (s) => fmtM(sh(s).assetSales[0], 0)],
              ["Floating-rate shock", (s) => `+${(sh(s).rateShock * 10000).toFixed(0)} bp`], ["Refinancing rate", (s) => fmtPct(sh(s).refiRate)], ["Market access: max net leverage / min coverage", (s) => `${fmtX(sh(s).maxRefiNetLeverage)} / ${fmtX(sh(s).minRefiCoverage, 2)}`],
              ["Exit multiple / distressed multiple", (s) => `${fmtX(sh(s).exitMultiple)} / ${fmtX(sh(s).distressMultiple)}`], ["Exit price cap (non-default)", (s) => sh(s).exitPrice.toFixed(0)], ["Asset value decline / liquidation recovery", (s) => `${fmtPct(sh(s).assetValueDecline, 0)} / ${fmtPct(sh(s).liquidationRecovery, 0)}`],
            ] as [string, (s: (typeof SCENARIOS)[number]) => string][]).map(([l, f]) => <tr key={l}><td>{l}</td>{SCENARIOS.map((s) => <td key={s} className="num">{f(s)}</td>)}</tr>)}
          </tbody>
        </table>
      </Card>
      <div className="grid xl:grid-cols-3 gap-3">
        <Card title="EBITDA ($M)"><ScenarioLines data={series((y) => y.ebitda)} /></Card>
        <Card title="Free cash flow ($M)"><ScenarioLines data={series((y) => y.fcf)} /></Card>
        <Card title="Net debt / EBITDA"><ScenarioLines data={series((y) => y.netLeverage)} unit="x" dec={1} /></Card>
      </div>
      <Card title="Scenario engine — change assumptions and watch them propagate"><ScenarioLab company={c} defaults={a.assumptions} /></Card>
      <span className="hidden"><StatusPill s="OK" /></span>
    </div>
  );
}
