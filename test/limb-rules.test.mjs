// The cyberlimb model (docs/PLAN-cybertechnology-phase2.md).
import { describe, it, expect } from "vitest";
import { resolveLimbType, resolveOptionKind, limbRole, limbIdentity, limbModel, forSideRules, forLimbRules, SOURCE_LIMB, SOURCE_OPTION } from "../module/rules/limb-rules.mjs";

const SYS_ARM = Object.keys(SOURCE_LIMB).find(k => SOURCE_LIMB[k] === "arm");
const SYS_STR = Object.keys(SOURCE_OPTION).find(k => k.includes("sr2e.cyberware") && SOURCE_OPTION[k] === "strength");
const CT_STR = Object.keys(SOURCE_OPTION).find(k => k.includes("cybertechnology") && SOURCE_OPTION[k] === "strength");
const CT_DEVICE = Object.keys(SOURCE_OPTION).find(k => k.includes("cybertechnology") && SOURCE_OPTION[k] === "device");

describe("resolvers: explicit field, then rule flag, then known source, then none", () => {
  it("limb type", () => {
    expect(resolveLimbType({ limbType: "leg" }, { sr2e: { rule: "limb:arm" } }, SYS_ARM)).toEqual({ type: "leg", via: "set" });
    expect(resolveLimbType({ limbType: "" }, { sr2e: { rule: "limb:lower-leg" } }, SYS_ARM)).toEqual({ type: "lowerLeg", via: "rule" });
    expect(resolveLimbType({}, {}, SYS_ARM)).toEqual({ type: "arm", via: "source" });
    expect(resolveLimbType({ limbType: "" }, {}, null)).toEqual({ type: null, via: null });
    expect(resolveLimbType({}, { sr2e: { rule: "limb:tail" } }, null).type).toBe(null);
  });
  it("option kind, including the Cybertechnology versions without rule flags", () => {
    expect(resolveOptionKind({ limbOptionKind: "body" }, {}, SYS_STR).kind).toBe("body");
    expect(resolveOptionKind({}, { sr2e: { rule: "limb-enhancement:quickness" } }, null)).toEqual({ kind: "quickness", via: "rule" });
    expect(resolveOptionKind({}, {}, SYS_STR).kind).toBe("strength");
    expect(resolveOptionKind({}, {}, CT_STR).kind).toBe("strength");
    expect(resolveOptionKind({}, {}, CT_DEVICE).kind).toBe("device");
    expect(resolveOptionKind({}, {}, null).kind).toBe(null);
  });
  it("one membership predicate", () => {
    expect(limbRole({ limbOption: true, location: "cyberlimb" })).toBe("option");
    expect(limbRole({ location: "cyberlimb" })).toBe("limb");
    expect(limbRole({ location: "bodyware" }, { sr2e: { rule: "limb:torso" } })).toBe("limb");
    expect(limbRole({ location: "headware" })).toBe(null);
    expect(limbIdentity({ location: "cyberlimb", limbType: "hand" })).toMatchObject({ role: "limb", type: "hand", coverage: "partial" });
  });
});

const limb = (id, type, side, extra = {}) => ({ id, name: id, installed: true, system: { location: "cyberlimb", limbType: type, side, ...extra }, flags: {}, source: null });
const opt = (id, link, kind = "strength", extra = {}) => ({ id, name: id, installed: true,
  system: { location: "cyberlimb", limbOption: true, linkedLimbId: link, limbOptionKind: kind, rating: 2, cost: 300000, essenceCost: 0, ...extra }, flags: {}, source: null });

describe("limbModel", () => {
  it("a left arm and a left leg never collide; opposite arms are fine", () => {
    const m = limbModel([limb("la", "arm", "left"), limb("ll", "leg", "left"), limb("ra", "arm", "right")]);
    expect(m.conflicts).toEqual([]);
    expect(m.limbs.every(forSideRules)).toBe(true);
  });
  it("arm + forearm + hand on one side: the arm is in two groups", () => {
    const m = limbModel([limb("a", "arm", "left"), limb("f", "forearm", "left"), limb("h", "hand", "left")]);
    const arm = m.limbs.find(l => l.id === "a");
    expect(arm.conflicts.map(g => g.slot).sort()).toEqual(["arm.hand", "arm.lower"]);
    expect(m.conflicts.find(g => g.slot === "arm.hand").ids.sort()).toEqual(["a", "f", "h"]);
    expect(forLimbRules(arm)).toBe(false);
  });
  it("two torsos conflict; torso and skull never need a side", () => {
    const m = limbModel([limb("t1", "torso"), limb("t2", "torso"), limb("s", "skull")]);
    expect(m.conflicts).toHaveLength(1);
    expect(forSideRules(m.limbs.find(l => l.id === "s"))).toBe(true);
  });
  it("unknown sides never conflict: reported as unresolved overlap, and keep per-limb rules", () => {
    const m = limbModel([limb("a1", "arm", "unknown"), limb("a2", "arm", "unknown")]);
    expect(m.conflicts).toEqual([]);
    expect(m.unresolvedOverlap).toHaveLength(1);
    expect(m.limbs.every(forLimbRules)).toBe(true);
    expect(m.limbs.some(forSideRules)).toBe(false);
    expect(m.limbs[0].reasons[0]).toMatch(/set its side/);
  });
  it("unclassified limbs are reported and kept out of conflicts", () => {
    const m = limbModel([limb("x", "", "left"), limb("a", "arm", "left")]);
    expect(m.conflicts).toEqual([]);
    expect(m.limbs.find(l => l.id === "x").reasons[0]).toMatch(/limb type/);
  });
  it("options attach to installed limbs; everything else is an orphan with a reason", () => {
    const off = limb("off", "arm", "right"); off.installed = false;
    const items = [limb("a", "arm", "left"), off, { id: "w", name: "w", installed: true, system: { location: "bodyware" }, flags: {}, source: null },
      opt("o1", "a"), opt("o2", ""), opt("o3", "gone"), opt("o4", "off"), opt("o5", "w")];
    const m = limbModel(items);
    expect(m.limbs.find(l => l.id === "a").options.map(o => o.id)).toEqual(["o1"]);
    expect(Object.fromEntries(m.orphans.map(o => [o.id, o.reason]))).toEqual({
      o2: "not attached to a limb", o3: "its limb is gone", o4: "off isn't installed", o5: "w isn't a cyberlimb" });
  });
  it("options carry PREPARED values and an unresolved kind is reported", () => {
    const m = limbModel([limb("a", "arm", "left"), opt("o", "a", "", { cost: 600000, actualEssenceCost: 0.4 })]);
    const a = m.limbs[0];
    expect(a.options[0]).toMatchObject({ kind: null, cost: 600000, essence: 0.4 });
    expect(a.reasons.some(r => /set what this option adds/.test(r))).toBe(true);
  });
});
