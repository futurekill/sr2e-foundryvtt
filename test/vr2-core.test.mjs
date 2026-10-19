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

import { icClass, maneuverTNs, maneuverOutcome, improvisedLevel, medicTN, sheafCrossed, attributeLoss } from "../module/rules/sr2e-rules.mjs";

describe("VR2.0 part 2 helpers", () => {
  it("IC class: killer and cripplers are white; otherwise the authored type", () => {
    expect(icClass("killer", "gray")).toBe("white");
    expect(icClass("crippler-acid", "black")).toBe("white");
    expect(icClass("", "black")).toBe("black");
  });
  it("maneuver TNs (p.122–123): Sushi vs Orange-8 IC; Sushi vs a corp decker", () => {
    expect(maneuverTNs({ evasion: 6, sensor: 8, cloak: 4 }).maneuverer).toBe(4);
    expect(maneuverTNs({ evasion: 6, sensor: 8, cloak: 4 }).opponent).toBe(6);
    expect(maneuverTNs({ evasion: 6, sensor: 5, cloak: 2, lockOn: 3 })).toEqual({ maneuverer: 3, opponent: 3 });
  });
  it("maneuver outcomes: evade 3 vs 1 is 2 turns; ties and zero fail; position goes to the winner", () => {
    expect(maneuverOutcome("evade", 3, 1)).toEqual({ beneficiary: "maneuverer", net: 2 });
    expect(maneuverOutcome("parry", 2, 2)).toBeNull();
    expect(maneuverOutcome("evade", 0, 0)).toBeNull();
    expect(maneuverOutcome("parry", 1, 3)).toBeNull();
    expect(maneuverOutcome("position", 4, 5)).toEqual({ beneficiary: "opponent", net: 1 });
    expect(maneuverOutcome("position", 0, 2)).toEqual({ beneficiary: "opponent", net: 2 });
    expect(maneuverOutcome("position", 3, 3)).toBeNull();
  });
  it("improvised level and Medic TN", () => {
    expect([0, 1, 2, 3, 4, 7].map(improvisedLevel)).toEqual([null, "L", "M", "S", "D", "D"]);
    expect([0, 1, 2, 3, 9].map(medicTN)).toEqual([null, 4, 5, 6, 6]);
  });
  it("sheaf: crossed rows in order, shared steps included", () => {
    const rows = [{ id: "a", step: 6 }, { id: "b", step: 11 }, { id: "c", step: 11 }, { id: "d", step: 16 }];
    expect(sheafCrossed(rows, 5, 11).map(r => r.id)).toEqual(["a", "b", "c"]);
    expect(sheafCrossed(rows, 11, 15)).toEqual([]);
  });
  it("attribute loss: Selena Bod 6 loses 1; crippler floor 1; poison takes 1 to 0", () => {
    expect(attributeLoss(6, 1, 1)).toBe(1);
    expect(attributeLoss(6, 10, 1)).toBe(5);
    expect(attributeLoss(1, 3, 1)).toBe(0);
    expect(attributeLoss(1, 1, 0)).toBe(1);
    expect(attributeLoss(4, -2, 0)).toBe(0);
  });
});
