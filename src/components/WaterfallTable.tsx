import type { Waterfall } from "@/lib/finance/waterfall";
import { fmtM, fmtPct } from "@/lib/format";

export function WaterfallTable({ w, valueLabel = "Recovery value" }: { w: Waterfall; valueLabel?: string }) {
  const hasColl = w.rows.some((r) => r.collateralPct);
  const loss = w.rows.reduce((s, r) => s + r.loss, 0);
  return (
    <div className="overflow-x-auto"><table>
      <thead><tr><th>Claim (by seniority)</th><th className="num">Rank</th><th className="num">Claim</th>{hasColl && <th className="num">From own collateral</th>}<th className="num">Recovery</th><th className="num">Recovery %</th><th className="num">Loss</th><th className="num">Loss %</th></tr></thead>
      <tbody>
        <tr className="text-slate-600"><td>{valueLabel}</td><td></td><td></td>{hasColl && <td></td>}<td className="num">{fmtM(w.distributable)}</td><td colSpan={3}></td></tr>
        <tr className="text-slate-600"><td>Less: administrative / DIP costs</td><td></td><td></td>{hasColl && <td></td>}<td className="num">({fmtM(w.adminClaims)})</td><td colSpan={3}></td></tr>
        {[...w.rows].sort((a, b) => a.rank - b.rank).map((r) => (
          <tr key={r.id}><td>{r.name}{r.collateralPct ? <span className="text-[10px] text-muted"> · pool {fmtPct(r.collateralPct, 0)}</span> : null}</td><td className="num">{r.rank}</td><td className="num">{fmtM(r.amount)}</td>{hasColl && <td className="num">{r.collateralPct ? fmtM(r.fromCollateral) : "—"}</td>}<td className="num">{fmtM(r.recovery)}</td>
            <td className={`num font-semibold ${r.recoveryPct >= 0.99 ? "text-good" : r.recoveryPct < 0.5 ? "text-bad" : "text-warn"}`}>{fmtPct(r.recoveryPct, 1)}</td><td className="num">{fmtM(r.loss)}</td><td className="num">{fmtPct(r.lossPct, 1)}</td></tr>
        ))}
        <tr className="total"><td>Total claims</td><td></td><td className="num">{fmtM(w.totalClaims)}</td>{hasColl && <td></td>}<td className="num">{fmtM(w.totalClaims - loss)}</td><td></td><td className="num">{fmtM(loss)}</td><td></td></tr>
        <tr><td className="font-medium">Equity (residual)</td><td></td><td></td>{hasColl && <td></td>}<td className="num">{fmtM(w.equity)}</td><td colSpan={3} className="text-[11px] text-muted">{w.equity > 0 ? "In the money" : "Wiped out"}</td></tr>
      </tbody>
    </table></div>
  );
}
