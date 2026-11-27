import { describe, it, expect } from "vitest";
import { claimId, doseKey, doseHoldState, STUCK_MS, wallAge, pickServerNow, lastAttempt } from "../module/rules/claim-rules.mjs";

describe("claimId (docs/archive/plans/PLAN-same-user-writers.md)", () => {
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

describe("doseHoldState (ages by the server wall clock, docs/archive/plans/PLAN-claim-clock.md)", () => {
  const m = (gen, ct, user = "u1", exp = "E") => ({ key: doseKey(exp, gen), ct, user });
  const ageAt = (now) => (mk) => wallAge(mk.ct, now);
  it("no marker: gen -1, not overridable", () => {
    expect(doseHoldState([m(0, 0, "u", "OTHER")], "E", ageAt(1e6))).toMatchObject({ gen: -1, holder: null, overridable: false });
  });
  it("the newest generation holds, overridable only once it's STUCK_MS old", () => {
    const now = 1.8e12;
    const fresh = doseHoldState([m(0, now - 9e6, "a"), m(1, now - 1000, "b")], "E", ageAt(now));
    expect(fresh).toMatchObject({ gen: 1, holder: "b", overridable: false, msUntil: STUCK_MS - 1000 });
    expect(doseHoldState([m(1, now - STUCK_MS, "b")], "E", ageAt(now)).overridable).toBe(true);
  });
  it("an unknown age (no server clock yet, or no ct) is never overridable", () => {
    expect(doseHoldState([m(1, 5, "b")], "E", ageAt(null)).overridable).toBe(false);
    expect(doseHoldState([m(1, undefined, "b")], "E", ageAt(1e12)).overridable).toBe(false);
  });
  it("ignores other keys and malformed generations", () => {
    expect(doseHoldState([{ key: "dose.E.gx", ct: 1 }, { key: "maneuver.E", ct: 1 }, null], "E", ageAt(5)).gen).toBe(-1);
  });
});

describe("the server wall clock (docs/archive/plans/PLAN-claim-clock.md 2)", () => {
  it("wallAge: now − ct, never negative; unknown without now or ct", () => {
    expect([wallAge(1000, 4000), wallAge(5000, 4000), wallAge(0, 4000), wallAge(1000, null)]).toEqual([3000, 0, null, null]);
  });
  it("pickServerNow: the largest wall + monotonic elapsed; expired, slept-through and future samples are dead", () => {
    const s = [{ wall: 1000, mono: 100, date: 100 }, { wall: 1300, mono: 200, date: 200 }];
    expect(pickServerNow(s, { mono: 300, date: 300, windowMs: 600000 })).toBe(1400);       // max(1200, 1400)
    const old = [{ wall: 1000, mono: 0, date: 0 }];
    expect(pickServerNow(old, { mono: 700000, date: 700000, windowMs: 600000 })).toBeNull();
    expect(old[0].dead).toBe(true);
    const slept = [{ wall: 1000, mono: 0, date: 0 }];
    expect(pickServerNow(slept, { mono: 1000, date: 3600000, windowMs: 600000 })).toBeNull();   // wall clock ran ahead
    expect(pickServerNow([], { mono: 0, date: 0, windowMs: 1 })).toBeNull();
  });
  it("lastAttempt: the highest numbered attempt (the original = 0)", () => {
    expect(lastAttempt(["k", "k:t1", "k:t3", "other:t9"], "k")).toBe(3);
    expect(lastAttempt(["k"], "k")).toBe(0);
    expect(lastAttempt([], "k")).toBe(-1);
    expect(lastAttempt(["k:takeover:2"], "k", "takeover:")).toBe(2);
  });
});
