/**
 * Every fixture below is real text copied verbatim from Airtable Holdings
 * (base appL4V6tbsGRJ7WxQ) on 2026-07-21. If the parser drifts, these break.
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessMilestones,
  parseAmount,
  parseMilestone,
  parseMilestones,
} from "./milestones.ts";

describe("parseAmount", () => {
  it("reads US-style thousands separators, not en-ZA decimals", () => {
    // The single most dangerous misread: "R1,268" is 1268, not 1.268.
    assert.equal(parseAmount("1,268"), 1268);
    assert.equal(parseAmount("181.20"), 181.2);
    assert.equal(parseAmount("70,000"), 70000);
    assert.equal(parseAmount("1,853.20"), 1853.2);
  });

  it("expands M and K suffixes", () => {
    assert.equal(parseAmount("1.5M"), 1_500_000);
    assert.equal(parseAmount("2.998M"), 2_998_000);
    assert.equal(parseAmount("97.5K"), 97_500);
  });

  it("returns null rather than NaN for unparseable input", () => {
    assert.equal(parseAmount("most"), null);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount(null), null);
    assert.equal(parseAmount("tiny fraction"), null);
  });
});

describe("parseMilestone — standard instruction", () => {
  const m = parseMilestone(1, "Price: R181.20 | Sell R1,268 (7 coins) | Keep 75");

  it("extracts trigger, sell value, coin count and keep count", () => {
    assert.equal(m.triggerZar, 181.2);
    assert.equal(m.sellZar, 1268);
    assert.equal(m.sellCoins, 7);
    assert.equal(m.keepCoins, 75);
    assert.equal(m.none, false);
  });

  it("always preserves the raw text", () => {
    assert.equal(m.raw, "Price: R181.20 | Sell R1,268 (7 coins) | Keep 75");
  });
});

describe("parseMilestone — approximations and magnitude suffixes", () => {
  const m = parseMilestone(
    1,
    "Price: R0.70 | Sell R1,500 (~2,143 coins) | Keep ~2.998M [Corrected 22 Jun 2026 — old trigger R0.001 was stale/below current price]",
  );

  it("parses sub-rand triggers", () => {
    assert.equal(m.triggerZar, 0.7);
  });

  it("flags approximate quantities instead of dropping the tilde", () => {
    assert.equal(m.sellCoins, 2143);
    assert.equal(m.sellCoinsApprox, true);
    assert.equal(m.keepCoins, 2_998_000);
    assert.equal(m.keepCoinsApprox, true);
  });

  it("extracts the bracketed note and keeps it out of the instruction body", () => {
    assert.match(m.note ?? "", /Corrected 22 Jun 2026/);
    // The note contains "R0.001" — it must not be mistaken for the trigger.
    assert.equal(m.triggerZar, 0.7);
  });
});

describe("parseMilestone — prose sell instructions", () => {
  it("keeps the trigger even when the sell amount is not numeric", () => {
    const m = parseMilestone(
      1,
      "Price: R1.5M | Sell tiny fraction, too small to scale meaningfully | Keep most",
    );
    assert.equal(m.triggerZar, 1_500_000);
    assert.equal(m.sellZar, null, "no rand figure stated, so none invented");
    assert.equal(m.keepCoins, null, "'most' is not a number");
  });

  it("does not confuse a bracketed percentage with a sell value", () => {
    const m = parseMilestone(
      1,
      "Price: R97,500 | Sell tiny fraction, too small to scale | Keep most [M1 pushed +30%, 22 Jun 2026 — was too close to entry]",
    );
    assert.equal(m.triggerZar, 97_500);
    assert.equal(m.sellZar, null);
    assert.match(m.note ?? "", /pushed \+30%/);
  });
});

describe("parseMilestone — n/a variants", () => {
  it("treats a bare n/a as absent", () => {
    const m = parseMilestone(2, "n/a");
    assert.equal(m.none, true);
    assert.equal(m.triggerZar, null);
  });

  it("treats an annotated n/a as absent", () => {
    assert.equal(parseMilestone(1, "n/a — Stablecoin, no milestone needed").none, true);
    assert.equal(
      parseMilestone(2, "n/a — mostly exited by M2 given micro position").none,
      true,
    );
  });

  it("treats empty and null as absent", () => {
    assert.equal(parseMilestone(3, "").none, true);
    assert.equal(parseMilestone(4, null).none, true);
  });
});

describe("parseMilestone — M5 date-based exits", () => {
  it("marks the Feb 2028 exit as date-based with no price trigger", () => {
    const m = parseMilestone(
      5,
      "Feb 2028 OR parabolic — Sell ALL 20 moonbag | No exceptions. Recalibrated 26 Jun 2026 from live R120.80 base.",
    );
    assert.equal(m.isDateBased, true);
    assert.equal(
      m.triggerZar,
      null,
      "R120.80 is a historical recalibration base, not a trigger",
    );
  });

  it("marks low-conviction notes as date-based", () => {
    const m = parseMilestone(
      5,
      "LOW CONVICTION — NO FRESH CAPITAL. Exit at M4, no moonbag, no exceptions. L2 competition brutal, POL rebrand hasn't changed fundamentals. Let ride to Feb 2028 framework only.",
    );
    assert.equal(m.isDateBased, true);
    assert.equal(m.triggerZar, null);
  });
});

describe("assessMilestones", () => {
  // Real LINK (EasyCrypto) row.
  const milestones = parseMilestones({
    m1: "Price: R181.20 | Sell R1,268 (7 coins) | Keep 75",
    m2: "Price: R302.00 | Sell R3,020 (10 coins) | Keep 65",
    m5: "Feb 2028 OR parabolic — Sell ALL 20 moonbag | No exceptions.",
  });

  it("identifies the next milestone and the distance to it", () => {
    const a = assessMilestones(milestones, 150);
    assert.equal(a.hitCount, 0);
    assert.equal(a.next?.milestone.level, 1);
    // (181.20 - 150) / 150 = 20.8%
    assert.ok(Math.abs((a.next?.distancePct ?? 0) - 20.8) < 0.01);
  });

  it("marks a crossed milestone as hit and moves next along", () => {
    const a = assessMilestones(milestones, 200);
    assert.equal(a.hitCount, 1);
    assert.equal(a.lastHit?.milestone.level, 1);
    assert.equal(a.next?.milestone.level, 2);
  });

  it("treats the trigger price itself as hit, not pending", () => {
    const a = assessMilestones(milestones, 181.2);
    assert.equal(a.hitCount, 1);
    assert.equal(a.next?.distancePct !== null, true);
  });

  it("never marks a date-based M5 as hit, however high the price", () => {
    const a = assessMilestones(milestones, 10_000_000);
    assert.equal(a.hitCount, 2, "only M1 and M2 have triggers");
    assert.equal(
      a.all.find((s) => s.milestone.level === 5)?.hit,
      false,
      "Feb 2028 is a calendar decision, never inferred from price",
    );
  });

  it("degrades safely when the live price is unavailable", () => {
    // ECNMG and MISC have no CoinGecko id, so they render with no live price.
    // The ladder still comes from Airtable and stays useful: we surface the
    // next milestone and its trigger, and report the distance as unknown
    // rather than inventing one or hiding the plan.
    const a = assessMilestones(milestones, null);
    assert.equal(a.hitCount, 0, "nothing can be hit without a price");
    assert.equal(a.next?.milestone.level, 1);
    assert.equal(a.next?.milestone.triggerZar, 181.2);
    assert.equal(a.next?.distancePct, null, "distance is unknowable, not zero");
    assert.equal(a.lastHit, null);
    // Instructions must still be readable from raw text.
    assert.equal(a.all[0].milestone.raw.length > 0, true);
  });
});
