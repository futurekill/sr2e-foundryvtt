import { describe, it, expect } from "vitest";
import { SKILL_SUCCESS_TABLE, deckLimits, networkCapable, droneMode, comprehensionTest, groupPilot, robotReaction,
  robotInitiativeDice, poolBalance, ivisSplit, dumpDamage, dumpDuration } from "../module/rules/drone-rules.mjs";

describe("Rigger 2 networks and drones (R2 p.62–67; plan 5a)", () => {
  it("core p.68 Skill Success Table", () => {
    expect(SKILL_SUCCESS_TABLE.map(r => r.tn)).toEqual([2, 3, 4, 5, 6, 8, 9, 10]);
    expect(SKILL_SUCCESS_TABLE.find(r => r.key === "difficult").max).toBe(7);
  });
  it("deck limits: subscribers 2 × rating, affiliated ≤ rating", () => {
    expect(deckLimits(4)).toEqual({ subscribers: 8, affiliated: 4 });
  });
  it("network-capable = adapted and Pilot > 0", () => {
    expect(networkCapable({ adapted: true, pilot: 2 })).toBe(true);
    expect(networkCapable({ adapted: true, pilot: 0 })).toBe(false);
    expect(networkCapable({ adapted: false, pilot: 3 })).toBe(false);
  });
  it("modes: primary / secondary / captain, across networks", () => {
    expect(droneMode({ droneKey: "a", primaryKey: "a" })).toBe("primary");
    expect(droneMode({ droneKey: "b", primaryKey: "a" })).toBe("secondary");
    expect(droneMode({ droneKey: "b", primaryKey: null })).toBe("captain");
  });
  it("Comprehension Test: Pilot + spec (≤ Pilot) + IVIS; +2 commanding a secondary while jumped", () => {
    expect(comprehensionTest({ pilot: 3, specDice: 5, ivis: 2, tableTn: 4 })).toEqual({ dice: 3 + 3 + 2, tn: 4 });
    expect(comprehensionTest({ pilot: 2, tableTn: 5, jumpedCommandingSecondary: true, degradation: 1 }).tn).toBe(8);
    expect(groupPilot([4, 2, 3])).toBe(2);
  });
  it("robots: Reaction 2 × Pilot; Initiative dice Learning Pool + 1, max 4", () => {
    expect(robotReaction(3)).toBe(6);
    expect([0, 2, 3, 5].map(robotInitiativeDice)).toEqual([1, 3, 4, 4]);
  });
  it("pool balance under the current key only", () => {
    expect(poolBalance(3, { a: { key: "k1", n: 2 }, b: { key: "k0", n: 3 } }, "k1")).toBe(1);
  });
  it("IVIS successes split between the test and the pool", () => {
    expect(ivisSplit(4, 1)).toEqual({ test: 1, pool: 3 });
    expect(ivisSplit(2, 5)).toEqual({ test: 2, pool: 0 });
  });
  it("dump shock: (rating + 4)S Stun; disorientation ⌈⌈30 ÷ s⌉ ÷ 3⌉ Turns, 10 with no success", () => {
    expect(dumpDamage(6)).toEqual({ power: 10, level: "S", type: "stun" });
    expect([0, 1, 2, 3, 4, 10].map(dumpDuration)).toEqual([10, 10, 5, 4, 3, 1]);
  });
});
