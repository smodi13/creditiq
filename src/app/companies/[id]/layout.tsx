import Link from "next/link";
import { notFound } from "next/navigation";
import { companies } from "@/data/companies";
import { analyze } from "@/lib/analysis";
import { CompanyFlags, DecisionBadge } from "@/components/ui";

const TABS = [["", "Overview"], ["/case", "5-min Case"], ["/financials", "Financials"], ["/credit", "Credit & Covenants"], ["/capital-structure", "Capital Structure & Maturities"], ["/scenarios", "Scenarios"],
  ["/recovery", "Recovery"], ["/returns", "Returns"], ["/diligence", "Diligence"], ["/memo", "Memo"], ["/investment-committee", "Investment Committee"]];

export function generateStaticParams() { return companies.map((c) => ({ id: c.id })); }

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = companies.find((x) => x.id === id);
  if (!c) notFound();
  const a = analyze(c);
  return (
    <div>
      <div className="text-[11px] text-muted mb-1 no-print">
        <Link href="/dashboard">Dashboard</Link> › <Link href={c.dataClass === "public" ? "/cases" : "/companies"}>{c.dataClass === "public" ? "Real Underwriting Cases" : "Demo Universe"}</Link> › {c.name}
      </div>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="text-lg font-semibold">{c.name} <span className="text-muted font-normal">· {c.ticker}</span></h1>
        <CompanyFlags dataClass={c.dataClass} terms={c.termsLabel} />
        <DecisionBadge d={a.recommendation.decision} />
      </div>
      <nav className="flex gap-0.5 border-b border-line mb-3 no-print overflow-x-auto">
        {TABS.map(([p, l]) => <Link key={p} href={`/companies/${id}${p}`} className="px-2.5 py-1.5 text-[12px] !text-slate-700 hover:bg-white whitespace-nowrap">{l}</Link>)}
      </nav>
      {children}
    </div>
  );
}
