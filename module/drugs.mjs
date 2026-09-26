/**
 * Drugs and toxins (Shadowtech p.85–100) — the lean core, see docs/PLAN-drugs.md.
 *
 * Automated: spending a dose, the drug's attribute Active Effects (with a
 * displayed duration, ended by hand), toxin damage resisted with Body, and the
 * addiction / tolerance tests. The rest is on the card for the GM.
 *
 * A drug is a gear item with `flags.sr2e.drug` (content modules supply it) and
 * Active Effects holding its numeric ADD changes. One person drives an actor:
 * every mutation runs in a per-actor local queue and re-reads state there.
 */
import { enqueueAttack } from "./engagement.mjs";
import { drugDuration, toxinLevel, drugDamage, damageUpdateFor, halveBonus } from "./rules/sr2e-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const BOXES = { L: 1, M: 3, S: 6, D: 10 };
const queue = (actor, fn) => enqueueAttack(`dose:${actor.uuid}`, fn);
const asActor = (d) => d?.documentName === "Token" ? d.actor : d;
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };

export const drugOf = (item) => item?.type === "gear" ? (item.flags?.sr2e?.drug ?? null) : null;

/** Active drug effects on an actor, with their remaining time, for the sheets. */
export function activeDrugs(actor) {
  return (actor?.effects ?? []).filter(e => e.flags?.sr2e?.drugEffect).map(e => {
    const d = e.duration ?? {};
    const timed = d.type && d.type !== "none";
    const expired = timed && Number.isFinite(d.remaining) && d.remaining <= 0;
    const left = d.type === "seconds" ? `${Math.ceil(d.remaining / 60)} min left`
      : d.type === "turns" ? `${Math.ceil(d.remaining)} Combat Turn${Math.ceil(d.remaining) === 1 ? "" : "s"} left` : (d.label || "");
    return { id: e.id, name: e.name, img: e.img, key: e.flags.sr2e.drugEffect.key,
             exposureId: e.flags.sr2e.drugEffect.exposureId, expired,
             label: !timed ? "until ended" : expired ? "expired" : left };
  });
}

/**
 * Drug effects IN FORCE: not disabled (they last until ended by hand, like the
 * attributes — expiry only labels the row), and not a zero-duration tracking
 * entry (shrugged off, or a toxin with no lasting effect). Oldest first.
 */
export function drugsInForce(actor) {
  return (actor?.effects ?? [])
    .filter(e => e.flags?.sr2e?.drugEffect && !e.disabled && e._source?.duration?.seconds !== 0)
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
export function commitDamage(actor, type, amount, { extra = {}, report = true } = {}) {
  return enqueueAttack(`damage:${actor.uuid}`, async () => {
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

function effectDuration(d, actor) {
  if (!d) return {};
  if (d.minutes != null) return { seconds: d.minutes * 60, startTime: game.time.worldTime };
  // The started combat THIS actor is fighting in (a token's own actor counts).
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
  if (combat) return { rounds: d.turns, combat: combat.id, startRound: combat.round, startTurn: combat.turn ?? 0 };
  return { seconds: d.turns * 3, startTime: game.time.worldTime };     // a Combat Turn is 3 seconds
}

const durationText = (d) => !d ? "" : d.minutes != null ? `${d.minutes} minute${d.minutes === 1 ? "" : "s"}`
  : `${d.turns} Combat Turn${d.turns === 1 ? "" : "s"}`;

/**
 * Use one dose (owner): roll the duration FIRST, then create the effect, then
 * spend the dose, then post the card — so a failure never spends a dose that
 * wasn't delivered, and a lost card can be re-posted from the sheet.
 */
export function useDose(actor, itemId) {
  return queue(actor, async () => {
    if (!actor?.isOwner || !["character", "npc"].includes(actor.type)) return ui.notifications.warn("Only the owner can use that.");
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
        label: `${item.name} — Body Success Test (duration, TN 4)`, ...actor._bodyTestOpts?.() });
      dur = drugDuration(drug.duration, { successes: t?.successes ?? 0 });
    } else dur = drugDuration(drug.duration);

    const overuse = drugsInForce(actor).some(e => e.key === drug.key);
    const halve = overuse && !!drug.stimulant;
    // Shrugged off entirely (a zero duration): only the damage applies.
    const zero = !!dur && ((dur.minutes ?? dur.turns) === 0);
    const changes = zero ? [] : item.effects.contents.flatMap(e => e.changes)
      .filter(c => c.mode === CONST.ACTIVE_EFFECT_MODES.ADD && Number.isFinite(Number(c.value)))
      .map(c => halve ? { ...c, value: String(halveBonus(Number(c.value))) } : c);
    const absorb = zero ? 0 : halve ? halveBonus(Number(drug.absorb) || 0) : (Number(drug.absorb) || 0);
    const card = {
      actorUuid: actor.uuid, actorName: actor.name, name: item.name, exposureId, seq: 0,
      duration: zero ? "" : durationText(dur), overuse, stimulant: !!drug.stimulant, notes: (zero ? "Shrugged off: no lasting effect. " : "") + (drug.notes ?? ""),
      damage: drug.damage ?? null, repeatMinutes: drug.repeatMinutes ?? 0, repeatUsed: false,
      tests: !!(drug.addiction?.rating || drug.tolerance), addiction: drug.addiction ?? null, tolerance: drug.tolerance ?? 0,
      resolved: ""
    };

    // 2. Stimulant overuse (p.85): the Light Stun wound lands BEFORE the new
    // effect, as ordinary damage — the first dose's absorption can still soak it.
    if (halve) await commitDamage(actor, "stun", 1);
    // The new dose's absorption counter exists before its effect; it counts only
    // once that effect is in force, so a failed create leaves it inert.
    if (absorb > 0) await actor.update({ [`flags.sr2e.drugAbsorb.${exposureId}`]: absorb });

    // 3. The effect (a tracking entry even with no changes, so the card can be re-posted).
    const [eff] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img, origin: item.uuid, changes, disabled: false, transfer: false,
      duration: zero ? { seconds: 0, startTime: game.time.worldTime } : effectDuration(dur, actor),
      flags: { sr2e: { drugEffect: { key: drug.key, exposureId, card,
        overload: !!drug.overload, tn: drug.tn ?? null, absorb } } }
    }]);

    // 4. The dose.
    try { await item.update({ "system.quantity": Math.max(0, (item.system.quantity ?? 1) - 1) }); }
    catch (err) {
      console.error("SR2E | spending the dose failed", err);
      ui.notifications.warn(`${item.name} took effect, but the dose couldn't be taken off (${esc(err?.message ?? err)}).`);
    }

    // 5. The card.
    try { await postCard(actor, card); }
    catch (err) {
      console.error("SR2E | drug card failed", err);
      ui.notifications.warn(`${item.name}'s card couldn't be posted — use Re-post card on the sheet's active drugs.`);
    }
    return eff;
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

export async function endDrug(actor, effectId) {
  if (!actor?.isOwner) return;
  const eff = actor.effects.get(effectId);
  const id = eff?.flags?.sr2e?.drugEffect?.exposureId;
  await eff?.delete();
  if (id && actor.getFlag("sr2e", "drugAbsorb")?.[id] != null) await actor.update({ [`flags.sr2e.drugAbsorb.-=${id}`]: null });
}

// ── Toxin damage ───────────────────────────────────────────────────────────

/** Resist a toxin card with Body (no pool, no armour): damage and the done-flag in ONE update. */
export function resistToxin(message) {
  const st = message.flags?.sr2e?.drugCard;
  const actor = asActor(sync(st?.actorUuid));
  if (!st?.damage || !actor) return;
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can resist for them.`);
  return queue(actor, async () => {
    const key = `${st.exposureId}_${st.seq ?? 0}`;
    if (actor.getFlag("sr2e", "toxinDone")?.[key]) return ui.notifications.warn("That damage has already been resisted.");
    const { power, level, type } = st.damage;
    const t = await actor.rollSuccessTest(actor.system.body?.value ?? 1, power, {
      label: `Resist ${st.name}: ${power}${level}${type === "stun" ? " Stun" : ""} (Body, no armour)`,
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
    const live = game.messages.get(message.id)?.flags?.sr2e?.drugCard ?? st;
    const next = (live.seq ?? 0) + 1;
    if (live.repeatUsed || cardFor(live.actorUuid, live.exposureId, next)) return;
    await postCard(actor, { ...live, seq: next, resolved: "", repeatUsed: false, overuse: false, duration: "", tests: false });
    await updateCard(message, { ...live, repeatUsed: true });
  });
}

// ── Addiction and tolerance (p.87) ─────────────────────────────────────────

export async function drugTests(message) {
  const st = message.flags?.sr2e?.drugCard;
  const actor = asActor(sync(st?.actorUuid));
  if (!actor) return;
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM rolls these.`);
  const a = st.addiction ?? {};
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${st.name} — after it wears off (Shadowtech p.87)` }, rejectClose: false,
    content: `<p>Raise the ratings for doses taken (every Strength-th dose adds +1, which the GM tracks).</p>
      ${a.rating ? `<div class="form-group"><label>Addiction Rating (${a.P ? "Physical: Body" : ""}${a.P && a.M ? ", " : ""}${a.M ? "Mental: Willpower" : ""})</label>
        <input type="number" name="addiction" value="${Number(a.rating) || 0}" min="0"></div>` : ""}
      ${st.tolerance ? `<div class="form-group"><label>Tolerance Rating (Body)</label>
        <input type="number" name="tolerance" value="${Number(st.tolerance) || 0}" min="0"></div>` : ""}`,
    ok: { label: "Roll", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }
  });
  if (!data) return;
  return queue(actor, async () => {
    const lines = [];
    const test = async (attr, tn, label) => {
      const t = await actor.rollSuccessTest(actor.system[attr]?.value ?? 1, Math.max(2, Number(tn) || 2), {
        label: `${st.name} — ${label} (${attr === "body" ? "Body" : "Willpower"} vs ${tn})`, isResistance: true,
        ...(attr === "body" ? actor._bodyTestOpts?.() : {}) });
      return t?.successes ?? 0;
    };
    if (a.rating && Number(data.addiction) > 0) {
      if (a.P) lines.push((await test("body", data.addiction, "physical addiction")) ? "not physically addicted" : "<strong>physically addicted</strong>");
      if (a.M) lines.push((await test("willpower", data.addiction, "mental addiction")) ? "not mentally addicted" : "<strong>mentally addicted</strong>");
    }
    if (st.tolerance && Number(data.tolerance) > 0) {
      lines.push((await test("body", data.tolerance, "tolerance")) ? "no immunity yet" : "<strong>now immune to it</strong>");
    }
    if (lines.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-damage-result">💊 ${esc(actor.name)} — ${esc(st.name)}: ${lines.join("; ")} (Shadowtech p.87).</div>` });
  });
}

// ── Wiring ─────────────────────────────────────────────────────────────────

export function wireDrugButtons(message, html) {
  // "Next 15 minutes" is the GM's call.
  if (!game.user.isGM) html.querySelectorAll?.(".sr2e-toxin-next-btn").forEach(b => b.remove());
  const on = (sel, fn) => html.querySelectorAll?.(sel).forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); fn(message); }));
  on(".sr2e-toxin-resist-btn", resistToxin);
  on(".sr2e-toxin-next-btn", nextToxin);
  on(".sr2e-drug-tests-btn", drugTests);
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
  Hooks.on("updateCombat", refresh);
}
