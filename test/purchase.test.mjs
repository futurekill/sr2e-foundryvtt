// Purchase pricing — rating rows × quality grade (SSC p.29, Shadowtech p.7).
import { describe, it, expect } from "vitest";
import { gradeCostMultiplier, ratedCost, itemBaseCost } from "../module/rules/sr2e-rules.mjs";

describe("gradeCostMultiplier", () => {
  it("alphaware cyberware is ×2", () => expect(gradeCostMultiplier("cyberware", "alpha")).toBe(2));
  it("cultured bioware is ×4", () => expect(gradeCostMultiplier("bioware", "cultured")).toBe(4));
  it("standard is ×1", () => {
    expect(gradeCostMultiplier("cyberware", "standard")).toBe(1);
    expect(gradeCostMultiplier("bioware", "standard")).toBe(1);
    expect(gradeCostMultiplier("gear", undefined)).toBe(1);
  });
});

describe("ratedCost", () => {
  const rows = [{ rating: 1, cost: 60000 }, { rating: 2, cost: 100000 }];
  it("returns the matching rating's cost", () => {
    expect(ratedCost(rows, 1)).toBe(60000);
    expect(ratedCost(rows, 2)).toBe(100000);
  });
  it("clamps to nearest rating when no exact match", () => {
    expect(ratedCost(rows, 5)).toBe(100000);
  });
  it("falls back to flat cost with no table", () => {
    expect(ratedCost([], 1, 4200)).toBe(4200);
    expect(ratedCost(undefined, 1, 4200)).toBe(4200);
  });
});

describe("itemBaseCost — rating × grade", () => {
  const pump = { type: "bioware", ratingStats: [{ rating: 1, cost: 60000 }, { rating: 2, cost: 100000 }] };
  it("Adrenal Pump R1 = 60k, R2 = 100k", () => {
    expect(itemBaseCost({ ...pump, rating: 1, grade: "standard" })).toBe(60000);
    expect(itemBaseCost({ ...pump, rating: 2, grade: "standard" })).toBe(100000);
  });
  it("cultured bioware applies ×4 on top of the rating cost", () => {
    expect(itemBaseCost({ ...pump, rating: 2, grade: "cultured" })).toBe(400000);
  });
  it("alphaware cyberware applies ×2", () => {
    expect(itemBaseCost({ type: "cyberware", grade: "alpha", cost: 5000, ratingStats: [] })).toBe(10000);
  });
});
