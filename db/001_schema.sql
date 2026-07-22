-- PWOS · Postgres schema (Neon)
--
-- Modelled properly rather than mirroring Airtable: real types, foreign keys,
-- enums and NOT NULLs, so the database itself refuses impossible data. An
-- orphaned transaction or a mistyped transaction type becomes impossible here,
-- not merely unlikely.
--
-- MONEY IS numeric(14,2), NEVER double precision. Floating point cannot
-- represent 0.1 exactly; summing thousands of rand amounts in float drifts by
-- cents, and a wealth app that is off by cents is off.
--
-- Run once:  psql "$DATABASE_URL" -f db/001_schema.sql

BEGIN;

-- ---------------------------------------------------------------- enums ----

CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer', 'contribution');
CREATE TYPE account_kind     AS ENUM ('cash', 'savings', 'business', 'crypto', 'other');
CREATE TYPE entity_kind      AS ENUM ('personal', 'business', 'family');

-- ------------------------------------------------------------- accounts ----

CREATE TABLE accounts (
  id            text PRIMARY KEY,                 -- 'capitec-main'
  label         text        NOT NULL,
  kind          account_kind NOT NULL,
  entity        entity_kind  NOT NULL DEFAULT 'personal',
  -- Counts toward safe-to-spend (§5). Only Capitec Main and GOtyme today.
  spendable     boolean     NOT NULL DEFAULT false,
  -- NULL means "we genuinely don't know", which is different from zero.
  -- TymeBank is in this state and must not be counted as R0.
  balance_zar   numeric(14,2),
  airtable_id   text,                             -- provenance, for reconciling
  archived      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Every spelling seen in the data maps to one account. Replaces the read-time
-- alias map in src/lib/accounts.ts; now it is data, editable without a deploy.
CREATE TABLE account_aliases (
  alias       text PRIMARY KEY,                   -- stored lower-cased
  account_id  text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------- categories ----

-- The ~16 that match budget lines. Transactions keep whatever they originally
-- said in `original_category`, so consolidation is never lossy.
CREATE TABLE categories (
  name        text PRIMARY KEY,
  kind        transaction_type NOT NULL DEFAULT 'expense',
  -- Ordering for the picker; frequently used ones float up.
  sort_order  integer NOT NULL DEFAULT 100
);

-- --------------------------------------------------------- transactions ----

CREATE TABLE transactions (
  id                bigserial PRIMARY KEY,
  occurred_on       date        NOT NULL,
  description       text        NOT NULL CHECK (length(trim(description)) > 0),
  -- Negative for money out, positive for money in. Enforced against `type`
  -- below so an expense can never be stored positive again.
  amount_zar        numeric(14,2) NOT NULL CHECK (amount_zar <> 0),
  type              transaction_type NOT NULL,
  category          text        REFERENCES categories(name) ON UPDATE CASCADE,
  original_category text,                          -- what Airtable said
  account_id        text        REFERENCES accounts(id) ON DELETE RESTRICT,
  -- Destination for a transfer. §5 requires both legs to move; this records
  -- where the other leg went.
  to_account_id     text        REFERENCES accounts(id) ON DELETE RESTRICT,
  notes             text,
  airtable_id       text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- The sign must agree with the type. This is the class of bug that put
  -- R4,074 of spending on the wrong side of the budget in Airtable; here the
  -- database simply will not accept it.
  CONSTRAINT amount_sign_matches_type CHECK (
    (type = 'expense'      AND amount_zar < 0) OR
    (type = 'income'       AND amount_zar > 0) OR
    (type IN ('transfer', 'contribution'))
  ),
  -- A transfer to the same account is a no-op and always a mistake.
  CONSTRAINT transfer_moves_somewhere CHECK (
    to_account_id IS NULL OR to_account_id <> account_id
  )
);

CREATE INDEX transactions_occurred_on_idx ON transactions (occurred_on DESC);
CREATE INDEX transactions_account_idx     ON transactions (account_id, occurred_on DESC);
CREATE INDEX transactions_category_idx    ON transactions (category, occurred_on DESC);
CREATE INDEX transactions_type_idx        ON transactions (type, occurred_on DESC);

-- Catches the exact mistake made in Airtable: the same amount, on the same
-- account, on the same day, with the same description. A partial unique index
-- makes a true duplicate impossible rather than merely warned about.
CREATE UNIQUE INDEX transactions_no_exact_duplicate_idx
  ON transactions (occurred_on, account_id, amount_zar, lower(trim(description)))
  WHERE account_id IS NOT NULL;

-- ------------------------------------------------------------- budgets ----

CREATE TABLE budgets (
  id           bigserial PRIMARY KEY,
  -- The cycle this belongs to, identified by its start date (a 24th).
  cycle_start  date NOT NULL,
  category     text NOT NULL REFERENCES categories(name) ON UPDATE CASCADE,
  budgeted_zar numeric(14,2) NOT NULL DEFAULT 0 CHECK (budgeted_zar >= 0),
  kind         text,                              -- Fixed / Variable / Savings / Tax
  notes        text,
  airtable_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_start, category)
);

-- ---------------------------------------------------------------- debts ----

CREATE TABLE debts (
  id             bigserial PRIMARY KEY,
  name           text NOT NULL,
  kind           text,
  balance_zar    numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance_zar >= 0),
  monthly_zar    numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_zar >= 0),
  interest_pct   numeric(6,3),
  priority       text,
  status         text,
  target_payoff  date,
  -- Set when several rows are the same obligation. The Anders / MBD / SCM
  -- debt review is the live example: point the duplicates at the real one and
  -- totals stop double-counting, without deleting anything.
  duplicate_of   bigint REFERENCES debts(id) ON DELETE SET NULL,
  notes          text,
  airtable_id    text,
  archived       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debt_not_duplicate_of_itself CHECK (duplicate_of IS DISTINCT FROM id)
);

-- ------------------------------------------------- goals & kids accounts ----

CREATE TABLE goals (
  id             bigserial PRIMARY KEY,
  name           text NOT NULL,
  current_zar    numeric(14,2) NOT NULL DEFAULT 0,
  target_zar     numeric(14,2) CHECK (target_zar IS NULL OR target_zar >= 0),
  monthly_zar    numeric(14,2) NOT NULL DEFAULT 0,
  priority       text,
  status         text,
  target_date    date,
  notes          text,
  airtable_id    text,
  archived       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kids_accounts (
  id           bigserial PRIMARY KEY,
  account      text NOT NULL,
  child        text,
  institution  text,
  account_type text,
  balance_zar  numeric(14,2) NOT NULL DEFAULT 0,
  monthly_zar  numeric(14,2) NOT NULL DEFAULT 0,
  notes        text,
  airtable_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------- other holdings ----

-- Non-cash, non-crypto assets: vehicle, property, RA, TFSA, equities.
CREATE TABLE assets (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  category    text NOT NULL,
  value_zar   numeric(14,2) NOT NULL DEFAULT 0,
  entity      entity_kind NOT NULL DEFAULT 'personal',
  notes       text,
  airtable_id text,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Crypto positions. Prices stay live from CoinGecko; only the position lives here.
CREATE TABLE holdings (
  id            bigserial PRIMARY KEY,
  symbol        text NOT NULL,
  coin          text,
  wallet        text NOT NULL,
  quantity      numeric(28,10) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  invested_zar  numeric(14,2)  NOT NULL DEFAULT 0 CHECK (invested_zar >= 0),
  -- Fallback only, for coins with no CoinGecko id (ECNMG, MISC).
  stored_price_zar numeric(20,8),
  coingecko_id  text,
  category      text,
  status        text,
  notes         text,
  -- M1–M5 kept as free text on purpose: they are hand-written sell plans and
  -- the parser is tolerant. Structuring them would lose nuance the text carries.
  milestone_1   text,
  milestone_2   text,
  milestone_3   text,
  milestone_4   text,
  milestone_5   text,
  airtable_id   text,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX holdings_symbol_idx ON holdings (symbol) WHERE NOT archived;

-- Daily portfolio history, replacing Daily Crypto Report.
CREATE TABLE portfolio_snapshots (
  snapshot_on       date PRIMARY KEY,
  value_zar         numeric(14,2) NOT NULL,
  invested_zar      numeric(14,2) NOT NULL,
  pnl_zar           numeric(14,2) NOT NULL,
  freedom_pct       numeric(8,4),
  milestones_hit    integer NOT NULL DEFAULT 0,
  detail            jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ audit log ----

-- Captured by trigger, not by application code. A trigger cannot be forgotten
-- and it also records changes made outside the app — a manual SQL fix shows up
-- here too, which is exactly when you most want a record.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  table_name  text        NOT NULL,
  record_id   text        NOT NULL,
  action      text        NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  -- Only the columns that actually changed, so a diff is readable at a glance.
  changed     jsonb,
  old_row     jsonb,
  new_row     jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_record_idx ON audit_log (table_name, record_id, changed_at DESC);
CREATE INDEX audit_log_time_idx   ON audit_log (changed_at DESC);

CREATE OR REPLACE FUNCTION write_audit() RETURNS trigger AS $$
DECLARE
  old_json jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_json jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  diff     jsonb := '{}'::jsonb;
  k        text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(new_json) LOOP
      -- Ignore updated_at: it changes on every write and would bury the signal.
      IF k <> 'updated_at' AND (old_json -> k) IS DISTINCT FROM (new_json -> k) THEN
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_json -> k, new_json -> k));
      END IF;
    END LOOP;
    -- Nothing meaningful changed; don't log noise.
    IF diff = '{}'::jsonb THEN RETURN NEW; END IF;
  END IF;

  INSERT INTO audit_log (table_name, record_id, action, changed, old_row, new_row)
  VALUES (
    TG_TABLE_NAME,
    COALESCE((new_json ->> 'id'), (old_json ->> 'id')),
    lower(TG_OP),
    CASE WHEN TG_OP = 'UPDATE' THEN diff ELSE NULL END,
    old_json,
    new_json
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach both to every table that holds money.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'transactions', 'budgets', 'debts',
    'goals', 'kids_accounts', 'assets', 'holdings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION write_audit()', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

COMMIT;
