/**
 * Extended Actor document for the Shadowrun 2E system.
 */
import { SR2ESuccessRoll } from "../dice/sr2e-roll.mjs";
import { evaluateDamageCode, renderMeleeAttackCard } from "./item.mjs";

/**
 * Render a success-test chat card from its persisted state.
 *
 * The state lives in the message's flags ("sr2e.test") so the Karma Pool
 * buttons can re-render the card after rerolls / bought successes:
 *   { actorUuid, tn, label, tnNote, diceNote, dice, rerolls,
 *     boughtSuccesses, glitchAvoided, criticalGlitch, hasKarma }
 *
 * Karma Pool actions (SR2E p.190–191):
 *   - Reroll failures: rerolls ALL failed dice; costs 1 Karma the first time,
 *     escalating +1 per repeat on the same test.
 *   - Avoid an "Oops": on all-1s, 1 Karma turns the disaster into a simple
 *     failure; no further Karma may be spent on the test.
 *   - Buy successes: 1 Karma per success, requires at least 1 natural
 *     success; these points are spent PERMANENTLY (they don't refresh).
 *
 * @param {object} state
 * @returns {string} HTML
 */
export function renderSuccessTestCard(state) {
  const natural   = state.dice.filter(d => d.success).length;
  const successes = natural + (state.boughtSuccesses ?? 0);
  const failures  = state.dice.length - natural;
  const glitch    = state.criticalGlitch && !state.glitchAvoided;

  let diceHtml = '<div class="sr2e-dice-results">';
  for (const die of state.dice) {
    const successClass  = die.success ? "success" : "failure";
    const explodedClass = die.exploded ? "exploded" : "";
    const rerolledClass = die.rerolled ? "rerolled" : "";
    const title = die.exploded ? die.rolls.join(" + ") : String(die.total);
    diceHtml += `<span class="sr2e-die ${successClass} ${explodedClass} ${rerolledClass}" title="${title}">${die.total}</span>`;
  }
  diceHtml += "</div>";

  const _l = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

  // Result banner
  let banner = "";
  if (glitch)                   banner = `<span class="sr2e-critical-glitch">${_l("SR2E.Chat.CriticalGlitch")}</span>`;
  else if (state.glitchAvoided) banner = `<span class="sr2e-failure">${_l("SR2E.Chat.DisasterAverted")}</span>`;
  else if (successes === 0)     banner = `<span class="sr2e-failure">${_l("SR2E.Chat.Failure")}</span>`;

  const boughtNote = state.boughtSuccesses > 0
    ? ` <em class="sr2e-karma-note">${_l("SR2E.Chat.BoughtSuccesses", { count: state.boughtSuccesses })}</em>` : "";
  const rerollNote = state.rerolls > 0
    ? ` <em class="sr2e-karma-note">${_l("SR2E.Chat.KarmaRerolls", { count: state.rerolls })}</em>` : "";

  // Karma Pool action buttons. After an avoided glitch the test is closed.
  const buttons = [];
  if (state.hasKarma && !state.glitchAvoided) {
    if (glitch) {
      buttons.push(`<button type="button" class="sr2e-karma-btn" data-karma-action="avoidGlitch"
        title="SR2E p.190: pay 1 Karma Pool to turn an all-1s disaster into a simple failure. No reroll allowed.">
        ${_l("SR2E.Chat.AvoidDisaster")}</button>`);
    } else {
      if (failures > 0) {
        const cost = (state.rerolls ?? 0) + 1;
        buttons.push(`<button type="button" class="sr2e-karma-btn" data-karma-action="reroll"
          title="SR2E p.190: reroll all ${failures} failed dice. Cost escalates by 1 each reroll on the same test.">
          ${_l("SR2E.Chat.RerollFailures", { cost })}</button>`);
      }
      if (natural >= 1) {
        buttons.push(`<button type="button" class="sr2e-karma-btn" data-karma-action="buySuccess"
          title="SR2E p.190: buy a raw success for 1 Karma. Requires a natural success. This Karma is spent PERMANENTLY.">
          ${_l("SR2E.Chat.BuySuccess")}</button>`);
      }
    }
  }
  const buttonHtml = buttons.length
    ? `<div class="sr2e-karma-actions">${buttons.join(" ")}</div>` : "";

  return `
    <div class="sr2e-roll-message">
      <h3 class="sr2e-roll-header">${state.label}</h3>
      <div class="sr2e-roll-info">
        <span class="sr2e-roll-pool">${_l("SR2E.Chat.Dice")}: ${state.diceNote}</span>
        <span class="sr2e-roll-tn">${_l("SR2E.Chat.TN")}: ${state.tnNote}</span>
      </div>
      ${diceHtml}
      <div class="sr2e-roll-result">
        <strong>${_l("SR2E.Chat.Successes")}: ${successes}</strong>${boughtNote}${rerollNote}
        ${banner}
      </div>
      ${buttonHtml}
    </div>`;
}

export class SR2EActor extends Actor {

  // All derived-data computation (cyberware/adept modifiers, essence, pools,
  // armor, initiative dice) lives in the TypeDataModels in module/data/ —
  // embedded items are fully prepared before the models' prepareDerivedData
  // runs, so no Document-level post-processing is needed.

  // -------------------------------------------------------------------------
  // ROLLING METHODS
  // -------------------------------------------------------------------------

  /**
   * Roll a Success Test (SR2E core mechanic).
   * Rolls a number of d6s and counts successes against a target number.
   * @param {number} dicePool - Number of d6s to roll
   * @param {number} targetNumber - Target number to meet or exceed
   * @param {object} [options] - Additional options
   * @param {string} [options.label] - Label for the chat message
   * @param {object} [options.poolDice] - Dice drawn from dice pools ({combat: 2, ...})
   * @param {number} [options.karmaDice] - Extra dice bought with Karma Pool
   *   (SR2E p.190: 1 Karma each, max = base dice in use, pool dice excluded)
   * @returns {Promise<object>} The test result
   */
  async rollSuccessTest(dicePool, targetNumber, options = {}) {
    // Apply wound penalty (SR2E Injury Modifier, cumulative across the
    // physical and stun columns) and the sustained-spell penalty
    // (+2 per spell sustained by concentration, SR2E p.130).
    //
    // The Injury Modifier does NOT apply to damage- or drain-resistance tests
    // (SR2E p.112: "except those involving attempts to resist damage or avoid
    // damage"). Resistance callers pass options.isResistance to suppress it.
    // The sustain penalty is not granted that exemption, so it still applies.
    const woundPenalty = options.isResistance ? 0 : (this.system.woundPenalty ?? 0);
    const sustainPenalty = this.system.sustainPenalty ?? 0;
    const effectiveTN = targetNumber + woundPenalty + sustainPenalty;
    const label = foundry.utils.escapeHTML(options.label || "Success Test");

    // --- Pool dice ---
    const poolDice = options.poolDice || {};
    const poolsUsed = [];   // { key, label, amount }
    let poolDiceTotal = 0;

    const poolLabels = {
      combat: "Combat Pool", magic: "Magic Pool", hacking: "Hacking Pool",
      control: "Control Pool"
    };

    for (const [key, requested] of Object.entries(poolDice)) {
      if (!requested || requested <= 0) continue;
      const available = this.system.dicePools?.[key]?.value ?? 0;
      const amount = Math.min(requested, available);
      if (amount > 0) {
        poolsUsed.push({ key, label: poolLabels[key] || key, amount });
        poolDiceTotal += amount;
      }
    }

    // --- Karma dice (Buy Additional Dice, SR2E p.190) ---
    // 1 Karma Pool point per extra die; capped at the base dice in use
    // (pool dice excluded) and at the available Karma Pool.
    const karmaAvail = this.system.karma?.pool ?? 0;
    const karmaDice  = Math.max(0, Math.min(options.karmaDice ?? 0, karmaAvail, dicePool));

    // Roll base + pool + karma dice together (respects Rule of Six)
    const totalDice = dicePool + poolDiceTotal + karmaDice;
    const testResult = await SR2ESuccessRoll.successTest(totalDice, effectiveTN);
    const successes = testResult.successes;

    // Build chat notes
    const tnParts = [];
    if (woundPenalty > 0)   tnParts.push(`+${woundPenalty} wound`);
    if (sustainPenalty > 0) tnParts.push(`+${sustainPenalty} sustaining`);
    const tnNote = tnParts.length
      ? `${effectiveTN} (base ${targetNumber} ${tnParts.join(", ")})`
      : `${effectiveTN}`;

    let diceNote = `${dicePool}`;
    if (poolDiceTotal > 0 || karmaDice > 0) {
      const parts = poolsUsed.map(p => `+${p.amount} ${p.label}`);
      if (karmaDice > 0) parts.push(`+${karmaDice} Karma`);
      diceNote = `${dicePool} ${parts.join(", ")} = ${totalDice} total`;
    }

    // Card state — persisted in message flags so the Karma Pool buttons can
    // reroll failures / buy successes and re-render the card in place.
    const state = {
      actorUuid: this.uuid,
      tn: effectiveTN,
      label,
      tnNote,
      diceNote,
      dice: testResult.dice,
      rerolls: 0,
      boughtSuccesses: 0,
      glitchAvoided: false,
      criticalGlitch: testResult.isCriticalGlitch,
      hasKarma: this.system.karma?.pool != null
    };

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      // Attach the evaluated Roll objects so message.isRoll is true and
      // Dice So Nice can animate the dice.
      rolls: testResult.rolls,
      sound: CONFIG.sounds.dice,
      content: renderSuccessTestCard(state),
      flags: { sr2e: { test: state } }
    });

    // --- Reduce pools / karma that were used ---
    // Persist both `value` (remaining) and `max` (computed ceiling) so that
    // _calculateDicePools() can recover the spent count on the next prepare.
    const updates = {};
    for (const { key, amount } of poolsUsed) {
      const pool = this.system.dicePools?.[key] ?? { value: 0, max: 0 };
      updates[`system.dicePools.${key}.value`] = Math.max(0, pool.value - amount);
      updates[`system.dicePools.${key}.max`]   = pool.max;
    }
    if (karmaDice > 0) updates["system.karma.pool"] = karmaAvail - karmaDice;
    if (Object.keys(updates).length > 0) await this.update(updates);

    return { ...testResult, successes, targetNumber: effectiveTN };
  }

  /**
   * Apply a Karma Pool action to a previously-rolled success test card.
   * Invoked from the chat-card buttons (see renderChatMessageHTML in sr2e.mjs).
   *
   * @param {ChatMessage} message - The chat message holding the test state.
   * @param {string} action - "reroll", "avoidGlitch", or "buySuccess".
   */
  async applyKarmaToTest(message, action) {
    const state = foundry.utils.deepClone(message.getFlag("sr2e", "test"));
    if (!state) return;
    const karmaAvail = this.system.karma?.pool ?? 0;
    let newRolls = null;

    if (action === "reroll") {
      // Reroll ALL failed dice; cost escalates by 1 per repeat (SR2E p.190)
      if (state.criticalGlitch && !state.glitchAvoided) return;
      const failedIdx = state.dice.map((d, i) => d.success ? -1 : i).filter(i => i >= 0);
      if (failedIdx.length === 0) return;
      const cost = (state.rerolls ?? 0) + 1;
      if (karmaAvail < cost) {
        return ui.notifications.warn(`Rerolling failures costs ${cost} Karma Pool — only ${karmaAvail} available.`);
      }
      const reroll = await SR2ESuccessRoll.successTest(failedIdx.length, state.tn);
      failedIdx.forEach((dieIdx, j) => {
        state.dice[dieIdx] = { ...reroll.dice[j], rerolled: true };
      });
      state.rerolls = (state.rerolls ?? 0) + 1;
      newRolls = reroll.rolls;
      await this.update({ "system.karma.pool": karmaAvail - cost });

    } else if (action === "avoidGlitch") {
      // All-1s disaster → simple failure for 1 Karma; no further Karma allowed
      if (!state.criticalGlitch || state.glitchAvoided) return;
      if (karmaAvail < 1) return ui.notifications.warn("No Karma Pool available.");
      state.glitchAvoided = true;
      await this.update({ "system.karma.pool": karmaAvail - 1 });

    } else if (action === "buySuccess") {
      // 1 Karma per raw success; requires a natural success; PERMANENT spend.
      // The pool value drops and does not come back on refresh — the GM/player
      // should not restore these points when refreshing the pool per encounter.
      const natural = state.dice.filter(d => d.success).length;
      if (natural < 1) {
        return ui.notifications.warn("Buying successes requires at least 1 natural success (SR2E p.190).");
      }
      if (karmaAvail < 1) return ui.notifications.warn("No Karma Pool available.");
      state.boughtSuccesses = (state.boughtSuccesses ?? 0) + 1;
      await this.update({ "system.karma.pool": karmaAvail - 1 });

    } else {
      return;
    }

    const updateData = {
      content: renderSuccessTestCard(state),
      "flags.sr2e.test": state
    };
    if (newRolls) {
      updateData.rolls = [...message.rolls, ...newRolls].map(r => JSON.stringify(r));
    }
    await message.update(updateData);
  }

  /**
   * Roll Initiative for this actor.
   * Build the initiative Roll for Foundry's Combat tracker.
   * Called by Combat.rollInitiative() — must return a Roll object.
   * Per SR2E rules: Initiative = Adjusted Reaction + Initiative Dice roll.
   * Wound penalties reduce the number of initiative dice (not the base score).
   * @override
   */
  getInitiativeRoll(formula) {
    const { base, dice } = this._getInitiativeParts();
    return new Roll(`${base} + ${dice}d6`, this.getRollData());
  }

  /**
   * Compute the SR2E initiative base and dice for this actor.
   *
   * Normal: Adjusted Reaction + Initiative dice; the wound Initiative
   * Modifier reduces Reaction before rolling (Damage Modifiers Table, p.112).
   *
   * Rigging (p.85, p.106): while jacked in via VCR, ONLY the rig's bonuses
   * apply — Reaction = natural Reaction + 2/level, dice = 1 + 1/level; other
   * Reaction/Initiative enhancers (wired reflexes etc.) do not. Injury
   * modifiers still apply, and the worst controlled vehicle's damage
   * Initiative modifier reduces the total.
   * @returns {{base: number, dice: number, rigged: boolean, notes: string[]}}
   * @private
   */
  _getInitiativeParts() {
    const system = this.system;
    const woundPenalty = system.woundPenalty ?? 0;
    const notes = [];

    // While rigging, the derived Reaction/initiative dice already reflect
    // VCR-only bonuses (CharacterData.prepareDerivedData); the roll adds the
    // worst controlled vehicle's damage Initiative modifier (p.106).
    const vcr = system.vehicleControlRig ?? 0;
    const rigged = !!(system.rigging && vcr > 0);
    const reaction = system.reaction?.value ?? 0;

    let vehicleMod = 0;
    if (rigged) {
      for (const uuid of system.linkedVehicles ?? []) {
        const v = globalThis.fromUuidSync?.(uuid);
        const mod = v?.system?.damageInitMod ?? 0;
        if (mod < vehicleMod) vehicleMod = mod;
      }
    }

    const base = Math.max(0, reaction - woundPenalty + vehicleMod);
    notes.push(rigged ? `Rigged (VCR ${vcr}): Reaction ${reaction}` : `Reaction ${reaction}`);
    if (woundPenalty) notes.push(`−${woundPenalty} wound`);
    if (vehicleMod)   notes.push(`${vehicleMod} vehicle damage`);
    return { base, dice: Math.max(1, system.initiative?.dice ?? 1), rigged, notes };
  }

  /**
   * Roll SR2E initiative from the sheet: Adjusted Reaction + Xd6.
   * Per SR2E p.56: "add his adjusted Reaction to the result of his Initiative roll."
   *
   * NOTE: deliberately NOT named rollInitiative — that would shadow core
   * Actor#rollInitiative(options), which the token HUD and combat tracker call
   * with {createCombatants, ...} and whose behaviour must be preserved. Tracker
   * rolls already use the SR2E formula via SR2ECombatant#getInitiativeRoll.
   *
   * Manually evaluates the roll and writes the result directly to the combatant
   * record so the value always appears correctly in the tracker.
   * @returns {Promise<Roll>}
   */
  async rollSR2Initiative() {
    const { base, dice, rigged, notes } = this._getInitiativeParts();

    const formula = `${base} + ${dice}d6`;
    const roll = new Roll(formula);
    await roll.evaluate();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<h3>Initiative${rigged ? " — Rigged" : ""}</h3><p>${notes.join(", ")} + ${dice}d6</p>`,
      rolls: [roll]
    });

    // Write the result directly to the combatant so the tracker always shows
    // the correct total, regardless of how Foundry V13 handles getInitiativeRoll.
    const combatant = game.combat?.getCombatantByActor?.(this)
                   ?? game.combat?.combatants?.find(c => c.actorId === this.id);
    if (combatant) {
      await combatant.update({ initiative: roll.total });
    }

    return roll;
  }

  /**
   * Roll an Attribute Test.
   * @param {string} attribute - The attribute key to test
   * @param {number} targetNumber - Target number
   * @returns {Promise}
   */
  async rollAttributeTest(attribute, targetNumber = 4, options = {}) {
    const attrValue = this.system[attribute]?.value || 0;
    const label = game.i18n.localize(CONFIG.SR2E.attributes[attribute]) || attribute;
    return this.rollSuccessTest(attrValue, targetNumber, {
      label: `${label} Test`,
      poolDice: options.poolDice,
      karmaDice: options.karmaDice
    });
  }

  /**
   * Roll a Skill Test.
   * @param {string} skillId - The item ID of the skill
   * @param {number} targetNumber - Target number
   * @param {object} [options]
   * @returns {Promise}
   */
  async rollSkillTest(skillId, targetNumber = 4, options = {}) {
    const skill = this.items.get(skillId);
    if (!skill || skill.type !== "skill") return;

    let dicePool = skill.system.rating;
    let label = `${skill.name} Test`;

    // Untrained: default to the skill's linked Attribute via the Skill Web
    // (SR2E p.69) — attribute dice at +CONFIG.SR2E.defaultingPenalty TN.
    if (dicePool <= 0) {
      const attrKey = skill.system.linkedAttribute || "quickness";
      const attrValue = attrKey === "reaction"
        ? (this.system.reaction?.value ?? 1)
        : (this.system[attrKey]?.value ?? 1);
      dicePool = Math.max(1, attrValue);
      targetNumber += CONFIG.SR2E.defaultingPenalty;
      const attrLabel = attrKey.charAt(0).toUpperCase() + attrKey.slice(1);
      label = `${skill.name} Test — defaulting to ${attrLabel} +${CONFIG.SR2E.defaultingPenalty} TN`;
    }

    return this.rollSuccessTest(dicePool, targetNumber, {
      label,
      poolDice: options.poolDice,
      karmaDice: options.karmaDice
    });
  }

  /**
   * Summon a spirit (SR2E p.138–140).
   *
   * Conjuring Test: Conjuring Skill + totem conjuring bonus + spirit foci dice
   *   vs TN = the spirit's Force. The Magic Pool does NOT assist conjuring
   *   tests. Net successes = the number of Services the spirit will perform.
   *
   * Drain Resistance Test: CHARISMA dice (not Willpower) vs TN = Force, drain
   *   level from the Conjuring Drain Table (Stun until Force exceeds Charisma,
   *   then Physical). Every 2 successes reduces the drain one level.
   *
   * On a successful summon a Spirit actor is created (Force-derived stats) and
   * linked to the conjurer via system.boundSpirits.
   *
   * @param {object} opts
   * @param {number} opts.force        - Force of the spirit (= test TN).
   * @param {string} opts.kind         - "nature" or "elemental".
   * @param {string} opts.domain       - Nature domain or elemental element key.
   * @param {number} [opts.fociDice=0] - Extra dice from a bonded spirit focus.
   * @param {number} [opts.karmaDice=0]
   */
  async rollConjuring(opts) {
    const force    = Math.max(1, opts.force ?? 1);
    const kind     = opts.kind ?? "nature";
    const domain   = opts.domain ?? "";
    const fociDice = Math.max(0, opts.fociDice ?? 0);
    const charisma = this.system.charisma?.value ?? 1;

    // Conjuring skill rating (defaults to 0 — no test possible untrained here)
    let conjuring = 0;
    for (const item of this.items) {
      if (item.type === "skill" && item.name.toLowerCase() === "conjuring") {
        conjuring = item.system.rating; break;
      }
    }

    // Totem conjuring bonus (shamans) for the chosen domain
    let totemBonus = 0;
    if (this.system.magic?.tradition === "shamanic" && this.system.magic?.totem) {
      const totem = CONFIG.SR2E.totems[this.system.magic.totem];
      totemBonus = totem?.conjuringBonus?.[domain] ?? 0;
    }

    const conjuringDice = conjuring + totemBonus + fociDice;
    if (conjuringDice <= 0) {
      return ui.notifications.warn("No Conjuring skill — a magician needs the Conjuring skill to summon spirits.");
    }

    const totemNote = totemBonus > 0 ? ` +${totemBonus} totem` : "";
    const fociNote  = fociDice   > 0 ? ` +${fociDice} focus`   : "";

    // ── Conjuring Test (no Magic Pool) ────────────────────────────────────────
    const conjureResult = await this.rollSuccessTest(conjuringDice, force, {
      label: `Conjure ${kind === "elemental" ? "Elemental" : "Nature Spirit"} ` +
             `(Force ${force}, ${domain}${totemNote}${fociNote})`,
      karmaDice: opts.karmaDice
    });
    const services = conjureResult?.successes ?? 0;

    // ── Conjuring Drain (Charisma, p.139) ─────────────────────────────────────
    const drain = CONFIG.SR2E.conjuringDrain(force, charisma);
    const drainResult = await this.rollSuccessTest(charisma + fociDice, force, {
      label: `Conjuring Drain — ${drain.level} ${drain.type} (TN ${force})`,
      isResistance: true
    });
    const stages     = ["L", "M", "S", "D"];
    const reductions = Math.floor((drainResult?.successes ?? 0) / 2);
    const finalIdx   = stages.indexOf(drain.level) - reductions;
    if (finalIdx >= 0) {
      const boxes = [1, 3, 6, 10][finalIdx];
      await this.applyDamage(drain.type, boxes);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-drain-result"><strong>Conjuring Drain:</strong>
          ${stages[finalIdx]} ${drain.type} <em>(${boxes} box${boxes === 1 ? "" : "es"})</em></div>`
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-drain-result"><strong>Conjuring Drain fully resisted.</strong></div>`
      });
    }

    // ── Result: no successes = no spirit ──────────────────────────────────────
    if (services <= 0) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-damage-result"><strong>No spirit answers the call</strong>
          <em>(no successes on the Conjuring Test).</em></div>`
      });
      return conjureResult;
    }

    // ── Create and link the Spirit actor ──────────────────────────────────────
    const domainLabel = kind === "elemental"
      ? game.i18n.localize(CONFIG.SR2E.elementalTypes[domain]?.label ?? domain)
      : game.i18n.localize(CONFIG.SR2E.spiritDomains[domain] ?? domain);
    const name = kind === "elemental"
      ? `${domainLabel} Elemental (F${force})`
      : `${domainLabel} Spirit (F${force})`;

    let spirit = null;
    try {
      [spirit] = await Actor.createDocuments([{
        name, type: "spirit",
        img: kind === "elemental" ? "icons/svg/fire.svg" : "icons/svg/oak.svg",
        system: {
          spiritType: kind, force, domain, services, maxServices: services,
          conjurerUuid: this.uuid
        }
      }]);
    } catch (err) {
      console.error("SR2E | Could not create spirit actor:", err);
    }

    if (spirit) {
      const bound = this.system.boundSpirits ?? [];
      await this.update({ "system.boundSpirits": [...bound, spirit.uuid] });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sr2e-damage-result">
        <strong>${foundry.utils.escapeHTML(name)} summoned</strong> —
        <strong>${services} service${services === 1 ? "" : "s"}</strong>.
        <br><em>Conjuring successes: ${services} (TN ${force}).${
          kind === "nature" ? " Nature spirits vanish at the next sunrise or sunset." : ""}</em>
      </div>`
    });

    return conjureResult;
  }

  /**
   * Defend against a melee attack card (SR2E p.100–101, the Defender's Test).
   *
   * Opens a dialog to choose the defending weapon (or Unarmed, (Str)M Stun),
   * reach/situational modifiers, Combat Pool and karma dice, then rolls the
   * defender's Combat Skill vs TN 4 + modifiers and resolves the outcome:
   * most successes hits the other combatant (ties favour the attacker), and
   * the winner stages their weapon's damage up one level per 2 net successes.
   *
   * @param {ChatMessage} message - The melee attack card.
   */
  async rollMeleeDefense(message) {
    const state = message.getFlag("sr2e", "melee");
    if (!state || state.resolved) return;
    if (this.uuid === state.attackerUuid) {
      return ui.notifications.warn("The attacker cannot defend against their own attack.");
    }

    // ── Defending weapon choices ──────────────────────────────────────────────
    const meleeWeapons = this.items.filter(
      i => i.type === "weapon" && ["melee", "throwing"].includes(i.system.weaponType)
    );
    const weaponOptions = [
      `<option value="">Unarmed — (Str)M Stun</option>`,
      ...meleeWeapons.map(w =>
        `<option value="${w.id}">${foundry.utils.escapeHTML(w.name)} — ${foundry.utils.escapeHTML(w.system.damageCode)}</option>`)
    ].join("");

    const combatAvail = this.system.dicePools?.combat?.value ?? 0;
    const karmaAvail  = this.system.karma?.pool ?? 0;

    let choice = null;
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: `Defend: ${state.attackerName}'s ${state.weaponName} (${state.successes} successes)` },
      rejectClose: false,
      content: `<form>
        <div class="form-group" style="margin:2px 0;">
          <label>Defend with:</label>
          <select name="weapon">${weaponOptions}</select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
          <div class="form-group" style="margin:2px 0;">
            <label>Reach Mod:</label>
            <input type="number" name="reachMod" value="0" style="width:52px;text-align:center;"
                   title="Your weapon longer: −1/point. Shorter: +1/point. (SR2E p.101)">
          </div>
          <div class="form-group" style="margin:2px 0;">
            <label>Other Mod:</label>
            <input type="number" name="otherMod" value="0" style="width:52px;text-align:center;"
                   title="Friends in melee −1 each (max −4), foe's friends +1 each, superior position −1, visibility, etc.">
          </div>
        </div>
        ${combatAvail > 0 ? `
        <div class="form-group" style="margin:3px 0;">
          <label style="font-size:12px;">Combat Pool
            <span style="color:#aaa1c0;font-size:10px;">(${combatAvail} left)</span>
          </label>
          <input type="number" name="pool_combat" value="0" min="0" max="${combatAvail}"
                 style="width:52px;text-align:center;">
        </div>` : ""}
        ${karmaAvail > 0 ? `
        <div class="form-group" style="margin:3px 0;">
          <label style="font-size:12px;">Karma dice
            <span style="color:#aaa1c0;font-size:10px;">(1 Karma each — pool: ${karmaAvail})</span>
          </label>
          <input type="number" name="karma_dice" value="0" min="0" max="${karmaAvail}"
                 style="width:52px;text-align:center;">
        </div>` : ""}
        <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
          Base TN 4 + modifiers. Most successes hits — if you out-roll the
          attacker, YOU strike THEM (SR2E p.100).</p>
      </form>`,
      buttons: [
        {
          action: "roll", label: "SR2E.Dialog.Roll", default: true,
          callback: (event, button) => {
            const f = button.form.elements;
            choice = {
              weaponId:  f.weapon?.value || null,
              reachMod:  parseInt(f.reachMod?.value) || 0,
              otherMod:  parseInt(f.otherMod?.value) || 0,
              poolDice:  Math.max(0, Math.min(parseInt(f.pool_combat?.value) || 0, combatAvail)),
              karmaDice: Math.max(0, parseInt(f.karma_dice?.value) || 0)
            };
          }
        },
        { action: "cancel", label: "SR2E.Dialog.Cancel" }
      ]
    });
    if (action !== "roll" || !choice) return;

    // ── Defender's skill and dice ─────────────────────────────────────────────
    const weapon = choice.weaponId ? this.items.get(choice.weaponId) : null;
    const skillKey = weapon
      ? (weapon.system.weaponType === "throwing" ? "throwing_weapons" : "armed_combat")
      : "unarmed_combat";
    const normalize = s => s.toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const skillItem = this.items.find(i => i.type === "skill" && normalize(i.name) === skillKey);
    const rating = skillItem?.system?.rating ?? 0;

    let dice = rating;
    let defaultingPenalty = 0;
    let defaultingNote = "";
    if (rating <= 0) {
      const attrKey = CONFIG.SR2E.activeSkills[skillKey]?.attribute ?? "strength";
      dice = Math.max(1, this.system[attrKey]?.value ?? 1);
      defaultingPenalty = CONFIG.SR2E.defaultingPenalty;
      defaultingNote = `, defaulting +${defaultingPenalty}`;
    }

    const tn = Math.max(2, 4 + choice.reachMod + choice.otherMod + defaultingPenalty);
    const defWeaponName = weapon ? weapon.name : "Unarmed";

    const defense = await this.rollSuccessTest(dice, tn, {
      label: `Defend vs ${state.attackerName} — ${defWeaponName}${defaultingNote} TN ${tn}`,
      poolDice: choice.poolDice > 0 ? { combat: choice.poolDice } : {},
      karmaDice: choice.karmaDice
    });

    // ── Compare and resolve (ties favour the attacker) ───────────────────────
    const atk = state.successes;
    const def = defense?.successes ?? 0;

    if (def > atk) {
      // Defender wins and strikes back with THEIR weapon
      const code = weapon ? weapon.system.damageCode : "(Str)M";
      const dmg = evaluateDamageCode(code, this);
      const damageType = weapon ? (weapon.system.damageType || "physical") : "stun";
      await this._resolveMeleeHit(message, state, {
        winnerName: this.name, loserName: state.attackerName,
        weaponName: defWeaponName, net: def - atk,
        power: Math.max(1, dmg.power), level: dmg.level, damageType,
        riposte: true
      });
    } else {
      await this._resolveMeleeHit(message, state, {
        winnerName: state.attackerName, loserName: this.name,
        weaponName: state.weaponName, net: atk - def,
        power: state.power, level: state.level, damageType: state.damageType,
        riposte: false
      });
    }
  }

  /**
   * Post the melee outcome: staged damage + Resist button for the loser,
   * and mark the attack card resolved (when this client may update it).
   * @private
   */
  async _resolveMeleeHit(message, state, o) {
    const esc = foundry.utils.escapeHTML;
    const stages = ["L", "M", "S", "D"];
    const stageUps = Math.floor(o.net / 2);
    const finalIdx = Math.min(stages.indexOf(o.level) + stageUps, 3);
    const finalLevel = stages[finalIdx];

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sr2e-damage-result">
        <strong>${esc(o.winnerName)} hits ${esc(o.loserName)}</strong>
        ${o.riposte ? "<em>(counterstrike!)</em>" : ""}
        with ${esc(o.weaponName)}: ${o.power}${finalLevel}${o.damageType === "stun" ? " Stun" : ""}
        <br><em>${o.net} net success${o.net === 1 ? "" : "es"} — staged up ${stageUps} level${stageUps === 1 ? "" : "s"}</em>
        <br>
        <button class="sr2e-resist-btn"
                data-power="${o.power}"
                data-base-power="${o.power}"
                data-level="${finalLevel}"
                data-armor-type="impact"
                data-damage-type="${o.damageType}"
                data-armor-calc="standard"
                data-armor-mod="0"
                data-ammo-name=""
                title="${esc(o.loserName)} rolls Body vs. TN = Power − Impact Armor (SR2E p.100)">
          ${game.i18n.localize("SR2E.Chat.ResistDamage")}
        </button>
      </div>`
    });

    // Mark the attack card resolved where permissions allow (author or GM)
    if (message.isAuthor || game.user.isGM) {
      const newState = foundry.utils.mergeObject(foundry.utils.deepClone(state), {
        resolved: true,
        resolution: `<br><strong>Resolved:</strong> ${esc(o.winnerName)} hit ${esc(o.loserName)} (${o.power}${finalLevel}).`
      });
      await message.update({
        content: renderMeleeAttackCard(newState),
        "flags.sr2e.melee": newState
      });
    }
  }

  /**
   * Roll a vehicle test for a vehicle this character is driving (SR2E p.105–107).
   *
   *   TN = vehicle Handling + terrain modifier (per test type) − 2 × VCR
   *      + vehicle damage TN modifier + situational modifier
   *   Dice = driver's driving skill (or Reaction at +4 TN when defaulting)
   *
   * On a FAILED Crash Test the vehicle crashes: Power = effective cruising
   * speed ÷ 10 (round down), Damage Level from the Impact Table, resisted
   * with Body + ½ armor vs Power − full armor, no Control Pool (p.107).
   *
   * @param {Actor}  vehicle - The vehicle actor being driven.
   * @param {object} [options]
   * @param {string} [options.testType="handling"] - "handling", "position", or "crash".
   * @param {string} [options.terrain="normal"]    - open / normal / restricted / tight.
   * @param {number} [options.otherMod=0]          - Situational TN modifier.
   * @param {object} [options.poolDice]            - Control Pool allocation.
   * @param {number} [options.karmaDice]           - Karma-bought dice.
   */
  async rollVehicleTest(vehicle, options = {}) {
    const testType = options.testType ?? "handling";
    const terrain  = options.terrain  ?? "normal";
    const otherMod = options.otherMod ?? 0;

    // Driver's driving skill — defaults to Reaction (+4 TN) when untrained
    const skillKey  = vehicle.system.drivingSkill;
    const normalize = s => s.toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const skillItem = this.items.find(i => i.type === "skill" && normalize(i.name) === skillKey);
    const rating    = skillItem?.system?.rating ?? 0;

    let dice = rating;
    let defaultingPenalty = 0;
    let defaultingNote = "";
    if (rating <= 0) {
      dice = Math.max(1, this.system.reaction?.value ?? 1);
      defaultingPenalty = CONFIG.SR2E.defaultingPenalty;
      defaultingNote = `, defaulting to Reaction +${defaultingPenalty}`;
    }

    const terrainMod = CONFIG.SR2E.vehicleTerrainMods[testType]?.[terrain] ?? 0;
    const vcrMod     = -2 * (this.system.vehicleControlRig ?? 0);   // p.183 example: −2 per rig level
    const damageMod  = vehicle.system.damageTnMod ?? 0;

    const tn = Math.max(2,
      vehicle.system.handling + terrainMod + vcrMod + damageMod + otherMod + defaultingPenalty
    );

    const typeLabel = { handling: "Handling Test", position: "Position Test", crash: "Crash Test" }[testType] ?? "Vehicle Test";
    const label = `${vehicle.name} — ${typeLabel} [${terrain}${defaultingNote}] TN ${tn}`;

    const result = await this.rollSuccessTest(dice, tn, {
      label,
      poolDice: options.poolDice,
      karmaDice: options.karmaDice
    });

    // Failed Crash Test → the vehicle crashes (p.107)
    if (testType === "crash" && (result?.successes ?? 0) === 0) {
      await this._resolveVehicleCrash(vehicle);
    }
    return result;
  }

  /**
   * Resolve a vehicle crash (SR2E p.107).
   * Power = effective cruising speed ÷ 10 (round down); Damage Level from the
   * Impact Table. The vehicle resists with Body + ½ armor (round down) dice
   * against TN = Power − full armor. Control Pool dice may NOT assist.
   * Passengers face the reduced Damage Code at the same Power, resisted as
   * melee damage (Impact armor, no Combat Pool) — left to the GM/players.
   * @param {Actor} vehicle
   * @private
   */
  async _resolveVehicleCrash(vehicle) {
    const speed = vehicle.system.effectiveSpeed ?? vehicle.system.speed ?? 0;
    const power = Math.max(1, Math.floor(speed / 10));
    const level = CONFIG.SR2E.crashDamageLevel(speed);
    const armor = vehicle.system.armor ?? 0;
    const body  = vehicle.system.body ?? 1;

    const dice = body + Math.floor(armor / 2);
    const tn   = Math.max(2, power - armor);

    const resist = await vehicle.rollSuccessTest(dice, tn, {
      label: `${vehicle.name} — Crash! Resist ${power}${level} (Body + ½ Armor, no Control Pool)`,
      isResistance: true
    });

    const stages     = ["L", "M", "S", "D"];
    const reductions = Math.floor((resist?.successes ?? 0) / 2);
    const finalIdx   = stages.indexOf(level) - reductions;

    if (finalIdx < 0) {
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: vehicle }),
        content: `<div class="sr2e-damage-result">
          <strong>Crash damage fully resisted.</strong>
          <em>The vehicle stops for the rest of the Combat Turn (SR2E p.107).</em>
        </div>`
      });
    }

    const finalLevel = stages[finalIdx];
    const boxes      = [1, 3, 6, 10][finalIdx];
    await vehicle.applyDamage("physical", boxes);

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: vehicle }),
      content: `<div class="sr2e-damage-result">
        <strong>Crash: ${finalLevel} damage (${boxes} box${boxes === 1 ? "" : "es"})</strong> —
        now ${vehicle.system.damageLevel}.
        <br><em>Passengers face a ${power}${finalLevel} attack, resisted as melee damage
        (Impact armor only, no Combat Pool — SR2E p.107). The vehicle stops for the
        rest of the Combat Turn.</em>
      </div>`
    });
  }

  /**
   * Damage Resistance Test for vehicles hit by weapons (SR2E p.108).
   *
   *   Unarmored: Body acts as composite armor (reduces Power); resist with
   *     Body dice vs TN = Power − Body.
   *   Armored: armor acts as a Barrier Rating — if the weapon's BASE Power
   *     (unmodified by burst/full-auto) does not exceed it, no penetration.
   *     Resist with Body + ½ armor dice vs TN = Power − (Body + Armor).
   *
   *   A weapon's Damage Level is reduced one step against vehicles (D→S→M→L;
   *   Light cannot affect vehicles). Vehicles are immune to Stun damage.
   *   The controlling rigger may allocate Control Pool dice.
   *
   * @param {number} power     - Effective attack Power (incl. burst/ammo bonuses).
   * @param {string} level     - Damage Level of the attack.
   * @param {object} [options]
   * @param {number} [options.basePower] - Power unmodified by burst (penetration check).
   * @param {string} [options.damageType="physical"]
   */
  async rollVehicleDamageResistance(power, level, options = {}) {
    const system    = this.system;
    const body      = system.body ?? 1;
    const armor     = system.armor ?? 0;
    const basePower = options.basePower ?? power;

    if ((options.damageType ?? "physical") === "stun") {
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-damage-result"><strong>No effect:</strong>
          vehicles are unaffected by Stun damage.</div>`
      });
    }

    // Damage Level reduced one step vs vehicles; Light cannot harm them (p.108)
    const stages   = ["L", "M", "S", "D"];
    const startIdx = stages.indexOf(level) - 1;
    if (startIdx < 0) {
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-damage-result"><strong>No effect:</strong>
          Light damage cannot affect vehicles (SR2E p.108).</div>`
      });
    }

    // Armored vehicles: armor is a Barrier Rating vs the BASE Power (p.108)
    if (armor > 0 && basePower <= armor) {
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-damage-result"><strong>No penetration:</strong>
          base Power ${basePower} does not exceed vehicle armor ${armor} (SR2E p.108).</div>`
      });
    }

    const dice = armor > 0 ? body + Math.floor(armor / 2) : body;
    const tn   = Math.max(2, power - (body + armor));
    const startLevel = stages[startIdx];

    // Controlling rigger may add Control Pool dice — drawn from the user's
    // character when this vehicle is linked to them.
    let rigger = null;
    const candidate = game.user?.character;
    if (candidate?.system?.linkedVehicles?.includes(this.uuid) &&
        (candidate.system.dicePools?.control?.value ?? 0) > 0) {
      rigger = candidate;
    }
    const controlAvail = rigger?.system.dicePools.control.value ?? 0;

    const poolHTML = controlAvail > 0 ? `
      <hr style="margin:8px 0 6px;">
      <div class="form-group" style="margin:3px 0;">
        <label style="font-size:12px;flex:1;">Control Pool (${rigger.name})
          <span style="color:#aaa1c0;font-size:10px;">(${controlAvail} left)</span>
        </label>
        <input type="number" name="pool_control" value="0" min="0" max="${controlAvail}"
               style="width:52px;text-align:center;">
      </div>` : "";

    let allocated = 0;
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("SR2E.Dialog.ResistTitle", { level: startLevel, power }) },
      rejectClose: false,
      content: `<form>
        <div style="font-size:11px;background:rgba(0,0,0,0.15);border-radius:4px;padding:6px 8px;margin-bottom:6px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#aaa1c0;">Incoming (vs vehicle):</td>
                <td style="text-align:right;font-weight:bold;">${power}${startLevel}</td></tr>
            <tr><td style="color:#aaa1c0;">Body${armor > 0 ? " + ½ Armor" : ""} dice:</td>
                <td style="text-align:right;">${dice}</td></tr>
            <tr><td style="color:#aaa1c0;">Power − (Body${armor > 0 ? " + Armor" : ""}):</td>
                <td style="text-align:right;font-weight:bold;">TN ${tn}</td></tr>
          </table>
          <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
            Damage Level already reduced one step vs vehicles (SR2E p.108).</p>
        </div>
        ${poolHTML}
      </form>`,
      buttons: [
        {
          action: "roll", label: "SR2E.Dialog.Resist", default: true,
          callback: (event, button) => {
            const raw = parseInt(button.form.elements.pool_control?.value) || 0;
            allocated = Math.min(Math.max(0, raw), controlAvail);
          }
        },
        { action: "cancel", label: "SR2E.Dialog.Cancel" }
      ]
    });
    if (action !== "roll") return;

    if (allocated > 0 && rigger) {
      await rigger.update({
        "system.dicePools.control.value": controlAvail - allocated
      });
    }

    const resist = await this.rollSuccessTest(dice + allocated, tn, {
      label: `${this.name} — Resist ${power}${startLevel}${allocated ? ` (+${allocated} Control Pool)` : ""}`,
      isResistance: true
    });

    const reductions = Math.floor((resist?.successes ?? 0) / 2);
    const finalIdx   = startIdx - reductions;
    if (finalIdx < 0) {
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-damage-result"><strong>Damage fully resisted.</strong></div>`
      });
    }

    const boxes = [1, 3, 6, 10][finalIdx];
    await this.applyDamage("physical", boxes);
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sr2e-damage-result">
        <strong>Vehicle takes ${stages[finalIdx]} damage (${boxes} box${boxes === 1 ? "" : "es"})</strong>
        — now ${this.system.damageLevel}.
      </div>`
    });
  }

  /**
   * Roll a Damage Resistance Test.
   *
   * Defender rolls Body dice (+ optional Combat Pool) vs.
   *   TN = max(2, attackPower − armor)  (SR2E p.116)
   *
   * Every 2 successes stages the incoming damage level down by 1:
   *   D → S → M → L → (no damage)
   *
   * Boxes applied per level (SR2E p.113): L=1, M=3, S=6, D=10.
   *
   * @param {number} power      - The incoming damage Power value.
   * @param {string} level      - The incoming damage Level: "L", "M", "S", or "D".
   * @param {string} armorType  - Which armor applies: "ballistic" or "impact".
   * @param {string} damageType - Which condition monitor takes the damage: "physical" or "stun".
   * @param {object} [options]  - Ammunition effects (SR2E p.93–94).
   * @param {string} [options.armorCalc="standard"] - "standard", "half_ballistic"
   *   (APDS), "impact" (gel), or "flechette" (max(2×Impact, Ballistic); +1 Damage
   *   Level when unarmored).
   * @param {number} [options.armorMod=0] - Flat adjustment to the armor rating.
   * @param {string} [options.ammoName]   - Loaded ammo name, for display.
   */
  async rollDamageResistance(power, level, armorType = "ballistic", damageType = "physical",
                             options = {}) {
    // Vehicles resolve weapon damage with their own hard-target rules (p.108)
    if (this.type === "vehicle") {
      return this.rollVehicleDamageResistance(power, level, {
        basePower: options.basePower, damageType
      });
    }
    const system    = this.system;
    const armorCalc = options.armorCalc || "standard";
    const armorMod  = options.armorMod ?? 0;
    const ballistic = system.armor?.ballistic ?? 0;
    const impact    = system.armor?.impact ?? 0;

    // Armor rating per the loaded ammunition's rules
    let armor;
    let armorLabel;
    switch (armorCalc) {
      case "half_ballistic":   // APDS (SSC p.63): halve Ballistic armor
        armor = Math.floor(ballistic / 2);
        armorLabel = "½ Ballistic";
        break;
      case "impact":           // Gel rounds: Impact, not Ballistic, applies
        armor = impact;
        armorLabel = "Impact";
        break;
      case "flechette":        // Flechette: max(2 × Impact, Ballistic)
        armor = Math.max(2 * impact, ballistic);
        armorLabel = "max(2×Impact, Ballistic)";
        break;
      default:
        armor = system.armor?.[armorType] ?? 0;
        armorLabel = armorType === "ballistic" ? "Ballistic" : "Impact";
    }
    armor = Math.max(0, armor + armorMod);

    const stages   = ["L", "M", "S", "D"];
    let startIdx = stages.indexOf(level);
    if (startIdx < 0) {
      console.warn("SR2E | rollDamageResistance: invalid damage level", level);
      return;
    }

    // Flechette vs unarmored target: +1 Damage Level (SR2E p.93)
    let flechetteNote = "";
    if (armorCalc === "flechette" && armor === 0 && startIdx < 3) {
      startIdx += 1;
      level = stages[startIdx];
      flechetteNote = `<p style="margin:4px 0 0;font-size:10px;color:#c84;">
        Flechette vs unarmored: Damage Level raised to ${level} (SR2E p.93).</p>`;
    }

    // Troll Dermal Armor is "+1 Body" (SR2E Racial Modifications Table) —
    // an extra Body die for resisting damage, not an armor rating bonus.
    const dermalBonus = system.race === "troll" ? 1 : 0;
    const bodyDice   = (system.body?.value ?? 1) + dermalBonus;
    const tn         = Math.max(2, power - armor);

    // ── Build dialog ──────────────────────────────────────────────────────────
    const combatAvail = system.dicePools?.combat?.value ?? 0;
    const poolHTML    = combatAvail > 0 ? `
      <hr style="margin:8px 0 6px;">
      <p style="margin:0 0 2px;font-size:11px;color:#b3a9cc;">Pool Dice (optional)</p>
      <div class="form-group" style="margin:3px 0;">
        <label style="font-size:12px;flex:1;">Combat Pool
          <span style="color:#aaa1c0;font-size:10px;">(${combatAvail} left)</span>
        </label>
        <input type="number" name="pool_combat" value="0" min="0" max="${combatAvail}"
               style="width:52px;text-align:center;">
      </div>
    ` : "";

    let rollResult = null;
    const action   = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("SR2E.Dialog.ResistTitle", { level, power }) },
      rejectClose: false,
      content: `<form>
        <div style="font-size:11px;background:rgba(0,0,0,0.15);border-radius:4px;
                    padding:6px 8px;margin-bottom:6px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#aaa1c0;padding:1px 0;">Incoming Damage:</td>
              <td style="text-align:right;padding:1px 0;font-weight:bold;">${power}${level}</td>
            </tr>
            ${options.ammoName ? `
            <tr>
              <td style="color:#aaa1c0;padding:1px 0;">Ammunition:</td>
              <td style="text-align:right;padding:1px 0;">${foundry.utils.escapeHTML(options.ammoName)}</td>
            </tr>` : ""}
            <tr>
              <td style="color:#aaa1c0;padding:1px 0;">${armorLabel} Armor:</td>
              <td style="text-align:right;padding:1px 0;">−${armor}</td>
            </tr>
            <tr>
              <td style="color:#aaa1c0;padding:1px 0;">Body Dice:</td>
              <td style="text-align:right;padding:1px 0;">${bodyDice}</td>
            </tr>
            <tr style="border-top:1px solid rgba(255,255,255,0.15);">
              <td style="font-weight:bold;padding-top:3px;">Resistance TN:</td>
              <td style="text-align:right;font-weight:bold;padding-top:3px;">${tn}</td>
            </tr>
          </table>
          <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
            Every 2 successes stages damage down 1 level (SR2E p.116).
          </p>
          ${flechetteNote}
        </div>
        ${poolHTML}
      </form>`,
      buttons: [
        {
          action: "roll",
          label: "SR2E.Dialog.Resist",
          default: true,
          callback: (event, button) => {
            const raw = parseInt(button.form.elements.pool_combat?.value) || 0;
            rollResult = {
              poolDice: { combat: Math.min(Math.max(0, raw), combatAvail) }
            };
          }
        },
        { action: "cancel", label: "SR2E.Dialog.Cancel" }
      ]
    });

    if (action !== "roll" || !rollResult) return;

    // ── Roll ──────────────────────────────────────────────────────────────────
    const resistResult = await this.rollSuccessTest(bodyDice, tn, {
      label: `Resist Damage: ${level} (Power ${power})`,
      poolDice: rollResult.poolDice,
      isResistance: true   // Injury Modifier does not apply to resistance (p.112)
    });

    // Stage damage down: 2 successes = 1 level reduction
    const reductions = Math.floor((resistResult?.successes ?? 0) / 2);
    const finalIdx   = startIdx - reductions;

    if (finalIdx < 0) {
      // All damage resisted
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="sr2e-damage-result">
          <strong>Damage fully resisted — no damage taken.</strong>
        </div>`
      });
      return resistResult;
    }

    // Apply remaining damage
    const finalLevel  = stages[finalIdx];
    const damageBoxes = [1, 3, 6, 10][finalIdx];   // L=1, M=3, S=6, D=10 (SR2E p.113)
    await this.applyDamage(damageType, damageBoxes);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sr2e-damage-result">
        <strong>Damage Taken: ${finalLevel} ${damageType}</strong>
        <em>(${damageBoxes} box${damageBoxes !== 1 ? "es" : ""} applied to ${damageType} monitor)</em>
      </div>`
    });

    return resistResult;
  }

  // -------------------------------------------------------------------------
  // SPIRIT METHODS (SR2E p.138–140, 228)
  // -------------------------------------------------------------------------

  /**
   * Spend one of this spirit's services to use a power. Decrements the
   * service counter and posts a descriptive card. Most spirit powers resolve
   * narratively; the system tracks the expenditure.
   * @param {string} powerKey - Key into CONFIG.SR2E.spiritPowers.
   */
  async useSpiritPower(powerKey) {
    if (this.type !== "spirit") return;
    const services = this.system.services ?? 0;
    if (services <= 0) {
      return ui.notifications.warn(`${this.name} has no services remaining.`);
    }
    const label = game.i18n.localize(CONFIG.SR2E.spiritPowers[powerKey] ?? powerKey);
    await this.update({ "system.services": services - 1 });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sr2e-item-card">
        <strong>${foundry.utils.escapeHTML(this.name)}</strong> uses
        <strong>${foundry.utils.escapeHTML(label)}</strong>
        <em>(1 service spent — ${services - 1} remaining)</em>
      </div>`
    });
  }

  /**
   * Roll a spirit's manifest attack (Unarmed, Force dice; SR2E Critters p.228).
   * Nature spirits deal (Force)M, elementals (Force)S. Posts a Resist Damage
   * button (Impact armor) for the defender.
   */
  async rollSpiritAttack() {
    if (this.type !== "spirit") return;
    const force = this.system.force ?? 1;
    const level = this.system.spiritType === "elemental" ? "S" : "M";

    const result = await this.rollSuccessTest(force, 4, {
      label: `${this.name} — Manifest Attack (Force ${force})`
    });
    if ((result?.successes ?? 0) <= 0) return result;

    const stages   = ["L", "M", "S", "D"];
    const stageUps = Math.floor(result.successes / 2);
    const finalIdx = Math.min(stages.indexOf(level) + stageUps, 3);
    const safeName = foundry.utils.escapeHTML(this.name);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sr2e-damage-result">
        <strong>${safeName} Attack:</strong> ${force}${stages[finalIdx]}
        <br><em>Base ${force}${level} | staged up ${stageUps} level(s)</em>
        <br>
        <button class="sr2e-resist-btn"
                data-power="${force}" data-base-power="${force}"
                data-level="${stages[finalIdx]}" data-armor-type="impact"
                data-damage-type="physical" data-armor-calc="standard"
                data-armor-mod="0" data-ammo-name="">
          ${game.i18n.localize("SR2E.Chat.ResistDamage")}
        </button>
      </div>`
    });
    return result;
  }

  /**
   * Apply damage to the condition monitor.
   * @param {string} type - "physical" or "stun"
   * @param {number} amount - Number of boxes to fill
   */
  async applyDamage(type = "physical", amount = 0) {
    if (amount <= 0) return;

    // Vehicles and IC use a single flat condition monitor
    if (this.type === "vehicle" || this.type === "ic") {
      const cm = this.system.conditionMonitor;
      const newValue = Math.min(cm.value + amount, cm.max);
      return this.update({ "system.conditionMonitor.value": newValue });
    }

    const monitor = this.system.conditionMonitor[type];
    const newValue = Math.min(monitor.value + amount, monitor.max);

    const updatePath = `system.conditionMonitor.${type}.value`;
    await this.update({ [updatePath]: newValue });

    // Check for overflow (physical damage exceeds max)
    if (type === "physical" && newValue >= monitor.max) {
      const overflow = (monitor.value + amount) - monitor.max;
      if (overflow > 0) {
        await this.update({ "system.conditionMonitor.overflow": this.system.conditionMonitor.overflow + overflow });
      }
    }

    // Stun overflow converts to physical
    if (type === "stun" && newValue >= monitor.max) {
      const overflow = (monitor.value + amount) - monitor.max;
      if (overflow > 0) {
        await this.applyDamage("physical", overflow);
        await this.update({ [`system.conditionMonitor.stun.value`]: monitor.max });
      }
    }
  }
}
