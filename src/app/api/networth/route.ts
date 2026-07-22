import { NextResponse } from "next/server";

import { AirtableError } from "@/lib/server/airtable";
import { getNetWorth } from "@/lib/server/networth";
export const dynamic = "force-dynamic";
/** Reads several Airtable tables; needs more than the default cold-start budget. */
export const maxDuration = 30;
export async function GET() {
  try {
    return NextResponse.json(await getNetWorth(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[networth]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load net worth.",
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
