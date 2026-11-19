/** Metavariants (Shadowrun Companion p.39–44; sr2e-chargen docs/PLAN-M5b.md): the race item's modifiers, kept on the actor. */
import { describe, it, expect } from "vitest";
import { SR2E } from "../module/config.mjs";
import { racialProfile, metavariantFrom, isMetavariantItem, metavariantNotes, cyclopsRangedTN, CYCLOPS_SOURCE, ONI_SOURCE } from "../module/rules/sr2e-rules.mjs";
import { dermalDiceOf } from "../module/rules/shapeshift-rules.mjs";

const item = (name, raceKey, attributeMods, specialAbilities, book = "sc", source = "") => ({ name, type: "race",
  _stats: { compendiumSource: source }, system: { raceKey, attributeMods, specialAbilities, citation: { book, page: "39" } } });
// The book's numbers (Companion p.39–40), as the Shadowrun Companion module carries them.
const cyclops = item("Cyclops", "troll", { body: 5, quickness: -1, strength: 6, charisma: -2, intelligence: -2, willpower: -1 },
  ["thermographic_vision", "reach_1"], "sc", CYCLOPS_SOURCE);
const minotaur = item("Minotaurs", "troll", { body: 4, quickness: -1, strength: 3, charisma: -1, intelligence: -1, willpower: -1 },
  ["thermographic_vision", "dermal_armor", "reach_1"]);
const oni = item("Oni", "ork", { ...SR2E.racialModifiers.ork }, ["low_light_vision"], "sc", ONI_SOURCE);
const sys = (race, it) => ({ race, metavariant: metavariantFrom(it) });

describe("metavariants", () => {
  it("a sourcebook race item of a metahuman metatype is a variant, judged by book — never by modifiers (the Oni's equal the ork's)", () => {
    expect(isMetavariantItem(oni)).toBe(true);
    expect(isMetavariantItem(item("Ork", "ork", SR2E.racialModifiers.ork, [], "sr2"))).toBe(false);
    expect(isMetavariantItem(item("Shapeshifter (Wolf)", "shapeshifter", {}, []))).toBe(false);
    expect(metavariantFrom(item("Troll", "troll", SR2E.racialModifiers.troll, [], "sr2")).name).toBe("");
  });

  it("the variant's modifiers and abilities apply; maximums stay the base metatype's (Cyclops Strength max 10)", () => {
    const p = racialProfile(sys("troll", cyclops), SR2E);
    expect(p.mods.strength).toBe(6);
    expect(p.maxes).toEqual(SR2E.racialMaximums.troll);
    expect(p.abilities).not.toContain("dermal_armor");
    expect(racialProfile(sys("ork", oni), SR2E).variant).toBe("Oni");
  });

  it("a variant left on the wrong metatype is ignored (race changed some other way)", () => {
    const p = racialProfile({ race: "elf", metavariant: metavariantFrom(cyclops) }, SR2E);
    expect([p.variant, p.mods]).toEqual(["", SR2E.racialModifiers.elf]);
  });

  it("dermal armor: a Cyclops has none, a Minotaur keeps the troll's die (Companion p.39, p.43)", () => {
    expect(dermalDiceOf("character", sys("troll", cyclops))).toBe(0);
    expect(dermalDiceOf("character", sys("troll", minotaur))).toBe(1);
    expect(dermalDiceOf("character", { race: "troll" })).toBe(1);
  });

  it("a Cyclops: +2 on firearms and thrown weapons, nothing in melee; a Minotaur nothing (Companion p.39)", () => {
    const c = sys("troll", cyclops);
    expect(["firearm", "throwing", "heavy", "melee"].map(w => cyclopsRangedTN("character", w, c, SR2E))).toEqual([2, 2, 2, 0]);
    expect(cyclopsRangedTN("character", "firearm", sys("troll", minotaur), SR2E)).toBe(0);
  });

  it("notes: every variant meets a Hostile reaction; the Cyclops' ranged +2", () => {
    const n = metavariantNotes(sys("troll", cyclops), SR2E);
    expect(n.join(" ")).toMatch(/Hostile.*depth perception/);
    expect(metavariantNotes({ race: "troll" }, SR2E)).toEqual([]);
  });
});
