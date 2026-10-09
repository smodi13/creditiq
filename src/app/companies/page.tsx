import { CoLink, PageTitle, RiskBadge, Card, ClassBadge, DecisionBadge, RecBadge } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { cell } from "@/components/cell";
import { rows } from "@/lib/view";
import { fmtM, fmtX, fmtPct } from "@/lib/format";

export default function Companies() {
  const r = rows().filter((x) => x.c.dataClass === "demo");
  return (
    <div className="space-y-3">
      <PageTitle title="Demo Universe" sub="16 fictional companies (illustrative numbers) used to exercise the workflow: screen → financials → capital structure → scenarios → recovery → returns → memo. For actual SEC-filing cases see Real Underwriting Cases." />
      <div className="border border-amber-300 bg-amber-50 text-amber-900 text-[12px] px-3 py-1.5 rounded-sm"><ClassBadge k="demo" /> Companies, financials, capital structures and market marks are fictional. Nothing is sourced from a filing or a live feed.</div>
      <Card>
        <DataTable
          defaultSort="company" desc={false}
          columns={[
            { key: "company", label: "Company" }, { key: "tkr", label: "Ticker" }, { key: "sector", label: "Sector" }, { key: "industry", label: "Industry" },
            { key: "rev", label: "Revenue", num: true }, { key: "ebitda", label: "EBITDA", num: true }, { key: "nd", label: "Net debt", num: true },
            { key: "lev", label: "Net lev.", num: true }, { key: "cov", label: "EBITDA/int.", num: true }, { key: "score", label: "Score", num: true }, { key: "risk", label: "Risk" }, { key: "view", label: "Analyst view" }, { key: "dec", label: "Model decision" },
          ]}
          rows={r.map((x) => ({
            id: x.c.id,
            cells: {
              company: cell(x.c.name, <CoLink id={x.c.id}>{x.c.name}</CoLink>), tkr: cell(x.c.ticker), sector: cell(x.c.sector), industry: cell(x.c.industry),
              rev: cell(x.last.revenue, fmtM(x.last.revenue, 0)), ebitda: cell(x.last.ebitda, fmtM(x.last.ebitda, 0)), nd: cell(x.debt - x.c.cash, fmtM(x.debt - x.c.cash, 0)),
              lev: cell(x.netLev ?? 99, fmtX(x.netLev)), cov: cell(x.cov ?? 0, fmtX(x.cov, 2)), score: cell(x.a.score.total, x.a.score.total.toFixed(0)), risk: cell(x.a.score.risk, <RiskBadge r={x.a.score.risk} />),
              view: cell(x.c.status, <RecBadge r={x.c.status} />), dec: cell(x.a.recommendation.decision, <DecisionBadge d={x.a.recommendation.decision} />),
            },
          }))}
        />
      </Card>
      <p className="text-[11px] text-muted">Net leverage and coverage use FY2025A. Exp. IRR range across the universe: {fmtPct(Math.min(...r.map((x) => x.a.expected.irr ?? 0)))} to {fmtPct(Math.max(...r.map((x) => x.a.expected.irr ?? 0)))}.</p>
    </div>
  );
}
