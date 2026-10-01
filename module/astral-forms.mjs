/**
 * Projection leaves the body (docs/PLAN-astral-barriers.md, Stage 2; SR2 p.146).
 *
 * While a linked character is projecting, its body token stays where it is
 * (comatose, marked) and an astral-form token — same actor, flagged
 * `astralForm: <body uuid>` + `astralOnly` — moves about instead, walking through
 * ordinary walls (module/astral-walls.mjs). When projection ends the form is
 * removed: the aura goes back to wherever the body is.
 *
 * Players can't create or delete tokens by default (TOKEN_CREATE/DELETE default to
 * ASSISTANT) and socket relays are unreliable at this table, so the ACTIVE GM's
 * client is the only writer. It reacts to document changes that replicate to every
 * client, recomputes the desired state from fresh documents (desiredForms), and
 * re-checks its authority before each write. Duplicates converge on the lowest id.
 */

import { isProjectingBody, desiredForms, bodyMovedWhileOut } from "./rules/astral-rules.mjs";

const isWriter = () => !!game.user?.isActiveGM;

/** The scene's tokens as the pure rule sees them. */
function snapshot(scene) {
  return scene.tokens.map(t => ({
    id: t.id, uuid: t.uuid, actorLink: !!t.actorLink,
    projecting: !!t.actorLink && t.actor?.system?.astralState === "projecting",
    flags: t.flags?.sr2e ?? {}
  }));
}

/** Is this token document a projecting body (for the marker cue)? */
export function isBodyToken(doc) {
  return isProjectingBody({ actorLink: !!doc?.actorLink,
    projecting: !!doc?.actorLink && doc.actor?.system?.astralState === "projecting", flags: doc?.flags?.sr2e ?? {} });
}

/** The astral form for a body, built from the body's own token data. */
function formData(body) {
  const data = body.toObject();
  delete data._id;
  const sr2e = { ...(data.flags?.sr2e ?? {}) };
  for (const k of ["moveLedger", "fabReveal", "fabExitGen", "astralFast", "persona"]) delete sr2e[k];
  Object.assign(sr2e, { astralForm: body.uuid, astralOnly: true, astralFormOrigin: { x: body.x, y: body.y } });
  data.flags = { ...(data.flags ?? {}), sr2e };
  data.name = `${body.name} (astral)`;
  data.lockRotation = true;
  return data;
}

/** One pass over a scene: delete surplus forms, then create missing ones. */
async function reconcileScene(scene) {
  if (!isWriter() || !scene || !game.scenes.has(scene.id)) return;
  const plan = desiredForms(snapshot(scene));
  for (const r of plan.remove) {
    if (!isWriter()) return;
    const form = scene.tokens.get(r.id);
    if (!form) continue;
    // Re-derive from fresh documents before each delete (another writer may have acted).
    if (!desiredForms(snapshot(scene)).remove.some(x => x.id === r.id)) continue;
    const body = fromUuidSync(r.bodyUuid);
    const origin = form.getFlag("sr2e", "astralFormOrigin");
    try { await form.delete(); } catch (e) { continue; }   // already gone: fine
    // Only a real return (projection ended), not a form removed because its body
    // stopped being eligible (marked astral-only, a persona, unlinked).
    const ended = body?.actor?.system?.astralState !== "projecting";
    if (r.reason === "returned" && ended && body && bodyMovedWhileOut(origin, body)) {
      ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM"), speaker: { alias: body.name },
        content: `<p><strong>${body.name}</strong>'s aura returned, but the body was moved while it was out. The magician must find it: a test of Body or Willpower (whichever is higher) against TN 4, base time 6 hours ÷ successes (SR2E p.146).</p>` });
    }
  }
  for (const bodyUuid of plan.create) {
    if (!isWriter()) return;
    const body = fromUuidSync(bodyUuid);
    if (!body || body.parent !== scene) continue;
    if (!desiredForms(snapshot(scene)).create.includes(bodyUuid)) continue;
    await scene.createEmbeddedDocuments("Token", [formData(body)]);
  }
}

// Per-scene serial queue, debounced: a burst of changes becomes one pass.
const queues = new Map(), timers = new Map();
export function scheduleAstralReconcile(scene) {
  if (!scene || !isWriter()) return;
  clearTimeout(timers.get(scene.id));
  timers.set(scene.id, setTimeout(() => {
    timers.delete(scene.id);
    const prev = queues.get(scene.id) ?? Promise.resolve();
    const next = prev.then(() => reconcileScene(game.scenes.get(scene.id))).catch(e => console.error("SR2E | astral forms", e));
    queues.set(scene.id, next);
  }, 100));
}
/** Await everything queued (tests). */
export async function astralReconcileIdle() {
  await new Promise(r => setTimeout(r, 150));
  await Promise.all([...queues.values()]);
}

/** Scenes holding a token of this actor (bodies and their forms share the actor). */
function scenesOfActor(actorId) {
  return game.scenes.filter(s => s.tokens.some(t => t.actorId === actorId));
}
const scheduleAll = () => { for (const s of game.scenes) scheduleAstralReconcile(s); };

function refreshBodyCues(actorId) {
  if (!canvas?.ready) return;
  for (const t of canvas.tokens.placeables) if (t.document.actorId === actorId) t.renderFlags.set({ refreshState: true });
}

export function registerAstralFormHooks() {
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (!foundry.utils.hasProperty(changes, "system.astralState")) return;
    for (const s of scenesOfActor(actor.id)) scheduleAstralReconcile(s);
    refreshBodyCues(actor.id);
    // Tell the player who started projecting why no form may appear.
    if (userId !== game.user.id || changes.system.astralState !== "projecting") return;
    if (!game.users.activeGM) ui.notifications.warn(`${actor.name}: no GM is connected — the astral form appears when one is.`);
    else if (!actor.getActiveTokens(false, true).some(t => t.actorLink))
      ui.notifications.info(`${actor.name}: astral forms are automatic for linked tokens only — the GM can mark a token astral-only instead.`);
  });
  Hooks.on("deleteActor", (actor) => { for (const s of scenesOfActor(actor.id)) scheduleAstralReconcile(s); });
  Hooks.on("createToken", (doc) => scheduleAstralReconcile(doc.parent));
  Hooks.on("deleteToken", (doc) => scheduleAstralReconcile(doc.parent));
  Hooks.on("updateToken", (doc, changes) => {
    const f = changes.flags ?? {};
    if (f.sr2e !== undefined || "-=sr2e" in f || "actorId" in changes || "actorLink" in changes) scheduleAstralReconcile(doc.parent);
  });
  Hooks.on("canvasReady", (c) => scheduleAstralReconcile(c.scene));
  Hooks.once("ready", scheduleAll);
  // GM handoff: the newly designated active GM heals anything left half-done.
  Hooks.on("userConnected", () => { if (isWriter()) scheduleAll(); });

  // The comatose body: a violet ring, like the jacked-in decker's cyan one.
  Hooks.on("refreshToken", (t) => {
    let ring = t.getChildByName?.("sr2eProjecting");
    const marked = isBodyToken(t.document);
    if (marked && !ring) {
      ring = new PIXI.Graphics(); ring.name = "sr2eProjecting";
      ring.lineStyle(4, 0xB68CFF, 0.9).drawRoundedRect(2, 2, t.w - 4, t.h - 4, 8);
      t.addChild(ring);
    }
    if (ring) ring.visible = marked;
  });
}
