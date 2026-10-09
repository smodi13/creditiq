"use client";
import { useMemo, useState, type ReactNode } from "react";

export interface Col { key: string; label: string; num?: boolean }
export interface Row { id: string; cells: Record<string, { sort: string | number; node: ReactNode }> }

export function DataTable({ columns, rows, filterable = true, defaultSort, desc = true }: { columns: Col[]; rows: Row[]; filterable?: boolean; defaultSort?: string; desc?: boolean }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(defaultSort ? { key: defaultSort, desc } : null);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    let r = rows;
    if (q) r = r.filter((x) => Object.values(x.cells).some((c) => String(c.sort).toLowerCase().includes(q.toLowerCase())));
    if (sort) {
      r = [...r].sort((a, b) => {
        const x = a.cells[sort.key].sort, y = b.cells[sort.key].sort;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort.desc ? -c : c;
      });
    }
    return r;
  }, [rows, sort, q]);
  return (
    <div>
      {filterable && <input aria-label="Filter" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 !w-48 text-left no-print" />}
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`cursor-pointer select-none ${c.num ? "num" : ""}`} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: true }))}>
                  {c.label}{sort?.key === c.key ? (sort.desc ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? "num" : ""}>{r.cells[c.key].node}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
