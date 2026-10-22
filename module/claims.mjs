/**
 * Once-only steps across clients (docs/PLAN-same-user-writers.md): `once(actor, key)` is
 * true only for the ONE call whose marker create the server accepted. Markers are
 * hidden, disabled, change-less ActiveEffects (sheets don't list actor effects).
 */
import { claimId, MARKER_TTL_MS } from "./rules/claim-rules.mjs";

export const markerOf = (e) => e?.flags?.sr2e?.claim ?? null;

/** This actor's markers: [{id, key, at, user}]. */
export const markersOf = (actor) => (actor?.effects ?? []).filter(e => markerOf(e)).map(e => ({ id: e.id, ...markerOf(e) }));

/** Did THIS call win `key` on this actor? Rethrows anything but a duplicate-id rejection. */
export async function once(actor, key) {
  const id = claimId(key);
  if (!actor || actor.effects.has(id)) return false;
  try {
    const [doc] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: id, name: "SR2E step marker",
      img: "icons/svg/clockwork.svg", disabled: true, transfer: false,
      flags: { sr2e: { claim: { key, at: game.time.serverTime, user: game.user.id } } } }], { keepId: true });
    return doc?.id === id;
  } catch (err) {
    if (actor.effects.has(id) || /already exists/i.test(err?.message ?? "")) return false;
    throw err;
  }
}

/**
 * Record an immutable event (an append-only log entry): like `once`, a deterministic-id
 * marker the server creates exactly once, but DURABLE (never pruned) and carrying a
 * payload. True only for the call that created it. (docs/PLAN-cybertechnology-phase4.md §8)
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
export const eventsOf = (actor) => markersOf(actor).filter(m => m.durable && m.event).map(m => ({ key: m.key, at: m.at, ...m.event }));

/** Delete markers older than the retention, except durable records and those `keep(marker)` protects. Never throws. */
export async function pruneMarkers(actor, keep = () => false) {
  const now = game.time.serverTime;
  const ids = markersOf(actor).filter(m => !m.durable && now - (Number(m.at) || 0) > MARKER_TTL_MS && !keep(m)).map(m => m.id);
  if (!ids.length) return;
  try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids.filter(id => actor.effects.has(id))); }
  catch (err) { console.warn("SR2E | pruning step markers failed", err); }
}
