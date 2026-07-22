/**
 * Airtable → Postgres migration.
 *
 *   node scripts/migrate-to-postgres.mjs --dry    report only, writes nothing
 *   node scripts/migrate-to-postgres.mjs          migrate
 *
 * Reads the verified backup snapshot rather than live Airtable, so the source
 * is a known, unchanging artefact — the same one that can be diffed afterwards.
 *
 * The schema's constraints will reject anything malformed. That is the point:
 * where a row cannot be migrated, it is because it is genuinely wrong, and the
 * fix is decided here explicitly rather than by loosening the database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DRY = process.argv.includes("--dry");
const ROOT = process.cwd();

function connectionString() {
  return (
    process.env.DATABASE_URL ??
    readFileSync(join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim()
  );
}

function latestSnapshot() {
  const dir = join(ROOT, "backups", "snapshots");
  const file = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().pop();
  if (!file) throw new Error("No backup snapshot found. Run: npm run backup");
  console.log(`  source: backups/snapshots/${file}\n`);
  return JSON.parse(readFileSync(join(dir, file), "utf8"));
}

/* ------------------------------------------------------------ reference ---- */

const ACCOUNTS = [
  { id: "capitec-main", label: "Capitec Main", kind: "cash", entity: "personal", spendable: true,
    netWorth: "Capitec Main", aliases: ["Capitec Main", "Capitec", "Main Account"] },
  { id: "gotyme", label: "GOtyme Bank", kind: "cash", entity: "personal", spendable: true,
    netWorth: "GOtyme Bank",
    aliases: ["GOtyme Bank", "GOtyme", "GoTyme", "TymeBank", "Tyme Bank", "TymeBank EveryDay (51012204711)"] },
  { id: "absa", label: "Absa (Romano)", kind: "cash", entity: "personal", spendable: false,
    netWorth: "Absa (Romano)", aliases: ["ABSA", "Absa", "Absa (Romano)"] },
  { id: "capitec-business", label: "Capitec Business", kind: "business", entity: "business", spendable: false,
    netWorth: "Capitec Business (CreativeDigital)",
    aliases: ["Capitec Business", "Capitec Business (CreativeDigital)"] },
  { id: "capitec-savings", label: "Capitec Savings", kind: "savings", entity: "personal", spendable: false,
    netWorth: "Capitec Savings (Romano)", aliases: ["Capitec Savings", "Capitec Savings (Romano)"] },
  { id: "creative-tax", label: "Creative Tax", kind: "savings", entity: "business", spendable: false,
    netWorth: "Creative Tax (Capitec Savings)", aliases: ["Creative Tax", "Creative Tax (Capitec Savings)"] },
  { id: "capitec-rewards", label: "Capitec Rewards", kind: "savings", entity: "personal", spendable: false,
    netWorth: "Capitec Rewards (Romano)", aliases: ["Capitec Rewards", "Capitec Rewards (Romano)"] },
  { id: "cash", label: "Cash", kind: "cash", entity: "personal", spendable: false,
    aliases: ["Cash", "CashMoney"] },
  { id: "luno", label: "Luno", kind: "crypto", entity: "personal", spendable: false, aliases: ["Luno"] },
  { id: "easycrypto", label: "EasyCrypto", kind: "crypto", entity: "personal", spendable: false,
    aliases: ["EasyCrypto", "Easy Crypto"] },
  { id: "tangem", label: "Tangem Hardware Wallet", kind: "crypto", entity: "personal", spendable: false,
    aliases: ["Tangem Hardware Wallet", "Tangem"] },
  { id: "payflex", label: "Payflex", kind: "other", entity: "personal", spendable: false, aliases: ["Payflex"] },
];

/** The consolidated set: one per budget line, plus the money-movement kinds. */
const CATEGORIES = [
  ["Groceries", "expense", 1], ["Petrol", "expense", 2], ["Eating Out", "expense", 3],
  ["Subscriptions", "expense", 4], ["Lisa & Liam", "expense", 5], ["Home Bond", "expense", 6],
  ["Levies + Rates", "expense", 7], ["Payflex", "expense", 8], ["Internet", "expense", 9],
  ["Meal Prep", "expense", 10], ["Medical", "expense", 11], ["Clothing & Shoes", "expense", 12],
  ["Smokes", "expense", 13], ["Betting/Lottery", "expense", 14], ["Bank Fees", "expense", 15],
  ["Miscellaneous", "expense", 16],
  ["Business Income", "income", 20], ["Interest", "income", 21], ["Allowance", "income", 22],
  ["Transfer", "transfer", 30],
  ["Savings", "contribution", 40], ["Investments", "contribution", 41],
  ["Crypto Investment", "contribution", 42],
  // Budget-only lines. They never appear as a transaction category, but a
  // budget row references one, so they must exist for the foreign key.
  ["Crypto DCA", "contribution", 43], ["Car Savings", "contribution", 44],
  ["Tax Provision → SARS", "contribution", 45], ["Emergency Fund", "contribution", 46],
  ["Kids Education (TFSA)", "contribution", 47],
];

/** 48 Airtable categories → the consolidated set. Original is always kept. */
const CATEGORY_MAP = {
  Groceries: "Groceries", "Meal Prep": "Meal Prep",
  Petrol: "Petrol", Fuel: "Petrol", Transport: "Petrol",
  "Eating Out": "Eating Out", Restaurants: "Eating Out", Takeaways: "Eating Out",
  "Food & Dining": "Eating Out", "Going Out": "Eating Out",
  Subscriptions: "Subscriptions", Cellphone: "Subscriptions",
  "Business Internet": "Internet",
  Kids: "Lisa & Liam", "Family & Kids": "Lisa & Liam", Activities: "Lisa & Liam",
  Bond: "Home Bond", "Home Loan": "Home Bond",
  "Municipal Rates": "Levies + Rates", "Business Levies": "Levies + Rates",
  Electricity: "Levies + Rates", Utilities: "Levies + Rates", "Home Maintenance": "Levies + Rates",
  Payflex: "Payflex", "Store Account Payments": "Payflex",
  "Debt Repayment": "Payflex", "Debt Payment": "Payflex",
  Medical: "Medical", Health: "Medical", Pharmacy: "Medical",
  "Clothing & Shoes": "Clothing & Shoes", Smokes: "Smokes",
  "Betting/Lottery": "Betting/Lottery", "Bank Fees": "Bank Fees",
  Personal: "Miscellaneous", "Personal / Lifestyle": "Miscellaneous",
  "Digital Payments": "Miscellaneous", Miscellaneous: "Miscellaneous",
  "Business Income": "Business Income", Interest: "Interest", Allowance: "Allowance",
  Transfer: "Transfer", "Crypto Swap": "Transfer",
  Savings: "Savings", Investments: "Investments",
  Crypto: "Crypto Investment", "Crypto Investment": "Crypto Investment",
  "Crypto Buy": "Crypto Investment", Contribution: "Savings",
};

const ALIAS_TO_ACCOUNT = new Map();
for (const a of ACCOUNTS) for (const alias of a.aliases) ALIAS_TO_ACCOUNT.set(alias.toLowerCase(), a.id);

const F = {
  txn: { desc: "fldkv75saQVcniLIk", amt: "fldrJ6f3gt0PwbJgC", cat: "fldhsDTulqpR7MdtA",
         acct: "fldsoRG39bewZ2MWC", date: "fldT6wzkOhs44yJ1x", notes: "fldvh7XMPP3aQtyV3",
         type: "fldYkglPU3oyakl93" },
  nw: { name: "fldfxiUQZvJxyTu0f", cat: "fldBS5N3nnYVMCQ3q", type: "fldGCrLxFR8XIwxZB", val: "fldqBv7liYBBOQ3Lz" },
  debt: { name: "fld19zodyvt0yKC1P", kind: "fldgVTyiDZrS8Brhd", bal: "fldyDq6KrUTl0MQgt",
          mo: "fldRylhwh9GUkXciS", int: "fldZwbE4Ei51vVnm2", pri: "fld9HFlI1tDIedwBJ",
          st: "fldxbXjuQeD4F9xpH", pay: "fldpRkJrHVVd21Vf4", notes: "fldgVYqZ1kBUGDUnv" },
  budget: { cat: "fld1QIml3qV4jGEpd", kind: "fldGbX8xaJD4MtfM8", amt: "fldl87k7XXfFuzN2K", month: "fldHh2t1v4qfuffhy" },
  goal: { name: "fldCDKjnCjOW6sUu1", cur: "fldSmsn73477TEYE0", tgt: "fldcDGPSwZKG4ALbJ",
          mo: "fld64sfkThfhk7isF", pri: "fldiHd4MmHDsHOWyU", st: "flda0qgDfdFeY7O04", date: "fldjQC4N5wCQludnZ" },
  kid: { acct: "fldYSUjwg09Rejvkc", child: "fldRe1SuyyfoDl3J7", type: "fldnVpOMglmQr9975",
         bal: "fldP70Dc7YXA3A0KB", mo: "fldbKtVU7GGxGsLbX", inst: "fldb7f793z9kWEehF" },
  hold: { coin: "fldo3Eg3vBtWlixRX", sym: "fldL9NuokO2cANhAV", wallet: "fldpH542CYdy56BZp",
          qty: "fldFTp6MuMerf8vnn", inv: "fldt9tKeDy3YGtHkg", price: "fld5bv5V8vtj3ahQ9",
          cat: "fldwAAwKWdBSAx30j", st: "fld4Za8pm5p82Pm50", notes: "fldy6RjKLN5iubSF5",
          m1: "fld4U4jh59SsEne85", m2: "fldHIGHprVYvejSvC", m3: "fld7oVYZ3SpV5Bw9P",
          m4: "fldNJ5K4VtW8uWEHZ", m5: "fld5SNCiJPQPOP8E8" },
};

const str = (r, f) => {
  const v = r.fields[f];
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "name" in v) return String(v.name).trim() || null;
  return null;
};
const num = (r, f) => (typeof r.fields[f] === "number" ? r.fields[f] : null);

const REFUND = /revers|refund|cashback|rebate/i;

/** Payday cycles run 24th → 24th, so a budget month maps to the prior 24th. */
function cycleStartFor(monthIso) {
  const [y, m] = monthIso.slice(0, 7).split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return `${prev.y}-${String(prev.m).padStart(2, "0")}-24`;
}

async function main() {
  const snap = latestSnapshot();
  const T = (name) => snap.tables[name]?.records ?? [];

  const report = { fixedSigns: [], refunds: [], unmappedAccounts: new Set(), unmappedCategories: new Set(), skipped: [] };

  // ---- transactions ------------------------------------------------------
  const seen = new Set();
  const txns = [];
  for (const r of T("Transactions")) {
    const rawCat = str(r, F.txn.cat);
    const rawAcct = str(r, F.txn.acct);
    if (rawCat === "System Task" || rawAcct === "System") {
      report.skipped.push("System Task note"); continue;
    }

    const date = (str(r, F.txn.date) ?? "").slice(0, 10);
    const desc = str(r, F.txn.desc);
    let amount = num(r, F.txn.amt);
    if (!date || !desc || amount === null || amount === 0) {
      report.skipped.push(`incomplete: ${desc ?? "(no description)"}`); continue;
    }

    let type = (str(r, F.txn.type) ?? "expense").toLowerCase();
    const accountId = rawAcct ? ALIAS_TO_ACCOUNT.get(rawAcct.toLowerCase()) ?? null : null;
    if (rawAcct && !accountId) report.unmappedAccounts.add(rawAcct);

    const category = rawCat ? CATEGORY_MAP[rawCat] ?? null : null;
    if (rawCat && !category) report.unmappedCategories.add(rawCat);

    // The schema refuses an expense stored positive. Resolve it here rather
    // than loosening the constraint: a genuine refund becomes income (money
    // really did come back), and a mis-signed expense gets the sign it should
    // always have had.
    if (type === "expense" && amount > 0) {
      if (REFUND.test(desc)) {
        type = "income";
        report.refunds.push(`${date} ${desc} R${amount}`);
      } else {
        amount = -amount;
        report.fixedSigns.push(`${date} ${desc} R${-amount} → R${amount}`);
      }
    }
    if (type === "income" && amount < 0) amount = Math.abs(amount);

    // The unique index makes exact duplicates impossible; drop them here so
    // the migration reports them rather than dying mid-run.
    const key = `${date}|${accountId}|${amount}|${desc.trim().toLowerCase()}`;
    if (accountId && seen.has(key)) { report.skipped.push(`duplicate: ${date} ${desc}`); continue; }
    seen.add(key);

    txns.push([date, desc, amount, type, category, rawCat, accountId, str(r, F.txn.notes), r.id]);
  }

  // ---- everything else ---------------------------------------------------
  const nwRows = T("Net Worth");
  const accountBalances = new Map();
  const assets = [];
  for (const r of nwRows) {
    const name = str(r, F.nw.name);
    const type = str(r, F.nw.type);
    const cat = str(r, F.nw.cat) ?? "Other";
    const val = num(r, F.nw.val) ?? 0;
    if (type !== "Asset" && type !== null) continue;
    const account = ACCOUNTS.find((a) => a.netWorth && a.netWorth === name);
    if (account) { accountBalances.set(account.id, { value: val, airtableId: r.id }); continue; }
    if (cat === "Crypto") continue;               // live from CoinGecko
    assets.push([name, cat, val, r.id]);
  }

  const debts = T("Debt Tracker").map((r) => [
    str(r, F.debt.name), str(r, F.debt.kind), Math.max(0, num(r, F.debt.bal) ?? 0),
    Math.max(0, num(r, F.debt.mo) ?? 0), num(r, F.debt.int), str(r, F.debt.pri),
    str(r, F.debt.st), str(r, F.debt.pay), str(r, F.debt.notes), r.id,
  ]).filter((d) => d[0]);

  const budgets = T("Budget").map((r) => {
    const month = str(r, F.budget.month);
    const cat = str(r, F.budget.cat);
    return month && cat
      ? [cycleStartFor(month), cat, num(r, F.budget.amt) ?? 0, str(r, F.budget.kind), r.id]
      : null;
  }).filter(Boolean);

  const goals = T("Savings Goals").map((r) => [
    str(r, F.goal.name), num(r, F.goal.cur) ?? 0, num(r, F.goal.tgt),
    num(r, F.goal.mo) ?? 0, str(r, F.goal.pri), str(r, F.goal.st), str(r, F.goal.date), r.id,
  ]).filter((g) => g[0]);

  const kids = T("Kids Accounts").map((r) => [
    str(r, F.kid.acct), str(r, F.kid.child), str(r, F.kid.inst), str(r, F.kid.type),
    num(r, F.kid.bal) ?? 0, num(r, F.kid.mo) ?? 0, r.id,
  ]).filter((k) => k[0]);

  const holdings = T("Holdings").map((r) => [
    (str(r, F.hold.sym) ?? "").toUpperCase(), str(r, F.hold.coin), str(r, F.hold.wallet) ?? "Unassigned",
    num(r, F.hold.qty) ?? 0, Math.max(0, num(r, F.hold.inv) ?? 0), num(r, F.hold.price),
    str(r, F.hold.cat), str(r, F.hold.st), str(r, F.hold.notes),
    str(r, F.hold.m1), str(r, F.hold.m2), str(r, F.hold.m3), str(r, F.hold.m4), str(r, F.hold.m5), r.id,
  ]).filter((h) => h[0]);

  // ---- report ------------------------------------------------------------
  console.log("  PLAN");
  console.log(`    accounts     ${ACCOUNTS.length}`);
  console.log(`    categories   ${CATEGORIES.length}  (from 48)`);
  console.log(`    transactions ${txns.length}`);
  console.log(`    debts        ${debts.length}`);
  console.log(`    budgets      ${budgets.length}`);
  console.log(`    goals        ${goals.length}`);
  console.log(`    kids         ${kids.length}`);
  console.log(`    assets       ${assets.length}`);
  console.log(`    holdings     ${holdings.length}`);

  if (report.fixedSigns.length) {
    console.log(`\n  SIGNS CORRECTED (${report.fixedSigns.length}) — expenses stored positive:`);
    for (const f of report.fixedSigns) console.log(`    ${f}`);
  }
  if (report.refunds.length) {
    console.log(`\n  RECLASSIFIED AS INCOME (${report.refunds.length}) — genuine money back:`);
    for (const f of report.refunds) console.log(`    ${f}`);
  }
  if (report.skipped.length) {
    console.log(`\n  SKIPPED (${report.skipped.length}):`);
    for (const f of report.skipped) console.log(`    ${f}`);
  }
  if (report.unmappedAccounts.size) console.log(`\n  ⚠ unmapped accounts: ${[...report.unmappedAccounts].join(", ")}`);
  if (report.unmappedCategories.size) console.log(`\n  ⚠ unmapped categories: ${[...report.unmappedCategories].join(", ")}`);

  const known = new Set(CATEGORIES.map(([n]) => n));
  const missing = [...new Set(budgets.map((b) => b[1]).filter((c) => !known.has(c)))];
  if (missing.length) {
    console.log(`\n  ⚠ budget categories with no matching category row: ${missing.join(", ")}`);
  }

  const totalOut = txns.filter((t) => t[3] === "expense").reduce((s, t) => s - t[2], 0);
  const totalIn = txns.filter((t) => t[3] === "income").reduce((s, t) => s + t[2], 0);
  console.log(`\n  CHECKSUMS\n    expense total R${totalOut.toFixed(2)}\n    income total  R${totalIn.toFixed(2)}`);
  console.log(`    debt total    R${debts.reduce((s, d) => s + d[2], 0).toFixed(2)}`);

  if (DRY) { console.log("\n  DRY RUN — nothing written.\n"); return; }

  // ---- write -------------------------------------------------------------
  const client = new pg.Client({ connectionString: connectionString() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`truncate transactions, budgets, debts, goals, kids_accounts,
                        assets, holdings, account_aliases, accounts, categories,
                        audit_log restart identity cascade`);

    for (const a of ACCOUNTS) {
      const b = accountBalances.get(a.id);
      await client.query(
        `insert into accounts (id,label,kind,entity,spendable,balance_zar,airtable_id)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [a.id, a.label, a.kind, a.entity, a.spendable, b ? b.value : null, b?.airtableId ?? null]);
      for (const alias of a.aliases) {
        await client.query(`insert into account_aliases (alias,account_id) values ($1,$2)
                            on conflict do nothing`, [alias.toLowerCase(), a.id]);
      }
    }
    for (const [name, kind, order] of CATEGORIES) {
      await client.query(`insert into categories (name,kind,sort_order) values ($1,$2,$3)`, [name, kind, order]);
    }
    // Multi-row inserts: one round-trip per 100 rows instead of per row.
    for (let i = 0; i < txns.length; i += 100) {
      const chunk = txns.slice(i, i + 100);
      const values = chunk
        .map((_, r) => `($${r * 9 + 1},$${r * 9 + 2},$${r * 9 + 3},$${r * 9 + 4},$${r * 9 + 5},$${r * 9 + 6},$${r * 9 + 7},$${r * 9 + 8},$${r * 9 + 9})`)
        .join(",");
      await client.query(
        `insert into transactions (occurred_on,description,amount_zar,type,category,original_category,account_id,notes,airtable_id)
         values ${values}`, chunk.flat());
    }
    for (const d of debts) {
      await client.query(
        `insert into debts (name,kind,balance_zar,monthly_zar,interest_pct,priority,status,target_payoff,notes,airtable_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, d);
    }
    for (const b of budgets) {
      await client.query(
        `insert into budgets (cycle_start,category,budgeted_zar,kind,airtable_id)
         values ($1,$2,$3,$4,$5) on conflict (cycle_start,category) do nothing`, b);
    }
    for (const g of goals) {
      await client.query(
        `insert into goals (name,current_zar,target_zar,monthly_zar,priority,status,target_date,airtable_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`, g);
    }
    for (const k of kids) {
      await client.query(
        `insert into kids_accounts (account,child,institution,account_type,balance_zar,monthly_zar,airtable_id)
         values ($1,$2,$3,$4,$5,$6,$7)`, k);
    }
    for (const a of assets) {
      await client.query(`insert into assets (name,category,value_zar,airtable_id) values ($1,$2,$3,$4)`, a);
    }
    for (const h of holdings) {
      await client.query(
        `insert into holdings (symbol,coin,wallet,quantity,invested_zar,stored_price_zar,category,status,notes,
                               milestone_1,milestone_2,milestone_3,milestone_4,milestone_5,airtable_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, h);
    }
    await client.query("commit");
    console.log("\n  ✅ migrated\n");
  } catch (error) {
    await client.query("rollback");
    console.error("\n  ❌ rolled back:", error.message, "\n");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
