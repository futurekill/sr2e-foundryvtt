// Astral combat (SR2E p.147–148, rendered): opposed like melee; Astral Pool
// ⌊(Int+Wil+Cha)/2⌋; damage (Cha)L unarmed, (Cha + ⌊Focus/2⌋)M armed, (Force)M
// spirit; resist with Astral Body; dual beings keep their physical Attributes.
import { describe, it, expect } from "vitest";
import { astralCombatPool, astralProfile, dicePoolRefreshUpdates } from "../module/rules/sr2e-rules.mjs";

describe("astralCombatPool", () => {
  it("is ⌊(Int + Wil + Cha) / 2⌋", () => {
    expect(astralCombatPool({ intelligence: 5, willpower: 6, charisma: 4 })).toBe(7);
  });
});

describe("astralProfile — magician", () => {
  const base = { kind: "magician", skills: { armed: 3, unarmed: 2, sorcery: 5 },
                 attrs: { intelligence: 5, willpower: 6, charisma: 4 } };
  it("without a focus: Unarmed or Sorcery, best first; (Charisma)L; Willpower; pool", () => {
    const p = astralProfile(base);
    expect(p.options.map(o => o.key)).toEqual(["sorcery", "unarmed"]);
    expect(p.damage).toEqual({ power: 4, level: "L" });
    expect(p.resistDice).toBe(6);
    expect(p.pool).toBe(7);
  });
  it("with a wielded focus: Armed Combat + its rating; (Cha + ⌊F/2⌋)M", () => {
    const p = astralProfile({ ...base, focusRating: 3 });
    expect(p.options.find(o => o.key === "armed").dice).toBe(6);
    expect(p.options.some(o => o.key === "unarmed")).toBe(false);
    expect(p.damage).toEqual({ power: 5, level: "M" });
  });
});

describe("astralProfile — spirit and dual being", () => {
  it("a spirit uses its Force for everything", () => {
    const p = astralProfile({ kind: "spirit", force: 5 });
    expect(p.options[0].dice).toBe(5);
    expect(p.damage).toEqual({ power: 5, level: "M" });
    expect(p.resistDice).toBe(5);
    expect(p.pool).toBe(0);
  });
  it("a dual being resists with Body, keeps its armor and physical attack", () => {
    const p = astralProfile({ kind: "dual", skills: { unarmed: 4 }, attrs: { body: 7, willpower: 2, strength: 6 },
                              impactArmor: 2, physicalDamage: { power: 8, level: "S" } });
    expect(p.resistDice).toBe(7);
    expect(p.armor).toBe(2);
    expect(p.damage).toEqual({ power: 8, level: "S" });
    expect(astralProfile({ kind: "dual", attrs: { strength: 6 } }).damage).toEqual({ power: 6, level: "M" });
  });
});

describe("the Astral Pool refreshes with the others", () => {
  it("is included in dicePoolRefreshUpdates", () => {
    expect(dicePoolRefreshUpdates({ astral: { value: 1, max: 7 } })).toEqual({ "system.dicePools.astral.value": 7 });
  });
});
