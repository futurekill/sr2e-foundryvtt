import { describe, it, expect } from "vitest";
import { limbOptionCost }
  from "../module/rules/sr2e-rules.mjs";

// SR2E book p.261, Limbs block (corrected 11th printing):
//   Increased Strength   —  essence, 6/4 days, + (Rating x 150,000¥), SI 1.5
//   Built-In Smartlink  .25 essence, 6/4 days, +2,500¥,               SI 1.5
//   Built-In Device      —  essence, Varies,   + (4 x Normal Cost),   SI varies
describe("limbOptionCost (SR2 p.261)", () => {
  it("Increased Strength is Rating x 150,000¥", () => {
    const sys = { costPerRating: 150000, rating: 1, cost: 0 };
    expect(limbOptionCost(sys)).toBe(150000);
    expect(limbOptionCost({ ...sys, rating: 3 })).toBe(450000);
  });

  it("Built-In Device is 4 x the device's normal cost", () => {
    expect(limbOptionCost({ costMultiplierOfBase: 4, cost: 1000, rating: 1 })).toBe(4000);
  });

  it("Built-In Smartlink is a flat 2,500¥ regardless of rating", () => {
    const sys = { cost: 2500, rating: 1 };
    expect(limbOptionCost(sys)).toBe(2500);
    expect(limbOptionCost({ ...sys, rating: 4 })).toBe(2500);
  });

  it("per-rating pricing wins over a multiplier, which wins over the flat cost", () => {
    expect(limbOptionCost({ costPerRating: 150000, costMultiplierOfBase: 4, cost: 999, rating: 2 }))
      .toBe(300000);
    expect(limbOptionCost({ costMultiplierOfBase: 4, cost: 999, rating: 2 })).toBe(3996);
  });

  it("is idempotent — re-deriving from the same authored fields never compounds", () => {
    const sys = { costPerRating: 150000, rating: 2, cost: 0 };
    const once = limbOptionCost(sys);
    expect(limbOptionCost(sys)).toBe(once);   // no hidden state, no accumulation
  });

  it("a rating-0 or missing rating costs nothing per-rating (no NaN)", () => {
    expect(limbOptionCost({ costPerRating: 150000, rating: 0 })).toBe(0);
    expect(limbOptionCost({})).toBe(0);
  });
});

