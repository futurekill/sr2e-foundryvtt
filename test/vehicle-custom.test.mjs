// Vehicle customization (Rigger 2 p.118–146; docs/PLAN-vehicle-customization.md): quotes, maxima, time, capacity.
import { describe, it, expect } from "vitest";
import { customizationQuote, installTime, vehicleTraits, specFormula, installSkills } from "../module/rules/vehicle-custom.mjs";
import { vehicleCapacity } from "../module/rules/vehicle-design.mjs";

const car = (extra = {}) => ({ traits: vehicleTraits({ category: "car" }), body: 3, cost: 50000, plantCost: null,
  effective: { handling: 4, handlingOffRoad: 8, armor: 0, speed: 160 }, speedPreTurbo: 160, items: [], cargoFree: 10, loadFree: 500, ...extra });
const turbo = { name: "Turbocharging", modKey: "turbocharging", stack: "levels", effects: { speed: "15 x R" },
  custom: { formulas: { partsCost: "V x 1.1 x R", tn: "R1 + 2", "tn@drone": "R1 + 3", "tn@hovercraft": "R1 + 3", baseTime: "8 x R" },
    max: { basis: "stat:speed", value: "S0 x 1.5", round: "down", minOneLevel: true }, market: [{ availability: "6/12 days", streetIndex: 1.5 }],
    skills: ["vehicleBR"], equipment: "Vehicle facility" } };

describe("customization quotes (p.119–146)", () => {
  it("turbocharging: ¥ = original cost × 1.1 per level; TN = levels + 2 (ground), + 3 (drones); time 8 h per level (p.122)", () => {
    const q = customizationQuote(turbo, 2, car());
    expect([q.ok, q.price, q.tn, q.baseTime, q.availability, q.streetIndex]).toEqual([true, 110000, 4, 16, "6/12 days", 1.5]);
    const drone = customizationQuote(turbo, 1, car({ traits: vehicleTraits({ category: "car", drone: true }) }));
    expect(drone.tn).toBe(4);
  });
  it("the maximum counts the levels already there, design included (p.120); turbo up to Speed × 1.5, always 1 level", () => {
    const have = [{ ...turbo, rating: 3, custom: { ...turbo.custom, state: "" } }];
    // 160 × 1.5 = 240: 3 + 2 = 5 levels → 160 + 75 = 235 fits; 3 + 3 = 6 → 250 doesn't.
    expect(customizationQuote(turbo, 2, car({ items: have })).ok).toBe(true);
    expect(customizationQuote(turbo, 3, car({ items: have })).problems.join()).toMatch(/maximum is 240/);
    // A slow vehicle (Speed 20: × 1.5 = 30) can still take one level (+15 → 35).
    expect(customizationQuote(turbo, 1, car({ speedPreTurbo: 20, effective: { speed: 20 } })).ok).toBe(true);
  });
  it("an unknown input blocks the purchase, never 0: engine customization needs the power plant cost (ruling 8)", () => {
    const ec = { name: "Engine Customization (Speed)", modKey: "engine-custom-speed", custom: { formulas: { partsCost: "N x (1.25 + 0.15 x R0) x R" } } };
    expect(customizationQuote(ec, 1, car()).problems.join()).toMatch(/power plant cost/);
    expect(customizationQuote(ec, 1, car({ plantCost: 20000 })).price).toBe(25000);
  });
  it("per-class prices: off-road suspension cars × 1.35, bikes × 1.2, transports/tractors × 1.5 (p.125)", () => {
    const ors = { name: "Off-Road Suspension", modKey: "off-road-suspension", custom: { formulas: { partsCost: "V x 1.35 x R", "partsCost@bike": "V x 1.2 x R", "partsCost@transport": "V x 1.5 x R", "partsCost@tractor": "V x 1.5 x R" } } };
    expect(customizationQuote(ors, 1, car()).price).toBe(67500);
    expect(customizationQuote(ors, 1, car({ traits: vehicleTraits({ category: "car", transport: true }) })).price).toBe(75000);
    expect(specFormula(ors, "partsCost", vehicleTraits({ category: "bike" }))).toBe("V x 1.2 x R");
  });
  it("room: CF and Load must be free (p.118); a design-only mod can't be customized", () => {
    const c = { name: "Crane", custom: { formulas: { partsCost: "100", cf: "35" } } };
    expect(customizationQuote(c, 1, car()).problems.join()).toMatch(/needs 35 CF/);
    expect(customizationQuote({ name: "SA", custom: { customizable: false, formulas: { partsCost: "1" } } }, 1, car()).ok).toBe(false);
  });
  it("armor's TN uses the DESIRED rating: A1 = current Armor + the points added (p.127)", () => {
    const armor = { name: "Concealed Armor", modKey: "concealed-armor", effects: { armor: "R" }, custom: { formulas: { partsCost: "2000 x R", tn: "ceil(A1 / 3)" } } };
    expect(customizationQuote(armor, 4, car({ effective: { armor: 3, speed: 160 } })).tn).toBe(3);   // 7 ÷ 3 rounded up
  });
});

describe("installation (p.118, p.124; ruling 10)", () => {
  it("time = base ÷ successes; several tests: the lowest count, drive-by-wire sums; a failed test, no time", () => {
    expect(installTime(80, [{ successes: 4 }])).toBe(20);
    expect(installTime(480, [{ successes: 2 }, { successes: 3 }, { successes: 1 }])).toBe(480);
    expect(installTime(480, [{ successes: 2 }, { successes: 3 }, { successes: 1 }], "sum")).toBe(80);
    expect(installTime(80, [{ successes: 2 }, { successes: 0 }])).toBeNull();
  });
  it("skill tokens map to the vehicle's B/R skill", () => {
    expect(installSkills(["vehicleBR", "electronicsBR"], vehicleTraits({ category: "boat" }))).toEqual(["Boats (B/R)", "Electronics (B/R)"]);
    expect(installSkills(["vehicleBR"], vehicleTraits({ category: "rotor" }))).toEqual(["Aircraft (B/R)"]);
  });
});

describe("capacity by origin (plan C2.4)", () => {
  it("a customized item uses its customization CF; a levels family's fixed part counts once", () => {
    const concealed = (R, state) => ({ name: "Concealed", modKey: "concealed-armor", stack: "levels", rating: R, cfPerLevel: 2, custom: { state, formulas: { cf: "3 x R" } } });
    // design 2 points × 2 CF + customized 1 point × 3 CF = 7 (p.127)
    expect(vehicleCapacity({ cargo: 20 }, [concealed(2, ""), concealed(1, "done")]).cfUsed).toBe(7);
    const nitro = (R, state) => ({ name: "Nitrous", modKey: "nitrous", stack: "levels", rating: R, cfConsumed: 1.5, custom: { state, formulas: { cf: "2" } } });
    // design nitrous 1.5 CF (fixed) + a customized level: fixed part once, per-level 0 → 1.5
    expect(vehicleCapacity({ cargo: 20 }, [nitro(2, ""), nitro(1, "done")]).cfUsed).toBe(1.5);
    expect(vehicleCapacity({ cargo: 20 }, [nitro(1, "done")]).cfUsed).toBe(2);   // customized first: 2 CF (p.121)
  });
});

// The generated Rigger 2 mods (../sr2e-rigger-2/packs-src), when that module is checked out next to the system.
import { existsSync, readdirSync, readFileSync } from "node:fs";
const PACK = new URL("../../sr2e-rigger-2/packs-src/r2-vehicle-mods/", import.meta.url);
const havePack = existsSync(PACK);
const item = (name) => {
  const f = readdirSync(PACK).find(f => f.endsWith(".json") && JSON.parse(readFileSync(new URL(f, PACK), "utf8")).name === name);
  const d = JSON.parse(readFileSync(new URL(f, PACK), "utf8"));
  return { ...d.system, name: d.name };
};
describe.skipIf(!havePack)("the Rigger 2 mods' customization data (book p.120–146)", () => {
  it("every customizable mod with a price quotes on a plain car (no unworkable formula)", () => {
    const v = car({ plantCost: 20000, engineCustomCost: 25000, cargoFree: 999, loadFree: 99999 });
    const bad = [];
    for (const f of readdirSync(PACK).filter(f => f.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(new URL(f, PACK), "utf8"));
      if (d.system.custom?.customizable === false || !Object.keys(d.system.custom?.formulas ?? {}).length && !d.system.custom?.market?.length) continue;   // printed without specs
      const q = customizationQuote({ ...d.system, name: d.name }, 1, v);
      if (q.problems.some(p => /worked out|no customization price/.test(p))) bad.push(`${d.name}: ${q.problems.join("; ")}`);
    }
    expect(bad).toEqual([]);
  });
  it("examples: turbocharging 2 on a 50,000¥ car; Datajack port on a bike; ECM 8 = 7.5M¥ (ruling 11); rigger adaptation 2,800¥ (ruling 13)", () => {
    expect(customizationQuote(item("Turbocharging / Superconductive Drive"), 2, car()).price).toBe(110000);
    const bike = car({ traits: vehicleTraits({ category: "bike" }) });
    const dj = customizationQuote(item("Datajack Port"), 1, bike);
    expect([dj.price, dj.baseTime, dj.tn]).toEqual([5000, 112, 8]);
    const ecm = customizationQuote(item("Electronic Countermeasures (ECM)"), 8, car({ cargoFree: 99, loadFree: 999 }));
    expect([ecm.price, ecm.cf, ecm.load, ecm.restricted, ecm.baseTime]).toEqual([7500000, 12, 150, "military", 128]);
    expect(customizationQuote(item("Rigger Adaptation"), 1, car()).price).toBe(2800);
    expect(customizationQuote(item("Nitrous Oxide Injectors"), 4, car()).price).toBe(3 * 3500 + 7000);
  });
});

import { applyModEffects } from "../module/rules/vehicle-design.mjs";
describe("customization review C3 (round 1)", () => {
  it("#15 a winch's Load Rating is held to the Winch Capacity Table by Body (p.146)", () => {
    const winch = { name: "Winch", custom: { formulas: { partsCost: "R x 75" }, max: { byBody: [5, 25, 200, 750, 2000], beyond: "B x B x 750" } } };
    expect(customizationQuote(winch, 1000, car({ body: 1 })).problems.join()).toMatch(/maximum 25 for Body 1/);
    expect(customizationQuote(winch, 25, car({ body: 1 })).ok).toBe(true);
    expect(customizationQuote(winch, 75 * 12 * 12, car({ body: 12 })).ok).toBe(true);   // past the table: Body × Body × 750
  });
  it("#14 the Speed maximum doesn't depend on batching: the family is left out of the base, a design option's levels counted once", () => {
    const ec = { name: "Engine Customization (Speed)", modKey: "engine-custom-speed", effects: { speed: "30 x R" },
      custom: { formulas: { partsCost: "1" }, max: { basis: "stat:speed", value: "S0 x 1.5", round: "down" } } };
    // Speed 100 without the family: × 1.5 = 150, so 1 level (130) fits, 2 (160) don't, however they're bought.
    const without = () => 100;
    expect(customizationQuote(ec, 2, car({ statWithout: without })).ok).toBe(false);
    const oneThere = car({ statWithout: without, items: [{ ...ec, rating: 1, custom: { ...ec.custom, state: "done" } }] });
    expect(customizationQuote(ec, 1, oneThere).ok).toBe(false);
    // A design option's level is already in the stored speed (130): its 30 isn't counted twice.
    expect(customizationQuote(ec, 1, car({ statWithout: () => 130, synthetic: { "engine-custom-speed": 1 } })).ok).toBe(false);
    expect(customizationQuote(ec, 0, car({ statWithout: () => 100 })).R).toBe(1);
  });
  it("#13 capacity reads a customization's per-class CF (a door-gun ring mount takes 16 CF on a rotorcraft, p.134)", () => {
    const ring = { name: "Ring Mount", rating: 0, custom: { state: "done", formulas: { cf: "1", "cf@rotor": "16" } } };
    expect(vehicleCapacity({ cargo: 30 }, [ring], { traits: new Set(["rotor"]) }).cfUsed).toBe(16);
    expect(vehicleCapacity({ cargo: 30 }, [ring], { traits: new Set(["car"]) }).cfUsed).toBe(1);
  });
  it("#9 a family's effects come from the item that carries them (a synthetic factory item may carry none)", () => {
    const base = { speed: 100, acceleration: 10, load: 500, cargo: 3, armor: 0, signature: 2, economy: 6 };
    const factory = { name: "EC (Load)", modKey: "engine-custom-load", stack: "levels", rating: 1, custom: { state: "factory" } };
    const bought = { name: "EC (Load)", modKey: "engine-custom-load", stack: "levels", rating: 1, effects: { load: "B x 50 x R" }, custom: { state: "done" } };
    expect(applyModEffects(base, [factory, bought], { build: { body: 3 } }).stats.load).toBe(650);
  });
});
