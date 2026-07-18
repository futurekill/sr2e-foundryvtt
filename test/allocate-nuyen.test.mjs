// Award Nuyen allocation — even / by amount / by percent / by weight.
// Every mode routes the unallocated remainder to the communal pot.
import { describe, it, expect } from "vitest";
import { allocateNuyen } from "../module/rules/sr2e-rules.mjs";

describe("allocateNuyen", () => {
  it("even split floors and sends the remainder to the pot", () => {
    const r = allocateNuyen({ total: 100, mode: "even", ids: ["a", "b", "c"] });
    expect(r.ok).toBe(true);
    expect(r.awards).toEqual({ a: 33, b: 33, c: 33 });
    expect(r.leftover).toBe(1);
    expect(r.newPot).toBe(1);
  });

  it("by amount awards exactly, leftover to the pot", () => {
    const r = allocateNuyen({ total: 100, mode: "amount", ids: ["a", "b"], shares: { a: 50, b: 30 } });
    expect(r.awards).toEqual({ a: 50, b: 30 });
    expect(r.leftover).toBe(20);
    expect(r.newPot).toBe(20);
  });

  it("by amount refuses to hand out more than the pool", () => {
    const r = allocateNuyen({ total: 100, mode: "amount", ids: ["a", "b"], shares: { a: 70, b: 50 } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only 100/);
  });

  it("by percent computes shares of the pool", () => {
    const r = allocateNuyen({ total: 1000, mode: "percent", ids: ["a", "b", "c"], shares: { a: 50, b: 25, c: 25 } });
    expect(r.awards).toEqual({ a: 500, b: 250, c: 250 });
    expect(r.leftover).toBe(0);
  });

  it("by percent floors and pots the rounding crumbs", () => {
    const r = allocateNuyen({ total: 100, mode: "percent", ids: ["a", "b", "c"], shares: { a: 33, b: 33, c: 33 } });
    expect(r.awards).toEqual({ a: 33, b: 33, c: 33 });
    expect(r.newPot).toBe(1);
  });

  it("by percent over 100 is refused", () => {
    const r = allocateNuyen({ total: 100, mode: "percent", ids: ["a", "b"], shares: { a: 80, b: 40 } });
    expect(r.ok).toBe(false);
  });

  it("by weight splits proportionally", () => {
    const r = allocateNuyen({ total: 100, mode: "weight", ids: ["a", "b", "c"], shares: { a: 2, b: 1, c: 1 } });
    expect(r.awards).toEqual({ a: 50, b: 25, c: 25 });
  });

  it("weights that sum to zero are rejected", () => {
    const r = allocateNuyen({ total: 100, mode: "weight", ids: ["a", "b"], shares: { a: 0, b: 0 } });
    expect(r.ok).toBe(false);
  });

  it("including the pot folds it into the pool and zeroes the base", () => {
    const r = allocateNuyen({ total: 90, pot: 30, includePot: true, mode: "even", ids: ["a", "b"] });
    expect(r.pool).toBe(120);
    expect(r.awards).toEqual({ a: 60, b: 60 });
    expect(r.newPot).toBe(0);
  });

  it("not including the pot leaves it untouched plus any leftover", () => {
    const r = allocateNuyen({ total: 100, pot: 30, includePot: false, mode: "even", ids: ["a", "b", "c"] });
    expect(r.newPot).toBe(31);   // 30 existing + 1 rounding
  });

  it("no recipients is an error", () => {
    expect(allocateNuyen({ total: 100, ids: [] }).ok).toBe(false);
  });
});
