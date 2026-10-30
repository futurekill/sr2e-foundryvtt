/**
 * VR2.0 part 3: the rest of the IC (docs/PLAN-vr2-part3.md; Virtual Realities 2.0 pp.40–53).
 * Pure: no Foundry. State is an append-only log of durable records; facts whose ORDER
 * matters carry the world-wide GM sequencer's `seq`. Folds never trust a client's clock.
 */
import { icDamageLevel } from "./sr2e-rules.mjs";

// ── Arithmetic (each with the book's example in test/vr2ic-rules.test.mjs) ─────

/** Black IC's Damage Code (p.48): (Rating)M on Blue/Green, S on Orange/Red; +2 rating with the icon down. */
export const blackDamage = (code, rating, iconDown = false) =>
  ({ power: (Number(rating) || 0) + (iconDown ? 2 : 0), level: icDamageLevel(code) });
/** A gray IC's own test TN (p.43): MPCP + Hardening; sparky MPCP + 2 + Hardening. */
export const grayTN = (kind, mpcp, hardening) => (Number(mpcp) || 0) + (kind === "sparky" ? 2 : 0) + (Number(hardening) || 0);
/** MPCP/chip points lost (p.43): blaster and sparky 1 per 2 successes; rippers 1 per success. */
export const mpcpLoss = (kind, successes) => kind === "ripper" ? Math.max(0, successes) : Math.floor(Math.max(0, successes) / 2);
/** Trace Factor (p.45; redirects ADD, per the formula and its example, a stated reading). Half a trapped gray IC's rating, rounded down. */
export const traceFactor = ({ evasion = 0, rating = 0, camo = 0, redirects = 0, jackpoint = 0, trapGray = 0, trapBlack = 0 } = {}) =>
  evasion - rating + camo + redirects + jackpoint + Math.floor(trapGray / 2) + trapBlack;
/** Location cycle (p.45): ⌊10 ÷ successes⌋ Combat Turns; 0 completes at once. */
export const locationTurns = (successes) => successes > 0 ? Math.floor(10 / successes) : null;
/** Datatrail after jacking out (p.46): 1D6 − 1, minimum 1. */
export const datatrailTurns = (roll) => Math.max(1, (Number(roll) || 0) - 1);
/** Relocate's Control Test TN (p.46): the trace IC's rating less Relocate. */
export const relocateTN = (icRating, relocate) => Math.max(2, (Number(icRating) || 0) - (Number(relocate) || 0));
/** A data bomb's defuse TN (p.41): the subsystem rating less Defuse. */
export const defuseTN = (subsystem, defuse) => Math.max(2, (Number(subsystem) || 0) - (Number(defuse) || 0));
/** PCPIC's voluntary jack-out modifier by the decker's wound (p.50). */
export const pcpicMod = (level) => ({ L: 1, M: 2, S: 3, D: 5 })[level] ?? 0;
/** Psychotropic recovery TN (p.50): therapy −2, else medication/magic −1; a sustained spell −1 more; PCPIC +1. */
export function psychoRecoveryTN(rating, { medication = false, therapy = false, spell = false, pcpic = false } = {}) {
  return Math.max(2, (Number(rating) || 0) - (therapy ? 2 : medication ? 1 : 0) - (spell ? 1 : 0) + (pcpic ? 1 : 0));
}
/** A worm infects the MPCP (p.44): 1 success, or more successes than the Hardening. */
export const wormInfects = (successes, hardening) => (Number(hardening) || 0) > 0 ? successes > hardening : successes >= 1;
/** Host shutdown (p.53): 1D6 per 2 points (or part) of Security Value; the final warning ⌈1D6 ÷ 2⌉. */
export const shutdownDice = (sv) => Math.max(1, Math.ceil((Number(sv) || 0) / 2));
export const finalWarning = (roll) => Math.ceil((Number(roll) || 0) / 2);
/** Tally acceleration while traced (p.46): +1 to any increase. */
export const traceTally = (base, traced) => base > 0 && traced ? base + 1 : base;
/** Security Asset Response Times (p.47), in minutes; null = NA. Rows by the jackpoint's security rating. */
export const RESPONSE_TIMES = {
  rows: ["B or higher", "C", "D", "Z", "On site"],
  public:     ["10 + 2D6", "10 + 4D6", "20 + 4D6", null, null],
  corporate:  ["15 + 2D6", "15 + 3D6", "10 + 2D6", "10 + 1D6", "2D6 ÷ 2"],
  megacorp:   ["8 + 2D6", "10 + 1D6", "5 + 1D6", "5 + 1D6", "1D6 ÷ 2"],
  government: ["10 + 1D6", "10 + 1D6", "5 + 1D6", "5 + 1D6", "2D6 ÷ 2"]
};
/**
 * The boundary that ends the turn now in progress (plan §5): on a combat clock, the current
 * round; on the manual clock, the next manual tick. A Relocate spoofs THIS boundary.
 */
export function openBoundary(trace, ticks = [], round = null) {
  // Manual clock: m0 ends the hit's own turn (never counted, like the combat clock's start round).
  if (trace.clock?.manual) return `m${ticks.filter(t => String(t.boundary).startsWith("m")).length}`;
  return round;
}
/** Combat boundaries to tick when a combat moves to round `q`: rounds after the trace's own, not yet ticked, that ended. */
export function boundariesToTick(trace, ticks = [], q) {
  const start = trace.clock?.startRound ?? 0;
  const done = new Set(ticks.map(t => t.boundary));
  const out = [];
  for (let r = start + 1; r < q; r++) if (!done.has(r)) out.push(r);
  return out;
}
/**
 * A host's shutdown lifecycle from its records (plan §7): the latest started sequence n with no
 * reset; turns left = turns − its ticks (the starting turn counts: "the number of Combat Turns
 * the sequence will last", p.53). null when none is running.
 */
export function shutdownState(records = []) {
  const resets = new Set(records.filter(e => e.type === "shutdownReset").map(e => e.n));
  const run = records.filter(e => e.type === "shutdown" && !resets.has(e.n)).sort((a, b) => b.n - a.n)[0] ?? null;
  const nextN = 1 + Math.max(0, ...records.filter(e => e.type === "shutdown").map(e => e.n));
  if (!run) return { running: null, nextN };
  const ticks = records.filter(e => e.type === "shutdownTick" && e.n === run.n);
  const left = Math.max(0, run.turns - ticks.length);
  return { running: { ...run, left, offline: left <= 0, warned: left <= run.warning, ticks }, nextN };
}
/** Tar baby/pit (p.42): the tar wins only on MORE successes. */
export const tarWins = (tarSuccesses, utilitySuccesses) => tarSuccesses > utilitySuccesses;

/** A program's identity for corruption (plan §2): its compendium source, else its name slug. */
export const programKey = ({ source, name }) => source || String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const PERSONA = ["bod", "evasion", "masking", "sensor"];
/**
 * The VR2 persona (plan §2): `programs[attr]` = { loaded, best } (best usable rating, or 0
 * when every loaded copy is crashed/corrupted). Presence, not usability, decides the
 * authored fallback.
 */
export function personaVR2({ authored = {}, programs = {}, mpcp = 0, damage = {} } = {}) {
  const eff = Math.max(0, (Number(mpcp) || 0) - (damage.mpcp ?? 0));
  const out = { mpcp: eff };
  for (const a of PERSONA) {
    const p = programs[a];
    const raw = !p?.loaded ? (Number(authored[a]) || 0) : (p.best ?? 0);
    out[a] = eff <= 0 ? 0 : Math.max(0, Math.min(raw, eff) - (damage[a] ?? 0));
  }
  return out;
}

// ── The deck's history (records on the deck item) ────────────────────────────

/**
 * Fold a deck's records: chip incarnations, damage counted against the incarnation it hit,
 * worms (on the current MPCP chip), corruption at each program's current reload generation.
 */
export function foldDeck(records = []) {
  const chipGen = { mpcp: 0, persona: 0 };
  for (const r of records) if (r.type === "chipReplace" && r.chip in chipGen) chipGen[r.chip] += 1;
  const damage = { mpcp: 0, bod: 0, evasion: 0, masking: 0, sensor: 0 };
  for (const r of records) {
    if (r.type !== "deckDmg") continue;
    const chip = r.attr === "mpcp" ? "mpcp" : "persona";
    if ((r.chipGen ?? 0) === chipGen[chip] && r.attr in damage) damage[r.attr] += Math.max(0, Number(r.amount) || 0);
  }
  const worms = records.filter(r => r.type === "worm" && (r.chipGen ?? 0) === chipGen.mpcp).map(r => ({ key: r.key, kind: r.kind }));
  const reloadGen = new Map();
  for (const r of records) if (r.type === "reload") reloadGen.set(r.programKey, Math.max(reloadGen.get(r.programKey) ?? 0, (r.g ?? 0)));
  const gen = (k) => reloadGen.get(k) ?? 0;
  const corrupted = new Set(records.filter(r => r.type === "corrupt" && (r.g ?? 0) === gen(r.programKey)).map(r => r.programKey));
  const deathworms = worms.filter(w => w.kind === "death").length;
  return { chipGen, damage, worms, corrupted, reloadGen: gen, deathwormTN: deathworms ? 2 + (deathworms - 1) : 0 };
}

// ── The decker's log ───────────────────────────────────────────────────────────

/** The live connection's open record (an open with no end), or null; also the next number. */
export function liveOpen(records = []) {
  const ended = new Set(records.filter(e => e.type === "connEnd").map(e => e.n));
  const opens = records.filter(e => e.type === "connOpen").sort((a, b) => a.n - b.n);
  return { open: opens.filter(o => !ended.has(o.n)).at(-1) ?? null, nextN: (opens.at(-1)?.n ?? 0) + 1, any: opens.length > 0 };
}

const bySeq = (a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.key).localeCompare(String(b.key));

/**
 * Fold a decker's part-3 records.
 * @param {object[]} events  `{key, type, ...payload}`; sequencer facts carry `seq`.
 * @param {object} ext       `icGen(icUuid)` → the IC's current generation (undefined = gone),
 *                           `icCrashSeq(icKey)` → the seq of that incarnation's crash, if any,
 *                           `tapeworms` → the connection deck's tapeworm keys,
 *                           `ackOutcome` is read from `ack` records.
 */
export function foldVr2Ic(events = [], ext = {}) {
  const icGen = ext.icGen ?? (() => undefined);
  const crashSeq = ext.icCrashSeq ?? (() => null);
  const T = (type) => events.filter(e => e.type === type);
  const acks = new Map(T("ack").map(a => [a.target, a]));
  const ended = new Set(T("connEnd").map(e => e.n));
  const opens = T("connOpen").sort((a, b) => a.n - b.n);
  const live = opens.filter(o => !ended.has(o.n)).at(-1) ?? null;
  const nextN = (opens.at(-1)?.n ?? 0) + 1;
  // The ICON's generation decides (a construct program's key carries "/comp"; part 4b §1).
  const icAlive = (icKey) => { const { uuid, gen } = parseIcKey(icKey); return icGen(uuid) === gen; };

  const conn = (n) => {
    if (n == null) return null;
    const open = opens.find(o => o.n === n);
    const exit = T("exitOpen").find(e => e.n === n) ?? null;
    const admitted = T("admit").filter(a => a.conn === n).sort(bySeq);
    const hits = T("hit").filter(h => h.conn === n);
    const res = (card, side) => events.find(e => e.type === "res" && e.card === card && e.side === side);
    const acked = (key) => acks.has(key);
    // Attack resolution: every recorded resolution of the card acked, and every consequence it asked for.
    const consequences = (card) => events.filter(e => (e.type === "gray" || e.type === "ripper") && e.card === card);
    const resolved = (a) => {
      const h = hits.find(x => x.card === a.card);
      const base = h ? ["icon", "meat"].every(s => { const r = res(a.card, s); return r && acked(r.key); }) : acked(`attack:${a.card}`);
      return base && consequences(a.card).every(c => acked(c.key));
    };
    // Locks: black hits whose IC is still on that incarnation. A decker's lock (part 5a §2) ends per hit,
    // by its sequenced `lockEnd`; a hit frozen after its attacker was already gone never locks.
    const lockEnded = new Set(T("lockEnd").map(e => e.card));
    const locks = hits.filter(h => !h.lockless && !lockEnded.has(h.card) && (isDeckKey(h.icKey) || icAlive(h.icKey)));
    const dead = hits.some(h => { const r = res(h.card, "meat"); return r && acks.get(r.key)?.outcome?.down; });
    // Traces.
    const traces = T("trace").filter(t => t.conn === n).map(t => traceState(t, events, crashSeq));
    const traced = traces.some(t => t.complete);
    // Derived exit steps (plan §3a).
    let steps = [];
    if (exit) {
      for (const k of new Set(exit.locks ?? [])) steps.push({ step: "lastAttack", ref: k });
      // Black hammer and killjoy lack black IC's blaster-like MPCP shot (p.98).
      for (const h of hits) { const r = res(h.card, "meat"); if (!h.noBlaster && r && acks.get(r.key)?.outcome?.down) steps.push({ step: "finalShot", ref: h.card }); }
      for (const c of events.filter(e => e.type === "gray" && e.conn === n)) steps.push({ step: "gray", ref: c.card });
      // A Graceful Logoff stops location cycles (p.45); any other exit leaves a datatrail.
      if (exit.trigger !== "graceful") for (const t of traces) if (!t.complete && !t.dead && (t.startSeq ?? 0) < exit.seq) steps.push({ step: "datatrail", ref: t.icKey });
      if (exit.trigger !== "graceful" && open?.settings?.deckMode !== "tortoise" && !dead) steps.push({ step: "dumpShock", ref: "" });
      for (const h of hits) if (h.kind === "psychotropic") steps.push({ step: "psychotropic", ref: h.icKey });
      for (const w of ext.tapeworms ?? []) steps.push({ step: "tapeworm", ref: w });
      const seen = new Set();
      steps = steps.filter(s => { const k = `${s.step}:${s.ref}`; if (seen.has(k)) return false; seen.add(k); return true; });
      for (const s of steps) {
        s.res = events.find(e => e.type === "exitRes" && e.n === n && e.step === s.step && e.ref === s.ref) ?? null;
        s.applied = !!s.res && (s.res.cancelled || s.res.noEffect || acked(s.res.key));
      }
    }
    const pending = admitted.filter(a => !resolved(a));
    return { n, open, exit, admitted, pending, hits, locks, dead, traces, traced, steps,
      barrier: !!exit && steps.every(s => s.applied) && pending.length === 0,
      redirects: events.filter(e => e.type === "redirect" && e.conn === n).length,
      frozenCount: traces.filter(t => t.frozen && !t.complete).length };
  };

  const crashedPrograms = new Set(T("crash").map(c => `${c.programId}:${c.loadGen}`));
  const psy = T("psy").filter(c => !events.some(r => r.type === "psyRecover" && r.cond === c.key && r.success));
  return { live: conn(live?.n), liveN: live?.n ?? null, nextN, conn,
    programCrashed: (id, loadGen) => crashedPrograms.has(`${id}:${loadGen}`), psychotropic: psy };
}

/**
 * One trace's state from its sequencer facts: ticks count unless spoofed (a spoof admitted
 * for that boundary BEFORE the tick) or frozen at that point; complete iff the tick taking
 * it to 0 precedes the IC's crash (in seq).
 */
export function traceState(t, events, crashSeq = () => null) {
  const mine = (e) => e.conn === t.conn && e.icKey === t.icKey;
  const ticks = events.filter(e => e.type === "tick" && mine(e)).sort(bySeq);
  const spoofs = events.filter(e => e.type === "spoof" && mine(e));
  const freezes = events.filter(e => (e.type === "freeze" || e.type === "unfreeze") && mine(e)).sort(bySeq);
  // A track (part 5a §3) ends by its sequenced `traceDead`; an IC trace by its IC's crash.
  const td = events.filter(e => e.type === "traceDead" && mine(e)).sort(bySeq)[0];
  const crash = td ? td.seq : crashSeq(t.icKey);
  const frozenAt = (seq) => {
    const open = new Set();
    for (const f of freezes) { if (f.seq > seq) break; if (f.type === "freeze") open.add(f.spoof); else open.delete(f.spoof); }
    return open.size > 0;
  };
  let left = t.turns ?? 0, completeSeq = left <= 0 ? t.seq : null;
  for (const k of ticks) {
    if (completeSeq != null) break;
    if (crash != null && k.seq > crash) break;
    if (k.boundary === "m0") continue;   // the hit's own turn (p.45–46)
    if (spoofs.some(s => s.boundary === k.boundary && s.seq < k.seq) || frozenAt(k.seq)) continue;
    left -= 1;
    if (left <= 0) completeSeq = k.seq;
  }
  const complete = completeSeq != null && (crash == null || completeSeq < crash);
  return { icKey: t.icKey, conn: t.conn, rating: t.rating, startSeq: t.seq, turnsLeft: Math.max(0, left), complete,
    track: !!t.track, attacker: t.attacker ?? null,
    dead: !complete && crash != null, frozen: frozenAt(Infinity), clock: t.clock,
    lastBoundary: ticks.at(-1)?.boundary ?? null };
}

// ── Part 4a: the optional IC (docs/PLAN-vr2-part4.md; pp.51–53) ─────────────────

/** Proactive IC (p.41, p.45): they make Attack Tests. Trace only hunts, then turns reactive. */
export const PROACTIVE_IC = new Set(["killer", "crippler-acid", "crippler-binder", "crippler-jammer", "crippler-marker",
  "blaster", "sparky", "ripper-acid", "ripper-bind", "ripper-jam", "ripper-mark",
  "black-lethal", "black-nonlethal", "black-psychotropic", "trace"]);
export const isProactive = (program) => PROACTIVE_IC.has(program);

/** Cascading IC Table (p.51): the most an SV or a rating may rise. Percentages round down (the book is silent). */
export function cascadeCap(code, original) {
  const o = Math.max(0, Number(original) || 0);
  return { blue: 1, green: Math.max(Math.floor(o / 4), 2), orange: Math.max(Math.floor(o / 2), 3), red: Math.max(o, 4) }[code] ?? 0;
}

/** Expert IC (p.52): e > 0 adds attack dice and takes resistance dice, e < 0 the reverse. */
export function expertDice(sv, expert = 0) {
  const e = Math.max(-3, Math.min(3, Number(expert) || 0)), v = Number(sv) || 0;
  return { attack: Math.max(0, v + e), resist: Math.max(0, v - e) };
}

/**
 * Cascading outcomes recorded on ONE decker (all connections): one entry per admitted cascading attack.
 * A miss (0 successes, final — IC have no Karma) raises SV; a hit the decker fully neutralized raises
 * the rating (p.51). Black needs both its icon and meat outcomes at 0; a trace success is never neutral.
 * @returns {{icKey: string, card: string, kind: "sv"|"rating", cascade0: object}[]}
 */
export function cascadeOutcomes(events = []) {
  const acks = new Map(events.filter(e => e.type === "ack").map(a => [a.target, a]));
  const seen = new Set(), out = [];
  for (const a of events.filter(e => e.type === "admit" && e.cascade0?.on)) {
    if (seen.has(a.card)) continue;
    seen.add(a.card);
    const add = (kind) => out.push({ icKey: a.icKey, card: a.card, kind, cascade0: a.cascade0 });
    if (a.successes === 0) { add("sv"); continue; }
    if (!(a.successes > 0)) continue;
    const hit = events.find(e => e.type === "hit" && e.card === a.card);
    if (hit) {
      const sides = ["icon", "meat"].map(side => {
        const r = events.find(e => e.type === "res" && e.card === a.card && e.side === side);
        return r ? acks.get(r.key)?.outcome : undefined;
      });
      if (sides.every(o => o && o.boxes === 0)) add("rating");
      continue;
    }
    const o = acks.get(`attack:${a.card}`)?.outcome;
    if (!o || "trace" in o) continue;
    if (o.boxes === 0 || o.lost === 0) add("rating");
  }
  return out;
}

/** The cascade bonus from outcomes already filtered to this IC and its current baseline. */
export function cascadeBonus(outcomes = [], { code, sv0, rating0 }) {
  const n = (k) => outcomes.filter(o => o.kind === k).length;
  return { sv: Math.min(n("sv"), cascadeCap(code, sv0)), rating: Math.min(n("rating"), cascadeCap(code, rating0)),
    capSV: cascadeCap(code, sv0), capRating: cascadeCap(code, rating0) };
}

/**
 * Party IC budget (p.52–53): combined ratings ≤ 2 × SV; at most ⌊SV ÷ 2⌋ members; each option 1 point;
 * PCPIC can't share a party with other black IC (p.50).
 * @param {{rating: number, program: string, psychotropic?: string, expert?: number, cascading?: boolean,
 *          armorDefense?: boolean, defense?: string}[]} members
 */
export function partyBudget({ sv, members = [] }) {
  const capacity = 2 * (Number(sv) || 0), maxMembers = Math.floor((Number(sv) || 0) / 2);
  const opts = (m) => (m.expert ? 1 : 0) + (m.cascading ? 1 : 0) + (m.armorDefense ? 1 : 0) + (m.defense ? 1 : 0);
  const used = members.reduce((t, m) => t + (Number(m.rating) || 0) + opts(m), 0);
  const problems = [];
  if (members.length < 2) problems.push("a party needs at least 2 IC");
  if (members.length > maxMembers) problems.push(`at most ${maxMembers} IC (half the Security Value)`);
  if (used > capacity) problems.push(`ratings and options use ${used} of ${capacity} points (twice the Security Value)`);
  const black = members.filter(m => String(m.program).startsWith("black-"));
  if (black.some(m => m.psychotropic === "pcpic") && black.length > 1) problems.push("PCPIC can't share a party with other black IC (p.50)");
  return { capacity, used, maxMembers, problems };
}

// ── Part 4b: constructs (docs/PLAN-vr2-part4b.md; p.52) ─────────────────────────

/** "<uuid>#<gen>" or "<uuid>#<gen>/<comp>" → parts. The ICON is uuid#gen; the suffix is a construct component. */
export function parseIcKey(key) {
  const k = String(key ?? ""), i = k.lastIndexOf("#");
  if (i < 0) return { uuid: k, gen: NaN, comp: "" };
  const rest = k.slice(i + 1), j = rest.indexOf("/");
  return { uuid: k.slice(0, i), gen: Number(j < 0 ? rest : rest.slice(0, j)), comp: j < 0 ? "" : rest.slice(j + 1) };
}
/** A decker attacker's key (part 5a §0.5): `deck:<uuid>@<conn>`. */
export const isDeckKey = (key) => String(key ?? "").startsWith("deck:");
/** Either kind of attacker key → `{ kind: "ic", uuid, gen, comp }` or `{ kind: "deck", uuid, conn }`. */
export function parseAttackerKey(key) {
  const k = String(key ?? "");
  if (!isDeckKey(k)) return { kind: "ic", ...parseIcKey(k) };
  const body = k.slice(5), i = body.lastIndexOf("@");
  return { kind: "deck", uuid: i < 0 ? body : body.slice(0, i), conn: i < 0 ? NaN : Number(body.slice(i + 1)) };
}
/** The icon part of an IC key (drops a construct component). */
export const iconKeyOf = (key) => { const p = parseIcKey(key); return `${p.uuid}#${p.gen}`; };

/** Programs a construct may hold: the proactive set plus tar, worm and (poison) scramble — no data bombs. */
export const CONSTRUCT_PROGRAMS = new Set([...PROACTIVE_IC, "tar-baby", "tar-pit", "worm", "scramble"]);
/** Threat Rating caps by Security Code (p.52): Blue none, Green 1, Orange 2, Red 3. */
export const THREAT_CAP = { blue: 0, green: 1, orange: 2, red: 3 };

/**
 * Construct budget (p.52): capacity 2 × SV; no program over ⌈2/3 SV⌉; gray +1, black +2; armor / shield /
 * shift options 2 each; at least 2 programs; threat within the code's cap; valid, unique component rows.
 * @param {{sv: number, code: string, components: {id: string, program: string, rating: number, scramble?: string}[],
 *          defenses?: number, threat?: number}} c
 */
export function constructBudget({ sv, code, components = [], defenses = 0, threat = 0, icClassOf = () => "white" }) {
  const v = Number(sv) || 0, capacity = 2 * v, perProgram = Math.ceil(2 * v / 3);
  const extra = (p) => ({ gray: 1, black: 2 })[icClassOf(p)] ?? 0;
  const used = components.reduce((t, c) => t + (Number(c.rating) || 0) + extra(c.program), 0) + 2 * (Number(defenses) || 0);
  const problems = [], ids = new Set();
  if (components.length < 2) problems.push("a construct needs at least 2 programs");
  for (const c of components) {
    if (!c.id || ids.has(c.id)) problems.push("every program needs its own id"); ids.add(c.id);
    if (!c.program) problems.push("a program row has no program");
    else if (!CONSTRUCT_PROGRAMS.has(c.program)) problems.push(`${c.program} can't be part of a construct`);
    if (c.program === "scramble" && c.scramble === "exploding") problems.push("an exploding scramble needs its own bomb actor, not a construct");
    if ((Number(c.rating) || 0) > perProgram) problems.push(`no program over ${perProgram} (two-thirds of the Security Value)`);
  }
  if (used > capacity) problems.push(`programs and options use ${used} of ${capacity} points (twice the Security Value)`);
  if ((Number(threat) || 0) > (THREAT_CAP[code] ?? 0)) problems.push(`Threat Rating over ${THREAT_CAP[code] ?? 0} on ${code}`);
  return { capacity, used, perProgram, problems: [...new Set(problems)] };
}

// ── Part 5a: the utilities (docs/PLAN-vr2-part5.md; VR2.0 pp.97–100) ─────────────

/** Hog (p.98): 1 rating point per 2 net successes over the MPCP test; 0 = no infection. */
export const hogPoints = (attack, mpcp) => Math.max(0, Math.floor(((Number(attack) || 0) - (Number(mpcp) || 0)) / 2));
/** Hog purge TN (p.98): Hog rating − Hardening + the infected program's original rating, minimum 2 (after every modifier). */
export const hogPurgeTN = (rating, hardening, original) => Math.max(2, (Number(rating) || 0) - (Number(hardening) || 0) + (Number(original) || 0));
/**
 * The program a hog tick drains (p.98): it keeps the previous tick's copy while that copy is still usable,
 * else the highest-rated usable program (ties: lowest id). `programs` = [{ id, loadGen, rating }] (usable, rating > 0).
 */
export function hogTarget(prev, programs) {
  const keep = prev && programs.find(p => p.id === prev.itemId && p.loadGen === prev.loadGen && p.rating > 0);
  if (keep) return keep;
  return [...programs].filter(p => p.rating > 0).sort((a, b) => b.rating - a.rating || String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
/** Slow (p.99): actions lost, 1 per 2 net successes; a tie or a resistance win loses none. */
export const slowActionsLost = (attack, resist) => Math.max(0, Math.floor(((Number(attack) || 0) - (Number(resist) || 0)) / 2));
/** Track (p.97): it locks on when the Evasion successes fail to equal or beat the attack's. */
export const trackLocks = (attack, evasion) => (Number(attack) || 0) > (Number(evasion) || 0);
