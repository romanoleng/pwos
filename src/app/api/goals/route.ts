import { NextResponse } from "next/server";

import { getGoals } from "@/lib/server/goals";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getGoals(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[goals]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load goals.",
        // Upstream status only — no token, no request detail. Turns a blank
        // failure into a diagnosable one: 401 means the Airtable token is
        // being rejected, 429 means rate limiting.
        upstream: "database",
      },
      { status: 502 },
    );
  }
}
