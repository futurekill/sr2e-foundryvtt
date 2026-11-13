// Rigger 2 vehicle combat, the chase (R2 p.41–49): the book's own examples.
import { describe, it, expect } from "vitest";
import { VEHICLE_POINTS, r2ClassFor, speedPoints, openTestResult, maneuverScore, msMod, accelerateTN, positioningTN,
         hidingTN, relocatingTN, applySpeedChange, ramEntitled, stopAtPoint, closeDistance, passengerMayAttack,
         fastestMember } from "../module/rules/vehicle-combat-rules.mjs";

describe("Maneuver Score (p.41–42)", () => {
  it("has the 20 Vehicle Points rows", () => {
    expect(Object.keys(VEHICLE_POINTS)).toHaveLength(20);
    expect(VEHICLE_POINTS.fighterJet).toBe(20);
    expect(VEHICLE_POINTS.semiballistic).toBe(-25);
  });
  it("derives a class from the design, then the type; an explicit class wins; drones have none", () => {
    expect(r2ClassFor({ category: "bike" })).toBe("motorcycle");
    expect(r2ClassFor({ vehicleType: "rotor" })).toBe("helicopter");
    expect(r2ClassFor({ vehicleType: "ground", traits: ["zeppelin"] })).toBe("lta");
    expect(r2ClassFor({ r2Class: "sportsCar", category: "car" })).toBe("sportsCar");
    expect(r2ClassFor({ vehicleType: "drone" })).toBeNull();
  });
  it("Rich's Open Test: 6,6,4,3,1 re-rolling sixes → 16", () => {
    expect(openTestResult([[6, 6, 4], [6, 2], [4], [3], [1]])).toBe(16);
    expect(openTestResult([])).toBe(0);
  });
  it("Speed Points round down; MS sums (Rigger X 26 + 11 = 37)", () => {
    expect(speedPoints(259)).toBe(25);
    expect(maneuverScore({ vp: 3, tp: -2, sp: 25, dp: 11 })).toBe(37);
  });
  it("compares Maneuver Scores at the 10/11 boundary", () => {
    const row = [-2, -4, 2, 4];
    expect(msMod(50, 40, row)).toBe(-2);
    expect(msMod(51, 40, row)).toBe(-4);
    expect(msMod(37, 40, row)).toBe(2);
    expect(msMod(29, 40, row)).toBe(4);
    expect(msMod(40, 40, row)).toBe(0);
  });
});

describe("Accelerating / braking (p.45–46)", () => {
  it("Rigger X: Handling 3, opponent +2, two pursuers +1, over +1, VCR 2 → TN 5; 2 × 18 → 286", () => {
    expect(accelerateTN({ handling: 3, ms: 37, oppMs: 40, extraPursuers: 1, over: true, vcr: 2 }).tn).toBe(5);
    expect(applySpeedChange({ speed: 250, acceleration: 18, successes: 2, speedRating: 210 }))
      .toEqual({ speed: 286, change: 36 });
  });
  it("Cruiser #2: Handling 4, −2, over +1, autonav 3 → TN 6; 3 × 14 → 317", () => {
    expect(accelerateTN({ handling: 4, ms: 40, oppMs: 37, over: true, autonav: 3 }).tn).toBe(6);
    expect(applySpeedChange({ speed: 275, acceleration: 14, successes: 3, speedRating: 240 }).speed).toBe(317);
  });
  it("caps at Speed Rating × 1.5 without forcing a faster vehicle down; braking stops at 0", () => {
    expect(applySpeedChange({ speed: 140, acceleration: 20, successes: 3, speedRating: 100 }).speed).toBe(150);
    expect(applySpeedChange({ speed: 170, acceleration: 20, successes: 3, speedRating: 100 }).speed).toBe(170);
    expect(applySpeedChange({ speed: 30, acceleration: 20, successes: 3, speedRating: 100, brake: true }).speed).toBe(0);
  });
  it("a change of at least twice the distance entitles a ram (p.45, p.47: 110 vs 50)", () => {
    expect(ramEntitled(110, 50)).toBe(true);
    expect(ramEntitled(100, 50)).toBe(true);
    expect(ramEntitled(99, 50)).toBe(false);
  });
  it("close of turn: 317 vs 286 closes 31 m; never below 0", () => {
    expect(closeDistance(300, 317, 286)).toBe(269);
    expect(closeDistance(20, 317, 286)).toBe(0);
    expect(closeDistance(100, 200, 250)).toBe(150);
  });
});

describe("Positioning (p.47)", () => {
  it("Cruiser #1: Handling 4 + over 1 → TN 5", () => {
    expect(positioningTN({ handling: 4, over: true }).tn).toBe(5);
  });
  it("Josie: 4 × 14 = 56 of 140 — short, speed unchanged", () => {
    expect(stopAtPoint({ successes: 4, acceleration: 14, distance: 140 })).toEqual({ reached: false, travelled: 56, short: 84 });
    expect(stopAtPoint({ successes: 10, acceleration: 14, distance: 140 }).reached).toBe(true);
  });
});

describe("Hiding and relocating (p.48–49)", () => {
  it("Mach 6: base 6, MS +10 −2, over +2, restricted 0, VCR 2 → TN 4", () => {
    expect(hidingTN({ handling: 6, ms: 46, oppMs: 36, over: true, terrain: "restricted", vcr: 2 }).tn).toBe(4);
  });
  it("relocating adds the hiding successes (+4) and the hiding vehicle's terrain", () => {
    const r = relocatingTN({ signature: 4, ms: 36, hideMs: 46, hideSuccesses: 4, hideTerrain: "tight", autonav: 3 });
    expect(r.tn).toBe(4 + 2 + 4 + 3 - 3);
  });
});

describe("Passengers and groups (p.49)", () => {
  it("Blade (Initiative 17, DP 11) loses phase 17; the rigger doesn't; nobody before DP", () => {
    expect(passengerMayAttack({ phase: 17, dp: 11 })).toBe(false);
    expect(passengerMayAttack({ phase: 7, dp: 11 })).toBe(true);
    expect(passengerMayAttack({ phase: 17, dp: 11, isRigger: true })).toBe(true);
    expect(passengerMayAttack({ phase: 3, dp: null })).toBe(false);
  });
  it("a group uses its fastest member", () => {
    expect(fastestMember([{ id: "a", speedRating: 200 }, { id: "b", speedRating: 240 }]).id).toBe("b");
  });
});

import { r2Impact, stageDown, ramTN, ramDamage, impactResist, occupantImpact, crashTestTN, wallCollision, pedestrianImpact,
         r2VehicleHit, terrainControlCap, passengerShotPower } from "../module/rules/vehicle-combat-rules.mjs";

describe("Damage (R2 p.49–53)", () => {
  it("impact rounds the Power UP: 148 m → 15S; 300 → 30D; parked → nothing", () => {
    expect(r2Impact(148)).toEqual({ power: 15, level: "S" });
    expect(r2Impact(300)).toEqual({ power: 30, level: "D" });
    expect(r2Impact(20)).toEqual({ power: 2, level: "L" });
    expect(r2Impact(0)).toBeNull();
  });
  it("the ram: 15S both; Mach 6's Body 3 × 5 successes → TN 2, 8 dice stage it away; the cruiser rolls 3 + 2 PR", () => {
    const d = ramDamage({ rammerSpeed: 152, targetSpeed: 300, rammerBody: 3, successes: 5 });
    expect(d.target).toEqual({ power: 15, level: "S" });
    expect(impactResist({ body: 3, control: 5, power: d.rammer.power })).toEqual({ dice: 8, tn: 2 });
    expect(stageDown("S", 6)).toBeNull();
    expect(impactResist({ body: 3, pr: 2, power: 15 })).toEqual({ dice: 5, tn: 15 });
    expect(stageDown("S", 0)).toBe("S");
  });
  it("Ramming modifiers: autonav adds Rating + 2; tight terrain +2", () => {
    expect(ramTN({ handling: 3, autonav: 3, terrain: "tight" }).tn).toBe(3 + 5 + 2);
  });
  it("the cops: 15S, seat belt → 15M, APPS → 8M, armour vest 3 → 5M", () => {
    expect(occupantImpact({ power: 15, level: "S", restrained: true, apps: true, impactArmor: 3 })).toEqual({ power: 5, level: "M", extraDice: 0 });
    expect(occupantImpact({ power: 4, level: "L", restrained: true })).toBeNull();
  });
  it("Crash Test: Cruiser #2, Handling 4, Serious +3, 300 m vs Reaction 4 → +4 = 11 (+2 wound by the roll = 13)", () => {
    expect(crashTestTN({ handling: 4, damageTn: 3, speed: 300, reaction: 4 }).tn).toBe(11);
    expect(crashTestTN({ handling: 4, speed: 79, reaction: 4 }).tn).toBe(4);
    expect(crashTestTN({ handling: 4, speed: 80, reaction: 4 }).tn).toBe(5);
    expect(crashTestTN({ handling: 4, speed: 160, reaction: 4 }).tn).toBe(8);
  });
  it("walls: Cruiser #2 at 300 vs Barrier 16 stops (320 ≥ 300); through a 4 at 300: loses 80, 4M", () => {
    expect(wallCollision({ speed: 300, barrier: 16 })).toMatchObject({ halts: true, speed: 0, damage: { power: 30, level: "D" } });
    expect(wallCollision({ speed: 300, barrier: 4 })).toEqual({ halts: false, speed: 220, damage: { power: 4, level: "S" } });
  });
  it("pedestrians: Rex Karz at 60 → 6S for the pedestrian, Light for the car; hardened armour: no step", () => {
    expect(pedestrianImpact({ speed: 60 })).toEqual({ pedestrian: { power: 6, level: "S" }, vehicle: { power: 6, level: "L" } });
    expect(pedestrianImpact({ speed: 15 }).vehicle).toBeNull();
    expect(pedestrianImpact({ speed: 60, hardened: true }).pedestrian.level).toBe("M");
    expect(pedestrianImpact({ speed: 250 }).pedestrian).toEqual({ power: 37, level: "D" });
  });
  it("weapons: −1 level, armour cuts Power, Body dice vs the rest; Light needs special ammo; AV halves armour", () => {
    expect(r2VehicleHit({ body: 4, armor: 6, power: 10, level: "S" })).toMatchObject({ level: "M", dice: 4, tn: 4 });
    expect(r2VehicleHit({ body: 4, armor: 6, power: 6, level: "D" }).none).toBe("barrier");
    expect(r2VehicleHit({ body: 4, armor: 0, power: 6, level: "L" }).none).toBe("light");
    expect(r2VehicleHit({ body: 4, armor: 0, power: 6, level: "L", apds: true }).level).toBe("L");
    expect(r2VehicleHit({ body: 4, armor: 8, power: 6, level: "D", antiVehicle: true })).toMatchObject({ level: "D", tn: 2 });
    expect(r2VehicleHit({ body: 4, armor: 0, power: 6, level: "S", damageType: "stun" }).none).toBe("stun");
  });
  it("terrain Control Pool caps and shots at passengers", () => {
    expect([terrainControlCap(5, "normal"), terrainControlCap(5, "restricted"), terrainControlCap(5, "tight")]).toEqual([5, 3, 2]);
    expect(passengerShotPower({ power: 9, armor: 3, body: 4 })).toBe(5);
  });
});
