// VR2.0 part 6c: command sets (docs/PLAN-vr2-part6-frames.md, "6c in detail"; VR2.0 pp.104–105).
import { describe, it, expect } from "vitest";
import { csHours, csStepList, csState, csAdmits } from "../module/rules/vr2-command-sets.mjs";

describe("command sets (p.104–105)", () => {
  it("hours: 24 ÷ the host's successes, fractional; 48 when none", () => {
    expect(csHours(5)).toBeCloseTo(4.8);
    expect(csHours(0)).toBe(48);
  });
  it("step changes fold in order from their `from`, never rewriting settled steps", () => {
    const open = { steps: ["control", "slave"] };
    expect(csStepList(open, [{ from: 0, steps: ["slave", "files"], seq: 1 }, { from: 1, steps: ["access"], seq: 2 }])).toEqual(["slave", "access"]);
  });
  it("pending → loaded with its sum and purge time; a failed step fails the set; marks are terminal", () => {
    const open = { steps: ["control", "slave"] };
    expect(csState({ open, steps: [{ n: 0, success: true, hostSuccesses: 2, at: 100 }] })).toMatchObject({ status: "pending", next: 1, nextSub: "slave" });
    const s = csState({ open, steps: [{ n: 0, success: true, hostSuccesses: 2, at: 100 }, { n: 1, success: true, hostSuccesses: 3, at: 200 }], now: 300 });
    expect(s).toMatchObject({ status: "loaded", sum: 5, loadedAt: 200, undetected: true });
    expect(s.purgeAt).toBeCloseTo(200 + 4.8 * 3600);
    expect(csState({ open, steps: [{ n: 0, success: true, hostSuccesses: 0, at: 10 }, { n: 1, success: true, hostSuccesses: 0, at: 20 }], now: 30 }).hours).toBe(48);
    expect(csState({ open, steps: [{ n: 0, success: false, hostSuccesses: 4, at: 100 }] }).status).toBe("failed");
    expect(csState({ open, steps: [{ n: 0, success: true, hostSuccesses: 2, at: 100 }, { n: 1, success: true, hostSuccesses: 3, at: 200 }], now: 200 + 5 * 3600 }).status).toBe("purged");
    expect(csState({ open, marks: [{ what: "cancelled", seq: 1 }] }).status).toBe("cancelled");
  });
  it("admission per action", () => {
    expect(csAdmits("pending", "settle")).toBe(true);
    expect(csAdmits("loaded", "settle")).toBe(false);
    expect(csAdmits("loaded", "executed")).toBe(true);
    expect(csAdmits("pending", "purged")).toBe(false);
  });
});
