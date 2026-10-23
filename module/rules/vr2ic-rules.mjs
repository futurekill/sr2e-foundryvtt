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
  const icAlive = (icKey) => { const [u, g] = String(icKey).split("#"); return icGen(u) === Number(g); };

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
    // Locks: black hits whose IC is still on that incarnation.
    const locks = hits.filter(h => icAlive(h.icKey));
    const dead = hits.some(h => { const r = res(h.card, "meat"); return r && acks.get(r.key)?.outcome?.down; });
    // Traces.
    const traces = T("trace").filter(t => t.conn === n).map(t => traceState(t, events, crashSeq));
    const traced = traces.some(t => t.complete);
    // Derived exit steps (plan §3a).
    let steps = [];
    if (exit) {
      for (const k of exit.locks ?? []) steps.push({ step: "lastAttack", ref: k });
      for (const h of hits) { const r = res(h.card, "meat"); if (r && acks.get(r.key)?.outcome?.down) steps.push({ step: "finalShot", ref: h.card }); }
      for (const c of events.filter(e => e.type === "gray" && e.conn === n)) steps.push({ step: "gray", ref: c.card });
      for (const t of traces) if (!t.complete && !t.dead && (t.startSeq ?? 0) < exit.seq) steps.push({ step: "datatrail", ref: t.icKey });
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
  const crash = crashSeq(t.icKey);
  const frozenAt = (seq) => {
    const open = new Set();
    for (const f of freezes) { if (f.seq > seq) break; if (f.type === "freeze") open.add(f.spoof); else open.delete(f.spoof); }
    return open.size > 0;
  };
  let left = t.turns ?? 0, completeSeq = left <= 0 ? t.seq : null;
  for (const k of ticks) {
    if (completeSeq != null) break;
    if (crash != null && k.seq > crash) break;
    if (spoofs.some(s => s.boundary === k.boundary && s.seq < k.seq) || frozenAt(k.seq)) continue;
    left -= 1;
    if (left <= 0) completeSeq = k.seq;
  }
  const complete = completeSeq != null && (crash == null || completeSeq < crash);
  return { icKey: t.icKey, conn: t.conn, rating: t.rating, startSeq: t.seq, turnsLeft: Math.max(0, left), complete,
    dead: !complete && crash != null, frozen: frozenAt(Infinity), clock: t.clock,
    lastBoundary: ticks.at(-1)?.boundary ?? null };
}
