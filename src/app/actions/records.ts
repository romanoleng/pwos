"use server";

import { revalidateTag } from "next/cache";

import { parseAmount } from "@/lib/amount";
import { recordType, slugify, validateRecord } from "@/lib/records";
import { ensureInstitutionColumn } from "@/lib/server/accounts";
import { query, sql } from "@/lib/server/db";
import { getZarPerUsd } from "@/lib/server/prices";

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
): Promise<MutationResult<{ recordId: string; label: string; note?: string }>> {
  const type = recordType(kind);
  if (!type) return { ok: false, error: "That kind of record can't be added here." };

  // A currency field with a unit picker may arrive in dollars (the Tangem
  // Visa's $4 float). Convert HERE, at the live rate, before validation — the
  // stored value is always ZAR. No rate, no guess: the save is refused.
  let note: string | undefined;
  for (const field of type.fields) {
    if (!field.currencyToggle) continue;
    if (input[`${field.name}__currency`] !== "USD") continue;
    const usd = parseAmount(input[field.name] as string | number | null);
    if (usd === null) continue; // blank or invalid — validateRecord decides
    const rate = await getZarPerUsd();
    if (rate === null) {
      return {
        ok: false,
        error: "Couldn't fetch a USD rate right now — enter the rand amount instead.",
      };
    }
    const zar = Math.round(usd * rate * 100) / 100;
    input[field.name] = zar;
    note = `$${usd} → R${zar.toFixed(2)} at R${rate.toFixed(2)}/$`;
  }

  const validated = validateRecord(type, input);
  if ("error" in validated) return { ok: false, error: validated.error };
  const { values } = validated;

  const label = String(values[type.labelColumn] ?? "");

  try {
    const columns = Object.keys(values);
    const params: (string | number | boolean | null)[] = columns.map((c) => values[c]);

    // accounts.id is a readable text key rather than a sequence, so it has to
    // be generated here.
    if (type.idIsText) {
      // The account fields include `institution`, a column added after the
      // first schema — make sure it exists before the insert names it.
      await ensureInstitutionColumn();
      // A transfer resolves its destination by account NAME, so two accounts
      // sharing a name (case-insensitively) would let money land in whichever
      // one happens to sort first — silently. Require distinct names; "Savings
      // (Capitec)" and "Savings (Discovery)" are both fine and clearer anyway.
      const dupLabel = await sql<{ id: string }>`
        select id from accounts where lower(label) = ${label.toLowerCase()} and not archived`;
      if (dupLabel.length > 0) {
        return {
          ok: false,
          error: `An account called "${label}" already exists. Give this one a distinct name (e.g. add the bank) so transfers can't be sent to the wrong one.`,
        };
      }

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
    return { ok: true, data: { recordId: inserted[0].id, label, note } };
  } catch (error) {
    console.error("[createRecord]", kind, error);
    const message = error instanceof Error ? error.message : "Couldn't add it.";
    if (message.includes("duplicate key")) {
      return { ok: false, error: `${label} already exists.` };
    }
    return { ok: false, error: message };
  }
}

/**
 * Rename a record's human name (its label column), app-wide (Romano's ask,
 * 2026-07-24 — "rename every savings, investment, account… everywhere").
 *
 * Same registry boundary as the rest: the client sends a KIND, never a table
 * or column. accounts.label, goals.name, debts.name, kids_accounts.account —
 * the registry knows which column carries the name for each kind.
 */
export async function renameRecord(
  kind: string,
  recordId: string,
  name: string,
): Promise<MutationResult<{ name: string }>> {
  const type = recordType(kind);
  if (!type) return { ok: false, error: "That kind of record can't be renamed here." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give it a name." };
  if (trimmed.length > 120) return { ok: false, error: "That name is too long." };

  try {
    const rows = await query<{ name: string }>(
      `update ${type.table} set ${type.labelColumn} = $1
       where id = $2${type.idIsText ? "" : "::bigint"}
       returning ${type.labelColumn} as name`,
      [trimmed, recordId],
    );
    if (rows.length === 0) return { ok: false, error: "That record no longer exists." };

    invalidate(type.invalidates);
    return { ok: true, data: { name: rows[0].name } };
  } catch (error) {
    console.error("[renameRecord]", kind, error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't rename it." };
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
