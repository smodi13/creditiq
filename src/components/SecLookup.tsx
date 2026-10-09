"use client";
import { useState } from "react";
import type { SecResult } from "@/lib/ingest/sec";

export function SecLookup() {
  const [t, setT] = useState("");
  const [res, setRes] = useState<SecResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { setRes(await (await fetch(`/api/sec/${encodeURIComponent(t.trim())}`)).json()); }
    catch (e) { setRes({ ok: false, error: String(e), sources: [] }); }
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2"><input value={t} onChange={(e) => setT(e.target.value)} placeholder="Ticker e.g. AAPL" className="!w-40 text-left" aria-label="Ticker" />
        <button disabled={!t || busy} onClick={go} className="px-3 py-1 rounded border border-line bg-white disabled:opacity-50">{busy ? "Fetching…" : "Fetch from SEC EDGAR"}</button></div>
      {res && !res.ok && <div className="border border-red-300 bg-red-50 text-red-900 px-3 py-1.5 rounded-sm text-[12px]">SEC fetch failed: {res.error}. No data was substituted; the demo dataset remains in use.</div>}
      {res?.ok && res.company && (
        <div className="text-[12px] space-y-2">
          <div><b>{res.company.name}</b> · CIK {res.company.cik} · {res.company.sic ?? "SIC n/a"} · latest 10-K filed {res.company.latest10K?.filed} (period {res.company.latest10K?.period}) <a href={res.company.latest10K?.url} target="_blank" rel="noreferrer">filing ↗</a></div>
          <table><thead><tr><th>Concept ($M)</th><th>XBRL tag</th>{[0, 1, 2, 3, 4].map((i) => <th key={i} className="num">FY−{4 - i}</th>)}</tr></thead><tbody>
            {Object.entries(res.annual ?? {}).map(([k, pts]) => <tr key={k}><td>{k}</td><td className="text-muted">{pts[0].tag}</td>{pts.map((p) => <td key={p.fy} className="num" title={`FY${p.fy} · filed ${p.filed} · ${p.form}`}>{p.value.toFixed(0)}</td>)}</tr>)}
          </tbody></table>
          <ul className="text-muted">{res.sources.map((s) => <li key={s.id}>{s.source}: <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a> · retrieved {s.retrievedDate}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
