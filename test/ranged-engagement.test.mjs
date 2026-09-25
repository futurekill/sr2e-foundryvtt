// Multiple targets and walking fire (SR2E p.92–93, rendered): +2 for a second
// target in the phase (SA/BF); full auto +2 per new target (Wedge: +0/+2/+4)
// and one round wasted per metre walked between targets; smartguns waste none.
import { describe, it, expect } from "vitest";
import { rangedEngagement, effectiveRecoil } from "../module/rules/sr2e-rules.mjs";

const key = "c1:4:0";
const rec = (targets, lastFA = null, k = key) => ({ key: k, targets, lastFA });
const eng = (o) => rangedEngagement({ key, mode: "sa", weaponUuid: "W", smartgun: false, ...o });

describe("rangedEngagement — targets", () => {
  it("first target is +0", () => {
    expect(eng({ record: null, targetUuid: "A" })).toMatchObject({ priorTargets: 0, tnMod: 0 });
  });
  it("Wedge: A, B, C at +0 / +2 / +4", () => {
    expect(eng({ record: rec(["A"]), targetUuid: "B" }).tnMod).toBe(2);
    expect(eng({ record: rec(["A", "B"]), targetUuid: "C" }).tnMod).toBe(4);
  });
  it("shooting the same target again adds nothing; going back to A after B is +2", () => {
    expect(eng({ record: rec(["A"]), targetUuid: "A" }).tnMod).toBe(0);
    expect(eng({ record: rec(["A", "B"]), targetUuid: "A" }).tnMod).toBe(2);
  });
  it("a stale record (another phase) reads as empty", () => {
    expect(eng({ record: rec(["A", "B"], null, "c1:3:0"), targetUuid: "C" }).tnMod).toBe(0);
  });
  it("no target token: automatic count is 0, an override is used", () => {
    expect(eng({ record: rec(["A", "B"]), targetUuid: null }).tnMod).toBe(0);
    expect(eng({ record: rec(["A", "B"]), targetUuid: null, priorOverride: 2 }).tnMod).toBe(4);
  });
  it("sanitises overrides to non-negative integers", () => {
    expect(eng({ record: null, targetUuid: "A", priorOverride: 1.7 }).priorTargets).toBe(1);
    expect(eng({ record: rec(["B"]), targetUuid: "A", priorOverride: NaN }).priorTargets).toBe(1);
    expect(eng({ record: rec(["B"]), targetUuid: "A", priorOverride: Infinity }).priorTargets).toBe(1);
    expect(eng({ record: null, targetUuid: "A", priorOverride: -3 }).priorTargets).toBe(0);
  });
});

describe("rangedEngagement — walking fire", () => {
  const fa = (o) => eng({ mode: "fa", ...o });
  const lastA = { weaponUuid: "W", tokenUuid: "A" };
  it("same weapon on full auto, new target: 1 round per metre", () => {
    expect(fa({ record: rec(["A"], lastA), targetUuid: "B", distanceM: 3.4 })).toMatchObject({ walked: 3, walks: true });
  });
  it("smartguns never waste rounds", () => {
    expect(fa({ record: rec(["A"], lastA), targetUuid: "B", distanceM: 3, smartgun: true }).walked).toBe(0);
  });
  it("no walking without a previous FA burst from THIS weapon", () => {
    expect(fa({ record: rec(["A"], null), targetUuid: "B", distanceM: 3 }).walks).toBe(false);
    expect(fa({ record: rec(["A"], { weaponUuid: "X", tokenUuid: "A" }), targetUuid: "B", distanceM: 3 }).walks).toBe(false);
    expect(eng({ mode: "sa", record: rec(["A"], lastA), targetUuid: "B", distanceM: 3 }).walks).toBe(false);
  });
  it("the same target again is not a walk", () => {
    expect(fa({ record: rec(["A"], lastA), targetUuid: "A", distanceM: 0 }).walks).toBe(false);
  });
  it("an unmeasurable walk is unknown unless overridden", () => {
    expect(fa({ record: rec(["A"], lastA), targetUuid: "B", distanceM: null }).walkUnknown).toBe(true);
    expect(fa({ record: rec(["A"], lastA), targetUuid: "B", distanceM: null, walkOverride: 5 })).toMatchObject({ walked: 5, walkUnknown: false });
  });
  it("a tokenless endpoint on either side is unknown — even tokenless → tokenless", () => {
    const lastNone = { weaponUuid: "W", tokenUuid: null };
    expect(fa({ record: rec([], lastNone), targetUuid: "B", distanceM: 2 }).walkUnknown).toBe(true);
    expect(fa({ record: rec(["A"], lastA), targetUuid: null, distanceM: 2 }).walkUnknown).toBe(true);
    expect(fa({ record: rec([], lastNone), targetUuid: null }).walkUnknown).toBe(true);
  });
});

describe("effectiveRecoil", () => {
  it("counts only under the current key", () => {
    expect(effectiveRecoil(key, key, 6)).toBe(6);
    expect(effectiveRecoil("c1:3:0", key, 6)).toBe(0);
    expect(effectiveRecoil(undefined, key, 6)).toBe(0);
  });
});
