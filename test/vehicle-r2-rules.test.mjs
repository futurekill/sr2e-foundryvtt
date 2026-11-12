// Rigger 2 standard vehicle operations (docs/PLAN-vehicles-phase2.md Part 2a).
import { describe, it, expect } from "vitest";
import { drivingTN, stressDice, ruleOfOne, drivingStressOutcome, r2Speed, overhaul, repairQuote, repairHours,
  engineFailureStress, permanentStress } from "../module/rules/vehicle-r2-rules.mjs";

describe("Driving Test TN (R2 p.21)", () => {
  it("Whiz Kid lands the Dragon: 5 +1 −1 +2 +2 −2 = 7 (the example prints 8: its own rows sum to 7, a misprint)", () => {
    expect(drivingTN({ handling: 5, unfamiliar: true, situation: "calm", size: "large", weather: "bad", mode: "rigged", vcr: 1 }).tn).toBe(7);
  });
  it("terrain, combat, datajack; the rig bonus only in rigged mode; floor 2", () => {
    expect(drivingTN({ handling: 4, terrain: "tight", combat: true }).tn).toBe(9);
    expect(drivingTN({ handling: 4, terrain: "open", mode: "datajack" }).tn).toBe(2);
    expect(drivingTN({ handling: 4, mode: "manual", vcr: 3 }).tn).toBe(4);
    expect(drivingTN({ handling: 2, mode: "rigged", vcr: 3 }).tn).toBe(2);
    expect(drivingTN({ handling: 4, damageMod: 2, otherMod: 1 }).tn).toBe(7);
  });
});

describe("Stress (R2 p.25–26)", () => {
  it("extra dice: 2 Stress each, at most Body Stress (Body 1 may take 2)", () => {
    expect(stressDice(5, 3)).toEqual({ dice: 1, stress: 2 });   // Westwind, Body 3
    expect(stressDice(5, 6)).toEqual({ dice: 3, stress: 6 });
    expect(stressDice(1, 1)).toEqual({ dice: 1, stress: 2 });
    expect(stressDice(2, 0)).toEqual({ dice: 0, stress: 0 });
  });
  it("Rule of One: 1s ≥ the skill", () => {
    expect([ruleOfOne(5, 5), ruleOfOne(4, 5), ruleOfOne(3, 0)]).toEqual([true, false, false]);
  });
  it("Rigger X's Westwind: Stress Test 4 vs 2 does nothing, then Rule of One +4 → 6 = 2 × Body 3 fails", () => {
    expect(drivingStressOutcome({ failed: true, stress: 2, body: 3, ones: 5, skill: 5, stressRoll: 4, ruleRoll: 4 }))
      .toEqual({ stressTest: true, failure: "ruleOfOne", addStress: 4 });
    expect(drivingStressOutcome({ failed: true, stress: 5, body: 3, ones: 0, skill: 5, stressRoll: 4 }).failure).toBe("stressTest");
    expect(drivingStressOutcome({ failed: false, stress: 9, body: 3, ones: 1, skill: 5 })).toEqual({ stressTest: false, failure: null, addStress: 0 });
  });
  it("overhaul: TN Stress + 4, 2 successes a point, floor 1 and the permanent part", () => {
    expect(overhaul({ stress: 6, successes: 5 })).toEqual({ tn: 10, removed: 2, stress: 4, parts: 100 });
    expect(overhaul({ stress: 2, successes: 9 }).stress).toBe(1);
    expect(overhaul({ stress: 5, permanent: 3, successes: 10 }).stress).toBe(3);
    expect(overhaul({ stress: 0, successes: 4 }).removed).toBe(0);
  });
  it("engine failure stress and the permanent sum", () => {
    expect([1, 2, 3, 6].map(engineFailureStress)).toEqual([1, 1, 2, 3]);
    expect(permanentStress({ a: { points: 2 }, b: { points: 1 } })).toBe(3);
  });
});

describe("Speed and repairs (R2 p.22, p.26)", () => {
  it("off-road halves the rating without off-road suspension; max 1.5×", () => {
    expect(r2Speed(50)).toEqual({ rating: 50, max: 75 });
    expect(r2Speed(75, { offRoad: true })).toEqual({ rating: 37, max: 55 });
    expect(r2Speed(75, { offRoad: true, suspension: true }).rating).toBe(75);
  });
  it("repair: Light box on a 40,000¥ vehicle → TN 3, 16 h, 2,000¥", () => {
    expect(repairQuote({ boxes: 1, value: 40000 })).toEqual({ tn: 3, baseHours: 16, parts: 2000 });
    expect(repairHours(48, 3)).toBe(16);
    expect(repairHours(48, 0)).toBeNull();
  });
});
