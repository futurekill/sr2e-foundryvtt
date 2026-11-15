import { describe, it, expect } from "vitest";
import { taskPoolDice, taskPoolApplies, dicePoolRefreshUpdates } from "../module/rules/sr2e-rules.mjs";

describe("Task Pool (Rigger 2 p.16; Shadowtech pp.23, 49; plan 5a.0)", () => {
  it("encephalon Level 2/3/4 → 1/2/3 dice; Level 1 none", () => {
    expect([1, 2, 3, 4].map(l => taskPoolDice({ encephalon: l }))).toEqual([0, 1, 2, 3]);
  });
  it("a cerebral booster of Level 2 gives 1 die, and it ADDS to an encephalon's (R5-4)", () => {
    expect(taskPoolDice({ cerebralBooster: 1 })).toBe(0);
    expect(taskPoolDice({ cerebralBooster: 2 })).toBe(1);
    expect(taskPoolDice({ encephalon: 4, cerebralBooster: 2 })).toBe(4);
  });
  it("applies to Technical, Knowledge and Build/Repair skills only", () => {
    expect(taskPoolApplies({ category: "active", key: "electronics" })).toBe(true);
    expect(taskPoolApplies({ category: "active", key: "biotech" })).toBe(true);
    expect(taskPoolApplies({ category: "knowledge", key: "sprawl_life" })).toBe(true);
    expect(taskPoolApplies({ category: "build_repair", key: "car_b_r" })).toBe(true);
    expect(taskPoolApplies({ category: "active", key: "firearms" })).toBe(false);
  });
  it("refreshes with the other pools", () => {
    expect(dicePoolRefreshUpdates({ task: { value: 0, max: 3 } })).toMatchObject({ "system.dicePools.task.value": 3 });
  });
});
