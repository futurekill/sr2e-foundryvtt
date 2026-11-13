// Rigger 2 standard vehicle operations (docs/PLAN-vehicles-phase2.md Part 2a).
import { describe, it, expect } from "vitest";
import { drivingTN, stressDice, ruleOfOne, drivingStressOutcome, r2Speed, overhaul, repairQuote, repairHours,
  engineFailureStress, permanentStress, rigBonuses, vcrPerCircle, isVehicleSkillName } from "../module/rules/vehicle-r2-rules.mjs";

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

describe("rigBonuses (R2 p.17–18, Monkeywrench)", () => {
  it("VCR 3, Reaction 4: +6 / 4D6 / pool 10", () => expect(rigBonuses({ vcr: 3, reaction: 4 })).toEqual({ reaction: 6, initiativeDice: 4, controlPool: 10 }));
  it("MBW 1: +4 / 3D6 / pool 9", () => expect(rigBonuses({ vcr: 3, mbw: 1, reaction: 4 })).toEqual({ reaction: 4, initiativeDice: 3, controlPool: 9 }));
  it("MBW 3: no bonus, pool 7", () => expect(rigBonuses({ vcr: 3, mbw: 3, reaction: 4 })).toEqual({ reaction: 0, initiativeDice: 1, controlPool: 7 }));
  it("MBW 4: pool 6", () => expect(rigBonuses({ vcr: 3, mbw: 4, reaction: 4 })).toEqual({ reaction: 0, initiativeDice: 1, controlPool: 6 }));
  it("no VCR: no pool", () => expect(rigBonuses({ vcr: 0, reaction: 4 }).controlPool).toBe(0));
});

describe("VCR half-cost defaulting (R2 p.12)", () => {
  it("vehicle → vehicle and Reaction → vehicle cost 1 per dot; others 2", () => {
    const f = vcrPerCircle("motorboat");
    expect(f("car", "skill")).toBe(1);
    expect(f("reaction", "attribute")).toBe(1);
    expect(f("quickness", "attribute")).toBe(2);
    expect(f("groundVehicles", "skill")).toBe(2);   // Vehicle B/R isn't a vehicle skill here
  });
  it("non-vehicle destination: normal costs", () => expect(vcrPerCircle("groundVehicles")).toBeUndefined());
  it("Deacon: Car → Motorboat is 4 dots (+8, +4 with a VCR); Reaction → Motorboat 2 dots (+4, +2)", async () => {
    const { webDefaultingTN, findBestPath } = await import("../module/rules/sr2e-rules.mjs");
    const web = (await import("../module/config.mjs")).SR2E.skillWeb;
    const f = vcrPerCircle("motorboat");
    expect(findBestPath(web, "motorboat", "car").circles * f("car", "skill")).toBe(4);
    expect(webDefaultingTN(web, "motorboat", [{ node: "car", rating: 5 }])).toEqual({ penalty: 4, source: "reaction", kind: "attribute" });
    expect(webDefaultingTN(web, "motorboat", [{ node: "car", rating: 5 }], { perCircle: f })).toEqual({ penalty: 2, source: "reaction", kind: "attribute" });
  });
  it("isVehicleSkillName", () => {
    expect(isVehicleSkillName("Winged Aircraft")).toBe(true);
    expect(isVehicleSkillName("Car")).toBe(true);
    expect(isVehicleSkillName("Car (B/R)")).toBe(false);
    expect(isVehicleSkillName("Firearms")).toBe(false);
  });
});

describe("qualities (R2 p.15)", async () => {
  const { neuralWillpower, qualityRule, gremlinsOutcome } = await import("../module/rules/quality-rules.mjs");
  it("Sensitive Neural Structure −1/−2, never below 1; Spike Resistance +1 per 2", () => {
    expect(neuralWillpower(5, { "sensitive-neural-structure": 2 })).toBe(4);
    expect(neuralWillpower(5, { "sensitive-neural-structure": 4 })).toBe(3);
    expect(neuralWillpower(2, { "sensitive-neural-structure": 4 })).toBe(1);
    expect(neuralWillpower(5, { "spike-resistance": 2 })).toBe(6);
    expect(neuralWillpower(5, { "spike-resistance": 4 })).toBe(7);
    expect(neuralWillpower(5, {})).toBe(5);
  });
  it("rule: explicit field, else the pack source", () => {
    expect(qualityRule("gremlins")).toBe("gremlins");
    expect(qualityRule("", "Compendium.sr2e-rigger-2.r2-qualities.Item.f94365525601975a")).toBe("simsense-vertigo");
    expect(qualityRule("", "Compendium.x.y.Item.z")).toBeNull();
  });
  it("Gremlins: only a 2 on 2D6, tier by value; immune equipment never", () => {
    expect(gremlinsOutcome(3, -2)).toBeNull();
    expect(gremlinsOutcome(2, -3)).toBe("Tier3");
    expect(gremlinsOutcome(2, -4, { immune: true })).toBeNull();
  });
});
