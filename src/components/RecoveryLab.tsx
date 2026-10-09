"use client";
import { NumInput } from "./NumInput";
import { useMemo, useState } from "react";
import type { Company } from "@/lib/types";
import { claimsAt } from "@/lib/analysis";
import { runWaterfall } from "@/lib/finance/waterfall";
import { WaterfallTable } from "./WaterfallTable";
import { StackedRecovery } from "./Charts";
import { fmtM } from "@/lib/format";

export function RecoveryLab({ company, ebitda, multiple, decline, liqRec }: { company: Company; ebitda: number; multiple: number; decline: number; liqRec: number }) {
  const [e, setE] = useState(Math.round(ebitda));
  const [m, setM] = useState(multiple);
  const [decl, setDecl] = useState(decline);
  const [liq, setLiq] = useState(liqRec);
  const [admin, setAdmin] = useState<number>(company.adminPct);
  const [override, setOverride] = useState<number | "">("");
  const gc = e * m;
  const lv = company.assetBase * (1 - decl) * liq;
  const value = override === "" ? Math.max(gc, lv) + company.cash * 0 : override;
  const w = useMemo(() => {
    const bal = Object.fromEntries(company.tranches.map((t) => [t.id, t.principal]));
    const rates = Object.fromEntries(company.tranches.map((t) => [t.id, t.floating ? company.sofr[0] + (t.spread ?? 0) : t.rate]));
    return runWaterfall(value, claimsAt(company, bal, rates), admin, company.deficiencyRank);
  }, [company, value, admin]);
  const num = (v: number, set: (n: number) => void, step: number, pct = false) => <NumInput step={step} value={pct ? +(v * 100).toFixed(2) : v} onChange={(x) => set(pct ? Number(x.target.value) / 100 : Number(x.target.value))} />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-[12px]">
        <label>Distressed EBITDA ($M)<br />{num(e, setE, 5)}</label>
        <label>Distressed multiple (x)<br />{num(m, setM, 0.25)}</label>
        <label>Asset base decline %<br />{num(decl, setDecl, 5, true)}</label>
        <label>Liquidation recovery %<br />{num(liq, setLiq, 5, true)}</label>
        <label>Admin costs %<br />{num(admin, setAdmin, 0.5, true)}</label>
        <label>Override value ($M)<br /><NumInput value={override} placeholder="auto" onChange={(x) => setOverride(x.target.value === "" ? "" : Number(x.target.value))} /></label>
      </div>
      <p className="text-[12px] text-muted">Going-concern {fmtM(gc)} vs liquidation {fmtM(lv)} → recovery value = <b>MAX</b> = {fmtM(Math.max(gc, lv))} (used: <b>{override === "" ? (gc >= lv ? "going concern" : "liquidation") : "override"}</b>, {fmtM(value)}). Claims = current face value + {company.accruedMonths} months accrued interest.</p>
      <div className="grid xl:grid-cols-2 gap-3 items-start">
        <WaterfallTable w={w} />
        <StackedRecovery data={[...w.rows].sort((a, b) => a.rank - b.rank).map((r) => ({ name: r.name.slice(0, 34), recovery: +r.recovery.toFixed(1), loss: +r.loss.toFixed(1) }))} />
      </div>
    </div>
  );
}
