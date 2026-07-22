-- 006: kids' accounts can be retired like every other record.
--
-- Every other table already had `archived`; this one didn't, which meant a
-- closed account could only be zeroed, leaving a permanent R0 row on the
-- children's list. Archive, never delete — the account has transactions
-- pointing at it.

alter table kids_accounts
  add column if not exists archived boolean not null default false;

create index if not exists kids_accounts_active_idx
  on kids_accounts (child) where not archived;
