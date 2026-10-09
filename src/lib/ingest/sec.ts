import { z } from "zod";
import type { SourceRef } from "@/lib/types";

// SEC fair-access policy requires a User-Agent with real contact details. Set SEC_USER_AGENT (see .env.example); without it the lookup refuses to run rather than send a placeholder identity.
const headers = () => ({ "User-Agent": process.env.SEC_USER_AGENT ?? "", Accept: "application/json" });

const TickerMap = z.record(z.string(), z.object({ cik_str: z.number(), ticker: z.string(), title: z.string() }));
const Submissions = z.object({
  name: z.string(), cik: z.string(), sicDescription: z.string().optional(), stateOfIncorporation: z.string().optional(), fiscalYearEnd: z.string().optional(),
  filings: z.object({ recent: z.object({ form: z.array(z.string()), filingDate: z.array(z.string()), reportDate: z.array(z.string()), accessionNumber: z.array(z.string()), primaryDocument: z.array(z.string()) }) }),
});
const Fact = z.object({ end: z.string(), val: z.number(), fy: z.number().nullable().optional(), fp: z.string().nullable().optional(), form: z.string(), filed: z.string(), start: z.string().optional() });
const CompanyFacts = z.object({ facts: z.record(z.string(), z.record(z.string(), z.object({ units: z.record(z.string(), z.array(Fact)) }))) });

export interface SecAnnualPoint { fy: number; end: string; value: number; filed: string; form: string; tag: string }
export interface SecResult {
  ok: boolean;
  error?: string;
  company?: { name: string; cik: string; sic?: string; ticker: string; latest10K?: { filed: string; period: string; url: string } };
  annual?: Record<string, SecAnnualPoint[]>;
  sources: SourceRef[];
}

// Concepts the model needs → ordered candidate us-gaap tags (first one with data wins).
export const CONCEPTS: Record<string, string[]> = {
  Revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
  OperatingIncome: ["OperatingIncomeLoss"],
  NetIncome: ["NetIncomeLoss"],
  InterestExpense: ["InterestExpense", "InterestExpenseNonoperating"],
  DepreciationAmortization: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
  Capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  Cash: ["CashAndCashEquivalentsAtCarryingValue"],
  LongTermDebt: ["LongTermDebt", "LongTermDebtNoncurrent"],
};

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
  return schema.parse(await res.json());
}

export function extractAnnual(facts: z.infer<typeof CompanyFacts>["facts"]): Record<string, SecAnnualPoint[]> {
  const out: Record<string, SecAnnualPoint[]> = {};
  const gaap = facts["us-gaap"] ?? {};
  for (const [concept, tags] of Object.entries(CONCEPTS)) {
    for (const tag of tags) {
      const units = gaap[tag]?.units?.USD;
      if (!units) continue;
      const byFy = new Map<number, SecAnnualPoint>();
      for (const f of units) {
        if (f.form !== "10-K" || f.fp !== "FY" || f.fy == null) continue;
        if (f.start) { // flow concepts must span ~a year
          const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
          if (days < 330 || days > 400) continue;
        }
        const prev = byFy.get(f.fy);
        if (!prev || f.filed > prev.filed) byFy.set(f.fy, { fy: f.fy, end: f.end, value: f.val / 1e6, filed: f.filed, form: f.form, tag });
      }
      if (byFy.size) { out[concept] = [...byFy.values()].sort((a, b) => a.fy - b.fy).slice(-5); break; }
    }
  }
  return out;
}

export async function fetchSec(ticker: string): Promise<SecResult> {
  const retrieved = new Date().toISOString().slice(0, 10);
  if (!process.env.SEC_USER_AGENT) return { ok: false, error: "SEC_USER_AGENT is not configured on the server (SEC fair-access policy requires contact details; see .env.example). No request was sent", sources: [] };
  try {
    const map = await getJson("https://www.sec.gov/files/company_tickers.json", TickerMap);
    const hit = Object.values(map).find((x) => x.ticker.toUpperCase() === ticker.toUpperCase());
    if (!hit) return { ok: false, error: `Ticker ${ticker} not found in SEC company_tickers.json`, sources: [] };
    const cik = String(hit.cik_str).padStart(10, "0");
    const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const [sub, facts] = await Promise.all([getJson(subUrl, Submissions), getJson(factsUrl, CompanyFacts)]);
    const r = sub.filings.recent;
    const i = r.form.findIndex((f) => f === "10-K");
    const latest10K = i >= 0 ? { filed: r.filingDate[i], period: r.reportDate[i], url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accessionNumber[i].replace(/-/g, "")}/${r.primaryDocument[i]}` } : undefined;
    const annual = extractAnnual(facts.facts);
    const sources: SourceRef[] = [
      { id: `sec-sub-${cik}`, source: "SEC EDGAR Submissions API", document: `Submissions — ${sub.name}`, url: subUrl, documentDate: r.filingDate[0] ?? retrieved, retrievedDate: retrieved, dataType: "Company metadata / filing index", isDemo: false },
      { id: `sec-facts-${cik}`, source: "SEC EDGAR Company Facts (XBRL)", document: "10-K annual facts", url: factsUrl, documentDate: latest10K?.filed ?? retrieved, retrievedDate: retrieved, dataType: "Historical financials", period: latest10K?.period, isDemo: false },
    ];
    return { ok: true, company: { name: sub.name, cik, sic: sub.sicDescription, ticker: hit.ticker, latest10K }, annual, sources };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), sources: [] };
  }
}
