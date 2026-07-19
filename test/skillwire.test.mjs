// Skillwire Total-Ratings capacity (Shadowtech p.19): Classic = Level,
// Plus = Level x 2.
import { describe, it, expect } from "vitest";
import { skillwireCapacity } from "../module/rules/sr2e-rules.mjs";

describe("skillwireCapacity", () => {
  it("classic skillwires handle up to their level in total ratings", () => {
    expect(skillwireCapacity("Skillwires", 4)).toBe(4);
    expect(skillwireCapacity("Skillwire System", 6)).toBe(6);
  });
  it("skillwire PLUS handles twice the level (the reported bug)", () => {
    expect(skillwireCapacity("Skillwires Plus", 4)).toBe(8);
    expect(skillwireCapacity("Skillwire Plus System", 3)).toBe(6);
  });
  it("is case-insensitive on both 'skillwire' and 'plus'", () => {
    expect(skillwireCapacity("SKILLWIRES PLUS", 5)).toBe(10);
  });
  it("returns 0 for anything that isn't a skillwire", () => {
    expect(skillwireCapacity("Datajack", 2)).toBe(0);
    expect(skillwireCapacity("Wired Reflexes Plus", 3)).toBe(0);  // not a skillwire
  });
  it("rounds and floors junk ratings", () => {
    expect(skillwireCapacity("Skillwires", 0)).toBe(0);
    expect(skillwireCapacity("Skillwires Plus", "4")).toBe(8);
  });
});
