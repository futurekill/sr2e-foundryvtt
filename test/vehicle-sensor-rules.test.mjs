import { describe, it, expect } from "vitest";
import { sensorComponents, componentUpgradeCost, sensorTestTN, sensorResult, baseFlux, modifiedFlux, fluxRange,
  boostProblems, deviceBoost, ecmEffect, maxEffect, edEffect, ewTerm } from "../module/rules/vehicle-sensor-rules.mjs";

const dice = (...v) => v.map(total => ({ total }));

describe("sensor components (R2 p.27)", () => {
  it("bands are cumulative", () => {
    expect(sensorComponents(0).components).toEqual(["rangefinder", "ultrasound", "laserProximity"]);
    expect(sensorComponents(1).components).toContain("lowLight");
    expect(sensorComponents(1).components).not.toContain("thermographic");
    expect(sensorComponents(4).components).toContain("thermographic");
    expect(sensorComponents(4).components).not.toContain("flareCompensation");
    expect(sensorComponents(5).components).toContain("flareCompensation");
  });
  it("magnification 50 × rating, upgrades add components and levels", () => {
    expect(sensorComponents(2).magnification).toBe(100);
    const up = sensorComponents(4, { flareCompensation: { added: true }, magnification: { level: 2 } });
    expect(up.components).toContain("flareCompensation");
    expect(up.magnification).toBe(300);
  });
  it("Skyrie: 15,000¥ × .10 × 2 = 3,000¥ (p.28)", () => expect(componentUpgradeCost(15000, 2)).toBe(3000));
});

describe("Sensor Test (p.28, p.30)", () => {
  it("table modifiers, min 2", () => {
    expect(sensorTestTN({ base: 4, conditions: { directLos: true, urban: true } }).tn).toBe(3);
    expect(sensorTestTN({ base: 3, conditions: { directLos: true } }).tn).toBe(2);
    expect(sensorTestTN({ base: 2, conditions: { directLos: true } }).tn).toBe(2);
    expect(sensorTestTN({ base: 4, conditions: { tight: true }, spiritForce: 3, damageMod: 1, ewTerm: 4 }).tn).toBe(14);
  });
  it("Monkeywrench: TN 7 against Shadowstorm's Signature 3 + 4 ED (p.32)", () =>
    expect(sensorTestTN({ base: 3, ewTerm: edEffect({ edSuccesses: 4 }) }).tn).toBe(7));
  it("results table", () => {
    expect(sensorResult(0)).toBe("none");
    expect(sensorResult(3)).toBe("positive");
    expect(sensorResult(7)).toBe("features");
  });
});

describe("Flux and range (p.30–31)", () => {
  it("Flux Rating Table", () => {
    expect(baseFlux("rcDeck", 6)).toBe(2);
    expect(baseFlux("sensor", 7)).toBe(11);
    expect(baseFlux("ecm", 3)).toBe(5); // R4-1: rating × 1.5 rounded up
    expect(baseFlux("radio", 3)).toBe(3);
    expect(baseFlux("cyberware", 5)).toBe(0);
  });
  it("Josie: deck 6 (2 + amplifiers 4), high elevation, encryption, ECCM 3 → 8 → 20 km", () => {
    const { flux } = modifiedFlux({ base: 2, boost: 4, kind: "rcDeck", conditions: { highElevation: true, encryption: true }, eccm: 3 });
    expect(flux).toBe(8);
    expect(fluxRange(flux)).toBe(20000);
  });
  it("rounds down to the nearest half; encryption only radios/decks; humid air not with a storm; ECD", () => {
    expect(modifiedFlux({ base: 5, kind: "sensor", conditions: { encryption: true } }).flux).toBe(5);
    expect(modifiedFlux({ base: 5, kind: "radio", conditions: { encryption: true } }).flux).toBe(4.5);
    expect(modifiedFlux({ base: 5, conditions: { electricalStorm: true, humidAir: true } }).flux).toBe(3);
    expect(modifiedFlux({ base: 6, ecd: 2 }).flux).toBe(4);
    expect(modifiedFlux({ base: 5, eccm: 1 }).flux).toBe(4.5);
  });
  it("range table incl. 10+ and half points", () => {
    expect(fluxRange(0)).toBe(250);
    expect(fluxRange(9)).toBe(25000);
    expect(fluxRange(10)).toBe(30000);
    expect(fluxRange(12)).toBe(34000);
    expect(fluxRange(8.5)).toEqual({ low: 20000, high: 25000 });
    expect(fluxRange(-1)).toBe(null);
  });
});

describe("Flux boosts (p.30)", () => {
  const veh = { body: 4, devices: { deck: { working: true, ported: true }, sensor: { working: true, ported: true },
    ecm: { working: true, ported: false } }, amplifiers: { amp: 4 } };
  it("Josie's van: 2 to the deck and 1 each to sensors and ECM is not allowed for an unported ECM", () => {
    expect(boostProblems({ deck: { engine: 2 }, sensor: { engine: 1 } }, veh)).toEqual([]);
    expect(boostProblems({ ecm: { engine: 1 } }, veh)[0]).toMatch(/Electronics Port/);
  });
  it("per device ⌊Body ÷ 2⌋, total ≤ Body, amplifier ≤ rating", () => {
    expect(boostProblems({ deck: { engine: 3 } }, veh)[0]).toMatch(/Body ÷ 2/);
    const big = { body: 4, devices: { a: { working: true, ported: true }, b: { working: true, ported: true }, c: { working: true, ported: true } }, amplifiers: {} };
    expect(boostProblems({ a: { engine: 2 }, b: { engine: 2 }, c: { engine: 1 } }, big).some(p => /total/.test(p))).toBe(true);
    expect(boostProblems({ deck: { amplifiers: { amp: 3 } }, sensor: { amplifiers: { amp: 2 } } }, veh).some(p => /over its rating/.test(p))).toBe(true);
    expect(deviceBoost({ deck: { engine: 2, amplifiers: { amp: 2 } } }, "deck")).toBe(4);
  });
});

describe("ECM / ECCM / ED (p.31–32)", () => {
  // M.C. Jammer: 10 dice vs TN 7 → 4 successes; the copter's 8 dice vs TN 3 → 2.
  const jamDice = dice(7, 8, 9, 12, 1, 2, 3, 4, 5, 6);
  it("Jammer wins: Signature 4 → 8", () => {
    const r = ecmEffect({ jamDice, observerSensor: 7, observerSuccesses: 2 });
    expect(r.jam).toBe(4);
    expect(r.effect).toBe(4);
  });
  it("Aguilar's ECCM 3 vs 2 cancels one: 8 → 7", () =>
    expect(ecmEffect({ jamDice, observerSensor: 7, observerSuccesses: 2, eccm: { counterSuccesses: 3, jammerSuccesses: 2 } }).effect).toBe(3));
  it("the same stored roll read at another observer's Sensor Rating", () =>
    expect(ecmEffect({ jamDice, observerSensor: 3, observerSuccesses: 2 }).jam).toBe(8));
  it("targeted side wins → no jamming", () => expect(ecmEffect({ jamDice, observerSensor: 7, observerSuccesses: 5 }).effect).toBe(0));
  it("not cumulative; EW term adds ED", () => {
    expect(maxEffect([2, 4, 1])).toBe(4);
    expect(ewTerm({ ecm: [2, 4], ed: 3 })).toBe(7);
    expect(edEffect({ edSuccesses: 2, ecdSuccesses: 5 })).toBe(0);
  });
});
