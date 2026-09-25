// Short bursts (SR2E p.92, rendered): a burst the clip cannot fill fires what is
// left. Two rounds: +2 Power, no Damage Level step, +2 recoil. One round: resolve
// as a single shot. p.93 sends a short full-auto burst to the same rule.
import { describe, it, expect } from "vitest";
import { burstFired, burstDamageBonus, recoilPenalty } from "../module/rules/sr2e-rules.mjs";

describe("burstFired", () => {
  it("fires the full burst when the clip can", () => {
    expect(burstFired("bf", 3, 30)).toEqual({ rounds: 3, isBurst: true, short: false });
  });
  it("a burst one round short fires 2: +2 Power, no level, +2 recoil", () => {
    const f = burstFired("bf", 3, 2);
    expect(f).toEqual({ rounds: 2, isBurst: true, short: true });
    expect(burstDamageBonus(f.rounds)).toEqual({ powerBonus: 2, levelSteps: 0 });
    expect(recoilPenalty(0, f.rounds, { isBurst: f.isBurst, hasRecoil: true, recoilComp: 0 })).toBe(2);
  });
  it("a one-round burst is a single shot", () => {
    expect(burstFired("bf", 3, 1)).toEqual({ rounds: 1, isBurst: false, short: true });
  });
  it("full auto that runs short fires what is left", () => {
    expect(burstFired("fa", 6, 4)).toEqual({ rounds: 4, isBurst: true, short: true });
    expect(burstFired("fa", 6, 2)).toEqual({ rounds: 2, isBurst: true, short: true });
    expect(burstFired("fa", 6, 1).isBurst).toBe(false);
  });
  it("single shot and semi-auto are untouched", () => {
    expect(burstFired("sa", 1, 1)).toEqual({ rounds: 1, isBurst: false, short: false });
  });
});
