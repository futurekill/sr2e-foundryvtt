import { describe, it, expect } from "vitest";
import { relativeSpeedMod, bothSlow, vehicleRecoil, manualGunneryMods, sensorGunneryTN, sensorGunneryDice, missileDice,
  indirectFireTest, areaEffect, scatter, critterSignature, sizeSignature } from "../module/rules/vehicle-gunnery-rules.mjs";

describe("Rigger 2 gunnery (p.56–61)", () => {
  it("relative speed: under 5 counts as 5; ≤2× +2, ≤3× +4, more +6 (p.57–58)", () => {
    expect(relativeSpeedMod(60, 60)).toBe(0);
    expect(relativeSpeedMod(0, 10)).toBe(2);
    expect(relativeSpeedMod(30, 90)).toBe(4);
    expect(relativeSpeedMod(10, 31)).toBe(6);
    expect(bothSlow(3, 4)).toBe(true);
    expect(bothSlow(3, 5)).toBe(false);
  });
  it("recoil: turret halves before accessories (cancels heavy doubling); pintle −2, ring −6 (p.57)", () => {
    expect(vehicleRecoil({ recoil: 6, heavy: true })).toBe(12);
    expect(vehicleRecoil({ recoil: 6, heavy: true, mount: "turret" })).toBe(3);
    expect(vehicleRecoil({ recoil: 6, heavy: true, mount: "turret", accessories: 1 })).toBe(2);
    expect(vehicleRecoil({ recoil: 5, mount: "ring" })).toBe(0);
    expect(vehicleRecoil({ recoil: 5, mount: "pintle" })).toBe(3);
  });
  it("manual modifiers (p.57)", () => {
    const sum = (o) => manualGunneryMods(o).reduce((t, p) => t + p.value, 0);
    expect(sum({ blind: true, partialCover: true })).toBe(12);
    expect(sum({ legs: "run", difficultGround: true })).toBe(6);
    expect(sum({ attackerMS: 25, targetMS: 12 })).toBe(-1);
    expect(sum({ attackerMS: 12, targetMS: 22 })).toBe(0);   // "more than 10"
    expect(sum({ targetSize: "freighter" })).toBe(-8);
    expect(sum({ unmounted: true, motion: "away" })).toBe(3);
  });
  it("Steeler (p.58–59): Signature 3, direct LOS −3 → 0 → TN 2; Gunnery 4 + ⌊3 ÷ 2⌋ = 5 dice", () => {
    const r = sensorGunneryTN({ signature: 3, los: "direct" });
    expect(r.raw).toBe(0);
    expect(r.tn).toBe(2);
    expect(sensorGunneryDice(4, 3)).toBe(5);
  });
  it("Tubbs (p.60): Gunnery 6 + Intelligence 4 + 3 spotter successes = 13 dice", () => {
    expect(missileDice({ gunnery: 6, intelligence: 4, spotter: 3 })).toBe(13);
    expect(missileDice({ gunnery: 6, intelligence: 4, sensor: 5, continuous: true })).toBe(12);
  });
  it("indirect fire: Concentration, else Gunnery at +2 (p.60)", () => {
    expect(indirectFireTest({ concentration: 5, sensor: 3 })).toEqual({ dice: 6, tnMod: 0 });
    expect(indirectFireTest({ gunnery: 4, sensor: 2, intelligence: 2 })).toEqual({ dice: 7, tnMod: 2 });
  });
  it("area-effect TN (p.61): Moly's laser at 250 m is short / 4; vehicle sensor bands scale with Flux", () => {
    expect(areaEffect("laser", 250)).toMatchObject({ band: "short", tn: 4 });
    expect(areaEffect("radar", 6500)).toMatchObject({ band: "extreme", tn: 9 });
    expect(areaEffect("sensor", 2000, 5)).toMatchObject({ band: "medium", tn: 5 });
    expect(areaEffect("laser", 6000)).toBeNull();
  });
  it("scatter (p.61): 16 m − 3 × 4 = 4 m; ≤ 0 is on target", () => {
    expect(scatter("short", 8, 3)).toBe(4);
    expect(scatter("short", 2, 3)).toBe(0);
    expect(scatter("long", 10, 2)).toBe(120);
  });
  it("biological signatures (p.61)", () => {
    expect(critterSignature("Great Dragon")).toBe(3);
    expect(critterSignature("Cockatrice")).toBe(8);
    expect(critterSignature("Ghoul")).toBeNull();
    expect(sizeSignature(1)).toBe(5);
    expect(sizeSignature(-2)).toBe(8);
  });
});
