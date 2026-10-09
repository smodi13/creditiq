import { Card, CompanyFlags, DecisionBadge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { load } from "@/lib/page";
import { narrative } from "@/lib/narrative";

const Sec = ({ k, title, children }: { k: string; title: string; children: React.ReactNode }) => (
  <section className="memo-section grid grid-cols-[110px_1fr] gap-3 py-2.5 border-b border-line last:border-0">
    <div><div className="text-[10px] uppercase tracking-wide text-muted">{k}</div><div className="font-semibold">{title}</div></div>
    <div className="text-[13px] leading-relaxed">{children}</div>
  </section>
);

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { c, a } = await load(params);
  const n = narrative(c, a);
  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex items-start justify-between">
        <div><div className="text-[11px] uppercase tracking-wide text-muted">Five-minute case summary</div><h2 className="text-xl font-semibold">{c.name}{c.caseTitle ? ` — ${c.caseTitle}` : ""}</h2><div className="mt-1"><CompanyFlags dataClass={c.dataClass} terms={c.termsLabel} /></div></div>
        <div className="text-right"><DecisionBadge d={a.recommendation.decision} big /><div className="mt-1"><PrintButton /></div></div>
      </div>
      <Card>
        <Sec k="1" title="The opportunity">{n.opportunity}</Sec>
        <Sec k="2" title="The question">{n.question}</Sec>
        <Sec k="3" title="The thesis">{n.thesis}</Sec>
        <Sec k="4" title="The risk (what causes loss)"><ul className="list-disc pl-4 space-y-1">{n.risks.slice(0, 4).map((r) => <li key={r.text}>{r.text}</li>)}</ul></Sec>
        <Sec k="5" title="The protection"><ul className="list-disc pl-4 space-y-1">{n.protections.slice(0, 4).map((r) => <li key={r.text}>{r.text}</li>)}</ul></Sec>
        <Sec k="6" title="The base case">{n.base}</Sec>
        <Sec k="7" title="The downside">{n.downside}</Sec>
        <Sec k="8" title="The recovery">{n.recoveryText}</Sec>
        <Sec k="9" title="The decision"><b>{a.recommendation.decision}.</b> {n.decisionText}</Sec>
      </Card>
      <p className="text-[11px] text-muted">Generated from the structured model (no free-text generation beyond the analyst’s thesis and risk lists). Hypothetical terms are underwriting assumptions; nothing here is a real transaction.</p>
    </div>
  );
}
