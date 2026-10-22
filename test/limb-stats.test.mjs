// The cyberlimb rules (docs/PLAN-cybertechnology-phase3.md; Cybertechnology pp.31, 49–52).
import { describe, it, expect } from "vitest";
import { limbModel } from "../module/rules/limb-rules.mjs";
import { limbStats, selectOptions, lacingArmor, limbEssence, limbOptionPrice, placementFacts,
         IN_LIMB_ESSENCE, OUTSIDE_LIMB_ESSENCE } from "../module/rules/limb-stats.mjs";

const limb = (id, type, side = "none") => ({ id, name: id, installed: true, system: { location: "cyberlimb", limbType: type, side }, flags: {}, source: null });
const opt = (id, link, kind, rating) => ({ id, name: id, installed: true,
  system: { location: "cyberlimb", limbOption: true, linkedLimbId: link, limbOptionKind: kind, rating, cost: 0, essenceCost: 0 }, flags: {}, source: null });
const stats = (items, ctx = {}) => limbStats(limbModel(items), { naturalStrength: 3, naturalQuickness: 3, naturalBody: 3, quicknessCapBase: 3, ...ctx });

describe("Strength (p.50–51)", () => {
  it("the book's average: arms 3 and 5, legs 4 and 7 → 4; lead with the 5 arm at +1", () => {
    const s = stats([limb("la", "arm", "left"), limb("ra", "arm", "right"), opt("s1", "ra", "strength", 2),
      limb("ll", "leg", "left"), opt("s2", "ll", "strength", 4), limb("rl", "leg", "right"), opt("s3", "rl", "strength", 1)],
      { naturalBody: 6 });
    // positions: left arm 3, right arm 5, left leg 7, right leg 4
    expect(s.avgStrength).toBe(4);
    expect(s.leadWith.find(l => l.key === "arm.right")).toMatchObject({ strength: 5, tn: 1 });
    expect(s.leadWith.find(l => l.key === "leg.left")).toMatchObject({ strength: 7, tn: 3 });
  });
  it("one unenhanced cyberarm lowers a Str 6 character to 5, and the natural limbs can lead", () => {
    const s = stats([limb("a", "arm", "left")], { naturalStrength: 6, naturalBody: 6 });
    expect(s.avgStrength).toBe(5);
    expect(s.leadWith.map(l => l.key).sort()).toEqual(["arm.right", "leg.left", "leg.right"]);
  });
  it("caps: Body 3 → 6; troll Body 9 → 13 (reported)", () => {
    const four = (r) => [limb("la", "arm", "left"), opt("a", "la", "strength", r), limb("ra", "arm", "right"), opt("b", "ra", "strength", r),
      limb("ll", "leg", "left"), opt("c", "ll", "strength", r), limb("rl", "leg", "right"), opt("d", "rl", "strength", r)];
    const h = stats(four(6), { naturalBody: 3 });
    expect(h.avgStrength).toBe(6);
    expect(h.caps[0]).toMatchObject({ attr: "strength", was: 9, cap: 6 });
    expect(stats(four(6), { naturalBody: 9, troll: true }).avgStrength).toBe(13);   // 14 capped
  });
  it("a troll's cyberlimb starts at 8", () => {
    expect(stats([limb("a", "arm", "left")], { naturalStrength: 8, troll: true, naturalBody: 9 }).avgStrength).toBe(8);
  });
  it("no full cyber position: nothing replaces the attributes", () => {
    const s = stats([limb("h", "hand", "left")]);
    expect(s.anyCyber).toBe(false);
    expect(s.avgStrength).toBe(null);
  });
});

describe("Quickness (p.51)", () => {
  it("caps: Quickness 3 → 6, elf 9 → 13; Reaction average uses the exemption-free baseline", () => {
    const items = [limb("la", "arm", "left"), opt("q", "la", "quickness", 6)];
    expect(stats(items, { naturalQuickness: 3, quicknessCapBase: 3 }).avgQuickness).toBe(4);
    const all = ["la", "ra", "ll", "rl"].flatMap((id, i) => [limb(id, i < 2 ? "arm" : "leg", i % 2 ? "right" : "left"), opt(`q${i}`, id, "quickness", 6)]);
    expect(stats(all, { naturalQuickness: 3, quicknessCapBase: 3 }).avgQuickness).toBe(6);
    expect(stats(all, { naturalQuickness: 9, quicknessCapBase: 9 }).avgQuickness).toBe(13);
    // natural Q3 + Muscle Replacement +2 = 5, four unenhanced cyberlimbs: Reaction sees 3
    const plain = ["la", "ra", "ll", "rl"].map((id, i) => limb(id, i < 2 ? "arm" : "leg", i % 2 ? "right" : "left"));
    const r = stats(plain, { naturalQuickness: 5, reactionExemptQuickness: 2, quicknessCapBase: 3 });
    expect(r.avgQuickness).toBe(5);
    expect(r.avgQuicknessReaction).toBe(3);
  });
  it("pair mismatch: the differences, cumulative across arms and legs", () => {
    const s = stats([limb("la", "arm", "left"), opt("a", "la", "quickness", 2), limb("ra", "arm", "right"),
      limb("ll", "leg", "left"), opt("b", "ll", "quickness", 1), limb("rl", "leg", "right"), opt("c", "rl", "quickness", 3)]);
    expect(s.coordinationTN).toBe(2 + 2);
  });
});

describe("Body, unarmed Power, bone lacing (p.49–51)", () => {
  it("a pair of arms and a pair of legs: +2; full Body enhancements: +6 more", () => {
    const base = [limb("la", "arm", "left"), limb("ra", "arm", "right"), limb("ll", "leg", "left"), limb("rl", "leg", "right")];
    expect(stats(base).pairBody).toBe(2);
    expect(stats([...base, opt("b1", "la", "body", 3), opt("b2", "rl", "body", 3)]).pairBody).toBe(8);
  });
  it("one Body item per pair: a second is rejected; outside a pair it's rejected", () => {
    const m = limbModel([limb("la", "arm", "left"), limb("ra", "arm", "right"), opt("b1", "la", "body", 1), opt("b2", "ra", "body", 2),
      limb("ll", "leg", "left"), opt("b3", "ll", "body", 1)]);
    const s = limbStats(m, { naturalStrength: 3, naturalQuickness: 3, naturalBody: 3 });
    expect(s.pairBody).toBe(3);
    const rej = selectOptions(m).rejected.map(r => r.id).sort();
    expect(rej).toEqual(["b1", "b3"]);
  });
  it("partial limbs add no Body; a pair needs known opposite sides", () => {
    expect(stats([limb("a", "hand", "left"), limb("b", "hand", "right")]).pairBody).toBe(0);
    expect(stats([limb("a", "arm", "unknown"), limb("b", "arm", "unknown")]).pairBody).toBe(0);
  });
  it("hands/feet: one +1, two +2, three +2; a full arm has its hand; a forearm doesn't", () => {
    expect(stats([limb("h", "hand", "left")]).handPower).toBe(1);
    expect(stats([limb("h", "hand", "left"), limb("f", "foot", "right")]).handPower).toBe(2);
    expect(stats([limb("h", "hand", "left"), limb("f", "foot", "right"), limb("a", "arm", "right")]).handPower).toBe(2);
    expect(stats([limb("f", "forearm", "left")]).handPower).toBe(0);
    expect(stats([limb("a", "arm", "unknown")]).handPower).toBe(1);   // per-limb rule: unknown side is fine
  });
  it("bone lacing: complete replacements only; 2 keep, 3 −1, 4 lose all", () => {
    const s = stats([limb("a", "arm", "left"), limb("t", "torso"), limb("h", "hand", "right"), limb("f", "foot", "right")]);
    expect(s.laceReplacements).toBe(2);
    expect([2, 3, 4].map(n => lacingArmor(3, n))).toEqual([3, 2, 0]);
  });
  it("conflicted limbs are out of every rule", () => {
    const s = stats([limb("a", "arm", "left"), limb("h", "hand", "left")]);
    expect(s.handPower).toBe(0);
    expect(s.anyCyber).toBe(false);
  });
});

describe("Essence (p.49, p.52, p.31, p.37)", () => {
  const e = (kind, rating, place) => limbEssence({ sys: { rating, essenceCost: 0 }, kind }, { inLimb: true, counted: true, ...place });
  it("enhancement tiers on a full limb: Strength .4/pt over 3, Quickness .3/pt over 3", () => {
    expect([1, 3, 4, 6].map(r => e("strength", r, { limbType: "arm" }))).toEqual([0, 0, 0.4, 1.2]);
    expect(e("quickness", 5, { limbType: "leg" })).toBe(0.6);
  });
  it("trolls pay for every Strength point; a cybertorso halves (round up)", () => {
    expect(e("strength", 2, { limbType: "arm", troll: true })).toBe(0.8);
    expect(e("quickness", 4, { limbType: "arm", torso: true })).toBe(0.15);
  });
  it("hand/foot/lower-limb Strength: no Essence, any race", () => {
    expect(e("strength", 3, { limbType: "hand", troll: true })).toBe(0);
  });
  it("Compatibility table and cyberguns", () => {
    const src = Object.keys(IN_LIMB_ESSENCE).find(k => k.includes("9u59mch2668dn9ds"));   // Spur
    expect(limbEssence({ sys: { essenceCost: 0.1 }, source: src }, { inLimb: true })).toBe(0);
    expect(limbEssence({ sys: { essenceCost: 0.1 }, source: src }, { inLimb: false })).toBe(null);
    expect(limbEssence({ sys: { essenceCost: 3.5, isTacticalComputer: true } }, { inLimb: true })).toBe(2.62);
    const gun = Object.keys(OUTSIDE_LIMB_ESSENCE).find(k => k.includes("5744e70a42e4efb4"));
    expect(limbEssence({ sys: { essenceCost: 0 }, source: gun }, { inLimb: false })).toBe(0.35);
    expect(limbEssence({ sys: { essenceCost: 0 }, source: gun }, { inLimb: true })).toBe(0);
    expect(limbEssence({ sys: { essenceInLimb: 0.05, essenceCost: 1 } }, { inLimb: true })).toBe(0.05);
  });
});

describe("Price (p.31, p.51) and recorded placement", () => {
  it("partial limbs: hand 65,000/pt (max 3); lower arm 120,000, or 60,000 next to an enhanced hand", () => {
    expect(limbOptionPrice({ rating: 4, costPerRating: 150000 }, "strength", "hand")).toBe(195000);
    expect(limbOptionPrice({ rating: 2, costPerRating: 150000 }, "strength", "forearm")).toBe(240000);
    expect(limbOptionPrice({ rating: 2, costPerRating: 150000, limbAdjacent: true }, "strength", "forearm")).toBe(120000);
    expect(limbOptionPrice({ rating: 2, cost: 300000 }, "strength", "arm")).toBe(300000);
  });
  it("+10% only when recorded", () => {
    expect(limbOptionPrice({ rating: 1, cost: 90000, limbSurcharge: true }, "quickness", "arm")).toBe(99000);
    expect(limbOptionPrice({ rating: 1, cost: 2500, limbSurcharge: true }, "smartlink", "arm")).toBe(2500);
  });
  it("placement facts: a second type surcharges; the first doesn't; adjacency by side", () => {
    const sib = [{ id: "a", limbType: "arm", side: "left" }, { id: "s", kind: "strength", linkedLimbId: "a" },
      { id: "f", limbType: "forearm", side: "right" }, { id: "h", limbType: "hand", side: "right" },
      { id: "hs", kind: "strength", linkedLimbId: "h" }];
    expect(placementFacts("quickness", "a", sib).limbSurcharge).toBe(true);
    expect(placementFacts("strength", "a", sib).limbSurcharge).toBe(false);
    expect(placementFacts("strength", "f", sib).limbAdjacent).toBe(true);
    expect(placementFacts("strength", "", sib)).toEqual({ limbSurcharge: false, limbAdjacent: false });
  });
});
