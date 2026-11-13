// Maintenance overhead and mechanic labour (Rigger 2 p.18–19; docs/PLAN-vehicles-phase2.md 2b.5).
import { describe, it, expect } from "vitest";
import { overheadAmount, overheadPayment, assessMonth, catchUpProblems, mechanicLabour, stressPatch, lifestyleDiscount } from "../module/rules/vehicle-overhead-rules.mjs";
import { readFileSync, readdirSync } from "node:fs";

describe("overhead (p.18–19, Josie Cruise)", () => {
  const josie = [500000, 40000, 100000, 1250].map(v => overheadAmount(v, 0));
  const rows = josie.map(amount => ({ month: 3, amount }));
  it("1% of the cost value, rounded up: 6,413", () => {
    expect(josie).toEqual([5000, 400, 1000, 13]);
    expect(rows.reduce((t, r) => t + r.amount, 0)).toBe(6413);
  });
  it("+10 per Stress Point of the past month", () => expect(overheadAmount(40000, 3)).toBe(430));
  it("Middle → 6,213; 4 Karma → 4,413; Luxury → 3,413", () => {
    expect(overheadPayment(rows, { 3: lifestyleDiscount("middle") }).nuyen).toBe(6213);
    expect(overheadPayment(rows, {}, 4)).toMatchObject({ nuyen: 4413, karma: 4 });
    expect(overheadPayment(rows, { 3: lifestyleDiscount("luxury") }).nuyen).toBe(3413);
    expect(lifestyleDiscount("low")).toBe(0);
  });
  it("Karma never buys more than is due; the credit never exceeds the month", () => {
    expect(overheadPayment([{ month: 1, amount: 13 }], {}, 3)).toMatchObject({ karma: 1, nuyen: 0 });
    expect(overheadPayment([{ month: 1, amount: 13 }], { 1: 3000 })).toMatchObject({ discount: { 1: 13 }, nuyen: 0 });
  });
  it("closing a month: the record, and every older unpaid month missed once (+1 Stress each)", () => {
    const months = { 1: { paid: true }, 2: { paid: false, tx: "x" }, 3: { paid: false, missed: true } };
    const r = assessMonth(months, 4, { value: 40000, stress: 2 });
    expect(r.record).toMatchObject({ amount: 420, paid: false, missed: false });
    expect([r.missed, r.addStress]).toEqual([[2], 1]);
  });
  it("catch-up: a missed month needs the current month paid too", () => {
    const months = { 1: { missed: true }, 2: { paid: false } };
    expect(catchUpProblems(months, [1])).toEqual([1]);
    expect(catchUpProblems(months, [1, 2])).toEqual([]);
    expect(catchUpProblems({ 1: { missed: true }, 2: { paid: true } }, [1])).toEqual([]);
  });
});

describe("mechanic labour (p.19)", () => {
  it("Level 1: 100¥/h; past 8 h a day or 5 days a week at ×1.5", () => {
    expect(mechanicLabour(1, 16).cost).toBe(1600);
    expect(mechanicLabour(1, 16, { perDay: 12 })).toMatchObject({ regular: 12, overtime: 4, cost: 1800 });
    expect(mechanicLabour(1, 56, { daysPerWeek: 7 })).toMatchObject({ regular: 40, overtime: 16 });
  });
  it("Level 2: 50¥/h, Level 3: 25¥/h, no overtime", () => {
    expect(mechanicLabour(2, 20, { perDay: 12 }).cost).toBe(1000);
    expect(mechanicLabour(3, 20).cost).toBe(500);
  });
});

describe("Stress writers", () => {
  it("an increase raises this month's counter; a decrease doesn't", () => {
    expect(stressPatch({ before: 2, after: 5, counter: 1 })).toEqual({ "system.stress": 5, "flags.sr2e.overhead.stress": 4 });
    expect(stressPatch({ before: 5, after: 3, counter: 4 })["flags.sr2e.overhead.stress"]).toBe(4);
  });
  it("no code writes system.stress except through stressPatch", () => {
    const files = readdirSync("module", { recursive: true }).filter(f => f.endsWith(".mjs") && !f.includes("quench"));
    const offenders = files.filter(f => /["']system\.stress["']\s*:/.test(readFileSync(`module/${f}`, "utf8")) && !f.endsWith("vehicle-overhead-rules.mjs"));
    expect(offenders).toEqual([]);
  });
});
