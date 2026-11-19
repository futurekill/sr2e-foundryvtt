/** Edges and Flaws at creation (Shadowrun Companion p.22–35; sr2e-chargen docs/PLAN-M5d.md). */
import { describe, it, expect } from "vitest";
import { QUALITY_VALUES, qualityValuesFor, bonusAttributeCost, qualityEffects, qualityAudit } from "../module/rules/quality-rules.mjs";
import { chargenBudget } from "../module/rules/sr2e-rules.mjs";
import { SR2E } from "../module/config.mjs";

const SC = (id) => `Compendium.sr2e-shadowrun-companion.sc-qualities.Item.${id}`;
const Q = { bsp: SC("d3953453f746eccc"), bfp: SC("bc9de9a4d65635b8"), extra: SC("bc589f7812890335"), lr: SC("c35b0315e04b0084"),
  wtl: SC("85ba0ae1a6b8fee8"), bap: SC("8553622399551197"), allergy: SC("c6265f759827b148"),
  aptitude: SC("cc9d282ba61a6abd") };
const q = (name, src, system) => ({ type: "quality", name, _stats: { compendiumSource: src }, system: { notes: "", ...system } });

describe("Edges and Flaws", () => {
  it("the p.35 table covers all 86 Companion qualities; ranges and the magically active reductions", () => {
    expect(Object.keys(QUALITY_VALUES)).toHaveLength(86 + 8 + 6);   // + Cyberpirates and Rigger 2
    expect(qualityValuesFor(Q.lr).values).toEqual([2, 4, 6]);
    expect(qualityValuesFor(Q.allergy).values).toEqual([-1, -2, -3, -4]);
    const blind = Object.entries(QUALITY_VALUES).find(([, v]) => v.magicallyActive?.[0] === -2 && v.values[0] === -6)[0];
    expect([qualityValuesFor(blind).values, qualityValuesFor(blind, { magicallyActive: true }).values]).toEqual([[-6], [-2]]);
  });

  it("Bonus Attribute Point: 1 per point up to the original racial maximum, 2 past it (p.24)", () => {
    expect(bonusAttributeCost({ natural: 4, originalMax: 6, gain: 2 })).toBe(2);
    expect(bonusAttributeCost({ natural: 5, originalMax: 6, gain: 2 })).toBe(3);
    expect(bonusAttributeCost({ natural: 6, originalMax: 6, gain: 1 })).toBe(2);
  });

  it("effects: skill points, 2 Force Points per point, extra contacts, Reaction per 2 points, overflow boxes", () => {
    const e = qualityEffects([q("Bonus Skill Point", Q.bsp, { pointValue: 3 }), q("Bonus Force Point", Q.bfp, { pointValue: 2 }),
      q("Extra Contact", Q.extra, { pointValue: 1 }), q("Lightning Reflexes", Q.lr, { pointValue: 4 }), q("Will to Live", Q.wtl, { pointValue: 2 })]);
    expect(e).toEqual({ skillPoints: 3, forcePoints: 4, extraContacts: 1, reaction: 2, willToLive: 2 });
  });

  it("the budget: Bonus Skill Point adds to the skill allotment; Force Points only for a magician; an extra free contact", () => {
    const sys = (magic) => ({ race: "human", magic: { type: magic }, chargen: { priorities: { race: "E", magic: "A", attributes: "B", skills: "C", resources: "D" } } });
    const items = [q("Bonus Skill Point", Q.bsp, { pointValue: 2 }), q("Bonus Force Point", Q.bfp, { pointValue: 1 }), q("Extra Contact", Q.extra, { pointValue: 1 }),
      ...[1, 2, 3].map(n => ({ type: "contact", name: `C${n}`, system: { contactType: "contact" } }))];
    const b = chargenBudget({ system: sys("full_magician"), items, table: SR2E.priorities });
    expect([b.skills.total, b.forcePoints.total, b.resources.spent, b.freeContacts]).toEqual([24 + 2, 15 + 2, 0, 3]);
    expect(chargenBudget({ system: sys("none"), items, table: SR2E.priorities }).forcePoints.total).toBe(0);
  });

  it("the audit: balance to zero, values from the table, one copy, an attribute where needed, the Bonus Attribute price", () => {
    const run = (items, system = { magic: { type: "none" } }) => qualityAudit({ system, items, natural: () => 5, maximum: () => 6 }).map(p => p.text).join(" | ");
    expect(run([q("Lightning Reflexes", Q.lr, { pointValue: 2 }), q("Allergy", Q.allergy, { pointValue: -2, notes: "pollen" })])).toBe("");
    expect(run([q("Lightning Reflexes", Q.lr, { pointValue: 2 })])).toMatch(/balance to 0/);
    expect(run([q("Lightning Reflexes", Q.lr, { pointValue: 3 }), q("Allergy", Q.allergy, { pointValue: -3, notes: "x" })])).toMatch(/worth 2, 4, 6/);
    expect(run([q("Allergy", Q.allergy, { pointValue: -1, notes: "Silver" }), q("Allergy", Q.allergy, { pointValue: -1, notes: "silver" }), q("Lightning Reflexes", Q.lr, { pointValue: 2 })])).toMatch(/taken twice/);
    expect(run([q("Bonus Attribute Point", Q.bap, { pointValue: 1, attributeBonus: 1, attribute: "" }), q("Allergy", Q.allergy, { pointValue: -1, notes: "x" })])).toMatch(/choose the attribute/);
    expect(run([q("Bonus Attribute Point", Q.bap, { pointValue: 2, attributeBonus: 2, attribute: "body" }), q("Allergy", Q.allergy, { pointValue: -2, notes: "x" })])).toMatch(/costs 3 points/);
    // Code review r1: a rule moved onto another quality, and an Exceptional Attribute raising the maximum by 2.
    expect(run([q("At Ease", SC("ba890aa4d65e100c"), { pointValue: 3, rule: "bonus-force-point" }), q("Allergy", Q.allergy, { pointValue: -3, notes: "x" })])).toMatch(/only the Companion's own quality|another quality's rule/);
    expect(run([q("Exceptional Attribute", SC("5be6c48444d171ce"), { pointValue: 2, attribute: "body", maximumBonus: 2 }), q("Allergy", Q.allergy, { pointValue: -2, notes: "x" })])).toMatch(/exactly 1/);
    expect(run([q("Aptitude", Q.aptitude, { pointValue: 2, notes: "Firearms" }), q("Aptitude", Q.aptitude, { pointValue: 2, notes: "Stealth" }), q("Allergy", Q.allergy, { pointValue: -4, notes: "x" })])).toBe("");
  });
});
