-- 003: kids' monthly contributions, and honest marking of unconfirmed debts.
--
-- Two unrelated changes, one migration, because both exist to stop the app
-- stating things with more confidence than the underlying facts deserve.

-- 1. Monthly contributions ------------------------------------------------
--
-- Every kids' account was migrated with monthly_zar = 0, so nothing projected
-- forward: the app could show a balance but never a trajectory. These are the
-- first real figures, starting July 2026.
--
-- Liam's R250 goes to his Capitec Savings — a bank transfer, kept separate
-- from his EasyEquities investments. Lisa's R500 goes to her EasyEquities
-- Investments account.

update kids_accounts set monthly_zar = 250
where child = 'Liam' and account = 'Capitec Savings';

update kids_accounts set monthly_zar = 500
where child = 'Lisa' and account = 'Investments';

-- 2. Estimated balances ---------------------------------------------------
--
-- Anders, MBD Legal and SCM are real creditors under debt review, but the
-- balances are not confirmed figures — they are the best numbers available.
-- Summing them alongside a bond statement implies a precision that isn't
-- there, so the balance carries a flag and the UI marks it rather than
-- quietly rolling it into an exact-looking total.
--
-- Everything else (bond, Payflex, PayJustNow, rates, levies) comes from a
-- statement or a bill and stays confirmed.

alter table debts
  add column if not exists balance_estimated boolean not null default false;

comment on column debts.balance_estimated is
  'True when the balance is a best guess rather than a figure from a statement. Drives the "estimate" marker in the UI and the estimated share of the liabilities total.';

update debts set balance_estimated = true
where name in ('Anders', 'MBD Legal', 'SCM');
