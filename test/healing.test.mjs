import { describe, it, expect } from "vitest";
import { naturalHealingHours, healingTimeText, doctoringMod, magicLost, HEALING_TABLE } from "../module/rules/sr2e-rules.mjs";
// SR2E p.113 Healing Table / Doctoring Table, p.115 Magic loss (rendered at 300 dpi).
describe("natural healing (p.113)", () => {
  it("the table", () => {
    expect(HEALING_TABLE.L).toEqual({ baseH: 24, minH: 2, tn: 4, lifestyle: "Low" });
    expect(HEALING_TABLE.D.tn).toBe(10);
  });
  it("divides successes into the base time, never under the minimum", () => {
    expect(naturalHealingHours("S", 4)).toBe(120);
    expect(naturalHealingHours("S", 20)).toBe(48);
    expect(naturalHealingHours("L", 0)).toBe(24);
    expect(naturalHealingHours("L", 24)).toBe(2);
    expect(healingTimeText(120)).toBe("5 days");
    expect(healingTimeText(6)).toBe("6 hours");
  });
  it("Doctoring Table modifiers", () => {
    expect(doctoringMod({ intensiveCare: true, condition: "hospital", magician: true, naturalBody: 5, naturalWillpower: 10 }).total).toBe(-2 + 2 - 1 - 3);
    expect(doctoringMod({ condition: "terrible", magician: true, waiveMagician: true, naturalBody: 3, naturalWillpower: 3 }).total).toBe(4);
  });
  it("Magic loss: 2D6 less than Magic", () => {
    expect(magicLost(5, 6)).toBe(true);
    expect(magicLost(6, 6)).toBe(false);
  });
});
