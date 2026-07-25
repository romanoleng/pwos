"use server";

import {
  BRIEF_TONES,
  getBriefPrefs,
  writeBriefPrefs,
  type BriefPrefs,
  type BriefTone,
} from "@/lib/server/brief";

import type { MutationResult } from "./holdings";

/**
 * Update the daily-brief preferences (Romano's ask, 2026-07-25). A partial
 * patch is merged over the current prefs, then written — and today's cached
 * brief is dropped so the change shows next time Home opens (read-your-writes).
 * The browser never composes the write; the server merges from the stored
 * source (CLAUDE.md §9b).
 */
export type BriefPrefsPatch = {
  enabled?: boolean;
  tone?: BriefTone;
  include?: Partial<BriefPrefs["include"]>;
};

export async function updateBriefPrefs(
  patch: BriefPrefsPatch,
): Promise<MutationResult<BriefPrefs>> {
  try {
    if (patch.tone !== undefined && !BRIEF_TONES.includes(patch.tone)) {
      return { ok: false, error: "Unknown tone." };
    }
    const current = await getBriefPrefs();
    const next: BriefPrefs = {
      enabled: patch.enabled ?? current.enabled,
      tone: patch.tone ?? current.tone,
      include: { ...current.include, ...patch.include },
    };
    await writeBriefPrefs(next);
    return { ok: true, data: next };
  } catch (error) {
    console.error("[updateBriefPrefs]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't save." };
  }
}
