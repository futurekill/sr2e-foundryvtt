/**
 * Astral combat (SR2E p.147–148): "works exactly like Melee Combat (p.100)".
 *
 * An attack posts an opposed-exchange card (`flags.sr2e.astralMelee`). The
 * target's owner Defends (or concedes Undefended); most successes hits, ties to
 * the attacker, and the winner's damage is staged up one level per 2 net
 * successes. The LOSER then resists from a separate card
 * (`flags.sr2e.astralResist`) with Astral Body — Willpower for a magician, Force
 * for a spirit, Body for a dual being (whose physical Impact armor counts) —
 * staging down one level per 2 successes; the damage echoes onto the physical
 * body (repercussion).
 *
 * Resolution is proven by a marker message the resolver authors
 * (`flags.sr2e.resolves = <card id>`), so a player can close a card someone else
 * posted. Tests that decided an exchange are closed to Karma via
 * `flags.sr2e.closesTests`. Legacy `flags.sr2e.astral` cards are untouched.
 */
import { astralProfile, meleeOutcome, netToSteps, testTotalSuccesses, successesFromSource } from "./rules/sr2e-rules.mjs";
import { evaluateDamageCode } from "./documents/item.mjs";
import { magicalSkillBlock } from "./restricted-spells.mjs";

const STAGES = ["L", "M", "S", "D"];
const IN_FLIGHT = new Set();
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** "magician" | "spirit" | "dual", or null when the actor is not in astral space. */
export function astralKind(actor) {
  if (!actor) return null;
  if (actor.type === "spirit") return actor.system.depleted ? null : "spirit";
  if (actor.type === "npc") return actor.system.dualNatured ? "dual" : null;
  if (actor.type === "character")
    return ["perceiving", "projecting"].includes(actor.system.astralState) ? "magician" : null;
  return null;
}

/** Weapon foci that can arm an astral attack: bonded, active and wielded (p.138). */
export function astralFoci(actor) {
  return (actor?.items ?? []).filter(f => f.type === "focus" && f.system.focusType === "weapon"
    && f.system.bonded && f.system.active
    && (!f.system.bondedWeaponId || actor.items.get(f.system.bondedWeaponId)?.system?.equipped));
}

const skillRating = (actor, name) =>
  actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === name)?.system?.rating ?? 0;

/** The astral profile of an actor (see astralProfile), with the chosen focus. */
export function actorAstralProfile(actor, focusId = "") {
  const kind = astralKind(actor);
  if (!kind) return null;
  const sys = actor.system;
  const v = (k) => sys[k]?.value ?? sys[k] ?? 0;
  const focus = focusId ? astralFoci(actor).find(f => f.id === focusId) : null;
  let physicalDamage = null;
  if (kind === "dual") {
    // Its physical attack (p.148: same Attributes on both planes): its natural /
    // melee weapon's code, else astralProfile's (Strength)M.
    const natural = actor.items.find(i => i.type === "weapon" && i.system.weaponType === "melee");
    const d = natural ? evaluateDamageCode(natural.system.damageCode, actor) : null;
    if (d?.power > 0 && STAGES.includes(d.level)) physicalDamage = { power: d.power, level: d.level };
  }
  const prof = astralProfile({
    kind,
    skills: { armed: skillRating(actor, "armed combat"), unarmed: skillRating(actor, "unarmed combat"),
              sorcery: skillRating(actor, "sorcery") },
    attrs: { intelligence: v("intelligence"), willpower: v("willpower"), charisma: v("charisma"),
             body: v("body"), strength: v("strength") },
    force: sys.effectiveForce ?? sys.force ?? 0,
    focusRating: focus?.system?.force ?? 0,
    physicalDamage,
    impactArmor: sys.armor?.impact ?? 0
  });
  return { kind, focus, ...prof };
}

/** A card is resolved when its own flag says so or any message claims it. */
export function isCardResolved(msg, key) {
  if (!msg) return true;
  if (msg.flags?.sr2e?.[key]?.resolved) return true;
  return !!game.messages?.some?.(m => m.flags?.sr2e?.resolves === msg.id);
}

/** Whether a success-test message has been closed to Karma by a finished exchange. */
export function isTestClosed(testMessageId) {
  if (!testMessageId) return false;
  return !!game.messages?.some?.(m => (m.flags?.sr2e?.closesTests ?? []).includes(testMessageId));
}

/** Live success total of a test message (Karma included). */
function liveSuccesses(testMessageId, fallback) {
  const st = game.messages?.get(testMessageId)?.flags?.sr2e?.test;
  return st ? testTotalSuccesses(st) : (fallback ?? 0);
}

/** Close tests to Karma: re-render them where we may, and record it either way. */
async function closeTests(ids) {
  for (const id of ids.filter(Boolean)) {
    const m = game.messages.get(id);
    const st = m?.flags?.sr2e?.test;
    if (!st || st.closed || !m.canUserModify(game.user, "update")) continue;
    const { renderSuccessTestCard } = await import("./documents/actor.mjs");
    const next = { ...st, closed: true };
    await m.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
  }
}

// ── Cards ──────────────────────────────────────────────────────────────────

export function renderAstralMeleeCard(state) {
  const live = !state.resolved;
  const buttons = live ? `
    <div class="sr2e-karma-actions">
      <button type="button" class="sr2e-resist-btn sr2e-astral-defend-btn"
              title="${esc(state.targetName)} defends with their astral combat skill (SR2E p.147) — the winner hits.">Defend (Astral)</button>
      <button type="button" class="sr2e-resist-btn sr2e-astral-undefended-btn"
              title="Concede the exchange: the attack lands with its own successes.">Undefended</button>
    </div>` : "";
  const dmg = state.damage ?? {};
  return `<div class="sr2e-damage-result">
    <strong>${esc(state.attackerName)} strikes at ${esc(state.targetName)} in astral space</strong>
    — ${state.successes} success${state.successes === 1 ? "" : "es"} (${esc(state.skillLabel)}).
    <br><em>Opposed like melee (SR2E p.147): most successes hits, ties to the attacker.
    Attacker's damage ${dmg.power}${dmg.level}${state.damageType === "stun" ? " Stun" : " Physical"}.</em>
    ${state.resolution ?? ""}${buttons}
  </div>`;
}

export function renderAstralResistCard(state) {
  const live = !state.resolved;
  return `<div class="sr2e-damage-result">
    <strong>${esc(state.winnerName)} hits ${esc(state.loserName)}</strong>${state.riposte ? " <em>(counterstrike!)</em>" : ""}
    — ${state.power}${state.level}${state.damageType === "stun" ? " Stun" : " Physical"}
    <br><em>${state.net} net success${state.net === 1 ? "" : "es"} — staged up ${netToSteps(state.net)} level(s).
    Resist with ${esc(state.resistLabel)} vs TN ${state.tn}${state.armor ? ` (Power ${state.power} − armor ${state.armor})` : ""};
    damage echoes onto the physical body (p.147).</em>
    ${state.resolution ?? ""}
    ${live ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-astral-resist-btn">
      Resist (Astral)</button></div>` : ""}
  </div>`;
}

// ── Attack ─────────────────────────────────────────────────────────────────

/**
 * @param {Actor} actor
 * @param {object} opts { skillKey, focusId, poolDice, karmaDice, damageType, otherMod, miscDice, miscLabel }
 */
export async function astralAttack(actor, opts = {}) {
  const kind = astralKind(actor);
  if (!kind) return ui.notifications.warn(`${actor.name} is not in astral space (perceive or project first — SR2E p.147).`);
  const busy = actor._elementalBusyReason?.();
  if (busy) return ui.notifications.warn(busy);
  const targets = [...(game.user?.targets ?? [])];
  if (targets.length !== 1) return ui.notifications.warn("Target exactly one astral opponent (T) before attacking.");
  const target = targets[0].actor;
  if (!astralKind(target)) {
    return ui.notifications.warn(`${targets[0].name} has no astral presence — mundane beings are immune to direct effects from astral space (SR2E p.147).`);
  }
  const prof = actorAstralProfile(actor, opts.focusId ?? "");
  const choice = prof.options.find(o => o.key === opts.skillKey) ?? prof.options[0];
  // Sorcery is a magical skill: not while sustaining an exclusive spell (p.133).
  if (choice.key === "sorcery") {
    const excl = magicalSkillBlock(actor);
    if (excl) return ui.notifications.warn(excl);
  }
  const damageType = opts.damageType === "stun" ? "stun" : "physical";
  const pool = kind === "magician" ? Math.max(0, Math.min(opts.poolDice ?? 0, actor.system.dicePools?.astral?.value ?? 0)) : 0;
  const tn = Math.max(2, 4 + (Number(opts.otherMod) || 0));
  const result = await actor.rollSuccessTest(choice.dice, tn, {
    label: `Astral Attack — ${choice.label} (TN ${tn})`,
    poolDice: pool > 0 ? { astral: pool } : {},
    karmaDice: opts.karmaDice, miscDice: opts.miscDice, miscLabel: opts.miscLabel
  });
  if (!result) return result;
  const state = {
    testMessageId: result.testMessageId, attackerUuid: actor.uuid, attackerName: actor.name,
    targetUuid: target.uuid, targetName: targets[0].name, successes: result.successes ?? 0,
    skillLabel: choice.label, damage: prof.damage, damageType, focusId: prof.focus?.id ?? "", resolved: false
  };
  // Posted even at 0 successes: the defender may still win and counterstrike.
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: renderAstralMeleeCard(state),
    flags: { sr2e: { astralMelee: state } }
  });
  return result;
}

// ── Defence / Undefended ───────────────────────────────────────────────────

async function exchangeTarget(message) {
  const state = message.getFlag("sr2e", "astralMelee");
  if (!state || isCardResolved(message, "astralMelee")) {
    ui.notifications.warn("That astral exchange is already resolved.");
    return null;
  }
  let t = null;
  try { t = await fromUuid(state.targetUuid); } catch (e) { t = null; }
  const defender = t?.documentName === "Actor" ? t : t?.actor;
  if (!defender) { ui.notifications.warn("The target no longer exists — the GM resolves it."); return null; }
  if (!defender.isOwner) { ui.notifications.warn(`Only ${defender.name}'s owner or the GM can answer this attack.`); return null; }
  if (!astralKind(defender)) { ui.notifications.warn(`${defender.name} is no longer in astral space.`); return null; }
  return { state, defender };
}

/** Post the loser's resistance card and close the exchange. */
async function finishExchange(message, state, o) {
  const stageUps = netToSteps(o.net);
  const level = STAGES[Math.min(STAGES.indexOf(o.damage.level) + stageUps, 3)];
  const loser = o.loser;
  const lp = actorAstralProfile(loser) ?? { resistDice: 0, resistLabel: "—", armor: 0, kind: null };
  const resist = {
    exchangeId: message.id, loserUuid: loser.uuid, loserName: loser.name, winnerName: o.winnerName,
    riposte: !!o.riposte, net: o.net, power: o.damage.power, level, damageType: o.damageType,
    armor: lp.armor, tn: Math.max(2, o.damage.power - lp.armor), resistLabel: lp.resistLabel,
    fullDefense: !!o.fullDefense, strikerSuccesses: o.strikerSuccesses ?? 0, resolved: false
  };
  if (o.miss) {
    await ChatMessage.create({ content: `<div class="sr2e-damage-result"><strong>${esc(o.missText)}</strong></div>`,
      flags: { sr2e: { resolves: message.id, closesTests: o.closes } } });
  } else {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: loser }),
      content: renderAstralResistCard(resist),
      flags: { sr2e: { astralResist: resist, resolves: message.id, closesTests: o.closes } }
    });
  }
  await closeTests(o.closes);
  if (message.isAuthor || game.user.isGM) {
    const next = { ...state, resolved: true,
      resolution: `<br><strong>Resolved:</strong> ${esc(o.summary)}` };
    await message.update({ content: renderAstralMeleeCard(next), "flags.sr2e.astralMelee": next });
  }
}

export async function astralUndefended(message) {
  if (IN_FLIGHT.has(message.id)) return;
  IN_FLIGHT.add(message.id);
  try {
    const got = await exchangeTarget(message);
    if (!got) return;
    const { state, defender } = got;
    const successes = liveSuccesses(state.testMessageId, state.successes);
    await finishExchange(message, state, {
      loser: defender, winnerName: state.attackerName, net: successes, damage: state.damage,
      damageType: state.damageType, closes: [state.testMessageId],
      summary: `${state.attackerName} hits ${defender.name} (undefended).`
    });
  } finally { IN_FLIGHT.delete(message.id); }
}

/**
 * Defend an astral attack. `choice` (from the dialog, or a macro):
 * { skillKey, focusId, poolDice, karmaDice, fullDefense, damageType, otherMod }
 */
export async function astralDefend(message, choice = {}) {
  if (IN_FLIGHT.has(message.id)) return;
  IN_FLIGHT.add(message.id);
  try {
    const got = await exchangeTarget(message);
    if (!got) return;
    const { state, defender } = got;
    const attacker = await fromUuid(state.attackerUuid).catch(() => null);
    const prof = actorAstralProfile(defender, choice.focusId ?? "");
    const opt = prof.options.find(o => o.key === choice.skillKey) ?? prof.options[0];
    const poolAvail = prof.kind === "magician" ? (defender.system.dicePools?.astral?.value ?? 0) : 0;
    // Full Defense (p.103 via "exactly like melee"): no pool on this test —
    // it is saved for the resistance, where pool successes alone beating the
    // attacker's are a clean miss. And no counterstrike.
    const pool = choice.fullDefense ? 0 : Math.max(0, Math.min(choice.poolDice ?? 0, poolAvail));
    const successesAtStart = liveSuccesses(state.testMessageId, state.successes);
    // Last check before any die or pool is spent.
    const live = game.messages.get(message.id);
    if (!live || isCardResolved(live, "astralMelee")) return ui.notifications.warn("That astral exchange was resolved meanwhile.");
    const tn = Math.max(2, 4 + (Number(choice.otherMod) || 0));
    const defense = await defender.rollSuccessTest(opt.dice, tn, {
      label: `Defend (astral) vs ${state.attackerName} — ${opt.label}${choice.fullDefense ? ", Full Defense" : ""} (TN ${tn})`,
      poolDice: pool > 0 ? { astral: pool } : {},
      karmaDice: choice.karmaDice
    });
    if (!defense) return;
    // The attacker may have spent Karma while this dialog was open: the live
    // total decides, and it is final from here on.
    const atk = liveSuccesses(state.testMessageId, successesAtStart);
    const { winner, net } = meleeOutcome(atk, defense.successes ?? 0);
    const closes = [state.testMessageId, defense.testMessageId];
    if (winner === "defender" && choice.fullDefense) {
      return finishExchange(message, state, { miss: true, closes,
        missText: `${defender.name} fends off ${state.attackerName} (Full Defense — no counterstrike, p.103).`,
        summary: `${defender.name} fended off the attack.` });
    }
    if (winner === "attacker") {
      return finishExchange(message, state, {
        loser: defender, winnerName: state.attackerName, net, damage: state.damage,
        damageType: state.damageType, closes, fullDefense: !!choice.fullDefense, strikerSuccesses: atk,
        summary: `${state.attackerName} hits ${defender.name} (${atk} vs ${defense.successes}).`
      });
    }
    if (!attacker) {
      return finishExchange(message, state, { miss: true, closes,
        missText: `${defender.name} wins the exchange, but the attacker is gone.`, summary: "Attacker gone." });
    }
    return finishExchange(message, state, {
      loser: attacker, winnerName: defender.name, riposte: true, net, damage: prof.damage,
      damageType: prof.kind === "spirit" ? "physical" : (choice.damageType === "stun" ? "stun" : "physical"),
      closes, summary: `${defender.name} counterstrikes ${state.attackerName} (${defense.successes} vs ${atk}).`
    });
  } finally { IN_FLIGHT.delete(message.id); }
}

// ── Resistance ─────────────────────────────────────────────────────────────

/** Resist the damage on an astralResist card. `choice`: { poolDice, karmaDice } */
export async function astralResist(message, choice = {}) {
  if (IN_FLIGHT.has(message.id)) return;
  IN_FLIGHT.add(message.id);
  try {
    const st = message.getFlag("sr2e", "astralResist");
    if (!st || isCardResolved(message, "astralResist")) return ui.notifications.warn("That damage has already been resisted.");
    const loser = await fromUuid(st.loserUuid).catch(() => null);
    const actor = loser?.documentName === "Actor" ? loser : loser?.actor;
    if (!actor) return ui.notifications.warn("That combatant no longer exists — the GM resolves it.");
    if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can resist for them.`);
    const prof = actorAstralProfile(actor) ?? { resistDice: actor.system.willpower?.value ?? 1, kind: null };
    const poolAvail = prof.kind === "magician" ? (actor.system.dicePools?.astral?.value ?? 0) : 0;
    const pool = Math.max(0, Math.min(choice.poolDice ?? 0, poolAvail));
    const res = await actor.rollSuccessTest(prof.resistDice, st.tn, {
      label: `Resist astral damage — ${st.resistLabel} (TN ${st.tn})`,
      poolDice: pool > 0 ? { astral: pool } : {},
      karmaDice: choice.karmaDice, isResistance: true
    });
    if (!res) return;
    const closes = [res.testMessageId];
    let outcome;
    const poolHits = successesFromSource(res.dice ?? [], "pool:astral");
    if (st.fullDefense && poolHits > st.strikerSuccesses) {
      outcome = `Clean miss — ${poolHits} Astral Pool success${poolHits === 1 ? "" : "es"} beat the attacker's ${st.strikerSuccesses} (Full Defense).`;
    } else {
      const idx = STAGES.indexOf(st.level) - netToSteps(res.successes ?? 0);
      if (idx < 0) outcome = "Damage fully resisted.";
      else {
        const boxes = [1, 3, 6, 10][idx];
        await actor.applyDamage(st.damageType, boxes);
        outcome = `${actor.name} takes ${STAGES[idx]} ${st.damageType} (${boxes} box${boxes === 1 ? "" : "es"}) — repercussion on the physical body.`;
      }
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-damage-result"><strong>${esc(outcome)}</strong></div>`,
      flags: { sr2e: { resolves: message.id, closesTests: closes } }
    });
    await closeTests(closes);
    if (message.isAuthor || game.user.isGM) {
      const next = { ...st, resolved: true, resolution: `<br><strong>Resolved:</strong> ${esc(outcome)}` };
      await message.update({ content: renderAstralResistCard(next), "flags.sr2e.astralResist": next });
    }
    return res;
  } finally { IN_FLIGHT.delete(message.id); }
}

// ── Dialogs ────────────────────────────────────────────────────────────────

/**
 * Options for an astral attack ("attack"), defence ("defend") or resistance
 * ("resist"). Returns the choice, or null when cancelled.
 */
export async function promptAstralOptions(actor, mode, context = {}) {
  const kind = astralKind(actor);
  const prof = kind ? actorAstralProfile(actor) : null;
  if (mode !== "resist" && !prof) {
    ui.notifications.warn(`${actor.name} is not in astral space (SR2E p.147).`);
    return null;
  }
  const foci = kind === "magician" ? astralFoci(actor) : [];
  const poolAvail = kind === "magician" ? (actor.system.dicePools?.astral?.value ?? 0) : 0;
  const skillSelect = mode === "resist" ? "" : `
    <div class="form-group"><label>Skill:</label>
      <select name="skillKey">${prof.options.map(o => `<option value="${o.key}">${esc(o.label)} (${o.dice})</option>`).join("")}</select></div>
    ${foci.length ? `<div class="form-group"><label>Weapon focus:</label>
      <select name="focusId"><option value="">— none (Unarmed / Sorcery) —</option>${foci.map(f =>
        `<option value="${f.id}">${esc(f.name)} (rating ${f.system.force})</option>`).join("")}</select></div>` : ""}`;
  const dmgSelect = mode === "resist" ? "" : `
    <div class="form-group"><label>${mode === "defend" ? "Counterstrike damage" : "Damage"}:</label>
      <select name="dt"><option value="physical">Physical</option><option value="stun">Stun</option></select></div>`;
  const pool = poolAvail > 0 ? `
    <div class="form-group"><label>Astral Pool <span style="color:#aaa1c0;font-size:10px;">(${poolAvail} left)</span>:</label>
      <input type="number" name="pool" value="0" min="0" max="${poolAvail}" style="width:52px;text-align:center;"></div>` : "";
  const fullDef = mode === "defend" && poolAvail > 0 ? `
    <label class="sr2e-attack__check" title="p.103 via p.147: no pool on this test, no counterstrike; the pool is saved for resistance, where pool successes alone beating the attacker's are a clean miss.">
      <input type="checkbox" name="fullDefense"> Full Defense</label>` : "";
  const other = mode === "resist" ? "" : `
    <div class="form-group"><label>Other Mod:</label>
      <input type="number" name="other" value="0" style="width:52px;text-align:center;"></div>`;
  let out = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: mode === "attack" ? "Astral Attack" : mode === "defend" ? "Defend (Astral)" : "Resist Astral Damage" },
    rejectClose: false,
    content: `<div>${skillSelect}${dmgSelect}${pool}${fullDef}${other}
      <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">${mode === "resist"
        ? `${esc(context.resistLabel ?? "Astral Body")} vs TN ${context.tn ?? "?"}; every 2 successes stage the damage down (SR2E p.147).`
        : "TN 4, opposed like melee (SR2E p.147); damage echoes onto the physical body."}</p></div>`,
    buttons: [
      { action: "go", label: mode === "resist" ? "Resist" : mode === "defend" ? "Defend" : "Attack", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          out = {
            skillKey: f.skillKey?.value, focusId: f.focusId?.value ?? "",
            damageType: f.dt?.value === "stun" ? "stun" : "physical",
            poolDice: Math.max(0, Math.min(poolAvail, parseInt(f.pool?.value) || 0)),
            fullDefense: !!f.fullDefense?.checked,
            otherMod: parseInt(f.other?.value) || 0
          };
        } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "go" ? out : null;
}
