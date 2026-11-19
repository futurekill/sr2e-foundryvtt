// Karma after creation (SR2E p.190–191; sr2e-chargen docs/PLAN-M4a.md): the shared pure transition.
import { describe, it, expect } from "vitest";
import { karmaAward, advancementCost, advancementOptions, karmaTransition } from "../module/rules/sr2e-rules.mjs";

const skill = (id, name, system) => ({ _id: id, type: "skill", name, system: { category: "active", rating: 1, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, ...system } });
const iris = () => ({ system: { race: "human", magic: { type: "none", tradition: "none" }, strength: { base: 5 }, karma: { total: 40, current: 30, burned: 0, spent: 0, poolAdjust: 0 } },
  items: [skill("f", "Firearms", { rating: 1, concentration: { name: "Pistols", rating: 3 }, specialization: { name: "Beretta 101T", rating: 5 } }),
    skill("e", "English", { category: "language", rating: 4 }), skill("s", "Sorcery", { rating: 3 })] });
const ctx = { attributes: { strength: { natural: 5, next: 6, overMax: false, stuck: false } } };

describe("the book's numbers (p.190–191)", () => {
  it("advancement costs", () => {
    expect(advancementCost({ kind: "attribute", attribute: "strength", newRating: 6 })).toBe(6);                 // Strength 5 → 6
    expect(advancementCost({ kind: "attribute", attribute: "strength", newRating: 7, overMax: true })).toBe(14);  // human 6 → 7
    for (const a of ["reaction", "essence", "magic"]) expect(advancementCost({ kind: "attribute", attribute: a, newRating: 4 })).toBeNull();
    expect(advancementCost({ kind: "skill", tier: "general", newRating: 2 })).toBe(4);          // Iris: Firearms 1 → 2
    expect(advancementCost({ kind: "skill", tier: "concentration", newRating: 4 })).toBe(6);    // Pistols 3 → 4
    expect(advancementCost({ kind: "skill", tier: "specialization", newRating: 6 })).toBe(6);   // Beretta 5 → 6
    expect(advancementCost({ kind: "skill", tier: "concentration", newRating: 5 })).toBe(8);    // "5 × 1.5, or 8"
    expect(advancementCost({ kind: "skill", tier: "general", category: "language", newRating: 5 })).toBe(5);
    expect(advancementCost({ kind: "newSkill" })).toBe(1);
  });
  it("an award: Total grows by it, the Pool takes one-tenth of Total rounded up, Good Karma the rest", () => {
    expect(karmaAward(0, 10)).toEqual({ total: 10, good: 9 });
    expect(karmaAward(5, 5)).toEqual({ total: 10, good: 5 });   // pool ⌈5/10⌉ = 1 already, ⌈10/10⌉ = 1: nothing new
    expect(karmaAward(9, 1)).toEqual({ total: 10, good: 1 });
    expect(karmaAward(0, 1)).toEqual({ total: 1, good: 0 });
  });
});

describe("karmaTransition", () => {
  it("raises a concentration, adds a named one from the general rating, refuses the unaffordable", () => {
    const r = karmaTransition(iris(), { advance: { itemId: "f", tier: "concentration" } }, ctx);
    expect(r.ok).toBe(true);
    expect([r.record.cost, r.record.items[0].set["system.concentration.rating"]]).toEqual([6, [3, 4]]);
    const src = iris(); src.items[0].system.concentration = { name: "", rating: 0 }; src.items[0].system.rating = 4;
    const n = karmaTransition(src, { advance: { itemId: "f", newConcentration: "Pistols" } }, ctx);
    expect([n.record.cost, n.record.items[0].set["system.concentration.rating"][1]]).toEqual([8, 5]);   // Firearms 4 → Pistols 5
    const poor = iris(); poor.system.karma.current = 3;
    expect(karmaTransition(poor, { advance: { itemId: "f", tier: "concentration" } }, ctx)).toEqual({ ok: false, reason: "6 Good Karma needed, 3 available." });
  });
  it("over the racial maximum needs approval; Reaction never; a hermetic's Sorcery needs the library", () => {
    const over = { attributes: { strength: { natural: 6, next: 7, overMax: true, stuck: false } } };
    expect(karmaTransition(iris(), { advance: { attribute: "strength" } }, over).ok).toBe(false);
    const ok = karmaTransition(iris(), { advance: { attribute: "strength", gmApproved: true } }, over);
    expect([ok.record.cost, ok.record.actor["system.strength.base"]]).toEqual([14, [5, 6]]);
    expect(karmaTransition(iris(), { advance: { attribute: "reaction" } }, ctx).ok).toBe(false);
    const mage = iris(); mage.system.magic = { type: "full_magician", tradition: "hermetic" };
    expect(karmaTransition(mage, { advance: { itemId: "s", tier: "general" } }, ctx).reason).toMatch(/sorcery library/);
    expect(karmaTransition(mage, { advance: { itemId: "s", tier: "general", libraryConfirmed: true } }, ctx).ok).toBe(true);
    expect(advancementOptions(mage, ctx).find(o => o.target.itemId === "s").needs).toEqual(["libraryConfirmed"]);
  });
  it("a new skill at 1 for 1; a revert restores exactly and is refused once the character moved on", () => {
    const src = iris();
    const r = karmaTransition(src, { advance: { newSkill: { type: "skill", name: "Car", system: { category: "active" } }, newId: "c" } }, ctx);
    expect([r.record.cost, r.record.create.system.rating, r.record.create.system.ratingsFinalized]).toEqual([1, 1, true]);
    const raised = karmaTransition(src, { advance: { itemId: "f", tier: "general" } }, ctx).record;
    const after = iris(); after.items[0].system.rating = 2; after.system.karma.current = 26;
    const back = karmaTransition(after, { revert: raised }, ctx);
    expect(back.ok).toBe(true);
    expect([back.record.items[0].set["system.rating"], back.record.actor["system.karma.current"]]).toEqual([[2, 1], [26, 30]]);
    expect(karmaTransition(iris(), { revert: raised }, ctx).ok).toBe(false);   // the rating is no longer what it set
    const award = karmaTransition(iris(), { award: 10 }, ctx).record;
    const spent = iris(); spent.system.karma = { total: 50, current: 0, burned: 0, spent: 0, poolAdjust: 0 };
    expect(karmaTransition(spent, { revert: award }, ctx).reason).toMatch(/already spent/);
  });
});
