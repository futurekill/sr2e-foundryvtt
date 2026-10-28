/**
 * Healing on the game clock (docs/PLAN-healing-clock.md) — pure decisions, no Foundry.
 * SR2E core p.111 (bleeding), p.112 (Stun recovery), p.113 (natural healing), p.115 (first aid).
 * Times are world-time seconds.
 */
import { claimId } from "./claim-rules.mjs";

export const HOUR = 3600;
export const BLEED_S = 600;                       // "an additional box of damage every 10 minutes"

/** The flag key a clock state lives under: derived from the OWNING actor's uuid (inherited state is never read). */
export const stateKey = (uuid) => claimId(`healclock:${uuid}`);

export const emptyState = () => ({ rev: { phys: 0, stun: 0 }, restGen: 0, startGen: 0, physical: null, stun: null,
  stunCap: null, injury: null, bleed: null, loss: {}, lossDone: {} });

/** A stored state with every field present (older or partial states fill in). */
export function normalize(st) {
  const e = emptyState();
  if (!st || typeof st !== "object") return e;
  return { ...e, ...st, rev: { ...e.rev, ...(st.rev ?? {}) }, loss: { ...(st.loss ?? {}) }, lossDone: { ...(st.lossDone ?? {}) } };
}

/** The boxes a Damage Level drops TO when it heals by one stage (p.113): the next level's lowest point. */
export const STAGE_FLOOR = { Deadly: 6, Serious: 3, Moderate: 1, Light: 0 };

/** Is this course still valid against the state? (Physical: its revision; Stun: its revision AND the rest generation.) */
export function courseValid(st, kind) {
  const c = st[kind];
  if (!c) return false;
  return kind === "physical" ? c.rev === st.rev.phys : (c.stunRev === st.rev.stun && c.restGen === st.restGen);
}

/** The first lethal overflow (p.111): overflow > natural Body — or > the cybermantic limit (Cybertechnology p.80). */
export const lethalOverflow = (naturalBody, cymLimit = null) => (cymLimit != null ? cymLimit : Math.max(0, naturalBody)) + 1;

/** Bleeding boxes owed from `cursor` to `now` (a rewound clock owes nothing). */
export const bleedTicks = (cursor, now) => Math.max(0, Math.floor((now - cursor) / BLEED_S));

/** p.112: an interrupted recovery's re-roll can never beat the first roll. */
export const stunSuccesses = (roll, cap) => (cap == null ? roll : Math.min(roll, cap));

/** Stun recovery time for one box (p.112): 60 minutes ÷ successes, in seconds. */
export const stunBoxSeconds = (successes) => Math.round((60 * 60) / Math.max(1, successes));

/** The golden hour (p.115, p.155): {known, old, mixed} for an injury episode at `now`. */
export function goldenHour(injury, now) {
  if (!injury || !Number.isFinite(injury.firstAt)) return { known: false, old: false, mixed: false };
  const old = now - injury.firstAt > HOUR;
  return { known: true, old, mixed: old && Number.isFinite(injury.lastAt) && now - injury.lastAt <= HOUR };
}

/**
 * The hook's whole decision (§2a): what an ordinary monitor change does to the clock state.
 * `before`/`after` are {phys, over, stun}. Returns {state, voided: ["physical"|"stun"], bleedStarted}.
 */
export function clockChanges(stIn, before, after, now, uuid) {
  const st = normalize(structuredClone(stIn ?? null));
  const voided = [];
  const physChanged = before.phys !== after.phys || before.over !== after.over;
  const physInc = after.phys > before.phys || after.over > before.over;
  const inc = physInc || after.stun > before.stun;
  if (physChanged) st.rev.phys += 1;
  if (before.stun !== after.stun) st.rev.stun += 1;
  if (inc) {
    st.restGen += 1;                                          // any damage interrupts rest (p.112)
    if (st.stun) { st.stunCap ??= st.stun.successes; st.stun = null; voided.push("stun"); }
  }
  if (physInc) {
    if (st.physical) { st.physical = null; voided.push("physical"); }
    st.injury = { firstAt: (before.phys === 0 && before.over === 0) || !st.injury ? now : st.injury.firstAt, lastAt: now };
  }
  // A course that a decrease invalidated (healing, a hand edit) is voided too — its revision moved.
  if (st.physical && !courseValid(st, "physical")) { st.physical = null; voided.push("physical"); }
  if (st.stun && !courseValid(st, "stun")) { st.stun = null; voided.push("stun"); }
  if (after.phys === 0 && after.over === 0) st.injury = null;
  if (after.stun === 0) st.stunCap = null;
  let bleedStarted = false;
  if (after.over === 0) st.bleed = null;
  else if (before.over === 0 || !st.bleed) {
    st.bleed = { id: claimId(`bleed:${uuid}:${st.rev.phys}`), cursor: now, stable: null, lethal: false };
    bleedStarted = true;
  } else if (after.over > before.over && st.bleed.pending?.length) {
    // Stabilizations still waiting to be settled keep their times; the new wound bleeds from now.
    st.bleed = { ...st.bleed, pending: [...st.bleed.pending, { kind: null, at: now }] };
  } else if (after.over > before.over && st.bleed.stable) {
    st.bleed = { ...st.bleed, stable: null, cursor: now };    // a new wound bleeds from now
  }
  return { state: st, voided, bleedStarted };
}

/**
 * Chronological plan of what is due by `now` (§6a): completions and bleeding ticks in time order,
 * a completion before a tick at the same moment. Only events BEFORE the first invalidating
 * event of their kind are valid: a tick before a Stun box's dueAt voids that box.
 * @returns {{kind:"physical"|"stun"|"tick", at:number}[]}
 */
/**
 * Apply recorded stabilization changes in time order (§6, Codex code reviews 3–4): each takes
 * effect at its own time. Returns the bleed with every entry at or before `upTo` applied.
 */
export function applyPending(bleed, upTo) {
  let b = { ...bleed, pending: [...(bleed.pending ?? [])].sort((x, y) => x.at - y.at) };
  while (b.pending.length && b.pending[0].at <= upTo) {
    const p = b.pending.shift();
    b = { ...b, stable: p.kind, ...(p.kind ? {} : { cursor: Math.max(b.cursor, p.at) }) };
  }
  return b;
}

export function dueEvents(st, now) {
  const ev = [];
  for (const k of ["physical", "stun"]) if (st[k] && courseValid(st, k) && st[k].dueAt <= now) ev.push({ kind: k, at: st[k].dueAt });
  const b = st.bleed;
  if (b && !b.stable && !b.lethal) {
    for (let i = 1, t = b.cursor + BLEED_S; t <= now && i <= 500; i++, t += BLEED_S) ev.push({ kind: "tick", at: t });
  }
  return ev.sort((a, c) => a.at - c.at || (a.kind === "tick") - (c.kind === "tick"));
}

/** Format seconds as "45 minutes" / "6 hours" / "3.5 days". */
export function durationText(s) {
  const r = (x) => Math.round(x * 10) / 10;
  if (s < 2 * HOUR) return `${Math.max(1, Math.round(s / 60))} minute${Math.round(s / 60) === 1 ? "" : "s"}`;
  if (s < 48 * HOUR) return `${r(s / HOUR)} hours`;
  return `${r(s / (24 * HOUR))} days`;
}
