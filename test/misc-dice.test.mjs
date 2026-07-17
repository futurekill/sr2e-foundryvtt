import { describe, it, expect } from "vitest";
import { clampMiscDice, clampMiscLabel, MISC_DICE_MAX, MISC_LABEL_MAX } from "../module/dialogs/roll-modifiers.mjs";

// A signed situational dice modifier the player enters in a roll dialog. HTML
// min/max is not a trust boundary, so the clamp is enforced centrally — a
// programmatic Infinity or a pasted 1e9 must never reach the dice engine.
describe("clampMiscDice", () => {
  it("passes small signed integers through", () => {
    expect(clampMiscDice(2)).toBe(2);
    expect(clampMiscDice(-1)).toBe(-1);
    expect(clampMiscDice(0)).toBe(0);
  });

  it("truncates to an integer", () => {
    expect(clampMiscDice(2.9)).toBe(2);
    expect(clampMiscDice(-2.9)).toBe(-2);
    expect(clampMiscDice("3")).toBe(3);
  });

  it("rejects non-finite input (the client-freezing case)", () => {
    expect(clampMiscDice(Infinity)).toBe(0);
    expect(clampMiscDice(-Infinity)).toBe(0);
    expect(clampMiscDice(NaN)).toBe(0);
    expect(clampMiscDice("nonsense")).toBe(0);
    expect(clampMiscDice(undefined)).toBe(0);
  });

  it("clamps to the operational cap either side", () => {
    expect(clampMiscDice(1e9)).toBe(MISC_DICE_MAX);
    expect(clampMiscDice(-1e9)).toBe(-MISC_DICE_MAX);
    expect(clampMiscDice(MISC_DICE_MAX)).toBe(MISC_DICE_MAX);
  });
});

describe("clampMiscLabel", () => {
  it("trims whitespace", () => {
    expect(clampMiscLabel("  Tailored Pheromones  ")).toBe("Tailored Pheromones");
  });
  it("caps an oversized note so it can't bloat the chat flag", () => {
    expect(clampMiscLabel("x".repeat(500))).toHaveLength(MISC_LABEL_MAX);
  });
  it("survives missing input", () => {
    expect(clampMiscLabel(undefined)).toBe("");
    expect(clampMiscLabel(null)).toBe("");
  });
});
