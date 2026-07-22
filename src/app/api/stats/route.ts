import { NextResponse, type NextRequest } from "next/server";

import { isPeriodKind } from "@/lib/period";
import { safeDbError } from "@/lib/server/db";
import { getStats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("period");
  const period = isPeriodKind(requested) ? requested : "cycle";
  try {
    return NextResponse.json(await getStats(period), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[stats]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load stats.",
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
