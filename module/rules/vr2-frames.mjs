/**
 * VR2.0 part 6a-1: frame cores and loading, the pure decisions (docs/PLAN-vr2-part6-frames.md, "6a-1 in detail";
 * VR2.0 pp.105–106). No Foundry here.
 */
import { deriveProgram, foldProgramming } from "./vr2-options.mjs";

const ATTRS = ["bod", "evasion", "masking", "sensor"];

/** What the loaded programs may total (p.105–106): the Core Rating less the points given to Initiative. */
export const programCapacity = (rating, core = {}) => Math.max(0, (Number(rating) || 0) - (Number(core.initPoints) || 0));

/**
 * What's wrong with a core's design (p.105–106), as reasons; empty = a legal core.
 * @param {{rating: number, frameCore: object, activeOpts: {kind, rating}[]}} p
 */
export function coreProblems({ rating = 0, frameCore = {}, activeOpts = [] } = {}) {
  const out = [];
  const sum = ATTRS.reduce((n, k) => n + (Number(frameCore[k]) || 0), 0);
  if (sum > rating) out.push(`Bod + Evasion + Masking + Sensor (${sum}) may not exceed the Core Rating (${rating}) (p.105).`);
  const init = Number(frameCore.initPoints) || 0;
  if (frameCore.kind === "dumb" && init > 0) out.push("Only smart frames have Initiative: a dumb core gives it no points (p.106).");
  if (init > rating) out.push(`Initiative points (${init}) can't exceed the Core Rating (${rating}) (p.106).`);
  if (frameCore.kind === "smart" && !activeOpts.some(o => o.kind === "dinab")) out.push("A smart core must carry DINAB: it is the frame's Computer skill (p.106).");
  return out;
}

/** A smart frame's Reaction and Initiative (p.106): Reaction = Core Rating, 1D6 + 1 die per Initiative point. */
export const frameInitiative = (rating, core = {}) => (core.kind === "smart"
  ? { reaction: Number(rating) || 0, dice: 1 + (Number(core.initPoints) || 0) } : null);

/** The programmer's DINAB cap on a core (p.106): "may not exceed the programmer's Computer Skill". */
export const coreDinabProblem = (activeOpts = [], computer = 0) => {
  const d = activeOpts.find(o => o.kind === "dinab");
  return d && d.rating > computer ? `DINAB-${d.rating} exceeds Computer ${computer} (p.106).` : null;
};

/**
 * Loading terms (p.106; user rulings 2026-11-05: both round up). Ratings are the copies' BASE ratings (options never
 * count): Loading Rating = ⌈Σ ÷ 2⌉, size = LR², base time = size × 2 days, TN = ⌈the average rating⌉.
 */
export function loadingTerms(ratings = []) {
  const rs = ratings.map(r => Math.max(0, Number(r) || 0));
  const total = rs.reduce((n, r) => n + r, 0);
  const loadingRating = Math.ceil(total / 2);
  const size = loadingRating * loadingRating;
  return { total, loadingRating, size, baseTime: size * 2, tn: rs.length ? Math.max(2, Math.ceil(total / rs.length)) : 2 };
}

/** May these copies go onto a core of this capacity (p.105–106)? Reasons, empty = yes. Whole programs only. */
export function loadProblems(ratings = [], capacity = 0) {
  if (!ratings.length) return ["Pick at least one program."];
  const total = ratings.reduce((n, r) => n + (Number(r) || 0), 0);
  return total > capacity ? [`The programs total ${total}: the core holds ${capacity} (p.105).`] : [];
}

/** A loaded copy's sizes and identity, read exactly like a program item's (R1 #5). */
export const copyStats = (copy, mode) => deriveProgram(copy.name, copy.system, mode);

/** Frame actual size (p.106): the core's actual size + every copy's actual size with its options. */
export const frameActualSize = (coreSize, copies = [], mode) =>
  (Number(coreSize) || 0) + copies.reduce((n, c) => n + copyStats(c, mode).size, 0);

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Is the core written AS IT IS NOW (6a-1 §1; a core-only rule)? The latest completed programming task's captured
 * design must equal the current design. No completed task: not written (code R1 #1).
 */
export function coreWritten(records = [], design) {
  const f = foldProgramming(records, "prog:");
  const done = Object.values(f.tasks).filter(t => t.complete).sort((a, b) => b.task - a.task)[0];
  // A core is written only by a completed task matching its design (code R1 #1): an ordinary program turned into a
  // core, or a bought core rearranged, can't skip writing.
  if (!done) return false;
  return eq(done.design, design);
}

/**
 * The core's active load (6a-1 §3), derived from its `load:` records, never stored: the payload of the latest COMPLETED
 * load task, and only if it was made for this design of the core, still fits, and the core is written.
 * @returns {{gen: number, copies: object[], loadingRating: number}|{gen: number, void: string}|null}
 */
export function activeLoad(records = [], { design, capacity, written }) {
  const f = foldProgramming(records, "load:");
  const t = Object.values(f.tasks).filter(x => x.complete && x.payload).sort((a, b) => b.task - a.task)[0];
  if (!t) return null;
  const p = t.payload;
  if (!written) return { gen: t.task, void: "The core isn't written as it is now: write it again." };
  if (!eq(p.coreDesign, design)) return { gen: t.task, void: "Made for another design of this core: load again." };
  const total = (p.copies ?? []).reduce((n, c) => n + (Number(c.system?.rating) || 0), 0);
  if (total > capacity) return { gen: t.task, void: `The programs total ${total}: the core now holds ${capacity}.` };
  return { gen: t.task, copies: p.copies ?? [], loadingRating: p.loadingRating };
}

// ── Part 6a-2a: running frames (docs/PLAN-vr2-part6-frames.md, "6a-2a in detail") ──────────────

/** Upload time (p.91): "10 MePS can upload … 10 Mp of data per second". Null when the deck has no I/O bandwidth. */
export const uploadSeconds = (size, io) => (Number(io) > 0 ? Math.ceil((Number(size) || 0) / Number(io)) : null);
/** Seconds → Combat Turns (3 seconds each). */
export const uploadTurns = (seconds) => Math.ceil((Number(seconds) || 0) / 3);

/**
 * Has the owner left since `since` (a seq)? A durable transition, never a current-location check (R1 #4): the
 * connection ended or changed; under grid topology any 7b move on that connection after `since` (a failed logon
 * elsewhere writes none); otherwise a different host session (session ids are never reused).
 */
export function departedSince({ live = null, conn, sessionId, liveSessionId = null, topology = false, moves = [], since = 0 }) {
  if (live == null || live !== conn) return true;
  if (topology) return moves.some(m => m.type === "move" && m.conn === conn && (m.seq ?? 0) > since);
  return liveSessionId !== sessionId;
}

/** A frame's monitor (p.124), derived from its card-keyed hits (R1 #9): one per card, 10 boxes at most. */
export function frameMonitor(hits = [], uploadId) {
  const byCard = new Map();
  for (const h of hits) if (h.type === "frameHit" && h.upload === uploadId && !byCard.has(h.card)) byCard.set(h.card, Number(h.boxes) || 0);
  return Math.min(10, [...byCard.values()].reduce((n, b) => n + b, 0));
}

/** The seqs at which a host's shutdown runs went offline (p.53), resets included (R2 #1). */
export function shutdownOfflineSeqs(records = []) {
  const out = [];
  for (const run of records.filter(e => e.type === "shutdown")) {
    const ticks = records.filter(e => e.type === "shutdownTick" && e.n === run.n).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const t = ticks[Math.max(0, (run.turns ?? 0) - 1)];
    if (ticks.length >= (run.turns ?? 0) && t) out.push(t.seq ?? 0);
  }
  return out;
}

/**
 * Why a frame (or an upload) has ended, or null (§4; derived, so nothing depends on a write having happened).
 * Smart frames don't end with their owner's departure (p.105).
 */
export function frameEnds({ ownerExists = true, hostExists = true, kind = "dumb", departed = false, monitor = 0, shutdownSeqs = [], since = 0, endFact = null } = {}) {
  if (!ownerExists) return "its decker is gone";
  if (!hostExists) return "its host is gone";
  if (endFact) return endFact.why ?? "ended";
  if (monitor >= 10) return "crashed";
  if (shutdownSeqs.some(s => s > since)) return "its host shut down";
  if (kind !== "smart" && departed) return "its decker left the host";
  return null;
}

/** An icon's kind (§5): ic | decker | frame. */
export const iconKind = (type) => (type === "character" ? "decker" : type === "frame" ? "frame" : type === "ic" ? "ic" : null);
/** The Limit option's target type for an icon (p.104). */
export const limitClass = (type) => iconKind(type) ?? "decker";
