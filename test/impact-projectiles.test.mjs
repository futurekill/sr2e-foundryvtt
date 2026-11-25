// Impact projectiles (docs/archive/plans/PLAN-impact-projectiles.md): core p.87–88, p.96, p.238; Grimoire p.34.
import { describe, it, expect } from "vitest";
import { throwingWeaponRange, thrownRange, rangedArmorType, missileParryTN, isSlowMissile } from "../module/rules/sr2e-rules.mjs";

describe("impact projectiles", () => {
  it("throwing weapons use their own Weapon Range Table rows (p.88), grenades keep theirs", () => {
    expect(throwingWeaponRange(4)).toEqual({ short: 4, medium: 8, long: 12, extreme: 20 });
    expect(throwingWeaponRange(4, { shuriken: true })).toEqual({ short: 4, medium: 8, long: 20, extreme: 28 });
    expect(thrownRange(4)).toEqual({ short: 12, medium: 20, long: 40, extreme: 80 });
  });
  it("Impact armor against bows, crossbows and thrown weapons; Ballistic against guns (ruling, p.238)", () => {
    expect(rangedArmorType("projectile")).toBe("impact");
    expect(rangedArmorType("throwing")).toBe("impact");
    expect(rangedArmorType("firearm")).toBe("ballistic");
    expect(rangedArmorType("heavy")).toBe("ballistic");
  });
  it("Missile Parry: 10 − the base range TN 4/5/6/9 (Grimoire p.34, core p.88), at least 2; slow missiles only", () => {
    expect([4, 5, 6, 9].map(missileParryTN)).toEqual([6, 5, 4, 2]);
    expect(isSlowMissile("throwing")).toBe(true);
    expect(isSlowMissile("projectile")).toBe(true);
    expect(isSlowMissile("grenade")).toBe(false);
    expect(isSlowMissile("firearm")).toBe(false);
  });
});

import { phaseFireBlock } from "../module/rules/sr2e-rules.mjs";
describe("shots per Combat Phase (SR2E p.92)", () => {
  const rec = (fired) => ({ key: "c:1:0", fired });
  it("single shot once; SA/BF twice; full auto and other phases unlimited here", () => {
    expect(phaseFireBlock({ record: rec([]), key: "c:1:0", weaponId: "w", mode: "ss" })).toBeNull();
    expect(phaseFireBlock({ record: rec([["w", 1]]), key: "c:1:0", weaponId: "w", mode: "ss" })).toMatch(/single-shot/);
    expect(phaseFireBlock({ record: rec([["w", 1]]), key: "c:1:0", weaponId: "w", mode: "sa" })).toBeNull();
    expect(phaseFireBlock({ record: rec([["w", 2]]), key: "c:1:0", weaponId: "w", mode: "bf" })).toMatch(/twice/);
    expect(phaseFireBlock({ record: rec([["w", 2]]), key: "c:1:0", weaponId: "other", mode: "sa" })).toBeNull();
    expect(phaseFireBlock({ record: rec([["w", 2]]), key: "c:2:0", weaponId: "w", mode: "sa" })).toBeNull();
    expect(phaseFireBlock({ record: rec([["w", 9]]), key: "c:1:0", weaponId: "w", mode: "fa" })).toBeNull();
    expect(phaseFireBlock({ record: rec([["w", 9]]), key: "c:1:0", weaponId: "w", mode: "sa", inCombat: false })).toBeNull();
  });
});
