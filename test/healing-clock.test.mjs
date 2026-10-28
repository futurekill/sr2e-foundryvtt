import { describe, it, expect } from "vitest";
import { clockChanges, courseValid, dueEvents, lethalOverflow, bleedTicks, stunSuccesses, stunBoxSeconds,
         goldenHour, emptyState, normalize, BLEED_S, HOUR } from "../module/rules/healing-clock-rules.mjs";

// docs/PLAN-healing-clock.md; SR2E core p.111–115.
const mon = (phys, over = 0, stun = 0) => ({ phys, over, stun });
const withCourses = () => {
  const st = emptyState();
  st.physical = { id: "p", kind: "natural", level: "Serious", rev: 0, dueAt: 1000 };
  st.stun = { id: "s", stunRev: 0, restGen: 0, successes: 2, target: 3, dueAt: 500 };
  return st;
};

describe("clockChanges (the hook)", () => {
  it("damage voids both courses, keeps the Stun cap and opens a wound episode", () => {
    const { state, voided } = clockChanges(withCourses(), mon(6, 0, 4), mon(7, 0, 4), 100, "A");
    expect(voided.sort()).toEqual(["physical", "stun"]);
    expect(state.stunCap).toBe(2);
    expect(state.injury.lastAt).toBe(100);
  });
  it("Physical healing leaves resting Stun recovery alone; a Stun change leaves Physical healing alone", () => {
    const a = clockChanges(withCourses(), mon(6, 0, 4), mon(3, 0, 4), 100, "A");
    expect(a.voided).toEqual(["physical"]);
    expect(courseValid(a.state, "stun")).toBe(true);
    const b = clockChanges(withCourses(), mon(6, 0, 4), mon(6, 0, 3), 100, "A");
    expect(b.voided).toEqual(["stun"]);
    expect(courseValid(b.state, "physical")).toBe(true);
  });
  it("a change that comes back to the same value still voids (revisions, not values)", () => {
    let st = withCourses();
    st = clockChanges(st, mon(6), mon(7), 1, "A").state;
    st.physical = { id: "p2", kind: "natural", level: "Deadly", rev: st.rev.phys, dueAt: 9 };
    st = clockChanges(st, mon(7), mon(6), 2, "A").state;
    expect(st.physical).toBeNull();
  });
  it("bleeding episodes: start at the injury, end at 0, re-injury after stabilizing bleeds from now", () => {
    let st = clockChanges(null, mon(10, 0), mon(10, 2), 50, "A").state;
    expect(st.bleed).toMatchObject({ cursor: 50, stable: null });
    st.bleed.stable = "aid";
    st = clockChanges(st, mon(10, 2), mon(10, 3), 900, "A").state;
    expect(st.bleed).toMatchObject({ cursor: 900, stable: null });
    st = clockChanges(st, mon(10, 3), mon(6, 0), 950, "A").state;
    expect(st.bleed).toBeNull();
  });
  it("Physical reaching 0 ends the wound episode; Stun reaching 0 clears the cap", () => {
    const st = { ...emptyState(), injury: { firstAt: 1, lastAt: 2 }, stunCap: 1 };
    const out = clockChanges(st, mon(1, 0, 1), mon(0, 0, 0), 5, "A").state;
    expect(out.injury).toBeNull();
    expect(out.stunCap).toBeNull();
  });
});

describe("dueEvents (chronological order across a time jump)", () => {
  it("a Stun box due before the first tick lands first; ticks follow", () => {
    const st = normalize({ stun: { stunRev: 0, restGen: 0, dueAt: 5 * 60 }, bleed: { cursor: 0, stable: null, lethal: false } });
    const ev = dueEvents(st, 20 * 60);
    expect(ev.map(e => e.kind)).toEqual(["stun", "tick", "tick"]);
  });
  it("a tie puts the completion first; a stabilized episode owes nothing", () => {
    const st = normalize({ stun: { stunRev: 0, restGen: 0, dueAt: BLEED_S }, bleed: { cursor: 0, stable: null } });
    expect(dueEvents(st, BLEED_S).map(e => e.kind)).toEqual(["stun", "tick"]);
    st.bleed.stable = "aid";
    expect(dueEvents(st, 10 * BLEED_S).map(e => e.kind)).toEqual(["stun"]);
  });
});

describe("small rules", () => {
  it("death past natural Body (p.111), or the cybermantic limit", () => {
    expect(lethalOverflow(5)).toBe(6);
    expect(lethalOverflow(5, 8)).toBe(9);
  });
  it("10-minute ticks; a rewound clock owes nothing", () => {
    expect(bleedTicks(0, 25 * 60)).toBe(2);
    expect(bleedTicks(1000, 10)).toBe(0);
  });
  it("Stun: 60 min ÷ successes; an interrupted re-roll is capped (p.112)", () => {
    expect(stunBoxSeconds(3)).toBe(1200);
    expect(stunSuccesses(5, 2)).toBe(2);
    expect(stunSuccesses(1, null)).toBe(1);
  });
  it("golden hour (p.115): unknown, fresh, old, mixed", () => {
    expect(goldenHour(null, 0).known).toBe(false);
    expect(goldenHour({ firstAt: 0, lastAt: 0 }, HOUR).old).toBe(false);
    expect(goldenHour({ firstAt: 0, lastAt: 0 }, HOUR + 1)).toMatchObject({ old: true, mixed: false });
    expect(goldenHour({ firstAt: 0, lastAt: HOUR }, HOUR + 1)).toMatchObject({ old: true, mixed: true });
  });
});

import { applyPending } from "../module/rules/healing-clock-rules.mjs";
describe("recorded stabilization (Codex code reviews 3–4)", () => {
  it("aid then care keep aid's time; care ending resumes at its own time", () => {
    const b = applyPending({ cursor: 0, stable: null, pending: [{ kind: "care", at: 1200 }, { kind: "aid", at: 600 }] }, 1200);
    expect(b).toMatchObject({ stable: "care", pending: [] });
    expect(applyPending({ cursor: 0, stable: "aid", pending: [{ kind: null, at: 900 }] }, 900)).toMatchObject({ stable: null, cursor: 900 });
  });
  it("new damage while a stabilization waits: the old one keeps its time, the new wound bleeds from now", () => {
    const st = { ...emptyState(), bleed: { id: "b", cursor: 0, stable: null, pending: [{ kind: "aid", at: 600 }] } };
    const out = clockChanges(st, mon(10, 1), mon(10, 2), 1800, "A").state;
    expect(out.bleed.pending).toEqual([{ kind: "aid", at: 600 }, { kind: null, at: 1800 }]);
    expect(applyPending(out.bleed, 1800)).toMatchObject({ stable: null, cursor: 1800 });
  });
});
