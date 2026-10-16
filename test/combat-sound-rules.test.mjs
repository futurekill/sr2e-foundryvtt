// Combat sounds (docs/PLAN-combat-sounds.md): the class from the p.88 range
// brackets, the cadence from rounds fired, and a fallback that never goes silent.
import { describe, it, expect } from "vitest";
import { rangeClass, cadence, attackSound, spellSound, blastSound } from "../module/rules/combat-sound-rules.mjs";
import { RANGE_TABLE, rangesFor } from "../module/rules/weapon-ranges.mjs";
import { SFX_KEYS } from "../module/sfx-manifest.mjs";

const gun = (cls, rounds = 1, weaponType = "firearm") => ({ weaponType, ranges: rangesFor(cls), rounds });

describe("combat sounds", () => {
  it("every p.88 row is recognised from its brackets", () => {
    for (const cls of Object.keys(RANGE_TABLE)) {
      // hold-out and light pistol share brackets; either is a pistol
      expect(["holdout", "lightPistol"].includes(cls) ? ["holdout", "lightPistol"] : [cls]).toContain(rangeClass(rangesFor(cls)));
    }
    expect(rangeClass({ short: 25, medium: 100, long: 250, extreme: 500 })).toBeNull();
  });
  it("cadence follows the rounds actually fired", () => {
    expect([1, 2, 3, 4, 10].map(cadence)).toEqual(["single", "burst", "burst", "auto", "auto"]);
  });
  it("picks class, then family, then the generic weapon type", () => {
    expect(attackSound(gun("assaultRifle", 1), SFX_KEYS)).toBe("rifle-single");
    expect(attackSound(gun("assaultRifle", 3), SFX_KEYS)).toBe("rifle-burst");
    expect(attackSound(gun("smg", 10), SFX_KEYS)).toBe("smg-auto");
    expect(attackSound(gun("sniperRifle"), SFX_KEYS)).toBe("sniper-single");
    expect(attackSound(gun("sportingRifle"), SFX_KEYS)).toBe("rifle-single");
    expect(attackSound(gun("heavyPistol"), SFX_KEYS)).toBe("heavypistol-single");
    expect(attackSound(gun("lmg", 6), SFX_KEYS)).toBe("mg-auto");
    expect(attackSound(gun("lmg", 1), SFX_KEYS)).toBe("firearm-single");       // no mg-single: generic
    expect(attackSound(gun("mmg", 2, "heavy"), SFX_KEYS)).toBe("heavy-burst");
    expect(attackSound(gun("missileLauncher", 1, "heavy"), SFX_KEYS)).toBe("launcher-single");
    expect(attackSound(gun("shotgun", 2), SFX_KEYS)).toBe("firearm-burst");      // a shotgun burst
    expect(attackSound({ weaponType: "firearm", ranges: { short: 1, medium: 2, long: 3, extreme: 4 }, rounds: 1 }, SFX_KEYS)).toBe("firearm-single");
  });
  it("a gun is never silent while its generic single ships", () => {
    const only = new Set(["firearm-single", "heavy-single"]);
    expect(attackSound(gun("smg", 10), only)).toBe("firearm-single");
    expect(attackSound(gun("hmg", 10, "heavy"), only)).toBe("heavy-single");
  });
  it("melee, unarmed, bows, crossbows and thrown weapons", () => {
    expect(attackSound({ weaponType: "melee", skillKey: "armed_combat" }, SFX_KEYS)).toBe("melee");
    expect(attackSound({ weaponType: "melee", skillKey: "unarmed_combat" }, SFX_KEYS)).toBe("unarmed");
    expect(attackSound({ weaponType: "projectile", name: "Ranger X Bow" }, SFX_KEYS)).toBe("bow");
    expect(attackSound({ weaponType: "projectile", name: "Light Crossbow" }, SFX_KEYS)).toBe("crossbow");
    expect(attackSound({ weaponType: "grenade" }, SFX_KEYS)).toBe("thrown");
    expect(attackSound({ weaponType: "throwing" }, SFX_KEYS)).toBe("thrown");
  });
  it("spells by category, blasts and smoke", () => {
    for (const c of ["combat", "detection", "health", "illusion", "manipulation"]) expect(spellSound(c, SFX_KEYS)).toBe(`spell-${c}`);
    expect(spellSound("nonsense", SFX_KEYS)).toBeNull();
    expect(blastSound("offensive", SFX_KEYS)).toBe("blast");
    expect(blastSound("smoke", SFX_KEYS)).toBe("smoke");
  });
  it("every key the rules can produce ships", () => {
    for (const k of ["reload", "dry-fire", "firearm-single", "firearm-burst", "firearm-auto", "heavy-single", "heavy-burst", "heavy-auto"])
      expect(SFX_KEYS.has(k)).toBe(true);
  });
});
