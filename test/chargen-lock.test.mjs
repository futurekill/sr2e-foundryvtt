import { describe, it, expect } from "vitest";
import { blocksChargenReopen } from "../module/rules/sr2e-rules.mjs";

// "Creation in progress" is one-way for players: they may finish creation, only
// a GM may reopen it. It gates LIST-price buying (no Street Index markup), so
// reopening it mid-campaign is worth real nuyen — hence the lock.
describe("blocksChargenReopen", () => {
  it("blocks a player reopening finished creation", () => {
    expect(blocksChargenReopen(false, false, true)).toBe(true);
  });

  it("lets a player FINISH creation", () => {
    // The direction players are allowed to move it.
    expect(blocksChargenReopen(false, true, false)).toBe(false);
  });

  it("lets the GM do either", () => {
    expect(blocksChargenReopen(true, false, true)).toBe(false);
    expect(blocksChargenReopen(true, true, false)).toBe(false);
  });

  it("ignores updates that don't touch the flag", () => {
    // Every other actor update carries next === undefined and must pass through,
    // or editing a player's own sheet would break entirely.
    expect(blocksChargenReopen(false, false, undefined)).toBe(false);
    expect(blocksChargenReopen(false, true, undefined)).toBe(false);
  });

  it("ignores a no-op write of the same value", () => {
    // A form resubmit can send the flag unchanged; that isn't a reopen.
    expect(blocksChargenReopen(false, true, true)).toBe(false);
    expect(blocksChargenReopen(false, false, false)).toBe(false);
  });
});
