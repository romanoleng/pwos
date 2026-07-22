"use server";

import { isCorrectPassword } from "@/lib/server/session";

import type { MutationResult } from "./holdings";

/**
 * Gate on revealing hidden values (privacy mode).
 *
 * Hiding is one tap; revealing proves it's Romano. The app password is reused
 * rather than a new PIN: no second secret to store, remember, or forget —
 * and if he ever can't reveal, signing in again is the same proof.
 *
 * Same constant-time comparison the login uses.
 */
export async function confirmReveal(password: string): Promise<MutationResult> {
  if (!password) return { ok: false, error: "Type your password." };
  if (!isCorrectPassword(password)) {
    return { ok: false, error: "That's not it." };
  }
  return { ok: true, data: undefined };
}
