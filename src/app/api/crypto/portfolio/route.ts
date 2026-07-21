/**
 * The only crypto data endpoint the browser talks to (CLAUDE.md §2.2).
 *
 * Already auth-gated by src/proxy.ts, which returns 401 JSON for /api/* rather
 * than redirecting to an HTML login page.
 */
import { NextResponse } from "next/server";

import { MissingEnvError } from "@/lib/server/env";
import { getPortfolio } from "@/lib/server/crypto";

/** Prices are live; nothing here may be prerendered or CDN-cached. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const portfolio = await getPortfolio();
    return NextResponse.json(portfolio, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        {
          error: "not-configured",
          message: `${error.variable} is not set. Add it to .env.local (see .env.example) and restart the dev server.`,
          variable: error.variable,
        },
        { status: 503 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    // Log server-side; never leak internals (which can include the base id or
    // request detail) to the browser.
    console.error("[crypto/portfolio]", error);
    return NextResponse.json(
      { error: "upstream", message: "Could not load the portfolio." },
      { status: 502, statusText: message.slice(0, 120) },
    );
  }
}
