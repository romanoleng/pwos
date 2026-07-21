import { NextResponse } from "next/server";

import { getAccounts } from "@/lib/server/accounts";
import { MissingEnvError } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getAccounts(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "not-configured", message: `${error.variable} is not set.`, variable: error.variable },
        { status: 503 },
      );
    }
    console.error("[accounts]", error);
    return NextResponse.json(
      { error: "upstream", message: "Could not load accounts." },
      { status: 502 },
    );
  }
}
