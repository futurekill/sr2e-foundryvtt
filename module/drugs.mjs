/**
 * Drugs and toxins (Shadowtech p.85–100) — the lean core, see docs/PLAN-drugs.md.
 *
 * Automated: spending a dose, the drug's attribute Active Effects (with a
 * displayed duration, ended by hand), toxin damage resisted with Body, and the
 * addiction / tolerance tests, and the substance ledger (docs/PLAN-addiction.md):
 * every dose and test is an append-only event under `flags.sr2e.substanceLog`,
 * folded by module/rules/substances.mjs. The rest is on the card for the GM.
 *
 * A drug is a gear item with `flags.sr2e.drug` (content modules supply it) and
 * Active Effects holding its numeric ADD changes. One person drives an actor:
 * every mutation runs in a per-actor local queue and re-reads state there.
 */
import { effectChanges, changeIsAdd, effectTiming, isZeroDuration, makeDrugEffectData } from "./effects-compat.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { drugDuration, toxinLevel, drugDamage, damageUpdateFor, halveBonus, testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { substanceState, nextStamp, EVENT_VERSION, stepId } from "./rules/substances.mjs";
import { doseKey, doseHoldState, STUCK_MS } from "./rules/claim-rules.mjs";
import { once, markersOf, pruneMarkers } from "./claims.mjs";
import { moneyQueue, updated } from "./money.mjs";
import { RL, AL } from "./util/roll-label.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const BOXES = { L: 1, M: 3, S: 6, D: 10 };
const queue = (actor, fn) => enqueueAttack(`dose:${actor.uuid}`, fn);
const asActor = (d) => d?.documentName === "Token" ? d.actor : d;
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };

export const drugOf = (item) => item?.type === "gear" ? (item.flags?.sr2e?.drug ?? null) : null;

/** Active drug effects on an actor, with their remaining time, for the sheets. */
export function activeDrugs(actor) {
  return (actor?.effects ?? []).filter(e => e.flags?.sr2e?.drugEffect).map(e => {
    const { timed, expired, text } = effectTiming(e);
    return { id: e.id, name: e.name, img: e.img, key: e.flags.sr2e.drugEffect.key,
             exposureId: e.flags.sr2e.drugEffect.exposureId, expired,
             label: !timed ? "until ended" : expired ? "expired" : text };
  });
}

/**
 * Drug effects IN FORCE: not disabled (they last until ended by hand, like the
 * attributes — expiry only labels the row), and not a zero-duration tracking
 * entry (shrugged off, or a toxin with no lasting effect). Oldest first.
 */
export function drugsInForce(actor) {
  return (actor?.effects ?? [])
    .filter(e => e.flags?.sr2e?.drugEffect && !e.disabled && !isZeroDuration(e._source))
    .sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0))
    .map(e => ({ id: e.id, ...e.flags.sr2e.drugEffect }));
}

/**
 * THE damage commit for characters, NPCs and spirits: Kamikaze absorption and
 * Hyper overload (Shadowtech p.98–99), the monitors, the spent absorption and
 * the caller's own marker (`extra`), all in ONE update inside a per-actor queue
 * that re-reads the monitors and counters. Returns what actually happened.
 * @param {Actor} actor
 * @param {"physical"|"stun"} type
 * @param {number} amount
 * @param {{extra?:object, report?:boolean}} [opts] report:false when the caller's own card says it
 * @returns {Promise<{landedBoxes:number, absorbed:number, overloadStun:number}>}
 */
export function commitDamage(actor, type, amount, { extra = {}, report = true, skipIf = null, source = null, receipt = null } = {}) {
  receipt ??= foundry.utils.randomID();   // unique per commit: listeners dedupe on it
  const done = enqueueAttack(`damage:${actor.uuid}`, async () => {
    // Re-checked INSIDE the queue: a receipted consequence can't land twice.
    if (skipIf?.()) return { landedBoxes: 0, absorbed: 0, overloadStun: 0, skipped: true };
    const inForce = drugsInForce(actor);
    const counters = actor.getFlag("sr2e", "drugAbsorb") ?? {};
    const absorbers = inForce.filter(e => (counters[e.exposureId] ?? 0) > 0)
      .map(e => ({ id: e.exposureId, left: counters[e.exposureId] }));
    const r = drugDamage({ amount, absorbers, overload: inForce.some(e => e.overload) });
    const cm = actor.system.conditionMonitor;
    let mon = { physical: { ...cm.physical }, stun: { ...cm.stun }, overflow: cm.overflow ?? 0 };
    const hit = (t, n) => {
      const o = damageUpdateFor(mon, t, n);
      mon = { physical: { ...mon.physical, value: o.physical }, stun: { ...mon.stun, value: o.stun }, overflow: o.overflow };
    };
    if (r.landed) hit(type === "stun" ? "stun" : "physical", r.landed);
    if (r.overloadStun) hit("stun", r.overloadStun);
    const update = { ...extra };
    if (r.landed || r.overloadStun) Object.assign(update, {
      "system.conditionMonitor.physical.value": mon.physical.value, "system.conditionMonitor.stun.value": mon.stun.value,
      "system.conditionMonitor.overflow": mon.overflow });
    for (const [id, used] of Object.entries(r.absorbUsed)) update[`flags.sr2e.drugAbsorb.${id}`] = counters[id] - used;
    if (Object.keys(update).length) await actor.update(update);
    const out = { landedBoxes: r.landed, absorbed: r.absorbed, overloadStun: r.overloadStun };
    if (report && (r.absorbed || r.overloadStun)) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">💊 ${drugDamageNote(out)}</div>` }); }
      catch (err) { console.error("SR2E | drug damage note failed", err); }
    }
    return out;
  });
  // AFTER the queue settles (never inside it): who needs to know damage landed
  // (move-by-wire seizures, Cybertechnology p.55). `source` keeps a seizure's own damage out.
  done.then(out => { if (!out?.skipped) Hooks.callAll("sr2e.damageCommitted", actor, out, { source, type: type === "stun" ? "stun" : "physical", receipt }); }).catch(() => {});
  return done;
}

/** "Kamikaze absorbs 3; Hyper adds 1 Stun" — for any damage card. */
export const drugDamageNote = ({ absorbed, overloadStun }) => [
  absorbed ? `Kamikaze absorbs ${absorbed} box${absorbed === 1 ? "" : "es"}` : "",
  overloadStun ? `Hyper adds ${overloadStun} Stun (Shadowtech p.98)` : ""].filter(Boolean).join("; ");

// ── Cards ──────────────────────────────────────────────────────────────────

function renderDoseCard(st) {
  const btn = (cls, label, title = "") => `<button type="button" class="sr2e-resist-btn ${cls}" title="${esc(title)}">${label}</button>`;
  const buttons = [];
  if (st.damage && !st.resolved) buttons.push(btn("sr2e-toxin-resist-btn", `Resist ${st.damage.power}${st.damage.level}${st.damage.type === "stun" ? " Stun" : ""} (Body)`,
    "Body only — no Combat Pool, no armour (Shadowtech)"));
  if (st.repeatMinutes && !st.repeatUsed) buttons.push(btn("sr2e-toxin-next-btn", `${st.repeatMinutes} minutes pass: next damage`,
    "It keeps doing damage until neutralised or filtered out (GM)"));
  if (st.tests) buttons.push(btn("sr2e-drug-tests-btn", "After it wears off: Addiction / Tolerance", "SR2E Shadowtech p.87"));
  if (st.lost) buttons.push(btn("sr2e-drug-reapply-btn", "Re-apply its effect (GM)", "The effect was lost when the session ended mid-dose"));
  return `<div class="sr2e-damage-result sr2e-drug-card"><strong>💊 ${esc(st.actorName)}: ${esc(st.name)}${st.seq ? ` (damage ${st.seq + 1})` : ""}</strong>
    ${st.duration ? `<br>Effects last <strong>${esc(st.duration)}</strong> — end them from the sheet's active drugs.` : ""}
    ${st.overuse ? `<br><em>${st.stimulant ? "A second dose before the first wore off: a Light Stun wound, and this dose's bonuses are halved (p.85)."
      : "The same drug is already active."}</em>` : ""}
    ${st.resolved ? `<br><strong>${esc(st.resolved)}</strong>` : ""}
    ${st.notes ? `<br><em>${esc(st.notes)}</em>` : ""}
    ${buttons.length ? `<div class="sr2e-karma-actions">${buttons.join("")}</div>` : ""}</div>`;
}

async function postCard(actor, st) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderDoseCard(st),
    flags: { sr2e: { drugCard: st } } });
}

const cardFor = (actorUuid, exposureId, seq) => game.messages.find(m => m.flags?.sr2e?.drugCard?.exposureId === exposureId
  && m.flags.sr2e.drugCard.actorUuid === actorUuid && (m.flags.sr2e.drugCard.seq ?? 0) === seq);

async function updateCard(message, st) {
  if (!(message.isAuthor || game.user.isGM)) return;
  await message.update({ content: renderDoseCard(st), "flags.sr2e.drugCard": st });
}

// ── Use a dose ─────────────────────────────────────────────────────────────

/** A dose's timing for makeDrugEffectData (seconds, or rounds of THIS actor's combat). */
function effectDuration(d, actor) {
  if (!d) return { indefinite: true };
  if (d.minutes != null) return { seconds: d.minutes * 60, startTime: game.time.worldTime };
  // The started combat THIS actor is fighting in (a token's own actor counts).
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
  if (combat) return { rounds: d.turns, combat: combat.id, startRound: combat.round, startTurn: combat.turn ?? 0 };
  return { seconds: d.turns * 3, startTime: game.time.worldTime };     // a Combat Turn is 3 seconds
}

const durationText = (d) => !d ? "" : d.minutes != null ? `${d.minutes} minute${d.minutes === 1 ? "" : "s"}`
  : `${d.turns} Combat Turn${d.turns === 1 ? "" : "s"}`;

// ── The substance ledger (docs/PLAN-addiction.md) ─────────────────────────

/** The actor's ledger events, each with its id. */
export const ledgerOf = (actor) => Object.entries(actor?.flags?.sr2e?.substanceLog ?? {}).map(([id, e]) => ({ ...e, id }));
/** Substance time (R5 #4): the GM-advanced clock or the latest event, never world time directly. */
export const substanceNow = (actor, events = ledgerOf(actor)) =>
  Math.max(0, Number(actor?.flags?.sr2e?.substanceClock) || 0, ...events.map(e => Number(e.t) || 0));
/**
 * Kamikaze (p.99): "the character's bioware and cyberware will no longer
 * function". THE predicate every implant function checks (R1 #13) — installed
 * implants still cost Essence and Body Index; they just do nothing.
 */
export const implantsWork = (actor) => !substancesOf(actor).implantsFailed;
/** An installed implant that still works. */
export const workingImplant = (actor, item) => !!item?.system?.installed && implantsWork(actor);

/** The folded state for an actor, cached per ledger object and clock (derived data reads it often). */
const FOLD_CACHE = new WeakMap();
const EMPTY_LOG = {};
export function substancesOf(actor) {
  const log = actor?.flags?.sr2e?.substanceLog ?? EMPTY_LOG;
  const clock = Number(actor?.flags?.sr2e?.substanceClock) || 0;
  const hit = FOLD_CACHE.get(log);
  if (hit && hit.clock === clock) return hit.fold;
  const events = ledgerOf(actor);
  const fold = substanceState(events, substanceNow(actor, events));
  if (log !== EMPTY_LOG) FOLD_CACHE.set(log, { clock, fold });
  return fold;
}
/** A new event's stamp: monotonic t, Lamport seq (R3 #1, R5 #3). */
const stampFor = (actor) => ({
  ...nextStamp(ledgerOf(actor), game.time.worldTime, actor.flags?.sr2e?.substanceClock), at: Date.now(), v: EVENT_VERSION });
const naturalOf = (actor, attr) => actor.system._naturalAttribute?.(attr)
  ?? Math.max(1, (actor.system[attr]?.value ?? 1) - (actor.system[attr]?.mod ?? 0));
/** The drug's ratings as a ledger snapshot (the first dose's becomes the base). */
const snapshotOf = (item, drug) => ({ name: item.name, addiction: Number(drug.addiction?.rating) || 0,
  tolerance: Number(drug.tolerance) || 0, strength: Number(drug.strength) || 0, P: !!drug.addiction?.P, M: !!drug.addiction?.M });

/** Doses committed in THIS session: only these may have a missing effect recreated (R5 #5). */
const COMMITTED_THIS_SESSION = new Set();
/** Effects deleted on this client, recorded synchronously before the delete lands (R5 #5). */
const ENDED_HERE = new Set();

/** The ONE client that finishes an actor's interrupted doses: its first active
 *  non-GM owner (by user id), else the active GM (Codex stage-2 #3). */
export function doseDriverOf(actor) {
  const owners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return owners[0] ?? game.users.activeGM ?? null;
}

/**
 * Finish a committed dose from its STORED plan (R4 #3), each step idempotent
 * with durable evidence: the ledger event, overuse Stun, the absorption
 * counter, the effect, the ACTH pump, the card. Clears the item's commit when
 * every step is done.
 */
async function completeDose(actor, item, exposureId, gen) {
  const plan = item?.flags?.sr2e?.doseCommits?.[exposureId];
  if (!plan || plan.actorUuid !== actor.uuid) return true;       // not ours (a copy): ignored
  const key = `flags.sr2e.substanceLog.${exposureId}`;
  const ev = () => actor.flags?.sr2e?.substanceLog?.[exposureId];
  const receipts = () => ev()?.receipts ?? {};
  // Only the holder of the newest claim runs the steps; a GM force-finish supersedes
  // this one (a mitigation: it can't recall a write already sent).
  const go = async (step) => {
    await stepHook?.(exposureId, gen, step);
    return doseHoldState(markersOf(actor), exposureId, game.time.serverTime).gen <= gen;
  };
  if (!(await go("event"))) return "superseded";
  // 1. The ledger event and the absorption counter, ONE update (R4 #3). The
  //    new counter is inert until its effect exists (drugsInForce), so the
  //    overuse wound below can only be soaked by an EARLIER dose.
  if (!ev()) {
    await actor.update({ [key]: { ...plan.event, effectPlan: plan.effect ?? null, receipts: { absorb: true } },
      ...(plan.absorb > 0 ? { [`flags.sr2e.drugAbsorb.${exposureId}`]: plan.absorb } : {}) });
  }
  // 2. Overuse: the Light Stun and its receipt in one update, re-checked inside
  //    the damage queue so it can never land twice.
  if (!(await go("overuse"))) return "superseded";
  if (plan.overuse && !receipts().overuse) {
    await commitDamage(actor, "stun", 1, { extra: { [`${key}.receipts.overuse`]: true }, skipIf: () => !!receipts().overuse });
  }
  // 3. The effect: deterministic id (the exposureId). Never resurrect one that
  //    was ended; across sessions a missing one is "lost" and the GM can
  //    re-apply it from the ledger (R5 #5).
  if (!(await go("effect"))) return "superseded";
  if (!receipts().effect) {
    let receipt;
    if (!plan.effect) receipt = "none";
    else if (actor.effects.get(exposureId)) receipt = "done";
    else if (ENDED_HERE.has(exposureId) || receipts().ended) receipt = "ended";
    else if (COMMITTED_THIS_SESSION.has(exposureId)) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{ ...plan.effect, _id: exposureId }], { keepId: true });
      receipt = "done";
    } else receipt = "lost";
    await actor.update({ [`${key}.receipts.effect`]: receipt });
  }
  // 4. ACTH: the pump's activation and its receipt in ONE item update.
  if (!(await go("pump"))) return "superseded";
  if (plan.pumpItemId && !receipts().pump) {
    const pump = actor.items.get(plan.pumpItemId);
    if (pump && pump.flags?.sr2e?.acthExposure !== exposureId) {
      await pump.update({ "system.active": true, "flags.sr2e.acthExposure": exposureId });
    }
    await actor.update({ [`${key}.receipts.pump`]: true });
  }
  // 5. The card (cardFor makes it idempotent); a lost effect gets the GM's Re-apply.
  if (!(await go("card"))) return "superseded";
  if (!receipts().card) {
    const lost = receipts().effect === "lost";
    if (!cardFor(actor.uuid, exposureId, 0)) await postCard(actor, { ...plan.card, lost });
    await actor.update({ [`${key}.receipts.card`]: true });
  }
  // Done: the item no longer needs the commit (the ledger keeps the effect plan).
  await item.update({ [`flags.sr2e.doseCommits.-=${exposureId}`]: null });
  return true;
}

/**
 * Finish every interrupted dose this client drives: world actors and unlinked
 * tokens on every scene (checked through their delta), deduplicated by uuid.
 */
export function resumeAllDoses() {
  const open = (items) => (items ?? []).some(i => Object.keys(i.flags?.sr2e?.doseCommits ?? {}).length);
  const seen = new Set(), runs = [];
  const consider = (a) => {
    if (!a || seen.has(a.uuid)) return;
    seen.add(a.uuid);
    if (!a.isOwner || doseDriverOf(a)?.id !== game.user.id || !open(a.items)) return;
    runs.push(queue(a, () => resumeDoses(a)));
  };
  for (const a of game.actors) consider(a);
  for (const scene of game.scenes) for (const t of scene.tokens) {
    if (!t.actorLink && open(t.delta?.items)) consider(t.actor);
  }
  return Promise.all(runs);
}

// ── Substance time, reports and Karma (stage 3; docs/PLAN-addiction.md) ────

/** Every actor with a ledger: world actors and unlinked tokens on every scene, by uuid. */
export function ledgerActors() {
  const out = new Map();
  for (const a of game.actors) if (a.flags?.sr2e?.substanceLog) out.set(a.uuid, a);
  for (const scene of game.scenes) for (const t of scene.tokens) {
    if (t.actorLink) continue;
    const has = t.delta?.flags?.sr2e?.substanceLog || game.actors.get(t.actorId)?.flags?.sr2e?.substanceLog;
    if (has && t.actor) out.set(t.actor.uuid, t.actor);
  }
  return [...out.values()];
}

/** Option A (DECIDED): Karma on a substance roll closes once substance time has passed it. */
export function substanceKarmaClosed(actor, eventId) {
  const ev = actor?.flags?.sr2e?.substanceLog?.[eventId];
  return !!ev && (Number(actor.flags.sr2e.substanceClock) || 0) > (Number(ev.t) || 0);
}

/** A Karma change on a substance roll's card flows into its ledger event (the card's owner writes). */
export async function reconcileSubstanceTest(actor, eventId, testState, gen = null) {
  const ev = actor?.flags?.sr2e?.substanceLog?.[eventId];
  if (!ev || ev.pending || !actor.isOwner) return;
  if ((ev.gen ?? null) !== (gen ?? null)) return;             // a stale attempt's card
  if (substanceKarmaClosed(actor, eventId)) return;
  const total = testTotalSuccesses(testState ?? {});
  if (total !== ev.successes) await actor.update({ [`flags.sr2e.substanceLog.${eventId}.successes`]: total });
}

/** Timed and dose-driven steps a report announces (actions have their own cards). */
const REPORTED = new Set(["rise", "withdrawal", "withdrawalDrop", "week", "recoveryDrop", "rest", "restore",
  "cured", "clean", "implantsFailed", "relapse", "wasting", "edit"]);

/** Essence as the rules see it: derived for a character with autoEssence;
 *  otherwise the GM keeps the number, and the drug loss is theirs to apply. */
export function actualEssence(actor) {
  return actor?.system?.essence?.value ?? 6;
}
const essenceManaged = (actor) => {
  if (actor?.type !== "character") return false;
  try { return !!game.settings.get("sr2e", "autoEssence"); } catch (e) { return true; }
};

function stepText(s, name) {
  const n = esc(name);
  switch (s.type) {
    case "rise": return `${n}: Addiction ${s.addiction}, Tolerance ${s.tolerance} (another Strength-many doses).`;
    case "withdrawal": return s.dep === "immune" ? `${n}: immune but still dependent — <strong>forced withdrawal</strong>.`
      : `${n}: the next dose didn't come in time — <strong>forced withdrawal</strong> (+3 TNs, +6 on spellcasting; at least a Moderate Stun wound).`;
    case "withdrawalDrop": return `${n}: 24 hours without a dose — Addiction ${s.addiction}.`;
    case "week": return `${n}: a week addicted — ½ Essence and one box off both monitors (so far: ${s.essenceLost} Essence, ${s.boxesLost} box${s.boxesLost === 1 ? "" : "es"}).`;
    case "recoveryDrop": return `${n}: recovery — Addiction ${s.addiction}.`;
    case "rest": return `${n}: back to base — no longer addicted. Rest for ${s.weeks} week${s.weeks === 1 ? "" : "s"} (+1 TN, +2 on spellcasting).`;
    case "restore": return `${n}: rest — a Physical and a Stun box back (${s.boxesLost} still lost).`;
    case "cured": return `${n}: rest complete — <strong>cured</strong>.`;
    case "clean": return `${n}: clean period — Addiction ${s.addiction}, Tolerance ${s.tolerance}.`;
    case "implantsFailed": return `Kamikaze: after ${s.uses} uses, cyberware and bioware <strong>stop working</strong> (p.99).`;
    case "relapse": return `${n}: a dose during recovery — addicted again, Addiction ${s.addiction}.`;
    case "wasting": return `Kamikaze: ${s.uses} uses — one more box off both monitors for good (p.99).`;
    case "edit": return `${n}: GM correction recorded${s.lossTotal !== s.lossBefore || s.essenceTotal !== s.essenceBefore
      ? ` (substance losses now ${s.lossTotal} box${s.lossTotal === 1 ? "" : "es"}, ${s.essenceTotal} Essence)` : ""}.`;
    default: return `${n}: ${esc(s.type)}.`;
  }
}

/**
 * The active GM's report for one actor (R3 #6, R4 #7): every step not yet
 * reported, plus a correction for any reported step that no longer applies.
 * Monitor/Essence death is the GM's call (R5 #6): a week's loss adds a
 * Confirm-death check; Essence at 0 is stated outright.
 */
export async function reportSubstances(actor) {
  if (!game.users.activeGM?.isSelf) return;
  const fold = substancesOf(actor);
  // History: id → {text, corrected}. Unpruned; a corrected step that returns
  // is announced again as applying (Codex 3–6 #6).
  const raw = actor.flags?.sr2e?.substanceReported ?? {};
  const reported = Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, typeof v === "string" ? { text: v, corrected: false } : v]));
  const current = new Map();
  for (const s of fold.steps) if (REPORTED.has(s.type) && s.drug !== null) current.set(stepId(s), s);
  const fresh = [...current].filter(([id]) => !reported[id] || reported[id].corrected);
  const gone = Object.keys(reported).filter(id => !reported[id].corrected && !current.has(id));
  if (!fresh.length && !gone.length) return;
  const nameOf = (d) => fold.drugs[d]?.name ?? d;
  const text = (s) => stepText(s, nameOf(s.drug));
  const lines = fresh.map(([id, s]) => reported[id]?.corrected ? `${text(s)} <em>(applies again)</em>` : text(s));
  for (const id of gone) lines.push(`<em>Correction: no longer applies — ${esc(reported[id].text)}</em>`);
  // Death review (R5 #6; Codex 3–6 #4–#5): the LOWEST capacity any fresh step
  // reached, not today's, and Essence as the rules see it.
  const snaps = fresh.map(([, s]) => s).filter(s => Number.isFinite(s.lossTotal));
  const worst = snaps.length ? Math.max(...snaps.map(s => s.lossTotal)) : null;
  const worstEss = snaps.length ? Math.max(...snaps.map(s => s.essenceTotal)) : null;
  const grew = (s, k, before) => Number.isFinite(s[before]) ? s[k] > s[before] : true;
  const shrank = fresh.some(([, s]) => s.type === "week" || s.type === "wasting"
    || (s.type === "edit" && (grew(s, "lossTotal", "lossBefore") || grew(s, "essenceTotal", "essenceBefore"))));
  const essence = actualEssence(actor);
  const managed = essenceManaged(actor);
  // Historical Essence low (Codex 3–6 #4): today's Essence less any loss since undone.
  const essenceLow = managed && worstEss != null ? essence - Math.max(0, worstEss - fold.essenceLost) : essence;
  const essenceWeeks = fresh.filter(([, s]) => s.type === "week").length;
  const cm = actor.system.conditionMonitor ?? {};
  let check = "";
  if (!fold.dead && essence <= 0) check = `<br><strong>Essence has reached 0: the character dies (p.87).</strong>`;
  else if (!fold.dead && (shrank || (!managed && essenceWeeks))) {
    check = `<br><em>GM: ${shrank && worst != null ? `monitors fell to ${Math.max(0, 10 - worst)} boxes at their lowest (damage now ${cm.physical?.value ?? 0} Physical, ${cm.stun?.value ?? 0} Stun). If this character carried more damage than that at any point, they died.` : ""}${
      managed && shrank && essenceLow <= 0 ? ` Essence fell to ${essenceLow} at its lowest: that is death.` : ""}${
      !managed && essenceWeeks ? ` Take ${essenceWeeks / 2} Essence off this character's stat block; at 0 they die.` : ""} (p.87)</em>`;
  }
  const buttons = check ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-substance-death-btn">Confirm death (GM)</button>
    <button type="button" class="sr2e-resist-btn sr2e-substance-dismiss-btn">They survived (GM)</button></div>` : "";
  const whisper = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
  const maxSeq = Math.max(0, ...ledgerOf(actor).map(e => e.seq ?? 0));
  try {
    await ChatMessage.create({ whisper, speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-damage-result sr2e-substance-report">💊 <strong>${esc(actor.name)}</strong><br>${lines.join("<br>")}${check}${buttons}</div>`,
      flags: { sr2e: { substanceReport: { actorUuid: actor.uuid, reviewedSeq: maxSeq, open: !!check,
        reason: essence <= 0 || essenceLow <= 0 ? "Essence 0" : "monitor capacity" } } } });
  } catch (err) { console.error("SR2E | substance report failed", err); return; }   // not recorded: retried next time
  const upd = {};
  for (const [id, s] of fresh) upd[`flags.sr2e.substanceReported.${id}`] = { text: text(s).replace(/<[^>]+>/g, ""), corrected: false };
  for (const id of gone) upd[`flags.sr2e.substanceReported.${id}.corrected`] = true;
  await actor.update(upd);
}

/** The active GM moves substance time forward (never back), then reports (R4 #1, R5 #4). */
export async function advanceSubstanceClock(worldTime = game.time.worldTime, { only = null } = {}) {
  if (!game.users.activeGM?.isSelf) return;
  for (const a of only ?? ledgerActors()) {
    await queue(a, async () => {
      // Everything already rolled or committed counts before time moves; if a
      // dose can't be finished, this actor's substance time waits.
      if (!(await settleSubstances(a))) return;
      if (worldTime > (Number(a.flags?.sr2e?.substanceClock) || 0)) await a.update({ "flags.sr2e.substanceClock": worldTime });
      await reportSubstances(a);
    });
  }
}

// ── The Substances section and its actions (stage 4) ───────────────────────

const STATE_LABEL = { none: "", addicted: "addicted", withdrawal: "forced withdrawal", recovery: "recovering", rest: "resting" };
const span = (sec) => {
  const h = sec / 3600;
  if (h < 1) return `${Math.max(1, Math.round(sec / 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  if (h < 24 * 21) return `${Math.round(h / 24)} days`;
  return `${Math.round(h / 168)} weeks`;
};
const NEXT_LABEL = { missed: "dose due", withdrawalDrop: "Addiction −1", week: "next weekly loss", recoveryDrop: "Addiction −1",
  restore: "a box back", cured: "cured", clean: "clean-period drop" };

/** Rows for the sheet's Substances section. */
export function substanceRows(actor) {
  const fold = substancesOf(actor);
  const now = substanceNow(actor);
  const busy = Object.values(fold.drugs).some(r => r.state === "recovery" || r.state === "rest");
  const rows = Object.values(fold.drugs).filter(r => r.base).map(r => {
    const deps = ["P", "M"].filter(d => r.addicted[d]);
    const w = r.window;
    const extendable = r.state === "addicted" && w ? deps.filter(d => !w[d]?.extended) : [];
    return {
      drug: r.drug, name: r.name, uses: r.uses, addiction: r.addiction, tolerance: r.tolerance,
      baseAddiction: r.base.addiction, baseTolerance: r.base.tolerance,
      deps: deps.map(d => d === "P" ? "Physical" : "Mental").join(" + "), immune: r.immune,
      state: STATE_LABEL[r.state] ?? r.state, stateKey: r.state,
      next: r.next ? `${NEXT_LABEL[r.next.kind] ?? r.next.kind} in ${span(Math.max(0, r.next.t - now))}` : "",
      nextT: r.next?.t ?? null, boxesLost: r.boxesLost, essenceLost: r.essenceLost,
      extendable, canRecover: (r.state === "addicted" || r.state === "withdrawal") && !busy,
      canCleanse: r.addicted.P || (r.state === "rest" && r.relapseTypes.P)
    };
  });
  return { rows, implantsFailed: fold.implantsFailed, wasting: fold.wasting, monitorLoss: fold.monitorLoss,
           essenceLost: fold.essenceLost, penalty: fold.penalty, dead: fold.dead,
           // Shown at once, whatever was reported (Codex 3–6 #5).
           essenceZero: !fold.dead && actualEssence(actor) <= 0 && fold.essenceLost > 0,
           essenceManual: !essenceManaged(actor) && fold.essenceLost > 0,
           waiting: !game.users.activeGM };
}

/** The card rolled for THIS claim: same actor, event id and generation. */
const cardOfClaim = (actor, id, gen) => game.messages.find(m => {
  const t = m.flags?.sr2e?.substanceTest;
  return t?.eventId === id && t.actorUuid === actor.uuid && (t.gen ?? null) === (gen ?? null);
});

/**
 * Write a claimed roll's result. If a GM's settle withdrew the claim as
 * abandoned meanwhile, the result is RE-STAMPED at the current substance time:
 * it counts from now, never retroactively into time already processed.
 */
async function completeClaim(actor, id, claim, successes, messageId) {
  const current = actor.flags?.sr2e?.substanceLog?.[id];
  // A different generation under this id is a newer attempt: the stale
  // roller never overwrites it (Codex 3–6 R4).
  if (current && current.gen !== claim.gen) return null;
  if (current) {
    return actor.update({ [`flags.sr2e.substanceLog.${id}.successes`]: successes, [`flags.sr2e.substanceLog.${id}.messageId`]: messageId,
      [`flags.sr2e.substanceLog.${id}.pending`]: false });
  }
  return actor.update({ [`flags.sr2e.substanceLog.${id}`]: { ...claim, ...stampFor(actor), successes, messageId, pending: false, late: true } });
}

/** A durably claimed roll (Codex stage-2 #8): claim, reuse a card already rolled for it, else roll carrying the claim. */
async function claimedRoll(actor, id, base, roll) {
  let claim = actor.flags?.sr2e?.substanceLog?.[id];
  if (claim && !claim.pending) return null;                   // already settled
  if (!claim) {
    claim = { ...stampFor(actor), ...base, gen: foundry.utils.randomID(), pending: true, successes: null, messageId: null };
    await actor.update({ [`flags.sr2e.substanceLog.${id}`]: claim });
  }
  const prior = cardOfClaim(actor, id, claim.gen);
  let successes, messageId;
  if (prior) { successes = testTotalSuccesses(prior.flags.sr2e.test ?? {}); messageId = prior.id; }
  else {
    const t = await actor.rollSuccessTest(roll.dice, claim.tn ?? roll.tn, { ...roll.options,
      flags: { sr2e: { substanceTest: { actorUuid: actor.uuid, eventId: id, gen: claim.gen ?? null } } } });
    if (!t) return null;
    successes = t.successes ?? 0; messageId = t.testMessageId ?? null;
  }
  await completeClaim(actor, id, claim, successes, messageId);
  return successes;
}

/** Extend the dose window once (p.87): Body (P) / Willpower (M) vs the current Addiction. */
export function extendDose(actor, drug, dep) {
  if (!actor?.isOwner) return;
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    const r = substancesOf(actor).drugs[drug];
    if (r?.state !== "addicted" || !r.window || r.window[dep]?.extended || !r.addicted[dep]) return ui.notifications.warn("No dose window to extend.");
    const attr = dep === "P" ? "body" : "willpower";
    const id = `${r.window.id}_${dep}_extend`;
    const ok = await claimedRoll(actor, id, { type: "extend", drug, windowId: r.window.id, dep, tn: Math.max(2, r.addiction) }, {
      dice: actor.system[attr]?.value ?? 1, tn: Math.max(2, r.addiction), options: {
        label: RL("HoldOut", { name: r.name, attr: AL(attr), addiction: r.addiction }),
        ...(attr === "body" ? actor._bodyTestOpts?.() : {}) } });
    if (ok == null) return;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">💊 ${esc(actor.name)} — ${esc(r.name)}: ${
      ok > 0 ? `holds out another ${dep === "P" ? r.window.body : r.window.willpower} hours` : "can't hold out: the next dose is still due on time"} (p.87).</div>` });
  });
}

/** GM: begin recovery (p.87): Willpower vs Addiction +1 (mental), +3 (physical), +4 (both). */
export function beginRecovery(actor, drug) {
  if (!game.user.isGM) return ui.notifications.warn("Recovery starts when the GM feels it's warranted (p.87).");
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    const fold = substancesOf(actor), r = fold.drugs[drug];
    if (!(r?.state === "addicted" || r?.state === "withdrawal")) return ui.notifications.warn("Not addicted.");
    if (Object.values(fold.drugs).some(o => o.drug !== drug && (o.state === "recovery" || o.state === "rest"))) {
      return ui.notifications.warn("One substance at a time (p.87): another recovery is still running.");
    }
    const plus = r.addicted.P && r.addicted.M ? 4 : r.addicted.P ? 3 : 1;
    const tn = r.addiction + plus;
    // An outstanding claim for this drug is reused, never re-rolled (Codex 3–6 #3).
    const open = Object.entries(actor.flags?.sr2e?.substanceLog ?? {}).find(([, e]) => e?.type === "recovery" && e.drug === drug && e.pending);
    const ok = await claimedRoll(actor, open?.[0] ?? `recovery_${foundry.utils.randomID()}`, { type: "recovery", drug, tn }, {
      dice: actor.system.willpower?.value ?? 1, tn, options: { label: RL("KickHabit", { name: r.name, addiction: r.addiction, plus }) } });
    if (ok == null) return;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">💊 ${esc(actor.name)} — ${esc(r.name)}: ${
      ok > 0 ? "<strong>begins recovery</strong> (+2 TNs, +4 on spellcasting; Addiction −1 every three days)" : "not ready to quit"} (p.87–88).</div>` });
  });
}

/** GM: cleansing therapy (physical addiction and lost boxes) or gene cleansing (immunity). */
export function cleanseSubstance(actor, drug, kind) {
  if (!game.user.isGM) return;
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    await actor.update({ [`flags.sr2e.substanceLog.${foundry.utils.randomID()}`]: { ...stampFor(actor), type: "therapy", drug, kind } });
  });
}

/**
 * GM: import a character's substance history from before tracking (R2 #11, R3 #7):
 * the drug's printed ratings come from one of their drug items; the GM supplies
 * uses, losses, the last dose and whether they're addicted now.
 */
export async function importSubstance(actor) {
  if (!game.user.isGM) return;
  const items = actor.items.filter(i => drugOf(i));
  if (!items.length) return ui.notifications.warn("Give the character the drug item first — its ratings are the base.");
  const opts = items.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${actor.name} — import substance history` }, rejectClose: false,
    content: `<div class="form-group"><label>Drug</label><select name="item">${opts}</select></div>
      <div class="form-group"><label>Doses taken so far</label><input type="number" name="uses" value="0" min="0"></div>
      <div class="form-group"><label>Current Addiction / Tolerance (blank: from the doses)</label>
        <input type="number" name="addiction" min="0" placeholder="Addiction"><input type="number" name="tolerance" min="0" placeholder="Tolerance"></div>
      <div class="form-group"><label>Boxes already lost to it</label><input type="number" name="boxesLost" value="0" min="0"></div>
      <div class="form-group"><label>Essence already lost to it</label><input type="number" name="essenceLost" value="0" min="0" step="0.5"></div>
      <div class="form-group"><label>Hours since the last dose</label><input type="number" name="hoursAgo" value="0" min="0"></div>
      <div class="form-group"><label>Addicted now</label><label><input type="checkbox" name="P"> Physically</label><label><input type="checkbox" name="M"> Mentally</label></div>`,
    ok: { label: "Import", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }
  });
  if (!data) return;
  const item = actor.items.get(data.item), drug = drugOf(item);
  if (!drug) return;
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    if (substancesOf(actor).drugs[drug.key]?.base) return ui.notifications.warn(`${item.name} is already tracked — use the correction instead.`);
    const stamp = stampFor(actor);
    const snap = snapshotOf(item, drug);
    // Blank means "work it out": a blank number field arrives as null/"", not 0.
    const whole = (v) => v === null || v === undefined || v === "" ? undefined
      : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : undefined;
    const baseline = { name: snap.name, addiction: snap.addiction, tolerance: snap.tolerance, strength: snap.strength, P: snap.P, M: snap.M,
      uses: whole(data.uses) ?? 0, boxesLost: whole(data.boxesLost) ?? 0,
      essenceLost: Math.max(0, Math.round(2 * (Number(data.essenceLost) || 0)) / 2),
      lastDose: stamp.t - Math.max(0, Number(data.hoursAgo) || 0) * 3600,
      addicted: { P: !!data.P, M: !!data.M }, body: naturalOf(actor, "body"), willpower: naturalOf(actor, "willpower") };
    if (drug.key === "kamikaze") baseline.kamikazeUses = baseline.uses;
    const patch = { baseline };
    // Current ratings: as given, else the printed ones raised once per Strength-many doses.
    const rises = snap.strength > 0 ? Math.floor(baseline.uses / snap.strength) : 0;
    patch.addiction = whole(data.addiction) ?? snap.addiction + rises;
    patch.tolerance = whole(data.tolerance) ?? snap.tolerance + rises;
    await actor.update({ [`flags.sr2e.substanceLog.${foundry.utils.randomID()}`]: { ...stamp, type: "edit", drug: drug.key, patch } });
  });
}

/** GM: correct a substance by hand (the ledger's edit event, R2 #11). */
export async function editSubstance(actor, drug) {
  if (!game.user.isGM) return;
  const r = substancesOf(actor).drugs[drug];
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${r?.name ?? drug} — GM correction` }, rejectClose: false,
    content: `<p class="hint">Recorded in the character's substance history; nothing is deleted.</p>
      <div class="form-group"><label>Addiction (current)</label><input type="number" name="addiction" value="${r?.addiction ?? 0}" min="0"></div>
      <div class="form-group"><label>Tolerance (current)</label><input type="number" name="tolerance" value="${r?.tolerance ?? 0}" min="0"></div>
      <div class="form-group"><label>Clear addiction</label><select name="clearAddiction"><option value="">—</option><option value="P">Physical</option><option value="M">Mental</option><option value="all">Both</option></select></div>
      <div class="form-group"><label>Clear immunity</label><input type="checkbox" name="clearImmune"></div>
      <div class="form-group"><label>Implants work again</label><input type="checkbox" name="restoreImplants"></div>
      <div class="form-group"><label>Not dead after all</label><input type="checkbox" name="clearDeath"></div>`,
    ok: { label: "Record", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }
  });
  if (!data) return;
  const patch = {};
  if (Number(data.addiction) !== r?.addiction) patch.addiction = Number(data.addiction);
  if (Number(data.tolerance) !== r?.tolerance) patch.tolerance = Number(data.tolerance);
  if (data.clearAddiction) patch.clearAddiction = data.clearAddiction === "all" ? true : data.clearAddiction;
  for (const k of ["clearImmune", "restoreImplants", "clearDeath"]) if (data[k]) patch[k] = true;
  if (!Object.keys(patch).length) return;
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    await actor.update({ [`flags.sr2e.substanceLog.${foundry.utils.randomID()}`]: { ...stampFor(actor), type: "edit", drug, patch } });
  });
}

/** GM: confirm or dismiss a report's death check (R5 #6), queued and settled; the
 *  death event is keyed by the report, so a retry can't record it twice. */
function resolveDeathCheck(message, dead) {
  const st0 = message.flags?.sr2e?.substanceReport;
  const actor = asActor(sync(st0?.actorUuid));
  if (!game.user.isGM || !actor) return;
  return queue(actor, async () => {
    const live = game.messages.get(message.id) ?? message;
    const st = live.flags?.sr2e?.substanceReport;
    if (!st?.open) return;
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    const id = `death_${message.id}`;
    if (dead && !actor.flags?.sr2e?.substanceLog?.[id]) {
      await actor.update({ [`flags.sr2e.substanceLog.${id}`]: { ...stampFor(actor), type: "death", reason: st.reason, reviewedSeq: st.reviewedSeq } });
    }
    const content = live.content.replace(/<div class="sr2e-karma-actions">[\s\S]*?<\/div>/, "")
      .replace(/<\/div>$/, `<br><strong>${dead ? "GM: the character died." : "GM: the character survived."}</strong></div>`);
    await live.update({ content, "flags.sr2e.substanceReport.open": false });
  });
}

/** Tests only: complete a claim as a late roller would. */
export const _completeClaimForTests = (...args) => completeClaim(...args);

/** Tests only: forget this session's commits, as if the page had reloaded. */
export function _newDoseSessionForTests() { COMMITTED_THIS_SESSION.clear(); ENDED_HERE.clear(); }

/** GM: re-apply a dose's effect that a crash lost (R5 #5), from the ledger. */
export function reapplyEffect(message) {
  const st = message.flags?.sr2e?.drugCard;
  const actor = asActor(sync(st?.actorUuid));
  if (!actor || !game.user.isGM) return;
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    const key = `flags.sr2e.substanceLog.${st.exposureId}`;
    const ev = actor.flags?.sr2e?.substanceLog?.[st.exposureId];
    if (!ev?.effectPlan || ev.receipts?.effect !== "lost" || ev.receipts?.ended || ENDED_HERE.has(st.exposureId)) {
      return ui.notifications.info("Nothing to re-apply.");
    }
    if (!actor.effects.get(st.exposureId)) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{ ...ev.effectPlan, _id: st.exposureId }], { keepId: true });
    }
    await actor.update({ [`${key}.receipts.effect`]: "done" });
    await updateCard(message, { ...st, lost: false });
  });
}

/**
 * Settle the ledger before time moves or another substance action (Codex 3–6 #1–#2):
 * finish interrupted doses; a claimed roll whose card exists gets its result, one
 * whose roll never happened is withdrawn (a retry claims afresh at the new time);
 * every roll's Karma is carried from its card. False when a dose can't finish.
 */
export async function settleSubstances(actor) {
  if (!(await resumeDoses(actor))) return false;
  const open = new Set(openCommits(actor).map(c => c.exposureId));
  await pruneMarkers(actor, (m) => [...open].some(id => m.key?.startsWith(`dose.${id}.`)));
  const log = actor.flags?.sr2e?.substanceLog ?? {};
  const upd = {};
  let live = false;
  for (const [id, ev] of Object.entries(log)) {
    if (!["test", "extend", "recovery"].includes(ev?.type)) continue;
    // Only this claim's own card (its generation), never a stale attempt's.
    const byId = ev.messageId && game.messages.get(ev.messageId);
    const card = (byId && (byId.flags?.sr2e?.substanceTest?.gen ?? null) === (ev.gen ?? null) ? byId : null)
      || cardOfClaim(actor, id, ev.gen);
    if (ev.pending) {
      if (!card) {
        // No card: abandoned if it's been a minute (a roll takes seconds);
        // otherwise it may still be rolling on another client — hold time.
        if (Date.now() - (Number(ev.at) || 0) > CLAIM_ABANDONED_MS) upd[`flags.sr2e.substanceLog.-=${id}`] = null;
        else live = true;
        continue;
      }
      upd[`flags.sr2e.substanceLog.${id}.successes`] = testTotalSuccesses(card.flags.sr2e.test ?? {});
      upd[`flags.sr2e.substanceLog.${id}.messageId`] = card.id;
      upd[`flags.sr2e.substanceLog.${id}.pending`] = false;
    } else if (card && !substanceKarmaClosed(actor, id)) {
      const total = testTotalSuccesses(card.flags.sr2e.test ?? {});
      if (total !== ev.successes) upd[`flags.sr2e.substanceLog.${id}.successes`] = total;
    }
  }
  if (Object.keys(upd).length) await actor.update(upd);
  return !live;
}
const CLAIM_ABANDONED_MS = 60 * 1000;

/** Complete every unfinished commit of this actor (the drain, R5 #2). */
export async function resumeDoses(actor) {
  let ok = true;
  for (const { item, exposureId } of openCommits(actor)) {
    try {
      // Run it only as the holder of its newest claim: one this client already holds,
      // or g0 of a commit no one has claimed (written before markers existed).
      const st = doseHoldState(markersOf(actor), exposureId, game.time.serverTime);
      let gen = HELD.get(exposureId) === st.gen ? st.gen : null;
      if (gen === null && st.gen === -1 && await once(actor, doseKey(exposureId, 0))) HELD.set(exposureId, gen = 0);
      if (gen === null) { ok = false; continue; }                // another client is finishing it
      if ((await completeDose(actor, actor.items.get(item.id) ?? item, exposureId, gen)) !== true) ok = false;
    } catch (err) { ok = false; console.error(`SR2E | finishing dose ${exposureId} failed`, err); }
  }
  return ok;
}

/** This actor's open dose commits: [{item, exposureId, plan}]. */
function openCommits(actor) {
  return [...(actor?.items ?? [])].flatMap(item => Object.entries(item.flags?.sr2e?.doseCommits ?? {})
    .filter(([, plan]) => plan?.actorUuid === actor.uuid).map(([exposureId, plan]) => ({ item, exposureId, plan })));
}

/** Claim generations this client holds, by exposure id. */
const HELD = new Map();
let stepHook = null;
let stuckMs = STUCK_MS;
/** Tests only: await `fn(exposureId, gen, step)` before each dose step; shorten STUCK_MS. */
export function _setDoseStepHookForTests(fn) { stepHook = fn; }
export function _setStuckMsForTests(ms) { stuckMs = ms ?? STUCK_MS; }
/** Tests only: run a dose's steps as the holder of `gen`, outside the actor queue. */
export function _completeDoseForTests(actor, item, exposureId, gen) { HELD.set(exposureId, gen); return completeDose(actor, item, exposureId, gen); }
export function _resumeDosesForTests(actor) { return resumeDoses(actor); }
/** Tests only: forget the claims this client holds, as another device would see them. */
export function _forgetHeldForTests() { HELD.clear(); }

/** The sheets' "Unfinished doses": every open commit and who holds it. */
export function unfinishedDoses(actor) {
  const markers = markersOf(actor), now = game.time.serverTime;
  return openCommits(actor).map(({ item, exposureId, plan }) => {
    const st = doseHoldState(markers, exposureId, now, stuckMs);
    const user = game.users.get(st.holder);
    return { exposureId, name: plan.card?.name ?? item.name, holder: user?.name ?? "an unknown device",
      holderOnline: !!user?.active, minutes: Math.floor(st.ageMs / 60000),
      overridable: game.user.isGM && (st.gen === -1 || st.overridable), msUntil: st.msUntil };
  });
}

/**
 * GM: force-finish a dose whose holder stopped (docs/PLAN-same-user-writers.md §3). Not
 * a fence: if the holder's device still runs, a step can land twice, and the dialog says so.
 */
export async function forceFinishDose(actor, exposureId) {
  if (!game.user.isGM || !actor) return;
  const row = unfinishedDoses(actor).find(d => d.exposureId === exposureId);
  if (!row?.overridable) return ui.notifications.info("Nothing to force-finish yet.");
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: `Force finish ${row.name}` }, rejectClose: false,
    content: `<p><strong>${esc(row.holder)}</strong> started finishing this dose ${row.minutes} min ago
      (${row.holderOnline ? "still online" : "offline now"}).</p>
      <p>Close EVERY Foundry tab and device of ${esc(row.holder)} first. Being offline is not enough: a sleeping tab
      can reconnect and carry on.</p>
      <p>Writes that device already sent may still land, and this client may not have seen them yet. Forcing can
      double the overuse wound or the card: check the condition monitor and chat afterwards.</p>` });
  if (!ok) return;
  return queue(actor, async () => {
    const commit = openCommits(actor).find(c => c.exposureId === exposureId);
    if (!commit) return ui.notifications.info("That dose is already finished.");
    const st = doseHoldState(markersOf(actor), exposureId, game.time.serverTime, stuckMs);
    if (st.gen !== -1 && !st.overridable) return ui.notifications.info("Another device just took it over.");
    const gen = st.gen + 1;
    if (!(await once(actor, doseKey(exposureId, gen)))) return ui.notifications.info("Another device just took it over.");
    HELD.set(exposureId, gen);
    try {
      const r = await completeDose(actor, commit.item, exposureId, gen);
      if (r === true) ui.notifications.info(`${row.name} finished.`);
    } catch (err) {
      console.error(`SR2E | force-finishing dose ${exposureId} failed`, err);
      ui.notifications.error(`Finishing ${row.name} failed (${esc(err?.message ?? err)}); it stays listed.`);
    }
  });
}

/**
 * Use one dose (owner). Decide everything, then ONE atomic item update spends
 * the dose and stores the whole plan; then every consequence runs from that
 * plan and can be resumed (docs/PLAN-addiction.md R4 #3, R5).
 */
export function useDose(actor, itemId) {
  return queue(actor, async () => {
    if (!actor?.isOwner || !["character", "npc"].includes(actor.type)) return ui.notifications.warn("Only the owner can use that.");
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console); nothing was spent.");
    const item = actor.items.get(itemId);
    const drug = drugOf(item);
    if (!drug) return;
    if ((item.system.quantity ?? 0) < 1) return ui.notifications.warn(`No ${item.name} left.`);
    const exposureId = foundry.utils.randomID();

    // 1. The duration.
    let dur = null;
    if (typeof drug.duration?.minutes === "string") {
      const r = await new Roll(drug.duration.minutes).evaluate();
      dur = drugDuration(drug.duration, { rolled: r.total });
    } else if (drug.duration?.bodyReducesBy) {
      // A Body SUCCESS Test (not resistance): the book gives no TN; SR II's default 4.
      const t = await actor.rollSuccessTest(actor.system.body?.value ?? 1, 4, {
        label: RL("DrugDuration", { name: item.name }), ...actor._bodyTestOpts?.() });
      dur = drugDuration(drug.duration, { successes: t?.successes ?? 0 });
    } else dur = drugDuration(drug.duration);

    // 2. The decision, made once.
    const inForce = drugsInForce(actor);
    const overuse = inForce.some(e => e.key === drug.key);
    const halve = overuse && !!drug.stimulant;
    const immune = !!substancesOf(actor).drugs[drug.key]?.immune;
    const blocked = !!drug.noRepeat && overuse;          // MAO: nothing until flushed (p.100)
    const zero = !!dur && ((dur.minutes ?? dur.turns) === 0);
    const inert = immune || blocked;
    const changes = zero || inert ? [] : item.effects.contents.flatMap(e => effectChanges(e))
      .filter(c => changeIsAdd(c) && Number.isFinite(Number(c.value)))
      .map(c => halve ? { ...c, value: String(halveBonus(Number(c.value))) } : c);
    const absorb = zero || inert ? 0 : halve ? halveBonus(Number(drug.absorb) || 0) : (Number(drug.absorb) || 0);
    const why = immune ? "Immune: the dose has no effect (p.87). " : blocked ? "Already active: no further effect until it's flushed out. " : "";
    const card = {
      actorUuid: actor.uuid, actorName: actor.name, name: item.name, exposureId, seq: 0,
      duration: zero || inert ? "" : durationText(dur), overuse: overuse && !inert, stimulant: !!drug.stimulant,
      notes: why + (zero ? "Shrugged off: no lasting effect. " : "") + (drug.notes ?? ""),
      damage: drug.damage ?? null, repeatMinutes: drug.repeatMinutes ?? 0, repeatUsed: false,
      tests: !!(drug.addiction?.rating || drug.tolerance), addiction: drug.addiction ?? null, tolerance: drug.tolerance ?? 0,
      resolved: ""
    };
    // The effect is a tracking entry even with no changes (the card can be
    // re-posted from it, and the tests key off its end); none when inert.
    const effect = inert ? null : makeDrugEffectData({
      name: item.name, img: item.img, origin: item.uuid, changes: changes.map(c => ({ ...c })), disabled: false, transfer: false,
      timing: zero ? { zero: true, startTime: game.time.worldTime } : effectDuration(dur, actor),
      flags: { sr2e: { drugEffect: { key: drug.key, exposureId, card, overload: !!drug.overload, tn: drug.tn ?? null, absorb,
        limitsPump: !!drug.limitsPump } } }
    });
    const implantsWork = !substancesOf(actor).implantsFailed;
    const pump = drug.activatesPump && !inert && implantsWork
      ? actor.items.find(i => i.type === "bioware" && i.system.installed && i.flags?.sr2e?.adrenalPump && !i.system.active) : null;
    if (drug.activatesPump && !inert && !pump) card.notes = "No inactive adrenal pump installed to trigger. " + card.notes;
    const event = { ...stampFor(actor), type: "dose", drug: drug.key, snapshot: snapshotOf(item, drug),
      body: naturalOf(actor, "body"), willpower: naturalOf(actor, "willpower"), receipts: {} };
    const plan = { actorUuid: actor.uuid, event, overuse: halve && !inert, absorb, effect, pumpItemId: pump?.id ?? null, card };

    // 3. THE commit, as the holder of its claim (taken first, so no other client can
    //    start finishing it): the spend and the plan in one item update.
    if (!(await once(actor, doseKey(exposureId, 0)))) return ui.notifications.error("Couldn't start the dose; nothing was spent.");
    HELD.set(exposureId, 0);
    // The dose is refundable stock: the spend lands in the owner's money queue against
    // the live quantity, so a sale or edit can't interleave (docs/PLAN-money-queue-…, A2).
    const spent = await moneyQueue(actor, async () => {
      const live = actor.items.get(itemId);
      if (!live || (live.system.quantity ?? 0) < 1) return false;
      return updated(live.update({ "system.quantity": live.system.quantity - 1,
                                   [`flags.sr2e.doseCommits.${exposureId}`]: plan }), "dose spend");
    }, "dose");
    if (!spent) { HELD.delete(exposureId); return ui.notifications.warn(`No ${item.name} could be taken — nothing was spent.`); }
    COMMITTED_THIS_SESSION.add(exposureId);

    // 4. Everything else, resumable.
    try { await completeDose(actor, actor.items.get(itemId) ?? item, exposureId, 0); }
    catch (err) {
      console.error("SR2E | finishing the dose failed", err);
      ui.notifications.warn(`${item.name} was taken; finishing its effects failed and will be retried (${esc(err?.message ?? err)}).`);
    }
    return actor.effects.get(exposureId) ?? null;
  });
}

/** Re-post an exposure's card if it isn't in chat (idempotent). */
export function repostCard(actor, effectId) {
  if (!actor?.isOwner) return ui.notifications.warn("Only the owner or the GM can re-post that card.");
  return queue(actor, async () => {
    const eff = actor.effects.get(effectId);
    const snap = eff?.flags?.sr2e?.drugEffect?.card;
    if (!snap) return;
    // Bound to THIS actor: an unlinked token copied from a dosed actor carries
    // the base's snapshot.
    const card = { ...snap, actorUuid: actor.uuid, actorName: actor.name, seq: 0 };
    if (cardFor(actor.uuid, card.exposureId, 0)) return ui.notifications.info(`${card.name}'s card is already in chat.`);
    return postCard(actor, card);
  });
}

export function endDrug(actor, effectId) {
  if (!actor?.isOwner) return;
  return queue(actor, async () => {
  if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
  const eff = actor.effects.get(effectId);
  const id = eff?.flags?.sr2e?.drugEffect?.exposureId;
  // The tombstone lands BEFORE the delete, so a resume never recreates it (R5 #5).
  if (id && actor.flags?.sr2e?.substanceLog?.[id]) {
    await actor.update({ [`flags.sr2e.substanceLog.${id}.receipts.ended`]: true,
      ...(actor.flags.sr2e.substanceLog[id].receipts?.effect ? {} : { [`flags.sr2e.substanceLog.${id}.receipts.effect`]: "ended" }) });
  }
  await eff?.delete();
  if (id && actor.getFlag("sr2e", "drugAbsorb")?.[id] != null) await actor.update({ [`flags.sr2e.drugAbsorb.-=${id}`]: null });
  });
}

// ── Toxin damage ───────────────────────────────────────────────────────────

/** Resist a toxin card with Body (no pool, no armour): damage and the done-flag in ONE update. */
export function resistToxin(message) {
  const st = message.flags?.sr2e?.drugCard;
  const actor = asActor(sync(st?.actorUuid));
  if (!st?.damage || !actor) return;
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can resist for them.`);
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    const key = `${st.exposureId}_${st.seq ?? 0}`;
    if (actor.getFlag("sr2e", "toxinDone")?.[key]) return ui.notifications.warn("That damage has already been resisted.");
    const { power, level, type } = st.damage;
    const t = await actor.rollSuccessTest(actor.system.body?.value ?? 1, power, {
      label: RL("ResistToxin", { name: st.name, power, level, stun: type === "stun" ? RL("StunTag") : "" }),
      isResistance: true, ...actor._bodyTestOpts?.() });
    if (!t) return;
    const final = toxinLevel(level, t.successes ?? 0);
    const flag = { [`flags.sr2e.toxinDone.${key}`]: true };
    const out = await commitDamage(actor, type === "stun" ? "stun" : "physical", final ? BOXES[final] : 0, { extra: flag, report: false });
    const note = drugDamageNote(out);
    const resolved = (final ? `${final} ${type === "stun" ? "Stun" : "Physical"} (${BOXES[final]} box${BOXES[final] === 1 ? "" : "es"}).` : "Fully resisted.")
      + (note ? ` ${note}.` : "");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { sr2e: { resolves: message.id } },
      content: `<div class="sr2e-damage-result">💊 ${esc(actor.name)} — ${esc(st.name)}: ${resolved}</div>` });
    await updateCard(message, { ...st, resolved });
  });
}

/** Atropine: the next 15 minutes' damage — one successor card per step, whatever the clicks. */
export function nextToxin(message) {
  const st = message.flags?.sr2e?.drugCard;
  const actor = asActor(sync(st?.actorUuid));
  if (!st?.repeatMinutes || !actor) return;
  if (!game.user.isGM) return ui.notifications.warn("The GM decides when the next 15 minutes have passed.");
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console).");
    const live = game.messages.get(message.id)?.flags?.sr2e?.drugCard ?? st;
    const next = (live.seq ?? 0) + 1;
    if (live.repeatUsed || cardFor(live.actorUuid, live.exposureId, next)) return;
    await postCard(actor, { ...live, seq: next, resolved: "", repeatUsed: false, overuse: false, duration: "", tests: false });
    await updateCard(message, { ...live, repeatUsed: true });
  });
}

// ── Addiction and tolerance (p.87) ─────────────────────────────────────────

/**
 * The Addiction / Tolerance tests after a dose wears off (p.87), recorded in the
 * ledger: one event per exposure and kind (P, M, tolerance), never re-rolled
 * (R2 #3). Available once the exposure is no longer in force (R2 #7) and only
 * for a dose the ledger holds (a pre-ledger card is informational, R3 #7).
 * TNs are the character's CURRENT ratings for that drug; the GM may edit them.
 */
export async function drugTests(message) {
  const st = message.flags?.sr2e?.drugCard;
  const actor = asActor(sync(st?.actorUuid));
  if (!actor) return;
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM rolls these.`);
  const label = { P: RL("AddictionPhysical"), M: RL("AddictionMental"), tolerance: RL("Tolerance") };
  // Eligibility and the current TNs, re-derived each time they're needed.
  const check = () => {
    const log = actor.flags?.sr2e?.substanceLog ?? {};
    const dose = log[st.exposureId];
    if (!dose) return { error: "No record of this dose (it predates substance tracking) — the GM can import it from the sheet." };
    if (drugsInForce(actor).some(e => e.exposureId === st.exposureId)) return { error: `${st.name} is still in effect — the tests come after it wears off (End it on the sheet).` };
    const rec = substancesOf(actor).drugs[dose.drug];
    const kinds = [dose.snapshot?.P && "P", dose.snapshot?.M && "M", dose.snapshot?.tolerance && "tolerance"].filter(Boolean)
      .filter(k => !(log[`${st.exposureId}_${k}`] && !log[`${st.exposureId}_${k}`].pending));
    const tnOf = (k) => Math.max(2, Number(k === "tolerance" ? rec?.tolerance ?? dose.snapshot.tolerance : rec?.addiction ?? dose.snapshot.addiction) || 2);
    return { dose, kinds, tnOf, log };
  };
  const first = check();
  if (first.error) return ui.notifications.warn(first.error);
  if (!first.kinds.length) return ui.notifications.info("Those tests have already been rolled.");
  const ro = game.user.isGM ? "" : "readonly";
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${st.name} — after it wears off (Shadowtech p.87)` }, rejectClose: false,
    content: first.kinds.map(k => `<div class="form-group"><label>${label[k]} — TN</label>
      <input type="number" name="${k}" value="${first.tnOf(k)}" min="2" ${ro}></div>`).join(""),
    ok: { label: "Roll", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }
  });
  if (!data) return;                                            // cancel writes nothing
  return queue(actor, async () => {
    if (!(await settleSubstances(actor))) return ui.notifications.error("Something earlier (a dose or a roll) is still being finished — try again in a moment (if a device was closed mid-dose, the GM can force-finish it under Unfinished doses on the sheet; otherwise see the console); nothing was rolled.");
    const now = check();                                        // revalidated inside the queue
    if (now.error) return ui.notifications.warn(now.error);
    const lines = [];
    for (const k of now.kinds) {
      const id = `${st.exposureId}_${k}`;
      const attr = k === "M" ? "willpower" : "body";
      // A GM's entry is an explicit override; otherwise the CURRENT rating.
      const tn = game.user.isGM && Number(data[k]) !== first.tnOf(k) ? Math.max(2, Number(data[k]) || 2) : now.tnOf(k);
      // Durable claim first, with the original stamp (Codex stage-2 #8)…
      let claim = actor.flags?.sr2e?.substanceLog?.[id];
      if (!claim) {
        claim = { ...stampFor(actor), type: "test", drug: now.dose.drug, exposureId: st.exposureId, kind: k, tn,
          gen: foundry.utils.randomID(), pending: true, successes: null, messageId: null };
        await actor.update({ [`flags.sr2e.substanceLog.${id}`]: claim });
      }
      // …then reuse a card this claim already rolled, or roll one carrying the claim.
      const prior = cardOfClaim(actor, id, claim.gen);
      let successes, messageId;
      if (prior) { successes = testTotalSuccesses(prior.flags.sr2e.test ?? {}); messageId = prior.id; }
      else {
        const t = await actor.rollSuccessTest(actor.system[attr]?.value ?? 1, claim.tn ?? tn, {
          label: RL("SubstanceTest", { name: st.name, kind: label[k], tn: claim.tn ?? tn }), isResistance: true,
          flags: { sr2e: { substanceTest: { actorUuid: actor.uuid, eventId: id, gen: claim.gen ?? null } } },
          ...(attr === "body" ? actor._bodyTestOpts?.() : {}) });
        if (!t) continue;
        successes = t.successes ?? 0; messageId = t.testMessageId ?? null;
      }
      await completeClaim(actor, id, claim, successes, messageId);
      const ok = successes > 0;
      lines.push(k === "tolerance" ? (ok ? "no immunity yet" : "<strong>now immune to it</strong>")
        : ok ? `not ${k === "P" ? "physically" : "mentally"} addicted` : `<strong>${k === "P" ? "physically" : "mentally"} addicted</strong>`);
    }
    if (lines.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-damage-result">💊 ${esc(actor.name)} — ${esc(st.name)}: ${lines.join("; ")} (Shadowtech p.87).</div>` });
  });
}

// ── Wiring ─────────────────────────────────────────────────────────────────

export function wireDrugButtons(message, html) {
  // "Next 15 minutes" is the GM's call.
  if (!game.user.isGM) html.querySelectorAll?.(".sr2e-toxin-next-btn, .sr2e-drug-reapply-btn, .sr2e-substance-death-btn, .sr2e-substance-dismiss-btn").forEach(b => b.remove());
  const on = (sel, fn) => html.querySelectorAll?.(sel).forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); fn(message); }));
  on(".sr2e-toxin-resist-btn", resistToxin);
  on(".sr2e-toxin-next-btn", nextToxin);
  on(".sr2e-drug-tests-btn", drugTests);
  on(".sr2e-drug-reapply-btn", reapplyEffect);
  on(".sr2e-substance-death-btn", (m) => resolveDeathCheck(m, true));
  on(".sr2e-substance-dismiss-btn", (m) => resolveDeathCheck(m, false));
}

/** Keep open sheets' remaining times current (read-only). */
export function registerDrugHooks() {
  const refresh = () => {
    for (const app of foundry.applications.instances.values()) {
      const doc = app.document;
      if (doc?.documentName === "Actor" && app.rendered && doc.effects?.some(e => e.flags?.sr2e?.drugEffect)) app.render();
    }
  };
  Hooks.on("updateWorldTime", refresh);
  // The REAL world time, not the hook's argument: anything firing the hook by
  // hand (tests, macros) can't push every ledger's clock to an invented time.
  Hooks.on("updateWorldTime", () => advanceSubstanceClock(game.time.worldTime));
  Hooks.on("updateCombat", refresh);

  // Any other way a drug effect is deleted still leaves its tombstone, so a
  // resume never recreates it (R5 #5).
  Hooks.on("preDeleteActiveEffect", (eff) => {
    const id = eff.flags?.sr2e?.drugEffect?.exposureId;
    if (id) ENDED_HERE.add(id);                                 // synchronous: no resume window
  });
  Hooks.on("deleteActiveEffect", (eff, options, userId) => {
    if (userId !== game.user.id) return;
    const id = eff.flags?.sr2e?.drugEffect?.exposureId, actor = eff.parent;
    const ev = actor?.flags?.sr2e?.substanceLog?.[id];
    // The tombstone is its own receipt: it holds even over "lost"/"done".
    if (ev && !ev.receipts?.ended) actor.update({ [`flags.sr2e.substanceLog.${id}.receipts.ended`]: true,
      ...(ev.receipts?.effect ? {} : { [`flags.sr2e.substanceLog.${id}.receipts.effect`]: "ended" }) });
  });
  // A copied or transferred drug item never carries another actor's commits (R5 #1).
  Hooks.on("preCreateItem", (item, data) => {
    if (data.flags?.sr2e?.doseCommits) item.updateSource({ "flags.sr2e.-=doseCommits": null });
  });
  // …and can't be deleted while one of its doses is unfinished.
  Hooks.on("preDeleteItem", (item) => {
    const actor = item.parent;
    const open = Object.values(item.flags?.sr2e?.doseCommits ?? {}).some(p => p.actorUuid === actor?.uuid);
    if (!open) return;
    ui.notifications.warn(`${item.name} has a dose still being applied — finishing it first; try again in a moment.`);
    if (actor?.isOwner) queue(actor, () => resumeDoses(actor));
    return false;
  });
  // On load, finish any dose a crash interrupted: the owner's client, else the active GM's.
  // Only the actor's elected driver does it; unlinked tokens on every scene
  // are checked through their delta, deduplicated by uuid.
  Hooks.once("ready", () => resumeAllDoses());
}
