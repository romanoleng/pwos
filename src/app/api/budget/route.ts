import { NextResponse } from "next/server";

import { getBudgetSummary } from "@/lib/server/budget";
import { MissingEnvError } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getBudgetSummary(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.` },
        { status: 503 },
      );
    }
    console.error("[budget]", error);
    return NextResponse.json(
      { error: "upstream", message: "Could not load the budget." },
      { status: 502 },
    );
  }
}
