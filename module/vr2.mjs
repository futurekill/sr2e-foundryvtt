/**
 * The Virtual Realities 2.0 Matrix at roll time (docs/PLAN-vr2-core.md). Reached only
 * when isVR2() — except resolution, which follows the CARD's ruleset, so a fight
 * started under one ruleset finishes under it.
 *
 * - Cybercombat (p.123–124): a flag-backed attack card (`flags.sr2e.matrix`, ruleset
 *   "vr2") snapshots the host, Power and Level; the defender resists it once.
 * - System Tests (p.19): the decker's Computer test against the host's Security Value
 *   dice; the host's successes go on the decker's per-session security tally
 *   (`flags.sr2e.vr2Session`), written by the decker's own client with receipts.
 * - Leaving the Matrix (p.124): one path for the sheet, a jackpoint and a crash; dump
 *   shock unless the decker completed a Graceful Logoff.
 */
import { once, pruneMarkers } from "./claims.mjs";
import { cybercombatTN, icDamageLevel, dumpShockDamage, detectionFactor, matrixCombatOutcome,
         simsenseOverloadTN, systemTestVerdict, testTotalSuccesses, MATRIX_MONITOR_MAX,
         sheafCrossed, attributeLoss, CRIPPLER_ATTRIBUTE, maneuverTNs, maneuverOutcome,
         improvisedLevel, medicTN } from "./rules/sr2e-rules.mjs";
import { isVR2 } from "./vr2-mode.mjs";
import { programUnusable } from "./data/actor-data.mjs";
import { programKey, traceTally, traceFactor, expertDice, isProactive } from "./rules/vr2ic-rules.mjs";
import * as Y from "./vr2ic.mjs";
import { isCardResolved } from "./astral-combat.mjs";
import { matrixQueue, sessionHost } from "./jackpoints.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { firstTarget } from "./targeting.mjs";
import { miscDiceHTML, readMiscDice } from "./dialogs/roll-modifiers.mjs";
import { skillTnContext } from "./documents/actor.mjs";
import { commitDamage } from "./drugs.mjs";
import { RL, AL } from "./util/roll-label.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "es"}`;
const LEVEL_NAMES = { L: "Light", M: "Moderate", S: "Serious", D: "Deadly" };
const codeLabel = (code) => game.i18n.localize(CONFIG.SR2E.securityCodes[code]?.label ?? code);
const RESIST_IN_FLIGHT = new Set();
const sessionQueue = (actor, fn) => enqueueAttack(`vr2session:${actor.uuid}`, fn);

/**
 * The ONE rule for which programs count (docs/PLAN-vr2-part2.md §4). Core: every loaded
 * program at its rating. VR2.0: loaded, not crashed, with rating left after wear.
 */
export function usablePrograms(actor) {
  const vr2 = isVR2();
  return actor.items.filter(i => i.type === "program" && i.system.loaded
    && (!vr2 || (!programUnusable(actor, i) && (i.system.effectiveRating ?? 0) > 0)));
}

/** A program's rating as it counts now (VR2.0: what wear has left). */
export const programRating = (item) => isVR2() ? (item.system.effectiveRating ?? 0) : (item.system.rating ?? 0);

/** The best usable program whose name starts with `name`, or null. */
export function bestUtility(actor, name) {
  const key = String(name).toLowerCase();
  return usablePrograms(actor).filter(i => i.name.toLowerCase().startsWith(key))
    .sort((a, b) => programRating(b) - programRating(a))[0] ?? null;
}

/** Rating of the best usable program whose name starts with `name` (0 if none). */
export function loadedUtility(actor, name) {
  const u = bestUtility(actor, name);
  return u ? programRating(u) : 0;
}

/** A flag-path-safe key for a uuid (uuids contain dots). */
const keyOf = (uuid) => String(uuid ?? "").replaceAll(".", "~");

/**
 * Wear one copy of a utility (Armor, Shield, Medic lose a point per use; p.99–100).
 * `ref` is what was captured when it was USED, so a Swap Memory meanwhile wears the old
 * copy (no longer counted), never the fresh one. Receipted by `cardId` across reloads.
 */
export function addWear(actor, ref, cardId) {
  const item = ref ? actor.items.get(ref.itemId) : null;
  if (!item) return Promise.resolve();
  return enqueueAttack(`program:${item.uuid}`, async () => {
    const live = actor.items.get(ref.itemId);
    const events = live?.system.wearEvents ?? [];
    if (!live || events.some(e => e.endsWith(`:${cardId}`))) return;
    await live.update({ "system.wearEvents": [...events, `${ref.loadGen}:${cardId}`] });
  });
}

/** What to capture when a utility is used. */
const useRef = (item) => item ? { itemId: item.id, loadGen: item.system.loadGen ?? 0, rating: programRating(item), name: item.name } : null;

const hostSnap = (host) => ({ hostUuid: host.uuid, hostName: host.name,
  securityCode: host.system.securityCode, securityValue: host.system.securityValue });

const hostOptions = (hosts, selected) => hosts.map(h =>
  `<option value="${h.id}" ${h.uuid === selected?.uuid ? "selected" : ""}>${esc(h.name)} (${esc(codeLabel(h.system.securityCode))}, Security Value ${h.system.securityValue})</option>`).join("");

// ── Sessions and the security tally ──────────────────────────────────────────

/**
 * The decker's live VR2.0 session record, or null. On part 3's connection log a session
 * belongs to ONE connection (`conn`): an older connection's session reads as absent, so a
 * reconnect never inherits its tally, suppressions or icon damage (PLAN-vr2-part3 §0, R6 #1).
 */
export const liveSession = (actor) => {
  const s = actor?.flags?.sr2e?.vr2Session;
  if (!s?.id) return null;
  const conn = actor.system?.vr2Conn;
  if (conn && s.conn !== conn.n) return null;
  if (!conn && s.conn != null) return null;   // its connection ended
  return s;
};
/** End the live host session (kept as lastSession): part 3's exit housekeeping. */
export function closeSession(actor) {
  return sessionQueue(actor, async () => {
    const cur = actor?.flags?.sr2e?.vr2Session;
    if (cur?.id) await replaceSessions(actor, null, cur);
  });
}

/** Replace the session records whole (a merge would carry old receipts along). */
async function replaceSessions(actor, live, last) {
  await actor.update({ "flags.sr2e.-=vr2Session": null, ...(last ? { "flags.sr2e.-=lastSession": null } : {}) });
  const set = {};
  if (live) set["flags.sr2e.vr2Session"] = live;
  if (last) set["flags.sr2e.lastSession"] = last;
  if (Object.keys(set).length) await actor.update(set);
}

/**
 * A new session for a decker entering the Matrix (the old one kept as lastSession);
 * the jackpoint's host if it names one. Every way in awaits it INSIDE matrixQueue
 * (the sheet toggle, a jackpoint), so a crash can tell this connection from a later one.
 */
export function startSession(actor) {
  return sessionQueue(actor, async () => {
    const h = sessionHost(actor);
    const next = { id: foundry.utils.randomID(), hostUuid: h?.uuid ?? "", hostName: h?.name ?? "", tally: 0, receipts: {},
      conn: actor.system.vr2Conn?.n ?? null };
    await replaceSessions(actor, next, liveSession(actor));
    return next;
  });
}

/** Jack in from the sheet (VR2.0): decided in the queue, so a double click enters once. */
export function vr2EnterMatrix(actor) {
  return matrixQueue(actor, async () => {
    if (actor.system.matrixMode) return;
    if (!await Y.mayJackIn(actor, sessionHost(actor))) return;
    // Part 3: entry IS the connection record (its number server-arbitrated, PLAN-vr2-part3 §0).
    if (await Y.openConnection(actor) == null) return;
    await actor.update({ "system.matrixMode": true });
    await startSession(actor);
  });
}

/** The live session against `host`: a session with no host yet adopts it; another host starts a new one (the old kept as lastSession). */
export function sessionFor(actor, host) {
  if (Y.hostOffline(host)) { ui.notifications.warn(`${host.name} is shut down (VR2.0 p.53).`); return Promise.resolve(null); }
  return sessionQueue(actor, async () => {
    const s = liveSession(actor);
    if (s?.hostUuid === host.uuid) return s;
    if (s && !s.hostUuid) {
      await actor.update({ "flags.sr2e.vr2Session.hostUuid": host.uuid, "flags.sr2e.vr2Session.hostName": host.name });
      return { ...s, hostUuid: host.uuid, hostName: host.name };
    }
    const next = { id: foundry.utils.randomID(), hostUuid: host.uuid, hostName: host.name, tally: 0, receipts: {},
      conn: actor.system.vr2Conn?.n ?? null };
    await replaceSessions(actor, next, s);
    return next;
  });
}

/**
 * The tally update for `base` more host successes, with its receipt and every sheaf row it
 * crosses, as ONE update (docs/PLAN-vr2-part2.md §1). Call inside the session queue.
 */
function tallyUpdate(actor, s, base, eventId) {
  // Part 3: a traced decker's tally accelerates, +1 per increase (p.46).
  const traced = actor.system?.vr2Conn ? !!Y.foldOf(actor).live?.traced : false;
  const add = traceTally(Math.max(0, Number(base) || 0), traced);
  const tally = (s.tally ?? 0) + add;
  const update = { "flags.sr2e.vr2Session.tally": tally, [`flags.sr2e.vr2Session.receipts.${eventId}`]: add };
  const host = sync(s.hostUuid);
  for (const row of sheafCrossed(host?.system?.sheaf, s.tally ?? 0, tally)) {
    // Outside the session records, so no session change can drop it before delivery.
    const key = `${host.id}_${s.id}_${row.id}`;
    update[`flags.sr2e.vr2SheafPending.${key}`] = { key, hostUuid: host.uuid, sessionId: s.id,
      deckerName: actor.name, step: row.step, event: row.event, note: row.note, tally };
  }
  return update;
}

/** The tally event a message carries (part-1 System Test cards included). */
function eventOf(m) {
  const e = m?.flags?.sr2e?.vr2TallyEvent;
  if (e) return e;
  const st = m?.flags?.sr2e?.vr2SystemTest;
  return st ? { eventId: m.id, actorUuid: st.actorUuid, sessionId: st.sessionId, base: st.hostSuccesses } : null;
}

/** Apply a message's tally event to its session, once. Only the message's author writes. */
export function applyTallyEvent(message) {
  const ev = eventOf(message);
  const actor = ev ? sync(ev.actorUuid) : null;
  if (!ev || !actor?.isOwner || !message.isAuthor) return Promise.resolve(false);
  return sessionQueue(actor, async () => {
    const s = liveSession(actor);
    if (!s || s.id !== ev.sessionId || s.receipts?.[ev.eventId] != null) return false;
    await actor.update(tallyUpdate(actor, s, ev.base, ev.eventId));
    return true;
  });
}
/** Part-1 name, kept for callers and tests. */
export const addTally = (actor, message) => applyTallyEvent(message);

/** On load: this client's own tally events that never reached their (still live) session. */
export async function reconcileTallies() {
  for (const m of game.messages ?? []) {
    const ev = eventOf(m);
    if (!ev || !m.isAuthor) continue;
    const actor = sync(ev.actorUuid);
    if (actor && liveSession(actor)?.id === ev.sessionId) await applyTallyEvent(m);
  }
}

// ── Security sheaf delivery (p.150; PLAN-vr2-part2 §1) ───────────────────────

const ALERT_RANK = { none: 0, passive: 1, active: 2 };
const SHEAF_IN_FLIGHT = new Set();

/** The active GM delivers a decker's pending sheaf steps: the alert exactly once, the whisper at least once. */
export async function deliverSheaf(actor) {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  for (const [key, e] of Object.entries(actor?.flags?.sr2e?.vr2SheafPending ?? {})) {
    if (!e || SHEAF_IN_FLIGHT.has(key)) continue;
    SHEAF_IN_FLIGHT.add(key);
    try {
      const host = sync(e.hostUuid);
      if (host) await enqueueAttack(`host:${host.uuid}`, async () => {
        if (host.flags?.sr2e?.sheafApplied?.[key]) return;
        const update = { [`flags.sr2e.sheafApplied.${key}`]: true };
        const want = e.event === "active" || e.event === "passive" ? e.event : null;
        if (want && ALERT_RANK[want] > (ALERT_RANK[host.system.alert] ?? 0)) update["system.alert"] = want;
        await host.update(update);
      });
      const what = CONFIG.SR2E.vr2SheafEvents?.[e.event] ?? e.event ?? "";
      if (e.event === "shutdown" && host) await Y.startShutdown(host);   // part 3: one lifecycle (p.53)
      await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
        content: `<div class="sr2e-item-card"><strong>Security sheaf — ${esc(host?.name ?? "host")}</strong>
          <br>${esc(e.deckerName)}'s tally reached ${e.tally}: step ${e.step}${what ? ` — <strong>${esc(what)}</strong>` : ""}${e.note ? `: ${esc(e.note)}` : ""} (VR2.0 p.150).</div>` });
      await actor.update({ [`flags.sr2e.vr2SheafPending.-=${key}`]: null });
    } catch (err) {
      console.error("SR2E | sheaf delivery", err);
    } finally { SHEAF_IN_FLIGHT.delete(key); }
  }
}

Hooks.on("updateActor", (actor, changes) => {
  if (changes?.flags?.sr2e?.vr2SheafPending) deliverSheaf(actor);
});

// ── IC crashes: suppress or let it register (p.40; PLAN-vr2-part2 §2) ─────────

const CHOICE_IN_FLIGHT = new Set();

/** The decker's choice for an IC their attack crashed: one atomic session update. */
export async function crashChoice(message, choice) {
  const c = message?.flags?.sr2e?.vr2Crash;
  const actor = sync(c?.deckerUuid);
  if (!c || !actor) return;
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can choose.`);
  if (CHOICE_IN_FLIGHT.has(c.cardId)) return;
  CHOICE_IN_FLIGHT.add(c.cardId);
  try {
    return await sessionQueue(actor, async () => {
      const s = liveSession(actor);
      if (!s || s.id !== c.sessionId) return ui.notifications.warn("That crash belongs to an earlier session.");
      const k = c.cardId;
      if (s.receipts?.[`crash:${k}`] != null || s.suppressed?.[k] || s.released?.[k]) {
        return ui.notifications.warn("That crash has already been decided.");
      }
      if (choice === "suppress") {
        await actor.update({ [`flags.sr2e.vr2Session.suppressed.${k}`]: { icUuid: c.icUuid, name: c.icName, rating: c.rating } });
      } else {
        await actor.update(tallyUpdate(actor, s, c.rating, `crash:${k}`));
      }
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)}
        ${choice === "suppress" ? `suppresses ${esc(c.icName)} (Detection Factor −1 while on this system)` : `lets ${esc(c.icName)}'s crash register: +${c.rating} to the tally`} (VR2.0 p.40).</div>` });
      return true;
    });
  } finally { CHOICE_IN_FLIGHT.delete(c.cardId); }
}

/** Release a suppressed IC: its point of Detection Factor back, its rating onto the tally. */
export function releaseSuppressed(actor, key) {
  return sessionQueue(actor, async () => {
    const s = liveSession(actor);
    const e = s?.suppressed?.[key];
    if (!e) return false;
    await actor.update({ ...tallyUpdate(actor, s, e.rating, `release:${key}`),
      [`flags.sr2e.vr2Session.suppressed.-=${key}`]: null, [`flags.sr2e.vr2Session.released.${key}`]: true });
    return true;
  });
}

/** Detection Factor (p.17–18), less one per suppressed IC (p.40); TN floor 2. */
export function vr2DetectionFactor(actor) {
  // Part 2's per-session suppressions, plus part 3's frozen traces on the connection (p.46).
  const suppressed = Object.keys(liveSession(actor)?.suppressed ?? {}).length
    + (actor.system?.vr2Conn ? (Y.foldOf(actor).live?.frozenCount ?? 0) : 0);
  return Math.max(2, detectionFactor(actor.system.matrixPersona?.masking ?? 0, loadedUtility(actor, "sleaze")) - suppressed);
}

// ── Action boundary (improvised builds, PLAN-vr2-part2 §7) ────────────────────

/**
 * After an action's test is ROLLED: a failed improvised build that existed when the
 * action started is spent (its ratings stay down only "until his next action", p.123).
 * The build's own action passes null, so it never clears itself.
 */
export function commitAction(actor, startedWithBuildId) {
  if (!startedWithBuildId || actor?.type !== "character") return Promise.resolve();
  return sessionQueue(actor, async () => {
    const imp = liveSession(actor)?.improvised;
    if (imp?.id === startedWithBuildId && imp.level == null) await actor.update({ "flags.sr2e.vr2Session.-=improvised": null });
  });
}

// ── System Tests (p.19) ──────────────────────────────────────────────────────

/** The System Test card; `successes` is the decker's (Karma re-renders it), `hostSuccesses` never changes. */
export function renderSystemTestCard(st) {
  const v = systemTestVerdict(st.successes, st.hostSuccesses);
  return `<div class="sr2e-item-card sr2e-vr2-systest">
    <strong>${esc(st.actorName)} — ${esc(st.opLabel)}</strong>
    <br>vs ${esc(st.hostName)}: ${esc(st.subsystemLabel)} ${st.subsystem}${st.utility ? ` − ${esc(st.utilityName)} ${st.utility}` : ""} → TN ${st.tn}.
    <br>The host rolls Security Value ${st.securityValue} vs Detection Factor ${st.df}: ${plural(st.hostSuccesses, "success")}.
    <br>${v.success ? `<strong style="color:#7a8;">Succeeds</strong>` : `<strong style="color:#c44;">Fails</strong>`}
    (${st.successes} vs the host's ${st.hostSuccesses}; the decker needs more).
    <br><em>+${st.hostSuccesses} to the security tally (VR2.0 p.19).</em>
  </div>`;
}

/**
 * A VR2.0 System Test (p.19): Computer vs the subsystem's rating less the utility the
 * operation uses; the host rolls its Security Value against the decker's Detection
 * Factor once, here, and its successes go on the tally whether the decker wins or not.
 */
export async function vr2SystemTest(actor, host, operation, opts = {}) {
  if (operation !== "gracefulLogoff") { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  const op = CONFIG.SR2E.vr2SystemOperations[operation];
  if (!op || host?.type !== "host") return ui.notifications.warn("Choose a host and a System Operation.");
  if (Y.hostOffline(host)) return ui.notifications.warn(`${host.name} is shut down (VR2.0 p.53).`);
  const computer = actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "computer");
  const trained = (computer?.system?.rating ?? 0) > 0;
  const dice = trained ? computer.system.rating : (actor.system.intelligence?.value ?? 1);
  const sub = op.subsystem === "targeted" ? (opts.subsystem || "files") : op.subsystem;
  const subsystem = host.system.subsystemRating(sub);
  const utilityItem = bestUtility(actor, op.utility);
  const utility = utilityItem ? programRating(utilityItem) : 0;
  // Untrained: the Skill Web default to Intelligence, +4 TN (core p.84).
  // A Graceful Logoff with trace IC locating is harder by each trace's rating (p.45).
  const tracing = operation === "gracefulLogoff" && actor.system.vr2Conn
    ? (Y.foldOf(actor).live?.traces ?? []).filter(t => !t.complete && !t.dead).reduce((n, t) => n + (t.rating ?? 0), 0) : 0;
  // Analyze Icon: the Sensor rating lowers the TN too, never below 2 (p.111).
  const sensor = operation === "analyzeIcon" ? (actor.system.matrixPersona?.sensor ?? 0) : 0;
  const tn = Math.max(2, subsystem - utility - sensor) + (trained ? 0 : 4) + tracing;
  const subsystemLabel = CONFIG.SR2E.vr2Subsystems[sub] ?? sub;
  const session = await sessionFor(actor, host);
  if (!session) return;
  const startedBuild = liveSession(actor)?.improvised?.id ?? null;
  const res = await actor.rollSuccessTest(Math.max(1, dice), tn, {
    label: RL("SystemOpVs", { op: op.label, subsystem: subsystemLabel, tn }), tnContext: skillTnContext("computer"),
    poolDice: opts.hacking ? { hacking: opts.hacking } : undefined,
    karmaDice: opts.karmaDice ?? 0, miscDice: opts.miscDice, miscLabel: opts.miscLabel
  });
  if (!res) return;
  await commitAction(actor, startedBuild);
  const df = vr2DetectionFactor(actor);
  const securityValue = host.system.securityValue;
  const hostRoll = await SR2ESuccessRoll.successTest(securityValue, df);
  const st = { actorUuid: actor.uuid, actorName: actor.name, operation, opLabel: op.label, hostName: host.name,
    subsystemLabel, subsystem, utilityName: op.utility, utility, tn, df, securityValue,
    successes: res.successes, hostSuccesses: hostRoll.successes, sessionId: session.id, testMessageId: res.testMessageId,
    // Part 3: what reactive IC (tar, worms, bombs) needs to act on this test (plan §4).
    hostUuid: host.uuid, conn: actor.system.vr2Conn?.n ?? null, utilityRef: useRef(utilityItem), sub,
    allOnes: (res.dice ?? []).length > 0 && res.dice.every(d => d.total === 1),
    deck: actor.system.vr2Deck?.uuid ?? null, bombKey: opts.bombKey ?? null };
  const ev = { eventId: `st-${foundry.utils.randomID()}`, actorUuid: actor.uuid, sessionId: session.id,
    base: hostRoll.successes, source: "system-test" };
  const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderSystemTestCard(st),
    rolls: hostRoll.rolls, flags: { sr2e: { vr2SystemTest: st, vr2TallyEvent: ev } } });
  await applyTallyEvent(msg);
  // Probe IC (p.42): its own roll against the Detection Factor, its own event; never the verdict.
  const probe = host.system.probe ?? 0;
  if (probe > 0) {
    const pr = await SR2ESuccessRoll.successTest(probe, df);
    const pm = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: pr.rolls,
      content: `<div class="sr2e-item-card">Probe-${probe} on ${esc(host.name)} vs Detection Factor ${df}:
        ${plural(pr.successes, "success")} onto ${esc(actor.name)}'s tally (VR2.0 p.42).</div>`,
      flags: { sr2e: { vr2TallyEvent: { eventId: `probe-${foundry.utils.randomID()}`, actorUuid: actor.uuid,
        sessionId: session.id, base: pr.successes, source: "probe" } } } });
    await applyTallyEvent(pm);
  }
  res.cardId = msg.id;   // part 3 checks a Graceful Logoff's verdict on its card
  return res;
}

// ── Cybercombat (p.123–124) ──────────────────────────────────────────────────

/** Who an icon is right now, for maneuver records: a decker's session, or an IC's generation. */
export const sessionKey = (a) => a?.type === "ic" ? `${a.uuid}:${a.system.generation ?? 0}` : (liveSession(a)?.id ?? "");

const ATTR_LABEL = { bod: "Bod", evasion: "Evasion", masking: "Masking", sensor: "Sensor" };
const OFFENSE_ATTRIBUTE = { poison: "bod", restrict: "evasion", reveal: "masking" };

/** A utility's attribute attack (p.98–99), from its field or its name; "" for none. */
function offenseOf(item) {
  if (item.system.offense) return item.system.offense;
  const n = item.name.toLowerCase();
  return Object.keys(OFFENSE_ATTRIBUTE).find(k => n.startsWith(k)) ?? "";
}

/** The VR2.0 attack card (state in flags.sr2e.matrix, ruleset "vr2"). */
export function renderVR2MatrixCard(st) {
  const hit = (st.successes ?? 0) > 0;
  const attr = st.effect === "attribute";
  if (st.effect === "trace") {
    return `<div class="sr2e-damage-result"><strong>${esc(st.attackerName)} hunts ${esc(st.targetName ?? "")}'s datatrail</strong> — ${plural(st.successes ?? 0, "success")}
      <br><em>${hit ? "A hit: the location cycle starts, ⌊10 ÷ successes⌋ Combat Turns (VR2.0 p.45)." : "No fix yet: the hunt goes on."}</em>
      ${hit && !st.resolved ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-vr2ic-btn" data-actor="${esc(st.targetUuid)}" data-op="traceStart"
        data-arg="__CARD__" title="GM: freeze the successes and start the countdown">Start location cycle</button></div>` : ""}</div>`;
  }
  const button = !st.resolved && hit ? `
    <div class="sr2e-karma-actions">
      <button type="button" class="sr2e-matrixresist-btn"
              title="${attr ? `The target tests its ${ATTR_LABEL[st.attr]} against TN ${st.rating}.`
                : "The target resists: IC rolls the host's Security Value, a persona its Bod, against TN = the Power (an Armor utility lowers it)."}">
        🖧 Resist (Matrix)
      </button>
    </div>` : "";
  const what = attr ? `${esc(st.effectName)} against ${ATTR_LABEL[st.attr]}` : `${st.power}${st.level}`;
  const rule = attr
    ? `<br><em>The target tests ${ATTR_LABEL[st.attr]} against TN ${st.rating}; it loses 1 point per 2 net successes${st.floor ? ", never below 1" : ""} (VR2.0 ${st.floor ? "p.41" : "p.98–99"}).</em>`
    : `<br><em>Stages up 1 level per 2 successes; the target resists against TN ${st.power}, staging down 1 per 2.
      10 boxes crash the icon (VR2.0 p.123–124).</em>`;
  // Part 4a: what the optional IC rules added to this attack (p.51–52).
  const opt = [st.expert ? `Expert ${st.expert > 0 ? "Offense" : "Defense"}-${Math.abs(st.expert)}` : "",
    st.cascade ? `cascading: Security Value +${st.cascade.sv}, rating +${st.cascade.rating}${st.targetConn == null ? " (not on the connection log: this attack won't cascade)" : ""}` : ""].filter(Boolean);
  return `<div class="sr2e-damage-result">
    <strong>${esc(st.attackerName)} attacks ${esc(st.targetName ?? "")} in the Matrix</strong> — ${plural(st.successes ?? 0, "success")}
    <br>${what} on ${esc(st.hostName)} (${esc(codeLabel(st.securityCode))}, Security Value ${st.securityValue}); target ${st.status === "legitimate" ? "legitimate" : "intruding"}.
    ${opt.length ? `<br><em>${esc(opt.join("; "))}.</em>` : ""}
    ${hit ? rule : "<br><em>The attack misses.</em>"}
    ${st.resolution ?? ""}
    ${button}
  </div>`;
}

/**
 * The attacker's maneuver records against `target` (PLAN-vr2-part2 §6): they live on the
 * attacker, are valid only while both sides are the same connections, and an IC
 * observer's lost sight expires lazily (rounds in that combat + tally gained since).
 */
function maneuverState(attacker, target) {
  const mv = attacker.flags?.sr2e?.vr2Maneuvers ?? {};
  const mine = sessionKey(attacker), theirs = sessionKey(target), k = keyOf(target.uuid);
  const valid = (r) => !!r && r.mySession === mine && r.theirSession === theirs;
  let blind = false, expired = false;
  const lost = mv.lostSight?.[k];
  if (valid(lost)) {
    if (lost.observer === "ic") {
      const combat = lost.combatId ? game.combats?.get(lost.combatId) : null;
      const rounds = combat ? Math.max(0, combat.round - lost.roundAtStart) : 0;
      const tally = Math.max(0, (liveSession(target)?.tally ?? 0) - (lost.tallyAtStart ?? 0));
      if (rounds + tally >= lost.turns) expired = true; else blind = true;
    } else blind = true;
  }
  const parry = valid(mv.parriedBy?.[k]) ? (mv.parriedBy[k].net ?? 0) : 0;
  const p = mv.position;
  const pos = p && p.vs === target.uuid && p.mySession === mine && p.theirSession === theirs ? (p.net ?? 0) : 0;
  return { blind, expired, parry, pos, k };
}

async function promptAttack(actor, target, ms) {
  const isIC = actor.type === "ic";
  const hosts = game.actors.filter(a => a.type === "host");
  if (!hosts.length) { ui.notifications.warn("Create a Host actor first: VR2.0 cybercombat runs on its Security Code and Value."); return null; }
  const preHost = isIC ? sync(actor.system.hostUuid) : (sync(liveSession(actor)?.hostUuid) ?? sessionHost(actor));
  let programs = "";
  if (!isIC) {
    const list = usablePrograms(actor).filter(i => i.system.damageLevel || offenseOf(i) || /attack|blaster/i.test(i.name))
      .sort((a, b) => programRating(b) - programRating(a));
    const imp = liveSession(actor)?.improvised;
    const improv = imp?.level ? `<option value="improv">Improvised attack (Power ${imp.power}, ${imp.level})</option>` : "";
    if (!list.length && !improv) {
      ui.notifications.warn("Load an attack utility, or build an improvised attack (VR2.0 p.123).");
      return null;
    }
    programs = improv + list.map(p => `<option value="${p.id}">${esc(p.name)} (Rating ${programRating(p)}${offenseOf(p) ? `, against ${ATTR_LABEL[OFFENSE_ATTRIBUTE[offenseOf(p)]]}`
      : p.system.damageLevel ? `, ${p.system.damageLevel}` : ", no level"})</option>`).join("");
  }
  const hackingMax = actor.system.dicePools?.hacking?.value ?? 0;
  const karma = actor.system.karma?.pool ?? 0;
  const legit = target.type === "ic";
  let pick = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Matrix Attack on ${target.name} (VR2.0)` }, rejectClose: false,
    content: `<div>
      <div class="form-group"><label>Host:</label><select name="host">${hostOptions(hosts, preHost)}</select></div>
      <div class="form-group"><label>Target icon:</label><select name="status">
        <option value="intruding" ${legit ? "" : "selected"}>Intruding</option>
        <option value="legitimate" ${legit ? "selected" : ""}>Legitimate (IC, or a valid passcode)</option></select></div>
      ${ms.parry ? `<p style="font-size:11px;color:#c99;">${esc(target.name)} parried you: +${ms.parry} TN (p.122).</p>` : ""}
      ${ms.pos ? `<div class="form-group"><label>Position bonus (+${ms.pos}, p.122):</label><select name="position">
        <option value="tn">−${ms.pos} TN</option><option value="power">+${ms.pos} Power</option></select></div>` : ""}
      ${isIC && Y.isConstruct(actor) ? `<div class="form-group"><label>Program (construct, p.52):</label><select name="comp">${
        actor.system.construct.components.filter(c => isProactive(c.program) && Y.compAvailable(actor, c.id, undefined, { budget: false }))
          .map(c => `<option value="${esc(c.id)}">${esc(CONFIG.SR2E.icPrograms[c.program] ?? c.program)}-${c.rating}</option>`).join("")}</select></div>` : ""}
      ${isIC ? `<p style="font-size:11px;color:#aaa1c0;">The IC rolls the host's Security Value; Power ${Y.isConstruct(actor) ? "= the program's rating" : actor.system.rating}, Level by Security Code (VR2.0 p.40, p.124).${Y.threatOf(actor) ? ` Threat +${Y.threatOf(actor)} dice (p.52).` : ""}${Y.expertOf(actor) ? ` Expert ${Y.expertOf(actor) > 0 ? "Offense" : "Defense"}-${Math.abs(Y.expertOf(actor))} (p.52).` : ""}${Y.partyOf(actor) ? ` Party IC: +${Y.partyOf(actor)} TN (p.52).` : ""}</p>` : `
      <div class="form-group"><label>Attack utility:</label><select name="program">${programs}</select></div>
      ${Y.partyOf(target) ? `<div class="form-group"><label title="Party IC: +${Y.partyOf(target)} TN to hit, except with an area-effect combat utility (VR2.0 p.52)">Area-effect utility:</label>
        <input type="checkbox" name="area"></div>` : ""}
      <div class="form-group"><label>Level if unset <span style="font-size:10px;color:#958ba8;">(saved to it, p.98)</span>:</label>
        <select name="level"><option value="">—</option><option value="L">Light</option><option value="M">Moderate</option>
        <option value="S">Serious</option><option value="D">Deadly</option></select></div>
      <div class="form-group"><label>Hacking Pool dice <span style="font-size:10px;color:#958ba8;">(${hackingMax} left)</span>:</label>
        <input type="number" name="hacking" value="0" min="0" max="${hackingMax}" style="width:52px;text-align:center;"></div>`}
      ${karma > 0 ? `<div class="form-group"><label>Karma dice <span style="font-size:10px;color:#958ba8;">(pool ${karma})</span>:</label>
        <input type="number" name="karma_dice" value="0" min="0" max="${karma}" style="width:52px;text-align:center;"></div>` : ""}
      ${miscDiceHTML()}
    </div>`,
    buttons: [
      { action: "attack", label: "Attack", default: true, callback: (ev, b) => {
        const f = b.form.elements;
        pick = { hostId: f.host.value, status: f.status.value, programId: f.program?.value ?? null, level: f.level?.value ?? "",
          position: f.position?.value ?? "", area: !!f.area?.checked, comp: f.comp?.value ?? "",
          hacking: Math.max(0, Math.min(hackingMax, parseInt(f.hacking?.value) || 0)),
          karmaDice: Math.max(0, Math.min(karma, parseInt(f.karma_dice?.value) || 0)), ...readMiscDice(b.form) };
      } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "attack" ? pick : null;
}

/** The decker's Computer skill rating (0 untrained), as an attack's Shield TN (p.100). */
const computerOf = (actor) => actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "computer")?.system?.rating ?? 0;

/**
 * A VR2.0 Matrix attack by a decker (attack utility, attribute utility or improvised) or
 * IC (the host's Security Value). Needs a target: maneuvers and defenses apply to it.
 */
const ATTACK_IN_FLIGHT = new Set();
export async function vr2MatrixAttack(actor) {
  // One attack at a time per actor: a one-shot build or a position bonus is used once.
  if (ATTACK_IN_FLIGHT.has(actor.uuid)) return ui.notifications.warn(`${actor.name} is already attacking.`);
  ATTACK_IN_FLIGHT.add(actor.uuid);
  try { return await attackOnce(actor); } finally { ATTACK_IN_FLIGHT.delete(actor.uuid); }
}

async function attackOnce(actor) {
  const why = Y.vr2ActionGuard(actor);
  if (why) return ui.notifications.warn(why);
  const target = firstTarget()?.actor ?? null;
  if (!target || target.uuid === actor.uuid) return ui.notifications.warn("Target the icon you attack first.");
  if (!["ic", "character"].includes(target.type)) return ui.notifications.warn("Only IC or a decker's persona can be attacked in the Matrix.");
  const ms = maneuverState(actor, target);
  if (ms.blind) return ui.notifications.warn(`${actor.name} has lost ${target.name} (evade detection, VR2.0 p.122): re-detect it first.`);
  const startedBuild = liveSession(actor)?.improvised?.id ?? null;
  const o = await promptAttack(actor, target, ms);
  if (!o) return;
  // Re-read: the target may have evaded or parried while the dialog was open.
  const ms2 = maneuverState(actor, target);
  if (ms2.blind) return ui.notifications.warn(`${actor.name} has lost ${target.name} (evade detection, VR2.0 p.122).`);
  if (ms2.pos !== ms.pos) o.position = "";
  Object.assign(ms, ms2);
  const host = game.actors.get(o.hostId);
  if (!host) return;
  const isIC = actor.type === "ic";
  const code = host.system.securityCode;
  // Shield and shift defenses make IC harder to hit (p.50).
  let tn = cybercombatTN(code, o.status) + ms.parry
    + (target.type === "ic" && ["shield", "shift"].includes(target.system.defense) ? 2 : 0);
  let dice, power, level, tnContext, effect = {}, usedBuild = null, attackerComputer;
  let cascade = { sv: 0, rating: 0 }, cascade0 = null, icRating = null, prof = null, threat = 0, icKey0 = "";
  if (isIC) {
    // An IC with no host keeps the one picked, so its initiative uses it too.
    if (!actor.system.hostUuid && actor.isOwner) await actor.update({ "system.hostUuid": host.uuid });
    // Part 4b: a construct attacks with one of its programs (p.52); everything below reads that profile.
    if (Y.isConstruct(actor)) {
      const why = Y.constructProblems(actor).problems;
      if (why.length) return ui.notifications.warn(`${actor.name} isn't a valid construct: ${why.join("; ")}.`);
      if (!o.comp || !Y.compAvailable(actor, o.comp) || !isProactive(Y.icProfile(actor, o.comp).program)) {
        return ui.notifications.warn(`${actor.name} has no program that can attack right now.`);
      }
    }
    prof = Y.icProfile(actor, Y.isConstruct(actor) ? o.comp : "");
    threat = Y.threatOf(actor);
    icKey0 = Y.icKeyOf(actor, prof.comp);   // the incarnation that attacks: a crash during the roll can't relabel it
    // Cascading IC (p.51; plan part 4a §4): derived from the deckers' records, so the active GM (the
    // sequencer) settles every pending admission and resolution first.
    if (actor.system.cascading && !Y.isConstruct(actor) && isProactive(actor.system.program) && target.type === "character") {
      if (!Y.isSequencer()) return ui.notifications.warn("Cascading IC attacks are rolled by the active GM.");
      await Y.flush();
      cascade0 = Y.cascadeBaseline(actor, host);
      cascade = Y.cascadeOf(actor, host);
    }
    icRating = prof.rating + cascade.rating;
    dice = expertDice(host.system.securityValue + cascade.sv, Y.expertOf(actor)).attack + threat; level = icDamageLevel(code);
    // Black IC is +2 while the decker's icon is down (p.48); others use their rating.
    power = Y.blackKind(prof.program) && target.type === "character" ? Y.blackRating(actor, target, prof.rating) + cascade.rating : icRating;
    tnContext = { kind: "other" }; attackerComputer = host.system.securityValue;
    // Trace IC hunts against the decker's Trace Factor (p.45), not the cybercombat table.
    if (prof.program === "trace" && target.type === "character") {
      const conn = target.system.vr2Conn;
      const jp = sync(conn?.jackpoint?.jackpoint);
      // A construct can't be a hidden trap (part 4b R8): it adds nothing to the Trace Factor.
      const linked = sync(actor.system.trapFor), trapped = Y.isConstruct(linked) ? null : linked;
      tn = Math.max(2, traceFactor({ evasion: target.system.matrixPersona?.evasion ?? 0, rating: icRating,
        camo: loadedUtility(target, "camo"), redirects: conn ? (Y.foldOf(target).live?.redirects ?? 0) : 0,
        jackpoint: Number(jp?.system?.traceMod) || 0,
        trapGray: trapped?.system?.icClass === "gray" ? trapped.system.rating : 0,
        trapBlack: trapped?.system?.icClass === "black" ? trapped.system.rating : 0 }));
      effect = { effect: "trace" };
    }
    // A traced decker: −1 to proactive IC attacks (p.46).
    if (target.type === "character" && target.system.vr2Conn && Y.foldOf(target).live?.traced) tn = Math.max(2, tn - 1);
    const attr = CRIPPLER_ATTRIBUTE[prof.program];
    if (attr) {
      if (target.type !== "character") return ui.notifications.warn("A crippler attacks a decker's persona.");
      effect = { effect: "attribute", attr, floor: 1, rating: icRating,
        effectName: `${CONFIG.SR2E.icPrograms?.[prof.program] ?? prof.program}-${icRating}` };
    }
  } else {
    attackerComputer = computerOf(actor);
    // Log on to the chosen host FIRST: a build made on another host ends with that session.
    await sessionFor(actor, host);
    if (o.programId === "improv") {
      const imp = liveSession(actor)?.improvised;
      if (!imp?.level) return ui.notifications.warn("No improvised attack is ready on this host.");
      dice = power = imp.power; level = imp.level; usedBuild = imp.id;
    } else {
      const prog = actor.items.get(o.programId);
      if (!prog || !usablePrograms(actor).includes(prog)) return ui.notifications.warn("That utility isn't loaded and usable any more.");
      const offense = offenseOf(prog);
      if (offense) {
        if (target.type !== "character") return ui.notifications.warn(`${prog.name} attacks a persona, not IC.`);
        dice = programRating(prog);
        effect = { effect: "attribute", attr: OFFENSE_ATTRIBUTE[offense], floor: 0, rating: programRating(prog), effectName: prog.name };
      } else {
        level = prog.system.damageLevel || o.level;
        if (!level) return ui.notifications.warn(`${prog.name} has no Damage Level: pick one (VR2.0 p.98).`);
        if (!prog.system.damageLevel && prog.isOwner) await prog.update({ "system.damageLevel": level });
        dice = power = programRating(prog);
      }
    }
    tnContext = { ...skillTnContext("computer"), kind: "attack" };
    tn += actor.system.vr2Deck?.deathwormTN ?? 0;   // deathworms in the deck (p.44)
  }
  // Party IC (p.52): its members attack at +N; a decker hits a member at +N unless with an area-effect utility.
  if (isIC) tn += Y.partyOf(actor);
  else if (target.type === "ic" && !o.area) tn += Y.partyOf(target);
  if (ms.pos && o.position === "power" && power != null) power += ms.pos;
  else if (ms.pos) tn -= ms.pos;
  tn = Math.max(2, tn);
  const attackerSession0 = sessionKey(actor);
  const res = await actor.rollSuccessTest(Math.max(0, dice), tn, {
    label: RL("MatrixAttack", { what: effect.effect ? effect.effectName : `${power}${level}`, tn, code: codeLabel(code), status: o.status }),
    poolDice: !isIC && o.hacking ? { hacking: o.hacking } : undefined,
    karmaDice: o.karmaDice ?? 0, miscDice: o.miscDice, miscLabel: o.miscLabel, tnContext
  });
  if (!res) return;
  // An IC (or the construct program) that crashed or rebooted while the dice rolled doesn't attack.
  if (isIC && (Y.icKeyOf(actor, prof.comp) !== icKey0 || (actor.system.conditionMonitor?.value ?? 0) >= MATRIX_MONITOR_MAX
    || (Y.isConstruct(actor) && !Y.compAvailable(actor, prof.comp, undefined, { budget: false })))) {
    ui.notifications.warn(`${actor.name} crashed during its attack roll: the attack is lost.`);
    return;
  }
  // Rolled = committed: the position bonus was "the next attack", a parry lasts "until the
  // next attack by the opposing icon" (p.122), an improvised attack is a one-shot (p.123).
  await spendAttackState(actor, ms, usedBuild);
  await commitAction(actor, startedBuild);
  // Posted even at 0 successes (inert), so Karma can still bring it to life.
  const state = { ruleset: "vr2", attackerUuid: actor.uuid, attackerName: actor.name, attackerType: actor.type,
    icType: isIC ? actor.system.icType : "", icClass: isIC ? prof.icClass : "", program: isIC ? prof.program : "",
    targetUuid: target.uuid, targetName: target.name, targetSession: sessionKey(target), attackerSession: attackerSession0,
    targetArmorDefense: target.type === "ic" && !!target.system.armorDefense, attackerComputer,
    ...hostSnap(host), status: o.status, power, level, ...effect,
    successes: res.successes, testMessageId: res.testMessageId, resolved: false,
    icKey: isIC ? icKey0 : "", targetConn: target.system?.vr2Conn?.n ?? null,
    ...(isIC ? { icRating, threat, comp: prof.comp, psychotropic: prof.psychotropic, expert: Y.expertOf(actor),
      cascade: cascade0 ? { ...cascade, on: true } : null, cascade0 } : { area: !!o.area }) };
  const card = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderVR2MatrixCard(state),
    flags: { sr2e: { matrix: state } } });
  // Part 3: an IC's attack on a decker on the connection log is ADMITTED by the sequencer
  // (refused while the decker is leaving, unless it's a locking IC's last attack; plan §3a).
  if (isIC && state.targetConn != null) {
    const exit = Y.foldOf(target).live?.exit;
    await Y.request(target, "attack", { card: card.id, icKey: state.icKey, cls: state.icClass || state.icType, program: state.program,
      lastAttack: !!exit && (exit.locks ?? []).includes(state.icKey), cascade0, successes: res.successes });
  }
  return res;
}

/** After an attack is rolled: spend the maneuver bonuses and a used improvised attack. */
async function spendAttackState(actor, ms, usedBuild) {
  const mv = actor.flags?.sr2e?.vr2Maneuvers ?? {};
  const update = {};
  if (mv.position) update["flags.sr2e.vr2Maneuvers.-=position"] = null;
  if (mv.parriedBy && Object.keys(mv.parriedBy).length) update["flags.sr2e.vr2Maneuvers.-=parriedBy"] = null;
  if (ms.expired) update[`flags.sr2e.vr2Maneuvers.lostSight.-=${ms.k}`] = null;
  if (Object.keys(update).length) await actor.update(update);
  if (usedBuild) await sessionQueue(actor, async () => {
    if (liveSession(actor)?.improvised?.id === usedBuild) await actor.update({ "flags.sr2e.vr2Session.-=improvised": null });
  });
}

/** Fill Matrix boxes in a per-actor queue that re-reads the live value. A crash is the crossing (§2). */
export function matrixDamage(actor, boxes) {
  return enqueueAttack(`matrixmon:${actor.uuid}`, async () => {
    const path = actor.type === "ic" ? "system.conditionMonitor.value" : "system.matrixPersona.condition.value";
    const before = foundry.utils.getProperty(actor, path) ?? 0;
    const after = Math.min(MATRIX_MONITOR_MAX, before + boxes);
    const update = { [path]: after };
    // A crashed IC is a new incarnation: maneuver records against the old one lapse.
    if (actor.type === "ic" && before < MATRIX_MONITOR_MAX && after >= MATRIX_MONITOR_MAX) {
      update["system.generation"] = (actor.system.generation ?? 0) + 1;
    }
    await actor.update(update);
    return { before, after };
  });
}

/** Offer the defender's Shield (p.100): rolled against the attacker's Computer (IC: Security Value). */
async function askShield(defender, st) {
  const item = defender.type === "character" ? bestUtility(defender, "shield") : null;
  if (!item) return null;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: `Shield — ${defender.name}` },
    content: `<p>Use ${esc(item.name)} (rating ${programRating(item)})? It loses a point whether it works or not (VR2.0 p.100).</p>`,
    rejectClose: false });
  if (!ok) return null;
  const live = defender.items.get(item.id);
  if (!live || !usablePrograms(defender).includes(live)) return null;   // unloaded or crashed meanwhile
  const ref = useRef(live);
  const tn = Math.max(2, st.attackerComputer ?? 4);
  const r = await defender.rollSuccessTest(Math.max(0, ref.rating), tn, {
    // A test to avoid damage: no Injury Modifier (core p.112), like the resistance tests.
    label: RL("Shield", { rating: ref.rating, tn }), isResistance: true, closed: true, tnContext: { kind: "other" } });
  return r ? { ref, successes: r.successes, testMessageId: r.testMessageId } : null;
}

/**
 * Resist a VR2.0 Matrix attack card, once (p.124). IC: the card's Security Value dice;
 * a persona: Bod; both against TN = Power (less a loaded Armor utility, or IC armor).
 * Simsense overload for a decker hit by white or gray IC on a hot deck; a crash dumps the
 * decker, unless black IC killed the icon (p.124).
 */
export async function vr2MatrixResist(defender, message) {
  if (RESIST_IN_FLIGHT.has(message.id)) return;
  RESIST_IN_FLIGHT.add(message.id);
  try {
    const live = game.messages.get(message.id);
    const st = live?.flags?.sr2e?.matrix;
    if (!st || isCardResolved(live, "matrix")) return ui.notifications.warn("That attack has already been resisted.");
    if (!defender.isOwner) return ui.notifications.warn(`Only ${defender.name}'s owner or the GM can resist for them.`);
    if (st.targetUuid && defender.uuid !== st.targetUuid && !game.user.isGM) {
      return ui.notifications.warn(`That attack is on ${st.targetName ?? "another icon"}.`);
    }
    const liveAtk = () => { const t = game.messages.get(st.testMessageId)?.flags?.sr2e?.test; return t ? testTotalSuccesses(t) : (st.successes ?? 0); };
    if (liveAtk() <= 0) return ui.notifications.warn("The attack missed: there is nothing to resist.");
    if (st.effect === "attribute") return await resistAttribute(defender, message, st, liveAtk);
    // Part 3: a decker on the connection log resolves through the sequencer (plan §0, §3).
    if (defender.type === "character" && st.targetConn != null && defender.system.vr2Conn) return await resistOnLog(defender, message, st, liveAtk);
    // A persona hit belongs to the connection it hit: a reconnect doesn't take it.
    const sameSession = () => defender.type !== "character" || !st.targetSession || liveSession(defender)?.id === st.targetSession;
    if (!sameSession()) return ui.notifications.warn("That attack hit an earlier session.");
    let dice, tn, what, armorRef = null;
    if (defender.type === "ic") {
      dice = expertDice(st.securityValue, Y.expertOf(defender)).resist + Y.threatOf(defender); tn = st.power - (st.targetArmorDefense ? 2 : 0);
      what = `host Security Value${st.targetArmorDefense ? ", IC armor" : ""}`;
    } else if (defender.type === "character") {
      armorRef = useRef(bestUtility(defender, "armor"));
      dice = defender.system.matrixPersona?.bod ?? 0; tn = st.power - (armorRef?.rating ?? 0);
      what = `persona Bod${armorRef ? `, ${armorRef.name}` : ""}`;
    } else {
      return ui.notifications.warn("Only IC or a decker persona can resist a Matrix attack.");
    }
    tn = Math.max(2, tn);
    // Which session, captured as the defender resolves; a crash ends only that one.
    const sessionId = defender.type === "character" ? (liveSession(defender)?.id ?? null) : null;
    const shield = await askShield(defender, st);
    const res = await defender.rollSuccessTest(Math.max(0, dice), tn, {
      label: RL("ResistMatrixDamage", { what, tn }), isResistance: true, closed: true, tnContext: { kind: "other" }
    });
    if (!res) return;
    // The attack's CURRENT successes, from its own test (Karma may have moved them).
    const rawAtk = liveAtk();
    if (rawAtk <= 0) return ui.notifications.warn("The attack missed: there is nothing to resist.");
    if (isCardResolved(game.messages.get(message.id), "matrix")) {
      return ui.notifications.warn("That attack was resolved on another device while you rolled.");
    }
    if (!sameSession()) return ui.notifications.warn("That attack hit an earlier session.");
    const atkS = Math.max(0, rawAtk - (shield?.successes ?? 0));
    // Shield reduces the attacker's net successes (p.100): none left, no damage.
    const out = atkS > 0 ? matrixCombatOutcome(st.level, atkS, res.successes) : { level: null, boxes: 0 };
    const closes = [st.testMessageId, res.testMessageId, shield?.testMessageId].filter(Boolean);
    const lines = [];
    if (shield) { lines.push(`Shield: −${shield.successes} attack success${shield.successes === 1 ? "" : "es"}.`); await addWear(defender, shield.ref, message.id); }
    const cls = st.icClass || st.icType;
    let crashed = false, text, crashChoiceFlag = null;
    if (!out.level) {
      text = `${defender.name} resists the Matrix attack.`;
    } else {
      // Committed in the defender's session queue (serialized with session changes), and
      // only while it's still the connection that was hit.
      // Part 3: an IC's crash is stamped by the sequencer (generation and crash fact in ONE
      // update), so traces and traps can order it (PLAN-vr2-part3 §0, R7 #3).
      const Y = await import("./vr2ic.mjs");
      const hit = defender.type === "character"
        ? await sessionQueue(defender, () => sameSession() ? matrixDamage(defender, out.boxes) : null)
        : (Y.isSequencer() ? await Y.sequencer(() => Y.icDamage(defender, out.boxes, message.id)) : await matrixDamage(defender, out.boxes));
      if (!hit) return ui.notifications.warn("That attack hit an earlier session: nothing applied.");
      const { before, after } = hit;
      crashed = before < MATRIX_MONITOR_MAX && after >= MATRIX_MONITOR_MAX;
      text = `${defender.name} takes ${LEVEL_NAMES[out.level]} Matrix damage: ${out.boxes} box${out.boxes === 1 ? "" : "es"} (${after}/${MATRIX_MONITOR_MAX}).`;
      // The Armor utility loses a point each time it fails to absorb a hit completely (p.99).
      if (armorRef) { await addWear(defender, armorRef, message.id); lines.push(`${armorRef.name} loses a point.`); }
      const deck = defender.system.cyberdeck ?? {};
      if (defender.type === "character" && ["white", "gray"].includes(cls) && (deck.deckMode ?? "hot") === "hot") {
        if (out.level === "D") {
          crashed = true;
          lines.push("Deadly damage from white or gray IC on a hot deck: simsense overload crashes the persona (VR2.0 p.124).");
        } else {
          const otn = Math.max(2, simsenseOverloadTN(out.level) + (deck.dniOnly ? 2 : 0) - (deck.iccm ? 2 : 0));
          const ov = await defender.rollSuccessTest(Math.max(0, defender.system.willpower?.value ?? 0), otn, {
            label: RL("SimsenseOverload", { tn: otn }), isResistance: true, closed: true, tnContext: { kind: "other" }
          });
          if (ov?.testMessageId) closes.push(ov.testMessageId);
          if ((ov?.successes ?? 0) > 0) lines.push("The decker shrugs off the simsense overload.");
          else { await commitDamage(defender, "stun", 1); lines.push("Simsense overload: 1 box of Stun (VR2.0 p.124)."); }
        }
      }
      if (crashed && defender.type === "ic") {
        lines.push("The IC crashes, out of the fight.");
        if (st.attackerType === "character" && st.attackerSession) {
          crashChoiceFlag = { cardId: message.id, deckerUuid: st.attackerUuid, sessionId: st.attackerSession,
            icUuid: defender.uuid, icName: defender.name,
            // A construct's crash tally: its highest program rating (book silent; part 4b decision).
            rating: Y.isConstruct(defender) ? Math.max(0, ...defender.system.construct.components.map(c => c.rating ?? 0)) : (defender.system.rating ?? 0) };
        }
      } else if (crashed && cls === "black") {
        lines.push(`${defender.name}'s icon is down, but black IC doesn't disconnect the decker: the connection stays, and the IC's rating is +2 while the icon is down (VR2.0 p.48, p.124).`);
      } else if (crashed) {
        lines.push(`${defender.name}'s persona crashes: dumped from the Matrix.`);
      }
    }
    const choice = crashChoiceFlag ? `<div class="sr2e-karma-actions">
        <button type="button" class="sr2e-vr2-crashchoice" data-choice="suppress" title="−1 Detection Factor while ${esc(st.attackerName)} stays on this system (VR2.0 p.40)">Suppress</button>
        <button type="button" class="sr2e-vr2-crashchoice" data-choice="register" title="+${crashChoiceFlag.rating} to ${esc(st.attackerName)}'s security tally (p.40)">Let it register (+${crashChoiceFlag.rating})</button></div>` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
        <br><em>${plural(atkS, "attack success")} vs ${plural(res.successes, "resistance success")}.</em>
        ${lines.map(l => `<br>${esc(l)}`).join("")}${choice}</div>`,
      flags: { sr2e: { resolves: message.id, closesTests: closes, matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}`,
        ...(crashChoiceFlag ? { vr2Crash: crashChoiceFlag } : {}) } }
    });
    if (crashed && defender.type === "character" && cls !== "black") {
      await vr2LeaveMatrix(defender, { crash: { securityCode: st.securityCode, securityValue: st.securityValue,
        hostName: st.hostName, sessionId } });
    }
    return res;
  } finally { RESIST_IN_FLIGHT.delete(message.id); }
}

/**
 * Part 3: the defender ROLLS (Shield, resistance, simsense overload); the sequencer APPLIES.
 * Black IC: the attack is frozen first, then the icon and the meat resist separately.
 */
async function resistOnLog(defender, message, st, liveAtk) {
  const Y = await import("./vr2ic.mjs");
  if (defender.system.vr2Conn?.n !== st.targetConn) return ui.notifications.warn("That attack hit an earlier connection.");
  const settle = async (pred, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (pred()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
  const recs = () => Y.recordsOf(defender);
  if (!await settle(() => recs().some(e => e.type === "admit" && e.card === message.id), 4000)) {
    return ui.notifications.warn("That attack isn't admitted yet (a GM must be online), or was refused.");
  }
  if (Y.blackKind(st.program)) {
    const { recordEvent } = await import("./claims.mjs");
    const card = message.id;
    const hitOf = () => recs().find(e => e.type === "hit" && e.card === card);
    const endOf = () => recs().find(e => e.type === "ack" && e.target === `attack:${card}`);
    // Part 4b R10: Shield works against black IC too (p.100). One durable decision per card (the first
    // record wins; a client that loses the race uses the winner's); the GM's sequencer applies the wear.
    if (!hitOf() && !endOf()) {
      if (!Y.shieldOf(defender, card)) {
        let rec = { successes: 0, none: true };
        if (bestUtility(defender, "shield")) {
          const sh = await askShield(defender, st);
          rec = sh ? { successes: sh.successes, itemId: sh.ref.itemId, loadGen: sh.ref.loadGen } : { successes: 0, declined: true };
        }
        await recordEvent(defender, `vr2:shield:${card}`, { type: "shield", card, ...rec });
      }
      await Y.request(defender, "black", { card, conn: st.targetConn, shieldDecided: true });
    }
    if (!await settle(() => hitOf() || endOf())) return ui.notifications.warn("Waiting for the GM to freeze the black IC's attack.");
    const hit = hitOf();
    if (!hit) return;                                   // the Shield stopped it: the GM's client posted the result
    const has = (side) => recs().some(e => e.type === "res" && e.card === message.id && e.side === side);
    if (!has("icon")) {
      const armor = bestUtility(defender, "armor"), ref = useRef(armor);
      const tn = Math.max(2, hit.rating - (ref?.rating ?? 0)) + (defender.system.vr2Deck?.deathwormTN ?? 0);
      const r = await defender.rollSuccessTest(Math.max(0, defender.system.matrixPersona?.bod ?? 0), tn, {
        label: RL("ResistBlackIcon", { ref: ref ? `, ${ref.name}` : "", tn }), isResistance: true, closed: true, tnContext: { kind: "other" } });
      if (!r) return;
      await recordEvent(defender, `vr2:res:${message.id}:icon`, { type: "res", card: message.id, side: "icon", successes: r.successes, tn });
      if (ref) await addWear(defender, ref, message.id);
    }
    if (!has("meat")) {
      const willpower = hit.kind !== "lethal";
      const tn = Math.max(2, hit.rating - (hit.hardening ?? 0));
      const dice = willpower ? (defender.system.willpower?.value ?? 0) : (defender.system.body?.value ?? 0);
      // Karma Pool yes, Hacking Pool no (p.48): an ordinary resistance test, no pools offered.
      const r = await defender.rollSuccessTest(Math.max(0, dice), tn, {
        label: RL("ResistBlackMeat", { attr: AL(willpower ? "willpower" : "body"), tn }), isResistance: true, tnContext: { kind: "other" } });
      if (!r) return;
      await recordEvent(defender, `vr2:res:${message.id}:meat`, { type: "res", card: message.id, side: "meat", successes: r.successes, tn, testMessageId: r.testMessageId });
    }
    return;
  }
  // Non-black: Shield, resistance and overload rolled here; one apply request.
  let dice, tn, what, armorRef = null;
  armorRef = useRef(bestUtility(defender, "armor"));
  dice = defender.system.matrixPersona?.bod ?? 0; tn = Math.max(2, st.power - (armorRef?.rating ?? 0)) + (defender.system.vr2Deck?.deathwormTN ?? 0);
  what = `persona Bod${armorRef ? `, ${armorRef.name}` : ""}`;
  const shield = await askShield(defender, st);
  const res = await defender.rollSuccessTest(Math.max(0, dice), tn, {
    label: RL("ResistMatrixDamage", { what, tn }), isResistance: true, closed: true, tnContext: { kind: "other" } });
  if (!res) return;
  const atkS = Math.max(0, liveAtk() - (shield?.successes ?? 0));
  const out = atkS > 0 ? matrixCombatOutcome(st.level, atkS, res.successes) : { level: null, boxes: 0 };   // Shield took them all (p.100)
  const lines = [];
  if (shield) { lines.push(`Shield: −${shield.successes} attack success${shield.successes === 1 ? "" : "es"}.`); await addWear(defender, shield.ref, message.id); }
  let overloadStun = 0, overloadCrash = false;
  const cls = st.icClass || st.icType, deck = defender.system.cyberdeck ?? {};
  if (out.level && armorRef) { await addWear(defender, armorRef, message.id); lines.push(`${armorRef.name} loses a point.`); }
  if (out.level && ["white", "gray"].includes(cls) && (deck.deckMode ?? "hot") === "hot") {
    if (out.level === "D") { overloadCrash = true; lines.push("Deadly damage from white or gray IC on a hot deck: simsense overload crashes the persona (VR2.0 p.124)."); }
    else {
      const otn = Math.max(2, simsenseOverloadTN(out.level) + (deck.dniOnly ? 2 : 0) - (deck.iccm ? 2 : 0));
      const ov = await defender.rollSuccessTest(Math.max(0, defender.system.willpower?.value ?? 0), otn, {
        label: RL("SimsenseOverload", { tn: otn }), isResistance: true, closed: true, tnContext: { kind: "other" } });
      if ((ov?.successes ?? 0) > 0) lines.push("The decker shrugs off the simsense overload.");
      else { overloadStun = 1; lines.push("Simsense overload: 1 box of Stun (VR2.0 p.124)."); }
    }
  }
  lines.unshift(`${plural(atkS, "attack success")} vs ${plural(res.successes, "resistance success")}.`);
  await Y.request(defender, "apply", { card: message.id, conn: st.targetConn, boxes: out.boxes, level: out.level,
    overloadStun, overloadCrash, program: st.program, rating: st.icRating ?? st.power, threat: st.threat ?? 0, lines });
  return res;
}

/**
 * An attribute attack (crippler p.41; poison/restrict/reveal p.98–99): the persona tests
 * the attribute against the program's rating; 1 point per 2 net successes, as it actually
 * lands, committed once per card in the defender's session (PLAN-vr2-part2 §5, §9).
 */
async function resistAttribute(defender, message, st, liveAtk) {
  if (defender.type !== "character") return ui.notifications.warn("Only a decker's persona can be attacked that way.");
  const s0 = liveSession(defender);
  if (!s0) return ui.notifications.warn(`${defender.name} isn't in a VR2.0 session.`);
  if (st.targetSession && s0.id !== st.targetSession) return ui.notifications.warn("That attack hit an earlier session.");
  // Part 4a §6a: an IC attack on the connection log is resisted only once the GM admitted it.
  if (st.attackerType === "ic" && st.targetConn != null) {
    const Y = await import("./vr2ic.mjs");
    if (defender.system.vr2Conn?.n !== st.targetConn) return ui.notifications.warn("That attack hit an earlier connection.");
    const t0 = Date.now();
    while (!Y.recordsOf(defender).some(e => e.type === "admit" && e.card === message.id) && Date.now() - t0 < 4000) await new Promise(r => setTimeout(r, 100));
    if (!Y.recordsOf(defender).some(e => e.type === "admit" && e.card === message.id)) {
      return ui.notifications.warn("That attack isn't admitted yet (a GM must be online), or was refused.");
    }
  }
  const value = defender.system.matrixPersona?.[st.attr] ?? 0;
  const shield = await askShield(defender, st);
  const tn = Math.max(2, st.rating ?? 2) + (defender.system.vr2Deck?.deathwormTN ?? 0);   // deathworms (p.44)
  const res = await defender.rollSuccessTest(Math.max(0, value), tn, {
    label: RL("ResistEffect", { effect: st.effectName, attr: ATTR_LABEL[st.attr], tn }), isResistance: true, closed: true, tnContext: { kind: "other" } });
  if (!res) return;
  const atkS = liveAtk();
  if (atkS <= 0) return ui.notifications.warn("The attack missed: there is nothing to resist.");
  if (isCardResolved(game.messages.get(message.id), "matrix")) {
    return ui.notifications.warn("That attack was resolved on another device while you rolled.");
  }
  const defS = res.successes + (shield?.successes ?? 0);
  const points = Math.max(0, Math.floor((atkS - defS) / 2));
  const lost = await sessionQueue(defender, async () => {
    const s = liveSession(defender);
    if (!s || s.id !== s0.id) return null;
    const prior = s.iconDamage?.[message.id];
    if (prior) return prior.lost;                         // an immutable receipt: a retry changes nothing
    // Measured before an improvised sacrifice, which derivation applies last.
    const mp = defender.system.matrixPersona ?? {};
    const v = mp.preImprovised?.[st.attr] ?? mp[st.attr] ?? 0;
    const l = attributeLoss(v, points, st.floor ?? 0);
    const seq = (s.damageSeq ?? 0) + 1;
    // conn/rating/program let the sequencer re-send a lost `resolved` request (part 4a §6a).
    // An IC's attack on the log also leaves a pending receipt OUTSIDE the session, in the same update, so a
    // lost `resolved` request is re-sent however many host switches follow (part 4a §6a).
    const pending = st.attackerType === "ic" && st.targetConn != null
      ? { [`flags.sr2e.vr2AttrPending.${message.id}`]: { conn: st.targetConn, lost: l, attr: st.attr, rating: st.rating ?? 0, program: st.program ?? "", threat: st.threat ?? 0 } } : {};
    await defender.update({ [`flags.sr2e.vr2Session.iconDamage.${message.id}`]: { attr: st.attr, lost: l, seq, source: st.effectName },
      "flags.sr2e.vr2Session.damageSeq": seq, ...pending });
    return l;
  });
  if (shield) await addWear(defender, shield.ref, message.id);
  // Part 3: the admitted attack is resolved; a ripper's permanent chip test follows (p.43).
  if (lost != null && st.targetConn != null && defender.system.vr2Conn?.n === st.targetConn) {
    const Y = await import("./vr2ic.mjs");
    await Y.request(defender, "resolved", { card: message.id, conn: st.targetConn, lost, attr: st.attr, rating: st.rating, threat: st.threat ?? 0,
      ripper: String(st.program ?? "").startsWith("ripper-") });
  }
  const text = lost == null ? `${defender.name}'s session changed: nothing applied.`
    : lost > 0 ? `${defender.name}'s ${ATTR_LABEL[st.attr]} drops by ${lost}.` : `${defender.name}'s ${ATTR_LABEL[st.attr]} holds.`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
      <br><em>${plural(atkS, "attack success")} vs ${plural(defS, "success")}${shield ? ` (Shield ${shield.successes})` : ""}.</em></div>`,
    flags: { sr2e: { resolves: message.id, closesTests: [st.testMessageId, res.testMessageId, shield?.testMessageId].filter(Boolean),
      matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}` } }
  });
  return res;
}

// ── Combat maneuvers (p.121–122; PLAN-vr2-part2 §6) ───────────────────────────

const MANEUVERS = { evade: "Evade detection", parry: "Parry attack", position: "Position attack" };
const MANEUVER_IN_FLIGHT = new Set();

/** ONE client writes an actor's maneuver record: its lowest-id active non-GM owner, else the active GM. */
function designatedWriter(actor) {
  const owners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id));
  return owners.length ? owners[0].isSelf : game.user === game.users.activeGM;
}

/** The Oppose card for a decker opponent. */
export function renderManeuverCard(st) {
  const button = st.resolved ? "" : `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-vr2-oppose-btn"
    title="${esc(st.opponentName)} rolls Sensor against TN ${st.oppTN}">Oppose (Sensor, TN ${st.oppTN})</button></div>`;
  return `<div class="sr2e-damage-result"><strong>${esc(st.maneuvererName)}: ${esc(MANEUVERS[st.kind])} against ${esc(st.opponentName)}</strong>
    — ${plural(st.mS, "success")}.
    <br><em>${esc(st.opponentName)} opposes with Sensor against TN ${st.oppTN} (VR2.0 p.122).</em>${st.resolution ?? ""}${button}</div>`;
}

/** Perform a combat maneuver (a Simple Action) against the targeted icon. */
export async function vr2Maneuver(actor) {
  { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  const target = firstTarget()?.actor ?? null;
  if (!target || target.uuid === actor.uuid) return ui.notifications.warn("Target the icon you maneuver against first.");
  if (!["ic", "character"].includes(target.type)) return ui.notifications.warn("Only IC or a decker's persona can maneuver.");
  if (actor.type === "character" && !liveSession(actor)) return ui.notifications.warn(`${actor.name} isn't jacked in.`);
  const icSide = actor.type === "ic" ? actor : target.type === "ic" ? target : null;
  const hosts = game.actors.filter(a => a.type === "host");
  if (icSide && !hosts.length) return ui.notifications.warn("IC maneuvers on its host's Security Value: create a Host actor first.");
  const preHost = icSide ? sync(icSide.system.hostUuid) : null;
  let pick = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Combat maneuver — ${actor.name} vs ${target.name}` }, rejectClose: false,
    content: `<div><div class="form-group"><label>Maneuver:</label><select name="kind">
      ${Object.entries(MANEUVERS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
      ${icSide ? `<div class="form-group"><label>Host:</label><select name="host">${hostOptions(hosts, preHost)}</select></div>` : ""}
      <p style="font-size:11px;color:#aaa1c0;">Evasion against the opponent's Sensor, opposed (VR2.0 p.122). Cloak lowers your TN; their Lock-On lowers theirs.</p></div>`,
    buttons: [
      { action: "go", label: "SR2E.Dialog.Roll", default: true, callback: (ev, b) => {
        pick = { kind: b.form.elements.kind.value, hostId: b.form.elements.host?.value ?? "" }; } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !pick) return;
  const host = icSide ? game.actors.get(pick.hostId) : null;
  const sv = host?.system.securityValue ?? 0;
  const evasion = actor.type === "ic" ? sv : (actor.system.matrixPersona?.evasion ?? 0);
  const sensor = target.type === "ic" ? sv : (target.system.matrixPersona?.sensor ?? 0);
  const cloak = actor.type === "character" ? loadedUtility(actor, "cloak") : 0;
  const lockOn = target.type === "character" ? loadedUtility(target, "lock") : 0;
  const tns = maneuverTNs({ evasion, sensor, cloak, lockOn });
  const startedBuild = liveSession(actor)?.improvised?.id ?? null;
  // + a construct's threat dice on its maneuver tests (p.52; part 4b §5).
  const res = await actor.rollSuccessTest(Math.max(0, evasion) + (actor.type === "ic" ? Y.threatOf(actor) : 0), tns.maneuverer, {
    label: RL("Maneuver", { maneuver: MANEUVERS[pick.kind], stat: RL(actor.type === "ic" ? "SecurityValue" : "Evasion"), tn: tns.maneuverer }),
    closed: true, tnContext: { kind: "other" } });
  if (!res) return;
  await commitAction(actor, startedBuild);
  const st = { kind: pick.kind, maneuvererUuid: actor.uuid, maneuvererName: actor.name, opponentUuid: target.uuid,
    opponentName: target.name, mS: res.successes, oppTN: tns.opponent, mSession: sessionKey(actor),
    oSession: sessionKey(target), testMessageId: res.testMessageId };
  if (target.type === "ic") {
    const or = await SR2ESuccessRoll.successTest(sv + Y.threatOf(target), tns.opponent);
    return postManeuverResult(st, or.successes, { rolls: or.rolls });
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderManeuverCard(st),
    flags: { sr2e: { vr2Maneuver: { ...st, resolved: false } } } });
  return res;
}

/** The decker opponent's Sensor test, once per card. */
export async function opposeManeuver(message) {
  if (MANEUVER_IN_FLIGHT.has(message.id)) return;
  MANEUVER_IN_FLIGHT.add(message.id);
  try {
    const live = game.messages.get(message.id);
    const st = live?.flags?.sr2e?.vr2Maneuver;
    if (!st || isCardResolved(live, "vr2Maneuver")) return ui.notifications.warn("That maneuver has already been opposed.");
    const opp = sync(st.opponentUuid);
    if (!opp?.isOwner) return ui.notifications.warn(`Only ${st.opponentName}'s owner or the GM can oppose.`);
    const res = await opp.rollSuccessTest(Math.max(0, opp.system.matrixPersona?.sensor ?? 0), st.oppTN, {
      label: RL("OpposeManeuver", { maneuver: MANEUVERS[st.kind], tn: st.oppTN }), closed: true, tnContext: { kind: "other" } });
    if (!res) return;
    if (isCardResolved(game.messages.get(message.id), "vr2Maneuver")) return ui.notifications.warn("Opposed on another device meanwhile.");
    return postManeuverResult(st, res.successes, { resolves: message.id, oppTestId: res.testMessageId });
  } finally { MANEUVER_IN_FLIGHT.delete(message.id); }
}

/** Post a maneuver's outcome; the records ride on it for the designated writers to apply. */
async function postManeuverResult(st, oS, { rolls = [], resolves = null, oppTestId = null } = {}) {
  const out = maneuverOutcome(st.kind, st.mS, oS);
  const kM = keyOf(st.maneuvererUuid), kO = keyOf(st.opponentUuid);
  const writes = [];
  let text;
  if (!out) {
    text = `${st.maneuvererName}'s ${MANEUVERS[st.kind].toLowerCase()} fails.`;
  } else if (st.kind === "evade") {
    const combat = game.combat;
    const observer = sync(st.opponentUuid);
    writes.push({ actorUuid: st.opponentUuid, set: {
      [`flags.sr2e.vr2Maneuvers.lostSight.${kM}`]: { turns: out.net, tallyAtStart: liveSession(sync(st.maneuvererUuid))?.tally ?? 0,
        combatId: combat?.id ?? "", roundAtStart: combat?.round ?? 0, mySession: st.oSession, theirSession: st.mSession,
        observer: observer?.type === "ic" ? "ic" : "decker" },
      [`flags.sr2e.vr2Maneuvers.parriedBy.-=${kM}`]: null } });
    writes.push({ actorUuid: st.maneuvererUuid, set: { [`flags.sr2e.vr2Maneuvers.parriedBy.-=${kO}`]: null } });
    text = observer?.type === "ic"
      ? `${st.maneuvererName} evades ${st.opponentName} for ${out.net} Combat Turn${out.net === 1 ? "" : "s"} (fewer as the tally rises).`
      : `${st.maneuvererName} evades ${st.opponentName}, who must Locate Decker or Analyze Icon to find them again.`;
  } else if (st.kind === "parry") {
    writes.push({ actorUuid: st.opponentUuid, set: { [`flags.sr2e.vr2Maneuvers.parriedBy.${kM}`]: { net: out.net,
      mySession: st.oSession, theirSession: st.mSession } } });
    text = `${st.maneuvererName} parries: ${st.opponentName}'s attacks on them are +${out.net} TN until their next attack.`;
  } else {
    const winM = out.beneficiary === "maneuverer";
    writes.push({ actorUuid: winM ? st.maneuvererUuid : st.opponentUuid, set: { "flags.sr2e.vr2Maneuvers.position": {
      vs: winM ? st.opponentUuid : st.maneuvererUuid, net: out.net,
      mySession: winM ? st.mSession : st.oSession, theirSession: winM ? st.oSession : st.mSession } } });
    text = `${winM ? st.maneuvererName : st.opponentName} wins the position: −${out.net} TN or +${out.net} Power on their next attack.`;
  }
  await ChatMessage.create({ rolls, content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
      <br><em>${plural(st.mS, "success")} against ${plural(oS, "success")} (VR2.0 p.122).</em></div>`,
    flags: { sr2e: { ...(resolves ? { resolves } : {}), closesTests: [st.testMessageId, oppTestId].filter(Boolean),
      vr2ManeuverResolution: `<br><strong>Resolved:</strong> ${esc(text)}`,
      vr2ManeuverResult: { resultId: foundry.utils.randomID(), writes, maneuvererUuid: st.maneuvererUuid,
        opponentUuid: st.opponentUuid, mSession: st.mSession, oSession: st.oSession } } } });
}

/** Apply a maneuver outcome's records, once per actor (an `applied` receipt in the same update). */
export async function applyManeuverResult(msg) {
  const r = msg?.flags?.sr2e?.vr2ManeuverResult;
  if (!r?.writes?.length) return;
  // Applied only while both icons are still the connections that maneuvered, so a late
  // outcome can't overwrite a newer, valid record.
  const sessionsHold = () => r.mSession == null
    || (sessionKey(sync(r.maneuvererUuid)) === r.mSession && sessionKey(sync(r.opponentUuid)) === r.oSession);
  if (!sessionsHold()) return;
  for (const w of r.writes) {
    const actor = sync(w.actorUuid);
    if (!actor || !designatedWriter(actor)) continue;
    const applied = () => !!actor.flags?.sr2e?.vr2Maneuvers?.applied?.[r.resultId];
    if (applied()) continue;
    // One write per result even across one user's devices (docs/PLAN-same-user-writers.md
    // §5); re-validated after the claim's round-trip.
    if (!(await once(actor, `maneuver.${r.resultId}`)) || applied() || !sessionsHold()) continue;
    await actor.update({ ...w.set, [`flags.sr2e.vr2Maneuvers.applied.${r.resultId}`]: true });
    await pruneMarkers(actor);
  }
}
Hooks.on("createChatMessage", (msg) => { applyManeuverResult(msg).catch(err => console.error("SR2E | maneuver result", err)); });

/**
 * Find an evader again (after a successful Analyze Icon / Locate Decker): the TARGETED
 * icon only. With nothing targeted, the GM may clear every record (an explicit call).
 */
export function vr2Redetect(actor) {
  const target = firstTarget()?.actor ?? null;
  if (target) return actor.update({ [`flags.sr2e.vr2Maneuvers.lostSight.-=${keyOf(target.uuid)}`]: null });
  if (!game.user.isGM) return ui.notifications.warn("Target the icon you found again.");
  return actor.update({ "flags.sr2e.vr2Maneuvers.-=lostSight": null });
}

// ── Improvised attacks (p.123; PLAN-vr2-part2 §7) ─────────────────────────────

/** Build a one-shot attack program from Evasion and Bod points (a Simple Action). */
export async function vr2BuildImprovised(actor) {
  { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  const s = liveSession(actor);
  if (!s) return ui.notifications.warn(`${actor.name} isn't jacked in.`);
  if (s.improvised) return ui.notifications.warn("An improvised attack is already built: use it first (it's a one-shot).");
  const mpcp = actor.system.cyberdeck?.mpcp ?? 0;
  const bod = actor.system.matrixPersona?.bod ?? 0, evasion = actor.system.matrixPersona?.evasion ?? 0;
  let pick = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Improvised attack — ${actor.name}` }, rejectClose: false,
    content: `<div><p>Points from Evasion and Bod become the attack's Power (at most MPCP ${mpcp}). They stay down until
      the attack is used. Then a Computer test against TN = Power: 1 success Light, 2 Moderate, 3 Serious, 4+ Deadly (VR2.0 p.123).</p>
      <div class="form-group"><label>From Bod <span>(${bod})</span>:</label><input type="number" name="bod" value="0" min="0" max="${bod}" style="width:52px;text-align:center;"></div>
      <div class="form-group"><label>From Evasion <span>(${evasion})</span>:</label><input type="number" name="evasion" value="0" min="0" max="${evasion}" style="width:52px;text-align:center;"></div></div>`,
    buttons: [
      { action: "go", label: "SR2E.Dialog.Roll", default: true, callback: (ev, b) => {
        pick = { bod: parseInt(b.form.elements.bod.value) || 0, evasion: parseInt(b.form.elements.evasion.value) || 0 }; } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !pick) return;
  const power = pick.bod + pick.evasion;
  if (pick.bod < 0 || pick.evasion < 0 || pick.bod > bod || pick.evasion > evasion || power < 1 || power > mpcp) {
    return ui.notifications.warn(`Take 1 to ${mpcp} points in all, no more than each rating has.`);
  }
  const computer = computerOf(actor);
  const res = await actor.rollSuccessTest(computer > 0 ? computer : (actor.system.intelligence?.value ?? 0),
    power + (computer > 0 ? 0 : 4), {
      label: RL("Improvised", { tn: power, untrained: computer > 0 ? "" : RL("UntrainedTag") }),
      closed: true, tnContext: skillTnContext("computer") });
  if (!res) return;
  const level = improvisedLevel(res.successes);
  const built = await sessionQueue(actor, async () => {
    const live = liveSession(actor);
    if (live?.id !== s.id || live.improvised) return false;
    // Re-checked live: an attribute attack while the dialog or the roll was open.
    const now = actor.system.matrixPersona?.preImprovised ?? actor.system.matrixPersona ?? {};
    if (pick.bod > (now.bod ?? 0) || pick.evasion > (now.evasion ?? 0) || power > (actor.system.cyberdeck?.mpcp ?? 0)) {
      ui.notifications.warn("The persona changed while you built it: the points aren't there any more.");
      return false;
    }
    await actor.update({ "flags.sr2e.vr2Session.improvised": { id: foundry.utils.randomID(), bod: pick.bod, evasion: pick.evasion, power, level } });
    return true;
  });
  if (!built) return;
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)}
    ${level ? `writes an attack program on the fly: Power ${power}, ${LEVEL_NAMES[level]}. It's a one-shot.` : "fails to finish the attack program; the points stay spent until their next action."}
    (Bod −${pick.bod}, Evasion −${pick.evasion}; VR2.0 p.123)</div>` });
  return res;
}

// ── Medic and Swap Memory (p.99–100; PLAN-vr2-part2 §4, §8) ───────────────────

/** Medic (a Complex Action): rating dice against 4/5/6 by the icon's wound level; a box per success. */
export async function vr2Medic(actor, item) {
  { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  if (!/^medic/i.test(item?.name ?? "")) return ui.notifications.warn("That isn't a Medic utility.");
  if (!usablePrograms(actor).includes(item)) return ui.notifications.warn(`${item.name} isn't usable: load it, or Swap Memory a fresh copy.`);
  const boxes = actor.system.matrixPersona?.condition?.value ?? 0;
  const tn = medicTN(boxes);
  if (!tn) return ui.notifications.info(`${actor.name}'s icon has no damage.`);
  const ref = useRef(item);
  const startedBuild = liveSession(actor)?.improvised?.id ?? null;
  const res = await actor.rollSuccessTest(Math.max(0, ref.rating), tn, {
    label: RL("NameTN", { name: item.name, tn }), closed: true, tnContext: { kind: "other" } });
  if (!res) return;
  await commitAction(actor, startedBuild);
  const repaired = await enqueueAttack(`matrixmon:${actor.uuid}`, async () => {
    const v = actor.system.matrixPersona?.condition?.value ?? 0;
    const n = Math.min(v, res.successes);
    if (n > 0) await actor.update({ "system.matrixPersona.condition.value": v - n });
    return n;
  });
  await addWear(actor, ref, res.testMessageId);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(item.name)}
    repairs ${repaired} box${repaired === 1 ? "" : "es"} of ${esc(actor.name)}'s icon, and loses a point (VR2.0 p.100).</div>` });
  return res;
}

/** Swap Memory: reload a fresh copy (worn utilities back to full; a crashed one runs again). */
export async function vr2SwapMemory(actor, item) {
  { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  if (!item || item.type !== "program") return;
  // Tar pit's corruption is in every copy on the deck: only a reload from outside clears it (p.43).
  const key = programKey({ source: item._stats?.compendiumSource ?? item.flags?.core?.sourceId, name: item.name });
  if (actor.system.vr2Deck?.corrupted?.has(key)) return ui.notifications.warn(`${item.name} is corrupted on this deck: reload it from storage after jacking out (VR2.0 p.43).`);
  const startedBuild = liveSession(actor)?.improvised?.id ?? null;
  await enqueueAttack(`program:${item.uuid}`, () => item.update({ "system.loadGen": (item.system.loadGen ?? 0) + 1, "system.crashed": false }));
  await commitAction(actor, startedBuild);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)}
    swaps in a fresh copy of ${esc(item.name)} (rating ${item.system.rating}).</div>` });
}

/** Card buttons (wired from renderChatMessageHTML). */
export function wireVR2Buttons(message, html) {
  html.querySelectorAll?.(".sr2e-vr2-crashchoice").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault(); return crashChoice(message, btn.dataset.choice);
  }));
  html.querySelectorAll?.(".sr2e-vr2-oppose-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault(); return opposeManeuver(message);
  }));
}

/** On load (each client): its own tally events; the GM's sheaf deliveries and maneuver results. */
export async function vr2Ready() {
  if (!isVR2()) return;
  await reconcileTallies();
  for (const m of game.messages ?? []) if (m.flags?.sr2e?.vr2ManeuverResult) await applyManeuverResult(m);
  for (const a of game.actors ?? []) if (a.flags?.sr2e?.vr2SheafPending) await deliverSheaf(a);
}

// ── Leaving the Matrix (p.124) ───────────────────────────────────────────────

/** Part 3: a crash or a voluntary exit as a request; Graceful Logoff is its real System Test. */
async function leaveOnLog(actor, crash) {
  const Y = await import("./vr2ic.mjs");
  const { requestExit } = Y;
  if (crash) return requestExit(actor, { trigger: "dump" });
  // Black IC's grip (p.48): a Complex Action and Willpower (rating) to get out, and it makes one
  // more attack before the link drops; pulling the plug skips the test but not that attack.
  const f = Y.foldOf(actor);
  if (f.live?.exit) return ui.notifications.info(`${actor.name} is already jacking out.`);
  if (f.live?.locks.length) {
    const locks = f.live.locks.map(h => ({ h, ic: Y.icOfKey(h.icKey) })).filter(x => x.ic);
    const ics = locks.map(x => x.ic);
    // PCPIC: Willpower (rating + the wound modifier) instead (p.50). Each lock's frozen IC rating (part 4b R14)
    // + the CURRENT icon-down bonus; a legacy hit uses the live IC.
    const rating = Y.pcpicTN(actor) ?? Math.max(...locks.map(({ h, ic }) => Y.blackRating(ic, actor, h.icRating ?? null)), 0);
    const choice = await foundry.applications.api.DialogV2.wait({ window: { title: `Jack out — ${actor.name}` }, rejectClose: false,
      content: `<p>Black IC (${ics.map(i => esc(i.name)).join(", ")}) has its hooks in ${esc(actor.name)}'s ASIST interface (VR2.0 p.48).
        Jacking out is a Complex Action and a <strong>Willpower (${rating})</strong> test; on a success the IC makes one more attack before the link drops.
        Pulling the plug (a companion, or an ICCM monitor) needs no test, but the IC still gets that attack.</p>`,
      buttons: [{ action: "test", label: `Willpower (${rating})`, default: true }, { action: "plug", label: "Pull the plug" }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
    if (choice === "plug") return requestExit(actor, { trigger: "plug" });
    if (choice !== "test") return;
    const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, rating, { label: RL("JackOutBlack", { rating }), tnContext: { kind: "other" } });
    if (!r) return;
    const { recordEvent } = await import("./claims.mjs");
    const attempt = Y.recordsOf(actor).filter(e => e.type === "gate" && e.n === f.liveN).length + 1;
    const key = `vr2:gate:${f.liveN}:${attempt}`;
    await recordEvent(actor, key, { type: "gate", n: f.liveN, success: r.successes > 0, successes: r.successes });
    if (r.successes <= 0) return ui.notifications.info(`${actor.name} can't break free this time.`);
    return requestExit(actor, { trigger: "gate", gateKey: key });
  }
  const known = sync(liveSession(actor)?.hostUuid) ?? sessionHost(actor);
  const pick = await promptLeave(actor, known);
  if (!pick) return;
  if (!pick.graceful) return requestExit(actor, { trigger: "voluntary" });
  const host = known ?? game.actors.get(pick.hostId);
  if (!host) return ui.notifications.warn("A Graceful Logoff needs a host: create a Host actor (VR2.0 p.114).");
  const res = await vr2SystemTest(actor, host, "gracefulLogoff");
  if (!res) return;
  const st = game.messages.get(res.cardId)?.flags?.sr2e?.vr2SystemTest;
  if (!st || !systemTestVerdict(st.successes, st.hostSuccesses).success) {
    return ui.notifications.info(`${actor.name}'s Graceful Logoff fails: still connected (try again, or jack out with dump shock).`);
  }
  return requestExit(actor, { gracefulCard: res.cardId });
}

async function promptLeave(actor, known) {
  const hosts = known ? [] : game.actors.filter(a => a.type === "host");
  let pick = null;
  const done = (graceful) => (ev, b) => {
    const f = b.form.elements;
    pick = { graceful, hostId: f.host?.value ?? "", securityCode: f.code?.value ?? "",
      securityValue: Math.max(0, parseInt(f.sv?.value) || 0) };
  };
  // No host actor at all: the dump shock still needs a Security Code and Value (p.124).
  const manual = !known && !hosts.length ? `<div class="form-group"><label>Security Code:</label><select name="code">
      ${Object.keys(CONFIG.SR2E.securityCodes).map(k => `<option value="${k}">${esc(codeLabel(k))}</option>`).join("")}</select></div>
    <div class="form-group"><label>Security Value:</label><input type="number" name="sv" value="4" min="0" style="width:52px;text-align:center;"></div>` : "";
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Jack out — ${actor.name}` }, rejectClose: false,
    content: `<div><p>Did ${esc(actor.name)} complete a <strong>Graceful Logoff</strong>? Without one, jacking out
      causes dump shock (VR2.0 p.124).</p>
      ${hosts.length ? `<div class="form-group"><label>Host:</label><select name="host">${hostOptions(hosts, null)}</select></div>` : ""}${manual}</div>`,
    buttons: [
      { action: "graceful", label: "Graceful Logoff", callback: done(true) },
      { action: "dump", label: "Jack out (dump shock)", default: true, callback: done(false) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "graceful" || action === "dump" ? pick : null;
}

/**
 * Leave the Matrix under VR2.0: the ONE path for the sheet toggle, a jackpoint
 * jack-out and a crash. The host is captured before `matrixMode` clears; the session
 * ends (kept as lastSession); dump shock follows unless graceful (or a tortoise).
 * @param {Actor} actor
 * @param {{crash?: {securityCode:string, securityValue:number, hostName:string, sessionId:string|null}}} [opts]
 *   a crash passes the ATTACK card's host snapshot and the session it happened in.
 */
export async function vr2LeaveMatrix(actor, { crash = null } = {}) {
  if (!actor?.isOwner) return;
  // Part 3 (PLAN-vr2-part3 §3a): on the connection log, every way out is an exit REQUEST the
  // sequencer opens; its steps (dump shock included) run there.
  if (actor.system.vr2Conn) return leaveOnLog(actor, crash);
  let graceful = false, host = crash;
  // The connection this exit is for: a dialog left open across a crash and a reconnect
  // must not end the NEW connection.
  const opened = liveSession(actor)?.id ?? null;
  if (!crash) {
    const known = sync(liveSession(actor)?.hostUuid) ?? sessionHost(actor);
    const pick = await promptLeave(actor, known);
    if (!pick) return;
    graceful = pick.graceful;
    const h = known ?? game.actors.get(pick.hostId);
    host = h ? { securityCode: h.system.securityCode, securityValue: h.system.securityValue, hostName: h.name }
      : pick.securityCode ? { securityCode: pick.securityCode, securityValue: pick.securityValue, hostName: "the host" } : null;
  }
  const left = await matrixQueue(actor, async () => {
    // Claimed in the queue: a second jack-out (a double click) finds the decker already out,
    // and a stale dialog finds another connection.
    if (!crash && (!actor.system.matrixMode || (liveSession(actor)?.id ?? null) !== opened)) return false;
    const s = liveSession(actor);
    // A decker who reconnected since the crash keeps the new connection (and still takes the shock).
    const reconnected = crash && s && s.id !== crash.sessionId;
    if (!reconnected) {
      await actor.update({ "system.matrixMode": false });
      await sessionQueue(actor, async () => { const cur = liveSession(actor); if (cur) await replaceSessions(actor, null, cur); });
    }
    return true;
  });
  if (!left) return;
  const deck = actor.system.cyberdeck ?? {};
  const dmg = !graceful && host ? dumpShockDamage(host.securityCode, host.securityValue,
    { coolDeck: deck.deckMode === "cool", iccm: !!deck.iccm, tortoise: deck.deckMode === "tortoise" }) : null;
  const name = esc(actor.name);
  let content;
  if (graceful) content = `<strong>⌁ ${name} logs off gracefully.</strong>`;
  else if (!dmg) content = `<strong>⌁ ${name} jacks out.</strong><br><em>No dump shock${host ? " (tortoise, or fully filtered by a cool deck and ICCM)" : ": no host known"}.</em>`;
  else content = `<strong>⌁ ${name} is ${crash ? "dumped" : "jacked out"} without a Graceful Logoff: dump shock.</strong>
    <br><em>${dmg.power}${dmg.level} Stun from ${esc(host.hostName)} (${esc(codeLabel(host.securityCode))}); resisted with Body, no armour (VR2.0 p.124).</em>
    <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn" data-power="${dmg.power}" data-level="${dmg.level}"
      data-damage-type="stun" data-armor-calc="none" data-target-uuid="${esc(actor.uuid)}">Resist dump shock (${dmg.power}${dmg.level} Stun)</button></div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">${content}</div>` });
}
