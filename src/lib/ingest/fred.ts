import { z } from "zod";

export const FredPoint = z.object({ date: z.string(), value: z.number() });
export type FredPoint = z.infer<typeof FredPoint>;
export interface FredResult { ok: boolean; seriesId: string; latest?: FredPoint; yearAgo?: FredPoint; url: string; retrieved: string; error?: string }

/** Latest (and ~12-month-earlier) observation from FRED's public CSV endpoint (no API key). Never throws; returns {ok:false,error} on failure. */
export async function fetchFred(seriesId: string, timeoutMs = 5000): Promise<FredResult> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const retrieved = new Date().toISOString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), next: { revalidate: 21600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.text()).trim().split("\n").slice(1).map((l) => l.split(",")).filter(([, v]) => v && v !== ".");
    const pts = rows.map(([date, v]) => FredPoint.safeParse({ date, value: Number(v) })).filter((p) => p.success).map((p) => p.data!);
    if (!pts.length) throw new Error("no valid observations");
    const latest = pts[pts.length - 1];
    const target = new Date(latest.date).getTime() - 365 * 86400000;
    const yearAgo = [...pts].reverse().find((p) => new Date(p.date).getTime() <= target);
    return { ok: true, seriesId, latest, yearAgo, url, retrieved };
  } catch (e) {
    return { ok: false, seriesId, url, retrieved, error: e instanceof Error ? e.message : String(e) };
  }
}
