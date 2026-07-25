import { NextResponse } from "next/server";

import { safeDbError } from "@/lib/server/db";
import { backupCodesRemaining, twoFactorEnabled } from "@/lib/server/twofactor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const enabled = await twoFactorEnabled();
    const backupRemaining = enabled ? await backupCodesRemaining() : 0;
    return NextResponse.json({ enabled, backupRemaining }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[twofactor/status]", error);
    return NextResponse.json({ error: "upstream", reason: safeDbError(error) }, { status: 502 });
  }
}
