import { describe, it, expect } from "vitest";
import { vr2HackingPool } from "../module/rules/sr2e-rules.mjs";

describe("VR2.0 Hacking Pool (VR2.0 p.18)", () => {
  it("⌊(Intelligence + MPCP) ÷ 3⌋ — Rigger 2 p.17's Otto: Int 4 + Fuchi-6 MPCP 8 → 4", () => {
    expect(vr2HackingPool(4, 8)).toBe(4);
    expect(vr2HackingPool(6, 10)).toBe(5);
    expect(vr2HackingPool(0, 0)).toBe(0);
  });
});
