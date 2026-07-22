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

/**
 * A database error's message can embed the connection string, which would put
 * the password in an HTTP response. Redact anything URL-shaped before the
 * message travels anywhere.
 */
export function safeDbError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
    .replace(/:[^:@\s]+@/g, ":[redacted]@")
    .slice(0, 200);
}

function client() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new MissingEnvError("DATABASE_URL");

  // Catch a malformed value here rather than at first query, where the error
  // is far less obvious.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid URL (length ${url.length}). Check it was pasted whole and once.`,
    );
  }
  if (!parsed.protocol.startsWith("postgres")) {
    throw new Error(`DATABASE_URL has protocol "${parsed.protocol}", expected postgresql:`);
  }

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

/**
 * Multi-statement write in ONE transaction and one round trip.
 *
 * The HTTP driver treats every sql`` call as its own transaction — a bare
 * begin/rollback pair does nothing (learned the hard way, see CLAUDE.md).
 * `neon`'s transaction() is the only atomic multi-statement path: the builder
 * receives the raw lazy tag, and the queries it returns are sent together —
 * all applied or none.
 */
export async function atomic<T = Record<string, unknown>>(
  build: (lazy: ReturnType<typeof neon>) => ReturnType<ReturnType<typeof neon>>[],
): Promise<T[][]> {
  const c = client();
  return (await c.transaction(build(c) as never)) as T[][];
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
