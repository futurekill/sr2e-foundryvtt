import { describe, it, expect } from "vitest";
import { karmaPoolCapacity, karmaPoolAvailable, allocateKarmaSpend, startingKarmaPool }
  from "../module/rules/sr2e-rules.mjs";

/**
 * SR2E p.191. Book values are pinned here; the guards that use them live in
 * SR2EActor#applyKarmaToTest and are covered by Quench.
 */
describe("startingKarmaPool — the grant every character begins with (p.47)", () => {
  it("gives humans 1 and metahumans 2", () => {
    expect(startingKarmaPool("human")).toBe(1);
    for (const r of ["elf", "dwarf", "ork", "troll"]) expect(startingKarmaPool(r), r).toBe(2);
  });

  it("defaults to human for a missing or odd race", () => {
    expect(startingKarmaPool()).toBe(1);
    expect(startingKarmaPool("Human")).toBe(1);
  });
});

describe("karmaPoolCapacity — starting grant plus one-tenth, ROUND UP (p.47, p.191)", () => {
  it("is never 0 for a real character — the grant alone guarantees a pool", () => {
    // The bug this caught: deriving from Career Karma alone gave a brand-new
    // character 0, when p.47 grants them 1 (human) or 2 (metahuman).
    expect(karmaPoolCapacity(0, 0, 0, "human")).toBe(1);
    expect(karmaPoolCapacity(0, 0, 0, "troll")).toBe(2);
  });

  it("rounds the earned tenth UP, which is the half of p.191 easy to get wrong", () => {
    expect(karmaPoolCapacity(1)).toBe(2);    // 1 grant + ceil(0.1)
    expect(karmaPoolCapacity(9)).toBe(2);
    expect(karmaPoolCapacity(10)).toBe(2);
    expect(karmaPoolCapacity(11)).toBe(3);   // 1 + 2, not 1 + 1
    expect(karmaPoolCapacity(50)).toBe(6);
    expect(karmaPoolCapacity(51)).toBe(7);
  });

  it("adds the metahuman grant on top of earned Karma", () => {
    expect(karmaPoolCapacity(50, 0, 0, "ork")).toBe(7);   // 2 + 5
  });

  it("subtracts permanently expended points", () => {
    expect(karmaPoolCapacity(50, 0)).toBe(6);
    expect(karmaPoolCapacity(50, 2)).toBe(4);
  });

  it("never goes negative, however much was burned", () => {
    expect(karmaPoolCapacity(10, 99)).toBe(0);
  });

  it("applies a signed GM adjustment, which is how legacy pools survive", () => {
    // A character with no recorded Karma but a pool the table has been using.
    expect(karmaPoolCapacity(0, 0, 3)).toBe(4);        // 1 grant + 3
    // And one whose sheet held less than the rule would grant.
    expect(karmaPoolCapacity(50, 0, -3)).toBe(3);      // 1 + 5 - 3
    // The adjustment is an offset, not a floor: earning Karma still raises it.
    expect(karmaPoolCapacity(60, 0, 3)).toBe(10);      // 1 + 6 + 3
    // It cannot drag capacity below zero.
    expect(karmaPoolCapacity(10, 0, -99)).toBe(0);
  });

  it("treats junk as zero rather than producing NaN", () => {
    expect(karmaPoolCapacity(undefined)).toBe(1);   // grant survives
    expect(karmaPoolCapacity(null, null)).toBe(1);
    expect(karmaPoolCapacity(-5)).toBe(1);
  });
});

describe("karmaPoolAvailable", () => {
  it("is capacity less this encounter's spending", () => {
    expect(karmaPoolAvailable(5, 0, 0)).toBe(5);
    expect(karmaPoolAvailable(5, 2, 0)).toBe(3);
    expect(karmaPoolAvailable(5, 5, 0)).toBe(0);
  });

  it("floors at zero before adding borrowed points, so overspend cannot eat a loan", () => {
    expect(karmaPoolAvailable(5, 99, 2)).toBe(2);
  });

  it("adds Team Karma the character is holding, which may exceed capacity", () => {
    expect(karmaPoolAvailable(3, 0, 2)).toBe(5);
  });
});

describe("allocateKarmaSpend — borrowed points go first", () => {
  it("spends drawn Team Karma before personal capacity", () => {
    expect(allocateKarmaSpend(1, 2)).toEqual({ fromDrawn: 1, fromSpent: 0 });
  });

  it("splits when the cost outruns what was borrowed", () => {
    expect(allocateKarmaSpend(3, 2)).toEqual({ fromDrawn: 2, fromSpent: 1 });
  });

  it("falls entirely on personal capacity when nothing is borrowed", () => {
    expect(allocateKarmaSpend(2, 0)).toEqual({ fromDrawn: 0, fromSpent: 2 });
  });

  it("never allocates a fractional or negative cost", () => {
    expect(allocateKarmaSpend(-4, 3)).toEqual({ fromDrawn: 0, fromSpent: 0 });
    expect(allocateKarmaSpend(2.7, 5)).toEqual({ fromDrawn: 2, fromSpent: 0 });
  });
});

describe("the p.191 sequence end to end", () => {
  // The exact play sequence the plan review used to kill the first design.
  it("does not charge personal capacity for a success bought with Team Karma", () => {
    let total = 50, burned = 0, spent = 0, drawn = 0;   // human: 1 grant + 5 earned
    const cap = () => karmaPoolCapacity(total, burned);
    const avail = () => karmaPoolAvailable(cap(), spent, drawn);
    expect(avail()).toBe(6);

    ({ fromSpent: spent } = { fromSpent: spent + allocateKarmaSpend(1, drawn).fromSpent });
    expect(avail()).toBe(5);                       // reroll — temporary

    burned += 1;                                    // bought a success — permanent
    expect(avail()).toBe(4);

    spent = 0; drawn = 0;                           // refresh
    expect(avail()).toBe(5);

    burned += 1;                                    // gifted 1 to Team Karma
    expect(cap()).toBe(4);

    drawn += 2;                                     // drew 2 from Team Karma
    expect(avail()).toBe(6);

    drawn -= 1;                                     // bought a success with a DRAWN point
    expect(avail()).toBe(5);

    spent = 0; drawn = 0;                           // refresh
    expect(avail()).toBe(4);                        // NOT 3 — the team's point, not ours
  });
});
