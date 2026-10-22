/**
 * Cybermancy (optional; docs/PLAN-cybertechnology-phase6.md; Cybertechnology pp.78–84). Pure:
 * no Foundry. Everything that matters is an append-only log of durable records, folded here.
 * `neg` is always max(0, −signed Essence): at or above 0 every consequence is 0.
 */
import { MONTH_S } from "./mbw-rules.mjs";

export const DAY_S = 86400;
const EPS = 1e-9;
/** The half-point band (one rounding rule): −0.01 → 1, −0.50 → 1, −0.51 → 2. */
export const band = (neg) => neg <= EPS ? 0 : Math.ceil(neg / 0.5 - EPS);
/** Cybersurgery/Cybermancy Survival Table (p.80): 4 for −.05..−.50, +2 per further .5. */
export const survivalTN = (neg) => 2 + 2 * Math.max(1, band(neg));
/** Chronic Dissociation Syndrome Table (p.83): { months between tests, TN } by band. */
export function cdsBand(neg) {
  const b = band(neg);
  if (b <= 0) return null;
  const T = { 1: [6, 3], 2: [6, 4], 3: [6, 5], 4: [4, 5], 5: [4, 6], 6: [3, 6], 7: [2, 6] };
  const [months, tn] = T[b] ?? [2, 8 + (b - 8)];
  return { months, tn, periodS: months * MONTH_S };
}
/** Willpower (p.82): −1 per half point, up to 4 restored, the restoration capped at the pre-cybermancy rating. */
export function cymWillpower(w, neg, before) {
  const loss = band(neg);
  if (!loss) return w;
  const after = w - loss;
  const restore = Math.min(4, loss, Math.max(0, (before ?? w) - after));
  return Math.max(1, after + restore);
}
/** Social (p.83): +|E| (round up), the part below −2 counted double; one rounding. */
export const cymSocial = (neg) => neg <= EPS ? 0 : Math.ceil(Math.min(neg, 2) + 2 * Math.max(0, neg - 2) - EPS);
/** Magic against him (p.80–81): +2 × |E|, rounded up to a whole TN. */
export const magicSurcharge = (neg) => neg <= EPS ? 0 : Math.ceil(2 * neg - EPS);
/** Surprise Reaction +1 / Perception +2 per point or part (p.81–82), for the sheet's reminders. */
export const perPoint = (neg) => neg <= EPS ? 0 : Math.ceil(neg - EPS);
/** The surcharge on a magical test made against this actor (0 unless cybermantic with negative Essence). */
export const cymMagicTN = (actor) => actor?.system?.cym?.magic ?? 0;
/** A character's OWN raw test (no rollSuccessTest): CDS's +3 to all other tests (p.83). */
export const characterTN = (actor, tn) => tn + (actor?.system?.cym?.cds ? 3 : 0);
/** Better Off Dead (p.80): the Physical Damage Overflow (Body + 10) halved, rounded up. */
export const overflowMax = (body) => Math.ceil(((Number(body) || 0) + 10) / 2);
/** Cancer (p.84): 2D6 (+ the GM's bonuses) LESS than 2 × |intended Essence|. */
export const cancerDevelops = (roll, bonus, intendedNeg) => roll + (bonus || 0) < 2 * intendedNeg;
/** CDS treatment's Spell Resistance TN (p.84): 8, −1 per earlier treatment, minimum 2. */
export const cdsTreatTN = (earlier) => Math.max(2, 8 - (earlier || 0));
/** CDS recovery (p.84): 1 week, 1 day shorter per Willpower (6) success. */
export const cdsRecoveryDays = (successes) => Math.max(0, 7 - (successes || 0));

const VOIDABLE = new Set(["opRoll", "refill", "cds", "cdsTreat", "overflowOut"]);
/** Records that ARE a death (never voidable; `revive` is the only correction). */
const LETHAL = (e) => e.type === "death" || (e.type === "refill" && e.outcome === "died") || (e.type === "overflowOut" && e.outcome === "died");
const order = (a, b) => (a.wt ?? 0) - (b.wt ?? 0) || (a.at ?? 0) - (b.at ?? 0) || String(a.key).localeCompare(String(b.key));

/**
 * Fold the cybermancy log. `receipts`: the actor's `flags.sr2e.cymReceipts` (charge/refund
 * receipts land with the money itself). `now`: world time.
 */
export function foldCym(events = [], now = 0, receipts = {}) {
  const all = [...events].sort(order);
  const byKey = new Map(all.map(e => [e.key, e]));
  const latestOf = (type, n) => all.filter(e => e.type === type && e.n === n);
  const isLatestSlot = (e) => {
    const slots = all.filter(x => x.type === e.type).map(x => x.n);
    return e.n === Math.max(...slots);
  };
  const voidOk = (t) => {
    if (!t || !VOIDABLE.has(t.type) || LETHAL(t)) return false;
    if (t.type === "opRoll") return !receipts?.[t.opId]?.charged && !all.some(e => (e.type === "opDone" || e.type === "opCancelIntent") && e.opId === t.opId);
    if (t.type === "refill" || t.type === "cds") return isLatestSlot(t);
    if (t.type === "overflowOut") return t.outcome === "survived";
    return true;
  };
  const voided = new Set(all.filter(e => e.type === "void" && voidOk(byKey.get(e.target))).map(e => e.target));
  const live = all.filter(e => e.type !== "void" && !voided.has(e.key));
  const L = (type) => live.filter(e => e.type === type);
  const latest = (list) => list.at(-1) ?? null;

  // Operations.
  const ops = new Map();
  for (const e of L("op")) ops.set(e.opId, { opId: e.opId, proposal: e, roll: null, cancelIntent: false, cancelled: false, done: null });
  for (const e of L("opRoll")) { const o = ops.get(e.opId); if (o) o.roll = e; }   // live attempts in order: the latest wins
  for (const e of L("opCancelIntent")) { const o = ops.get(e.opId); if (o) o.cancelIntent = true; }
  for (const e of L("opCancelled")) { const o = ops.get(e.opId); if (o) o.cancelled = true; }
  for (const e of L("opDone")) { const o = ops.get(e.opId); if (o) o.done = e; }
  const established = L("opDone").find(d => !ops.get(d.opId)?.cancelled) ?? null;
  const incomplete = [...ops.values()].filter(o => !o.done && !o.cancelled && (o.roll?.survived || o.cancelIntent));

  // Death: the latest lethal record unless a later revive.
  const lethal = live.filter(LETHAL), revives = L("revive");
  const lastDeath = latest(lethal), lastRevive = latest(revives);
  const dead = !!lastDeath && (!lastRevive || order(lastRevive, lastDeath) < 0);

  // Suspension.
  const transitions = live.filter(e => e.type === "suspend" || e.type === "resume");
  const lastT = latest(transitions);
  const suspended = lastT?.type === "suspend";

  // Chains: the next due for refills and CDS.
  const chain = (type, initial) => {
    let n = 0, next = initial;
    for (let k = 1; ; k++) {
      const res = latest(latestOf(type, k).filter(e => live.includes(e)));
      if (!res) break;
      n = k; next = res.nextDue ?? next;
    }
    const lastRes = n ? latest(latestOf(type, n).filter(e => live.includes(e))) : null;
    if (lastT?.type === "resume" && (!lastRes || order(lastT, lastRes) > 0)) next = type === "refill" ? lastT.nextRefill : lastT.nextCds;
    return { resolved: n, next };
  };
  const refill = chain("refill", established?.nextRefill ?? null);
  const cds = chain("cds", established?.nextCds ?? null);
  const running = !!established && !dead && !suspended;
  const due = (c) => running && c.next != null && c.next <= now ? { n: c.resolved + 1, dueAt: c.next } : null;

  // CDS: active from a failure until a later "reversed" treatment.
  const treats = L("cdsTreat");
  let cdsActive = null;
  for (const e of [...L("cds"), ...treats].sort(order)) {
    if (e.type === "cds" && e.failed && !cdsActive) cdsActive = { since: e.wt, deathAt: e.deathAt };
    if (e.type === "cdsTreat" && e.outcome === "reversed") cdsActive = null;
  }
  const lastReversed = latest(treats.filter(t => t.outcome === "reversed"));

  return {
    active: !!established, established, dead, suspended, ops, incomplete,
    refillDue: due(refill), cdsDue: due(cds), nextRefill: refill.next, nextCds: cds.next,
    refillResolved: refill.resolved, cdsResolved: cds.resolved,
    cds: cdsActive, treatments: treats.length, recoveryUntil: lastReversed?.recoveryUntil ?? null,
    cancer: L("cancer").map(c => c.opId),
    transitions: transitions.length, lastTransition: lastT?.type ?? null,
    cares: L("care"), overflowOut: (receipt) => latest(L("overflowOut").filter(o => o.receipt === receipt)),
    attemptsOf: (prefix) => all.filter(e => String(e.key).startsWith(prefix)).length,
    voidable: live.filter(e => voidOk(e)),
    live: new Set(live.map(e => e.key)), byKey
  };
}
