import { describe, it, expect } from "vitest";
import { drugDuration, toxinLevel } from "../module/rules/sr2e-rules.mjs";

describe("drug durations (Shadowtech p.98–100)", () => {
  it("Kamikaze 10 × 1D6 minutes is the rolled value", () => {
    expect(drugDuration({ minutes: "10*1d6" }, { rolled: 40 })).toEqual({ minutes: 40 });
  });
  it("Hyper 60 minutes − 5 per Body success, floored at 0", () => {
    expect(drugDuration({ minutes: 60, bodyReducesBy: 5 }, { successes: 3 })).toEqual({ minutes: 45 });
    expect(drugDuration({ minutes: 60, bodyReducesBy: 5 }, { successes: 20 })).toEqual({ minutes: 0 });
  });
  it("MAO 10 turns − Body successes", () => {
    expect(drugDuration({ turns: 10, bodyReducesBy: 1 }, { successes: 4 })).toEqual({ turns: 6 });
  });
  it("no duration → null", () => expect(drugDuration(null)).toBeNull());
});

describe("toxin resistance staging (p.112)", () => {
  it("5D: 2 → S, 4 → M, 6 → L, 8 → none", () => {
    expect(toxinLevel("D", 1)).toBe("D");
    expect(toxinLevel("D", 2)).toBe("S");
    expect(toxinLevel("D", 4)).toBe("M");
    expect(toxinLevel("D", 6)).toBe("L");
    expect(toxinLevel("D", 8)).toBeNull();
  });
});

describe("drug packs count once in character creation", async () => {
  const { chargenItemCost } = await import("../module/rules/sr2e-rules.mjs");
  it("a six-dose inhaler bought for 100¥ counts 100¥, not 600¥", () => {
    expect(chargenItemCost({ type: "gear", drug: true, cost: 100, quantity: 6, acquiredListValue: 100 })).toBe(100);
    expect(chargenItemCost({ type: "gear", drug: true, cost: 100, quantity: 6 })).toBe(100);
    expect(chargenItemCost({ type: "gear", cost: 100, quantity: 6 })).toBe(600);
  });
});
