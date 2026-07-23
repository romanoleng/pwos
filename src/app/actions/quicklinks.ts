"use server";

import { revalidateTag } from "next/cache";

import { ensureLogMeta } from "@/lib/server/logmeta";
import { sql } from "@/lib/server/db";

import type { MutationResult } from "./holdings";

/**
 * Quick-link management (Settings → Categories, 2026-07-23).
 *
 * A quick link is a one-tap chip in the logger: a label pointing at a
 * category, or a category + subcategory. Tapping one pre-fills the form and
 * focuses the amount — it never logs by itself, because the amount always
 * varies. These actions keep the set Romano's: add, re-aim, reorder, remove.
 */

function invalidate(): void {
  revalidateTag("home", "max");
  revalidateTag("transactions", "max");
}

export type QuickLinkInput = {
  /** Present = update that link; absent = create a new one. */
  id?: string;
  label: string;
  category: string | null;
  subcategory: string | null;
};

export async function saveQuickLink(
  input: QuickLinkInput,
): Promise<MutationResult<{ id: string }>> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Give it a label." };
  if (label.length > 40) return { ok: false, error: "That label is too long." };
  const category = input.category?.trim() || null;
  const subcategory = input.subcategory?.trim() || null;

  try {
    await ensureLogMeta();

    if (category) {
      const known = await sql<{ name: string }>`
        select name from categories where name = ${category} and not archived`;
      if (known.length === 0) {
        return { ok: false, error: `No category called ${category}.` };
      }
    }

    let id = input.id ?? null;
    if (id) {
      const updated = await sql<{ id: string }>`
        update quick_links
        set label = ${label}, category = ${category}, subcategory = ${subcategory}
        where id = ${id}::bigint
        returning id::text`;
      if (updated.length === 0) return { ok: false, error: "That link no longer exists." };
    } else {
      const created = await sql<{ id: string }>`
        insert into quick_links (label, category, subcategory, sort_order)
        values (${label}, ${category}, ${subcategory},
                (select coalesce(max(sort_order), 0) + 10 from quick_links))
        returning id::text`;
      id = created[0].id;
    }

    // A link that names a subcategory teaches the vocabulary, exactly like
    // logging with one does.
    if (category && subcategory) {
      await sql`
        insert into subcategories (category, name)
        values (${category}, ${subcategory})
        on conflict do nothing`;
    }

    invalidate();
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("[saveQuickLink]", error);
    const message = error instanceof Error ? error.message : "Couldn't save it.";
    if (message.includes("quick_links_label_key")) {
      return { ok: false, error: `A link called ${label} already exists.` };
    }
    return { ok: false, error: message };
  }
}

/** Remove from the logger. Archived, not deleted — undo is a re-save away. */
export async function removeQuickLink(id: string): Promise<MutationResult> {
  try {
    await ensureLogMeta();
    const updated = await sql<{ id: string }>`
      update quick_links set archived = true where id = ${id}::bigint returning id::text`;
    if (updated.length === 0) return { ok: false, error: "That link no longer exists." };
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[removeQuickLink]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't remove it." };
  }
}

export async function restoreQuickLink(id: string): Promise<MutationResult> {
  try {
    await ensureLogMeta();
    await sql`update quick_links set archived = false where id = ${id}::bigint`;
    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreQuickLink]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't restore it." };
  }
}

/** Swap with the nearest neighbour — same pattern as reorderCategory. */
export async function reorderQuickLink(
  id: string,
  direction: "up" | "down",
): Promise<MutationResult> {
  try {
    await ensureLogMeta();
    const [current] = await sql<{ sort_order: number }>`
      select sort_order from quick_links where id = ${id}::bigint`;
    if (!current) return { ok: false, error: "That link no longer exists." };

    const [neighbour] = direction === "up"
      ? await sql<{ id: string; sort_order: number }>`
          select id::text, sort_order from quick_links
          where not archived and (sort_order, id) < (${current.sort_order}, ${id}::bigint)
          order by sort_order desc, id desc limit 1`
      : await sql<{ id: string; sort_order: number }>`
          select id::text, sort_order from quick_links
          where not archived and (sort_order, id) > (${current.sort_order}, ${id}::bigint)
          order by sort_order asc, id asc limit 1`;
    if (!neighbour) return { ok: false, error: "It's already at the end." };

    await sql`update quick_links set sort_order = ${neighbour.sort_order} where id = ${id}::bigint`;
    await sql`update quick_links set sort_order = ${current.sort_order} where id = ${neighbour.id}::bigint`;

    invalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[reorderQuickLink]", error);
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reorder it." };
  }
}
