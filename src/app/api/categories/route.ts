import { NextResponse } from "next/server";

import { getCategories } from "@/lib/server/categories";
import { safeDbError } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { categories: await getCategories() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[categories]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load categories.",
        upstream: "database",
        reason: safeDbError(error),
      },
      { status: 502 },
    );
  }
}
