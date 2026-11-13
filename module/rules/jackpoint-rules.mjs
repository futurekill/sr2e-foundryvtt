/**
 * Matrix jackpoints — the pure decisions (docs/archive/plans/PLAN-matrix-jackpoints.md, Round 1
 * design + Round 2–4 amendments). No Foundry here: module/jackpoints.mjs feeds
 * these the actor's session records, its matrixMode and the tab's own record.
 *
 * A session record: { jackpoint, originToken, destScene, user, since }.
 * A tab record:     { actorUuid, session, phase: "pending"|"entered"|"returning",
 *                     originScene, destScene }.
 */

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** THE session among possibly-concurrent records: earliest `since`, then id. */
export function winner(sessions = {}) {
  const live = Object.entries(sessions ?? {}).filter(([, r]) => r && typeof r === "object");
  if (!live.length) return null;
  live.sort(([ia, a], [ib, b]) => ((a.since ?? 0) - (b.since ?? 0)) || cmp(ia, ib));
  return { id: live[0][0], ...live[0][1] };
}

/**
 * Which session keys the active GM deletes (R3 #2): every key when Matrix mode
 * is off; otherwise every key but the winner, and the winner too if it's invalid.
 */
export function gmCleanup({ sessions = {}, matrixMode, isValid = () => true }) {
  const ids = Object.keys(sessions ?? {});
  if (!matrixMode) return ids;
  const w = winner(sessions);
  return ids.filter(id => !w || id !== w.id || !isValid({ id, ...sessions[id] }));
}

/**
 * What one tab does about its own record (R3 #3, R4 #2–#4). Termination is
 * decided FIRST: Matrix mode off, its key gone or losing, or its destination
 * invalid is never an entry to resume.
 * @returns {{action: "none"|"clear"|"cancel"|"enter"|"return"|"stay", deleteKey?: string, scene?: string}}
 */
export function tabDecision({ record, sessions = {}, matrixMode, currentScene, isValid = () => true, sceneExists = () => true, resume = false }) {
  if (!record) return { action: "none" };
  const mine = sessions?.[record.session];
  const w = winner(sessions);
  const live = !!matrixMode && !!mine && w?.id === record.session && isValid({ id: record.session, ...mine });
  const deleteKey = mine ? record.session : undefined;
  if (!live) {
    // A pending entry that lost or was cancelled: withdraw, don't move.
    if (record.phase === "pending") return { action: "cancel", deleteKey };
    // Entered or returning: go back only if this tab is still where the session put
    // it — or has no canvas at all (the destination was torn down): recover then too.
    const onDest = !currentScene || currentScene === record.destScene || !sceneExists(currentScene);
    if (!onDest) return { action: "clear", deleteKey };
    const back = sceneExists(record.originScene) ? record.originScene : null;
    return { action: "return", deleteKey, scene: back };      // null → the active scene
  }
  if (record.phase === "pending") return { action: "enter", scene: record.destScene };
  // Viewing elsewhere: back into the Matrix only on a reload; an ordinary check
  // leaves a player who navigated away where they are.
  if (currentScene !== record.destScene) return resume ? { action: "enter", scene: record.destScene } : { action: "stay" };
  return { action: "stay" };
}

/** The body marker (R2 #4): only the origin token of the live, winning session. */
export function bodyMarked({ tokenUuid, sessions = {}, matrixMode }) {
  const w = winner(sessions);
  return !!matrixMode && !!w && w.originToken === tokenUuid;
}

/** A GM-marked persona is lit only while its actor's live session targets its scene (R4 #1). */
export function personaLit({ sceneId, sessions = {}, matrixMode }) {
  const w = winner(sessions);
  return !!matrixMode && !!w && w.destScene === sceneId;
}

// ── Persona tokens (docs/archive/plans/PLAN-matrix-persona-tokens.md) ───────────────────────

/**
 * Which persona tokens one Matrix scene should gain or lose. `tokens` are the scene's
 * persona-flagged or managed tokens `{id, actorId, actorLink, managed, usable, marked, stale}`
 * (usability judged by the caller with the same predicate canJackIn uses, R1 #6; `marked`: the
 * persona flag is still on; `stale`: made for a session that isn't the actor's live one now —
 * impl R1 #1); `live` is the set of actor ids whose
 * winning, valid session targets this scene. Hand-placed personas are never removed; managed
 * ones are disposable: unlinked or unusable ones go (R2 #4), duplicates keep the lowest id among
 * usable ones, and all go when a usable hand-placed persona exists or the session ended.
 * @returns {{create: string[], remove: {id: string, reason: string}[]}}
 */
export function desiredPersonas({ tokens = [], live = new Set() }) {
  const create = [], remove = [];
  const byActor = new Map();
  for (const t of tokens) {
    if (!t.managed) continue;
    // A managed token stripped of its persona flag is still ours to clear away (impl R1 #2).
    if (t.marked === false) { remove.push({ id: t.id, reason: "unmarked" }); continue; }
    if (t.stale) { remove.push({ id: t.id, reason: "stale" }); continue; }
    if (!t.actorLink) { remove.push({ id: t.id, reason: "unlinked" }); continue; }
    if (!t.usable) { remove.push({ id: t.id, reason: "unusable" }); continue; }
    if (!byActor.has(t.actorId)) byActor.set(t.actorId, []);
    byActor.get(t.actorId).push(t);
  }
  const handUsable = (actorId) => tokens.some(t => !t.managed && t.marked !== false && t.actorLink && t.usable && t.actorId === actorId);
  for (const [actorId, list] of byActor) {
    list.sort((a, b) => cmp(a.id, b.id));
    const reason = !live.has(actorId) ? "ended" : handUsable(actorId) ? "hand-placed" : null;
    for (const [i, t] of list.entries()) if (reason || i > 0) remove.push({ id: t.id, reason: reason ?? "duplicate" });
  }
  for (const actorId of live) if (!byActor.has(actorId) && !handUsable(actorId)) create.push(actorId);
  return { create, remove };
}

/**
 * Is the rectangle `{x, y, w, h}` wholly inside a region? Exact, not sampled (R2 #5): if no
 * boundary edge (`rings`: flat [x0, y0, x1, y1, …] point lists, holes included) crosses the
 * rectangle's open interior, the rectangle is all in or all out, and its centre decides
 * (`inside(x, y)`, the region's own point test, which knows the winding and holes).
 */
export function rectInRegion(rect, rings, inside) {
  const eps = 1e-6;
  const x0 = rect.x + eps, y0 = rect.y + eps, x1 = rect.x + rect.w - eps, y1 = rect.y + rect.h - eps;
  // Liang–Barsky: does segment (ax, ay)→(bx, by) reach the (shrunk) rectangle?
  const hits = (ax, ay, bx, by) => {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  };
  for (const pts of rings) {
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      if (hits(pts[i], pts[i + 1], pts[j], pts[j + 1])) return false;
    }
  }
  return !!inside(rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/**
 * Where a new persona goes: the first grid cell (row by row) whose footprint the region contains
 * and no other token overlaps; else the first contained one (stacking beats landing outside);
 * else null (the region is smaller than the token — the caller falls back to its centre).
 */
export function placePersona({ bounds, grid, w, h, rings, inside, occupied = [] }) {
  const overlaps = (r) => occupied.some(o => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
  let first = null;
  for (let y = Math.floor(bounds.y / grid) * grid; y + h <= bounds.y + bounds.height + 1e-6; y += grid) {
    for (let x = Math.floor(bounds.x / grid) * grid; x + w <= bounds.x + bounds.width + 1e-6; x += grid) {
      const r = { x, y, w, h };
      if (!rectInRegion(r, rings, inside)) continue;
      if (!overlaps(r)) return { x, y };
      first ??= { x, y };
    }
  }
  return first;
}
