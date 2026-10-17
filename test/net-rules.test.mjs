// Netguns: SSC p.72, CSH p.103 (docs/PLAN-netguns.md).
import { describe, it, expect } from "vitest";
import { netTN, escapeTN, netHolds, escapeImpossible, netKind, advanceTurns } from "../module/rules/net-rules.mjs";

describe("net rules", () => {
  it("TN 5 for a normal net, 8 for a large one, 3 for a normal net on a large target", () => {
    expect(netTN({ net: "standard" })).toBe(5);
    expect(netTN({ net: "large" })).toBe(8);
    expect(netTN({ net: "standard", largeTarget: true })).toBe(3);
    expect(netTN({ net: "large", largeTarget: true })).toBe(8);
  });
  it("escape TN falls 1 per turn entangled, floor 2", () => {
    expect(escapeTN(5, 0)).toBe(5);
    expect(escapeTN(5, 2)).toBe(3);
    expect(escapeTN(5, 9)).toBe(2);
    expect(escapeTN(8, 3)).toBe(5);
  });
  it("the victim needs MORE than twice the attacker's successes", () => {
    expect(netHolds({ successes: 4, attackerSuccesses: 2 })).toBe(true);
    expect(netHolds({ successes: 5, attackerSuccesses: 2 })).toBe(false);
    expect(netHolds({ successes: 0, attackerSuccesses: 0 })).toBe(true);
    expect(netHolds({ successes: 1, attackerSuccesses: 0 })).toBe(false);
  });
  it("no escape when twice the attacker's successes exceeds the victim's dice (CSH p.103)", () => {
    expect(escapeImpossible({ attackerSuccesses: 3, dice: 5 })).toBe(true);
    expect(escapeImpossible({ attackerSuccesses: 3, dice: 6 })).toBe(false);
  });
  it("net size comes from the loaded net, else the gun; astral from FAB or the flag", () => {
    expect(netKind({ name: "Net Gun (Large)" }, "")).toEqual({ size: "large", astral: false });
    expect(netKind({ name: "BacteriTech FAB-NG Netgun (Large)" }, "FAB-NG Net (Standard)")).toEqual({ size: "standard", astral: true });
    expect(netKind({ name: "Net Gun (Medium)" }, "")).toEqual({ size: "standard", astral: false });
    expect(netKind({ name: "Odd Gun", flags: { sr2e: { net: { astral: true } } } }, "")).toEqual({ size: "standard", astral: true });
  });
});

describe("advanceTurns", () => {
  const c = (combatId, round) => ({ combatId, round });
  it("counts rounds in the same combat, and a rewind adds nothing", () => {
    expect(advanceTurns({ turns: 0, seen: c("A", 2) }, c("A", 5))).toEqual({ turns: 3, seen: c("A", 5) });
    expect(advanceTurns({ turns: 3, seen: c("A", 5) }, c("A", 3))).toEqual({ turns: 3, seen: c("A", 5) });
  });
  it("switching combats folds the old one's rounds and adds nothing for the switch", () => {
    expect(advanceTurns({ turns: 1, seen: c("A", 2) }, c("B", 1), 4)).toEqual({ turns: 3, seen: c("B", 1) });
    expect(advanceTurns({ turns: 1, seen: c("A", 2) }, c("B", 1), null)).toEqual({ turns: 1, seen: c("B", 1) });
  });
  it("out of combat, each attempt is a turn", () => {
    expect(advanceTurns({ turns: 2, seen: null }, null)).toEqual({ turns: 3, seen: null });
    expect(advanceTurns({ turns: 0, seen: c("A", 1) }, null, 3)).toEqual({ turns: 3, seen: null });
  });
});
