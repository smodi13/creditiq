import Link from "next/link";
import { Card, ClassBadge, StatusPill } from "@/components/ui";
import { MaturityWallChart } from "@/components/Charts";
import { RefiTable } from "@/components/Tables";
import { SourcePanel } from "@/components/SourcePanel";
import { load } from "@/lib/page";
import { maturityAlert } from "@/lib/finance/maturity";
import { totalDebt } from "@/lib/finance/metrics";
import { MATURITY_WINDOW_YEARS } from "@/lib/config";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { SCENARIOS, SCENARIO_LABEL, type ScenarioKey } from "@/lib/types";

export default async function CapStructure({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ years?: string; case?: string }> }) {
  const { c, a } = await load(params);
  const sp = await searchParams;
  const win = Math.min(5, Math.max(1, Number(sp.years) || 2));
  const sel: ScenarioKey = (SCENARIOS as string[]).includes(sp.case ?? "") ? (sp.case as ScenarioKey) : "base";
  const ebitda = c.history[c.history.length - 1].ebitda;
  const debt = totalDebt(c.tranches);
  const liq = c.cash + c.undrawnRevolver;
  const wall = a.maturity[sel];
  const alert = maturityAlert(c, liq, win);
  const ordered = [...c.tranches].sort((x, y) => x.seniority - y.seniority);
  const cumul = ordered.map((_, i) => ordered.slice(0, i + 1).reduce((s, x) => s + x.principal, 0));
  const proj = a.projections[sel].years;
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const cumT = ordered.filter((x) => x.seniority <= t.seniority).reduce((s, x) => s + x.principal, 0);
  const ltv = cumT / Math.max(1, a.assetValue.base);
  const rate = (id: string, i = 0) => a.projections.base.years[i].rates[id];
  return (
    <div className="space-y-3">
      <Card title={`Debt schedule & capital structure — ${c.baseLabel} (${c.asOf})`} right={<ClassBadge k={c.dataClass === "public" ? "reported" : "demo"} />}>
        <div className="overflow-x-auto"><table>
          <thead><tr><th>Facility</th><th>Rank</th><th>Sec.</th><th className="num">Face value</th><th>Rate type</th><th className="num">Coupon / spread</th><th className="num">Floor</th><th className="num">PIK</th><th className="num">All-in (base, 1st period)</th><th className="num">Annual interest</th><th>Maturity</th><th className="num">Amort.</th><th className="num">Cum. leverage</th><th className="num">Mark / price</th></tr></thead>
          <tbody>
            {ordered.map((x, i) => (
              <tr key={x.id} className={x.id === c.target.trancheId ? "bg-indigo-50" : ""}>
                <td className="font-medium min-w-[230px]">{x.name}{x.commitment ? <span className="text-muted"> (commit {fmtM(x.commitment, 0)})</span> : null}{x.id === c.target.trancheId && <span className="ml-1 text-[10px] font-bold text-indigo-700">TARGET</span>}</td>
                <td className="num">{x.seniority}</td><td>{x.secured ? "Secured" : "Unsecured"}</td><td className="num">{fmtM(x.principal)}</td>
                <td>{x.floating ? "Floating" : "Fixed"}</td><td className="num">{x.floating ? `S+${((x.spread ?? 0) * 10000).toFixed(0)}bp` : fmtPct(x.rate, 2)}</td><td className="num">{x.floor ? fmtPct(x.floor, 2) : "—"}</td><td className="num">{x.pik ? fmtPct(x.pik, 2) : "—"}</td>
                <td className="num">{fmtPct(rate(x.id), 2)}</td><td className="num">{fmtM(x.principal * rate(x.id))}</td><td>{x.maturityDate}</td><td className="num">{x.amortPct ? fmtPct(x.amortPct) + "/yr" : "bullet"}</td><td className="num">{fmtX(cumul[i] / ebitda)}</td>
                <td className="num">{x.price != null ? x.price.toFixed(1) : "—"}{x.id === c.target.trancheId && <span className="ml-1"><ClassBadge k="assumption" /></span>}</td>
              </tr>
            ))}
            <tr className="total"><td>Total debt (face value)</td><td colSpan={2}></td><td className="num">{fmtM(debt)}</td><td colSpan={5}></td><td className="num">{fmtM(ordered.reduce((s, x) => s + x.principal * rate(x.id), 0))}</td><td colSpan={2}></td><td className="num">{fmtX(debt / ebitda)}</td><td></td></tr>
            <tr><td>Less: cash</td><td colSpan={2}></td><td className="num">({fmtM(c.cash)})</td><td colSpan={10}></td></tr>
            <tr className="total"><td>Net debt</td><td colSpan={2}></td><td className="num">{fmtM(debt - c.cash)}</td><td colSpan={8}></td><td className="num">{fmtX((debt - c.cash) / ebitda)}</td><td></td></tr>
            <tr><td className="font-medium">Equity (residual: EV − net debt, EV at assumed multiple)</td><td colSpan={2}></td><td className="num">{fmtM(Math.max(0, c.ev - (debt - c.cash)))}</td><td colSpan={11} className="text-[11px] text-muted">Goes to zero in any scenario where recovery value &lt; claims.</td></tr>
          </tbody>
        </table></div>
        <div className="grid md:grid-cols-3 gap-3 mt-3 text-[12px]">
          <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Loan-to-value through target tranche</div><div className="text-base font-semibold">{fmtPct(ltv, 0)}</div><div className="text-muted">cumulative debt {fmtM(cumT, 0)} ÷ base asset value {fmtM(a.assetValue.base, 0)}</div></div>
          <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Collateral / lien</div><div>{t.collateral ?? "n/a"}</div><div className="text-muted">{t.collateralPct ? `Ring-fenced pool: ${fmtPct(t.collateralPct, 0)} of asset value` : "All-asset lien / pari passu by rank"}</div></div>
          <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Call protection</div><div>{t.callProtection ?? "n/a"}</div><div className="text-muted">Not modelled as a cash flow</div></div>
        </div>
        <p className="text-[11px] text-muted mt-2">Face value = legal claim; purchase price / mark is what an investor pays; coupon is the contractual cash / PIK return; yield and recovery are derived on the Returns and Recovery tabs. {c.assetValueBasis}</p>
      </Card>

      <Card title="Maturity wall & refinancing requirement" right={
        <div className="flex items-center gap-2 no-print">
          {SCENARIOS.map((s) => <Link key={s} href={`?years=${win}&case=${s}`} className={`px-2 py-1 rounded text-[11px] border ${sel === s ? "bg-navy !text-white border-navy" : "border-line !text-slate-700"}`}>{SCENARIO_LABEL[s]}</Link>)}
          <form className="flex items-center gap-1 text-[11px]"><input type="hidden" name="case" value={sel} /><label>Alert window</label><input aria-label="Alert window (periods)" name="years" type="number" min={1} max={5} defaultValue={win} /><button className="px-2 py-1 border border-line rounded bg-white">Apply</button></form>
        </div>
      }>
        <div className={`mb-2 px-3 py-1.5 rounded-sm border text-[12px] ${alert.level === "critical" ? "bg-red-50 border-red-300 text-red-900" : alert.level === "watch" ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-green-50 border-green-300 text-green-900"}`}>
          <b>{alert.level === "none" ? "OK" : alert.level.toUpperCase()}</b> — {alert.message} (window: {win} period{win > 1 ? "s" : ""}; materiality 15% of debt; default window {MATURITY_WINDOW_YEARS})
        </div>
        {wall.filter((w) => w.flag).map((w) => <div key={w.year} className="mb-1 px-3 py-1.5 rounded-sm border bg-red-50 border-red-300 text-red-900 text-[12px]"><b>INVESTMENT RISK FLAG</b> — {w.flag}</div>)}
        <div className="grid xl:grid-cols-2 gap-3 mt-2">
          <MaturityWallChart data={wall.map((w) => ({ label: w.label.replace(" (beyond horizon)", "*").replace("LTM ", ""), amount: w.amount, liquidity: w.liquidityAvailable, requirement: w.refiRequirement, risk: w.risk }))} />
          <div className="overflow-x-auto"><table>
            <thead><tr><th>Period</th><th className="num">Debt due</th><th className="num">% of debt</th><th className="num">Projected liquidity</th><th className="num">Refi requirement</th><th className="num">Liq. ÷ maturity</th><th>Risk</th></tr></thead>
            <tbody>{wall.map((w) => (
              <tr key={w.year}><td>{w.label}</td><td className="num">{fmtM(w.amount, 0)}</td><td className="num">{fmtPct(w.pctOfDebt, 0)}</td><td className="num">{fmtM(w.liquidityAvailable, 0)}</td><td className={`num ${w.refiRequirement > 0 ? "text-bad font-semibold" : ""}`}>{w.refiRequirement > 0 ? fmtM(w.refiRequirement, 0) : "—"}</td><td className="num">{fmtX(w.coverage)}</td><td><StatusPill s={w.risk} /></td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <p className="text-[11px] text-muted mt-2">Projected liquidity = cash + undrawn revolver entering the period + that period’s positive FCF, in the selected scenario. * Beyond the 5-period horizon; liquidity shown at the end of period 5. Maturity periods map actual maturity dates to the model’s period-end month ({c.fyEndMonth === 12 ? "December" : "June"}).</p>
      </Card>

      <Card title={`Refinancing risk engine — ${SCENARIO_LABEL[sel]}`} right={<ClassBadge k="projection" />}>
        <p className="text-[12px] text-muted mb-2">For every maturing tranche: balance at maturity → can projected cash repay it? → if not, does leverage (net debt ÷ EBITDA ≤ scenario limit) and pro-forma interest coverage (≥ scenario minimum, at the assumed refinancing rate) permit refinancing? A failure with insufficient cash is a payment default and feeds the recovery waterfall.</p>
        <RefiTable c={c} events={a.refi[sel]} />
      </Card>

      <Card title={`Projected debt balances by tranche — ${SCENARIO_LABEL[sel]}`}>
        <div className="overflow-x-auto"><table>
          <thead><tr><th>Tranche</th><th className="num">Current</th>{c.periodLabels.map((l) => <th key={l} className="num">{l}</th>)}</tr></thead>
          <tbody>
            {ordered.map((x) => <tr key={x.id}><td>{x.name}</td><td className="num">{fmtM(x.principal)}</td>{proj.map((y) => <td key={y.year} className="num">{fmtM(y.debt[x.id])}{y.refinanced.includes(x.id) ? <sup className="text-accent"> R</sup> : ""}</td>)}</tr>)}
            <tr className="total"><td>Total debt</td><td className="num">{fmtM(debt)}</td>{proj.map((y) => <td key={y.year} className="num">{fmtM(y.totalDebt)}</td>)}</tr>
            <tr><td>Cash</td><td className="num">{fmtM(c.cash)}</td>{proj.map((y) => <td key={y.year} className="num">{fmtM(y.cash)}</td>)}</tr>
            <tr><td>Cash interest</td><td className="num">{fmtM(c.history[c.history.length - 1].interest)}</td>{proj.map((y) => <td key={y.year} className="num">{fmtM(y.cashInterest)}</td>)}</tr>
            <tr><td>PIK interest (non-cash)</td><td></td>{proj.map((y) => <td key={y.year} className="num">{y.pikInterest ? fmtM(y.pikInterest) : "—"}</td>)}</tr>
            <tr><td>Funding gap</td><td></td>{proj.map((y) => <td key={y.year} className={`num ${y.fundingGap > 0 ? "text-bad font-semibold" : ""}`}>{y.fundingGap > 0 ? fmtM(y.fundingGap) : "—"}</td>)}</tr>
          </tbody>
        </table></div>
        <p className="text-[11px] text-muted mt-2">R = remainder refinanced at the scenario refinancing rate. Maturities are repaid from cash above the minimum-cash reserve first; the market-access test governs only the remainder.</p>
      </Card>
      <SourcePanel sources={c.sources} />
    </div>
  );
}
