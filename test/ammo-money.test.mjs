import { describe, it, expect } from "vitest";
import { proportionalRefund, chargenItemCost } from "../module/rules/sr2e-rules.mjs";

// The two ammo money bugs (PLAN-ammo-stacking.md, problems 3 & 4).
describe("proportionalRefund — kills the free-ammo exploit", () => {
  it("refunds nothing for an emptied box (the exploit)", () => {
    // Bought a 10-round box for 15¥, fired/reloaded it to 0 → sell refunds 0.
    expect(proportionalRefund({ paid: 15, acquiredQuantity: 10, currentQuantity: 0 })).toBe(0);
  });
  it("refunds the full price for an untouched box", () => {
    expect(proportionalRefund({ paid: 15, acquiredQuantity: 10, currentQuantity: 10 })).toBe(15);
  });
  it("refunds proportionally for a partly-used box (floor)", () => {
    // 6 of 10 left → floor(15 * 6/10) = floor(9) = 9.
    expect(proportionalRefund({ paid: 15, acquiredQuantity: 10, currentQuantity: 6 })).toBe(9);
    // 3 of 10 → floor(4.5) = 4.
    expect(proportionalRefund({ paid: 15, acquiredQuantity: 10, currentQuantity: 3 })).toBe(4);
  });
  it("caps at what was paid even if a GM inflated the quantity", () => {
    // currentQuantity 20 vs acquired 10 → would be 30, capped at paid 15.
    expect(proportionalRefund({ paid: 15, acquiredQuantity: 10, currentQuantity: 20 })).toBe(15);
  });
  it("refunds 0 with no basis (missing acquiredQuantity → no div-by-zero)", () => {
    expect(proportionalRefund({ paid: 15, acquiredQuantity: 0, currentQuantity: 5 })).toBe(0);
    expect(proportionalRefund({ paid: 15 })).toBe(0);
    expect(proportionalRefund()).toBe(0);
  });
});

describe("chargenItemCost — ammo counts its bundle price, not ×rounds", () => {
  it("counts a 10-round box at its bundle price (not 10×)", () => {
    // acquiredListValue recorded at purchase = 15 (the box), NOT 15×10.
    expect(chargenItemCost({ type: "ammo", cost: 15, quantity: 10, acquiredListValue: 15 })).toBe(15);
  });
  it("legacy ammo with no recorded basis falls back to one bundle (cost), not ×rounds", () => {
    expect(chargenItemCost({ type: "ammo", cost: 15, quantity: 10 })).toBe(15);
  });
  it("normal gear is still itemBaseCost × quantity", () => {
    // Three grenades at 50 each = 150.
    expect(chargenItemCost({ type: "weapon", cost: 50, quantity: 3 })).toBe(150);
    expect(chargenItemCost({ type: "gear", cost: 20, quantity: 1 })).toBe(20);
  });
});
