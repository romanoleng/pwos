import { NextResponse } from "next/server";
import { getResetState } from "@/lib/server/reset";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  try {
    return NextResponse.json(await getResetState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[reset]", error);
    return NextResponse.json({ error: "upstream", message: "Could not load the reset screen." }, { status: 502 });
  }
}
