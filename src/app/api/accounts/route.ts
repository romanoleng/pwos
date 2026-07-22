import { NextResponse } from "next/server";

import { AirtableError } from "@/lib/server/airtable";

import { getAccounts } from "@/lib/server/accounts";
import { MissingEnvError } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getAccounts(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.`, variable: error.variable },
        { status: 503 },
      );
    }
    console.error("[accounts]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load accounts.",
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
