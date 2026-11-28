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

import { rcRuleOf } from "../module/rules/drone-rules.mjs";
describe("remote-control equipment identity", () => {
  it("rule key first, then the compendium source, never the name", () => {
    expect(rcRuleOf({ flags: { sr2e: { rule: "rc-deck" } } })).toBe("rc-deck");
    expect(rcRuleOf({ _stats: { compendiumSource: "Compendium.sr2e-rigger-2.r2-sensors.Item.8b1caacf6d618abf" } })).toBe("rc-deck");
    expect(rcRuleOf({ name: "Remote Control Deck" })).toBe("");
  });
});

// The security rigger (Rigger 2 p.77–80, read from 120-dpi renders; docs/PLAN-vehicles-phase2.md 5d).
import { VIGILANCE, vigilanceCount, ccssComponentRefusal, ccssMode, ccssPerceptionTn } from "../module/rules/drone-rules.mjs";
describe("CCSS (Rigger 2 p.77–80)", () => {
  it("Vigilance Code Criteria Table (p.79): Blue 1, Green 2, Amber 3, Red 4 successes; unknown → Green", () => {
    expect(["blue", "green", "amber", "red"].map(vigilanceCount)).toEqual([1, 2, 3, 4]);
    expect(vigilanceCount("mauve")).toBe(2);
    expect(Object.keys(VIGILANCE)).toEqual(["blue", "green", "amber", "red"]);
  });
  it("jump limits (p.78): a room under 100 m², a corridor under 25 m; a device group always", () => {
    expect(ccssComponentRefusal({ kind: "room", size: 99 })).toBeNull();
    expect(ccssComponentRefusal({ kind: "room", size: 100 })).toMatch(/100 square meters/);
    expect(ccssComponentRefusal({ kind: "room", size: 0 })).toMatch(/100/);
    expect(ccssComponentRefusal({ kind: "corridor", size: 24.5 })).toBeNull();
    expect(ccssComponentRefusal({ kind: "corridor", size: 25 })).toMatch(/25 meters/);
    expect(ccssComponentRefusal({ kind: "device", size: 0 })).toBeNull();
  });
  it("the rigger's mode: a drone, else a component, else assuming the body", () => {
    expect([ccssMode({ primary: "x" }), ccssMode({ ccssComponent: "c" }), ccssMode({}), ccssMode(null)]).toEqual(["drone", "component", "body", "body"]);
  });
  it("Rigger Perception Tests Table (p.78): door 5, tamper no alarm 3, tamper 3 × successes, destroyed 4, deactivated 6; alert −2; alarm no test", () => {
    expect(["door", "tamper-no-alarm", "destroyed", "deactivated"].map(e => ccssPerceptionTn(e))).toEqual([5, 3, 4, 6]);
    expect(ccssPerceptionTn("tamper-success", { tamperSuccesses: 3 })).toBe(9);
    expect(ccssPerceptionTn("door", { onAlert: true })).toBe(3);
    expect(ccssPerceptionTn("tamper-no-alarm", { onAlert: true })).toBe(2, "floor 2");
    expect(ccssPerceptionTn("alarm")).toBeNull();
    expect(ccssPerceptionTn("nonsense")).toBeNull();
  });
});

import { ccssEncrypted, ccssNextStep, ccssStepOutcome } from "../module/rules/drone-rules.mjs";
describe("Accessing a security system (R2 p.79–80)", () => {
  it("Amber and Red systems are always encrypted (p.79 Vigilance table)", () => {
    expect([ccssEncrypted({ vigilance: "green" }), ccssEncrypted({ vigilance: "green", encrypted: true }), ccssEncrypted({ vigilance: "amber" }), ccssEncrypted({ vigilance: "red" })])
      .toEqual([false, true, true, true]);
  });
  it("the step order: tap (not at an open slave port) → decrypt (if encrypted) → protocols → rigger combat", () => {
    const green = { vigilance: "green" }, red = { vigilance: "red" };
    expect(ccssNextStep(green, {})).toBe("tap");
    expect(ccssNextStep(green, { slavePort: true })).toBe("protocols");
    expect(ccssNextStep(red, { tap: true })).toBe("decrypt");
    expect(ccssNextStep(red, { tap: true, decrypt: true })).toBe("protocols");
    expect(ccssNextStep(red, { tap: true, decrypt: true, protocols: true })).toBe("combat");
  });
  it("a step passes at the Vigilance count; a failed decrypt or protocol test alerts the system, a failed tap does not", () => {
    expect(ccssStepOutcome("tap", 2, "green")).toEqual({ passed: true, alert: false });
    expect(ccssStepOutcome("tap", 1, "green")).toEqual({ passed: false, alert: false });
    expect(ccssStepOutcome("decrypt", 2, "amber")).toEqual({ passed: false, alert: true });
    expect(ccssStepOutcome("protocols", 4, "red")).toEqual({ passed: true, alert: false });
  });
});

import { rcombatControlCap, rcombatDamage, rcombatOutcome } from "../module/rules/drone-rules.mjs";
describe("Rigger combat (R2 p.80)", () => {
  it("Control Pool: none for an intruding rigger or a security rigger assuming the body; up to the attribute otherwise; a decker ⌈emulation ÷ 2⌉", () => {
    expect(rcombatControlCap({ role: "intruder", attr: 6, pool: 6 })).toBe(0);
    expect(rcombatControlCap({ role: "defender", karmaOnly: true, attr: 6, pool: 6 })).toBe(0);
    expect(rcombatControlCap({ role: "defender", attr: 4, pool: 6 })).toBe(4);
    expect(rcombatControlCap({ role: "intruder", decker: true, emulation: 5, attr: 6 })).toBe(3);
    expect(rcombatControlCap({ role: "intruder", decker: true, emulation: 8, attr: 2 })).toBe(2, "capped by the attribute");
  });
  it("damage: (Willpower)L Stun, +1 level per 2 net successes, Deadly the most", () => {
    expect([1, 2, 3, 4, 6, 9].map(n => rcombatDamage(5, n).level)).toEqual(["L", "M", "M", "S", "D", "D"]);
    expect(rcombatDamage(5, 1)).toEqual({ power: 5, level: "L", type: "stun" });
  });
  it("the opposed Willpower Tests: more successes wins by the difference; a tie, nothing", () => {
    expect([rcombatOutcome(4, 2), rcombatOutcome(1, 3), rcombatOutcome(2, 2)]).toEqual([{ winner: "attacker", net: 2 }, { winner: "defender", net: 2 }, { winner: null, net: 0 }]);
  });
});
