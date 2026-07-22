import { NextResponse } from "next/server";

import { getCutover } from "@/lib/server/cutover";
import { safeDbError } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cutover = await getCutover();
    return NextResponse.json(
      { cutoverDate: cutover.date, showingHistory: cutover.showingHistory },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[cutover]", error);
    return NextResponse.json(
      { error: "upstream", message: "Could not load.", reason: safeDbError(error) },
      { status: 502 },
    );
  }
}
