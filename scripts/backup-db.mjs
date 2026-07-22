/**
 * Full Postgres backup to a JSON file (CLAUDE.md §10).
 *
 * The Airtable backup script no longer covers anything that matters — Neon has
 * been the source of truth since the migration. Before any destructive change,
 * this writes every table to a timestamped file that can be restored from.
 *
 *   node --env-file=.env.local scripts/backup-db.mjs
 */
import { neon } from "@neondatabase/serverless";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sql = neon(process.env.DATABASE_URL);

const TABLES = [
  "accounts", "account_aliases", "assets", "audit_log", "budgets", "categories",
  "cycle_anchors", "cycle_plans", "debts", "goals", "holdings", "kids_accounts",
  "portfolio_snapshots", "transactions",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.cwd(), "backups", "postgres");
mkdirSync(dir, { recursive: true });

const dump = { takenAt: new Date().toISOString(), tables: {} };
let total = 0;

for (const table of TABLES) {
  // Table names come from the constant above, never from input.
  const rows = await sql.query(`select * from ${table}`);
  dump.tables[table] = rows;
  total += rows.length;
  console.log(`  ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows`);
}

const file = join(dir, `pwos-${stamp}.json`);
writeFileSync(file, JSON.stringify(dump, null, 1));
console.log(`\n${total} rows -> ${file}`);
