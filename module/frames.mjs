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
import { recordsOf, fact, sequencer, isSequencer, request, schedule, hostOffline, addHandlers } from "./vr2ic.mjs";
import { liveSession, currentPlace, addWear, commitAction, dinabZeroed } from "./vr2.mjs";
import { topologyOn, isVR2 } from "./vr2-mode.mjs";
import { uploadSeconds, uploadTurns, departedSince, frameMonitor, shutdownOfflineSeqs, frameEnds, copyStats } from "./rules/vr2-frames.mjs";
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
/** The same for a frame actor. */
export const frameState = (frame) => stateFor(sync(frame?.system?.ownerUuid), frame?.system?.uploadId || frame?.id);

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
    if (game.messages.some(m => m.flags?.sr2e?.resolves === h.card)) continue;
    const st = game.messages.get(h.card)?.flags?.sr2e?.matrix;
    const frame = game.actors.get(h.upload);
    const name = frame?.name ?? of(recordsOf(owner), "uploadOpen", h.upload)?.snapshot?.coreName ?? "The frame";
    const after = frameMonitor(recordsOf(owner).filter(e => (e.seq ?? 0) <= (h.seq ?? 0)), h.upload);
    const crashed = h.boxes > 0 && after >= 10;
    const text = h.boxes > 0 ? `${name} takes ${LEVELS[h.level] ?? ""} Matrix damage: ${h.boxes} box${h.boxes === 1 ? "" : "es"} (${after}/10).` : `${name} resists the Matrix attack.`;
    const lines = [...(h.shield ? [`Shield: −${h.shieldS} attack success${h.shieldS === 1 ? "" : "es"}.`] : []),
      ...(h.armor ? [`${h.armor.name} loses a point.`] : []), ...(crashed ? ["The frame crashes (VR2.0 p.124)."] : [])];
    await ChatMessage.create({ speaker: { alias: name }, content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
      <br><em>${h.atk} attack success${h.atk === 1 ? "" : "es"} vs ${h.res} resistance success${h.res === 1 ? "" : "es"}.</em>
      ${lines.map(l => `<br>${esc(l)}`).join("")}</div>`,
      flags: { sr2e: { resolves: h.card, closesTests: h.closes ?? [], matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}` } } });
    if (!h.boxes && st) await dinabZeroed(st, { card: h.card, requester: owner });
  }
}

/** Re-apply Armor/Shield wear named in each hit (idempotent, card-keyed: R2 #2). */
async function replayWear(owner) {
  for (const h of recordsOf(owner).filter(e => e.type === "frameHit")) {
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
  await reconcileDocs(actor);
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
    // A departure that landed while we wrote (R1 #5): undo it at once.
    if (ended()) await removeFrame(game.actors.get(id));
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
    for (const f of game.actors.filter(a => a.type === "frame")) if (!sync(f.system.ownerUuid) || sync(f.system.hostUuid)?.type !== "host") await removeFrame(f);
  }).catch(err => console.error("SR2E | frames", err));
  for (const f of game.actors.filter(a => a.type === "frame")) { const o = sync(f.system.ownerUuid); if (o) schedule(o); }
}

// ── Damage (the resist path calls this) ──────────────────────────────────────

/**
 * Apply a resolved hit to a frame (§5, R1 #9): a request the sequencer turns into ONE card-keyed fact (a full resist
 * too: 0 boxes). Waits for it (a GM is always online) and returns the monitor before and after, and whether THIS
 * resolution's receipt won (code R1 #2); null if nothing was written.
 */
export async function hitFrame(frame, card, boxes, armorRef = null, shieldRef = null, report = {}) {
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

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function registerFrameHooks() {
  // A frame's programs are object-code copies: never edited or removed while it runs (p.106), but wear/crash/load
  // state still changes as for any program.
  const DESIGN = ["rating", "multiplier", "options", "damageLevel", "offense", "manufacturer", "category", "frameCore"];
  Hooks.on("preUpdateItem", (item, changes) => {
    if (item.parent?.type !== "frame") return;
    if ("name" in changes || DESIGN.some(k => k in (changes.system ?? {}))) { ui.notifications.warn("A running frame's programs are copies: they can't be changed."); return false; }
  });
  Hooks.on("preDeleteItem", (item) => {
    if (item.parent?.type === "frame") { ui.notifications.warn("A running frame's programs can't be removed."); return false; }
  });
  const ownerOf = (a) => (a?.type === "frame" ? sync(a.system.ownerUuid) : null);
  for (const h of ["createActor", "deleteActor"]) Hooks.on(h, (a) => { const o = ownerOf(a); if (o) schedule(o); });
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
