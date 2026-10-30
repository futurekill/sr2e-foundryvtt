// VR2.0 part 3 (docs/PLAN-vr2-part3.md; Virtual Realities 2.0 pp.40–53).
import { describe, it, expect } from "vitest";
import { blackDamage, grayTN, mpcpLoss, traceFactor, locationTurns, datatrailTurns, relocateTN, defuseTN, pcpicMod,
         psychoRecoveryTN, wormInfects, shutdownDice, finalWarning, traceTally, tarWins, personaVR2, foldDeck,
         foldVr2Ic, traceState, parseAttackerKey, isDeckKey,
         hogPoints, hogPurgeTN, hogTarget, slowActionsLost, trackLocks,
         restoreState, restorePoints, evaluateLoss, evaluateDegradation } from "../module/rules/vr2ic-rules.mjs";
import { matrixCombatOutcome } from "../module/rules/sr2e-rules.mjs";

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

describe("the book's examples", () => {
  it("Cybersushi (p.48–49): Black IC-10 on Red, 2 successes → 10D, Hardening-1 → 9; icon down → 12S − 1 = 11", () => {
    const d = blackDamage("red", 10);
    expect(d).toEqual({ power: 10, level: "S" });
    expect(matrixCombatOutcome(d.level, 2, 0).level).toBe("D");
    expect(d.power - 1).toBe(9);
    expect(blackDamage("red", 10, true).power - 1).toBe(11);
    expect(blackDamage("green", 6).level).toBe("M");
  });
  it("Selena's Blaster (8) Test (p.43): MPCP 6 + Hardening 2; 2 successes cost 1 MPCP", () => {
    expect(grayTN("blaster", 6, 2)).toBe(8);
    expect(mpcpLoss("blaster", 2)).toBe(1);
    expect(grayTN("sparky", 6, 1)).toBe(9);
    expect(mpcpLoss("ripper", 3)).toBe(3);
  });
  it("Vanessa (p.45): Evasion 9 − Trace 8 − 3 + 2 redirects + Camo 4 = 4; ⌊10 ÷ 6⌋ = 1", () => {
    expect(traceFactor({ evasion: 9, rating: 8, jackpoint: -3, redirects: 2, camo: 4 })).toBe(4);
    expect(traceFactor({ evasion: 6, rating: 4, trapGray: 5, trapBlack: 3 })).toBe(2 + 2 + 3);
    expect([locationTurns(6), locationTurns(1), locationTurns(10), locationTurns(11)]).toEqual([1, 10, 1, 0]);
    expect(relocateTN(8, 4)).toBe(4);
  });
  it("Scaramouche's defuse (p.41): Files 11 − Defuse 5 = 6", () => expect(defuseTN(11, 5)).toBe(6));
  it("small rules", () => {
    expect([datatrailTurns(1), datatrailTurns(4)]).toEqual([1, 3]);
    expect(["L", "M", "S", "D", ""].map(pcpicMod)).toEqual([1, 2, 3, 5, 0]);
    expect(psychoRecoveryTN(6, { therapy: true, medication: true, spell: true })).toBe(3);
    expect(psychoRecoveryTN(6, { pcpic: true, medication: true })).toBe(6);
    expect([wormInfects(1, 0), wormInfects(2, 2), wormInfects(3, 2)]).toEqual([true, false, true]);
    expect([shutdownDice(1), shutdownDice(4), shutdownDice(5)]).toEqual([1, 2, 3]);
    expect([finalWarning(1), finalWarning(5)]).toEqual([1, 3]);
    expect([traceTally(2, true), traceTally(0, true), traceTally(2, false)]).toEqual([3, 0, 2]);
    expect([tarWins(3, 3), tarWins(4, 3)]).toEqual([false, true]);
  });
});

describe("personaVR2", () => {
  it("MPCP 0 zeroes everything; damage after the cap; presence decides the fallback", () => {
    expect(personaVR2({ mpcp: 6, damage: { mpcp: 6 }, programs: { bod: { loaded: true, best: 6 } } }).bod).toBe(0);
    const p = personaVR2({ mpcp: 6, damage: { mpcp: 2, evasion: 1 }, authored: { masking: 5 },
      programs: { bod: { loaded: true, best: 6 }, evasion: { loaded: true, best: 3 }, sensor: { loaded: true, best: 0 } } });
    expect(p).toEqual({ mpcp: 4, bod: 4, evasion: 2, masking: 4, sensor: 0 });
  });
});

describe("foldDeck", () => {
  it("damage only against the chip it hit; worms on the current MPCP; corruption per reload generation", () => {
    const f = foldDeck(shuffle([
      { key: "a", type: "deckDmg", attr: "mpcp", amount: 2, chipGen: 0 },
      { key: "b", type: "chipReplace", chip: "mpcp" },
      { key: "c", type: "deckDmg", attr: "mpcp", amount: 1, chipGen: 0 },   // delayed: hit the OLD chip
      { key: "d", type: "deckDmg", attr: "bod", amount: 1, chipGen: 0 },
      { key: "e", type: "worm", kind: "death", chipGen: 1 },
      { key: "f", type: "worm", kind: "death", chipGen: 0 },
      { key: "g", type: "corrupt", programKey: "attack", g: 0 },
      { key: "h", type: "reload", programKey: "attack", g: 1 },
      { key: "i", type: "corrupt", programKey: "attack", g: 0 },              // delayed old corruption
      { key: "j", type: "corrupt", programKey: "sleaze", g: 0 }
    ]));
    expect(f.damage).toEqual({ mpcp: 0, bod: 1, evasion: 0, masking: 0, sensor: 0 });
    expect(f.worms.map(w => w.key)).toEqual(["e"]);
    expect(f.deathwormTN).toBe(2);
    expect([...f.corrupted]).toEqual(["sleaze"]);
    expect(foldDeck([{ key: "x", type: "corrupt", programKey: "attack", g: 1 }, { key: "h", type: "reload", programKey: "attack", g: 1 }]).corrupted.has("attack")).toBe(true);
  });
});

describe("traces", () => {
  const t = { key: "t", type: "trace", conn: 1, icKey: "ic#0", rating: 8, turns: 2, seq: 1 };
  const tick = (b, seq) => ({ key: `tk${b}`, type: "tick", conn: 1, icKey: "ic#0", boundary: b, seq });
  it("ticks count down; a spoof admitted before its boundary's tick blocks it; a later one doesn't", () => {
    expect(traceState(t, [tick(1, 2), tick(2, 3)]).complete).toBe(true);
    const sp = { key: "s", type: "spoof", conn: 1, icKey: "ic#0", boundary: 1, seq: 2 };
    const r = traceState(t, [{ ...sp }, tick(1, 3), tick(2, 4)]);
    expect([r.complete, r.turnsLeft]).toEqual([false, 1]);
    expect(traceState(t, [tick(1, 2), { ...sp, seq: 3 }, tick(2, 4)]).complete).toBe(true);
  });
  it("freeze, release, freeze; a crash before completion kills it, after it doesn't", () => {
    const f = (type, spoof, seq) => ({ key: `${type}${seq}`, type, conn: 1, icKey: "ic#0", spoof, seq });
    const ev = [f("freeze", "a", 2), tick(1, 3), f("unfreeze", "a", 4), tick(2, 5), f("freeze", "b", 6), tick(3, 7)];
    expect(traceState(t, shuffle(ev)).turnsLeft).toBe(1);
    expect(traceState(t, [tick(1, 2), tick(2, 3)], () => 4).complete).toBe(true);
    const dead = traceState(t, [tick(1, 2), tick(2, 5)], () => 4);
    expect([dead.complete, dead.dead]).toEqual([false, true]);
    expect(traceState({ ...t, turns: 0 }, []).complete).toBe(true);
  });
});

describe("trace clocks (p.45–46: the hit's own turn doesn't count)", () => {
  it("boundaries to tick and the open boundary", async () => {
    const { boundariesToTick, openBoundary } = await import("../module/rules/vr2ic-rules.mjs");
    const t = { clock: { combatId: "c", startRound: 1 } };
    expect(boundariesToTick(t, [], 2)).toEqual([]);           // round 1 (the hit's) ended: not counted
    expect(boundariesToTick(t, [], 5)).toEqual([2, 3, 4]);    // a jump ticks each round crossed
    expect(boundariesToTick(t, [{ boundary: 2 }], 4)).toEqual([3]);
    expect(openBoundary(t, [], 3)).toBe(3);
    expect(openBoundary({ clock: { manual: true } }, [])).toBe("m0");                    // the hit's own turn
    expect(openBoundary({ clock: { manual: true } }, [{ boundary: "m0" }])).toBe("m1");
  });
});

describe("foldVr2Ic: the connection and its exit", () => {
  const base = [
    { key: "o1", type: "connOpen", n: 1, settings: { deckMode: "hot" } },
    { key: "a1", type: "admit", conn: 1, card: "c1", icKey: "bk#0", seq: 1 },
    { key: "h1", type: "hit", conn: 1, card: "c1", icKey: "bk#0", rating: 6, kind: "lethal", seq: 2 },
    { key: "e1", type: "exitOpen", n: 1, trigger: "gate", locks: ["bk#0"], seq: 3 }
  ];
  const ext = { icGen: (u) => u === "bk" ? 0 : undefined };
  it("the live connection, the lock and the derived steps", () => {
    const f = foldVr2Ic(shuffle(base), ext);
    expect(f.liveN).toBe(1);
    expect(f.live.locks.length).toBe(1);
    expect(f.live.steps.map(s => s.step)).toEqual(["lastAttack", "dumpShock"]);
    expect(f.live.barrier).toBe(false);
    expect(f.live.pending.map(a => a.card)).toEqual(["c1"]);
  });
  it("the barrier waits for both resistances' acks and every step; a knock-out adds the final shot", () => {
    const res = [
      { key: "ri", type: "res", card: "c1", side: "icon" }, { key: "rm", type: "res", card: "c1", side: "meat" },
      { key: "k1", type: "ack", target: "ri", seq: 4 }, { key: "k2", type: "ack", target: "rm", seq: 5, outcome: { down: true } },
      { key: "x1", type: "exitRes", n: 1, step: "lastAttack", ref: "bk#0", cancelled: true }
    ];
    let f = foldVr2Ic([...base, ...res], ext);
    expect(f.live.steps.map(s => s.step)).toEqual(["lastAttack", "finalShot"]);   // down: no dump shock
    expect(f.live.barrier).toBe(false);
    f = foldVr2Ic([...base, ...res, { key: "x2", type: "exitRes", n: 1, step: "finalShot", ref: "c1" }, { key: "k3", type: "ack", target: "x2", seq: 6 }], ext);
    expect(f.live.barrier).toBe(true);
    f = foldVr2Ic([...base, ...res, { key: "x2", type: "exitRes", n: 1, step: "finalShot", ref: "c1" }, { key: "k3", type: "ack", target: "x2", seq: 6 },
      { key: "end", type: "connEnd", n: 1, seq: 7 }], ext);
    expect([f.liveN, f.nextN]).toEqual([null, 2]);
  });
  it("a gray consequence and a crashed IC's lock", () => {
    const f = foldVr2Ic([...base, { key: "g1", type: "gray", conn: 1, card: "c1" }], { icGen: () => 1 });
    expect(f.live.locks.length).toBe(0);
    expect(f.live.steps.map(s => s.step)).toContain("gray");
  });
});

describe("part 4a — optional IC (p.51–53)", () => {
  it("cascade caps: book example Green-6 SV +2, Killer-5 +2; Blue 1; Red 100% or 4; Orange 50% or 3", async () => {
    const { cascadeCap } = await import("../module/rules/vr2ic-rules.mjs");
    expect([cascadeCap("green", 6), cascadeCap("green", 5), cascadeCap("blue", 9), cascadeCap("red", 3), cascadeCap("red", 7),
      cascadeCap("orange", 10), cascadeCap("green", 13)]).toEqual([2, 2, 1, 4, 7, 5, 3]);
  });
  it("expert: Offense-2 on Red-6 attacks with 8, resists with 4; Defense-2 the reverse", async () => {
    const { expertDice } = await import("../module/rules/vr2ic-rules.mjs");
    expect(expertDice(6, 2)).toEqual({ attack: 8, resist: 4 });
    expect(expertDice(6, -2)).toEqual({ attack: 4, resist: 8 });
    expect(expertDice(2, 3)).toEqual({ attack: 5, resist: 0 });
  });
  it("cascadeOutcomes: miss → sv, neutralized damage/attribute → rating, black needs both sides 0, trace never", async () => {
    const { cascadeOutcomes } = await import("../module/rules/vr2ic-rules.mjs");
    const c0 = { on: true };
    const ev = [
      { type: "admit", card: "m", icKey: "ic#0", successes: 0, cascade0: c0 },
      { type: "admit", card: "m", icKey: "ic#0", successes: 0, cascade0: c0 },               // duplicate: once
      { type: "admit", card: "d", icKey: "ic#0", successes: 2, cascade0: c0 },
      { type: "ack", target: "attack:d", outcome: { boxes: 0, crashed: false } },
      { type: "admit", card: "hurt", icKey: "ic#0", successes: 2, cascade0: c0 },
      { type: "ack", target: "attack:hurt", outcome: { boxes: 3 } },
      { type: "admit", card: "a", icKey: "ic#0", successes: 1, cascade0: c0 },
      { type: "ack", target: "attack:a", outcome: { lost: 0 } },
      { type: "admit", card: "a2", icKey: "ic#0", successes: 1, cascade0: c0 },
      { type: "ack", target: "attack:a2", outcome: {} },                                     // no numeric lost
      { type: "admit", card: "t", icKey: "ic#0", successes: 3, cascade0: c0 },
      { type: "ack", target: "attack:t", outcome: { trace: 0 } },
      { type: "admit", card: "b", icKey: "ic#0", successes: 2, cascade0: c0 }, { type: "hit", card: "b" },
      { key: "vr2:res:b:icon", type: "res", card: "b", side: "icon" }, { key: "vr2:res:b:meat", type: "res", card: "b", side: "meat" },
      { type: "ack", target: "vr2:res:b:icon", outcome: { boxes: 0 } }, { type: "ack", target: "vr2:res:b:meat", outcome: { boxes: 0 } },
      { type: "admit", card: "bm", icKey: "ic#0", successes: 2, cascade0: c0 }, { type: "hit", card: "bm" },
      { key: "vr2:res:bm:icon", type: "res", card: "bm", side: "icon" }, { key: "vr2:res:bm:meat", type: "res", card: "bm", side: "meat" },
      { type: "ack", target: "vr2:res:bm:icon", outcome: { boxes: 0 } }, { type: "ack", target: "vr2:res:bm:meat", outcome: { boxes: 2 } },
      { type: "admit", card: "off", icKey: "ic#0", successes: 0, cascade0: { on: false } }
    ];
    expect(cascadeOutcomes(ev).map(o => `${o.card}:${o.kind}`)).toEqual(["m:sv", "d:rating", "a:rating", "b:rating"]);
  });
  it("cascadeBonus caps each kind separately", async () => {
    const { cascadeBonus } = await import("../module/rules/vr2ic-rules.mjs");
    const o = [..."sss"].map(() => ({ kind: "sv" })).concat([{ kind: "rating" }]);
    expect(cascadeBonus(o, { code: "green", sv0: 6, rating0: 5 })).toMatchObject({ sv: 2, rating: 1 });
  });
  it("partyBudget: SV 8 → 16 points, 4 members; options 1 each; PCPIC with other black", async () => {
    const { partyBudget } = await import("../module/rules/vr2ic-rules.mjs");
    const m = (rating, o = {}) => ({ rating, program: "killer", ...o });
    expect(partyBudget({ sv: 8, members: [m(5), m(5), m(5, { expert: 1 })] })).toMatchObject({ capacity: 16, used: 16, maxMembers: 4, problems: [] });
    expect(partyBudget({ sv: 8, members: [m(6), m(6), m(5)] }).problems.length).toBe(1);
    expect(partyBudget({ sv: 4, members: [m(1), m(1), m(1)] }).problems[0]).toMatch(/at most 2/);
    expect(partyBudget({ sv: 12, members: [m(3, { program: "black-psychotropic", psychotropic: "pcpic" }), m(3, { program: "black-lethal" })] }).problems)
      .toContain("PCPIC can't share a party with other black IC (p.50)");
  });
});

describe("part 4b — constructs (p.52)", () => {
  it("parseIcKey / iconKeyOf: plain, component, dotted uuids", async () => {
    const { parseIcKey, iconKeyOf } = await import("../module/rules/vr2ic-rules.mjs");
    expect(parseIcKey("Actor.abc#3")).toEqual({ uuid: "Actor.abc", gen: 3, comp: "" });
    expect(parseIcKey("Scene.x.Token.y.Actor.z#0/k1")).toEqual({ uuid: "Scene.x.Token.y.Actor.z", gen: 0, comp: "k1" });
    expect(iconKeyOf("Actor.abc#2/k9")).toBe("Actor.abc#2");
  });
  it("constructBudget: SV 8 → 16, max 6; armor + shift → 12 left; gray +1, black +2; threat caps; rows", async () => {
    const { constructBudget } = await import("../module/rules/vr2ic-rules.mjs");
    const { icClass } = await import("../module/rules/sr2e-rules.mjs");
    const c = (id, program, rating, o = {}) => ({ id, program, rating, ...o });
    const b = constructBudget({ sv: 8, code: "red", components: [c("a", "killer", 6), c("b", "tar-baby", 6)], defenses: 2, icClassOf: icClass });
    expect([b.capacity, b.perProgram, b.used, b.problems.length]).toEqual([16, 6, 16, 0]);
    expect(constructBudget({ sv: 8, code: "red", components: [c("a", "blaster", 4), c("b", "black-lethal", 4)], icClassOf: icClass }).used).toBe(11);
    expect(constructBudget({ sv: 8, code: "red", components: [c("a", "killer", 7), c("b", "killer", 1)] }).problems[0]).toMatch(/over 6/);
    expect(constructBudget({ sv: 8, code: "green", components: [c("a", "killer", 2), c("b", "killer", 2)], threat: 2 }).problems[0]).toMatch(/Threat/);
    expect(constructBudget({ sv: 8, code: "red", components: [c("a", "killer", 2)] }).problems).toContain("a construct needs at least 2 programs");
    const bad = constructBudget({ sv: 8, code: "red", components: [c("a", "killer", 2), c("a", "data-bomb", 2), c("", "", 1), c("d", "scramble", 1, { scramble: "exploding" })] }).problems.join("|");
    expect(bad).toMatch(/own id/); expect(bad).toMatch(/data-bomb can't/); expect(bad).toMatch(/no program/); expect(bad).toMatch(/exploding/);
  });
});

describe("part 5a: decker attackers (deck: keys)", () => {
  it("parses both key kinds", () => {
    expect(parseAttackerKey("deck:Actor.abc@3")).toEqual({ kind: "deck", uuid: "Actor.abc", conn: 3 });
    expect(parseAttackerKey("Actor.ic#2/kil")).toMatchObject({ kind: "ic", uuid: "Actor.ic", gen: 2, comp: "kil" });
    expect(isDeckKey("deck:x@1")).toBe(true);
    expect(isDeckKey("Actor.ic#0")).toBe(false);
  });
  const open = { key: "o1", type: "connOpen", n: 1, settings: { deckMode: "hot" } };
  const hit = (card, extra = {}) => [{ key: `a-${card}`, type: "admit", conn: 1, card, icKey: "deck:A@2", seq: 1 },
    { key: `h-${card}`, type: "hit", conn: 1, card, icKey: "deck:A@2", rating: 5, kind: "lethal", noBlaster: true, seq: 2, ...extra }];
  it("a deck lock holds until its own lockEnd; a lockless hit never locks", () => {
    expect(foldVr2Ic([open, ...hit("c1")]).live.locks.length).toBe(1);
    expect(foldVr2Ic([open, ...hit("c1"), { key: "le", type: "lockEnd", card: "c1", seq: 3 }]).live.locks.length).toBe(0);
    expect(foldVr2Ic([open, ...hit("c1", { lockless: true })]).live.locks.length).toBe(0);
    // A new hit after the first lock ended is a new lock.
    expect(foldVr2Ic([open, ...hit("c1"), { key: "le", type: "lockEnd", card: "c1", seq: 3 }, ...hit("c2")]).live.locks.map(h => h.card)).toEqual(["c2"]);
  });
  it("two live hits from one decker are ONE last-attack obligation; no final shot for black hammer", () => {
    const exit = { key: "e1", type: "exitOpen", n: 1, trigger: "gate", locks: ["deck:A@2", "deck:A@2"], seq: 9 };
    const down = [{ key: "r1", type: "res", card: "c1", side: "meat", seq: 4 }, { key: "k1", type: "ack", target: "r1", outcome: { down: true }, seq: 5 }];
    const f = foldVr2Ic([open, ...hit("c1"), ...hit("c2"), ...down, exit]);
    expect(f.live.steps.filter(s => s.step === "lastAttack").length).toBe(1);
    expect(f.live.steps.some(s => s.step === "finalShot")).toBe(false);
  });
  it("a track cycle ends at its traceDead, even with ticks after it", () => {
    const t = { key: "t1", type: "trace", conn: 1, icKey: "track~c1", turns: 2, seq: 1, track: true };
    const ev = [t, { key: "d", type: "traceDead", conn: 1, icKey: "track~c1", seq: 2 },
      { key: "k1", type: "tick", conn: 1, icKey: "track~c1", boundary: 1, seq: 3 }, { key: "k2", type: "tick", conn: 1, icKey: "track~c1", boundary: 2, seq: 4 }];
    const st = traceState(t, ev);
    expect(st.complete).toBe(false);
    expect(st.dead).toBe(true);
  });
});

describe("part 5a: hog, slow, track (VR2.0 pp.97–99)", () => {
  it("hog drains 1 per 2 net successes; the purge TN clamps after every modifier", () => {
    expect(hogPoints(5, 1)).toBe(2);
    expect(hogPoints(2, 1)).toBe(0);
    expect(hogPoints(1, 4)).toBe(0);
    expect(hogPurgeTN(3, 4, 6)).toBe(5);   // 3 − 4 + 6, not max(2, −1) + 6 = 8
    expect(hogPurgeTN(2, 4, 1)).toBe(2);
  });
  it("hog keeps its victim until it crashes, then takes the next highest (6/5, 2 a turn)", () => {
    const progs = (r6, r5) => [{ id: "a", loadGen: 0, rating: r6 }, { id: "b", loadGen: 0, rating: r5 }].filter(p => p.rating > 0);
    let prev = null, t = hogTarget(prev, progs(6, 5));
    expect(t.id).toBe("a");
    prev = { itemId: "a", loadGen: 0 };
    expect(hogTarget(prev, progs(4, 5)).id).toBe("a");          // 4 < 5, but it stays on the infected program
    expect(hogTarget(prev, progs(0, 5)).id).toBe("b");          // crashed → next
    expect(hogTarget({ itemId: "a", loadGen: 0 }, [{ id: "a", loadGen: 1, rating: 6 }]).loadGen).toBe(1);   // reloaded copy: a fresh pick
    expect(hogTarget(null, [])).toBe(null);
  });
  it("slow: ties and resistance wins lose nothing", () => {
    expect(slowActionsLost(5, 1)).toBe(2);
    expect(slowActionsLost(3, 3)).toBe(0);
    expect(slowActionsLost(1, 4)).toBe(0);
  });
  it("track locks only when Evasion fails to equal or beat the attack", () => {
    expect(trackLocks(3, 2)).toBe(true);
    expect(trackLocks(3, 3)).toBe(false);
  });
});

describe("part 5a: restore and evaluate (VR2.0 pp.97, 100)", () => {
  it("restore pays down the oldest loss first; the TN is the highest rating still outstanding", () => {
    const dmg = [{ attr: "bod", lost: 2, rating: 6, seq: 1 }, { attr: "bod", lost: 2, rating: 4, seq: 2 }, { attr: "evasion", lost: 1, rating: 3, seq: 3 }];
    expect(restoreState(dmg, [])).toEqual({ byAttr: { bod: 4, evasion: 1 }, tn: 6, unknown: false });
    expect(restoreState(dmg, [{ attr: "bod", points: 2, seq: 4 }]).tn).toBe(4);          // the Rating-6 loss is repaid
    expect(restoreState(dmg, [{ attr: "bod", points: 4, seq: 4 }])).toEqual({ byAttr: { evasion: 1 }, tn: 3, unknown: false });
    expect(restoreState([{ attr: "bod", lost: 1, seq: 1 }], []).unknown).toBe(true);
  });
  it("lose 6, restore 6, lose 6 → 6 outstanding (base 6 → 0)", () => {
    const st = restoreState([{ attr: "bod", lost: 6, rating: 5, seq: 1 }, { attr: "bod", lost: 6, rating: 5, seq: 3 }], [{ attr: "bod", points: 6, seq: 2 }]);
    expect(st.byAttr.bod).toBe(6);
  });
  it("a repair never pre-pays a later loss (surplus discarded)", () => {
    // Two repairs of the same 2 points (two clients), then a new 2-point loss: the new loss stands.
    const st = restoreState([{ attr: "bod", lost: 2, rating: 4, seq: 1 }, { attr: "bod", lost: 2, rating: 4, seq: 4 }],
      [{ attr: "bod", points: 2, seq: 2 }, { attr: "bod", points: 2, seq: 3 }]);
    expect(st.byAttr.bod).toBe(2);
  });
  it("restore points and evaluate decay", () => {
    expect(restorePoints(5, 10)).toBe(2);
    expect(restorePoints(9, 3)).toBe(3);
    expect([1, 2, 3, 4, 5, 6].map(evaluateLoss)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(evaluateDegradation({ evalRuns: { a: 2, b: 3 }, evalRestores: { x: 1 } })).toBe(4);
    expect(evaluateDegradation({ evalRuns: { a: 1 }, evalRestores: { x: 5 } })).toBe(0);
  });
});
