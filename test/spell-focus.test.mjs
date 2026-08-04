// Spell foci, SR2E p.137.
//
// The system used to treat a focus as a permanent bonus: every active focus
// added its rating to EVERY spell, forever, and never to Drain. The book makes it
// a DEPLETING POOL bound to ONE spell, shared between the casting test and the
// Drain test:
//
//   "Both types operate in a similar manner in that they make available an
//    additional number of dice equal to their rating. Like Dice Pools, once the
//    Spell Focus dice are used, they are gone until the beginning of the
//    magician's next action... A specific spell focus provides extra dice equal
//    to its rating for the tests to cast and resist Drain associated with one
//    specific spell."
//
// Every case here is a way that can silently go wrong again.
import { describe, it, expect } from "vitest";
import {
  focusRemaining, focusEligibleFor, clampFocusAllocation, normalisedFocusSpent
} from "../module/rules/sr2e-rules.mjs";

const FOCUS = {
  focusType: "spell", bonded: true, active: true, expendable: false,
  spellSubtype: "specific", boundSpellId: "spell-sleep", force: 4, spent: 0
};

describe("spell focus — eligibility", () => {
  it("serves only the spell it is bound to", () => {
    expect(focusEligibleFor(FOCUS, "spell-sleep")).toBe(true);
    // The old behaviour: this returned dice for every spell the caster knew.
    expect(focusEligibleFor(FOCUS, "spell-manabolt")).toBe(false);
  });

  it("requires bonded AND active, not just a match", () => {
    expect(focusEligibleFor({ ...FOCUS, bonded: false }, "spell-sleep")).toBe(false);
    expect(focusEligibleFor({ ...FOCUS, active: false }, "spell-sleep")).toBe(false);
  });

  it("excludes expendable fetish foci entirely", () => {
    // They are consumed by their own spend-and-delete flow. A REFRESHING `spent`
    // counter would turn a single-use item into a permanent one.
    expect(focusEligibleFor({ ...FOCUS, expendable: true }, "spell-sleep")).toBe(false);
  });

  it("rejects category foci, which are not implemented", () => {
    expect(focusEligibleFor({ ...FOCUS, spellSubtype: "category" }, "spell-sleep")).toBe(false);
  });

  it("is not eligible once exhausted", () => {
    expect(focusEligibleFor({ ...FOCUS, spent: 4 }, "spell-sleep")).toBe(false);
  });

  it("an unbound focus grants nothing", () => {
    // What the migration deliberately leaves behind, rather than guessing a
    // binding that belongs to the player.
    expect(focusEligibleFor({ ...FOCUS, boundSpellId: "" }, "spell-sleep")).toBe(false);
    // Including against the empty-string spell id of a deleted spell.
    expect(focusEligibleFor({ ...FOCUS, boundSpellId: "" }, "")).toBe(false);
  });

  it("a binding pointing at a deleted spell contributes nothing and does not throw", () => {
    expect(() => focusEligibleFor({ ...FOCUS, boundSpellId: "gone" }, "spell-sleep")).not.toThrow();
    expect(focusEligibleFor({ ...FOCUS, boundSpellId: "gone" }, "spell-sleep")).toBe(false);
  });
});

describe("spell focus — the cast and Drain tests share ONE budget", () => {
  it("splits a rating-4 focus 2/2 and leaves nothing", () => {
    const a = clampFocusAllocation(FOCUS, 2, 2);
    expect(a).toEqual({ cast: 2, drain: 2, total: 4 });
  });

  it("REFUSES to hand out 4 + 4 from a rating-4 focus", () => {
    // The bug this whole mechanic exists to prevent: capping each field
    // independently at `remaining` would yield eight dice from a four-die focus.
    // Cast is satisfied first, Drain takes what survives — deterministic however
    // the request arrived, including straight through item.roll() with no dialog.
    expect(clampFocusAllocation(FOCUS, 4, 4)).toEqual({ cast: 4, drain: 0, total: 4 });
  });

  it("clamps against STALE spent — the second cast in one action", () => {
    // 3 already gone this action, so a greedy 4+4 request yields exactly 1.
    expect(clampFocusAllocation({ ...FOCUS, spent: 3 }, 4, 4))
      .toEqual({ cast: 1, drain: 0, total: 1 });
  });

  it("gives Drain the remainder when the cast under-uses the pool", () => {
    expect(clampFocusAllocation(FOCUS, 1, 9)).toEqual({ cast: 1, drain: 3, total: 4 });
  });

  it("treats junk input as zero rather than NaN", () => {
    expect(clampFocusAllocation(FOCUS, undefined, null)).toEqual({ cast: 0, drain: 0, total: 0 });
    expect(clampFocusAllocation(FOCUS, -5, -5)).toEqual({ cast: 0, drain: 0, total: 0 });
    expect(clampFocusAllocation(FOCUS, 2.7, 1.9)).toEqual({ cast: 2, drain: 1, total: 3 });
  });
});

describe("spell focus — spent can outrun its own ceiling", () => {
  it("reports no remaining dice when spent exceeds the rating", () => {
    // `spent` carries no schema max because its ceiling is the focus's dynamic
    // rating. Clamping here keeps `remaining` from going negative.
    expect(focusRemaining({ force: 2, spent: 4 })).toBe(0);
  });

  it("normalises spent when the rating is lowered", () => {
    // Editing a rating-4 focus with 4 spent down to rating 2 writes only `force`.
    expect(normalisedFocusSpent(4, 2)).toBe(2);
    expect(normalisedFocusSpent(1, 4)).toBe(1);
    expect(normalisedFocusSpent(-3, 4)).toBe(0);
  });
});
