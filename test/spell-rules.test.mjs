import { describe, it, expect } from "vitest";
import { combatSpellOutcome, combatSpellTarget, targetKindOf, visibilityMod, spellSituationTN,
         ramEffect, isMisfire, inferDamageType, spellDamageType, isManualCombatSpell, isRamSpell }
  from "../module/rules/spell-rules.mjs";

// SR2E p.131: ties to the caster at the base level; 2 net successes stage one level.
describe("combatSpellOutcome", () => {
  it("a miscast has no effect", () => {
    expect(combatSpellOutcome({ casterSuccesses: 0, resistSuccesses: 0, baseLevel: "M" })).toMatchObject({ affected: false, why: "miscast" });
  });
  it("a tie does the base level", () => {
    expect(combatSpellOutcome({ casterSuccesses: 2, resistSuccesses: 2, baseLevel: "M" })).toMatchObject({ affected: true, why: "tie", level: "M", boxes: 3 });
  });
  it("more resistance successes resist it", () => {
    expect(combatSpellOutcome({ casterSuccesses: 2, resistSuccesses: 3, baseLevel: "S" })).toMatchObject({ affected: false, why: "resisted" });
  });
  it("stages one level per 2 net successes, capped at Deadly", () => {
    expect(combatSpellOutcome({ casterSuccesses: 3, resistSuccesses: 2, baseLevel: "L" }).level).toBe("L");
    expect(combatSpellOutcome({ casterSuccesses: 4, resistSuccesses: 2, baseLevel: "L" }).level).toBe("M");
    expect(combatSpellOutcome({ casterSuccesses: 9, resistSuccesses: 0, baseLevel: "M" })).toMatchObject({ level: "D", boxes: 10, stagedUp: 2 });
  });
});

describe("combatSpellTarget", () => {
  it("mana vs Willpower, physical vs Body (p.130)", () => {
    expect(combatSpellTarget({ spellType: "mana", target: { kind: "living", willpower: 5, body: 3 } })).toMatchObject({ tn: 5, resistAttr: "willpower", resistDice: 5 });
    expect(combatSpellTarget({ spellType: "physical", target: { kind: "living", willpower: 5, body: 3 } })).toMatchObject({ tn: 3, resistAttr: "body" });
  });
  it("mana spells don't affect vehicles or objects (p.127)", () => {
    expect(combatSpellTarget({ spellType: "mana", target: { kind: "vehicle" } }).eligible).toBe(false);
    expect(combatSpellTarget({ spellType: "mana", target: { kind: "object" } }).eligible).toBe(false);
  });
  it("vehicles: physical damage only, TN 8, Body + half armor (p.109)", () => {
    expect(combatSpellTarget({ spellType: "physical", damageType: "stun", target: { kind: "vehicle", body: 4 } }).eligible).toBe(false);
    expect(combatSpellTarget({ spellType: "physical", target: { kind: "vehicle", body: 4, armor: 3 } })).toMatchObject({ tn: 8, resistDice: 5 });
  });
  it("maps actor types", () => {
    expect(["character", "npc", "spirit", "vehicle", "ic"].map(targetKindOf)).toEqual(["living", "living", "living", "vehicle", "object"]);
  });
});

// Visibility Table p.89 (cybernetic/natural columns), movement p.83, cover and barriers p.130.
describe("situation modifiers", () => {
  it("reads the vision columns", () => {
    expect(visibilityMod("minimal", "normal")).toBe(6);
    expect(visibilityMod("minimal", "lowLightCyber")).toBe(4);
    expect(visibilityMod("minimal", "lowLightNatural")).toBe(2);
    expect(visibilityMod("fullDark", "thermoNatural")).toBe(2);
    expect(visibilityMod("heavySmoke", "thermoCyber")).toBe(1);
    expect(visibilityMod("thermalHeavy", "thermoCyber")).toBe(6);
  });
  it("adds cover, visibility, barrier/2, movement and other", () => {
    expect(spellSituationTN({ cover: true, visibility: "partial", barrierRating: 5, movement: "running", other: -1 }))
      .toEqual({ total: 4 + 2 + 2 + 4 - 1, parts: { cover: 4, visibility: 2, barrier: 2, movement: 4, other: -1 } });
    expect(spellSituationTN().total).toBe(0);
  });
});

describe("ramEffect (p.151 with p.98 doubling)", () => {
  it("nothing on a miscast", () => expect(ramEffect({ force: 6, successes: 0, barrierRating: 4 })).toBeNull());
  it("compares Force + successes with twice the rating", () => {
    // Power 7 vs rating 8: damaged (7 ≥ 4, ≤ 8).
    expect(ramEffect({ force: 5, successes: 2, barrierRating: 4 })).toMatchObject({ power: 7, rating: 8, tier: "damaged", ratingReduction: 1, lightBoxes: 1 });
    // Power 12 vs rating 6: exceeds by 6 = two increments of 3.
    expect(ramEffect({ force: 8, successes: 4, barrierRating: 3 })).toMatchObject({ tier: "breached", holes: 2, lightBoxes: 2 });
    expect(ramEffect({ force: 1, successes: 1, barrierRating: 8 }).tier).toBe("none");
  });
});

describe("misfire, damage type, special spells", () => {
  it("all ones is a misfire (p.131)", () => {
    expect(isMisfire([1, 1, 1])).toBe(true);
    expect(isMisfire([{ result: 1 }, { result: 2 }])).toBe(false);
    expect(isMisfire([])).toBe(false);
  });
  it("infers damage type in plan order", () => {
    expect(inferDamageType({ damageType: "physical", name: "Stunball" })).toBe("physical");
    expect(inferDamageType({ damageCode: "(F)M Stun" })).toBe("stun");
    expect(inferDamageType({ source: "Compendium.sr2e.spells.Item.4771d8048d316e8a" })).toBe("stun");
    expect(inferDamageType({ source: "Compendium.sr2e.spells.Item.35196693267b9409", name: "Sleepy Manaball" })).toBe("physical");
    expect(inferDamageType({ name: "Homebrew Stunner" })).toBe("stun");
    expect(inferDamageType({ name: "Firebolt" })).toBe("physical");
  });
  it("reads a document's source for the default", () => {
    expect(spellDamageType({ name: "Stun Bolt", system: {}, _stats: { compendiumSource: "Compendium.sr2e-grimoire.grim-spells.Item.ffacf666721c2cf1" } })).toBe("stun");
    expect(spellDamageType({ name: "Stun Bolt", system: { damageType: "" }, flags: { core: { sourceId: "Compendium.sr2e-grimoire.grim-spells.Item.ffacf666721c2cf1" } } })).toBe("stun");
  });
  it("flags the GM-resolved and Ram spells", () => {
    expect(isManualCombatSpell({ range: "touch" })).toBe(true);
    expect(isManualCombatSpell({ source: "Compendium.sr2e-grimoire.grim-spells.Item.970de2a41db97267" })).toBe(true);
    expect(isManualCombatSpell({ range: "los" })).toBe(false);
    expect(isRamSpell({ source: "Compendium.sr2e.spells.Item.5997ac8fe972f5cf" })).toBe(true);
  });
});

import { validateSplit } from "../module/rules/spell-rules.mjs";
describe("validateSplit (p.129 ledger)", () => {
  const base = { force: 6, magic: 5, poolAvail: 6, karmaAvail: 2 };
  it("accepts a sound split", () => {
    expect(validateSplit({ ...base, shares: [{ force: 3, pool: 2, drainPool: 1 }, { force: 3, pool: 2, karma: 2 }] }).ok).toBe(true);
  });
  it("refuses a single share, a zero share and too many dice", () => {
    expect(validateSplit({ ...base, shares: [{ force: 6 }] }).ok).toBe(false);
    expect(validateSplit({ ...base, shares: [{ force: 6 }, { force: 0 }] }).ok).toBe(false);
    expect(validateSplit({ ...base, shares: [{ force: 4 }, { force: 3 }] }).ok).toBe(false);
  });
  it("caps pool per cast test and in total, and Karma per share and in total", () => {
    expect(validateSplit({ ...base, shares: [{ force: 3, pool: 6 }, { force: 3 }] }).ok).toBe(false);
    expect(validateSplit({ ...base, shares: [{ force: 3, pool: 4, drainPool: 2 }, { force: 3, pool: 1 }] }).ok).toBe(false);
    expect(validateSplit({ ...base, shares: [{ force: 1, karma: 2 }, { force: 5 }] }).ok).toBe(false);
    expect(validateSplit({ ...base, shares: [{ force: 3, karma: 2 }, { force: 3, karma: 1 }] }).ok).toBe(false);
  });
});
