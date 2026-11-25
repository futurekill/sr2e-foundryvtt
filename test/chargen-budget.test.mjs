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
  it("only magicians receive Force Points (p.46); a physical adept is a magician (p.124)", () => {
    const fp = (type) => chargenBudget({ system: actor({ magic: { type } }), items: [], table }).forcePoints.total;
    expect([fp("none"), fp("full_magician"), fp("physical_adept")]).toEqual([0, 50, 50]);
    expect(chargenBudget({ system: actor(), items: [], table }).forcePoints.total).toBe(0);   // no magic type set
    const focus = item("focus", { focusType: "power", force: 1, bondingCost: 5 });
    expect(chargenBudget({ system: actor({ magic: { type: "none" } }), items: [focus], table }).forcePoints.over).toBe(true);
  });

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

  it("a shapeshifter gets no free contacts (Companion p.38): its first contact costs 5,000¥; it starts with Karma Pool 1 (R10)", async () => {
    const { startingKarmaPool } = await import("../module/rules/sr2e-rules.mjs");
    const { SHAPESHIFTER_PRIORITIES } = await import("../module/rules/shapeshift-rules.mjs");
    const contact = { type: "contact", name: "Fixer", system: { contactType: "contact" } };
    const spent = (system) => chargenBudget({ system: actor({ ...system, chargen: { priorities: { resources: "B" } } }), items: [contact], table: SHAPESHIFTER_PRIORITIES }).resources.spent;
    expect(spent({ race: "shapeshifter", shapeshifter: { species: "wolf" } })).toBe(5000);
    expect(spent({ race: "human" })).toBe(0);
    expect([startingKarmaPool("shapeshifter"), startingKarmaPool("shapeshifter", true), startingKarmaPool("ork")]).toEqual([1, 1, 2]);
    const { humanFormMod } = await import("../module/rules/shapeshift-rules.mjs");
    expect([humanFormMod({ race: "shapeshifter", shapeshifter: { species: "bear" } }, "body"), humanFormMod({ race: "troll" }, "body")]).toEqual([1, 0]);
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

import { adeptPowerCost, adeptPowerKey, adeptCostNeedsActor, ADEPT_POWER_SOURCES, improvedAttributeOf, combatSenseDice } from "../module/rules/sr2e-rules.mjs";
const SRC = (id) => `Compendium.sr2e.adept-powers.Item.${id}`;
describe("S13: adept power costs by the book's tables (SR2E p.124–126)", () => {
  const p = (id, o = {}) => ({ name: "x", pointCost: 1, level: 1, _stats: { compendiumSource: SRC(id) }, ...o });
  it("identifies the core powers by compendium source, then by name", () => {
    expect(Object.keys(ADEPT_POWER_SOURCES)).toHaveLength(24);   // 14 core + 10 Grimoire/CSH (PLAN-sourcebook-adept-powers)
    expect(adeptPowerKey(p("484c4074c7e97b93"))).toBe("improved_attribute:quickness");
    expect(adeptPowerKey({ name: "Improved Ability (Firearms)" })).toBe("improved_ability");
    expect(adeptPowerKey({ name: "Iron Skin" })).toBeNull();   // a homebrew name; Mystic Armor is now known (Grimoire)
    expect(adeptPowerKey({ name: "Iron Skin", flags: { sr2e: { power: "pain_resistance" } } })).toBe("pain_resistance");
  });
  it("the fixed tables", () => {
    expect([1, 2, 3].map(level => adeptPowerCost(p("9d10344a9456397d", { level })))).toEqual([2, 3, 4]);     // Combat Sense
    expect([1, 2, 3].map(level => adeptPowerCost(p("b03361c78fba6c27", { level })))).toEqual([1, 4, 6]);     // Increased Reflexes
    expect(adeptPowerCost(p("003f74fef4a1756e", { level: 10 }))).toBe(5);                                       // Pain Resistance
    expect(adeptPowerCost(p("9bf2a593eaad85f4", { level: 3 }))).toBe(0.75);                                     // Senses
    expect(adeptPowerCost(p("56f5962337903eec"))).toBe(2);                                                       // Astral Perception
    expect(adeptPowerCost(p("30f5e3493545db6b", { pointCost: 4 }))).toBe(4);                                    // Killing Hands (D)
  });
  it("Increased Reaction by the bonus against the racial Reaction maximum", () => {
    expect(adeptPowerCost(p("08e6d90ec7bf4dfe", { level: 3 }), 6)).toBe(1.5);        // human/elf: 3 × .5
    expect(adeptPowerCost(p("08e6d90ec7bf4dfe", { level: 3 }), 4)).toBe(2);          // troll max 4: .5 + .5 + 1
    expect(adeptPowerCost(p("08e6d90ec7bf4dfe", { level: 7 }), 6)).toBe(1.5 + 3 + 2); // 7th point past the max: 2
  });
  it("Improved Physical Attributes by the FINAL rating against the racial maximum (R4)", () => {
    const q = (level, base, racialMax) => adeptPowerCost(p("484c4074c7e97b93", { level }), 6, { base, racialMax });
    expect(q(3, 4, 6)).toBe(3.5);          // 5: 1, 6: 1, 7: 1.5
    expect(q(2, 1, 6)).toBe(1);            // 2: .5, 3: .5
    expect(q(1, 10, 11)).toBe(1);          // troll Body 11
    expect(adeptPowerCost(p("484c4074c7e97b93", { level: 2 }))).toBe(2);   // no context: pointCost × level
    expect(adeptCostNeedsActor("improved_attribute:body")).toBe(true);
  });
  it("Improved Ability by the skill's area", () => {
    const a = (skillName, level) => adeptPowerCost({ name: "Improved Ability", pointCost: 0.5, level }, 6, { skillName });
    expect(a("Athletics", 4)).toBe(1);
    expect(a("Stealth", 2)).toBe(0.5);
    expect(a("Throwing", 2)).toBe(1);
    expect(a("Firearms", 3)).toBe(3);
    expect(adeptPowerCost({ name: "Improved Ability (Gunnery)", pointCost: 0.5, level: 2 })).toBe(2);
    expect(a("Etiquette", 2)).toBe(1);     // not in the table: pointCost × level
  });
});

describe("S13 code review r1", () => {
  it("identity: flags.core.sourceId; exact core names only; a generic attribute key takes its attribute from the mods", () => {
    expect(adeptPowerKey({ name: "Speedy", flags: { core: { sourceId: SRC("b03361c78fba6c27") } } })).toBe("increased_reflexes");
    expect(adeptPowerKey({ name: "Improved Physical Senses Deluxe" })).toBeNull();
    expect(adeptPowerKey({ name: "Improved Physical Senses (Thermo Vision)" })).toBe("improved_senses");
    expect(adeptPowerKey({ name: "Killing Hands (S)" })).toBe("killing_hands");
    expect(adeptPowerKey({ name: "Killing Hands Plus" })).toBeNull();
    expect(improvedAttributeOf("improved_attribute", { quickness: 1 })).toBe("quickness");
    expect(adeptPowerKey({ name: "x", _stats: { compendiumSource: "Compendium.other.x" }, flags: { core: { sourceId: SRC("b03361c78fba6c27") } } })).toBe("increased_reflexes");
    expect(adeptPowerKey({ name: "Improved Physical Senses (Thermo Vision) Deluxe)" })).toBeNull();
    expect(adeptPowerKey({ name: "Improved Ability (Computers (B/R))" })).toBe("improved_ability");
    expect(improvedAttributeOf("improved_attribute:body", {})).toBe("body");
  });
  it("Combat Sense dice: the highest level, physical adepts only, human form only", () => {
    const cs = (level) => ({ type: "adept_power", name: "Combat Sense", system: { level } });
    expect(combatSenseDice([cs(2)], { physicalAdept: true })).toBe(2);
    expect(combatSenseDice([cs(5)], { physicalAdept: true })).toBe(3);
    expect(combatSenseDice([cs(2)], { physicalAdept: false })).toBe(0);
    expect(combatSenseDice([cs(2)], { physicalAdept: true, powersWork: false })).toBe(0);
    expect(combatSenseDice([], { physicalAdept: true })).toBe(0);
  });
});

describe("S9: vehicles bought at creation (p.46, p.264)", () => {
  const withVehicles = (vehicles) => chargenBudget({ system: actor({ chargen: { vehicles } }), items: [], table });
  it("the receipts' list prices count as Resources; a receipt without a price counts nothing and is reported", () => {
    const base = chargenBudget({ system: actor(), items: [], table }).resources;
    expect([base.spent, base.vehicles, base.vehicleProblems]).toEqual([0, 0, []]);   // an old source without the field
    const r = withVehicles([{ name: "Dodge Scoot", source: "x", cost: 2000 }, { name: "Ford Americar", source: "y", cost: 16000 }]).resources;
    expect([r.spent, r.vehicles, r.remaining]).toEqual([18000, 18000, 1000000 - 18000]);
    const bad = withVehicles([{ name: "GMC Banshee", source: "z", cost: 0 }]).resources;
    expect([bad.spent, bad.vehicleProblems]).toEqual([0, ["GMC Banshee has no list price (p.264): it can't be bought at creation."]]);
    expect(withVehicles([{ name: "Huge", cost: 2000000 }]).resources.over).toBe(true);
  });
  it("vehicleReceipt: name, compendium source, positive list price", async () => {
    const { vehicleReceipt } = await import("../module/rules/sr2e-rules.mjs");
    expect(vehicleReceipt({ name: "Dodge Scoot", pack: "sr2e.vehicles", uuid: "Compendium.sr2e.vehicles.Actor.a", system: { cost: 2000 } }))
      .toEqual({ name: "Dodge Scoot", source: "Compendium.sr2e.vehicles.Actor.a", cost: 2000 });
    expect(vehicleReceipt({ name: "Van", uuid: "Actor.b", _stats: { compendiumSource: "Compendium.sr2e.vehicles.Actor.c" }, system: { cost: 0 } }))
      .toEqual({ name: "Van", source: "Compendium.sr2e.vehicles.Actor.c", cost: 0 });
  });
});

describe("adeptPowerBudget: a physical adept's power points, pure (SR2E p.124–126)", async () => {
  const { adeptPowerBudget } = await import("../module/rules/sr2e-rules.mjs");
  const P = (id, name, system, src) => ({ id, type: "adept_power", name, system: { level: 1, pointCost: 1, attributeMods: {}, ...system }, flags: {}, _stats: { compendiumSource: src ?? null } });
  const human = SR2E.racialMaximums.human;
  it("prices each power by the book with the character's context and reports totals", () => {
    // Human Quickness 4 (natural) +3: 5 → 1, 6 → 1, 7 → 1.5 = 3.5 (p.125, R4); Increased Reflexes +2 = 4; Combat Sense 2 = 3.
    const items = [P("q", "Improved Physical Attributes (Quickness)", { level: 3, attributeMods: { quickness: 1 } }),
      P("r", "Increased Reflexes", { level: 2 }), P("c", "Combat Sense", { level: 2 })];
    const b = adeptPowerBudget({ items, maxes: human, natural: { quickness: 4 }, magic: 6 });
    expect(b.costs).toEqual({ q: 3.5, r: 4, c: 3 });
    expect(b.used).toBe(10.5);
    expect(b.problems).toEqual(["10.5 power points used; the Magic Rating gives 6 — give up improvements to match (p.126)."]);
  });
  it("Improved Ability on Firearms 2 with 3 dice is reported (p.125); non-powers are ignored", () => {
    const items = [P("a", "Improved Ability", { level: 3, improvedSkill: "Firearms" }), { id: "s", type: "skill", name: "Firearms", system: { rating: 2 } }];
    const b = adeptPowerBudget({ items, maxes: human, natural: {}, magic: 6 });
    expect([b.costs, b.used]).toEqual([{ a: 3 }, 3]);
    expect(b.problems.join()).toMatch(/3 Improved Ability dice on Firearms 2/);
  });
});
