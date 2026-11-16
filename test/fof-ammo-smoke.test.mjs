import { describe, it, expect } from "vitest";
import { burstDamageBonus, tracerRounds, tracerTnMod } from "../module/rules/sr2e-rules.mjs";

describe("Tracer rounds (Fields of Fire p.51)", () => {
  it("every third round is a tracer", () => {
    expect([1, 2, 3, 5, 6, 9, 10].map(tracerRounds)).toEqual([0, 0, 1, 1, 2, 3, 3]);
  });
  it("tracers add no Power to a burst but still count toward the Damage Level: 5M × 10 rounds = 12D, not 15D", () => {
    expect(burstDamageBonus(10)).toEqual({ powerBonus: 10, levelSteps: 3 });
    expect(burstDamageBonus(10, { tracer: true })).toEqual({ powerBonus: 7, levelSteps: 3 });
    expect(5 + burstDamageBonus(10, { tracer: true }).powerBonus).toBe(12);
  });
  it("−1 TN per tracer for a non-smartgun shooter beyond Short range only", () => {
    expect(tracerTnMod({ rounds: 6, range: "medium" })).toBe(-2);
    expect(tracerTnMod({ rounds: 3, range: "long" })).toBe(-1);
    expect(tracerTnMod({ rounds: 6, range: "short" })).toBe(0);
    expect(tracerTnMod({ rounds: 6, range: "medium", smartgun: true })).toBe(0);
    expect(tracerTnMod({ rounds: 2, range: "medium" })).toBe(0);
  });
});

import { smokeCloudRadius } from "../module/rules/sr2e-rules.mjs";
describe("Smoke clouds (Fields of Fire p.85 Smoke Table)", () => {
  it("a grenade's cloud has a 10 m radius, a mortar round's 15 m — never the 0 m a Power-based radius gives", () => {
    expect(smokeCloudRadius("Smoke Grenade")).toBe(10);
    expect(smokeCloudRadius("Thermal Smoke Grenade")).toBe(10);
    expect(smokeCloudRadius("Mortar Smoke Round")).toBe(15);
  });
});
