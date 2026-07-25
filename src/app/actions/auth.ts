"use server";

import { redirect } from "next/navigation";

import { isAuthConfigured } from "@/lib/server/env";
import {
  checkLoginLock,
  clearLoginFailures,
  formatWait,
  recordLoginFailure,
} from "@/lib/server/loginThrottle";
import { endSession, isCorrectPassword, startSession } from "@/lib/server/session";

export type SignInState = { error: string | null };

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

  // Durable, cold-start-proof lockout (lib/server/loginThrottle.ts). Checked
  // BEFORE the password is verified, so a locked-out attacker can't keep
  // testing guesses.
  const lock = await checkLoginLock();
  if (lock.locked) {
    return { error: `Too many attempts. Try again in ${formatWait(lock.retryAfterSec)}.` };
  }

  if (!isCorrectPassword(password)) {
    const { lockedSec } = await recordLoginFailure();
    return {
      error: lockedSec
        ? `Incorrect password. Too many attempts — locked for ${formatWait(lockedSec)}.`
        : "Incorrect password.",
    };
  }

  await clearLoginFailures();
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
