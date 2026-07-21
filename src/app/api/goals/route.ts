import { NextResponse } from "next/server";
import { getGoals } from "@/lib/server/goals";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getGoals(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[goals]", error);
    return NextResponse.json({ error: "upstream", message: "Could not load goals." }, { status: 502 });
  }
}
