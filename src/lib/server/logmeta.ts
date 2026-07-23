import "server-only";

import { toLocalISODate } from "@/lib/crypto/history";

import { money, sql } from "./db";

/**
 * Log-sheet metadata: subcategories, quick links, and the frequency rankings
 * behind the one-tap chips (Romano's ask, 2026-07-23).
 *
 * Subcategories are an OPTIONAL second level — the original "no subcategories"
 * decision protected entry speed, and this keeps that protection: a
 * subcategory is never required, the field only appears once a category has
 * any, and the vocabulary builds itself from what actually gets logged.
 * `transactions.subcategory` is free text on purpose (the `subcategories`
 * table drives pickers; a tag never blocks a save).
 *
 * Quick links are the configurable chips under Category in the logger: each
 * points at a category, or a category + subcategory. Tapping one pre-fills
 * both and puts focus in the amount field — it never logs by itself, because
 * the amount always varies.
 *
 * Provisioned lazily like pending_balance_moves (create-if-not-exists on the
 * most-travelled read path), so no out-of-band migration is needed. The
 * mirror migration lives in db/013_subcategories_and_quick_links.sql for the
 * record.
 */

let ensured = false;

export async function ensureLogMeta(): Promise<void> {
  if (ensured) return;
  await sql`
    create table if not exists subcategories (
      category   text not null references categories(name) on update cascade on delete cascade,
      name       text not null,
      sort_order integer not null default 100,
      archived   boolean not null default false,
      primary key (category, name)
    )`;
  await sql`alter table transactions add column if not exists subcategory text`;
  await sql`
    create table if not exists quick_links (
      id          bigserial primary key,
      label       text not null,
      category    text references categories(name) on update cascade on delete set null,
      subcategory text,
      sort_order  integer not null default 100,
      archived    boolean not null default false
    )`;
  // Two lambdas seeding at once must not produce two rows per label.
  await sql`
    create unique index if not exists quick_links_label_key
      on quick_links (lower(label))`;
  await seedQuickLinks();
  ensured = true;
}

/**
 * First run only (table empty): the pinned category chips carry over exactly
 * as they were — now editable — plus the five links Romano asked for. Guarded
 * per label, so a partial seed just completes on the next load.
 */
async function seedQuickLinks(): Promise<void> {
  const [{ n }] = await sql<{ n: string }>`select count(*)::text as n from quick_links`;
  if (Number(n) > 0) return;

  await sql`
    insert into quick_links (label, category, sort_order)
    select name, name, sort_order from categories
    where pinned and not archived
    on conflict do nothing`;

  const seeds: { label: string; category: string; subcategory: string }[] = [
    // Best-guess targets against the live category list ("Lisa & Liam" is a
    // real category); every one is editable in Settings → Categories.
    { label: "Lisa", category: "Lisa & Liam", subcategory: "Lisa" },
    { label: "Liam", category: "Lisa & Liam", subcategory: "Liam" },
    { label: "Braai", category: "Groceries", subcategory: "Braai" },
    { label: "Drinks", category: "Eating Out", subcategory: "Drinks" },
    { label: "Takeout", category: "Eating Out", subcategory: "Takeout" },
  ];
  let order = 500;
  for (const seed of seeds) {
    // Point at the category when it exists; otherwise land unlinked so the
    // link still shows up in the editor for Romano to aim.
    await sql`
      insert into quick_links (label, category, subcategory, sort_order)
      select ${seed.label},
             (select name from categories where name = ${seed.category} and not archived),
             ${seed.subcategory}, ${order}
      on conflict do nothing`;
    order += 10;
  }

  // The seeded subcategories join the vocabulary so their chips appear
  // scoped under the right category from day one.
  await sql`
    insert into subcategories (category, name)
    select q.category, q.subcategory from quick_links q
    where q.category is not null and q.subcategory is not null
    on conflict do nothing`;
}

export type QuickLink = {
  id: string;
  label: string;
  category: string | null;
  subcategory: string | null;
};

export async function getQuickLinks(): Promise<QuickLink[]> {
  const rows = await sql<{
    id: string; label: string; category: string | null; subcategory: string | null;
  }>`
    select id::text, label, category, subcategory
    from quick_links where not archived
    order by sort_order, id`;
  return rows;
}

export type LogFrequencies = {
  /** Accounts most drawn on, most-used first. */
  accounts: string[];
  /** Active subcategory names per category, frequency-ranked. */
  subcategoriesByCategory: Record<string, string[]>;
  /** Most frequent descriptions within each category. */
  descriptionsByCategory: Record<string, string[]>;
};

/**
 * Rankings are anchored to the most recent Monday (SAST) and look back twelve
 * weeks from there, so chip positions change at most once a week — stable
 * enough to build muscle memory — instead of reshuffling on every entry.
 * A window with no data at all (fresh start) falls back to everything up to
 * today, because empty chips help nobody.
 */
export function weekAnchorIso(now: Date = new Date()): string {
  const iso = toLocalISODate(now);
  const day = new Date(`${iso}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

const PER_LIST = 8;

export async function getLogFrequencies(): Promise<LogFrequencies> {
  const anchor = weekAnchorIso();

  const [accountRows, vocabRows, subFreqRows, descRows] = await Promise.all([
    sql<{ label: string; n: string }>`
      select a.label, count(*)::text as n
      from transactions t join accounts a on a.id = t.account_id
      where t.occurred_on >= ${anchor}::date - 84 and t.occurred_on < ${anchor}::date
      group by a.label order by count(*) desc, a.label limit 6`,
    sql<{ category: string; name: string; sort_order: number }>`
      select category, name, sort_order from subcategories
      where not archived order by category, sort_order, name`,
    sql<{ category: string; name: string; n: string }>`
      select category, subcategory as name, count(*)::text as n
      from transactions
      where subcategory is not null and category is not null
        and occurred_on >= ${anchor}::date - 84 and occurred_on < ${anchor}::date
      group by category, subcategory`,
    sql<{ category: string; description: string; n: string }>`
      select category, description, count(*)::text as n
      from transactions
      where category is not null
        and occurred_on >= ${anchor}::date - 84 and occurred_on < ${anchor}::date
      group by category, description
      order by count(*) desc limit 400`,
  ]);

  // Fresh database or fresh start: nothing before the anchor yet. Rank on
  // whatever exists instead — stability matters less than usefulness here.
  let accounts = accountRows;
  let descriptions = descRows;
  if (accountRows.length === 0 && descRows.length === 0) {
    [accounts, descriptions] = await Promise.all([
      sql<{ label: string; n: string }>`
        select a.label, count(*)::text as n
        from transactions t join accounts a on a.id = t.account_id
        group by a.label order by count(*) desc, a.label limit 6`,
      sql<{ category: string; description: string; n: string }>`
        select category, description, count(*)::text as n
        from transactions where category is not null
        group by category, description
        order by count(*) desc limit 400`,
    ]);
  }

  // Vocabulary order first (sort_order), then usage lifts the frequent ones.
  const subFreq = new Map<string, number>();
  for (const row of subFreqRows) {
    subFreq.set(`${row.category} ${row.name}`, money(row.n));
  }
  const subcategoriesByCategory: Record<string, string[]> = {};
  for (const row of vocabRows) {
    (subcategoriesByCategory[row.category] ??= []).push(row.name);
  }
  for (const [category, names] of Object.entries(subcategoriesByCategory)) {
    names.sort(
      (a, b) =>
        (subFreq.get(`${category} ${b}`) ?? 0) -
        (subFreq.get(`${category} ${a}`) ?? 0),
    );
    subcategoriesByCategory[category] = names.slice(0, PER_LIST);
  }

  const descriptionsByCategory: Record<string, string[]> = {};
  for (const row of descriptions) {
    const list = (descriptionsByCategory[row.category] ??= []);
    if (list.length < PER_LIST) list.push(row.description);
  }

  return {
    accounts: accounts.map((r) => r.label),
    subcategoriesByCategory,
    descriptionsByCategory,
  };
}
