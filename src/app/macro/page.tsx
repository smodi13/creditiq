import { Card, ClassBadge, CoLink, PageTitle } from "@/components/ui";
import { indicators } from "@/data/macro";
import { fetchFred } from "@/lib/ingest/fred";
import { companies } from "@/data/companies";
import { analyze } from "@/lib/analysis";
import { rateSensitivity } from "@/lib/sensitivities";
import { fmtM, fmtPct, fmtX } from "@/lib/format";

export const revalidate = 21600;

export default async function Macro() {
  const live = Object.fromEntries((await Promise.all(indicators.filter((i) => i.fredId).map((i) => fetchFred(i.fredId!)))).map((r) => [r.seriesId, r]));
  const rs = companies.map((c) => ({ c, s: rateSensitivity(c, analyze(c)) })).sort((a, b) => b.s.floatingShare - a.s.floatingShare);
  return (
    <div className="space-y-3">
      <PageTitle title="Macro — credit-relevant conditions" sub="Each variable answers one question: why does it matter to a credit investor, and where does it enter the model? Live FRED readings where reachable; otherwise a labelled SAMPLE." />
      <Card title="Indicators, transmission chain and model linkage">
        <div className="overflow-x-auto"><table>
          <thead><tr><th>Indicator</th><th className="num">Reading</th><th>Status</th><th>Transmission chain</th><th>Why it matters</th><th>Where it enters CreditIQ</th></tr></thead>
          <tbody>
            {indicators.map((i) => {
              const f = i.fredId ? live[i.fredId] : undefined;
              let val = i.sample, date = i.sampleDate;
              if (f?.ok) {
                if (i.transform === "yoy" && f.yearAgo) val = (f.latest!.value / f.yearAgo.value - 1) * 100;
                else val = f.latest!.value;
                date = f.latest!.date;
              }
              return (
                <tr key={i.id}><td className="font-medium">{i.label}</td><td className="num font-semibold">{val.toFixed(2)} {i.unit}</td>
                  <td>{f?.ok ? <span className="text-good font-semibold">LIVE · FRED {i.fredId} · obs {date}</span> : <span className="text-warn font-semibold">SAMPLE{f ? ` (FRED unavailable: ${f.error})` : ""}</span>}</td>
                  <td className="text-[12px] font-medium">{i.chain}</td><td className="text-[12px]">{i.matters}</td><td className="text-[12px] text-muted">{i.howUsed}</td></tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="text-[11px] text-muted mt-2">FRED public CSV endpoint (no key), cached 6 hours. SAMPLE values are placeholders, never presented as current data.</p>
      </Card>
      <Card title="Rate sensitivity: what +100 bp on SOFR does to each credit (base case, first projected period)" right={<ClassBadge k="projection" />}>
        <table>
          <thead><tr><th>Company</th><th className="num">Floating-rate share of debt</th><th className="num">Δ cash interest</th><th className="num">Δ FCF</th><th className="num">EBITDA / interest before</th><th className="num">after</th></tr></thead>
          <tbody>{rs.map(({ c, s }) => (
            <tr key={c.id}><td><CoLink id={c.id}>{c.name}</CoLink> {c.dataClass === "public" && <ClassBadge k="public" />}</td><td className="num">{fmtPct(s.floatingShare, 0)}</td><td className="num">{s.dInterest ? fmtM(s.dInterest) : "—"}</td><td className="num">{s.dFcf ? fmtM(s.dFcf) : "—"}</td><td className="num">{fmtX(s.coverageBefore, 2)}</td><td className="num">{fmtX(s.coverageAfter, 2)}</td></tr>
          ))}</tbody>
        </table>
        <p className="text-[12px] mt-2"><b>Reading it:</b> AMC Networks has no floating-rate debt, so a SOFR move changes nothing in its own coverage — its rate risk is in the <i>refinancing</i> coupon of the 2029 maturities. Brandywine’s $400M hypothetical loan is floating with a 1% floor: higher SOFR raises the lender’s coupon but lifts the borrower’s interest burden — the same move that helps the loan’s yield erodes the credit.</p>
      </Card>
    </div>
  );
}
