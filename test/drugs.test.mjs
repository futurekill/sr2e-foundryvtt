import { describe, it, expect } from "vitest";
import { drugDuration, toxinLevel } from "../module/rules/sr2e-rules.mjs";

describe("drug durations (Shadowtech p.98–100)", () => {
  it("Kamikaze 10 × 1D6 minutes is the rolled value", () => {
    expect(drugDuration({ minutes: "10*1d6" }, { rolled: 40 })).toEqual({ minutes: 40 });
  });
  it("Hyper 60 minutes − 5 per Body success, floored at 0", () => {
    expect(drugDuration({ minutes: 60, bodyReducesBy: 5 }, { successes: 3 })).toEqual({ minutes: 45 });
    expect(drugDuration({ minutes: 60, bodyReducesBy: 5 }, { successes: 20 })).toEqual({ minutes: 0 });
  });
  it("MAO 10 turns − Body successes", () => {
    expect(drugDuration({ turns: 10, bodyReducesBy: 1 }, { successes: 4 })).toEqual({ turns: 6 });
  });
  it("no duration → null", () => expect(drugDuration(null)).toBeNull());
});

describe("toxin resistance staging (p.112)", () => {
  it("5D: 2 → S, 4 → M, 6 → L, 8 → none", () => {
    expect(toxinLevel("D", 1)).toBe("D");
    expect(toxinLevel("D", 2)).toBe("S");
    expect(toxinLevel("D", 4)).toBe("M");
    expect(toxinLevel("D", 6)).toBe("L");
    expect(toxinLevel("D", 8)).toBeNull();
  });
});

describe("drug packs count once in character creation", async () => {
  const { chargenItemCost } = await import("../module/rules/sr2e-rules.mjs");
  it("a six-dose inhaler bought for 100¥ counts 100¥, not 600¥", () => {
    expect(chargenItemCost({ type: "gear", drug: true, cost: 100, quantity: 6, acquiredListValue: 100 })).toBe(100);
    expect(chargenItemCost({ type: "gear", drug: true, cost: 100, quantity: 6 })).toBe(100);
    expect(chargenItemCost({ type: "gear", cost: 100, quantity: 6 })).toBe(600);
  });
});

import { drugDamage, drugTnFor, halveBonus, knockdownThreshold, knockdownOutcome, knockdownPrompt, damageUpdateFor } from "../module/rules/sr2e-rules.mjs";

describe("drugDamage — Kamikaze absorption, Hyper overload (Shadowtech p.98–99)", () => {
  const A = (left, id = "a") => ({ id, left });
  it("absorbs the first boxes, then damage lands", () => {
    expect(drugDamage({ amount: 5, absorbers: [A(4)] })).toMatchObject({ landed: 1, absorbed: 4, absorbUsed: { a: 4 } });
    expect(drugDamage({ amount: 3, absorbers: [A(4)] })).toMatchObject({ landed: 0, absorbed: 3, absorbUsed: { a: 3 } });
  });
  it("uses absorbers oldest first", () => {
    expect(drugDamage({ amount: 5, absorbers: [A(2, "old"), A(4, "new")] }).absorbUsed).toEqual({ old: 2, new: 3 });
  });
  it("overload is half what LANDED, rounded up, as Stun", () => {
    expect(drugDamage({ amount: 6, overload: true }).overloadStun).toBe(3);
    expect(drugDamage({ amount: 3, overload: true }).overloadStun).toBe(2);
    expect(drugDamage({ amount: 5, absorbers: [A(4)], overload: true })).toMatchObject({ landed: 1, overloadStun: 1 });
    expect(drugDamage({ amount: 3, absorbers: [A(4)], overload: true }).overloadStun).toBe(0);
  });
  it("overload Stun spills into Physical like any Stun", () => {
    const mon = { physical: { value: 0, max: 10 }, stun: { value: 9, max: 10 }, overflow: 0 };
    expect(damageUpdateFor(mon, "stun", 2)).toMatchObject({ stun: 10, physical: 1 });
  });
});

describe("drugTnFor (Shadowtech p.96, p.98)", () => {
  const HYPER = { all: 1, spell: 4 };
  const ATRO = { active: 1, meleeClose: 1, knowledge: 2, language: 2, build_repair: 2, technical: 2, magic: 2 };
  it("Hyper: +1 on everything, +5 on a spell", () => {
    expect(drugTnFor([HYPER], {})).toBe(1);
    expect(drugTnFor([HYPER], { kind: "skill", skillCategory: "active" })).toBe(1);
    expect(drugTnFor([HYPER], { kind: "spell", magic: true })).toBe(5);
  });
  it("Atropine by skill", () => {
    expect(drugTnFor([ATRO], { kind: "attack", skillCategory: "active", closeRange: true })).toBe(2);
    expect(drugTnFor([ATRO], { kind: "attack", skillCategory: "active" })).toBe(1);
    expect(drugTnFor([ATRO], { kind: "attack", skillCategory: "active", melee: true })).toBe(2);
    expect(drugTnFor([ATRO], { kind: "skill", skillCategory: "knowledge" })).toBe(2);
    expect(drugTnFor([ATRO], { kind: "skill", key: "sorcery", magic: true })).toBe(2);
    expect(drugTnFor([ATRO], { kind: "skill", key: "computer", skillCategory: "active" })).toBe(2);
    expect(drugTnFor([ATRO], { kind: "spell", magic: true })).toBe(2);
    expect(drugTnFor([ATRO], { kind: "resist" })).toBe(0);
    expect(drugTnFor([ATRO], {})).toBe(0);
  });
  it("stacks", () => expect(drugTnFor([HYPER, ATRO], { kind: "spell" })).toBe(7));
  it("overuse halves bonuses only (p.85)", () => {
    expect([1, 2, 3, -1].map(halveBonus)).toEqual([0, 1, 1, -1]);
  });
});

describe("knockdown on landed boxes (p.91)", () => {
  it("threshold is ⌈boxes ÷ 2⌉ — the book's 1/2/3", () => {
    expect([1, 2, 3, 5, 6].map(knockdownThreshold)).toEqual([1, 1, 2, 3, 3]);
    expect(["L", "M", "S"].map(knockdownThreshold)).toEqual([1, 2, 3]);
  });
  it("a Deadly hit reduced by absorption is a normal test", () => {
    expect(knockdownPrompt(6, { value: 0, max: 10 }).offer).toBe(true);
    expect(knockdownOutcome(6, 4)).toBe("none");
    expect(knockdownPrompt(10, { value: 0, max: 10 }).autoProne).toBe(true);
    expect(knockdownOutcome(10, 99)).toBe("prone");
  });
});
