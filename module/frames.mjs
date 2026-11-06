/**
 * VR2.0 part 6a-2a: running frames — the frame actor, upload, lifecycle and damage (docs/PLAN-vr2-part6-frames.md,
 * "6a-2a in detail"; VR2.0 pp.105–107, p.91, p.124).
 *
 * Everything that matters is a durable fact on the OWNER's log, written by the sequencer (the active GM's client):
 *   upload-open:<id>   {type: "uploadOpen", upload, conn, sessionId, host, seconds, snapshot, clock}
 *   upload-tick:<id>:<round>  {type: "uploadTick", upload}       a Combat Turn of the upload (3 s)
 *   upload-done:<id>   {type: "uploadDone", upload}              the frame starts running
 *   upload-end:<id>    {type: "uploadEnd", upload, why}          an upload that never completed
 *   frame-hit:<card>   {type: "frameHit", upload, card, boxes, armor, shield}   damage, ONCE per card
 *   frame-end:<id>     {type: "frameEnd", upload, why}           for the record; `ended` is DERIVED (frameState)
 * The frame actor (`_id` = the upload id) and its token are created and removed by the same client from those facts,
 * idempotently, as persona-tokens.mjs does.
 */
import { recordsOf, fact, sequencer, isSequencer, request, schedule, hostOffline, addHandlers, freezeSuccesses, flush, vr2ActionGuard, setFrameEnded } from "./vr2ic.mjs";
import { liveSession, currentPlace, addWear, commitAction, dinabZeroed, activePrograms, bestUtility, programRating, phaseKey,
  vr2SystemTest, vr2MatrixAttack, vr2Maneuver, vr2ScanIcon } from "./vr2.mjs";
import { topologyOn, isVR2 } from "./vr2-mode.mjs";
import { uploadSeconds, uploadTurns, departedSince, frameMonitor, shutdownOfflineSeqs, frameEnds, copyStats,
  liveDecoyFrame, openDecoyFrames, triggerProblems, frameAttrLosses, NO_FRAME_OPS, NO_SMART_OPS, joinStep,
  skProblems, poolProblems, nextLocks, skCondition, SK_PRESETS } from "./rules/vr2-frames.mjs";
import { attributeLoss, systemTestVerdict, medicTN } from "./rules/sr2e-rules.mjs";
import { restorePoints } from "./rules/vr2ic-rules.mjs";
import { once, recordEvent } from "./claims.mjs";
import { miscDiceHTML, readMiscDice } from "./dialogs/roll-modifiers.mjs";
import { GRID_KINDS } from "./rules/vr2-grids.mjs";
import { personaOn } from "./jackpoints.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const of = (recs, type, id) => recs.find(e => e.type === type && e.upload === id) ?? null;

// ── Derived state ──────────────────────────────────────────────────────────────

/** Has the owner left since `since`? (§2; one rule for uploads and dumb frames.) */
function departed(owner, rec, since) {
  return departedSince({ live: owner?.system?.vr2Conn?.n ?? null, conn: rec.conn, sessionId: rec.sessionId,
    liveSessionId: liveSession(owner)?.id ?? null, topology: topologyOn(), moves: recordsOf(owner), since });
}

/**
 * A frame incarnation's monitor and whether it has ended — derived from durable state, never stored (§1, §4). Works
 * before the actor exists (from the upload record), so an ended upload never gets an actor at all.
 */
export function stateFor(owner, id) {
  const recs = owner ? recordsOf(owner) : [];
  const done = of(recs, "uploadDone", id), open = of(recs, "uploadOpen", id);
  const host = sync(open?.host);
  const monitor = frameMonitor(recs, id);
  const why = frameEnds({ ownerExists: !!owner, hostExists: host?.type === "host", kind: open?.snapshot?.kind ?? "dumb", monitor,
    endFact: of(recs, "frameEnd", id), shutdownSeqs: host ? shutdownOfflineSeqs(recordsOf(host)) : [], since: done?.seq ?? 0,
    departed: owner && open ? departed(owner, open, done?.seq ?? 0) : true });
  return { monitor, why, ended: !!why };
}
/** The same for a frame actor. An SK (6b) has its own state, from facts on itself. */
export const frameState = (frame) => isSK(frame) ? skState(frame) : stateFor(sync(frame?.system?.ownerUuid), frame?.system?.uploadId || frame?.id);

// ── Part 6b: SKs (docs/PLAN-vr2-part6-frames.md, "6b in detail"; VR2.0 pp.140–141) ──────────
/** A semi-autonomous knowbot: a frame actor of kind "sk", the GM's, its facts on itself. */
export const isSK = (a) => a?.type === "frame" && a.system?.kind === "sk";
/** The records about a frame: an SK's own, else its owner's log (6b §1). */
export const factsOf = (frame) => isSK(frame) ? recordsOf(frame) : (sync(frame?.system?.ownerUuid) ? recordsOf(sync(frame.system.ownerUuid)) : []);
const movesOf = (sk) => recordsOf(sk).filter(e => e.type === "skMove").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
/** Ended by its monitor, or a shutdown of the host it's ON since it arrived there (6b §1, R2 #2). */
export function skState(sk) {
  const recs = recordsOf(sk), { monitor } = skCondition(recs);
  const move = movesOf(sk).at(-1);
  const host = move?.to ? sync(move.to) : null;
  const shut = host?.type === "host" && shutdownOfflineSeqs(recordsOf(host)).some(q => q > (move.seq ?? 0));
  const why = monitor >= 10 ? "crashed" : shut ? "its host shut down" : null;
  return { monitor, why, ended: !!why };
}

/** Does the core (or a copy) carry an active squeeze? Then it must be decompressed before it runs (p.106). */
const squeezed = (core) => core.system.activeOpts?.some(o => o.kind === "squeeze")
  || (core.system.activeLoad?.copies ?? []).some(c => copyStats(c, { vr2: true, optionsOn: true }).activeOpts.some(o => o.kind === "squeeze"));
const loadGen = (core) => core.system.activeLoad?.gen ?? 0;

/** Why this core can't be uploaded (null = it can). Checked by the player AND re-derived by the sequencer. */
function coreRefusal(core) {
  if (!core?.system?.isCore) return "That isn't a frame core.";
  if (!core.system.coreWritten) return `${core.name} isn't written as it is now (p.105).`;
  if (core.system.coreProblems?.length) return core.system.coreProblems[0];
  if (core.system.activeLoad?.void) return core.system.activeLoad.void;
  if (squeezed(core) && core.getFlag("sr2e", "frameDecompressed") !== loadGen(core)) return `${core.name} is compressed: Decompress frame first (p.106).`;
  return null;
}
/** The host the decker is ON (topology: his current place, a host; else the live session's host). */
function hostHere(actor) {
  const h = topologyOn() ? currentPlace(actor) : sync(liveSession(actor)?.hostUuid);
  return h?.type === "host" && !GRID_KINDS.has(h.system.kind) ? h : null;
}

// ── The decker's buttons ───────────────────────────────────────────────────────

/** Decompress frame (p.106): a Complex Action; good for this load of the core. */
export async function decompressFrame(actor, core) {
  { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  if (!core?.system?.isCore || !squeezed(core)) return ui.notifications.info(`${core?.name ?? "That"} isn't compressed.`);
  const started = liveSession(actor)?.improvised?.id ?? null;
  await ownAction(actor, "Decompress frame");   // 6a-2b §4: the decker acts (code R1 #1)
  await core.setFlag("sr2e", "frameDecompressed", loadGen(core));
  await commitAction(actor, started);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} decompresses
    the ${esc(core.name)} frame (a Complex Action, VR2.0 p.104, p.106).</div>` });
}

/** Upload frame (p.106): a request; the sequencer derives the snapshot and the time itself (R1 #3). */
export async function uploadFrame(actor, core) {
  if (!isVR2() || !actor.system.vr2Conn) return ui.notifications.warn("Upload a frame while you're in the Matrix (VR2.0).");
  { const why = (await import("./vr2ic.mjs")).vr2ActionGuard(actor); if (why) return ui.notifications.warn(why); }
  const host = hostHere(actor);
  if (!host) return ui.notifications.warn("Log on to a host first: a frame runs on a host (p.106).");
  const why = coreRefusal(core);
  if (why) return ui.notifications.warn(why);
  if (!(Number(actor.system.cyberdeck?.ioSpeed) > 0)) return ui.notifications.warn("Your deck has no I/O bandwidth to upload with (p.91).");
  const s = liveSession(actor);
  await ownAction(actor, "Upload frame");   // 6a-2b §4: the decker acts (code R1 #1)
  const id = foundry.utils.randomID(16);
  await request(actor, "upload", { upload: id, conn: actor.system.vr2Conn.n, core: core.id, gen: loadGen(core), host: host.uuid, sessionId: s?.id ?? "" });
  ui.notifications.info(`Uploading ${core.name} to ${host.name}…`);
}

// ── The sequencer: handlers ───────────────────────────────────────────────────

addHandlers({
  /** Admit an upload (§2): validated and DERIVED on the sequencer's own client, never trusted from the request. */
  async upload(actor, r, f) {
    if (!f.live || f.live.n !== r.conn) return { ok: false, why: "not on that connection" };
    const s = liveSession(actor), host = sync(r.host);
    if (!s || s.id !== r.sessionId || s.hostUuid !== r.host || host?.type !== "host") return { ok: false, why: "not on that host any more" };
    if (hostOffline(host)) return { ok: false, why: `${host.name} is shut down` };
    if (topologyOn() && currentPlace(actor)?.uuid !== r.host) return { ok: false, why: `not on ${host.name}` };
    const core = actor.items.get(r.core);
    const why = coreRefusal(core);
    if (why) return { ok: false, why };
    if (loadGen(core) !== r.gen) return { ok: false, why: "the core was loaded again meanwhile" };
    const seconds = uploadSeconds(core.system.frameSize, actor.system.cyberdeck?.ioSpeed);
    if (seconds == null) return { ok: false, why: "no I/O bandwidth" };
    const dinab = core.system.activeOpts?.find(o => o.kind === "dinab")?.rating ?? 0;
    const fc = core.system.frameCore;
    const snapshot = { kind: fc.kind, coreRating: core.system.rating, bod: fc.bod, evasion: fc.evasion, masking: fc.masking, sensor: fc.sensor,
      initPoints: fc.initPoints, dinab, copies: foundry.utils.deepClone(core.system.activeLoad?.copies ?? []), coreName: core.name,
      coreUuid: core.uuid, img: core.img, frameSize: core.system.frameSize, decompressed: squeezed(core) };
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
    const clock = combat ? { combatId: combat.id, startRound: combat.round } : { manual: true };
    if (!await fact(actor, `upload-open:${r.upload}`, { type: "uploadOpen", upload: r.upload, conn: r.conn, sessionId: r.sessionId,
      host: r.host, seconds, snapshot, clock })) return { ok: true, why: "already uploading" };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">
      ${esc(actor.name)} uploads the <strong>${esc(core.name)}</strong> frame (${snapshot.frameSize} Mp) to ${esc(host.name)}:
      ${seconds} seconds at ${actor.system.cyberdeck.ioSpeed} MePS, ${uploadTurns(seconds)} Combat Turn${uploadTurns(seconds) === 1 ? "" : "s"} (VR2.0 p.91, p.106).
      ${clock.manual ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-frame-btn" data-op="uploadDone" data-actor="${esc(actor.uuid)}" data-arg="${r.upload}"
        title="The upload's time has passed (no combat is counting it)">Upload finished (GM)</button></div>` : "<br><em>Counted at each round's end.</em>"}</div>` });
    return { ok: true };
  },
  /** The GM's clock for an upload outside combat (§2). */
  async uploadDone(actor, r) {
    if (!game.users.get(r.user)?.isGM) return { ok: false, why: "the GM finishes an upload" };
    const open = of(recordsOf(actor), "uploadOpen", r.upload);
    if (!open?.clock?.manual) return { ok: false, why: "no such upload outside combat" };
    await settleUpload(actor, open, true);
    return { ok: true };
  },
  /** A frame's damage (§5, R1 #9): ONCE per card, keyed by it; the copy's wear replayed from the receipt (R2 #2). */
  async frameHit(actor, r) {
    const frame = game.actors.get(r.upload);
    if (!frame || frame.type !== "frame" || frame.system.ownerUuid !== actor.uuid) return { ok: false, why: "no such frame" };
    if (frameState(frame).ended) return { ok: false, why: `${frame.name} has crashed` };
    await fact(actor, `frame-hit:${r.card}`, { type: "frameHit", upload: r.upload, card: r.card, boxes: Math.max(0, Number(r.boxes) || 0),
      armor: r.armor ?? null, shield: r.shield ?? null, nonce: r.nonce ?? null, level: r.level ?? null,
      atk: r.atk ?? 0, res: r.res ?? 0, shieldS: r.shieldS ?? 0, closes: r.closes ?? [] });
    await replayWear(actor);
    await replayResolutions(actor);
    return { ok: true };
  },
  /** 6a-2b §4: the decker acted — that decoy frame is over for good (R1 #8, #9). Once per record. */
  async decoyFrameOff(actor, r, f) {
    if (!f.live || f.live.n !== r.conn) return { ok: false, why: "not on that connection" };
    const d = recordsOf(actor).find(e => e.type === "decoyFrame" && e.key === r.decoy && e.conn === r.conn);
    if (!d) return { ok: false, why: "no such decoy frame" };
    const wasLive = liveDecoyFrameOf(actor)?.key === d.key;
    if (await fact(actor, `decoyframe-off:${r.conn}:${d.card}`, { type: "decoyFrameOff", conn: r.conn, decoy: d.key, why: r.why ?? "" }) && wasLive) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} acts (${esc(r.why || "an action")}):
        the decoy frame no longer covers them, and security reacts to ${esc(actor.name)} again (VR2.0 p.107).</div>` });
    }
    return { ok: true };
  },
  /** 6a-2b §6 (R1 #12): a crippler's loss on a frame, computed HERE from the current folded attribute, once per card. */
  async frameAttr(actor, r) {
    if (recordsOf(actor).some(e => e.type === "frameAttr" && e.card === r.card)) return { ok: true };
    const frame = game.actors.get(r.upload);
    if (!frame || frame.type !== "frame" || frame.system.ownerUuid !== actor.uuid) return { ok: false, why: "no such frame" };
    if (frameState(frame).ended) return { ok: false, why: `${frame.name} has crashed` };
    const st = game.messages.get(r.card)?.flags?.sr2e?.matrix;
    if (!st || st.targetUuid !== frame.uuid || st.effect !== "attribute" || !(st.attr in (frame.system.matrixPersona ?? {}))) return { ok: false, why: "not an attribute attack on this frame" };
    const atk = await freezeSuccesses(st), def = Math.max(0, Number(r.defense) || 0);
    const cur = Math.max(0, (frame.system[st.attr] ?? 0) - frameAttrLosses(recordsOf(actor), r.upload)[st.attr]);
    const lost = attributeLoss(cur, Math.max(0, Math.floor((atk - def) / 2)), st.floor ?? 0);
    await fact(actor, `frame-attr:${r.card}`, { type: "frameAttr", upload: r.upload, card: r.card, attr: st.attr, lost, atk, def, res: r.res ?? 0,
      shield: r.shield ?? null, shieldS: r.shieldS ?? 0, nonce: r.nonce ?? null, closes: r.closes ?? [], effectName: st.effectName ?? "" });
    refreshFrames(actor);
    await replayWear(actor);
    await replayResolutions(actor);
    return { ok: true };
  },
  /** 6a-2b §7: the GM fires an event trigger; the outcome goes in the fact, the report is replayed from it. */
  async triggerFire(actor, r) {
    if (!game.users.get(r.user)?.isGM) return { ok: false, why: "the GM fires an event trigger" };
    const t = recordsOf(actor).find(e => e.type === "trigger" && e.key === r.key);
    if (!t) return { ok: false, why: "no such trigger" };
    const frame = game.actors.get(t.upload);
    const w = frame ? watchers(frame) : null;
    const here = topologyOn() ? currentPlace(actor)?.uuid : liveSession(actor)?.hostUuid;
    const why = !frame || frameState(frame).ended ? `${t.frameName ?? "the frame"} has crashed`
      : triggerProblems({ ...w, watch: t.watch })[0] ?? (here !== frame.system.hostUuid ? `they aren't on ${w.host?.name ?? "its host"} (VR2.0 p.107)` : "");
    await fact(actor, `trigger-fire:${t.upload}:${r.fire ?? foundry.utils.randomID()}`, { type: "triggerFire", trigger: t.key, upload: t.upload,
      delivered: !why, why, note: t.note, frameName: t.frameName ?? frame?.name ?? "A frame" });
    await replayTriggerReports(actor);
    return { ok: true };
  }
});

/** Finish, or end, one open upload (§2). `manual`: the GM said its time has passed. */
async function settleUpload(actor, open, manual = false) {
  const recs = recordsOf(actor), id = open.upload;
  if (of(recs, "uploadDone", id) || of(recs, "uploadEnd", id)) return;
  const host = sync(open.host);
  const gone = host?.type !== "host" ? "its host is gone"
    : shutdownOfflineSeqs(recordsOf(host)).some(s => s > open.seq) ? `${host.name} shut down`
    : departed(actor, open, open.seq) ? "the decker left the host" : null;
  if (gone) {
    if (await fact(actor, `upload-end:${id}`, { type: "uploadEnd", upload: id, why: gone })) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">The ${esc(open.snapshot.coreName)} upload is lost: ${esc(gone)} (p.106).</div>` });
    }
    return;
  }
  const ticks = recs.filter(e => e.type === "uploadTick" && e.upload === id).length;
  if (!manual && ticks * 3 < open.seconds) return;
  if (await fact(actor, `upload-done:${id}`, { type: "uploadDone", upload: id })) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">The <strong>${esc(open.snapshot.coreName)}</strong>
      frame is uploaded to ${esc(host.name)} and starts running (VR2.0 p.106).</div>` });
  }
}

/**
 * The resolution card of each frame hit, posted by the sequencer from its receipt (code R2 #1): so a resolver that
 * vanished after its receipt was written still gets its attack card resolved, and a full resist's DINAB wear happens.
 * Idempotent: a card that already has its `resolves` message is skipped.
 */
async function replayResolutions(owner) {
  const LEVELS = { L: "Light", M: "Moderate", S: "Serious", D: "Deadly" };
  for (const h of recordsOf(owner).filter(e => e.type === "frameHit")) {
    const st = game.messages.get(h.card)?.flags?.sr2e?.matrix;
    // A full resist's DINAB wear first, every pass (it's keyed, so idempotent): an interruption after the card was
    // posted can't lose it (code R3 #1).
    if (!h.boxes && st) await dinabZeroed(st, { card: h.card, requester: owner });
    if (game.messages.some(m => m.flags?.sr2e?.resolves === h.card)) continue;
    const frame = game.actors.get(h.upload);
    const name = frame?.name ?? of(recordsOf(owner), "uploadOpen", h.upload)?.snapshot?.coreName ?? "The frame";
    const after = isSK(owner) ? skCondition(recordsOf(owner), h.seq ?? 0).monitor : frameMonitor(recordsOf(owner).filter(e => (e.seq ?? 0) <= (h.seq ?? 0)), h.upload);
    const crashed = h.boxes > 0 && after >= 10;
    const text = h.boxes > 0 ? `${name} takes ${LEVELS[h.level] ?? ""} Matrix damage: ${h.boxes} box${h.boxes === 1 ? "" : "es"} (${after}/10).` : `${name} resists the Matrix attack.`;
    const lines = [...(h.shield ? [`Shield: −${h.shieldS} attack success${h.shieldS === 1 ? "" : "es"}.`] : []),
      ...(h.armor ? [`${h.armor.name} loses a point.`] : []), ...(crashed ? ["The frame crashes (VR2.0 p.124)."] : [])];
    await ChatMessage.create({ speaker: { alias: name }, content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
      <br><em>${h.atk} attack success${h.atk === 1 ? "" : "es"} vs ${h.res} resistance success${h.res === 1 ? "" : "es"}.</em>
      ${lines.map(l => `<br>${esc(l)}`).join("")}</div>`,
      flags: { sr2e: { resolves: h.card, closesTests: h.closes ?? [], matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}` } } });
  }
  // 6a-2b §6: attribute losses, the same way.
  const ATTR = { bod: "Bod", evasion: "Evasion", masking: "Masking", sensor: "Sensor" };
  for (const h of recordsOf(owner).filter(e => e.type === "frameAttr")) {
    const st = game.messages.get(h.card)?.flags?.sr2e?.matrix;
    if (!h.lost && st) await dinabZeroed(st, { card: h.card, requester: owner });
    if (game.messages.some(m => m.flags?.sr2e?.resolves === h.card)) continue;
    const name = game.actors.get(h.upload)?.name ?? of(recordsOf(owner), "uploadOpen", h.upload)?.snapshot?.coreName ?? "The frame";
    const text = h.lost > 0 ? `${name}'s ${ATTR[h.attr]} drops by ${h.lost}.` : `${name}'s ${ATTR[h.attr]} holds.`;
    await ChatMessage.create({ speaker: { alias: name }, content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
      <br><em>${h.atk} attack success${h.atk === 1 ? "" : "es"} vs ${h.def} success${h.def === 1 ? "" : "es"}${h.shield ? ` (Shield ${h.shieldS})` : ""}${h.effectName ? `, ${esc(h.effectName)}` : ""}.</em></div>`,
      flags: { sr2e: { resolves: h.card, closesTests: h.closes ?? [], matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}` } } });
  }
}

/** Re-apply Armor/Shield wear named in each hit or attribute loss (idempotent, card-keyed: R2 #2). */
async function replayWear(owner) {
  for (const h of recordsOf(owner).filter(e => e.type === "frameHit" || e.type === "frameAttr")) {
    const frame = game.actors.get(h.upload);
    if (!frame) continue;
    for (const ref of [h.armor, h.shield]) if (ref) await addWear(frame, ref, h.card);
  }
}

/**
 * One owner's pass (sequencer; from passFor): open uploads settle, ended frames get their record, and the frames'
 * documents follow the facts.
 */
export async function reconcileOwner(actor) {
  if (!isSequencer()) return;
  for (const open of recordsOf(actor).filter(e => e.type === "uploadOpen")) await settleUpload(actor, open);
  for (const done of recordsOf(actor).filter(e => e.type === "uploadDone")) {
    const id = done.upload;
    if (of(recordsOf(actor), "frameEnd", id)) continue;
    const st = stateFor(actor, id);
    if (st.ended && await fact(actor, `frame-end:${id}`, { type: "frameEnd", upload: id, why: st.why })) {
      const name = of(recordsOf(actor), "uploadOpen", id)?.snapshot?.coreName ?? "frame";
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">The <strong>${esc(name)}</strong>
        frame is gone: ${esc(st.why)}.</div>` });
    }
  }
  await replayWear(actor);
  await replayResolutions(actor);
  await replayTriggerReports(actor);
  await reconcileDocs(actor);
  refreshFrames(actor);
}

/** Combat Turns of the uploads on this combat's clock (from the updateCombat hook; sequencer). */
export async function tickUploads(actor, combat) {
  for (const open of recordsOf(actor).filter(e => e.type === "uploadOpen" && e.clock?.combatId === combat.id)) {
    const recs = recordsOf(actor);
    if (of(recs, "uploadDone", open.upload) || of(recs, "uploadEnd", open.upload)) continue;
    for (let r = open.clock.startRound; r < combat.round; r++) await fact(actor, `upload-tick:${open.upload}:${r}`, { type: "uploadTick", upload: open.upload });
    await settleUpload(actor, open);
  }
}

// ── The documents: created and removed from the facts (§3, §4) ───────────────────

/** The first free square beside the owner's persona token, or null. */
function besidePersona(owner) {
  for (const scene of game.scenes) {
    const p = personaOn(owner, scene);
    if (!p) continue;
    const g = scene.grid.size;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = p.x + dx * g, y = p.y + dy * g;
      if (x < 0 || y < 0 || x >= scene.dimensions.width || y >= scene.dimensions.height) continue;
      if (!scene.tokens.some(t => Math.abs(t.x - x) < g && Math.abs(t.y - y) < g)) return { scene, x, y };
    }
  }
  return null;
}
const tokensOf = (id) => game.scenes.contents.flatMap(sc => sc.tokens.filter(t => t.actorId === id).map(t => ({ sc, t })));

/** Create, complete or remove one owner's frames to match the facts. Safe to repeat at any point (R1 #5). */
async function reconcileDocs(owner) {
  const recs = recordsOf(owner);
  for (const done of recs.filter(e => e.type === "uploadDone")) {
    const id = done.upload, open = of(recs, "uploadOpen", id);
    if (!open) continue;
    let frame = game.actors.get(id);
    const ended = () => stateFor(owner, id).ended;
    if (!frame && !ended()) {
      const sn = open.snapshot;
      try {
        frame = await Actor.create({ _id: id, name: sn.coreName, type: "frame", img: sn.img || "icons/svg/circle.svg",
          ownership: foundry.utils.deepClone(owner.ownership),
          prototypeToken: { actorLink: true, name: sn.coreName, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY },
          system: { kind: sn.kind, coreRating: sn.coreRating, bod: sn.bod, evasion: sn.evasion, masking: sn.masking, sensor: sn.sensor,
            initPoints: sn.initPoints, dinab: sn.dinab, ownerUuid: owner.uuid, coreUuid: sn.coreUuid, uploadId: id, hostUuid: open.host,
            conn: open.conn, sessionId: open.sessionId },
          // 6a-2c §2 (user ruling): a smart frame keeps its OWN session and tally on its host, created with it.
          ...(sn.kind === "smart" ? { flags: { sr2e: { vr2Session: smartSession(open) } } } : {}),
          items: (sn.copies ?? []).map(c => ({ name: c.name, type: "program", system: { ...foundry.utils.deepClone(c.system), loaded: true },
            ...(c.source ? { _stats: { compendiumSource: c.source } } : {}),
            flags: { sr2e: { frameCopy: { uploadId: id, source: c.source ?? null }, ...(sn.decompressed ? { decompressed: 0 } : {}) } } })) },
          { keepId: true });
      } catch (e) { frame = game.actors.get(id); }   // another pass or client won (the id is the arbiter)
    }
    frame = game.actors.get(id);
    if (!frame) continue;
    if (ended()) { await removeFrame(frame); continue; }
    const toks = tokensOf(id).sort((a, b) => (a.t._stats?.createdTime ?? 0) - (b.t._stats?.createdTime ?? 0));
    for (const extra of toks.slice(1)) { try { await extra.t.delete(); } catch (e) { /* gone */ } }
    if (!toks.length) {
      const spot = besidePersona(owner);
      if (spot && !ended()) {
        const data = (await frame.getTokenDocument({ actorLink: true, x: spot.x, y: spot.y })).toObject();
        await spot.scene.createEmbeddedDocuments("Token", [data]);
      }
    }
    // 6a-2c: a smart frame from before 0.138.0 gets its session; then it joins its owner's combats (§7).
    if (frame.system.kind === "smart" && !frame.flags?.sr2e?.vr2Session?.id) await frame.update({ "flags.sr2e.vr2Session": smartSession(open) });
    if (frame.system.kind === "smart") await joinCombats(owner, frame);
    // A departure that landed while we wrote (R1 #5): undo it at once.
    if (ended()) await removeFrame(game.actors.get(id));
  }
}

/** A smart frame's own session (6a-2c §2): on its host, no connection, never moved. */
function smartSession(open) {
  const host = sync(open.host);
  return { id: foundry.utils.randomID(), hostUuid: open.host, hostName: host?.name ?? "", tally: 0, receipts: {}, conn: null };
}

/**
 * Join each started combat its owner fights in, on the frame token's scene, AT MOST ONCE (6a-2c §7, R1 #4, R2 #1):
 * `frame-joining` before creating, the combatant's id = the upload id (keepId: never two), `frame-joined` after. Once
 * joined, a combatant the GM removed is never re-added. Initiative still null is rolled on every pass.
 */
async function joinCombats(owner, frame) {
  const id = frame.system.uploadId || frame.id;
  for (const combat of game.combats.filter(c => c.started)) {
    const ownerCb = combat.combatants.find(cb => cb.actor?.uuid === owner.uuid);
    const scene = ownerCb ? game.scenes.get(ownerCb.sceneId) : null;
    const tok = scene?.tokens.find(t => t.actorId === frame.id) ?? null;
    const recs = recordsOf(owner), has = (type) => recs.some(e => e.type === type && e.upload === id && e.combat === combat.id);
    const step = joinStep({ eligible: !!tok, joining: has("frameJoining"), joined: has("frameJoined") });
    if (step === "none") continue;
    if (step === "start") await fact(owner, `frame-joining:${id}:${combat.id}`, { type: "frameJoining", upload: id, combat: combat.id });
    if (tok && !combat.combatants.has(id)) {
      try { await combat.createEmbeddedDocuments("Combatant", [{ _id: id, tokenId: tok.id, sceneId: scene.id, actorId: frame.id }], { keepId: true }); }
      catch (e) { /* another pass or client made it (the id is the arbiter) */ }
    }
    // Done only once the combatant really exists; otherwise the intent stays pending and a later pass retries (code R1 #1).
    if (combat.combatants.has(id)) await fact(owner, `frame-joined:${id}:${combat.id}`, { type: "frameJoined", upload: id, combat: combat.id });
  }
  for (const combat of game.combats.filter(c => c.started)) {
    const cb = combat.combatants.get(id);
    if (cb && cb.initiative == null && !frameState(frame).ended) await combat.rollInitiative([id]);
  }
}

/** Remove an ended frame's tokens, combatants and actor; every step safe to repeat. */
async function removeFrame(frame) {
  if (!frame) return;
  for (const { t } of tokensOf(frame.id)) { try { await t.delete(); } catch (e) { /* gone */ } }
  for (const c of game.combats) for (const cb of c.combatants.filter(x => x.actorId === frame.id)) { try { await cb.delete(); } catch (e) { /* gone */ } }
  try { await frame.delete({ sr2eFrameCleanup: true }); } catch (e) { /* gone */ }
}

/** Frames whose owner is gone (no log left to hold a fact; R1 #6), and every owner's frames on load/handoff. */
export function reconcileAllFrames() {
  if (!isSequencer() || !isVR2()) return;
  sequencer(async () => {
    for (const f of game.actors.filter(a => a.type === "frame" && !isSK(a))) if (!sync(f.system.ownerUuid) || sync(f.system.hostUuid)?.type !== "host") await removeFrame(f);
  }).catch(err => console.error("SR2E | frames", err));
  for (const f of game.actors.filter(a => a.type === "frame" && !isSK(a))) { const o = sync(f.system.ownerUuid); if (o) schedule(o); }
  for (const sk of game.actors.filter(isSK)) scheduleSk(sk);   // 6b §5: the GM handoff finishes interrupted SK work
}

// ── Damage (the resist path calls this) ──────────────────────────────────────

/**
 * Apply a resolved hit to a frame (§5, R1 #9): a request the sequencer turns into ONE card-keyed fact (a full resist
 * too: 0 boxes). Waits for it (a GM is always online) and returns the monitor before and after, and whether THIS
 * resolution's receipt won (code R1 #2); null if nothing was written.
 */
export async function hitFrame(frame, card, boxes, armorRef = null, shieldRef = null, report = {}) {
  // 6b §5: an SK's damage is written on the SK itself, by the sequencer directly (it's the GM's).
  if (isSK(frame)) {
    if (!isSequencer()) { ui.notifications.warn("The active GM resolves an SK."); return null; }
    const before = frameState(frame).monitor, nonce = foundry.utils.randomID();
    await sequencer(async () => {
      await completeMoves(frame);
      if (frameState(frame).ended || recordsOf(frame).some(e => e.type === "frameHit" && e.card === card)) return;
      await fact(frame, `frame-hit:${card}`, { type: "frameHit", upload: frame.id, card, boxes: Math.max(0, Number(boxes) || 0),
        armor: armorRef ?? null, shield: shieldRef ?? null, nonce, level: report.level ?? null, atk: report.atk ?? 0, res: report.res ?? 0,
        shieldS: report.shieldS ?? 0, closes: report.closes ?? [] });
      await replayWear(frame); await replayResolutions(frame); await skCleanup(frame);
    });
    const r = recordsOf(frame).find(e => e.type === "frameHit" && e.card === card);
    return r ? { before, after: frameState(frame).monitor, mine: r.nonce === nonce } : null;
  }
  const owner = sync(frame.system.ownerUuid);
  if (!owner) return null;
  const before = frameState(frame).monitor, nonce = foundry.utils.randomID();
  const receipt = () => recordsOf(owner).find(e => e.type === "frameHit" && e.card === card);
  if (!receipt()) await request(owner, "frameHit", { upload: frame.system.uploadId || frame.id, card, boxes, armor: armorRef, shield: shieldRef, nonce, ...report });
  const t0 = Date.now();
  while (!receipt() && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
  const r = receipt();
  if (!r) return null;
  return { before, after: frameState(frame).monitor, mine: r.nonce === nonce };
}

// ── Part 6a-2b: commanding dumb frames (docs/PLAN-vr2-part6-frames.md, "6a-2b in detail"; VR2.0 pp.106–107) ──────

/**
 * Why `actor` can't command `frame` now, or "" (§1–§2). Checked before anything is spent; `after` re-checks only the
 * incarnation once the dice are rolled, so this command's own one-shot spend or DINAB crash doesn't void it (R2 #1).
 */
export function commandProblem(actor, frame, { op = "", copy = null, after = false, move = false } = {}) {
  if (frame?.type !== "frame") return "That isn't a running frame.";
  // A smart frame acting as itself (6a-2c §1): its own checks, no decker needed.
  if (actor?.uuid === frame.uuid) return smartProblem(frame, { op, copy, after, move });
  // Jacking out, or an icon down: the decker can't command anything (code R1 #2).
  const guard = vr2ActionGuard(actor);
  if (guard) return guard;
  if (frame.system.ownerUuid !== actor?.uuid) return `${frame.name} isn't ${actor?.name ?? "yours"}'s.`;
  if (frameState(frame).ended) return `${frame.name} has crashed.`;
  if (frame.system.kind === "smart") return "Smart frames act on their own (part 6a-2c).";
  const host = sync(frame.system.hostUuid);
  // The frame shares the decker's datatrail: he must be on its host, on its connection (§1).
  if (actor.system.vr2Conn?.n !== frame.system.conn || liveSession(actor)?.hostUuid !== frame.system.hostUuid
    || (topologyOn() && currentPlace(actor)?.uuid !== frame.system.hostUuid)) return `You must be on ${host?.name ?? "its host"} to command ${frame.name}.`;
  if (after) return "";
  if (NO_FRAME_OPS.has(op)) return `${frame.name} can't do that: a frame doesn't move, and waiting is the decker's own (VR2.0 p.106, p.117).`;
  if (copy && !activePrograms(frame).some(i => i.id === copy.id)) return `${copy.name} isn't running on ${frame.name} any more.`;
  return "";
}

/**
 * Why a SMART frame can't act now, or "" (6a-2c §1). Its own session must be on its host; its decker can be anywhere,
 * or logged off ("whether their creator is logged on or not", p.105).
 */
export function smartProblem(frame, { op = "", copy = null, after = false, move = false } = {}) {
  if (frame?.type !== "frame" || frame.system.kind === "dumb") return "Only a smart frame or an SK acts on its own.";
  if (frameState(frame).ended) return `${frame.name} has crashed.`;
  if (!frame.isOwner) return `Only ${frame.name}'s owner or the GM runs it.`;
  // 6b §4: an SK's own Logon to Host / Graceful Logoff runs on its attempt session (skMove), not a session on its host.
  if (move && isSK(frame)) return after || ["logonHost", "gracefulLogoff"].includes(op) ? "" : "That isn't a move.";
  const host = sync(frame.system.hostUuid);
  if (liveSession(frame)?.hostUuid !== frame.system.hostUuid || host?.type !== "host") return isSK(frame) && !frame.system.hostUuid
    ? `${frame.name} is between hosts: Logon to Host first (VR2.0 p.141).` : `${frame.name} has no session on its host.`;
  if (hostOffline(host)) return `${host.name} is shut down (VR2.0 p.53).`;
  if (after) return "";
  if (op === "decoy") return "Decoy frames are dumb frames (VR2.0 p.107).";
  if (op === "redirectDatatrail") return `${frame.name} has no datatrail of its own to redirect.`;
  if (NO_SMART_OPS.has(op)) return `${frame.name} can't do that: a frame doesn't move, or wait (VR2.0 p.106, p.117).`;
  if (copy && !activePrograms(frame).some(i => i.id === copy.id)) return `${copy.name} isn't running on ${frame.name} any more.`;
  return "";
}

/** The core's DINAB runs once per the OWNER's action (§5): claimed on the frame, keyed by his combat phase. */
export async function claimCoreDinab(frame, owner) {
  if (!(frame.system.dinabLeft > 0)) return `${frame.name}'s core has no DINAB left.`;
  const phase = phaseKey(owner);
  if (!phase) return "";   // outside combat there's no phase: a run is always allowed (as 5b's DINAB)
  return await once(frame, `coredinab:${frame.system.uploadId || frame.id}:${phase}`) ? "" : `${frame.name}'s core DINAB already ran on this action (VR2.0 p.106).`;
}

/** The decker's live decoy frame (§4; folded, never stored), or null. */
export function liveDecoyFrameOf(decker) {
  const n = decker?.system?.vr2Conn?.n;
  if (n == null) return null;
  return liveDecoyFrame({ records: recordsOf(decker), conn: n, sessionId: liveSession(decker)?.id ?? null,
    cardOf: (id) => { const st = game.messages.get(id)?.flags?.sr2e?.vr2SystemTest; return st ? { success: systemTestVerdict(st.successes, st.hostSuccesses).success } : null; },
    frameEnded: (u) => stateFor(decker, u).ended });
}
/** Has the live connection a decoy-frame record not yet switched off (whatever its card says)? */
export const hasOpenDecoyFrame = (decker) => openDecoyFrames(recordsOf(decker), decker?.system?.vr2Conn?.n ?? null).length > 0;

/**
 * "As long as the decker himself remains inactive" (p.107): any action of his own icon ends every decoy frame of the
 * connection for good — a sequencer fact (R1 #8), sent for ANY open record, so a later Karma success can't revive
 * one he has acted past (R1 #9). Not awaited by the sequencer: the order is the sequencer's.
 */
export async function ownAction(actor, why = "") {
  if (actor?.type !== "character" || !actor.system.vr2Conn) return;
  const n = actor.system.vr2Conn.n;
  for (const d of openDecoyFrames(recordsOf(actor), n)) await request(actor, "decoyFrameOff", { conn: n, decoy: d.key, why });
}

/**
 * Who security answers (R1 #7): a test made BY a frame is answered on that frame; the decker's own test while a
 * decoy frame lives goes to the frame. null = the frame is gone (nothing to hit). Never call inside the sequencer.
 */
export async function securityTarget(decker, st) {
  if (st?.icon) { const f = game.actors.get(st.icon.upload); return f && !frameState(f).ended ? f : null; }
  if (hasOpenDecoyFrame(decker)) {
    await flush();
    const live = liveDecoyFrameOf(decker), f = live ? game.actors.get(live.frame) : null;
    if (f && !frameState(f).ended) return f;
  }
  return decker;
}

/** Re-prepare an owner's frames after a fact about them landed on the owner (R1 #13). */
export function refreshFrames(owner) {
  for (const f of game.actors.filter(a => a.type === "frame" && a.system.ownerUuid === owner?.uuid)) {
    f.reset();
    if (f.sheet?.rendered) f.sheet.render();
  }
}

/** A crippler's loss on a frame (§6): the sequencer computes it; waits for the receipt like `hitFrame`. */
export async function attrFrame(frame, card, data) {
  // 6b §5: an SK's loss, computed by the sequencer from its own in-order fold.
  if (isSK(frame)) {
    if (!isSequencer()) { ui.notifications.warn("The active GM resolves an SK."); return null; }
    const nonce = foundry.utils.randomID();
    await sequencer(async () => {
      await completeMoves(frame);
      if (frameState(frame).ended || recordsOf(frame).some(e => e.type === "frameAttr" && e.card === card)) return;
      const st = game.messages.get(card)?.flags?.sr2e?.matrix;
      if (!st || st.targetUuid !== frame.uuid || st.effect !== "attribute" || !(st.attr in (frame.system.matrixPersona ?? {}))) return;
      const atk = await freezeSuccesses(st), def = Math.max(0, Number(data.defense) || 0);
      const cur = Math.max(0, (frame.system[st.attr] ?? 0) - skCondition(recordsOf(frame)).lost[st.attr]);
      const lost = attributeLoss(cur, Math.max(0, Math.floor((atk - def) / 2)), st.floor ?? 0);
      await fact(frame, `frame-attr:${card}`, { type: "frameAttr", upload: frame.id, card, attr: st.attr, lost, atk, def, res: data.res ?? 0,
        shield: data.shield ?? null, shieldS: data.shieldS ?? 0, nonce, closes: data.closes ?? [], effectName: st.effectName ?? "", rating: st.rating ?? 0 });
      frame.reset(); await replayWear(frame); await replayResolutions(frame);
    });
    const r = recordsOf(frame).find(e => e.type === "frameAttr" && e.card === card);
    return r ? { lost: r.lost, mine: r.nonce === nonce } : null;
  }
  const owner = sync(frame.system.ownerUuid);
  if (!owner) return null;
  const nonce = foundry.utils.randomID();
  const receipt = () => recordsOf(owner).find(e => e.type === "frameAttr" && e.card === card);
  if (!receipt()) await request(owner, "frameAttr", { upload: frame.system.uploadId || frame.id, card, nonce, ...data });
  const t0 = Date.now();
  while (!receipt() && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
  const r = receipt();
  return r ? { lost: r.lost, mine: r.nonce === nonce } : null;
}

const OPS_WITHOUT = new Set(["scanIcon"]);
/** The frame's Command dialog (§2): a System Operation, an attack, Scan Icon, a maneuver, or an event trigger. */
export async function commandFrame(actor, frame) {
  const why = commandProblem(actor, frame);
  if (why) return ui.notifications.warn(why);
  // 6a-2c §6: a smart frame acting as itself reuses this dialog (actor = frame): no pools, its DINAB is its skill.
  const smart = actor.uuid === frame.uuid;
  const host = sync(frame.system.hostUuid);
  const ops = Object.entries(CONFIG.SR2E.vr2SystemOperations).filter(([k, op]) => !(smart ? NO_SMART_OPS : NO_FRAME_OPS).has(k) && !OPS_WITHOUT.has(k)
    && op.utility && (isSK(frame) || bestUtility(frame, op.utility, host)));
  const hackingMax = actor.system.dicePools?.hacking?.value ?? 0, karma = actor.system.karma?.pool ?? 0;
  const core = !smart && frame.system.dinabLeft > 0;
  const kinds = [...(ops.length ? [["op", "System Operation"]] : []), ["attack", "Attack (the targeted icon)"], ["scan", "Scan Icon (the targeted icon)"],
    ["maneuver", "Maneuver (the targeted icon)"], ...(smart ? [] : [["trigger", "Set an event trigger"]])];
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: smart ? `${frame.name} acts` : `Command ${frame.name}` }, rejectClose: false,
    content: `<p style="font-size:11px;color:#aaa1c0;">${smart
      ? `A smart frame acts on its own (VR2.0 p.107): its DINAB-${frame.system.dinab} is its skill, its programs and attributes count, and its own tally rises.`
      : "A command is your Simple Action, even for a Complex operation; one command, one action (VR2.0 p.106). You roll your Computer; the frame's programs and attributes count; your datatrail takes the tally."}</p>
      <div class="form-group"><label>Command:</label><select name="kind">${kinds.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
      ${ops.length ? `<div class="form-group"><label>Operation:</label><select name="operation">${ops.map(([k, op]) =>
        `<option value="${k}">${esc(op.label)} (${esc(op.utility)}-${programRating(bestUtility(frame, op.utility, host))})</option>`).join("")}</select></div>
      <div class="form-group"><label>Targeted subsystem <span style="color:#958ba8;font-size:10px;">(Analyze Subsystem, Disinfect, Defuse)</span>:</label>
        <select name="subsystem">${["access", "control", "index", "files", "slave"].map(k => `<option value="${k}" ${k === "files" ? "selected" : ""}>${CONFIG.SR2E.vr2Subsystems[k]}</option>`).join("")}</select></div>
      ${smart ? "" : `<div class="form-group"><label>Hacking Pool dice <span style="color:#958ba8;font-size:10px;">(${hackingMax} left)</span>:</label>
        <input type="number" name="hacking" value="0" min="0" max="${hackingMax}" style="width:52px;text-align:center;"></div>`}
      ${karma > 0 && !smart ? `<div class="form-group"><label>Karma dice <span style="color:#958ba8;font-size:10px;">(pool ${karma})</span>:</label>
        <input type="number" name="karma_dice" value="0" min="0" max="${karma}" style="width:52px;text-align:center;"></div>` : ""}
      ${core ? `<div class="form-group"><label title="The core's DINAB runs the program itself: a Free Action, once per action of yours, no pools or Karma (VR2.0 p.106)">Run by the core's DINAB (${frame.system.dinabLeft}):</label>
        <input type="checkbox" name="coreDinab"></div>` : ""}
      ${miscDiceHTML()}` : ""}`,
    buttons: [{ action: "go", label: "Command", default: true, callback: (ev, b) => {
      const f = b.form.elements;
      return { kind: f.kind.value, operation: f.operation?.value ?? null, subsystem: f.subsystem?.value ?? null,
        hacking: Math.max(0, Math.min(hackingMax, parseInt(f.hacking?.value) || 0)), karmaDice: Math.max(0, Math.min(karma, parseInt(f.karma_dice?.value) || 0)),
        coreDinab: !!f.coreDinab?.checked, ...readMiscDice(b.form) };
    } }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel") return;
  const ctx = smart ? { frame, smart: true } : { frame };
  if (o.kind === "attack") return vr2MatrixAttack(actor, ctx);
  if (o.kind === "scan") return vr2ScanIcon(actor, ctx);
  if (o.kind === "maneuver") return vr2Maneuver(actor, ctx);
  if (o.kind === "trigger") return setTrigger(actor, frame);
  return vr2SystemTest(actor, host, o.operation, { ctx, subsystem: o.subsystem, hacking: o.coreDinab ? 0 : o.hacking,
    karmaDice: o.coreDinab ? 0 : o.karmaDice, coreDinab: o.coreDinab, miscDice: o.miscDice, miscLabel: o.miscLabel });
}

/**
 * A basic order to a smart frame (6a-2c §5): the decker's Free Action, given ON the frame's host (user ruling), recorded
 * on his log. Its effect is narrative — the player runs the frame. With "watch for", it also sets an event trigger.
 */
export async function orderFrame(actor, frame) {
  const problem = () => {
    const guard = vr2ActionGuard(actor);
    if (guard) return guard;
    if (frame?.type !== "frame" || frame.system.kind !== "smart" || frame.system.ownerUuid !== actor.uuid) return "Only your own smart frame takes orders.";
    if (frameState(frame).ended) return `${frame.name} has crashed.`;
    const here = topologyOn() ? currentPlace(actor)?.uuid : liveSession(actor)?.hostUuid;
    return here === frame.system.hostUuid ? "" : `Log on to ${sync(frame.system.hostUuid)?.name ?? "its host"} to give ${frame.name} an order.`;
  };
  if (problem()) return ui.notifications.warn(problem());
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: `Order ${frame.name}` }, rejectClose: false,
    content: `<p style="font-size:11px;color:#aaa1c0;">A basic order is a Free Action; the frame carries it out on its own actions (VR2.0 p.107).</p>
      <div class="form-group"><label>Order:</label><input type="text" name="text" placeholder="e.g. find and crash the Blaster IC"></div>
      <div class="form-group"><label>Also watch for it (event trigger):</label><select name="watch"><option value="">no</option>
        <option value="host">events of the host or its programs</option><option value="users">other deckers or users</option><option value="both">both</option></select></div>`,
    buttons: [{ action: "go", label: "Order", default: true, callback: (ev, b) => ({ text: b.form.elements.text.value.trim(), watch: b.form.elements.watch.value }) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel" || !o.text) return;
  if (problem()) return ui.notifications.warn(problem());
  const upload = frame.system.uploadId || frame.id;
  if (o.watch) {
    const w = watchers(frame), why = triggerProblems({ ...w, watch: o.watch });
    if (why.length) return ui.notifications.warn(`${frame.name} can't watch for that: ${why.join(" ")}`);
    await recordEvent(actor, `vr2:trigger:${upload}:${foundry.utils.randomID()}`, { type: "trigger", upload, watch: o.watch, note: o.text, frameName: frame.name });
  }
  await recordEvent(actor, `vr2:order:${upload}:${foundry.utils.randomID()}`, { type: "frameOrder", upload, text: o.text, at: game.time.worldTime });
  if (frame.sheet?.rendered) frame.sheet.render();
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperOwner(actor), content: `<div class="sr2e-item-card">
    ${esc(actor.name)} orders <strong>${esc(frame.name)}</strong>: ${esc(o.text)} (a Free Action, VR2.0 p.107).${o.watch ? " It watches for it as an event trigger." : ""}</div>` });
}
/** The latest order a smart frame was given (its owner's records). */
export const orderOf = (frame) => { const o = sync(frame?.system?.ownerUuid), u = frame?.system?.uploadId || frame?.id;
  return o ? recordsOf(o).filter(e => e.type === "frameOrder" && e.upload === u).sort((a, b) => (b.ct ?? 0) - (a.ct ?? 0))[0] ?? null : null; };

/** What the frame's watchers are worth on its host (§7): its Sensor and its best analyze and scanner copies. */
function watchers(frame) {
  const host = sync(frame.system.hostUuid), r = (n) => { const u = bestUtility(frame, n, host); return u ? programRating(u) : 0; };
  return { sensor: frame.system.matrixPersona?.sensor ?? 0, analyze: r("analyze"), scanner: r("scanner"), securityValue: host?.system?.securityValue ?? 0, host };
}

/** Set an event trigger (§7): a command (the decker's Simple Action) that writes a durable record on his log. */
export async function setTrigger(actor, frame) {
  const why = commandProblem(actor, frame, { op: "trigger" });
  if (why) return ui.notifications.warn(why);
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: `Event trigger — ${frame.name}` }, rejectClose: false,
    content: `<p style="font-size:11px;color:#aaa1c0;">The frame needs Sensor and the utility for what it watches at half the host's Security Value or more:
      analyze for the host and its programs, scanner for other deckers and users (VR2.0 p.107). The GM fires it when the event happens.</p>
      <div class="form-group"><label>Watch for:</label><select name="watch"><option value="host">events of the host or its programs</option>
        <option value="users">other deckers or legitimate users</option><option value="both">both</option></select></div>
      <div class="form-group"><label>The event:</label><input type="text" name="note" placeholder="e.g. the vault's slave node goes active"></div>`,
    buttons: [{ action: "go", label: "Set", default: true, callback: (ev, b) => ({ watch: b.form.elements.watch.value, note: b.form.elements.note.value.trim() }) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel") return;
  const w = watchers(frame), problems = triggerProblems({ ...w, watch: o.watch });
  if (problems.length) return ui.notifications.warn(`${frame.name} can't watch for that: ${problems.join(" ")}`);
  if (commandProblem(actor, frame, { op: "trigger" })) return ui.notifications.warn(commandProblem(actor, frame, { op: "trigger" }));
  const started = liveSession(actor)?.improvised?.id ?? null;
  const id = foundry.utils.randomID();
  await recordEvent(actor, `vr2:trigger:${frame.system.uploadId || frame.id}:${id}`, { type: "trigger", upload: frame.system.uploadId || frame.id,
    watch: o.watch, note: o.note || "an event", frameName: frame.name });
  await commitAction(actor, started);
  if (frame.sheet?.rendered) frame.sheet.render();
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperOwner(actor), content: `<div class="sr2e-item-card">
    ${esc(actor.name)} sets <strong>${esc(frame.name)}</strong> to watch for: ${esc(o.note || "an event")} (a Simple Action, VR2.0 p.107).
    <br><em>The GM fires it from the frame's sheet. The decker must be on ${esc(w.host?.name ?? "the host")} to get the message; waiting for it may need Null Operations (p.117).</em></div>` });
}

/** The triggers a frame carries (its owner's records). */
export const triggersOf = (frame) => { const o = sync(frame?.system?.ownerUuid); const u = frame?.system?.uploadId || frame?.id;
  return o ? recordsOf(o).filter(e => e.type === "trigger" && e.upload === u) : []; };

/** The GM fires a trigger (§7): a sequencer request, refused for anyone else (R1 #14). */
export function fireTrigger(frame, key) {
  if (!game.user.isGM) return ui.notifications.warn("The GM fires an event trigger.");
  const o = sync(frame.system.ownerUuid);
  if (o) return request(o, "triggerFire", { key, fire: foundry.utils.randomID() });
}

const whisperOwner = (actor) => game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);

/** Post each trigger firing's report from its fact (R2 #2): the sequencer, once per fact (an existence check). */
async function replayTriggerReports(owner) {
  for (const t of recordsOf(owner).filter(e => e.type === "triggerFire")) {
    if (game.messages.some(m => m.flags?.sr2e?.triggerFire === t.key)) continue;
    await ChatMessage.create({ speaker: { alias: t.frameName ?? "A frame" }, whisper: t.delivered ? whisperOwner(owner) : ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      content: `<div class="sr2e-item-card">${t.delivered ? `<strong>${esc(t.frameName)} reports:</strong> ${esc(t.note)} (event trigger, VR2.0 p.107).`
        : `${esc(t.frameName)}'s trigger (${esc(t.note)}) fired, but ${esc(owner.name)} doesn't get it: ${esc(t.why)}.`}</div>`,
      flags: { sr2e: { triggerFire: t.key } } });
  }
}

// ── Part 6b: the SK's pass, movement, pool and repair (all in the sequencer, the GM's) ──────────

const freshSession = (host) => ({ id: foundry.utils.randomID(), hostUuid: host?.uuid ?? "", hostName: host?.name ?? "", tally: 0, receipts: {}, conn: null });
const skHostId = (uuid) => String(uuid ?? "").split(".").pop();

/**
 * Complete EVERY move fact in order (6b §4, R2 #3, R3 #2, R4 #1), idempotently: a logoff deletes the session it LEFT
 * (by id); an arrival with `repair` gets its repair fact, placed at the move's seq; then the field and the live
 * session follow the latest move. An SK with no move is on its native host (R3 #1). Call only inside `sequencer`.
 */
async function completeMoves(sk) {
  if (!movesOf(sk).length) await fact(sk, "sk-move:0", { type: "skMove", n: 0, to: sk.system.nativeHostUuid, from: "", initial: true });
  for (const m of movesOf(sk)) {
    if (!m.to && m.sessionId && sk.flags?.sr2e?.vr2Session?.id === m.sessionId) await sk.update({ "flags.sr2e.-=vr2Session": null });
    if (m.to && m.repair && !recordsOf(sk).some(e => e.type === "skRepair" && e.move === m.n)) {
      await fact(sk, `sk-repair:arrive:${m.n}`, { type: "skRepair", full: true, unlock: true, at: m.seq ?? 0, move: m.n, why: "native host" });
    }
  }
  const last = movesOf(sk).at(-1), s = sk.flags?.sr2e?.vr2Session;
  if (last.to && s?.hostUuid !== last.to) {
    const stash = sk.flags?.sr2e?.skSessions?.[skHostId(last.to)];
    await sk.update({ "flags.sr2e.vr2Session": stash?.id ? stash : freshSession(sync(last.to)), [`flags.sr2e.skSessions.-=${skHostId(last.to)}`]: null });
  }
  if ((sk.system.hostUuid ?? "") !== (last.to ?? "")) await sk.update({ "system.hostUuid": last.to ?? "" });
}

/** The latest allocation fact, or an empty one (6b §3). */
const allocOf = (sk) => recordsOf(sk).filter(e => e.type === "skAlloc").sort((a, b) => (a.rev ?? 0) - (b.rev ?? 0)).at(-1) ?? { rev: 0, init: 0, items: [], locked: {} };
/** The restore/medic locks now: the latest allocation's, cleared by any later unlocking repair (p.141). */
function locksOf(sk) {
  const a = allocOf(sk);
  const unlocked = recordsOf(sk).some(e => e.type === "skRepair" && e.unlock && (e.at ?? e.seq ?? 0) > (a.seq ?? -1));
  return unlocked ? {} : (a.locked ?? {});
}

/** Make the SK's pool items match its latest allocation fact (6b §3, R1 #6): keepId creates, flagged deletes. */
async function reconcileSkItems(sk) {
  const a = allocOf(sk), want = new Map((a.items ?? []).map(i => [i.id, i]));
  const missing = [...want.values()].filter(i => !sk.items.get(i.id));
  if (missing.length) {
    try {
      await sk.createEmbeddedDocuments("Item", missing.map(i => ({ _id: i.id, name: i.name, type: "program",
        system: { rating: i.rating, loaded: true, category: "other", ...(i.level ? { damageLevel: i.level } : {}) },
        flags: { sr2e: { skPool: { rev: a.rev } } } })), { keepId: true, sr2eSkPool: true });
    } catch (e) { /* another pass made them: the id is the arbiter */ }
  }
  const drop = sk.items.filter(i => i.flags?.sr2e?.skPool && !want.has(i.id)).map(i => i.id);
  if (drop.length) { try { await sk.deleteEmbeddedDocuments("Item", drop, { sr2eSkPool: true }); } catch (e) { /* gone */ } }
}

/** A crashed SK's tokens and combatants go; the actor stays as the GM's record (6b §5). */
async function skCleanup(sk) {
  if (!frameState(sk).ended) return;
  for (const { t } of tokensOf(sk.id)) { try { await t.delete(); } catch (e) { /* gone */ } }
  for (const c of game.combats) for (const cb of c.combatants.filter(x => x.actorId === sk.id)) { try { await cb.delete(); } catch (e) { /* gone */ } }
}

/** One SK's pass (6b §5): moves, pool items, wear and resolutions, crash cleanup — each idempotent. */
export function skPass(sk) {
  if (!isSequencer() || !isSK(sk) || !game.actors.has(sk.id)) return Promise.resolve();
  return sequencer(async () => {
    await completeMoves(sk);
    await reconcileSkItems(sk);
    await (await import("./vr2ic.mjs")).reconcileTar(sk);   // an interrupted tar strike on its pool items
    await replayWear(sk); await replayResolutions(sk);
    await skCleanup(sk);
  });
}
const SK_PENDING = new Map();
export function scheduleSk(sk) {
  if (!isSequencer() || !isSK(sk)) return;
  clearTimeout(SK_PENDING.get(sk.id));
  SK_PENDING.set(sk.id, setTimeout(() => { SK_PENDING.delete(sk.id); skPass(sk).catch(err => console.error("SR2E | SK", err)); }, 200));
}
const gmOnly = () => { if (isSequencer()) return true; ui.notifications.warn("The active GM runs an SK."); return false; };

/**
 * Logon to Host / Graceful Logoff (6b §4): an SK leaves a host only by Graceful Logoff, and logs on only from between
 * hosts. A logon's attempt session is the DESTINATION's, so its tally lands there; only success writes a move fact.
 */
export async function skMove(sk, op, dest = null) {
  if (!isSK(sk) || !gmOnly()) return;
  if (frameState(sk).ended) return ui.notifications.warn(`${sk.name} has crashed.`);
  const moveFact = (data) => sequencer(async () => {
    await completeMoves(sk);
    if (frameState(sk).ended) return;
    const n = movesOf(sk).length;
    await fact(sk, `sk-move:${n}`, { type: "skMove", n, ...data });
    await completeMoves(sk);
  });
  if (op === "gracefulLogoff") {
    const here = sync(sk.system.hostUuid), s = liveSession(sk);
    if (here?.type !== "host" || !s) return ui.notifications.warn(`${sk.name} isn't on a host.`);
    const res = await vr2SystemTest(sk, here, "gracefulLogoff", { ctx: { frame: sk, smart: true, move: true } });
    const st = game.messages.get(res?.cardId)?.flags?.sr2e?.vr2SystemTest;
    if (st && systemTestVerdict(st.successes, st.hostSuccesses).success) await moveFact({ to: "", from: here.uuid, sessionId: s.id });
    return;
  }
  if (dest?.type !== "host") return ui.notifications.warn("Pick a host.");
  if (sk.system.hostUuid) return ui.notifications.warn(`${sk.name} is on ${sync(sk.system.hostUuid)?.name ?? "a host"}: SKs leave hosts only by Graceful Logoff (VR2.0 p.141).`);
  if (hostOffline(dest)) return ui.notifications.warn(`${dest.name} is shut down (VR2.0 p.53).`);
  // Its native host: its passcode, no test (p.140); the repair follows the move.
  if (dest.uuid === sk.system.nativeHostUuid) return moveFact({ to: dest.uuid, from: "", repair: true });
  // The attempt session: the destination's (a failed attempt's tally stays on it; another host's is stashed).
  await sequencer(async () => {
    await completeMoves(sk);
    const s = sk.flags?.sr2e?.vr2Session;
    if (s?.hostUuid === dest.uuid) return;
    const stash = sk.flags?.sr2e?.skSessions?.[skHostId(dest.uuid)];
    await sk.update({ "flags.sr2e.vr2Session": stash?.id ? stash : freshSession(dest), [`flags.sr2e.skSessions.-=${skHostId(dest.uuid)}`]: null,
      ...(s?.id ? { [`flags.sr2e.skSessions.${skHostId(s.hostUuid)}`]: s } : {}) });
  });
  const res = await vr2SystemTest(sk, dest, "logonHost", { ctx: { frame: sk, smart: true, move: true } });
  const st = game.messages.get(res?.cardId)?.flags?.sr2e?.vr2SystemTest;
  if (st && systemTestVerdict(st.successes, st.hostSuccesses).success) await moveFact({ to: dest.uuid, from: "" });
}
export async function skLogonDialog(sk) {
  const hosts = game.actors.filter(a => a.type === "host");
  const id = await foundry.applications.api.DialogV2.wait({ window: { title: `${sk.name}: Logon to Host` }, rejectClose: false,
    content: `<div class="form-group"><label>Host:</label><select name="host">${hosts.map(h => `<option value="${h.id}" ${h.uuid === sk.system.nativeHostUuid ? "selected" : ""}>${esc(h.name)}${h.uuid === sk.system.nativeHostUuid ? " (native: no test)" : ""}</option>`).join("")}</select></div>`,
    buttons: [{ action: "go", label: "Logon", default: true, callback: (ev, b) => b.form.elements.host.value }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (id && id !== "cancel") return skMove(sk, "logonHost", game.actors.get(id));
}

/** Allocate… (a Free Action, 6b §3): the whole allocation, checked and written in the sequencer, rev-fenced. */
export async function skAllocate(sk) {
  if (!isSK(sk) || !gmOnly()) return;
  if (frameState(sk).ended) return ui.notifications.warn(`${sk.name} has crashed.`);
  const a0 = allocOf(sk), rows = [...(a0.items ?? []), ...Array.from({ length: 4 }, () => ({ name: "", rating: 0, level: "" }))];
  const names = [...new Set((game.packs.get("sr2e.programs")?.index ?? []).map(e => e.name))].sort();
  const lvl = (v) => ["", "L", "M", "S", "D"].map(k => `<option value="${k}" ${k === (v ?? "") ? "selected" : ""}>${k || "—"}</option>`).join("");
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: `${sk.name}: Utility Pool (${sk.system.pool})` }, rejectClose: false,
    content: `<p style="font-size:11px;color:#aaa1c0;">A Free Action. 1 point = 1 rating point, max MPCP ${sk.system.coreRating}; black hammer and killjoy cost 2; restore and medic points stay until it regenerates on its native host (VR2.0 p.141).</p>
      <datalist id="sk-utils">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      ${rows.map((r, i) => `<div class="form-group"><input type="text" name="n${i}" list="sk-utils" value="${esc(r.name)}" placeholder="utility" style="flex:3">
        <input type="number" name="r${i}" value="${r.rating || ""}" min="0" max="${sk.system.coreRating}" style="width:52px">
        <select name="l${i}" title="Damage Level (attack utilities)">${lvl(r.level)}</select></div>`).join("")}
      <div class="form-group"><label>Initiative points:</label><select name="init">${[0, 1, 3, 5].map(v => `<option value="${v}" ${v === (a0.init ?? 0) ? "selected" : ""}>${v} (${["1D6", "2D6", "", "3D6", "", "4D6"][v]})</option>`).join("")}</select></div>`,
    buttons: [{ action: "go", label: "Allocate", default: true, callback: (ev, b) => {
      const f = b.form.elements;
      return { init: Number(f.init.value) || 0, alloc: rows.map((r, i) => ({ name: f[`n${i}`].value.trim(), rating: Math.max(0, parseInt(f[`r${i}`].value) || 0), level: f[`l${i}`].value }))
        .filter(x => x.name && x.rating > 0) };
    } }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel") return;
  const why = await sequencer(async () => {
    await completeMoves(sk);
    if (frameState(sk).ended) return `${sk.name} has crashed.`;
    const a = allocOf(sk);
    if ((a.rev ?? 0) !== (a0.rev ?? 0)) return "Allocated elsewhere meanwhile: reopen (6b R2 #4).";
    const locked = locksOf(sk);
    const problems = poolProblems({ pool: sk.system.pool, mpcp: sk.system.coreRating, alloc: o.alloc, init: o.init, locked });
    if (problems.length) return problems.join(" ");
    // An unchanged, working utility keeps its item (and wear); a changed or crashed one is a fresh version (R1 #6).
    const items = o.alloc.map(x => {
      const old = (a.items ?? []).find(i => i.name.toLowerCase() === x.name.toLowerCase() && i.rating === x.rating && (i.level ?? "") === (x.level ?? ""));
      const item = old ? sk.items.get(old.id) : null;
      return { id: item && activePrograms(sk).includes(item) ? old.id : foundry.utils.randomID(16), name: x.name, rating: x.rating, ...(x.level ? { level: x.level } : {}) };
    });
    const rev = (a.rev ?? 0) + 1;
    await fact(sk, `sk-alloc:${rev}`, { type: "skAlloc", rev, init: o.init, items, locked: nextLocks(locked, o.alloc) });
    await reconcileSkItems(sk);
    return "";
  });
  if (why) return ui.notifications.warn(why);
  ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">${esc(sk.name)} allocates its Utility Pool:
    ${o.alloc.map(x => `${esc(x.name)}-${x.rating}`).join(", ") || "nothing"}${o.init ? `; Initiative +${o.init}` : ""} (a Free Action, VR2.0 p.141).</div>` });
}

/** Regenerate (6b §5; p.140): on its native host, a Complex Action at Medic or Restore strength = MPCP, no pool. */
export async function skRegenerate(sk) {
  if (!isSK(sk) || !gmOnly()) return;
  if (frameState(sk).ended) return ui.notifications.warn(`${sk.name} has crashed.`);
  if (sk.system.hostUuid !== sk.system.nativeHostUuid) return ui.notifications.warn(`${sk.name} regenerates only on its native host (VR2.0 p.140).`);
  const c = skCondition(recordsOf(sk)), mpcp = sk.system.coreRating;
  const attrs = Object.entries(c.lost).filter(([, v]) => v > 0);
  if (!c.monitor && !attrs.length) return ui.notifications.info(`${sk.name} is undamaged.`);
  const pick = await foundry.applications.api.DialogV2.wait({ window: { title: `${sk.name}: Regenerate` }, rejectClose: false,
    content: `<p>MPCP-${mpcp} dice, as a medic or restore program, without the pool (a Complex Action, VR2.0 p.140).</p>`,
    buttons: [...(c.monitor ? [{ action: "medic", label: `Medic (${c.monitor} boxes)` }] : []),
      ...attrs.map(([k, v]) => ({ action: k, label: `Restore ${k} (−${v})` }))] });
  if (!pick) return;
  let tn, data;
  if (pick === "medic") tn = medicTN(c.monitor);
  else {
    // Restore's TN: the rating of the program that did the damage, the higher if several (p.100).
    tn = Math.max(2, ...recordsOf(sk).filter(e => e.type === "frameAttr" && e.attr === pick && e.lost > 0).map(e => Number(e.rating) || 2));
  }
  const r = await sk.rollSuccessTest(Math.max(1, mpcp), tn, { label: `${sk.name} regenerates (${pick === "medic" ? "Medic" : `Restore ${pick}`}, TN ${tn})`, closed: true, tnContext: { kind: "other" }, tnPolicy: "table" });
  if (!r) return;
  data = pick === "medic" ? { boxes: r.successes } : { attr: pick, points: restorePoints(r.successes, c.lost[pick]) };
  await sequencer(async () => {
    await completeMoves(sk);
    if (frameState(sk).ended || sk.system.hostUuid !== sk.system.nativeHostUuid) return;
    await fact(sk, `sk-repair:${r.testMessageId}`, { type: "skRepair", ...data, why: "regenerate" });
    sk.reset();
  });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: sk }), content: `<div class="sr2e-item-card">${esc(sk.name)} regenerates on its native host:
    ${pick === "medic" ? `${Math.min(c.monitor, r.successes)} box${r.successes === 1 ? "" : "es"} repaired` : `${data.points} point${data.points === 1 ? "" : "s"} of ${pick} restored`} (VR2.0 p.140).</div>` });
}

/** New SK… (the GM; 6b §2): MPCP 1D6 + 6, persona ratings checked, Utility Pool MPCP + 1D6, on its native host. */
export async function newSkDialog() {
  if (!game.user.isGM) return;
  const hosts = game.actors.filter(a => a.type === "host");
  if (!hosts.length) return ui.notifications.warn("Create its native host first: an SK is born on one (VR2.0 p.140).");
  const o = await foundry.applications.api.DialogV2.wait({ window: { title: "New SK (semi-autonomous knowbot)" }, rejectClose: false,
    content: `<p style="font-size:11px;color:#aaa1c0;">MPCP 1D6 + 6; Bod + Evasion + Masking + Sensor ≤ MPCP × 3, each ≤ MPCP; Computer = MPCP; Utility Pool = MPCP + 1D6 (VR2.0 p.140–141). Leave a number blank to roll it.</p>
      <div class="form-group"><label>Name:</label><input type="text" name="name" value="SK"></div>
      <div class="form-group"><label>Native host:</label><select name="host">${hosts.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join("")}</select></div>
      <div class="form-group"><label>Preset (p.141):</label><select name="preset"><option value="">— set or roll below —</option>${SK_PRESETS.map((p, i) => `<option value="${i}">MPCP-${p.join("/")}</option>`).join("")}</select></div>
      <div class="form-group"><label>MPCP:</label><input type="number" name="mpcp" min="7" max="12" placeholder="1D6 + 6"></div>
      ${["bod", "evasion", "masking", "sensor"].map(k => `<div class="form-group"><label>${k[0].toUpperCase() + k.slice(1)}:</label><input type="number" name="${k}" min="0" max="12"></div>`).join("")}
      <div class="form-group"><label>Utility Pool:</label><input type="number" name="pool" min="0" placeholder="MPCP + 1D6"></div>`,
    buttons: [{ action: "go", label: "Create", default: true, callback: (ev, b) => Object.fromEntries([...new FormData(b.form)].map(([k, v]) => [k, String(v).trim()])) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!o || o === "cancel") return;
  const preset = o.preset !== "" ? SK_PRESETS[Number(o.preset)] : null;
  const roll = async (formula, flavor) => { const r = await new Roll(formula).evaluate(); await r.toMessage({ flavor, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) }); return r.total; };
  const mpcp = preset ? preset[0] : o.mpcp ? Number(o.mpcp) : await roll("1d6 + 6", "SK MPCP: 1D6 + 6 (VR2.0 p.140)");
  const attrs = preset ? { bod: preset[1], evasion: preset[2], masking: preset[3], sensor: preset[4] }
    : Object.fromEntries(["bod", "evasion", "masking", "sensor"].map(k => [k, Number(o[k]) || 0]));
  const why = skProblems({ mpcp, ...attrs });
  if (why.length) return ui.notifications.warn(why.join(" "));
  const pool = o.pool ? Number(o.pool) : await roll(`${mpcp} + 1d6`, `${o.name || "SK"}'s Utility Pool: MPCP + 1D6 (VR2.0 p.141)`);
  const host = game.actors.get(o.host), id = foundry.utils.randomID(16);
  const sk = await Actor.create({ _id: id, name: o.name || "SK", type: "frame", img: "icons/svg/eye.svg",
    prototypeToken: { actorLink: true, name: o.name || "SK", disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE },
    system: { kind: "sk", coreRating: mpcp, dinab: mpcp, ...attrs, pool, uploadId: id, nativeHostUuid: host.uuid, hostUuid: host.uuid } }, { keepId: true });
  if (sk) await skPass(sk);
  sk?.sheet.render(true);
  return sk;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function registerFrameHooks() {
  setFrameEnded((fr) => frameState(fr).ended);
  // 6b §5: an SK's own record lands → its pass (the active GM's).
  Hooks.on("createActiveEffect", (e) => { if (isSK(e.parent) && e.flags?.sr2e?.claim?.durable) scheduleSk(e.parent); });
  // 6a-2c §7 (R2 #2): a smart frame may newly belong in a combat — when one starts, or its owner joins one.
  const ownsSmart = (a) => a?.type === "character" && game.actors.some(f => f.type === "frame" && f.system.kind === "smart" && f.system.ownerUuid === a.uuid);
  Hooks.on("updateCombat", (c, ch) => { if (ch?.started === true || ("round" in (ch ?? {}) && c.started)) for (const cb of c.combatants) if (ownsSmart(cb.actor)) schedule(cb.actor); });
  Hooks.on("createCombatant", (cb) => { if (ownsSmart(cb.actor)) schedule(cb.actor); });
  // A frame's programs are object-code copies: never edited or removed while it runs (p.106), but wear/crash/load
  // state still changes as for any program.
  const DESIGN = ["rating", "multiplier", "options", "damageLevel", "offense", "manufacturer", "category", "frameCore"];
  Hooks.on("preUpdateItem", (item, changes, options) => {
    if (item.parent?.type !== "frame" || options?.sr2eSkPool) return;
    if ("name" in changes || DESIGN.some(k => k in (changes.system ?? {}))) { ui.notifications.warn("A running frame's programs are copies: they can't be changed."); return false; }
  });
  Hooks.on("preDeleteItem", (item, options) => {
    if (item.parent?.type === "frame" && !options?.sr2eSkPool) { ui.notifications.warn("A running frame's programs can't be removed."); return false; }
  });
  const ownerOf = (a) => (a?.type === "frame" ? sync(a.system.ownerUuid) : null);
  // The owner's open sheet lists its running frames: refresh it when one appears or goes.
  for (const h of ["createActor", "deleteActor"]) Hooks.on(h, (a) => { const o = ownerOf(a); if (o) { schedule(o); if (o.sheet?.rendered) o.sheet.render(); } });
  for (const h of ["createToken", "deleteToken"]) Hooks.on(h, (t) => { const o = ownerOf(t.actor ?? game.actors.get(t.actorId)); if (o) schedule(o); });
  // The GM deleting a frame by hand: its end, for the record (§4).
  Hooks.on("deleteActor", (a, options) => {
    if (a.type !== "frame" || options?.sr2eFrameCleanup || !isSequencer()) return;
    const o = sync(a.system.ownerUuid);
    if (o) sequencer(() => fact(o, `frame-end:${a.system.uploadId || a.id}`, { type: "frameEnd", upload: a.system.uploadId || a.id, why: "deleted by the GM" }))
      .catch(err => console.error("SR2E | frames", err));
  });
  // A session switch is a flag write, not a record: wake the owner's pass (7b lesson).
  Hooks.on("updateActor", (a, changes) => {
    if (a.type === "character" && foundry.utils.hasProperty(changes, "flags.sr2e.vr2Session")) schedule(a);
  });
  // 6a-2b R1 #13: a fact about a frame lands on its OWNER; re-prepare that owner's frames on every client.
  Hooks.on("createActiveEffect", (e) => { const a = e.parent; if (a?.type === "character" && e.flags?.sr2e?.claim?.event?.type === "frameAttr") refreshFrames(a); });
  // An owner or a host deleted: their frames end (derived) and are swept at once (code R1 #3).
  Hooks.on("deleteActor", (a) => { if (["character", "host"].includes(a.type)) reconcileAllFrames(); });
  Hooks.once("ready", reconcileAllFrames);
  Hooks.on("userConnected", () => reconcileAllFrames());
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-frame-btn").forEach(b => b.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (b.dataset.op === "uploadDone") {
        if (!game.user.isGM) return ui.notifications.warn("The GM finishes an upload.");
        const a = sync(b.dataset.actor);
        if (a) request(a, "uploadDone", { upload: b.dataset.arg });
      }
    }));
  });
}

/** For tests and the GM: the frames this decker is running (live ones). */
export const framesOf = (owner) => game.actors.filter(a => a.type === "frame" && a.system.ownerUuid === owner?.uuid && !frameState(a).ended);
