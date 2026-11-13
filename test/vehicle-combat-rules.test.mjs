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
