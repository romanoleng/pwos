"use server";

import { getPortfolio } from "@/lib/server/crypto";
import {
  buildSnapshotPreview,
  writeSnapshot,
  type SnapshotPreview,
} from "@/lib/server/snapshot";

export type PreviewResult =
  | { ok: true; preview: SnapshotPreview }
  | { ok: false; error: string };

export type WriteResult =
  | { ok: true; date: string; wroteSnapshots: boolean }
  | { ok: false; error: string };

/** Read-only. Builds exactly what would be written, and writes nothing. */
export async function previewSnapshot(): Promise<PreviewResult> {
  try {
    const portfolio = await getPortfolio();
    return { ok: true, preview: buildSnapshotPreview(portfolio) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Writes the snapshot.
 *
 * The portfolio is recomputed here rather than trusting a preview posted from
 * the browser — a client-supplied payload would let anything be written into
 * the ledger. The preview is for the human; this is the source of truth.
 */
export async function commitSnapshot(): Promise<WriteResult> {
  try {
    const portfolio = await getPortfolio();
    const preview = buildSnapshotPreview(portfolio);
    await writeSnapshot(preview);
    return { ok: true, date: preview.date, wroteSnapshots: preview.snapshots !== null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
