/**
 * Once-only steps across clients (docs/archive/plans/PLAN-same-user-writers.md): `once(actor, key)` is
 * true only for the ONE call whose marker create the server accepted. Markers are
 * hidden, disabled, change-less ActiveEffects (sheets don't list actor effects).
 */
import { claimId, MARKER_TTL_MS, wallAge } from "./rules/claim-rules.mjs";
import { serverNow, freshServerNow, serverClock } from "./server-clock.mjs";

export const markerOf = (e) => e?.flags?.sr2e?.claim ?? null;

/** This actor's markers: [{id, key, at, user}]. */
export const markersOf = (actor) => (actor?.effects ?? []).filter(e => markerOf(e)).map(e => ({ id: e.id, ...markerOf(e), ct: e._stats?.createdTime ?? null }));

/** Did THIS call win `key` on this actor? `event` rides on the marker for readers. Rethrows anything but a duplicate-id rejection. */
export async function once(actor, key, event = null) {
  const id = claimId(key);
  if (!actor || actor.effects.has(id)) return false;
  try {
    const [doc] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: id, name: "SR2E step marker",
      img: "icons/svg/clockwork.svg", disabled: true, transfer: false,
      flags: { sr2e: { claim: { key, at: game.time.serverTime, user: game.user.id, ...(event ? { event } : {}) } } } }], { keepId: true });
    return doc?.id === id;
  } catch (err) {
    if (actor.effects.has(id) || /already exists/i.test(err?.message ?? "")) return false;
    throw err;
  }
}

/**
 * Record an immutable event (an append-only log entry): like `once`, a deterministic-id
 * marker the server creates exactly once, but DURABLE (never pruned) and carrying a
 * payload. True only for the call that created it. (docs/archive/plans/PLAN-cybertechnology-phase4.md §8)
 */
export async function recordEvent(actor, key, payload = {}) {
  const id = claimId(key);
  if (!actor || actor.effects.has(id)) return false;
  try {
    const [doc] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: id, name: "SR2E event record",
      img: "icons/svg/clockwork.svg", disabled: true, transfer: false,
      flags: { sr2e: { claim: { key, at: game.time.serverTime, user: game.user.id, durable: true, event: payload } } } }], { keepId: true });
    return doc?.id === id;
  } catch (err) {
    if (actor.effects.has(id) || /already exists/i.test(err?.message ?? "")) return false;
    throw err;
  }
}

/** This actor's durable event records whose payload type is in `types` (all if omitted). */
export const eventsOf = (actor) => markersOf(actor).filter(m => m.durable && m.event).map(m => ({ key: m.key, at: m.at, ct: m.ct, ...m.event }));

/**
 * A marker's age in ms by the SERVER's wall clock (its `_stats.createdTime` vs serverNow()), or null when unknown
 * (docs/archive/plans/PLAN-claim-clock.md): unknown is never stuck and never pruned. `game.time.serverTime` is the server's uptime on
 * Foundry 13 — it resets on a restart — so it must never age a marker.
 */
const ctOf = (m) => (serverClock.testMode && m?.testCt != null ? m.testCt : m?.ct);
/** The age of a server-stamped DOCUMENT (a chat message, a marker effect) — `flags.sr2e.testCt` in Quench's testMode. */
export async function docAgeFresh(doc) {
  const t = serverClock.testMode ? (doc?.flags?.sr2e?.testCt ?? doc?.flags?.sr2e?.claim?.testCt) : null;
  return wallAge(t ?? doc?._stats?.createdTime, await freshServerNow());
}
export const claimAge = (m) => wallAge(ctOf(m), serverNow());
/** claimAge, taking a fresh server sample first when this client has none (an idle world). */
export async function claimAgeFresh(m) { return wallAge(ctOf(m), await freshServerNow()); }

/** Delete markers older than the retention, except durable records and those `keep(marker)` protects. Never throws. */
export async function pruneMarkers(actor, keep = () => false) {
  const ids = markersOf(actor).filter(m => { const age = claimAge(m); return !m.durable && age != null && age > MARKER_TTL_MS && !keep(m); }).map(m => m.id);
  if (!ids.length) return;
  try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids.filter(id => actor.effects.has(id))); }
  catch (err) { console.warn("SR2E | pruning step markers failed", err); }
}
