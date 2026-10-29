// Second-hand cyberware — SSC p.100 (half price, same Essence; 2 Karma per die re-rolled),
// Cybertechnology p.42 (standard/alpha/beta only). docs/PLAN-secondhand-cyberware.md.
import { describe, it, expect } from "vitest";
import { itemBaseCost, cyberSecondhand, karmaRerollCost, secondhandDead, gradeEssenceCost } from "../module/rules/sr2e-rules.mjs";

const ware = (o = {}) => ({ type: "cyberware", cost: 10000, rating: 1, ...o });

describe("second-hand cyberware price", () => {
  it("is half the same new piece, after the grade", () => {
    expect(itemBaseCost(ware({ grade: "standard", secondhand: true }))).toBe(5000);
    expect(itemBaseCost(ware({ grade: "alpha", secondhand: true }))).toBe(15000);
    expect(itemBaseCost(ware({ grade: "beta", secondhand: true }))).toBe(35000);
  });
  it("never applies to delta (always custom-made)", () => {
    expect(cyberSecondhand(ware({ grade: "delta", secondhand: true }))).toBe(false);
    expect(itemBaseCost(ware({ grade: "delta", secondhand: true }))).toBe(100000);
  });
  it("leaves bioware and new ware alone", () => {
    expect(itemBaseCost({ type: "bioware", cost: 10000, rating: 1, grade: "standard", secondhand: true })).toBe(10000);
    expect(itemBaseCost(ware({ grade: "standard" }))).toBe(10000);
  });
  it("keeps the grade's Essence (same as a normal piece)", () => {
    expect(gradeEssenceCost(0.5, "alpha")).toBe(0.4);   // nothing second-hand touches this path
  });
});

describe("karmaRerollCost", () => {
  it("escalates by 1 per reroll normally (SR2E p.191)", () => {
    expect(karmaRerollCost({ rerolls: 0 }, 5)).toBe(1);
    expect(karmaRerollCost({ rerolls: 2 }, 5)).toBe(3);
  });
  it("costs 2 per die re-rolled on a second-hand test, without escalating", () => {
    expect(karmaRerollCost({ rerolls: 0, rerollCostPerDie: 2 }, 5)).toBe(10);
    expect(karmaRerollCost({ rerolls: 1, rerollCostPerDie: 2 }, 3)).toBe(6);
  });
});

describe("secondhandDead", () => {
  const item = (sys) => ({ type: "cyberware", system: sys });
  it("a failed ordinary part stops working", () => expect(secondhandDead(item({ secondhandFailed: true }))).toBe(true));
  it("a working part doesn't", () => expect(secondhandDead(item({ secondhandFailed: false }))).toBe(false));
  it("a failed cyberlimb or limb option stays a GM reminder (p.49 precedent)", () => {
    expect(secondhandDead(item({ secondhandFailed: true, limbIdentity: { role: "limb" } }))).toBe(false);
    expect(secondhandDead(item({ secondhandFailed: true, limbIdentity: { role: "option" } }))).toBe(false);
  });
});
