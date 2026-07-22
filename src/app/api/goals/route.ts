import { NextResponse } from "next/server";

import { safeDbError } from "@/lib/server/db";

import { getGoals } from "@/lib/server/goals";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getGoals(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[goals]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load goals.",
        // The reason, with any connection string redacted. A blank failure
        // costs far more to diagnose than a named one.
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
