import Link from "next/link";
import { ClassBadge, Card } from "@/components/ui";
import { FinTable } from "@/components/FinTable";
import { ProvenanceTable, SourcePanel } from "@/components/SourcePanel";
import { load } from "@/lib/page";
import { SCENARIOS, SCENARIO_LABEL, type ScenarioKey } from "@/lib/types";

export default async function Financials({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ case?: string }> }) {
  const { c, a } = await load(params);
  const sp = (await searchParams).case;
  const sel = (SCENARIOS as string[]).includes(sp ?? "") ? (sp as ScenarioKey) : null;
  const years = sel ? [...c.history, ...a.projections[sel].years] : c.history;
  const tabs: [string, string, boolean][] = [["", "Historical", !sel], ...SCENARIOS.map((s): [string, string, boolean] => [s, SCENARIO_LABEL[s], sel === s])];
  return (
    <div className="space-y-3">
      <Card title={<span>Financial statements <ClassBadge k={c.dataClass === "public" ? "reported" : "demo"} /> {sel && <ClassBadge k="projection" />}</span>} right={
        <div className="flex gap-1 no-print">{tabs.map(([k, l, on]) => <Link key={l} href={k ? `?case=${k}` : "?"} className={`px-2 py-1 rounded text-[11px] border ${on ? "bg-navy !text-white border-navy" : "border-line !text-slate-700"}`}>{l}</Link>)}</div>
      }>
        <FinTable years={years} hist={c.history.length} historyLabels={c.history.map((h) => h.label ?? `FY${h.year}A`)} projLabels={c.periodLabels} linkProvenance={c.dataClass === "public"} />
        <p className="text-[11px] text-muted mt-2">
          {c.dataClass === "public" ? "Historical columns are calculated from reported filing inputs (click a line label to jump to its source). " : "Historical columns are fictional demo inputs. "}
          Projections flow from the selected scenario’s assumptions (Scenarios tab): interest accrues on beginning balances by tranche; floating tranches use MAX(SOFR, floor) + spread + scenario shock; PIK accrues to principal.
          FCF = net income + D&amp;A + SBC + PIK − capex − ΔNWC / other. Impairments, restructuring and other one-offs are excluded from EBITDA and net income and sit in the cash plug.
        </p>
      </Card>
      <ProvenanceTable c={c} />
      <SourcePanel sources={c.sources} />
    </div>
  );
}
