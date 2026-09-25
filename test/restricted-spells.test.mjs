// Restricted-use spells (SR2E p.133, verified): exclusive casts as if Force +2,
// a reusable fetish +1, an expendable one +2; Drain at the normal Force; an
// exclusive spell shares concentration with nothing.
import { describe, it, expect } from "vitest";
import { restrictedForceBonus, spellForces, exclusiveConflict } from "../module/rules/sr2e-rules.mjs";

describe("restrictedForceBonus", () => {
  it("exclusive +2, reusable fetish +1, expendable fetish +2, none 0", () => {
    expect(["exclusive", "fetishReusable", "fetishExpendable", ""].map(restrictedForceBonus)).toEqual([2, 1, 2, 0]);
  });
});

describe("spellForces", () => {
  it("Neddy: learned 6, exclusive → cast at 6, works as 8", () => {
    expect(spellForces({ learnedForce: 6, actualForce: 6, restriction: "exclusive" })).toEqual({ actual: 6, effective: 8, bonus: 2 });
  });
  it("casting a restricted spell below its learned Force: Drain on the lower one", () => {
    expect(spellForces({ learnedForce: 6, actualForce: 4, restriction: "fetishReusable" })).toMatchObject({ actual: 4, effective: 5 });
  });
  it("a restricted spell cannot be cast above its learned Force", () => {
    expect(spellForces({ learnedForce: 6, actualForce: 9, restriction: "exclusive" }).actual).toBe(6);
  });
  it("an unrestricted spell is untouched", () => {
    expect(spellForces({ learnedForce: 1, actualForce: 5 })).toEqual({ actual: 5, effective: 5, bonus: 0 });
  });
});

describe("exclusiveConflict", () => {
  it("an exclusive spell plus anything else conflicts; alone it does not", () => {
    expect(exclusiveConflict([{ restriction: "exclusive" }])).toBe(false);
    expect(exclusiveConflict([{ restriction: "exclusive" }, { restriction: "" }])).toBe(true);
    expect(exclusiveConflict([{ restriction: "" }, { restriction: "fetishReusable" }])).toBe(false);
  });
});
