// Spirit-group totem bonuses and spirit attack summaries (docs/PLAN-ancestor-spirit.md).
import { describe, it, expect } from "vitest";
import { totemConjuringBonus, spiritAttackSummary, spiritAttributes } from "../module/rules/sr2e-rules.mjs";
import { SR2E } from "../module/config.mjs";

const T = SR2E.totems;
const groupOf = { ...SR2E.spiritDomainGroup, ancestor: "spirits_of_man" };   // as the Cyberpirates module registers
const inherits = { ancestor: true };
const bonus = (k, d) => totemConjuringBonus(T[k], d, { groupOf, inherits });

describe("totemConjuringBonus", () => {
  it("Rat's +2 for all Spirits of Man reaches city, hearth and field (core p.121)", () => {
    for (const d of ["city", "hearth", "field"]) expect(bonus("rat", d)).toBe(2);
    expect(bonus("rat", "forest")).toBe(0);
  });
  it("a domain's own entry wins and others are unchanged", () => {
    expect(bonus("bear", "forest")).toBe(2);
    expect(bonus("cat", "city")).toBe(2);
    expect(totemConjuringBonus({ conjuringBonus: { city: 3, spirits_of_man: 1 } }, "city", { groupOf })).toBe(3);
  });
  it("the ancestor spirit inherits every Spirits of Man bonus, the best one, never a sum (CP p.152)", () => {
    for (const k of ["cat", "raccoon", "gator", "dog", "rat"]) expect(bonus(k, "ancestor")).toBe(2);
    expect(bonus("bear", "ancestor")).toBe(0);
    expect(totemConjuringBonus(T.dog, "ancestor", { groupOf })).toBe(0);  // without inherits: nothing
  });
});

describe("spiritAttackSummary", () => {
  const sys = (profile, f, extra = {}) => { const a = spiritAttributes(SR2E.spiritProfiles[profile] ?? profile, f);
    return { force: f, effectiveForce: f, reaction: { value: a.reaction }, strength: { value: a.strength },
      attackProfile: (SR2E.spiritProfiles[profile] ?? profile).attack, ...extra }; };
  it("water: Force dice and Force Power, S Stun (core p.144)", () => {
    expect(spiritAttackSummary(sys("water", 4))).toMatchObject({ dice: 4, diceFrom: "force", power: 4, powerFrom: "force", level: "S", stun: true });
  });
  it("earth: Reaction dice, Power stays Force though Strength is 8", () => {
    const s = sys("earth", 4);
    expect(s.strength.value).toBe(8);
    expect(spiritAttackSummary(s)).toMatchObject({ dice: 2, diceFrom: "reaction", power: 4, level: "S", reach: 1 });
    expect(spiritAttackSummary({ ...s, effectiveForce: 3 }).power).toBe(3);
  });
  it("air has no manifest attack", () => { expect(spiritAttackSummary(sys("air", 4))).toBe(null); });
  it("the ancestor spirit at Force 4: B6 Q4 S5 R4, 4 Force dice for 5M Stun", () => {
    const anc = { b: 2, q: 0, mult: 3, s: 1, r: 0, attack: { mode: "melee", level: "M", damageType: "stun", dice: "force", power: "strength" } };
    const a = spiritAttributes(anc, 4);
    expect(a).toMatchObject({ body: 6, quickness: 4, strength: 5, charisma: 4, intelligence: 4, willpower: 4, reaction: 4, essence: 4, moveMult: 3 });
    expect(spiritAttackSummary(sys(anc, 4))).toMatchObject({ dice: 4, power: 5, powerFrom: "strength", level: "M", stun: true });
  });
});
