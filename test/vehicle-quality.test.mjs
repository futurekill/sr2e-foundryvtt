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
