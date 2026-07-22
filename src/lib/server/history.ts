/** Portfolio value history (CLAUDE.md §5) — now a first-class table. */
import "server-only";

import type { HistoryPoint } from "@/lib/crypto/history";

import { money, sql } from "./db";

export async function getPortfolioHistory(): Promise<HistoryPoint[]> {
  const rows = await sql<{
    snapshot_on: string; value_zar: string; invested_zar: string;
    pnl_zar: string; freedom_pct: string | null;
  }>`select snapshot_on::text, value_zar, invested_zar, pnl_zar, freedom_pct
     from portfolio_snapshots order by snapshot_on`;

  return rows.map((r) => {
    const date = String(r.snapshot_on).slice(0, 10);
    return {
      date,
      t: Date.parse(`${date}T00:00:00Z`),
      valueZar: money(r.value_zar),
      investedZar: money(r.invested_zar),
      pnlZar: money(r.pnl_zar),
      freedomProgressPct: money(r.freedom_pct),
    };
  });
}
