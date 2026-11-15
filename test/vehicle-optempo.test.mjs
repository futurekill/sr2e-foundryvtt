import { describe, it, expect } from "vitest";
import { optempoRate, optempoEligibility, overheadRefund } from "../module/rules/vehicle-overhead-rules.mjs";

describe("Optempo (R2 p.83–84)", () => {
  it("rate: value ÷ 20,000, nearest tenth", () => {
    expect(optempoRate(45000)).toBe(2.3);
    expect(optempoRate(20000)).toBe(1);
  });
  it("eligibility by mode", () => {
    expect(optempoEligibility("replace")).toMatchObject({ optempo: true, replacesOverhead: true });
    expect(optempoEligibility("split")).toMatchObject({ optempo: true, factor: 0.5, halvesOverhead: true });
    expect(optempoEligibility("frequent", { frequent: false }).optempo).toBe(false);
    expect(optempoEligibility("mileage", { km: 60, drone: true }).optempo).toBe(true);
    expect(optempoEligibility("mileage", { km: 150 }).optempo).toBe(false);
  });
  it("refunds: cash then credit, Karma only when no standing bill needs it, capped by the ledger", () => {
    // Two bills in month 3: A 600, B 400; credit 200 (pro rata 120/80); 1 Karma (500¥ coverage); cash 300.
    const receipt = { rows: [{ vehicleUuid: "A", month: 3, amount: 600 }, { vehicleUuid: "B", month: 3, amount: 400 }], amount: 300, karma: 1, discount: { 3: 200 } };
    const r = overheadRefund(receipt, new Set(["A|3"]));
    expect(r.credit).toBe(120);
    expect(r.cash + r.credit).toBeLessThanOrEqual(600);
    expect(r.karma).toBe(0);   // B still needs part of the point's coverage
    const both = overheadRefund(receipt, new Set(["A|3", "B|3"]));
    expect(both).toMatchObject({ cash: 300, credit: 200, karma: 1 });
    expect(overheadRefund(receipt, new Set(["A|3", "B|3"]), { cash: 300, credit: 200, karma: 1 })).toMatchObject({ cash: 0, credit: 0, karma: 0 });
  });
});
