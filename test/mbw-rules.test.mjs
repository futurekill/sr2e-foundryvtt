// Move-by-wire complications (docs/PLAN-cybertechnology-phase4.md; Cybertechnology pp.54–55).
import { describe, it, expect } from "vitest";
import { wareLevel, complicationDice, proposal, ccssRow, CCSS_ROWS, ccssRehab, seizureBoxes, tleTreatTN,
         periodSeconds, foldMbw, MONTH_S } from "../module/rules/mbw-rules.mjs";

let t = 0;
const ev = (type, key, payload = {}) => ({ type, key, at: ++t, ...payload });
const install = (k = "I1", itemId = "mbw", level = 2, since = 0) => ev("install", k, { itemId, level, since });
const test = (key, gen, n, successes = 2) => ev("test", key, { gen, n, successes, itemId: "mbw" });
const outcome = (key, testKey, result) => ev("outcome", key, { test: testKey, result, itemId: "mbw" });

describe("tables", () => {
  it("level, dice, proposal, period", () => {
    expect([wareLevel("move-by-wire:3"), wareLevel("wired-reflexes:2"), wareLevel("x")]).toEqual([3, 2, 0]);
    expect(complicationDice({ naturalBody: 4, wareBody: 3, naturalWillpower: 5, wareWillpower: 1 })).toBe(6);   // (4+2 + 6)/2
    expect([3, 2, 1, 0].map(proposal)).toEqual(["none", "none", "tle", "ccss"]);
    expect(periodSeconds(4)).toBe(3 * MONTH_S);
    expect(tleTreatTN(1)).toBe(8); expect(tleTreatTN(2)).toBe(10); expect(tleTreatTN(3)).toBe(null);
  });
  it("CCSS rows round down (user ruling), rehab, seizure staging", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(ccssRow)).toEqual([4, 3, 3, 3, 2, 2, 1, 1]);
    expect(CCSS_ROWS[3].loss.intelligence).toBe(2);
    expect(ccssRehab(3)).toEqual({ weeks: 7, cost: 350000 });
    expect(ccssRehab(8).weeks).toBe(5);
    expect([0, 1, 2, 3, 4, 9].map(seizureBoxes)).toEqual([3, 3, 1, 1, 0, 0]);
  });
});

describe("the schedule", () => {
  const P = periodSeconds(2);
  it("due slots, a big jump, rewinding", () => {
    const log = [install()];
    expect(foldMbw(log, P - 1).pendingSlots).toEqual([]);
    expect(foldMbw(log, 3 * P + 5).pendingSlots).toEqual([1, 2, 3]);
    log.push(test("T1", "I1", 1));
    expect(foldMbw(log, 3 * P).pendingSlots).toEqual([2, 3]);
    expect(foldMbw(log, P).pendingSlots).toEqual([]);   // rewound: test 1 stays, nothing else due
  });
  it("voiding an attempt frees its slot; a later slot doesn't mask an earlier void", () => {
    const log = [install(), test("T1a", "I1", 1), test("T2a", "I1", 2), ev("void", "V", { target: "T1a" })];
    let f = foldMbw(log, 2 * P);
    expect(f.pendingSlots).toEqual([1]);
    expect(f.nextAttempt(1)).toBe(2);
    log.push(test("T1b", "I1", 1));
    expect(foldMbw(log, 2 * P).pendingSlots).toEqual([]);
    expect(foldMbw([install(), test("T2", "I1", 2)], 2 * P - 1).pendingSlots).toEqual([1]);
  });
  it("one open generation; remove → install starts a fresh clock", () => {
    const log = [install("I1", "mbw", 2, 0), ev("remove", "R1", { install: "I1" }), install("I2", "mbw", 3, 10 * P)];
    const f = foldMbw(log, 10 * P + 1);
    expect(f.gen.key).toBe("I2");
    expect(f.pendingSlots).toEqual([]);
  });
});

describe("TLE-x and CCSS", () => {
  it("occurrences, treatment by reference, chronic at 3", () => {
    const log = [install(), test("T1", "I1", 1, 1), outcome("O1", "T1", "tle"), test("T2", "I1", 2, 1), outcome("O2", "T2", "tle")];
    let f = foldMbw(log, 0);
    expect(f.occurrences.map(o => o.number)).toEqual([1, 2]);
    expect(f.active).toBe(true);
    expect(f.nextTreat.key).toBe("O1");
    log.push(ev("tleTreatment", "TR1", { occurrence: "O1", tn: 8, success: true }));
    f = foldMbw(log, 0);
    expect(f.active).toBe(true);   // a late treatment of O1 never clears O2
    expect(f.nextTreat.key).toBe("O2");
    log.push(test("T3", "I1", 3, 1), outcome("O3", "T3", "tle"));
    expect(foldMbw(log, 0).chronic).toBe(true);
  });
  it("an episode expires with its occurrence's treatment and is never resurrected", () => {
    const log = [install(), test("T1", "I1", 1, 1), outcome("O1", "T1", "tle"), ev("episode", "E1", { on: true, reactionLoss: 4, occurrence: "O1" })];
    expect(foldMbw(log, 0).episode.reactionLoss).toBe(4);
    log.push(ev("tleTreatment", "TR1", { occurrence: "O1", tn: 8, success: true }));
    expect(foldMbw(log, 0).episode).toBe(null);
    log.push(test("T2", "I1", 2, 1), outcome("O2", "T2", "tle"));
    expect(foldMbw(log, 0).episode).toBe(null);
  });
  it("CCSS incidents keep their implant; recovery rows add up; DL4 zeroes Intelligence; voids cascade", () => {
    const log = [install(), test("T1", "I1", 1, 0), { ...outcome("O1", "T1", "ccss"), itemId: "A" },
      ev("ccssTreatment", "C1", { incident: "O1", weeks: 5 }), ev("ccssRecovery", "R1", { incident: "O1", row: 3 }),
      test("T2", "I1", 2, 0), { ...outcome("O2", "T2", "both"), itemId: "B" },
      ev("ccssTreatment", "C2", { incident: "O2", weeks: 5 }), ev("ccssRecovery", "R2", { incident: "O2", row: 4 })];
    let f = foldMbw(log, 0);
    expect([...f.disabledItems].sort()).toEqual(["A", "B"]);
    expect(f.loss).toEqual({ strength: 2, quickness: 2, willpower: 2, intelligence: 2 });
    expect(f.intelligenceZero).toBe(true);
    expect(f.occurrences.length).toBe(1);
    log.push(ev("void", "V", { target: "O2" }));
    f = foldMbw(log, 0);
    expect([...f.disabledItems]).toEqual(["A"]);
    expect(f.intelligenceZero).toBe(false);
    expect(f.occurrences.length).toBe(0);
  });
  it("lifecycle records can't be voided; a seizure needs its result", () => {
    const log = [install(), ev("void", "V", { target: "I1" }), ev("seizure", "S1", { boxes: 3 })];
    const f = foldMbw(log, 0);
    expect(f.gen.key).toBe("I1");
    expect(f.pendingSeizures.map(s => s.key)).toEqual(["S1"]);
    log.push(ev("seizureResult", "SR1", { seizure: "S1" }));
    expect(foldMbw(log, 0).pendingSeizures).toEqual([]);
  });
});
