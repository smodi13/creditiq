import Link from "next/link";
import { Card, ClassBadge, RiskBadge, StatusPill } from "@/components/ui";
import { CovenantTable } from "@/components/Tables";
import { SourcePanel } from "@/components/SourcePanel";
import { load } from "@/lib/page";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { SCENARIOS, SCENARIO_LABEL, type ScenarioKey } from "@/lib/types";

const f = (v: number | null, kind: string) => (v == null ? "n/m" : kind === "x" ? fmtX(v, 2) : kind === "pct" ? fmtPct(v) : fmtM(v));

export default async function Credit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ case?: string }> }) {
  const { c, a } = await load(params);
  const sp = (await searchParams).case;
  const sel: ScenarioKey = (SCENARIOS as string[]).includes(sp ?? "") ? (sp as ScenarioKey) : "base";
  const ch = a.scoreChange!;
  const inactive = c.covenants.filter((x) => x.active === false);
  return (
    <div className="space-y-3">
      <Card title={`Credit metrics — ${c.baseLabel}`} right={<span className="text-[11px] text-muted"><ClassBadge k={c.dataClass === "public" ? "reported" : "demo"} /> inputs · <ClassBadge k="derived" /> metrics</span>}>
        <table>
          <thead><tr><th>Metric</th><th className="num">Value</th><th>Formula</th><th>Raw inputs used</th></tr></thead>
          <tbody>
            {a.metrics.map((m) => (
              <tr key={m.key}>
                <td className="font-medium">{m.label}</td><td className="num font-semibold">{f(m.value, m.kind)}</td><td className="text-muted">{m.formula}</td>
                <td className="text-[11px] font-mono">{Object.entries(m.inputs).map(([k, v]) => `${k}=${Math.abs(v) < 5 && m.kind !== "$" ? v.toFixed(2) : v.toFixed(1)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Credit scorecard — deterministic, auditable" right={<span>Score <b className="text-base">{a.score.total.toFixed(1)}</b> / 100 · <RiskBadge r={a.score.risk} /></span>}>
        <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
          <table>
            <thead><tr><th>Factor</th><th>Measure</th><th className="num">Value</th><th className="num">Best</th><th className="num">Worst</th><th className="num">Points</th><th className="num">Max</th>{SCENARIOS.map((s) => <th key={s} className="num">Proj. {s}</th>)}</tr></thead>
            <tbody>
              {a.score.factors.map((x, i) => (
                <tr key={x.key}><td className="font-medium">{x.label}</td><td className="text-muted">{x.note}</td>
                  <td className="num">{x.raw == null ? "n/m" : x.raw.toFixed(2)}</td><td className="num">{x.best}</td><td className="num">{x.worst}</td>
                  <td className="num font-semibold">{x.points.toFixed(1)}</td><td className="num">{x.weight}</td>
                  {SCENARIOS.map((s) => <td key={s} className="num text-muted">{a.scoreProjected[s].factors[i].points.toFixed(1)}</td>)}</tr>
              ))}
              <tr className="total"><td colSpan={5}>Total</td><td className="num">{a.score.total.toFixed(1)}</td><td className="num">100</td>{SCENARIOS.map((s) => <td key={s} className="num">{a.scoreProjected[s].total.toFixed(1)}</td>)}</tr>
            </tbody>
          </table>
          <div>
            <h3 className="font-semibold mb-1">Why did the score change?</h3>
            <p className="text-[11px] text-muted mb-1">{ch.priorLabel} → {ch.currentLabel}: <b>{ch.priorTotal.toFixed(1)} → {ch.currentTotal.toFixed(1)}</b></p>
            <ul className="space-y-1">
              {ch.deltas.map((d) => <li key={d.key} className={d.direction === "negative" ? "text-bad" : d.direction === "positive" ? "text-good" : "text-slate-600"}>{d.direction === "negative" ? "▼" : d.direction === "positive" ? "▲" : "•"} {d.text}</li>)}
            </ul>
            <p className="text-[11px] text-muted mt-2">Each factor earns its weight linearly between a “worst” (0 pts) and “best” (full pts) threshold; weights and thresholds live in <code>src/lib/config.ts</code>. “Proj.” columns re-score the first projected period of each scenario. Risk bands: ≥75 Low · ≥60 Moderate · ≥45 Elevated · else High.</p>
          </div>
        </div>
      </Card>

      <Card title="Covenant analysis" right={
        <div className="flex gap-1 no-print">{SCENARIOS.map((s) => <Link key={s} href={`?case=${s}`} className={`px-2 py-1 rounded text-[11px] border ${sel === s ? "bg-navy !text-white border-navy" : "border-line !text-slate-700"}`}>{SCENARIO_LABEL[s]}</Link>)}</div>
      }>
        <p className="text-[12px] text-muted mb-2">Metrics are computed from the projection by the scenario engine — no covenant output is typed in. Headroom = distance to the covenant (positive = cushion). Hypothetical covenants are <ClassBadge k="assumption" />; disclosed covenants are tested on a model-basis proxy.</p>
        <div className="mb-3 flex gap-4 text-[12px]">
          {SCENARIOS.map((s) => {
            const n = a.covenants[s].reduce((t, x) => t + x.tests.filter((q) => q.status === "BREACH").length, 0);
            const first = a.covenants[s].map((x) => x.firstBreachYear).filter((x): x is number => x != null).sort()[0];
            return <span key={s}><b>{SCENARIO_LABEL[s]}:</b> {n ? <span className="text-bad font-semibold">{n} failed tests; first breach {c.periodLabels[first - c.baseYear - 1]}</span> : <span className="text-good font-semibold">no breach</span>}</span>;
          })}
        </div>
        <CovenantTable c={c} results={a.covenants[sel]} />
        {inactive.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-1">Disclosed covenants shown for reference (not tested)</h3>
            <table><thead><tr><th>Covenant</th><th className="num">Reported</th><th className="num">Threshold</th><th>Note</th></tr></thead>
              <tbody>{inactive.map((x) => <tr key={x.id}><td>{x.label}</td><td className="num">{x.reported != null ? fmtX(x.reported, 2) : "—"} <span className="text-[10px] text-muted">{x.reportedLabel}</span></td><td className="num">{x.type.startsWith("min") ? "≥ " : "≤ "}{fmtX(x.thresholds[0], 2)}</td><td className="text-[11px] text-muted">{x.note}</td></tr>)}</tbody></table>
          </div>
        )}
      </Card>

      <Card title="Projected credit metrics by scenario" right={<ClassBadge k="projection" />}>
        <table>
          <thead><tr><th>Scenario</th><th>Metric</th>{c.periodLabels.map((l) => <th key={l} className="num">{l}</th>)}</tr></thead>
          <tbody>
            {SCENARIOS.flatMap((s) => [
              ["Net debt / EBITDA", (y: (typeof a.projections.base.years)[number]) => fmtX(y.netLeverage)],
              ["EBITDA / cash interest", (y: (typeof a.projections.base.years)[number]) => fmtX(y.interestCoverage)],
              ["DSCR", (y: (typeof a.projections.base.years)[number]) => fmtX(y.dscr)],
              ["Liquidity ($M)", (y: (typeof a.projections.base.years)[number]) => fmtM(y.liquidity, 0)],
            ].map(([label, fn], i) => (
              <tr key={s + (label as string)}><td className="font-medium">{i === 0 ? SCENARIO_LABEL[s] : ""}</td><td>{label as string}</td>
                {a.projections[s].years.map((y) => <td key={y.year} className={`num ${y.defaulted ? "text-bad font-semibold" : ""}`}>{(fn as (y: typeof a.projections.base.years[number]) => string)(y)}</td>)}</tr>
            )))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted mt-2">Red = payment default reached in or before that period. After a default the model keeps rolling mechanically for illustration; the recovery waterfall is struck at the default period.</p>
      </Card>
      <SourcePanel sources={c.sources} />
      <span className="hidden"><StatusPill s="OK" /></span>
    </div>
  );
}
