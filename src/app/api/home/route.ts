import { NextResponse } from "next/server";
import { getHome } from "@/lib/server/home";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getHome(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[home]", error);
    return NextResponse.json({ error: "upstream", message: "Could not load your dashboard." }, { status: 502 });
  }
}
