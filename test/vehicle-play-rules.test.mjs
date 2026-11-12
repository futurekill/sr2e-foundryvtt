// Vehicle rules in play, core rulebook (docs/PLAN-vehicles-phase2.md Part 1).
import { describe, it, expect } from "vitest";
import { impactDamage, woundLevelOf, levelBelow, vehicleOperationMod, movingTargetMod, positionOutcomes, crashTrigger,
  vehicleSkillDice, manipulationVsVehicle, reservedControl } from "../module/rules/vehicle-play-rules.mjs";
import { vehicleHit } from "../module/rules/sr2e-rules.mjs";

describe("impact (p.107, p.109)", () => {
  it("Power = speed ÷ 10 and the Impact Table level", () => {
    expect(impactDamage(210)).toEqual({ power: 21, level: "D" });   // Nick's bike at its maximum (p.109)
    expect(impactDamage(70)).toEqual({ power: 7, level: "S" });     // …and at cruising: 7S
    expect(impactDamage(60)).toEqual({ power: 6, level: "M" });
    expect(impactDamage(20)).toEqual({ power: 2, level: "L" });
    expect(impactDamage(0).power).toBe(1);
  });
  it("wound levels and one level less", () => {
    expect([1, 3, 6, 9, 10].map(woundLevelOf)).toEqual(["L", "M", "S", "S", "D"]);
    expect([levelBelow("S"), levelBelow("L")]).toEqual(["M", null]);
  });
});

describe("Vehicle Operation Table (p.183)", () => {
  it("sums the rows; the rigger row needs the rig in use", () => {
    expect(vehicleOperationMod({ complex: true, unfamiliar: "stress", size: "large", conditions: "terrible", vcr: 2, riggedIn: true }).mod).toBe(1 + 3 + 2 + 4 - 4);
    expect(vehicleOperationMod({ vcr: 2, riggedIn: false }).mod).toBe(0);
    expect(vehicleOperationMod({ unfamiliar: "calm", size: "veryLarge", conditions: "bad" }).mod).toBe(6);
  });
});

describe("Moving Target Table (p.108)", () => {
  it("bands by the target's speed against the attacker's (stationary = 5)", () => {
    expect([5, 10, 11, 15, 16, 200].map(t => movingTargetMod(t, 5))).toEqual([0, 2, 4, 4, 6, 6]);
    expect(movingTargetMod(60, 90)).toBe(0);
    expect(movingTargetMod(10, 0)).toBe(6);
  });
});

describe("Position Test outcomes (p.106)", () => {
  it("4 successes at cruising 20: flee 80 m / 2 attacks, fight 4 attacks / 40 m", () => {
    expect(positionOutcomes(4, 20)).toEqual({ flee: { meters: 80, attacks: 2 }, pursue: { meters: 80, attacks: 2 }, fight: { attacks: 4, meters: 40 } });
    expect(positionOutcomes(6, 20).flee.attacks).toBe(3);
  });
});

describe("crash triggers (p.107)", () => {
  it("destroyed by weapons/spells → automatic crash; a Serious wound in combat → Crash Test; never from crashes", () => {
    expect(crashTrigger({ source: "weapon", woundLevel: "D", destroyedNow: true, inCombat: false })).toBe("autoCrash");
    expect(crashTrigger({ source: "spell", woundLevel: "S", destroyedNow: true, inCombat: true })).toBe("autoCrash");
    expect(crashTrigger({ source: "weapon", woundLevel: "S", inCombat: true })).toBe("crashTest");
    expect(crashTrigger({ source: "weapon", woundLevel: "S", inCombat: false })).toBeNull();
    expect(crashTrigger({ source: "weapon", woundLevel: "M", inCombat: true })).toBeNull();
    for (const source of ["crash", "collision", "manual"]) expect(crashTrigger({ source, woundLevel: "S", destroyedNow: true, inCombat: true })).toBeNull();
  });
});

describe("vehicle skill dice (p.69, p.85)", () => {
  it("trained, web default, Reaction +4; the Control Pool cap is the rating in use", () => {
    expect(vehicleSkillDice({ rating: 5 })).toEqual({ dice: 5, penalty: 0, cap: 5, defaulted: null });
    expect(vehicleSkillDice({ rating: 0, web: { dice: 3, penalty: 2, label: "Bike" } })).toMatchObject({ dice: 3, penalty: 2, cap: 3 });
    expect(vehicleSkillDice({ rating: 0, reaction: 4 })).toMatchObject({ dice: 4, penalty: 4, cap: 4, defaulted: "reaction" });
  });
});

describe("weapons and spells vs vehicles (p.108–109)", () => {
  it("a called Light hit affects a vehicle at Light", () => {
    expect(vehicleHit({ body: 3, armor: 0, power: 6, level: "L", lightRated: true }).none).toBe("light");
    expect(vehicleHit({ body: 3, armor: 0, power: 6, level: "L", lightRated: false, calledShot: true })).toMatchObject({ none: null, level: "L", dice: 3, tn: 3 });
  });
  it("damaging manipulations: no Power cut, no step-down", () => {
    expect(manipulationVsVehicle({ body: 4, armor: 3, power: 6, level: "S" })).toEqual({ dice: 5, tn: 6, level: "S" });
  });
});

describe("Position Test reservations (p.105)", () => {
  it("sums this round's tests only", () => {
    const r = { combatId: "c", round: 2, byTest: { a: 2, b: 3 } };
    expect(reservedControl(r, "c", 2)).toBe(5);
    expect(reservedControl(r, "c", 3)).toBe(0);
    expect(reservedControl(null, "c", 2)).toBe(0);
  });
});
