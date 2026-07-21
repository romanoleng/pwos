import { NextResponse } from "next/server";
import { getDebtSummary } from "@/lib/server/debt";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getDebtSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[debt]", error);
    return NextResponse.json({ error: "upstream", message: "Could not load debts." }, { status: 502 });
  }
}
