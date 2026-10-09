import Link from "next/link";
import { Card, ClassBadge, DecisionBadge, RiskBadge, Stat } from "@/components/ui";
import { SourcePanel } from "@/components/SourcePanel";
import { ThesisTable } from "@/components/Tables";
import { load } from "@/lib/page";
import { totalDebt } from "@/lib/finance/metrics";
import { fmtM, fmtPct, fmtX } from "@/lib/format";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const last = c.history[c.history.length - 1];
  const debt = totalDebt(c.tranches);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const th = c.thresholds;
  const li = (xs: string[]) => <ul className="list-disc pl-4 space-y-0.5">{xs.map((x) => <li key={x}>{x}</li>)}</ul>;
  const facts: [string, string][] = [
    ["Sector / industry", `${c.sector} / ${c.industry}`], ["Headquarters", c.hq], [`Revenue (${c.baseLabel})`, fmtM(last.revenue, 0)], [`EBITDA (${c.baseLabel})`, fmtM(last.ebitda, 0)],
    ["Total debt (face value)", fmtM(debt, 0)], ["Cash", fmtM(c.cash, 0)], ["Net debt", fmtM(debt - c.cash, 0)], ["Asset / collateral base", fmtM(c.assetBase, 0)], ["Enterprise value (assumed multiple)", fmtM(c.ev, 0)],
  ];
  const sevRec = a.recovery.severe.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct ?? 0;
  const open = c.diligenceItems.filter((d) => d.status !== "Complete" && d.priority === "High").length;
  const assess = (await import("@/lib/finance/alerts")).thesisFor(c, a);
  return (
    <div className="space-y-3">
      {c.dataClass === "public" ? (
        <div className="border border-emerald-300 bg-emerald-50 text-emerald-900 text-[12px] px-3 py-1.5 rounded-sm"><b>PUBLIC DATA CASE</b> — {c.caseTitle}. Historicals: <ClassBadge k="reported" /> · forecasts: <ClassBadge k="projection" /> · price, fees, hold: <ClassBadge k="assumption" />. <b>HYPOTHETICAL INVESTMENT</b>: not a real transaction and not a Fortress investment.</div>
      ) : (
        <div className="border border-amber-300 bg-amber-50 text-amber-900 text-[12px] px-3 py-1.5 rounded-sm"><b>DEMO DATA</b> — fictional company with illustrative numbers.</div>
      )}
      <p className="text-[13px]">{c.description}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <Stat label="Recommendation" value={<DecisionBadge d={a.recommendation.decision} />} sub={`${a.recommendation.coreFails} core test(s) failed`} />
        <Stat label="Credit score" value={`${a.score.total.toFixed(0)} / 100`} sub={<RiskBadge r={a.score.risk} />} />
        <Stat label="Base IRR" value={fmtPct(a.returns.base.irr)} sub={`vs hurdle ${fmtPct(th.hurdleIrr)}`} tone={(a.returns.base.irr ?? 0) >= th.hurdleIrr ? "good" : "warn"} />
        <Stat label="Downside IRR" value={fmtPct(a.returns.downside.irr)} sub={a.returns.downside.defaulted ? "default case" : "performing"} tone={(a.returns.downside.irr ?? 0) < 0 ? "bad" : "warn"} />
        <Stat label="Severe recovery" value={fmtPct(sevRec, 0)} sub={`IRR ${fmtPct(a.returns.severe.irr)}`} tone={sevRec < 0.6 ? "bad" : "warn"} />
        <Stat label="Net leverage" value={fmtX(a.metrics.find((m) => m.key === "netLev")?.value ?? null)} sub={c.baseLabel} />
        <Stat label="EBITDA / interest" value={fmtX(a.metrics.find((m) => m.key === "ebitdaInt")?.value ?? null, 2)} sub={c.baseLabel} />
        <Stat label="Open high-priority DD" value={open} tone={open ? "warn" : "good"} sub={<Link href={`/companies/${c.id}/diligence`}>Diligence →</Link>} />
      </div>
      <div className="grid xl:grid-cols-3 gap-3">
        <Card title="Overview"><table><tbody>{facts.map(([k, v]) => <tr key={k}><td className="text-muted">{k}</td><td className="num">{v}</td></tr>)}</tbody></table></Card>
        <Card title={<span>Investment thesis <ClassBadge k="assumption" /></span>} className="xl:col-span-2">
          <p className="mb-2">{c.thesis}</p>
          <table><tbody>
            <tr><td className="text-muted">Instrument</td><td>{t.name}</td></tr>
            <tr><td className="text-muted">Face value / purchase price / cash investment</td><td>${c.target.face ?? 100}M / {t.price?.toFixed(1)} / ${a.returns.base.cost.toFixed(1)}M <ClassBadge k="assumption" /></td></tr>
            <tr><td className="text-muted">Current yield · yield to maturity</td><td>{fmtPct(a.yieldMetrics.currentYield)} · {fmtPct(a.yieldMetrics.ytm)}</td></tr>
          </tbody></table>
        </Card>
        <Card title="Key protections">{li(c.upside)}</Card>
        <Card title="Key risks">{li(c.risks)}</Card>
        <Card title="Key catalysts">{li(c.catalysts)}</Card>
      </div>
      {assess && <Card title="Thesis vs actual performance (data-driven)" right={<span className="text-[11px] text-muted">Entry {c.thesisPlan!.entryDate} · actuals: {c.monitoring!.label}</span>}><ThesisTable t={assess} /></Card>}
      <Card title="Data-quality notes">
        <ul className="list-disc pl-4 space-y-0.5 text-[12px]">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </Card>
      <SourcePanel sources={c.sources} />
    </div>
  );
}
