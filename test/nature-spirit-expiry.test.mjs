import { describe, it, expect } from "vitest";
import { sunBoundaryCrossed, nextSunBoundary } from "../module/rules/sr2e-rules.mjs";

// Core calendar: 60 × 60 × 24.
const H = 3600, D = 24 * H;
const at = (day, h, m = 0) => day * D + h * H + m * 60;
const x = (now, dt, o = {}) => sunBoundaryCrossed({ now, dt, dayLength: D, hourLength: H, ...o });

describe("nature spirits depart at sunrise and sunset (SR2E p.139)", () => {
  it("arriving exactly at 06:00 crosses; the interval is (now − dt, now]", () => {
    expect(x(at(3, 6), 60)).toBe(true);
    expect(x(at(3, 6, 1), 60)).toBe(false, "starting at 06:00 is not crossing it");
  });
  it("an interval ending just before sunset does not", () => {
    expect(x(at(3, 17, 59), 3 * H)).toBe(false);
    expect(x(at(3, 18), 3 * H)).toBe(true);
  });
  it("midnight wrap: 23:00 → 07:00 crosses sunrise", () => {
    expect(x(at(4, 7), 8 * H)).toBe(true);
    expect(x(at(4, 5), 6 * H)).toBe(false, "19:00 → 05:00 crosses neither");
  });
  it("a multi-day jump crosses (one run)", () => expect(x(at(9, 12), 3 * D)).toBe(true));
  it("dt ≤ 0 (a rewind) never does", () => {
    expect(x(at(3, 6), 0)).toBe(false);
    expect(x(at(3, 6), -H)).toBe(false);
  });
  it("custom hours", () => {
    expect(x(at(1, 5), 30 * 60, { sunrise: 5, sunset: 20 })).toBe(true);
    expect(x(at(1, 6), 30 * 60, { sunrise: 5, sunset: 20 })).toBe(false);
  });
  it("time to the next boundary", () => {
    expect(nextSunBoundary({ now: at(2, 5), dayLength: D, hourLength: H })).toBe(H);
    expect(nextSunBoundary({ now: at(2, 6), dayLength: D, hourLength: H })).toBe(12 * H);
    expect(nextSunBoundary({ now: at(2, 20), dayLength: D, hourLength: H })).toBe(10 * H);
  });
});
