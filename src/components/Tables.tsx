import type { CovenantResult } from "@/lib/finance/covenants";
import type { RefiEvent } from "@/lib/finance/projection";
import type { Covenant, Company } from "@/lib/types";
import type { ThesisAssessment } from "@/lib/finance/alerts";
import type { Evidence } from "@/lib/analysis";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { ClassBadge, SevPill, StatusPill } from "./ui";

const cfmt = (type: Covenant["type"], v: number | null) => (v == null ? "n/m" : type === "maxLTV" || type === "maxSecuredLTV" ? fmtPct(v, 1) : type === "minLiquidity" || type === "minEBITDA" ? fmtM(v, 0) : fmtX(v, 2));

export function CovenantTable({ c, results }: { c: Company; results: CovenantResult[] }) {
  return (
    <div className="space-y-3">
      {results.map((r) => (
        <div key={r.covenant.id} className="overflow-x-auto">
          <div className="font-medium mb-1">{r.covenant.label} <ClassBadge k={r.covenant.basis === "disclosed" ? "reported" : "assumption"} className="ml-1" /> <span className="text-muted text-[11px]">{r.covenant.basis === "disclosed" ? "DISCLOSED (issuer documents) — tested on a model-basis proxy" : "HYPOTHETICAL — underwriting assumption"}</span></div>
          <table>
            <thead><tr><th></th>{c.periodLabels.map((l) => <th key={l} className="num">{l}</th>)}</tr></thead>
            <tbody>
              <tr><td>Current metric</td>{r.tests.map((t) => <td key={t.year} className="num">{cfmt(r.covenant.type, t.metric)}</td>)}</tr>
              <tr><td>Covenant</td>{r.tests.map((t) => <td key={t.year} className="num text-muted">{r.covenant.type.startsWith("min") ? "≥ " : "≤ "}{cfmt(r.covenant.type, t.threshold)}</td>)}</tr>
              <tr><td>Headroom</td>{r.tests.map((t) => <td key={t.year} className={`num ${t.status === "BREACH" ? "text-bad font-semibold" : ""}`}>{t.headroom == null ? "n/m" : (t.headroom >= 0 ? "" : "−") + cfmt(r.covenant.type, Math.abs(t.headroom))}{t.headroomPct != null && <span className="text-muted text-[10px]"> ({(t.headroomPct * 100).toFixed(0)}%)</span>}</td>)}</tr>
              <tr><td>Status</td>{r.tests.map((t) => <td key={t.year} className="num"><StatusPill s={t.status} /></td>)}</tr>
            </tbody>
          </table>
        </div>
      ))}
      {results.length === 0 && <p className="text-muted">No active covenants.</p>}
    </div>
  );
}

export function RefiTable({ c, events }: { c: Company; events: RefiEvent[] }) {
  if (!events.length) return <p className="text-muted text-[12px]">No tranche matures inside the five-period horizon in this scenario.</p>;
  const name = (id: string) => c.tranches.find((t) => t.id === id)?.name ?? id;
  return (
    <div className="overflow-x-auto">
      <table>
        <thead><tr><th>Tranche</th><th>Matures</th><th className="num">Balance at maturity</th><th className="num">Cash on hand</th><th className="num">Net lev. (test ≤)</th><th className="num">Pro-forma coverage (test ≥)</th><th className="num">Refi rate</th><th className="num">Interest burden after</th><th>Result</th><th>Resolution</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.trancheId + e.year}>
              <td className="font-medium">{name(e.trancheId)}</td><td>{c.periodLabels[e.year - c.baseYear - 1]}</td><td className="num">{fmtM(e.balanceAtMaturity)}</td><td className="num">{fmtM(e.beginCash, 0)}</td>
              <td className="num">{fmtX(e.netLeverage)} ({fmtX(e.maxNetLeverage)})</td><td className="num">{fmtX(e.coverage, 2)} ({fmtX(e.minCoverage, 2)})</td><td className="num">{fmtPct(e.refiRate)}</td><td className="num">{e.passes ? fmtM(e.interestAfter) : "—"}</td>
              <td><StatusPill s={e.passes ? "REFINANCING PASS" : "REFINANCING FAILURE"} /></td>
              <td className={e.resolution.includes("default") ? "text-bad font-semibold" : ""}>{e.resolution}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ThesisTable({ t }: { t: ThesisAssessment }) {
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center gap-2"><span className="text-[12px] font-semibold">Thesis status</span><StatusPill s={t.status} /></div>
      <table>
        <thead><tr><th>Metric</th><th className="num">Plan at entry</th><th className="num">Actual (filings)</th><th className="num">Gap</th><th>Status</th><th>Severity</th></tr></thead>
        <tbody>{t.rows.map((r) => <tr key={r.metric}><td>{r.metric}</td><td className="num">{r.plan}</td><td className="num">{r.actual}</td><td className="num">{r.gap}</td><td><StatusPill s={r.status} /></td><td>{r.severity ? <SevPill s={r.severity} /> : "—"}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function EvidenceList({ ev }: { ev: Evidence[] }) {
  return (
    <table>
      <thead><tr><th></th><th>Test</th><th className="num">Actual</th><th className="num">Required</th><th>Weight</th></tr></thead>
      <tbody>{ev.map((e) => <tr key={e.key}><td className={e.pass ? "text-good font-bold" : "text-bad font-bold"}>{e.pass ? "✓" : "✗"}</td><td>{e.label}</td><td className="num">{e.actual}</td><td className="num text-muted">{e.required}</td><td className="text-[11px] text-muted">{e.core ? "core" : "secondary"}</td></tr>)}</tbody>
    </table>
  );
}
