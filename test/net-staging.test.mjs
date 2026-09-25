// Net-success staging (SR2E p.91, p.97, p.110; rendered from the 11th printing).
// The attacker stages up one level per 2 full successes OVER the target's total,
// the target stages down one level per 2 over the attacker's, a tie is base.
import { describe, it, expect } from "vitest";
import { stageByNet } from "../module/rules/sr2e-rules.mjs";

const L = 0, M = 1, S = 2, D = 3;

describe("stageByNet — p.91 Liam vs Snot (Ares Predator, 9M)", () => {
  it("Liam 5 vs Snot 3: net 2 stages M → S", () => {
    expect(stageByNet(M, 5, 3)).toEqual({ idx: S, net: 2 });
  });
  it("Snot 2 more than Liam stages M → L", () => {
    expect(stageByNet(M, 3, 5).idx).toBe(L);
  });
  it("Snot 4 more than Liam takes no damage", () => {
    expect(stageByNet(M, 1, 5).idx).toBeLessThan(0);
  });
  it("equal successes do the base damage", () => {
    expect(stageByNet(M, 3, 3).idx).toBe(M);
  });
  it("Liam 4 more stages M → D", () => {
    expect(stageByNet(M, 7, 3).idx).toBe(D);
  });
});

describe("stageByNet — where the old two-staging model went wrong", () => {
  it("4 vs 3 is base damage (old model: M→D→S)", () => {
    expect(stageByNet(M, 4, 3).idx).toBe(M);
  });
  it("2 vs 1 is base damage (old model: one level up)", () => {
    expect(stageByNet(M, 2, 1).idx).toBe(M);
  });
  it("6 vs 6 is base damage — the old model UNDER-stated it (M→D capped, then D→L)", () => {
    expect(stageByNet(M, 6, 6).idx).toBe(M);
  });
  it("1 vs 4 stages down one, not two", () => {
    expect(stageByNet(M, 1, 4).idx).toBe(L);
  });
});

describe("stageByNet — bounds", () => {
  it("never stages above Deadly", () => {
    expect(stageByNet(S, 12, 0).idx).toBe(D);
  });
  it("clamps an over-D base (printed + burst + called shot) before staging", () => {
    expect(stageByNet(5, 3, 3).idx).toBe(D);   // tie → D, not an invalid index
    expect(stageByNet(5, 1, 5).idx).toBe(M);   // defender wins by 4 → D − 2 levels
  });
  it("treats missing successes as zero", () => {
    expect(stageByNet(M, undefined, undefined)).toEqual({ idx: M, net: 0 });
  });
});
