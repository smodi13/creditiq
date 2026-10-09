import type { SensTable } from "@/lib/sensitivities";
import { SCENARIO_LABEL, SCENARIOS } from "@/lib/types";
import { fmtPct } from "@/lib/format";

const axisFmt = (t: SensTable, v: number) => (t.axisFmt === "px" ? v.toFixed(1) : t.axisFmt === "x" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}x` : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`);
const cellFmt = (t: SensTable, v: number) => (t.kind === "moic" ? `${v.toFixed(2)}x` : fmtPct(v));

/** Heat-mapped: green = at/above the hurdle (or ≥100% recovery / ≥1.0x), amber = positive but below, red = loss. */
export function SensTables({ tables, hurdle }: { tables: SensTable[]; hurdle: number }) {
  const tone = (t: SensTable, v: number) => {
    if (t.kind === "irr") return v >= hurdle ? "bg-green-100 text-green-900" : v >= 0 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900";
    if (t.kind === "recovery") return v >= 0.9999 ? "bg-green-100 text-green-900" : v >= 0.6 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900";
    return v >= 1.1 ? "bg-green-100 text-green-900" : v >= 1 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900";
  };
  return (
    <div className="grid xl:grid-cols-2 gap-4">
      {tables.map((t, ti) => (
        <div key={t.key}>
          <h3 className="font-semibold mb-1">Sensitivity {ti + 1} — {t.title}</h3>
          <table>
            <thead><tr><th>{t.axisLabel}</th>{SCENARIOS.map((s) => <th key={s} className="num">{SCENARIO_LABEL[s]}</th>)}</tr></thead>
            <tbody>
              {t.axis.map((v, i) => (
                <tr key={i}><td className={`font-medium ${(t.key === "price" && i === 2) || (t.axisFmt !== "px" && v === 0) ? "bg-slate-100" : ""}`}>{axisFmt(t, v)}</td>
                  {SCENARIOS.map((s, j) => <td key={s} className={`num ${tone(t, t.cells[i][j])}`}>{cellFmt(t, t.cells[i][j])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="xl:col-span-2 text-[11px] text-muted">Green ≥ hurdle IRR ({fmtPct(hurdle, 0)}) · amber = positive but below hurdle · red = loss (recovery table: green = full recovery, amber ≥ 60%). Every cell is the same calculation as the Excel Sensitivities tab; margin, growth, rate and multiple tables re-run the entire model (statements → debt → default → recovery → returns).</p>
    </div>
  );
}
