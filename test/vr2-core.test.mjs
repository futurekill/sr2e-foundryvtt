// The VR2.0 core at roll time (docs/PLAN-vr2-core.md); book pages are VR2.0's.
import { describe, it, expect } from "vitest";
import "./foundry-shim.mjs";
import { queueDice } from "./foundry-shim.mjs";
import { icInitiativeDice, systemTestVerdict, attackMultiplier, personaBudgetOver, damageResistArmor,
         detectionFactor, matrixCombatOutcome, dumpShockDamage } from "../module/rules/sr2e-rules.mjs";
import { SR2ESuccessRoll } from "../module/dice/sr2e-roll.mjs";

describe("VR2.0 helpers", () => {
  it("IC initiative dice by Security Code (p.120)", () => {
    expect(["blue", "green", "orange", "red"].map(icInitiativeDice)).toEqual([1, 2, 3, 4]);
  });
  it("System Test: the decker needs MORE successes; the host's go on the tally either way (p.19)", () => {
    expect(systemTestVerdict(2, 1)).toEqual({ success: true, tally: 1 });
    expect(systemTestVerdict(1, 1)).toEqual({ success: false, tally: 1 });
    expect(systemTestVerdict(0, 3)).toEqual({ success: false, tally: 3 });
  });
  it("attack utility multiplier follows the Damage Level (p.98); none without one", () => {
    expect(["L", "M", "S", "D"].map(attackMultiplier)).toEqual([2, 3, 4, 5]);
    expect(attackMultiplier("")).toBeNull();
  });
  it("persona programs may total MPCP × 3 (p.84)", () => {
    expect(personaBudgetOver(24, 8)).toBe(0);
    expect(personaBudgetOver(26, 8)).toBe(2);
  });
  it("armorCalc none ignores armour and its modifiers (dump shock)", () => {
    expect(damageResistArmor({ armorCalc: "none", ballistic: 5, impact: 3, armorMod: 2 }).armor).toBe(0);
  });
  it("icon damage stages up and down by 2s, 10-box track boxes (p.124)", () => {
    expect(matrixCombatOutcome("M", 4, 1)).toEqual({ level: "D", boxes: 6 });
    expect(matrixCombatOutcome("M", 0, 4)).toEqual({ level: null, boxes: 0 });
  });
  it("dump shock: a cool deck and ICCM each cut 2 Power and a level; tortoise immune (p.124)", () => {
    expect(dumpShockDamage("red", 8)).toEqual({ power: 8, level: "D", type: "stun" });
    expect(dumpShockDamage("red", 8, { coolDeck: true, iccm: true })).toEqual({ power: 4, level: "M", type: "stun" });
    expect(dumpShockDamage("red", 8, { tortoise: true })).toBeNull();
  });
});

describe("HeadCrash logs on (VR2.0 p.19)", () => {
  it("Detection Factor 6, TN 11 − 4 = 7, one success against the host's none: he gets in", async () => {
    expect(detectionFactor(6, 5)).toBe(6);
    const tn = Math.max(2, 11 - 4);
    expect(tn).toBe(7);
    queueDice([2, 2, 3, 4, 5, 6, 3]);                       // the 6 explodes to 9
    const decker = await SR2ESuccessRoll.successTest(6, tn);
    queueDice([1, 2, 2, 2, 3, 3, 5, 5]);
    const host = await SR2ESuccessRoll.successTest(8, 6);   // Red-8: 8 dice vs Detection Factor 6
    expect([decker.successes, host.successes]).toEqual([1, 0]);
    expect(systemTestVerdict(decker.successes, host.successes).success).toBe(true);
    // Without Deception the TN is 11 and he fails.
    expect(systemTestVerdict(0, 0).success).toBe(false);
  });
});
