import { describe, it, expect } from "vitest";
import { SR2E } from "../module/config.mjs";

describe("Healing tables (SR2E p.112–115)", () => {
  it("natural-healing TN rises with wound level", () => {
    expect(SR2E.naturalHealTN).toEqual({ Light: 2, Moderate: 4, Serious: 6, Deadly: 6 });
  });

  it("First Aid TN rises with wound level", () => {
    expect(SR2E.firstAidTN).toEqual({ Light: 4, Moderate: 6, Serious: 8, Deadly: 10 });
  });

  it("heal floors match the wound thresholds (1/3/6 boxes)", () => {
    expect(SR2E.healLevelFloor.Light).toBe(0);
    expect(SR2E.healLevelFloor.Moderate).toBe(1);
    expect(SR2E.healLevelFloor.Serious).toBe(3);
    expect(SR2E.healLevelFloor.Deadly).toBe(6);
  });
});

describe("Metatype attribute tables (SR2E p.40)", () => {
  const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];

  it("racial maximum = human base 6 + racial modifier, for every metatype", () => {
    for (const race of Object.keys(SR2E.racialModifiers)) {
      for (const attr of ATTRS) {
        expect(SR2E.racialMaximums[race][attr],
          `${race}.${attr}`).toBe(6 + SR2E.racialModifiers[race][attr]);
      }
    }
  });

  it("humans have no modifiers", () => {
    expect(Object.values(SR2E.racialModifiers.human).every(v => v === 0)).toBe(true);
  });

  it("trolls are the strongest and toughest", () => {
    expect(SR2E.racialModifiers.troll.body).toBeGreaterThan(SR2E.racialModifiers.ork.body);
    expect(SR2E.racialModifiers.troll.strength).toBeGreaterThanOrEqual(SR2E.racialModifiers.ork.strength);
  });
});

describe("Ranged TN modifiers (SR2E p.91)", () => {
  it("is 0/2/4/6 for short/medium/long/extreme", () => {
    expect(SR2E.rangeTnMods).toEqual({ short: 0, medium: 2, long: 4, extreme: 6 });
  });
});

describe("Vehicle modifiers (SR2E p.106–109)", () => {
  it("terrain handling penalty worsens with tighter terrain", () => {
    const h = SR2E.vehicleTerrainMods.handling;
    expect(h.open).toBe(0);
    expect(h.tight).toBeGreaterThan(h.normal);
  });

  it("crash damage level scales by speed bracket", () => {
    expect(SR2E.crashDamageLevel(10)).toBe("L");
    expect(SR2E.crashDamageLevel(30)).toBe("M");
    expect(SR2E.crashDamageLevel(100)).toBe("S");
    expect(SR2E.crashDamageLevel(250)).toBe("D");
    // bracket boundaries
    expect(SR2E.crashDamageLevel(21)).toBe("M");
    expect(SR2E.crashDamageLevel(61)).toBe("S");
    expect(SR2E.crashDamageLevel(201)).toBe("D");
  });

  it("vehicle damage worsens TN and cuts speed by level", () => {
    expect(SR2E.vehicleDamageMods.Undamaged).toMatchObject({ tn: 0, speed: 1 });
    expect(SR2E.vehicleDamageMods.Moderate.tn).toBe(2);
    expect(SR2E.vehicleDamageMods.Serious.speed).toBe(0.5);
    expect(SR2E.vehicleDamageMods.Destroyed.speed).toBe(0);
  });
});
