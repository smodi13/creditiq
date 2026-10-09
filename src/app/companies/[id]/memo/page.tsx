import { PrintButton } from "@/components/PrintButton";
import { ClassBadge, CompanyFlags, DecisionBadge } from "@/components/ui";
import { FinTable } from "@/components/FinTable";
import { WaterfallTable } from "@/components/WaterfallTable";
import { CovenantTable, EvidenceList, RefiTable } from "@/components/Tables";
import { SourcePanel } from "@/components/SourcePanel";
import { load } from "@/lib/page";
import { narrative } from "@/lib/narrative";
import { totalDebt } from "@/lib/finance/metrics";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { SCENARIOS, SCENARIO_LABEL } from "@/lib/types";

const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => <section className="memo-section mb-5"><h2 className="text-[14px] font-semibold border-b border-slate-300 mb-2 pb-0.5">{t}</h2>{children}</section>;
const L = ({ xs }: { xs: string[] }) => <ul className="list-disc pl-5 space-y-0.5">{xs.map((x) => <li key={x}>{x}</li>)}</ul>;

export default async function Memo({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const n = narrative(c, a);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const last = c.history[c.history.length - 1];
  const debt = totalDebt(c.tranches);
  const m = (k: string) => a.metrics.find((x) => x.key === k)!.value;
  const R = a.returns, th = c.thresholds;
  const lbl = (y: number | null) => (y == null ? "n/a" : c.periodLabels[y - c.baseYear - 1]);
  const rec = (s: (typeof SCENARIOS)[number]) => a.recovery[s].waterfall.rows.find((r) => r.id === t.id)!;
  const scen = (s: (typeof SCENARIOS)[number]) => {
    const p = a.projections[s];
    return `Revenue CAGR ${fmtPct(Math.pow(p.years[4].revenue / last.revenue, 0.2) - 1)}; ${c.periodLabels[4]} EBITDA ${fmtM(p.years[4].ebitda, 0)} (${fmtPct(a.assumptions[s].ebitdaMargin[4])} margin); trough EBITDA ${fmtM(Math.min(...p.years.map((y) => y.ebitda)), 0)}; peak net leverage ${fmtX(Math.max(...p.years.map((y) => y.netLeverage ?? 99)))}; minimum EBITDA / interest ${fmtX(Math.min(...p.years.map((y) => y.interestCoverage ?? 0)), 2)}; cumulative FCF ${fmtM(p.years.reduce((x, y) => x + y.fcf, 0), 0)}. ${p.defaultYear ? `Payment default modelled in ${lbl(p.defaultYear)}; target-tranche recovery ${fmtPct(rec(s).recoveryPct, 0)}.` : "No payment default modelled."} IRR ${fmtPct(R[s].irr)}, MOIC ${R[s].moic.toFixed(2)}x.`;
  };
  return (
    <article className="bg-white border border-line rounded-sm p-6 max-w-5xl text-[12.5px] leading-relaxed">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-[11px] uppercase text-muted">Investment memorandum · {c.dataClass === "public" ? `public filings through ${c.asOf}` : "demo data"}</div>
          <h1 className="text-xl font-semibold">{c.name} ({c.ticker}) — {t.name}</h1>
          <div className="mt-1"><CompanyFlags dataClass={c.dataClass} terms={c.termsLabel} /></div>
        </div>
        <div className="text-right"><DecisionBadge d={a.recommendation.decision} big /><div className="mt-1"><PrintButton /></div></div>
      </div>

      <Sec t="Executive Summary"><p>{n.opportunity} Recommendation: <b>{a.recommendation.decision}</b>. Credit score {a.score.total.toFixed(0)}/100 ({a.score.risk} risk). Base-case IRR {fmtPct(R.base.irr)}, downside {fmtPct(R.downside.irr)}, severe {fmtPct(R.severe.irr)}; probability-weighted IRR {fmtPct(a.expected.irr)} vs a {fmtPct(th.hurdleIrr, 0)} hurdle; weighted P(default) {fmtPct(a.expected.pDefault, 0)}; severe-case valuation recovery {fmtPct(rec("severe").recoveryPct, 0)}. {n.decisionText}</p></Sec>
      <Sec t="Investment Thesis"><p>{c.thesis}</p><p className="mt-1 text-muted"><b>The question:</b> {n.question}</p></Sec>
      <Sec t="Company Overview"><p>{c.description} HQ {c.hq}; {c.sector} / {c.industry}. {c.baseLabel} revenue {fmtM(last.revenue, 0)}, EBITDA {fmtM(last.ebitda, 0)} ({fmtPct(last.ebitda / last.revenue)} margin); total debt {fmtM(debt, 0)}, cash {fmtM(c.cash, 0)}. {c.dataClass === "public" ? <ClassBadge k="reported" /> : <ClassBadge k="demo" />}</p></Sec>
      <Sec t="Industry / Market"><p>{c.industryView}</p></Sec>
      <Sec t="Historical Financial Performance"><FinTable years={c.history} hist={c.history.length} historyLabels={c.history.map((h) => h.label ?? `FY${h.year}A`)} projLabels={c.periodLabels} /></Sec>
      <Sec t="Capital Structure">
        <table><thead><tr><th>Tranche</th><th>Rank</th><th>Secured</th><th className="num">Face value</th><th>Rate</th><th>Maturity</th><th className="num">Mark / price</th></tr></thead>
          <tbody>{[...c.tranches].sort((x, y) => x.seniority - y.seniority).map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.seniority}</td><td>{x.secured ? "Yes" : "No"}</td><td className="num">{fmtM(x.principal)}</td><td>{x.floating ? `S+${((x.spread ?? 0) * 10000).toFixed(0)}bp${x.floor ? ` (${fmtPct(x.floor, 1)} floor)` : ""}` : fmtPct(x.rate, 2)}</td><td>{x.maturityDate}</td><td className="num">{x.price?.toFixed(1) ?? "—"}</td></tr>)}</tbody></table>
        <p className="mt-1">Total debt {fmtM(debt)} ({fmtX(debt / last.ebitda)} EBITDA); net debt {fmtM(debt - c.cash)}; liquidity {fmtM(c.cash + c.undrawnRevolver, 0)}; loan-to-value through the target tranche {fmtPct(a.breakevens.ltvThroughTranche ?? 0, 0)}.</p>
      </Sec>
      <Sec t="Credit Analysis"><p>Net leverage {fmtX(m("netLev"))}, EBITDA / interest {fmtX(m("ebitdaInt"), 2)}, FCF / debt {fmtPct(m("fcfDebt"))}, DSCR {fmtX(m("dscr"))}, liquidity ratio {fmtX(m("liqRatio"))}. Score components: {a.score.factors.map((f) => `${f.label} ${f.points.toFixed(0)}/${f.weight}`).join(", ")}. Score change vs {a.scoreChange!.priorLabel}: {a.scoreChange!.priorTotal.toFixed(0)} → {a.scoreChange!.currentTotal.toFixed(0)} ({a.scoreChange!.deltas.filter((d) => d.direction !== "neutral").map((d) => d.text).join("; ") || "no material factor change"}).</p></Sec>
      <Sec t="Debt Maturity Profile">
        <table><thead><tr><th>Period</th><th className="num">Debt due</th><th className="num">% of debt</th><th className="num">Projected liquidity (Base)</th><th className="num">Refinancing requirement</th></tr></thead>
          <tbody>{a.maturity.base.map((w) => <tr key={w.year}><td>{w.label}</td><td className="num">{fmtM(w.amount, 0)}</td><td className="num">{fmtPct(w.pctOfDebt, 0)}</td><td className="num">{fmtM(w.liquidityAvailable, 0)}</td><td className="num">{w.refiRequirement > 0 ? fmtM(w.refiRequirement, 0) : "—"}</td></tr>)}</tbody></table>
        {a.maturity.base.filter((w) => w.flag).map((w) => <p key={w.year} className="mt-1 text-bad"><b>Risk flag:</b> {w.flag}.</p>)}
        <div className="mt-2"><RefiTable c={c} events={a.refi.base} /></div>
      </Sec>
      <Sec t="Base Case"><p>{scen("base")}</p></Sec>
      <Sec t="Downside Case"><p>{scen("downside")}</p></Sec>
      <Sec t="Severe Downside"><p>{scen("severe")}</p></Sec>
      <Sec t="Covenant Analysis">{(["base", "downside"] as const).map((s) => <div key={s} className="mb-3"><div className="font-semibold mb-1">{SCENARIO_LABEL[s]}</div><CovenantTable c={c} results={a.covenants[s]} /></div>)}</Sec>
      <Sec t="Recovery Analysis"><p className="mb-1">{n.recoveryText} Recovery value = MAX(going concern {fmtM(a.recovery.severe.goingConcern, 0)}, liquidation {fmtM(a.recovery.severe.liquidation, 0)}) + cash, less administrative costs; severe case struck at {a.recovery.severe.eventLabel}.</p><WaterfallTable w={a.recovery.severe.waterfall} /></Sec>
      <Sec t="Investment Returns">
        <table><thead><tr><th></th>{SCENARIOS.map((s) => <th key={s} className="num">{SCENARIO_LABEL[s]}</th>)}</tr></thead>
          <tbody>
            <tr><td>Face value / purchase price / cash investment</td><td className="num" colSpan={3}>${c.target.face ?? 100}M / {t.price?.toFixed(1)} / {fmtM(R.base.cost)} <ClassBadge k="assumption" /></td></tr>
            <tr><td>Cash interest + exit/recovery proceeds</td>{SCENARIOS.map((s) => <td key={s} className="num">{fmtM(R[s].cashInterest)} + {fmtM(R[s].exitProceeds)}</td>)}</tr>
            <tr><td>Capital gain / (loss) vs purchase price</td>{SCENARIOS.map((s) => <td key={s} className="num">{fmtM(R[s].capitalGain)}</td>)}</tr>
            <tr><td>MOIC</td>{SCENARIOS.map((s) => <td key={s} className="num">{R[s].moic.toFixed(2)}x</td>)}</tr>
            <tr className="font-semibold"><td>IRR (hurdle {fmtPct(th.hurdleIrr, 0)})</td>{SCENARIOS.map((s) => <td key={s} className="num">{fmtPct(R[s].irr)}</td>)}</tr>
          </tbody></table>
      </Sec>
      <Sec t="Key Risks"><L xs={n.risks.map((r) => r.text)} /></Sec>
      <Sec t="Key Protections"><L xs={n.protections.map((r) => r.text)} /></Sec>
      <Sec t="Catalysts"><L xs={n.catalysts} /></Sec>
      <Sec t="Due Diligence Items">
        <table><thead><tr><th>Item</th><th>Status</th><th>Priority</th><th>Open question</th></tr></thead>
          <tbody>{c.diligenceItems.filter((d) => d.status !== "Complete").map((d) => <tr key={d.id}><td>{d.item}</td><td>{d.status}</td><td>{d.priority}</td><td>{d.question}</td></tr>)}</tbody></table>
      </Sec>
      <Sec t="Recommendation">
        <p className="mb-2"><b>{a.recommendation.decision}.</b> {n.decisionText}</p>
        <EvidenceList ev={a.recommendation.evidence} />
        <h3 className="font-semibold mt-3 mb-1">What would change my mind?</h3><L xs={n.changeMyMind} />
      </Sec>
      <SourcePanel sources={c.sources} label="Sources" open />
      <p className="text-[10px] text-muted mt-3">Generated entirely from the structured model (inputs → analysis → memo): every figure reconciles to the Excel workbook (see Settings → Reconciliation). Hypothetical terms are underwriting assumptions. Not investment advice.</p>
    </article>
  );
}
