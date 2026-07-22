-- 010: categories become manageable from the app.
--
-- Renaming, merging and retiring a category all needed a migration from me,
-- which is the last big hole in the self-service goal — and the reason the
-- contribution mismatch (Crypto DCA and friends, zero transactions ever)
-- couldn't be cleaned up.
--
-- No subcategories. Twenty expense categories don't need a second level, and
-- nesting would add a picker step to every entry — the one thing that must
-- stay fast.

alter table categories
  add column if not exists archived boolean not null default false;

-- Archived categories leave the pickers but keep their history: the foreign key
-- from transactions still resolves, so past spending stays tagged and totalled.
create index if not exists categories_active_idx
  on categories (kind, sort_order) where not archived;

comment on column categories.archived is
  'Hidden from pickers. Historical transactions keep the tag and still count.';
