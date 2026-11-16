import { describe, it, expect } from "vitest";
import { pullTest, armHandlingMod, armTestTn, armStrength, legsRunning, ltProfileOf, runwayDistances, takeoffLanding, acvCrashCap } from "../module/rules/vehicle-ops-rules.mjs";

describe("Pull Tests (Rigger 2 p.33–34)", () => {
  it("TN by weight against Load: ≤1× 3, 1.1–1.5× 5, 1.6–2× 8; over 2× no test", () => {
    expect(pullTest({ weight: 1000, load: 1000 }).tn).toBe(3);
    expect(pullTest({ weight: 1500, load: 1000 }).tn).toBe(5);
    expect(pullTest({ weight: 2000, load: 1000 }).tn).toBe(8);
    expect(pullTest({ weight: 2001, load: 1000 }).allowed).toBe(false);
  });
  it("condition modifiers: bad +1, terrible +3, stuck +1 to +4, no rollers +4, braced −2", () => {
    expect(pullTest({ weight: 500, load: 1000, conditions: "terrible", stuck: 4, noRollers: true, braced: true }).tn).toBe(3 + 3 + 4 + 4 - 2);
    expect(pullTest({ weight: 500, load: 1000, stuck: 9 }).tn).toBe(7);
  });
  it("side effects: up to 1.5× half speed +1 Stress/hour; 1.6–2× quarter speed +1/minute; over 1.5× a Body (4) Test", () => {
    expect(pullTest({ weight: 900, load: 1000 })).toMatchObject({ speed: null, stress: null, extraBodyTest: false });
    expect(pullTest({ weight: 1400, load: 1000 })).toMatchObject({ speed: "half", stress: "hour", extraBodyTest: false });
    expect(pullTest({ weight: 1800, load: 1000 })).toMatchObject({ speed: "quarter", stress: "minute", extraBodyTest: true });
  });
});

describe("Mechanical arms and legs (p.34–35)", () => {
  it("Arm Test TN = Handling (GM-adjusted); skill and melee +1 per Handling above 3 (York: 4 + 1 + 1 = 6)", () => {
    expect(armTestTn(4)).toBe(4);
    expect(armTestTn(4, 1)).toBe(5);
    expect(5 + armHandlingMod(4)).toBe(6);
    expect(armHandlingMod(2)).toBe(0);
    expect(armHandlingMod(5)).toBe(2);
  });
  it("arm Strength = Body × Body (+ bought-up Strength); running legs × 2.5", () => {
    expect(armStrength(3)).toBe(9);
    expect(armStrength(3, 2)).toBe(11);
    expect(legsRunning(10)).toBe(25);
  });
});

describe("Aircraft (p.36)", () => {
  it("runway distances by profile, under / at-or-over Load", () => {
    expect(runwayDistances(4, "normal")).toEqual({ takeoff: 600, landing: 1200 });
    expect(runwayDistances(4, "normal", { loaded: true })).toEqual({ takeoff: 900, landing: 1800 });
    expect(runwayDistances(2, "stol")).toEqual({ takeoff: 80, landing: 150 });
    expect(runwayDistances(2, "vstol", { loaded: true })).toEqual({ takeoff: 90, landing: 200 });
    expect(runwayDistances(4, "vtol")).toBe(null);
    expect(["Standard", "STOL", "VSTOL", "VTOL", "NA"].map(ltProfileOf)).toEqual(["normal", "stol", "vstol", "vtol", "normal"]);
  });
  it("base TN 3 takeoff / 4 landing; the modifiers; an arrestor cable needs a tailhook, landing only; rough = 6L", () => {
    expect(takeoffLanding({ winds: "heavy", rough: true, profile: "vstol" })).toMatchObject({ base: 3, mod: 3 + 1 + 3, roughDamage: { power: 6, level: "L" } });
    expect(takeoffLanding({ landing: true, arrestor: true, tailhook: true }).mod).toBe(-1);
    expect(takeoffLanding({ landing: true, arrestor: true, tailhook: false }).mod).toBe(0);
    expect(takeoffLanding({ landing: false, crashNet: true }).mod).toBe(0);
    expect(takeoffLanding({ landing: true, crashNet: true }).base).toBe(4);
  });
});

describe("Air-cushion vehicles (p.35)", () => {
  it("crash damage never exceeds Serious", () => {
    expect(acvCrashCap("D", true)).toBe("S");
    expect(acvCrashCap("D", false)).toBe("D");
    expect(acvCrashCap("M", true)).toBe("M");
  });
});

import { hasLegs, liveMod } from "../module/rules/vehicle-ops-rules.mjs";
describe("5c review fixes", () => {
  const legs = (state, lvl = null) => ({ system: { design: { category: "car" }, subsysItems: lvl ? { l1: lvl } : {} },
    items: [{ id: "l1", type: "vehicle_mod", name: "Mechanical Legs", system: { custom: { state } } }] });
  it("only installed, working legs count (#4)", () => {
    expect(hasLegs(legs(""))).toBe(true);
    expect(hasLegs(legs("factory"))).toBe(true);
    expect(hasLegs(legs("parts"))).toBe(false);
    expect(hasLegs(legs("removed"))).toBe(false);
    expect(hasLegs(legs("", "S"))).toBe(false);
    expect(hasLegs({ system: { design: { category: "special", traits: [] } }, items: [] })).toBe(true);
    expect(hasLegs({ system: { design: { category: "special", traits: ["zeppelin"] } }, items: [] })).toBe(false);
    expect(liveMod({ system: { custom: { state: "tested" } } })).toBe(false);
  });
});
