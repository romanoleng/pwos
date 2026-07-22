-- Quick-pick categories for the log sheet.
--
-- Frequency was the wrong signal: it surfaced Betting/Lottery (inflated by
-- duplicate rows) and Subscriptions (a debit order nobody logs by hand), while
-- missing the things actually bought in a shop.
--
-- Pinning is data, not code, so the list changes without a deploy.

BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Electricity was folded into Levies + Rates. Prepaid meters get topped up
-- constantly in SA, so it earns its own line rather than hiding in a bill.
INSERT INTO categories (name, kind, sort_order, pinned)
VALUES ('Electricity', 'expense', 17, true)
ON CONFLICT (name) DO UPDATE SET pinned = true;

INSERT INTO categories (name, kind, sort_order, pinned)
VALUES ('Kiosk Shop', 'expense', 18, true)
ON CONFLICT (name) DO UPDATE SET pinned = true;

-- "Smokes" becomes "Cigarettes". The transactions foreign key is declared
-- ON UPDATE CASCADE, so every existing row follows automatically.
UPDATE categories SET name = 'Cigarettes' WHERE name = 'Smokes';

UPDATE categories SET pinned = true
WHERE name IN ('Groceries', 'Petrol', 'Electricity', 'Cigarettes', 'Kiosk Shop');

COMMIT;
