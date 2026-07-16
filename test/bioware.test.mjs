// Bioware / Body Index math — Shadowtech (FASA7110) p.5–7.
import { describe, it, expect } from "vitest";
import {
  effectiveBodyCost, bodyIndexTotal, biowareEssence,
  overstressPenalty, biowareHealingTnMod, BIOWARE_CULTURED_MULTIPLIER,
  compensatedWoundPenalty, totalWoundPenalty
} from "../module/rules/sr2e-rules.mjs";

const bio = (bodyCost, grade = "standard", installed = true) => ({ installed, bodyCost, grade });

describe("effectiveBodyCost (Shadowtech p.7)", () => {
  it("standard grade is unchanged", () => {
    expect(effectiveBodyCost(0.5, "standard")).toBe(0.5);
  });
  it("cultured grade is 0.75× (25% reduction)", () => {
    expect(effectiveBodyCost(1, "cultured")).toBe(BIOWARE_CULTURED_MULTIPLIER);
    expect(effectiveBodyCost(0.4, "cultured")).toBeCloseTo(0.3, 10);
  });
  it("normalises garbage (NaN / negative / missing) to 0 so bad content can't poison totals", () => {
    expect(effectiveBodyCost(undefined, "standard")).toBe(0);
    expect(effectiveBodyCost(NaN, "standard")).toBe(0);
    expect(effectiveBodyCost(-2, "standard")).toBe(0);
  });
  it("unknown grade defaults to standard (no reduction)", () => {
    expect(effectiveBodyCost(0.5, "bogus")).toBe(0.5);
  });
});

describe("bodyIndexTotal (Shadowtech p.6)", () => {
  it("sums only INSTALLED bioware", () => {
    const rows = [bio(0.5), bio(0.3), bio(1, "standard", false)];
    expect(bodyIndexTotal(rows)).toBeCloseTo(0.8, 10);
  });
  it("applies cultured reduction inside the sum", () => {
    // 0.5 standard + 1.0 cultured(→0.75) = 1.25
    expect(bodyIndexTotal([bio(0.5), bio(1, "cultured")])).toBeCloseTo(1.25, 10);
  });
  it("returns the RAW sum (unrounded) — display rounds, not the mechanical total", () => {
    expect(bodyIndexTotal([bio(0.1), bio(0.2)])).toBeCloseTo(0.3, 10);
  });
  it("empty / nullish is 0", () => {
    expect(bodyIndexTotal([])).toBe(0);
    expect(bodyIndexTotal(undefined)).toBe(0);
  });
});

describe("biowareEssence — awakened only (Shadowtech p.6)", () => {
  const rows = [bio(0.5), bio(1, "cultured")]; // Body Index 1.25
  it("mundane characters pay ZERO Essence for bioware", () => {
    expect(biowareEssence(rows, false)).toBe(0);
  });
  it("awakened characters pay Essence equal to the Body Index", () => {
    expect(biowareEssence(rows, true)).toBeCloseTo(1.25, 10);
  });
});

describe("compensatedWoundPenalty — Damage Compensator (p.24) / Pain Editor (p.26)", () => {
  it("with no implants it matches the normal Injury Modifier", () => {
    expect(compensatedWoundPenalty(3, 1)).toBe(totalWoundPenalty(3, 1));
  });
  it("a track AT OR BELOW the compensator Level contributes no penalty", () => {
    // 3 physical boxes = Moderate (+2) normally; a Level-3 compensator hides it.
    expect(compensatedWoundPenalty(3, 0, { compensator: 3 })).toBe(0);
  });
  it("once a track EXCEEDS the Level its penalty applies IN FULL (not partially)", () => {
    // 6 boxes = Serious (+3); Level-3 compensator does NOT reduce it to Moderate.
    expect(compensatedWoundPenalty(6, 0, { compensator: 3 })).toBe(totalWoundPenalty(6, 0));
  });
  it("tracks are judged separately — physical over, stun under", () => {
    // physical 6 (over → full +3), stun 2 (under → 0)
    expect(compensatedWoundPenalty(6, 2, { compensator: 3 })).toBe(totalWoundPenalty(6, 0));
  });
  it("an active Pain Editor ignores Stun penalties but not Physical", () => {
    expect(compensatedWoundPenalty(3, 6, { ignoreStun: true })).toBe(totalWoundPenalty(3, 0));
  });
  it("compensator 0 / garbage input degrades to the normal penalty", () => {
    expect(compensatedWoundPenalty(3, 1, { compensator: 0 })).toBe(totalWoundPenalty(3, 1));
    expect(compensatedWoundPenalty(3, 1, { compensator: NaN })).toBe(totalWoundPenalty(3, 1));
  });
});

describe("secondary effects (Shadowtech p.6–7)", () => {
  it("overstress: +1 TN per whole/partial point over cap, zero-floored", () => {
    expect(overstressPenalty(4, 4)).toBe(0);   // at cap
    expect(overstressPenalty(3.5, 4)).toBe(0); // under cap → never negative
    expect(overstressPenalty(4.1, 4)).toBe(1); // fraction over → +1
    expect(overstressPenalty(6, 4)).toBe(2);
  });
  it("magical-healing interference: +½ Body Index, rounded down", () => {
    expect(biowareHealingTnMod(0)).toBe(0);
    expect(biowareHealingTnMod(3)).toBe(1);
    expect(biowareHealingTnMod(4)).toBe(2);
  });
});
