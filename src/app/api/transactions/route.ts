import { NextResponse } from "next/server";

import { MissingEnvError } from "@/lib/server/env";
import { getTransactions } from "@/lib/server/transactions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { transactions: await getTransactions() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.` },
        { status: 503 },
      );
    }
    console.error("[transactions]", error);
    return NextResponse.json(
      { error: "upstream", message: "Could not load transactions." },
      { status: 502 },
    );
  }
}
