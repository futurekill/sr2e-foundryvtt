import { describe, it, expect } from "vitest";
import {
  skillTiersFromAllocation, validateSkillAllocation, allocationFromLegacyRating,
  skillChargenSpend, effectiveSkillRating, skillSubRatings
} from "../module/rules/sr2e-rules.mjs";

/**
 * SR2E p.70's worked example is the anchor: Firearms allocated 5 becomes
 * Firearms 4 / SMG 6 with a Concentration, or Firearms 3 / SMG 5 / Uzi III 7
 * with a Specialization.
 */
describe("skillTiersFromAllocation — the book's own example (p.70)", () => {
  it("leaves a plain skill alone", () => {
    expect(skillTiersFromAllocation(5)).toEqual({ general: 5, concentration: 0, specialization: 0 });
  });

  it("concentration: +1 to the sub, −1 to the general", () => {
    expect(skillTiersFromAllocation(5, true)).toEqual(
      { general: 4, concentration: 6, specialization: 0 });
  });

  it("specialization: +2 to the sub, −2 to the general, and a concentration at the original", () => {
    expect(skillTiersFromAllocation(5, true, true)).toEqual(
      { general: 3, concentration: 5, specialization: 7 });
  });

  it("grants the concentration even if only a specialization was named (p.70)", () => {
    // "the character gains a Concentration governing the Specialization at a
    // rating equal to the original general skill rating"
    expect(skillTiersFromAllocation(5, false, true).concentration).toBe(5);
  });

  it("stays consistent with skillSubRatings read against the FINAL general", () => {
    // The old helper is still correct for a finished chargen skill, and the two
    // must not disagree or the sheet and the roll would show different numbers.
    for (const a of [2, 3, 5, 8]) {
      const conc = skillTiersFromAllocation(a, true);
      expect(skillSubRatings(conc.general).concentration).toBe(conc.concentration);
      const spec = skillTiersFromAllocation(a, true, true);
      expect(skillSubRatings(spec.general).concentration).toBe(spec.concentration);
      expect(skillSubRatings(spec.general).specialization).toBe(spec.specialization);
    }
  });
});

describe("validateSkillAllocation — reject, never clamp", () => {
  it("accepts allocations that leave a non-negative general", () => {
    expect(validateSkillAllocation(1).ok).toBe(true);
    expect(validateSkillAllocation(1, true).ok).toBe(true);        // general 0
    expect(validateSkillAllocation(2, true, true).ok).toBe(true);  // general 0
  });

  it("rejects a specialization that would drive the general negative", () => {
    const r = validateSkillAllocation(1, true, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/at least 2/);
  });

  it("rejects zero, negative and fractional allocations", () => {
    expect(validateSkillAllocation(0).ok).toBe(false);
    expect(validateSkillAllocation(-3).ok).toBe(false);
    expect(validateSkillAllocation(2.5).ok).toBe(false);
  });
});

describe("allocationFromLegacyRating — inverts the manual reduction", () => {
  it("recovers what the player actually spent", () => {
    expect(allocationFromLegacyRating(5)).toBe(5);
    expect(allocationFromLegacyRating(4, true)).toBe(5);
    expect(allocationFromLegacyRating(3, true, true)).toBe(5);
  });

  it("round-trips through skillTiersFromAllocation", () => {
    for (const [r, c, s] of [[5, false, false], [4, true, false], [3, true, true]]) {
      const a = allocationFromLegacyRating(r, c, s);
      expect(skillTiersFromAllocation(a, c, s).general).toBe(r);
    }
  });
});

describe("skillChargenSpend — the budget bug (finding 2)", () => {
  it("charges the allocation, not the reduced general", () => {
    expect(skillChargenSpend({ allocated: 5 })).toBe(5);
  });

  it("charges a legacy concentration 5, not the 4 on the sheet", () => {
    expect(skillChargenSpend({ rating: 4, concentration: { name: "SMG" } })).toBe(5);
  });

  it("charges a legacy specialization 5, not the 3 on the sheet", () => {
    expect(skillChargenSpend({
      rating: 3, concentration: { name: "SMG" }, specialization: { name: "Uzi III" }
    })).toBe(5);
  });

  it("approximates a finalized skill with no allocation, without inverting p.70", () => {
    // History is unknown here (migrated, or bought with Karma after creation).
    // The current general is an approximation; inverting p.70 would invent the
    // +2 for the specialization as if someone had paid chargen points for it.
    expect(skillChargenSpend({ rating: 6, ratingsFinalized: true,
      specialization: { name: "Uzi III" } })).toBe(6);
  });

  it("reports the EXACT spend for a skill this system finalized", () => {
    // finalizePendingSkills retains `allocated`, so no approximation is needed.
    expect(skillChargenSpend({ rating: 3, allocated: 5, ratingsFinalized: true,
      concentration: { name: "SMG" }, specialization: { name: "Uzi III" } })).toBe(5);
  });
});

describe("effectiveSkillRating — the single rating selector", () => {
  const skill = {
    rating: 3,
    concentration: { name: "SMG", rating: 5 },
    specialization: { name: "Uzi III", rating: 7 }
  };

  it("returns the right tier for each variant", () => {
    expect(effectiveSkillRating(skill)).toBe(3);
    expect(effectiveSkillRating(skill, "concentration")).toBe(5);
    expect(effectiveSkillRating(skill, "specialization")).toBe(7);
  });

  it("falls back to the general for a variant that is not set", () => {
    expect(effectiveSkillRating({ rating: 4 }, "specialization")).toBe(4);
  });

  it("SUPPRESSES sub-ratings while a skillsoft supplies the skill", () => {
    // A chip is not a Concentration. Without this, weapon-name fallback would
    // still find and roll the natural specialization behind the chip.
    const chipped = { ...skill, rating: 6, _subRatingsSuppressed: true };
    expect(effectiveSkillRating(chipped, "specialization")).toBe(6);
    expect(effectiveSkillRating(chipped, "concentration")).toBe(6);
    expect(effectiveSkillRating(chipped)).toBe(6);
  });

  it("leaves the stored sub-ratings intact while suppressed, so unslotting restores them", () => {
    const chipped = { ...skill, rating: 6, _subRatingsSuppressed: true };
    expect(chipped.specialization.rating).toBe(7);
    const unslotted = { ...chipped, rating: 3, _subRatingsSuppressed: false };
    expect(effectiveSkillRating(unslotted, "specialization")).toBe(7);
  });

  it("handles a missing system without throwing", () => {
    expect(effectiveSkillRating(null, "concentration")).toBe(0);
  });
});
