// VR2.0 part 3 (docs/PLAN-vr2-part3.md; Virtual Realities 2.0 pp.40–53).
import { describe, it, expect } from "vitest";
import { blackDamage, grayTN, mpcpLoss, traceFactor, locationTurns, datatrailTurns, relocateTN, defuseTN, pcpicMod,
         psychoRecoveryTN, wormInfects, shutdownDice, finalWarning, traceTally, tarWins, personaVR2, foldDeck,
         foldVr2Ic, traceState } from "../module/rules/vr2ic-rules.mjs";
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
