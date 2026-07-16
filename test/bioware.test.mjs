// Bioware / Body Index math — Shadowtech (FASA7110) p.5–7.
import { describe, it, expect } from "vitest";
import {
  effectiveBodyCost, bodyIndexTotal, biowareEssence,
  overstressPenalty, biowareHealingTnMod, tacticalComputerInitiative, unarmedDamageCode,
  unarmedPhysicalPower, BIOWARE_CULTURED_MULTIPLIER,
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

describe("tactical computer initiative (Shadowtech p.53)", () => {
  // Book example: Reaction 4 + 1D6, Level 2 computer — may add +2, never past 10.
  it("adds the rating below the cap", () => {
    expect(tacticalComputerInitiative(5, 2, 4, 1)).toBe(7);   // rolled 1 → 5+2
  });
  it("clamps to the natural maximum (base + 6/die)", () => {
    expect(tacticalComputerInitiative(9, 2, 4, 1)).toBe(10);  // rolled 5 → 11 → 10
    expect(tacticalComputerInitiative(10, 2, 4, 1)).toBe(10); // already maxed
  });
  it("scales the cap with extra initiative dice", () => {
    expect(tacticalComputerInitiative(20, 3, 8, 3)).toBe(23); // cap 8+18=26
    expect(tacticalComputerInitiative(25, 3, 8, 3)).toBe(26); // clamped
  });
  it("is inert at rating 0", () => {
    expect(tacticalComputerInitiative(7, 0, 4, 1)).toBe(7);
  });
});

describe("bone lacing unarmed damage (Shadowtech p.42)", () => {
  // Book table: Plastic (Str+1)M2 · Aluminum (Str+2)M2 · Titanium (Str+3)M2.
  // The trailing 2 is 1e STAGING notation; SR2 made staging universally 2 and
  // dropped the digit (core lists unarmed as "(STR)M Stun"), so the SR2 codes
  // are (Str+1)M / (Str+2)M / (Str+3)M.
  it("folds each lacing's Power bonus into the innate (Str)M", () => {
    expect(unarmedDamageCode("(Str)M", 1)).toBe("(Str+1)M");
    expect(unarmedDamageCode("(Str)M", 2)).toBe("(Str+2)M");
    expect(unarmedDamageCode("(Str)M", 3)).toBe("(Str+3)M");
  });
  it("leaves the code untouched with no lacing", () => {
    expect(unarmedDamageCode("(Str)M", 0)).toBe("(Str)M");
  });
  it("stacks onto an already-modified base rather than replacing it", () => {
    // An adept's Killing Hands has already rewritten the code; titanium adds to it.
    expect(unarmedDamageCode("(Str+2)M", 3)).toBe("(Str+2+3)M");
  });
  it("preserves a non-Moderate damage level", () => {
    expect(unarmedDamageCode("(Str)S", 2)).toBe("(Str+2)S");
  });
  it("wraps a plain numeric code so it stays parseable", () => {
    expect(unarmedDamageCode("6M", 1)).toBe("(6+1)M");
  });
  it("refuses to corrupt an unrecognised code", () => {
    expect(unarmedDamageCode("weird", 2)).toBe("weird");
    expect(unarmedDamageCode("", 2)).toBe("");
  });
  it("halves Power (round up) when opting for physical damage", () => {
    expect(unarmedPhysicalPower(7)).toBe(4);   // Str 4 + titanium 3 = 7 -> 4
    expect(unarmedPhysicalPower(6)).toBe(3);
    expect(unarmedPhysicalPower(1)).toBe(1);
    expect(unarmedPhysicalPower(0)).toBe(0);
  });
});
