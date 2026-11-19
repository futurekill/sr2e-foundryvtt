/** Point-based design (Shadowrun Companion p.20–21; sr2e-chargen docs/PLAN-M5h.md). */
import { describe, it, expect } from "vitest";
import { chargenBudget } from "../module/rules/sr2e-rules.mjs";
import { SR2E } from "../module/config.mjs";

const attrs = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { base: v }]));
const skill = (name, allocated) => ({ type: "skill", name, system: { category: "active", allocated, rating: allocated, concentration: { name: "" }, specialization: { name: "" } } });
const sys = (chargen = {}, extra = {}) => ({ race: "human", magic: { type: "none" }, ...attrs({ body: 3, quickness: 4, strength: 3, charisma: 1, intelligence: 5, willpower: 4 }),
  chargen: { priorityMethod: "points", buildingPoints: 100, nuyenTier: 400000, forcePointTrade: 0, qualitiesUseBP: false, priorities: {}, ...chargen }, ...extra });
const budget = (s, items = []) => chargenBudget({ system: s, items, table: SR2E.priorities });

describe("point-based design", () => {
  it("the book's Virgil (p.21): human 0, mundane 0, attributes 20 points = 40, skills 42, 400,000¥ = 20 → 102", () => {
    const skills = [["Computer", 6], ["Computer B/R", 6], ["Electronics", 5], ["Computer Theory", 3], ["Stealth", 4], ["Demolitions", 4], ["Unarmed Combat", 4], ["Athletics", 4], ["Firearms", 4], ["Japanese", 2]].map(([n, a]) => skill(n, a));
    const b = budget(sys(), skills);
    expect(b.buildingPoints.parts).toMatchObject({ race: 0, magic: 0, attributes: 40, skills: 42, resources: 20 });
    expect([b.buildingPoints.spent, b.buildingPoints.over, b.resources.total, b.attributes.over, b.skills.over]).toEqual([102, true, 400000, false, false]);
  });

  it("a magician: 20 BP with 30 Force Points; +2 trades buy 4 more; sales stop at 15 BP; a physical adept has none; metahuman 10", () => {
    const mage = (trade) => budget(sys({ forcePointTrade: trade, nuyenTier: 5000 }, { race: "elf", magic: { type: "full_magician" } }));
    expect([mage(0).forcePoints.total, mage(0).buildingPoints.parts.magic, mage(0).buildingPoints.parts.race]).toEqual([30, 20, 10]);
    expect([mage(2).forcePoints.total, mage(2).buildingPoints.parts.forcePoints]).toEqual([34, 2]);
    expect([mage(-20).forcePoints.total, mage(-20).buildingPoints.parts.forcePoints]).toEqual([0, -15]);
    expect(mage(-20).buildingPoints.problems.join()).toMatch(/at most his 30/);
    const adept = budget(sys({ forcePointTrade: 3 }, { magic: { type: "physical_adept" } }));
    expect([adept.forcePoints.total, adept.buildingPoints.parts.magic, adept.buildingPoints.parts.forcePoints]).toEqual([0, 15, 0]);
    expect(adept.buildingPoints.problems.join()).toMatch(/Only a magician/);
  });

  it("the nuyen tiers (0¥ gives 5 back); Edges/Flaws priced in BP only with the GM's option; a shapeshifter is refused", () => {
    expect(budget(sys({ nuyenTier: 0 })).buildingPoints.parts.resources).toBe(-5);
    const edge = { type: "quality", name: "Toughness", system: { pointValue: 2 } };
    expect(budget(sys(), [edge]).buildingPoints.parts.qualities).toBe(0);
    expect(budget(sys({ qualitiesUseBP: true }), [edge]).buildingPoints.parts.qualities).toBe(2);
    expect(budget(sys({}, { race: "shapeshifter", shapeshifter: { species: "wolf" } })).buildingPoints.problems.join()).toMatch(/own creation table/);
  });
});
