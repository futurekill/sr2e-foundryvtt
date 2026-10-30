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
import { foldVr2Ic, liveOpen, grayTN, mpcpLoss, tarWins, programKey, locationTurns, datatrailTurns, openBoundary,
         boundariesToTick, RESPONSE_TIMES, wormInfects, shutdownState, shutdownDice, finalWarning, pcpicMod,
         isProactive, cascadeOutcomes, cascadeBonus, partyBudget, parseIcKey, iconKeyOf, constructBudget, THREAT_CAP } from "./rules/vr2ic-rules.mjs";
import { icClass } from "./rules/sr2e-rules.mjs";
import { dumpShockDamage, systemTestVerdict, matrixCombatOutcome, damageBoxes, testTotalSuccesses, MATRIX_MONITOR_MAX } from "./rules/sr2e-rules.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { commitDamage } from "./drugs.mjs";
import { isVR2 } from "./vr2-mode.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { RL } from "./util/roll-label.mjs";

export const P3 = "vr2:";
export const DECK = "vr2deck:";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const codeLabel = (code) => game.i18n.localize(CONFIG.SR2E.securityCodes[code]?.label ?? code);

// ── Reading ──────────────────────────────────────────────────────────────────

export const recordsOf = (doc) => eventsOf(doc).filter(e => String(e.key).startsWith(P3));
export const icGen = (uuid) => { const ic = sync(uuid); return ic?.type === "ic" ? (ic.system.generation ?? 0) : undefined; };
/** The IC's key: the icon `uuid#gen`, or a construct component's effect `uuid#gen/<comp>` (part 4b §1). */
export const icKeyOf = (ic, comp = "") => `${ic.uuid}#${ic.system.generation ?? 0}${comp ? `/${comp}` : ""}`;
export { parseIcKey, iconKeyOf };
/** The IC actor a key names (icon or component). */
export const icOfKey = (key) => sync(parseIcKey(key).uuid);
export function icCrashSeq(icKey) {
  const { uuid, gen } = parseIcKey(icKey);
  return sync(uuid)?.flags?.sr2e?.vr2Crashes?.[gen]?.seq ?? null;
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

/**
 * Before any jack-in (plan §3b, §7): an offline host refuses, and cyberphobia demands a
 * Willpower (rating) test first (p.49). False aborts BEFORE anything changes.
 */
export async function mayJackIn(actor, host) {
  if (host && hostOffline(host)) { ui.notifications.warn(`${host.name} is shut down (VR2.0 p.53).`); return false; }
  const phobia = (actor.system.vr2Psy ?? []).filter(c => c.kind === "cyberphobia").sort((a, b) => b.rating - a.rating)[0];
  if (!phobia) return true;
  const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, phobia.rating, { label: RL("Cyberphobia", { rating: phobia.rating }), tnContext: { kind: "other" } });
  if ((r?.successes ?? 0) > 0) return true;
  ui.notifications.info(`${actor.name} can't bring themself to jack in.`);
  return false;
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

/** Exit steps the sequencer resolves by itself (filled below); the rest wait on players or the GM. */
const STEP_RESOLVERS = {};

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
/** A black IC's effective rating: +2 while the decker's icon is down (p.48). `rating` = a component's or a frozen one. */
export const blackRating = (ic, decker, rating = null) => (rating ?? ic?.system?.rating ?? 0) + (iconDown(decker) ? 2 : 0);

// ── Part 4b: constructs (docs/PLAN-vr2-part4b.md; p.52) ──────────────────────────
export const isConstruct = (ic) => ic?.type === "ic" && !!ic.system.construct?.enabled;
/** The program profile an IC acts with: a construct's component, or the IC itself. */
export function icProfile(ic, comp = "") {
  const c = isConstruct(ic) ? ic.system.construct.components.find(x => x.id === comp) : null;
  const src = c ?? ic?.system ?? {};
  return { comp: c ? comp : "", program: src.program ?? "", rating: src.rating ?? 0, icClass: c ? icClass(c.program, "white") : ic?.system?.icClass,
    psychotropic: src.psychotropic ?? "", scramble: src.scramble ?? "", worm: src.worm ?? "" };
}
/** Threat dice (p.52): a construct's Threat Rating within its code's cap; none for other IC. Never on Initiative. */
export const threatOf = (ic) => isConstruct(ic) ? Math.min(ic.system.construct.threat ?? 0, THREAT_CAP[ic.system.securityCode] ?? 0) : 0;
/** The construct's budget and row problems (part 4b §6, R15). */
export function constructProblems(ic) {
  const host = sync(ic.system.hostUuid);
  return constructBudget({ sv: host?.system.securityValue ?? 0, code: ic.system.securityCode, components: ic.system.construct.components,
    defenses: (ic.system.armorDefense ? 1 : 0) + (ic.system.defense ? 1 : 0), threat: ic.system.construct.threat, icClassOf: (p) => icClass(p, "white") });
}
const compCrashKey = (gen, comp) => `${P3}comp-crash:${gen}:${comp}`;
/** Can this construct component act now (R1)? Same generation, the row exists, not crashed, the icon not down, a valid build. */
export function compAvailable(ic, comp, gen = ic?.system?.generation ?? 0, { budget = true } = {}) {
  if (!isConstruct(ic) || gen !== (ic.system.generation ?? 0)) return false;
  if (!ic.system.construct.components.some(c => c.id === comp)) return false;
  if ((ic.system.conditionMonitor?.value ?? 0) >= MATRIX_MONITOR_MAX) return false;
  if (recordsOf(ic).some(e => e.key === compCrashKey(gen, comp))) return false;
  return !budget || constructProblems(ic).problems.length === 0;
}
/** Crash one component (tar won, disinfect): the construct goes on (R3, R5). */
export const crashComponent = (ic, gen, comp, card = "") => recordEvent(ic, compCrashKey(gen, comp), { type: "compCrash", gen, comp, card });
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
    if (r.conn != null && r.conn !== f.live.n) return { ok: false, why: "that attack hit an earlier connection" };
    const exit = f.live.exit;
    if (exit && !(r.lastAttack && (exit.locks ?? []).includes(r.icKey))) return { ok: false, why: "the decker is leaving" };
    if (!await fact(actor, `admit:${r.card}`, { type: "admit", conn: f.live.n, card: r.card, icKey: r.icKey, cls: r.cls, program: r.program,
      cascade0: r.cascade0 ?? null, successes: Number.isInteger(r.successes) ? r.successes : null })) return { ok: true };
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
        await fact(actor, `gray:${r.card}`, { type: "gray", conn: r.conn, card: r.card, kind: prog, rating: r.rating ?? 0, threat: r.threat ?? 0,
          chipGen: chipGens(actor).mpcp, hardening: conn.open?.settings?.hardening ?? 0 });
      }
      lines.push(`${actor.name}'s persona crashes: dumped from the Matrix.`);
      await openExit(actor, "dump");
    }
    await postResolution(actor, r.card, text, lines);
    return { ok: true };
  },

  /** A black hit: close the attack to Karma and freeze it (plan §3), after the decker's Shield decision (part 4b R10). */
  async black(actor, r, f) {
    const conn = f.conn(r.conn);
    if (!conn?.admitted.some(a => a.card === r.card)) return { ok: false, why: "that attack wasn't admitted" };
    if (r.shieldDecided && !shieldOf(actor, r.card)) return { ok: false, why: "no Shield decision" };
    return freezeBlack(actor, r.card, r.conn, { legacy: !r.shieldDecided });
  }
});

/** The decker's durable Shield decision for a black card (part 4b R10): first record wins. */
export const shieldOf = (actor, card) => recordsOf(actor).find(e => e.key === `${P3}shield:${card}`) ?? null;

/**
 * Wear the Shield (once per card) and freeze a black hit — or, when the Shield took every success, end the
 * attack with no hit (part 4b R10). Idempotent; run by the `black` handler and by `reconcileShieldFreeze`.
 */
async function freezeBlack(actor, card, connN, { legacy = false } = {}) {
  const conn = foldOf(actor).conn(connN);
  if (!conn?.admitted.some(a => a.card === card)) return { ok: false, why: "that attack wasn't admitted" };
  if (conn.hits.some(h => h.card === card) || recordsOf(actor).some(e => e.type === "ack" && e.target === `attack:${card}`)) return { ok: true };
  const msg = game.messages.get(card), st = msg?.flags?.sr2e?.matrix;
  if (!st) return { ok: false, why: "the attack card is gone" };
  const sh = shieldOf(actor, card);
  if (!sh && !legacy) return { ok: false, why: "no Shield decision" };
  if (sh?.itemId) {                                   // the sequencer alone wears it, once per card (R10.3)
    const { addWear } = await import("./vr2.mjs");
    await addWear(actor, { itemId: sh.itemId, loadGen: sh.loadGen ?? 0 }, card);
  }
  const tm = game.messages.get(st.testMessageId), test = tm?.flags?.sr2e?.test;
  if (test && !test.closed) {
    const { renderSuccessTestCard } = await import("./documents/actor.mjs");
    const next = { ...test, closed: true };
    await tm.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
  }
  const successes = test ? testTotalSuccesses(game.messages.get(st.testMessageId).flags.sr2e.test) : (st.successes ?? 0);
  const net = Math.max(0, successes - (sh?.successes ?? 0));
  if (net <= 0) {
    await fact(actor, `ack:attack:${card}`, { type: "ack", target: `attack:${card}`, outcome: { boxes: 0, shieldCancelled: true } });
    await postResolution(actor, card, `${actor.name}'s Shield stops ${st.attackerName}'s black IC.`, [`Shield ${sh?.successes ?? 0} against ${successes} attack success${successes === 1 ? "" : "es"} (VR2.0 p.100).`]);
    return { ok: true };
  }
  await fact(actor, `hit:${card}`, { type: "hit", conn: connN, card, icKey: st.icKey, icName: st.attackerName,
    kind: blackKind(st.program), rating: st.power, icRating: st.icRating ?? null, threat: st.threat ?? 0, psychotropic: st.psychotropic ?? "",
    level: st.level, attackSuccesses: net, shield: sh?.successes ?? 0,
    cool: conn.open?.settings?.deckMode === "cool", hardening: conn.open?.settings?.hardening ?? 0 });
  return { ok: true };
}

/** Finish any black card with a Shield decision but no hit and no ack (part 4b R10.6). */
async function reconcileShieldFreeze(actor) {
  const f = foldOf(actor);
  if (!f.live) return;
  const recs = recordsOf(actor);
  for (const a of f.live.admitted) {
    if (!shieldOf(actor, a.card) || f.live.hits.some(h => h.card === a.card) || recs.some(e => e.type === "ack" && e.target === `attack:${a.card}`)) continue;
    await freezeBlack(actor, a.card, f.liveN);
  }
}

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
  if (update["system.generation"] != null) await fireTrap(ic, `${ic.uuid}#${update["system.generation"] - 1}`);
  return { before, after };
}

/** A trap IC crashed or finished its trace: the hidden gray/black IC it guards wakes up (p.50–51). */
async function fireTrap(ic, icKey) {
  const hidden = sync(ic.system.trapFor);
  if (!hidden || !await once(ic, `${P3}trap:${iconKeyOf(icKey)}`)) return;   // once per icon, however many effects reach it
  if (isConstruct(hidden)) {
    return ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      ${esc(ic.name)} was a trap for ${esc(hidden.name)}, but a construct can't be a hidden trap IC: wake it by hand if you want it (VR2.0 p.50, p.52).</div>` });
  }
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
    <strong>Trap!</strong> ${esc(ic.name)} was a trap: <strong>${esc(hidden.name)}</strong> (${esc(hidden.system.program || hidden.system.icType)}, rating ${hidden.system.rating}) activates (VR2.0 p.50).</div>` });
}

/** Crash an IC outright (tar baby/pit crash themselves, p.42): no tally. */
const crashIC = (ic, card) => icDamage(ic, MATRIX_MONITOR_MAX, card);

Object.assign(HANDLERS, {
  /** An attribute attack resolved on the defender's client (part 2): the attack is resolved; a ripper's chip test is requested. */
  async resolved(actor, r, f) {
    const conn = f.conn(r.conn);
    if (!conn?.admitted.some(a => a.card === r.card)) return { ok: false, why: "that attack wasn't admitted", tell: false };
    if (!Number.isInteger(r.lost)) return { ok: false, why: "no committed attribute loss", tell: false };
    if (r.ripper && r.lost > 0) {
      await fact(actor, `ripper:${r.card}`, { type: "ripper", conn: r.conn, card: r.card, attr: r.attr, rating: r.rating, threat: r.threat ?? 0,
        chipGen: chipGens(actor).persona, hardening: conn.open?.settings?.hardening ?? 0 });
    }
    if (!recordsOf(actor).some(e => e.type === "ack" && e.target === `attack:${r.card}`)) {
      await fact(actor, `ack:attack:${r.card}`, { type: "ack", target: `attack:${r.card}`, outcome: { lost: r.lost } });
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
    const r = await SR2ESuccessRoll.successTest((rp.rating ?? 0) + (rp.threat ?? 0), tn);   // + a construct's threat (4b R2)
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
  const r = await SR2ESuccessRoll.successTest((g.rating ?? 0) + (g.threat ?? 0), tn);   // + a construct's threat (4b R2)
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
  const r = await actor.rollSuccessTest(actor.system.body?.value ?? 0, tn, { label: RL("Sparky", { tn }), isResistance: true, tnContext: { kind: "other" } });
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

/**
 * After a System Test on the log, the GM's options for the host's reactive IC (plan §4, §6):
 * tar on the utility used, worm infection tests, data bombs (defuse, or the protected target
 * opened), scramble (a failed decrypt's poison, an exploding scramble's bomb).
 */
export async function offerTar(message) {
  const st = message?.flags?.sr2e?.vr2SystemTest;
  if (!isSequencer() || st?.conn == null) return;
  // Reactive entries: ordinary IC, and each construct's usable reactive programs (part 4b §4).
  const onHost = (p) => game.actors.filter(a => a.type === "ic" && a.system.hostUuid === st.hostUuid).flatMap(a => isConstruct(a)
    ? a.system.construct.components.filter(c => p(c.program) && compAvailable(a, c.id)).map(c => ({ ic: a, comp: c.id, prof: icProfile(a, c.id) }))
    : p(a.system.program) ? [{ ic: a, comp: "", prof: icProfile(a) }] : []);
  const nameOf = (e) => e.comp ? `${e.ic.name} (${CONFIG.SR2E.icPrograms[e.prof.program] ?? e.prof.program})` : e.ic.name;
  const success = systemTestVerdict(st.successes, st.hostSuccesses).success;
  // card|icUuid|generation|component: the handler re-checks that the IC (or component) is still the same (R4).
  const btn = (op, e, label, title = "") => `<button type="button" class="sr2e-vr2ic-btn" data-actor="${esc(st.actorUuid)}" data-op="${op}"
    data-arg="${esc(`${message.id}|${e.ic.uuid}|${e.ic.system.generation ?? 0}|${e.comp ?? ""}`)}" title="${esc(title)}">${esc(label)}</button>`;
  const armed = (b) => !recordsOf(b).some(e => e.type === "bombEnd" && e.icKey === icKeyOf(b));
  const rows = [];
  if (st.utilityRef) for (const t of onHost(p => /^tar-/.test(p))) rows.push(btn("tar", t, `${nameOf(t)} strikes ${st.utilityRef.name}`, "p.42"));
  for (const w of onHost(p => p === "worm")) {
    rows.push(btn("worm", w, `${nameOf(w)}: infection test`, "Security Value vs MPCP (p.44)"));
    if (st.operation === "disinfect" && success) rows.push(btn("wormGone", w, `Disinfect destroys ${nameOf(w)}`, "no tally (p.44)"));
  }
  // Data bombs are never construct programs (part 4b §4).
  for (const b of onHost(p => p === "data-bomb").filter(e => !e.comp && armed(e.ic))) {
    if (st.operation === "defuse") {
      if (success) rows.push(btn("defused", b, `${b.ic.name} is defused`, "no tally (p.41)"));
      else if (st.allOnes) rows.push(btn("explode", b, `All 1s: ${b.ic.name} goes off`, "p.41"));
    } else if (success) rows.push(btn("explode", b, `${b.ic.name} goes off (this opened what it protects: ${b.ic.system.protects || "?"})`, "p.41"));
  }
  if (/^decrypt/.test(st.operation)) for (const sc of onHost(p => p === "scramble")) {
    if (!success && sc.prof.scramble === "poison") rows.push(btn("poison", sc, `${nameOf(sc)}: Poison Test`, "rating dice vs the decker's Computer (p.42)"));
    const bomb = sc.comp ? null : sync(sc.ic.system.bombUuid);
    if (success && sc.prof.scramble === "exploding" && bomb && armed(bomb)) rows.push(btn("explode", { ic: bomb, comp: "" }, `${bomb.name} goes off (exploding scramble)`, "p.42"));
  }
  if (st.operation === "redirectDatatrail" && success) {
    const n = st.conn;
    const k = recordsOf(sync(st.actorUuid)).filter(e => e.type === "redirect" && e.conn === n).length + 1;
    await sequencer(() => fact(sync(st.actorUuid), `redirect:${n}:${k}:${message.id}`, { type: "redirect", conn: n, card: message.id }));
    rows.push(`<em>Redirect recorded (+1 Trace Factor; one per grid, the GM's call).</em>`);
  }
  if (!rows.length) return;
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
    ${esc(st.actorName)}: ${esc(st.opLabel)} on ${esc(st.hostName)} (${success ? "success" : "failure"}). Reactive IC there:
    <div class="sr2e-karma-actions">${rows.join("")}</div></div>` });
}

// ── Data bombs, scramble, worms (plan §6) ────────────────────────────────────────

/** A bomb's end: ONE terminal record per incarnation; only an explosion hits (p.41). */
export async function bombEnd(actor, bomb, outcome, card) {
  return sequencer(async () => {
    const icKey = icKeyOf(bomb);
    if (!await recordEvent(bomb, `${P3}bomb-end:${icKey}`, { type: "bombEnd", icKey, outcome, card, seq: nextSeq() })) {
      const prior = recordsOf(bomb).find(e => e.type === "bombEnd" && e.icKey === icKey);
      return ui.notifications.info(`${bomb.name} is already ${prior?.outcome ?? "done"}.`);
    }
    if (outcome !== "exploded") {
      return ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">${esc(bomb.name)} is defused (no tally, p.41).</div>` });
    }
    const host = sync(bomb.system.hostUuid);
    const st = { ruleset: "vr2", attackerUuid: bomb.uuid, attackerName: bomb.name, attackerType: "ic", icType: "white", icClass: "white",
      program: "data-bomb", targetUuid: actor.uuid, targetName: actor.name, targetSession: (await import("./vr2.mjs")).sessionKey(actor),
      hostUuid: host?.uuid ?? "", hostName: host?.name ?? "the host", securityCode: host?.system.securityCode ?? "green",
      securityValue: host?.system.securityValue ?? 0, status: "intruding", power: bomb.system.rating, level: "M",
      successes: 1, resolved: false, icKey, targetConn: actor.system.vr2Conn?.n ?? null, autoHit: true };
    const { renderVR2MatrixCard } = await import("./vr2.mjs");
    const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: bomb }),
      content: renderVR2MatrixCard(st).replace("</strong>", "</strong> <em>(the data bomb explodes: an automatic hit, VR2.0 p.41)</em>"),
      flags: { sr2e: { matrix: st } } });
    if (st.targetConn != null) await request(actor, "attack", { card: msg.id, icKey, cls: "white", program: "data-bomb" });
    const s = (await import("./vr2.mjs")).liveSession(actor);
    if (s) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">
      The explosion adds ${bomb.system.rating} to ${esc(actor.name)}'s tally, unless a point of Detection Factor suppresses it (p.41).
      <div class="sr2e-karma-actions">
        <button type="button" class="sr2e-vr2-crashchoice" data-choice="suppress">Suppress (−1 Detection Factor)</button>
        <button type="button" class="sr2e-vr2-crashchoice" data-choice="register">Let it register (+${bomb.system.rating})</button></div></div>`,
      flags: { sr2e: { vr2Crash: { cardId: msg.id, deckerUuid: actor.uuid, sessionId: s.id, icUuid: bomb.uuid, icName: bomb.name, rating: bomb.system.rating } } } });
  });
}

/** Poison scramble (p.42): rating dice vs the decker's Computer; a success destroys the data. */
export async function poisonTest(actor, sc, comp = "") {
  const computer = actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "computer")?.system?.rating ?? 0;
  const r = await SR2ESuccessRoll.successTest(icProfile(sc, comp).rating + threatOf(sc), Math.max(2, computer));
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), rolls: r.rolls, content: `<div class="sr2e-item-card">
    ${esc(sc.name)}'s Poison Test against ${esc(actor.name)}'s Computer ${computer}: ${r.successes} success${r.successes === 1 ? "" : "es"},
    <strong>${r.successes > 0 ? `the data${sc.system.protects ? ` (${esc(sc.system.protects)})` : ""} is destroyed` : "the decker suppresses its destruct code"}</strong> (VR2.0 p.42).</div>` });
}

/** A worm's infection test (p.44): Security Value dice vs the deck's MPCP; more than the Hardening infects. */
export async function wormTest(actor, worm, card, comp = "", gen0 = null) {
  return sequencer(async () => {
    // Re-checked here, in the queue: a crash or disinfect queued first wins (4b impl R1 #1).
    if (isConstruct(worm) ? !compAvailable(worm, comp, gen0 ?? -1) : (gen0 != null && gen0 !== (worm.system.generation ?? 0))) {
      return ui.notifications.warn(`${worm.name} has changed since that card.`);
    }
    const conn = liveConn(actor);
    const host = sync(worm.system.hostUuid);
    const prof = icProfile(worm, comp), gen = worm.system.generation ?? 0;
    const mpcp = actor.system.cyberdeck?.mpcp ?? 0, hardening = conn?.settings?.hardening ?? 0;
    // Infection dice stay the host's Security Value (+ a construct's threat); the profile gives the kind (4b R3).
    const r = await SR2ESuccessRoll.successTest((host?.system.securityValue ?? 0) + threatOf(worm), Math.max(2, mpcp));
    const infects = wormInfects(r.successes, hardening);
    const wkey = comp ? `${DECK}worm:${card}:${worm.id}:${gen}:${comp}` : `${DECK}worm:${card}:${worm.id}`;
    if (infects) await recordEvent(deckDoc(actor, conn), wkey, { type: "worm", kind: prof.worm || "data", chipGen: chipGens(actor).mpcp, name: worm.name });
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), rolls: r.rolls, content: `<div class="sr2e-item-card">
      ${esc(worm.name)} tries to infect ${esc(actor.name)}'s MPCP (Security Value vs MPCP ${mpcp}${hardening ? `, needs more than Hardening ${hardening}` : ""}):
      ${r.successes} success${r.successes === 1 ? "" : "es"}, <strong>${infects ? `infected (${CONFIG.SR2E.icWorm[prof.worm] ?? "worm"})` : "no infection"}</strong>.
      ${infects ? "Only a new MPCP chip removes it; a Computer task (base time 10 hours) detects it (VR2.0 p.44)." : ""}</div>` });
  });
}

/** Dataworms on a deck report on each logon: 1D6 = 1, and the decker's secret Sensor (8) (p.44). */
async function dataworms(actor) {
  const n = actor.system.vr2Conn?.n;
  for (const w of (actor.system.vr2Deck?.worms ?? []).filter(x => x.kind === "data")) {
    if (n == null || !await once(actor, `${P3}card:dataworm:${n}:${w.key}`)) continue;
    const d = (await new Roll("1d6").evaluate()).total;
    if (d !== 1) continue;
    const s = await SR2ESuccessRoll.successTest(actor.system.matrixPersona?.sensor ?? 0, 8);
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      A dataworm in ${esc(actor.name)}'s deck sends a report (1D6 = 1). Secret Sensor (8): ${s.successes} —
      ${s.successes > 0 ? "the decker notices it and may fight it (3D6 Initiative, Evasion 8, evades detection)" : "the decker doesn't know"} (VR2.0 p.44).</div>` });
  }
}

STEP_RESOLVERS.tapeworm = async (actor, f, s) => {
  const lost = Math.max(0, (await new Roll("1d6").evaluate()).total - 1);
  const file = (await new Roll("1d6").evaluate()).total;
  const key = `exit-res:${f.live.n}:tapeworm:${s.ref}`;
  await fact(actor, key, { type: "exitRes", n: f.live.n, step: "tapeworm", ref: s.ref, lost, file });
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
    A tapeworm eats ${lost} Paydata Point${lost === 1 ? "" : "s"} from ${esc(actor.name)}'s run (1D6 − 1); a specific datafile: ${file} — ${file >= 5 ? "<strong>corrupted</strong>" : "intact"} (VR2.0 p.45).</div>` });
  await fact(actor, `ack:${P3}${key}`, { type: "ack", target: P3 + key });
};

/**
 * A tar strike (p.42–43): Tar (utility rating) against the utility (tar rating), rolled here
 * and recorded on the decker; the tar wins only on MORE successes. A win crashes that COPY of
 * the utility and the tar itself (no tally); tar pit then corrupts every copy on the deck.
 * `ref` is the utility as it was used (a Swap Memory since leaves the fresh copy alone).
 */
export async function tarStrike(actor, ic, ref, card, comp = "", gen0 = null) {
  if (!isSequencer()) return ui.notifications.warn("Tar strikes are the GM's (the active GM's client).");
  return sequencer(async () => {
    const prof = icProfile(ic, comp), gen = ic.system.generation ?? 0;
    const icKey = icKeyOf(ic, prof.comp), key = `tar:${card}:${icKey}`;
    const done = recordsOf(actor).find(e => e.key === P3 + key);
    if (done) { await reconcileTarFact(actor, done); return ui.notifications.info("That tar has already struck."); }
    if (isConstruct(ic) ? !compAvailable(ic, prof.comp, gen0 ?? gen) : (gen0 != null && gen0 !== gen)) return ui.notifications.warn(`${ic.name}'s tar can't act right now.`);
    const threat = threatOf(ic), cluster = partyOf(ic) || isConstruct(ic) ? 2 : 0;   // tar in a party or construct: −2 TN
    const tar = await SR2ESuccessRoll.successTest(prof.rating + threat, Math.max(2, ref.rating - cluster));
    const util = await SR2ESuccessRoll.successTest(ref.rating ?? 0, Math.max(2, prof.rating));
    const won = tarWins(tar.successes, util.successes);
    const pit = won && prof.program === "tar-pit";
    const conn = liveConn(actor);
    const item = actor.items.get(ref.itemId);
    const pKey = programKey({ source: item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId, name: ref.name });
    const g = actor.system.vr2Deck?.reloadGen?.(pKey) ?? 0;
    const pitRoll = pit ? await SR2ESuccessRoll.successTest(prof.rating + threat, grayTN("tar-pit", actor.system.cyberdeck?.mpcp ?? 0, conn?.settings?.hardening ?? 0)) : null;
    // Everything the consequences need, so `reconcileTar` can finish an interrupted strike (4b R5).
    if (!await fact(actor, key, { v: 2, type: "tar", card, icKey, icUuid: ic.uuid, gen, comp: prof.comp, won, tar: tar.successes, util: util.successes,
      pit: pitRoll?.successes ?? null, programKey: pKey, g, utility: { itemId: ref.itemId, loadGen: ref.loadGen, name: ref.name },
      conn: conn?.n ?? null, deckUuid: deckDoc(actor, conn)?.uuid ?? null })) return;
    await reconcileTarFact(actor, recordsOf(actor).find(e => e.key === P3 + key));
    const sensor = !won ? await SR2ESuccessRoll.successTest(actor.system.matrixPersona?.sensor ?? 0, Math.max(2, prof.rating)) : null;
    const who = prof.comp ? `${ic.name} (${CONFIG.SR2E.icPrograms[prof.program] ?? prof.program})` : ic.name;
    const notice = !sensor ? "" : sensor.successes >= 3 ? `notices ${esc(who)} (rating ${prof.rating})` : sensor.successes === 2 ? "notices tar IC" : sensor.successes === 1 ? "notices it triggered IC" : "notices nothing";
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      <strong>${esc(who)} vs ${esc(ref.name)}</strong>: ${tar.successes} against ${util.successes}.
      ${won ? `The tar wins: ${esc(ref.name)} crashes (a Swap Memory reloads it) and so does the tar${prof.comp ? " program (the construct goes on)" : ""}, with no tally.${pit
        ? (pitRoll.successes > 0 ? ` <strong>Tar pit: every copy of ${esc(ref.name)} on the deck is corrupted</strong> until reloaded from outside after jacking out (p.43).` : " Tar pit: its viral code is defeated.") : ""}`
        : `The utility holds. The decker's secret Sensor test: ${sensor.successes} (${notice}; p.40).`}</div>` });
    if (won) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)}'s ${esc(ref.name)} crashes (tar IC, VR2.0 p.42).</div>` });
  });
}

/** A winning v2 tar fact's consequences, each idempotent (4b R5): the utility, the tar itself, a pit's corruption. */
async function reconcileTarFact(actor, t) {
  if (t?.v !== 2 || !t.won) return;
  await recordEvent(actor, `${P3}crash:${t.utility.itemId}:${t.utility.loadGen}:tar-${t.card}`, { type: "crash", programId: t.utility.itemId, loadGen: t.utility.loadGen });
  const ic = sync(t.icUuid);
  if (ic && t.comp) await crashComponent(ic, t.gen, t.comp, t.card);
  else if (ic && (ic.system.generation ?? 0) === t.gen) await crashIC(ic, t.card);
  const deck = sync(t.deckUuid);
  if (t.pit > 0 && deck) await recordEvent(deck, `${DECK}corrupt:${t.programKey}:${t.g}:tar-${t.card}`, { type: "corrupt", programKey: t.programKey, g: t.g });
}
/** Sequencer pass step: finish every interrupted winning tar strike (older facts lack the context and are skipped). */
async function reconcileTar(actor) {
  for (const t of recordsOf(actor).filter(e => e.type === "tar" && e.v === 2 && e.won)) await reconcileTarFact(actor, t);
}

// ── Trace (plan §5) ────────────────────────────────────────────────────────────

/** The trace's open boundary right now (the turn in progress). */
function openBoundaryOf(actor, t) {
  const ticks = recordsOf(actor).filter(e => e.type === "tick" && e.conn === t.conn && e.icKey === t.icKey);
  const combat = t.clock?.combatId ? game.combats.get(t.clock.combatId) : null;
  return openBoundary(t, ticks, combat?.round ?? null);
}

/** "Start location cycle" (GM, on a trace hit): freeze the successes; ⌊10 ÷ s⌋ turns (p.45). */
export async function traceStart(actor, card) {
  return sequencer(async () => {
    const f = foldOf(actor), st = game.messages.get(card)?.flags?.sr2e?.matrix;
    if (!f.live?.admitted.some(a => a.card === card) || !st) return ui.notifications.warn("That trace attack isn't admitted on the live connection.");
    if (f.live.traces.some(t => t.icKey === st.icKey)) return ui.notifications.info("That trace is already locating.");
    const tm = game.messages.get(st.testMessageId), test = tm?.flags?.sr2e?.test;
    if (test && !test.closed) {
      const { renderSuccessTestCard } = await import("./documents/actor.mjs");
      await tm.update({ content: renderSuccessTestCard({ ...test, closed: true }), "flags.sr2e.test": { ...test, closed: true } });
    }
    const successes = test ? testTotalSuccesses(game.messages.get(st.testMessageId).flags.sr2e.test) : (st.successes ?? 0);
    if (successes <= 0) return ui.notifications.info("The trace missed: still hunting.");
    const turns = locationTurns(successes);
    // The decker's own combat clock, only if they're actually fighting in one; else the manual clock.
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid || (!actor.isToken && cb.actorId === actor.id))) ?? null;
    await fact(actor, `trace:${f.live.n}:${st.icKey}`, { type: "trace", conn: f.live.n, icKey: st.icKey, rating: st.icRating ?? st.power ?? 0,
      icName: st.attackerName, turns, clock: combat ? { combatId: combat.id, startRound: combat.round } : { manual: true } });
    await fact(actor, `ack:attack:${card}`, { type: "ack", target: `attack:${card}`, outcome: { trace: turns } });
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      <strong>${esc(st.attackerName)}</strong> has ${esc(actor.name)}'s datatrail: ${turns === 0 ? "located at once" : `${turns} Combat Turn${turns === 1 ? "" : "s"} to locate`}
      (10 ÷ ${successes}, VR2.0 p.45)${combat ? ", counted at each round's end from the next one" : ": advance turns from the decker's Matrix tab (no combat running)"}.
      The trace IC turns reactive.</div>` });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} feels a lock on the datatrail.</div>` });
  });
}

Object.assign(HANDLERS, {
  /** Relocate (p.46): a success spoofs the turn in progress; refused once that turn has closed. */
  async relocate(actor, r, f) {
    const t = f.live?.traces.find(x => x.icKey === r.icKey && !x.complete && !x.dead);
    if (!t) return { ok: false, why: "no locating trace" };
    if (!r.success) return { ok: true };
    const boundary = r.boundary;
    if (recordsOf(actor).some(e => e.type === "tick" && e.conn === f.live.n && e.icKey === r.icKey && e.boundary === boundary)) {
      return { ok: false, why: "that turn had already closed" };
    }
    await fact(actor, `spoof:${f.live.n}:${r.icKey}:${boundary}`, { type: "spoof", conn: f.live.n, icKey: r.icKey, boundary });
    return { ok: true };
  },
  /** Keep a spoofed trace frozen by suppressing it (a Detection Factor point; p.46). */
  async freeze(actor, r, f) {
    const sp = recordsOf(actor).find(e => e.type === "spoof" && e.key === r.spoof);
    if (!sp || sp.conn !== f.live?.n) return { ok: false, why: "freezing needs a successful Relocate first" };
    await fact(actor, `freeze:${r.spoof}`, { type: "freeze", conn: sp.conn, icKey: sp.icKey, spoof: r.spoof });
    return { ok: true };
  },
  async unfreeze(actor, r, f) {
    const fr = recordsOf(actor).find(e => e.type === "freeze" && e.spoof === r.spoof);
    if (!fr) return { ok: false, why: "not frozen" };
    await fact(actor, `unfreeze:${r.spoof}`, { type: "unfreeze", conn: fr.conn, icKey: fr.icKey, spoof: r.spoof });
    return { ok: true };
  }
});

/** The turn's end for every locating trace on this clock: one tick per boundary, in seq. */
async function tickTraces(actor, boundaryFor) {
  const f = foldOf(actor);
  for (const t of f.live?.traces ?? []) {
    if (t.complete || t.dead) continue;
    const ticks = recordsOf(actor).filter(e => e.type === "tick" && e.conn === t.conn && e.icKey === t.icKey);
    for (const b of boundaryFor(t, ticks)) {
      await fact(actor, `tick:${t.conn}:${t.icKey}:${b}`, { type: "tick", conn: t.conn, icKey: t.icKey, boundary: b });
    }
  }
}

/** Completions, once each: the GM's response card and a trapped trace's hidden IC (p.46–47). */
async function noticeTraces(actor) {
  const f = foldOf(actor);
  for (const t of f.live?.traces ?? []) {
    if (!t.complete || !await once(actor, `${P3}card:traced:${t.conn}:${t.icKey}`)) continue;
    const rows = RESPONSE_TIMES.rows.map((r, i) => `<tr><td>${r}</td>${["public", "corporate", "megacorp", "government"].map(k => `<td>${RESPONSE_TIMES[k][i] ?? "NA"}</td>`).join("")}</tr>`).join("");
    const trace = recordsOf(actor).find(e => e.type === "trace" && e.conn === t.conn && e.icKey === t.icKey);
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      <strong>${esc(trace?.icName ?? "Trace IC")} locates ${esc(actor.name)}'s jackpoint</strong>: network address and physical location go into the security logs.
      From now on: −1 TN to proactive IC attacks on ${esc(actor.name)}, and +1 to every tally increase (VR2.0 p.46).
      <br>Security Asset Response Times (minutes, p.47):
      <table><tr><th>Jackpoint</th><th>Public</th><th>Corp</th><th>Megacorp</th><th>Gov't</th></tr>${rows}</table></div>` });
    const ic = icOfKey(t.icKey);
    if (ic) await fireTrap(ic, t.icKey);
  }
}

/** Manual clock: the GM ends a turn for a decker's manual traces. */
export function advanceManual(actor) {
  return sequencer(async () => {
    await tickTraces(actor, (t, ticks) => t.clock?.manual ? [openBoundary(t, ticks)] : []);
    await noticeTraces(actor);
  });
}

/** The decker's Relocate (Simple Action): Computer vs the trace rating − Relocate, opposed by the host (a tally event). */
export async function relocate(actor, icKey) {
  const why = vr2ActionGuard(actor);
  if (why) return ui.notifications.warn(why);
  const t = foldOf(actor).live?.traces.find(x => x.icKey === icKey && !x.complete && !x.dead);
  if (!t) return;
  const V = await import("./vr2.mjs");
  const { relocateTN } = await import("./rules/vr2ic-rules.mjs");
  const rel = V.loadedUtility(actor, "relocate");
  const computer = actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "computer")?.system?.rating ?? 0;
  const tn = relocateTN(t.rating, rel);
  const boundary = openBoundaryOf(actor, t);
  const r = await actor.rollSuccessTest(computer, tn, { label: RL("Relocate", { tn }), tnContext: { kind: "matrix" } });
  if (!r) return;
  const host = sync(V.liveSession(actor)?.hostUuid);
  if (host) {
    const df = V.vr2DetectionFactor(actor);
    const hr = await SR2ESuccessRoll.successTest(host.system.securityValue, df);
    const s0 = V.liveSession(actor);
    const pm = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: hr.rolls,
      content: `<div class="sr2e-item-card">${esc(host.name)} opposes the Relocate (Security Value vs Detection Factor ${df}): ${hr.successes} onto ${esc(actor.name)}'s tally.</div>`,
      flags: { sr2e: { vr2TallyEvent: { eventId: `reloc-${foundry.utils.randomID()}`, actorUuid: actor.uuid, sessionId: s0?.id, base: hr.successes, source: "relocate" } } } });
    await V.applyTallyEvent(pm);
  }
  await request(actor, "relocate", { icKey, success: r.successes > 0, boundary });
  if (r.successes > 0) ui.notifications.info(`${actor.name} spoofs the trace this turn. To keep it frozen, suppress it from the Matrix tab.`);
}

STEP_RESOLVERS.datatrail = async (actor, f, s) => {
  const t = f.live.traces.find(x => x.icKey === s.ref);
  const roll = (await new Roll("1d6").evaluate()).total;
  const left = datatrailTurns(roll);
  const located = !!t && left >= t.turnsLeft;
  const key = `exit-res:${f.live.n}:datatrail:${s.ref}`;
  await fact(actor, key, { type: "exitRes", n: f.live.n, step: "datatrail", ref: s.ref, roll, left, located });
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
    ${esc(actor.name)}'s datatrail stays up ${left} turn${left === 1 ? "" : "s"} (1D6 − 1 = ${roll - 1}, min 1) against ${t?.turnsLeft ?? 0} left:
    <strong>${located ? "the trace still locates the jackpoint" : "the trace loses it"}</strong> (VR2.0 p.46).</div>` });
  if (located) {
    const ic = icOfKey(s.ref);
    if (ic) await fireTrap(ic, s.ref);
  }
  await fact(actor, `ack:${P3}${key}`, { type: "ack", target: P3 + key });
};

// ── Host shutdown (plan §7; p.53) ───────────────────────────────────────────────

export const hostShutdown = (host) => shutdownState(recordsOf(host)).running;
/** Is this host shut down (refuse every way onto it)? */
export const hostOffline = (host) => !!hostShutdown(host)?.offline;

/** Start a shutdown (a sheaf step, or the GM): rolled first, ONE lifecycle per reset. */
export function startShutdown(host) {
  return sequencer(async () => {
    const st = shutdownState(recordsOf(host));
    if (st.running) return;
    const turns = (await new Roll(`${shutdownDice(host.system.securityValue)}d6`).evaluate()).total;
    const warning = finalWarning((await new Roll("1d6").evaluate()).total);
    // The clock of a combat that one of this host's connected deckers is fighting in; else manual.
    const deckers = allDocs().filter(a => a.type === "character" && a.system.vr2Conn && sync(a.flags?.sr2e?.vr2Session?.hostUuid)?.uuid === host.uuid);
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => deckers.some(d => cb.actor?.uuid === d.uuid))) ?? null;
    if (!await fact(host, `shutdown:${st.nextN}`, { type: "shutdown", n: st.nextN, turns, warning,
      clock: combat ? { combatId: combat.id, startRound: combat.round } : { manual: true } })) return;
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
      <strong>${esc(host.name)} begins shutting down</strong>: ${turns} Combat Turn${turns === 1 ? "" : "s"}, final warning with ${warning} left (VR2.0 p.53).
      Each turn's end, a secret Sensor test per decker against the turns left. ${combat ? "Counted at each round's end." : "Advance turns from the host's sheet."}</div>` });
  });
}

/** One turn of a shutdown (a boundary id), then the warning and the end. Sequencer only. */
async function tickShutdown(host, boundary) {
  const run = hostShutdown(host);
  if (!run || run.offline) return;
  if (!await fact(host, `shutdown-tick:${run.n}:${boundary}`, { type: "shutdownTick", n: run.n, boundary })) return;
  const now = hostShutdown(host);
  const deckers = allDocs().filter(a => a.type === "character" && a.system.vr2Conn && sync(a.flags?.sr2e?.vr2Session?.hostUuid)?.uuid === host.uuid);
  if (now.warned && await once(host, `${P3}card:shutdown-warn:${now.n}`)) {
    await ChatMessage.create({ content: `<div class="sr2e-item-card"><strong>${esc(host.name)} is shutting down</strong>: ${now.left} Combat Turn${now.left === 1 ? "" : "s"} left (VR2.0 p.53).</div>` });
  }
  if (!now.offline) return;
  for (const a of deckers) await openExit(a, "shutdown");
  await ChatMessage.create({ content: `<div class="sr2e-item-card"><strong>${esc(host.name)} shuts down.</strong> Every decker still on it is dumped; frames and running programs crash (VR2.0 p.53).</div>` });
  for (const a of deckers) schedule(a);
}
export function advanceShutdown(host) {
  return sequencer(async () => { const run = hostShutdown(host); if (run?.clock?.manual) await tickShutdown(host, `m${run.ticks.length + 1}`); });
}
export function resetShutdown(host) {
  return sequencer(async () => { const run = hostShutdown(host); if (run) await fact(host, `shutdown-reset:${run.n}`, { type: "shutdownReset", n: run.n }); });
}

// ── Psychotropic black IC (plan §3b; p.49–50) ──────────────────────────────────

/** The exit's psychotropic step: the decker's Willpower against the implant (−2 on a cool deck). */
STEP_RESOLVERS.psychotropic = async (actor, f, s) => {
  if (!await once(actor, `${P3}card:psy:${f.live.n}:${s.ref}`)) return;
  const hit = f.live.hits.find(h => h.icKey === s.ref);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">
    ${esc(hit?.icName ?? "Psychotropic IC")} reaches for ${esc(actor.name)}'s mind as the link drops (VR2.0 p.49):
    <div class="sr2e-karma-actions"><button type="button" class="sr2e-vr2ic-btn" data-actor="${esc(actor.uuid)}" data-op="psy" data-arg="${esc(s.ref)}">Willpower (${Math.max(2, (hit?.rating ?? 0) - (hit?.cool ? 2 : 0))})</button></div></div>` });
};
/** The decker's implant test; the sequencer records the condition on a failure. */
export async function psyTest(actor, icKey) {
  const f = foldOf(actor);
  const hit = f.live?.hits.find(h => h.icKey === icKey);
  if (!hit || f.live.steps.find(x => x.step === "psychotropic" && x.ref === icKey)?.res) return;
  const tn = Math.max(2, hit.rating - (hit.cool ? 2 : 0));
  const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, tn, { label: RL("Psychotropic", { tn }), tnContext: { kind: "other" } });
  if (r) await request(actor, "psy", { icKey, successes: r.successes, conn: f.liveN });
}
Object.assign(HANDLERS, {
  async psy(actor, r, f) {
    const hit = f.live?.hits.find(h => h.icKey === r.icKey);
    if (!hit || f.liveN !== r.conn) return { ok: false, why: "no such psychotropic hit on this connection" };
    const key = `exit-res:${f.liveN}:psychotropic:${r.icKey}`;
    if (!await fact(actor, key, { type: "exitRes", n: f.liveN, step: "psychotropic", ref: r.icKey, successes: r.successes })) return { ok: true };
    // The subtype frozen with the hit (part 4b R14); a legacy hit reads the live IC.
    const kind = hit.psychotropic || icProfile(icOfKey(r.icKey), parseIcKey(r.icKey).comp).psychotropic || "cyberphobia";
    if (r.successes <= 0) {
      await fact(actor, `psy:${f.liveN}:${r.icKey}`, { type: "psy", kind, rating: hit.rating, icName: hit.icName });
      await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
        ${esc(actor.name)} carries ${esc(CONFIG.SR2E.icPsychotropic[kind] ?? kind)} (rating ${hit.rating}) out of the Matrix (VR2.0 p.49–50).</div>` });
    }
    await fact(actor, `ack:${P3}${key}`, { type: "ack", target: P3 + key });
    return { ok: true };
  }
});

/** PCPIC's grip (p.50): a voluntary exit needs Willpower (rating + the wound modifier). */
export function pcpicTN(actor) {
  const f = foldOf(actor);
  const pcpic = (f.live?.locks ?? []).filter(h => (h.psychotropic || icProfile(icOfKey(h.icKey), parseIcKey(h.icKey).comp).psychotropic) === "pcpic");
  if (!pcpic.length) return null;
  const cm = actor.system.conditionMonitor ?? {};
  const boxes = Math.max(cm.physical?.value ?? 0, cm.stun?.value ?? 0);
  const level = boxes >= 10 ? "D" : boxes >= 6 ? "S" : boxes >= 3 ? "M" : boxes >= 1 ? "L" : "";
  // Frozen IC rating + the CURRENT icon-down +2 (4b R14); a legacy hit's rating already holds it.
  return Math.max(...pcpic.map(h => h.icRating != null ? h.icRating + (iconDown(actor) ? 2 : 0) : h.rating)) + pcpicMod(level);
}

/** Recovery (p.50): Willpower vs the rating with the treatment modifiers; a success ends it. */
export async function psyRecover(actor, condKey, mods = {}) {
  const c = recordsOf(actor).find(e => e.key === condKey && e.type === "psy");
  if (!c) return;
  const { psychoRecoveryTN } = await import("./rules/vr2ic-rules.mjs");
  const tn = psychoRecoveryTN(c.rating, { ...mods, pcpic: c.kind === "pcpic" });
  const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, tn, { label: RL("PsychoRecover", { condition: CONFIG.SR2E.icPsychotropic[c.kind] ?? c.kind, tn }), tnContext: { kind: "other" } });
  if (!r) return;
  const k = recordsOf(actor).filter(e => e.type === "psyRecover" && e.cond === condKey).length + 1;
  await recordEvent(actor, `${P3}psy-recover:${condKey}:${k}`, { type: "psyRecover", cond: condKey, success: r.successes > 0 });
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
Object.assign(STEP_RESOLVERS, {
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
});
export const addStepResolver = (step, fn) => { STEP_RESOLVERS[step] = fn; };

STEP_RESOLVERS.finalShot = async (actor, f, s) => {
  const hit = f.live.hits.find(h => h.card === s.ref);
  const conn = f.live.open;
  const mpcp = actor.system.cyberdeck?.mpcp ?? 0;
  const tn = grayTN("blaster", mpcp, conn?.settings?.hardening ?? 0);
  const r = await SR2ESuccessRoll.successTest(2 * (hit?.rating ?? 0) + (hit?.threat ?? 0), tn);
  const loss = Math.min(mpcp, mpcpLoss("blaster", r.successes));
  const key = `exit-res:${f.live.n}:finalShot:${s.ref}`;
  await fact(actor, key, { type: "exitRes", n: f.live.n, step: "finalShot", ref: s.ref, successes: r.successes, loss, tn });
  if (loss > 0) await recordEvent(deckDoc(actor, conn), `${DECK}dmg:final:${s.ref}`, { type: "deckDmg", attr: "mpcp", amount: loss, chipGen: chipGens(actor).mpcp });
  if (await once(actor, `${P3}card:final:${s.ref}`)) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: r.rolls, content: `<div class="sr2e-damage-result">
      <strong>${esc(hit?.icName ?? "Black IC")} takes its shot at ${esc(actor.name)}'s MPCP</strong> (as blaster, double rating + threat: ${2 * (hit?.rating ?? 0) + (hit?.threat ?? 0)} dice vs TN ${tn}):
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
      const { uuid: u, gen: g, comp } = parseIcKey(s.ref);
      if (icGen(u) !== g) {
        await fact(actor, `exit-res:${f.live.n}:lastAttack:${s.ref}`, { type: "exitRes", n: f.live.n, step: "lastAttack", ref: s.ref, cancelled: true });
        f = foldOf(actor);
      } else if (await once(actor, `${P3}card:last:${f.live.n}:${s.ref}`)) {
        await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u2 => u2.id), content: `<div class="sr2e-item-card">
          <strong>${esc(sync(u)?.name ?? "Black IC")}${comp ? ` (${esc(CONFIG.SR2E.icPrograms[icProfile(sync(u), comp).program] ?? "its black program")})` : ""}</strong> makes one more attack on ${esc(actor.name)} before the link drops (VR2.0 p.48):
          attack from the IC's sheet with ${esc(actor.name)} targeted${comp ? ", with that program" : ""}.</div>` });
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
    sequencer(() => passFor(actor)).catch(err => console.error("SR2E | vr2 sequencer", err));
  }, 150));
}

/** One sequencer pass for a decker (call only inside `sequencer`). */
async function passFor(actor) {
  await recoverResolved(actor); await reconcileTar(actor);
  await admitDeckerCards(actor); await processRequests(actor); await reconcileShieldFreeze(actor);
  await applyResults(actor); await applyRippers(actor); await applySparky(actor);
  await noticeTraces(actor); await advanceExit(actor);
}

/** A decker's attacker key (part 5a §0.5): `deck:<uuid>@<conn>`, "" off the connection log. */
export const attackerKeyOf = (actor) => actor?.system?.vr2Conn ? `deck:${actor.uuid}@${actor.system.vr2Conn.n}` : "";
/** How many times this decker's icon has crashed on its live connection (part 5a §0.8). */
export const crashInc = (actor) => Object.keys(actor?.flags?.sr2e?.vr2IconCrash?.[actor?.system?.vr2Conn?.n] ?? {}).length;

/**
 * Part 5a §0: a decker's attack card is admitted by the sequencer finding it (the attacker can't write a
 * request onto another player's actor). Runs before `processRequests`, so a card that exists can't be
 * outrun by an exit request. Every card on this actor, oldest first; the admit/refuse facts make it idempotent.
 */
async function admitDeckerCards(actor) {
  const recs = recordsOf(actor);
  const seen = new Set(recs.filter(e => e.type === "admit" || e.type === "refuse").map(e => e.card));
  const cards = game.messages.contents.filter(m => {
    const st = m.flags?.sr2e?.matrix;
    return st?.ruleset === "vr2" && st.attackerType === "character" && st.targetUuid === actor.uuid && st.targetConn != null && !seen.has(m.id);
  });
  for (const m of cards) {
    const st = m.flags.sr2e.matrix, f = foldOf(actor);
    if (!f.live || st.targetConn !== f.live.n) {
      await fact(actor, `refuse:${m.id}`, { type: "refuse", card: m.id, why: "earlier connection" });
      await postResolution(actor, m.id, `${st.attackerName}'s attack hit ${actor.name}'s earlier connection: nothing happens.`, []);
      continue;
    }
    if (f.live.exit) {
      await fact(actor, `refuse:${m.id}`, { type: "refuse", card: m.id, why: "leaving" });
      await postResolution(actor, m.id, `${actor.name} was already leaving: ${st.attackerName}'s attack misses.`, []);
      continue;
    }
    await fact(actor, `admit:${m.id}`, { type: "admit", conn: f.live.n, card: m.id, icKey: st.icKey ?? "", cls: "decker", program: st.program ?? "",
      cascade0: null, successes: Number.isInteger(st.successes) ? st.successes : null });
  }
}

/**
 * Part 4a §6a: an attribute loss committed on the decker's client but whose `resolved` request never
 * went out (interrupted) — re-send it from the session receipt, before `processRequests` acks it.
 */
async function recoverResolved(actor) {
  // `vr2AttrPending` is written in the SAME update as the loss, outside the session, so it survives host
  // switches; it's cleared here once the attack is acknowledged.
  const pending = actor.flags?.sr2e?.vr2AttrPending ?? {};
  const recs = recordsOf(actor);
  const done = new Map(recs.filter(e => e.type === "done").map(e => [e.req, e]));
  const now = game.time.serverTime;
  for (const [card, r] of Object.entries(pending)) {
    if (recs.some(e => e.type === "ack" && e.target === `attack:${card}`)) { await actor.update({ [`flags.sr2e.vr2AttrPending.-=${card}`]: null }); continue; }
    if (r?.conn == null || !Number.isInteger(r.lost)) continue;
    if (!recs.some(e => e.type === "admit" && e.card === card)) continue;
    // A request still waiting is enough. A failed one is retried with backoff (30 s, 60 s, 2 min…, on
    // the next sequencer pass after that), never abandoned: the loss is committed and must be acked.
    const reqs = recs.filter(e => e.type === "req" && e.kind === "resolved" && e.card === card);
    if (reqs.some(q => !done.has(q.key))) continue;
    const last = Math.max(0, ...reqs.map(q => Number(done.get(q.key)?.at) || 0));
    if (reqs.length && now - last < 30000 * 2 ** Math.min(reqs.length - 1, 6)) continue;
    await request(actor, "resolved", { card, conn: r.conn, lost: r.lost, attr: r.attr, rating: r.rating ?? 0, threat: r.threat ?? 0,
      ripper: String(r.program ?? "").startsWith("ripper-") });
  }
}

/**
 * Part 4a §4: settle every decker on the log (admissions, resolutions) before a cascading IC attacks,
 * so the bonus sees every outcome already earned. Active GM only; resolves when the pass is done.
 */
export function flush() {
  return sequencer(async () => { for (const a of allDocs()) if (a.type === "character" && onLog(a)) await passFor(a); });
}

// ── Part 4a: the optional IC (docs/PLAN-vr2-part4.md; p.51–53) ───────────────

/** Expert IC (p.52) counts only for proactive programs, on attack and on resistance alike. */
export const expertOf = (ic) => ic?.type === "ic" && (isConstruct(ic) || isProactive(ic.system.program)) ? (Number(ic.system.expert) || 0) : 0;
/** Party IC membership (p.52): a cluster id and its ORIGINAL size N ≥ 2; 0 = not in a party. */
export const partyOf = (ic) => ic?.type === "ic" && !isConstruct(ic) && ic.system.party?.id && (ic.system.party.size ?? 0) >= 2 ? ic.system.party.size : 0;

/** The cascade baseline a new attack snapshots (plan §4): only the current one's outcomes count. */
export function cascadeBaseline(ic, host) {
  return { on: !!ic.system.cascading && !isConstruct(ic) && isProactive(ic.system.program), gen: ic.system.generation ?? 0, epoch: ic.system.cascadeEpoch ?? 0,
    program: ic.system.program, hostUuid: host?.uuid ?? ic.system.hostUuid, code: host?.system.securityCode ?? ic.system.securityCode,
    sv0: host?.system.securityValue ?? 0, rating0: ic.system.rating ?? 0 };
}

/** The cascade bonus now (p.51): this IC's outcomes under its current baseline, capped; 0 when not cascading. */
export function cascadeOf(ic, host) {
  const b = cascadeBaseline(ic, host);
  if (!b.on) return { sv: 0, rating: 0, capSV: 0, capRating: 0 };
  const key = icKeyOf(ic);
  const same = (c) => c && ["gen", "epoch", "program", "hostUuid", "code", "sv0", "rating0"].every(k => c[k] === b[k]);
  const mine = allDocs().filter(a => a.type === "character").flatMap(a => cascadeOutcomes(recordsOf(a)))
    .filter(o => o.icKey === key && same(o.cascade0));
  return cascadeBonus(mine, b);
}

/** GM: form a party from IC actors (p.52–53). Dedupes, one host, budget-checked; N is stored once. */
export async function formParty(ics) {
  if (!game.user.isGM) { ui.notifications.warn("Only the GM forms party IC."); return null; }
  const list = [...new Map(ics.filter(a => a?.type === "ic").map(a => [a.uuid, a])).values()];
  if (list.some(isConstruct)) { ui.notifications.warn("A construct can't join a party IC (VR2.0 p.52)."); return null; }
  const hosts = new Set(list.map(a => a.system.hostUuid));
  if (hosts.size !== 1 || !list[0]?.system.hostUuid) { ui.notifications.warn("Party IC must all defend the same host (set each IC's host first)."); return null; }
  const host = sync(list[0].system.hostUuid);
  const { problems } = partyBudget({ sv: host?.system.securityValue ?? 0, members: list.map(a => ({ rating: a.system.rating, program: a.system.program,
    psychotropic: a.system.psychotropic, expert: a.system.expert, cascading: a.system.cascading, armorDefense: a.system.armorDefense, defense: a.system.defense })) });
  if (problems.length) { ui.notifications.warn(`Can't form that party: ${problems.join("; ")}.`); return null; }
  const id = foundry.utils.randomID();
  for (const a of list) await a.update({ "system.party.id": id, "system.party.size": list.length });
  ui.notifications.info(`Party IC formed: ${list.map(a => a.name).join(", ")} (+${list.length} TN, VR2.0 p.52).`);
  return id;
}
/** GM: one IC leaves its party (the others keep N — it's the original size, p.52). */
export const leaveParty = (ic) => ic.update({ "system.party.id": "", "system.party.size": 0 });

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

// ── Sheets (plan §5–§7) ─────────────────────────────────────────────────────────

/** The decker's part-3 panel on the Matrix tab. */
export function deckerContext(actor) {
  if (!isVR2() || actor?.type !== "character") return null;
  const f = foldOf(actor);
  const deck = actor.system.vr2Deck;
  const live = f.live;
  const name = (icKey) => icOfKey(icKey)?.name ?? "IC";
  const spoofs = recordsOf(actor).filter(e => e.type === "spoof");
  const freezes = recordsOf(actor).filter(e => e.type === "freeze" || e.type === "unfreeze");
  return {
    isGM: game.user.isGM, n: live?.n ?? null,
    exit: live?.exit ? { trigger: live.exit.trigger, steps: live.steps.map(s => ({ step: s.step, done: s.applied })), pending: live.pending.length } : null,
    locks: (live?.locks ?? []).map(h => ({ name: name(h.icKey), rating: h.rating })),
    traces: (live?.traces ?? []).filter(t => !t.dead).map(t => {
      const mine = spoofs.filter(sp => sp.icKey === t.icKey && sp.conn === live.n);
      const lastSpoof = mine.sort((a, b) => b.seq - a.seq)[0];
      const frozenBy = freezes.filter(x => x.icKey === t.icKey).sort((a, b) => b.seq - a.seq)[0];
      return { icKey: t.icKey, name: name(t.icKey), turnsLeft: t.turnsLeft, complete: t.complete, frozen: t.frozen, manual: !!t.clock?.manual,
        canFreeze: !!lastSpoof && !t.frozen && !t.complete, spoofKey: lastSpoof?.key ?? "", unfreezeKey: frozenBy?.type === "freeze" ? frozenBy.spoof : "" };
    }),
    traced: !!live?.traced,
    psy: (actor.system.vr2Psy ?? []).map(c => ({ key: c.key, kind: CONFIG.SR2E.icPsychotropic[c.kind] ?? c.kind, rating: c.rating })),
    deck: deck ? { baseMpcp: deck.baseMpcp, damage: Object.entries(deck.damage).filter(([, v]) => v > 0).map(([k, v]) => `${k} −${v}`).join(", "),
      worms: deck.worms.map(w => CONFIG.SR2E.icWorm[w.kind] ?? w.kind).join(", "), corrupted: [...deck.corrupted],
      deathwormTN: deck.deathwormTN } : null,
    connected: !!live
  };
}

/** One dispatcher for the sheets' part-3 buttons (`data-action="vr2ic"`). */
export async function sheetOp(doc, op, arg) {
  const gm = () => { if (!game.user.isGM) { ui.notifications.warn("That's the GM's."); return false; } return true; };
  if (op === "relocate") return relocate(doc, arg);
  if (op === "freeze") return request(doc, "freeze", { spoof: arg });
  if (op === "unfreeze") return request(doc, "unfreeze", { spoof: arg });
  if (op === "advance") return gm() && advanceManual(doc);
  // Part 4a: cascade reset and party IC (p.51–53).
  if (op === "resetCascade") return gm() && doc.update({ "system.cascadeEpoch": (doc.system.cascadeEpoch ?? 0) + 1 });
  if (op === "formParty") {
    if (!gm()) return;
    const ics = [doc, ...canvas.tokens.controlled.map(t => t.actor)];
    return formParty(ics);
  }
  if (op === "leaveParty") return gm() && leaveParty(doc);
  if (op === "psyRecover") {
    const mods = await foundry.applications.api.DialogV2.prompt({ window: { title: "Recovery (VR2.0 p.50)" },
      content: `<p>Willpower against the IC's rating, with:</p>
        <label><input type="checkbox" name="medication"> Medication or magical treatment (−1)</label><br>
        <label><input type="checkbox" name="therapy"> Intensive psychotherapy, Hospitalized lifestyle (−2, includes medication)</label><br>
        <label><input type="checkbox" name="spell"> A maintained spell with the desired effect (−1)</label>`,
      ok: { callback: (e, b) => ({ medication: b.form.elements.medication.checked, therapy: b.form.elements.therapy.checked, spell: b.form.elements.spell.checked }) } }).catch(() => null);
    if (mods) return psyRecover(doc, arg, mods);
    return;
  }
  if (op === "replaceChip") {
    if (!gm()) return;
    const deck = sync(doc.system.vr2Deck?.uuid) ?? doc;
    const n = eventsOf(deck).filter(e => e.type === "chipReplace" && e.chip === arg).length + 1;
    await recordEvent(deck, `${DECK}chip-replace:${arg}:${n}`, { type: "chipReplace", chip: arg });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: doc }), content: `<div class="sr2e-item-card">${esc(doc.name)}'s deck gets a new ${arg === "mpcp" ? "MPCP chip (damage and worms gone)" : "persona chip"}.</div>` });
  }
  if (op === "reload") {
    if (doc.system.vr2Conn) return ui.notifications.warn("Reload it from storage after jacking out (VR2.0 p.43).");
    const deck = sync(doc.system.vr2Deck?.uuid) ?? doc;
    const g = (doc.system.vr2Deck?.reloadGen?.(arg) ?? 0) + 1;
    return recordEvent(deck, `${DECK}reload:${arg}:${g}`, { type: "reload", programKey: arg, g });
  }
  if (op === "shutdownStart") return gm() && startShutdown(doc);
  if (op === "shutdownAdvance") return gm() && advanceShutdown(doc);
  if (op === "shutdownReset") return gm() && resetShutdown(doc);
  if (op === "strike") {
    if (!gm()) return;
    const target = game.user.targets.first()?.actor;
    if (target?.type !== "character" || !target.system.vr2Conn) return ui.notifications.warn("Target the connected decker whose utility the tar strikes.");
    const V = await import("./vr2.mjs");
    const progs = V.usablePrograms(target);
    if (!progs.length) return ui.notifications.warn(`${target.name} runs no usable programs.`);
    const id = await foundry.applications.api.DialogV2.prompt({ window: { title: `${doc.name} strikes` },
      content: `<select name="p">${progs.map(p => `<option value="${p.id}">${esc(p.name)} (${V.programRating(p)})</option>`).join("")}</select>`,
      ok: { callback: (e, b) => b.form.elements.p.value } }).catch(() => null);
    const p = target.items.get(id);
    // `arg` = the construct's tar program (part 4b R7); the card id is kept in the tar fact, so a retry finds it.
    if (p) return tarStrike(target, doc, { itemId: p.id, loadGen: p.system.loadGen ?? 0, rating: V.programRating(p), name: p.name }, `sheet-${foundry.utils.randomID()}`, arg || "");
  }
}

/** One dispatcher for part 3's card buttons. */
export async function icOp(uuid, op, arg) {
  const actor = await fromUuid(uuid);
  if (!actor) return;
  if (op === "sparky") return resistSparky(actor, arg);
  if (op === "traceStart") return traceStart(actor, arg);
  if (op === "psy") return psyTest(actor, arg);
  if (["worm", "wormGone", "defused", "explode", "poison", "tar"].includes(op)) {
    // card|icUuid|generation|component (part 4b R4); older buttons have only card|icUuid.
    const [card, icUuid, genS, comp = ""] = arg.split("|");
    const ic = await fromUuid(icUuid);
    if (!ic) return;
    const gen = genS === undefined || genS === "" ? null : Number(genS);
    if (isConstruct(ic) && !comp) return ui.notifications.warn(`${ic.name} is a construct now: use a newer card.`);
    const stale = comp ? !compAvailable(ic, comp, gen ?? -1) : (gen != null && gen !== (ic.system.generation ?? 0));
    if (stale) return ui.notifications.warn(`${ic.name} has changed since that card (crashed, reset or rebuilt).`);
    if (op === "worm") return wormTest(actor, ic, card, comp, gen);
    if (op === "wormGone") {
      if (comp) { await sequencer(() => crashComponent(ic, gen, comp, card)); return ui.notifications.info(`${ic.name}'s worm program is destroyed; the construct goes on.`); }
      await ic.update({ "system.generation": (ic.system.generation ?? 0) + 1 }); return ui.notifications.info(`${ic.name} destroyed (delete or reuse it).`);
    }
    if (isConstruct(ic) && ["defused", "explode"].includes(op)) return ui.notifications.warn("A construct holds no data bomb (part 4b).");
    if (op === "defused") return bombEnd(actor, ic, "defused", card);
    if (op === "explode") return bombEnd(actor, ic, "exploded", card);
    if (op === "poison") return poisonTest(actor, ic, comp);
    if (op === "tar") {
      const st = game.messages.get(card)?.flags?.sr2e?.vr2SystemTest;
      if (st?.utilityRef) return tarStrike(actor, ic, st.utilityRef, card, comp, gen);
    }
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
    if (/^vr2:conn-open:/.test(key) && isSequencer()) sequencer(() => dataworms(e.parent)).catch(err => console.error("SR2E | dataworms", err));
    // Part 4a: an admission or a resolution can change an IC's cascade — refresh open IC sheets.
    if (/^vr2:(admit|ack):/.test(key)) for (const a of allDocs()) if (a.type === "ic" && a.system.cascading && a.sheet?.rendered) a.sheet.render();
    if (/^vr2:conn-(open|end):/.test(key)) {
      const jp = await import("./jackpoints.mjs");
      jp.scheduleReconcile?.(e.parent); jp.refreshActorTokens?.(e.parent);
    }
  };
  Hooks.on("createActiveEffect", onRecord);
  // The end of each Combat Turn (a round change) ticks every trace on that combat's clock.
  Hooks.on("updateCombat", (combat, changes) => {
    if (!("round" in (changes ?? {})) || !isSequencer() || !isVR2()) return;
    for (const a of allDocs()) {
      if (a.type !== "character" || !a.system.vr2Conn) continue;
      sequencer(async () => {
        await tickTraces(a, (t, ticks) => t.clock?.combatId === combat.id ? boundariesToTick(t, ticks, combat.round) : []);
        await noticeTraces(a);
      }).catch(err => console.error("SR2E | trace ticks", err));
    }
    for (const h of game.actors.filter(x => x.type === "host")) {
      const run = hostShutdown(h);
      if (!run || run.offline || run.clock?.combatId !== combat.id) continue;
      const done = new Set(run.ticks.map(t => t.boundary));
      sequencer(async () => {
        for (let r = run.clock.startRound; r < combat.round; r++) if (!done.has(r)) await tickShutdown(h, r);
      }).catch(err => console.error("SR2E | shutdown ticks", err));
    }
  });
  Hooks.on("createChatMessage", (m) => { if (m.flags?.sr2e?.vr2SystemTest) offerTar(m).catch(err => console.error("SR2E | tar offer", err)); });
  // Part 5a §0: a decker's attack on a decker on the log is admitted by the sequencer finding the card.
  Hooks.on("createChatMessage", (m) => {
    const st = m.flags?.sr2e?.matrix;
    if (st?.ruleset !== "vr2" || st.attackerType !== "character" || st.targetConn == null) return;
    const t = sync(st.targetUuid);
    if (t) schedule(t);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-vr2ic-btn").forEach(b => b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const arg = b.dataset.arg === "__CARD__" ? message.id : (b.dataset.arg ?? "");   // a card can't know its own id when rendered
      try { await icOp(b.dataset.actor, b.dataset.op, arg); } catch (err) { console.error("SR2E | vr2 IC", err); ui.notifications.error(err.message); }
    }));
  });
  // Part 4a §4: changing what an IC IS starts its cascade over (so a revert can't resurrect old outcomes).
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (actor.type !== "ic") return;
    const moved = ["program", "rating", "hostUuid"].some(k => foundry.utils.hasProperty(changes, `system.${k}`)
      && foundry.utils.getProperty(changes, `system.${k}`) !== actor.system[k]);
    if (moved && !foundry.utils.hasProperty(changes, "system.cascadeEpoch")) foundry.utils.setProperty(changes, "system.cascadeEpoch", (actor.system.cascadeEpoch ?? 0) + 1);
  });
  // One deck per connection (plan §0): no deck switches while connected.
  Hooks.on("preUpdateItem", (item, changes) => {
    if (!foundry.utils.hasProperty(changes, "system.deck.active") || !(item.parent instanceof Actor)) return;
    if (!deckLocked(item.parent)) return;
    ui.notifications.warn(`${item.parent.name} is in the Matrix: jack out before switching decks (VR2.0).`);
    return false;
  });
}
