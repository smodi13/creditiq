import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "CreditIQ — Credit Underwriting Platform", icons: { icon: "data:," }, description: "Credit research, underwriting, recovery and portfolio monitoring for private credit and special situations." };

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/cases", "Real Underwriting Cases"],
  ["/companies", "Demo Universe"],
  ["/opportunities", "Distressed Screen"],
  ["/portfolio", "Portfolio"],
  ["/macro", "Macro"],
  ["/settings", "Settings & Data"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col md:flex-row min-h-screen">
        <aside className="w-full md:w-52 shrink-0 bg-navy text-slate-200 p-3 flex flex-row flex-wrap md:flex-col gap-1 items-center md:items-stretch">
          <div className="text-white font-semibold text-[15px] tracking-wide mb-1">CreditIQ</div>
          <div className="text-[10px] text-slate-400 mb-3 leading-snug">Credit underwriting & monitoring · private credit / special situations</div>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="!text-slate-200 hover:bg-white/10 rounded px-2 py-1.5">{label}</Link>
          ))}
          <div className="mt-auto text-[10px] text-slate-400 leading-snug">Public cases: SEC filings through the 2026-06-30 10-Qs (retrieved 2026-10-07). Demo universe: fictional, as of 2026-03-31. Illustrative; not investment advice and not a Fortress process.</div>
        </aside>
        <main className="flex-1 min-w-0 p-4">{children}</main>
      </body>
    </html>
  );
}
