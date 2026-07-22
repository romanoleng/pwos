/**
 * The only crypto data endpoint the browser talks to (CLAUDE.md §2.2).
 *
 * Already auth-gated by src/proxy.ts, which returns 401 JSON for /api/* rather
 * than redirecting to an HTML login page.
 */
import { NextResponse } from "next/server";

import { AirtableError } from "@/lib/server/airtable";

import { MissingEnvError } from "@/lib/server/env";
import { getPortfolio } from "@/lib/server/crypto";

/** Prices are live; nothing here may be prerendered or CDN-cached. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * This is the heaviest route: it pages through Holdings, reads Market Data,
 * resolves any missing CoinGecko ids, then fetches prices. On a cold start
 * from a South African client that can exceed the default serverless limit,
 * which surfaces as an empty 500 rather than a handled error.
 */
export const maxDuration = 30;

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

    // Log the full error server-side; never leak internals (which can include
    // the base id or request detail) to the browser.
    console.error("[crypto/portfolio]", error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Could not load the portfolio.",
        // Upstream status only — no token, no request detail. Turns a blank
        // failure into a diagnosable one: 401 means the Airtable token is
        // being rejected, 429 means rate limiting.
        upstreamStatus: error instanceof AirtableError ? error.status : undefined,
        upstream: error instanceof AirtableError ? "airtable" : "unknown",
      },
      { status: 502 },
    );
  }
}
