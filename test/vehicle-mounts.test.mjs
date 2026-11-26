import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { MOUNT_POINTS, HARDPOINT_WEAPONS, LAUNCHER_MUNITIONS, mountKindFor, mountPointsOf, mountedWeaponCost } from "../module/rules/vehicle-mounts.mjs";

const pack = (dir) => Object.fromEntries(readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8"))).filter(d => d._id).map(d => [d._id, d]));
const vehicles = pack("vehicles"), weapons = pack("weapons");

describe("core vehicle mounts (SR2E p.251–253, pages rendered 2026-11-26)", () => {
  it("each row is a core vehicle in the pack", () => {
    for (const id of Object.keys(MOUNT_POINTS)) expect(vehicles[id]?.type, id).toBe("vehicle");
  });
  it.each([
    ["c9330e180d1d7e0e", 0, 3, true, 1000],   // p.251 "up to three firmpoints … 15,000¥ plus 1,000¥ per firmpoint"
    ["110ead2a77979424", 0, 2, true, 0],      // p.252 Nightrunner "can mount two firmpoints"
    ["52bb0a006726360c", 2, 0, true, 0],      // p.252 Dragon "can mount two hardpoints"
    ["582bad720d7f5015", 4, 0, false, 0],     // p.253 EFA "an assault cannon in its nose and four hardpoints"
    ["913f2b70879869b5", 4, 0, false, 0],     // p.253 Banshee "… four hardpoints"
    ["f904e4d2fabf90f9", 2, 0, false, 0],     // p.253 Patroller "two hardpoints"
    ["7b98667b901c2e26", 4, 0, false, 0],     // p.253 Riverine "four hardpoints"
    ["3bb96b417ee5e828", 2, 0, true, 0],      // p.253 Yellowjackets "one or two hardpoints"
    ["4a3cebff8313eca1", 6, 0, false, 0],     // p.253 Eagle "two assault cannon in its nose and six hardpoints"
    ["e72a772620bc937d", 0, 2, false, 0],     // p.253 Hunter "two firmpoints"
    ["5af822ac2cddf8b8", 1, 1, false, 0]      // p.253 Patrol Vehicle "one firmpoint, one hardpoint"
  ])("%s", (id, hard, firm, upTo, pointCost) => {
    expect(mountPointsOf(id)).toMatchObject({ hardpoints: hard, firmpoints: firm, upTo, pointCost });
  });
  it("a vehicle the descriptions give no mounts has none (the Stallion's armed variant is another vehicle)", () => {
    expect(mountPointsOf("50f1bc38c994fa43")).toMatchObject({ hardpoints: 0, firmpoints: 0 });
  });
});

describe("what goes on which mount (p.251)", () => {
  it("the hardpoint weapons are heavy weapons in the pack; the munitions are heavy items too, but not mountable", () => {
    for (const id of Object.keys(HARDPOINT_WEAPONS)) { expect(weapons[id]?.system.weaponType, id).toBe("heavy"); expect(mountKindFor({ id, weaponType: weapons[id].system.weaponType })).toBe("hardpoint"); }
    for (const id of Object.keys(LAUNCHER_MUNITIONS)) { expect(weapons[id]?.system.weaponType, id).toBe("heavy"); expect(mountKindFor({ id, weaponType: "heavy" })).toBeNull(); }
  });
  it("a firmpoint takes any firearm (the Ingram Valiant LMG too); the under-barrel launcher and melee take nothing", () => {
    expect(mountKindFor({ id: "8ee88fc80bdff8f4", weaponType: "firearm" })).toBe("firmpoint");
    expect(mountKindFor({ id: "92a4f1ecb7c5ab6b", weaponType: "heavy" })).toBeNull();
    expect(mountKindFor({ id: "x", weaponType: "melee" })).toBeNull();
  });
  it("adaptation doubles the weapon's cost", () => {
    expect(mountedWeaponCost(4000)).toBe(8000);
    expect(mountedWeaponCost(undefined)).toBe(0);
  });
});
