/**
 * Portfolio value history. Separate from /api/crypto/portfolio on purpose:
 * prices poll every 60s, but history changes at most once a day, so it would
 * be wasteful to re-read the whole Daily Crypto Report table every minute.
 */
import { NextResponse } from "next/server";

import { AirtableError } from "@/lib/server/airtable";

import { MissingEnvError } from "@/lib/server/env";
import { getPortfolioHistory } from "@/lib/server/history";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const series = await getPortfolioHistory();
    return NextResponse.json(
      { series },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.`, variable: error.variable },
        { status: 503 },
      );
    }
    console.error("[crypto/history]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load portfolio history.",
        // Upstream status only — no token, no request detail. Turns a blank
        // failure into a diagnosable one: 401 means the Airtable token is
        // being rejected, 429 means rate limiting.
        upstreamStatus: error instanceof AirtableError ? error.status : undefined,
        upstream: error instanceof AirtableError ? "airtable" : "unknown",
      },
      { status: 502 },
    );
  }
}
