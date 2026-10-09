import type { ReactNode } from "react";
import Link from "next/link";
import type { Recommendation } from "@/lib/types";

const REC: Record<Recommendation, string> = {
  Attractive: "bg-green-100 text-green-800",
  Watch: "bg-amber-100 text-amber-800",
  Avoid: "bg-red-100 text-red-800",
  "Distressed Opportunity": "bg-violet-100 text-violet-800",
  "Requires Further Diligence": "bg-sky-100 text-sky-800",
};
const RISK: Record<string, string> = { Low: "bg-green-100 text-green-800", Moderate: "bg-lime-100 text-lime-800", Elevated: "bg-amber-100 text-amber-800", High: "bg-red-100 text-red-800" };

export const Pill = ({ children, cls }: { children: ReactNode; cls: string }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>
);
export const RecBadge = ({ r }: { r: Recommendation }) => <Pill cls={REC[r]}>{r}</Pill>;
export const RiskBadge = ({ r }: { r: string }) => <Pill cls={RISK[r] ?? "bg-slate-100"}>{r}</Pill>;

export const Card = ({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`bg-panel border border-line rounded-sm ${className}`}>
    {title && (
      <header className="flex flex-wrap items-center justify-between gap-1 px-3 py-2 border-b border-line">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        {right}
      </header>
    )}
    <div className="p-3">{children}</div>
  </section>
);

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn" }) => (
  <div className="bg-panel border border-line rounded-sm px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
    <div className={`text-xl font-semibold ${tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : ""}`}>{value}</div>
    {sub && <div className="text-[11px] text-muted">{sub}</div>}
  </div>
);

export const PageTitle = ({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) => (
  <div className="flex items-end justify-between mb-3">
    <div>
      <h1 className="text-lg font-semibold">{title}</h1>
      {sub && <p className="text-muted text-[12px]">{sub}</p>}
    </div>
    {right}
  </div>
);

export type ClassKind = "public" | "demo" | "hypo" | "assumption" | "projection" | "reported" | "derived";
const CLASS: Record<ClassKind, [string, string, string]> = {
  public: ["PUBLIC DATA CASE", "bg-emerald-700 text-white", "Built from SEC filings; every historical number traces to a datapoint"],
  demo: ["DEMO DATA", "bg-amber-500 text-white", "Fictional, illustrative figures"],
  hypo: ["HYPOTHETICAL INVESTMENT TERMS", "bg-indigo-700 text-white", "Not a real transaction; terms are the analyst's assumptions"],
  assumption: ["UNDERWRITING ASSUMPTION", "bg-indigo-100 text-indigo-800", "Hypothetical term or judgment chosen by the analyst"],
  projection: ["ANALYST PROJECTION", "bg-sky-100 text-sky-800", "Modelled forecast, not reported"],
  reported: ["PUBLIC FILING", "bg-emerald-100 text-emerald-800", "Reported in an SEC filing"],
  derived: ["CALCULATED", "bg-slate-200 text-slate-700", "Formula-derived from reported figures"],
};
export const ClassBadge = ({ k, className = "" }: { k: ClassKind; className?: string }) => (
  <span title={CLASS[k][2]} className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap ${CLASS[k][1]} ${className}`}>{CLASS[k][0]}</span>
);
export const CompanyFlags = ({ dataClass, terms }: { dataClass: "public" | "demo"; terms: string }) => (
  <span className="inline-flex gap-1 flex-wrap"><ClassBadge k={dataClass} /><ClassBadge k={terms.startsWith("HYPO") ? "hypo" : "assumption"} /></span>
);

const DEC: Record<string, string> = { PROCEED: "bg-emerald-600 text-white", HOLD: "bg-amber-500 text-white", PASS: "bg-red-600 text-white" };
export const DecisionBadge = ({ d, big }: { d: string; big?: boolean }) => <span className={`inline-block rounded-sm font-bold tracking-wide ${big ? "px-3 py-1.5 text-base" : "px-1.5 py-0.5 text-[11px]"} ${DEC[d] ?? "bg-slate-500 text-white"}`}>{d}</span>;
export const StatusPill = ({ s }: { s: string }) => {
  const good = ["PASS", "OK", "ON TRACK", "REFINANCING PASS", "Low"].includes(s), bad = ["BREACH", "FAIL", "THESIS DETERIORATION", "REFINANCING FAILURE", "High", "BELOW THESIS", "HIGH"].includes(s);
  return <Pill cls={good ? "bg-green-100 text-green-800" : bad ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>{s}</Pill>;
};
export const SevPill = ({ s }: { s: string }) => <Pill cls={s === "HIGH" ? "bg-red-600 text-white" : s === "MEDIUM" ? "bg-amber-500 text-white" : "bg-slate-300 text-slate-800"}>{s}</Pill>;

export const DemoNote = ({ children }: { children?: ReactNode }) => (
  <div className="border border-amber-300 bg-amber-50 text-amber-900 text-[12px] px-3 py-1.5 rounded-sm mb-3">
    <b>DEMO DATA.</b> {children ?? "Companies, financials, capital structures and market marks are fictional and illustrative. Nothing here is sourced from a filing or a live market feed."}
  </div>
);

export const CoLink = ({ id, children }: { id: string; children: ReactNode }) => (
  <Link href={`/companies/${id}`} className="font-medium hover:underline">{children}</Link>
);

export const tone = (v: number | null, good: number, bad: number, higherBetter: boolean): string => {
  if (v == null) return "";
  const g = higherBetter ? v >= good : v <= good;
  const b = higherBetter ? v <= bad : v >= bad;
  return g ? "text-good" : b ? "text-bad" : "text-warn";
};
