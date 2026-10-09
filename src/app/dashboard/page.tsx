import Link from "next/link";
import { Card, ClassBadge, CoLink, DecisionBadge, PageTitle, RiskBadge, SevPill, Stat, StatusPill } from "@/components/ui";
import { DataTable, type Row as TRow } from "@/components/DataTable";
import { cell } from "@/components/cell";
import { RiskReturnMatrix } from "@/components/Charts";
import { rows } from "@/lib/view";
import { portfolioViews, realPositionViews } from "@/lib/portfolio";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { DEFAULT_THRESHOLDS } from "@/lib/config";

export default function Dashboard() {
  const all = rows();
  const book = [...portfolioViews(), ...realPositionViews()];
  const real = all.filter((r) => r.c.dataClass === "public");
  const rank = (r: (typeof all)[number]) => (r.a.expected.irr ?? -1) - 0.1 * (1 - r.sevRec); // risk-adjusted expected return
  const opp = all.filter((r) => r.a.recommendation.decision !== "PASS" || r.c.dataClass === "public").sort((x, y) => rank(y) - rank(x)).slice(0, 8);
  const worsening = [...all].sort((x, y) => (x.a.scoreChange!.currentTotal - x.a.scoreChange!.priorTotal) - (y.a.scoreChange!.currentTotal - y.a.scoreChange!.priorTotal)).slice(0, 5);
  const mats = all.flatMap((r) => r.a.maturity.base.filter((m) => m.year <= r.c.baseYear + 2 && m.amount > 0).map((m) => ({ r, m }))).sort((x, y) => y.m.refiRequirement - x.m.refiRequirement || y.m.amount - x.m.amount).slice(0, 7);
  const covs = all.flatMap((r) => (["base", "downside"] as const).flatMap((s) => r.a.covenants[s].filter((cv) => cv.firstBreachYear != null && cv.firstBreachYear <= r.c.baseYear + 2).map((cv) => ({ r, s, cv })))).sort((x, y) => (x.s === "base" ? 0 : 1) - (y.s === "base" ? 0 : 1)).slice(0, 8);
  const dist = all.filter((r) => r.a.distress.flags.length >= 3).sort((x, y) => y.a.distress.score - x.a.distress.score).slice(0, 5);
  const alerts = book.flatMap((p) => p.alerts.map((a) => ({ p, a }))).sort((x, y) => ["HIGH", "MEDIUM", "LOW"].indexOf(x.a.severity) - ["HIGH", "MEDIUM", "LOW"].indexOf(y.a.severity));
  const high = alerts.filter((x) => x.a.severity === "HIGH");
  const oppRows: TRow[] = opp.map((r, i) => ({
    id: r.c.id,
    cells: {
      rank: cell(i + 1),
      company: cell(r.c.name, <span><CoLink id={r.c.id}>{r.c.name}</CoLink> {r.c.dataClass === "public" && <ClassBadge k="public" />}</span>),
      decision: cell(r.a.recommendation.decision, <DecisionBadge d={r.a.recommendation.decision} />),
      base: cell(r.a.returns.base.irr ?? -1, fmtPct(r.a.returns.base.irr)), down: cell(r.a.returns.downside.irr ?? -1, fmtPct(r.a.returns.downside.irr)), exp: cell(r.a.expected.irr ?? -1, fmtPct(r.a.expected.irr)),
      rec: cell(r.sevRec, fmtPct(r.sevRec, 0)), lev: cell(r.netLev ?? 99, fmtX(r.netLev)), cov: cell(r.cov ?? 0, fmtX(r.cov, 2)), score: cell(r.a.score.total, r.a.score.total.toFixed(0)), risk: cell(r.a.score.risk, <RiskBadge r={r.a.score.risk} />),
    },
  }));
  const matrix = all.map((r) => ({ id: r.c.id, label: r.c.ticker, ret: r.a.expected.irr ?? 0, protect: r.sevRec, kind: r.c.dataClass }));
  return (
    <div className="space-y-3">
      <PageTitle title="Dashboard — what should I look at today?" sub="Ranked opportunities, deteriorating credits, maturity and covenant pressure, portfolio changes. Every tile links to an action or a question." />
      <div className="grid md:grid-cols-2 gap-2">
        {real.map((r) => (
          <Link key={r.c.id} href={`/companies/${r.c.id}/investment-committee`} className="block border border-emerald-300 bg-emerald-50 px-3 py-2 hover:bg-emerald-100 !text-ink">
            <div className="flex items-center justify-between"><span className="font-semibold">{r.c.name} <ClassBadge k="public" /></span><DecisionBadge d={r.a.recommendation.decision} big /></div>
            <div className="text-[12px] mt-1">Base / downside / severe IRR <b>{fmtPct(r.a.returns.base.irr)} / {fmtPct(r.a.returns.downside.irr)} / {fmtPct(r.a.returns.severe.irr)}</b> · severe recovery <b>{fmtPct(r.sevRec, 0)}</b> · {r.a.recommendation.coreFails} core test(s) failed → open investment committee page</div>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        <Stat label="High-severity alerts" value={high.length} tone={high.length ? "bad" : "good"} sub="portfolio & thesis monitor" />
        <Stat label="Covenant issues" value={covs.length} tone={covs.length ? "warn" : "good"} sub="breach within 2 periods" />
        <Stat label="Maturity flags" value={all.reduce((s, r) => s + r.a.maturity.base.filter((m) => m.flag).length, 0)} tone="warn" sub="base case refi shortfall" />
        <Stat label="Distressed screens" value={all.filter((r) => r.a.distress.flags.length >= 3).length} sub="≥ 3 distress flags" />
        <Stat label="Companies" value={all.length} sub="2 public cases + 16 demo" />
        <Stat label="Avg. credit score" value={(all.reduce((s, r) => s + r.a.score.total, 0) / all.length).toFixed(0)} />
      </div>
      <Card title="Top opportunities — ranked by risk-adjusted expected return" right={<span className="text-[11px] text-muted">rank = probability-weighted IRR − 10% × severe-case loss · click headers to sort</span>}>
        <DataTable defaultSort="rank" desc={false} filterable={false}
          columns={[{ key: "rank", label: "#" }, { key: "company", label: "Company" }, { key: "decision", label: "Decision" }, { key: "base", label: "Base IRR", num: true }, { key: "down", label: "Downside IRR", num: true }, { key: "exp", label: "Exp. IRR", num: true }, { key: "rec", label: "Severe recovery", num: true }, { key: "lev", label: "Net lev.", num: true }, { key: "cov", label: "EBITDA/int.", num: true }, { key: "score", label: "Score", num: true }, { key: "risk", label: "Risk" }]}
          rows={oppRows} />
      </Card>
      <div className="grid xl:grid-cols-2 gap-3">
        <Card title="Risk / return matrix — expected IRR vs downside protection" right={<span className="text-[11px] text-muted">hurdle {fmtPct(DEFAULT_THRESHOLDS.hurdleIrr, 0)} · protection line = minimum recovery {fmtPct(DEFAULT_THRESHOLDS.minRecovery, 0)}</span>}>
          <RiskReturnMatrix data={matrix} hurdle={DEFAULT_THRESHOLDS.hurdleIrr} protect={DEFAULT_THRESHOLDS.minRecovery} />
        </Card>
        <Card title="Highest risks — credits whose score is deteriorating the most">
          <table><thead><tr><th>Company</th><th className="num">Score</th><th className="num">Δ vs prior period</th><th>Main driver</th></tr></thead><tbody>
            {worsening.map((r) => {
              const ch = r.a.scoreChange!; const d = ch.currentTotal - ch.priorTotal; const worst = [...ch.deltas].sort((x, y) => x.pointsDelta - y.pointsDelta)[0];
              return <tr key={r.c.id}><td><CoLink id={r.c.id}>{r.c.name}</CoLink></td><td className="num">{ch.currentTotal.toFixed(0)}</td><td className={`num ${d < 0 ? "text-bad" : ""}`}>{d.toFixed(1)}</td><td className="text-[11px]">{worst.text}</td></tr>;
            })}
          </tbody></table>
        </Card>
        <Card title="Upcoming maturities & refinancing requirement (base case, ≤ 2 periods)">
          <table><thead><tr><th>Company</th><th>Period</th><th className="num">Due</th><th className="num">Proj. liquidity</th><th className="num">Refi need</th><th>Risk</th></tr></thead><tbody>
            {mats.map(({ r, m }) => <tr key={r.c.id + m.year}><td><CoLink id={r.c.id}>{r.c.ticker}</CoLink></td><td>{m.label}</td><td className="num">{fmtM(m.amount, 0)}</td><td className="num">{fmtM(m.liquidityAvailable, 0)}</td><td className={`num ${m.refiRequirement > 0 ? "text-bad font-semibold" : ""}`}>{m.refiRequirement > 0 ? fmtM(m.refiRequirement, 0) : "—"}</td><td><StatusPill s={m.risk} /></td></tr>)}
          </tbody></table>
        </Card>
        <Card title="Covenant issues — current and projected breaches">
          <table><thead><tr><th>Company</th><th>Covenant</th><th>Case</th><th>First breach</th></tr></thead><tbody>
            {covs.map(({ r, s, cv }, i) => <tr key={i}><td><CoLink id={r.c.id}>{r.c.ticker}</CoLink></td><td className="text-[11px]">{cv.covenant.label.slice(0, 54)}</td><td>{s === "base" ? <StatusPill s="BREACH" /> : "Downside"}</td><td>{r.c.periodLabels[cv.firstBreachYear! - r.c.baseYear - 1]}</td></tr>)}
            {covs.length === 0 && <tr><td colSpan={4} className="text-good">No breaches within two periods.</td></tr>}
          </tbody></table>
        </Card>
        <Card title="Distressed opportunities" right={<Link href="/opportunities" className="text-[11px]">Open screen →</Link>}>
          <table><thead><tr><th>Company</th><th className="num">Opp. score</th><th className="num">Opportunity</th><th className="num">Safety</th><th>Flags</th></tr></thead><tbody>
            {dist.map((r) => <tr key={r.c.id}><td><CoLink id={r.c.id}>{r.c.name}</CoLink></td><td className="num font-semibold">{r.a.distress.score.toFixed(0)}</td><td className="num">{r.a.distress.opportunity.toFixed(0)}</td><td className="num">{r.a.distress.safety.toFixed(0)}</td><td className="text-[11px] text-muted">{r.a.distress.flags.length}</td></tr>)}
          </tbody></table>
        </Card>
        <Card title="Recent portfolio changes & thesis status" right={<Link href="/portfolio" className="text-[11px]">Portfolio →</Link>}>
          <ul className="space-y-1.5">
            {[...book].sort((x, y) => y.updateDate.localeCompare(x.updateDate)).slice(0, 6).map((p) => (
              <li key={p.key}><span className="text-muted">{p.updateDate}</span> <b>{p.company.ticker}</b> {p.hypothetical && <ClassBadge k="hypo" />} — {p.latestUpdate} <StatusPill s={p.thesisStatus} />
                {p.alerts.filter((x) => x.severity === "HIGH").slice(0, 1).map((x) => <span key={x.code} className="ml-1"><SevPill s="HIGH" /> {x.message}</span>)}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Macro themes (credit-relevant)" right={<Link href="/macro" className="text-[11px]">Macro →</Link>}>
        <div className="text-[12px]">SOFR ↑ → floating interest ↑ → FCF ↓ → coverage ↓ → refinancing risk ↑. Open the macro page for live FRED readings and the rate-sensitivity of every case.</div>
      </Card>
    </div>
  );
}
