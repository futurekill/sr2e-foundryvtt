/**
 * Matrix jackpoints — the pure decisions (docs/PLAN-matrix-jackpoints.md, Round 1
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
