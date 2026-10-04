/**
 * "Who is this user targeting?" — one answer for every attack, spell and card
 * (docs/PLAN-companion.md, Stage 3).
 *
 * Foundry keeps targets as Token PLACEABLES in `game.user.targets`, which only exist
 * on a client that draws the map. A companion device (no canvas) has none, and
 * Foundry never tells a user's other devices what they targeted (its userActivity
 * handler drops the user's own messages). So a player's targets are SHARED on their
 * own User document, `flags.sr2e.targets = {sceneId, ids, seq, by}`:
 *   - a map client writes it when the player targets on the map;
 *   - the companion writes it when the player picks from its list;
 *   - every map client applies whatever the record now says, with Token#setTarget
 *     (which also shows the GM the reticle, as a click would).
 * Ordering comes from the server, never from device clocks: Foundry delivers a
 * User's updates to all of its clients in one order, and each map applies the
 * stored record, its OWN echoes included, changing only what differs. So when
 * two devices write at once, both end on whichever write the server stored last.
 *
 * Callers get TARGET HANDLES: the real placeable when this client has a map (so the
 * desktop behaves exactly as before), otherwise a stand-in built from the token
 * document with the fields callers read: name, id, actor, document, center.
 */

const SCOPE = "sr2e", FLAG = "targets";
let applying = false, writeTimer = null, queue = Promise.resolve();

/** A canvas-free stand-in for a Token placeable. */
function handleFor(doc) {
  if (!doc) return null;
  if (doc.object) return doc.object;
  return { document: doc, id: doc.id, name: doc.name, actor: doc.actor ?? null,
    get center() { return doc.getCenterPoint(doc); }, isStandIn: true };
}

/** The shared record, if any, as token documents (missing tokens dropped). */
function sharedTargetDocs(user = game.user) {
  const rec = user?.getFlag?.(SCOPE, FLAG);
  const scene = rec?.sceneId ? game.scenes.get(rec.sceneId) : null;
  if (!scene) return [];
  return (rec.ids ?? []).map(id => scene.tokens.get(id)).filter(Boolean);
}

/** Every target of this user, as handles. */
export function targetTokens() {
  if (globalThis.canvas?.ready) return [...(game.user?.targets ?? [])];
  return sharedTargetDocs().map(handleFor).filter(Boolean);
}

/** The first target, or null. */
export function firstTarget() { return targetTokens()[0] ?? null; }

/** A handle for a token document: its placeable when drawn, else a stand-in. */
export { handleFor };

/** The shared targets as token documents (what the companion's list shows as picked). */
export function targetDocs() { return sharedTargetDocs(); }

/** Write this user's targets to their User document (any device). */
export async function shareTargets(sceneId, ids) {
  await game.user.update({ [`flags.${SCOPE}.${FLAG}`]: { sceneId: sceneId ?? null, ids: [...ids], by: game.socket?.id ?? "" } });
  // No map on this device: tell the table directly, so the GM still sees the reticle.
  if (!globalThis.canvas?.ready) game.user.broadcastActivity({ sceneId, targets: [...ids] });
}

/**
 * Change the shared targets one step at a time: `fn(current ids on sceneId)` returns
 * the new ids. Steps run in order, each reading the record the previous one stored,
 * so quick taps on the phone's list never overwrite each other.
 */
export function updateSharedTargets(sceneId, fn) {
  const step = queue.then(async () => {
    const rec = game.user.getFlag(SCOPE, FLAG);
    const now = new Set(rec?.sceneId === sceneId ? (rec.ids ?? []) : []);
    await shareTargets(sceneId, fn(now));
  });
  queue = step.catch(() => {});
  return step;
}

/** A map client: mirror the user's targets out (debounced). */
function writeFromCanvas() {
  if (applying || !canvas?.ready) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const ids = [...game.user.targets].map(t => t.id);
    const rec = game.user.getFlag(SCOPE, FLAG);
    if (rec && rec.sceneId === canvas.scene?.id && JSON.stringify(rec.ids ?? []) === JSON.stringify(ids)) return;
    shareTargets(canvas.scene?.id ?? null, ids);
  }, 120);
}

/** A map client: make the map show the stored record (a no-op when it already does). */
function applyToCanvas(rec) {
  if (!canvas?.ready || !rec) return;
  // The record supersedes a map click still waiting to be written.
  clearTimeout(writeTimer);
  const was = applying;
  applying = true;   // Token#setTarget fires targetToken synchronously: don't echo it back
  try {
    const want = new Set(rec.sceneId === canvas.scene?.id ? (rec.ids ?? []) : []);
    for (const t of [...game.user.targets]) if (!want.has(t.id)) t.setTarget(false, { releaseOthers: false, groupSelection: true });
    for (const id of want) {
      const t = canvas.tokens.get(id);
      if (t && !t.isTargeted) t.setTarget(true, { releaseOthers: false, groupSelection: true });
    }
  } finally { applying = was; }
}

export function registerTargetSync() {
  Hooks.on("targetToken", (user) => { if (user === game.user) writeFromCanvas(); });
  Hooks.on("updateUser", (user, changes) => {
    if (user !== game.user || !foundry.utils.hasProperty(changes, `flags.${SCOPE}.${FLAG}`)) return;
    applyToCanvas(user.getFlag(SCOPE, FLAG));
  });
  // A map client that loads after the phone picked: start from the shared record.
  Hooks.on("canvasReady", () => {
    applyToCanvas(game.user.getFlag(SCOPE, FLAG));
  });
}
