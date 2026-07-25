"use server";

import {
  beginEnrollment,
  confirmEnrollment,
  disableTwoFactor as disable,
  type EnrollmentStart,
} from "@/lib/server/twofactor";

import type { MutationResult } from "./holdings";

/**
 * Two-factor setup, driven from Settings (Romano's ask, 2026-07-26). These run
 * only for the signed-in user (the whole app is behind the auth gate), and the
 * browser never sees the stored secret after setup — the QR and backup codes
 * are returned once, here, and never again.
 */

export async function startTwoFactorSetup(): Promise<MutationResult<EnrollmentStart>> {
  try {
    return { ok: true, data: await beginEnrollment() };
  } catch (error) {
    console.error("[twofactor] start failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't start setup." };
  }
}

export async function confirmTwoFactorSetup(code: string): Promise<MutationResult> {
  try {
    const ok = await confirmEnrollment(code.trim());
    if (!ok) {
      return { ok: false, error: "That code didn't match. Check your app's time is correct and try the current code." };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[twofactor] confirm failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't turn it on." };
  }
}

export async function disableTwoFactor(code: string): Promise<MutationResult> {
  try {
    const ok = await disable(code.trim());
    if (!ok) {
      return { ok: false, error: "That code didn't match, so two-factor is still on." };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[twofactor] disable failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't turn it off." };
  }
}
