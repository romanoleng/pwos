import { NextResponse } from "next/server";

import { safeDbError } from "@/lib/server/db";

import { getDebtSummary } from "@/lib/server/debt";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getDebtSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[debt]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load debts.",
        // The reason, with any connection string redacted. A blank failure
        // costs far more to diagnose than a named one.
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
