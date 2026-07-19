import { describe, it, expect } from "vitest";
import { spiritPortraitVariant } from "../module/rules/sr2e-rules.mjs";

describe("spiritPortraitVariant", () => {
  it("returns 0 when no art exists (falls back to SVG)", () => {
    expect(spiritPortraitVariant(0)).toBe(0);
    expect(spiritPortraitVariant(undefined)).toBe(0);
    expect(spiritPortraitVariant(-3)).toBe(0);
  });
  it("picks a 1-based index within [1, count]", () => {
    expect(spiritPortraitVariant(3, () => 0)).toBe(1);
    expect(spiritPortraitVariant(3, () => 0.99)).toBe(3);
    expect(spiritPortraitVariant(2, () => 0.5)).toBe(2);
    expect(spiritPortraitVariant(1, () => 0.99)).toBe(1);
  });
});
