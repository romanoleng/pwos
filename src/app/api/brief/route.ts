import { NextResponse } from "next/server";

import { getDailyBrief } from "@/lib/server/brief";
import { safeDbError } from "@/lib/server/db";

export const dynamic = "force-dynamic";
/** Assembling the brief reads Home + the portfolio (CoinGecko) once a day. */
export const maxDuration = 30;

export async function GET() {
  try {
    return NextResponse.json(await getDailyBrief(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[brief]", error);
    // The brief is supplementary — the card just stays hidden on failure, so a
    // named 502 is enough without a user-facing message.
    return NextResponse.json(
      { error: "upstream", reason: safeDbError(error) },
      { status: 502 },
    );
  }
}
