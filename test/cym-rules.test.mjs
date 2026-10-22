// Cybermancy (docs/PLAN-cybertechnology-phase6.md; Cybertechnology pp.78–84).
import { describe, it, expect } from "vitest";
import { band, survivalTN, cdsBand, cymWillpower, cymSocial, magicSurcharge, overflowMax, cancerDevelops,
         cdsTreatTN, cdsRecoveryDays, foldCym, DAY_S } from "../module/rules/cym-rules.mjs";
import { MONTH_S } from "../module/rules/mbw-rules.mjs";

describe("bands and tables (pp.79, 83)", () => {
  it("one rounding rule", () => {
    expect([0, 0.01, 0.5, 0.51, 0.55, 1.05, 3.55, 4.01].map(band)).toEqual([0, 1, 1, 2, 2, 3, 8, 9]);
  });
  it("survival TN: 4, 6, +2 per further .5", () => {
    expect([0.05, 0.5, 1.0, 1.05].map(survivalTN)).toEqual([4, 4, 6, 8]);
  });
  it("the CDS table, and 8 + 1 per further .5 below −3.5", () => {
    expect(cdsBand(0)).toBe(null);
    expect([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5].map(e => [cdsBand(e).months, cdsBand(e).tn]))
      .toEqual([[6, 3], [6, 4], [6, 5], [4, 5], [4, 6], [3, 6], [2, 6]]);
    expect([cdsBand(3.55).tn, cdsBand(4.01).tn, cdsBand(4.01).months]).toEqual([8, 9, 2]);
  });
});

describe("Willpower (p.82)", () => {
  it("loss per half point, up to 4 back, never above the rating before", () => {
    expect(cymWillpower(5, 0.75, 5)).toBe(5);
    expect(cymWillpower(6, 3, 5)).toBe(4);       // advanced after; restore capped by willpowerBefore
    expect(cymWillpower(3, 4, 3)).toBe(1);       // floor 1
    expect(cymWillpower(5, 0, 5)).toBe(5);
  });
});

describe("social, magic, overflow, cancer, CDS treatment", () => {
  it("social with the part below −2 doubled (p.83)", () => {
    expect([0.3, 2, 2.2, 3, 3.5].map(cymSocial)).toEqual([1, 2, 3, 4, 5]);
  });
  it("magic surcharge and the healing example (p.80)", () => {
    expect(magicSurcharge(1.3)).toBe(3);
    expect(10 - 0 + magicSurcharge(1.3)).toBe(13);
  });
  it("overflow halved rounding up; cancer is strictly less; treatment TN floor; recovery", () => {
    expect([overflowMax(5), overflowMax(4)]).toEqual([8, 7]);
    expect([cancerDevelops(5, 0, 3), cancerDevelops(6, 0, 3), cancerDevelops(5, 1, 3)]).toEqual([true, false, false]);
    expect([cdsTreatTN(0), cdsTreatTN(3), cdsTreatTN(9)]).toEqual([8, 5, 2]);
    expect([cdsRecoveryDays(2), cdsRecoveryDays(9)]).toEqual([5, 0]);
  });
});

const ev = (key, type, p = {}) => ({ key, type, at: 0, ...p });
const established = (wt = 0) => [
  ev("cym:op:a", "op", { opId: "a", wt }),
  ev("cym:op-roll:a:1", "opRoll", { opId: "a", survived: true, wt }),
  ev("cym:op-done:a", "opDone", { opId: "a", wt, willpowerBefore: 5, nextRefill: wt + 10 * DAY_S, nextCds: wt + 6 * MONTH_S })
];

describe("foldCym", () => {
  it("the first op establishes; later ops append without resetting", () => {
    const ev2 = [...established(), ev("cym:op:b", "op", { opId: "b", wt: 50 }), ev("cym:op-done:b", "opDone", { opId: "b", wt: 50, willpowerBefore: 3, nextRefill: 999 })];
    const f = foldCym(ev2, 0);
    expect(f.active).toBe(true);
    expect(f.established.willpowerBefore).toBe(5);
    expect(f.nextRefill).toBe(10 * DAY_S);
  });
  it("due slots after a jump; a rewind refuses", () => {
    expect(foldCym(established(), 9 * DAY_S).refillDue).toBe(null);
    expect(foldCym(established(), 40 * DAY_S).refillDue).toEqual({ n: 1, dueAt: 10 * DAY_S });
    const r1 = ev("cym:refill:1:1", "refill", { n: 1, outcome: "refilled", nextDue: 20 * DAY_S, wt: 40 * DAY_S });
    expect(foldCym([...established(), r1], 40 * DAY_S).refillDue).toEqual({ n: 2, dueAt: 20 * DAY_S });   // next one already due
    expect(foldCym([...established(), r1], 15 * DAY_S).refillDue).toBe(null);
  });
  it("only the latest resolved slot is voidable; voiding reopens it", () => {
    const r1 = ev("cym:refill:1:1", "refill", { n: 1, outcome: "refilled", nextDue: 20 * DAY_S, wt: 11 * DAY_S });
    const r2 = ev("cym:refill:2:1", "refill", { n: 2, outcome: "refilled", nextDue: 30 * DAY_S, wt: 21 * DAY_S });
    const all = [...established(), r1, r2];
    const f = foldCym(all, 25 * DAY_S);
    expect(f.voidable.map(e => e.key)).toEqual(["cym:refill:2:1"]);
    const refused = foldCym([...all, ev("cym:void:cym:refill:1:1", "void", { target: "cym:refill:1:1" })], 25 * DAY_S);
    expect(refused.refillResolved).toBe(2);
    const reopened = foldCym([...all, ev("cym:void:cym:refill:2:1", "void", { target: "cym:refill:2:1", wt: 25 * DAY_S })], 25 * DAY_S);
    expect(reopened.refillDue).toEqual({ n: 2, dueAt: 20 * DAY_S });
  });
  it("death stops schedules, is never voidable, and revive restores", () => {
    const died = ev("cym:refill:1:1", "refill", { n: 1, outcome: "died", wt: 11 * DAY_S });
    const all = [...established(), died, ev("cym:void:cym:refill:1:1", "void", { target: "cym:refill:1:1" })];
    const f = foldCym(all, 100 * DAY_S);
    expect([f.dead, f.refillDue, f.voidable.length]).toEqual([true, null, 0]);
    const back = foldCym([...all, ev("cym:revive:1", "revive", { wt: 12 * DAY_S })], 100 * DAY_S);
    expect(back.dead).toBe(false);
  });
  it("a CDS failure while CDS is active keeps the first deathAt; a reversal ends it", () => {
    const c1 = ev("cym:cds:1:1", "cds", { n: 1, failed: true, deathAt: 500, nextDue: 1000, wt: 100 });
    const c2 = ev("cym:cds:2:1", "cds", { n: 2, failed: true, deathAt: 900, nextDue: 2000, wt: 1000 });
    expect(foldCym([...established(), c1, c2], 1000).cds.deathAt).toBe(500);
    const t = ev("cym:cds-treat:1:1", "cdsTreat", { outcome: "reversed", recoveryUntil: 1300, wt: 1100 });
    const f = foldCym([...established(), c1, c2, t], 1200);
    expect([f.cds, f.treatments, f.recoveryUntil]).toEqual([null, 1, 1300]);
  });
  it("suspend/resume with fixed dates; nothing due while suspended", () => {
    const s = ev("cym:suspend:0", "suspend", { wt: 5 * DAY_S });
    expect(foldCym([...established(), s], 50 * DAY_S).refillDue).toBe(null);
    const r = ev("cym:resume:1", "resume", { wt: 60 * DAY_S, nextRefill: 60 * DAY_S, nextCds: 70 * DAY_S });
    const f = foldCym([...established(), s, r, r], 60 * DAY_S);   // reconciled twice: same key, same fold
    expect([f.suspended, f.refillDue, f.nextCds]).toEqual([false, { n: 1, dueAt: 60 * DAY_S }, 70 * DAY_S]);
  });
  it("the op roll is voidable only until charged; a cancelled op doesn't establish", () => {
    const evs = established().slice(0, 2);
    expect(foldCym(evs, 0).voidable.map(e => e.key)).toEqual(["cym:op-roll:a:1"]);
    expect(foldCym(evs, 0, { a: { charged: true } }).voidable).toEqual([]);
    expect(foldCym(evs, 0).incomplete.map(o => o.opId)).toEqual(["a"]);
    const cancelled = [...evs, ev("cym:op-cancel-intent:a", "opCancelIntent", { opId: "a" }), ev("cym:op-cancelled:a", "opCancelled", { opId: "a" })];
    expect([foldCym(cancelled, 0).active, foldCym(cancelled, 0).incomplete.length]).toEqual([false, 0]);
  });
  it("overflow: survived voidable, died lethal", () => {
    const ok = ev("cym:overflow-out:r:1", "overflowOut", { receipt: "r", outcome: "survived", wt: 1 });
    const dead = ev("cym:overflow-out:r:2", "overflowOut", { receipt: "r", outcome: "died", wt: 2 });
    expect(foldCym([...established(), ok], 3).voidable.map(e => e.key)).toEqual(["cym:overflow-out:r:1"]);
    const f = foldCym([...established(), ok, dead], 3);
    expect([f.dead, f.overflowOut("r").outcome]).toEqual([true, "died"]);
  });
});
