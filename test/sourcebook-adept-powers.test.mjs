// The sourcebook adept powers (docs/PLAN-sourcebook-adept-powers.md): Grimoire p.34, CSH p.104.
import { describe, it, expect } from "vitest";
import { adeptPowerBudget, adeptPowerKey, adeptCostNeedsActor } from "../module/rules/sr2e-rules.mjs";

const GRIM = (id) => `Compendium.sr2e-grimoire.grim-adept-powers.Item.${id}`;
const CSH = (id) => `Compendium.sr2e-corporate-security.csh-adept-powers.Item.${id}`;
let n = 0;
const power = (src, system = {}, name = "Power") => ({ id: `p${++n}`, type: "adept_power", name, _stats: { compendiumSource: src },
  system: { level: 1, pointCost: 1, ...system } });
const human = { intelligence: 6, reaction: 6 }, troll = { intelligence: 5, reaction: 6 };
const budget = (items, o = {}) => adeptPowerBudget({ items, maxes: human, magic: 6, ...o });

describe("sourcebook adept powers", () => {
  it("know their keys by source and by name", () => {
    expect(adeptPowerKey(power(GRIM("52fa826e15730ecb")))).toBe("mystic_armor");
    expect(adeptPowerKey(power(CSH("eb25a29169bb25a1")))).toBe("enhanced_perception");
    expect(adeptPowerKey({ name: "Enhanced Perception (Tier 2)" })).toBe("enhanced_perception");
    expect(adeptPowerKey({ name: "Attribute Boost (Body)" })).toBe("attribute_boost");
    expect(adeptCostNeedsActor("enhanced_perception")).toBe(true);
  });
  it("Enhanced Perception: the three tier items priced together by the bonus against racial maximum Intelligence (CSH p.104)", () => {
    // Human max 6: +1..+3 at .25, +4..+6 at .5, +7..+9 at 1.
    const t1 = power(CSH("728210b0653b6d85"), { level: 3 }), t2 = power(CSH("23ff1ea134b6ebb7"), { level: 3 }), t3 = power(CSH("eb25a29169bb25a1"), { level: 1 });
    const b = budget([t1, t2, t3]);
    expect(b.costs[t1.id]).toBe(0.75); expect(b.costs[t2.id]).toBe(1.5); expect(b.costs[t3.id]).toBe(1);
    // Which item holds a level doesn't matter: seven levels on "Tier 3" alone cost the same 3.25.
    expect(budget([power(CSH("eb25a29169bb25a1"), { level: 7 })]).used).toBe(3.25);
    // A troll (max 5): +1..+2 .25, +3..+5 .5, +6..+7 1; +8 is over 1.5 × 5.
    expect(budget([power(CSH("728210b0653b6d85"), { level: 7 })], { maxes: troll }).used).toBe(4);
    expect(budget([power(CSH("728210b0653b6d85"), { level: 8 })], { maxes: troll, magic: 9 }).problems.join()).toMatch(/1.5 × the racial maximum Intelligence/);
  });
  it("Enhanced Centering: 2 per category, 1 per Special Skill, initiates with Centering only (Grimoire p.34)", () => {
    const ec = (system) => power(GRIM("aa5b3ad241d4737b"), { pointCost: 2, ...system });
    const a = ec({ centeringCategory: "social", level: 3 }), b2 = ec({ centeringCategory: "special", centeringSkill: "Meditation" });
    const init = { initiateGrade: 1, metamagic: ["centering"] };
    const b = budget([a, b2], init);
    expect(b.costs[a.id]).toBe(2); expect(b.costs[b2.id]).toBe(1);   // level 3 is still one category: 2
    expect(b.problems.join()).toMatch(/one category per purchase/);
    expect(budget([ec({ centeringCategory: "social" }), b2], init).problems).toEqual([]);
    expect(budget([a], {}).problems.join()).toMatch(/only an initiate/);
    expect(budget([a, ec({ centeringCategory: "social" })], init).problems.join()).toMatch(/already covered/);
    expect(budget([ec({})], init).problems.join()).toMatch(/choose the skill category/);
    expect(budget([ec({ centeringCategory: "special" })], init).problems.join()).toMatch(/name the Special Skill/);
  });
  it("Attribute Boost: one attribute per purchase; Mystic Armor's total against Magic (Grimoire p.34)", () => {
    const ab = (at) => power(GRIM("8910da4d6b4d8736"), { pointCost: 0.5, level: 2, boostAttribute: at });
    expect(budget([ab("body")]).used).toBe(1);
    expect(budget([ab("")]).problems.join()).toMatch(/choose the attribute/);
    expect(budget([ab("body"), ab("body")]).problems.join()).toMatch(/already has an Attribute Boost/);
    const ma = (lv) => power(GRIM("52fa826e15730ecb"), { level: lv });
    expect(budget([ma(2), ma(2)], { magic: 3 }).problems.join()).toMatch(/Mystic Armor 4 is over the Magic Rating 3/);
  });
});
