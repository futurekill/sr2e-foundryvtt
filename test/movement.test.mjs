import { describe, it, expect } from "vitest";
import { movementRates, runMultiplierForRace, RUN_MULTIPLIER,
  movementPhase, movementColorBand }
  from "../module/rules/sr2e-rules.mjs";

// SR2E p.83 movement rates (per Combat Phase). Backs module/movement.mjs, whose
// ruler coloring + cap are canvas-layer and verified live in Foundry.
describe("Movement rates (SR2E p.83)", () => {
  it("Running Table modifiers: human/elf/ork ×3, dwarf/troll ×2", () => {
    expect(RUN_MULTIPLIER).toEqual({ human: 3, elf: 3, ork: 3, dwarf: 2, troll: 2 });
    expect(runMultiplierForRace("Troll")).toBe(2);   // case-insensitive
    expect(runMultiplierForRace("dwarf")).toBe(2);
    expect(runMultiplierForRace("elf")).toBe(3);
    expect(runMultiplierForRace("gnome")).toBe(3);   // unknown → human ×3
    expect(runMultiplierForRace(undefined)).toBe(3);
  });

  it("walk = Quickness, run = Quickness × modifier", () => {
    expect(movementRates(5, 3)).toEqual({ walk: 5, run: 15 });   // human Q5
    expect(movementRates(6, 2)).toEqual({ walk: 6, run: 12 });   // troll Q6
    expect(movementRates(0)).toEqual({ walk: 0, run: 0 });
    expect(movementRates(4.9, 3)).toEqual({ walk: 4, run: 12 }); // floored
  });
});

// Q5 human: walk 5 / run 15. Cumulative-per-phase evaluation (SR2 p.84).
describe("movementPhase — cumulative cap + run-once-per-turn", () => {
  const rates = movementRates(5, 3);   // { walk: 5, run: 15 }

  it("within walk is allowed, no run flag", () => {
    const r = movementPhase(0, 5, rates, false);
    expect(r).toMatchObject({ allowed: true, cap: 15, newSpent: 5, ran: false });
  });

  it("into running is allowed and flags ran", () => {
    const r = movementPhase(0, 12, rates, false);
    expect(r).toMatchObject({ allowed: true, ran: true });
  });

  it("past the running max is blocked", () => {
    expect(movementPhase(0, 16, rates, false).allowed).toBe(false);
  });

  it("out-and-back accumulates: 10 + 10 = 20 > 15 → blocked", () => {
    // net displacement is zero, but travelled distance is capped
    const first = movementPhase(0, 10, rates, false);
    expect(first.allowed).toBe(true);
    expect(movementPhase(first.newSpent, 10, rates, false).allowed).toBe(false);
  });

  it("repeated short drags accumulate rather than reset (4+4+4+4 = 16 > 15)", () => {
    let spent = 0;
    for (let i = 0; i < 3; i++) spent = movementPhase(spent, 4, rates, false).newSpent; // 12
    expect(movementPhase(spent, 4, rates, false).allowed).toBe(false);                  // 16
  });

  it("run only once per Combat Turn: a walk-capped phase blocks running", () => {
    const r = movementPhase(0, 6, rates, true);   // capIsWalk after running earlier
    expect(r).toMatchObject({ allowed: false, cap: 5, ran: false });
    expect(movementPhase(0, 5, rates, true).allowed).toBe(true);  // may still walk
  });
});

describe("movementColorBand", () => {
  const rates = movementRates(5, 3);
  it("green ≤ walk, amber ≤ run, red over", () => {
    expect(movementColorBand(5, rates, false)).toBe(0);
    expect(movementColorBand(10, rates, false)).toBe(1);
    expect(movementColorBand(16, rates, false)).toBe(2);
  });
  it("walk-capped phase skips amber: over walk is red", () => {
    expect(movementColorBand(5, rates, true)).toBe(0);
    expect(movementColorBand(6, rates, true)).toBe(2);
  });
});
