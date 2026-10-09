import Link from "next/link";
import { Card, ClassBadge, PageTitle } from "@/components/ui";
import { SecLookup } from "@/components/SecLookup";
import { SCORE_WEIGHTS, SCENARIO_PROBABILITY, RECOVERY, ALERTS, DEFAULT_THRESHOLDS, MATURITY_MATERIAL_PCT, RISK_BANDS, DISTRESS_WEIGHTS, THESIS } from "@/lib/config";

const kv = (o: object) => <table><tbody>{Object.entries(o).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{String(v)}</td></tr>)}</tbody></table>;

export default function Settings() {
  return (
    <div className="space-y-3">
      <PageTitle title="Settings & data" sub="Methodology parameters are code-level configuration (src/lib/config.ts) so every change is reviewable in git." />
      <Card title="Data classes used throughout the app">
        <table><tbody>
          <tr><td><ClassBadge k="public" /></td><td>Case built from SEC filings; every historical number traces to a datapoint (filing, accession, page / section, URL, retrieved date).</td></tr>
          <tr><td><ClassBadge k="reported" /></td><td>A figure reported in a filing. Never estimated or silently filled; unit conversions (US$ thousands → $M) are documented.</td></tr>
          <tr><td><ClassBadge k="derived" /></td><td>Calculated from reported figures by formula (e.g. LTM = FY + YTD − prior YTD; AOI / NOI build; FCF = CFO − capex).</td></tr>
          <tr><td><ClassBadge k="projection" /></td><td>Modelled forecast under a scenario.</td></tr>
          <tr><td><ClassBadge k="assumption" /> <ClassBadge k="hypo" /></td><td>Hypothetical purchase price, fees, hold, new-loan terms and covenant packages. Not real transactions; not Fortress terms.</td></tr>
          <tr><td><ClassBadge k="demo" /></td><td>Fictional demo universe.</td></tr>
        </tbody></table>
      </Card>
      <Card title="Excel ⇄ web reconciliation" right={<Link href="/settings/reconciliation" className="text-[11px]">Open →</Link>}>
        <p className="text-[12px]">Three workbooks (AMC Networks, Brandywine, Brightwater demo) are recalculated in LibreOffice and compared with the web engine on 173 metrics each, including all 105 sensitivity cells.</p>
      </Card>
      <Card title="SEC EDGAR lookup (public filings ingestion)">
        <p className="text-[12px] text-muted mb-2">Pulls company metadata, filing index and annual XBRL facts from SEC’s free APIs (validated with Zod). Set <code>SEC_USER_AGENT</code> in <code>.env.local</code> to identify yourself per SEC fair-access policy (see <code>.env.example</code>). Failures are shown here and never replaced by invented data.</p>
        <SecLookup />
      </Card>
      <div className="grid xl:grid-cols-3 gap-3">
        <Card title="Required-return thresholds (defaults; override per case)">{kv(DEFAULT_THRESHOLDS)}</Card>
        <Card title="Credit score weights (sum 100)">{kv(SCORE_WEIGHTS)}</Card>
        <Card title="Distressed Opportunity Score weights (sum 100)">{kv(DISTRESS_WEIGHTS)}</Card>
        <Card title="Scenario probabilities & recovery">{kv(SCENARIO_PROBABILITY)}<div className="mt-2">{kv(RECOVERY)}</div></Card>
        <Card title="Monitoring thresholds">{kv(ALERTS)}<div className="mt-2">{kv(THESIS)}</div></Card>
        <Card title="Maturity & risk bands">{kv({ MATURITY_MATERIAL_PCT })}<div className="mt-2">{kv(Object.fromEntries(RISK_BANDS.map((b) => [b.label, `≥ ${b.min}`])))}</div></Card>
      </div>
    </div>
  );
}
