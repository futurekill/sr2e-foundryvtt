// The Rigger 2 Vehicle List rules (docs/PLAN-vehicle-list.md), against the generated list data when the sibling module
// is checked out (CI: the synthetic cases only).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { hasDesign, listIdentity, statChanges, reconcileFactory, withListNote } from "../module/rules/vehicle-list-rules.mjs";

const LIST_FILE = "../sr2e-rigger-2/data/vehicle-list.json";
const LIST = existsSync(LIST_FILE) ? JSON.parse(readFileSync(LIST_FILE, "utf8")) : null;
const fac = (name, rating = 1, _id = name) => ({ _id, name, type: "vehicle_mod", system: { rating, custom: { state: "factory" } } });

describe("hasDesign", () => {
  it("a production vehicle has none; Workshop and legacy designs do", () => {
    expect(hasDesign({ design: { version: 1, chassisKey: "", powerPlantKey: "", improvements: { speed: 0 } } })).toBe(false);
    expect(hasDesign({ design: { version: 2 } })).toBe(true);
    expect(hasDesign({ design: { version: 1, chassisKey: "sedan" } })).toBe(true);
    expect(hasDesign({ design: { version: 1, improvements: { armor: 2 } } })).toBe(true);
  });
});

describe("reconcileFactory", () => {
  it("creates missing copies, marks matching items, leaves extras and purchases, and is idempotent", () => {
    const factory = [fac("Pintle Mount", 1, "p1"), fac("Pintle Mount", 1, "p2"), fac("Turbocharging / Superconductive Drive", 2, "t")];
    const items = [
      { _id: "a", name: "Pintle Mount", type: "vehicle_mod", system: { rating: 1, custom: { state: "" } } },
      { _id: "b", name: "Turbocharging / Superconductive Drive", type: "vehicle_mod", system: { rating: 1, custom: { state: "done", receipt: { id: "b" } } } },
    ];
    const r = reconcileFactory(items, factory);
    expect(r.mark).toEqual([{ _id: "a", rating: 1, name: "Pintle Mount" }]);
    expect(r.create.map(i => i._id)).toEqual(["p2", "t"]);   // the bought turbo is never paired
    expect(r.ambiguous).toEqual([]);
    const after = [{ ...items[0], system: { rating: 1, custom: { state: "factory" } } }, items[1], ...r.create];
    expect(reconcileFactory(after, factory)).toEqual({ create: [], mark: [], ambiguous: [] });
  });
  it("an existing item at another rating is ambiguous (the GM decides)", () => {
    const r = reconcileFactory([{ _id: "x", name: "Thermal Baffles", type: "vehicle_mod", system: { rating: 3, custom: {} } }], [fac("Thermal Baffles", 1)]);
    expect(r.ambiguous).toEqual(["Thermal Baffles"]);
    expect(r.mark).toEqual([{ _id: "x", rating: 1, name: "Thermal Baffles" }]);
  });
});

describe("statChanges / notes", () => {
  it("lists only what differs, design keys included", () => {
    const row = { system: { handling: 4, handlingOffRoad: 8, speed: 180, design: { category: "car", transport: false, traits: [] } } };
    const { changes, patch } = statChanges({ handling: 4, handlingOffRoad: 8, speed: 60, design: { category: "", transport: false, traits: [] } }, row);
    expect(changes.map(c => c.key).filter(k => ["speed", "design.category", "handling"].includes(k))).toEqual(["speed", "design.category"]);
    expect(patch["system.speed"]).toBe(180);
  });
  it("adds the list note once", () => {
    const n = "<p><em>Rigger 2 Vehicle List:</em> Rigger 2 p.155 (originally SRII).</p>";
    expect(withListNote("<p>Old.</p>", n)).toBe("<p>Old.</p>" + n);
    expect(withListNote("<p>Old.</p>" + n, n)).toBe("<p>Old.</p>" + n);
  });
});

describe.runIf(LIST)("the generated Vehicle List (Rigger 2 p.148–166)", () => {
  it("has every row and resolves the core Ford Americar by its compendium source", () => {
    expect(Object.keys(LIST.rows)).toHaveLength(169);
    const uuid = Object.entries(LIST.identity).find(([, e]) => e.name === "Ford Americar")[0];
    expect(listIdentity({ _stats: { compendiumSource: uuid } }, LIST)).toEqual({ vehicleId: "ford-americar", by: "source" });
    expect(listIdentity({ _stats: { compendiumSource: "Compendium.x.y.Actor.z" } }, LIST)).toBeNull();
  });
  it("prints the book's stat lines (p.152 Patrol-1, p.150 Halcón, p.149 Dragon)", () => {
    const p = LIST.rows["chrysler-nissan-patrol-1"].system;
    expect([p.handling, p.handlingOffRoad, p.speed, p.acceleration, p.body, p.armor, p.signature, p.cargo, p.load, p.cost]).toEqual([4, 8, 180, 10, 3, 2, 2, 11, 35, 174000]);
    const h = LIST.rows["aztechnology-halcon-ground-attack-aircraft"].system;
    expect([h.stallSpeed, h.speed, h.acceleration, h.fuelType, h.vehicleType]).toEqual([150, 1800, 80, "jetTurbine", "aircraft"]);
    expect(LIST.rows["ares-dragon"].system.cargo).toBe(95);   // printed 5/90: two spaces summed
  });
  it("gives the Patrol-1 its factored-in turbocharging 2 and thermal baffles 1 as factory equipment", () => {
    const f = LIST.rows["chrysler-nissan-patrol-1"].factory.map(i => `${i.name}@${i.system.rating}`);
    expect(f).toEqual(expect.arrayContaining(["Turbocharging / Superconductive Drive@2", "Thermal Baffles@1", "Pintle Mount@1"]));
    expect(f.filter(x => x.startsWith("Pintle")).length).toBe(2);
    expect(LIST.rows["chrysler-nissan-patrol-1"].factory.every(i => i.system.custom.state === "factory")).toBe(true);
  });
});
