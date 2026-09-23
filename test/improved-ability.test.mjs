import { describe, it, expect } from "vitest";
import { improvedAbilitySkill } from "../module/rules/sr2e-rules.mjs";

// Reported from the table: a physical adept with Improved Ability (Armed Combat)
// at level 2 and a Force 3 weapon focus rolled 9 dice with his katana instead of
// 11. The power was named for its skill; `improvedSkill` was empty, so the power
// granted nothing — silently.
describe("improvedAbilitySkill — the skill named in the power's title", () => {
  it("reads the skill the way players actually name the power", () => {
    expect(improvedAbilitySkill("Improved Ability (Armed Combat)")).toBe("Armed Combat");
    expect(improvedAbilitySkill("Improved Ability (Stealth)")).toBe("Stealth");
    expect(improvedAbilitySkill("improved ability (athletics)")).toBe("athletics");
  });

  it("keeps a Build/Repair skill whole", () => {
    expect(improvedAbilitySkill("Improved Ability (Computers (B/R))")).toBe("Computers (B/R)");
  });

  it("returns nothing for the bare compendium name", () => {
    expect(improvedAbilitySkill("Improved Ability")).toBe("");
  });

  it("NEVER reads another power's brackets as a skill", () => {
    // These carry parentheses too. Treating them as skills would be wrong even
    // where no skill of that name happens to exist.
    expect(improvedAbilitySkill("Killing Hands (M)")).toBe("");
    expect(improvedAbilitySkill("Improved Physical Senses (Thermo Vision)")).toBe("");
    expect(improvedAbilitySkill("Increased Reflexes")).toBe("");
  });

  it("tolerates missing input", () => {
    expect(improvedAbilitySkill(undefined)).toBe("");
    expect(improvedAbilitySkill(null)).toBe("");
  });
});

import { cappedImprovedAbilityDice } from "../module/rules/sr2e-rules.mjs";

describe("cappedImprovedAbilityDice — the Combat Skill cap (SR2E p.125)", () => {
  it("leaves the reported character alone: Armed Combat 6, two dice", () => {
    expect(cappedImprovedAbilityDice("Armed Combat", 6, 2)).toBe(2);
  });

  it("uses the book's own example: Firearms 4 cannot have more than 4", () => {
    expect(cappedImprovedAbilityDice("Firearms", 4, 6)).toBe(4);
    expect(cappedImprovedAbilityDice("Firearms", 4, 4)).toBe(4);
  });

  it("caps every combat skill the p.125 table lists", () => {
    for (const s of ["Armed Combat","Unarmed Combat","Throwing Weapons",
                     "Projectile Weapons","Firearms","Gunnery"])
      expect(cappedImprovedAbilityDice(s, 2, 5)).toBe(2);
  });

  it("does NOT cap a non-combat skill", () => {
    expect(cappedImprovedAbilityDice("Stealth", 2, 5)).toBe(5);
    expect(cappedImprovedAbilityDice("Athletics", 1, 4)).toBe(4);
  });

  it("caps the aggregate, so two powers cannot split their way past it", () => {
    // Caller sums the powers first; the cap then applies to the total.
    expect(cappedImprovedAbilityDice("Armed Combat", 3, 2 + 2)).toBe(3);
  });

  it("never goes negative or fractional", () => {
    expect(cappedImprovedAbilityDice("Firearms", 0, 3)).toBe(0);
    expect(cappedImprovedAbilityDice("Firearms", 4, -2)).toBe(0);
    expect(cappedImprovedAbilityDice("Firearms", 4.9, 5)).toBe(4);
  });
});
