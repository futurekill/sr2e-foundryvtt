/**
 * Pure helpers for server-arbitrated once-only steps (docs/archive/plans/PLAN-same-user-writers.md).
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
 * Who holds a dose: the newest generation's marker among `markers` ({key, at, ct, user}).
 * gen -1 = no marker (a commit written before markers existed). `ageOf(marker)` gives its age in ms, or null when
 * unknown (docs/archive/plans/PLAN-claim-clock.md 4) — an unknown age is never overridable.
 */
export function doseHoldState(markers, exposureId, ageOf, stuckMs = STUCK_MS) {
  const prefix = `dose.${exposureId}.g`;
  let best = null;
  for (const m of markers ?? []) {
    if (typeof m?.key !== "string" || !m.key.startsWith(prefix)) continue;
    const gen = Number(m.key.slice(prefix.length));
    if (Number.isInteger(gen) && gen >= 0 && (!best || gen > best.gen)) best = { gen, marker: m };
  }
  if (!best) return { gen: -1, holder: null, ageMs: 0, overridable: false, msUntil: 0 };
  const age = typeof ageOf === "function" ? ageOf(best.marker) : null;
  const ageMs = age == null ? 0 : Math.max(0, age);
  return { gen: best.gen, holder: best.marker.user ?? null, ageMs, overridable: age != null && ageMs >= stuckMs,
    msUntil: age == null ? stuckMs : Math.max(0, stuckMs - ageMs) };
}

/** Age (ms) of something the SERVER stamped at wall-clock `ct`, at server wall-clock `now`; null when unknown. */
export function wallAge(ct, now) {
  const c = Number(ct);
  if (now == null || !Number.isFinite(c) || c <= 0) return null;
  return Math.max(0, now - c);
}

/**
 * The server's wall clock from samples {wall, mono, date} at monotonic `mono` / wall `date` now: the max of
 * wall + monotonic elapsed over samples younger than `windowMs` whose two clocks still agree (within 5 s — a sleep
 * stops the monotonic clock). Rejected samples are marked `dead`. Null when none is left.
 */
export function pickServerNow(samples, { mono, date, windowMs }) {
  let best = null;
  for (const s of samples ?? []) {
    const dm = mono - s.mono, dd = date - s.date;
    if (dm < 0 || dm > windowMs || Math.abs(dd - dm) > 5000) { s.dead = true; continue; }
    const v = s.wall + dm;
    if (best == null || v > best) best = v;
  }
  return best;
}

/** The highest attempt number among keys `base` (attempt 0) and `${base}:${sep}N`; -1 when none. */
export function lastAttempt(keys, base, sep = "t") {
  let n = -1;
  for (const k of keys ?? []) {
    if (k === base) n = Math.max(n, 0);
    else if (typeof k === "string" && k.startsWith(`${base}:${sep}`)) {
      const v = Number(k.slice(base.length + sep.length + 1));
      if (Number.isInteger(v) && v >= 0) n = Math.max(n, v);
    }
  }
  return n;
}
