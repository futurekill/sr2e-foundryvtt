import { describe, it, expect } from "vitest";
import { randomSpiritName } from "../module/rules/sr2e-rules.mjs";

describe("randomSpiritName", () => {
  it("combines a themed root with a suffix", () => {
    expect(randomSpiritName("fire", () => 0)).toBe("Ashvex");        // first root + first suffix
    expect(randomSpiritName("water", () => 0)).toBe("Tidevex");
  });
  it("uses the otherworldly default pool for nature domains / unknowns", () => {
    expect(randomSpiritName("forest", () => 0)).toBe("Vaelvex");
    expect(randomSpiritName("", () => 0)).toBe("Vaelvex");
    expect(randomSpiritName(undefined, () => 0)).toBe("Vaelvex");
  });
  it("is varied — different rng gives different names", () => {
    expect(randomSpiritName("fire", () => 0)).not.toBe(randomSpiritName("fire", () => 0.99));
  });
  it("is case-insensitive on the domain", () => {
    expect(randomSpiritName("FIRE", () => 0)).toBe("Ashvex");
  });
});
