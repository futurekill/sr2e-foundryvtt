// Purchase pricing — rating rows × quality grade.
// Custom cyberware grades: Street Samurai Catalog (Revised) p.98. Bioware: Shadowtech p.7.
import { describe, it, expect } from "vitest";
import { gradeCostMultiplier, ratedCost, itemBaseCost, gradeEssenceCost,
         CYBERWARE_GRADE_ESSENCE_FLOOR, ratedRow, ratedStreetIndex,
         derivedItemCost, purchasePromptFields } from "../module/rules/sr2e-rules.mjs";

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


describe("ratedRow / ratedCost semantics", () => {
  const rows = [{ rating: 1, cost: 60000 }, { rating: 2, cost: 100000 }];
  it("picks the exact row, else the nearest", () => {
    expect(ratedRow(rows, 2).cost).toBe(100000);
    expect(ratedRow(rows, 9).cost).toBe(100000);   // nearest
    expect(ratedRow([], 1)).toBe(null);
  });
  // The asymmetry is deliberate and load-bearing: a row that EXISTS but has no
  // `cost` must yield 0, NOT the flat cost. `?? flatCost` would silently re-price
  // partial/malformed tables.
  it("a row present but lacking `cost` is 0, NOT the flat cost", () => {
    expect(ratedCost([{ rating: 1 }], 1, 4200)).toBe(0);
  });
  it("no table falls back to the flat cost", () => {
    expect(ratedCost([], 1, 4200)).toBe(4200);
    expect(ratedCost(undefined, 1, 4200)).toBe(4200);
  });
  it("no table and no flat cost is 0", () => {
    expect(ratedCost([], 1, undefined)).toBe(0);
  });
});

describe("ratedStreetIndex", () => {
  it("takes the governing row's SI", () => {
    expect(ratedStreetIndex([{ rating: 1, streetIndex: 3 }], 1, 1)).toBe(3);
  });
  it("treats a numeric 0 as PRESENT, not absent", () => {
    // `||` would fall through to the flat SI here — the bug this guards.
    expect(ratedStreetIndex([{ rating: 1, streetIndex: 0 }], 1, 2)).toBe(0);
  });
  it("falls back when the row specifies none", () => {
    expect(ratedStreetIndex([{ rating: 1, streetIndex: "" }], 1, 2)).toBe(2);
    expect(ratedStreetIndex([{ rating: 1 }], 1, 2)).toBe(2);
  });
  it("falls back with no table at all", () => {
    expect(ratedStreetIndex([], 1, 2)).toBe(2);
  });
});

describe("derivedItemCost — cost computed from a formula, not a snapshot", () => {
  // REGRESSION: a partial projection (chargenSpend passes no `multiplier`) used to
  // yield NaN — and `NaN ?? fallback` does NOT fall through, so it propagated
  // straight into the chargen resources total. Refuse rather than guess.
  it("returns null — never NaN — when an input it needs is missing", () => {
    expect(derivedItemCost({ type: "program", rating: 3 })).toBe(null);            // no multiplier
    expect(derivedItemCost({ type: "program", multiplier: 2 })).toBe(null);        // no rating
    expect(derivedItemCost({ type: "gear", category: "skillsoft" })).toBe(null);   // no rating
    expect(derivedItemCost({ type: "focus" })).toBe(null);                         // no force
    expect(derivedItemCost({ type: "focus", force: 2 })).toBe(null);               // no unit cost
  });
  it("a partial projection falls back to the stored snapshot, not NaN", () => {
    const proj = { type: "program", cost: 1800, rating: 3, ratingStats: [] };
    expect(itemBaseCost(proj)).toBe(1800);
    expect(Number.isNaN(itemBaseCost(proj))).toBe(false);
  });
  it("returns null for authored/rated items (they price the old way)", () => {
    expect(derivedItemCost({ type: "weapon", cost: 700 })).toBe(null);
    expect(derivedItemCost({ type: "gear", category: "clothing", cost: 50 })).toBe(null);
    expect(derivedItemCost(null)).toBe(null);
  });
  it("prices a skillsoft from its category + rating", () => {
    const sys = { type: "gear", category: "skillsoft", grantedSkillCategory: "active", rating: 6 };
    expect(derivedItemCost(sys)).toBe(30000);        // 300 Mp x 100
  });
  it("honours an authored DataSoft price via ctx", () => {
    const sys = { type: "gear", category: "skillsoft", grantedSkillCategory: "data", rating: 1 };
    expect(derivedItemCost(sys, { authoredCost: 50000 })).toBe(50000);
    expect(derivedItemCost(sys)).toBe(1000);         // FoF Mp x 100 fallback
  });
  it("prices a program by ruleset — VR2 comes from ctx, not a setting", () => {
    // VR2's per-Mp multiplier is BANDED (100/200/500/1000 by rating), so ratings
    // 1-3 are identical to core and prove nothing. Rating 4 is the first band edge.
    const low = { type: "program", rating: 3, multiplier: 2 };
    expect(derivedItemCost(low, { vr2: false })).toBe(1800);
    expect(derivedItemCost(low, { vr2: true })).toBe(1800);    // same band — no divergence

    const high = { type: "program", rating: 4, multiplier: 2 };
    expect(derivedItemCost(high, { vr2: false })).toBe(3200);  // ceil(16x2)=32 x100
    expect(derivedItemCost(high, { vr2: true })).toBe(6400);   // x200 in VR2's band
  });
  it("prices a flat focus from force x costPerForce", () => {
    expect(derivedItemCost({ type: "focus", force: 3, costPerForce: 10000 })).toBe(30000);
  });
  it("a bonded weapon focus prices off the WEAPON's reach and overrides the flat path", () => {
    const sys = { type: "focus", focusType: "weapon", force: 2, costPerForce: 10000 };
    // (reach 1 + 1) x 100k + force 2 x 90k = 380,000 — not force x costPerForce.
    expect(derivedItemCost(sys, { bondedWeaponReach: 1 })).toBe(380000);
  });
  it("only a WEAPON focus takes the weapon path, even with a stale reach", () => {
    // _applyWeaponFoci gates on focusType === "weapon"; the helper must agree, or a
    // focus retyped to "spell" with a lingering bondedWeaponId keeps weapon pricing
    // in the hook while the sheet shows the flat price.
    const spell = { type: "focus", focusType: "spell", force: 2, costPerForce: 10000 };
    expect(derivedItemCost(spell, { bondedWeaponReach: 1 })).toBe(20000);
  });
  it("an unbonded weapon focus (no reach in ctx) falls back to the flat path", () => {
    expect(derivedItemCost({ type: "focus", force: 2, costPerForce: 10000 })).toBe(20000);
  });
});

describe("itemBaseCost prices a HYPOTHETICAL configuration (the exploit)", () => {
  // THE BUG: the purchase hook builds newSys = {...oldSys, rating: 6} while `cost`
  // still holds the value derived for rating 1. Pricing that off the snapshot
  // returned the OLD price, so delta === 0 and the upgrade was free.
  const soft = (rating) => ({
    type: "gear", category: "skillsoft", grantedSkillCategory: "active",
    rating, ratingStats: [], cost: 1000    // cost = the rating-1 snapshot, deliberately stale
  });
  it("charges 29,000Y for an ActiveSoft rating 1 -> 6", () => {
    const oldBase = itemBaseCost(soft(1));
    const newBase = itemBaseCost(soft(6));
    expect(oldBase).toBe(1000);
    expect(newBase).toBe(30000);
    expect(newBase - oldBase).toBe(29000);   // was 0 before derivedItemCost
  });
  it("still applies the grade multiplier on top of a derived cost", () => {
    // Not a real combination today, but the composition must hold.
    const sys = { type: "program", rating: 3, multiplier: 2, grade: "standard" };
    expect(itemBaseCost(sys, { vr2: false })).toBe(1800);
  });
  it("leaves rated ware pricing exactly as before", () => {
    const pump = { type: "bioware", grade: "cultured", rating: 2,
                   ratingStats: [{ rating: 1, cost: 60000 }, { rating: 2, cost: 100000 }] };
    expect(itemBaseCost(pump)).toBe(400000);   // 100k x4 cultured
  });
});

describe("purchasePromptFields — which cost drivers the buy dialog asks for", () => {
  it("skillsoft → rating + skill category", () => {
    expect(purchasePromptFields({ type: "gear", category: "skillsoft" }))
      .toEqual(["rating", "grantedSkillCategory"]);
  });
  it("program → rating", () => {
    expect(purchasePromptFields({ type: "program" })).toEqual(["rating"]);
  });
  it("a flat (per-Force) focus → force", () => {
    expect(purchasePromptFields({ type: "focus", focusType: "spell", costPerForce: 20000 }))
      .toEqual(["force"]);
  });
  it("a weapon focus asks NOTHING here (its own bond dialog handles it)", () => {
    expect(purchasePromptFields({ type: "focus", focusType: "weapon", costPerForce: 0 }))
      .toEqual([]);
  });
  it("cyberware → grade (even with no rating table)", () => {
    expect(purchasePromptFields({ type: "cyberware" })).toEqual(["grade"]);
  });
  it("rated cyberware → rating + grade", () => {
    expect(purchasePromptFields({ type: "cyberware",
      ratingStats: [{ rating: 1 }, { rating: 2 }] })).toEqual(["rating", "grade"]);
  });
  it("plain single-price gear → nothing (no dialog)", () => {
    expect(purchasePromptFields({ type: "gear", category: "general" })).toEqual([]);
  });
  it("gear with a real rating table → rating", () => {
    expect(purchasePromptFields({ type: "gear",
      ratingStats: [{ rating: 1 }, { rating: 2 }] })).toEqual(["rating"]);
  });
});
