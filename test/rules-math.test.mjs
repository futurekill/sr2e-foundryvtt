import { describe, it, expect } from "vitest";
import {
  DAMAGE_LEVELS, damageBoxes, stageLevel,
  columnWoundPenalty, totalWoundPenalty,
  systemOperationTN, personaAttribute,
  icReactionBase, alertAdjustedRating, programSize
} from "../module/rules/sr2e-rules.mjs";

describe("Damage levels & boxes (SR2E p.113)", () => {
  it("fills 1/3/6/10 boxes for L/M/S/D", () => {
    expect(damageBoxes("L")).toBe(1);
    expect(damageBoxes("M")).toBe(3);
    expect(damageBoxes("S")).toBe(6);
    expect(damageBoxes("D")).toBe(10);
  });

  it("orders levels L < M < S < D", () => {
    expect(DAMAGE_LEVELS).toEqual(["L", "M", "S", "D"]);
  });
});

describe("Damage staging (SR2E p.110)", () => {
  it("stages up and clamps at Deadly", () => {
    expect(stageLevel("L", 1)).toBe("M");
    expect(stageLevel("M", 2)).toBe("D");
    expect(stageLevel("S", 5)).toBe("D"); // clamps
  });

  it("stages down and clamps at Light", () => {
    expect(stageLevel("S", -1)).toBe("M");
    expect(stageLevel("M", -5)).toBe("L"); // clamps
  });

  it("returns the level unchanged for 0 steps", () => {
    expect(stageLevel("M", 0)).toBe("M");
  });
});

describe("Injury Modifier (SR2E p.112)", () => {
  it("steps a single column 0→+1→+2→+3 at 1/3/6 boxes", () => {
    expect(columnWoundPenalty(0)).toBe(0);
    expect(columnWoundPenalty(1)).toBe(1);
    expect(columnWoundPenalty(2)).toBe(1);
    expect(columnWoundPenalty(3)).toBe(2);
    expect(columnWoundPenalty(5)).toBe(2);
    expect(columnWoundPenalty(6)).toBe(3);
    expect(columnWoundPenalty(10)).toBe(3);
  });

  it("is cumulative across the Physical and Stun monitors", () => {
    // Light physical (+1) + Moderate stun (+2) = +3
    expect(totalWoundPenalty(1, 4)).toBe(3);
    // Serious physical (+3) + Serious stun (+3) = +6
    expect(totalWoundPenalty(7, 8)).toBe(6);
    expect(totalWoundPenalty(0, 0)).toBe(0);
  });
});

describe("Matrix system-operation TN (SR2E p.166–167)", () => {
  it("equals the System Rating on the first attempt", () => {
    expect(systemOperationTN(4, 0)).toBe(4);
  });

  it("adds +2 per prior attempt", () => {
    expect(systemOperationTN(4, 1)).toBe(6);
    expect(systemOperationTN(4, 3)).toBe(10);
  });

  it("adds an untrained Skill-Web default penalty", () => {
    expect(systemOperationTN(4, 0, 4)).toBe(8);
    expect(systemOperationTN(4, 2, 4)).toBe(12);
  });
});

describe("Program memory size (SR2E p.174–177)", () => {
  it("is Rating² × multiplier", () => {
    // Browse ×1: R3 → 9 Mp
    expect(programSize(3, 1)).toBe(9);
    // Attack ×2: R4 → 32 Mp
    expect(programSize(4, 2)).toBe(32);
    // Shield ×4: R2 → 16 Mp
    expect(programSize(2, 4)).toBe(16);
    // Analyze ×3: R6 → 108 Mp
    expect(programSize(6, 3)).toBe(108);
  });
});

describe("Persona attribute cap (SR2E p.172–174)", () => {
  it("caps a program's rating at the deck's MPCP", () => {
    expect(personaAttribute(6, 4)).toBe(4); // program higher than MPCP
    expect(personaAttribute(3, 6)).toBe(3); // program lower than MPCP
  });
});

describe("IC Reaction Time base (SR2E p.169)", () => {
  it("is 5/7/9 for Green/Orange/Red and 0 for Blue (no IC)", () => {
    expect(icReactionBase("blue")).toBe(0);
    expect(icReactionBase("green")).toBe(5);
    expect(icReactionBase("orange")).toBe(7);
    expect(icReactionBase("red")).toBe(9);
  });

  it("combined with rating gives the Reaction (before the 1D6)", () => {
    // Orange node, IC rating 4 → 7 + 4 = 11
    expect(icReactionBase("orange") + 4).toBe(11);
  });
});

describe("Alert IC-rating modifier (SR2E p.168)", () => {
  it("leaves ratings unchanged with no alert", () => {
    expect(alertAdjustedRating(4, "none")).toBe(4);
  });

  it("adds +50% (rounded down) on a passive alert", () => {
    expect(alertAdjustedRating(4, "passive")).toBe(6);
    expect(alertAdjustedRating(5, "passive")).toBe(7); // 7.5 → 7
  });

  it("keeps the +50% boost on an active alert", () => {
    expect(alertAdjustedRating(4, "active")).toBe(6);
  });
});
