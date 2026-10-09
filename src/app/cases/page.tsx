import Link from "next/link";
import { Card, ClassBadge, CompanyFlags, DecisionBadge, PageTitle } from "@/components/ui";
import { realCases } from "@/data/real";
import { analyze } from "@/lib/analysis";
import { fmtM, fmtPct, fmtX } from "@/lib/format";
import { metric } from "@/lib/finance/metrics";

export default function Cases() {
  return (
    <div className="space-y-3">
      <PageTitle title="Real Underwriting Cases" sub="Public-company credit underwriting case studies using actual SEC filings and HYPOTHETICAL investment assumptions. Distinct from the fictional Demo Universe." />
      <div className="border border-emerald-300 bg-emerald-50 text-emerald-900 text-[12px] px-3 py-2 rounded-sm">
        <b>PUBLIC DATA CASE.</b> Historical figures are reported in the cited filings (10-K FY2025, 10-Q Q2-2026) and traced to a page / section and URL. Forecasts are <ClassBadge k="projection" />; purchase price, fees, hold and any covenant marked hypothetical are <ClassBadge k="assumption" />.
        Nothing here is a real transaction, a real Fortress investment or Fortress terms.
      </div>
      <div className="grid xl:grid-cols-2 gap-3">
        {realCases.map((c) => {
          const a = analyze(c);
          const t = c.tranches.find((x) => x.id === c.target.trancheId)!;
          return (
            <Card key={c.id} title={<span>{c.name} <span className="font-normal text-muted">· {c.ticker}</span></span>} right={<DecisionBadge d={a.recommendation.decision} />}>
              <div className="mb-2"><CompanyFlags dataClass={c.dataClass} terms={c.termsLabel} /></div>
              <p className="font-semibold mb-1">{c.caseTitle}</p>
              <p className="text-[12px] text-muted mb-2">{c.description}</p>
              <table><tbody>
                <tr><td className="text-muted">Hypothetical instrument</td><td className="num">{t.name} · face ${c.target.face}M @ {t.price?.toFixed(1)}</td></tr>
                <tr><td className="text-muted">Base / Downside / Severe IRR</td><td className="num">{fmtPct(a.returns.base.irr)} / {fmtPct(a.returns.downside.irr)} / {fmtPct(a.returns.severe.irr)}</td></tr>
                <tr><td className="text-muted">Probability-weighted IRR (expected cash flows) vs hurdle</td><td className="num">{fmtPct(a.expected.irr)} vs {fmtPct(c.thresholds.hurdleIrr)}</td></tr>
                <tr><td className="text-muted">Valuation recovery: downside / severe</td><td className="num">{fmtPct(a.recovery.downside.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct, 0)} / {fmtPct(a.recovery.severe.waterfall.rows.find((r) => r.id === t.id)?.recoveryPct, 0)}</td></tr>
                <tr><td className="text-muted">Net leverage · EBITDA / interest ({c.baseLabel})</td><td className="num">{fmtX(metric(a.metrics, "netLev"))} · {fmtX(metric(a.metrics, "ebitdaInt"))}</td></tr>
                <tr><td className="text-muted">Total debt · credit score</td><td className="num">{fmtM(c.tranches.reduce((s, x) => s + x.principal, 0), 0)} · {a.score.total.toFixed(0)}/100</td></tr>
              </tbody></table>
              <div className="mt-3 flex gap-3 text-[12px]">
                <Link href={`/companies/${c.id}/case`} className="font-semibold">5-minute case →</Link>
                <Link href={`/companies/${c.id}/investment-committee`} className="font-semibold">Investment committee →</Link>
                <Link href={`/companies/${c.id}`}>Full underwriting →</Link>
              </div>
            </Card>
          );
        })}
      </div>
      <Card title="Why these two cases">
        <ul className="list-disc pl-4 space-y-1 text-[12.5px]">
          <li><b>AMC Networks (corporate credit):</b> screened against Rackspace, Advantage Solutions, Xerox, Cable One and others on disclosure quality. AMC discloses every instrument, call schedule, covenant ratio and refinancing step; credit is genuinely contested — AOI fell 46% in H1-2026 while the company termed out its 2029 secured notes into 2032 and terminated its revolver. Real question: is a ~12% yield on a first-lien secured note adequate when collateral is a shrinking content library?</li>
          <li><b>Brandywine Realty Trust (real-estate credit):</b> screened against Orion, Hudson Pacific, Franklin Street, Douglas Emmett. Brandywine reports NOI, a full debt schedule with per-tranche rates, a $2B unsecured stack, specific covenant tests and an $849M 2027 maturity. Real question: can a lender take a first lien on a pool of properties at ~30% LTV and be paid enough while the corporate credit (1.7x coverage, 9.8x net debt/EBITDA) refinances into higher rates?</li>
        </ul>
      </Card>
    </div>
  );
}
