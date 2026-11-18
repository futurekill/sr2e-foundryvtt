// The whole creation budget (chargenBudget, SR2E p.44–46): ONE calculation for Foundry's creation panel and the
// standalone character generator. Built for the chargen prerequisites S1–S8, S10 (sr2e-chargen docs/PLAN-M2.md §0).
import { describe, it, expect } from "vitest";
import { chargenBudget, chargenExtrasCost, allergyBonus, chargenItemCost, focusBondingCost, CHARGEN_RESOURCE_TYPES } from "../module/rules/sr2e-rules.mjs";
import { SR2E } from "../module/config.mjs";

const table = SR2E.priorities;
const item = (type, system, extra = {}) => ({ type, name: extra.name ?? type, system, flags: extra.flags ?? {}, _stats: {} });
const actor = ({ chargen = {}, ...o } = {}) => ({ race: "human", chargen: { priorities: { race: "E", magic: "D", attributes: "C", skills: "B", resources: "A" }, ...chargen },
  body: { base: 3 }, quickness: { base: 3 }, strength: { base: 3 }, charisma: { base: 3 }, intelligence: { base: 4 }, willpower: { base: 4 }, ...o });

describe("chargen prerequisites", () => {
  it("S1: programs are Resources (p.46), priced by rating and multiplier", () => {
    expect(CHARGEN_RESOURCE_TYPES).toContain("program");
    const prog = { type: "program", rating: 3, multiplier: 2, category: "masking", cost: 0 };
    expect(chargenItemCost(prog)).toBeGreaterThan(0);
  });

  it("S2: a lifestyle costs its monthly cost × months paid (p.46)", () => {
    expect(chargenItemCost({ type: "lifestyle", monthlyCost: 5000, monthsPaid: 3 })).toBe(15000);
    expect(chargenItemCost({ type: "lifestyle", monthlyCost: 0, monthsPaid: 1 })).toBe(0);   // the Streets
  });

  it("S3: two contacts free, then 5,000¥; buddy 10,000¥; gang 50,000¥; followers 200,000¥ (p.46)", () => {
    const c = (contactType) => ({ contactType });
    expect(chargenExtrasCost([c("contact"), c("contact")])).toBe(0);
    expect(chargenExtrasCost([c("contact"), c("contact"), c("contact")])).toBe(5000);
    expect(chargenExtrasCost([c("buddy")])).toBe(10000);
    expect(chargenExtrasCost([c("gang"), c("follower")])).toBe(250000);
    expect(chargenExtrasCost([c("enemy"), c("friend")])).toBe(0);
  });

  it("S4: the Allergy and Severity Table (p.46): one category each for the rarity and the severity", () => {
    expect(allergyBonus({ rarity: "common", severity: "severe", rarityBonus: "attributes", severityBonus: "skills" }))
      .toEqual({ attributes: 2, skills: 4, forcePoints: 0, nuyen: 0 });
    expect(allergyBonus({ rarity: "uncommon", severity: "mild", rarityBonus: "nuyen", severityBonus: "nuyen" }))
      .toEqual({ attributes: 0, skills: 0, forcePoints: 0, nuyen: 300 });
    expect(allergyBonus({ rarity: "uncommon", severity: "moderate", rarityBonus: "force", severityBonus: "force" }).forcePoints).toBe(3);
    expect(allergyBonus({ rarity: "common", severity: "", rarityBonus: "attributes" }).attributes).toBe(0);   // needs both
    expect(allergyBonus({ rarity: "common", severity: "nuisance", rarityBonus: "attributes", severityBonus: "skills" })).toEqual({ attributes: 2, skills: 0, forcePoints: 0, nuyen: 0 });
  });

  it("S10: the Focus Bonding Table (p.137)", () => {
    expect([1, 2, 3].map(force => focusBondingCost({ focusType: "spell", force }))).toEqual([1, 2, 3]);
    expect(focusBondingCost({ focusType: "spell", spellSubtype: "category", force: 2 })).toBe(6);
    expect(focusBondingCost({ focusType: "spirit", force: 3 })).toBe(6);
    expect(focusBondingCost({ focusType: "power", force: 2 })).toBe(10);
    expect(focusBondingCost({ focusType: "spell_lock", force: 4 })).toBe(1);
    expect(focusBondingCost({ focusType: "weapon", force: 2 })).toBeNull();
    expect(focusBondingCost({ focusType: "spell", force: 2, expendable: true })).toBeNull();
  });

  it("S6: the whole panel from an actor's data — program, lifestyle, contacts, a buddy, an allergy, a persona program", () => {
    const items = [
      item("program", { rating: 2, multiplier: 2, category: "masking", cost: 0 }, { name: "Masking" }),
      item("program", { rating: 4, multiplier: 3, category: "persona", cost: 0 }, { name: "Evasion" }),
      item("lifestyle", { monthlyCost: 1000, monthsPaid: 2 }, { name: "Low" }),
      item("contact", { contactType: "contact" }), item("contact", { contactType: "contact" }), item("contact", { contactType: "contact" }),
      item("contact", { contactType: "buddy" }),
      item("weapon", { cost: 450, quantity: 1 }, { name: "Ares Predator" }),
      item("ammo", { cost: 20, quantity: 30 }, { name: "Regular", flags: { sr2e: { acquiredListValue: 60 } } })
    ];
    const prog = (r, m, persona) => chargenItemCost({ type: "program", rating: r, multiplier: m, category: persona ? "persona" : "masking" });
    const base = chargenBudget({ system: actor(), items, table });
    expect(base.resources.spent).toBe(prog(2, 2) + prog(4, 3, true) + 2000 + 5000 + 10000 + 450 + 60);
    expect(base.resources.total).toBe(1000000);
    // An allergy adds only for a metahuman.
    const allergy = { substance: "silver", rarity: "uncommon", severity: "mild", rarityBonus: "attributes", severityBonus: "nuyen" };
    expect(chargenBudget({ system: actor({ chargen: { allergy } }), items, table }).attributes.total).toBe(table.C.attributes);
    const elf = chargenBudget({ system: actor({ race: "elf", chargen: { priorities: { race: "A", magic: "D", attributes: "C", skills: "B", resources: "E" }, allergy } }), items, table });
    expect(elf.attributes.total).toBe(table.C.attributes + 1);
    expect(elf.resources.total).toBe(table.E.resources + 100);
    expect(elf.allergy).toEqual({ attributes: 1, skills: 0, forcePoints: 0, nuyen: 100 });
  });
});
