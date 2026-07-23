import { NextResponse } from "next/server";

import { getPortfolio } from "@/lib/server/crypto";
import { buildSnapshotPreview, writeSnapshot } from "@/lib/server/snapshot";

/**
 * Daily snapshot, unattended (CLAUDE.md §5 — "button + optional Vercel cron").
 *
 * The 60d/90d change windows on the Crypto header are built from these rows,
 * so the history has to accrue without anyone remembering a button. The write
 * is the same idempotent one-row-per-day upsert the button uses — re-running
 * a day replaces it, never duplicates.
 *
 * Auth is the CRON_SECRET bearer check in proxy.ts, not a session. The one
 * judgement call the button leaves to a human is made conservatively here:
 * known-stale prices are NOT recorded — a silently wrong daily figure is
 * worse than a one-day gap, and the ±15-day window tolerance absorbs gaps.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const portfolio = await getPortfolio();

    if (portfolio.meta.staleReason) {
      return NextResponse.json({
        skipped: true,
        reason: `prices stale: ${portfolio.meta.staleReason}`,
      });
    }

    const preview = buildSnapshotPreview(portfolio);
    await writeSnapshot(preview);

    return NextResponse.json({
      written: preview.date,
      valueZar: portfolio.totals.valueZar,
      warnings: preview.warnings,
    });
  } catch (error) {
    console.error("[cron/snapshot]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "snapshot failed" },
      { status: 500 },
    );
  }
}
