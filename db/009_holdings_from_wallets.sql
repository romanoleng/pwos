-- 009: reconcile Luno and Tangem against the live wallets (22 Jul 2026).
--
-- Quantities transcribed from Romano's own wallet screenshots. Holdings is the
-- source of truth for positions (§5), so these are the positions; live prices
-- do the valuing. EasyCrypto is deliberately untouched — he's entering that
-- himself.
--
-- Two readings were NOT applied. Luno displays five decimals, so its BTC
-- (0,00127) and ETH (0,02683) are rounded views of the more precise 0,00127464
-- and 0,02683711 already stored. Writing the screenshot values would have
-- thrown away precision to no purpose.

-- 1. Quantities that genuinely moved --------------------------------------

update holdings set quantity = 30.63109      where wallet = 'Luno' and symbol = 'XRP';

update holdings set quantity = 500.724156    where wallet = 'Tangem — Forever Bag' and symbol = 'XRP';
update holdings set quantity = 1003.4292469  where wallet = 'Tangem — Forever Bag' and symbol = 'XLM';
update holdings set quantity = 0.81010359    where wallet = 'Tangem — Forever Bag' and symbol = 'TAO';
update holdings set quantity = 0.06594945    where wallet = 'Tangem — Forever Bag' and symbol = 'ETH';
update holdings set quantity = 1.39289196    where wallet = 'Tangem — Forever Bag' and symbol = 'SOL';

update holdings set quantity = 75549.506166  where wallet = 'Tangem — Growth Engine' and symbol = 'ZBCN';
update holdings set quantity = 1.08050583    where wallet = 'Tangem — Growth Engine' and symbol = 'AAVE';
update holdings set quantity = 1.43191194    where wallet = 'Tangem — Growth Engine' and symbol = 'HYPE';
update holdings set quantity = 35.49972813   where wallet = 'Tangem — Growth Engine' and symbol = 'ICP';
update holdings set quantity = 1.04005076    where wallet = 'Tangem — Growth Engine' and symbol = 'QNT';
update holdings set quantity = 50.0045712    where wallet = 'Tangem — Growth Engine' and symbol = 'SUI';

-- Down from 100,32 to 1,15 — a real 99% reduction, confirmed by the wallet's
-- own R6,22 at R5,40 per TRX.
update holdings set quantity = 1.152541      where wallet = 'Tangem — Trading' and symbol = 'TRX';

-- 2. Positions that are no longer held ------------------------------------
--
-- Archived, not deleted: the cost basis is the only record of what they cost,
-- and it's needed to make sense of past performance.

update holdings set archived = true,
  notes = coalesce(notes || ' | ', '') || 'Archived 22 Jul 2026: no longer in the wallet. Romano confirms sold or swapped.'
where (wallet = 'Tangem — Growth Engine' and symbol in ('ADA', 'ATOM', 'INJ'))
   or (wallet = 'Tangem — Trading' and symbol = 'DOGE');

-- 3. Positions the app didn't know about ----------------------------------
--
-- invested_zar is 0 because the cost isn't known yet, not because they were
-- free. Each will read as pure profit until Romano fills it in — which is the
-- honest failure mode, and visible rather than silently wrong.
--
-- Exactly-zero balances seen in the wallets (Luno POL, Forever Bag KAG) are
-- not recorded: an empty wallet slot isn't a position.

insert into holdings (symbol, coin, wallet, quantity, invested_zar, coingecko_id, stored_price_zar, notes)
values
  ('SOL',   'Solana',                     'Luno',                   0.02271,    0, 'solana',   null, 'Added 22 Jul 2026 from wallet. Cost basis outstanding.'),
  -- No provider id: a rand stablecoin CoinGecko doesn't list. Valued from the
  -- wallet's own figure, which §5 already supports as a fallback.
  ('ZARSC', 'ZAR Supercoin',              'Luno',                   1.00,       0, null,       0.98, 'Added 22 Jul 2026 from wallet. Cost basis outstanding.'),
  ('VTX',   'Vanguard Total World xStock','Tangem — Forever Bag',   0.0051743,  0, null,    2543.37, 'Tokenised stock, not on CoinGecko. Price from the wallet, 22 Jul 2026.'),
  ('PAXG',  'PAX Gold',                   'Tangem — Forever Bag',   0.0000244,  0, 'pax-gold', null, 'Added 22 Jul 2026 from wallet. Cost basis outstanding.'),
  ('ETH',   'Ethereum',                   'Tangem — Growth Engine', 0.00025328, 0, 'ethereum', null, 'Added 22 Jul 2026 from wallet. Cost basis outstanding.'),
  ('SOL',   'Solana',                     'Tangem — Growth Engine', 0.00191802, 0, 'solana',   null, 'Added 22 Jul 2026 from wallet. Cost basis outstanding.'),
  ('BNB',   'BNB Smart Chain',            'Tangem — Growth Engine', 0.00000001, 0, 'binancecoin', null, 'Dust. Added 22 Jul 2026 from wallet.'),
  ('SOL',   'Solana',                     'Tangem — Trading',       0.00122199, 0, 'solana',   null, 'Added 22 Jul 2026 from wallet. Cost basis outstanding.');

-- 4. Confirm the one guessed provider id ----------------------------------
--
-- VTX had no id, so the app inferred vanguard-total-world-xstock and priced it
-- at R2 544,43 against the wallet's own R2 543,37 — right coin. Pinning it
-- turns a guess the app has to keep flagging into a settled fact.

update holdings set coingecko_id = 'vanguard-total-world-xstock'
where symbol = 'VTX' and coingecko_id is null;
