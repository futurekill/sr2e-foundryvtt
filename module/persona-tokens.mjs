/**
 * Persona tokens appear when a decker jacks in (docs/PLAN-matrix-persona-tokens.md).
 *
 * While a character has a live jackpoint session, its persona — a linked token flagged
 * `persona` + `personaManaged` — stands in the session's entry Region on the Matrix scene;
 * when the session ends the token goes. A persona the GM placed by hand (`persona` without
 * `personaManaged`) is never touched, and a usable one makes a managed one unnecessary.
 *
 * Same shape as astral forms (module/astral-forms.mjs): players can't create or delete
 * tokens and socket relays are unreliable at this table, so the ACTIVE GM's client is the
 * only writer. It reacts to replicated document changes, recomputes the desired state from
 * fresh documents (desiredPersonas) before every write, and re-checks its authority between
 * writes. Every write fires create/deleteToken, which schedules the scene again.
 */

import { desiredPersonas, placePersona } from "./rules/jackpoint-rules.mjs";
import { personaUsable, liveSession, sessionRegion, sessionsOf } from "./jackpoints.mjs";

/** Test seams: force the writer flag; delay a create (an in-flight write). */
export const personaSeam = { isWriter: null, beforeCreate: null };
const isWriter = () => personaSeam.isWriter ?? !!game.user?.isActiveGM;

const managed = (t) => !!t.getFlag("sr2e", "personaManaged");

/** The pure rule's view of a scene. */
function input(scene) {
  const tokens = scene.tokens.filter(t => t.getFlag("sr2e", "persona")).map(t => ({
    id: t.id, actorId: t.actorId, actorLink: !!t.actorLink, managed: managed(t), usable: personaUsable(t, scene) }));
  const live = new Set(game.actors.filter(a => a.type === "character" && liveSession(a)?.destScene === scene.id).map(a => a.id));
  return { tokens, live };
}

/** Token data for a new persona, placed inside the session's entry Region; null if it has none. */
async function personaData(actor, scene, session) {
  const region = sessionRegion(session);
  if (!region || region.parent?.id !== scene.id) return null;
  const data = (await actor.getTokenDocument({ actorLink: true })).toObject();
  delete data._id;
  const g = scene.grid.size;
  const w = (data.width ?? 1) * g, h = (data.height ?? 1) * g;
  const occupied = scene.tokens.map(t => ({ x: t.x, y: t.y, w: (t.width ?? 1) * g, h: (t.height ?? 1) * g }));
  const spot = placePersona({ bounds: region.bounds, grid: g, w, h, occupied,
    rings: region.polygons.map(p => p.points), inside: (x, y) => region.polygonTree.testPoint({ x, y }) });
  let x, y;
  if (spot) ({ x, y } = spot);
  else {
    // Smaller than the token: its centre, and tell the GM why it overhangs.
    const b = region.bounds;
    x = b.x + b.width / 2 - w / 2; y = b.y + b.height / 2 - h / 2;
    console.warn(`SR2E | persona tokens: entry area "${region.name}" on ${scene.name} is smaller than ${actor.name}'s token.`);
  }
  const icon = actor.system?.matrixIcon;
  return foundry.utils.mergeObject(data, {
    x, y, actorLink: true, hidden: false, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
    sight: { enabled: true }, flags: { sr2e: { persona: true, personaManaged: true } },
    ...(icon ? { texture: { src: icon } } : {})
  });
}

/** One pass over a scene: delete surplus managed personas, then create missing ones. */
async function reconcileScene(scene) {
  if (!isWriter() || !scene || !game.scenes.has(scene.id)) return;
  const plan = desiredPersonas(input(scene));
  for (const r of plan.remove) {
    if (!isWriter()) return;
    // Re-derive from fresh documents before each delete (an adoption may have run).
    if (!desiredPersonas(input(scene)).remove.some(x => x.id === r.id)) continue;
    try { await scene.tokens.get(r.id)?.delete(); } catch (e) { /* already gone */ }
  }
  for (const actorId of plan.create) {
    if (!isWriter()) return;
    if (!desiredPersonas(input(scene)).create.includes(actorId)) continue;
    const actor = game.actors.get(actorId);
    const data = actor ? await personaData(actor, scene, liveSession(actor)) : null;
    if (!data) continue;
    await personaSeam.beforeCreate?.();
    await scene.createEmbeddedDocuments("Token", [data]);
  }
}

// Per-scene serial queue, debounced: a burst of changes becomes one pass.
const queues = new Map(), timers = new Map();
const enqueue = (sceneId, fn) => {
  const next = (queues.get(sceneId) ?? Promise.resolve()).then(fn).catch(e => console.error("SR2E | persona tokens", e));
  queues.set(sceneId, next);
  return next;
};
export function schedulePersonaScene(scene) {
  if (!scene || !isWriter()) return;
  clearTimeout(timers.get(scene.id));
  timers.set(scene.id, setTimeout(() => {
    timers.delete(scene.id);
    enqueue(scene.id, () => reconcileScene(game.scenes.get(scene.id)));
  }, 100));
}
/** The scenes an actor's persona may be on: its sessions' destinations and any holding its managed token (R1 #4). */
export function schedulePersonas(actor) {
  if (!actor || !isWriter()) return;
  const ids = new Set(Object.values(sessionsOf(actor)).map(r => r?.destScene).filter(Boolean));
  for (const s of game.scenes) if (ids.has(s.id) || s.tokens.some(t => t.actorId === actor.id && managed(t))) schedulePersonaScene(s);
}
const scheduleAll = () => { for (const s of game.scenes) schedulePersonaScene(s); };
/** Await everything queued (tests). */
export async function personaReconcileIdle() {
  await new Promise(r => setTimeout(r, 150));
  await Promise.all([...queues.values()]);
}

/**
 * GM: keep a managed persona — it becomes hand-placed and stays after jack-out. Only on the
 * active GM's client, inside the writer's scene queue, so it can't interleave with a delete (R1 #10).
 */
export function adoptPersona(token) {
  if (!isWriter() || !token?.parent) return;
  const scene = token.parent;
  return enqueue(scene.id, async () => {
    const t = game.scenes.get(scene.id)?.tokens.get(token.id);
    if (t && managed(t)) await t.update({ "flags.sr2e.personaManaged": false });
  });
}

export function registerPersonaTokenHooks() {
  // Session and Matrix-mode changes reach this module through jackpoints' scheduleReconcile.
  Hooks.on("deleteActor", (actor) => {
    for (const s of game.scenes) if (s.tokens.some(t => t.actorId === actor.id && managed(t))) schedulePersonaScene(s);
  });
  const personaToken = (doc) => !!doc.getFlag?.("sr2e", "persona") || !!doc.flags?.sr2e?.persona;
  Hooks.on("createToken", (doc) => { if (personaToken(doc)) schedulePersonaScene(doc.parent); });
  Hooks.on("deleteToken", (doc) => { if (personaToken(doc)) schedulePersonaScene(doc.parent); });
  // Marking, adopting, hiding, unlinking — never plain movement (R1 #5).
  Hooks.on("updateToken", (doc, changes) => {
    const fl = changes.flags ?? {};
    const keys = Object.keys(fl.sr2e ?? {});
    const flagged = "-=sr2e" in fl || ["persona", "personaManaged", "-=persona", "-=personaManaged"].some(k => keys.includes(k));
    if (flagged || ["actorLink", "actorId", "hidden", "sight"].some(k => k in changes)) schedulePersonaScene(doc.parent);
  });
  Hooks.once("ready", scheduleAll);
  // GM handoff: the newly designated active GM heals anything left half-done (R1 #3).
  Hooks.on("userConnected", () => { if (isWriter()) scheduleAll(); });
}
