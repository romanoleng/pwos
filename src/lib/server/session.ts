/**
 * Single-user session (CLAUDE.md §2.3).
 *
 * A signed, httpOnly JWT cookie. No NextAuth: for one user with one password
 * that is a large dependency and a large attack surface for no benefit.
 *
 * Next 16 runs `proxy.ts` on the Node runtime, so `jose` and `node:crypto` are
 * both available at the gate — no edge-compatibility contortions needed.
 */
import "server-only";

import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { env } from "./env";

export const SESSION_COOKIE = "pwos_session";

/** 30 days. It's a private single-user app on a personal device. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const ISSUER = "pwos";
const AUDIENCE = "pwos-app";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export type SessionPayload = {
  /** Only ever one subject — kept so the shape stays extensible. */
  sub: string;
  iat: number;
  exp: number;
};

export async function createSessionToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("romano")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE_SECONDS)
    .sign(secretKey());
}

/** Returns null on any failure — expired, tampered, wrong issuer, malformed. */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (!payload.sub || !payload.iat || !payload.exp) return null;
    return { sub: payload.sub, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function startSession(): Promise<void> {
  const token = await createSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Reads and verifies the session in a Server Component / Server Action. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Constant-time password check. Length is compared separately because
 * timingSafeEqual throws on unequal buffer lengths — the length leak is
 * unavoidable and harmless here.
 */
export function isCorrectPassword(candidate: string): boolean {
  const expected = Buffer.from(env.appPassword, "utf8");
  const actual = Buffer.from(candidate, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
