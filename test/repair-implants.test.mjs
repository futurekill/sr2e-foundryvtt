import { describe, it, expect } from "vitest";
import { repairedFieldValue, REPAIRABLE_IMPLANT_FIELDS } from "../module/rules/sr2e-rules.mjs";

// Foundry never updates a compendium item already on a character, so an implant
// dragged before a field existed keeps the schema default. The repair fills only
// those — never a value a GM set.
describe("repairedFieldValue", () => {
  it("restores a default field from a real source value (the stale case)", () => {
    // Bone lacing installed pre-0.38.0: embedded 0, compendium 3.
    expect(repairedFieldValue(0, 3, 0)).toBe(3);
    // Enhanced Articulation: embedded 0, compendium 1.
    expect(repairedFieldValue(0, 1, 0)).toBe(1);
  });

  it("leaves a field the GM has already set", () => {
    // Not the default any more → assume intentional, hands off. This is the
    // guard against clobbering deliberate edits.
    expect(repairedFieldValue(2, 3, 0)).toBeNull();
    expect(repairedFieldValue(3, 3, 0)).toBeNull();
    expect(repairedFieldValue(1, 0, 0)).toBeNull();
  });

  it("does nothing when the source carries no information", () => {
    // Ordinary cyberware legitimately has unarmedPowerBonus 0 — no change.
    expect(repairedFieldValue(0, 0, 0)).toBeNull();
    expect(repairedFieldValue(0, undefined, 0)).toBeNull();
    expect(repairedFieldValue(0, null, 0)).toBeNull();
  });

  it("whitelist is well-formed [type, field, default] triples", () => {
    for (const entry of REPAIRABLE_IMPLANT_FIELDS) {
      expect(entry).toHaveLength(3);
      expect(typeof entry[0]).toBe("string");
      expect(typeof entry[1]).toBe("string");
    }
    // The two fields the player reports depend on must be covered.
    const fields = REPAIRABLE_IMPLANT_FIELDS.map((e) => e[1]);
    expect(fields).toContain("unarmedPowerBonus");
    expect(fields).toContain("activeSkillDice");
  });

  it("excludes boolean fields where the default is a meaningful 'off'", () => {
    // isTacticalComputer default false is indistinguishable from a GM disabling
    // it, so repairing it could re-enable something turned off on purpose. Only
    // number fields where 0 = 'feature absent' are safe (Codex).
    for (const [, field, dflt] of REPAIRABLE_IMPLANT_FIELDS) {
      expect(typeof dflt).toBe("number");
      expect(field).not.toBe("isTacticalComputer");
    }
  });
});
