import { NextResponse } from "next/server";

import { safeDbError } from "@/lib/server/db";

import { getReports } from "@/lib/server/reports";
export const dynamic = "force-dynamic";
/** Reads several Airtable tables; needs more than the default cold-start budget. */
export const maxDuration = 30;
export async function GET() {
  try {
    return NextResponse.json(await getReports(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[reports]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not build reports.",
        // The reason, with any connection string redacted. A blank failure
        // costs far more to diagnose than a named one.
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
