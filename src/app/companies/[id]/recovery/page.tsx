import { Card, ClassBadge } from "@/components/ui";
import { RecoveryLab } from "@/components/RecoveryLab";
import { WaterfallTable } from "@/components/WaterfallTable";
import { StackedRecovery } from "@/components/Charts";
import { CollateralStressCard } from "@/components/CollateralStress";
import { collateralStress } from "@/lib/collateral";
import { load } from "@/lib/page";
import { fmtM, fmtPct } from "@/lib/format";
import { SCENARIOS, SCENARIO_LABEL } from "@/lib/types";

export default async function Recovery({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
  const sev = a.recovery.severe;
  const h = c.history[c.history.length - 1];
  const cs = collateralStress(c, h.revenue - h.cogs, a.assumptions.severe.liquidationRecovery);
  const trough = Math.max(0, Math.min(...a.projections.severe.years.map((y) => y.ebitda)));
  return (
    <div className="space-y-3">
      <Card title="Recovery waterfall by scenario" right={<ClassBadge k="projection" />}>
        <p className="text-[12px] text-muted mb-2">
          <b>Recovery value = MAX(going-concern value, liquidation value)</b> + cash, less administrative costs, then distributed by seniority (strict absolute priority; equal ranks pari passu). Going concern = distressed EV/EBITDA multiple × EBITDA at the valuation event; liquidation = asset base × (1 − decline) × liquidation recovery.
          Valuation event = the payment-default period, or — if no default is modelled — a hypothetical default at the trough-EBITDA period (so protection is always measured). Specific liens are paid from their own collateral pool; any deficiency joins general creditors. {c.assetValueBasis}
        </p>
        <div className="space-y-5">
          {SCENARIOS.map((s) => {
            const r = a.recovery[s];
            const row = r.waterfall.rows.find((x) => x.id === t.id);
            return (
              <div key={s}>
                <h3 className="font-semibold mb-1">{SCENARIO_LABEL[s]} <span className="font-normal text-muted">— {r.eventLabel}{r.actualDefault ? " (modelled payment default)" : " (hypothetical default at trough EBITDA; no default modelled)"}</span></h3>
                <div className="grid md:grid-cols-4 gap-2 mb-2 text-[12px]">
                  <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Going concern</div><div className="font-semibold">{fmtM(r.goingConcern, 0)}</div></div>
                  <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Liquidation</div><div className="font-semibold">{fmtM(r.liquidation, 0)}</div></div>
                  <div className="border border-line p-2 bg-slate-50"><div className="text-muted uppercase text-[10px]">Recovery value = MAX (+ cash {fmtM(r.cashAtEvent, 0)})</div><div className="font-semibold">{fmtM(r.value, 0)} · {r.basis}</div></div>
                  <div className="border border-line p-2"><div className="text-muted uppercase text-[10px]">Target tranche · LGD</div><div className="font-semibold">{fmtPct(row?.recoveryPct ?? 0, 0)} recovery · {fmtPct(row?.lossPct ?? 0, 0)} loss</div></div>
                </div>
                <div className="grid xl:grid-cols-2 gap-3 items-start">
                  <WaterfallTable w={r.waterfall} />
                  <StackedRecovery data={[...r.waterfall.rows].sort((x, y) => x.rank - y.rank).map((x) => ({ name: x.name.slice(0, 34), recovery: +x.recovery.toFixed(1), loss: +x.loss.toFixed(1) }))} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {cs.applies && <Card title="Collateral coverage stress — when does recovery fall below 100%?" right={<ClassBadge k="projection" />}><CollateralStressCard s={cs} /></Card>}
      <Card title="Recovery lab — change valuation assumptions and watch the waterfall re-allocate">
        <RecoveryLab company={c} ebitda={trough} multiple={a.assumptions.severe.distressMultiple} decline={a.assumptions.severe.assetValueDecline} liqRec={a.assumptions.severe.liquidationRecovery} />
      </Card>
      <span className="hidden">{sev.eventYear}</span>
    </div>
  );
}
