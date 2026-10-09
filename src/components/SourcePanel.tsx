import type { Company, DataPoint, SourceRef } from "@/lib/types";
import { ClassBadge } from "./ui";

export function SourcePanel({ sources, label = "Sources & data lineage", open = false }: { sources: SourceRef[]; label?: string; open?: boolean }) {
  return (
    <details open={open} className="bg-panel border border-line rounded-sm no-print">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-slate-700">{label} ({sources.length})</summary>
      <div className="p-3 overflow-x-auto">
        <table>
          <thead><tr><th>Source</th><th>Document</th><th>Data type</th><th>Period</th><th>Accession</th><th>Doc date</th><th>Retrieved</th><th>Class</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.source}</td>
                <td>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.document}</a> : s.document}</td>
                <td>{s.dataType}</td><td>{s.period ?? "—"}</td><td className="font-mono text-[10px]">{s.accession ?? "—"}</td><td>{s.documentDate}</td><td>{s.retrievedDate}</td>
                <td>{s.isDemo ? <ClassBadge k="demo" /> : <ClassBadge k="reported" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Per-datapoint provenance: which filing, page / section and URL each reported number came from, and which standardized line it feeds. */
export function ProvenanceTable({ c }: { c: Company }) {
  if (c.dataClass !== "public" || !c.historicalSpec) return null;
  const spec = c.historicalSpec;
  const byMetric = new Map<string, DataPoint[]>();
  for (const p of c.provenance) byMetric.set(p.metric, [...(byMetric.get(p.metric) ?? []), p]);
  const lineOf = (key: string) => Object.entries(spec.lines).filter(([, parts]) => parts.some(([k]) => k === key)).map(([l, parts]) => `${l} (${parts.find(([k]) => k === key)![1] > 0 ? "+" : "−"})`).join(", ") || "memo / check";
  const keys = spec.inputs.map((i) => i.key).filter((k) => byMetric.has(k));
  const debt = [...byMetric.keys()].filter((k) => !keys.includes(k));
  return (
    <div className="bg-panel border border-line rounded-sm" id="provenance">
      <header className="flex items-center justify-between px-3 py-2 border-b border-line"><h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">Provenance: reported inputs → standardized lines <ClassBadge k="reported" /></h2></header>
      <div className="p-3 overflow-x-auto text-[11px]">
        <p className="text-muted mb-2">Each blue input in the Excel Historical tab is one row below. Values are US$ millions (filing reports US$ thousands; ÷1000). “Calculated” lines are formulas over these inputs, never typed numbers.</p>
        <table>
          <thead><tr><th>Metric</th><th>Feeds line</th><th>Period</th><th className="num">US$M</th><th>Filing</th><th>Page / section</th><th>Raw text</th><th>Source</th></tr></thead>
          <tbody>
            {[...keys, ...debt].flatMap((k) => (byMetric.get(k) ?? []).map((p, i) => (
              <tr key={p.id} id={i === 0 ? `prov-${k}` : undefined}>
                <td className="font-medium">{i === 0 ? k : ""}</td><td>{i === 0 ? lineOf(k) : ""}</td><td>{p.period}</td><td className="num">{p.value == null ? "—" : p.value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 })}</td>
                <td>{p.filing}</td><td>{p.page ? `p. ${p.page} · ` : ""}{p.section}</td><td className="font-mono text-[10px]">{p.rawText.length > 38 ? p.rawText.slice(0, 38) + "…" : p.rawText}</td>
                <td><a href={p.url} target="_blank" rel="noreferrer">SEC ↗</a></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
