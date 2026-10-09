// DEMO positions. Prior-period snapshots are illustrative inputs used to exercise the alert rules.
import type { Snapshot } from "@/lib/finance/alerts";

export type ThesisStatus = "On track" | "Under review" | "Impaired";
export interface Position {
  companyId: string;
  trancheId: string;
  face: number; // $M held
  entryPrice: number;
  entryDate: string;
  thesis: string;
  thesisStatus: ThesisStatus;
  latestUpdate: string;
  updateDate: string;
  prior: Snapshot;
}

export const positions: Position[] = [
  { companyId: "halcyon", trancheId: "sn", face: 25, entryPrice: 97.5, entryDate: "2025-06-30", thesis: "Pull-to-par on defensive med-tech notes", thesisStatus: "On track", latestUpdate: "Q1 results in line; recall reserve unchanged.", updateDate: "2026-03-20",
    prior: { netLeverage: 2.1, interestCoverage: 5.5, liquidity: 470, ebitda: 330, recoveryPct: 100 } },
  { companyId: "summit", trancheId: "sn", face: 20, entryPrice: 96, entryDate: "2025-09-30", thesis: "Refinancing-driven pull-to-par on 2028 notes", thesisStatus: "Under review", latestUpdate: "No refi launched; chlor-alkali pricing softer.", updateDate: "2026-03-12",
    prior: { netLeverage: 3.9, interestCoverage: 3.4, liquidity: 460, ebitda: 405, recoveryPct: 74 } },
  { companyId: "atlas", trancheId: "tl", face: 30, entryPrice: 98, entryDate: "2025-03-31", thesis: "Short-dated term loan, refinancing expected H2-26", thesisStatus: "Under review", latestUpdate: "Freight volumes down; revolver draw increased.", updateDate: "2026-03-05",
    prior: { netLeverage: 3.8, interestCoverage: 3.6, liquidity: 340, ebitda: 338, recoveryPct: 100 } },
  { companyId: "evergreen", trancheId: "tl", face: 15, entryPrice: 95, entryDate: "2025-09-30", thesis: "Discounted first-lien in growing practice platform", thesisStatus: "Impaired", latestUpdate: "Payer rate cuts hit Q1 margin; covenant headroom thin.", updateDate: "2026-03-18",
    prior: { netLeverage: 5.2, interestCoverage: 2.4, liquidity: 220, ebitda: 281, recoveryPct: 90 } },
  { companyId: "redwood", trancheId: "2l", face: 20, entryPrice: 84, entryDate: "2025-06-30", thesis: "Fulcrum-security entry in asset-rich cable/fiber", thesisStatus: "Under review", latestUpdate: "Sub losses accelerating; fiber sale process launched.", updateDate: "2026-03-25",
    prior: { netLeverage: 6.2, interestCoverage: 1.9, liquidity: 460, ebitda: 620, recoveryPct: 90 } },
  { companyId: "orchard", trancheId: "sub", face: 15, entryPrice: 95, entryDate: "2025-12-31", thesis: "Carry trade on subordinated notes", thesisStatus: "On track", latestUpdate: "Cost savings program on schedule.", updateDate: "2026-02-27",
    prior: { netLeverage: 4.4, interestCoverage: 3.0, liquidity: 165, ebitda: 480, recoveryPct: 40 } },
];
