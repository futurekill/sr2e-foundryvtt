// Shapeshifters — Companion pp.36–38, core pp.72, 227–229. docs/PLAN-shapeshifters.md.
import { describe, it, expect } from "vitest";
import { SHAPESHIFTER_SPECIES, SHAPESHIFTER_PRIORITIES, formModifiers, isSocialSkill, dermalDice, reconcileBuckets,
  applyDelta, regenStep, deathCheckFor, mergeDeath, killedOutright, deathRollKills, baneHit, emptyBuckets,
  weaponUsable, formWeaponsOnly } from "../module/rules/shapeshift-rules.mjs";

describe("species table (Companion p.36)", () => {
  it("bear animal form", () => {
    const f = formModifiers("bear", "animal");
    expect(f.attrs).toEqual({ body: 5, quickness: -1, strength: 5, charisma: 0, intelligence: 0, willpower: -2 });
    expect([f.reach, f.dermalDice, f.initDice]).toEqual([1, 2, 0]);
  });
  it("tiger animal form: +1 Reach, +2D6 Initiative", () => {
    const f = formModifiers("tiger", "animal");
    expect(f.attrs).toEqual({ body: 4, quickness: 1, strength: 4, charisma: 0, intelligence: -1, willpower: -2 });
    expect([f.reach, f.initDice]).toEqual([1, 2]);
  });
  it("fox human +1I +2C +1W; animal adds −2B −2S and +1D6", () => {
    expect(formModifiers("fox", "human").attrs).toMatchObject({ intelligence: 1, charisma: 2, willpower: 1, body: 0 });
    expect(formModifiers("fox", "animal")).toMatchObject({ attrs: { body: -2, strength: -2 }, initDice: 1 });
  });
  it("leopard, seal, wolf", () => {
    expect(formModifiers("leopard", "human").attrs.body).toBe(0);
    expect(formModifiers("leopard", "animal")).toMatchObject({ attrs: { body: 1, strength: 1 }, initDice: 2 });
    expect(formModifiers("seal", "animal")).toMatchObject({ attrs: { charisma: 1, body: 2, quickness: 1 }, initDice: 1 });
    expect(formModifiers("wolf", "animal")).toMatchObject({ attrs: { body: 1, quickness: 1 }, initDice: 1 });
    expect(Object.keys(SHAPESHIFTER_SPECIES)).toHaveLength(6);
  });
  it("unknown species → no modifiers", () => expect(formModifiers("", "animal").attrs.body).toBe(0));
});

describe("creation table (Companion p.36)", () => {
  it("B–E rows", () => {
    expect(SHAPESHIFTER_PRIORITIES.B).toMatchObject({ attributes: 24, skills: 30, resources: 400000, forcePoints: 35 });
    expect(SHAPESHIFTER_PRIORITIES.C).toMatchObject({ attributes: 20, skills: 24, resources: 90000, forcePoints: 25 });
    expect(SHAPESHIFTER_PRIORITIES.D).toMatchObject({ attributes: 17, skills: 20, resources: 5000, forcePoints: 15 });
    expect(SHAPESHIFTER_PRIORITIES.E).toMatchObject({ attributes: 15, skills: 17, resources: 500, forcePoints: 5 });
    expect(SHAPESHIFTER_PRIORITIES.A.race).toBe("shapeshifter");
  });
});

describe("social skills (core p.72) and dermal dice", () => {
  it("classifies by base name", () => {
    expect(isSocialSkill("Etiquette (Street)")).toBe(true);
    expect(isSocialSkill("Negotiation")).toBe(true);
    expect(isSocialSkill("English")).toBe(false);
    expect(isSocialSkill("Firearms")).toBe(false);
  });
  it("troll 1, bear animal 2, others 0", () => {
    expect(dermalDice({ race: "troll" })).toBe(1);
    expect(dermalDice({ race: "shapeshifter", species: "bear", form: "animal" })).toBe(2);
    expect(dermalDice({ race: "shapeshifter", species: "bear", form: "human" })).toBe(0);
    expect(dermalDice({ race: "human" })).toBe(0);
  });
});

describe("buckets", () => {
  it("unknown provenance goes to human (already-wounded actor)", () =>
    expect(reconcileBuckets(null, 4)).toEqual({ human: 4, animal: 0, bane: 0, drain: 0 }));
  it("over-full trims slowest first", () =>
    expect(reconcileBuckets({ human: 2, animal: 2, bane: 2, drain: 0 }, 3)).toEqual({ human: 1, animal: 2, bane: 0, drain: 0 }));
  it("an increase splits by source, the rest to the current form", () =>
    expect(applyDelta(emptyBuckets(), { before: 0, after: 5, added: { bane: 3 }, form: "animal" }))
      .toEqual({ human: 0, animal: 2, bane: 3, drain: 0 }));
  it("ordinary healing takes the heal order; regeneration takes its explicit decrements", () => {
    const b = { human: 2, animal: 2, bane: 1, drain: 1 };
    expect(applyDelta(b, { before: 6, after: 4 })).toEqual({ human: 2, animal: 2, bane: 0, drain: 0 });
    expect(applyDelta(b, { before: 6, after: 4, explicit: { animal: 2 } })).toEqual({ human: 2, animal: 0, bane: 1, drain: 1 });
  });
});

describe("regeneration (Companion p.37–38)", () => {
  it("nothing in human form", () =>
    expect(regenStep({ ...emptyBuckets(), human: 5 }, { form: "human", essence: 6 }).healed).toBe(0));
  it("animal damage heals ⌊E⌋ per turn", () =>
    expect(regenStep({ ...emptyBuckets(), animal: 9 }, { form: "animal", essence: 6 }).dec.animal).toBe(6));
  it("human damage heals ⌊E/2⌋ per turn in animal form", () =>
    expect(regenStep({ ...emptyBuckets(), human: 9 }, { form: "animal", essence: 5 }).dec.human).toBe(2));
  it("mixed origin shares one ⌊E⌋ budget", () => {
    const r = regenStep({ ...emptyBuckets(), human: 6, animal: 4 }, { form: "animal", essence: 6 });
    expect(r.dec).toMatchObject({ animal: 4, human: 2 });
    expect(r.healed).toBe(6);
  });
  it("after a survived Deadly check human damage heals at the full rate", () =>
    expect(regenStep({ ...emptyBuckets(), human: 9 }, { form: "animal", essence: 6, survived: true }).dec.human).toBe(6));
  it("silver and drain: 1 box per minute (20 turns), carried", () => {
    const b = { ...emptyBuckets(), bane: 3, drain: 3 };
    const r1 = regenStep(b, { form: "animal", essence: 6, turns: 19 });
    expect([r1.dec.bane, r1.carry]).toEqual([0, 19]);
    const r2 = regenStep(b, { form: "animal", essence: 6, turns: 1, carry: 19 });
    expect([r2.dec.bane, r2.dec.drain, r2.carry]).toEqual([1, 1, 0]);
    expect(regenStep(b, { form: "animal", essence: 6, turns: 60 }).dec).toMatchObject({ bane: 3, drain: 3 });
  });
});

describe("death (Companion p.38; core p.227)", () => {
  const full = { before: 8, after: 10, full: true };
  it("only when damage is added and the monitor is full", () => {
    expect(deathCheckFor({ kind: "character", form: "animal", before: 5, after: 8, full: false })).toBeNull();
    expect(deathCheckFor({ kind: "character", form: "animal", before: 10, after: 9, full: true })).toBeNull();
    expect(deathCheckFor({ kind: "character", form: "animal", before: 10, after: 10, full: true })).toBeNull();
    expect(deathCheckFor({ kind: "npc", before: 10, after: 11, full: true }).diesOn).toBe(1);   // more damage while down
  });
  it("PC: human form → standard rules; animal → dies on 1", () => {
    expect(deathCheckFor({ kind: "character", form: "human", ...full })).toBeNull();
    expect(deathCheckFor({ kind: "character", form: "animal", ...full, buckets: { ...emptyBuckets(), animal: 10 } }).diesOn).toBe(1);
  });
  it("PC: drain → 1–2; silver + other → 1–2; all silver → standard rules", () => {
    expect(deathCheckFor({ kind: "character", form: "animal", ...full, added: { drain: 2 }, buckets: { ...emptyBuckets(), drain: 2, animal: 8 } }).diesOn).toBe(2);
    expect(deathCheckFor({ kind: "character", form: "animal", ...full, buckets: { ...emptyBuckets(), bane: 3, animal: 7 } }).diesOn).toBe(2);
    expect(deathCheckFor({ kind: "character", form: "animal", ...full, buckets: { ...emptyBuckets(), bane: 10 } })).toBeNull();
  });
  it("NPC → dies on 1 in any form", () => expect(deathCheckFor({ kind: "npc", ...full }).diesOn).toBe(1));
  it("merge keeps the worse odds", () => {
    expect(mergeDeath({ diesOn: 1, why: "a" }, { diesOn: 2, why: "b" })).toMatchObject({ diesOn: 2, why: "b" });
    expect(mergeDeath({ diesOn: 2, why: "a" }, { diesOn: 1, why: "b" })).toMatchObject({ diesOn: 2, why: "a" });
  });
  it("Body + 10 kills; the roll", () => {
    expect(killedOutright(14, 4)).toBe(true);
    expect(killedOutright(13, 4)).toBe(false);
    expect(deathRollKills(2, 2)).toBe(true);
    expect(deathRollKills(2, 1)).toBe(false);
  });
});

describe("silver on a hit", () => {
  it("+2 Power, +1 Damage Level, capped at D (core p.229 example: 2L wood club → 2M)", () => {
    expect(baneHit(4, "L")).toEqual({ power: 6, level: "M" });
    expect(baneHit(9, "D")).toEqual({ power: 11, level: "D" });
  });
});

describe("weaponUsable — NPC forms (core p.234, Companion p.36)", () => {
  const forms = [{ key: "wolf" }];
  const untagged = { form: "" }, wolf = { form: "wolf" };
  const npc = (o) => ({ forms, activeForm: "", shapeshifter: { enabled: false }, ...o });
  it("untagged weapon: printed form yes, shapeshifter's animal form no", () => {
    expect(weaponUsable("npc", npc({ shapeshifter: { enabled: true } }), untagged)).toBe(true);
    expect(weaponUsable("npc", npc({ shapeshifter: { enabled: true }, activeForm: "wolf" }), untagged)).toBe(false);
  });
  it("a non-shapeshifter NPC keeps untagged weapons in every form", () =>
    expect(weaponUsable("npc", npc({ activeForm: "wolf" }), untagged)).toBe(true));
  it("tagged weapon only in its form; an orphan tag stays refused with no forms", () => {
    expect(weaponUsable("npc", npc({ activeForm: "wolf" }), wolf)).toBe(true);
    expect(weaponUsable("npc", npc({}), wolf)).toBe(false);
    expect(weaponUsable("npc", npc({ forms: [] }), wolf)).toBe(false);
  });
  it("formWeaponsOnly: shifted NPC shapeshifter or character in animal form", () => {
    expect(formWeaponsOnly("npc", npc({ shapeshifter: { enabled: true }, activeForm: "wolf" }))).toBe(true);
    expect(formWeaponsOnly("npc", npc({ shapeshifter: { enabled: true }, activeForm: "gone" }))).toBe(false);
    expect(formWeaponsOnly("character", { race: "shapeshifter", shapeshifter: { species: "wolf", form: "animal" } })).toBe(true);
  });
});
