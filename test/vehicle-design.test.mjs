// Rigger 2 vehicle design (book p.108–120), against the book's own worked examples (p.111–115) and the table rows
// read from the rendered pages (Chassis Table p.170, Power Plant Table p.168 gasoline, Fuel Tank Capacity Table
// p.116, Mark-Up Factors Table p.114). User rulings 2026-11-07: Acceleration 2 DP/pt; the Handling floor binds the
// final rating, Smart Materials included; CF stays fractional.
import { describe, it, expect } from "vitest";
import { evalCell, designVehicle, engineCustomizationDP, markUpFactor, designPrice, vehicleCapacity, modDesignDP, modCf, modLoad } from "../module/rules/vehicle-design.mjs";

const tables = {
  chassis: {
    sandBuggy: { name: "Sand Buggy", category: "car", handling: { onRoad: 4, offRoad: 4 }, body: 3, armor: 0,
      cargo: { start: 4, max: 15 }, autonav: 0, pilot: null, sensor: 0, seating: "2b+2b", entry: "o", dp: 20 },
    sportsCar: { name: "Sports Car", category: "car", handling: { onRoad: 4, offRoad: 8 }, body: 3, armor: 0,
      cargo: { start: 3, max: 18 }, autonav: 0, pilot: null, sensor: 0, seating: "2b", entry: "2+1t", dp: 110 },
    wheeledDrone: { name: "Wheeled drone", category: "car", handling: 4, body: 2, armor: 0, cargo: { start: 1, max: 6 }, dp: 100 }
  },
  powerPlants: {
    gasBuggy: { name: "Subcompact and Sand Buggy (gasoline)", engine: "gasoline", chassis: ["sandBuggy"],
      speed: { start: 90, max: 100 }, acceleration: { start: 6, max: 10 }, load: { start: 40, max: 160 }, signature: 2,
      economy: { start: 8, max: 12, unit: "km/liter" }, fuel: { size: 40, unit: "liters" }, dp: 25 },
    gasSports: { name: "Sports Car (gasoline)", engine: "gasoline", chassis: ["sportsCar"],
      speed: { start: 160, max: 270 }, acceleration: { start: 10, max: 18 }, load: { start: 40, max: 200 }, signature: 2,
      economy: { start: 6, max: 10, unit: "km/liter" }, fuel: { size: 60, unit: "liters" }, dp: 65 },
    dieselWheeledDrone: { name: "Wheeled drone (diesel)", engine: "diesel", chassis: ["wheeledDrone"],
      speed: { start: 35, max: 90 }, acceleration: { start: 3, max: 10 }, load: { start: 10, max: "600 x B" },
      signature: "6 - B", economy: { start: 2, max: 6 }, fuel: { size: 5 }, dp: "25 + (10 x B)" }
  },
  fuel: { gasoline: { increase: 1, unit: "liters", dp: 2, cf: 1, cfPer: 50 } },
  markUp: {
    base: { bike: 0.5, car: 1, fixedWing: 2.5, hovercraft: 2.5, boat: 1, rotor: 2.5, vector: 2.5, special: [1, 2.5] },
    features: { smartMaterials: 0.5, ambulance: 1, nonCombat: [0.25, 2.5], unusual: [0.2, 1.2] },
    multipliers: { luxury: [1.5, 2.5], security: [2, 3], military: [3, 5], drone: 0.1 }
  }
};

describe("Body formulas (p.169: B denotes Body)", () => {
  it("evaluates the table's forms", () => {
    expect(evalCell("5 x B", 3)).toBe(15);
    expect(evalCell("10 + (30 x B)", 2)).toBe(70);
    expect(evalCell("9 - B", 4)).toBe(5);
    expect(evalCell("60 x B^3", 2)).toBe(480);
    expect(evalCell("30 + (60 x B^2)", 2)).toBe(270);
    expect(evalCell(25)).toBe(25);
    expect(evalCell("NA")).toBeNull();
    expect(evalCell("5 x Q", 2)).toBeNull();
  });
  it("a ×B power plant is buildable: Body comes from the chassis", () => {
    const r = designVehicle({ chassisKey: "wheeledDrone", powerPlantKey: "dieselWheeledDrone" }, tables);
    expect(r.valid).toBe(true);
    expect(r.dp).toBe(100 + 45);
    expect([r.stats.signature, r.limits.load]).toEqual([4, 1200]);
  });
});

describe("Rich's Johnny Player Special (p.111–115), under rulings 1 and 5", () => {
  const mods = [
    { name: "Nitrous Oxide Injectors", rating: 6, dpPerLevel: 55, cfConsumed: 1.5, loadReduction: 15 },
    { name: "Datajack Port", designPoints: 25, loadReduction: 10 },
    { name: "Rigger Adaptation", designPoints: 35 },
    { name: "Sensors", rating: 2, dpTable: [50, 150], cfConsumed: 1, loadReduction: 25 },
    { name: "Crash Cage", designPoints: 40, loadReduction: 10 }
  ];
  const design = { chassisKey: "sportsCar", powerPlantKey: "gasSports", smartMaterials: true,
    acceleration: 11, speed: 151, load: 100, handling: 1, handlingTrack: "onRoad",
    markUp: { features: { unusual: 1.0 } } };
  it("599 after Speed and Acceleration, as printed (Acceleration at 2 DP, p.113)", () => {
    const r = designVehicle({ ...design, load: 0, handling: 0 }, tables);
    expect(r.dp).toBe(599);
    expect([r.limits.speed, r.limits.acceleration, r.limits.load]).toEqual([311, 21, 230]);   // smart materials ×1.15
    expect([r.stats.speed, r.stats.acceleration]).toEqual([311, 21]);
  });
  it("Handling: Smart Materials take 4→3, so ONE bought point reaches the floor of 2: 634, not the printed 659", () => {
    const r = designVehicle(design, tables);
    expect(r.dp).toBe(634);
    expect(r.stats.handling.onRoad).toBe(2);
    expect(r.valid).toBe(true);
    const two = designVehicle({ ...design, handling: 2 }, tables);
    expect(two.problems.map(p => p.code)).toContain("handlingFloor");
  });
  it("with his mods: 1,214 DP (book 1,239), Mark-Up 2.5, 303,500¥ (book 309,750¥), cargo 0.5 CF as printed", () => {
    const r = designVehicle(design, tables, { mods });
    expect(r.dp).toBe(1214);
    expect(r.markUp.total).toBe(2.5);
    expect(r.price).toBe(303500);
    expect(r.budgets.cargoFree).toBe(0.5);
    expect(r.budgets.cargo).toBe(3);            // GROSS is what the vehicle stores
    expect(r.stats.load).toBe(140);
  });
});

describe("Steffi's Light Strike Vehicle (p.111–115), under rulings 1 and 6", () => {
  const mods = [
    { name: "Roll Bars", designPoints: 0 },
    { name: "Electronics Port", designPoints: 10, cfConsumed: 0.5 },
    { name: "Ring Mount", designPoints: 10, cfConsumed: 1, loadReduction: 25 },
    { name: "Pintle Mount", designPoints: 1 }
  ];
  const design = { chassisKey: "sandBuggy", powerPlantKey: "gasBuggy", handling: 1, handlingTrack: "offRoad",
    acceleration: 2, cargo: 2, load: 30, markUp: { multipliers: { security: 2 } } };
  it("108 DP (the book prints 154, pricing Acceleration at 25), 21,600¥ at ×2 security", () => {
    const r = designVehicle(design, tables, { mods });
    expect(r.dpLines.find(l => /Acceleration/.test(l.label)).dp).toBe(4);
    expect(r.dp).toBe(108);
    expect(r.markUp.total).toBe(2);
    expect(r.price).toBe(21600);
  });
  it("Handling 4/3, Speed 90, Acceleration 8; Cargo 6 − 1.5 = 4.5 (book 4), Load 70 − 25 = 45", () => {
    const r = designVehicle(design, tables, { mods });
    expect(r.stats.handling).toEqual({ onRoad: 4, offRoad: 3 });
    expect([r.stats.speed, r.stats.acceleration]).toEqual([90, 8]);
    expect([r.budgets.cargo, r.budgets.cargoFree, r.budgets.load, r.budgets.loadFree]).toEqual([6, 4.5, 70, 45]);
  });
});

describe("Mark-Up (p.114)", () => {
  it("the Wandjina: fixed-wing 2.5 × military 3 × drone 0.1 = 0.75 (multipliers multiply, never add)", () => {
    expect(markUpFactor("fixedWing", { multipliers: { military: 3, drone: true } }, tables.markUp).total).toBe(0.75);
  });
  it("ranges clamp; rounding to the nearest 500/1,000 is optional", () => {
    expect(markUpFactor("car", { multipliers: { security: 9 } }, tables.markUp).total).toBe(3);
    expect(designPrice(154, 2, 500)).toBe(31000);
    expect(designPrice(154, 2)).toBe(30800);
  });
});

describe("the other options", () => {
  const base = { chassisKey: "sandBuggy", powerPlantKey: "gasBuggy" };
  it("Economy: 5 DP per 5% step, compounding on the initial rating, capped at the plant's maximum (p.116)", () => {
    const r = designVehicle({ ...base, economySteps: 2 }, tables);
    expect(r.stats.economy).toBeCloseTo(8.82, 10);
    expect(r.dp).toBe(45 + 10);
    expect(designVehicle({ ...base, economySteps: 9 }, tables).problems.map(p => p.code)).toContain("economyOverMax");
  });
  it("Fuel tank: the Fuel Tank Capacity Table (gasoline 1 liter for 2 DP, 1 CF per 50 liters, p.116)", () => {
    const r = designVehicle({ ...base, fuelSteps: 25 }, tables);
    expect([r.stats.fuelSize, r.dp, r.options.cf]).toEqual([65, 45 + 50, 0.5]);
  });
  it("over a maximum, or a plant the table doesn't list for the chassis, is a problem", () => {
    expect(designVehicle({ ...base, speed: 11 }, tables).problems.map(p => p.code)).toContain("speedOverMax");
    expect(designVehicle({ chassisKey: "sandBuggy", powerPlantKey: "gasSports" }, tables).problems.map(p => p.code)).toContain("plantNotForChassis");
    expect(designVehicle({ ...base, load: 15 }, tables).problems.map(p => p.code)).toContain("loadStep");
  });
  it("downgrades are free (p.109, p.112)", () => {
    const r = designVehicle({ ...base, speed: -20, handling: -1 }, tables);
    expect(r.dp).toBe(45);
    expect([r.stats.speed, r.stats.handling.onRoad]).toEqual([70, 5]);
  });
  it("over the CF or Load budget blocks the build (p.115)", () => {
    const r = designVehicle(base, tables, { mods: [{ name: "Big thing", cfConsumed: 5 }] });
    expect(r.problems.map(p => p.code)).toContain("cfOver");
  });
  it("STOL/VSTOL is fixed-wing only; hydrofoils only motorboats (p.116)", () => {
    expect(designVehicle({ ...base, takeoff: "stol" }, tables).problems.map(p => p.code)).toContain("takeoffCategory");
    expect(designVehicle({ ...base, hydrofoil: true }, tables).problems.map(p => p.code)).toContain("hydrofoilCategory");
  });
  it("living amenities count the driver, consume 200 CF of which 160 stay usable for gear (p.117)", () => {
    const r = designVehicle({ ...base, cargo: 11, amenities: { level: "improved", occupants: 4 } }, tables);
    expect(r.dpLines.find(l => /amenities/.test(l.label)).dp).toBe(50 + 40 * 4);
    expect(r.options).toEqual({ cf: 200, load: 100, restrictedCf: 160 });
  });
  it("medical gear: 400 + 80/patient, 225 CF, 500 kg, +2.5 seats per patient (p.117)", () => {
    const r = designVehicle({ ...base, medicalPatients: 2 }, tables);
    expect(r.dpLines.find(l => /Medical/.test(l.label)).dp).toBe(560);
    expect(r.stats.seatingExtra).toBe(5);
  });
  it("medical gear takes any number of patients (\"and so on\", p.117): 3 → 640 DP, +7.5 seats", () => {
    const r = designVehicle({ ...base, medicalPatients: 3 }, tables);
    expect([r.dpLines.find(l => /Medical/.test(l.label)).dp, r.stats.seatingExtra]).toEqual([640, 7.5]);
  });
  it("economy keeps its precision (0.05 + 5% = 0.0525)", () => {
    const t = { ...tables, powerPlants: { ...tables.powerPlants, tiny: { ...tables.powerPlants.gasBuggy, chassis: ["sandBuggy"], economy: { start: 0.05, max: 0.25 } } } };
    expect(designVehicle({ chassisKey: "sandBuggy", powerPlantKey: "tiny", economySteps: 1 }, t).stats.economy).toBeCloseTo(0.0525, 12);
    expect(designVehicle({ chassisKey: "sandBuggy", powerPlantKey: "tiny", economySteps: 3 }, t).stats.economy).toBeCloseTo(0.05788125, 12);
  });
  it("half levels and fractional steps are refused, never free", () => {
    expect(designVehicle({ ...base, engineCustom: { speed: 0.5 } }, tables).problems.map(p => p.code)).toContain("notWhole");
    expect(designVehicle({ ...base, economySteps: 1.5 }, tables).problems.map(p => p.code)).toContain("notWhole");
  });
  it("structural agility needs a drive-by-wire level at least as high (p.118)", () => {
    expect(designVehicle({ ...base, structuralAgility: 2 }, tables, { mods: [{ name: "Drive-by-Wire", rating: 1 }] })
      .problems.map(p => p.code)).toContain("agilityNeedsDbw");
    expect(designVehicle({ ...base, structuralAgility: 1 }, tables, { mods: [{ name: "Drive-by-Wire", rating: 1 }] })
      .problems.map(p => p.code)).not.toContain("agilityNeedsDbw");
  });
});

describe("engine customization (p.120)", () => {
  it("each level costs plant DP × (1.25 + 0.5 per earlier level), summed", () => {
    expect(engineCustomizationDP(100, 1)).toBe(125);
    expect(engineCustomizationDP(100, 2)).toBe(300);
    expect(engineCustomizationDP(100, 3)).toBe(525);
  });
  it("Speed +30, Acceleration +2 or Load +Body×50 per level, up to the plant maximum × 1.75", () => {
    const r = designVehicle({ chassisKey: "sportsCar", powerPlantKey: "gasSports", speed: 110,
      engineCustom: { speed: 2, acceleration: 1, load: 1 } }, { ...tables });
    expect([r.stats.speed, r.stats.acceleration, r.stats.load]).toEqual([330, 12, 190]);
    const over = designVehicle({ chassisKey: "sportsCar", powerPlantKey: "gasSports", speed: 110,
      engineCustom: { speed: 7 } }, tables);
    expect(over.problems.map(p => p.code)).toContain("speedOverCustom");   // 270 × 1.75 = 473 < 380 + 210
  });
});

describe("one capacity rule and build-relative mod costs", () => {
  it("usable = gross − options − every installed mod; restricted CF only for gear", () => {
    expect(vehicleCapacity({ cargo: 6, load: 70, optionCf: 0, optionLoad: 0 }, [{ cfConsumed: 1.5, loadReduction: 25 }]))
      .toMatchObject({ cargoFree: 4.5, loadFree: 45, cfUsed: 1.5, loadUsed: 25 });
    expect(vehicleCapacity({ cargo: 210, load: 200, optionCf: 200, optionLoad: 100, restrictedCf: 160 }))
      .toMatchObject({ modCfFree: 10, cargoFree: 170 });
  });
  it("build-relative mod formulas (p.118–146)", () => {
    const build = { chassisDP: 110, plantDP: 65, body: 3, pilot: 2, engineCustomDP: 100 };
    expect(modDesignDP({ rating: 2, dpFormula: "C x 1.75 x R" }, build)).toBe(385);            // Drive-by-Wire 2
    expect(modDesignDP({ dpFormula: "25 x B" }, build)).toBe(75);                               // Remote-Control Interface
    expect(modDesignDP({ dpFormula: "P x 350" }, build)).toBe(700);                             // BattleTac FDDM
    expect(modDesignDP({ rating: 3, dpFormula: "R^3 x 50" }, build)).toBe(1350);                // RAM 3
    expect(modDesignDP({ rating: 2, dpFormula: "K x (2 x R + 0.125 x R x (R - 1))" }, build)).toBe(425); // Active Thermal Masking 2
    expect(modLoad({ rating: 4, loadFormula: "B x B x 5 x R" }, build)).toBe(180);              // Standard armor 4
    expect(modCf({ rating: 7, cfFormula: "floor(0.25 x R)" }, build)).toBe(1);                  // Power amplifier 7
    expect(modDesignDP({ dpFormula: "Q x 2" }, build)).toBe(0);                                 // unknown variable: nothing
  });
  it("code review R2: upgraded Pilot, maxima and restrictions, every mount counts, bad formulas are problems", () => {
    const base = { chassisKey: "sportsCar", powerPlantKey: "gasSports" };
    const fddm = designVehicle(base, tables, { mods: [{ name: "Remote-Control Interface", modKey: "remote-control-interface", dpFormula: "25 x B" },
      { name: "Remote Pilot Advanced Programming", modKey: "remote-pilot", rating: 3, dpTable: [0, 50, 250, 1250, 5000] },
      { name: "BattleTac FDDM Receiver Module", dpFormula: "P x 350", restrictions: ["needsRemote"] }] });
    expect(fddm.dpLines.find(l => /FDDM/.test(l.label)).dp).toBe(1050);   // Pilot 3 × 350 (p.136)
    expect(fddm.valid).toBe(true);
    const codes = (r) => r.problems.map(p => p.msg).join(" | ");
    expect(codes(designVehicle(base, tables, { mods: [{ name: "RAM", rating: 4, dpFormula: "R^3 x 50", maxRating: "3" }] }))).toMatch(/over the maximum 3/);
    expect(codes(designVehicle(base, tables, { mods: [{ name: "Active Thermal Masking", rating: 1, dpFormula: "K x 2", restrictions: ["needsEngineCustom"] }] }))).toMatch(/engine customization/);
    expect(codes(designVehicle(base, tables, { mods: [{ name: "Sidecar", restrictions: ["only:bike"] }] }))).toMatch(/bike only/);
    const mounts = [{ name: "Ring Mount", mountPoints: 2 }, { name: "Old hardpoint", mountPoints: 2, design: false }];
    expect(designVehicle(base, tables, { mods: mounts }).problems.map(p => p.code)).toContain("mountPoints");   // 4 > Body 3, customization counted
    expect(codes(designVehicle(base, tables, { mods: [{ name: "Broken", dpFormula: "B x (" }] }))).toMatch(/can't be worked out/);
    // R2 round 2: masking ≤ min(2, customization levels) (p.130); the chassis' own Sensor counts for rigger adaptation (p.126).
    const masking = (levels, r) => designVehicle({ ...base, speed: 110, engineCustom: { speed: levels } }, tables,
      { mods: [{ name: "Active Thermal Masking", rating: r, maxRating: "min(2, L)", restrictions: ["needsEngineCustom"] }] });
    expect(codes(masking(1, 2))).toMatch(/over the maximum 1/);
    expect(masking(2, 2).problems.filter(p => /Masking/.test(p.msg))).toEqual([]);
    const t2 = { ...tables, chassis: { ...tables.chassis, sportsCar: { ...tables.chassis.sportsCar, sensor: 1 } } };
    const rig = [{ name: "Datajack Port", modKey: "datajack-port" }, { name: "Rigger Adaptation", restrictions: ["needsRiggerBase"] }];
    expect(designVehicle(base, t2, { mods: rig }).problems).toEqual([]);
    expect(codes(designVehicle(base, tables, { mods: rig }))).toMatch(/Sensor 1/);
    // Mechanical arms: 8,000 DP per enhancement point for 1–3, 10,000 for 4+, no cap but Strength ≤ 10 × Body (p.145).
    const arms = (r) => modDesignDP({ rating: r, dpFormula: "B x 250 + R x 8000 + min(1, max(0, R - 3)) x R x 2000" }, { body: 3 });
    expect([arms(3), arms(4), arms(11)]).toEqual([750 + 24000, 750 + 40000, 750 + 110000]);
  });
  it("customization-only mods, ¥-priced tires, and the mount-point limit (p.131)", () => {
    const base = { chassisKey: "sandBuggy", powerPlantKey: "gasBuggy" };
    expect(designVehicle(base, tables, { mods: [{ name: "Ablative Armor", designable: false }] }).problems.map(p => p.code)).toContain("notDesignable");
    const tires = designVehicle(base, tables, { mods: [{ name: "Performance tires", designNuyen: true, cost: 900 }] });
    expect([tires.dp, tires.designNuyen, tires.price]).toEqual([45, 900, 45 * 100 + 900]);
    const mounts = [{ name: "Ring Mount", mountPoints: 2 }, { name: "Fixed Mount (External Hardpoint)", mountPoints: 2 }];
    expect(designVehicle(base, tables, { mods: mounts }).problems.map(p => p.code)).toContain("mountPoints");   // 4 > Body 3
  });

  it("mods' stat effects in design: turbocharging, drive-by-wire's split +10%, armor Handling, sidecar (p.122–145)", () => {
    const base = { chassisKey: "sportsCar", powerPlantKey: "gasSports" };
    const turbo = (R) => ({ name: "Turbocharging", modKey: "turbocharging", rating: R, dpFormula: "E x 1.75 x R",
      effects: { speed: "15 x R", acceleration: "10 x R", signature: "-R", economyMult: "0.95^R" } });
    const t2 = designVehicle(base, tables, { mods: [turbo(2)] }).stats;
    expect([t2.speed, t2.acceleration, t2.signature, Math.round(t2.economy * 1e4) / 1e4]).toEqual([190, 30, 0, 5.415]);
    expect(designVehicle(base, tables, { mods: [turbo(11)] }).problems.map(p => p.code)).not.toContain("turboMax");  // 325 ≤ 337
    expect(designVehicle(base, tables, { mods: [turbo(12)] }).problems.map(p => p.code)).toContain("turboMax");      // 340 > 270 × 1.25
    const dbw = { name: "Drive-by-Wire", modKey: "drive-by-wire", rating: 1, effects: { handling: "-R", handlingOff: "-R" } };
    const armor = { name: "Standard Vehicle Armor", rating: 6, effects: { armor: "R" } };
    const r = designVehicle({ ...base, dbwSplit: { speed: 4, acceleration: 6 } }, tables, { mods: [dbw, armor] });
    expect(r.problems).toEqual([]);
    expect([r.stats.speed, r.stats.acceleration, r.stats.armor, r.stats.handling]).toEqual([166, 11, 6, { onRoad: 4, offRoad: 8 }]);
    expect(designVehicle({ ...base, dbwSplit: { speed: 5 } }, tables, { mods: [dbw] }).problems.map(p => p.code)).toContain("dbwSplit");
    const side = { name: "Sidecar", effects: { cargo: "4", handling: "1", handlingOff: "1", speed: "-15", economyMult: "0.9" } };
    const s = designVehicle({ chassisKey: "sandBuggy", powerPlantKey: "gasBuggy" }, tables, { mods: [side] }).stats;
    expect([s.cargo, s.speed, s.economy, s.handling]).toEqual([8, 75, 7.2, { onRoad: 5, offRoad: 5 }]);
  });
});

// The real, re-transcribed Rigger 2 tables (../sr2e-rigger-2/tools/data, docs/DESIGN-DATA-CHECK.md there), when that
// module is checked out next to the system (skipped in the system's own CI).
import { existsSync, readFileSync } from "node:fs";
const R2 = new URL("../../sr2e-rigger-2/tools/data/", import.meta.url);
const haveR2 = existsSync(new URL("design-chassis.json", R2));
describe.skipIf(!haveR2)("the transcribed Rigger 2 tables", () => {
  const load = (f) => JSON.parse(readFileSync(new URL(f, R2), "utf8"));
  const keyed = (rows) => Object.fromEntries(rows.map(r => [r.key, r]));
  const rules = haveR2 ? load("design-rules.json") : {};
  const real = haveR2 ? { chassis: keyed(load("design-chassis.json").chassis), powerPlants: keyed(load("design-powerplants.json").powerPlants),
    fuel: rules.fuel, markUp: rules.markUp } : {};
  it("every chassis × every power plant the table lists for it computes (Body formulas included)", () => {
    let n = 0; const bad = [];
    for (const p of Object.values(real.powerPlants)) for (const c of p.chassis) {
      const r = designVehicle({ chassisKey: c, powerPlantKey: p.key }, real);
      if (r.problems.length || !(Number.isFinite(r.dp) && r.dp > 0)) bad.push(`${c} + ${p.key}: ${r.problems.map(x => x.code).join(",")} dp=${r.dp}`);
      n++;
    }
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThan(150);
  });
  it("the worked examples on the real rows: Rich 599 before Load/Handling; Steffi 108 with her mods", () => {
    const rich = designVehicle({ chassisKey: "sportsCar", powerPlantKey: "gasoline-cars-sports-car", smartMaterials: true, acceleration: 11, speed: 151 }, real);
    expect([rich.dp, rich.stats.speed, rich.stats.acceleration]).toEqual([599, 311, 21]);
    const steffi = designVehicle({ chassisKey: "sandBuggy", powerPlantKey: "gasoline-cars-subcompact-and-sand-buggy", handling: 1,
      handlingTrack: "offRoad", acceleration: 2, cargo: 2, load: 30, markUp: { multipliers: { security: 2 } } }, real,
      { mods: [{ name: "Electronics Port", designPoints: 10, cfConsumed: 0.5 }, { name: "Ring Mount", designPoints: 10, cfConsumed: 1, loadReduction: 25 }, { name: "Pintle Mount", designPoints: 1 }] });
    expect([steffi.dp, steffi.price, steffi.stats.economy, steffi.stats.fuelSize]).toEqual([108, 21600, 8, 40]);
  });
  it("the worked examples' mods, from the generated mod items (book p.113–115)", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = new URL("../../packs-src/r2-vehicle-mods/", R2);
    const items = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8"))).map(d => [d.name, d.system]));
    const take = (name, rating) => ({ name, ...items[name], ...(rating != null ? { rating } : {}) });
    const rich = designVehicle({ chassisKey: "sportsCar", powerPlantKey: "gasoline-cars-sports-car" }, real, { mods: [
      take("Nitrous Oxide Injectors", 6), take("Datajack Port"), take("Rigger Adaptation"), take("Sensors (Vehicle Sensor System)", 2), take("Crash Cage")] });
    expect(rich.dp - 175).toBe(580);                                   // p.114: "Total Design Points = 580"
    expect([rich.budgets.cfUsed, rich.budgets.loadUsed]).toEqual([2.5, 60]);   // p.114 prints CF 2.5 (Load "90": its own items sum to 60)
    const steffi = designVehicle({ chassisKey: "sandBuggy", powerPlantKey: "gasoline-cars-subcompact-and-sand-buggy" }, real, { mods: [
      take("Roll Bars"), take("Electronics Port", 1), take("Ring Mount"), take("Pintle Mount")] });
    expect([steffi.dp - 45, steffi.budgets.cfUsed, steffi.budgets.loadUsed]).toEqual([21, 1.5, 25]);   // p.113
  });
  it("a Body-formula drone: a tracked electric Small Crawler (Body 1)", () => {
    const r = designVehicle({ chassisKey: "crawlerSmall", powerPlantKey: "electric-tracked-drone" }, real);
    expect([r.dp, r.stats.signature, r.limits.load, r.stats.fuelSize]).toEqual([115 + 5, 8, 500, 40]);
  });
});
