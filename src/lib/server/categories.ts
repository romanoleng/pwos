/** Category admin data (build report item 06). */
import "server-only";

import { sql } from "./db";

export type CategoryRow = {
  name: string;
  kind: string;
  sortOrder: number;
  pinned: boolean;
  archived: boolean;
  /** How many transactions carry this tag — what a merge or archive affects. */
  transactionCount: number;
  spentZar: number;
  /** Whether it has a budget line in the current cycle. */
  budgeted: boolean;
};

export async function getCategories(): Promise<CategoryRow[]> {
  const rows = await sql<{
    name: string; kind: string; sort_order: number; pinned: boolean; archived: boolean;
    txn_count: string; spent_zar: string; budgeted: boolean;
  }>`
    select c.name, c.kind::text, c.sort_order, c.pinned, c.archived,
           count(t.id)                              as txn_count,
           coalesce(sum(-t.amount_zar), 0)          as spent_zar,
           exists (
             select 1 from budgets b
             where b.category = c.name
               and b.cycle_start = (select max(cycle_start) from budgets)
           )                                        as budgeted
    from categories c
    left join transactions t on t.category = c.name
    group by c.name, c.kind, c.sort_order, c.pinned, c.archived
    order by c.kind, c.sort_order, c.name`;

  return rows.map((r) => ({
    name: r.name,
    kind: r.kind,
    sortOrder: r.sort_order,
    pinned: r.pinned,
    archived: r.archived,
    transactionCount: Number(r.txn_count),
    spentZar: Number(r.spent_zar),
    budgeted: r.budgeted,
  }));
}
