import { NextResponse } from "next/server";

import { getHome } from "@/lib/server/home";
export const dynamic = "force-dynamic";
/** Reads several Airtable tables; needs more than the default cold-start budget. */
export const maxDuration = 30;
export async function GET() {
  try {
    return NextResponse.json(await getHome(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[home]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load your dashboard.",
        // Upstream status only — no token, no request detail. Turns a blank
        // failure into a diagnosable one: 401 means the Airtable token is
        // being rejected, 429 means rate limiting.
        upstream: "database",
      },
      { status: 502 },
    );
  }
}
