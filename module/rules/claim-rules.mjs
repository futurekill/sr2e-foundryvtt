/**
 * Pure helpers for server-arbitrated once-only steps (docs/PLAN-same-user-writers.md).
 * A step is claimed by creating an embedded marker with a deterministic id: the server
 * rejects a second create of the same id, so exactly one client wins.
 */

/** A dose holder older than this may be force-finished by the GM (server time). */
export const STUCK_MS = 2 * 60 * 1000;
/** Markers are deduplication evidence for this long (never while their commit is open). */
export const MARKER_TTL_MS = 24 * 60 * 60 * 1000;

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A Foundry document id (16 base-62 chars) derived from `key`, the same on every client. */
export function claimId(key) {
  let out = "";
  for (const part of [key, `§${key}`, `${key}§`]) {
    let h = fnv1a(part);
    for (let i = 0; i < 6 && out.length < 16; i++) { out += B62[h % 62]; h = Math.floor(h / 62); }
  }
  return out;
}

export const doseKey = (exposureId, gen) => `dose.${exposureId}.g${gen}`;

/**
 * Who holds a dose: the newest generation's marker among `markers` ({key, at, user}).
 * gen -1 = no marker (a commit written before markers existed).
 */
export function doseHoldState(markers, exposureId, now, stuckMs = STUCK_MS) {
  const prefix = `dose.${exposureId}.g`;
  let best = null;
  for (const m of markers ?? []) {
    if (typeof m?.key !== "string" || !m.key.startsWith(prefix)) continue;
    const gen = Number(m.key.slice(prefix.length));
    if (Number.isInteger(gen) && gen >= 0 && (!best || gen > best.gen)) best = { gen, user: m.user ?? null, at: Number(m.at) || 0 };
  }
  if (!best) return { gen: -1, holder: null, ageMs: 0, overridable: false, msUntil: 0 };
  const ageMs = Math.max(0, now - best.at);
  return { gen: best.gen, holder: best.user, ageMs, overridable: ageMs >= stuckMs, msUntil: Math.max(0, stuckMs - ageMs) };
}
