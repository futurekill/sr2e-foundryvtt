// Firearm accessory math — SR2E p.88 (scopes), p.90 (modifiers, gyro),
// p.92–93 (recoil stacking example), p.240–241 (accessory descriptions).
import { describe, it, expect } from "vitest";
import {
  accessorySummary, gyroReduction, shiftRangeBracket, recoilPenalty
} from "../module/rules/sr2e-rules.mjs";

const gear = (name, system) => ({ name, type: "gear", system });

describe("accessorySummary (p.240–241)", () => {
  it("stacks gas vent 3 + shock pad 1 to RC 4 — the Wedge example, p.92–93", () => {
    const acc = accessorySummary([
      gear("Gas Vent III", { accessoryRecoilComp: 3 }),
      gear("Shock Pads",   { accessoryRecoilComp: 1 })
    ]);
    expect(acc.recoilComp).toBe(4);
    // Wedge's first 3-round burst is fully compensated (3 recoil vs RC 4)
    expect(recoilPenalty(0, 3, { isBurst: true, hasRecoil: true, recoilComp: acc.recoilComp })).toBe(0);
    // Second burst: 6 rounds cumulative − RC 4 = +2 (matches the book's math)
    expect(recoilPenalty(3, 3, { isBurst: true, hasRecoil: true, recoilComp: acc.recoilComp })).toBe(2);
  });

  it("bipod RC 2 only counts when deployed (braced, sitting/lying — p.240)", () => {
    const bipod = [gear("Bipod", { accessoryRecoilComp: 2, requiresDeployment: true })];
    expect(accessorySummary(bipod, { deployed: false }).recoilComp).toBe(0);
    expect(accessorySummary(bipod, { deployed: true }).recoilComp).toBe(2);
    expect(accessorySummary(bipod).needsDeployment).toEqual(["Bipod"]);
  });

  it("tripod RC 6 gated the same way (p.241)", () => {
    const tripod = [gear("Tripod", { accessoryRecoilComp: 6, requiresDeployment: true })];
    expect(accessorySummary(tripod, { deployed: true }).recoilComp).toBe(6);
    expect(accessorySummary(tripod, { deployed: false }).recoilComp).toBe(0);
  });

  it("separates the laser sight −1 from other TN mods (p.90 exclusion gates)", () => {
    const acc = accessorySummary([
      gear("Laser Sight", { combatTnMod: -1, laserSight: true }),
      gear("Weird Custom Sight", { combatTnMod: -1 })
    ]);
    expect(acc.laserMod).toBe(-1);
    expect(acc.tnMod).toBe(-1);
  });

  it("reports smartgun grant and scope shift (p.241, p.88)", () => {
    const acc = accessorySummary([
      gear("Smartgun System (External)", { grantsSmartgun: true }),
      gear("Imaging Scope (Magnification 2)", { rangeShift: 2 })
    ]);
    expect(acc.grantsSmartgun).toBe(true);
    expect(acc.rangeShift).toBe(2);
  });
});

describe("gyroReduction (p.90)", () => {
  it("eats recoil + movement up to the rating, cumulative with RC", () => {
    // Rating 5 standard mount vs +4 running and +3 uncompensated recoil → −5
    expect(gyroReduction(5, 3, 4)).toBe(5);
    // Fully covered when penalties are within the rating
    expect(gyroReduction(5, 1, 1)).toBe(2);
    // Never negative, never applies without a mount
    expect(gyroReduction(0, 4, 4)).toBe(0);
  });
});

describe("shiftRangeBracket (p.88)", () => {
  it("Rating 2 scope: long → short (the book's own example)", () => {
    expect(shiftRangeBracket("long", 2)).toBe("short");
  });
  it("short range is the minimum", () => {
    expect(shiftRangeBracket("medium", 3)).toBe("short");
    expect(shiftRangeBracket("short", 1)).toBe("short");
  });
  it("no scope, no shift", () => {
    expect(shiftRangeBracket("extreme", 0)).toBe("extreme");
  });
});

import { wornArmorTotals, heavyArmorPoolPenalty } from "../module/rules/sr2e-rules.mjs";

describe("wornArmorTotals (p.242)", () => {
  const armor = (name, ballistic, impact, isLayered = false) =>
    ({ name, system: { ballistic, impact, isLayered } });

  it("only the highest worn rating counts — no stacking", () => {
    const t = wornArmorTotals([armor("Armor Jacket", 5, 3), armor("Armor Vest", 2, 1)]);
    expect(t).toEqual({ ballistic: 5, impact: 3 });
  });

  it("helmets ADD to the highest rating (p.242 exception)", () => {
    const t = wornArmorTotals([armor("Armor Jacket", 5, 3), armor("Helmet", 1, 1, true)]);
    expect(t).toEqual({ ballistic: 6, impact: 4 });
  });

  it("form-fitting body armor layers too (name fallback, no flag)", () => {
    const t = wornArmorTotals([armor("Partial Heavy Armor", 6, 4),
                               armor("Form-Fitting Body Armor (Level 2)", 3, 1)]);
    expect(t).toEqual({ ballistic: 9, impact: 5 });
  });

  it("ballistic and impact pick their highest independently", () => {
    const t = wornArmorTotals([armor("Armor Clothing", 3, 0), armor("Real Leather", 0, 2)]);
    expect(t).toEqual({ ballistic: 3, impact: 2 });
  });
});

describe("heavyArmorPoolPenalty (p.84)", () => {
  it("−1 Combat Pool per point of heavy-armor Ballistic over Quickness", () => {
    const full = [{ name: "Full Heavy Armor", system: { ballistic: 8, heavyArmor: true } }];
    expect(heavyArmorPoolPenalty(4, full)).toBe(4);
    expect(heavyArmorPoolPenalty(8, full)).toBe(0);
  });
  it("ordinary armor never penalizes; name fallback covers old copies", () => {
    expect(heavyArmorPoolPenalty(3, [{ name: "Armor Jacket", system: { ballistic: 5 } }])).toBe(0);
    expect(heavyArmorPoolPenalty(4, [{ name: "Partial Heavy Armor", system: { ballistic: 6 } }])).toBe(2);
  });
});
