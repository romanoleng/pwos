-- 012: the 24 July client payment, logged ahead of payday.
--
-- R48 100 from Natroceutics into CreativeDigital's Capitec Business account,
-- matching the June payment exactly. Dated 24 July, so it is the first entry
-- after the reset cutover and the anchor that opens the new cycle.
--
-- If the real amount differs when it lands, edit it in the app — the cycle
-- anchor follows the date, not the figure.

insert into transactions
  (occurred_on, description, amount_zar, type, category, account_id, starts_cycle, notes)
values
  ('2026-07-24'::date, 'Natroceutics — client payment to CreativeDigital',
   48100, 'income'::transaction_type, 'Business Income', 'capitec-business', true,
   'Logged ahead of payday, 22 Jul 2026. Confirm the amount when it lands.')
on conflict do nothing;

insert into cycle_anchors (started_on, note)
values ('2026-07-24'::date, 'July payday — Natroceutics client payment')
on conflict (started_on) do nothing;
