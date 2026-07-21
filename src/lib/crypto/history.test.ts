/**
 * Fixtures mirror real Daily Crypto Report rows (base appL4V6tbsGRJ7WxQ),
 * including the nine-writes-in-one-day case from 2026-06-21.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHistorySeries,
  historyGapDays,
  parseHistoryDate,
  withLivePoint,
  type RawHistoryRow,
} from "./history.ts";

const row = (
  date: string | null,
  createdTime: string,
  valueZar: number | null,
  investedZar = 254141,
): RawHistoryRow => ({
  date,
  createdTime,
  valueZar,
  investedZar,
  pnlZar: valueZar === null ? null : valueZar - investedZar,
  progressPct: valueZar === null ? null : (valueZar / 2_000_000) * 100,
});

describe("parseHistoryDate", () => {
  it("reads the ISO form used by Daily Crypto Report", () => {
    assert.equal(parseHistoryDate("2026-06-19"), "2026-06-19");
  });

  it("reads the long form used by Snapshots", () => {
    assert.equal(parseHistoryDate("14 Jun 2026"), "2026-06-14");
  });

  it("does not shift the date backwards through a UTC round-trip", () => {
    // Regression: toISOString() on local midnight in SAST (UTC+2) yields the
    // previous day. "14 Jun 2026" must stay the 14th.
    assert.equal(parseHistoryDate("14 Jun 2026"), "2026-06-14");
    assert.equal(parseHistoryDate("1 Jan 2027"), "2027-01-01");
  });

  it("returns null rather than epoch 0 for junk", () => {
    // Plotting an unparseable date as 1970 would drag the whole axis back.
    assert.equal(parseHistoryDate("not a date"), null);
    assert.equal(parseHistoryDate(""), null);
    assert.equal(parseHistoryDate(null), null);
  });
});

describe("buildHistorySeries", () => {
  it("collapses many same-day writes to the last one", () => {
    // The retired 3-hourly scheduler wrote 9 rows for 2026-06-21.
    const series = buildHistorySeries([
      row("2026-06-21", "2026-06-21T10:30:46.000Z", 129486),
      row("2026-06-21", "2026-06-21T14:41:00.000Z", 128654),
      row("2026-06-21", "2026-06-21T21:41:09.000Z", 128650),
    ]);
    assert.equal(series.length, 1, "one point per day, not three");
    assert.equal(series[0].valueZar, 128650, "the last write of the day wins");
  });

  it("orders chronologically regardless of input order", () => {
    const series = buildHistorySeries([
      row("2026-06-23", "2026-06-23T09:00:42.000Z", 137503),
      row("2026-06-19", "2026-06-19T18:35:00.000Z", 128393),
      row("2026-06-22", "2026-06-22T09:00:34.000Z", 145135),
    ]);
    assert.deepEqual(
      series.map((point) => point.date),
      ["2026-06-19", "2026-06-22", "2026-06-23"],
    );
  });

  it("drops rows with no value or no usable date", () => {
    const series = buildHistorySeries([
      row("2026-06-19", "2026-06-19T18:35:00.000Z", 128393),
      row(null, "2026-06-20T09:00:00.000Z", 130000),
      row("2026-06-21", "2026-06-21T09:00:00.000Z", null),
    ]);
    assert.equal(series.length, 1);
  });

  it("derives P&L when the stored column is empty", () => {
    const series = buildHistorySeries([
      {
        date: "2026-06-19",
        createdTime: "2026-06-19T18:35:00.000Z",
        valueZar: 128393,
        investedZar: 232462,
        pnlZar: null,
        progressPct: null,
      },
    ]);
    assert.equal(series[0].pnlZar, 128393 - 232462);
  });
});

describe("withLivePoint", () => {
  const series = buildHistorySeries([
    row("2026-06-23", "2026-06-23T09:00:42.000Z", 137503),
    row("2026-06-24", "2026-06-24T09:00:34.000Z", 138418),
  ]);

  const live = {
    valueZar: 150000,
    investedZar: 254141,
    pnlZar: -104141,
    freedomProgressPct: 7.5,
  };

  it("appends today as a live point", () => {
    const withLive = withLivePoint(series, live, new Date("2026-07-21T12:00:00Z"));
    assert.equal(withLive.length, 3);
    assert.equal(withLive[2].live, true);
    assert.equal(withLive[2].date, "2026-07-21");
  });

  it("stamps the live point with the Johannesburg date, not the UTC one", () => {
    // 00:30 SAST on 22 July is still 21 July in UTC. The app is checked late at
    // night, and Vercel runs in UTC, so this is a real case not a contrived one.
    const withLive = withLivePoint(series, live, new Date("2026-07-21T22:30:00Z"));
    assert.equal(withLive[withLive.length - 1].date, "2026-07-22");
  });

  it("replaces rather than duplicates an existing same-day point", () => {
    // Guards against two points for today after pressing "save snapshot".
    const withLive = withLivePoint(series, live, new Date("2026-06-24T18:00:00Z"));
    assert.equal(withLive.length, 2);
    assert.equal(withLive[1].valueZar, 150000);
    assert.equal(withLive[1].live, true);
  });
});

describe("historyGapDays", () => {
  it("measures staleness from the last stored point, ignoring the live one", () => {
    const series = withLivePoint(
      buildHistorySeries([row("2026-06-24", "2026-06-24T09:00:34.000Z", 138418)]),
      { valueZar: 1, investedZar: 1, pnlZar: 0, freedomProgressPct: 0 },
      new Date("2026-07-21T00:00:00Z"),
    );
    assert.equal(historyGapDays(series, new Date("2026-07-21T00:00:00Z")), 27);
  });

  it("returns null when there is no stored history at all", () => {
    assert.equal(historyGapDays([], new Date()), null);
  });
});
