import { describe, it, expect } from "vitest";
import {
  blastFalloffRate, blastPowerAtRange, blastRadius,
  scatterProfile, scatterDistance
} from "../module/rules/sr2e-rules.mjs";

// Values verified against Shadowrun, Second Edition core (FASA7901) p.96–97.

describe("Blast power falloff (core p.96)", () => {
  it("offensive & concussion lose 1 Power/m, defensive loses 2/m", () => {
    expect(blastFalloffRate("offensive")).toBe(1);
    expect(blastFalloffRate("concussion")).toBe(1);
    expect(blastFalloffRate("defensive")).toBe(2);
    expect(blastFalloffRate("unknown")).toBe(1);
  });

  it("matches the book's worked example (offensive 10S)", () => {
    // p.96: 3 m away → 7S, 6 m away → 4S
    expect(blastPowerAtRange(10, 3, 1)).toBe(7);
    expect(blastPowerAtRange(10, 6, 1)).toBe(4);
  });

  it("matches the defensive example (10, falloff 2)", () => {
    // p.96: at 3 m a defensive grenade is base 4 Power; at 6 m, out of effect
    expect(blastPowerAtRange(10, 3, 2)).toBe(4);
    expect(blastPowerAtRange(10, 6, 2)).toBe(0);
  });

  it("never goes negative", () => {
    expect(blastPowerAtRange(6, 99, 1)).toBe(0);
  });
});

describe("Blast radius (farthest affected metre)", () => {
  it("offensive Power 10 reaches 9 m; defensive reaches 4 m", () => {
    expect(blastRadius(10, 1)).toBe(9);
    expect(blastRadius(10, 2)).toBe(4);
  });
});

describe("Scatter (core p.96 Grenade Range Table)", () => {
  it("delivery profiles: dice + per-success reduction", () => {
    expect(scatterProfile("standard")).toEqual({ dice: 1, perSuccess: 2 });
    expect(scatterProfile("aerodynamic")).toEqual({ dice: 2, perSuccess: 4 });
    expect(scatterProfile("launcher")).toEqual({ dice: 3, perSuccess: 4 });
  });

  it("successes reduce rolled scatter, floored at 0", () => {
    // standard: rolled 5 m, 2 successes × 2 m = 4 m reduction → 1 m off-target
    expect(scatterDistance(5, 2, 2)).toBe(1);
    // launcher: rolled 9 m, 3 successes × 4 m = 12 → lands on target
    expect(scatterDistance(9, 3, 4)).toBe(0);
  });
});
