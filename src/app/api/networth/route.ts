import { NextResponse } from "next/server";
import { getNetWorth } from "@/lib/server/networth";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getNetWorth(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[networth]", error);
    return NextResponse.json({ error: "upstream", message: "Could not load net worth." }, { status: 502 });
  }
}
