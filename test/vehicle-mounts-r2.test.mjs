// Weapons on Rigger 2 mounts (R2 p.131–135, pages rendered 2026-11-26; sr2e-chargen docs/PLAN-workshop-mounts.md).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { R2_MOUNTS, CONVERSION_KITS, WEAPON_CLASS, WEAPON_CLASSES, NOT_MOUNTABLE, sourceKey, weaponClassOf, fitProblem, kitFor,
  mountProblems, mountedWeaponLoad, removalProblem } from "../module/rules/vehicle-mounts-r2.mjs";
import { designVehicle } from "../module/rules/vehicle-design.mjs";

const read = (dir) => readdirSync(new URL(dir, import.meta.url)).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(dir + f, import.meta.url), "utf8")));
// The Rigger 2 module is a sibling checkout locally; CI checks out only this repo, so its pack tests skip there.
const hasR2 = existsSync(new URL("../../sr2e-rigger-2/packs-src/r2-vehicle-mods/", import.meta.url));
const coreWeapons = read("../packs-src/weapons/"), r2Mods = hasR2 ? read("../../sr2e-rigger-2/packs-src/r2-vehicle-mods/") : [], r2Weapons = hasR2 ? read("../../sr2e-rigger-2/packs-src/r2-vehicle-weapons/") : [];
const folders = Object.fromEntries(coreWeapons.filter(d => d._key?.startsWith("!folders!")).map(d => [d._id, d]));
const pathOf = (fid) => { const out = []; for (let f = folders[fid]; f; f = folders[f.folder]) out.unshift(f.name); return out.join("/"); };

describe("the tables against the packs", () => {
  it.skipIf(!hasR2)("R2_MOUNTS is EXACTLY the designable mods with mount points, by name", () => {
    const want = r2Mods.filter(d => d.system?.designable && d.system?.mountPoints > 0).map(d => [`sr2e-rigger-2.r2-vehicle-mods.${d._id}`, d.name]);
    expect(Object.entries(R2_MOUNTS).map(([k, v]) => [k, v.name]).sort()).toEqual(want.sort());
    expect(Object.keys(R2_MOUNTS)).toHaveLength(19);
  });
  it.skipIf(!hasR2)("the conversion kits are the four kit mods", () => {
    for (const [cls, key] of Object.entries(CONVERSION_KITS)) expect(r2Mods.find(d => key.endsWith(d._id))?.name, cls).toMatch(/^Firearm Conversion Kit/);
  });
  it("every core firearm and heavy weapon is classed or excluded, never both; classes follow the folders", () => {
    const byFolder = { "Hold-Out Pistols": "pistol", "Light Pistols": "pistol", "Heavy Pistols": "pistol", Tasers: "pistol", "Submachine Guns": "smg",
      "Assault Rifles": "rifle", "Sport Rifles": "rifle", "Sniper Rifles": "rifle", Shotguns: "shotgun", "Light Machine Guns": "lmg" };
    const vehicle = { "3384fb676d8924f5": "autocannon", "40cf40b8a58e4f42": "vehicleLauncher", "9c67c3aea5c5a4d2": "waterCannon" };
    for (const d of coreWeapons.filter(d => d.type === "weapon" && ["firearm", "heavy"].includes(d.system.weaponType))) {
      const key = `sr2e.weapons.${d._id}`, cls = WEAPON_CLASS[key], folder = pathOf(d.folder).split("/").pop();
      expect(!!cls !== NOT_MOUNTABLE.has(key), `${d.name}: exactly one of classed / not mountable`).toBe(true);
      if (vehicle[d._id]) expect(cls, d.name).toBe(vehicle[d._id]);
      else if (byFolder[folder]) expect(cls, d.name).toBe(byFolder[folder]);
    }
    if (hasR2) for (const k of Object.keys(WEAPON_CLASS).filter(k => k.startsWith("sr2e-rigger-2."))) expect(r2Weapons.some(d => k.endsWith(d._id)), k).toBe(true);
  });
  it("every Weapon Value and kit row (p.135, p.131) and every turret's value (p.135; pop-up 1 lower; remote = house)", () => {
    expect(Object.fromEntries(Object.entries(WEAPON_CLASSES).map(([k, c]) => [k, [c.point, c.wv, c.kit, c.mph]]))).toEqual({
      pistol: ["firmpoint", null, "pistol", false], smg: ["firmpoint", 1, "smg", false], rifle: ["firmpoint", 1, "rifle", false],
      shotgun: ["firmpoint", null, "rifle", false], lmg: ["firmpoint", 1.5, "rifle", false], mmg: ["hardpoint", 2, "heavy", true],
      hmg: ["hardpoint", 2, "heavy", true], assaultCannon: ["hardpoint", 3, "heavy", true], missileLauncher: ["hardpoint", 2, "heavy", true],
      autocannon: ["hardpoint", 3, null, false], vehicleLauncher: ["hardpoint", 2, null, false], waterCannon: ["hardpoint", 3, null, false],
      minigun: ["hardpoint", 2.5, null, false] });
    expect(Object.values(R2_MOUNTS).filter(m => m.kind === "turret").map(m => [m.name, m.wv, !!m.house])).toEqual([
      ["Turret (Mini)", 2, false], ["Turret (Small)", 3, false], ["Turret (Medium)", 6, false],
      ["Anti-Aircraft Turret (Mini)", 2, false], ["Anti-Aircraft Turret (Small)", 3, false], ["Anti-Aircraft Turret (Medium)", 6, false],
      ["Pop-Up Turret (Mini)", 1, false], ["Pop-Up Turret (Small)", 2, false], ["Pop-Up Turret (Medium)", 5, false],
      ["Remote Turret (Micro)", 1, false], ["Remote Turret (Mini)", 2, true], ["Remote Turret (Small)", 3, true], ["Remote Turret (Medium)", 6, true]]);
  });
  it("Weapon Values (p.135) and kits (p.131)", () => {
    expect([WEAPON_CLASSES.smg.wv, WEAPON_CLASSES.rifle.wv, WEAPON_CLASSES.lmg.wv, WEAPON_CLASSES.hmg.wv, WEAPON_CLASSES.minigun.wv, WEAPON_CLASSES.waterCannon.wv]).toEqual([1, 1, 1.5, 2, 2.5, 3]);
    expect([WEAPON_CLASSES.pistol.wv, WEAPON_CLASSES.shotgun.wv]).toEqual([null, null]);
    expect([WEAPON_CLASSES.autocannon.kit, WEAPON_CLASSES.waterCannon.kit, WEAPON_CLASSES.missileLauncher.kit]).toEqual([null, null, "heavy"]);
  });
  it("the two zero weights are fixed: Colt Manhunter 2.5, Ingram Smartgun 3 (core p.278–279)", () => {
    const w = (id) => coreWeapons.find(d => d._id === id).system.weight;
    expect([w("31c9b3945bca4e80"), w("8c0e1af0d5c3e6e3")]).toEqual([2.5, 3]);
  });
});

const K = (id) => `sr2e-rigger-2.r2-vehicle-mods.${id}`;
const mount = (id, _id) => ({ _id, type: "vehicle_mod", name: R2_MOUNTS[K(id)].name, system: {}, flags: { sr2e: { catalogId: K(id), designMod: true } } });
const weapon = (id, _id, mountId, weight = 4) => ({ _id, type: "weapon", name: _id, system: { weight }, flags: { sr2e: { catalogId: `sr2e.weapons.${id}`, mountId } } });
const kit = (cls, _id, kitFor) => ({ _id, type: "vehicle_mod", name: `kit ${cls}`, system: {}, flags: { sr2e: { catalogId: CONVERSION_KITS[cls], designMod: true, kitFor } } });
const FIXED_FIRM = "9899f9283b954643", FIXED_HARD = "95c3935a006e0160", MINI = "e9082bd14a794425", RING = "8f0140c135c93507", PINTLE = "07ce1f02240a4aca";
const RIFLE = "9a954abc8f8a3315", LMG = "8ee88fc80bdff8f4", HMG = "ee9947f739c2cac6", PISTOL = "238ee9d5c429d332", AUTOCANNON = "3384fb676d8924f5";

describe("what fits where", () => {
  const cls = (id) => weaponClassOf({ flags: { sr2e: { catalogId: `sr2e.weapons.${id}` } } });
  const m = (id) => R2_MOUNTS[K(id)];
  it("hard/firmpoints (p.131): heavy on hardpoints only; a hardpoint takes a small arm too (a ruling)", () => {
    expect(fitProblem(m(FIXED_FIRM), cls(HMG))).toMatch(/hardpoints/);
    expect(fitProblem(m(FIXED_HARD), cls(RIFLE))).toBe("");
    expect(fitProblem(m(FIXED_FIRM), cls(RIFLE), [cls(RIFLE)])).toMatch(/holds one weapon/);
  });
  it("ring = man-portable heavy or LMG (p.134); pintle = firmpoint-sized (p.133)", () => {
    expect(fitProblem(m(RING), cls(HMG))).toBe("");
    expect(fitProblem(m(RING), cls(LMG))).toBe("");
    expect(fitProblem(m(RING), cls(RIFLE))).toMatch(/ring mount/);
    expect(fitProblem(m(RING), cls(AUTOCANNON))).toMatch(/ring mount/);
    expect(fitProblem(m(PINTLE), cls(HMG))).toMatch(/hardpoints/);
  });
  it("turrets (p.135): the Weapon Value sum; no value, no turret", () => {
    expect(fitProblem(m(MINI), cls(LMG), [cls(RIFLE)])).toMatch(/Weapon Value 2; this would make 2.5/);
    expect(fitProblem(m(MINI), cls(RIFLE), [cls(RIFLE)])).toBe("");
    expect(fitProblem(m(MINI), cls(PISTOL))).toMatch(/no value/);
    expect(R2_MOUNTS[K("85400082a5a98db1")].wv).toBe(1);   // pop-up mini: 1 lower
  });
  it("kits: personal firearms on fixed mounts and turrets; none on pintle or ring, none for vehicle weapons", () => {
    expect(kitFor(m(FIXED_FIRM), cls(RIFLE))).toBe(CONVERSION_KITS.rifle);
    expect(kitFor(m(MINI), cls(HMG))).toBe(CONVERSION_KITS.heavy);
    expect(kitFor(m(RING), cls(HMG))).toBeNull();
    expect(kitFor(m(FIXED_HARD), cls(AUTOCANNON))).toBeNull();
  });
});

describe("mountProblems, the load and removal", () => {
  it("a well-built set has no problem; the fixed mount's weapon weighs on the Load", () => {
    const items = [mount(FIXED_FIRM, "m1"), weapon(RIFLE, "w1", "m1", 4.5), kit("rifle", "k1", "w1"), mount(RING, "m2"), weapon(HMG, "w2", "m2", 15)];
    expect(mountProblems(items)).toEqual([]);
    expect(mountedWeaponLoad(items)).toBe(4.5);
  });
  it("a missing kit, a wrong kit, an orphan kit, a missing mount, an unknown weight", () => {
    const codes = (items) => mountProblems(items).map(p => p.code);
    expect(codes([mount(FIXED_FIRM, "m1"), weapon(RIFLE, "w1", "m1")])).toEqual(["kitMissing"]);
    expect(codes([mount(FIXED_FIRM, "m1"), weapon(RIFLE, "w1", "m1"), kit("pistol", "k1", "w1")])).toEqual(["kitClass"]);
    expect(codes([kit("rifle", "k1", "w9")])).toEqual(["kitOrphan"]);
    expect(codes([weapon(RIFLE, "w1", "gone")])).toEqual(["mountMissing"]);
    expect(codes([mount(FIXED_HARD, "m1"), weapon(AUTOCANNON, "w1", "m1", Number.NaN)])).toEqual(["weaponWeight"]);
  });
  it("two weapons in one turret (one unclassed: reported, no crash); a kit on a pintle weapon is extra; an unlinked design kit is orphaned (code review r1)", () => {
    const codes = (items) => mountProblems(items).map(p => p.code);
    const odd = { _id: "w0", type: "weapon", name: "odd", system: { weight: 1 }, flags: { sr2e: { catalogId: "sr2e-fields-of-fire.ff-weapons.aaaaaaaaaaaaaaaa", mountId: "m1" } } };
    expect(codes([mount(MINI, "m1"), odd, weapon(RIFLE, "w1", "m1"), kit("rifle", "k1", "w1")])).toEqual(["mountFit"]);
    expect(codes([mount(MINI, "m1"), weapon(RIFLE, "w1", "m1"), kit("rifle", "k1", "w1"), weapon(RIFLE, "w2", "m1"), kit("rifle", "k2", "w2")])).toEqual([]);
    expect(codes([mount(PINTLE, "m1"), weapon(RIFLE, "w1", "m1"), kit("rifle", "k1", "w1")])).toEqual(["kitExtra"]);
    expect(codes([{ ...kit("rifle", "k1", undefined) }])).toEqual(["kitOrphan"]);
    const bought = kit("rifle", "k2", undefined); delete bought.flags.sr2e.designMod; delete bought.flags.sr2e.kitFor;
    expect(codes([bought]), "a customization kit never linked: left alone").toEqual([]);
  });
  it("an occupied mount or a linked kit can't be removed on its own", () => {
    const items = [mount(FIXED_FIRM, "m1"), weapon(RIFLE, "w1", "m1"), kit("rifle", "k1", "w1"), mount(PINTLE, "m2")];
    expect(removalProblem(items, "m1")).toMatch(/holds weapons/);
    expect(removalProblem(items, "k1")).toMatch(/converts/);
    expect(removalProblem(items, "m2")).toBe("");
  });
  it("sourceKey reads the catalog id or the compendium source, never a bare id", () => {
    expect(sourceKey({ _stats: { compendiumSource: "Compendium.sr2e-rigger-2.r2-vehicle-mods.Item.9899f9283b954643" } })).toBe(K(FIXED_FIRM));
    expect(sourceKey({ flags: { sr2e: { catalogId: "9899f9283b954643" } } })).toBe("");
  });
});

describe("the engine's weaponLoad", () => {
  const tables = { chassis: { c: { key: "c", name: "Car", category: "car", handling: 4, body: 3, armor: 0, cargo: { start: 4, max: 15 }, dp: 20 } },
    powerPlants: { p: { key: "p", name: "Gas", engine: "gasoline", chassis: ["c"], speed: { start: 90, max: 100 }, acceleration: { start: 6, max: 10 },
      load: { start: 40, max: 160 }, signature: 2, economy: { start: 8, max: 12 }, fuel: { size: 40 }, dp: 25 } }, fuel: {}, markUp: { base: { car: 1 } } };
  const d = { chassisKey: "c", powerPlantKey: "p" };
  it("adds to the Load used; over the Load is a problem; a bad value is refused, not coerced", () => {
    expect(designVehicle(d, tables, { weaponLoad: 15 }).budgets.loadUsed).toBe(15);
    expect(designVehicle(d, tables, { weaponLoad: 41 }).problems.map(p => p.code)).toContain("loadOver");
    for (const bad of [-1, Number.NaN, Infinity, "5"]) expect(designVehicle(d, tables, { weaponLoad: bad }).problems.map(p => p.code)).toContain("weaponLoad");
    expect(designVehicle(d, tables).budgets.loadUsed).toBe(0);
  });
});
