import { describe, it, expect } from "vitest";
import { ammoStacks } from "../module/rules/sr2e-rules.mjs";

// Shipped data: Regular Ammo qty 10 / cost 15 · APDS qty 10 / cost 120 ·
// MG Belt qty 50 / cost 100. For ammo, `cost` is the price of the WHOLE bundle,
// which is why it's part of the identity.
const box = (over = {}) => ({
  src: "Compendium.sr2e.ammo.abc", name: "Regular Ammo", ammoType: "regular",
  damageModifier: 0, armorModifier: 0, damageType: "", armorCalc: "standard",
  streetIndex: 1, cost: 15, ...over
});

describe("ammoStacks", () => {
  it("merges two identical boxes", () => {
    expect(ammoStacks(box(), box())).toBe(true);
  });

  it("refuses different ammo types", () => {
    expect(ammoStacks(box(), box({ name: "APDS", ammoType: "apds", cost: 120 }))).toBe(false);
  });

  it("refuses different bundle sizes even when they fire identically", () => {
    // A 15¥/10-round box and a 100¥/50-round belt: same rounds, different bundle.
    // Merging them would corrupt the price basis, since cost is per-bundle.
    expect(ammoStacks(box(), box({ cost: 100 }))).toBe(false);
  });

  it("refuses ammo whose ballistics differ", () => {
    expect(ammoStacks(box(), box({ damageModifier: 1 }))).toBe(false);
    expect(ammoStacks(box(), box({ armorModifier: -1 }))).toBe(false);
    expect(ammoStacks(box(), box({ armorCalc: "half" }))).toBe(false);
    expect(ammoStacks(box(), box({ damageType: "stun" }))).toBe(false);
    expect(ammoStacks(box(), box({ streetIndex: 2 }))).toBe(false);
  });

  it("refuses two CONFLICTING compendium sources", () => {
    expect(ammoStacks(box(), box({ src: "Compendium.sr2e.ammo.zzz" }))).toBe(false);
  });

  it("merges on shape when a source is missing on either side", () => {
    // The drop path is fromUuid().toObject() + create, so compendiumSource is
    // not guaranteed — shape has to be able to carry the decision alone.
    expect(ammoStacks(box({ src: null }), box())).toBe(true);
    expect(ammoStacks(box(), box({ src: null }))).toBe(true);
    expect(ammoStacks(box({ src: null }), box({ src: null }))).toBe(true);
  });

  it("never merges hand-made ammo of a different shape, source or not", () => {
    expect(ammoStacks(box({ src: null }), box({ src: null, name: "Homebrew" }))).toBe(false);
  });

  it("survives missing input", () => {
    expect(ammoStacks(null, box())).toBe(false);
    expect(ammoStacks(box(), undefined)).toBe(false);
  });
});
