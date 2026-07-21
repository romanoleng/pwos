import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_FILTER,
  filterHoldings,
  holdingsToCsv,
  isFilterActive,
  sortHoldings,
} from "./filter.ts";
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

describe("filterHoldings", () => {
  const all = [
    holding({ symbol: "BTC", isCore5: true, pnlZar: 500, valueZar: 5000 }),
    holding({ symbol: "TIA", wallet: "Luno", pnlZar: -300, valueZar: 700 }),
    holding({ symbol: "ECNMG", priceSource: "airtable-fallback", pnlZar: null, valueZar: null }),
  ];

  it("matches on symbol, case-insensitively", () => {
    const result = filterHoldings(all, { ...EMPTY_FILTER, query: "btc" });
    assert.deepEqual(result.map((h) => h.symbol), ["BTC"]);
  });

  it("filters by wallet", () => {
    const result = filterHoldings(all, { ...EMPTY_FILTER, wallets: ["Luno"] });
    assert.deepEqual(result.map((h) => h.symbol), ["TIA"]);
  });

  it("filters to Core 5", () => {
    const result = filterHoldings(all, { ...EMPTY_FILTER, core5Only: true });
    assert.deepEqual(result.map((h) => h.symbol), ["BTC"]);
  });

  it("excludes unpriced holdings from both profit and loss", () => {
    // ECNMG has no P&L. Unknown must not be counted as a loss.
    const profit = filterHoldings(all, { ...EMPTY_FILTER, performance: "profit" });
    const loss = filterHoldings(all, { ...EMPTY_FILTER, performance: "loss" });
    assert.deepEqual(profit.map((h) => h.symbol), ["BTC"]);
    assert.deepEqual(loss.map((h) => h.symbol), ["TIA"]);
  });

  it("reports whether any filter is active", () => {
    assert.equal(isFilterActive(EMPTY_FILTER), false);
    assert.equal(isFilterActive({ ...EMPTY_FILTER, query: " " }), false);
    assert.equal(isFilterActive({ ...EMPTY_FILTER, core5Only: true }), true);
  });
});

describe("sortHoldings", () => {
  const all = [
    holding({ symbol: "AAA", valueZar: 100 }),
    holding({ symbol: "BBB", valueZar: 900 }),
    holding({ symbol: "CCC", valueZar: null }),
  ];

  it("sorts by value descending by default direction", () => {
    const result = sortHoldings(all, "value", "desc");
    assert.deepEqual(result.map((h) => h.symbol), ["BBB", "AAA", "CCC"]);
  });

  it("keeps unknown values last even when ascending", () => {
    // An unpriced coin is not the smallest — it is unknown, so it sorts last
    // in both directions rather than heading the list.
    const result = sortHoldings(all, "value", "asc");
    assert.deepEqual(result.map((h) => h.symbol), ["AAA", "BBB", "CCC"]);
  });

  it("does not mutate the input array", () => {
    const original = all.map((h) => h.symbol);
    sortHoldings(all, "value", "asc");
    assert.deepEqual(all.map((h) => h.symbol), original);
  });
});

describe("holdingsToCsv", () => {
  it("emits a header plus one row per holding", () => {
    const csv = holdingsToCsv([holding({ symbol: "BTC" })]);
    const lines = csv.split("\r\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^Symbol,Coin,Wallet,Quantity/);
    assert.match(lines[1], /^BTC,BTC,EasyCrypto,1/);
  });

  it("escapes commas and quotes so columns cannot shift", () => {
    const csv = holdingsToCsv([
      holding({ symbol: "BTC", coin: 'Bitcoin, the "original"' }),
    ]);
    assert.match(csv, /"Bitcoin, the ""original"""/);
  });

  it("exports raw numbers, not formatted rand strings", () => {
    // A spreadsheet must be able to sum the column.
    const csv = holdingsToCsv([holding({ symbol: "BTC", valueZar: 1234.5 })]);
    assert.match(csv, /1234\.5/);
    assert.doesNotMatch(csv, /R1 234/);
  });
});
