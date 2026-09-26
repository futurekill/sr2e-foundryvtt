/**
 * Substance use and abuse (Shadowtech p.85–88, p.99) — the ledger fold.
 * See docs/PLAN-addiction.md (Round 1 design, Round 2–5 amendments).
 *
 * Pure: `substanceState(events, now)` replays an actor's append-only substance
 * events plus every timed rule in between, in one global timeline (the
 * one-recovery-at-a-time rule looks across drugs). Same events + same `now`
 * give the same result on every client, so nothing ever writes a "tick".
 */

export const HOUR = 3600;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
export const EVENT_VERSION = 1;

const TYPE_RANK = { dose: 0, test: 1, extend: 2, recovery: 3, therapy: 4, edit: 5, death: 6 };

/** Total, causal order (R2 #2, R3 #1): Lamport seq, then writer time, then id. */
export function orderEvents(events) {
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);          // code units: locale-independent
  return [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.at ?? 0) - (b.at ?? 0)
    || cmp(String(a.id), String(b.id)));
}

/** The next event's `t` and `seq` (R5 #3, R3 #1). */
export function nextStamp(events, worldTime, clock = 0) {
  let t = Math.max(Number(worldTime) || 0, Number(clock) || 0), seq = 0;
  for (const e of events) { t = Math.max(t, e.t ?? 0); seq = Math.max(seq, e.seq ?? 0); }
  return { t, seq: seq + 1 };
}

const blank = (drug) => ({
  drug, name: drug, base: null, uses: 0, addiction: 0, tolerance: 0,
  addicted: { P: false, M: false }, immune: false, state: "none",
  relapseTypes: { P: false, M: false },
  lastDose: null, window: null,              // the LATEST committed dose's {id, P:{deadline, extended}, M:{…}, body, willpower}
  accrued: 0, accrueFrom: null, weeks: 0,    // weekly addiction losses: seconds banked, running since, weeks paid
  dropCursor: null,                          // the last 24 h no-dose boundary consumed in withdrawal
  dropConsumed: null,                        // …remembered across state changes until the next dose
  boxesLost: 0, essenceLost: 0,
  withdrawalSince: null, recoverySince: null, restSince: null, restUntil: null, restRestored: 0,
  cleanFrom: null
});

const floorBase = (r) => {
  r.addiction = Math.max(r.base?.addiction ?? 0, r.addiction);
  r.tolerance = Math.max(r.base?.tolerance ?? 0, r.tolerance);
};
const accruing = (r) => r.state === "addicted" || r.state === "withdrawal";
const cleanInterval = (r) => {
  const s = Number(r.base?.strength) || 0;
  return s > 0 && s < 30 ? (30 - s) * DAY : null;     // S ≥ 30: no clean period (R2 #4)
};

/**
 * Replay the ledger.
 * @param {object[]} events  ledger events (unknown versions/types are skipped)
 * @param {number} now       the substance clock (R5 #4)
 * @returns {{drugs: Object<string, object>, steps: object[], implantsFailed: boolean,
 *            kamikazeUses: number, monitorLoss: number, essenceLost: number,
 *            penalty: "none"|"rest"|"recovery"|"withdrawal", dead: object|null, skipped: number}}
 */
export function substanceState(events = [], now = 0) {
  const drugs = {};
  const steps = [];
  const doses = new Map();                     // dose id → event (tests/extends anchor to it)
  let implantsFailed = false, dead = null, skipped = 0, clock = -Infinity;
  const rec = (d) => (drugs[d] ??= blank(d));
  const step = (r, type, t, payload = {}) => steps.push({ drug: r.drug, type, t, ...payload });
  let cur = -Infinity;                         // the time being processed: no tick is dated before it
  const busyRecovering = (except) => Object.values(drugs)
    .some(o => o.drug !== except && (o.state === "recovery" || o.state === "rest"));

  const openWindow = (r, dose) => {
    r.window = { id: dose.id, body: dose.body ?? 1, willpower: dose.willpower ?? 1,
      P: { deadline: dose.t + Math.max(1, dose.body ?? 1) * 4 * HOUR, extended: false },
      M: { deadline: dose.t + Math.max(1, dose.willpower ?? 1) * 4 * HOUR, extended: false } };
  };
  const setState = (r, s, t) => {
    if (accruing(r) && r.accrueFrom != null) { r.accrued += t - r.accrueFrom; r.accrueFrom = null; }
    r.state = s;
    r.withdrawalSince = s === "withdrawal" ? t : null;
    // "24 hours … without receiving a dose" (p.88): boundaries counted from the
    // last dose; only those reached while in withdrawal count.
    // A boundary falling exactly on entry is still pending (applied now).
    r.dropCursor = s === "withdrawal" && r.lastDose != null
      ? Math.max(r.lastDose + Math.max(0, Math.ceil((t - r.lastDose) / DAY) - 1) * DAY, r.dropConsumed ?? -Infinity)
      : null;
    if (s !== "recovery") r.recoverySince = null;
    if (accruing(r)) r.accrueFrom = t;
  };
  // Recovery ends the moment the rating is back at base, whatever lowered it.
  const checkBase = (r, t) => { if (r.state === "recovery" && r.addiction <= r.base.addiction) enterRest(r, t); };
  // Acquiring immunity while dependent → withdrawal at once (p.87).
  const immuneCheck = (r, t) => {
    if (r.immune && (r.addicted.P || r.addicted.M) && (r.state === "addicted" || r.state === "recovery")) {
      setState(r, "withdrawal", t); step(r, "withdrawal", t, { dep: "immune" });
    }
  };
  const enterRest = (r, t) => {
    r.relapseTypes = { ...r.addicted };
    r.addicted = { P: false, M: false };
    setState(r, "rest", t);
    r.restSince = t; r.restUntil = t + Math.max(0, r.addiction) * WEEK; r.restRestored = 0;
    step(r, "rest", t, { weeks: r.addiction });
  };
  const relapse = (r, t, dose) => {
    if (r.state === "rest") {
      // Only a retained dependency relapses (cleansing may have removed it).
      if (!r.relapseTypes.P && !r.relapseTypes.M) return false;
      r.addicted = { ...r.relapseTypes }; r.restSince = r.restUntil = null;
    }
    r.addiction += 1;
    setState(r, "addicted", t);
    openWindow(r, dose);
    step(r, "relapse", t, { addiction: r.addiction });
    return true;
  };

  // ── The timed rules: the earliest pending tick for one drug, if ≤ limit ──
  const nextTick = (r) => {
    const c = [];
    if (r.state === "addicted" && r.window) {
      for (const dep of ["P", "M"]) if (r.addicted[dep]) c.push({ t: r.window[dep].deadline, kind: "missed", dep });
    }
    if (r.state === "withdrawal" && r.dropCursor != null) c.push({ t: r.dropCursor + DAY, kind: "withdrawalDrop" });
    // The next unpaid week: an explicit threshold, so every tick moves it on
    // (no float-remainder scheduling that can repeat a timestamp).
    if (accruing(r)) c.push({ t: r.accrueFrom + ((r.weeks + 1) * WEEK - r.accrued), kind: "week" });
    if (r.state === "recovery") c.push({ t: r.recoverySince + 3 * DAY, kind: "recoveryDrop" });
    if (r.state === "rest") {
      // Restoration boundaries pass even with nothing to restore, so a later
      // baseline edit only gets future restoration.
      c.push({ t: r.restSince + (r.restRestored + 1) * 3 * DAY, kind: "restore" });
      c.push({ t: r.restUntil, kind: "cured" });
    }
    const iv = cleanInterval(r);
    // Clean boundaries are consumed even at base, so a later edit can't collect
    // reductions dated before it.
    if (iv && r.cleanFrom != null) c.push({ t: r.cleanFrom + iv, kind: "clean" });
    for (const k of c) k.t = Math.max(k.t, cur);               // overdue → now, never in the past
    const order = ["week", "missed", "withdrawalDrop", "recoveryDrop", "restore", "cured", "clean"];
    c.sort((a, b) => a.t - b.t || order.indexOf(a.kind) - order.indexOf(b.kind));
    return c[0] ?? null;
  };
  const applyTick = (r, k) => {
    switch (k.kind) {
      case "missed":
        setState(r, "withdrawal", k.t);
        step(r, "withdrawal", k.t, { dep: k.dep });
        break;
      case "withdrawalDrop":
        r.dropCursor += DAY; r.dropConsumed = r.dropCursor;
        if (r.addiction > r.base.addiction) { r.addiction -= 1; step(r, "withdrawalDrop", k.t, { addiction: r.addiction }); }
        break;
      case "week":
        r.weeks += 1; r.boxesLost += 1; r.essenceLost += 0.5;
        step(r, "week", k.t, { boxesLost: r.boxesLost, essenceLost: r.essenceLost });
        break;
      case "recoveryDrop":
        r.recoverySince = k.t;
        r.addiction = Math.max(r.base.addiction, r.addiction - 1);
        step(r, "recoveryDrop", k.t, { addiction: r.addiction });
        checkBase(r, k.t);
        break;
      case "restore":
        r.restRestored += 1;
        if (r.boxesLost > 0) { r.boxesLost -= 1; step(r, "restore", k.t, { boxesLost: r.boxesLost }); }
        break;
      case "cured":
        setState(r, "none", k.t); r.restSince = r.restUntil = null; r.relapseTypes = { P: false, M: false };
        step(r, "cured", k.t);
        break;
      case "clean": {
        r.cleanFrom += cleanInterval(r);
        const before = [r.addiction, r.tolerance];
        r.addiction -= 1; r.tolerance -= 1; floorBase(r);
        if (r.addiction !== before[0] || r.tolerance !== before[1]) {
          step(r, "clean", k.t, { addiction: r.addiction, tolerance: r.tolerance });
          checkBase(r, k.t);
        }
        break;
      }
    }
  };
  // Advance every drug to `limit`, globally ordered, ticks at `limit` included.
  const advance = (limit) => {
    for (;;) {
      let best = null, bestR = null;
      for (const r of Object.values(drugs)) {
        if (!r.base) continue;
        const k = nextTick(r);
        if (k && k.t <= limit && (!best || k.t < best.t || (k.t === best.t && r.drug < bestR.drug))) { best = k; bestR = r; }
      }
      if (!best) break;
      cur = best.t;
      applyTick(bestR, best);
    }
    clock = Math.max(clock, limit);
    cur = Math.max(cur, limit);
  };

  // ── Events ──
  for (const e of orderEvents(events)) {
    if (e.v !== EVENT_VERSION || !(e.type in TYPE_RANK) || !e.drug && e.type !== "death" && e.type !== "edit") { skipped++; continue; }
    if (e.pending) { skipped++; continue; }              // a claimed roll with no result yet
    const t = Math.max(clock === -Infinity ? (e.t ?? 0) : clock, e.t ?? 0);   // monotonic (R3 #4)
    advance(t);
    const r = e.drug ? rec(e.drug) : null;
    switch (e.type) {
      case "dose": {
        const s = e.snapshot ?? {};
        if (!r.base) {
          r.base = { addiction: Number(s.addiction) || 0, tolerance: Number(s.tolerance) || 0,
                     strength: Number(s.strength) || 0, P: !!s.P, M: !!s.M };
          r.addiction = r.base.addiction; r.tolerance = r.base.tolerance;
        }
        if (s.name) r.name = s.name;
        const dose = { id: e.id, t, body: e.body, willpower: e.willpower };
        doses.set(e.id, dose);
        r.uses += 1;
        if (r.base.strength > 0 && r.uses % r.base.strength === 0) {
          r.addiction += 1; r.tolerance += 1;
          step(r, "rise", t, { addiction: r.addiction, tolerance: r.tolerance });
        }
        r.lastDose = t; r.cleanFrom = t; r.dropConsumed = null;
        if (r.state === "withdrawal") r.dropCursor = t;          // any dose resets the no-dose clock
        openWindow(r, dose);                                      // the latest dose sets the window, always
        if (!r.immune && (r.state === "withdrawal" || r.state === "recovery" || r.state === "rest")) relapse(r, t, dose);
        // Kamikaze (p.99): implants fail after ⌊Body ÷ 2⌋ uses — latched (R1 #12).
        if (e.drug === "kamikaze" && r.uses >= Math.max(1, Math.floor((e.body ?? 1) / 2)) && !implantsFailed) {
          implantsFailed = true; step(r, "implantsFailed", t, { uses: r.uses });
        }
        break;
      }
      case "test": {
        const dose = doses.get(e.exposureId);
        if (!r.base || !dose) { skipped++; break; }            // legacy: informational (R3 #7)
        const failed = !((Number(e.successes) || 0) > 0);
        let changed = false;
        if (e.kind === "tolerance") {
          if (failed && !r.immune) { r.immune = true; changed = true; step(r, "immune", t); }
        } else if ((e.kind === "P" || e.kind === "M") && failed && r.base[e.kind] && !r.addicted[e.kind]) {
          r.addicted[e.kind] = true; changed = true;
          step(r, "addicted", t, { dep: e.kind });
          // The window is the LATEST dose's; an already-passed deadline turns
          // into withdrawal at once (the tick is clamped to now). A new
          // dependency found during rest ends the rest.
          if (r.state === "rest") { r.restSince = r.restUntil = null; setState(r, "addicted", t); }
          else if (r.state === "none") setState(r, "addicted", t);
        }
        if (changed) immuneCheck(r, t);                          // only on something new
        break;
      }
      case "extend": {
        const w = r.window, dep = e.dep;
        if (r.state !== "addicted" || !w || w.id !== e.windowId || !w[dep] || w[dep].extended || !r.addicted[dep]) { skipped++; break; }
        w[dep].extended = true;
        if ((Number(e.successes) || 0) > 0) {
          w[dep].deadline += Math.max(1, dep === "P" ? w.body : w.willpower) * HOUR;
          step(r, "extended", t, { dep, deadline: w[dep].deadline });
        }
        break;
      }
      case "recovery": {
        if (!r.base || !(r.state === "addicted" || r.state === "withdrawal") || busyRecovering(r.drug)) { skipped++; break; }
        if (!((Number(e.successes) || 0) > 0)) { step(r, "recoveryFailed", t); break; }
        setState(r, "recovery", t); r.recoverySince = t;
        step(r, "recovery", t);
        checkBase(r, t);
        break;
      }
      case "therapy": {
        if (!r.base) { skipped++; break; }
        if (e.kind === "geneCleanse") { if (r.immune) { r.immune = false; step(r, "immunityCleared", t); } break; }
        if (e.kind !== "cleansePhysical") { skipped++; break; }
        if (r.state === "rest") {                              // R4 #6: rest first, needs P
          if (!r.relapseTypes.P) { step(r, "therapyNoEffect", t); break; }
          r.relapseTypes.P = false; r.boxesLost = 0; step(r, "cleansed", t); break;   // rest continues
        }
        if (!r.addicted.P) { step(r, "therapyNoEffect", t); break; }
        r.addicted.P = false; r.boxesLost = 0;
        if (!r.addicted.M) setState(r, "none", t);            // the latest-dose window stays
        step(r, "cleansed", t, { remaining: r.addicted.M ? "M" : null });
        break;
      }
      case "edit": {
        const p = e.patch ?? {};
        if (r) {
          if (p.baseline && !r.base) {
            const b = p.baseline;
            r.base = { addiction: Number(b.addiction) || 0, tolerance: Number(b.tolerance) || 0,
                       strength: Number(b.strength) || 0, P: !!b.P, M: !!b.M };
            r.addiction = r.base.addiction; r.tolerance = r.base.tolerance;
            r.lastDose = b.lastDose ?? null;
            // Clean boundaries before the import are consumed, not applied: the
            // imported ratings are already current.
            const iv = cleanInterval(r), from = b.lastDose ?? t;
            r.cleanFrom = iv ? from + Math.floor(Math.max(0, t - from) / iv) * iv : from;
          }
          if (p.baseline) {                  // an import SETS history (R2 #11), validated
            const b = p.baseline;
            // Kamikaze's own history wins for Kamikaze (it drives wasting and the implant latch).
            const uses = r.drug === "kamikaze" && b.kamikazeUses != null ? b.kamikazeUses : b.uses;
            if (Number.isInteger(uses) && uses >= 0) r.uses = uses;
            if (Number.isInteger(b.boxesLost) && b.boxesLost >= 0) r.boxesLost = b.boxesLost;
            if (Number.isFinite(b.essenceLost) && b.essenceLost >= 0) r.essenceLost = b.essenceLost;
          }
          if (!r.base) { skipped++; break; }
          if (Number.isFinite(p.addiction)) r.addiction = p.addiction;
          if (Number.isFinite(p.tolerance)) r.tolerance = p.tolerance;
          floorBase(r);
          if (p.clearAddiction) {
            for (const dep of ["P", "M"]) if (p.clearAddiction === dep || p.clearAddiction === true) {
              r.addicted[dep] = false; r.relapseTypes[dep] = false;
            }
            if (!r.addicted.P && !r.addicted.M && (accruing(r) || r.state === "recovery")) setState(r, "none", t);
          }
          if (p.clearImmune) r.immune = false;
          checkBase(r, t);
        }
        if (p.restoreImplants) implantsFailed = false;
        if (p.clearDeath) dead = null;
        step(r ?? { drug: null }, "edit", t);
        break;
      }
      case "death":
        dead = { reason: e.reason ?? "", t, reviewedSeq: e.reviewedSeq ?? null };
        break;
    }
  }
  advance(Math.max(now, clock === -Infinity ? now : clock));

  let monitorLoss = 0, essenceLost = 0, kamikazeUses = 0, penalty = "none";
  const rank = { none: 0, rest: 1, recovery: 2, withdrawal: 3 };
  for (const r of Object.values(drugs)) {
    if (!r.base) continue;
    monitorLoss += r.boxesLost;
    essenceLost += r.essenceLost;
    if (r.drug === "kamikaze") kamikazeUses = r.uses;
    const s = r.state === "addicted" ? "none" : r.state;
    if (rank[s] > rank[penalty]) penalty = s;
    r.next = nextTick(r);                      // the next milestone, for the sheet/Calendaria
  }
  const wasting = Math.floor(kamikazeUses / 4);  // p.99: permanent, not an addiction loss
  return { drugs, steps, implantsFailed, kamikazeUses, wasting, monitorLoss: monitorLoss + wasting,
           essenceLost, penalty, dead, skipped };
}

/** TN penalty from the worst addiction state (p.87–88): [all, spellcasting]. */
export function addictionTnFor(penalty, kind) {
  const t = { withdrawal: [3, 6], recovery: [2, 4], rest: [1, 2] }[penalty];
  if (!t) return 0;
  return kind === "spell" ? t[1] : t[0];
}

/** Stable identity of a reported step (R4 #7): content changes → new id. */
export function stepId(s) {
  const { drug, type, t, ...payload } = s;
  const body = JSON.stringify(payload, Object.keys(payload).sort());
  let h = 0;
  for (let i = 0; i < body.length; i++) h = (h * 31 + body.charCodeAt(i)) | 0;
  return `${drug}:${type}:${t}:${(h >>> 0).toString(36)}`;
}
