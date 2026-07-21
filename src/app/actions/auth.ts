"use server";

import { redirect } from "next/navigation";

import { isAuthConfigured } from "@/lib/server/env";
import { endSession, isCorrectPassword, startSession } from "@/lib/server/session";

export type SignInState = { error: string | null };

/** Crude but effective throttle for a single-user app on one server instance. */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function throttled(): boolean {
  const key = "single-user";
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return false;
  }
  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

function clearThrottle(): void {
  attempts.delete("single-user");
}

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!isAuthConfigured()) {
    return {
      error: "Auth is not configured. Set AUTH_SECRET and APP_PASSWORD in .env.local.",
    };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Enter your password." };
  }

  if (throttled()) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  if (!isCorrectPassword(password)) {
    return { error: "Incorrect password." };
  }

  clearThrottle();
  await startSession();

  const nextRaw = formData.get("next");
  // Only ever redirect to our own paths — never to an attacker-supplied host.
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/";

  redirect(next);
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
