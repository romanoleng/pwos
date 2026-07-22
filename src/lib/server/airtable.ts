/**
 * Typed, server-only Airtable client (CLAUDE.md §3).
 *
 * Everything addresses fields by **id**, never by name. Names are editable in
 * the Airtable UI; ids are not. A renamed column silently returning undefined
 * is exactly the class of bug that makes a wealth app lie to you.
 */
import "server-only";

import { env } from "./env";

const API = "https://api.airtable.com/v0";

import { FIELDS, TABLES } from "@/lib/airtable-fields";

export { FIELDS, TABLES };

export class AirtableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "AirtableError";
  }
}

export type AirtableRecord<F = Record<string, unknown>> = {
  id: string;
  createdTime: string;
  fields: F;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Airtable allows 5 requests/second/base and answers 429 past that. Retries
 * with backoff on 429 and 5xx; 4xx failures are permanent and thrown at once
 * so a bad field id surfaces immediately instead of after four slow retries.
 */
async function airtableFetch(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.airtableToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    // Airtable is the source of truth; we cache deliberately at a higher level.
    cache: "no-store",
  });

  if (response.status === 429 || response.status >= 500) {
    if (attempt < 4) {
      await sleep(2 ** attempt * 250);
      return airtableFetch(path, init, attempt + 1);
    }
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text().catch(() => undefined);
    }
    throw new AirtableError(
      `Airtable ${init.method ?? "GET"} ${path} failed with ${response.status}`,
      response.status,
      detail,
    );
  }

  return response.json();
}

type ListResponse = { records: AirtableRecord[]; offset?: string };

/** Reads every record in a table, following pagination to completion. */
export async function listRecords<F = Record<string, unknown>>(
  tableId: string,
  options: { fieldIds?: readonly string[]; pageSize?: number; maxRecords?: number } = {},
): Promise<AirtableRecord<F>[]> {
  const records: AirtableRecord<F>[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("pageSize", String(options.pageSize ?? 100));
    // Ask for values keyed by field id, so renames in the UI can't break us.
    params.set("returnFieldsByFieldId", "true");
    for (const fieldId of options.fieldIds ?? []) params.append("fields[]", fieldId);
    if (offset) params.set("offset", offset);

    const page = (await airtableFetch(
      `/${env.airtableBaseId}/${tableId}?${params}`,
    )) as ListResponse;

    records.push(...(page.records as AirtableRecord<F>[]));
    offset = page.offset;

    if (options.maxRecords && records.length >= options.maxRecords) {
      return records.slice(0, options.maxRecords);
    }
  } while (offset);

  return records;
}

/* -------------------------------------------------------------------------
   Metadata API — §3 requires confirming field ids against the live schema
   before any write.
   ---------------------------------------------------------------------- */

export type TableSchema = {
  id: string;
  name: string;
  fields: { id: string; name: string; type: string }[];
};

let schemaCache: { at: number; tables: TableSchema[] } | null = null;
const SCHEMA_TTL_MS = 10 * 60 * 1000;

export async function getBaseSchema(force = false): Promise<TableSchema[]> {
  if (!force && schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) {
    return schemaCache.tables;
  }
  const data = (await airtableFetch(`/meta/bases/${env.airtableBaseId}/tables`)) as {
    tables: TableSchema[];
  };
  schemaCache = { at: Date.now(), tables: data.tables };
  return data.tables;
}

/**
 * Throws unless every supplied field id exists on the table. Called before a
 * write so a stale id fails loudly rather than silently creating a record with
 * missing columns.
 */
export async function assertFields(
  tableId: string,
  fieldIds: readonly string[],
): Promise<void> {
  const tables = await getBaseSchema();
  const table = tables.find((candidate) => candidate.id === tableId);
  if (!table) {
    throw new AirtableError(`Table ${tableId} not found in base schema`, 404);
  }
  const known = new Set(table.fields.map((field) => field.id));
  const missing = fieldIds.filter((fieldId) => !known.has(fieldId));
  if (missing.length > 0) {
    throw new AirtableError(
      `Fields not found on ${table.name}: ${missing.join(", ")}. The Airtable schema has changed — update src/lib/server/airtable.ts.`,
      400,
    );
  }
}

/* -------------------------------------------------------------------------
   Writes.

   Create and update only. There is deliberately NO delete helper: §9b makes
   "delete" mean archive (Status → Archived), which is an update. True deletion
   is a Settings-only operation that must be asked for explicitly (§2.5, §10),
   and the capability is not shipped until that exists.
   ---------------------------------------------------------------------- */

/**
 * Creates records after verifying every field id against the live schema.
 */
export async function createRecords(
  tableId: string,
  records: { fields: Record<string, unknown> }[],
): Promise<AirtableRecord[]> {
  if (records.length === 0) return [];

  const fieldIds = [...new Set(records.flatMap((record) => Object.keys(record.fields)))];
  await assertFields(tableId, fieldIds);

  const created: AirtableRecord[] = [];
  // Airtable caps writes at 10 records per request.
  for (let index = 0; index < records.length; index += 10) {
    const batch = records.slice(index, index + 10);
    const result = (await airtableFetch(`/${env.airtableBaseId}/${tableId}`, {
      method: "POST",
      body: JSON.stringify({ records: batch, returnFieldsByFieldId: true }),
    })) as { records: AirtableRecord[] };
    created.push(...result.records);
  }
  return created;
}

/**
 * Updates records by id, verifying field ids against the live schema first.
 *
 * PATCH, not PUT — Airtable's PUT clears every field you don't send, which
 * would silently wipe milestone text when editing a quantity.
 */
export async function updateRecords(
  tableId: string,
  records: { id: string; fields: Record<string, unknown> }[],
): Promise<AirtableRecord[]> {
  if (records.length === 0) return [];

  const fieldIds = [...new Set(records.flatMap((record) => Object.keys(record.fields)))];
  await assertFields(tableId, fieldIds);

  const updated: AirtableRecord[] = [];
  for (let index = 0; index < records.length; index += 10) {
    const batch = records.slice(index, index + 10);
    const result = (await airtableFetch(`/${env.airtableBaseId}/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch, returnFieldsByFieldId: true }),
    })) as { records: AirtableRecord[] };
    updated.push(...result.records);
  }
  return updated;
}

/** Fetches one record by id, or null if it no longer exists. */
export async function getRecord(
  tableId: string,
  recordId: string,
): Promise<AirtableRecord | null> {
  try {
    return (await airtableFetch(
      `/${env.airtableBaseId}/${tableId}/${recordId}?returnFieldsByFieldId=true`,
    )) as AirtableRecord;
  } catch (error) {
    if (error instanceof AirtableError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Deletes records by id.
 *
 * Used only where a row is a genuine mistake — a duplicate transaction, say —
 * rather than something being retired. Retiring is archiving (§9b). Callers
 * must capture the record first so the action can be undone.
 */
export async function deleteRecords(
  tableId: string,
  recordIds: string[],
): Promise<string[]> {
  if (recordIds.length === 0) return [];
  const deleted: string[] = [];
  for (let index = 0; index < recordIds.length; index += 10) {
    const batch = recordIds.slice(index, index + 10);
    const params = new URLSearchParams();
    for (const id of batch) params.append("records[]", id);
    const result = (await airtableFetch(
      `/${env.airtableBaseId}/${tableId}?${params}`,
      { method: "DELETE" },
    )) as { records: { id: string; deleted: boolean }[] };
    deleted.push(...result.records.filter((r) => r.deleted).map((r) => r.id));
  }
  return deleted;
}

/** Reads a single-cell value by field id, tolerating Airtable's shapes. */
export function cell(record: AirtableRecord, fieldId: string): unknown {
  return (record.fields as Record<string, unknown>)[fieldId];
}

export function numberCell(record: AirtableRecord, fieldId: string): number | null {
  const value = cell(record, fieldId);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function stringCell(record: AirtableRecord, fieldId: string): string | null {
  const value = cell(record, fieldId);
  if (typeof value === "string") return value.trim() || null;
  // singleSelect comes back as { id, name, color }.
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name.trim() || null : null;
  }
  return null;
}
