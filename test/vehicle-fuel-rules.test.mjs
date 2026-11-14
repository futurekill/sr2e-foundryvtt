import { describe, it, expect } from "vitest";
import { economyFor, fuelUsed, coastDistance, coastSchedule, stallTurn, maneuverFuel, fuelGradeEffects } from "../module/rules/vehicle-fuel-rules.mjs";

describe("Rigger 2 fuel (p.81–83)", () => {
  it("Economy Rating Table", () => {
    expect(economyFor({ base: 4, speed: 50, speedRating: 60 })).toBe(4);
    expect(economyFor({ base: 4, speed: 60, speedRating: 60 })).toBe(2);
    expect(economyFor({ base: 4, combat: true })).toBe(2.5);
    expect(fuelUsed(300, 2)).toBe(150);
  });
  it("Gray Ghost: 7,500 m coasting; per 2 successes + Acceleration (R6-4)", () => {
    expect(coastDistance(1000, 100)).toBe(7500);
    expect(coastDistance(1000, 100, 5)).toBe(7700);
    const s = coastSchedule(1000, 100);
    expect(s.map(t => t.speed)).toEqual([1000, 800, 600, 400, 200]);
    expect(s.map(t => t.metres)).toEqual([2500, 2000, 1500, 1000, 500]);
    expect(stallTurn(s, 600)).toBe(3);   // "two turns after running out of fuel"
  });
  it("Flight maneuvers: Mistral VSTOL takeoff from 2,000 l", () => {
    expect(maneuverFuel(2000, "vstolTakeoff")).toBe(600);   // R6-5: ×.7 (the example's .8 is the STOL row)
    expect(maneuverFuel(2000, "stolTakeoff")).toBe(400);
    expect(maneuverFuel(2000, "vtolTakeoff", { overLoad: true })).toBe(800);
    expect(maneuverFuel(2000, "vtolTakeoff", { overLoad: true, tiltWing: true })).toBe(1200);
    expect(maneuverFuel(2000, "vtolLanding")).toBeNull();
  });
  it("Fuel grades", () => {
    expect(fuelGradeEffects("cheap")).toMatchObject({ maintenance: 0.95, acceleration: -2, economy: 0.9 });
    expect(fuelGradeEffects("custom", 3)).toMatchObject({ maintenance: 1.06, acceleration: 3, economy: 1.03, warning: "" });
    expect(fuelGradeEffects("custom", -6).warning).toMatch(/more than 5/);
  });
});
