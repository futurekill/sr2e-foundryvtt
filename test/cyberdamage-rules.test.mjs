// Cyberware damage, repair and scarring (docs/PLAN-cybertechnology-phase5.md; Cybertechnology pp.44–49, 56).
import { describe, it, expect } from "vitest";
import { woundLevel, woundThreshold, gradeResistTN, TABLES, secondaryEffect, degrades, skinBody, skinRepairPrice,
         scarSeverity, scarProcedures } from "../module/rules/cyberdamage-rules.mjs";

describe("the quick-and-dirty system (p.44)", () => {
  it("wound levels and thresholds", () => {
    expect([5, 6, 9, 10, 14].map(woundLevel)).toEqual([null, "S", "S", "D", "D"]);
    expect([woundThreshold("S"), woundThreshold("D")]).toEqual([6, 10]);
  });
  it("grade resistance TNs; standard has none", () => {
    expect([gradeResistTN("alpha", "S"), gradeResistTN("alpha", "D"), gradeResistTN("beta", "S"), gradeResistTN("delta", "D")]).toEqual([5, 6, 4, 4]);
    expect(gradeResistTN("standard", "S")).toBe(null);
  });
});

describe("secondary tables (pp.45, 47, 49)", () => {
  it("every table covers 2..12 and the repair TN is half the roll", () => {
    for (const t of Object.keys(TABLES)) for (let r = 2; r <= 12; r++) expect(secondaryEffect(t, r).effect).toBeTruthy();
    expect(secondaryEffect("eye", 7)).toEqual({ effect: expect.stringMatching(/Blurred/), repairTN: 3 });
    expect(secondaryEffect("eye", 10).effect).toMatch(/One eye fails/);
    expect(secondaryEffect("ear", 11).effect).toMatch(/One ear fails/);
    expect(secondaryEffect("limb", 5).effect).toMatch(/twitches/);
    expect(secondaryEffect("comm", 12).effect).toMatch(/Total/);
    expect(secondaryEffect("other", 9)).toEqual({ effect: "Damaged (GM).", repairTN: 0 });
  });
});

describe("skin and scars (pp.47–48, 56)", () => {
  it("degradation, the Body clamp, prices", () => {
    expect(degrades(2, 3)).toBe(true);
    expect(degrades(3, 3)).toBe(false);
    expect(skinBody(2, 3)).toBe(0);
    expect(skinBody(3, 1)).toBe(2);
    expect(skinRepairPrice("dermal-plating", 2)).toBe(4000);
    expect(skinRepairPrice("dermal-sheath", 2)).toBe(6500);
  });
  it("scar severities and surgery from the CURRENT severity", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(scarSeverity)).toEqual(["Terrible", "Major", "Major", "Noticeable", "Noticeable", "Minor", "Minor"]);
    expect(scarProcedures("Terrible")[0][0]).toBe("Minor");
    expect(scarProcedures("Minor")[0][0]).toBe("removed");
    expect(scarProcedures("removed")).toEqual([]);
  });
});
