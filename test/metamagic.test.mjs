import { describe, it, expect } from "vitest";
import {
  centeringDrainBonus, centeringPenaltyReduction, centeringTestTN,
  shieldingBonusDice, quickeningKarmaRange, initiationKarmaCost
} from "../module/rules/sr2e-rules.mjs";

// All values verified against Grimoire 2nd ed. (FASA7903).

describe("Centering vs. Drain (Grimoire p.43)", () => {
  it("every 2 centering successes = 1 bonus drain success", () => {
    expect(centeringDrainBonus(4, 1)).toBe(2);
    expect(centeringDrainBonus(5, 2)).toBe(2);
    expect(centeringDrainBonus(3, 1)).toBe(1);
  });
  it("needs at least 2 centering successes to give a bonus", () => {
    expect(centeringDrainBonus(1, 3)).toBe(0);
  });
  it("yields nothing if the drain test itself scored no successes", () => {
    expect(centeringDrainBonus(6, 0)).toBe(0);
  });
});

describe("Centering vs. Penalties (Grimoire p.44)", () => {
  it("every 2 successes removes 1 penalty point", () => {
    expect(centeringPenaltyReduction(4)).toBe(2);
    expect(centeringPenaltyReduction(3)).toBe(1);
  });
  it("never removes more than the penalty present", () => {
    expect(centeringPenaltyReduction(8, 2)).toBe(2);
  });
  it("the centering test's own TN is the modified TN minus grade, min 2", () => {
    expect(centeringTestTN(7, 3)).toBe(4);
    expect(centeringTestTN(4, 6)).toBe(2); // floored at 2
  });
});

describe("Shielding (Grimoire p.45)", () => {
  it("grants bonus spell-defense dice equal to initiate grade", () => {
    expect(shieldingBonusDice(0)).toBe(0);
    expect(shieldingBonusDice(4)).toBe(4);
  });
});

describe("Quickening Karma range (Grimoire p.44)", () => {
  it("runs from Force to twice Force", () => {
    expect(quickeningKarmaRange(5)).toEqual({ min: 5, max: 10 });
    expect(quickeningKarmaRange(1)).toEqual({ min: 1, max: 2 });
  });
});

describe("Initiation Karma cost (Grimoire p.42)", () => {
  it("base is 6 + target grade", () => {
    // Grade 1, self, no ordeal: (6+1) x 3 = 21
    expect(initiationKarmaCost(1)).toBe(21);
  });
  it("group initiation costs x2 of base", () => {
    expect(initiationKarmaCost(1, { group: true })).toBe(14);
  });
  it("an ordeal lowers the multiplier (self x2.5, group x1.5)", () => {
    expect(initiationKarmaCost(1, { ordeal: true })).toBe(17);  // 7 × 2.5 rounded down (p.41)
    expect(initiationKarmaCost(1, { group: true, ordeal: true })).toBe(10);  // 7 × 1.5 rounded down (p.41)
  });
});

describe("initiationKarmaCost rounding (Grimoire p.41: always round down)", () => {
  it("grade 1 self-initiation with ordeal: 7 × 2.5 = 17.5 → 17", () => {
    expect(initiationKarmaCost(1, { ordeal: true })).toBe(17);
  });
});
