import type { DataPoint, FinancialYear } from "@/lib/types";
import { statement } from "@/lib/finance/projection";

export interface DpFile { case: string; documents: Record<string, { company: string; form: string; period: string; filed: string; acc: string; url: string }>; datapoints: DataPoint[]; disclosures: DataPoint[] }

export function lookup(file: DpFile) {
  const used = new Map<string, DataPoint>();
  const find = (metric: string, period: string) => {
    const p = file.datapoints.find((x) => x.metric === metric && x.period === period);
    if (!p || p.value == null) throw new Error(`missing datapoint ${file.case}.${metric}.${period}`);
    used.set(p.id, p);
    return p.value;
  };
  const opt = (metric: string, period: string) => (file.datapoints.some((x) => x.metric === metric && x.period === period) ? find(metric, period) : 0);
  const disclosure = (metric: string) => {
    const d = file.disclosures.find((x) => x.metric === metric);
    if (!d) throw new Error(`missing disclosure ${metric}`);
    used.set(d.id, d);
    return d;
  };
  return { v: find, o: opt, disclosure, provenance: () => [...used.values()] };
}

export interface StdLines { revenue: number; cogs: number; opexAdj: number; da: number; sbc: number; interest: number; taxes: number; capex: number; cfo: number }

/** Build a FinancialYear from standardized reported lines. FCF = CFO − capex (reported); ΔNWC & other is the derived plug that closes the bridge. */
export function realYear(year: number, label: string, s: StdLines, isLtm = false): FinancialYear {
  const ebitda = s.revenue - s.cogs - s.opexAdj;
  const fcf = s.cfo - s.capex;
  const first = statement({ year, label, isLtm, revenue: s.revenue, cogs: s.cogs, ebitda, da: s.da, sbc: s.sbc, interest: s.interest, capex: s.capex, deltaNwc: 0, taxes: s.taxes, fcfOverride: fcf });
  const plug = first.netIncome + s.da + s.sbc - s.capex - fcf;
  return { ...first, deltaNwc: plug };
}
export const ltmOf = (fy: StdLines, h1new: StdLines, h1old: StdLines): StdLines => {
  const k = Object.keys(fy) as (keyof StdLines)[];
  return Object.fromEntries(k.map((x) => [x, fy[x] + h1new[x] - h1old[x]])) as unknown as StdLines;
};
