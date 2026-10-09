import { Card, ClassBadge, Pill } from "@/components/ui";
import { load } from "@/lib/page";
import type { DiligenceItem } from "@/lib/types";

const ST: Record<DiligenceItem["status"], string> = { "Not Started": "bg-slate-200 text-slate-700", "In Progress": "bg-sky-100 text-sky-800", Complete: "bg-green-100 text-green-800", "Issue Identified": "bg-red-100 text-red-800" };
const PR: Record<DiligenceItem["priority"], string> = { High: "bg-red-600 text-white", Medium: "bg-amber-500 text-white", Low: "bg-slate-300 text-slate-800" };
const CATS: DiligenceItem["category"][] = ["Financial", "Business", "Debt", "Legal", "Asset / Real Estate", "Commercial"];

export default async function Diligence({ params }: { params: Promise<{ id: string }> }) {
  const { c } = await load(params);
  const items = c.diligenceItems;
  const open = items.filter((d) => d.status !== "Complete");
  const highOpen = open.filter((d) => d.priority === "High");
  const count = (s: DiligenceItem["status"]) => items.filter((d) => d.status === s).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {([["Items", items.length], ["Complete", count("Complete")], ["In progress", count("In Progress")], ["Not started", count("Not Started")], ["Issues identified", count("Issue Identified")], ["Unresolved HIGH priority", highOpen.length]] as [string, number][]).map(([l, v]) => (
          <div key={l} className={`border border-line bg-white px-3 py-2 ${l.startsWith("Unresolved") && v ? "border-red-300 bg-red-50" : ""}`}><div className="text-[10px] uppercase text-muted">{l}</div><div className="text-xl font-semibold">{v}</div></div>
        ))}
      </div>
      <div className="text-[12px]">{c.dataClass === "public" ? <>Status reflects work actually done on this case: historical financials were verified against the filings; other items are open questions an investment team would pursue. <ClassBadge k="projection" /> notes are not facts.</> : <>Demo checklist with deterministic illustrative statuses. <ClassBadge k="demo" /></>}</div>
      {CATS.filter((cat) => items.some((d) => d.category === cat)).map((cat) => (
        <Card key={cat} title={cat}>
          <div className="overflow-x-auto"><table>
            <thead><tr><th>Item</th><th>Status</th><th>Priority</th><th>Notes / findings</th><th>Open question</th><th>Source</th><th>Date</th></tr></thead>
            <tbody>{items.filter((d) => d.category === cat).map((d) => (
              <tr key={d.id}><td className="font-medium">{d.item}</td><td><Pill cls={ST[d.status]}>{d.status}</Pill></td><td><Pill cls={PR[d.priority]}>{d.priority}</Pill></td><td className="text-[12px]">{d.notes}</td><td className="text-[12px] text-muted">{d.question}</td><td className="text-[11px]">{d.source}</td><td className="whitespace-nowrap">{d.date}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      ))}
    </div>
  );
}
