/**
 * VR2.0 part 3: the rest of the IC (docs/PLAN-vr2-part3.md). State is an append-only log
 * of durable records (`recordEvent`, deterministic ids the server arbitrates):
 * - on the DECKER: connections, requests, the sequencer's facts, exits, traces;
 * - on the DECK item: its permanent history (`vr2deck:`);
 * - on IC and hosts: bomb ends, shutdowns.
 * Facts whose ORDER matters are written only by the world-wide sequencer, one queue on the
 * active GM's client, each with a `seq`. Players' clients create REQUESTS; the sequencer
 * admits or refuses them. Monitors and IC are changed only there.
 */
import { recordEvent, eventsOf, once } from "./claims.mjs";
import { foldVr2Ic, liveOpen, grayTN, mpcpLoss, tarWins, programKey } from "./rules/vr2ic-rules.mjs";
import { dumpShockDamage, systemTestVerdict, matrixCombatOutcome, damageBoxes, testTotalSuccesses, MATRIX_MONITOR_MAX } from "./rules/sr2e-rules.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { commitDamage } from "./drugs.mjs";
import { isVR2 } from "./vr2-mode.mjs";
import { enqueueAttack } from "./engagement.mjs";

export const P3 = "vr2:";
export const DECK = "vr2deck:";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const codeLabel = (code) => game.i18n.localize(CONFIG.SR2E.securityCodes[code]?.label ?? code);

// ── Reading ──────────────────────────────────────────────────────────────────

export const recordsOf = (doc) => eventsOf(doc).filter(e => String(e.key).startsWith(P3));
export const icGen = (uuid) => { const ic = sync(uuid); return ic?.type === "ic" ? (ic.system.generation ?? 0) : undefined; };
export const icKeyOf = (ic) => `${ic.uuid}#${ic.system.generation ?? 0}`;
export function icCrashSeq(icKey) {
  const i = String(icKey).lastIndexOf("#");
  return sync(icKey.slice(0, i))?.flags?.sr2e?.vr2Crashes?.[icKey.slice(i + 1)]?.seq ?? null;
}
export function foldOf(actor) {
  const tapeworms = (actor.system.vr2Deck?.worms ?? []).filter(w => w.kind === "tape").map(w => w.key);
  return foldVr2Ic(recordsOf(actor), { icGen, icCrashSeq, tapeworms });
}
/** Is this decker on part 3's connection log (any connection ever opened under it)? */
export const onLog = (actor) => liveOpen(recordsOf(actor)).any;
export const liveConn = (actor) => liveOpen(recordsOf(actor)).open;

// ── The sequencer (plan §0) ────────────────────────────────────────────────────

let SEQ = null;
function allDocs() {
  const out = new Map();
  for (const a of game.actors) out.set(a.uuid, a);
  for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && t.actor) out.set(t.actor.uuid, t.actor);
  return [...out.values()];
}
/** Seed the world-wide counter from the highest seq any record or crash flag carries. */
function seedSeq() {
  let max = 0;
  for (const a of allDocs()) {
    for (const e of recordsOf(a)) max = Math.max(max, Number(e.seq) || 0);
    for (const c of Object.values(a.flags?.sr2e?.vr2Crashes ?? {})) max = Math.max(max, Number(c?.seq) || 0);
  }
  return max;
}
export const isSequencer = () => !!game.users.activeGM?.isSelf;
/** Run `fn` in the sequencer's queue (active GM only; null elsewhere). */
export function sequencer(fn) {
  if (!isSequencer()) return Promise.resolve(null);
  return enqueueAttack("vr2gm", async () => { if (SEQ == null) SEQ = seedSeq(); return fn(); });
}
export const nextSeq = () => (SEQ = (SEQ ?? 0) + 1);
/** A sequencer fact: a durable record with the next seq. True only if this call created it. */
export const fact = (doc, key, payload) => recordEvent(doc, P3 + key, { ...payload, seq: nextSeq() });

/** A player's request: rolls included, admitted or refused by the sequencer. */
export async function request(actor, kind, data = {}) {
  const id = foundry.utils.randomID();
  const ok = await recordEvent(actor, `${P3}req:${kind}:${id}`, { type: "req", kind, id, user: game.user.id, ...data });
  if (ok && !game.users.activeGM) ui.notifications.info("Recorded: it's resolved when a GM is online.");
  return ok ? id : null;
}

// ── Entry (plan §0) ──────────────────────────────────────────────────────────

/**
 * Open a connection: the conn-open record alone (its number is server-arbitrated; a second
 * client opening the same number loses). Call inside `matrixQueue`.
 * @returns {Promise<number|null>} the connection number, or null if not opened.
 */
export async function openConnection(actor, { jackpoint = null } = {}) {
  const lo = liveOpen(recordsOf(actor));
  if (lo.open) { ui.notifications.warn(`${actor.name} is already in the Matrix: jack out first.`); return null; }
  const d = actor.system.cyberdeck ?? {};
  const n = lo.nextN;
  const ok = await recordEvent(actor, `${P3}conn-open:${n}`, { type: "connOpen", n, user: game.user.id, jackpoint,
    deck: actor.system.vr2Deck?.uuid ?? null, settings: { hardening: d.hardening ?? 0, deckMode: d.deckMode ?? "hot", iccm: !!d.iccm } });
  return ok ? n : null;
}

/** Deck activation is refused while connected (plan §0, R3 #6). */
export function deckLocked(actor) {
  return isVR2() && !!liveConn(actor);
}

// ── Exit (plan §3a) ────────────────────────────────────────────────────────────

/** The host a dump shock is figured from: the live session's, else the connection's jackpoint. */
function exitHost(actor) {
  const s = actor.flags?.sr2e?.vr2Session;
  const h = sync(s?.hostUuid) ?? sync(sync(liveConn(actor)?.jackpoint?.jackpoint)?.system?.host);
  return h?.type === "host" ? h : null;
}

/**
 * A voluntary exit (the sheet, a jackpoint): a graceful one needs a SUCCESSFUL Graceful
 * Logoff System Test card. Recorded as a request; the sequencer opens the exit.
 */
export function requestExit(actor, { trigger = "voluntary", gracefulCard = null, gateKey = null } = {}) {
  return request(actor, "exit", { trigger: gracefulCard ? "graceful" : trigger, gracefulCard, gateKey });
}

const HANDLERS = {
  /** Open the exit (one per connection; plan §3a). */
  async exit(actor, r, f) {
    if (!f.live) return { ok: false, why: "not connected" };
    if (f.live.exit) return { ok: true, why: "already leaving" };
    let trigger = r.trigger;
    if (trigger === "graceful") {
      const st = game.messages.get(r.gracefulCard)?.flags?.sr2e?.vr2SystemTest;
      const good = st?.operation === "gracefulLogoff" && st.actorUuid === actor.uuid && systemTestVerdict(st.successes, st.hostSuccesses).success;
      if (!good) return { ok: false, why: "no successful Graceful Logoff" };
    }
    const locks = f.live.locks.map(h => h.icKey);
    if (locks.length && (trigger === "voluntary" || trigger === "graceful")) return { ok: false, why: "black IC holds the connection: test Willpower, or pull the plug" };
    if (trigger === "gate") {
      const g = recordsOf(actor).find(e => e.type === "gate" && e.key === r.gateKey);
      if (!g?.success || g.n !== f.live.n) return { ok: false, why: "no successful Willpower test" };
    }
    await fact(actor, `exit-open:${f.live.n}`, { type: "exitOpen", n: f.live.n, trigger,
      locks: trigger === "gate" || trigger === "plug" ? locks : [] });
    return { ok: true };
  }
};
// ── Black IC and part 2's resolutions on the log (plan §3) ──────────────────────

const LEVEL_NAMES = { L: "Light", M: "Moderate", S: "Serious", D: "Deadly" };
/** Is the decker's icon down (the persona monitor full)? */
export const iconDown = (actor) => (actor?.system?.matrixPersona?.condition?.value ?? 0) >= MATRIX_MONITOR_MAX;
/** A black IC's effective rating: +2 while the decker's icon is down (p.48). */
export const blackRating = (ic, decker) => (ic?.system?.rating ?? 0) + (iconDown(decker) ? 2 : 0);
/** The kind of black IC a program is: lethal, non-lethal or psychotropic (null for others). */
export const blackKind = (program) => String(program ?? "").startsWith("black-") ? program.slice(6) : null;

/**
 * Every decker action but jacking out is refused while the icon is down, or while an exit
 * is open (plan §3, R2 #14). Returns the reason, or null.
 */
export function vr2ActionGuard(actor) {
  if (actor?.type !== "character" || !actor.system.vr2Conn) return null;
  if (foldOf(actor).live?.exit) return `${actor.name} is jacking out.`;
  if (iconDown(actor)) return `${actor.name}'s icon is down: you can only try to jack out (VR2.0 p.48).`;
  return null;
}

/** The deck a connection's permanent damage lands on: its own item, else the actor (manual). */
const deckDoc = (actor, conn) => sync(conn?.deck) ?? actor;
const chipGens = (actor) => actor.system.vr2Deck?.chipGen ?? { mpcp: 0, persona: 0 };

async function postResolution(actor, card, text, lines = [], extraFlags = {}) {
  if (!await once(actor, `${P3}card:res:${card}`)) return;
  const st = game.messages.get(card)?.flags?.sr2e?.matrix;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>${lines.map(l => `<br>${esc(l)}`).join("")}</div>`,
    flags: { sr2e: { resolves: card, closesTests: [st?.testMessageId].filter(Boolean),
      matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}`, ...extraFlags } } });
}

/** Open a dump/black-kill exit from inside the sequencer (one per connection). */
async function openExit(actor, trigger) {
  const f = foldOf(actor);
  if (!f.live || f.live.exit) return;
  // A damage dump or a black kill owes no last attack (p.48: the link just drops); only a
  // gate or pulled plug does, and those come through the exit request.
  await fact(actor, `exit-open:${f.live.n}`, { type: "exitOpen", n: f.live.n, trigger, locks: [] });
}

Object.assign(HANDLERS, {
  /** An IC's attack on a connected decker: admitted unless the decker is leaving (a listed last attack is). */
  async attack(actor, r, f) {
    if (!f.live) return { ok: false, why: "not connected", tell: false };
    const exit = f.live.exit;
    if (exit && !(r.lastAttack && (exit.locks ?? []).includes(r.icKey))) return { ok: false, why: "the decker is leaving" };
    if (!await fact(actor, `admit:${r.card}`, { type: "admit", conn: f.live.n, card: r.card, icKey: r.icKey, cls: r.cls, program: r.program })) return { ok: true };
    if (exit && r.lastAttack) await fact(actor, `exit-res:${f.live.n}:lastAttack:${r.icKey}`, { type: "exitRes", n: f.live.n, step: "lastAttack", ref: r.icKey, noEffect: true, card: r.card });
    return { ok: true };
  },

  /** A non-black resolution rolled by the defender: applied here, once (plan §0). */
  async apply(actor, r, f) {
    const conn = f.conn(r.conn);
    if (!conn?.admitted.some(a => a.card === r.card)) return { ok: false, why: "that attack wasn't admitted" };
    if (recordsOf(actor).some(e => e.type === "ack" && e.target === `attack:${r.card}`)) return { ok: true };
    const lines = [...(r.lines ?? [])];
    let crashed = false, text = `${actor.name} resists the Matrix attack.`;
    if (r.boxes > 0) {
      const { matrixDamage } = await import("./vr2.mjs");
      const { before, after } = await matrixDamage(actor, r.boxes);
      crashed = before < MATRIX_MONITOR_MAX && after >= MATRIX_MONITOR_MAX;
      text = `${actor.name} takes ${LEVEL_NAMES[r.level]} Matrix damage: ${r.boxes} box${r.boxes === 1 ? "" : "es"} (${after}/${MATRIX_MONITOR_MAX}).`;
      if (r.overloadCrash) crashed = true;
      if (r.overloadStun > 0) await commitDamage(actor, "stun", r.overloadStun, { source: "vr2-overload" });
    }
    await fact(actor, `ack:attack:${r.card}`, { type: "ack", target: `attack:${r.card}`, outcome: { crashed, boxes: r.boxes } });
    if (crashed) {
      const prog = r.program ?? "";
      if (prog === "blaster" || prog === "sparky") {
        await fact(actor, `gray:${r.card}`, { type: "gray", conn: r.conn, card: r.card, kind: prog, rating: r.rating ?? 0,
          chipGen: chipGens(actor).mpcp, hardening: conn.open?.settings?.hardening ?? 0 });
      }
      lines.push(`${actor.name}'s persona crashes: dumped from the Matrix.`);
      await openExit(actor, "dump");
    }
    await postResolution(actor, r.card, text, lines);
    return { ok: true };
  },

  /** A black hit: close the attack to Karma and freeze it (plan §3). */
  async black(actor, r, f) {
    const conn = f.conn(r.conn);
    if (!conn?.admitted.some(a => a.card === r.card)) return { ok: false, why: "that attack wasn't admitted" };
    if (conn.hits.some(h => h.card === r.card)) return { ok: true };
    const msg = game.messages.get(r.card), st = msg?.flags?.sr2e?.matrix;
    if (!st) return { ok: false, why: "the attack card is gone" };
    const tm = game.messages.get(st.testMessageId), test = tm?.flags?.sr2e?.test;
    if (test && !test.closed) {
      const { renderSuccessTestCard } = await import("./documents/actor.mjs");
      const next = { ...test, closed: true };
      await tm.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
    }
    const successes = test ? testTotalSuccesses(game.messages.get(st.testMessageId).flags.sr2e.test) : (st.successes ?? 0);
    await fact(actor, `hit:${r.card}`, { type: "hit", conn: r.conn, card: r.card, icKey: st.icKey, icName: st.attackerName,
      kind: blackKind(st.program), rating: st.power, level: st.level, attackSuccesses: successes,
      cool: conn.open?.settings?.deckMode === "cool", hardening: conn.open?.settings?.hardening ?? 0 });
    return { ok: true };
  }
});

/** Apply each black resistance record once (plan §3): the icon's boxes, the meat damage. */
async function applyResults(actor) {
  const recs = recordsOf(actor);
  const acked = new Set(recs.filter(e => e.type === "ack").map(e => e.target));
  for (const r of recs.filter(e => e.type === "res" && !acked.has(e.key))) {
    const hit = recs.find(e => e.type === "hit" && e.card === r.card);
    if (!hit) continue;
    const out = matrixCombatOutcome(hit.level, hit.attackSuccesses, r.successes);
    if (r.side === "icon") {
      let crashed = false;
      if (out.level) {
        const { matrixDamage } = await import("./vr2.mjs");
        const { before, after } = await matrixDamage(actor, out.boxes);
        crashed = before < MATRIX_MONITOR_MAX && after >= MATRIX_MONITOR_MAX;
      }
      await fact(actor, `ack:${r.key}`, { type: "ack", target: r.key, outcome: { boxes: out.boxes, crashed } });
    } else {
      const stun = hit.kind !== "lethal" || hit.cool;
      const boxes = out.level ? damageBoxes(out.level) : 0;
      const receipt = `flags.sr2e.vr2Receipts.meat${r.card}`;   // a message id: alphanumeric, path-safe
      if (boxes > 0 && !foundry.utils.getProperty(actor, receipt)) {
        await commitDamage(actor, stun ? "stun" : "physical", boxes, { extra: { [receipt]: true },
          skipIf: () => !!foundry.utils.getProperty(actor, receipt), source: "black-ic" });
      }
      const cm = actor.system.conditionMonitor ?? {};
      const down = (cm.physical?.value ?? 0) >= (cm.physical?.max ?? 10) || (cm.stun?.value ?? 0) >= (cm.stun?.max ?? 10);
      await fact(actor, `ack:${r.key}`, { type: "ack", target: r.key, outcome: { boxes, stun, down } });
      if (down) await openExit(actor, "black-kill");
    }
    const after = recordsOf(actor);
    const both = ["icon", "meat"].every(side => { const x = after.find(e => e.type === "res" && e.card === r.card && e.side === side); return x && after.some(e => e.type === "ack" && e.target === x.key); });
    if (both) {
      const o = (side) => after.find(e => e.type === "ack" && e.target === after.find(x => x.type === "res" && x.card === r.card && x.side === side).key).outcome;
      const ic = o("icon"), m = o("meat");
      const lines = [`Icon: ${ic.boxes} Matrix box${ic.boxes === 1 ? "" : "es"}${ic.crashed ? ": the icon is down, the connection stays, and black IC is +2 (p.48)" : ""}.`,
        `${actor.name}: ${m.boxes} box${m.boxes === 1 ? "" : "es"} of ${m.stun ? "Stun" : "Physical"} damage${m.down ? `, ${m.stun ? "unconscious" : "down"}: the connection drops after the IC's last shot at the MPCP` : ""}.`];
      await postResolution(actor, r.card, `${hit.icName} hits ${actor.name} with black IC (${hit.rating}${hit.level}).`, lines);
    }
  }
}


// ── IC crashes, gray IC and tar (plan §4) ──────────────────────────────────────

/**
 * Matrix boxes on an IC, inside the sequencer: a crash bumps the generation AND records the
 * crash fact with its seq in the SAME update (R7 #3), so traces and traps can order it.
 */
export async function icDamage(ic, boxes, card = "") {
  const before = ic.system.conditionMonitor?.value ?? 0;
  const after = Math.min(MATRIX_MONITOR_MAX, before + boxes);
  const update = { "system.conditionMonitor.value": after };
  if (before < MATRIX_MONITOR_MAX && after >= MATRIX_MONITOR_MAX) {
    const gen = ic.system.generation ?? 0;
    update["system.generation"] = gen + 1;
    update[`flags.sr2e.vr2Crashes.${gen}`] = { seq: nextSeq(), card };
  }
  await ic.update(update);
  return { before, after };
}

/** Crash an IC outright (tar baby/pit crash themselves, p.42): no tally. */
const crashIC = (ic, card) => icDamage(ic, MATRIX_MONITOR_MAX, card);

Object.assign(HANDLERS, {
  /** An attribute attack resolved on the defender's client (part 2): the attack is resolved; a ripper's chip test is requested. */
  async resolved(actor, r, f) {
    const conn = f.conn(r.conn);
    if (!conn?.admitted.some(a => a.card === r.card)) return { ok: false, why: "that attack wasn't admitted", tell: false };
    if (r.ripper && r.lost > 0) {
      await fact(actor, `ripper:${r.card}`, { type: "ripper", conn: r.conn, card: r.card, attr: r.attr, rating: r.rating,
        chipGen: chipGens(actor).persona, hardening: conn.open?.settings?.hardening ?? 0 });
    }
    if (!recordsOf(actor).some(e => e.type === "ack" && e.target === `attack:${r.card}`)) {
      await fact(actor, `ack:attack:${r.card}`, { type: "ack", target: `attack:${r.card}`, outcome: { lost: r.lost ?? 0 } });
    }
    return { ok: true };
  }
});

/** The Ripper Test (p.43): rating dice vs MPCP + Hardening; each success costs the persona chip a point. */
async function applyRippers(actor) {
  const recs = recordsOf(actor);
  for (const rp of recs.filter(e => e.type === "ripper" && !recs.some(a => a.type === "ack" && a.target === e.key))) {
    const conn = recs.find(e => e.type === "connOpen" && e.n === rp.conn);
    const tn = grayTN("ripper", actor.system.cyberdeck?.mpcp ?? 0, rp.hardening);
    const r = await SR2ESuccessRoll.successTest(rp.rating ?? 0, tn);
    const loss = mpcpLoss("ripper", r.successes);
    if (loss > 0) await recordEvent(deckDoc(actor, conn), `${DECK}dmg:ripper:${rp.card}`, { type: "deckDmg", attr: rp.attr, amount: loss, chipGen: rp.chipGen });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: r.rolls, content: `<div class="sr2e-damage-result">
      Ripper Test against ${esc(actor.name)}'s persona chip (TN ${tn}): ${r.successes} success${r.successes === 1 ? "" : "es"},
      ${rp.attr} chip −${loss} until the chip is replaced (VR2.0 p.43).</div>` });
    await fact(actor, `ack:${rp.key}`, { type: "ack", target: rp.key, outcome: { loss } });
  }
}

/**
 * Gray IC crashed the persona (p.43): the Blaster/Sparky Test against the connection's deck,
 * bound to the chip it hit. Sparky also burns the decker: (rating)M staged by its successes,
 * resisted with Body (Hardening reduces the Power); a non-lethal design, so Stun (a stated reading).
 */
async function resolveGray(actor, f, s) {
  const g = recordsOf(actor).find(e => e.type === "gray" && e.card === s.ref);
  if (!g) return;
  const key = `exit-res:${f.live.n}:gray:${s.ref}`;
  const conn = f.live.open;
  const mpcp = actor.system.cyberdeck?.mpcp ?? 0;
  const tn = grayTN(g.kind, mpcp, g.hardening);
  const r = await SR2ESuccessRoll.successTest(g.rating ?? 0, tn);
  const loss = Math.min(mpcp, mpcpLoss(g.kind, r.successes));
  await fact(actor, key, { type: "exitRes", n: f.live.n, step: "gray", ref: s.ref, successes: r.successes, loss, tn,
    sparky: g.kind === "sparky" ? { power: g.rating, level: matrixCombatOutcome("M", r.successes, 0).level ?? "M" } : null });
  if (loss > 0) await recordEvent(deckDoc(actor, conn), `${DECK}dmg:gray:${s.ref}`, { type: "deckDmg", attr: "mpcp", amount: loss, chipGen: g.chipGen });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: r.rolls, content: `<div class="sr2e-damage-result">
    <strong>${g.kind === "sparky" ? "Sparky" : "Blaster"} Test on ${esc(actor.name)}'s MPCP</strong> (TN ${tn}): ${r.successes} success${r.successes === 1 ? "" : "es"}, MPCP −${loss}
    (replace the chip to restore it; persona programs must fit MPCP × 3, VR2.0 p.43).${g.kind === "sparky"
      ? `<br>The deck's power supply jolts ${esc(actor.name)}: <strong>${g.rating}${matrixCombatOutcome("M", r.successes, 0).level ?? "M"}</strong> Stun, Body against ${Math.max(2, g.rating - g.hardening)} (Hardening off the Power).
         <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-vr2ic-btn" data-actor="${esc(actor.uuid)}" data-op="sparky" data-arg="${esc(s.ref)}">Resist the jolt (Body)</button></div>` : ""}</div>` });
  if (g.kind !== "sparky") await ackGray(actor, key, g.key);
}
const ackGray = async (actor, resKey, grayKey) => {
  await fact(actor, `ack:${P3}${resKey}`, { type: "ack", target: P3 + resKey });
  await fact(actor, `ack:${grayKey}`, { type: "ack", target: grayKey });
};

/** The decker's Body against sparky's jolt: recorded on their client, applied here. */
export async function resistSparky(actor, card) {
  const recs = recordsOf(actor);
  const res = recs.find(e => e.type === "exitRes" && e.step === "gray" && e.ref === card);
  if (!res?.sparky) return;
  if (recs.some(e => e.type === "res" && e.card === card && e.side === "sparky")) return ui.notifications.info("Already resisted.");
  const tn = Math.max(2, res.sparky.power - (recs.find(e => e.type === "gray" && e.card === card)?.hardening ?? 0));
  const r = await actor.rollSuccessTest(actor.system.body?.value ?? 0, tn, { label: `Resist sparky's jolt — Body (TN ${tn})`, isResistance: true, tnContext: { kind: "other" } });
  if (r) await recordEvent(actor, `${P3}res:${card}:sparky`, { type: "res", card, side: "sparky", successes: r.successes });
}
async function applySparky(actor) {
  const recs = recordsOf(actor);
  for (const r of recs.filter(e => e.type === "res" && e.side === "sparky" && !recs.some(a => a.type === "ack" && a.target === e.key))) {
    const res = recs.find(e => e.type === "exitRes" && e.step === "gray" && e.ref === r.card);
    const out = matrixCombatOutcome(res.sparky.level, 0, r.successes);
    const boxes = out.level ? damageBoxes(out.level) : 0;
    const receipt = `flags.sr2e.vr2Receipts.sparky${r.card}`;
    if (boxes > 0 && !foundry.utils.getProperty(actor, receipt)) {
      await commitDamage(actor, "stun", boxes, { extra: { [receipt]: true }, skipIf: () => !!foundry.utils.getProperty(actor, receipt), source: "vr2-sparky" });
    }
    await fact(actor, `ack:${r.key}`, { type: "ack", target: r.key, outcome: { boxes } });
    const g = recs.find(e => e.type === "gray" && e.card === r.card);
    await ackGray(actor, res.key.slice(P3.length), g.key);
  }
}

/** Tar IC on this host, for the GM, after a System Test that used a utility (plan §4). */
export async function offerTar(message) {
  const st = message?.flags?.sr2e?.vr2SystemTest;
  if (!isSequencer() || !st?.utilityRef || st.conn == null) return;
  const tars = game.actors.filter(a => a.type === "ic" && a.system.hostUuid === st.hostUuid && /^tar-/.test(a.system.program));
  if (!tars.length) return;
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
    ${esc(st.actorName)} used ${esc(st.utilityRef.name)} (${st.utilityRef.rating}) on ${esc(st.hostName)}: tar IC there may strike (VR2.0 p.42).
    <div class="sr2e-karma-actions">${tars.map(t => `<button type="button" class="sr2e-vr2ic-btn" data-actor="${esc(st.actorUuid)}" data-op="tar"
      data-arg="${esc(`${message.id}|${t.uuid}`)}">${esc(t.name)} strikes</button>`).join("")}</div></div>` });
}

/**
 * A tar strike (p.42–43): Tar (utility rating) against the utility (tar rating), rolled here
 * and recorded on the decker; the tar wins only on MORE successes. A win crashes that COPY of
 * the utility and the tar itself (no tally); tar pit then corrupts every copy on the deck.
 * `ref` is the utility as it was used (a Swap Memory since leaves the fresh copy alone).
 */
export async function tarStrike(actor, ic, ref, card) {
  if (!isSequencer()) return ui.notifications.warn("Tar strikes are the GM's (the active GM's client).");
  return sequencer(async () => {
    const icKey = icKeyOf(ic), key = `tar:${card}:${icKey}`;
    if (recordsOf(actor).some(e => e.key === P3 + key)) return ui.notifications.info("That tar has already struck.");
    const tar = await SR2ESuccessRoll.successTest(ic.system.rating ?? 0, Math.max(2, ref.rating));
    const util = await SR2ESuccessRoll.successTest(ref.rating ?? 0, Math.max(2, ic.system.rating ?? 0));
    const won = tarWins(tar.successes, util.successes);
    const pit = won && ic.system.program === "tar-pit";
    const conn = liveConn(actor);
    const item = actor.items.get(ref.itemId);
    const pKey = programKey({ source: item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId, name: ref.name });
    const g = actor.system.vr2Deck?.reloadGen?.(pKey) ?? 0;
    const pitRoll = pit ? await SR2ESuccessRoll.successTest(ic.system.rating ?? 0, grayTN("tar-pit", actor.system.cyberdeck?.mpcp ?? 0, conn?.settings?.hardening ?? 0)) : null;
    if (!await fact(actor, key, { type: "tar", card, icKey, won, tar: tar.successes, util: util.successes, pit: pitRoll?.successes ?? null, programKey: pKey, g })) return;
    if (won) {
      await recordEvent(actor, `${P3}crash:${ref.itemId}:${ref.loadGen}:tar-${card}`, { type: "crash", programId: ref.itemId, loadGen: ref.loadGen });
      await crashIC(ic, card);
      if (pitRoll?.successes > 0) await recordEvent(deckDoc(actor, conn), `${DECK}corrupt:${pKey}:${g}:tar-${card}`, { type: "corrupt", programKey: pKey, g });
    }
    const sensor = !won ? await SR2ESuccessRoll.successTest(actor.system.matrixPersona?.sensor ?? 0, Math.max(2, ic.system.rating ?? 0)) : null;
    const notice = !sensor ? "" : sensor.successes >= 3 ? `notices ${esc(ic.name)} (rating ${ic.system.rating})` : sensor.successes === 2 ? "notices tar IC" : sensor.successes === 1 ? "notices it triggered IC" : "notices nothing";
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      <strong>${esc(ic.name)} vs ${esc(ref.name)}</strong>: ${tar.successes} against ${util.successes}.
      ${won ? `The tar wins: ${esc(ref.name)} crashes (a Swap Memory reloads it) and so does the tar, with no tally.${pit
        ? (pitRoll.successes > 0 ? ` <strong>Tar pit: every copy of ${esc(ref.name)} on the deck is corrupted</strong> until reloaded from outside after jacking out (p.43).` : " Tar pit: its viral code is defeated.") : ""}`
        : `The utility holds. The decker's secret Sensor test: ${sensor.successes} (${notice}; p.40).`}</div>` });
    if (won) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)}'s ${esc(ref.name)} crashes (tar IC, VR2.0 p.42).</div>` });
  });
}

/** Register a request handler (later stages add theirs). */
export const addHandler = (kind, fn) => { HANDLERS[kind] = fn; };

/** Process every pending request on a decker, in arrival order (sequencer only). */
async function processRequests(actor) {
  const recs = recordsOf(actor);
  const done = new Set(recs.filter(e => e.type === "done").map(e => e.req));
  const pending = recs.filter(e => e.type === "req" && !done.has(e.key)).sort((a, b) => (a.ct ?? 0) - (b.ct ?? 0) || String(a.key).localeCompare(String(b.key)));
  for (const r of pending) {
    const h = HANDLERS[r.kind];
    let out = { ok: false, why: "unknown request" };
    try { if (h) out = (await h(actor, r, foldOf(actor))) ?? { ok: true }; }
    catch (err) { console.error("SR2E | vr2 request", r.kind, err); out = { ok: false, why: err.message }; }
    await fact(actor, `done:${r.key}`, { type: "done", req: r.key, ok: !!out.ok, why: out.why ?? "" });
    if (!out.ok && out.why && out.tell !== false) {
      ChatMessage.create({ whisper: [r.user, ...ChatMessage.getWhisperRecipients("GM").map(u => u.id)].filter(Boolean),
        content: `<div class="sr2e-item-card">${esc(actor.name)}: request refused (${esc(out.why)}).</div>` });
    }
  }
}

/** Steps the sequencer can resolve by itself; the rest wait on players or the GM. */
const STEP_RESOLVERS = {
  gray: (actor, f, s) => resolveGray(actor, f, s),
  async dumpShock(actor, f, s) {
    const host = exitHost(actor);
    const set = f.live.open?.settings ?? {};
    const dmg = host ? dumpShockDamage(host.system.securityCode, host.system.securityValue,
      { coolDeck: set.deckMode === "cool", iccm: !!set.iccm, tortoise: set.deckMode === "tortoise" }) : null;
    const key = `exit-res:${f.live.n}:dumpShock:`;
    await fact(actor, key, { type: "exitRes", n: f.live.n, step: "dumpShock", ref: "", noEffect: !dmg,
      power: dmg?.power ?? 0, level: dmg?.level ?? "", hostName: host?.name ?? "" });
    if (!dmg) return;
    if (await once(actor, `${P3}card:dump:${f.live.n}`)) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">
        <strong>⌁ ${esc(actor.name)} is dumped from the Matrix: dump shock.</strong>
        <br><em>${dmg.power}${dmg.level} Stun from ${esc(host.name)} (${esc(codeLabel(host.system.securityCode))}); resisted with Body, no armour (VR2.0 p.124).</em>
        <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn" data-power="${dmg.power}" data-level="${dmg.level}"
          data-damage-type="stun" data-armor-calc="none" data-target-uuid="${esc(actor.uuid)}">Resist dump shock (${dmg.power}${dmg.level} Stun)</button></div></div>` });
    }
    await fact(actor, `ack:${P3}${key}`, { type: "ack", target: P3 + key });
  }
};
export const addStepResolver = (step, fn) => { STEP_RESOLVERS[step] = fn; };

STEP_RESOLVERS.finalShot = async (actor, f, s) => {
  const hit = f.live.hits.find(h => h.card === s.ref);
  const conn = f.live.open;
  const mpcp = actor.system.cyberdeck?.mpcp ?? 0;
  const tn = grayTN("blaster", mpcp, conn?.settings?.hardening ?? 0);
  const r = await SR2ESuccessRoll.successTest(2 * (hit?.rating ?? 0), tn);
  const loss = Math.min(mpcp, mpcpLoss("blaster", r.successes));
  const key = `exit-res:${f.live.n}:finalShot:${s.ref}`;
  await fact(actor, key, { type: "exitRes", n: f.live.n, step: "finalShot", ref: s.ref, successes: r.successes, loss, tn });
  if (loss > 0) await recordEvent(deckDoc(actor, conn), `${DECK}dmg:final:${s.ref}`, { type: "deckDmg", attr: "mpcp", amount: loss, chipGen: chipGens(actor).mpcp });
  if (await once(actor, `${P3}card:final:${s.ref}`)) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: r.rolls, content: `<div class="sr2e-damage-result">
      <strong>${esc(hit?.icName ?? "Black IC")} takes its shot at ${esc(actor.name)}'s MPCP</strong> (as blaster, double rating: ${2 * (hit?.rating ?? 0)} dice vs TN ${tn}):
      ${r.successes} success${r.successes === 1 ? "" : "es"}, MPCP −${loss}.${loss >= mpcp && mpcp > 0 ? " <strong>The MPCP is destroyed: every file downloaded this run is deleted</strong> (VR2.0 p.48)." : ""}</div>` });
  }
  await fact(actor, `ack:${P3}${key}`, { type: "ack", target: P3 + key });
};

/** Advance an open exit: resolve what the sequencer can, then end the connection at the barrier. */
async function advanceExit(actor) {
  let f = foldOf(actor);
  if (!f.live?.exit) return;
  // An admitted attack nobody will resist (it missed, Karma included) resolves as a miss.
  for (const a of f.live.pending) {
    const st = game.messages.get(a.card)?.flags?.sr2e?.matrix;
    const t = game.messages.get(st?.testMessageId)?.flags?.sr2e?.test;
    const live = t ? testTotalSuccesses(t) : (st?.successes ?? 0);
    if (st && live <= 0 && !f.live.hits.some(h => h.card === a.card)) {
      await fact(actor, `ack:attack:${a.card}`, { type: "ack", target: `attack:${a.card}`, outcome: { miss: true } });
    }
  }
  f = foldOf(actor);
  for (const s of f.live.steps) {
    if (s.res) continue;
    if (s.step === "lastAttack") {
      // The locking IC makes one more attack (the GM rolls it); destroyed meanwhile → cancelled (R5 #5).
      const [u, g] = [s.ref.slice(0, s.ref.lastIndexOf("#")), Number(s.ref.slice(s.ref.lastIndexOf("#") + 1))];
      if (icGen(u) !== g) {
        await fact(actor, `exit-res:${f.live.n}:lastAttack:${s.ref}`, { type: "exitRes", n: f.live.n, step: "lastAttack", ref: s.ref, cancelled: true });
        f = foldOf(actor);
      } else if (await once(actor, `${P3}card:last:${f.live.n}:${s.ref}`)) {
        await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u2 => u2.id), content: `<div class="sr2e-item-card">
          <strong>${esc(sync(u)?.name ?? "Black IC")}</strong> makes one more attack on ${esc(actor.name)} before the link drops (VR2.0 p.48):
          attack from the IC's sheet with ${esc(actor.name)} targeted.</div>` });
      }
      continue;
    }
    const r = STEP_RESOLVERS[s.step];
    if (r) { await r(actor, f, s); f = foldOf(actor); }
  }
  if (!f.live?.barrier) return;
  const n = f.live.n;
  if (!await fact(actor, `conn-end:${n}`, { type: "connEnd", n })) return;
  await afterEnd(actor, n);
}

/** Housekeeping after an end (any client may repeat it): part 1's session, the stored mode, the card. */
export async function afterEnd(actor, n) {
  const { closeSession } = await import("./vr2.mjs");
  await closeSession(actor);
  if (actor._source?.system?.matrixMode) await actor.update({ "system.matrixMode": false });
  const exit = recordsOf(actor).find(e => e.type === "exitOpen" && e.n === n);
  if (await once(actor, `${P3}card:left:${n}`)) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-damage-result"><strong>⌁ ${esc(actor.name)} ${exit?.trigger === "graceful" ? "logs off gracefully" : "is out of the Matrix"}.</strong></div>` });
  }
}

// ── Reconciliation ─────────────────────────────────────────────────────────────

const PENDING = new Map();
/** Debounced: process requests and advance exits for one decker (sequencer only). */
export function schedule(actor) {
  if (!isSequencer() || actor?.type !== "character" || !isVR2()) return;
  clearTimeout(PENDING.get(actor.uuid));
  PENDING.set(actor.uuid, setTimeout(() => {
    PENDING.delete(actor.uuid);
    const gone = actor.isToken ? !actor.token?.parent?.tokens?.has(actor.token.id) : !game.actors.has(actor.id);
    if (gone) return;
    sequencer(async () => { await processRequests(actor); await applyResults(actor); await applyRippers(actor); await applySparky(actor); await advanceExit(actor); })
      .catch(err => console.error("SR2E | vr2 sequencer", err));
  }, 150));
}

/**
 * An interrupted jack-in can leave a live connection whose jackpoint session entry was
 * never written: the user who started it rebuilds it from the connection record (R6 #2).
 */
export async function rebuildJackpointEntries() {
  if (!isVR2()) return;
  for (const a of allDocs()) {
    const jp = a.type === "character" && a.isOwner ? a.system.vr2Conn?.jackpoint : null;
    if (!jp?.session || jp.user !== game.user.id || a.flags?.sr2e?.matrixSessions?.[jp.session]) continue;
    await a.update({ [`flags.sr2e.matrixSessions.${jp.session}`]: { jackpoint: jp.jackpoint, originToken: jp.originToken,
      destScene: jp.destScene, user: jp.user, since: Date.now() } });
  }
}

/** One dispatcher for part 3's card buttons. */
export async function icOp(uuid, op, arg) {
  const actor = await fromUuid(uuid);
  if (!actor) return;
  if (op === "sparky") return resistSparky(actor, arg);
  if (op === "tar") {
    const [card, icUuid] = arg.split("|");
    const st = game.messages.get(card)?.flags?.sr2e?.vr2SystemTest, ic = await fromUuid(icUuid);
    if (st?.utilityRef && ic) return tarStrike(actor, ic, st.utilityRef, card);
  }
}

export function registerVr2IcHooks() {
  const all = () => { for (const a of allDocs()) if (a.type === "character") schedule(a); };
  Hooks.once("ready", all);
  Hooks.once("ready", rebuildJackpointEntries);
  Hooks.on("userConnected", all);
  const onRecord = async (e) => {
    const key = String(e.flags?.sr2e?.claim?.key ?? "");
    if (!key.startsWith(P3) || !(e.parent instanceof Actor)) return;
    schedule(e.parent);
    // Connection changes move the derived Matrix mode: let the jackpoints and cues catch up.
    if (/^vr2:conn-(open|end):/.test(key)) {
      const jp = await import("./jackpoints.mjs");
      jp.scheduleReconcile?.(e.parent); jp.refreshActorTokens?.(e.parent);
    }
  };
  Hooks.on("createActiveEffect", onRecord);
  Hooks.on("createChatMessage", (m) => { if (m.flags?.sr2e?.vr2SystemTest) offerTar(m).catch(err => console.error("SR2E | tar offer", err)); });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-vr2ic-btn").forEach(b => b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try { await icOp(b.dataset.actor, b.dataset.op, b.dataset.arg ?? ""); } catch (err) { console.error("SR2E | vr2 IC", err); ui.notifications.error(err.message); }
    }));
  });
  // One deck per connection (plan §0): no deck switches while connected.
  Hooks.on("preUpdateItem", (item, changes) => {
    if (!foundry.utils.hasProperty(changes, "system.deck.active") || !(item.parent instanceof Actor)) return;
    if (!deckLocked(item.parent)) return;
    ui.notifications.warn(`${item.parent.name} is in the Matrix: jack out before switching decks (VR2.0).`);
    return false;
  });
}
