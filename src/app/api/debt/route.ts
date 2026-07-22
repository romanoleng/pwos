import { NextResponse } from "next/server";

import { AirtableError } from "@/lib/server/airtable";
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
