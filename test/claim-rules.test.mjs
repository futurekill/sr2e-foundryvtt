import { describe, it, expect } from "vitest";
import { claimId, doseKey, doseHoldState, STUCK_MS } from "../module/rules/claim-rules.mjs";

describe("claimId (docs/PLAN-same-user-writers.md)", () => {
  it("is a deterministic 16-char Foundry id", () => {
    expect(claimId("dose.abc.g0")).toBe(claimId("dose.abc.g0"));
    expect(claimId("dose.abc.g0")).toMatch(/^[A-Za-z0-9]{16}$/);
  });
  it("differs by key and generation, with no collisions over 5,000 keys", () => {
    expect(claimId(doseKey("abc", 0))).not.toBe(claimId(doseKey("abc", 1)));
    const ids = new Set();
    for (let i = 0; i < 5000; i++) ids.add(claimId(i % 2 ? doseKey(`exp${i}`, i % 3) : `maneuver.r${i}`));
    expect(ids.size).toBe(5000);
  });
});

describe("doseHoldState", () => {
  const m = (gen, at, user = "u1", exp = "E") => ({ key: doseKey(exp, gen), at, user });
  it("no marker: gen -1, not overridable", () => {
    expect(doseHoldState([m(0, 0, "u", "OTHER")], "E", 1e6)).toMatchObject({ gen: -1, holder: null, overridable: false });
  });
  it("the newest generation holds, overridable only once it's STUCK_MS old", () => {
    const now = 10 * STUCK_MS;
    const fresh = doseHoldState([m(0, 0, "a"), m(1, now - 1000, "b")], "E", now);
    expect(fresh).toMatchObject({ gen: 1, holder: "b", overridable: false, msUntil: STUCK_MS - 1000 });
    expect(doseHoldState([m(1, now - STUCK_MS, "b")], "E", now).overridable).toBe(true);
  });
  it("ignores other keys and malformed generations", () => {
    expect(doseHoldState([{ key: "dose.E.gx", at: 0 }, { key: "maneuver.E", at: 0 }, null], "E", 5).gen).toBe(-1);
  });
});
