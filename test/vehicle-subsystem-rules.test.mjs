import { describe, it, expect } from "vitest";
import { subsystemCount, resolveSubsystemHit, severity, aggravatedBody, reducedBonus, worstLevel } from "../module/rules/vehicle-subsystem-rules.mjs";

const seq = (...vals) => { let i = 0; return () => vals[i++]; };
describe("Rigger 2 subsystem damage (p.85–87)", () => {
  it("how many may be hit: 1D6 − 4/3/2, ÷ 2 up", () => {
    expect(subsystemCount("M", 4)).toBe(0);
    expect(subsystemCount("M", 6)).toBe(1);
    expect(subsystemCount("S", 6)).toBe(2);
    expect(subsystemCount("D", 6)).toBe(2);
    expect(subsystemCount("D", 5)).toBe(2);
    expect(subsystemCount("L", 6)).toBe(0);
  });
  it("tables with severity; roll again / roll twice", () => {
    expect(resolveSubsystemHit(seq(3, 5, 6))).toEqual([{ key: "comms", label: "Communications Gear", table: 4, gm: false, level: "D" }]);
    expect(resolveSubsystemHit(seq(6, 5, 2, 4, 1))).toEqual([{ key: "handling", label: "Handling", table: 3, gm: false, level: "L" }]);
    const twice = resolveSubsystemHit(seq(6, 6, 6, 1, 3, 5, 3, 2, 5));
    expect(twice.map(h => h.key)).toEqual(["fuelTank", "engine"]);
    expect(severity(2)).toBe("L"); expect(severity(4)).toBe("M"); expect(severity(5)).toBe("S"); expect(severity(6)).toBe("D");
  });
  it("Aggravated Body; Table 8 bonuses; worst level", () => {
    expect(aggravatedBody(1, "L")).toBe(1);
    expect(aggravatedBody(5, "M")).toBe(3);
    expect(aggravatedBody(5, "S")).toBe(2);
    expect(reducedBonus(3, "M")).toBe(1);
    expect(worstLevel(["L", "S", "M"])).toBe("S");
  });
});

import { applyModEffects } from "../module/rules/vehicle-design.mjs";
describe("Damaged mods in the effect pass (Table 8, 6a.4)", () => {
  const base = { handling: 4, speed: 160, acceleration: 10, load: 100, cargo: 3, armor: 0, signature: 2, economy: 6 };
  const ms = (lvl, state = "") => ({ name: "Improved Suspension", modKey: "improved-suspension", rating: 3, custom: { state }, subsysLevel: lvl,
    effects: { handling: "-R" } });
  it("Light −1, Moderate halved, Serious/Deadly stop (a factory one's baked effect too)", () => {
    expect(applyModEffects(base, [ms(null)]).stats.handling).toBe(1);
    expect(applyModEffects(base, [ms("L")]).stats.handling).toBe(2);
    expect(applyModEffects(base, [ms("M")]).stats.handling).toBe(3);
    expect(applyModEffects(base, [ms("S")]).stats.handling).toBe(4);
    // A factory suspension is baked into Handling 1; destroyed, its −3 comes back off.
    expect(applyModEffects({ ...base, handling: 1 }, [ms("D", "factory")]).stats.handling).toBe(4);
  });
});
