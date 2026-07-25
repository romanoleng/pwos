import { NextResponse } from "next/server";

import { getBriefPrefs } from "@/lib/server/brief";
import { safeDbError } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getBriefPrefs(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[brief/prefs]", error);
    return NextResponse.json(
      { error: "upstream", reason: safeDbError(error) },
      { status: 502 },
    );
  }
}
