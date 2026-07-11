import { describe, it, expect } from "vitest";
import { spendInitiative, nextEligibleTurnIndex, livingCombatantIds }
  from "../module/rules/sr2e-rules.mjs";

// Pure decision helpers behind SR2ECombat (module/documents/combat.mjs). The
// Foundry orchestration (rollInitiative, turn pointer) is covered in-Foundry;
// these lock the two play-session bugs: negative totals and dead-jumps-to-top.
const C = (id, initiative, isDefeated = false) => ({ id, initiative, isDefeated });

describe("Initiative passes (SR2E p.78)", () => {
  it("spending an action drops 10 and floors at 0 (never negative)", () => {
    expect(spendInitiative(21)).toBe(11);
    expect(spendInitiative(5)).toBe(0);      // was showing -5 in play
    expect(spendInitiative(0)).toBe(0);
    expect(spendInitiative(null)).toBe(0);
  });

  it("next turn is the highest positive total that isn't defeated", () => {
    // descending order (Foundry's sort)
    expect(nextEligibleTurnIndex([C("a", 21), C("b", 11), C("c", 5)])).toBe(0);
    expect(nextEligibleTurnIndex([C("a", 0), C("b", 11)])).toBe(1);
  });

  it("skips a defeated combatant even at the top of the order", () => {
    // the bug: a dead body sorted first used to grab the turn
    expect(nextEligibleTurnIndex([C("dead", 30, true), C("b", 11)])).toBe(1);
  });

  it("returns null when nobody can act (clear the turn pointer, don't force 0)", () => {
    expect(nextEligibleTurnIndex([C("dead", 30, true), C("out", 0)])).toBeNull();
    expect(nextEligibleTurnIndex([])).toBeNull();
  });

  it("re-rolls only the living — the dead stay out (no jump to top)", () => {
    const roster = [C("hero", 15), C("corpse", 22, true), C("ganger", 8)];
    expect(livingCombatantIds(roster)).toEqual(["hero", "ganger"]);
  });
});
