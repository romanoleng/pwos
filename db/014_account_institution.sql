-- 014 · Account "institution" tag (Romano's ask, 2026-07-24)
--
-- A per-account bank label so each savings pot shows where it lives — Capitec
-- or GOtyme — as a small tag on the Savings screen. Free text, not an enum, so
-- a new bank never needs a code change. The app also adds this column lazily
-- (src/lib/server/accounts.ts) so it exists even before this migration runs;
-- this file is the canonical record of the change.

alter table accounts add column if not exists institution text;
