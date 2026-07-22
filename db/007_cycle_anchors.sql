-- 007: a pay cycle starts when the money actually arrives.
--
-- The cycle was hardcoded to the 24th, but Romano's income is client payments
-- from CreativeDigital, not a salary. The real starts were 24 Feb, 24 Mar,
-- 23 Apr, 22 May, 24 Jun — close to the 24th, never reliably on it.
--
-- Anchors are explicit rather than inferred. Auto-detecting "big income resets
-- the cycle" would have misfired on the R15 800 received 15 June, three weeks
-- into a cycle: exactly the mid-cycle top-up that must NOT restart anything.
-- So the anchor is created only when Romano ticks the box while logging income.

create table if not exists cycle_anchors (
  id             bigint generated always as identity primary key,
  -- One cycle can only start once.
  started_on     date not null unique,
  -- The income that opened it, kept so deleting that entry can undo the anchor.
  transaction_id bigint references transactions (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists cycle_anchors_started_idx on cycle_anchors (started_on desc);

-- Backfill from history so "previous cycle" works from day one. These are the
-- days a month-opening payment actually landed, largest first per cluster.
insert into cycle_anchors (started_on, note)
values ('2026-02-24', 'Backfilled from income history'),
       ('2026-03-24', 'Backfilled from income history'),
       ('2026-04-23', 'Backfilled from income history'),
       ('2026-05-22', 'Backfilled from income history'),
       ('2026-06-24', 'Backfilled from income history')
on conflict (started_on) do nothing;

-- Marks the income that opened a cycle, so the log form can show it and
-- deleting the entry can withdraw the anchor with it.
alter table transactions
  add column if not exists starts_cycle boolean not null default false;

create unique index if not exists transactions_one_cycle_start_per_day_idx
  on transactions (occurred_on) where starts_cycle;
