import { Card, ClassBadge, CoLink, DecisionBadge, PageTitle } from "@/components/ui";
import { rows } from "@/lib/view";
import { DISTRESS_FLAGS, DISTRESS_WEIGHTS } from "@/lib/config";
import { fmtPct } from "@/lib/format";

const OPP = ["recovery", "entryDiscount", "catalyst", "position", "refiEvent"];
const RISK = ["defaultSafety", "liquidity", "leverage", "coverage", "maturity", "fcf"];
const SHORT: Record<string, string> = { recovery: "Recovery", entryDiscount: "Entry disc.", catalyst: "Catalyst", position: "Position", refiEvent: "Refi event", defaultSafety: "Default risk", liquidity: "Liquidity", leverage: "Leverage", coverage: "Coverage", maturity: "Maturity", fcf: "FCF" };
const heat = (v: number) => (v >= 70 ? "bg-green-100 text-green-900" : v >= 40 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900");

export default function Opportunities() {
  const r = rows().sort((a, b) => b.a.distress.flags.length - a.a.distress.flags.length || b.a.distress.score - a.a.distress.score);
  return (
    <div className="space-y-3">
      <PageTitle title="Distressed opportunity screen" sub="Risk flags show stress. The Distressed Opportunity Score rates whether the stress is underwritable: five opportunity drivers + six safety (inverse-risk) drivers, each 0–100 with weights summing to 100. Nothing is a single unexplained number." />
      <Card title="Score drivers by company (higher = more attractive / safer)">
        <div className="overflow-x-auto"><table className="text-[11px]">
          <thead><tr><th>Company</th><th className="num">Flags</th><th className="num">Score</th><th className="num bg-emerald-50">Opportunity (60)</th>{OPP.map((k) => <th key={k} className="num bg-emerald-50">{SHORT[k]} ({DISTRESS_WEIGHTS[k as keyof typeof DISTRESS_WEIGHTS]})</th>)}<th className="num bg-sky-50">Safety (40)</th>{RISK.map((k) => <th key={k} className="num bg-sky-50">{SHORT[k]} ({DISTRESS_WEIGHTS[k as keyof typeof DISTRESS_WEIGHTS]})</th>)}<th>View</th></tr></thead>
          <tbody>{r.map((x) => {
            const d = x.a.distress; const g = (k: string) => d.drivers.find((z) => z.key === k)!;
            return (
              <tr key={x.c.id}><td className="font-medium whitespace-nowrap"><CoLink id={x.c.id}>{x.c.name}</CoLink> {x.c.dataClass === "public" && <ClassBadge k="public" />}</td><td className="num">{d.flags.length}</td><td className="num font-bold text-[13px]">{d.score.toFixed(0)}</td>
                <td className="num font-semibold">{d.opportunity.toFixed(0)}</td>{OPP.map((k) => <td key={k} className={`num ${heat(g(k).score)}`} title={g(k).detail}>{g(k).score.toFixed(0)}</td>)}
                <td className="num font-semibold">{d.safety.toFixed(0)}</td>{RISK.map((k) => <td key={k} className={`num ${heat(g(k).score)}`} title={g(k).detail}>{g(k).score.toFixed(0)}</td>)}<td><DecisionBadge d={x.a.recommendation.decision} /></td></tr>
            );
          })}</tbody>
        </table></div>
        <p className="text-[11px] text-muted mt-2">Hover a cell for its detail (e.g. “Severe-case recovery 34%”). Opportunity drivers: severe-case valuation recovery, entry discount to par, catalyst potential (analyst 0–5), capital-structure position, refinancing event. Safety drivers: 1 − P(default), liquidity ratio, net leverage, coverage, near-term maturity share, FCF / debt. Weights in <code>src/lib/config.ts</code>.</p>
      </Card>
      <Card title="Distress flags triggered">
        <table><thead><tr><th>Company</th><th>Triggered flags</th></tr></thead><tbody>
          {r.filter((x) => x.a.distress.flags.length).map((x) => <tr key={x.c.id}><td><CoLink id={x.c.id}>{x.c.name}</CoLink></td><td className="text-[12px]">{x.a.distress.flags.join(" · ")}</td></tr>)}
        </tbody></table>
        <ul className="list-disc pl-4 mt-2 text-[12px] space-y-0.5">
          <li>High leverage: net debt / EBITDA ≥ {DISTRESS_FLAGS.highLeverage}x · Low coverage: EBITDA / interest &lt; {DISTRESS_FLAGS.lowCoverage}x</li>
          <li>Near-term maturity: ≥ {fmtPct(DISTRESS_FLAGS.nearTermMaturityPct, 0)} of debt due within {DISTRESS_FLAGS.nearTermYears} periods · Declining EBITDA ≤ {fmtPct(DISTRESS_FLAGS.ebitdaDecline, 0)} YoY · Negative FCF</li>
          <li>Debt discount: mark below {DISTRESS_FLAGS.priceDiscount} · Recovery ≥ {DISTRESS_FLAGS.recoveryToPrice}x price in the severe case. ≥ 3 flags = distressed situation.</li>
        </ul>
      </Card>
    </div>
  );
}
