// Matrixware — the cranial cyberdeck ("C2"), Shadowtech (FASA7110) p.54–59.
import { describe, it, expect } from "vitest";
import {
  mpcpMaxRating, personaModuleMax, hardeningMax, responseMax,
  cranialDeckEssence, MPCP_OVERLOAD_TN
} from "../module/rules/sr2e-rules.mjs";

describe("component caps (p.54–59)", () => {
  it("MPCP max = 1.5 × Intelligence, rounded UP (p.54)", () => {
    expect(mpcpMaxRating(4)).toBe(6);
    expect(mpcpMaxRating(5)).toBe(8);   // 7.5 → 8
    expect(mpcpMaxRating(6)).toBe(9);
  });
  it("persona module max = 75% of MPCP, round down (p.55)", () => {
    expect(personaModuleMax(8)).toBe(6);
    expect(personaModuleMax(6)).toBe(4);   // 4.5 → 4
  });
  it("hardening max = half MPCP, round down (p.56)", () => {
    expect(hardeningMax(8)).toBe(4);
    expect(hardeningMax(5)).toBe(2);
  });
  it("response max = MPCP / 4, round down (p.59)", () => {
    expect(responseMax(8)).toBe(2);
    expect(responseMax(6)).toBe(1);
  });
  it("the overload penalty is +4 to every TN", () => {
    expect(MPCP_OVERLOAD_TN).toBe(4);
  });
});

describe("cranialDeckEssence — summed components (p.54–59)", () => {
  it("no MPCP = no deck = no Essence", () => {
    expect(cranialDeckEssence({ mpcp: 0 })).toBe(0);
    expect(cranialDeckEssence({})).toBe(0);
  });
  it("a bare MPCP-6 deck: (6/10 + 0.1) + 0.30 persona = 1.0", () => {
    expect(cranialDeckEssence({ mpcp: 6 })).toBeCloseTo(1.0, 10);
  });
  it("adds 0.3 hardening, 0.1 transfer, 0.2 response only when rated", () => {
    // MPCP 6 → 0.7, +0.30 persona, +0.3 hardening, +0.1 transfer, +0.2 response = 1.6
    expect(cranialDeckEssence({ mpcp: 6, hardening: 3, ioSpeed: 2, response: 1 })).toBeCloseTo(1.6, 10);
    // unrated components cost nothing
    expect(cranialDeckEssence({ mpcp: 6, hardening: 0, ioSpeed: 0, response: 0 })).toBeCloseTo(1.0, 10);
  });
  it("scales with MPCP rating", () => {
    expect(cranialDeckEssence({ mpcp: 10 })).toBeCloseTo(1.4, 10);  // 1.0 + 0.1 + 0.30
  });
});
