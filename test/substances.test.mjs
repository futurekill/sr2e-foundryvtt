// The substance ledger fold (Shadowtech p.85–88, p.99). docs/PLAN-addiction.md.
import { describe, it, expect } from "vitest";
import { substanceState, orderEvents, nextStamp, addictionTnFor, stepId, HOUR, DAY, WEEK } from "../module/rules/substances.mjs";

// Kamikaze: Addiction 4P, Tolerance 2, Strength 4 (p.99). Body 4, Willpower 3.
const KAMI = { addiction: 4, tolerance: 2, strength: 4, P: true, M: false, name: "Kamikaze" };
const DUAL = { addiction: 3, tolerance: 2, strength: 5, P: true, M: true };
let seq = 0;
const ev = (type, t, extra = {}) => ({ v: 1, id: extra.id ?? `${type}${++seq}`, seq: ++seq, at: seq, t, type, drug: "kamikaze", ...extra });
const dose = (t, extra = {}) => ev("dose", t, { snapshot: KAMI, body: 4, willpower: 3, ...extra });
const test = (t, exposureId, kind, successes) => ev("test", t, { exposureId, kind, successes });
const S = (events, now) => substanceState(events, now);

describe("doses and ratings (p.87)", () => {
  it("every Strength-th dose adds +1 Addiction and Tolerance", () => {
    const e = [1, 2, 3, 4].map(i => dose(i * HOUR));
    const k = S(e, 5 * HOUR).drugs.kamikaze;
    expect(k.uses).toBe(4);
    expect([k.addiction, k.tolerance]).toEqual([5, 3]);
  });
  it("clean period: every 30 − Strength days without a dose, both −1, never below base", () => {
    const e = [1, 2, 3, 4].map(i => dose(i));
    const r = (days) => S(e, 4 + days * DAY).drugs.kamikaze;
    expect(r(25.9).addiction).toBe(5);
    expect([r(26).addiction, r(26).tolerance]).toEqual([4, 2]);
    expect(r(200).addiction).toBe(4);                        // floored at base
  });
  it("the next milestone skips no-op ticks (a clean boundary at base)", () => {
    expect(S([dose(0)], DAY).drugs.kamikaze.next).toBeNull();                       // at base, not addicted
    expect(S([1, 2, 3, 4].map(i => dose(i)), DAY).drugs.kamikaze.next?.kind).toBe("clean");   // above base
  });
  it("Strength ≥ 30 has no clean period", () => {
    const e = [dose(0, { snapshot: { ...KAMI, strength: 30 } })];
    expect(S(e, 1000 * DAY).drugs.kamikaze.next).toBeNull();
  });
});

describe("addiction, the dose window and withdrawal (p.87–88)", () => {
  it("a failed test addicts; missing Body × 4 h starts withdrawal; losses accrue weekly", () => {
    const d = dose(0, { id: "d1" });
    const e = [d, test(HOUR, "d1", "P", 0)];
    expect(S(e, 15 * HOUR).drugs.kamikaze.state).toBe("addicted");      // deadline 16 h
    const w = S(e, 16 * HOUR).drugs.kamikaze;
    expect(w.state).toBe("withdrawal");
    const two = S(e, HOUR + 2 * WEEK);
    expect(two.drugs.kamikaze.boxesLost).toBe(2);
    expect(two.essenceLost).toBe(1);
  });
  it("a success keeps the character clean; addiction is sticky", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 1)];
    expect(S(e, 2 * DAY).drugs.kamikaze.state).toBe("none");
    const e2 = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), dose(2 * HOUR, { id: "d2" }), test(3 * HOUR, "d2", "P", 5)];
    expect(S(e2, 4 * HOUR).drugs.kamikaze.addicted.P).toBe(true);
  });
  it("withdrawal: Addiction −1 per 24 h (≥ base); a dose ends it with +1", () => {
    const e = [dose(0, { id: "d1", snapshot: { ...KAMI, addiction: 2 } }), test(HOUR, "d1", "P", 0),
               ...[1, 2, 3].map(i => dose(HOUR + i, {}))];   // 4 uses → Addiction 3
    const base = S(e, 2 * HOUR).drugs.kamikaze;
    expect(base.addiction).toBe(3);
    const w = S(e, 2 * HOUR + 16 * HOUR + DAY).drugs.kamikaze;
    expect(w.state).toBe("withdrawal");
    expect(w.addiction).toBe(2);
    const relieved = S([...e, dose(3 * DAY)], 3 * DAY).drugs.kamikaze;
    expect(relieved.state).toBe("addicted");
    expect(relieved.addiction).toBe(3);                      // the rating +1
  });
  it("one extension per window adds Body hours", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("extend", 2 * HOUR, { windowId: "d1", dep: "P", successes: 2 })];
    expect(S(e, 19 * HOUR).drugs.kamikaze.state).toBe("addicted");      // 16 + 4
    expect(S(e, 20 * HOUR).drugs.kamikaze.state).toBe("withdrawal");
    const twice = [...e, ev("extend", 3 * HOUR, { windowId: "d1", dep: "P", successes: 2 })];
    expect(S(twice, 20 * HOUR).steps.filter(s => s.type === "extended")).toHaveLength(1);
    const stale = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), dose(2 * HOUR, { id: "d2" }),
                   ev("extend", 3 * HOUR, { windowId: "d1", dep: "P", successes: 3 })];
    expect(S(stale, 3 * HOUR).steps.some(s => s.type === "extended")).toBe(false);
  });
  it("a dual addiction: the shorter window wins (Willpower 3 → 12 h)", () => {
    const e = [dose(0, { id: "d1", snapshot: DUAL }), test(HOUR, "d1", "P", 0), test(HOUR, "d1", "M", 0)];
    expect(S(e, 11.9 * HOUR).drugs.kamikaze.state).toBe("addicted");
    expect(S(e, 12 * HOUR).drugs.kamikaze.state).toBe("withdrawal");
  });
  it("addicted + immune → withdrawal, and an immune dose doesn't end it", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), test(HOUR, "d1", "tolerance", 0), dose(2 * HOUR)];
    const k = S(e, 3 * HOUR).drugs.kamikaze;
    expect(k.immune).toBe(true);
    expect(k.state).toBe("withdrawal");
  });
});

describe("recovery and rest (p.87–88)", () => {
  const addicted = () => [dose(0, { id: "d1", snapshot: { ...KAMI, strength: 1 } }), test(HOUR, "d1", "P", 0)];
  // Strength 1: the first dose already raised Addiction to 5 (base 4).
  it("recovery: −1 per 3 days to base, then rest for base weeks, one box back per 3 days, then cured", () => {
    // Kept addicted by a dose every 12 h for two weeks (Strength 99: no rises,
    // no clean period); the GM sets Addiction 6 before recovery starts.
    const snap = { ...KAMI, strength: 99 };
    const R = 14 * DAY + HOUR;
    const e = [dose(0, { id: "k0", snapshot: snap }), test(HOUR, "k0", "P", 0)];   // built in time order
    for (let i = 1; i < 28; i++) e.push(dose(i * 12 * HOUR, { id: `k${i}`, snapshot: snap }));
    e.push(ev("edit", R, { patch: { addiction: 6 } }), ev("recovery", R, { successes: 1 }));
    const at = (t) => S(e, t).drugs.kamikaze;
    expect(at(R).boxesLost).toBe(2);                          // two weeks addicted
    expect(at(R + 5 * DAY).state).toBe("recovery");          // 6 → 5 at 3 days
    const rest = at(R + 6 * DAY);                             // 5 → 4 = base
    expect(rest.state).toBe("rest");
    expect(rest.addicted.P).toBe(false);
    expect(at(R + 6 * DAY + 6 * DAY).boxesLost).toBe(0);      // one box per 3 days
    expect(at(R + 6 * DAY + 4 * WEEK - 1).state).toBe("rest");
    expect(at(R + 6 * DAY + 4 * WEEK).state).toBe("none");
  });
  it("weekly losses pause during recovery and rest", () => {
    const e = [...addicted(), ev("recovery", 3 * WEEK + HOUR, { successes: 1 })];
    expect(S(e, 20 * WEEK).drugs.kamikaze.essenceLost).toBe(1.5);
  });
  it("entering recovery at base goes straight to rest", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("recovery", 2 * HOUR, { successes: 1 })];
    expect(S(e, 3 * HOUR).drugs.kamikaze.state).toBe("rest");
  });
  it("a failed recovery changes nothing; a dose in rest relapses with the old types and +1", () => {
    const fail = [...addicted(), ev("recovery", 2 * HOUR, { successes: 0 })];
    expect(S(fail, 3 * HOUR).drugs.kamikaze.state).toBe("addicted");
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("recovery", 2 * HOUR, { successes: 1 }), dose(DAY, { id: "d9" })];
    const k = S(e, DAY).drugs.kamikaze;
    expect(k.state).toBe("addicted");
    expect(k.addicted).toEqual({ P: true, M: false });
    expect(k.addiction).toBe(5);
  });
  it("one substance at a time", () => {
    const other = (t, extra) => ({ ...ev("dose", t, extra), drug: "zen", snapshot: { addiction: 2, tolerance: 1, strength: 9, P: false, M: true } });
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), other(0, { id: "z1" }),
               { ...test(HOUR, "z1", "M", 0), drug: "zen" },
               ev("recovery", 2 * HOUR, { successes: 1 }),
               { ...ev("recovery", 3 * HOUR, { successes: 1 }), drug: "zen" }];
    const s = S(e, 4 * HOUR);
    expect(s.drugs.kamikaze.state).toBe("rest");
    expect(s.drugs.zen.state).not.toBe("recovery");
  });
});

describe("therapy (p.88)", () => {
  it("cleansing clears P and returns boxes; M remains", () => {
    const e = [dose(0, { id: "d1", snapshot: DUAL }), test(HOUR, "d1", "P", 0), test(HOUR, "d1", "M", 0),
               ev("therapy", 3 * WEEK, { kind: "cleansePhysical" })];
    const k = S(e, 3 * WEEK).drugs.kamikaze;
    expect(k.addicted).toEqual({ P: false, M: true });
    expect(k.boxesLost).toBe(0);
    expect(k.state).not.toBe("none");
  });
  it("mental only: no effect", () => {
    const e = [dose(0, { id: "d1", snapshot: { ...DUAL, P: false } }), test(HOUR, "d1", "M", 0),
               ev("therapy", 2 * WEEK, { kind: "cleansePhysical" })];
    const s = S(e, 2 * WEEK);
    expect(s.steps.at(-1).type).toBe("therapyNoEffect");
    expect(s.drugs.kamikaze.boxesLost).toBeGreaterThan(0);
  });
});

describe("Kamikaze wasting and implant failure (p.99)", () => {
  it("⌊uses ÷ 4⌋ boxes off both tracks; implants fail at ⌊Body ÷ 2⌋ uses, latched", () => {
    const e = Array.from({ length: 8 }, (_, i) => dose(i * DAY, { body: 6 }));
    const s = S(e, 9 * DAY);
    expect(s.wasting).toBe(2);
    expect(s.implantsFailed).toBe(true);
    expect(S(e.slice(0, 2), 3 * DAY).implantsFailed).toBe(false);   // Body 6 → 3 uses
    const fixed = [...e, ev("edit", 10 * DAY, { drug: null, patch: { restoreImplants: true } })];
    expect(S(fixed, 11 * DAY).implantsFailed).toBe(false);
  });
});

describe("ordering, clocks and replay", () => {
  it("one big jump equals stepping through (forced intermediate advances)", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0)];
    // A test against an unknown exposure is skipped AFTER advancing time, so it
    // forces the fold to stop at each day without changing anything.
    const stepped = [...e];
    for (let t = 2 * HOUR; t < 5 * WEEK; t += DAY / 3) stepped.push(test(t, "nope", "P", 0));
    const norm = (x) => { const k = { ...x.drugs.kamikaze }; delete k.next; return k; };
    expect(norm(S(stepped, 5 * WEEK))).toEqual(norm(S(e, 5 * WEEK)));
    expect(S(e, 5 * WEEK).drugs.kamikaze.weeks).toBe(4);   // addicted at 1 h
  });
  it("permuted arrival gives the same state; seq orders a frozen world time", () => {
    const e = [dose(0, { id: "d1" }), test(0, "d1", "P", 0), dose(0, { id: "d2" })];
    const a = S(e, DAY), b = S([...e].reverse(), DAY);
    expect(b.drugs).toEqual(a.drugs);
    expect(orderEvents([...e].reverse()).map(x => x.id)).toEqual(["d1", e[1].id, "d2"]);
  });
  it("an event stamped in the past (a rewind) never runs time backwards", () => {
    const e = [dose(10 * DAY, { id: "d1" }), test(10 * DAY, "d1", "P", 0), dose(DAY, { id: "late" })];
    const k = S(e, 11 * DAY).drugs.kamikaze;
    expect(k.lastDose).toBe(10 * DAY);            // the late event is clamped to the clock
  });
  it("nextStamp: t never below the clock or the last event; seq above everything seen", () => {
    expect(nextStamp([{ t: 50, seq: 7 }], 10, 40)).toEqual({ t: 50, seq: 8 });
    expect(nextStamp([], 100, 40)).toEqual({ t: 100, seq: 1 });
  });
  it("unknown versions and types are skipped", () => {
    const s = S([{ v: 2, type: "dose", drug: "x", t: 0 }, { v: 1, type: "nope", drug: "x", t: 0 }], 0);
    expect(s.skipped).toBe(2);
    expect(Object.keys(s.drugs)).toHaveLength(0);
  });
});

describe("penalties and report ids", () => {
  it("TN by state: withdrawal +3 (+6 spells), recovery +2 (+4), rest +1 (+2)", () => {
    expect([addictionTnFor("withdrawal"), addictionTnFor("withdrawal", "spell")]).toEqual([3, 6]);
    expect([addictionTnFor("recovery"), addictionTnFor("rest", "spell"), addictionTnFor("none")]).toEqual([2, 2, 0]);
  });
  it("step ids change with content", () => {
    const a = stepId({ drug: "k", type: "week", t: 5, boxesLost: 1 });
    expect(stepId({ drug: "k", type: "week", t: 5, boxesLost: 1 })).toBe(a);
    expect(stepId({ drug: "k", type: "week", t: 5, boxesLost: 2 })).not.toBe(a);
    expect(stepId({ drug: "k", type: "week", t: 5.25 })).not.toContain(".");
  });
});

describe("boundaries (Codex stage-1 review)", () => {
  it("fractional clocks terminate and pay the right weeks", () => {
    // The original repro: 0.001 s accrued, paused in a long recovery, relapse at 90,000,000.
    const e = [dose(0, { id: "d1", snapshot: { ...KAMI, addiction: 0, strength: 99 } }), test(0.001, "d1", "P", 0),
               ev("edit", 0.002, { patch: { addiction: 400 } }), ev("recovery", 0.002, { successes: 1 }),
               dose(90000000, { id: "d2", snapshot: { ...KAMI, addiction: 0, strength: 99 } })];
    const relapsed = S(e, 90000000).drugs.kamikaze;
    expect(relapsed.state).toBe("addicted");
    expect(S(e, 90000000 + 3 * WEEK).drugs.kamikaze.weeks).toBe(3);
  });
  it("a withdrawal entered exactly on a 24 h boundary drops then (Body 6: 24 h window)", () => {
    const snap = { ...KAMI, addiction: 2, strength: 1 };        // → 3
    const e = [dose(0, { id: "d1", snapshot: snap, body: 6 }), test(HOUR, "d1", "P", 0)];
    expect(S(e, 24 * HOUR).drugs.kamikaze.addiction).toBe(2);
  });
  it("a new dependency found during rest ends the rest; a passing test changes nothing", () => {
    const e = [dose(0, { id: "d1", snapshot: DUAL }), test(HOUR, "d1", "P", 0),
               ev("recovery", 2 * HOUR, { successes: 1 }), test(3 * HOUR, "d1", "M", 0)];
    const k = S(e, 4 * HOUR).drugs.kamikaze;
    expect(k.state).toBe("addicted");
    expect(k.addicted.M).toBe(true);
    const imm = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), test(HOUR, "d1", "tolerance", 0),
                 ev("edit", 2 * HOUR, { patch: { addiction: 9 } }), ev("recovery", 2 * HOUR, { successes: 1 }),
                 test(3 * HOUR, "d1", "P", 4)];
    expect(S(imm, 3 * HOUR).drugs.kamikaze.state).toBe("recovery");
  });
  it("therapy keeps the dose window; an import keeps its current ratings and Kamikaze history", () => {
    const e = [dose(0, { id: "d1", snapshot: DUAL }), test(HOUR, "d1", "P", 0),
               ev("therapy", 2 * HOUR, { kind: "cleansePhysical" }), test(3 * HOUR, "d1", "M", 0)];
    expect(S(e, 12 * HOUR).drugs.kamikaze.state).toBe("withdrawal");   // Willpower 3 → 12 h
    const imp = [ev("edit", 100 * DAY, { patch: { baseline: { addiction: 4, tolerance: 2, strength: 5, P: true, lastDose: 0, kamikazeUses: 8 },
                                                    addiction: 7 } })];
    const s = S(imp, 100 * DAY);
    expect(s.drugs.kamikaze.addiction).toBe(7);
    expect(s.wasting).toBe(2);
  });
  it("a withdrawal boundary never applies twice across a same-instant re-entry", () => {
    const e = [dose(0, { id: "d1", snapshot: { ...KAMI, strength: 99 } }), test(HOUR, "d1", "P", 0),
               ev("edit", 2 * HOUR, { patch: { addiction: 8 } })];
    expect(S(e, 24 * HOUR).drugs.kamikaze.addiction).toBe(7);
    const re = [...e, ev("recovery", 24 * HOUR, { successes: 1 }), test(24 * HOUR, "d1", "tolerance", 0)];
    const k = S(re, 24 * HOUR).drugs.kamikaze;
    expect(k.state).toBe("withdrawal");
    expect(k.addiction).toBe(7);
  });
  it("a baseline box edit in rest isn't restored retroactively; kamikazeUses wins", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("recovery", 2 * HOUR, { successes: 1 }),
               ev("edit", 20 * DAY, { patch: { baseline: { boxesLost: 3 } } })];
    expect(S(e, 20 * DAY).drugs.kamikaze.boxesLost).toBe(3);
    const imp = [ev("edit", 0, { patch: { baseline: { addiction: 4, tolerance: 2, strength: 4, P: true, uses: 1, kamikazeUses: 8 } } })];
    expect(S(imp, 0).wasting).toBe(2);
  });
  it("ids order by code unit, not locale", () => {
    expect(orderEvents([{ id: "a", seq: 1, at: 1 }, { id: "A", seq: 1, at: 1 }]).map(x => x.id)).toEqual(["A", "a"]);
  });
  it("a withdrawal and a week on the same instant: the loss is still paid", () => {
    const k0 = [dose(0, { id: "a0" }), test(0, "a0", "P", 0), dose(WEEK - 16 * HOUR, { id: "a1" })];
    const k = S(k0, WEEK).drugs.kamikaze;
    expect(k.state).toBe("withdrawal");
    expect(k.weeks).toBe(1);
  });
  it("the window is the LATEST dose's; a late failure withdraws at once, never back-dated", () => {
    const e = [dose(0, { id: "d1" }), dose(10 * HOUR, { id: "d2" }), test(11 * HOUR, "d1", "P", 0)];
    expect(S(e, 25.9 * HOUR).drugs.kamikaze.state).toBe("addicted");
    expect(S(e, 26 * HOUR).drugs.kamikaze.state).toBe("withdrawal");
    const late = [dose(0, { id: "d1" }), test(3 * DAY, "d1", "P", 0)];
    const s = S(late, 3 * DAY);
    expect(s.drugs.kamikaze.state).toBe("withdrawal");
    expect(s.steps.find(x => x.type === "withdrawal").t).toBe(3 * DAY);
    expect(s.drugs.kamikaze.accrued).toBeGreaterThanOrEqual(0);
  });
  it("clean boundaries are consumed at base: a later edit isn't eaten retroactively", () => {
    const e = [dose(0, { id: "d1", snapshot: { ...KAMI, strength: 5 } }),
               ev("edit", 100 * DAY, { patch: { addiction: 8, tolerance: 6 } })];
    const k = S(e, 100 * DAY).drugs.kamikaze;
    expect([k.addiction, k.tolerance]).toEqual([8, 6]);
    expect(S(e, 125 * DAY).drugs.kamikaze.addiction).toBe(7);   // the next boundary after the edit
  });
  it("withdrawal drops count 24 h from the last dose; an immune dose resets that clock", () => {
    const snap = { ...KAMI, addiction: 2, strength: 1 };        // first dose → 3
    const e = [dose(0, { id: "d1", snapshot: snap }), test(HOUR, "d1", "P", 0)];
    expect(S(e, 23.9 * HOUR).drugs.kamikaze.addiction).toBe(3);
    expect(S(e, 24 * HOUR).drugs.kamikaze.addiction).toBe(2);   // at 24 h, not 16 + 24
    const imm = [...e, test(HOUR, "d1", "tolerance", 0), dose(20 * HOUR, { id: "d2", snapshot: snap })];
    const k = S(imm, 43 * HOUR).drugs.kamikaze;                 // the dose at 20 h (Strength 1: → 4)
    expect(k.state).toBe("withdrawal");
    expect(k.addiction).toBe(4);                                // next drop at 44 h
    expect(S(imm, 44 * HOUR).drugs.kamikaze.addiction).toBe(3);
  });
  it("a clean tick reaching base during recovery starts rest at once", () => {
    const snap = { ...KAMI, strength: 29 };                     // clean every day
    const e = [dose(0, { id: "d1", snapshot: snap }), test(HOUR, "d1", "P", 0),
               ev("edit", 2 * HOUR, { patch: { addiction: 5 } }), ev("recovery", 2 * HOUR, { successes: 1 })];
    expect(S(e, DAY).drugs.kamikaze.state).toBe("rest");        // day 1 clean tick → base
  });
  it("immunity during recovery → withdrawal", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("edit", 2 * HOUR, { patch: { addiction: 9 } }),
               ev("recovery", 2 * HOUR, { successes: 1 }), test(3 * HOUR, "d1", "tolerance", 0)];
    expect(S(e, 3 * HOUR).drugs.kamikaze.state).toBe("withdrawal");
  });
  it("a physical-only addiction cleansed in rest doesn't relapse on a dose", () => {
    const e = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("recovery", 2 * HOUR, { successes: 1 }),
               ev("therapy", 3 * HOUR, { kind: "cleansePhysical" }), dose(DAY, { id: "d2" })];
    const k = S(e, DAY).drugs.kamikaze;
    expect(k.state).toBe("rest");
    expect(k.addicted).toEqual({ P: false, M: false });
  });
  it("a baseline import sets history; clearing addiction mid-recovery ends it", () => {
    const e = [ev("edit", 0, { patch: { baseline: { addiction: 4, tolerance: 2, strength: 4, P: true, uses: 7, boxesLost: 3, essenceLost: 1.5 } } })];
    const s = S(e, 0);
    expect([s.drugs.kamikaze.uses, s.monitorLoss, s.essenceLost]).toEqual([7, 3 + 1, 1.5]);   // + ⌊7 ÷ 4⌋ wasting
    const r = [dose(0, { id: "d1" }), test(HOUR, "d1", "P", 0), ev("edit", 2 * HOUR, { patch: { addiction: 9 } }),
               ev("recovery", 2 * HOUR, { successes: 1 }), ev("edit", 3 * HOUR, { patch: { clearAddiction: true } })];
    expect(S(r, 4 * HOUR).drugs.kamikaze.state).toBe("none");
  });
});
