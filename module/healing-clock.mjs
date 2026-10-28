/**
 * Healing on the game clock (docs/PLAN-healing-clock.md): with Calendaria active, a stage of
 * natural healing, a First Aid treatment and a box of Stun recovery land when their time has
 * passed; an unstabilized dying character bleeds a box every 10 minutes (SR2E p.111–115).
 *
 * State: `flags.sr2e.healClock.<stateKey(uuid)>` — keyed by the OWNING actor, so a synthetic
 * token actor never reads state inherited from its base actor. Every monitor change on a
 * character, NPC or spirit passes the preUpdateActor hook below, which keeps revisions, wound
 * and bleeding episodes in the same update (`clockChanges`). The clock's own writes carry the
 * `sr2eClock` option and decide their state themselves. Completions and bleeding ticks are
 * absolute writes from what was read, so a duplicate writer changes nothing.
 */
import { once, markersOf } from "./claims.mjs";
import { claimId, STUCK_MS } from "./rules/claim-rules.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { calendaria, calendarDate } from "./calendaria.mjs";
import { magicLost } from "./rules/sr2e-rules.mjs";
import { currentPenalties, careEnds as permCareEnds } from "./permanent-damage.mjs";
import { stateKey, normalize, clockChanges, courseValid, dueEvents, applyPending, lethalOverflow, STAGE_FLOOR, BLEED_S,
         durationText } from "./rules/healing-clock-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const setting = (key, fallback) => { try { return game.settings.get("sr2e", key); } catch (e) { return fallback; } };
const TRACKED = new Set(["character", "npc", "spirit"]);
export const tracked = (a) => TRACKED.has(a?.type) && !!a.system?.conditionMonitor?.physical;

/** Test seam: Quench forces the gate on (true) or off (false); null = the real gate. */
export const testSeam = { force: null };

/** Is the healing clock on? (Calendaria active AND the world setting.) */
export function healingClockOn() {
  if (testSeam.force != null) return testSeam.force;
  return !!calendaria() && setting("healingClock", true);
}

export const statePath = (a) => `flags.sr2e.healClock.${stateKey(a.uuid)}`;
export const clockState = (a) => normalize(a?.flags?.sr2e?.healClock?.[stateKey(a.uuid)]);
const monitorOf = (a) => {
  const cm = a.system.conditionMonitor;
  return { phys: cm.physical?.value ?? 0, over: cm.overflow ?? 0, stun: cm.stun?.value ?? 0 };
};
const when = (t) => calendarDate(t) ?? durationText(Math.max(0, t - game.time.worldTime)) + " from now";
const card = (actor, html, extra = {}) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="sr2e-damage-result">${html}</div>`, ...extra });
const gmWhisper = () => ({ whisper: game.users.filter(u => u.isGM).map(u => u.id) });
const write = (actor, st, extra = {}, opts = {}) => actor.update({ ...extra, [statePath(actor)]: st }, { sr2eClock: true, ...opts });
/** Bleeding never counts time from before the clock was last switched on (D4). */
const epoch = () => Number(setting("healingClockEpoch", 0)) || 0;
const naturalBody = (a) => a.system.naturalAttrs?.body ?? Math.max(1, (a.system.body?.base ?? 1) + (a.system.body?.racial ?? 0));
const lethalFor = (a) => lethalOverflow(naturalBody(a), a.system.cym?.overflowMax ?? null);

// ── The hook (§2a) ─────────────────────────────────────────────────────────

const VOIDED = new Map();      // actor uuid → voided kinds, posted after the update lands
function onPreUpdate(actor, changes, options) {
  if (!tracked(actor) || options?.sr2eClock) return;
  const g = (p, d) => foundry.utils.getProperty(changes, p) ?? d;
  if (!foundry.utils.getProperty(changes, "system.conditionMonitor")) return;
  const before = monitorOf(actor);
  const after = { phys: g("system.conditionMonitor.physical.value", before.phys),
    over: g("system.conditionMonitor.overflow", before.over), stun: g("system.conditionMonitor.stun.value", before.stun) };
  if (after.phys === before.phys && after.over === before.over && after.stun === before.stun) return;
  const prior = actor.flags?.sr2e?.healClock?.[stateKey(actor.uuid)];
  // A world that never used the clock keeps no state for actors that never bleed or rest.
  if (!prior && !healingClockOn()) return;
  const { state, voided } = clockChanges(prior, before, after, game.time.worldTime, actor.uuid);
  foundry.utils.setProperty(changes, statePath(actor), state);
  if (voided.length) VOIDED.set(actor.uuid, voided);
}
function onUpdate(actor, changes, options, userId) {
  const v = VOIDED.get(actor.uuid);
  if (!v || userId !== game.user.id) return;
  VOIDED.delete(actor.uuid);
  card(actor, `<strong>${esc(actor.name)}: the wound changed</strong> — the ${v.map(k => k === "stun" ? "Stun recovery" : "healing").join(" and ")}
    under way stopped. Roll again when ready (SR2E p.112–113).`);
}

// ── Starting a course (§3) ─────────────────────────────────────────────────

/**
 * Admit a start before anything is rolled. One device wins `healstart:<uuid>:<column>:<gen>`.
 * @returns {Promise<{gen, r0}|null>}
 */
export async function admitStart(actor, column) {
  const st = clockState(actor);
  const c = st[column];
  if (c && courseValid(st, column)) {
    ui.notifications.warn(`${actor.name} is already ${column === "stun" ? "recovering Stun" : "healing"} — due ${when(c.dueAt)}.`);
    return null;
  }
  const gen = st.startGen?.[column] ?? 0;
  if (!await once(actor, `healstart:${actor.uuid}:${column}:${gen}`)) {
    ui.notifications.warn(`${actor.name}'s ${column === "stun" ? "Stun recovery" : "healing"} is being started on another device.`);
    return null;
  }
  return { gen, r0: column === "stun" ? { stun: st.rev.stun, restGen: st.restGen } : { phys: st.rev.phys } };
}

/**
 * Commit a start (or an attempt that started nothing: `course` null). Writes nothing if the GM
 * cleared this attempt as stuck; else bumps the column's start generation and installs the
 * course only if the wound didn't change while rolling and the slot is empty.
 * @returns {Promise<boolean>} whether the course was installed
 */
export async function commitStart(actor, column, adm, course, { stabilize = null } = {}) {
  const ok = await enqueueAttack(`damage:${actor.uuid}`, async () => {
    const st = clockState(actor);
    if ((st.startGen?.[column] ?? 0) !== adm.gen) return false;
    const same = column === "stun" ? (st.rev.stun === adm.r0.stun && st.restGen === adm.r0.restGen) : st.rev.phys === adm.r0.phys;
    // Permanent-damage penalties and continuous care must still be what the course was rolled for.
    const pen = column === "physical" && course?.pk != null ? currentPenalties(actor) : null;
    const penOk = !pen || (pen.key === course.pk && (!course.careRequired || pen.careGen === course.careGen));
    const fits = !!course && same && penOk && !(st[column] && courseValid(st, column));
    st.startGen = { ...(st.startGen ?? {}), [column]: adm.gen + 1 };
    if (fits) st[column] = column === "stun" ? { ...course, stunRev: st.rev.stun, restGen: st.restGen } : { ...course, rev: st.rev.phys };
    // A doctor's course on a bleeding patient is professional care: recorded in the SAME write.
    if (fits && stabilize && st.bleed) st.bleed = { ...st.bleed, pending: [...(st.bleed.pending ?? []), { kind: stabilize, at: game.time.worldTime }] };
    await write(actor, st);
    if (course && (!same || !penOk)) await card(actor, `<strong>${esc(actor.name)}: the wound changed while you rolled</strong> — roll again.`);
    return fits;
  });
  if (ok && stabilize) await reconcileHealing(actor);          // outside the queue: it queues itself
  return ok;
}

// ── Reconciliation (§4, §6, §6a) ───────────────────────────────────────────

/**
 * Bring an actor's clock up to `now`: clear invalid courses, start an episode for unexplained
 * overflow, then apply due completions and bleeding ticks in time order, then owed Magic loss.
 * The active GM runs it on clock changes; an owner runs it before a treatment (settlement).
 * @returns {Promise<boolean>} false while owed bleeding is held by another writer — a treatment
 *   must not go ahead, or it would forgive that bleeding (Codex code review #3).
 */
export async function reconcileHealing(actor, now = game.time.worldTime, { forceTakeover = false } = {}) {
  if (!tracked(actor) || !actor.isOwner) return true;
  if (!healingClockOn()) return true;                           // off: nothing accrues (D4)
  await epochSync;                                              // never settle against a stale epoch
  const settled = await enqueueAttack(`damage:${actor.uuid}`, async () => {
    // 1. Invalid courses (their wound changed while the hook wasn't watching).
    let st = clockState(actor);
    const pen = st.physical?.pk != null ? currentPenalties(actor) : null;
    const penStale = (c) => !!pen && (pen.key !== c.pk || (c.careRequired && pen.careGen !== c.careGen));
    const bad = ["physical", "stun"].filter(k => st[k] && (!courseValid(st, k) || (k === "physical" && penStale(st[k]))));
    if (bad.length) {
      for (const k of bad) st[k] = null;
      await write(actor, st);
      await card(actor, `<strong>${esc(actor.name)}:</strong> the ${bad.map(k => k === "stun" ? "Stun recovery" : "healing").join(" and ")}
        under way stopped — the wound, its permanent damage or its care changed. Roll again (SR2E p.112–114).`);
    }
    // 2. Overflow with no bleeding episode (before the feature, or while it was off).
    const mon = monitorOf(actor);
    st = clockState(actor);
    if (mon.over > 0 && !st.bleed) {
      st.bleed = { id: claimId(`bleed:${actor.uuid}:${st.rev.phys}`), cursor: now, stable: null, lethal: false };
      await write(actor, st);
    }
    // Turning the clock on doesn't charge bleeding for the time it was off: the cursor is
    // clamped to the epoch, and the clamp is persisted before any tick is claimed.
    // An unknown epoch (switched on, not yet saved by the GM): settle nothing rather than guess.
    if (!epoch()) return false;
    const ep = epoch();
    st = clockState(actor);
    if (st.bleed && st.bleed.cursor < ep) {
      st.bleed = { ...st.bleed, cursor: ep };
      await write(actor, st);
    }
    // 3. Due events, oldest first.
    for (let guard = 0; guard < 20; guard++) {
      st = clockState(actor);
      let ev = dueEvents(st, now);
      // Recorded stabilization changes take effect at THEIR times, oldest first: ticks before the
      // next one are owed, ticks after it wait; once none before it remain, it is applied.
      const p = st.bleed?.pending?.length ? [...st.bleed.pending].sort((x, y) => x.at - y.at)[0] : null;
      if (p && p.at <= now) {
        ev = ev.filter(e => e.kind !== "tick" || e.at <= p.at);
        if (!ev.some(e => e.at <= p.at)) {
          st.bleed = applyPending(st.bleed, p.at);
          await write(actor, st);
          continue;
        }
      }
      if (!ev.length) return true;
      if (ev[0].kind === "tick") {
        // Aggregate the ticks up to the next completion (or all of them).
        const nextDone = ev.find(e => e.kind !== "tick");
        const n = ev.filter(e => e.kind === "tick" && (!nextDone || e.at < nextDone.at)).length;
        const claimed = { id: st.bleed.id, cursor: st.bleed.cursor };
        if (!await claimTick(actor, claimed, forceTakeover)) return false;
        await applyTicks(actor, n, claimed);
      } else {
        await complete(actor, ev[0].kind);
      }
    }
    return true;
  });
  await settleMagicLoss(actor);
  return settled;
}

/**
 * One writer per bleeding cursor. A claim whose write never landed is retaken after STUCK_MS,
 * or at once by the GM's Settle (`force`); either way applyTicks is fenced by the cursor.
 */
async function claimTick(actor, bleed, force = false) {
  const base = `bleed:${actor.uuid}:${bleed.id}:${bleed.cursor}`;
  if (await once(actor, base)) return true;
  const m = markersOf(actor).find(x => x.key === base);
  const age = m ? game.time.serverTime - (Number(m.at) || 0) : 0;
  if (force) return once(actor, `${base}:f${game.time.serverTime}`);
  if (age < STUCK_MS) return false;
  return once(actor, `${base}:t${Math.floor(age / STUCK_MS)}`);
}

/** Bleeding: `n` boxes onto overflow, never past the first lethal value, never lowering it (§6). */
async function applyTicks(actor, n, claimed) {
  const st = clockState(actor), mon = monitorOf(actor);
  if (!st.bleed || st.bleed.stable || st.bleed.lethal || n <= 0) return;
  // Only the episode and cursor that were claimed: a resumed old claimant writes nothing.
  if (st.bleed.id !== claimed.id || st.bleed.cursor !== claimed.cursor) return;
  const lethal = lethalFor(actor);
  const over = Math.max(mon.over, Math.min(mon.over + n, lethal));
  const died = over >= lethal;
  st.bleed = { ...st.bleed, cursor: st.bleed.cursor + n * BLEED_S, lethal: died };
  st.restGen += 1;                                              // bleeding is not rest (p.112)
  if (st.stun) { st.stunCap ??= st.stun.successes; st.stun = null; }
  await write(actor, st, { "system.conditionMonitor.overflow": over }, { sr2eBleed: true });
  if (died && await once(actor, `lethal:${actor.uuid}:${st.bleed.id}`)) {
    await card(actor, `<strong>${esc(actor.name)} has bled out</strong> — overflow ${over} is past their Body (SR2E p.111).
      The GM decides: <em>Survived</em> on the sheet if they were saved in time.`, gmWhisper());
  }
}

/** A due course lands: absolute values from the course (§4). */
async function complete(actor, kind, expectedId = null) {
  const st = clockState(actor), c = st[kind];
  if (!c || !courseValid(st, kind) || (expectedId && c.id !== expectedId)) return;
  if (kind === "stun") {
    const before = monitorOf(actor).stun;
    st.stun = null; st.stunCap = null; st.rev.stun += 1;
    await write(actor, st, { "system.conditionMonitor.stun.value": c.target });
    if (await once(actor, `healcard:${actor.uuid}:${c.id}`)) {
      await card(actor, `<strong>${esc(actor.name)} recovered 1 box of Stun</strong> <em>(${before} → ${c.target}) after resting (SR2E p.112).</em>`);
    }
    return;
  }
  if (c.pk != null) {
    const pen = currentPenalties(actor);
    if (pen.key !== c.pk || (c.careRequired && pen.careGen !== c.careGen)) {
      st.physical = null;
      await write(actor, st);
      await card(actor, `<strong>${esc(actor.name)}:</strong> ${c.careRequired && pen.careGen !== c.careGen
        ? "continuous care stopped, so this stage of healing stopped" : "the permanent damage changed, so the healing time changed"} — roll Heal again (SR2E p.113).`);
      return;
    }
  }
  const before = monitorOf(actor).phys;
  const upd = actor.healStageUpdate("physical", c.level, { firstAided: c.kind === "aid", careKey: `healclock-${c.id}` });
  const floor = STAGE_FLOOR[c.level] ?? 0;
  const checks = c.magician ? (c.deadly ? 1 : 0) + (c.waiveMagician ? 1 : 0) : 0;
  st.physical = null; st.rev.phys += 1;
  if (floor === 0) st.injury = null;
  st.bleed = null;                                              // overflow goes with the stage
  if (checks) st.loss = { ...st.loss, [c.id]: { n: checks, why: c.deadly ? "a Deadly wound" : "treated without the magician modifier" } };
  await write(actor, st, upd);
  if (await once(actor, `healcard:${actor.uuid}:${c.id}`)) {
    await actor.healStageCard("physical", c.level, before, floor,
      c.kind === "aid" ? "First aid treatment finished (SR2E p.115)." : `${c.doctor ? "With a doctor" : "Natural healing"} — this stage's time has passed (SR2E p.113).`);
  }
}

/** Magic loss checks owed by completed courses (p.115): one receipt per check (§4). */
async function settleMagicLoss(actor) {
  const st = clockState(actor);
  for (const [id, owed] of Object.entries(st.loss)) {
    for (let i = 0; i < owed.n; i++) {
      if (clockState(actor).lossDone?.[id]?.[i]) continue;
      const key = `magicloss:${actor.uuid}:${id}:${i}`;
      if (!await once(actor, key)) {
        // Claimed elsewhere and never receipted: the GM takes it over as a manual check.
        const m = markersOf(actor).find(x => x.key === key);
        if (game.user.isGM && m && game.time.serverTime - (Number(m.at) || 0) > STUCK_MS) {
          const s2 = clockState(actor);
          if (s2.lossDone?.[id]?.[i]) continue;
          s2.lossDone = { ...s2.lossDone, [id]: { ...(s2.lossDone[id] ?? {}), [i]: "manual" } };
          await write(actor, s2);
          await card(actor, `A Magic loss check for ${esc(actor.name)} (${esc(owed.why)}) was interrupted — roll 2D6 vs Magic by hand (SR2E p.115).`, gmWhisper());
        }
        continue;
      }
      const magic = actor.system.magic?.value ?? 0;
      const roll = await new Roll("2d6").evaluate();
      const lost = magic > 0 && magicLost(roll.total, magic);
      const s2 = clockState(actor);
      if (s2.lossDone?.[id]?.[i]) continue;                    // a manual takeover got there first
      s2.lossDone = { ...s2.lossDone, [id]: { ...(s2.lossDone[id] ?? {}), [i]: lost ? "lost" : "kept" } };
      await write(actor, s2, lost ? { "system.magic.value": magic - 1 } : {});
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Magic loss check (${owed.why}, SR2E p.115): 2D6 ${roll.total}
        vs Magic ${magic} — ${lost ? `<strong>1 point of Magic is lost permanently</strong> (now ${magic - 1})` : "no loss"}.` });
    }
    const done = clockState(actor);
    if (Object.keys(done.lossDone?.[id] ?? {}).length >= owed.n) {
      // The receipts stay: they fence a resumed worker after a manual takeover.
      await actor.update({ [`${statePath(actor)}.loss.-=${id}`]: null }, { sr2eClock: true });
    }
  }
}

/** Quench only: the fenced tick writer. */
export const _test = { applyTicks: (actor, n, claimed) => enqueueAttack(`damage:${actor.uuid}`, () => applyTicks(actor, n, claimed)) };

// ── Bleeding state transitions (§6) ────────────────────────────────────────

/**
 * Stabilize ("aid" | "self" | "care") or end it (null). Recorded as an intent with its own time,
 * so it never fails: reconciliation charges the bleeding owed before that time and then applies it,
 * now or — if another device holds the settlement — on the next reconcile.
 */
export async function setStable(actor, stable) {
  await enqueueAttack(`damage:${actor.uuid}`, async () => {
    const st = clockState(actor);
    if (!st.bleed) return;
    st.bleed = { ...st.bleed, pending: [...(st.bleed.pending ?? []), { kind: stable, at: game.time.worldTime }] };
    await write(actor, st);
  });
  await reconcileHealing(actor);
  return true;
}

// ── GM controls (§7) ───────────────────────────────────────────────────────

export const GM_ACTIONS = {
  async finish(actor, kind) {
    const id = clockState(actor)[kind]?.id;                      // the course the GM clicked, and no other
    if (!id) return;
    // Settle in time order first, so an earlier bleeding interruption still counts (§6a);
    // with the clock off nothing accrues, so the GM finishes it directly.
    if (healingClockOn() && !await reconcileHealing(actor)) return ui.notifications.warn("Bleeding is still being settled — try Settle first.");
    await enqueueAttack(`damage:${actor.uuid}`, () => complete(actor, kind, id));
    return settleMagicLoss(actor);
  },
  cancel: (actor, kind) => enqueueAttack(`damage:${actor.uuid}`, async () => {
    const st = clockState(actor);
    st[kind] = null;
    await write(actor, st);
  }),
  interrupt: (actor, kind) => enqueueAttack(`damage:${actor.uuid}`, async () => {
    const st = clockState(actor);
    if (kind === "stun" && st.stun) { st.stunCap ??= st.stun.successes; st.restGen += 1; }
    st[kind] = null;
    await write(actor, st);
    await card(actor, `<strong>${esc(actor.name)}:</strong> ${kind === "stun"
      ? "rest interrupted — the next recovery roll can't beat the first (SR2E p.112)." : "first aid interrupted — it can be repeated (SR2E p.115)."}`);
  }),
  clearStart: (actor, kind) => enqueueAttack(`damage:${actor.uuid}`, async () => {
    const st = clockState(actor);
    st.startGen = { ...(st.startGen ?? {}), [kind]: (st.startGen?.[kind] ?? 0) + 1 };
    await write(actor, st);
  }),
  care: (actor) => setStable(actor, "care"),
  careEnds: async (actor) => { await permCareEnds(actor); return setStable(actor, null); },
  survived: (actor) => enqueueAttack(`damage:${actor.uuid}`, async () => {
    const st = clockState(actor);
    if (st.bleed) st.bleed = { ...st.bleed, lethal: false, stable: "care" };
    await write(actor, st);
  }),
  settle: (actor) => reconcileHealing(actor, game.time.worldTime, { forceTakeover: true })
};

/** What the sheet shows: running courses and bleeding, with dates. */
export function clockView(actor) {
  // Shown whenever there is state, even with the clock off: the GM can still finish or cancel.
  if (!tracked(actor) || !actor.flags?.sr2e?.healClock?.[stateKey(actor.uuid)]) return null;
  const st = clockState(actor);
  const course = (k) => {
    const c = st[k];
    if (!c || !courseValid(st, k)) return null;
    const label = k === "stun" ? `1 Stun box (→ ${c.target})`
      : c.kind === "aid" ? `First aid: ${c.level} → one level down` : `${c.level} → next level${c.doctor ? " (doctor)" : ""}`;
    return { kind: k, label, due: when(c.dueAt) };
  };
  const b = st.bleed;
  const stuck = (k) => {
    const gen = st.startGen?.[k] ?? 0;
    const m = markersOf(actor).find(x => x.key === `healstart:${actor.uuid}:${k}:${gen}`);
    return !!m && game.time.serverTime - (Number(m.at) || 0) > STUCK_MS;
  };
  const courses = [course("physical"), course("stun")].filter(Boolean);
  const bleed = b ? { stable: b.stable, lethal: b.lethal, label: b.lethal ? "Bled out — the GM decides"
    : b.stable ? { aid: "Stabilized (first aid — must be maintained)", self: "Stabilized itself", care: "Under medical care" }[b.stable]
      : `Bleeding: +1 overflow every 10 minutes (next ${when(Math.max(b.cursor, epoch()) + BLEED_S)})` } : null;
  const stuckStarts = ["physical", "stun"].filter(stuck);
  return (courses.length || bleed || stuckStarts.length) ? { courses, bleed, stuckStarts, isGM: game.user.isGM } : null;
}

// ── Calendar notes (§8) ────────────────────────────────────────────────────

const noteRun = (actor, fn) => enqueueAttack(`hcnote:${actor.uuid}`, fn);
function ownNote(api, id, actor) {
  const doc = id ? api.getNoteDocument?.(id) : null;
  return doc?.getFlag?.("sr2e", "healingNote")?.actorUuid === actor.uuid ? doc : null;
}
/** One note for a running natural-healing stage; gone when it isn't (active GM only). */
export function syncHealingNote(actor) {
  const api = calendaria();
  if (!api || !game.users.activeGM?.isSelf || !tracked(actor)) return;
  return noteRun(actor, async () => {
    const key = stateKey(actor.uuid);
    const have = actor.flags?.sr2e?.healNote?.[key] ?? null;
    const st = clockState(actor);
    const c = st.physical && courseValid(st, "physical") && st.physical.kind === "natural" && healingClockOn() ? st.physical : null;
    const note = ownNote(api, have?.id, actor);
    try {
      if (!c) {
        if (note) await api.deleteNote(have.id);
        if (have) await actor.update({ [`flags.sr2e.healNote.-=${key}`]: null }, { sr2eClock: true });
        return;
      }
      const visibility = setting("healingNotesVisible", false) ? "visible" : "hidden";
      if (note && have.course === c.id) {
        if (have.visibility !== visibility) {
          await api.setNoteVisibility?.(have.id, visibility);
          await actor.update({ [`flags.sr2e.healNote.${key}.visibility`]: visibility }, { sr2eClock: true });
        }
        return;
      }
      if (note) await api.deleteNote(have.id);
      const page = await api.createNote({ name: `${actor.name}: ${c.level} heals a level`, startDate: api.timestampToDate(c.dueAt),
        allDay: false, visibility, openSheet: false, icon: "fas fa-heart-pulse", color: "#3bd16f",
        content: `<p>@UUID[${actor.uuid}]{${esc(actor.name)}} — natural healing, ${esc(c.level)} → the next level (SR2E p.113). Kept up to date by the SR2E system.</p>` });
      if (!page?.id) return;
      await api.getNoteDocument?.(page.id)?.setFlag("sr2e", "healingNote", { actorUuid: actor.uuid });
      await actor.update({ [`flags.sr2e.healNote.${key}`]: { id: page.id, course: c.id, visibility } }, { sr2eClock: true });
    } catch (err) { console.warn(`SR2E | healing note for ${actor.name} failed`, err); }
  });
}
async function clearHealingNote(actor) {
  const api = calendaria();
  const have = actor?.flags?.sr2e?.healNote?.[stateKey(actor.uuid)];
  if (!api || !game.users.activeGM?.isSelf || !have) return;
  try { if (ownNote(api, have.id, actor)) await api.deleteNote(have.id); } catch (e) { /* already gone */ }
}

// ── Wiring ─────────────────────────────────────────────────────────────────

/** Characters, NPCs and spirits: world actors and every scene's unlinked token actors. */
function allTracked() {
  const seen = new Map();
  for (const a of game.actors) if (tracked(a)) seen.set(a.uuid, a);
  for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && tracked(t.actor)) seen.set(t.actor.uuid, t.actor);
  return [...seen.values()];
}
const busy = (a) => {
  const st = a.flags?.sr2e?.healClock?.[stateKey(a.uuid)];
  return !!st && (st.physical || st.stun || st.bleed || Object.keys(st.loss ?? {}).length) || (a.system.conditionMonitor?.overflow ?? 0) > 0;
};
let scanning = null, epochSync = Promise.resolve();
/** The active GM reconciles everyone with something running — never before the epoch is saved. */
export function reconcileAll() {
  if (!game.users.activeGM?.isSelf || !healingClockOn()) return;
  if (scanning) return scanning;
  scanning = (async () => {
    await epochSync;
    for (const a of allTracked()) if (busy(a)) await reconcileHealing(a);
  })().catch(err => console.error("SR2E | healing clock", err)).finally(() => { scanning = null; });
  return scanning;
}

/** The active GM keeps the epoch: the world time the clock was last switched on. */
function syncEpoch() {
  epochSync = epochSync.then(async () => {
    if (!game.users.activeGM?.isSelf) return;
    const on = healingClockOn(), e = setting("healingClockEpoch", 0);
    if (on && !e) await game.settings.set("sr2e", "healingClockEpoch", game.time.worldTime || 1);
    if (!on && e) await game.settings.set("sr2e", "healingClockEpoch", 0);
  }).catch(err => console.error("SR2E | healing clock epoch", err));
  return epochSync;
}

export function registerHealingClockSettings() {
  game.settings.register("sr2e", "healingClock", {
    name: "Healing on the game clock (Calendaria)",
    hint: "With the Calendaria module active: healing stages, First Aid and Stun recovery land when their time has passed, and dying characters bleed a box every 10 minutes until stabilized (SR2E p.111–115). Off: healing resolves at once.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => { syncEpoch(); reconcileAll(); }
  });
  game.settings.register("sr2e", "healingNotesVisible", {
    name: "Players see healing notes",
    hint: "Off: the calendar notes for healing stages are GM-only (hidden). On: everyone can see them.",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => { if (game.users.activeGM?.isSelf) for (const a of allTracked()) syncHealingNote(a); }
  });
  game.settings.register("sr2e", "healingClockEpoch", { scope: "world", config: false, type: Number, default: 0 });
}

export function registerHealingClockHooks() {
  Hooks.on("preUpdateActor", onPreUpdate);
  Hooks.on("updateActor", onUpdate);
  Hooks.once("ready", async () => { await syncEpoch(); reconcileAll(); });
  for (const h of ["updateWorldTime", "userConnected"]) Hooks.on(h, () => reconcileAll());
  const pending = new Map();
  Hooks.on("updateActor", (actor, changes) => {
    if (!foundry.utils.getProperty(changes, "flags.sr2e.healClock") || !calendaria() || !game.users.activeGM?.isSelf) return;
    clearTimeout(pending.get(actor.uuid));
    pending.set(actor.uuid, setTimeout(() => { pending.delete(actor.uuid); syncHealingNote(actor); }, 250));
  });
  Hooks.on("deleteActor", (actor) => clearHealingNote(actor));
  Hooks.on("deleteToken", (tok) => { if (!tok.actorLink && tok.actor) clearHealingNote(tok.actor); });
}
