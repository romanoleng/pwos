import { NextResponse } from "next/server";

import { MissingEnvError } from "@/lib/server/env";
import { getTransactions } from "@/lib/server/transactions";

export const dynamic = "force-dynamic";
/** Reads several Airtable tables; needs more than the default cold-start budget. */
export const maxDuration = 30;

export async function GET() {
  try {
    return NextResponse.json(
      { transactions: await getTransactions() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.` },
        { status: 503 },
      );
    }
    console.error("[transactions]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load transactions.",
        // Upstream status only — no token, no request detail. Turns a blank
        // failure into a diagnosable one: 401 means the Airtable token is
        // being rejected, 429 means rate limiting.
        upstream: "database",
      },
      { status: 502 },
    );
  }
}
