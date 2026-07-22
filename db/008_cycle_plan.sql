-- 008: the income side of the plan.
--
-- Budget lines say what each category may cost. Nothing said what there was to
-- go round, so "budgeted R36 980" had nothing to sit against — you could
-- allocate more than you earn and the app would never mention it.
--
-- Expected income is per cycle, not a global setting: Romano is paid by
-- clients, so what he expects in July is genuinely a different question from
-- what he expected in June, and last month's plan must stay as it was.

create table if not exists cycle_plans (
  cycle_start         date primary key,
  expected_income_zar numeric(14,2) not null check (expected_income_zar >= 0),
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Seed the cycle in progress from what actually came in, as a starting point.
insert into cycle_plans (cycle_start, expected_income_zar, note)
select '2026-06-24'::date,
       coalesce(sum(amount_zar), 0),
       'Seeded from income actually received this cycle'
from transactions
where type = 'income'
  and occurred_on >= '2026-06-24'::date and occurred_on < '2026-07-24'::date
on conflict (cycle_start) do nothing;
