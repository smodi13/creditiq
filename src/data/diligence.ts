import type { DiligenceItem, DiligenceStatus } from "@/lib/types";

type T = Omit<DiligenceItem, "id" | "status" | "notes" | "source" | "date">;
export const TEMPLATE: T[] = [
  { category: "Financial", item: "Historical financials tied to filings", priority: "High", question: "Do model inputs reconcile to audited statements?" },
  { category: "Financial", item: "Quality of earnings / EBITDA add-backs", priority: "High", question: "How much of adjusted EBITDA is add-backs?" },
  { category: "Financial", item: "Free cash flow conversion", priority: "High", question: "What is cash conversion after capex and working capital?" },
  { category: "Financial", item: "Working capital and capex needs", priority: "Medium", question: "Are capex and working capital run-rates sustainable?" },
  { category: "Business", item: "Revenue and customer concentration", priority: "Medium", question: "Top-10 customer share and contract terms?" },
  { category: "Business", item: "Supplier concentration", priority: "Low", question: "Any single-source dependencies?" },
  { category: "Business", item: "Competitive position and management", priority: "Medium", question: "Share trend and management track record?" },
  { category: "Debt", item: "Debt documentation review", priority: "High", question: "Priming / drop-down protections and baskets?" },
  { category: "Debt", item: "Covenant package and definitions", priority: "High", question: "Covenant EBITDA definition and headroom?" },
  { category: "Debt", item: "Maturity profile and refinancing plan", priority: "High", question: "Is the refinancing plan credible at current leverage?" },
  { category: "Debt", item: "Collateral and lien perfection", priority: "Medium", question: "What assets secure the instrument?" },
  { category: "Legal", item: "Litigation and contingent liabilities", priority: "Medium", question: "Any material claims ahead of creditors?" },
  { category: "Legal", item: "Guarantees and structural subordination", priority: "Medium", question: "Which entities guarantee; any non-guarantor leakage?" },
  { category: "Asset / Real Estate", item: "Asset valuation / appraisal support", priority: "High", question: "Independent value vs assumed asset base?" },
  { category: "Commercial", item: "Industry conditions and pricing", priority: "Medium", question: "Where are we in the industry cycle?" },
  { category: "Commercial", item: "Macro and rate sensitivity", priority: "Low", question: "How does the credit behave at +300 bps?" },
];

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Demo companies get the standard checklist with deterministic, illustrative statuses. */
export function demoDiligence(id: string, hasAssets: boolean): DiligenceItem[] {
  const statuses: DiligenceStatus[] = ["Not Started", "In Progress", "Complete", "Issue Identified"];
  return TEMPLATE.filter((t) => hasAssets || t.category !== "Asset / Real Estate").map((t, i) => {
    const r = hash(id + i) % 10;
    const status = statuses[r < 3 ? 0 : r < 6 ? 1 : r < 9 ? 2 : 3];
    return { ...t, id: `${id}-dd${i + 1}`, status, notes: status === "Issue Identified" ? "Illustrative finding — to be resolved before sizing." : "Demo checklist entry (illustrative).", source: "DEMO", date: "2026-03-31" };
  });
}
