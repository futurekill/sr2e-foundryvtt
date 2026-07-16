// Purchase pricing — rating rows × quality grade.
// Custom cyberware grades: Street Samurai Catalog (Revised) p.98. Bioware: Shadowtech p.7.
import { describe, it, expect } from "vitest";
import { gradeCostMultiplier, ratedCost, itemBaseCost, gradeEssenceCost,
         CYBERWARE_GRADE_ESSENCE_FLOOR } from "../module/rules/sr2e-rules.mjs";

describe("gradeCostMultiplier", () => {
  // SSC p.98 Custom Cyberware table: Alpha ×3, Beta ×7. (An earlier version of
  // this table carried SR3's ×2 alphaware line — SR2 has no generic alphaware
  // and no deltaware at all.)
  it("alphaware cyberware is ×3", () => expect(gradeCostMultiplier("cyberware", "alpha")).toBe(3));
  it("betaware cyberware is ×7", () => expect(gradeCostMultiplier("cyberware", "beta")).toBe(7));
  it("cultured bioware is ×4", () => expect(gradeCostMultiplier("bioware", "cultured")).toBe(4));
  it("standard is ×1", () => {
    expect(gradeCostMultiplier("cyberware", "standard")).toBe(1);
    expect(gradeCostMultiplier("bioware", "standard")).toBe(1);
    expect(gradeCostMultiplier("gear", undefined)).toBe(1);
  });
  it("has no delta grade — that's SR3", () => {
    expect(gradeCostMultiplier("cyberware", "delta")).toBe(1);
  });
});

describe("gradeEssenceCost (SSC p.98)", () => {
  it("reduces alpha by 20% and beta by 40%", () => {
    expect(gradeEssenceCost(2.0, "alpha")).toBe(1.6);   // wired reflexes 1
    expect(gradeEssenceCost(2.0, "beta")).toBe(1.2);
  });
  it("leaves standard untouched", () => {
    expect(gradeEssenceCost(0.5, "standard")).toBe(0.5);
    expect(gradeEssenceCost(0.5, undefined)).toBe(0.5);
  });
  it("rounds UP, not to nearest", () => {
    // 0.3 × 0.8 = 0.24 exactly; 0.35 × 0.8 = 0.28. Use a value that needs it:
    // 0.19 × 0.8 = 0.152 → up to 0.16 (nearest would give 0.15).
    expect(gradeEssenceCost(0.19, "alpha")).toBe(0.16);
    // 0.19 × 0.6 = 0.114 → up to 0.12 (nearest would give 0.11).
    expect(gradeEssenceCost(0.19, "beta")).toBe(0.12);
  });
  it("does not let binary float error round up a whole cent", () => {
    // 0.3 × 0.8 === 0.24000000000000002 in IEEE754; must stay 0.24, not 0.25.
    expect(gradeEssenceCost(0.3, "alpha")).toBe(0.24);
  });
  it("never reduces below .05", () => {
    expect(gradeEssenceCost(0.05, "beta")).toBe(CYBERWARE_GRADE_ESSENCE_FLOOR);
    expect(gradeEssenceCost(0.01, "alpha")).toBe(CYBERWARE_GRADE_ESSENCE_FLOOR);
  });
  it("applies the floor only to a reduction — a cheap standard item keeps its value", () => {
    expect(gradeEssenceCost(0.01, "standard")).toBe(0.01);
  });
  it("leaves standard values at their authored precision (no re-rounding)", () => {
    expect(gradeEssenceCost(0.333, "standard")).toBe(0.333);
  });
  it("free ware stays free — the .05 floor never invents Essence from zero", () => {
    expect(gradeEssenceCost(0, "alpha")).toBe(0);
    expect(gradeEssenceCost(0, "beta")).toBe(0);
  });
  it("handles zero and junk", () => {
    expect(gradeEssenceCost(0, "standard")).toBe(0);
    expect(gradeEssenceCost(-5, "standard")).toBe(0);
    expect(gradeEssenceCost(NaN, "standard")).toBe(0);
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
  it("alphaware cyberware applies ×3 (SSC p.98)", () => {
    expect(itemBaseCost({ type: "cyberware", grade: "alpha", cost: 5000, ratingStats: [] })).toBe(15000);
  });
  it("betaware cyberware applies ×7 (SSC p.98)", () => {
    expect(itemBaseCost({ type: "cyberware", grade: "beta", cost: 5000, ratingStats: [] })).toBe(35000);
  });
});
