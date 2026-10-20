// Delta grade and cybersurgery (Cybertechnology p.44, p.53); elective surgery (core p.114);
// secondhand bioware (Shadowtech p.12). docs/PLAN-cybersurgery-grades.md
import { describe, it, expect } from "vitest";
import { gradeEssenceCost, gradeCostMultiplier, itemBaseCost, effectiveBodyCost, surgeryEssencePct, surgeonTN,
         surgicalEssence, surgeryCategory, secondhandPriceMultiplier } from "../module/rules/sr2e-rules.mjs";

describe("delta grade (Cybertechnology p.44)", () => {
  it("halves Essence (rounded up, .05 floor) and costs ×10", () => {
    expect(gradeEssenceCost(0.25, "delta")).toBe(0.13);
    expect(gradeEssenceCost(0.05, "delta")).toBe(0.05);
    expect(gradeEssenceCost(3, "delta")).toBe(1.5);
    expect(itemBaseCost({ type: "cyberware", grade: "delta", cost: 1000 })).toBe(10000);
  });
});

describe("secondhand bioware (Shadowtech p.12)", () => {
  it("40–60% off, clamped, default 50; same Body Cost", () => {
    expect(secondhandPriceMultiplier(40)).toBeCloseTo(0.6);
    expect(secondhandPriceMultiplier(60)).toBeCloseTo(0.4);
    expect(secondhandPriceMultiplier(undefined)).toBeCloseTo(0.5);
    expect(secondhandPriceMultiplier(90)).toBeCloseTo(0.4);
    expect(itemBaseCost({ type: "bioware", grade: "secondhand", secondhandDiscount: 60, cost: 10000 })).toBeCloseTo(4000);
    expect(effectiveBodyCost(0.4, "secondhand")).toBe(0.4);
    expect(gradeCostMultiplier("bioware", "secondhand", "neural", 60)).toBe(1);
  });
});

describe("cybersurgery (Cybertechnology p.53)", () => {
  it("every success band of the Essence Cost Change Table", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(surgeryEssencePct)).toEqual([15, 10, 0, 0, -10, -10, -20, -20]);
  });
  it("the surgeon's TN: 10 − ⌊end Essence⌋ − 2, min 2", () => {
    expect(surgeonTN(2.3)).toBe(6);
    expect(surgeonTN(5.9)).toBe(3);
    expect(surgeonTN(0.2)).toBe(8);
    expect(surgeonTN(9)).toBe(2);
  });
  it("rounds the changed Essence up; 0% leaves fine precision alone", () => {
    expect(surgicalEssence(0.025, 0)).toBe(0.025);
    expect(surgicalEssence(0.5, 15)).toBe(0.58);
    expect(surgicalEssence(1, -20)).toBe(0.8);
    expect(surgicalEssence(0.05, -20)).toBe(0.04);
    expect(surgicalEssence(0, 15)).toBe(0);
  });
});

describe("elective surgery category (core p.114) and fee (Cybertechnology p.53)", () => {
  it("boundaries, after rounding up to the hundredth", () => {
    const k = (e) => surgeryCategory(e).key;
    expect(k(0)).toBe("cosmetic");
    expect(k(0.4)).toBe("minor");
    expect(k(0.401)).toBe("major");
    expect(k(0.41)).toBe("major");
    expect(k(0.99)).toBe("major");
    expect(k(0.995)).toBe("drastic");
    expect(k(1)).toBe("drastic");
    expect(surgeryCategory(0.3)).toMatchObject({ wound: "M", boxes: 3, fee: 5000 });
    expect(surgeryCategory(2)).toMatchObject({ wound: "D", boxes: 10, fee: 250000 });
  });
});

import { startingMoney } from "../module/rules/sr2e-rules.mjs";
describe("starting money (SR2E p.47)", () => {
  it("unspent Resources at 10:1 plus 3D6 × 1,000¥", () => {
    expect(startingMoney(15000, 0)).toBe(1500);            // the book's example
    expect(startingMoney(15005, 10)).toBe(11500);
    expect(startingMoney(-500, 3)).toBe(3000);              // overspent: nothing to convert
  });
});
