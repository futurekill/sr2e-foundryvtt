// Projectile Weapons Table (SR2 p.96). Bows are "purchased with a specified
// Strength Minimum", which sets BOTH price (100¥ x Str Min) and damage
// ((Str Min + 2)M); throwing weapons are flat-priced and do (Str)L.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { strengthMinWeaponStats, derivedItemCost, purchasePromptFields } from "../module/rules/sr2e-rules.mjs";

const BOW = { type: "weapon", costPerStrengthMin: 100, strMinDamageBonus: 2, damageCode: "3M" };

describe("strengthMinWeaponStats — Standard Bow (p.96)", () => {
  it("prices at 100¥ x Str Min and does (Str Min + 2)M", () => {
    // The reported case: a bow needing Strength 4 costs 400¥ and does 6M.
    expect(strengthMinWeaponStats({ ...BOW, strengthMinimum: 4 }))
      .toEqual({ cost: 400, damageCode: "6M" });
    expect(strengthMinWeaponStats({ ...BOW, strengthMinimum: 1 }))
      .toEqual({ cost: 100, damageCode: "3M" });
    expect(strengthMinWeaponStats({ ...BOW, strengthMinimum: 6 }))
      .toEqual({ cost: 600, damageCode: "8M" });
  });

  it("is idempotent — re-deriving an already-derived weapon is stable", () => {
    // Guards the trap where a sheet save bakes the derived code back over the
    // template: power comes from Str Min, never from the stored string.
    const once = strengthMinWeaponStats({ ...BOW, strengthMinimum: 4 });
    const twice = strengthMinWeaponStats({ ...BOW, strengthMinimum: 4, damageCode: once.damageCode });
    expect(twice).toEqual(once);
  });

  it("keeps the authored damage LEVEL, not just the power", () => {
    expect(strengthMinWeaponStats({ ...BOW, strengthMinimum: 3, damageCode: "5S" }).damageCode).toBe("5S");
  });

  it("returns null for flat-priced weapons (every non-bow)", () => {
    expect(strengthMinWeaponStats({ type: "weapon", cost: 30 })).toBeNull();
    expect(strengthMinWeaponStats({ ...BOW, strengthMinimum: 0 })).toBeNull();   // Str Min NA
    expect(strengthMinWeaponStats({ strengthMinimum: 4 })).toBeNull();           // no per-point price
    expect(strengthMinWeaponStats()).toBeNull();
  });
});

describe("purchase plumbing", () => {
  it("derivedItemCost prices a bow off its Strength Minimum", () => {
    expect(derivedItemCost({ ...BOW, strengthMinimum: 4 })).toBe(400);
    expect(derivedItemCost({ type: "weapon", cost: 30 })).toBeNull();  // flat → stored cost
  });
  it("the buyer is asked for Strength Minimum, and only for bows", () => {
    expect(purchasePromptFields({ ...BOW, strengthMinimum: 1 })).toContain("strengthMinimum");
    expect(purchasePromptFields({ type: "weapon", cost: 30 })).not.toContain("strengthMinimum");
  });
});

describe("compendium values match the printed table (p.96)", () => {
  const weapon = (name) => {
    const dir = "packs-src/weapons";
    const f = readdirSync(dir).find(f => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).name === name);
    return JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).system;
  };

  it.each([
    ["Shuriken",       30, "(Str)L", 8],
    ["Throwing Knife", 20, "(Str)L", 9],
    ["Light Crossbow",  300, "6L", 2],
    ["Medium Crossbow", 500, "6M", 2],
    ["Heavy Crossbow",  750, "8S", 99]   // 99 = the table's "NA" concealability
  ])("%s costs %i¥ and does %s", (name, cost, dmg, conceal) => {
    const s = weapon(name);
    expect(s.cost).toBe(cost);
    expect(s.damageCode).toBe(dmg);
    expect(s.concealability).toBe(conceal);
  });

  it("the Bow ships as a Str-Min-priced weapon, not a flat 400¥", () => {
    const s = weapon("Bow");
    expect(s.costPerStrengthMin).toBe(100);
    expect(s.strMinDamageBonus).toBe(2);
    expect(strengthMinWeaponStats(s)).toEqual({ cost: 100, damageCode: "3M" });
  });
});
