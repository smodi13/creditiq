import { Card, ClassBadge, StatusPill } from "@/components/ui";
import { IrrBars } from "@/components/Charts";
import { ReturnsLab } from "@/components/ReturnsLab";
import { SensTables } from "@/components/SensTables";
import { load } from "@/lib/page";
import { sensitivities } from "@/lib/sensitivities";
import { fmtM, fmtPct } from "@/lib/format";
import { SCENARIOS, SCENARIO_LABEL } from "@/lib/types";

export default async function Returns({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const price = t.price ?? 100;
  const face = c.target.face ?? 100;
  const freq = t.payFreq ?? 1;
  const r = a.returns;
  const th = c.thresholds;
  const be = a.breakevens;
  const lines: [string, (s: (typeof SCENARIOS)[number]) => string][] = [
    ["Outcome", (s) => (r[s].defaulted ? `Default (${c.periodLabels[r[s].defaultYear! - c.baseYear - 1]})` : "Performing")],
    ["Face value (legal claim)", () => fmtM(face)],
    ["Purchase price → cash investment", () => `${price.toFixed(1)} → ${fmtM(r.base.cost)}`],
    ["Cash interest received", (s) => fmtM(r[s].cashInterest)],
    ["Exit price (performing) / recovery proceeds (default)", (s) => (r[s].defaulted ? fmtM(r[s].exitProceeds) : `${r[s].exitPrice.toFixed(1)} → ${fmtM(r[s].exitProceeds)}`)],
    ["Capital gain / (loss) vs purchase price", (s) => fmtM(r[s].capitalGain)],
    ["Total cash proceeds", (s) => fmtM(r[s].totalProceeds)],
    ["Valuation recovery % · loss given default", (s) => { const x = a.recovery[s].waterfall.rows.find((q) => q.id === t.id)!; return `${fmtPct(x.recoveryPct, 0)} · ${fmtPct(x.lossPct, 0)}`; }],
    ["Absolute profit", (s) => fmtM(r[s].profit)],
    ["MOIC", (s) => r[s].moic.toFixed(2) + "x"],
    ["IRR (annual periods)", (s) => fmtPct(r[s].irr)],
    [`IRR (contractual timing, ${freq}x/yr coupons)`, (s) => fmtPct(r[s].irrContractual)],
    ["Scenario probability", (s) => fmtPct(r[s].probability, 0)],
  ];
  return (
    <div className="space-y-3">
      <Card title={`Return analysis — ${t.name}`} right={<span className="flex flex-wrap gap-1"><ClassBadge k="hypo" /><ClassBadge k="assumption" /></span>}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 text-[12px]">
          {([["Face value", fmtM(face)], ["Purchase price (assumption)", price.toFixed(1)], ["Cash investment", fmtM(r.base.cost)], ["Current yield", fmtPct(a.yieldMetrics.currentYield)], ["Yield to maturity", fmtPct(a.yieldMetrics.ytm)]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="border border-line p-2"><div className="text-muted uppercase text-[10px]">{l}</div><div className="text-base font-semibold">{v}</div></div>
          ))}
        </div>
        <div className="grid xl:grid-cols-[2fr_1fr] gap-3">
          <table>
            <thead><tr><th></th>{SCENARIOS.map((s) => <th key={s} className="num">{SCENARIO_LABEL[s]}</th>)}<th className="num">Expected</th></tr></thead>
            <tbody>
              {lines.map(([l, f]) => <tr key={l}><td>{l}</td>{SCENARIOS.map((s) => <td key={s} className={`num ${l === "Outcome" && f(s).startsWith("Default") ? "text-bad font-semibold" : ""}`}>{f(s)}</td>)}
                <td className="num text-muted">{l === "IRR (annual periods)" ? fmtPct(a.expected.irr) : l.startsWith("IRR (contractual") ? fmtPct(a.expected.irrContractual) : l === "MOIC" ? a.expected.moic.toFixed(2) + "x" : ""}</td></tr>)}
              <tr className="total"><td>Required return (hurdle IRR) → status</td>{SCENARIOS.map((s) => <td key={s} className="num"><StatusPill s={(r[s].irr ?? -1) >= th.hurdleIrr ? "PASS" : "FAIL"} /> <span className="text-[10px] text-muted">{fmtPct(th.hurdleIrr, 0)}</span></td>)}<td className="num"><StatusPill s={(a.expected.irr ?? -1) >= th.hurdleIrr ? "PASS" : "FAIL"} /></td></tr>
            </tbody>
          </table>
          <IrrBars data={SCENARIOS.map((s) => ({ name: SCENARIO_LABEL[s], irr: +((r[s].irr ?? 0) * 100).toFixed(1) }))} hurdle={th.hurdleIrr} />
        </div>
        <div className="grid md:grid-cols-3 gap-2 mt-3 text-[12px]">
          <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Probability-weighted expected loss</div><div className="font-semibold">{fmtPct(a.expected.pDefault, 0)} P(default) × {fmtPct(a.expected.lgd, 0)} LGD = {fmtPct(a.expected.pDefault * a.expected.lgd, 1)}</div></div>
          <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Max entry price that still earns the hurdle (base case)</div><div className="font-semibold">{be.hurdleEntryPrice ? be.hurdleEntryPrice.toFixed(1) : "n/a"} <span className="font-normal text-muted">vs assumed {price.toFixed(1)}</span></div></div>
          <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Recovery needed for MOIC 1.0x if default</div><div className="font-semibold">{be.breakevenRecoveryPct != null ? be.breakevenRecoveryPct.toFixed(0) : "n/a"}% of face</div></div>
        </div>
        <p className="text-[11px] text-muted mt-2"><b>Expected column</b> = IRR of the probability-weighted cash flows ({fmtPct(a.expected.irr)}), not the average of scenario IRRs ({fmtPct(a.expected.avgIrr)}); IRR is non-linear. <b>Contractual timing</b> re-times the same coupon dollars to {freq} payment(s) per year (settlement on a coupon date, no accrued interest); principal/recovery stay on annual dates. Fees: {fmtPct(c.target.feePct, 1)} of cost, paid at t=0. Per ${face}M face. Timing: coupons at period ends; default → recovery cash {c.resolutionLag} period after the default period; performing exit at the hold period at the lesser of the scenario exit-price cap and valuation coverage at the exit multiple. Floating coupons include the scenario rate shock. Scenario weights {SCENARIOS.map((s) => fmtPct(r[s].probability, 0)).join(" / ")}.</p>
      </Card>
      <Card title="Sensitivity analysis — where is the risk / return attractive?"><SensTables tables={sensitivities(c, a)} hurdle={th.hurdleIrr} /></Card>
      <Card title="Return calculator">
        <ReturnsLab init={{ price, coupon: a.projections.base.years[0].rates[t.id], hold: c.target.holdYears, exitPrice: r.base.exitPrice, face }} />
      </Card>
    </div>
  );
}
