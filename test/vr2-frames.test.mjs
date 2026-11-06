// VR2.0 part 6a-1: frame cores and loading (docs/PLAN-vr2-part6-frames.md, "6a-1 in detail"; VR2.0 pp.105–106).
import { describe, it, expect } from "vitest";
import { deriveProgram, activeOptions, programmingCap, UTILITY_OPTIONS, foldProgramming } from "../module/rules/vr2-options.mjs";
import { coreProblems, programCapacity, frameInitiative, coreDinabProblem, loadingTerms, loadProblems, frameActualSize,
  coreWritten, activeLoad } from "../module/rules/vr2-frames.mjs";

const VR2 = { vr2: true, optionsOn: true };
const core = (kind, rating, extra = {}, options = []) => ({ rating, multiplier: 1, options, frameCore: { kind, bod: 0, evasion: 0, masking: 0, sensor: 0, initPoints: 0, ...extra } });

describe("frame cores (p.105–106)", () => {
  it("Genie's smart core: 12 + DINAB-8 → (12 + 8)² × 3 = 1,200 Mp; dumb ×2", () => {
    const g = deriveProgram("Genie core", core("smart", 12, { initPoints: 2 }, [{ kind: "dinab", rating: 8 }]), VR2);
    expect(g).toMatchObject({ multiplier: 3, utility: "frameCore", size: 1200, designSize: 1200 });
    expect(deriveProgram("Drone core", core("dumb", 6), VR2)).toMatchObject({ multiplier: 2, size: 72 });
  });
  it("core options are frame rules: DINAB counts with utility options OFF, and only under VR2.0 (R1 #2)", () => {
    const off = { vr2: true, optionsOn: false };
    expect(deriveProgram("Genie core", core("smart", 12, {}, [{ kind: "dinab", rating: 8 }]), off).size).toBe(1200);
    expect(deriveProgram("Attack", { rating: 6, damageLevel: "S", options: [{ kind: "area", rating: 2 }] }, off).activeOpts).toEqual([]);
    expect(deriveProgram("Genie core", core("smart", 12, {}, [{ kind: "dinab", rating: 8 }]), { vr2: false }).utility).not.toBe("frameCore");
  });
  it("the closed option list: DINAB, optimization, squeeze; no Sensitive; DINAB above the Core Rating is fine (R1 #1)", () => {
    expect(UTILITY_OPTIONS.frameCore).toEqual(["dinab", "optimization", "squeeze"]);
    const r = activeOptions("frameCore", 4, [{ kind: "dinab", rating: 6 }, { kind: "sensitive" }, { kind: "area", rating: 1 }]);
    expect(r.active.map(o => o.kind)).toEqual(["dinab"]);
    expect(r.inert.map(o => o.kind)).toEqual(["sensitive", "area"]);
    expect(activeOptions("attack", 4, [{ kind: "dinab", rating: 6 }]).active).toEqual([]);   // ordinary programs keep the cap
  });
  it("deriveProgram matches the old ProgramData: attack multipliers, inert options, authored multiplier", () => {
    expect(deriveProgram("Attack", { rating: 6, damageLevel: "S", options: [] }, VR2)).toMatchObject({ multiplier: 4, size: 144 });
    expect(deriveProgram("Cloak", { rating: 4, multiplier: 3, options: [] }, VR2)).toMatchObject({ multiplier: 3, size: 48 });
    expect(deriveProgram("Cloak", { rating: 4, multiplier: 3, options: [{ kind: "bogus" }] }, VR2).inertOpts[0].why).toBe("unknown option");
    expect(deriveProgram("Attack", { rating: 6, damageLevel: "S", multiplier: 2 }, { vr2: false })).toMatchObject({ multiplier: 2 });
  });
  it("coreProblems: attributes ≤ Core, Initiative only on smart and ≤ Core, smart needs DINAB", () => {
    const opts = [{ kind: "dinab", rating: 4 }];
    expect(coreProblems({ rating: 6, frameCore: { kind: "smart", bod: 2, evasion: 2, masking: 1, sensor: 1 }, activeOpts: opts })).toEqual([]);
    expect(coreProblems({ rating: 6, frameCore: { kind: "smart", bod: 4, evasion: 3 }, activeOpts: opts })[0]).toMatch(/may not exceed/);
    expect(coreProblems({ rating: 6, frameCore: { kind: "dumb", initPoints: 1 } })[0]).toMatch(/Only smart/);
    expect(coreProblems({ rating: 6, frameCore: { kind: "smart", initPoints: 7 }, activeOpts: opts })[0]).toMatch(/can't exceed/);
    expect(coreProblems({ rating: 6, frameCore: { kind: "smart" }, activeOpts: [] })[0]).toMatch(/must carry DINAB/);
  });
  it("capacity and Initiative: Core − Initiative points; smart Reaction = Core, (1 + points)D6", () => {
    expect(programCapacity(12, { initPoints: 2 })).toBe(10);
    expect(frameInitiative(12, { kind: "smart", initPoints: 2 })).toEqual({ reaction: 12, dice: 3 });
    expect(frameInitiative(6, { kind: "dumb" })).toBeNull();
  });
  it("the programmer's caps: Core ≤ ⌊Computer × 1.5⌋ (no team +1); DINAB ≤ Computer", () => {
    expect(programmingCap("frameCore", [8])).toBe(12);
    expect(programmingCap("frameCore", [7])).toBe(10);
    expect(programmingCap("frameCore", [8, 6])).toBe(12);
    expect(coreDinabProblem([{ kind: "dinab", rating: 9 }], 8)).toMatch(/exceeds Computer 8/);
    expect(coreDinabProblem([{ kind: "dinab", rating: 8 }], 8)).toBeNull();
  });
});

describe("loading (p.106; user rulings: round up)", () => {
  it("Genie: Attack-6 + Cloak-4 = 10 → LR 5 → 25 Mp → 50 days, TN 5 (the printed ÷ misprint fixed)", () => {
    expect(loadingTerms([6, 4])).toEqual({ total: 10, loadingRating: 5, size: 25, baseTime: 50, tn: 5 });
  });
  it("odd totals and fractional averages round up: 11 → 6; 6 + 3 → TN 5", () => {
    expect(loadingTerms([6, 5]).loadingRating).toBe(6);
    expect(loadingTerms([6, 3]).tn).toBe(5);
  });
  it("the total must fit the capacity; at least one program", () => {
    expect(loadProblems([6, 4], 10)).toEqual([]);
    expect(loadProblems([6, 5], 10)[0]).toMatch(/total 11/);
    expect(loadProblems([], 10)[0]).toMatch(/at least one/);
  });
  it("Genie's frame: 1,200 + 144 + 48 = 1,392 Mp", () => {
    const copies = [{ name: "Attack", system: { rating: 6, damageLevel: "S" } }, { name: "Cloak", system: { rating: 4, multiplier: 3 } }];
    expect(frameActualSize(1200, copies, VR2)).toBe(1392);
  });
});

describe("written cores and the active load (derived, never stored)", () => {
  const D1 = { name: "Core", rating: 6, frameCore: { kind: "dumb" } }, D2 = { ...D1, rating: 5 };
  const rec = (key, type, extra) => ({ key, type, ...extra });
  const wrote = (gen, design) => [rec(`prog:start:${gen}`, "progStart", { gen, design, baseTime: 10 }), rec(`prog:frozen:${gen}`, "progFrozen", { task: gen, successes: 2 }),
    rec(`prog:end:${gen}`, "progEnd", { task: gen, outcome: "complete" })];
  const loaded = (gen, design, ratings, outcome = "complete") => [rec(`load:start:${gen}`, "progStart", { gen, design, baseTime: 10 }),
    rec(`load:frozen:${gen}`, "progFrozen", { task: gen, successes: 2 }),
    rec(`load:end:${gen}`, "progEnd", { task: gen, outcome, ...(outcome === "complete" ? { payload: { copies: ratings.map((r, i) => ({ name: `P${i}`, system: { rating: r } })), coreDesign: design, loadingRating: 3 } } : {}) })];
  it("written means a completed task of the current design, for a core (R1 #7; code R1 #1: no task, not written)", () => {
    const recs = [rec("prog:new", "progNew"), ...wrote(1, D1)];
    expect(coreWritten(recs, D1)).toBe(true);
    expect(coreWritten(recs, D2)).toBe(false);
    expect(coreWritten([rec("prog:new", "progNew")], D1)).toBe(false);
    expect(coreWritten([], D1)).toBe(false);
  });
  it("the fold keeps a terminal record's payload; the latest COMPLETE load wins; an abandon keeps the old one", () => {
    expect(foldProgramming(loaded(1, D1, [4]), "load:").tasks[1].payload.loadingRating).toBe(3);
    const recs = [...loaded(1, D1, [4]), ...loaded(2, D1, [5])];
    expect(activeLoad(recs, { design: D1, capacity: 6, written: true })).toMatchObject({ gen: 2 });
    const ab = [...loaded(1, D1, [4]), ...loaded(2, D1, [5], "abandon")];
    expect(activeLoad(ab, { design: D1, capacity: 6, written: true })).toMatchObject({ gen: 1 });
  });
  it("a load made for another design, an over-capacity load, or an unwritten core doesn't count (R1 #3)", () => {
    const recs = loaded(1, D1, [5]);
    expect(activeLoad(recs, { design: D2, capacity: 6, written: true }).void).toMatch(/another design/);
    expect(activeLoad(recs, { design: D1, capacity: 4, written: true }).void).toMatch(/total 5/);
    expect(activeLoad(recs, { design: D1, capacity: 6, written: false }).void).toMatch(/isn't written/);
    expect(activeLoad([], { design: D1, capacity: 6, written: true })).toBeNull();
  });
});

// ── Part 6a-2a ───────────────────────────────────────────────────────────────
import { uploadSeconds, uploadTurns, departedSince, frameMonitor, shutdownOfflineSeqs, frameEnds, iconKind, limitClass } from "../module/rules/vr2-frames.mjs";

describe("6a-2a: running frames (p.91, p.105–107, p.124)", () => {
  it("upload time: size ÷ I/O MePS seconds, in Combat Turns of 3 s; no bandwidth, no upload", () => {
    expect(uploadSeconds(1392, 20)).toBe(70);
    expect(uploadTurns(70)).toBe(24);
    expect(uploadSeconds(1392, 0)).toBeNull();
  });
  it("departure is a durable transition (R1 #4)", () => {
    const base = { live: 1, conn: 1, sessionId: "s1", since: 10 };
    expect(departedSince({ ...base, live: null })).toBe(true);
    expect(departedSince({ ...base, live: 2 })).toBe(true);
    expect(departedSince({ ...base, topology: true, moves: [{ type: "move", conn: 1, seq: 12 }] })).toBe(true);    // away (and back)
    expect(departedSince({ ...base, topology: true, moves: [{ type: "move", conn: 1, seq: 9 }] })).toBe(false);    // before it started
    expect(departedSince({ ...base, topology: true, liveSessionId: "s9", moves: [] })).toBe(false);               // a failed logon's session switch
    expect(departedSince({ ...base, liveSessionId: "s2" })).toBe(true);                                           // topology off: a new session
    expect(departedSince({ ...base, liveSessionId: "s1" })).toBe(false);
  });
  it("the monitor is derived from card-keyed hits, a duplicate card counted once, capped at 10 (R1 #9)", () => {
    const h = (card, boxes, upload = "F") => ({ type: "frameHit", upload, card, boxes });
    expect(frameMonitor([h("a", 3), h("a", 6), h("b", 2), h("c", 9, "G")], "F")).toBe(5);
    expect(frameMonitor([h("a", 6), h("b", 6)], "F")).toBe(10);
  });
  it("shutdowns: the seq each run went offline, resets included (R2 #1)", () => {
    const recs = [{ type: "shutdown", n: 1, turns: 2 }, { type: "shutdownTick", n: 1, seq: 5 }, { type: "shutdownTick", n: 1, seq: 7 },
      { type: "shutdownReset", n: 1 }, { type: "shutdown", n: 2, turns: 3 }, { type: "shutdownTick", n: 2, seq: 9 }];
    expect(shutdownOfflineSeqs(recs)).toEqual([7]);
  });
  it("frameEnds: every cause; a smart frame outlives its decker's departure (p.105)", () => {
    expect(frameEnds({ ownerExists: false })).toMatch(/decker is gone/);
    expect(frameEnds({ hostExists: false })).toMatch(/host is gone/);
    expect(frameEnds({ endFact: { why: "deleted by the GM" } })).toBe("deleted by the GM");
    expect(frameEnds({ monitor: 10 })).toBe("crashed");
    expect(frameEnds({ shutdownSeqs: [7], since: 5 })).toMatch(/shut down/);
    expect(frameEnds({ shutdownSeqs: [3], since: 5 })).toBeNull();
    expect(frameEnds({ kind: "dumb", departed: true })).toMatch(/left/);
    expect(frameEnds({ kind: "smart", departed: true })).toBeNull();
  });
  it("icon kinds and Limit classes", () => {
    expect([iconKind("character"), iconKind("ic"), iconKind("frame"), iconKind("host")]).toEqual(["decker", "ic", "frame", null]);
    expect(limitClass("frame")).toBe("frame");
  });
});

describe("part 6a-2b", () => {
  const rec = (o) => ({ conn: 1, sessionId: "s1", ...o });
  const cards = { a: { success: true }, b: { success: false }, c: { success: true } };
  const cardOf = (id) => cards[id] ?? null;
  it("liveDecoyFrame: newest success wins; a newer failure keeps the old; off/ended/session end it", async () => {
    const { liveDecoyFrame } = await import("../module/rules/vr2-frames.mjs");
    const A = rec({ type: "decoyFrame", key: "kA", card: "a", frame: "F1", ct: 1 });
    expect(liveDecoyFrame({ records: [A], conn: 1, sessionId: "s1", cardOf })?.key).toBe("kA");
    const B = rec({ type: "decoyFrame", key: "kB", card: "b", frame: "F2", ct: 2 });
    expect(liveDecoyFrame({ records: [A, B], conn: 1, sessionId: "s1", cardOf })?.key).toBe("kA");
    expect(liveDecoyFrame({ records: [A], conn: 1, sessionId: "s2", cardOf })).toBe(null);
    expect(liveDecoyFrame({ records: [A, { type: "decoyFrameOff", decoy: "kA" }], conn: 1, sessionId: "s1", cardOf })).toBe(null);
    // A newer success that crashes leaves NO decoy: the older one isn't resurrected (R1 #10).
    const C = rec({ type: "decoyFrame", key: "kC", card: "c", frame: "F3", ct: 3 });
    expect(liveDecoyFrame({ records: [A, C], conn: 1, sessionId: "s1", cardOf, frameEnded: (f) => f === "F3" })).toBe(null);
    // A newer card deleted: a barrier, and then none.
    const D = rec({ type: "decoyFrame", key: "kD", card: "gone", frame: "F4", ct: 4 });
    expect(liveDecoyFrame({ records: [A, D], conn: 1, sessionId: "s1", cardOf })).toBe(null);
  });
  it("openDecoyFrames lists un-off records whatever their card says (R1 #9)", async () => {
    const { openDecoyFrames } = await import("../module/rules/vr2-frames.mjs");
    const B = rec({ type: "decoyFrame", key: "kB", card: "b" });
    expect(openDecoyFrames([B], 1).map(e => e.key)).toEqual(["kB"]);
    expect(openDecoyFrames([B, { type: "decoyFrameOff", decoy: "kB" }], 1)).toEqual([]);
  });
  it("triggerProblems: half the Security Value, analyze for host events, scanner for users (p.107)", async () => {
    const { triggerProblems } = await import("../module/rules/vr2-frames.mjs");
    expect(triggerProblems({ sensor: 3, analyze: 3, securityValue: 6, watch: "host" })).toEqual([]);
    expect(triggerProblems({ sensor: 2, analyze: 3, securityValue: 6, watch: "host" })).toHaveLength(1);
    expect(triggerProblems({ sensor: 4, analyze: 0, securityValue: 7, watch: "host" })).toHaveLength(1);
    expect(triggerProblems({ sensor: 4, scanner: 4, securityValue: 7, watch: "users" })).toEqual([]);
    expect(triggerProblems({ sensor: 4, analyze: 4, scanner: 3, securityValue: 7, watch: "both" })).toHaveLength(1);
  });
  it("frameAttrLosses counts one loss per card; coreDinabLeft counts this upload's wear", async () => {
    const { frameAttrLosses, coreDinabLeft } = await import("../module/rules/vr2-frames.mjs");
    const recs = [{ type: "frameAttr", upload: "U", card: "c1", attr: "bod", lost: 1 }, { type: "frameAttr", upload: "U", card: "c1", attr: "bod", lost: 1 },
      { type: "frameAttr", upload: "U", card: "c2", attr: "sensor", lost: 2 }, { type: "frameAttr", upload: "V", card: "c3", attr: "bod", lost: 3 }];
    expect(frameAttrLosses(recs, "U")).toEqual({ bod: 1, evasion: 0, masking: 0, sensor: 2 });
    expect(coreDinabLeft(4, { U_a: true, U_b: true, V_c: true }, "U")).toBe(2);
  });
});

describe("part 6a-2c", () => {
  it("frame attacker keys parse and are actor keys", async () => {
    const { parseAttackerKey, isFrameKey, isActorKey, isDeckKey } = await import("../module/rules/vr2ic-rules.mjs");
    const k = "frame:Actor.abc@UP123";
    expect(isFrameKey(k) && isActorKey(k) && !isDeckKey(k)).toBe(true);
    expect(parseAttackerKey(k)).toEqual({ kind: "frame", uuid: "Actor.abc", upload: "UP123" });
    expect(parseAttackerKey("deck:Actor.d@3")).toEqual({ kind: "deck", uuid: "Actor.d", conn: 3 });
  });
  it("initiative: smart = Core + (1 + points)D6; dumb has none (p.106)", async () => {
    const { frameInitiativeParts } = await import("../module/rules/vr2-frames.mjs");
    expect(frameInitiativeParts({ kind: "smart", coreRating: 6, initPoints: 2 })).toEqual({ base: 6, dice: 3 });
    expect(frameInitiativeParts({ kind: "dumb", coreRating: 6 })).toBe(null);
  });
  it("joining combat: once, by two receipts", async () => {
    const { joinStep } = await import("../module/rules/vr2-frames.mjs");
    expect(joinStep({ eligible: true })).toBe("start");
    expect(joinStep({ eligible: false })).toBe("none");
    expect(joinStep({ eligible: true, joining: true })).toBe("finish");
    expect(joinStep({ eligible: true, joining: true, joined: true })).toBe("none");
  });
});

describe("part 6b: SKs", () => {
  it("skProblems: every p.141 sample is legal; MPCP, single ratings and the ×3 total are enforced", async () => {
    const { skProblems, SK_PRESETS } = await import("../module/rules/vr2-frames.mjs");
    for (const [mpcp, bod, evasion, masking, sensor] of SK_PRESETS) expect(skProblems({ mpcp, bod, evasion, masking, sensor })).toEqual([]);
    expect(skProblems({ mpcp: 13, bod: 1 })).toHaveLength(1);
    expect(skProblems({ mpcp: 7, bod: 8 })).toHaveLength(1);
    expect(skProblems({ mpcp: 7, bod: 6, evasion: 6, masking: 6, sensor: 6 })).toHaveLength(1);
  });
  it("poolProblems: 2:1 black hammer, Initiative steps, rating ≤ MPCP, cost ≤ pool, locks (p.141)", async () => {
    const { poolProblems, poolCost, skInitDice, nextLocks } = await import("../module/rules/vr2-frames.mjs");
    expect(poolCost("Black Hammer", 4)).toBe(8);
    expect(poolProblems({ pool: 12, mpcp: 8, alloc: [{ name: "Attack", rating: 6 }, { name: "Armor", rating: 3 }], init: 3 })).toEqual([]);
    expect(poolProblems({ pool: 12, mpcp: 8, alloc: [{ name: "Black Hammer", rating: 7 }] })).toHaveLength(1);
    expect(poolProblems({ pool: 20, mpcp: 8, alloc: [{ name: "Attack", rating: 9 }] })).toHaveLength(1);
    expect(poolProblems({ pool: 20, mpcp: 8, alloc: [], init: 2 })).toHaveLength(1);
    expect(poolProblems({ pool: 20, mpcp: 8, alloc: [{ name: "Medic", rating: 2 }], locked: { Medic: 4 } })).toHaveLength(1);
    expect([0, 1, 3, 5].map(skInitDice)).toEqual([1, 2, 3, 4]);
    expect(nextLocks({ Medic: 4 }, [{ name: "Medic", rating: 2 }, { name: "Restore", rating: 3 }, { name: "Attack", rating: 5 }])).toEqual({ Medic: 4, Restore: 3 });
  });
  it("skCondition: hits, a partial Medic, a loss, a full repair at its move's seq, more hits", async () => {
    const { skCondition } = await import("../module/rules/vr2-frames.mjs");
    const recs = [
      { type: "frameHit", card: "a", boxes: 4, seq: 1 }, { type: "frameHit", card: "a", boxes: 4, seq: 2 },
      { type: "skRepair", boxes: 2, seq: 3 }, { type: "frameAttr", card: "b", attr: "bod", lost: 2, seq: 4 },
      { type: "frameHit", card: "c", boxes: 3, seq: 6 },
      // An arrival's repair written later (seq 9) but placed at its move (5): the hit at 6 isn't healed.
      { type: "skRepair", full: true, at: 5, seq: 9 }];
    expect(skCondition(recs)).toEqual({ monitor: 3, lost: { bod: 0, evasion: 0, masking: 0, sensor: 0 } });
    expect(skCondition(recs, 4)).toEqual({ monitor: 2, lost: { bod: 2, evasion: 0, masking: 0, sensor: 0 } });
  });
});
describe("part 6b: Restore TN", () => {
  it("only damage still outstanding sets it; a repair that clears the loss forgets the old ratings", async () => {
    const { skRestoreTN } = await import("../module/rules/vr2-frames.mjs");
    const recs = [{ type: "frameAttr", attr: "bod", lost: 2, rating: 8, seq: 1 }, { type: "skRepair", attr: "bod", points: 2, seq: 2 },
      { type: "frameAttr", attr: "bod", lost: 1, rating: 3, seq: 3 }];
    expect(skRestoreTN(recs, "bod")).toBe(3);
    expect(skRestoreTN(recs.slice(0, 1), "bod")).toBe(8);
    expect(skRestoreTN([...recs.slice(0, 1), { type: "skRepair", full: true, at: 1.5, seq: 9 }, recs[2]], "bod")).toBe(3);
  });
});
