/**
 * Airtable backup (CLAUDE.md §10 — never lose the data).
 *
 * Exports every table to JSON in the repo, so financial history lives in git
 * rather than in one Airtable account. Run: npm run backup
 *
 * Two outputs, on purpose:
 *   backups/latest/<table>.json      overwritten each run — diffs cleanly in git,
 *                                    so a commit shows exactly what changed
 *   backups/snapshots/<date>.json    one immutable file per run — restore point
 *
 * Storage-agnostic: still correct after any migration off Airtable, and it is
 * what makes such a migration safe to attempt.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].trim();
    }
  } catch {
    // Fall through to process.env — lets this run in CI without a local file.
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const TOKEN = env.AIRTABLE_TOKEN;
const BASE = env.AIRTABLE_BASE_ID || "appL4V6tbsGRJ7WxQ";

if (!TOKEN) {
  console.error("AIRTABLE_TOKEN is not set. Add it to .env.local.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

async function api(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

/** Johannesburg date — the same rule the app uses everywhere else. */
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  console.log(`Backing up base ${BASE}…\n`);

  // Read the schema rather than a hardcoded table list, so a table added in
  // Airtable is picked up automatically instead of being silently missed.
  const { tables } = await api(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`);

  const backup = {
    base: BASE,
    takenAt: new Date().toISOString(),
    tables: {},
  };

  let grandTotal = 0;

  for (const table of tables) {
    const records = [];
    let offset;
    do {
      const params = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
      if (offset) params.set("offset", offset);
      const page = await api(`https://api.airtable.com/v0/${BASE}/${table.id}?${params}`);
      records.push(...page.records);
      offset = page.offset;
      // Stay under Airtable's 5 requests/second limit.
      if (offset) await new Promise((r) => setTimeout(r, 220));
    } while (offset);

    backup.tables[table.name] = {
      id: table.id,
      // Field definitions are part of the backup: without them, field-id-keyed
      // records are unreadable if the schema is ever lost.
      fields: table.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
      recordCount: records.length,
      records,
    };

    grandTotal += records.length;
    console.log(`  ${table.name.padEnd(24)} ${String(records.length).padStart(5)} records`);
  }

  const latestDir = join(ROOT, "backups", "latest");
  const snapshotDir = join(ROOT, "backups", "snapshots");
  mkdirSync(latestDir, { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });

  // Per-table files so a git diff shows which table changed, not one huge blob.
  for (const [name, data] of Object.entries(backup.tables)) {
    const safe = name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    writeFileSync(join(latestDir, `${safe}.json`), JSON.stringify(data, null, 2) + "\n");
  }
  writeFileSync(
    join(latestDir, "_manifest.json"),
    JSON.stringify(
      {
        base: backup.base,
        takenAt: backup.takenAt,
        totalRecords: grandTotal,
        tables: Object.fromEntries(
          Object.entries(backup.tables).map(([n, t]) => [n, t.recordCount]),
        ),
      },
      null,
      2,
    ) + "\n",
  );

  const snapshotPath = join(snapshotDir, `${today()}.json`);
  writeFileSync(snapshotPath, JSON.stringify(backup, null, 2) + "\n");

  console.log(`\n  ${String(grandTotal).padStart(5)} records across ${tables.length} tables`);
  console.log(`\n  backups/latest/            per-table, diffs cleanly`);
  console.log(`  backups/snapshots/${today()}.json   restore point`);
  console.log(`\nCommit it:\n  git add backups && git commit -m "backup: ${today()}" && git push`);
}

main().catch((error) => {
  console.error("\nBackup failed:", error.message);
  process.exit(1);
});
