import { describe, it, expect } from "vitest";
import { SR2ESuccessRoll } from "../module/dice/sr2e-roll.mjs";
import { queueDice } from "./foundry-shim.mjs";

// The dice engine resolves the Rule of Six in batches: dice showing 6 are
// rerolled together and the new value added onto the originating die. The mock
// Roll consumes the queued results in that batch order — first the initial N
// dice, then one reroll batch for each die that showed a 6, etc.

describe("SR2ESuccessRoll.successTest", () => {
  it("counts dice ≥ TN as successes", async () => {
    queueDice([5, 3, 4, 2]); // TN 4 → 5 and 4 succeed
    const r = await SR2ESuccessRoll.successTest(4, 4, { ruleOfSix: true });
    expect(r.successes).toBe(2);
    expect(r.results).toEqual([5, 3, 4, 2]);
  });

  it("compounds 6s under the Rule of Six (6 then 3 = 9)", async () => {
    // Initial batch: [6, 2]; the 6 rerolls → [3]. Die one totals 9, die two 2.
    queueDice([6, 2, 3]);
    const r = await SR2ESuccessRoll.successTest(2, 7, { ruleOfSix: true });
    expect(r.results).toEqual([9, 2]);
    expect(r.successes).toBe(1); // only the compounded 9 beats TN 7
  });

  it("keeps exploding while 6s keep coming (6,6,1 = 13)", async () => {
    queueDice([6, 6, 1]); // one die: 6 → 6 → 1, total 13
    const r = await SR2ESuccessRoll.successTest(1, 11, { ruleOfSix: true });
    expect(r.results).toEqual([13]);
    expect(r.successes).toBe(1);
  });

  it("does not compound when the Rule of Six is off", async () => {
    queueDice([6, 2]);
    const r = await SR2ESuccessRoll.successTest(2, 7, { ruleOfSix: false });
    expect(r.results).toEqual([6, 2]);
    expect(r.successes).toBe(0); // a flat 6 cannot reach TN 7
  });

  it("flags a critical glitch when every initial die shows 1", async () => {
    queueDice([1, 1, 1]);
    const r = await SR2ESuccessRoll.successTest(3, 4, { ruleOfSix: true });
    expect(r.allOnes).toBe(true);
    expect(r.isCriticalGlitch).toBe(true);
    expect(r.successes).toBe(0);
  });

  it("is not a glitch if any initial die is not a 1", async () => {
    queueDice([1, 1, 2]);
    const r = await SR2ESuccessRoll.successTest(3, 2, { ruleOfSix: true });
    expect(r.isCriticalGlitch).toBe(false);
  });
});
