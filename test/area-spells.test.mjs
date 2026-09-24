import { describe, it, expect } from "vitest";
import { areaSpellGeometry, successesAtTN, areaTargetEligible, spellCastDice }
  from "../module/rules/sr2e-rules.mjs";

// SR2E p.130, Area-Effect Spells (rendered from the corrected 11th printing).
describe("areaSpellGeometry — radius = Magic Rating, reshaped by withheld dice", () => {
  it("defaults to the Magic Rating in metres", () => {
    expect(areaSpellGeometry({ magic: 6, force: 4 })).toEqual({ radius: 6, withheld: 0, valid: true });
  });
  it("costs 1 die per metre to grow", () => {
    expect(areaSpellGeometry({ magic: 6, force: 4, radiusDelta: 3 })).toEqual({ radius: 9, withheld: 3, valid: true });
  });
  it("costs 2 dice per metre to shrink", () => {
    expect(areaSpellGeometry({ magic: 6, force: 4, radiusDelta: -2 })).toEqual({ radius: 4, withheld: 4, valid: true });
  });
  it("never withholds more than the Force", () => {
    expect(areaSpellGeometry({ magic: 6, force: 4, radiusDelta: 5 }).valid).toBe(false);
    expect(areaSpellGeometry({ magic: 6, force: 4, radiusDelta: -3 }).valid).toBe(false);
  });
  it("rejects a negative radius and junk input", () => {
    expect(areaSpellGeometry({ magic: 1, force: 6, radiusDelta: -2 }).valid).toBe(false);
    expect(areaSpellGeometry({ magic: 6, force: 4, radiusDelta: 1.5 }).valid).toBe(false);
    expect(areaSpellGeometry({ magic: 6, force: 4, radiusDelta: NaN }).valid).toBe(false);
  });
});

describe("successesAtTN — one roll, counted per target", () => {
  const dice = [{ total: 8 }, { total: 5 }, { total: 4 }, { total: 2 }, { total: 13 }];
  it("counts the compounded Rule-of-Six total, not the first face", () => {
    expect(successesAtTN([{ total: 8 }], 8)).toBe(1);        // 6 then 2
    expect(successesAtTN([{ total: 13 }], 13)).toBe(1);      // 6, 6, 1
  });
  it("scores the same dice differently against different targets", () => {
    expect(successesAtTN(dice, 3)).toBe(4);
    expect(successesAtTN(dice, 5)).toBe(3);
    expect(successesAtTN(dice, 9)).toBe(1);
  });
});

describe("areaTargetEligible", () => {
  it("affects living beings with a card", () => {
    for (const t of ["character", "npc", "spirit"]) expect(areaTargetEligible(t, "mana")).toBe("card");
  });
  it("leaves vehicles to the GM for physical spells and ignores them for mana (p.151)", () => {
    expect(areaTargetEligible("vehicle", "physical")).toBe("gm");
    expect(areaTargetEligible("vehicle", "mana")).toBe(null);
  });
  it("never catches Matrix entities", () => {
    expect(areaTargetEligible("ic", "physical")).toBe(null);
    expect(areaTargetEligible("host", "mana")).toBe(null);
  });
});

describe("spellCastDice — the preview and the roll share one calculation", () => {
  it("an ordinary cast is Force + totem + focus, pool and Karma on top", () => {
    expect(spellCastDice({ force: 5, totemBonus: 2, focusCast: 1, poolReq: 3, poolAvail: 4, poolCap: 6,
      karmaReq: 2, karmaAvail: 5 }))
      .toEqual({ ratingDice: 5, baseDice: 8, pool: 3, karma: 2, total: 13 });
  });
  it("keeps the old 1-die floor for an ordinary cast", () => {
    expect(spellCastDice({ force: 1, totemPenalty: 3 }).baseDice).toBe(1);
  });
  it("withheld area dice come off the rating dice and the Karma ceiling", () => {
    const r = spellCastDice({ force: 4, withheld: 3, karmaReq: 4, karmaAvail: 9, minBase: 0 });
    expect(r.ratingDice).toBe(1);
    expect(r.karma).toBe(1);
  });
  // p.130: "Magic Pool dice can be used even if all the Force dice have been
  // effectively removed". Negative base: withhold all Force, totem −2, pool 2.
  it("floors the base at 0 once, then adds the pool", () => {
    const r = spellCastDice({ force: 4, withheld: 4, totemPenalty: 2, poolReq: 2, poolAvail: 5, poolCap: 4, minBase: 0 });
    expect(r).toEqual({ ratingDice: 0, baseDice: 0, pool: 2, karma: 0, total: 2 });
  });
  it("caps the pool at its ceiling and what is available", () => {
    expect(spellCastDice({ force: 4, poolReq: 9, poolAvail: 5, poolCap: 4 }).pool).toBe(4);
    expect(spellCastDice({ force: 4, poolReq: 9, poolAvail: 2, poolCap: 4 }).pool).toBe(2);
  });
});
