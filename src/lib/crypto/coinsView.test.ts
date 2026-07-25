import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_COINS_PREFS,
  aggregateByCoin,
  pnlPctOf,
  sortCoins,
  usdFactor,
} from "./coinsView.ts";
import type { Holding } from "./types.ts";

function holding(over: Partial<Holding> & { symbol: string }): Holding {
  return {
    recordId: `rec${over.symbol}`,
    coin: over.symbol,
    wallet: "EasyCrypto",
    quantity: 1,
    priceZar: 100,
    priceUsd: 5,
    priceSource: "live",
    change24hPct: 0,
    change7dPct: null,
    change30dPct: null,
    investedZar: 100,
    valueZar: 100,
    pnlZar: 0,
    pnlPct: 0,
    weightPct: 10,
    isCore5: false,
    category: null,
    milestones: [],
    milestoneStatuses: [],
    nextMilestone: null,
    lastHitMilestone: null,
    milestonesHitCount: 0,
    ...over,
  } as Holding;
}

describe("aggregateByCoin", () => {
  it("sums quantity, value and cost across a coin's wallets into one row", () => {
    const rows = aggregateByCoin([
      holding({ symbol: "HBAR", wallet: "EasyCrypto", quantity: 5000, valueZar: 6000, investedZar: 5000 }),
      holding({ symbol: "HBAR", wallet: "Luno", quantity: 400, valueZar: 500, investedZar: 500 }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quantity, 5400);
    assert.equal(rows[0].valueZar, 6500);
    assert.equal(rows[0].investedZar, 5500);
    assert.equal(rows[0].walletCount, 2);
    assert.equal(rows[0].pnlZar, 1000);
  });

  it("leaves P&L null when there is no cost basis, never a fake zero", () => {
    const [row] = aggregateByCoin([
      holding({ symbol: "ECNMG", investedZar: 0, valueZar: 300 }),
    ]);
    assert.equal(row.pnlZar, null);
    assert.equal(pnlPctOf(row), null);
  });

  it("takes a price/change from whichever wallet holding has it", () => {
    const [row] = aggregateByCoin([
      holding({ symbol: "ENA", wallet: "A", priceZar: null, priceUsd: null, change24hPct: null }),
      holding({ symbol: "ENA", wallet: "B", priceZar: 25, priceUsd: 1.3, change24hPct: 9.5 }),
    ]);
    assert.equal(row.priceZar, 25);
    assert.equal(row.change["24h"], 9.5);
  });
});

describe("sortCoins", () => {
  const rows = aggregateByCoin([
    holding({ symbol: "BTC", valueZar: 5000, quantity: 1, change24hPct: 2 }),
    holding({ symbol: "ATOM", valueZar: 700, quantity: 3, change24hPct: 8 }),
  ]);

  it("sorts by value descending by default", () => {
    assert.deepEqual(sortCoins(rows, DEFAULT_COINS_PREFS).map((r) => r.symbol), ["BTC", "ATOM"]);
  });

  it("sorts by the selected timeframe's change", () => {
    const out = sortCoins(rows, { ...DEFAULT_COINS_PREFS, sort: "change", timeframe: "24h", dir: "desc" });
    assert.deepEqual(out.map((r) => r.symbol), ["ATOM", "BTC"]);
  });

  it("sorts by P&L, highest first", () => {
    const pnlRows = aggregateByCoin([
      holding({ symbol: "WIN", valueZar: 900, investedZar: 500 }), // +400
      holding({ symbol: "DOWN", valueZar: 200, investedZar: 500 }), // -300
    ]);
    const out = sortCoins(pnlRows, { ...DEFAULT_COINS_PREFS, sort: "pnl", dir: "desc" });
    assert.deepEqual(out.map((r) => r.symbol), ["WIN", "DOWN"]);
  });
});

describe("usdFactor", () => {
  it("derives a zar→usd factor from a coin priced in both", () => {
    const rows = aggregateByCoin([holding({ symbol: "BTC", priceZar: 100, priceUsd: 5 })]);
    assert.equal(usdFactor(rows), 0.05);
  });

  it("returns null when nothing has both prices", () => {
    const rows = aggregateByCoin([holding({ symbol: "X", priceZar: null, priceUsd: null })]);
    assert.equal(usdFactor(rows), null);
  });
});
