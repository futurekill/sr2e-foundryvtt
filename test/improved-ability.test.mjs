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
