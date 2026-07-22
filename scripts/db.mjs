/**
 * Small psql-less helper for running SQL against Neon.
 *
 *   node scripts/db.mjs file db/001_schema.sql
 *   node scripts/db.mjs query "select count(*) from transactions"
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function connectionString() {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const match = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("DATABASE_URL is not set");
  return match[1].trim();
}

export async function withClient(run) {
  const client = new pg.Client({ connectionString: connectionString() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const [mode, arg] = process.argv.slice(2);

if (mode) {
  const sql = mode === "file" ? readFileSync(arg, "utf8") : arg;
  await withClient(async (client) => {
    const result = await client.query(sql);
    const results = Array.isArray(result) ? result : [result];
    for (const r of results) {
      if (r.rows?.length) console.table(r.rows);
      else if (r.command) console.log(`  ${r.command} ${r.rowCount ?? ""}`.trim());
    }
  });
}
