import { NextResponse, type NextRequest } from "next/server";

import { isPeriodKind } from "@/lib/period";
import { safeDbError } from "@/lib/server/db";

import { getHome } from "@/lib/server/home";
export const dynamic = "force-dynamic";
/** Reads several tables; needs more than the default cold-start budget. */
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  // Validated against the allow-list, so a hand-edited URL can't ask for a
  // range the app never defined.
  const requested = request.nextUrl.searchParams.get("period");
  const period = isPeriodKind(requested) ? requested : "cycle";
  try {
    return NextResponse.json(await getHome(period), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[home]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load your dashboard.",
        // The reason, with any connection string redacted. A blank failure
        // costs far more to diagnose than a named one.
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
