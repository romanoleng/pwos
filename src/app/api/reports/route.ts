import { NextResponse } from "next/server";
import { getReports } from "@/lib/server/reports";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getReports(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[reports]", error);
    return NextResponse.json({ error: "upstream", message: "Could not build reports." }, { status: 502 });
  }
}
