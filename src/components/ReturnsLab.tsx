"use client";
import { NumInput } from "./NumInput";
import { useState } from "react";
import { z } from "zod";
import { bondReturn } from "@/lib/finance/returns";
import { fmtM, fmtPct } from "@/lib/format";

const Inputs = z.object({ price: z.number().min(1).max(150), face: z.number().min(0.1), coupon: z.number().min(0).max(0.5), hold: z.number().int().min(1).max(5), exitPrice: z.number().min(0).max(150), defaultYear: z.number().int().min(1).max(5).nullable(), recovery: z.number().min(0).max(1), fees: z.number().min(0).max(0.1) });

export function ReturnsLab({ init }: { init: { price: number; coupon: number; hold: number; exitPrice: number; face: number } }) {
  const [s, setS] = useState({ price: init.price, face: init.face, coupon: init.coupon, hold: init.hold, exitPrice: init.exitPrice, defaultYear: null as number | null, recovery: 0.5, fees: 0.005 });
  const p = Inputs.safeParse(s);
  const r = p.success ? bondReturn({ price: s.price, face: s.face, coupons: Array(5).fill(s.coupon), holdYears: s.hold, exitPrice: s.exitPrice, defaultYear: s.defaultYear, recoveryProceeds: s.face * s.recovery, feePct: s.fees }) : null;
  const n = (k: keyof typeof s, label: string, step: number, pct = false) => (
    <label className="text-[12px]">{label}<br /><NumInput step={step} value={pct ? +(((s[k] as number) ?? 0) * 100).toFixed(3) : ((s[k] as number) ?? "")} onChange={(e) => setS({ ...s, [k]: pct ? Number(e.target.value) / 100 : Number(e.target.value) })} />{pct ? "%" : ""}</label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 items-end">
        {n("price", "Purchase price (% of face)", 0.5)}{n("face", "Face value ($M)", 5)}{n("coupon", "Cash coupon", 0.25, true)}{n("hold", "Hold (periods)", 1)}{n("exitPrice", "Exit price (% of face)", 0.5)}{n("fees", "Entry fees", 0.1, true)}
        <label className="text-[12px]">Default?<br /><input type="checkbox" checked={s.defaultYear != null} onChange={(e) => setS({ ...s, defaultYear: e.target.checked ? 2 : null })} style={{ width: "auto" }} /></label>
        {s.defaultYear != null && <>{n("defaultYear", "Default in period #", 1)}{n("recovery", "Recovery (% of face)", 5, true)}</>}
      </div>
      {!p.success && <p className="text-bad text-[12px]">Invalid input: {p.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}</p>}
      {r && (
        <table>
          <tbody>
            {[["Face value (legal claim)", fmtM(r.face)], ["Cash investment (face × price × (1 + fees))", fmtM(r.cost)], ["Current yield (coupon ÷ price)", fmtPct(r.currentYield)], ["Cash interest received", fmtM(r.cashInterest)], ["Exit / recovery proceeds", fmtM(r.exitProceeds)], ["Capital gain / (loss) vs purchase price", fmtM(r.capitalGain)], ["Total cash proceeds", fmtM(r.totalProceeds)], ["Absolute profit", fmtM(r.profit)], ["MOIC", r.moic.toFixed(2) + "x"], ["IRR", fmtPct(r.irr)]].map(([l, v]) => <tr key={l}><td>{l}</td><td className="num font-semibold">{v}</td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}
