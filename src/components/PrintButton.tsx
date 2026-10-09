"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="no-print px-3 py-1.5 rounded border border-line bg-white text-[12px]">Print / Save as PDF</button>;
}
