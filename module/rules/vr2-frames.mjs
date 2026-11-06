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

// ── Part 6a-2b: commands, decoy frames, attribute effects, event triggers ──────────────

/**
 * The live decoy frame (p.107), folded from the owner's records, never stored. Two steps (R1 #10): SELECT the newest
 * `decoyFrame` record of the live connection whose card shows a success or is gone, then TEST that record alone — a
 * missing card, another session, an ended frame or an off fact means none, never a fall-back to an older one.
 * @param {object} a
 * @param {object[]} a.records  the owner's records
 * @param {(card: string) => {success: boolean}|null} a.cardOf the card's verdict now; null = gone
 * @param {(upload: string) => boolean} a.frameEnded
 * @returns {{key: string, card: string, frame: string}|null}
 */
export function liveDecoyFrame({ records = [], conn = null, sessionId = null, cardOf = () => null, frameEnded = () => false }) {
  if (conn == null) return null;
  const d = records.filter(e => e.type === "decoyFrame" && e.conn === conn)
    .sort((a, b) => ((b.ct ?? 0) - (a.ct ?? 0)) || String(b.key).localeCompare(String(a.key)))
    .find(e => { const c = cardOf(e.card); return !c || c.success; });
  if (!d || !cardOf(d.card) || d.sessionId !== sessionId || frameEnded(d.frame)) return null;
  if (records.some(e => e.type === "decoyFrameOff" && e.decoy === d.key)) return null;
  return { key: d.key, card: d.card, frame: d.frame };
}
/** Decoy-frame records of this connection with no off fact yet: what an own action ends (R1 #9). */
export const openDecoyFrames = (records = [], conn = null) => records.filter(e => e.type === "decoyFrame" && e.conn === conn
  && !records.some(o => o.type === "decoyFrameOff" && o.decoy === e.key));

/**
 * Why a frame can't serve as this event trigger (p.107), as reasons; empty = it can. "Equal to or exceeding half the
 * host's Security Value": 2 × rating ≥ Security Value. Host events need analyze; other users' events need scanner.
 * @param {{sensor: number, analyze: number, scanner: number, securityValue: number, watch: "host"|"users"|"both"}} p
 */
export function triggerProblems({ sensor = 0, analyze = 0, scanner = 0, securityValue = 0, watch = "host" } = {}) {
  const half = (r) => 2 * (Number(r) || 0) >= (Number(securityValue) || 0);
  const out = [];
  if (!half(sensor)) out.push(`Sensor ${sensor} is under half the Security Value ${securityValue}.`);
  if (watch !== "users" && !half(analyze)) out.push(analyze ? `Analyze-${analyze} is under half the Security Value ${securityValue}.` : "Host events need an analyze utility.");
  if (watch !== "host" && !half(scanner)) out.push(scanner ? `Scanner-${scanner} is under half the Security Value ${securityValue}.` : "Other users' events need a scanner utility.");
  return out;
}

/** A frame's attribute losses (§6), summed per attribute from its card-keyed `frameAttr` facts (one per card). */
export function frameAttrLosses(records = [], uploadId) {
  const seen = new Set(), out = { bod: 0, evasion: 0, masking: 0, sensor: 0 };
  for (const e of records) {
    if (e.type !== "frameAttr" || e.upload !== uploadId || seen.has(e.card)) continue;
    seen.add(e.card);
    if (e.attr in out) out[e.attr] += Number(e.lost) || 0;
  }
  return out;
}

/** Core DINAB left (§5): the rating less one point per failed run (wear keys `<upload>_<useId>`). */
export const coreDinabLeft = (rating, wear = {}, uploadId = "") =>
  Math.max(0, (Number(rating) || 0) - Object.keys(wear ?? {}).filter(k => k.startsWith(`${uploadId}_`)).length);

/** Operations a frame never runs (§2): it doesn't move, and Null Operation is the decker's own waiting. */
export const NO_FRAME_OPS = new Set(["logonHost", "logonLTG", "logonRTG", "gracefulLogoff", "nullOp", "commandSet"]);

// ── Part 6a-2c: smart frames ─────────────────────────────────────────────────────────

/** Operations a SMART frame never runs (§ out of scope): decoy frames are dumb; it has no datatrail to redirect. */
export const NO_SMART_OPS = new Set([...NO_FRAME_OPS, "decoy", "redirectDatatrail"]);

/** A smart frame's initiative parts (p.106): Reaction = Core Rating, 1D6 + 1 per point; a dumb frame has none. */
export const frameInitiativeParts = ({ kind, coreRating = 0, initPoints = 0 } = {}) => (kind === "smart"
  ? { base: Number(coreRating) || 0, dice: 1 + (Number(initPoints) || 0) } : null);

/** Should this frame join this combat (§7, R2)? Eligible, and never joined before (two receipts). */
export function joinStep({ eligible = false, joining = false, joined = false } = {}) {
  if (joined) return "none";
  if (joining) return "finish";
  return eligible ? "start" : "none";
}

// ── Part 6b: semi-autonomous knowbots (VR2.0 pp.140–141) ──────────────────────────────

const PERSONA = ["bod", "evasion", "masking", "sensor"];
/** The p.141 sample SKs (MPCP/Bod/Evasion/Masking/Sensor): each persona split totals MPCP × 3. */
export const SK_PRESETS = [[7, 6, 5, 5, 5], [8, 6, 6, 6, 6], [9, 8, 7, 6, 6], [10, 8, 8, 7, 7], [11, 9, 8, 8, 8], [12, 9, 9, 9, 9]];

/** Why an SK's ratings break p.140, as reasons; empty = legal. MPCP 7–12 (1D6 + 6); each ≤ MPCP; Σ ≤ MPCP × 3. */
export function skProblems({ mpcp = 0, ...attrs } = {}) {
  const m = Number(mpcp) || 0, out = [];
  if (m < 7 || m > 12) out.push(`An SK's MPCP is 1D6 + 6: 7 to 12, not ${m} (p.140).`);
  for (const k of PERSONA) if ((Number(attrs[k]) || 0) > m) out.push(`${k[0].toUpperCase()}${k.slice(1)} ${attrs[k]} exceeds MPCP ${m} (p.140).`);
  const sum = PERSONA.reduce((n, k) => n + (Number(attrs[k]) || 0), 0);
  if (sum > m * 3) out.push(`Bod + Evasion + Masking + Sensor (${sum}) exceeds MPCP × 3 (${m * 3}) (p.140).`);
  return out;
}

/** Initiative dice from Utility Pool points (p.141): 0 → 1D6, 1 → 2D6, 3 → 3D6, 5 → 4D6 (the maximum). */
export const SK_INIT_STEPS = { 0: 1, 1: 2, 3: 3, 5: 4 };
export const skInitDice = (points = 0) => SK_INIT_STEPS[Number(points) || 0] ?? 1;

const TWO_FOR_ONE = /^(black hammer|killjoy)/i;
/** A utility's pool cost (p.141): 1 point per rating point; black hammer and killjoy 2. */
export const poolCost = (name, rating) => (Number(rating) || 0) * (TWO_FOR_ONE.test(String(name ?? "")) ? 2 : 1);
const isLockable = (name) => /^(restore|medic)/i.test(String(name ?? ""));

/**
 * Why an allocation breaks p.141, as reasons; empty = legal.
 * @param {{pool: number, mpcp: number, alloc: {name: string, rating: number}[], init: number, locked: Object<string, number>}} p
 */
export function poolProblems({ pool = 0, mpcp = 0, alloc = [], init = 0, locked = {} } = {}) {
  const out = [];
  const total = alloc.reduce((n, a) => n + poolCost(a.name, a.rating), 0) + (Number(init) || 0);
  if (total > pool) out.push(`The allocation costs ${total}: the pool holds ${pool} (black hammer and killjoy cost 2 a point, p.141).`);
  for (const a of alloc) if ((Number(a.rating) || 0) > mpcp) out.push(`${a.name}-${a.rating} exceeds MPCP ${mpcp} (p.141).`);
  if (!((Number(init) || 0) in SK_INIT_STEPS)) out.push(`Initiative takes 1, 3 or 5 points (2D6, 3D6, 4D6), not ${init} (p.141).`);
  const names = new Set(alloc.map(a => a.name.toLowerCase()));
  for (const [name, r] of Object.entries(locked ?? {})) {
    const now = alloc.find(a => a.name.toLowerCase() === name.toLowerCase())?.rating ?? 0;
    if (r > 0 && (!names.has(name.toLowerCase()) || now < r)) out.push(`${name}'s ${r} points are locked until the SK regenerates on its native host (p.141).`);
  }
  return out;
}
/** The locks after an allocation (p.141): restore and medic never drop below what they held. */
export function nextLocks(locked = {}, alloc = []) {
  const out = { ...locked };
  for (const a of alloc) if (isLockable(a.name)) out[a.name] = Math.max(out[a.name] ?? 0, Number(a.rating) || 0);
  return out;
}

/**
 * An SK's condition, folded in ORDER (6b §5, R1 #7, R3 #2): hits add boxes, losses add per attribute, a full repair
 * zeroes both, a partial repair heals boxes or one attribute. A repair sits at its `at` seq (an arrival's move), not
 * the seq it was written with. `upto` folds only what came up to that seq (a replayed resolution's "after").
 */
export function skCondition(records = [], upto = Infinity) {
  const pos = (e) => (e.type === "skRepair" ? (e.at ?? e.seq ?? 0) : (e.seq ?? 0));
  const evs = records.filter(e => ["frameHit", "frameAttr", "skRepair"].includes(e.type) && pos(e) <= upto)
    .sort((a, b) => pos(a) - pos(b) || (a.type === "skRepair") - (b.type === "skRepair"));
  let monitor = 0;
  const lost = { bod: 0, evasion: 0, masking: 0, sensor: 0 }, seen = new Set();
  for (const e of evs) {
    if (e.type === "frameHit") { if (seen.has(`h${e.card}`)) continue; seen.add(`h${e.card}`); monitor = Math.min(10, monitor + (Number(e.boxes) || 0)); }
    else if (e.type === "frameAttr") { if (seen.has(`a${e.card}`)) continue; seen.add(`a${e.card}`); if (e.attr in lost) lost[e.attr] += Number(e.lost) || 0; }
    else if (e.full) { monitor = 0; for (const k in lost) lost[k] = 0; }
    else if (e.boxes) monitor = Math.max(0, monitor - (Number(e.boxes) || 0));
    else if (e.attr in lost) lost[e.attr] = Math.max(0, lost[e.attr] - (Number(e.points) || 0));
  }
  return { monitor, lost };
}
/**
 * Restore's TN on an SK (p.100: "the rating of the program that did the damage, the higher if several"), from damage
 * STILL outstanding (6b code R1 #8, R2 #2): folded in order; any repair that clears the attribute's loss forgets the
 * ratings that caused it.
 */
export function skRestoreTN(records = [], attr) {
  const pos = (e) => (e.type === "skRepair" ? (e.at ?? e.seq ?? 0) : (e.seq ?? 0));
  let loss = 0, ratings = [];
  for (const e of records.filter(x => x.type === "frameAttr" || x.type === "skRepair").sort((a, b) => pos(a) - pos(b))) {
    if (e.type === "frameAttr") { if (e.attr === attr && e.lost > 0) { loss += e.lost; ratings.push(Number(e.rating) || 2); } }
    else if (e.full) { loss = 0; ratings = []; }
    else if (e.attr === attr) { loss = Math.max(0, loss - (Number(e.points) || 0)); if (!loss) ratings = []; }
  }
  return Math.max(2, ...ratings);
}
