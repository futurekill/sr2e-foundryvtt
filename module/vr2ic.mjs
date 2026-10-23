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
import { foldVr2Ic, liveOpen } from "./rules/vr2ic-rules.mjs";
import { dumpShockDamage, systemTestVerdict } from "./rules/sr2e-rules.mjs";
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
export function requestExit(actor, { trigger = "voluntary", gracefulCard = null } = {}) {
  return request(actor, "exit", { trigger: gracefulCard ? "graceful" : trigger, gracefulCard });
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
    await fact(actor, `exit-open:${f.live.n}`, { type: "exitOpen", n: f.live.n, trigger, locks });
    return { ok: true };
  }
};
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

/** Advance an open exit: resolve what the sequencer can, then end the connection at the barrier. */
async function advanceExit(actor) {
  let f = foldOf(actor);
  if (!f.live?.exit) return;
  for (const s of f.live.steps) {
    if (s.res) continue;
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
    sequencer(async () => { await processRequests(actor); await advanceExit(actor); })
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
  // One deck per connection (plan §0): no deck switches while connected.
  Hooks.on("preUpdateItem", (item, changes) => {
    if (!foundry.utils.hasProperty(changes, "system.deck.active") || !(item.parent instanceof Actor)) return;
    if (!deckLocked(item.parent)) return;
    ui.notifications.warn(`${item.parent.name} is in the Matrix: jack out before switching decks (VR2.0).`);
    return false;
  });
}
