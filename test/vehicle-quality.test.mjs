import { describe, it, expect } from "vitest";
import { qualityEffects, qualityLevels, markUpFactor } from "../module/rules/vehicle-design.mjs";

describe("Quality Factors (R2 p.84–85)", () => {
  it("levels clamp to the printed maxima", () => {
    expect(qualityLevels({ masterWorkmanship: 5, ruggedness: 3, streamlined: 2, bogus: 1 })).toEqual({ masterWorkmanship: 3, ruggedness: 2, streamlined: 1 });
  });
  it("Maintenance ×.9 per Master Workmanship level, ×1.2 per Lemon level; Stress and B/R TNs", () => {
    expect(qualityEffects({ masterWorkmanship: 2 }).maintenance).toBe(0.81);
    expect(qualityEffects({ lemon: 3 }).maintenance).toBe(1.728);
    expect(qualityEffects({ ruggedness: 2, complexChassis: 1 })).toMatchObject({ stressTn: -2, brTn: 2, markUp: 0.7 });
    expect(qualityEffects({ safetyCertified: 1 }).collisionTn).toBe(-1);
    expect(qualityEffects({ prototype: 1 })).toMatchObject({ hiddenStress: true, markUp: -0.6 });
  });
  it("the modifier joins the Mark-Up BEFORE the special-design multipliers (p.84)", () => {
    const table = { base: { car: 1 }, multipliers: { drone: 2 } };
    const m = markUpFactor("car", { multipliers: { drone: true } }, table, { quality: { ruggedness: 1 } });
    expect(m.preMultiplier).toBe(1.5);
    expect(m.total).toBe(3);
    expect(markUpFactor("car", {}, table).total).toBe(1);   // existing callers unchanged
  });
});

import { drivingStressOutcome } from "../module/rules/vehicle-r2-rules.mjs";
import { assessMonth } from "../module/rules/vehicle-overhead-rules.mjs";
describe("Quality Factor consumers (R2 p.84)", () => {
  it("Ruggedness −1 per level on the Stress Test; Fragility +1", () => {
    const base = { failed: true, stress: 6, body: 4, ones: 0, skill: 3, stressRoll: 5 };
    expect(drivingStressOutcome(base).failure).toBe("stressTest");                 // 5 < 6
    expect(drivingStressOutcome({ ...base, stressTn: -2 }).failure).toBe(null);     // 5 ≥ 4
    expect(drivingStressOutcome({ ...base, stressRoll: 6, stressTn: 1 }).failure).toBe("stressTest");
  });
  it("Maintenance × the factor, rounded up", () => {
    expect(assessMonth({}, 1, { value: 40000, stress: 0 }).record.amount).toBe(400);
    expect(assessMonth({}, 1, { value: 40000, stress: 0, maintenance: 0.81 }).record.amount).toBe(324);
    expect(assessMonth({}, 1, { value: 40000, stress: 1, maintenance: 1.2 }).record.amount).toBe(492);
  });
});
