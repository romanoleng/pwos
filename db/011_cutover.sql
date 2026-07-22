-- 011: a fresh start that doesn't destroy anything.
--
-- Romano wants the app to feel newly installed from payday, 24 July 2026 —
-- empty transactions, empty budgets, balances he sets himself. But he is under
-- debt review, and that ledger is his only record of what he has actually paid
-- Anders, MBD and SCM. Deleting it would mean he could not answer a question
-- from a creditor or the debt review counsellor.
--
-- So the history is hidden, not removed. One date decides what the app shows;
-- everything older stays queryable behind a switch in Settings, and can be
-- deleted for real later once he is sure it is not needed.

create table if not exists app_settings (
  id             boolean primary key default true check (id),
  -- Nothing before this date is shown anywhere in the app.
  cutover_date   date,
  -- When on, the app ignores the cutover and shows everything again.
  show_history   boolean not null default false,
  updated_at     timestamptz not null default now()
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

comment on table app_settings is
  'Single row. cutover_date hides everything older from the app without deleting it.';
