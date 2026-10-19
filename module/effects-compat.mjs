/**
 * Active Effect schema across v13 and v14+ (docs/PLAN-v16-prep.md §3). v14 moves
 * `changes` to `system.changes`, the numeric change `mode` to a string `type`, and
 * `duration.seconds/startTime/rounds/…` to `duration.value/units` + `start.*`; v16 drops
 * the shims that keep the old properties readable. Reads detect the schema from the
 * data itself, never through a deprecated getter; writes emit the version's own form.
 * Only GENERATED drug effects are written here: a native `toObject()` copy (sustained
 * spells) stays native, and Foundry migrates it on creation.
 */

export const modernEffects = () => (game.release?.generation ?? 13) >= 14;

/** An effect's changes (document or source data). */
export function effectChanges(e) {
  const sys = e?.system?.changes;
  if (Array.isArray(sys)) return sys;                 // v14+
  return Array.isArray(e?.changes) ? e.changes : [];  // v13
}

/** An additive change? `mode` 2 is CONST.ACTIVE_EFFECT_MODES.ADD (a deprecated proxy on v14). */
export const changeIsAdd = (c) => typeof c?.type === "string" ? c.type === "add" : c?.mode === 2;

/** Source duration in the v14 shape? */
const modernDuration = (src) => !!src?.duration && Object.hasOwn(src.duration, "units");

/** The drug "tracking-only" marker: a zero-length duration, in either schema. */
export function isZeroDuration(src) {
  const d = src?.duration;
  if (!d) return false;
  return modernDuration(src) ? (d.units === "seconds" && d.value === 0) : d.seconds === 0;
}

/** No duration at all ("until ended"), in either schema. v13 hydrates the fields as null. */
export function isIndefinite(src) {
  const d = src?.duration;
  if (!d) return true;
  if (modernDuration(src)) return d.value == null;
  return [d.seconds, d.rounds, d.turns].every(v => v == null);
}

/**
 * Remaining time for display, from Foundry's PREPARED duration (it does the calendar
 * and combat maths, and on v14 may reframe a combat duration into seconds).
 * @returns {{timed:boolean, expired:boolean, text:string}}
 */
export function effectTiming(e) {
  const d = e?.duration ?? {};
  if (modernEffects()) {
    const timed = Number.isFinite(d.remaining);
    return { timed, expired: timed && d.remaining <= 0, text: d.label || "" };
  }
  const timed = !!d.type && d.type !== "none";
  const expired = timed && Number.isFinite(d.remaining) && d.remaining <= 0;
  const text = d.type === "seconds" ? `${Math.ceil(d.remaining / 60)} min left`
    : d.type === "turns" ? `${Math.ceil(d.remaining)} Combat Turn${Math.ceil(d.remaining) === 1 ? "" : "s"} left` : (d.label || "");
  return { timed, expired, text };
}

/**
 * Duration + start data for a timing, in the running version's schema.
 * timing: {seconds, startTime} | {rounds, combat, startRound, startTurn} | {zero: true, startTime} | {indefinite: true}
 */
export function timingData(timing = {}) {
  const modern = modernEffects();
  if (timing.indefinite || (!timing.zero && timing.seconds == null && timing.rounds == null)) return { duration: {} };
  if (timing.rounds != null) {
    return modern
      ? { duration: { value: timing.rounds, units: "rounds" }, start: { combat: timing.combat, round: timing.startRound, turn: timing.startTurn } }
      : { duration: { rounds: timing.rounds, combat: timing.combat, startRound: timing.startRound, startTurn: timing.startTurn } };
  }
  const seconds = timing.zero ? 0 : timing.seconds;
  return modern
    ? { duration: { value: seconds, units: "seconds" }, start: { time: timing.startTime } }
    : { duration: { seconds, startTime: timing.startTime } };
}

/** The same as update keys (tests; a re-timed effect). */
export function timingUpdate(timing) {
  return foundry.utils.flattenObject(timingData(timing));
}

/**
 * A generated drug effect, in the running version's schema. `changes` are COMPLETE
 * change records (priority and all); only `mode` → `type` is translated on v14+.
 */
export function makeDrugEffectData({ changes = [], timing = {}, ...rest }) {
  const modern = modernEffects();
  const out = { ...rest, ...timingData(timing) };
  if (modern) {
    out.system = { changes: changes.map(({ mode, ...c }) => ({ ...c, type: c.type ?? (mode === 2 ? "add" : `custom.${mode}`) })) };
  } else {
    out.changes = changes.map(({ type, ...c }) => ({ ...c, mode: c.mode ?? (type === "add" ? 2 : 0) }));
  }
  return out;
}
