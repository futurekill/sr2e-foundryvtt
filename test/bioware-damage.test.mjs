import { describe, it, expect } from "vitest";
import { bioDamageLevel, pickTargets, addBioDamage, bioFunctions, bioLevel, bioHealFloor, bioHealHours }
  from "../module/rules/bioware-damage-rules.mjs";

// Shadowtech p.6 (rendered); user ruling: only Serious or worse switches bioware off.
describe("bioware damage", () => {
  it("1D6 (−1 cultured): 0 none, 1–2 L, 3–4 M, 5 S, 6 D", () => {
    expect([1, 2, 3, 4, 5, 6].map(r => bioDamageLevel(r))).toEqual(["L", "L", "M", "M", "S", "D"]);
    expect(bioDamageLevel(1, true)).toBeNull();
    expect(bioDamageLevel(6, true)).toBe("S");
  });
  it("random picks: a repeat is no hit", () => {
    expect(pickTargets([2, 2, 1], 3)).toEqual([1, null, 0]);
  });
  it("hits add up; past Deadly is destroyed (sticky), stored at 10", () => {
    expect(addBioDamage(3, "M")).toEqual({ damage: 6, destroyed: false });
    expect(addBioDamage(6, "S")).toEqual({ damage: 10, destroyed: true });
    expect(addBioDamage(10, null, true)).toEqual({ damage: 10, destroyed: true });
  });
  it("works below Serious only", () => {
    expect(bioFunctions({ damage: 5 })).toBe(true);
    expect(bioFunctions({ damage: 6 })).toBe(false);
    expect(bioFunctions({ damage: 0, destroyed: true })).toBe(false);
  });
  it("heals a level at half the general time", () => {
    expect(bioLevel(7)).toBe("S");
    expect(bioHealFloor("S")).toBe(3);
    expect(bioHealHours("S", 4)).toBe(60);    // Serious: 480 h ÷ 4 = 120 h, halved
  });
});

describe("secondhand bioware (Shadowtech p.12)", () => {
  it("+1 on the roll; a 7 destroys it", () => {
    expect(bioDamageLevel(4, "secondhand")).toBe("S");
    expect(bioDamageLevel(6, "secondhand")).toBe("X");
    expect(addBioDamage(0, "X")).toEqual({ damage: 10, destroyed: true });
  });
});
