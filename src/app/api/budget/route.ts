import { NextResponse } from "next/server";

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
        // Upstream status only — no token, no request detail. Turns a blank
        // failure into a diagnosable one: 401 means the Airtable token is
        // being rejected, 429 means rate limiting.
        upstream: "database",
      },
      { status: 502 },
    );
  }
}
