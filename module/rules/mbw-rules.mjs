/**
 * Move-by-wire complications (docs/PLAN-cybertechnology-phase4.md §8; Cybertechnology
 * pp.54–55). Pure: no Foundry. The state is an append-only log of immutable event
 * records, folded here; nothing derived is ever stored.
 */

/** Complication Test Table (p.55): months between tests and the target number, by level. */
export const PERIOD_MONTHS = { 1: 6, 2: 4, 3: 4, 4: 3 };
export const COMPLICATION_TN = { 1: 3, 2: 4, 3: 5, 4: 6 };
// shortcut: a month is 30 days (Foundry has no calendar months without Calendaria); upgrade if Calendaria months are wanted.
export const MONTH_S = 30 * 86400;
export const periodSeconds = (level) => (PERIOD_MONTHS[level] ?? 6) * MONTH_S;

/** "move-by-wire:3" → 3; anything without a level → 0. */
export const wareLevel = (rule) => { const m = /:(\d+)$/.exec(rule ?? ""); return m ? Number(m[1]) : 0; };

/**
 * The complication test's dice (p.54): ⌊(Body + Willpower) / 2⌋, where cyber can add at
 * most +2 to Body and magic adds nothing. Inputs are the natural (already permanently
 * reduced) ratings and the working ware's contributions.
 */
export function complicationDice({ naturalBody = 0, wareBody = 0, naturalWillpower = 0, wareWillpower = 0 } = {}) {
  const b = naturalBody + Math.min(2, Math.max(0, wareBody));
  const w = naturalWillpower + Math.max(0, wareWillpower);
  return Math.max(0, Math.floor((b + w) / 2));
}

/** What the GM is offered (p.55): 2+ nothing, 1 TLE-x, 0 CCSS (or CCSS and TLE-x). */
export const proposal = (successes) => successes >= 2 ? "none" : successes === 1 ? "tle" : "ccss";

/** CCSS Recovery Table (p.55), rounded DOWN to a row (user ruling): 6+, 4–5, 1–3, 0. */
export const CCSS_ROWS = {
  1: { label: "Damage Level 1", loss: { quickness: 1, willpower: 1 } },
  2: { label: "Damage Level 2", loss: { quickness: 1, intelligence: 1, willpower: 1 } },
  3: { label: "Damage Level 3", loss: { strength: 1, quickness: 1, willpower: 1, intelligence: 2 } },
  4: { label: "Damage Level 4", loss: { strength: 1, quickness: 1, willpower: 1 }, intelligenceZero: true }
};
export const ccssRow = (successes) => successes >= 6 ? 1 : successes >= 4 ? 2 : successes >= 1 ? 3 : 4;

/** CCSS rehabilitation (p.55): (10 − unaugmented Body) weeks, at least 5, 50,000¥ a week. */
export function ccssRehab(naturalBody) {
  const weeks = Math.max(5, 10 - (Number(naturalBody) || 0));
  return { weeks, cost: weeks * 50000 };
}

/** A seizure's 6M Stun after a Body resistance (p.55): every 2 successes stage it down a level. */
export const seizureBoxes = (successes) => [3, 1, 0][Math.min(2, Math.floor(Math.max(0, successes) / 2))];

/** TLE-x treatment target (p.55): the first occurrence 8, the second 10; later ones are chronic. */
export const tleTreatTN = (occurrenceNumber) => occurrenceNumber === 1 ? 8 : occurrenceNumber === 2 ? 10 : null;

const VOIDABLE = new Set(["test", "outcome", "tleTreatment", "episode", "seizureResult", "ccssTreatment", "ccssRecovery"]);

/**
 * Fold the log. `events`: [{key, at, type, ...payload}] in any order. `now`: world time
 * (seconds). Returns everything the sheet, the rules and the prompts need.
 */
export function foldMbw(events = [], now = 0) {
  const all = [...events].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || String(a.key).localeCompare(String(b.key)));
  const byKey = new Map(all.map(e => [e.key, e]));
  const voided = new Set(all.filter(e => e.type === "void" && VOIDABLE.has(byKey.get(e.target)?.type)).map(e => e.target));
  // Structural dependencies: a record whose parent is missing or void is ignored.
  const live = new Set();
  const ok = (e) => {
    if (!e || voided.has(e.key)) return false;
    const parent = e.type === "outcome" ? e.test : e.type === "seizureResult" ? e.seizure
      : e.type === "tleTreatment" ? e.occurrence : e.type === "ccssTreatment" || e.type === "ccssRecovery" ? e.incident : null;
    return !parent || live.has(parent);
  };
  // Resolved to a FIXPOINT, independent of sort order: a child sharing its parent's
  // timestamp can sort before it and must still be live (Phase 5 maintenance fix).
  for (let changed = true; changed;) {
    changed = false;
    for (const e of all) if (e.type !== "void" && !live.has(e.key) && ok(e)) { live.add(e.key); changed = true; }
  }
  const L = (type) => all.filter(e => e.type === type && live.has(e.key));

  // Generations: the one install with no remove is open.
  const removed = new Set(L("remove").map(e => e.install));
  const gen = L("install").find(e => !removed.has(e.key)) ?? null;
  let dueSlots = 0, pendingSlots = [];
  const tests = L("test");
  if (gen) {
    dueSlots = Math.max(0, Math.floor((now - gen.since) / periodSeconds(gen.level)));
    const filled = new Set(tests.filter(t => t.gen === gen.key && t.n).map(t => t.n));
    for (let n = 1; n <= dueSlots; n++) if (!filled.has(n)) pendingSlots.push(n);
  }
  const attemptsOf = (g, n) => tests.filter(t => t.gen === g && t.n === n).length
    + all.filter(e => e.type === "test" && e.gen === g && e.n === n && !live.has(e.key)).length;

  // Outcomes → TLE-x occurrences and CCSS incidents.
  const outcomes = L("outcome");
  const occurrences = outcomes.filter(o => o.result === "tle" || o.result === "both").map((o, i) => ({ key: o.key, number: i + 1, at: o.at }));
  const treatedOk = new Set(L("tleTreatment").filter(t => t.success).map(t => t.occurrence));
  const chronic = occurrences.length >= 3;
  const untreated = occurrences.filter(o => !treatedOk.has(o.key));
  const active = untreated.length > 0;
  const nextTreat = untreated.find(o => tleTreatTN(o.number) !== null) ?? null;
  // The latest episode record; valid only while ITS occurrence is untreated, or chronic.
  const lastEp = L("episode").at(-1) ?? null;
  const episode = lastEp && lastEp.on
    && ((lastEp.chronic && chronic) || (lastEp.occurrence && !treatedOk.has(lastEp.occurrence) && occurrences.some(o => o.key === lastEp.occurrence)))
    ? { key: lastEp.key, reactionLoss: lastEp.reactionLoss ?? 0 } : null;

  const incidents = outcomes.filter(o => o.result === "ccss" || o.result === "both").map(o => {
    const test = byKey.get(o.test);
    const treat = L("ccssTreatment").find(t => t.incident === o.key) ?? null;
    const rec = L("ccssRecovery").find(r => r.incident === o.key) ?? null;
    return { key: o.key, itemId: o.itemId ?? test?.itemId ?? null, state: rec ? "recovered" : treat ? "treating" : "untreated",
      treatment: treat, recovery: rec };
  });
  const disabledItems = new Set(incidents.map(i => i.itemId).filter(Boolean));
  const loss = { strength: 0, quickness: 0, willpower: 0, intelligence: 0 };
  let intelligenceZero = false;
  for (const i of incidents) {
    const row = i.recovery && CCSS_ROWS[i.recovery.row];
    if (!row) continue;
    for (const [k, v] of Object.entries(row.loss)) loss[k] += v;
    if (row.intelligenceZero) intelligenceZero = true;
  }
  const results = new Set(L("seizureResult").map(r => r.seizure));
  const seizures = L("seizure").map(s => ({ ...s, result: L("seizureResult").find(r => r.seizure === s.key) ?? null }));

  return {
    gen, dueSlots, pendingSlots, nextSlot: pendingSlots[0] ?? null,
    nextAttempt: (n) => gen ? attemptsOf(gen.key, n) + 1 : 1,
    tests, outcomes, occurrences, chronic, active, nextTreat, episode,
    incidents, disabledItems, loss, intelligenceZero,
    pendingSeizures: seizures.filter(s => !results.has(s.key)), seizures,
    unresolvedTests: tests.filter(t => !outcomes.some(o => o.test === t.key)),
    voidable: all.filter(e => live.has(e.key) && VOIDABLE.has(e.type)),
    live: (key) => live.has(key)
  };
}
