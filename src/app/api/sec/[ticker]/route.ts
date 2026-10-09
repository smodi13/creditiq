import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchSec } from "@/lib/ingest/sec";

const Ticker = z.string().regex(/^[A-Za-z.\-]{1,6}$/);

export async function GET(_: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const parsed = Ticker.safeParse(ticker);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid ticker", sources: [] }, { status: 400 });
  const result = await fetchSec(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
