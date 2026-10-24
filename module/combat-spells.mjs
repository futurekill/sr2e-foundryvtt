/**
 * Combat spells by the book (docs/PLAN-combat-spells.md): the cast dialog's target rows,
 * the per-target cards, and the claimed resistance.
 *
 * Resistance contract (P1.5): `once(target, "spellres:"+key)` → ONE pending public message
 * (deterministic id) that already closes the casting test to Karma and claims the card →
 * the spend and its record in one actor update → the resistance test (closed) → the damage
 * with its receipt in one update → the pending message becomes the outcome. Nothing is ever
 * re-run: an interrupted resolution is finished by the GM from what landed (Mark resolved).
 */
import { once } from "./claims.mjs";
import { claimId, STUCK_MS } from "./rules/claim-rules.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { commitDamage } from "./drugs.mjs";
import { targetTokens } from "./targeting.mjs";
import { normActorUuid, grantsFor, defenceBalance, defenceSplit, defenseQueue, attackResolved } from "./spell-defense.mjs";
import { isCardResolved } from "./astral-combat.mjs";
import { elementalTransition, aidReservation, CLEAR_DEFENSE_AID } from "./elementals.mjs";
import { elementalAidsCategory, testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { cymMagicTN } from "./rules/cym-rules.mjs";
import { RL, AL } from "./util/roll-label.mjs";
import { combatSpellOutcome, combatSpellTarget, targetKindOf, spellSituationTN, VISIBILITY_CONDITIONS,
         VISION_TYPES, MOVEMENT, ramEffect, LEVEL_NAMES, isManualCombatSpell, isRamSpell, spellDamageType }
  from "./rules/spell-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const srcOf = (doc) => doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null;

/** Live success total of a test message (Karma included). */
export function liveCastSuccesses(testMessageId, fallback = 0) {
  const st = game.messages?.get(testMessageId)?.flags?.sr2e?.test;
  return st ? testTotalSuccesses(st) : fallback;
}

/** How this spell is resolved: "manual" (GM card), "ram", or "auto". */
export function combatSpellMode(spell) {
  const flags = spell?.flags?.sr2e ?? {};
  if (isManualCombatSpell({ range: spell?.system?.range, spellRule: flags.spellRule, source: srcOf(spell) })) return "manual";
  return isRamSpell({ source: srcOf(spell), spellRule: flags.spellRule }) ? "ram" : "auto";
}

/** The spell's base Damage Level (its damage code's letter) and damage type. */
export function combatSpellDamage(spell) {
  return { baseLevel: (spell?.system?.damageCode || "M").match(/[LMSD]/)?.[0] ?? "M", dmgType: spellDamageType(spell) };
}

/** The caster's vision for the Visibility Table: installed cybereyes, else the metatype's. */
export function defaultVision(actor) {
  const has = (id) => actor?.items?.some(i => i.type === "cyberware" && i.system?.installed !== false
    && srcOf(i) === `Compendium.sr2e.cyberware.Item.${id}`);
  if (has("9i6g5s9fxe4ykzk7")) return "thermoCyber";
  if (has("8wowabmno7q0ei3t")) return "lowLightCyber";
  const race = String(actor?.system?.race ?? "").toLowerCase();
  if (["dwarf", "troll"].includes(race)) return "thermoNatural";
  if (["elf", "ork"].includes(race)) return "lowLightNatural";
  return "normal";
}

/**
 * Who this spell can affect among `tokens` (TokenDocuments), from LIVE documents:
 * [{tokenUuid, uuid (actor), key, name, kind, eligible, why, tn, resistAttr, barrier}].
 * One row per actor (a linked actor targeted twice counts once).
 */
export function combatTargetRows(spell, tokens) {
  const mode = combatSpellMode(spell);
  const dmgType = spellDamageType(spell);
  const rows = [], seen = new Set();
  for (const doc of tokens) {
    const actor = doc?.actor;
    if (!actor) continue;
    const key = normActorUuid(actor.uuid);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = targetKindOf(actor.type);
    const base = { tokenUuid: doc.uuid, uuid: actor.uuid, key, name: doc.name, kind, actor };
    if (mode === "ram") {
      // Ram damages inanimate targets (p.151); its TN is the Object Resistance Table (p.130).
      if (kind === "living") rows.push({ ...base, eligible: false, why: "Ram only damages inanimate targets (SR2E p.151)" });
      else rows.push({ ...base, eligible: true, why: "", tn: 8, resistAttr: null,
        barrier: kind === "vehicle" ? (Number(actor.system.body) || 0) + (Number(actor.system.armor) || 0) : 0 });
      continue;
    }
    const t = combatSpellTarget({ spellType: spell.system.type, damageType: dmgType, target: {
      kind, willpower: actor.system?.willpower?.value, body: kind === "vehicle" ? actor.system?.body : actor.system?.body?.value,
      armor: actor.system?.armor } });
    if (t.eligible && kind === "object") {
      rows.push({ ...base, eligible: false, why: "an inanimate target: the GM uses the Object Resistance Table (SR2E p.130)" });
      continue;
    }
    rows.push({ ...base, eligible: t.eligible, why: t.why, tn: t.tn, resistAttr: t.resistAttr });
  }
  return rows;
}

/** The caster-wide part of the dialog: vision type and the caster's movement (p.89, p.83). */
export function casterSituationHTML(actor) {
  const vision = defaultVision(actor);
  const mv = { stationary: "Stationary", walking: "Walking (+1)", walkingRough: "Walking, rough terrain (+2)", running: "Running (+4)" };
  return `<div class="sr2e-attack__grid">
    <div class="sr2e-attack__field"><label title="The Visibility Table's column (SR2E p.89): low-light and thermographic values are cybernetic/natural.">Your vision</label>
      <select name="cs_vision">${VISION_TYPES.map(([k, l]) => `<option value="${k}" ${k === vision ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="sr2e-attack__field"><label title="Moving while casting (SR2E p.83): walking +1 (+2 over rough terrain or obstacles), running +4.">Your movement</label>
      <select name="cs_movement">${Object.entries(mv).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
  </div>`;
}

/** The per-target situation table (p.130): can see, cover, visibility, barrier, other. */
export function targetRowsHTML(rows, { ram = false } = {}) {
  if (!rows.length) return "";
  const vis = VISIBILITY_CONDITIONS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
  const body = rows.map((r, i) => r.eligible ? `<tr data-row="${i}">
      <td>${esc(r.name)}${r.kind === "vehicle" ? " <em>(vehicle)</em>" : ""}</td>
      <td class="sr2e-cs-tn" data-base="${r.tn}">${r.tn}</td>
      <td><input type="checkbox" name="cs_see_${i}" checked title="Combat spells need line of sight (SR2E p.130): an unseen target is not affected."></td>
      <td><input type="checkbox" name="cs_cover_${i}" title="Partial cover: +4 (SR2E p.130)"></td>
      <td><select name="cs_vis_${i}">${vis}</select></td>
      <td><input type="number" name="cs_barrier_${i}" value="0" min="0" style="width:40px" title="A mana barrier, hermetic circle or medicine lodge the spell crosses (+1 per 2 points; not for its creator, p.130)"></td>
      <td><input type="number" name="cs_other_${i}" value="0" style="width:40px" title="Any other TN modifier the GM rules"></td>
      ${ram ? `<td><input type="number" name="cs_ram_${i}" value="${r.barrier}" min="0" style="width:40px" title="Barrier Rating — a vehicle's Body + armor (SR2E p.151)"></td>` : ""}
    </tr>` : `<tr><td>${esc(r.name)}</td><td colspan="${ram ? 7 : 6}"><em>Not affected — ${esc(r.why)}.</em></td></tr>`).join("");
  return `<table class="sr2e-attack__breakdown-table sr2e-cs-targets">
    <tr><th>Target</th><th>TN</th><th title="Can see it">See</th><th>Cover</th><th>Visibility</th><th title="Magical barrier rating">Barrier</th><th>Other</th>${ram ? "<th title=\"Barrier Rating\">Rating</th>" : ""}</tr>
    ${body}</table>`;
}

/** Keep the dialog's per-row TNs current. */
export function wireTargetRows(form) {
  const upd = () => {
    const vision = form.elements.cs_vision?.value ?? "normal";
    const movement = form.elements.cs_movement?.value ?? "stationary";
    for (const tr of form.querySelectorAll(".sr2e-cs-targets tr[data-row]")) {
      const i = tr.dataset.row, cell = tr.querySelector(".sr2e-cs-tn");
      const s = spellSituationTN({ cover: form.elements[`cs_cover_${i}`]?.checked, vision, movement,
        visibility: form.elements[`cs_vis_${i}`]?.value, barrierRating: form.elements[`cs_barrier_${i}`]?.value,
        other: form.elements[`cs_other_${i}`]?.value });
      cell.textContent = form.elements[`cs_see_${i}`]?.checked ? String(Math.max(2, Number(cell.dataset.base) + s.total)) : "—";
    }
    // The cast dialog's TN readout follows the target it will hit: the first one seen.
    const first = [...form.querySelectorAll(".sr2e-cs-tn")].map(c => c.textContent).find(t => t !== "—");
    if (first && form.elements.tn) form.elements.tn.value = first;
    const readout = form.querySelector("#sr2e-cast-tn");
    if (readout) readout.textContent = first ?? "—";
  };
  form.addEventListener("input", upd);
  form.addEventListener("change", upd);
  upd();
}

/** What the dialog asked for: the caster's vision/movement and each row's situation. */
export function readTargetRows(form, rows) {
  const el = form.elements;
  return {
    vision: el.cs_vision?.value ?? "normal",
    movement: el.cs_movement?.value ?? "stationary",
    targets: rows.map((r, i) => ({ tokenUuid: r.tokenUuid, see: r.eligible ? !!el[`cs_see_${i}`]?.checked : false,
      cover: !!el[`cs_cover_${i}`]?.checked, visibility: el[`cs_vis_${i}`]?.value ?? "clear",
      barrier: Number(el[`cs_barrier_${i}`]?.value) || 0, other: Number(el[`cs_other_${i}`]?.value) || 0,
      ...(el[`cs_ram_${i}`] ? { ramRating: Number(el[`cs_ram_${i}`].value) || 0 } : {}) }))
  };
}

/** Dialog 2 of an area cast (P1.3): the caught tokens' rows, after the centre is placed. */
export async function promptAreaTargets(spell, tokens, { vision = "normal", movement = "stationary" } = {}) {
  const rows = combatTargetRows(spell, tokens);
  if (!rows.length) return { targets: [] };
  let out = null;
  Hooks.once("renderDialogV2", (_app, html) => {
    const form = ((html instanceof Element) ? html : document).querySelector(".sr2e-cs-targets")?.closest("form");
    if (form) wireTargetRows(form);
  });
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `${spell.name} — who is caught`, resizable: true },
    position: { width: 560 },
    rejectClose: false,
    content: `<div class="sr2e-attack sr2e-attack--spell"><p class="sr2e-attack__hint">One roll, scored against each target's own TN (SR2E p.130).
      Untick anyone the caster can't see.</p>${targetRowsHTML(rows)}
      <input type="hidden" name="cs_vision" value="${esc(vision)}"><input type="hidden" name="cs_movement" value="${esc(movement)}"></div>`,
    buttons: [
      { action: "go", label: "SR2E.Dialog.Cast", default: true, callback: (ev, b) => { out = readTargetRows(b.form, rows); } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "go" && out ? out : null;
}

/**
 * The cast's targets from the dialog's request, re-read from LIVE documents (P1.4): each
 * with its TN for this cast (base + its situation; the caster's movement is added by the roll).
 * Rows the caster can't see are returned as not affected.
 */
export function planCombatTargets(spell, request) {
  const req = request?.targets ?? [];
  const docs = req.map(r => { try { return fromUuidSync(r.tokenUuid); } catch (e) { return null; } }).filter(Boolean);
  const rows = combatTargetRows(spell, docs);
  return rows.map(r => {
    const q = req.find(x => x.tokenUuid === r.tokenUuid) ?? {};
    if (!r.eligible) return r;
    if (!q.see) return { ...r, eligible: false, why: "the caster can't see it — combat spells need line of sight (SR2E p.130)" };
    const s = spellSituationTN({ cover: q.cover, visibility: q.visibility, vision: request.vision, barrierRating: q.barrier, other: q.other });
    const cym = r.kind === "living" ? cymMagicTN(r.actor) : 0;
    const parts = [s.parts.cover ? "cover +4" : "", s.parts.visibility ? `visibility +${s.parts.visibility}` : "",
      s.parts.barrier ? `barrier +${s.parts.barrier}` : "", s.parts.other ? `other ${s.parts.other > 0 ? "+" : ""}${s.parts.other}` : "",
      cym ? `cybermancy +${cym}` : ""].filter(Boolean);
    return { ...r, tn: Math.max(2, r.tn + s.total + cym), situation: parts.join(", "),
             ...(q.ramRating != null ? { barrier: q.ramRating } : {}) };
  });
}

/** The caster's movement modifier (p.83) — caster-wide, so it rides on the roll. */
export const movementTN = (request) => MOVEMENT[request?.movement] ?? 0;

// ── Cards ──────────────────────────────────────────────────────────────────

const levelText = (lvl, type) => `${LEVEL_NAMES[lvl] ?? lvl} ${type === "stun" ? "Stun" : "Physical"}`;

/**
 * The combat spell card (flags.sr2e.spell), one per target (P1.4). Shaped like the ranged
 * damage card: at 0 successes it reads "Miscast" with no button (Karma can still revive it).
 */
export function renderSpellResistCard(state) {
  const n = state.successes ?? 0;
  const vehicle = state.kind === "vehicle" || state.resistAttr === "vehicle";
  const attrLabel = vehicle ? "Body + ½ armor" : state.resistAttr === "willpower" ? "Willpower" : "Body";
  const vs = state.targetName ? ` at <strong>${esc(state.targetName)}</strong>` : "";
  const tn = state.targetTN ? ` vs TN ${state.targetTN}` : "";
  const situation = state.situation ? ` <em>(${esc(state.situation)})</em>` : "";
  const head = `<strong>${esc(state.casterName)} casts ${esc(state.spellName)}</strong>${vs} — ${n} success${n === 1 ? "" : "es"}${tn}${situation}`;
  if (state.manual) {
    return `<div class="sr2e-damage-result">${head}
      <br><em>Base ${levelText(state.baseLevel, state.dmgType)}, Force ${state.force}. This spell's special rules aren't automated — the GM resolves it.</em>
      ${state.resolution ?? ""}</div>`;
  }
  const who = state.targetUuid ? (state.targetName ? `${esc(state.targetName)} resists` : "The target resists") : "Select the defending token, then resist";
  const unresolved = !state.resolved;
  const buttons = unresolved && n > 0 ? `<div class="sr2e-karma-actions">
      <button type="button" class="sr2e-resist-btn sr2e-spellresist-btn"
              title="${who} with ${attrLabel} (+ Spell Defense) vs Force ${state.force}. Armor does not help (SR2E p.131).">✨ Resist Spell</button>
      ${state.testMessageId ? `<button type="button" class="sr2e-resist-btn sr2e-grant-defense-btn"
              title="A magician protects this target with Spell Defense dice (SR2E p.132) — before it resists.">🛡 Spell Defense</button>` : ""}
      <button type="button" class="sr2e-resist-btn sr2e-spellres-stuck-btn sr2e-gm-only" title="GM: a resistance that started and never finished">⚙ Stuck?</button>
    </div>` : "";
  const body = n <= 0
    ? `<br><em>Miscast — no effect (no successes). Karma can still revive it.</em>`
    : `<br><em>Base: ${levelText(state.baseLevel, state.dmgType)} · Resist with ${attrLabel} (+ Spell Defense)${vehicle ? " (SR2E p.109)" : ", no armor (SR2E p.131)"}.
        A tie still does the base level; 2 net successes stage it up one level.${state.areaCard ? " (Area: Karma rerolls aren't allowed on this roll, p.130.)" : ""}</em>`;
  return `<div class="sr2e-damage-result">${head}${body}${state.resolution ?? ""}${buttons}</div>`;
}

/** A "can't affect it" line for an ineligible target. */
export function ineligibleLine(spell, row) {
  return `<div class="sr2e-damage-result"><strong>${esc(spell.name)}</strong> can't affect ${esc(row.name)} — ${esc(row.why)}.</div>`;
}

/** The Ram card (flags.sr2e.ram): Force + successes vs twice the Barrier Rating (p.151, p.98). */
export function renderRamCard(state) {
  const n = state.successes ?? 0;
  const vs = state.targetName ? ` at <strong>${esc(state.targetName)}</strong>` : "";
  const head = `<strong>${esc(state.casterName)} casts ${esc(state.spellName)}</strong>${vs} — ${n} success${n === 1 ? "" : "es"}`;
  const fx = ramEffect({ force: state.force, successes: n, barrierRating: state.barrierRating });
  if (fx && !(state.barrierRating > 0)) return `<div class="sr2e-damage-result">${head}
    <br>Power ${fx.power} (Force ${state.force} + ${n}): the GM compares it with twice the barrier's rating (SR2E p.98, p.151).${state.resolution ?? ""}</div>`;
  if (!fx) return `<div class="sr2e-damage-result">${head}<br><em>Miscast — no effect. Karma can still revive it.</em>${state.resolution ?? ""}</div>`;
  const tier = { none: "no effect", damaged: "damaged", breached: `breached (${fx.holes} half-metre hole${fx.holes === 1 ? "" : "s"})`, destroyed: "destroyed" }[fx.tier];
  const effect = state.vehicleUuid
    ? `${fx.lightBoxes} reduction${fx.lightBoxes === 1 ? "" : "s"} → <strong>${fx.lightBoxes} Light damage</strong> to the vehicle (its Body is unchanged)`
    : `the barrier is ${tier}${fx.ratingReduction ? `, its rating reduced by ${fx.ratingReduction}` : ""}`;
  const apply = state.vehicleUuid && !state.resolved && fx.lightBoxes > 0
    ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-ram-apply-btn" title="Apply the Light damage (the vehicle's owner or the GM)">💥 Apply</button></div>` : "";
  return `<div class="sr2e-damage-result">${head}
    <br>Power ${fx.power} (Force ${state.force} + ${n}) vs twice the Barrier Rating ${state.barrierRating} = ${fx.rating}: ${effect}.
    <br><em>Against combat spells barriers use twice their rating (SR2E p.98); a vehicle's rating is Body + armor (p.151).</em>
    ${state.resolution ?? ""}${apply}</div>`;
}

/**
 * Post the cast's per-target cards (P1.4). Every card is created from the LIVE casting test
 * (Karma spent while Drain rolled is in it), then reconciled once more.
 * @param {Item} spell @param {object} o {spellResult, force, targets (planned rows), area}
 */
export async function postCombatSpellCards(spell, { spellResult, force, targets, untargetedTN = null, ramRating = 0 }) {
  const caster = spell.parent;
  const speaker = ChatMessage.getSpeaker({ actor: caster });
  const castTestId = spellResult?.testMessageId ?? "";
  const mode = combatSpellMode(spell);
  const { baseLevel, dmgType } = combatSpellDamage(spell);
  const live = () => liveCastSuccesses(castTestId, spellResult?.successes ?? 0);
  const posted = [];
  const common = { casterUuid: caster.uuid, casterName: caster.name, spellName: spell.name, testMessageId: castTestId, force };

  if (mode === "manual") {
    const names = targets.filter(t => t.eligible).map(t => t.name);
    const state = { ...common, targetName: names.join(", "), targetUuid: "", successes: live(), baseLevel, dmgType,
                    manual: true, resolved: false, targetTN: untargetedTN };
    posted.push(await ChatMessage.create({ speaker, content: renderSpellResistCard(state), flags: { sr2e: { spell: state } } }));
    return reconcile(posted, live);
  }
  for (const t of targets.filter(x => !x.eligible)) await ChatMessage.create({ speaker, content: ineligibleLine(spell, t) });
  const eligible = targets.filter(x => x.eligible);
  if (mode === "ram") {
    for (const t of eligible.length ? eligible : targets.length ? [] : [{ name: "", barrier: ramRating, kind: "object" }]) {
      const state = { ...common, targetUuid: t.uuid ?? "", targetName: t.name, successes: live(),
        barrierRating: t.barrier ?? 0, vehicleUuid: t.kind === "vehicle" ? t.uuid : "", resolved: false };
      posted.push(await ChatMessage.create({ speaker, content: renderRamCard(state), flags: { sr2e: { ram: state } } }));
    }
    return reconcile(posted, live);
  }
  // No target at all: one card for whoever resists (legacy behaviour).
  const list = eligible.length ? eligible
    : targets.length ? [] : [{ uuid: "", key: "", name: "", kind: "", tn: untargetedTN, resistAttr: spell.system.type === "mana" ? "willpower" : "body" }];
  for (const t of list) {
    const state = { ...common, targetUuid: t.uuid, targetKey: t.key, targetName: t.name, kind: t.kind,
      resistAttr: t.resistAttr, targetTN: t.tn, situation: t.situation ?? "", successes: live(), baseLevel, dmgType, resolved: false };
    posted.push(await ChatMessage.create({ speaker, content: renderSpellResistCard(state), flags: { sr2e: { spell: state } } }));
  }
  return reconcile(posted, live);
}

/** Bounded reconciliation (the _reconcileManipCards pattern): bring new cards to the live total. */
async function reconcile(msgs, live) {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const m of msgs) {
      const msg = m && game.messages.get(m.id);
      const key = msg?.flags?.sr2e?.spell ? "spell" : msg?.flags?.sr2e?.ram ? "ram" : null;
      if (!key || isCardResolved(msg, key)) continue;
      const st = msg.flags.sr2e[key], now = live();
      if (st.resolved || st.successes === now) continue;
      const next = { ...st, successes: now };
      await msg.update({ content: key === "ram" ? renderRamCard(next) : renderSpellResistCard(next), [`flags.sr2e.${key}`]: next });
      changed = true;
    }
    if (!changed) break;
  }
  return msgs;
}

// ── Damage on a vehicle ────────────────────────────────────────────────────

/** A vehicle's flat condition monitor and the caller's receipt (`extra`) in ONE update. */
export function commitVehicleDamage(vehicle, boxes, { extra = {}, skipIf = null } = {}) {
  return enqueueAttack(`damage:${vehicle.uuid}`, async () => {
    if (skipIf?.()) return { landedBoxes: 0, skipped: true };
    const cm = vehicle.system.conditionMonitor;
    const value = Math.min((cm.value ?? 0) + Math.max(0, boxes), cm.max);
    await vehicle.update({ ...extra, "system.conditionMonitor.value": value });
    return { landedBoxes: value - (cm.value ?? 0) };
  });
}

// ── Resistance (P1.5) ──────────────────────────────────────────────────────

const recordOf = (actor, rid) => actor.getFlag("sr2e", `spellRes.${rid}`) ?? null;

function renderPending(p) {
  return `<div class="sr2e-damage-result"><strong>${esc(p.targetName)} is resisting ${esc(p.spellName)}…</strong>
    <br><em>The casting test is closed to Karma from now on.</em>
    <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-spellres-mark-btn sr2e-gm-only"
      title="GM: finish an interrupted resistance from what actually landed (nothing is re-rolled or re-spent)">⚙ Mark resolved</button></div></div>`;
}

/** The outcome line (p.131), e.g. "Smith takes Deadly Physical (10 boxes) — 3 vs 1 successes (net 2), base Serious." */
export function outcomeText(name, spellName, out, { cast, resist, baseLevel, dmgType, landed = null }) {
  const vsTxt = `${cast} vs ${resist} success${resist === 1 ? "" : "es"}`;
  if (!out.affected) return `<strong>${esc(name)} resists ${esc(spellName)}</strong> — ${vsTxt}; no effect.`;
  const boxes = landed ?? out.boxes;
  return `<strong>${esc(name)} takes ${levelText(out.level, dmgType)}</strong> (${boxes} box${boxes === 1 ? "" : "es"}) — ${vsTxt}`
    + (out.why === "tie" ? ", a tie: the base level (SR2E p.131)." : ` (net ${out.net}), base ${LEVEL_NAMES[baseLevel]}.`);
}

/**
 * Resist a combat spell card. `actor` is the defender.
 * @param {Actor} actor @param {ChatMessage} message
 */
export async function resistCombatSpell(actor, message) {
  const state = message.getFlag("sr2e", "spell");
  if (!state || state.manual) return null;
  if (isCardResolved(message, "spell")) return ui.notifications.warn("That spell has already been resisted.");
  const castTestId = state.testMessageId ?? "";
  const targetKey = normActorUuid(actor.uuid);
  const key = `${castTestId || message.id}:${targetKey}`;
  const castNow = () => state.areaCard ? state.successes : liveCastSuccesses(castTestId, state.successes);
  if (castNow() <= 0) return ui.notifications.warn(`${state.spellName} had no successes — nothing to resist. Karma on the casting can still revive it.`);
  const kind = state.kind || targetKindOf(actor.type);
  const vehicle = kind === "vehicle";
  if (vehicle && state.dmgType === "stun") return ui.notifications.warn("Stun combat spells don't affect vehicles (SR2E p.109).");
  const attr = vehicle ? "vehicle" : state.resistAttr === "willpower" ? "willpower" : "body";
  // Any magician with a Magic Pool may add unused dice (p.129); a vehicle has none.
  const mpAvailNow = () => (!vehicle && ["character", "npc"].includes(actor.type)) ? Math.max(0, actor.system.dicePools?.magic?.value ?? 0) : 0;
  const ownAvailNow = () => vehicle ? 0 : defenceBalance(actor);

  // 1. Choose first; cancel costs nothing.
  let choice = { own: 0, mp: 0 };
  const grantsNow = castTestId ? grantsFor(castTestId, targetKey) : [];
  if (ownAvailNow() > 0 || mpAvailNow() > 0 || grantsNow.length) {
    let picked = null;
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: `Resist ${state.spellName}` }, rejectClose: false,
      content: `<div>
        ${ownAvailNow() > 0 ? `<div class="form-group"><label>Your Spell Defense (${ownAvailNow()}):</label>
          <input type="number" name="own" value="${ownAvailNow()}" min="0" max="${ownAvailNow()}" style="width:52px;text-align:center;"></div>` : ""}
        ${mpAvailNow() > 0 ? `<div class="form-group"><label>Unused Magic Pool (${mpAvailNow()}):</label>
          <input type="number" name="mp" value="0" min="0" max="${mpAvailNow()}" style="width:52px;text-align:center;"></div>` : ""}
        <p style="margin:4px 0 0;font-size:11px;">${grantsNow.length
          ? `Allies protecting you: ${grantsNow.map(g => `${esc(g.magicianName)} +${g.n}`).join(", ")}.`
          : "No ally has spent Spell Defense on you (yet)."}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#aaa1c0;">Spell Defense dice you keep stay in reserve (SR2E p.132).</p></div>`,
      buttons: [
        { action: "roll", label: "SR2E.Dialog.Resist", default: true, callback: (ev, b) => {
          picked = { own: parseInt(b.form.elements.own?.value) || 0, mp: parseInt(b.form.elements.mp?.value) || 0 }; } },
        { action: "cancel", label: "SR2E.Dialog.Cancel" }
      ]
    });
    if (action !== "roll" || !picked) return null;
    choice = picked;
  }

  return defenseQueue(actor.uuid, async () => {
    if (isCardResolved(game.messages.get(message.id), "spell") || (castTestId && attackResolved(castTestId, targetKey))) {
      ui.notifications.warn("That spell has already been resisted.");
      return null;
    }
    // 2. Commit: exclusive across clients, then the pending outcome that closes the cast to Karma.
    if (!await once(actor, `spellres:${key}`)) {
      ui.notifications.warn(`${actor.name} is already resisting ${state.spellName}.`);
      return null;
    }
    const rid = claimId(key);
    const pendingState = { key, rid, castTestId, cardId: message.id, actorUuid: actor.uuid, targetName: actor.name,
      spellName: state.spellName, phase: "pending", at: game.time.serverTime };
    const pending = await ChatMessage.create({ _id: claimId(`spellresmsg:${key}`), speaker: ChatMessage.getSpeaker({ actor }),
      content: renderPending(pendingState),
      flags: { sr2e: { spellRes: pendingState, resolves: message.id,
        resolvesAttack: { castTestId, targetActorUuid: targetKey }, closesTests: [castTestId].filter(Boolean) } } }, { keepId: true });
    const castSuccesses = castNow();

    // 3. The spend and its record in ONE update.
    const own = Math.max(0, Math.min(choice.own, ownAvailNow()));
    const mp = Math.max(0, Math.min(choice.mp, mpAvailNow()));
    const grants = castTestId ? grantsFor(castTestId, targetKey) : [];
    const granted = grants.reduce((t, g) => t + (g.n ?? 0), 0);
    const split = defenceSplit(actor, own);
    const p = actor.system.dicePools ?? {};
    await actor.update({
      ...(own > 0 ? { "system.dicePools.spellDefense": p.spellDefense - split.sd, "system.dicePools.shieldingBonus": p.shieldingBonus - split.shield } : {}),
      ...(mp > 0 ? { "system.dicePools.magic.value": p.magic.value - mp } : {}),
      [`flags.sr2e.spellRes.${rid}`]: { key, castSuccesses, own, mp, grantIds: grants.map(g => g.id), at: game.time.serverTime }
    });
    const base = vehicle ? (Number(actor.system.body) || 0) + Math.floor((Number(actor.system.armor) || 0) / 2) : (actor.system[attr]?.value ?? 1);
    let dice = base + own + mp + granted;
    let notes = (own ? RL("SpellDefenseTag", { n: own }) : "") + (mp ? RL("MagicPoolTag", { n: mp }) : "")
      + grants.map(g => RL("SpellDefenseFromTag", { n: g.n, name: g.magicianName })).join("");
    // An elemental's reserved Spell Defense dice (p.141), paid before they count.
    const res = vehicle ? null : aidReservation(actor);
    let aidPaid = 0;
    if (res?.valid && elementalAidsCategory(res.spirit.system.domain, "combat")) {
      const n = Math.min(res.dice, res.spirit.system.effectiveForce ?? 0);
      const paid = n > 0 && res.spirit.isOwner ? await elementalTransition(res.spirit, "aid", { n }, { quiet: true, silent: true }) : { ok: false };
      if (paid.ok) { aidPaid = n; dice += n; notes += RL("AidSorceryTag", { n, spirit: res.spirit.name }); }
      else notes += RL("ElementalAidUnavailable");
      await actor.update({ [`flags.sr2e.spellRes.${rid}.aidPaid`]: aidPaid, ...(aidPaid ? CLEAR_DEFENSE_AID : {}) });
    }

    // 4. The resistance test, closed to after-the-fact Karma (it would not re-stage).
    const resist = await actor.rollSuccessTest(dice, state.force, {
      label: RL("ResistSpell", { spell: state.spellName, attr: vehicle ? "Body + ½ armor" : AL(attr), notes, tn: state.force }),
      isResistance: true, closed: true, flags: { sr2e: { spellResTest: key } },
      ...(attr === "body" ? actor._bodyTestOpts() : {})
    });
    await actor.update({ [`flags.sr2e.spellRes.${rid}.resistTestId`]: resist?.testMessageId ?? "" });

    // 5. Damage with its receipt.
    const out = combatSpellOutcome({ casterSuccesses: castSuccesses, resistSuccesses: resist?.successes ?? 0, baseLevel: state.baseLevel });
    const receipt = { [`flags.sr2e.spellRes.${rid}.damaged`]: out.affected ? out.boxes : 0 };
    const skipIf = () => recordOf(actor, rid)?.damaged != null;
    let landed = null;
    if (!out.affected) await actor.update(receipt);
    else if (vehicle) landed = (await commitVehicleDamage(actor, out.boxes, { extra: receipt, skipIf })).landedBoxes;
    else await commitDamage(actor, state.dmgType === "stun" ? "stun" : "physical", out.boxes, { extra: receipt, skipIf });

    // 6. The pending message becomes the outcome.
    const text = outcomeText(actor.name, state.spellName, out, { cast: castSuccesses, resist: resist?.successes ?? 0,
      baseLevel: state.baseLevel, dmgType: state.dmgType, landed });
    await finalizeOutcome(pending, text, { usedGrants: grants.map(g => g.id), resistTestId: resist?.testMessageId });
    await closeCard(message, actor.name);
    return resist;
  });
}

async function finalizeOutcome(pending, text, { usedGrants = [], resistTestId = "" } = {}) {
  const st = pending.flags.sr2e.spellRes;
  await pending.update({ content: `<div class="sr2e-damage-result">${text}</div>`,
    "flags.sr2e.spellRes": { ...st, phase: "done" }, "flags.sr2e.usedGrants": usedGrants,
    "flags.sr2e.closesTests": [st.castTestId, resistTestId].filter(Boolean) });
}

async function closeCard(message, name) {
  const live = game.messages.get(message.id);
  if (!live || !(live.isAuthor || game.user.isGM)) return;
  const st = live.getFlag("sr2e", "spell");
  if (!st || st.resolved) return;
  const next = { ...st, resolved: true, resolution: `<br><strong>Resolved against ${esc(name)}.</strong>` };
  await live.update({ content: renderSpellResistCard(next), "flags.sr2e.spell": next });
}

/**
 * GM: finish an interrupted resistance from what landed (P1.5) — never re-run. `message` is
 * the pending outcome, or the original card when the pending message never appeared.
 */
export async function markSpellResResolved(message) {
  if (!game.user.isGM) return;
  const now = game.time.serverTime;
  let p = message.getFlag("sr2e", "spellRes");
  let card = p ? game.messages.get(p.cardId) : message;
  if (!p) {
    // The original card: is there an orphan claim (claimed, no pending message)?
    const st = message.getFlag("sr2e", "spell");
    const actor = st?.targetUuid ? fromUuidSync(st.targetUuid) : null;
    const target = actor?.documentName === "Actor" ? actor : actor?.actor;
    if (!target) return ui.notifications.warn("No target on this card to look up.");
    const key = `${st.testMessageId || message.id}:${normActorUuid(target.uuid)}`;
    const marker = target.effects.get(claimId(`spellres:${key}`));
    if (!marker) return ui.notifications.info("Nothing is stuck: no resistance has started for this card.");
    if (game.messages.get(claimId(`spellresmsg:${key}`))) return ui.notifications.info("A resistance is in progress — use Mark resolved on its message.");
    if (now - (marker.flags?.sr2e?.claim?.at ?? now) < STUCK_MS) return ui.notifications.info("That resistance started under 2 minutes ago — give it time.");
    p = { key, rid: claimId(key), castTestId: st.testMessageId, cardId: message.id, actorUuid: target.uuid, targetName: target.name, spellName: st.spellName, orphan: true };
  } else {
    if (p.phase === "done") return ui.notifications.info("That resistance already finished.");
    if (now - (p.at ?? now) < STUCK_MS) return ui.notifications.info("That resistance started under 2 minutes ago — give it time.");
  }
  const actor = fromUuidSync(p.actorUuid);
  const rec = actor ? recordOf(actor, p.rid) : null;
  const landed = [rec ? `spent: Spell Defense ${rec.own ?? 0}, Magic Pool ${rec.mp ?? 0}${rec.aidPaid ? `, elemental ${rec.aidPaid}` : ""}` : "nothing was spent",
    rec?.resistTestId ? "the resistance test was rolled (above)" : "no resistance test",
    rec?.damaged != null ? `damage landed: ${rec.damaged} box${rec.damaged === 1 ? "" : "es"}` : "no damage landed"];
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Mark resolved" },
    content: `<p>What landed for ${esc(p.targetName)} vs ${esc(p.spellName)}:</p><ul>${landed.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
      <p>Nothing is re-rolled or re-spent. Apply anything missing by hand.</p>` });
  if (!ok) return;
  const text = `<strong>${esc(p.targetName)} vs ${esc(p.spellName)}: resolved by the GM</strong> — ${esc(landed.join("; "))}.`;
  if (p.orphan) {
    await ChatMessage.create({ content: `<div class="sr2e-damage-result">${text}</div>`, flags: { sr2e: { resolves: p.cardId,
      resolvesAttack: { castTestId: p.castTestId, targetActorUuid: normActorUuid(p.actorUuid) },
      closesTests: [p.castTestId, rec?.resistTestId].filter(Boolean), usedGrants: rec?.grantIds ?? [] } } });
  } else {
    await finalizeOutcome(message, text, { usedGrants: rec?.grantIds ?? [], resistTestId: rec?.resistTestId });
  }
  if (card) await closeCard(card, p.targetName);
}

/**
 * A Spell Defense grant that slipped in after the target's resistance started is given
 * back ONCE (P1.5): whoever wins `once(magician, "grantrefund:"+id)` writes the dice and
 * the receipt together.
 */
export async function refundLateGrants() {
  const outcomes = (game.messages?.contents ?? []).filter(m => m.flags?.sr2e?.resolvesAttack && m.flags.sr2e.spellRes?.phase !== "pending");
  if (!outcomes.length) return;
  for (const g of game.messages.contents) {
    const grant = g.flags?.sr2e?.spellDefenseGrant;
    if (!grant) continue;
    const out = outcomes.find(o => o.flags.sr2e.resolvesAttack.castTestId === grant.castTestId
      && o.flags.sr2e.resolvesAttack.targetActorUuid === grant.targetActorUuid);
    if (!out || (out.flags.sr2e.usedGrants ?? []).includes(grant.id)) continue;
    const magician = fromUuidSync(grant.magicianUuid);
    if (!magician?.isOwner || magician.getFlag("sr2e", `grantRefunds.${grant.id}`)) continue;
    if (!await once(magician, `grantrefund:${grant.id}`)) continue;
    const pools = magician.system.dicePools;
    await magician.update({ "system.dicePools.spellDefense": (pools.spellDefense ?? 0) + grant.n,
      [`flags.sr2e.grantRefunds.${grant.id}`]: grant.n });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: magician }), content: `<div class="sr2e-damage-result">
      ${esc(magician.name)}'s ${grant.n} Spell Defense ${grant.n === 1 ? "die" : "dice"} came too late — the target had already resisted. Refunded.</div>` });
  }
}

// ── Ram (P1.4) ─────────────────────────────────────────────────────────────

/** Apply a Ram card's Light damage to its vehicle — once, with its receipt. */
export async function applyRam(message) {
  const st = message.getFlag("sr2e", "ram");
  if (!st?.vehicleUuid || st.resolved || isCardResolved(message, "ram")) return ui.notifications.warn("That Ram has already been applied.");
  const vehicle = fromUuidSync(st.vehicleUuid);
  if (!vehicle?.isOwner) return ui.notifications.warn("Only the vehicle's owner or the GM can apply it.");
  const key = `ram:${st.testMessageId || message.id}:${normActorUuid(vehicle.uuid)}`;
  if (!await once(vehicle, key)) return ui.notifications.warn("That Ram is already being applied.");
  const pending = await ChatMessage.create({ _id: claimId(`${key}:msg`), content: `<div class="sr2e-damage-result">Applying ${esc(st.spellName)} to ${esc(vehicle.name)}…</div>`,
    flags: { sr2e: { resolves: message.id, closesTests: [st.testMessageId].filter(Boolean) } } }, { keepId: true });
  const successes = liveCastSuccesses(st.testMessageId, st.successes);
  const fx = ramEffect({ force: st.force, successes, barrierRating: st.barrierRating });
  const rid = claimId(key);
  const r = fx?.lightBoxes ? await commitVehicleDamage(vehicle, fx.lightBoxes, {
    extra: { [`flags.sr2e.ramApplied.${rid}`]: fx.lightBoxes }, skipIf: () => vehicle.getFlag("sr2e", `ramApplied.${rid}`) != null }) : { landedBoxes: 0 };
  const text = `<strong>${esc(vehicle.name)} takes ${r.landedBoxes} Light damage</strong> from ${esc(st.spellName)} (${successes} success${successes === 1 ? "" : "es"}, SR2E p.151).`;
  await pending.update({ content: `<div class="sr2e-damage-result">${text}</div>` });
  if (message.isAuthor || game.user.isGM) {
    const next = { ...st, successes, resolved: true, resolution: `<br><strong>Applied: ${r.landedBoxes} Light.</strong>` };
    await message.update({ content: renderRamCard(next), "flags.sr2e.ram": next });
  }
}

// ── Avoid an Oops (P1.4, p.191) ────────────────────────────────────────────

/**
 * The ONE decision on a misfired casting: "avoided" (1 Karma — an ordinary failure) or
 * "declined" (a misfire: Drain TN +2, p.131). Both the cast's prompt and the chat button
 * come here; the claim makes one decision win. Returns the decision in force.
 */
export async function decideOops(message, choice) {
  const caster = fromUuidSync(message.getFlag("sr2e", "spellCast")?.casterUuid ?? "") ?? null;
  const st = message.getFlag("sr2e", "test");
  if (!caster || !st?.criticalGlitch) return null;
  const current = () => game.messages.get(message.id)?.getFlag("sr2e", "oops") ?? null;
  if (current()) return current();
  if (!await once(caster, `oops:${message.id}`)) return current();
  let decision = "declined";
  if (choice === "avoided" && (caster.system.karma?.pool ?? 0) >= 1) {
    await caster.applyKarmaToTest(message, "avoidGlitch", { oopsClaimed: true });
    if (game.messages.get(message.id)?.getFlag("sr2e", "test")?.glitchAvoided) decision = "avoided";
  }
  const live = game.messages.get(message.id);
  const test = { ...live.getFlag("sr2e", "test"), ...(decision === "declined" ? { closed: true } : {}) };
  await live.update({ "flags.sr2e.oops": decision, "flags.sr2e.test": test });
  return decision;
}

/** After the misfire roll: offer Avoid an Oops if the caster has Karma, else it's declined. */
export async function resolveMisfire(caster, testMessageId, spellName) {
  const message = game.messages.get(testMessageId);
  if (!message?.getFlag("sr2e", "test")?.criticalGlitch) return null;
  let choice = "declined";
  if ((caster.system.karma?.pool ?? 0) >= 1) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: `${spellName}: Rule of One` },
      content: `<p>Every die came up 1 — a <strong>misfire</strong> (SR2E p.131): Drain's target number goes up by 2.</p>
        <p>Spend 1 Karma Pool to <strong>Avoid an Oops</strong> (p.191)? The spell simply fails instead.</p>`, rejectClose: false });
    if (ok) choice = "avoided";
  }
  return decideOops(message, choice);
}

/** Wire the card buttons (renderChatMessageHTML). */
export function wireCombatSpellButtons(message, html) {
  if (!game.user.isGM) html.querySelectorAll?.(".sr2e-gm-only").forEach(b => b.remove());
  html.querySelectorAll?.(".sr2e-spellres-mark-btn, .sr2e-spellres-stuck-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    return markSpellResResolved(message);
  }));
  html.querySelectorAll?.(".sr2e-ram-apply-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    return applyRam(message);
  }));
}

/** Current Force-dice target candidates (the dialog's snapshot): TokenDocuments. */
export const snapshotTargets = () => targetTokens().map(t => t.document).filter(Boolean);

