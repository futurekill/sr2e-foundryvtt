// The Workshop's pure parts (module/rules/vehicle-workshop-rules.mjs): pinned so the chargen app, which vendors this
// file (sr2e-chargen docs/PLAN-workshop.md), sees any change. Tables: a small book-checked subset (vehicle-design.test.mjs).
import { describe, it, expect } from "vitest";
import { designVehicle } from "../module/rules/vehicle-design.mjs";
import { blankDesign, workshopUpdate, checkChoices, engineMods, choiceFor, vehicleEffective, vehicleTypeFor, designModProblems, modBuildContext } from "../module/rules/vehicle-workshop-rules.mjs";

const tables = {
  chassis: {
    sandBuggy: { key: "sandBuggy", name: "Sand Buggy", category: "car", handling: { onRoad: 4, offRoad: 4 }, body: 3, armor: 0,
      cargo: { start: 4, max: 15 }, autonav: 0, pilot: null, sensor: 0, seating: "2b+2b", entry: "o", dp: 20 },
    wheeledDrone: { key: "wheeledDrone", name: "Wheeled drone", category: "car", drone: true, handling: 4, body: 2, armor: 0, cargo: { start: 1, max: 6 }, dp: 100 }
  },
  powerPlants: {
    gasBuggy: { key: "gasBuggy", name: "Sand Buggy (gasoline)", engine: "gasoline", chassis: ["sandBuggy"],
      speed: { start: 90, max: 100 }, acceleration: { start: 6, max: 10 }, load: { start: 40, max: 160 }, signature: 2,
      economy: { start: 8, max: 12, unit: "km/liter" }, fuel: { size: 40, unit: "liters" }, dp: 25 },
    dieselWheeledDrone: { key: "dieselWheeledDrone", name: "Wheeled drone (diesel)", engine: "diesel", chassis: ["wheeledDrone"],
      speed: { start: 35, max: 90 }, acceleration: { start: 3, max: 10 }, load: { start: 10, max: "600 x B" },
      signature: "6 - B", economy: { start: 2, max: 6 }, fuel: { size: 5 }, dp: "25 + (10 x B)" }
  },
  fuel: { gasoline: { increase: 1, unit: "liters", dp: 2, cf: 1, cfPer: 50 } },
  markUp: {
    base: { bike: 0.5, car: 1, special: [1, 2.5] },
    features: { smartMaterials: 0.5, ambulance: 1, nonCombat: [0.25, 2.5], unusual: [0.2, 1.2] },
    multipliers: { luxury: [1.5, 2.5], security: [2, 3], military: [3, 5], drone: 0.1 }
  }
};
const design = (o) => ({ ...blankDesign(), ...o });
const save = (d) => { const r = designVehicle(d, tables); return { r, u: workshopUpdate(d, r, tables.chassis[d.chassisKey], tables.powerPlants[d.powerPlantKey], "Test") }; };

describe("workshopUpdate (what a save writes)", () => {
  it("a sand buggy with options", () => {
    const d = design({ chassisKey: "sandBuggy", powerPlantKey: "gasBuggy", speed: 10, cargo: 2, handling: 1 });
    const { r, u } = save(d);
    expect(r.valid).toBe(true);
    expect(u).toMatchObject({ name: "Test", "system.vehicleType": "ground", "system.skill": "", "system.handling": 3, "system.handlingOffRoad": 4,
      "system.speed": 100, "system.acceleration": 6, "system.body": 3, "system.cargo": 6, "system.load": 40, "system.signature": 2,
      "system.design.version": 2, "system.design.baseVersion": 2, "system.design.category": "car", "system.design.chassisKey": "sandBuggy",
      "system.design.powerPlantKey": "gasBuggy", "system.designPointValue": r.dp, "system.cost": r.price });
    expect(u["system.design.choices"]).toEqual(d);
    expect(u["system.design.choices"]).not.toBe(d);
  });
  it("a wheeled drone is a drone vehicle", () => {
    const { u } = save(design({ chassisKey: "wheeledDrone", powerPlantKey: "dieselWheeledDrone" }));
    expect(u["system.vehicleType"]).toBe("drone");
    expect(u["system.signature"]).toBe(4);
    expect(vehicleTypeFor({ category: "special", name: "Blimp" }).vehicleType).toBe("aircraft");
  });
});

describe("the floors (a rating bought down below 0)", () => {
  it("Speed −10000 is a problem, not a 4,000¥ vehicle", () => {
    const r = designVehicle(design({ chassisKey: "sandBuggy", powerPlantKey: "gasBuggy", speed: -10000 }), tables);
    expect(r.valid).toBe(false);
    expect(r.problems.map(p => p.code)).toContain("speedNegative");
    expect(designVehicle(design({ chassisKey: "sandBuggy", powerPlantKey: "gasBuggy", speed: -90 }), tables).valid).toBe(true);
  });
});

describe("checkChoices (the shape of a design)", () => {
  const ok = design({ chassisKey: "sandBuggy", powerPlantKey: "gasBuggy" });
  it("accepts the Workshop's own designs, the optional fields included", () => {
    expect(checkChoices(blankDesign(), tables)).toEqual([]);
    expect(checkChoices({ ...ok, tires: "performance", quality: { lemon: 3, prototype: 1 }, dbwSplit: { acceleration: 5, speed: 5, load: 0 },
      markUp: { base: 0, features: { ambulance: true, unusual: 0.5 }, multipliers: { drone: true, military: 4 }, round: 500 },
      amenities: { level: "high", occupants: 4 }, takeoff: "", speed: -90 }, tables)).toEqual([]);
  });
  it.each([
    ["an extra key", { ...ok, evil: 1 }, /evil isn't a design field/],
    ["a missing key", (({ speed, ...rest }) => rest)(ok), /speed is missing/],
    ["a wrong type", { ...ok, speed: "10" }, /speed must be a whole number/],
    ["NaN", { ...ok, cargo: NaN }, /cargo must be/],
    ["a fraction", { ...ok, signature: 1.5 }, /signature must be a whole number/],
    ["out of range", { ...ok, engineCustom: { speed: 99, acceleration: 0, load: 0 } }, /engineCustom.speed/],
    ["an unknown chassis", { ...ok, chassisKey: "tank" }, /chassisKey isn't in the Chassis Table/],
    ["a bad enum", { ...ok, takeoff: "rocket" }, /takeoff must be one of/],
    ["a mark-up key not in the table", { ...ok, markUp: { ...ok.markUp, features: { smartMaterials: 0.5 } } }, /features.smartMaterials isn't in the Mark-Up table/],
    ["a quality over its maximum", { ...ok, quality: { prototype: 2 } }, /quality.prototype/],
    ["an unknown quality", { ...ok, quality: { cursed: 1 } }, /cursed isn't a Quality Factor/],
    ["a DBW split not adding to 10", { ...ok, dbwSplit: { acceleration: 5, speed: 5, load: 5 } }, /add up to 10/],
    ["an array", [], /must be an object/],
    ["an inherited key", Object.assign(Object.create({ speed: 0 }), ok), /must be an object/]
  ])("refuses %s", (_, c, re) => {
    expect(checkChoices(c, tables).join("; ")).toMatch(re);
  });
});

describe("the mod step", () => {
  const dbw = { name: "Drive-by-Wire", system: { modKey: "drive-by-wire", rating: 1, custom: { choice: { acceleration: 10, speed: 0, load: 0 } } } };
  it("the engine sees the design's DBW split, the save writes it onto the item", () => {
    expect(engineMods([dbw])[0].custom.choice).toEqual({});
    expect(engineMods([{ ...dbw, customization: true }])[0].custom.choice).toEqual({ acceleration: 10, speed: 0, load: 0 });
    expect(choiceFor({ dbwSplit: { acceleration: 4, speed: 6, load: 0 } }, dbw.system)).toEqual({ acceleration: 4, speed: 6, load: 0 });
    expect(choiceFor({}, { modKey: "x", custom: { choice: { a: 1 } } })).toEqual({ a: 1 });
  });
  it("a mod's problems: customization-only, restrictions, a rating over its maximum", () => {
    const bc = modBuildContext(design({}), tables.chassis.sandBuggy, tables.powerPlants.gasBuggy, []);
    expect(designModProblems({ designable: false }, bc)).toEqual(["customization only (install it after the vehicle is built)"]);
    expect(designModProblems({ restrictions: ["only:boat"] }, bc)[0]).toMatch(/fits boat only/);
    expect(designModProblems({ maxRating: "2" }, bc, 3)[0]).toMatch(/over the maximum 2/);
    expect(designModProblems({ maxRating: "2" }, bc, 2)).toEqual([]);
  });
});

describe("vehicleEffective (what VehicleData shows)", () => {
  it("base + mods; a removed mod counts nothing", () => {
    const sys = { design: { version: 2, baseVersion: 2, category: "car" }, skill: "", vehicleType: "ground", body: 3, pilot: 0,
      handling: 4, handlingOffRoad: 4, speed: 90, acceleration: 6, load: 40, cargo: 4, armor: 0, signature: 2, economy: 8, sensor: 0, autonav: 0 };
    const armor = { _id: "a1", type: "vehicle_mod", name: "Armor", system: { modKey: "armor", rating: 6, effects: { armor: "R" } }, flags: {} };
    const v = vehicleEffective(sys, [armor]);
    expect(v.baseConverted).toBe(true);
    expect(v.effective).toMatchObject({ speed: 90, handling: expect.any(Number), body: 3 });
    expect(vehicleEffective(sys, [armor], { removed: { a1: "removed" } }).mods).toEqual([]);
  });
});
