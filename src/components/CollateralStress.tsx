import { COLL_AXES, type CollateralStress } from "@/lib/collateral";
import { fmtM, fmtPct } from "@/lib/format";

const cls = (v: number) => (v >= 0.9999 ? "text-good" : v < 0.5 ? "text-bad" : "text-warn");

function Grid({ title, rowLabel, colLabel, rows, cols, cells }: { title: string; rowLabel: string; colLabel: string; rows: string[]; cols: string[]; cells: number[][] }) {
  return (
    <div className="overflow-x-auto">
      <h4 className="font-semibold text-[12px] mb-1">{title}</h4>
      <table>
        <thead><tr><th>{rowLabel} ↓ / {colLabel} →</th>{cols.map((c) => <th key={c} className="num">{c}</th>)}</tr></thead>
        <tbody>{cells.map((r, i) => <tr key={rows[i]}><td>{rows[i]}</td>{r.map((v, j) => <td key={j} className={`num font-semibold ${cls(v)}`}>{fmtPct(v, 0)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function CollateralStressCard({ s }: { s: CollateralStress }) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">
        <b>What the {fmtPct(s.poolPct, 0)} pool means:</b> an analyst assumption that the secured loan is paid from {fmtPct(s.poolPct, 0)} of the recovery value of the whole issuer (waterfall: pool share × net distributable value), not a verified list of pledged properties.
        Stress basis: recovery = MIN(100%, pool share × asset value × (1 − realization cost) × (1 − {fmtPct(s.admin, 0)} admin costs) ÷ claim). It is an asset-based floor (no going-concern value, no cash, no deficiency recovery); claim = {fmtM(s.claim, 0)} principal at close.
        Asset value {fmtM(s.assets, 0)}{s.hasCapRate ? ` = LTM NOI ${fmtM(s.noi, 0)} ÷ ${fmtPct(s.capBase, 1)} cap rate + ${fmtM(s.other, 0)} of book-value land, CIP and JV investments` : ""}; realization factor {fmtPct(s.liq, 0)} (Severe scenario).
      </p>
      <div className="grid md:grid-cols-3 gap-2 text-[12px]">
        <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Total asset value needed for 100% recovery</div><div className="font-semibold">{fmtM(s.breakEvenValue, 0)} <span className="font-normal text-muted">vs {fmtM(s.assets, 0)} base (pledged pool at base: {fmtM(s.poolPct * s.assets, 0)})</span></div></div>
        <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Break-even decline in total asset value</div><div className="font-semibold">{fmtPct(s.breakEvenAssetDecline, 0)}</div></div>
        <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Break-even cap rate (NOI unchanged) / NOI change (cap rate unchanged)</div><div className="font-semibold">{s.breakEvenCapRate != null ? fmtPct(s.breakEvenCapRate, 1) : "n/a"} / {s.breakEvenNoiDecline != null ? fmtPct(s.breakEvenNoiDecline, 0) : "n/a"}</div></div>
      </div>
      <div className="grid xl:grid-cols-2 gap-3 items-start">
        {s.hasCapRate && <Grid title="Recovery % — cap rate vs NOI change" rowLabel="Cap rate" colLabel="NOI change" rows={COLL_AXES.cap.map((x) => fmtPct(x, 1))} cols={COLL_AXES.noi.map((x) => fmtPct(x, 0))} cells={s.tableCap} />}
        <Grid title="Recovery % — pledged share vs realization factor (1 − sale/enforcement cost)" rowLabel="Pool share" colLabel="Realization" rows={COLL_AXES.pool.map((x) => fmtPct(x, 0))} cols={COLL_AXES.liq.map((x) => fmtPct(x, 0))} cells={s.tablePool} />
        <Grid title="Recovery % — loan balance vs asset-value decline" rowLabel="Claim ×" colLabel="Asset decline" rows={COLL_AXES.claim.map((x) => `${x.toFixed(1)}x`)} cols={COLL_AXES.decl.map((x) => fmtPct(x, 0))} cells={s.tableClaim} />
      </div>
    </div>
  );
}
