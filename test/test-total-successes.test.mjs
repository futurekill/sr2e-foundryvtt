import { describe, it, expect } from "vitest";
import { testTotalSuccesses } from "../module/rules/sr2e-rules.mjs";

/**
 * One definition of "how many successes did that test get" (SR2E p.190 for the
 * Karma Pool spends). Downstream cards — the opposed-melee Defend card, astral,
 * cybercombat, Resist Spell — read this so they cannot disagree with the test
 * card after Karma is spent.
 */
describe("testTotalSuccesses", () => {
  const die = success => ({ success });

  it("counts the natural successes", () => {
    expect(testTotalSuccesses({ dice: [die(true), die(false), die(true)] })).toBe(2);
  });

  it("adds bought successes on top (1 Karma each, permanent)", () => {
    expect(testTotalSuccesses({ dice: [die(true), die(false)], boughtSuccesses: 2 })).toBe(3);
  });

  it("recomputes from the dice, so a reroll that turned failures into hits counts", () => {
    // A Karma reroll rewrites the failed entries in place rather than appending.
    const before = { dice: [die(true), die(false), die(false), die(false)] };
    expect(testTotalSuccesses(before)).toBe(1);
    const after = { dice: [die(true), die(true), die(true), die(false)], rerolls: 1 };
    expect(testTotalSuccesses(after)).toBe(3);
  });

  it("is 0 on a critical glitch without any special case — all 1s means no hits", () => {
    expect(testTotalSuccesses({
      dice: [die(false), die(false)], criticalGlitch: true
    })).toBe(0);
  });

  it("survives a missing or empty state rather than throwing", () => {
    expect(testTotalSuccesses()).toBe(0);
    expect(testTotalSuccesses({})).toBe(0);
    expect(testTotalSuccesses({ dice: [] })).toBe(0);
  });
});
