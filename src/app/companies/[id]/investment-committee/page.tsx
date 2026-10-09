import Link from "next/link";
import { Card, CompanyFlags, DecisionBadge, StatusPill } from "@/components/ui";
import { EvidenceList } from "@/components/Tables";
import { PrintButton } from "@/components/PrintButton";
import { load } from "@/lib/page";
import { narrative } from "@/lib/narrative";
import { metric } from "@/lib/finance/metrics";
import { fmtM, fmtPct, fmtX } from "@/lib/format";

const Box = ({ l, v, sub, tone }: { l: string; v: React.ReactNode; sub?: React.ReactNode; tone?: string }) => <div className="border border-line bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-muted">{l}</div><div className={`text-lg font-semibold ${tone ?? ""}`}>{v}</div>{sub && <div className="text-[11px] text-muted">{sub}</div>}</div>;

export default async function IC({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const n = narrative(c, a);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const R = a.returns, th = c.thresholds, rec = a.recommendation;
  const sevRow = a.recovery.severe.waterfall.rows.find((r) => r.id === t.id)!;
  const downRow = a.recovery.downside.waterfall.rows.find((r) => r.id === t.id)!;
  const defYear = (["downside", "severe"] as const).map((s) => (a.projections[s].defaultYear ? c.periodLabels[a.projections[s].defaultYear! - c.baseYear - 1] : null));
  const heads = a.covenants.base.map((x) => x.minHeadroomPct).filter((x): x is number => x != null);
  const minHead = heads.length ? Math.min(...heads) : null;
  const openHigh = c.diligenceItems.filter((d) => d.priority === "High" && d.status !== "Complete");
  return (
    <div className="space-y-3 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Investment committee summary · prepared {c.dataClass === "public" ? "from public filings through " + c.asOf : "from demo data"}</div>
          <h2 className="text-xl font-semibold">{c.name} — {t.name}</h2>
          <div className="mt-1"><CompanyFlags dataClass={c.dataClass} terms={c.termsLabel} /></div>
        </div>
        <div className="text-right"><div className="text-[10px] uppercase text-muted">Recommendation</div><DecisionBadge d={rec.decision} big /><div className="mt-1"><PrintButton /></div></div>
      </div>
      {c.dataClass === "public" && <div className="border border-indigo-300 bg-indigo-50 text-indigo-900 text-[12px] px-3 py-1.5 rounded-sm">HYPOTHETICAL: this is a public-company underwriting exercise. Purchase price, fees, hold period and any new-loan terms are the analyst’s assumptions. It is not a real transaction, not a Fortress investment and not Fortress’s terms.</div>}

      <Card title="Proposed investment">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Box l="Instrument" v={<span className="text-[13px]">{t.name}</span>} sub={`${t.secured ? "Secured" : "Unsecured"} · rank ${t.seniority}${t.collateralPct ? " · ring-fenced pool" : ""}`} />
          <Box l="Face value" v={fmtM(c.target.face ?? 100)} sub="legal claim" />
          <Box l="Purchase price" v={price(t.price)} sub="underwriting assumption" />
          <Box l="Cash investment" v={fmtM(R.base.cost)} sub={`incl. ${fmtPct(c.target.feePct)} fees`} />
          <Box l="Current yield / YTM" v={`${fmtPct(a.yieldMetrics.currentYield)} / ${fmtPct(a.yieldMetrics.ytm)}`} />
          <Box l="Hold · maturity" v={`${c.target.holdYears}y · ${t.maturityDate}`} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3">
        <Card title="Returns">
          <table><tbody>
            <tr><td>Base IRR (p={fmtPct(c.probabilities.base, 0)})</td><td className="num font-semibold">{fmtPct(R.base.irr)}</td><td><StatusPill s={(R.base.irr ?? -1) >= th.hurdleIrr ? "PASS" : "FAIL"} /></td></tr>
            <tr><td>Downside IRR (p={fmtPct(c.probabilities.downside, 0)})</td><td className="num font-semibold">{fmtPct(R.downside.irr)}</td><td><StatusPill s={(R.downside.irr ?? -1) >= th.minDownsideIrr ? "PASS" : "FAIL"} /></td></tr>
            <tr><td>Severe downside IRR (p={fmtPct(c.probabilities.severe, 0)})</td><td className="num font-semibold">{fmtPct(R.severe.irr)}</td><td></td></tr>
            <tr><td>Probability-weighted IRR (of expected cash flows)</td><td className="num font-semibold">{fmtPct(a.expected.irr)}</td><td><StatusPill s={(a.expected.irr ?? -1) >= th.hurdleIrr ? "PASS" : "FAIL"} /></td></tr>
            <tr><td>MOIC base / downside / severe</td><td className="num" colSpan={2}>{R.base.moic.toFixed(2)}x / {R.downside.moic.toFixed(2)}x / {R.severe.moic.toFixed(2)}x</td></tr>
            <tr><td className="text-muted">Required IRR (hurdle)</td><td className="num text-muted" colSpan={2}>{fmtPct(th.hurdleIrr, 0)}</td></tr>
          </tbody></table>
        </Card>
        <Card title="Credit">
          <table><tbody>
            <tr><td>Net leverage ({c.baseLabel})</td><td className="num font-semibold">{fmtX(metric(a.metrics, "netLev"))}</td><td className="text-muted text-[11px]">max {fmtX(th.maxNetLeverage)}</td></tr>
            <tr><td>Interest coverage (EBITDA / interest)</td><td className="num font-semibold">{fmtX(metric(a.metrics, "ebitdaInt"), 2)}</td></tr>
            <tr><td>Liquidity</td><td className="num font-semibold">{fmtM(c.cash + c.undrawnRevolver, 0)}</td></tr>
            <tr><td>Covenant headroom (base, minimum)</td><td className={`num font-semibold ${minHead != null && minHead < 0 ? "text-bad" : ""}`}>{minHead == null ? "n/a" : fmtPct(minHead, 0)}</td><td className="text-muted text-[11px]">min {fmtPct(th.minCovenantHeadroom, 0)}</td></tr>
            <tr><td>Credit score</td><td className="num font-semibold">{a.score.total.toFixed(0)} / 100</td><td className="text-muted text-[11px]">{a.score.risk}</td></tr>
            <tr><td>Next maturity</td><td className="num font-semibold" colSpan={2}>{Math.min(...c.tranches.map((x) => x.maturityYear))}</td></tr>
          </tbody></table>
        </Card>
        <Card title="Downside">
          <table><tbody>
            <tr><td>Recovery (downside / severe)</td><td className="num font-semibold">{fmtPct(downRow.recoveryPct, 0)} / {fmtPct(sevRow.recoveryPct, 0)}</td></tr>
            <tr><td>Loss given default (severe)</td><td className="num font-semibold">{fmtPct(sevRow.lossPct, 0)}</td></tr>
            <tr><td>Default period (downside / severe)</td><td className="num font-semibold">{defYear[0] ?? "none"} / {defYear[1] ?? "none"}</td></tr>
            <tr><td>Probability of default (weighted)</td><td className="num font-semibold">{fmtPct(a.expected.pDefault, 0)}</td></tr>
            <tr><td>Expected loss</td><td className="num font-semibold">{fmtPct(a.expected.pDefault * a.expected.lgd, 1)}</td></tr>
            <tr><td>Recovery needed for MOIC 1.0x</td><td className="num font-semibold">{a.breakevens.breakevenRecoveryPct?.toFixed(0)}% of face</td></tr>
          </tbody></table>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Key risks (largest first)"><ol className="list-decimal pl-4 space-y-1.5">{n.risks.map((r) => <li key={r.text}>{r.text}</li>)}</ol></Card>
        <Card title="Key protections (strongest first)"><ol className="list-decimal pl-4 space-y-1.5">{n.protections.map((r) => <li key={r.text}>{r.text}</li>)}</ol></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Catalysts"><ul className="list-disc pl-4 space-y-1">{n.catalysts.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title={`Diligence — ${openHigh.length} unresolved high-priority item(s)`} right={<Link href={`/companies/${c.id}/diligence`} className="text-[11px]">Tracker →</Link>}>
          <ul className="space-y-1">{openHigh.map((d) => <li key={d.id}><b>{d.item}</b> <span className="text-muted">— {d.status}</span><div className="text-[11px] text-muted">{d.question}</div></li>)}{openHigh.length === 0 && <li className="text-good">No unresolved high-priority items.</li>}</ul>
        </Card>
      </div>

      <Card title="Investment thesis"><p>{n.thesis}</p><p className="mt-2 text-[12px] text-muted"><b>The question:</b> {n.question}</p></Card>

      <Card title="Recommendation rationale — evidence from the model" right={<DecisionBadge d={rec.decision} />}>
        <p className="mb-2 text-[13px] font-medium">{n.decisionText}</p>
        <EvidenceList ev={rec.evidence} />
        <p className="text-[11px] text-muted mt-2">Rule: PROCEED if all five core tests pass and ≤ 2 secondary tests fail; PASS if the base case and the downside both fail, or ≥ 3 core tests fail; otherwise HOLD. Thresholds ({`hurdle ${fmtPct(th.hurdleIrr, 0)}, min downside IRR ${fmtPct(th.minDownsideIrr, 0)}, min yield ${fmtPct(th.minYield, 1)}, max leverage ${fmtX(th.maxNetLeverage)}, min recovery ${fmtPct(th.minRecovery, 0)}, min covenant headroom ${fmtPct(th.minCovenantHeadroom, 0)}`}) are configurable per case. The Excel Investment Summary tab implements the same rule by formula.</p>
      </Card>

      <Card title="What would change my mind?">
        <ul className="list-disc pl-4 space-y-1.5">{n.changeMyMind.map((x) => <li key={x}>{x}</li>)}</ul>
      </Card>
    </div>
  );
}
function price(p: number | undefined) { return p == null ? "n/a" : p.toFixed(1); }
