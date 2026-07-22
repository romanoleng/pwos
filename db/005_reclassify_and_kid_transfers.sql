-- 005: fix the misrouted debt payments, and let a transfer land in a kid's account.

-- 1. Reclassify ------------------------------------------------------------
--
-- Airtable had a single "Debt Repayment" bucket covering the bond, Payflex,
-- PayJustNow and the debt review. The migration mapped that whole bucket to
-- Payflex, so a R10 000 bond payment and a R500 debt review instalment both
-- landed on a line budgeted at R5 000. Total spend is unaffected; only the
-- attribution was wrong.

insert into categories (name, kind, sort_order)
values ('PayJustNow', 'expense', 19), ('Debt Review', 'expense', 20)
on conflict (name) do nothing;

update transactions set category = 'Home Bond'
where category = 'Payflex' and description ilike 'Bond payment%';

update transactions set category = 'PayJustNow'
where category = 'Payflex' and description ilike 'Pay Just Now%';

update transactions set category = 'Debt Review'
where category = 'Payflex' and description ilike 'Debt review payment%';

-- The two new lines are real monthly commitments, so they get budget lines
-- rather than showing up as unbudgeted spend. Amounts come from the debt
-- tracker's own monthly figures and can be changed by tapping them.
insert into budgets (cycle_start, category, budgeted_zar, kind)
select '2026-06-24'::date, 'PayJustNow', 5000, 'expense'
where not exists (
  select 1 from budgets where cycle_start = '2026-06-24'::date and category = 'PayJustNow');

insert into budgets (cycle_start, category, budgeted_zar, kind)
select '2026-06-24'::date, 'Debt Review', 500, 'expense'
where not exists (
  select 1 from budgets where cycle_start = '2026-06-24'::date and category = 'Debt Review');

-- 2. The kids' money is theirs, not his ------------------------------------
--
-- "Family Future (Lisa & Liam)" was a single summary row inside his assets,
-- standing in for the children's accounts at a stale R673,20 against a real
-- R5 653. Their accounts are tracked individually now, and their money should
-- not inflate his net worth, so the row is archived rather than deleted — it
-- is a record of what Airtable held.

update assets set archived = true, notes = coalesce(notes || ' | ', '') ||
  'Archived 2026-07-22: superseded by kids_accounts, which are tracked per child and deliberately excluded from Romano''s net worth.'
where name = 'Family Future (Lisa & Liam)';

-- 3. Transfers into a kid's account ----------------------------------------
--
-- Money sent to Lisa's TFSA leaves his account and arrives in hers. Pointing
-- at kids_accounts keeps it out of his net worth automatically, which routing
-- it through his own accounts table would not.

alter table transactions
  add column if not exists to_kid_account_id bigint references kids_accounts (id) on delete set null;

-- A transfer has exactly one destination. Both set would move the money twice.
alter table transactions drop constraint if exists transfer_has_one_destination;
alter table transactions add constraint transfer_has_one_destination
  check (to_account_id is null or to_kid_account_id is null);

create index if not exists transactions_to_kid_account_idx
  on transactions (to_kid_account_id) where to_kid_account_id is not null;
