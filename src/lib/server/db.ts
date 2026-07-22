/**
 * Postgres access (CLAUDE.md §2 — server-only).
 *
 * Neon's serverless driver rather than node-postgres: it talks HTTP instead of
 * holding a TCP connection, which is what a Vercel function needs. A pooled
 * `pg` client would exhaust Neon's connection limit as functions scale.
 *
 * `server-only` makes this a build error if a client component ever imports it,
 * directly or transitively — the same structural guarantee as the Airtable
 * client it replaces.
 */
import "server-only";

import { neon } from "@neondatabase/serverless";

import { MissingEnvError } from "./env";

let cached: ReturnType<typeof neon> | null = null;

function client() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new MissingEnvError("DATABASE_URL");
  cached = neon(url);
  return cached;
}

/**
 * Tagged-template query. Values are sent as parameters, never interpolated,
 * so injection is impossible by construction:
 *
 *   const rows = await sql<Row>`select * from accounts where id = ${id}`;
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return (await client()(strings, ...values)) as T[];
}

/** Postgres numerics arrive as strings to preserve precision; parse explicitly. */
export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Same, but preserves "not recorded" as null rather than flattening it to 0. */
export function moneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dates come back as Date objects; the app works in ISO yyyy-mm-dd strings. */
export function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Parameterised query with a plain SQL string, for the few places where a
 * table or column name is chosen at runtime.
 *
 * Identifiers cannot be parameters in SQL, so they are interpolated — which is
 * only safe because they come from the editable allow-list, never from the
 * client. Values are always parameters.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await client().query(text, params)) as T[];
}
