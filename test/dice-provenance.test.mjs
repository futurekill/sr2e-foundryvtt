// Which dice on a chat card came from which pool. The dice are mechanically
// interchangeable in SR2 — one undifferentiated handful — so this attribution
// is presentational. What must hold is that it is DETERMINISTIC and that the
// run counts always add up to the dice actually rolled, or the card would claim
// a die exists that does not.
import { describe, it, expect } from "vitest";
import { diceSourceRuns, attributeDice, poolsAllowedFor } from "../module/rules/sr2e-rules.mjs";

const pools = (...xs) => xs.map(([key, label, amount]) => ({ key, label, amount }));

describe("diceSourceRuns — composition order", () => {
  it("orders runs the way rollSuccessTest builds the pool", () => {
    const runs = diceSourceRuns({
      baseDice: 6, baseLabel: "Firearms",
      poolsUsed: pools(["combat", "Combat Pool", 3]),
      karmaDice: 1, miscDice: 2, miscLabel: "power site"
    });
    expect(runs.map(r => r.key)).toEqual(["base", "pool:combat", "karma", "misc"]);
    expect(runs.map(r => r.count)).toEqual([6, 3, 1, 2]);
  });

  it("keeps several simultaneous pools distinct", () => {
    const runs = diceSourceRuns({
      baseDice: 5, baseLabel: "Computer",
      poolsUsed: pools(["hacking", "Hacking Pool", 4], ["control", "Control Pool", 2])
    });
    expect(runs.map(r => r.label)).toEqual(["Computer", "Hacking Pool", "Control Pool"]);
  });

  it("drops empty runs rather than emitting a captioned nothing", () => {
    const runs = diceSourceRuns({ baseDice: 3, baseLabel: "Stealth", karmaDice: 0, miscDice: 0 });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ key: "base", count: 3 });
  });

  it("ignores a pool entry that resolved to zero dice", () => {
    const runs = diceSourceRuns({
      baseDice: 4, baseLabel: "Sorcery", poolsUsed: pools(["magic", "Spell Pool", 0])
    });
    expect(runs.map(r => r.key)).toEqual(["base"]);
  });
});

describe("diceSourceRuns — a NEGATIVE misc modifier removes dice", () => {
  it("emits no misc run, and shortens the base run", () => {
    const runs = diceSourceRuns({
      baseDice: 6, baseLabel: "Firearms",
      poolsUsed: pools(["combat", "Combat Pool", 3]), miscDice: -2
    });
    expect(runs.map(r => r.key)).toEqual(["base", "pool:combat"]);
    expect(runs.map(r => r.count)).toEqual([4, 3]);   // pool untouched
  });

  it("only eats later runs once the base is exhausted", () => {
    // −8 against base 6 + pool 3 + karma 1: base to 0, then trim from the END.
    const runs = diceSourceRuns({
      baseDice: 6, baseLabel: "Firearms",
      poolsUsed: pools(["combat", "Combat Pool", 3]), karmaDice: 1, miscDice: -8
    });
    const total = runs.reduce((n, r) => n + r.count, 0);
    expect(total).toBe(2);                       // 10 dice − 8 penalty
    expect(runs.find(r => r.key === "base")).toBeUndefined();
    expect(runs.find(r => r.key === "karma")).toBeUndefined();  // trimmed first
  });

  it("can zero the whole pool without going negative", () => {
    const runs = diceSourceRuns({ baseDice: 3, baseLabel: "Stealth", miscDice: -99 });
    expect(runs).toEqual([]);
    expect(runs.reduce((n, r) => n + r.count, 0)).toBe(0);
  });
});

describe("attributeDice", () => {
  const dice = Array.from({ length: 10 }, (_, i) => ({ total: i + 1, success: i % 2 === 0 }));

  it("tags each die with the run covering its index", () => {
    const runs = diceSourceRuns({
      baseDice: 6, baseLabel: "Firearms",
      poolsUsed: pools(["combat", "Combat Pool", 3]), karmaDice: 1
    });
    const out = attributeDice(dice, runs);
    expect(out.map(d => d.sourceKey)).toEqual([
      ...Array(6).fill("base"), ...Array(3).fill("pool:combat"), "karma"
    ]);
  });

  it("preserves the original die fields", () => {
    const out = attributeDice(dice, diceSourceRuns({ baseDice: 10, baseLabel: "X" }));
    expect(out[0]).toMatchObject({ total: 1, success: true, sourceLabel: "X" });
  });

  it("does not mutate the input dice", () => {
    const runs = diceSourceRuns({ baseDice: 10, baseLabel: "X" });
    attributeDice(dice, runs);
    expect(dice[0].sourceKey).toBeUndefined();
  });

  it("leaves a surplus die untagged rather than mis-attributing it", () => {
    // Runs describing fewer dice than were rolled must not silently absorb the
    // remainder into the last run — that would invent provenance.
    const out = attributeDice(dice, [{ key: "base", label: "X", count: 4 }]);
    expect(out).toHaveLength(10);
    expect(out[4].sourceKey).toBeUndefined();
  });

  it("survives runs describing more dice than exist", () => {
    const out = attributeDice([{ total: 5 }], [{ key: "base", label: "X", count: 9 }]);
    expect(out).toHaveLength(1);
    expect(out[0].sourceKey).toBe("base");
  });
});

describe("poolsAllowedFor — which pools may augment which test (SR2E p.84)", () => {
  it("allows ONLY Combat Pool on a weapon attack", () => {
    // The bug this fixes: a magician firing a pistol was offered Magic Pool.
    // p.84 scopes the Combat Pool to "Firearm, Projectile Weapon, Throwing
    // Weapon, Gunnery, Melee Combat, or similar offensive Combat Skill Tests".
    expect(poolsAllowedFor("combat")).toEqual(["combat"]);
    expect(poolsAllowedFor("combat")).not.toContain("magic");
  });

  it("allows Combat Pool on damage resistance", () => {
    expect(poolsAllowedFor("damage-resist")).toEqual(["combat"]);
  });

  it("allows Magic Pool on spellcasting and its drain", () => {
    expect(poolsAllowedFor("spell")).toEqual(["magic"]);
    expect(poolsAllowedFor("drain")).toEqual(["magic"]);
  });

  it("allows NO pool on conjuring — the book bars it explicitly", () => {
    // "Dice from the Magic Pool cannot be used to augment Conjuring-related
    // Tests." Empty list, NOT null: null means "unconstrained".
    expect(poolsAllowedFor("conjuring")).toEqual([]);
  });

  it("maps decking and vehicle tests to their own pools", () => {
    expect(poolsAllowedFor("matrix")).toEqual(["hacking"]);
    expect(poolsAllowedFor("vehicle")).toEqual(["control"]);
  });

  it("returns null for an unknown test rather than guessing", () => {
    // A generic skill roll keeps the old behaviour (offer everything) instead
    // of silently hiding a pool the GM might legitimately allow.
    expect(poolsAllowedFor()).toBeNull();
    expect(poolsAllowedFor("etiquette")).toBeNull();
  });
});

describe("diceSourceRuns — label handling", () => {
  it("uses the supplied karma label so it can be localised", () => {
    const runs = diceSourceRuns({ baseDice: 1, baseLabel: "S", karmaDice: 1, karmaLabel: "Karma-DE" });
    expect(runs.find(r => r.key === "karma").label).toBe("Karma-DE");
  });

  it("does not pre-escape labels — the renderer escapes once", () => {
    // Escaping here as well produced visible &amp; entities on the card.
    const runs = diceSourceRuns({ baseDice: 1, baseLabel: "Smith & Wesson" });
    expect(runs[0].label).toBe("Smith & Wesson");
  });
});
