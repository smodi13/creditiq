import type { FinancialYear } from "@/lib/types";
import { fmtM, fmtPct } from "@/lib/format";

const LINES: { key: keyof FinancialYear | "ebitdaM" | "growth" | "gm"; label: string; bold?: boolean; src?: string }[] = [
  { key: "revenue", label: "Revenue", bold: true, src: "revenue" },
  { key: "growth", label: "  % growth" },
  { key: "cogs", label: "Direct costs / COGS", src: "cogs" },
  { key: "grossProfit", label: "Gross profit (NOI for real estate)", bold: true },
  { key: "gm", label: "  % margin" },
  { key: "opex", label: "Operating expenses (cash, adjusted)", src: "opexAdj" },
  { key: "ebitda", label: "EBITDA (company-adjusted basis)", bold: true },
  { key: "ebitdaM", label: "  % margin" },
  { key: "da", label: "D&A", src: "da" },
  { key: "sbc", label: "Share-based compensation", src: "sbc" },
  { key: "ebit", label: "EBIT", bold: true },
  { key: "interest", label: "Interest expense", src: "interest" },
  { key: "ebt", label: "EBT", bold: true },
  { key: "taxes", label: "Taxes", src: "taxes" },
  { key: "netIncome", label: "Net income (model basis)", bold: true },
  { key: "capex", label: "Capex", src: "capex" },
  { key: "deltaNwc", label: "Working capital & other cash items" },
  { key: "fcf", label: "Free cash flow", bold: true, src: "cfo" },
];

export function FinTable({ years, hist = 0, historyLabels, projLabels, linkProvenance = false }: { years: FinancialYear[]; hist?: number; historyLabels: string[]; projLabels: string[]; linkProvenance?: boolean }) {
  const val = (y: FinancialYear, i: number, k: string): string => {
    if (k === "growth") return i === 0 || i >= hist ? (i === 0 ? "" : fmtPct(y.revenue / years[i - 1].revenue - 1)) : y.isLtm ? "" : fmtPct(y.revenue / years[i - 1].revenue - 1);
    if (k === "gm") return fmtPct(y.grossProfit / y.revenue);
    if (k === "ebitdaM") return fmtPct(y.ebitda / y.revenue);
    return fmtM(y[k as keyof FinancialYear] as number, 1);
  };
  const head = (i: number) => (i < hist ? historyLabels[i] : projLabels[i - hist]);
  return (
    <div className="overflow-x-auto">
      <table>
        <thead><tr><th>$M</th>{years.map((y, i) => <th key={i} className={`num ${y.isLtm ? "bg-slate-200" : ""}`}>{head(i)}</th>)}</tr></thead>
        <tbody>
          {LINES.map((l) => (
            <tr key={l.label} className={l.bold ? "font-semibold" : "text-slate-600"}>
              <td className="whitespace-pre">{l.label}{linkProvenance && l.src && <a href="#provenance" className="no-print ml-1 text-[10px] align-super" title="Show sources for this line">ⓘ</a>}</td>
              {years.map((y, i) => <td key={i} className={`num ${y.isLtm ? "bg-slate-50" : ""}`}>{val(y, i, l.key)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
