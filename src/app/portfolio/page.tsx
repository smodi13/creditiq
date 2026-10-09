import { Card, ClassBadge, CoLink, PageTitle, Pill, RiskBadge, SevPill, Stat, StatusPill } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { cell } from "@/components/cell";
import { ThesisTable } from "@/components/Tables";
import { portfolioStats, portfolioViews, realPositionViews, type PositionView } from "@/lib/portfolio";
import { fmtM, fmtPct, fmtX } from "@/lib/format";

const TH: Record<string, string> = { "On track": "bg-green-100 text-green-800", "Under review": "bg-amber-100 text-amber-800", Impaired: "bg-red-100 text-red-800" };

export default function Portfolio() {
  const demo = portfolioViews(), real = realPositionViews();
  const all = [...real, ...demo];
  const st = portfolioStats(all);
  const table = (vs: PositionView[]) => (
    <DataTable defaultSort="alerts" filterable={false}
      columns={[{ key: "inv", label: "Investment" }, { key: "cost", label: "Cost", num: true }, { key: "val", label: "Value", num: true }, { key: "yld", label: "Yield", num: true }, { key: "irr", label: "IRR to date", num: true }, { key: "moic", label: "MOIC", num: true }, { key: "lev", label: "Net lev.", num: true }, { key: "cov", label: "EBITDA/int.", num: true }, { key: "liq", label: "Liquidity", num: true }, { key: "cv", label: "Covenants" }, { key: "mat", label: "Next maturity", num: true }, { key: "rec", label: "Recovery est.", num: true }, { key: "risk", label: "Risk" }, { key: "th", label: "Thesis" }, { key: "alerts", label: "Alerts", num: true }]}
      rows={vs.map((p) => ({ id: p.key, cells: {
        inv: cell(p.company.name, <><CoLink id={p.company.id}>{p.company.ticker}</CoLink> <span className="text-muted">{p.trancheName.slice(0, 44)}</span> {p.hypothetical && <ClassBadge k="hypo" />}</>),
        cost: cell(p.cost, fmtM(p.cost)), val: cell(p.value, fmtM(p.value)), yld: cell(p.yieldNow, fmtPct(p.yieldNow)), irr: cell(p.irr ?? -1, fmtPct(p.irr)), moic: cell(p.moic, p.moic.toFixed(2) + "x"),
        lev: cell(p.current.netLeverage, fmtX(p.current.netLeverage)), cov: cell(p.current.interestCoverage, fmtX(p.current.interestCoverage, 2)), liq: cell(p.current.liquidity, fmtM(p.current.liquidity, 0)),
        cv: cell(p.covenantStatus, <StatusPill s={p.covenantStatus === "n/a" ? "OK" : p.covenantStatus} />), mat: cell(p.nextMaturity), rec: cell(p.recoveryEstimate, fmtPct(p.recoveryEstimate, 0)),
        risk: cell(p.risk, <RiskBadge r={p.risk} />), th: cell(p.thesisStatus, p.assessment ? <StatusPill s={p.thesisStatus} /> : <Pill cls={TH[p.thesisStatus] ?? ""}>{p.thesisStatus}</Pill>), alerts: cell(p.alerts.length),
      } }))} />
  );
  return (
    <div className="space-y-3">
      <PageTitle title="Portfolio monitoring" sub="Tracked positions vs the thesis set at entry. Real cases are HYPOTHETICAL positions entered on their 10-K filing date and monitored with the actual 10-Q data; demo positions use illustrative prior-quarter snapshots." />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <Stat label="Cost" value={fmtM(st.totalCost)} /><Stat label="Market value" value={fmtM(st.totalValue)} />
        <Stat label="Wtd. current yield" value={fmtPct(st.wYield)} /><Stat label="Wtd. IRR to date" value={fmtPct(st.wIrr)} />
        <Stat label="Wtd. net leverage" value={fmtX(st.wLeverage)} /><Stat label="Wtd. coverage" value={fmtX(st.wCoverage, 2)} />
        <Stat label="Covenant breaches" value={st.covenantBreaches} tone={st.covenantBreaches ? "bad" : "good"} sub="positions (base case)" />
        <Stat label="Distressed exposure" value={fmtPct(st.distressedPct, 0)} sub="of cost, ≥3 flags" />
      </div>
      <Card title="Real underwriting cases — hypothetical positions, thesis vs actual" right={<ClassBadge k="public" />}>{table(real)}</Card>
      {real.map((p) => p.assessment && (
        <Card key={p.key} title={`${p.company.name}: thesis at entry (${p.company.thesisPlan!.entryDate}) vs actual performance`} right={<span className="text-[11px] text-muted">{p.company.monitoring!.label}</span>}>
          <p className="text-[12px] mb-2">{p.thesis}</p>
          <ThesisTable t={p.assessment} />
          <ul className="mt-2 space-y-1">{p.assessment.alerts.map((a) => <li key={a.code}><SevPill s={a.severity} /> <b>{a.code}</b>{a.forward ? <span className="text-[10px] text-muted"> (forward-looking model flag)</span> : null} — {a.message}</li>)}</ul>
          <p className="text-[11px] text-muted mt-2">Status is driven only by reported actual-vs-plan metrics. Plan values are analyst entry assumptions ({p.company.thesisPlan!.entryBasis}); actuals are computed from the filings, not typed in.</p>
        </Card>
      ))}
      <Card title="Demo book (illustrative)" right={<ClassBadge k="demo" />}>{table(demo)}</Card>
      <Card title="Alerts by severity">
        <div className="space-y-3">
          {all.map((p) => (
            <div key={p.key}>
              <div className="font-semibold"><CoLink id={p.company.id}>{p.company.name}</CoLink> — {p.trancheName} {p.hypothetical && <ClassBadge k="hypo" />}</div>
              <div className="text-muted text-[12px]">{p.latestUpdate} ({p.updateDate})</div>
              {p.alerts.length ? <ul className="mt-1 space-y-0.5">{[...p.alerts].sort((a, b) => ["HIGH", "MEDIUM", "LOW"].indexOf(a.severity) - ["HIGH", "MEDIUM", "LOW"].indexOf(b.severity)).map((a) => <li key={a.code + a.message}><SevPill s={a.severity} /> <b>{a.code}</b> {a.message}</li>)}</ul> : <div className="text-good text-[12px]">No alerts</div>}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid xl:grid-cols-3 gap-3">
        <Card title="Exposure by industry (cost)"><table><tbody>{st.byIndustry.map((x) => <tr key={x.name}><td>{x.name}</td><td className="num">{fmtM(x.cost)}</td><td className="num">{fmtPct(x.pct, 0)}</td></tr>)}</tbody></table></Card>
        <Card title="Exposure by risk level (cost)"><table><tbody>{st.byRisk.map((x) => <tr key={x.name}><td><RiskBadge r={x.name} /></td><td className="num">{fmtM(x.cost)}</td><td className="num">{fmtPct(x.pct, 0)}</td></tr>)}</tbody></table></Card>
        <Card title="Concentrations"><table><tbody>
          <tr><td>Next-maturity concentration</td><td className="num">{st.maturity.map((m) => `${m.year}: ${fmtPct(m.cost / st.totalCost, 0)}`).join(" · ")}</td></tr>
          <tr><td>Covenant breaches (positions)</td><td className="num">{st.covenantBreaches} of {all.length}</td></tr>
          <tr><td>Distressed exposure (≥3 flags)</td><td className="num">{fmtPct(st.distressedPct, 0)}</td></tr>
          <tr><td>Cost-weighted recovery estimate (downside)</td><td className="num">{fmtPct(st.recoveryWeighted, 0)}</td></tr>
          <tr><td>Cost with recovery estimate &lt; 60%</td><td className="num">{fmtPct(st.lowRecoveryPct, 0)}</td></tr>
        </tbody></table></Card>
      </div>
    </div>
  );
}
