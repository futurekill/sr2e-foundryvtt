/**
 * Move-by-wire complications (docs/PLAN-cybertechnology-phase4.md §8; Cybertechnology
 * pp.54–55). Every fact is an immutable event record (`recordEvent`, a deterministic-id
 * durable marker the server creates exactly once), folded by `foldMbw`. GM actions record
 * ONE event each, after checking admission against the current state; cards are only
 * notifications rendered from records, and the sheet is the durable control panel.
 */
import { recordEvent, eventsOf, once, markersOf } from "./claims.mjs";
import { claimId, STUCK_MS } from "./rules/claim-rules.mjs";
import { foldMbw, proposal, ccssRow, CCSS_ROWS, ccssRehab, seizureBoxes, tleTreatTN } from "./rules/mbw-rules.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { commitDamage } from "./drugs.mjs";
import { characterTN } from "./rules/cym-rules.mjs";
import { RL } from "./util/roll-label.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const mbwOn = () => { try { return game.settings.get("sr2e", "mbwComplications"); } catch (e) { return true; } };
export const mbwFold = (actor) => foldMbw(eventsOf(actor).filter(e => String(e.key).startsWith("mbw:")), game.time.worldTime);
const roll = async (dice, tn) => {
  const r = await SR2ESuccessRoll.successTest(Math.max(0, dice), tn);
  return { successes: r.successes, results: r.results };
};
const d6 = async (n = 1) => (await new Roll(`${n}d6`).evaluate()).total;

/** GM-only, characters only; resolves a token actor by its full UUID (cards carry it). */
async function actorFor(uuidOrActor) {
  const a = typeof uuidOrActor === "string" ? await fromUuid(uuidOrActor) : uuidOrActor;
  if (!a || a.type !== "character") { ui.notifications.warn("Move-by-wire: that character is gone."); return null; }
  if (!game.user.isGM) { ui.notifications.warn("Move-by-wire complications are the GM's to resolve."); return null; }
  return a;
}
const btn = (actor, op, label, arg = "", title = "") =>
  `<button type="button" class="sr2e-resist-btn sr2e-mbw-btn" data-actor="${esc(actor.uuid)}" data-op="${op}" data-arg="${esc(arg)}" title="${esc(title)}">${esc(label)}</button>`;
async function card(actor, html, { whisper = true } = {}) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-damage-result sr2e-mbw-card">${html}</div>`,
    ...(whisper ? { whisper: ChatMessage.getWhisperRecipients("GM") } : {}) });
}
/** Record one event; false (with a notice) when another click already recorded it. */
async function record(actor, key, payload, lost = "Already recorded (another click got there first).") {
  const ok = await recordEvent(actor, key, payload);
  if (!ok) ui.notifications.info(lost);
  return ok;
}

// ── The complication test ──────────────────────────────────────────────────────

/** Roll a complication test: the next due scheduled slot, or a manual (stress) test. */
export async function rollComplication(uuid, { manual = false } = {}) {
  const actor = await actorFor(uuid); if (!actor) return;
  const m = actor.system.mbw ?? {};
  if (!m.level) return ui.notifications.warn(`${actor.name} has no move-by-wire.`);
  const f = mbwFold(actor);
  let key, payload;
  if (manual) {
    key = `mbw:test:manual:${foundry.utils.randomID()}`;
    payload = { type: "test", manual: true };
  } else {
    // Admission: an open generation and a slot that is due NOW (a rewind refuses it).
    const n = f.nextSlot;
    if (!f.gen || !n) return ui.notifications.info(`${actor.name}: no complication test is due.`);
    const attempt = f.nextAttempt(n);
    key = `mbw:test:${f.gen.key}:${n}:${attempt}`;
    payload = { type: "test", gen: f.gen.key, n, attempt };
  }
  // Rolled side-effect-free, recorded in the SAME create; a losing roll is never shown.
  const { successes, results } = await roll(m.dice, characterTN(actor, m.tn));   // CDS +3 (Cybertechnology p.83)
  const ok = await record(actor, key, { ...payload, itemId: m.itemId, level: m.level, dice: m.dice, tn: m.tn, successes, results },
    "That test was already rolled.");
  if (!ok) return;
  return postTestCard(actor, { key, successes, dice: m.dice, tn: m.tn, manual });
}

function postTestCard(actor, t) {
  const p = proposal(t.successes);
  const say = p === "none" ? "No complication." : p === "tle" ? "Proposed: <strong>TLE-x</strong>." : "Proposed: <strong>CCSS</strong> (or CCSS and TLE-x, at your discretion).";
  return card(actor, `<strong>${esc(actor.name)}: move-by-wire complication test${t.manual ? " (stress)" : ""}</strong>
    <br>${t.dice} dice vs TN ${t.tn}: <strong>${t.successes}</strong> success${t.successes === 1 ? "" : "es"} (Cybertechnology p.55). ${say}
    <div class="sr2e-karma-actions">${btn(actor, "outcome", "Apply TLE-x", `${t.key}|tle`)}${btn(actor, "outcome", "Apply CCSS", `${t.key}|ccss`)}${btn(actor, "outcome", "Apply both", `${t.key}|both`)}${btn(actor, "outcome", "Nothing happens", `${t.key}|none`)}</div>
    <em>The first choice wins; the sheet lists unresolved tests too.</em>`);
}

/** Record the GM's choice for a test (one per test). */
export async function applyOutcome(uuid, testKey, result) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = mbwFold(actor);
  const test = f.tests.find(t => t.key === testKey);
  if (!test) return ui.notifications.warn("That test isn't on record (voided?).");
  if (!await record(actor, `mbw:outcome:${testKey}`, { type: "outcome", test: testKey, result, itemId: test.itemId },
    "A result was already chosen for that test.")) return;
  const what = { none: "no complication", tle: "TLE-x", ccss: "CCSS", both: "CCSS and TLE-x" }[result];
  return card(actor, `<strong>${esc(actor.name)}</strong>: ${what} recorded.${result === "ccss" || result === "both"
    ? " Move-by-wire is permanently dysfunctional and must be removed. Without treatment: an (unaugmented) Body (5) test every hour, or death (p.55)." : ""}`);
}

// ── TLE-x ─────────────────────────────────────────────────────────────────────────

/** The physician's treatment of the oldest untreated, treatable occurrence (TN 8, then 10). */
export async function treatTle(uuid, success) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = mbwFold(actor);
  const occ = f.nextTreat;
  if (!occ || f.chronic) return ui.notifications.info(`${actor.name}: no treatable TLE-x${f.chronic ? " (it's chronic)" : ""}.`);
  const tn = tleTreatTN(occ.number);
  const attempt = 1 + eventsOf(actor).filter(e => e.type === "tleTreatment" && e.occurrence === occ.key).length;
  if (!await record(actor, `mbw:tle-treat:${occ.key}:${attempt}`, { type: "tleTreatment", occurrence: occ.key, tn, success: !!success })) return;
  return card(actor, `<strong>${esc(actor.name)}</strong>: TLE-x treatment (Biotech/Transimplant Surgery ${tn}) ${success ? "succeeded" : "failed"}.`);
}

/** Switch a TLE-x episode on (rolls Reaction −1D6) or off. */
export async function toggleEpisode(uuid, on) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = mbwFold(actor);
  if (on && !f.active && !f.chronic) return ui.notifications.info(`${actor.name} has no active TLE-x.`);
  const untreated = f.occurrences.filter(o => !eventsOf(actor).some(e => e.type === "tleTreatment" && e.success && e.occurrence === o.key));
  const reactionLoss = on ? await d6() : 0;
  if (!await record(actor, `mbw:episode:${foundry.utils.randomID()}`, { type: "episode", on: !!on, reactionLoss,
    occurrence: untreated.at(-1)?.key ?? null, chronic: f.chronic })) return;
  if (on) return card(actor, `<strong>${esc(actor.name)}</strong>: TLE-x episode: Initiative −2, Reaction −${reactionLoss}; +2 to Perception TNs; −1 Charisma and social skills in important social situations (p.55).`);
}

// ── Seizures (chronic TLE-x) ──────────────────────────────────────────────────────

/** After damage LANDED (≥ 3 boxes) on a chronic TLE-x character: record a seizure prompt. */
export async function noteDamageForSeizure(actor, out, source) {
  if (source === "seizure" || actor?.type !== "character" || !mbwOn() || (out?.landedBoxes ?? 0) < 3) return;
  if (!actor.isOwner || !actor.system.mbw?.tle?.chronic) return;
  const key = `mbw:seizure:${foundry.utils.randomID()}`;
  if (!await recordEvent(actor, key, { type: "seizure", boxes: out.landedBoxes })) return;
  return card(actor, `<strong>${esc(actor.name)}</strong> took a Moderate or worse wound with chronic TLE-x (p.55).
    If engaged in combat or conflict: <div class="sr2e-karma-actions">${btn(actor, "seizure", "Seizure check: Willpower (6)", key)}</div>`);
}

/** Resolve a seizure: everything rolled side-effect-free and recorded BEFORE any damage. */
export async function resolveSeizure(uuid, seizureKey) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = mbwFold(actor);
  if (!f.seizures.some(s => s.key === seizureKey)) return ui.notifications.warn("That seizure isn't on record.");
  const will = await roll(actor.system.willpower?.value ?? 0, characterTN(actor, 6));
  let resisted = null, stun = 0, turns = 0, minutes = 0;
  if (will.successes === 0) {
    resisted = await roll(actor.system.body?.value ?? 0, characterTN(actor, 6));   // Body only: no armor, no pools (user ruling)
    stun = seizureBoxes(resisted.successes);
    turns = 10 * await d6(); minutes = 10 * await d6();
  }
  const resultKey = `mbw:seizure-result:${seizureKey}`;
  if (!await record(actor, resultKey, { type: "seizureResult", seizure: seizureKey, willpower: will.successes,
    resisted: resisted?.successes ?? null, stun, turns, minutes }, "That seizure was already resolved.")) return;
  await card(actor, will.successes > 0
    ? `<strong>${esc(actor.name)}</strong> holds it together (Willpower ${will.successes} successes).`
    : `<strong>${esc(actor.name)}</strong> collapses in a seizure: 6M Stun, ${resisted.successes} Body successes → ${stun} box${stun === 1 ? "" : "es"}.
       Unconscious after ${turns} Combat Turns, out for ${minutes} minutes (p.55). <em>Voiding this record doesn't heal.</em>`, { whisper: false });
  if (stun > 0) await applySeizureDamage(actor, resultKey, stun);
}

/** Seizure damage, admitted once across clients, receipted in the monitor update itself. */
export async function applySeizureDamage(actor, resultKey, stun, { anyway = false } = {}) {
  const applied = () => !!foundry.utils.getProperty(actor, `flags.sr2e.mbwApplied.${claimId(resultKey)}`);
  if (applied()) return;
  if (!anyway && !await once(actor, `${resultKey}:apply`)) return;
  await commitDamage(actor, "stun", stun, { extra: { [`flags.sr2e.mbwApplied.${claimId(resultKey)}`]: true }, skipIf: applied, source: "seizure" });
}

/** "Claimed, damage not applied" (a client died in between), past the stuck threshold. */
export function stuckSeizures(actor) {
  const f = mbwFold(actor), out = [];
  for (const s of f.seizures) {
    if (!s.result?.stun) continue;
    const rk = `mbw:seizure-result:${s.key}`;
    if (foundry.utils.getProperty(actor, `flags.sr2e.mbwApplied.${claimId(rk)}`)) continue;
    const claim = markersOf(actor).find(m => m.key === `${rk}:apply`);
    out.push({ key: rk, stun: s.result.stun, claimed: !!claim, stuck: !!claim && game.time.serverTime - (Number(claim.at) || 0) > STUCK_MS });
  }
  return out;
}

// ── CCSS ──────────────────────────────────────────────────────────────────────────

export async function beginCcssTreatment(uuid, incidentKey) {
  const actor = await actorFor(uuid); if (!actor) return;
  const inc = mbwFold(actor).incidents.find(i => i.key === incidentKey);
  if (!inc || inc.state !== "untreated") return ui.notifications.info("That CCSS incident isn't awaiting treatment.");
  const { weeks, cost } = ccssRehab(actor.system.mbw?.naturalBody ?? 0);
  if (!await record(actor, `mbw:ccss-treat:${incidentKey}`, { type: "ccssTreatment", incident: incidentKey, weeks, cost })) return;
  return card(actor, `<strong>${esc(actor.name)}</strong>: CCSS rehabilitation in intensive care, ${weeks} weeks at 50,000¥ a week = <strong>${cost.toLocaleString("en-US")}¥</strong> (p.55). Deduct it from nuyen by hand.`);
}

export async function recordCcssRecovery(uuid, incidentKey, physicianSuccesses) {
  const actor = await actorFor(uuid); if (!actor) return;
  const inc = mbwFold(actor).incidents.find(i => i.key === incidentKey);
  if (!inc || inc.state !== "treating") return ui.notifications.info("Treatment must begin before the recovery test.");
  const row = ccssRow(Number(physicianSuccesses) || 0);
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "CCSS recovery" },
    content: `<p>${physicianSuccesses} physician success(es) → <strong>${CCSS_ROWS[row].label}</strong>: ${Object.entries(CCSS_ROWS[row].loss).map(([k, v]) => `−${v} ${k}`).join(", ")}${CCSS_ROWS[row].intelligenceZero ? ", Intelligence 0" : ""}. Permanent (voidable from the sheet).</p>` });
  if (!ok) return;
  if (!await record(actor, `mbw:ccss-recovery:${incidentKey}`, { type: "ccssRecovery", incident: incidentKey, physicianSuccesses: Number(physicianSuccesses) || 0, row })) return;
  return card(actor, `<strong>${esc(actor.name)}</strong>: CCSS recovery, ${esc(CCSS_ROWS[row].label)} (p.55).`);
}

/** Undo any GM-made record (tests, outcomes, treatments, episodes, seizure results, recoveries). */
export async function voidRecord(uuid, key) {
  const actor = await actorFor(uuid); if (!actor) return;
  if (!mbwFold(actor).voidable.some(e => e.key === key)) return ui.notifications.warn("That record can't be voided.");
  await record(actor, `mbw:void:${key}`, { type: "void", target: key });
}

// ── Plain rolls (posted, never recorded) ───────────────────────────────────────────

export async function hourlySurvival(uuid) {
  const actor = await actorFor(uuid); if (!actor) return;
  const body = actor.system.mbw?.naturalBody ?? 0;
  return actor.rollSuccessTest(body, 5, { label: RL("CcssUntreated"), isResistance: true });
}

/** Reflex jumpiness (p.53): Perception at base + reflex dice; Willpower at base to hold off. */
export async function reflexCheck(actor, base) {
  const n = actor.system.mbw?.reflexDice ?? 0;
  await actor.rollSuccessTest(actor.system.intelligence?.value ?? 0, base + n, { label: RL("ReflexPerception", { base, n }) });
  await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, base, { label: RL("ReflexWillpower", { base }) });
}

// ── Reconciliation (active GM only; never in preparation) ──────────────────────────

const pending = new Map();
function schedule(actor) {
  if (!game.users.activeGM?.isSelf || actor?.type !== "character") return;
  clearTimeout(pending.get(actor.uuid));
  pending.set(actor.uuid, setTimeout(() => { pending.delete(actor.uuid); reconcile(actor).catch(err => console.error("SR2E | mbw reconcile", err)); }, 500));
}

/** Open/close schedule generations to match the INSTALLED, non-CCSS move-by-wire; post one due notice. */
export async function reconcile(actor) {
  if (!game.users.activeGM?.isSelf || actor?.type !== "character") return;
  const f = mbwFold(actor);
  const m = actor.system.mbw ?? {};
  const want = m.itemId && !m.disabled ? { itemId: m.itemId, level: m.level } : null;
  const open = f.gen;
  if (open && !(want && open.itemId === want.itemId && open.level === want.level)) {
    await recordEvent(actor, `mbw:remove:${open.key}`, { type: "remove", install: open.key });
  }
  if (want && !(open && open.itemId === want.itemId && open.level === want.level)) {
    const k = eventsOf(actor).filter(e => e.type === "install" && e.itemId === want.itemId).length;
    await recordEvent(actor, `mbw:install:${want.itemId}:${k}`, { type: "install", itemId: want.itemId, level: want.level, since: game.time.worldTime });
  }
  if (!mbwOn()) return;
  const now = mbwFold(actor);
  if (now.gen && now.pendingSlots.length) {
    const done = now.tests.filter(t => t.gen === now.gen.key).length;
    if (await once(actor, `mbw-notice:${now.gen.key}:${done}`)) {
      await card(actor, `<strong>${esc(actor.name)}</strong>: ${now.pendingSlots.length} move-by-wire complication test${now.pendingSlots.length === 1 ? "" : "s"} due (Cybertechnology p.55; make them while no spell boosts their attributes).
        <div class="sr2e-karma-actions">${btn(actor, "test", "Roll the next one")}</div>`);
    }
  }
}

function allCharacters() {
  const seen = new Map();
  for (const a of game.actors) if (a.type === "character") seen.set(a.uuid, a);
  for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && t.actor?.type === "character") seen.set(t.actor.uuid, t.actor);
  return [...seen.values()];
}

export function registerMbwHooks() {
  const all = () => { for (const a of allCharacters()) schedule(a); };
  Hooks.once("ready", all);
  for (const h of ["updateWorldTime", "canvasReady", "userConnected"]) Hooks.on(h, all);
  const byItem = (item) => item.parent instanceof Actor && schedule(item.parent);
  for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, byItem);
  Hooks.on("updateActor", (a) => schedule(a));
  const byEffect = (e) => e.parent instanceof Actor && String(e.flags?.sr2e?.claim?.key ?? "").startsWith("mbw:") && schedule(e.parent);
  for (const h of ["createActiveEffect", "deleteActiveEffect"]) Hooks.on(h, byEffect);
  Hooks.on("sr2e.damageCommitted", (actor, out, opts) => { noteDamageForSeizure(actor, out, opts?.source).catch(err => console.error("SR2E | seizure note", err)); });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-mbw-btn").forEach(b => b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const { actor: uuid, op, arg } = b.dataset;
      try { await mbwOp(uuid, op, arg); } catch (err) { console.error("SR2E | move-by-wire", err); ui.notifications.error(err.message); }
    }));
  });
}

/** One dispatcher for card buttons and the sheet. */
export async function mbwOp(uuid, op, arg = "") {
  if (op === "test") return rollComplication(uuid);
  if (op === "stress") return rollComplication(uuid, { manual: true });
  if (op === "outcome") { const [k, r] = arg.split("|"); return applyOutcome(uuid, k, r); }
  if (op === "treatOk") return treatTle(uuid, true);
  if (op === "treatFail") return treatTle(uuid, false);
  if (op === "episodeOn") return toggleEpisode(uuid, true);
  if (op === "episodeOff") return toggleEpisode(uuid, false);
  if (op === "seizure") return resolveSeizure(uuid, arg);
  if (op === "seizureCheck") {   // the sheet's always-present fallback (chronic only)
    const a = await actorFor(uuid); if (!a) return;
    const key = `mbw:seizure:${foundry.utils.randomID()}`;
    if (await recordEvent(a, key, { type: "seizure", boxes: 0, manual: true })) return resolveSeizure(uuid, key);
    return;
  }
  if (op === "applyAnyway") { const a = await actorFor(uuid); if (!a) return; const s = stuckSeizures(a).find(x => x.key === arg && x.stuck); if (s) return applySeizureDamage(a, s.key, s.stun, { anyway: true }); return; }
  if (op === "ccssTreat") return beginCcssTreatment(uuid, arg);
  if (op === "ccssRecovery") {
    const n = await foundry.applications.api.DialogV2.prompt({ window: { title: "CCSS recovery" },
      content: `<p>The physician's Biotech/Transimplant Surgery (10) successes (intensive care only, p.55):</p><input type="number" name="n" value="0" min="0" autofocus>`,
      ok: { callback: (event, button) => button.form.elements.n.value } });
    if (n == null) return;
    return recordCcssRecovery(uuid, arg, Number(n));
  }
  if (op === "survival") return hourlySurvival(uuid);
  if (op === "void") return voidRecord(uuid, arg);
}
