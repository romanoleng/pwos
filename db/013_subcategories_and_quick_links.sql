-- 013: optional subcategories + configurable quick links (2026-07-23).
--
-- RECORD ONLY — the app provisions all of this lazily on first load
-- (src/lib/server/logmeta.ts, the same pattern as pending_balance_moves), so
-- running this file is optional. It exists so the schema story stays complete
-- in db/ and so a fresh database can be built without booting the app.
--
-- Subcategories revise the 010 decision ("no subcategories") WITHOUT giving
-- up what it protected: a subcategory is never required, the logger only
-- shows the field once a category has any, and the vocabulary builds itself
-- from use. transactions.subcategory stays free text — the subcategories
-- table drives pickers, it never blocks a save.
--
-- Quick links are the chips under Category in the logger: label + category,
-- optionally + subcategory. Tapping one pre-fills the form and focuses the
-- amount — it never logs by itself. Seeding (pinned carry-over + Lisa / Liam /
-- Braai / Drinks / Takeout) is done by the app, not here, because it depends
-- on the live category list.

create table if not exists subcategories (
  category   text not null references categories(name) on update cascade on delete cascade,
  name       text not null,
  sort_order integer not null default 100,
  archived   boolean not null default false,
  primary key (category, name)
);

alter table transactions add column if not exists subcategory text;

create table if not exists quick_links (
  id          bigserial primary key,
  label       text not null,
  category    text references categories(name) on update cascade on delete set null,
  subcategory text,
  sort_order  integer not null default 100,
  archived    boolean not null default false
);

create unique index if not exists quick_links_label_key
  on quick_links (lower(label));

comment on table subcategories is
  'Optional second level under a category. Vocabulary for pickers; never required.';
comment on column transactions.subcategory is
  'Free-text tag; subcategories table drives the pickers. Optional, always.';
comment on table quick_links is
  'Configurable one-tap chips in the logger. Pre-fill category/subcategory, focus amount.';
