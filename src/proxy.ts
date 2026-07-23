/**
 * Auth gate (CLAUDE.md §2.3) — "auth-gate every route".
 *
 * In Next 16 `middleware` was renamed to `proxy` and pinned to the Node
 * runtime. Everything is closed by default; the allow-list below is the only
 * way through. New routes are therefore private automatically — a new page can
 * never be accidentally public because someone forgot to add a guard.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";

/** The only paths reachable without a session. */
const PUBLIC_PATHS = new Set(["/login", "/setup"]);

/** Endpoints the login form itself needs, plus PWA files the OS fetches cold. */
const PUBLIC_PREFIXES = ["/_next/", "/icons/"];
const PUBLIC_FILES = new Set([
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/robots.txt",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Vercel Cron is not a browser: it authenticates with the CRON_SECRET
  // bearer header, never a session cookie. Only the snapshot endpoint, only
  // with the exact secret, and a missing secret closes the lane entirely.
  if (pathname === "/api/cron/snapshot") {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  // Signed in but sitting on /login — bounce to wherever they were headed.
  if (session && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (isPublic(pathname) || session) {
    return NextResponse.next();
  }

  // API routes get a 401, not an HTML redirect — a fetch should fail loudly
  // rather than silently resolve with a login page body.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }

  const response = NextResponse.redirect(loginUrl);
  // Clear a stale/tampered cookie so the user isn't stuck in a redirect loop.
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  /**
   * Runs on everything except Next's own static output and image optimiser.
   * Without this negative match the gate would block CSS and JS and the login
   * page would render unstyled.
   */
  matcher: ["/((?!_next/static|_next/image).*)"],
};
