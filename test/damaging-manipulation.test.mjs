import { describe, it, expect } from "vitest";
import { manipulationDamage, damageResistArmor, stageLevel, netToSteps } from "../module/rules/sr2e-rules.mjs";

// SR2E p.158 (rendered): Flamethrower / Spark / Flame Bomb are (F)M; every 2
// successes raise the Damage Code one level; Body resists; ½ Impact armour.
describe("manipulationDamage", () => {
  it("reads (F)M at the Force cast", () => {
    expect(manipulationDamage("(F)M", 5)).toEqual({ power: 5, level: "M" });
    expect(manipulationDamage(" (F) m ", 3)).toEqual({ power: 3, level: "M" });
  });
  it("keeps a Power modifier", () => {
    expect(manipulationDamage("(F+2)S", 4)).toEqual({ power: 6, level: "S" });
    expect(manipulationDamage("(F-1)L", 4)).toEqual({ power: 3, level: "L" });
  });
  it("is null for anything that is not a Force damage code", () => {
    for (const c of ["", null, "M", "(STR)M", "(F)", "(F)X", "F/2"]) expect(manipulationDamage(c, 4)).toBe(null);
    expect(manipulationDamage("(F)M", 0)).toBe(null);
  });
});

describe("staging — every 2 successes, one level (p.158)", () => {
  const staged = (s) => stageLevel("M", netToSteps(s));
  it("M stays M on 1, S on 2–3, D on 4+", () => {
    expect([0, 1, 2, 3, 4, 7].map(staged)).toEqual(["M", "M", "S", "S", "D", "D"]);
  });
});

describe("damageResistArmor", () => {
  const worn = { ballistic: 5, impact: 3 };
  it("half_impact halves Impact, rounding down", () => {
    expect(damageResistArmor({ armorCalc: "half_impact", ...worn })).toEqual({ armor: 1, label: "½ Impact" });
  });
  it("leaves the existing calculations unchanged", () => {
    expect(damageResistArmor({ ...worn }).armor).toBe(5);
    expect(damageResistArmor({ armorType: "impact", ...worn }).armor).toBe(3);
    expect(damageResistArmor({ armorCalc: "half_ballistic", ...worn }).armor).toBe(2);
    expect(damageResistArmor({ armorCalc: "impact", ...worn }).armor).toBe(3);
    expect(damageResistArmor({ armorCalc: "flechette", ...worn }).armor).toBe(6);
    expect(damageResistArmor({ armorMod: -9, ...worn }).armor).toBe(0);
  });
});
