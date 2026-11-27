// Treating the wounded (core p.115, p.250, p.263 rendered 2026-11-27; docs/archive/plans/PLAN-treatment.md).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { firstAidTn, medicDice, firstAidMinutes, medicalGearRule, medkitUsable, medkitEmpty, patchUsable, sameWound,
  stabilization, stabilizeRefusal, MEDKIT_DICE, traumaPatchTn } from "../module/rules/treatment-rules.mjs";

describe("firstAidTn (p.115)", () => {
  it("the table by level, with a medkit and nothing else", () => {
    expect(["Light", "Moderate", "Serious", "Deadly"].map(level => firstAidTn({ level, medkit: true }).tn)).toEqual([4, 6, 8, 10]);
  });
  it("every modifier, and the floor of 2", () => {
    const r = firstAidTn({ level: "Serious", magician: true, body: 7, conditionMod: 3, medkit: false, defaultingPenalty: 4 });
    expect(r.tn).toBe(8 + 2 - 2 + 3 + 4 + 4);
    expect(r.parts).toEqual(["magician +2", "Body -2", "conditions +3", "no medkit +4", "defaulting +4"]);
    expect(firstAidTn({ level: "Light", magician: true, waiveMagician: true, body: 12, medkit: true }).tn).toBe(2);
  });
});

describe("medicDice", () => {
  it("trained: Biotech plus passive dice", () => expect(medicDice({ biotech: 4, passive: 1, medkit: true })).toEqual({ dice: 5, penalty: 0, source: "biotech" }));
  it("untrained with a medkit: its 3 dice, no penalty (ruling)", () => {
    expect(medicDice({ biotech: 0, webDefault: { dice: 5, penalty: 2 }, medkit: true })).toEqual({ dice: MEDKIT_DICE, penalty: 0, source: "medkit" });
  });
  it("untrained without: the Skill Web default", () => {
    expect(medicDice({ biotech: 0, webDefault: { dice: 5, penalty: 2 }, medkit: false })).toEqual({ dice: 5, penalty: 2, source: "default" });
  });
});

it("first aid minutes: table time ÷ successes, at least 1", () => {
  expect([firstAidMinutes("Light", 1), firstAidMinutes("Moderate", 3), firstAidMinutes("Serious", 2), firstAidMinutes("Light", 40)]).toEqual([10, 7, 15, 1]);
});

describe("medical gear", () => {
  const item = (o = {}) => ({ system: { quantity: 1, ...o.system }, flags: o.flags ?? {}, _stats: o._stats ?? {}, name: o.name ?? "Whatever" });
  it("identity from the rule flag or the source, never the name", () => {
    expect(medicalGearRule(item({ flags: { sr2e: { rule: "medkit" } } }))).toBe("medkit");
    expect(medicalGearRule(item({ _stats: { compendiumSource: "Compendium.sr2e.gear.Item.b3f51b664d45508d" } }))).toBe("traumaPatch");
    expect(medicalGearRule(item({ name: "Medkit" }))).toBeNull();
  });
  it("a stack of two medkits with one unit used up is still usable; both used up is not", () => {
    const kit = (empty) => item({ system: { quantity: 2 }, flags: { sr2e: { rule: "medkit", medkitEmpty: empty } } });
    expect([medkitUsable(kit(0)), medkitUsable(kit(1)), medkitUsable(kit(2)), medkitEmpty(kit(5))]).toEqual([true, true, false, 2]);
  });
  it("a trauma patch at quantity 0 is kept but not usable", () => {
    expect(patchUsable(item({ system: { quantity: 0 }, flags: { sr2e: { rule: "traumaPatch" } } }))).toBe(false);
  });
  it("the pack: Street Gear prices (p.263) and the rule flags", () => {
    const dir = new URL("../packs-src/gear/", import.meta.url);
    const all = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
    const by = (rule) => all.find(d => d.flags?.sr2e?.rule === rule)?.system;
    expect([by("medkit").cost, by("medkit").weight, by("medkit").availability, by("medkit").streetIndex]).toEqual([200, 3, "2/24 hrs", 1.5]);
    expect([by("medkitSupplies").cost, by("medkitSupplies").streetIndex]).toEqual([50, 1.5]);
    expect([by("traumaPatch").cost, by("traumaPatch").availability, by("traumaPatch").streetIndex]).toEqual([500, "4/48 hrs", 4]);
  });
});

it("sameWound: boxes, overflow AND generation (a 3-box wound later is a different wound)", () => {
  expect(sameWound({ boxes: 3, overflow: 0, gen: 4 }, { boxes: 3, overflow: 0, gen: 4 })).toBe(true);
  expect(sameWound({ boxes: 3, overflow: 0, gen: 4 }, { boxes: 3, overflow: 0, gen: 6 })).toBe(false);
  expect(sameWound({ boxes: 3, overflow: 0, gen: 4 }, { boxes: 4, overflow: 0, gen: 4 })).toBe(false);
});

describe("stabilization (p.115)", () => {
  const ok = (biotech, gen = 1) => ({ kind: "stabilize", ok: true, biotech, gen });
  const fail = (biotech, gen = 1) => ({ kind: "stabilize", ok: false, biotech, gen });
  it("stable from the live clock when a bleed record exists, else from the last ok attempt on the live wound", () => {
    expect(stabilization([fail(3)], { liveGen: 1, bleedStable: "aid" }).stable).toBe(true);
    expect(stabilization([ok(3)], { liveGen: 1, bleedStable: null }).stable).toBe(false);
    expect(stabilization([ok(3)], { liveGen: 1 }).stable).toBe(true);
    expect(stabilization([ok(3)], { liveGen: 2 }).stable).toBe(false, "new damage ends it");
    expect(stabilization([ok(3), { kind: "ended" }], { liveGen: 1 }).stable).toBe(false, "the GM ended it");
  });
  it("refusals: already stable; a failed attempt allows only professional help with a better Biotech or equipment", () => {
    expect(stabilizeRefusal("stabilize", stabilization([ok(3)], { liveGen: 1 }))).toBe("already stable");
    const failed = stabilization([fail(3)], { liveGen: 1 });
    expect(stabilizeRefusal("stabilize", failed)).toMatch(/professional/);
    expect(stabilizeRefusal("professional", failed, { biotech: 3 })).toMatch(/better/);
    expect(stabilizeRefusal("professional", failed, { biotech: 4 })).toBeNull();
    expect(stabilizeRefusal("professional", failed, { biotech: 1, betterEquipped: true })).toBeNull();
    expect(stabilizeRefusal("professional", stabilization([], { liveGen: 1 }), { biotech: 6 })).toMatch(/failed attempt/);
    expect(stabilizeRefusal("trauma", failed)).toBeNull();
    expect(stabilizeRefusal("stabilize", stabilization([ok(3), { kind: "ended" }], { liveGen: 1 }))).toBeNull();
    expect(stabilizeRefusal("stabilize", stabilization([fail(3), { kind: "ended" }], { liveGen: 1 }))).toBeNull();
  });
  it("a failed trauma patch never blocks a medic's first attempt; an ok one stabilizes", () => {
    const patchFail = { kind: "trauma", ok: false, biotech: 0, gen: 1 };
    expect(stabilizeRefusal("stabilize", stabilization([patchFail], { liveGen: 1 }))).toBeNull();
    expect(stabilization([{ ...patchFail, ok: true }], { liveGen: 1 }).stable).toBe(true);
    expect(traumaPatchTn({ dermal: 2, bloodFilter: 3 })).toBe(9);
  });
});
