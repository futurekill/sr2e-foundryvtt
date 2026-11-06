/**
 * VR2.0 part 6c: command sets (docs/PLAN-vr2-part6-frames.md, "6c in detail"; VR2.0 pp.104–105).
 *
 * A set is durable facts on its HOST, written only by the sequencer (the active GM's client):
 *   cs-open:<id>    {type: "csOpen", id, decker, name, orders, kind, steps, conn, sessionId, upload?}
 *   cs-step:<id>:<n> {type: "csStep", id, n, sub, success, hostSuccesses, card, at}   settled once, frozen
 *   cs-steps:<id>:<k> {type: "csSteps", id, from, steps}                              the GM's step change
 *   cs-mark:<id>    {type: "csMark", id, what}                                         the GM's terminal mark
 * Its state is folded by `csState` (rules/vr2-command-sets.mjs), never stored. A program set's upload is 0.136.0's
 * timed upload (`uploadOpen` with `snapshot.kind: "commandSet"`); the set opens from the completed upload.
 */
import { recordsOf, fact, sequencer, isSequencer, request, addHandlers, freezeSuccesses, hostOffline, vr2ActionGuard } from "./vr2ic.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { liveSession, currentPlace, vr2SystemTest } from "./vr2.mjs";
import { topologyOn, isVR2 } from "./vr2-mode.mjs";
import { csState, csAdmits } from "./rules/vr2-command-sets.mjs";
import { uploadSeconds, uploadTurns } from "./rules/vr2-frames.mjs";
import { systemTestVerdict } from "./rules/sr2e-rules.mjs";
import { GRID_KINDS } from "./rules/vr2-grids.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const SUBS = ["access", "control", "index", "files", "slave"];
const subLabel = (k) => CONFIG.SR2E.vr2Subsystems?.[k] ?? k;

/** The host the decker is ON (topology: his place; else his live session's host). */
function hostHere(actor) {
  const h = topologyOn() ? currentPlace(actor) : sync(liveSession(actor)?.hostUuid);
  return h?.type === "host" && !GRID_KINDS.has(h.system.kind) ? h : null;
}

/** Every set on a host, with its folded state. */
export function setsOn(host, now = game.time.worldTime) {
  const recs = host ? recordsOf(host) : [];
  return recs.filter(e => e.type === "csOpen").map(open => ({ open, host,
    state: csState({ open, now, steps: recs.filter(e => e.type === "csStep" && e.id === open.id),
      changes: recs.filter(e => e.type === "csSteps" && e.id === open.id), marks: recs.filter(e => e.type === "csMark" && e.id === open.id) }) }));
}
/** A decker's sets on every host. */
export const setsOf = (actor) => game.actors.filter(a => a.type === "host").flatMap(h => setsOn(h)).filter(s => s.open.decker === actor.uuid);

// ── The decker ─────────────────────────────────────────────────────────────────

/** Command set… (§3): a simple set opens by request; a program set starts its timed upload. */
export async function commandSetDialog(actor) {
  if (!isVR2() || !actor.system.vr2Conn) return ui.notifications.warn("Leave a command set while you're in the Matrix (VR2.0).");
  { const why = vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }   // code R1 #4
  const host = hostHere(actor);
  if (!host) return ui.notifications.warn("Log on to the host the command set runs on (VR2.0 p.104).");
  const programs = actor.items.filter(i => i.type === "program" && i.system.commandSet);
  const sel = (i) => `<select name="s${i}"><option value="">—</option>${SUBS.map(k => `<option value="${k}" ${i === 0 && k === "control" ? "selected" : ""}>${esc(subLabel(k))}</option>`).join("")}</select>`;
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: `Command set on ${host.name}` }, rejectClose: false,
    content: `<p style="font-size:11px;color:#aaa1c0;">Orders left on the host to run later. Each task is a Subsystem Test the GM names (Control
      when in doubt); Deception lowers each TN. The host's successes against them set how long it runs undetected: 24 ÷ their total
      in hours, 48 if none (VR2.0 p.104–105).</p>
      <div class="form-group"><label>Name:</label><input type="text" name="name" value="Command set"></div>
      <div class="form-group"><label>Orders:</label><input type="text" name="orders" placeholder="e.g. open the loading-dock maglock at 02:00"></div>
      <div class="form-group"><label>Tasks:</label>${[0, 1, 2].map(sel).join("")}</div>
      <div class="form-group"><label>Kind:</label><select name="prog"><option value="">simple: the tests now</option>
        ${programs.map(p => `<option value="${p.id}">from ${esc(p.name)} (${p.system.csSize} Mp: upload, then a Control Test)</option>`).join("")}</select></div>`,
    buttons: [{ action: "go", label: "Leave it", default: true, callback: (ev, b) => {
      const f = b.form.elements;
      return { name: f.name.value.trim() || "Command set", orders: f.orders.value.trim(), prog: f.prog.value,
        steps: [0, 1, 2].map(i => f[`s${i}`].value).filter(Boolean) };
    } }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel") return;
  if (!o.steps.length) return ui.notifications.warn("Name at least one task (Control when in doubt).");
  const s = liveSession(actor), base = { name: o.name, orders: o.orders, steps: o.steps, host: host.uuid, conn: actor.system.vr2Conn.n, sessionId: s?.id ?? "" };
  if (!o.prog) return request(actor, "csOpen", { id: foundry.utils.randomID(16), ...base });
  const item = actor.items.get(o.prog);
  if (!(Number(actor.system.cyberdeck?.ioSpeed) > 0)) return ui.notifications.warn("Your deck has no I/O bandwidth to upload with (p.91).");
  await (await import("./frames.mjs")).ownAction(actor, "Upload a command set");   // the decker acts: a decoy frame ends (code R1 #5)
  return request(actor, "csUpload", { upload: foundry.utils.randomID(16), item: item.id, ...base });
}

/** New command-set program (§3, user ruling 1): no test; its design size rolls 1D6 × 20 Mp (p.105). */
export async function newCommandSetProgram(actor) {
  const r = await new Roll("1d6 * 20").evaluate();
  await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Command-set program: design size 1D6 × 20 Mp (VR2.0 p.105)" });
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "Command set program", type: "program",
    system: { rating: 1, commandSet: true, csSize: r.total, loaded: false, category: "other" } }]);
  item?.sheet.render(true);
}

/** Test a set's next step (§2): the commandSet operation on the step's subsystem, stamped with the set and step. */
export async function testStep(actor, hostUuid, id) {
  const host = sync(hostUuid), set = setsOn(host).find(s => s.open.id === id);
  if (!set || set.state.status !== "pending") return ui.notifications.warn("That command set isn't waiting for a test.");
  if (set.open.decker !== actor.uuid) return ui.notifications.warn("That isn't your command set.");
  const hackingMax = actor.system.dicePools?.hacking?.value ?? 0;
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: `${set.open.name}: ${subLabel(set.state.nextSub)} Test` }, rejectClose: false,
    content: `<div class="form-group"><label>Hacking Pool dice (${hackingMax} left):</label><input type="number" name="hacking" value="0" min="0" max="${hackingMax}"></div>`,
    buttons: [{ action: "go", label: "Roll", default: true, callback: (ev, b) => ({ hacking: Math.max(0, Math.min(hackingMax, parseInt(b.form.elements.hacking.value) || 0)) }) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel") return;
  // ONE test per step (code R1 #2, R3 #1–#2): rolls of a set are serialized on this client and re-read the set just
  // before rolling (a GM edit meanwhile is honoured); the FIRST rolled card whose subsystem is still the step's is
  // bound durably (the record key is the arbiter). A refused roll binds nothing, so the step is never stuck.
  // shortcut: two devices of one player rolling the same step at the same instant can both roll (only the first card
  // binds; the other's tally stands) — a cross-device lock would need a request round-trip before every roll.
  return enqueueAttack(`cs:${actor.uuid}:${id}`, async () => {
    const now = setsOn(host).find(s => s.open.id === id);
    if (!now || now.state.status !== "pending") return ui.notifications.warn("That command set isn't waiting for a test.");
    const step = now.state.next, sub = now.state.nextSub;
    if (boundCard(host, id, step)) return ui.notifications.warn("This step has already been rolled: settle its card.");
    const res = await vr2SystemTest(actor, host, "commandSet", { subsystem: sub, cs: { id, step }, hacking: o.hacking });
    if (!res?.cardId) return res;
    // Bound by the sequencer, in the same order as the GM's step edits (code R4 #1); the queue waits for the verdict.
    await request(actor, "csBind", { host: host.uuid, id, step, card: res.cardId });
    const t0 = Date.now();
    while (!boundCard(host, id, step) && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
    if (boundCard(host, id, step) !== res.cardId) ui.notifications.warn("That roll can't be this step's (the GM changed the step, or another roll came first): settle the bound card, or roll again.");
    return res;
  });
}

/** The card bound to a step (a fact on the host), or null. */
const boundCard = (host, id, step) => recordsOf(host).find(e => e.type === "csCard" && e.id === id && e.step === step)?.card ?? null;

/** Settle step (§2): sent after any Karma; the sequencer admits it and freezes the card. */
export function settleStep(message) {
  const st = message?.flags?.sr2e?.vr2SystemTest, actor = sync(st?.actorUuid);
  if (!st?.cs || !actor?.isOwner) return ui.notifications.warn("Only the decker who rolled it settles this step.");
  return request(actor, "csStep", { id: st.cs.id, step: st.cs.step, card: message.id, host: st.hostUuid });
}

// ── The sequencer ──────────────────────────────────────────────────────────────

/** He is ON that host, on that connection and session, now. */
const onIt = (actor, f, hostUuid, conn, sessionId) => !!f.live && f.live.n === conn && liveSession(actor)?.id === sessionId
  && liveSession(actor)?.hostUuid === hostUuid && hostHere(actor)?.uuid === hostUuid && !vr2ActionGuard(actor);   // the session IS that host's (code R1 #3)

addHandlers({
  /** A simple set (§1): opened only for a decker ON that host; program sets never open by request (R1 #3). */
  async csOpen(actor, r, f) {
    const host = sync(r.host);
    if (host?.type !== "host" || hostOffline(host)) return { ok: false, why: "no such host, or it's shut down" };
    if (!onIt(actor, f, host.uuid, r.conn, r.sessionId)) return { ok: false, why: `not on ${host.name}` };
    if (recordsOf(host).some(e => e.type === "csOpen" && e.id === r.id)) return { ok: true };
    const steps = (r.steps ?? []).filter(k => SUBS.includes(k));
    if (!steps.length) return { ok: false, why: "no tasks" };
    await fact(host, `cs-open:${r.id}`, { type: "csOpen", id: r.id, decker: actor.uuid, deckerName: actor.name, name: String(r.name ?? ""),
      orders: String(r.orders ?? ""), kind: "simple", steps, conn: r.conn, sessionId: r.sessionId });
    await postOpened(actor, host, r.id);
    return { ok: true };
  },
  /** A program set's upload (§3): validated like a frame's, on 0.136.0's clock; the definition rides in the snapshot. */
  async csUpload(actor, r, f) {
    const host = sync(r.host), item = actor.items.get(r.item);
    if (host?.type !== "host" || hostOffline(host)) return { ok: false, why: "no such host, or it's shut down" };
    if (!onIt(actor, f, host.uuid, r.conn, r.sessionId)) return { ok: false, why: `not on ${host.name}` };
    if (!item?.system?.commandSet) return { ok: false, why: "not a command-set program" };
    const seconds = uploadSeconds(item.system.csSize, actor.system.cyberdeck?.ioSpeed);
    if (seconds == null) return { ok: false, why: "no I/O bandwidth" };
    const steps = (r.steps ?? []).filter(k => SUBS.includes(k));
    if (!steps.length) return { ok: false, why: "no tasks" };   // code R1 #7
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
    const clock = combat ? { combatId: combat.id, startRound: combat.round } : { manual: true };
    if (!await fact(actor, `upload-open:${r.upload}`, { type: "uploadOpen", upload: r.upload, conn: r.conn, sessionId: r.sessionId, host: host.uuid, seconds, clock,
      snapshot: { kind: "commandSet", coreName: String(r.name ?? "Command set"), name: String(r.name ?? ""), orders: String(r.orders ?? ""), steps, item: item.id } })) return { ok: true };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">
      ${esc(actor.name)} uploads the <strong>${esc(r.name)}</strong> command set (${item.system.csSize} Mp) to ${esc(host.name)}: ${seconds} seconds,
      ${uploadTurns(seconds)} Combat Turn${uploadTurns(seconds) === 1 ? "" : "s"} (VR2.0 p.91, p.105). Then a Control Test loads it.
      ${clock.manual ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-frame-btn" data-op="uploadDone" data-actor="${esc(actor.uuid)}" data-arg="${r.upload}"
        title="The upload's time has passed (no combat is counting it)">Upload finished (GM)</button></div>` : "<br><em>Counted at each round's end.</em>"}</div>` });
    return { ok: true };
  },
  /**
   * Bind a step's FIRST rolled card (code R1 #2, R4 #1), in the sequencer's order with the GM's step edits: only while
   * the step is next, unbound, and still the card's subsystem; the card must be this decker's stamped test.
   */
  async csBind(actor, r) {
    const host = sync(r.host), set = setsOn(host).find(s => s.open.id === r.id);
    if (!set || set.state.status !== "pending" || set.state.next !== r.step || boundCard(host, r.id, r.step)) return { ok: false, why: "that step isn't open for a card" };
    const st = game.messages.get(r.card)?.flags?.sr2e?.vr2SystemTest;
    if (!st || st.cs?.id !== r.id || st.cs?.step !== r.step || st.sub !== set.state.nextSub || st.actorUuid !== actor.uuid || set.open.decker !== actor.uuid) return { ok: false, why: "not this step's test" };
    await fact(host, `cs-card:${r.id}:${r.step}`, { type: "csCard", id: r.id, step: r.step, card: r.card });
    return { ok: true };
  },
  /** Settle a step (§2, R1 #2, #7, R2 #1): bound to the set, its step, its subsystem, its ORIGINAL connection and session. */
  async csStep(actor, r, f) {
    const host = sync(r.host), set = setsOn(host).find(s => s.open.id === r.id);
    if (!set) return { ok: false, why: "no such command set" };
    if (!csAdmits(set.state.status, "settle")) return { ok: false, why: `the set is ${set.state.status}` };
    if (r.step !== set.state.next) return { ok: false, why: "not its next step" };
    if (recordsOf(host).some(e => e.type === "csStep" && e.id === r.id && e.n === r.step)) return { ok: true };
    // The step's ONE rolled card (code R1 #2, R4 #1): bound by the sequencer on the host.
    if (boundCard(host, r.id, r.step) !== r.card) return { ok: false, why: "not this step's card" };
    const st = game.messages.get(r.card)?.flags?.sr2e?.vr2SystemTest, o = set.open;
    if (!st || st.operation !== "commandSet" || st.cs?.id !== r.id || st.cs?.step !== r.step || st.sub !== set.state.nextSub) return { ok: false, why: "that card isn't this step's test" };
    if (st.actorUuid !== actor.uuid || o.decker !== actor.uuid || st.hostUuid !== host.uuid || st.conn !== o.conn || st.sessionId !== o.sessionId) return { ok: false, why: "that card is from another decker, host or session" };
    if (!onIt(actor, f, host.uuid, o.conn, o.sessionId)) return { ok: false, why: `not on ${host.name} in the session that started it` };
    const successes = await freezeSuccesses({ testMessageId: st.testMessageId, successes: st.successes });
    const success = systemTestVerdict(successes, st.hostSuccesses).success;
    await fact(host, `cs-step:${r.id}:${r.step}`, { type: "csStep", id: r.id, n: r.step, sub: st.sub, success, hostSuccesses: st.hostSuccesses ?? 0,
      card: r.card, at: game.time.worldTime });
    const now = setsOn(host).find(s => s.open.id === r.id)?.state;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperTo(actor), content: `<div class="sr2e-item-card">
      <strong>${esc(o.name)}</strong>: the ${esc(subLabel(st.sub))} Test ${success ? "succeeds" : "fails"}.
      ${now?.status === "loaded" ? `The command set is loaded: undetected for ${hoursText(now.hours)} (24 ÷ the host's ${now.sum} success${now.sum === 1 ? "" : "es"}, VR2.0 p.105).`
        : now?.status === "failed" ? "The command set doesn't work." : `Next: ${esc(subLabel(now?.nextSub))}.`}</div>` });
    return { ok: true };
  }
});

const whisperTo = (actor) => game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
export const hoursText = (h) => { const m = Math.round((h ?? 0) * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };

async function postOpened(actor, host, id) {
  const set = setsOn(host).find(s => s.open.id === id);
  if (!set) return;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperTo(actor), content: `<div class="sr2e-item-card">
    ${esc(actor.name)} leaves the <strong>${esc(set.open.name)}</strong> command set on ${esc(host.name)}: ${esc(set.open.orders || "orders")}.
    <br>Steps: ${set.state.list.map(k => esc(subLabel(k))).join(", ")}. Test each from the Matrix tab, then settle it (VR2.0 p.104–105).</div>` });
}

/**
 * Open each completed command-set upload's set on its host (§3, R1 #4), from the snapshot: idempotent, keyed by the
 * upload id, so an interruption after `uploadDone` is finished by the next pass. Its steps start with the Control load.
 */
export async function reconcileCommandSets(owner) {
  const recs = recordsOf(owner);
  for (const done of recs.filter(e => e.type === "uploadDone")) {
    const open = recs.find(e => e.type === "uploadOpen" && e.upload === done.upload);
    if (open?.snapshot?.kind !== "commandSet") continue;
    const host = sync(open.host);
    if (host?.type !== "host" || recordsOf(host).some(e => e.type === "csOpen" && e.id === done.upload)) continue;
    const sn = open.snapshot;
    await fact(host, `cs-open:${done.upload}`, { type: "csOpen", id: done.upload, decker: owner.uuid, deckerName: owner.name, name: sn.name, orders: sn.orders,
      kind: "program", steps: ["control", ...(sn.steps ?? [])], conn: open.conn, sessionId: open.sessionId, upload: done.upload });
    await postOpened(owner, host, done.upload);
  }
}

// ── The GM (host sheet) ───────────────────────────────────────────────────────

/** Executed / Purged / Cancel (§5): a terminal mark, admitted per action, in the sequencer. */
export function markSet(host, id, what) {
  if (!game.user.isGM) return ui.notifications.warn("The GM marks a command set.");
  return gmRequest(host, id, "csMark", { what });
}
/** Any GM's action reaches the sequencer as a request on the set's decker's log (code R1 #6); with no decker, directly. */
function gmRequest(host, id, kind, data) {
  const open = setsOn(host).find(s => s.open.id === id)?.open, d = sync(open?.decker);
  if (d) return request(d, kind, { host: host.uuid, id, ...data });
  // shortcut: a set whose decker was deleted has no log to queue on; the active GM (always present) handles it directly.
  if (!isSequencer()) return ui.notifications.warn("The active GM handles a set whose decker is gone.");
  return sequencer(() => HANDLERS_CS[kind](null, { host: host.uuid, id, user: game.user.id, ...data }));
}
/** The first step the GM may change (code R2 #2): a step whose test is already rolled keeps its subsystem. */
function editableFrom(set) {
  const n = set.state.next;
  return boundCard(set.host, set.open.id, n) ? n + 1 : n;
}
const HANDLERS_CS = {
  async csMark(actor, r) {
    if (!game.users.get(r.user)?.isGM) return { ok: false, why: "the GM marks a command set" };
    const host = sync(r.host), set = setsOn(host).find(s => s.open.id === r.id);
    if (!set || !["executed", "purged", "cancelled"].includes(r.what) || !csAdmits(set.state.status, r.what)) return { ok: false, why: `that set is ${set?.state.status ?? "gone"}` };
    await fact(host, `cs-mark:${r.id}`, { type: "csMark", id: r.id, what: r.what });
    return { ok: true };
  },
  async csSteps(actor, r) {
    if (!game.users.get(r.user)?.isGM) return { ok: false, why: "the GM changes a command set's tests" };
    const host = sync(r.host), set = setsOn(host).find(s => s.open.id === r.id);
    const steps = (r.steps ?? []).filter(k => SUBS.includes(k));
    if (!set || !csAdmits(set.state.status, "steps") || r.from !== editableFrom(set) || !steps.length) return { ok: false, why: "the set changed meanwhile: reopen" };
    const k = recordsOf(host).filter(e => e.type === "csSteps" && e.id === r.id).length;
    await fact(host, `cs-steps:${r.id}:${k}`, { type: "csSteps", id: r.id, from: r.from, steps });
    return { ok: true };
  }
};
addHandlers(HANDLERS_CS);
/** Change the remaining steps (§1, R2 #3): from the settled count, in the sequencer. */
export async function changeSteps(host, id) {
  if (!game.user.isGM) return ui.notifications.warn("The GM changes a command set's tests.");
  const set = setsOn(host).find(s => s.open.id === id);
  if (!set || !csAdmits(set.state.status, "steps")) return;
  const from = editableFrom(set), rest = set.state.list.slice(from);
  const sel = (i, v) => `<select name="s${i}"><option value="">—</option>${SUBS.map(k => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(subLabel(k))}</option>`).join("")}</select>`;
  const steps = await foundry.applications.api.DialogV2.wait({ window: { title: `${set.open.name}: the remaining tests` }, rejectClose: false,
    content: `<p>The gamemaster determines the Subsystem Tests (VR2.0 p.104). Settled: ${from}.</p>${[0, 1, 2].map(i => sel(i, rest[i])).join("")}`,
    buttons: [{ action: "go", label: "Set", default: true, callback: (ev, b) => [0, 1, 2].map(i => b.form.elements[`s${i}`].value).filter(Boolean) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!Array.isArray(steps) || !steps.length) return;
  return gmRequest(host, id, "csSteps", { from, steps });
}

/** The host sheet's list (§5). */
export function hostSetsContext(host) {
  return setsOn(host).map(({ open, state }) => ({ id: open.id, name: open.name, decker: open.deckerName ?? sync(open.decker)?.name ?? "?",
    orders: open.orders, kind: open.kind, status: state.status, steps: state.list.map(k => subLabel(k)).join(", "),
    settled: state.next ?? state.list.length, sum: state.sum,
    left: state.status === "loaded" ? hoursText((state.purgeAt - game.time.worldTime) / 3600) : "",
    canMark: state.status === "loaded", canCancel: state.status === "pending" }));
}

export function registerCommandSetHooks() {
  // A set's facts land on its host: the decker's open sheet follows (his Matrix tab lists them).
  Hooks.on("createActiveEffect", (e) => {
    const ev = e.flags?.sr2e?.claim?.event;
    if (e.parent?.type !== "host" || !["csOpen", "csStep", "csSteps", "csMark"].includes(ev?.type)) return;
    const open = recordsOf(e.parent).find(x => x.type === "csOpen" && x.id === ev.id), d = sync(open?.decker);
    if (d?.sheet?.rendered) d.sheet.render();
    if (e.parent.sheet?.rendered) e.parent.sheet.render();
  });
  // The countdown is world time: open host sheets follow it.
  Hooks.on("updateWorldTime", () => { for (const h of game.actors.filter(a => a.type === "host")) if (h.sheet?.rendered && recordsOf(h).some(e => e.type === "csOpen")) h.sheet.render(); });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-cs-settle").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); settleStep(message); }));
  });
}
