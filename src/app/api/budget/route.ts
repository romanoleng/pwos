import { NextResponse } from "next/server";

import { safeDbError } from "@/lib/server/db";

import { getBudgetSummary } from "@/lib/server/budget";
import { MissingEnvError } from "@/lib/server/env";

export const dynamic = "force-dynamic";
/** Reads several Airtable tables; needs more than the default cold-start budget. */
export const maxDuration = 30;

export async function GET() {
  try {
    return NextResponse.json(await getBudgetSummary(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.` },
        { status: 503 },
      );
    }
    console.error("[budget]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load the budget.",
        // The reason, with any connection string redacted. A blank failure
        // costs far more to diagnose than a named one.
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
