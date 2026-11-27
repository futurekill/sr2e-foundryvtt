// NPC rules (core p.187, p.68 rendered 2026-11-27): experience, Threat Rating helpers, Professional Ratings, npcDerived.
import { describe, it, expect } from "vitest";
import { npcExperiencePct, npcExperienced, threatFromDifficulty, threatFromTeamKarma, PROFESSIONAL_RATINGS, SKILL_SUCCESS_TABLE, npcDerived, npcWithEffects } from "../module/rules/npc-rules.mjs";

describe("experience (p.187)", () => {
  it("the book's example: 25 years = 80%", () => expect(npcExperiencePct(25)).toBe(80));
  it("10% per 2 years to 10, then per 4 years", () => {
    expect([0, 1, 2, 9, 10, 11, 13, 14, 18, 60].map(npcExperiencePct)).toEqual([0, 0, 10, 40, 50, 50, 50, 60, 70, 170]);
  });
  it("rounds to the nearest, halves up", () => {
    expect(npcExperienced(5, 80)).toBe(9);    // the Bounty Hunter's Strength base
    expect(npcExperienced(3, 50)).toBe(5);    // 4.5 → 5
    expect(npcExperienced(3, 10)).toBe(3);    // 3.3 → 3
    expect(npcExperienced(1000, 30)).toBe(1300);
  });
});

describe("Threat Rating helpers (p.187, p.68)", () => {
  it("every Skill Success Table row", () => {
    expect(SKILL_SUCCESS_TABLE.map(r => threatFromDifficulty(r.key))).toEqual([2, 3, 4, 5, 6, 8, 9, 10]);
    expect(threatFromDifficulty("difficult", 7)).toBe(7);
    expect(threatFromDifficulty("difficult", 8)).toBe(null);
    expect(threatFromDifficulty("nearlyImpossible", 12)).toBe(12);
    expect(threatFromDifficulty("nearlyImpossible", 9)).toBe(null);
    expect(threatFromDifficulty("nope")).toBe(null);
    expect([6.9, Infinity, NaN, "7"].map(c => threatFromDifficulty(c === "7" ? "difficult" : "nearlyImpossible", c))).toEqual([null, null, null, 7]);
  });
  it("1 per 100 Team Karma", () => expect([0, 99, 100, 1950, -5].map(threatFromTeamKarma)).toEqual([0, 0, 1, 19, 0]));
  it("Professional Ratings 1–4 and their withdrawal wounds", () => {
    expect(Object.values(PROFESSIONAL_RATINGS).map(r => r.withdraw)).toEqual(["light", "moderate", "serious", null]);
  });
});

describe("npcDerived", () => {
  const sys = (o = {}) => ({ body: { base: 4, mod: 0 }, quickness: { base: 5, mod: 1 }, strength: { base: 3, mod: 0 },
    charisma: { base: 2, mod: 0 }, intelligence: { base: 4, mod: 0 }, willpower: { base: 3, mod: -9 },
    reaction: { mod: 1 }, initiative: { dice: 1, mod: 1 }, armor: { ballistic: 1, impact: 0 }, combatPoolBonus: 0, ...o });
  it("attributes (floor 1), Reaction, Initiative dice, pools, movement", () => {
    const d = npcDerived(sys());
    expect(d.attributes.quickness).toBe(6);
    expect(d.attributes.willpower).toBe(1);
    expect([d.reactionBase, d.reaction, d.initiativeDice, d.combatPool, d.astralPool, d.walk, d.run]).toEqual([5, 6, 2, 5, 0, 6, 18]);
  });
  it("Combat Pool bonus, Astral pool when Awakened, worn armor added (highest + layered)", () => {
    const armorItems = [
      { type: "armor", system: { equipped: true, ballistic: 3, impact: 1 } },
      { type: "armor", system: { equipped: true, ballistic: 5, impact: 3 } },
      { type: "armor", system: { equipped: false, ballistic: 9, impact: 9 } }];
    const d = npcDerived(sys({ combatPoolBonus: 1 }), { awakened: true, armorItems });
    expect(d.combatPool).toBe(6);
    expect(d.astralPool).toBeGreaterThan(0);
    expect(d.armor).toEqual({ ballistic: 6, impact: 3 });
  });
});

describe("npcWithEffects (code review r1 #1)", () => {
  const system = { quickness: { base: 3, mod: 0 }, armor: { ballistic: 0, impact: 0 } };
  const fx = (changes, extra = {}) => ({ name: "Ware", effects: [{ changes, ...extra }] });
  it("adds transfer ADD changes on the kept keys; the source is untouched", () => {
    const { system: s, unsupported } = npcWithEffects(system, [fx([{ key: "system.quickness.mod", mode: 2, value: "2" }, { key: "system.armor.impact", mode: 2, value: "1" }])]);
    expect([s.quickness.mod, s.armor.impact, system.quickness.mod, unsupported]).toEqual([2, 1, 0, []]);
    expect(npcDerived(s).attributes.quickness).toBe(5);
  });
  it("skips disabled and non-transfer effects; lists other keys and modes", () => {
    const { system: s, unsupported } = npcWithEffects(system, [
      fx([{ key: "system.quickness.mod", mode: 2, value: "2" }], { disabled: true }),
      fx([{ key: "system.quickness.mod", mode: 2, value: "2" }], { transfer: false }),
      fx([{ key: "system.quickness.mod", mode: 5, value: "6" }, { key: "system.essence.value", mode: 2, value: "-1" }])]);
    expect(s.quickness.mod).toBe(0);
    expect(unsupported.map(u => u.key)).toEqual(["system.quickness.mod", "system.essence.value"]);
  });
});
