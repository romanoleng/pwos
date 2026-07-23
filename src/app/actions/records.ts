"use server";

import { revalidateTag } from "next/cache";

import { recordType, slugify, validateRecord } from "@/lib/records";
import { query, sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Row-level changes (CLAUDE.md §9b) — add a record, retire one, put it back.
 *
 * The client sends a registry KIND ("debt"), never a table name. See
 * src/lib/records.ts for why that boundary exists.
 *
 * Removal archives rather than deletes. Rows carry history: a debt has an audit
 * trail, an account has transactions pointing at it. Archiving hides it from
 * every screen while leaving the past intact, and it can always be undone.
 */

function invalidate(tags: string[]): void {
  for (const tag of tags) revalidateTag(tag, "max");
}

export async function createRecord(
  kind: string,
  input: Record<string, unknown>,
): Promise<MutationResult<{ recordId: string; label: string }>> {
  const type = recordType(kind);
  if (!type) return { ok: false, error: "That kind of record can't be added here." };

  const validated = validateRecord(type, input);
  if ("error" in validated) return { ok: false, error: validated.error };
  const { values } = validated;

  const label = String(values[type.labelColumn] ?? "");

  try {
    const columns = Object.keys(values);
    const params: (string | number | boolean | null)[] = columns.map((c) => values[c]);

    // accounts.id is a readable text key rather than a sequence, so it has to
    // be generated here — and made unique, since two "Savings" accounts at
    // different banks are perfectly reasonable.
    if (type.idIsText) {
      let id = slugify(label);
      const clash = await sql<{ id: string }>`select id from accounts where id = ${id}`;
      if (clash.length > 0) id = `${id}-${Date.now().toString(36).slice(-4)}`;
      columns.unshift("id");
      params.unshift(id);
    }

    // Column names come from the registry, never from the client; values are
    // always parameterised.
    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
    const inserted = await query<{ id: string }>(
      `insert into ${type.table} (${columns.join(", ")})
       values (${placeholders}) returning id::text`,
      params,
    );

    invalidate(type.invalidates);
    return { ok: true, data: { recordId: inserted[0].id, label } };
  } catch (error) {
    console.error("[createRecord]", kind, error);
    const message = error instanceof Error ? error.message : "Couldn't add it.";
    if (message.includes("duplicate key")) {
      return { ok: false, error: `${label} already exists.` };
    }
    return { ok: false, error: message };
  }
}

export async function archiveRecord(
  kind: string,
  recordId: string,
): Promise<MutationResult<{ label: string }>> {
  const type = recordType(kind);
  if (!type) return { ok: false, error: "That kind of record can't be archived here." };

  try {
    const rows = await query<{ label: string }>(
      `update ${type.table} set archived = true
       where id = $1${type.idIsText ? "" : "::bigint"} and not archived
       returning ${type.labelColumn} as label`,
      [recordId],
    );
    if (rows.length === 0) return { ok: false, error: "It's already archived, or gone." };

    invalidate(type.invalidates);
    return { ok: true, data: { label: rows[0].label } };
  } catch (error) {
    console.error("[archiveRecord]", kind, error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't archive it." };
  }
}

/** Undo for the above — the row was never deleted, so this only flips the flag. */
export async function restoreRecord(
  kind: string,
  recordId: string,
): Promise<MutationResult> {
  const type = recordType(kind);
  if (!type) return { ok: false, error: "That kind of record can't be restored here." };

  try {
    await query(
      `update ${type.table} set archived = false
       where id = $1${type.idIsText ? "" : "::bigint"}`,
      [recordId],
    );
    invalidate(type.invalidates);
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreRecord]", kind, error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't restore it." };
  }
}
