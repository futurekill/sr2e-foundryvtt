/**
 * Adept powers, Phase B (docs/PLAN-adept-powers-phase-b.md): an initiated adept's Centering against a skill test's
 * penalties (Grimoire p.44), Attribute Boost (p.34) and Suspended State (p.34, Hibernate core p.157).
 */
import { adeptPowerKey, centeringTestTN, centeringPenaltyReduction, racialProfile, toxinLevel, DAMAGE_BOXES } from "./rules/sr2e-rules.mjs";
import { skillGroup, adeptCenteringCovers, attributeBoostDrainLevel, attributeBoostDrainTN, suspendedFactor } from "./rules/adept-phase-b-rules.mjs";
import { once } from "./claims.mjs";
import { claimId } from "./rules/claim-rules.mjs";
import { commitDamage, workingImplant } from "./drugs.mjs";
import { adeptPowersWork } from "./rules/shapeshift-rules.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

/**
 * Whether this actor may center against a test of this skill, and with what (Grimoire p.44): a working physical adept,
 * initiated, with the Centering metamagic and a Centering skill it knows (never a chip), on a covered skill that isn't
 * the Centering skill itself. Returns { skill, dice, grade } or null.
 * @param {{key:string, category?:string, name:string}} test
 */
export function adeptCentering(actor, { key, category = "active", name }) {
  const sys = actor?.system, mg = sys?.magic;
  if (actor?.type !== "character" || mg?.type !== "physical_adept" || !adeptPowersWork(sys)) return null;
  if ((mg.initiateGrade ?? 0) < 1 || !mg.metamagic?.includes?.("centering") || !mg.centeringSkill) return null;
  if (norm(name) === norm(mg.centeringSkill)) return null;   // "no effect on penalties favoring a Centering Test"
  const skill = actor.items.find(i => i.type === "skill" && norm(i.name) === norm(mg.centeringSkill));
  if (!skill || (skill.system.rating ?? 0) <= 0 || skill.system._chipped) return null;   // "never chip-based"
  const enhanced = actor.items.filter(i => i.type === "adept_power" && adeptPowerKey(i) === "enhanced_centering")
    .map(i => ({ category: i.system.centeringCategory, skill: i.system.centeringSkill }));
  if (!adeptCenteringCovers({ group: skillGroup({ key, category }), skillName: name }, enhanced)) return null;
  return { skill, dice: skill.system.rating, grade: mg.initiateGrade };
}

/**
 * The Centering Test against penalties (Grimoire p.44): Centering dice vs the test's TN WITH its penalties, less the
 * grade, with no character modifier added again ("equipment" policy). Every 2 successes take 1 off the penalties.
 * @param {number} tnWithPenalties - the final TN the test would roll at, all penalties in
 * @param {number} reducible - the penalties the system knows (its modifiers + a defaulting penalty)
 * @returns {Promise<{reduction:number, leftover:number}>}
 */
export async function centerAgainstPenalties(actor, c, { tnWithPenalties, reducible, skillName }) {
  const cTN = centeringTestTN(tnWithPenalties, c.grade);
  const r = await actor.rollSuccessTest(c.dice, cTN, { tnPolicy: "equipment",
    label: `Centering (${c.skill.name}) against penalties on ${skillName} — TN ${cTN} (Grimoire p.44; a Free Action)` });
  const all = Math.floor((r?.successes ?? 0) / 2);
  const reduction = centeringPenaltyReduction(r?.successes ?? 0, reducible);
  return { reduction, leftover: all - reduction };
}

// ── Attribute Boost (Grimoire p.34) and Suspended State (p.34) ──────────────────────────────────────────────

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const ATTR = { body: "Body", quickness: "Quickness", strength: "Strength" };
const card = (actor, html, flags = {}) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-power-card">${html}</div>`, flags: { sr2e: flags } });
const btn = (cls, label) => `<button type="button" class="${cls}">${esc(label)}</button>`;
const mayAct = (actor) => actor?.isOwner || game.user.isGM;
/** The card's power, only while its holder is a working physical adept who still has it (rechecked on every click). */
function livePower(st, key) {
  const actor = fromUuidSync(st.actorUuid), power = actor?.items.get(st.itemId);
  if (!actor || !power || adeptPowerKey(power) !== key) return {};
  if (actor.system.magic?.type !== "physical_adept" || !adeptPowersWork(actor.system)) {
    ui.notifications.warn(`${actor.name}'s adept powers don't work now.`);
    return {};
  }
  return { actor, power };
}

/** The buttons a power's card carries (item.mjs _displayPowerCard), by its key. */
export function powerCardButtons(key) {
  if (key === "attribute_boost") return btn("sr2e-boost-activate-btn", "Activate (Magic test)");
  if (key === "suspended_state") return btn("sr2e-suspend-btn", "Enter suspended state (Willpower test)");
  return "";
}

/** Why the boost can't work now (Grimoire p.34: "not compatible with any form of cybernetic or bioware enhancements,
 *  nor spell-based increases"), or null. Improved Physical Attributes is allowed. */
function boostBlocked(actor, attr) {
  const ware = actor.items.find(i => (i.type === "cyberware" || i.type === "bioware") && workingImplant(actor, i) && Number(i.system.attributeMods?.[attr]) !== 0);
  if (ware) return `${ware.name} enhances ${ATTR[attr]}: Attribute Boost doesn't work with ware enhancements (Grimoire p.34).`;
  const spell = actor.effects.find(e => !e.disabled && e.changes?.some(c => c.key === `system.${attr}.mod`) && fromUuidSync(e.origin ?? "")?.type === "spell");
  if (spell) return `${spell.name} raises ${ATTR[attr]} by magic: Attribute Boost doesn't work with spell increases (Grimoire p.34).`;
  return null;
}

export async function activateBoost(message) {
  const { actor, power } = livePower(message.flags?.sr2e?.powerCard ?? {}, "attribute_boost");
  if (!actor) return;
  if (!mayAct(actor)) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can do that.`);
  const attr = power.system.boostAttribute;
  if (!ATTR[attr]) return ui.notifications.warn(`${power.name}: choose the attribute on the power first (Grimoire p.34).`);
  const effectId = claimId(`boost:${actor.uuid}:${attr}`);
  if (actor.effects.has(effectId)) return ui.notifications.warn(`${ATTR[attr]} is already boosted.`);
  const why = boostBlocked(actor, attr);
  if (why) return ui.notifications.warn(why);
  const current = actor.system[attr]?.value ?? 0, level = Math.max(1, Number(power.system.level) || 1);
  const r = await actor.rollSuccessTest(actor.system.magic?.value ?? 0, current,
    { label: `Attribute Boost (${ATTR[attr]}) — Magic vs ${current} (Grimoire p.34)` });
  const s = r?.successes ?? 0;
  if (s < 1) return card(actor, `<strong>${esc(power.name)}</strong>: no successes — ${ATTR[attr]} stays ${current}.`);
  const combat = game.combat?.started && game.combat.combatants.some(c => c.actor?.id === actor.id) ? game.combat : null;
  const boostId = foundry.utils.randomID();
  const boosted = current + level, racialMax = racialProfile(actor.system, CONFIG.SR2E).maxes?.[attr] ?? 6;
  const endsAt = combat ? { combat: combat.id, round: combat.round + s, turn: combat.turn } : { time: game.time.worldTime + s * 3 };
  let made;
  try {
    [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: effectId, name: `Attribute Boost (${ATTR[attr]} +${level})`, img: power.img,
      changes: [{ key: `system.${attr}.mod`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(level) }],
      duration: combat ? { combat: combat.id, rounds: s, startRound: combat.round, startTurn: combat.turn } : { seconds: s * 3, startTime: game.time.worldTime },
      flags: { sr2e: { attributeBoost: { boostId, attr, level, boosted, racialMax, endsAt } } } }], { keepId: true });
  } catch (e) { return ui.notifications.warn(`${ATTR[attr]} is already boosted.`); }   // another device started one (the id is fixed)
  if (made?.flags?.sr2e?.attributeBoost?.boostId !== boostId) return ui.notifications.warn(`The boost didn't start.`);
  return card(actor, `<strong>${esc(power.name)}</strong>: ${ATTR[attr]} +${level} (to ${boosted}) for ${s} Combat Turn${s === 1 ? "" : "s"}.
    When it ends, resist Drain: Willpower vs ${attributeBoostDrainTN(boosted)}, ${attributeBoostDrainLevel(boosted, racialMax)} Stun (Grimoire p.34).<br>
    ${btn("sr2e-boost-end-btn", "End boost & resist Drain")}`, { boostCard: { actorUuid: actor.uuid, effectId, boostId } });
}

/**
 * End a running boost (code review r1): every step can be repeated safely, by any client, until it holds — the pending
 * Drain record (written only if absent), the effect's deletion (checked), then the Drain card (claimed, posted once).
 * `boostId` must match the running effect: an old card never ends a newer boost of the same attribute.
 */
export async function endBoost(actor, effectId, boostId = null) {
  const eff = actor?.effects.get(effectId), b = eff?.flags?.sr2e?.attributeBoost;
  if (!b || (boostId && b.boostId !== boostId)) return;
  if (!actor.getFlag("sr2e", "boostDrain")?.[b.boostId])
    await actor.update({ [`flags.sr2e.boostDrain.${b.boostId}`]: { attr: b.attr, boosted: b.boosted, racialMax: b.racialMax, state: "pending" } });
  if (!actor.getFlag("sr2e", "boostDrain")?.[b.boostId]) return;
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]).catch(() => null);
  if (actor.effects.has(effectId)) return;   // not deleted: the boost still applies — no Drain yet
  return postDrainCard(actor, b.boostId);
}

/** `recover`: the active GM's ready reconcile, which already checked that no card exists — it posts without the claim, so
 *  a card whose creation failed after its claim (fix-only r2) is still posted. */
async function postDrainCard(actor, boostId, { recover = false } = {}) {
  const d = actor.getFlag("sr2e", "boostDrain")?.[boostId];
  if (!d || (!recover && !(await once(actor, `boost-card:${boostId}`)))) return;
  return card(actor, `<strong>Attribute Boost ended</strong> (${ATTR[d.attr]} was ${d.boosted}): resist Drain — Willpower vs
    ${attributeBoostDrainTN(d.boosted)}, ${attributeBoostDrainLevel(d.boosted, d.racialMax)} Stun; 2 successes lower it a level (Grimoire p.34).<br>
    ${btn("sr2e-boost-drain-btn", "Resist Drain (Willpower)")}`, { boostDrainCard: { actorUuid: actor.uuid, boostId } });
}

export async function resistBoostDrain(message) {
  const st = message.flags?.sr2e?.boostDrainCard ?? {};
  const actor = fromUuidSync(st.actorUuid);
  if (!actor) return;
  if (!mayAct(actor)) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can do that.`);
  const state = () => actor.getFlag("sr2e", "boostDrain")?.[st.boostId]?.state;
  const d = actor.getFlag("sr2e", "boostDrain")?.[st.boostId];
  if (!d || state() === "done") return ui.notifications.warn("That Drain has already been resisted.");
  // One roll across every client (code review r1): the claim is taken before the dice.
  if (!(await once(actor, `boost-drain:${st.boostId}`))) return ui.notifications.warn("That Drain is already being resisted.");
  const tn = attributeBoostDrainTN(d.boosted), level = attributeBoostDrainLevel(d.boosted, d.racialMax);
  const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 1, tn,
    { label: `Attribute Boost Drain — Willpower vs ${tn}, ${level} Stun (Grimoire p.34)`, isResistance: true });
  if (!r) return;
  const final = toxinLevel(level, r.successes ?? 0);
  await commitDamage(actor, "stun", final ? DAMAGE_BOXES[final] : 0, { source: "drain",
    extra: { [`flags.sr2e.boostDrain.${st.boostId}.state`]: "done" }, skipIf: () => state() === "done" });
  return card(actor, `Attribute Boost Drain: ${final ? `${final} Stun (${DAMAGE_BOXES[final]} box${DAMAGE_BOXES[final] === 1 ? "" : "es"})` : "fully resisted"}.`);
}

export async function enterSuspendedState(message) {
  const { actor } = livePower(message.flags?.sr2e?.powerCard ?? {}, "suspended_state");
  if (!actor) return;
  if (!mayAct(actor)) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can do that.`);
  const specials = actor.items.filter(i => i.type === "skill" && i.system.category === "special" && (i.system.rating ?? 0) > 0);
  const options = [`<option value="">None</option>`, ...specials.map(s => `<option value="${s.id}">${esc(s.name)} (${s.system.rating})</option>`)].join("");
  const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: "Suspended State (Grimoire p.34)" },
    content: `<p>Willpower, plus a meditative Special Skill's dice, against 4 (injury modifiers apply).</p><div class="form-group"><label>Meditative skill:</label><select name="skill">${options}</select></div>`,
    ok: { callback: (ev, button) => button.form.elements.skill.value ?? "" }, rejectClose: false });
  if (pick == null) return;
  const sk = pick ? actor.items.get(pick) : null;
  const r = await actor.rollSuccessTest((actor.system.willpower?.value ?? 1) + (sk?.system.rating ?? 0), 4,
    { label: `Suspended State — Willpower${sk ? ` + ${sk.name}` : ""} vs 4 (Grimoire p.34)` });
  const f = suspendedFactor(r?.successes ?? 0);
  return card(actor, f ? `<strong>Suspended State</strong>: the body slows by a factor of ${f}, as Hibernate (core p.157): a bleeding character
    takes a box every ${10 * f} minutes, not 10; air, food and water last ${f} times as long. The GM applies it (the healing clock isn't slowed).`
    : `<strong>Suspended State</strong>: no successes — no suspended state.`);
}

/** Card buttons (sr2e.mjs renderChatMessageHTML). */
export function wireAdeptPowerButtons(message, html) {
  const on = (sel, fn) => html.querySelectorAll?.(sel).forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); fn(message); }));
  on(".sr2e-boost-activate-btn", activateBoost);
  on(".sr2e-suspend-btn", enterSuspendedState);
  on(".sr2e-boost-drain-btn", resistBoostDrain);
  on(".sr2e-boost-end-btn", (m) => { const s = m.flags?.sr2e?.boostCard ?? {}; const a = fromUuidSync(s.actorUuid);
    if (!mayAct(a)) return ui.notifications.warn("Only the owner or the GM can do that."); return endBoost(a, s.effectId, s.boostId); });
}

/** The active GM ends boosts whose Combat Turns are spent (checked on every turn change), and re-posts a pending Drain
 *  card that has none (a crash between the steps). */
export function registerAdeptPowerHooks() {
  Hooks.on("updateCombat", (combat, changes) => {
    if (!game.users.activeGM?.isSelf || !("round" in changes || "turn" in changes)) return;
    for (const c of combat.combatants) {
      const actor = c.actor;
      for (const e of actor?.effects ?? []) {
        const at = e.flags?.sr2e?.attributeBoost?.endsAt;
        if (at?.combat !== combat.id) continue;
        if (combat.round > at.round || (combat.round === at.round && combat.turn >= at.turn)) endBoost(actor, e.id).catch(err => console.error("SR2E | boost end", err));
      }
    }
  });
  Hooks.once("ready", () => {
    if (!game.users.activeGM?.isSelf) return;
    // World actors and unlinked tokens' actors (code review r1): a pending Drain with no card gets one; a boost whose end
    // stopped halfway (record written, effect still there) is finished.
    const actors = [...game.actors, ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor))];
    const carded = new Set(game.messages.contents.map(m => m.flags?.sr2e?.boostDrainCard?.boostId).filter(Boolean));
    for (const actor of actors) {
      for (const e of actor.effects) { const b = e.flags?.sr2e?.attributeBoost; if (b && actor.getFlag("sr2e", "boostDrain")?.[b.boostId]) endBoost(actor, e.id, b.boostId); }
      for (const [id, d] of Object.entries(actor.getFlag("sr2e", "boostDrain") ?? {}))
        if (d?.state === "pending" && !carded.has(id) && !actor.effects.some(e => e.flags?.sr2e?.attributeBoost?.boostId === id)) postDrainCard(actor, id, { recover: true });
    }
  });
}
