import { describe, it, expect } from "vitest";
import { vehicleHit, isAntiVehicleOrdnance } from "../module/rules/sr2e-rules.mjs";

describe("weapons against vehicles (SR2E p.108)", () => {
  it("the Damage Level drops one step; armour is a Barrier against the base Power", () => {
    expect(vehicleHit({ body: 4, armor: 0, power: 9, level: "S" })).toMatchObject({ level: "M", dice: 4, tn: 5 });
    expect(vehicleHit({ body: 4, armor: 6, power: 9, basePower: 6, level: "S" })).toMatchObject({ none: "barrier" });
    expect(vehicleHit({ body: 4, armor: 6, power: 12, basePower: 9, level: "D" })).toMatchObject({ level: "S", dice: 7, tn: 2 });
  });
  it("Light-rated weapons can't hurt vehicles; stun never does", () => {
    expect(vehicleHit({ body: 2, power: 6, level: "M", lightRated: true })).toMatchObject({ none: "light" });
    expect(vehicleHit({ body: 2, power: 6, level: "L" })).toMatchObject({ none: "light" });
    expect(vehicleHit({ body: 2, power: 6, level: "M", damageType: "stun" })).toMatchObject({ none: "stun" });
  });
  it("anti-vehicle rockets and missiles keep their Damage Level; armour still cuts Power", () => {
    expect(vehicleHit({ body: 4, armor: 6, power: 16, level: "D", antiVehicle: true })).toMatchObject({ level: "D", tn: 6 });
    expect(isAntiVehicleOrdnance("Anti-Vehicle Rocket")).toBe(true);
    expect(isAntiVehicleOrdnance("Anti-Vehicle Missile")).toBe(true);
    expect(isAntiVehicleOrdnance("AVM")).toBe(true);
    expect(isAntiVehicleOrdnance("High-Explosive Rocket")).toBe(false);
  });
  it("APDS (Sourcebook Updates): half armour vs Power and as a Barrier, level −1; a Light APDS hit stays Light", () => {
    expect(vehicleHit({ body: 4, armor: 6, power: 8, basePower: 8, level: "M", apds: true })).toMatchObject({ level: "L", tn: 2, armorUsed: 3 });
    expect(vehicleHit({ body: 4, armor: 6, power: 8, basePower: 4, level: "M", apds: true })).toMatchObject({ level: "L" });
    expect(vehicleHit({ body: 4, armor: 6, power: 3, basePower: 3, level: "M", apds: true })).toMatchObject({ none: "barrier" });
    expect(vehicleHit({ body: 3, armor: 0, power: 6, level: "L", lightRated: true, apds: true })).toMatchObject({ level: "L", tn: 3 });
    // No armour to halve: APDS never makes a vehicle easier to hurt than 1 point of armour would.
    expect(vehicleHit({ body: 4, armor: 0, power: 10, level: "M", apds: true }).tn).toBe(6);
    expect(vehicleHit({ body: 4, armor: 1, power: 10, basePower: 10, level: "M", apds: true }).tn).toBe(6);
  });
});
