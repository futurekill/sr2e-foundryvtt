// The "complete miss" defence, SR2E p.91, read from a 300 dpi render:
//   "If the target's Combat Pool dice alone are enough to exceed the attacker's
//    successes, the attack is a complete miss."
import { describe, it, expect } from "vitest";
import { isCompleteMiss, successesFromSource, attributeDice, diceSourceRuns }
  from "../module/rules/sr2e-rules.mjs";

describe("isCompleteMiss (SR2E p.91)", () => {
  it("is a miss when POOL successes exceed the attacker's", () => {
    expect(isCompleteMiss(4, 3)).toBe(true);
  });

  it("is NOT a miss on equal successes", () => {
    // p.91: equal successes means "the weapon does its base Damage Level".
    expect(isCompleteMiss(3, 3)).toBe(false);
  });

  it("is not a miss when the pool merely stages damage down", () => {
    expect(isCompleteMiss(2, 5)).toBe(false);
  });

  it("handles a defender who spent no pool at all", () => {
    expect(isCompleteMiss(0, 0)).toBe(false);
    expect(isCompleteMiss(0, 3)).toBe(false);
  });

  it("refuses to fire on unknown attacker successes rather than guessing", () => {
    // The resistance roll may be made from a macro, or against a card written
    // before this rule shipped. Missing data must not manufacture a miss.
    expect(isCompleteMiss(5, undefined)).toBe(false);
    expect(isCompleteMiss(5, NaN)).toBe(false);
    expect(isCompleteMiss(5, null)).toBe(false);
  });
});

describe("successesFromSource — the pool dice ALONE", () => {
  // The whole point of p.91: a defender who wins on BODY dice does not get the
  // clean miss. Only the Combat Pool contribution counts.
  const runs = diceSourceRuns({
    baseDice: 5, baseLabel: "Body",
    poolsUsed: [{ key: "combat", label: "Combat Pool", amount: 3 }]
  });
  const mk = flags => attributeDice(flags.map(s => ({ success: s })), runs);

  it("counts only the pool dice, not the body dice", () => {
    //        body: 4 successes            pool: 2 successes
    const dice = mk([true, true, true, true, false,  true, true, false]);
    expect(successesFromSource(dice, "pool:combat")).toBe(2);
    expect(dice.filter(d => d.success)).toHaveLength(6);   // total is higher
  });

  it("a body-heavy defence is NOT a complete miss even with more total successes", () => {
    const dice = mk([true, true, true, true, true,  true, false, false]);
    const total = dice.filter(d => d.success).length;      // 6
    const pool  = successesFromSource(dice, "pool:combat"); // 1
    expect(total).toBeGreaterThan(4);
    expect(isCompleteMiss(pool, 4)).toBe(false);           // pool alone: 1 vs 4
  });

  it("a pool-heavy defence IS a complete miss", () => {
    const dice = mk([false, false, false, false, false,  true, true, true]);
    expect(successesFromSource(dice, "pool:combat")).toBe(3);
    expect(isCompleteMiss(3, 2)).toBe(true);
  });

  it("returns 0 for untagged (pre-provenance) dice rather than throwing", () => {
    expect(successesFromSource([{ success: true }, { success: true }], "pool:combat")).toBe(0);
  });
});

describe("labels are localisable, not hard-coded English", () => {
  it("takes the misc run's default label from the caller", async () => {
    const { diceSourceRuns } = await import("../module/rules/sr2e-rules.mjs");
    const runs = diceSourceRuns({ baseDice: 1, baseLabel: "S", miscDice: 2,
                                  miscDefaultLabel: "Sonstiges" });
    expect(runs.find(r => r.key === "misc").label).toBe("Sonstiges");
  });

  it("still prefers an explicit miscLabel when the player gave one", () => {
    const runs = diceSourceRuns({ baseDice: 1, baseLabel: "S", miscDice: 2,
                                  miscLabel: "power site", miscDefaultLabel: "Misc" });
    expect(runs.find(r => r.key === "misc").label).toBe("power site");
  });
});

describe("melee clean miss requires Full Defense (SR2E p.103)", () => {
  // p.103, verified from a 300dpi render: "Characters may choose, when
  // attacked, to defend only themselves. When doing so, they may not add any
  // Combat Pool dice to their Attack Success Test, but may add dice to their
  // Damage Resistance Test. When using this option, a clean miss occurs if the
  // target's successes from Combat Pool dice alone exceed the attacker's
  // successes, regardless of any other dice result or the Damage Code."
  it("does NOT grant a clean miss in melee without Full Defense", () => {
    expect(isCompleteMiss(4, 2, { melee: true, fullDefense: false })).toBe(false);
  });

  it("DOES grant it in melee under Full Defense", () => {
    expect(isCompleteMiss(4, 2, { melee: true, fullDefense: true })).toBe(true);
  });

  it("still requires the pool to strictly exceed, even under Full Defense", () => {
    expect(isCompleteMiss(2, 2, { melee: true, fullDefense: true })).toBe(false);
  });

  it("leaves ranged unconditional — p.91 has no such precondition", () => {
    expect(isCompleteMiss(4, 2)).toBe(true);
    expect(isCompleteMiss(4, 2, { melee: false })).toBe(true);
  });
});
