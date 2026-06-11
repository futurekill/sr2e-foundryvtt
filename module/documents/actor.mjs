/**
 * Extended Actor document for the Shadowrun 2E system.
 */
import { SR2ESuccessRoll } from "../dice/sr2e-roll.mjs";

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
    // Apply wound penalty to target number (SR2E Injury Modifier, cumulative
    // across the physical and stun condition columns)
    const woundPenalty = this.system.woundPenalty ?? 0;
    const effectiveTN = targetNumber + woundPenalty;
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
    const tnNote = woundPenalty > 0
      ? `${effectiveTN} (base ${targetNumber} +${woundPenalty} wound)`
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
    const system = this.system;
    // SR2E Damage Modifiers Table (p.112): the wound Initiative Modifier is applied
    // to Reaction *before* Initiative dice are rolled — it reduces the base score,
    // not the number of dice.
    const reaction = system.reaction?.value ?? 0;
    const woundPenalty = system.woundPenalty ?? 0;
    const base = Math.max(0, reaction - woundPenalty);
    const dice = Math.max(1, system.initiative?.dice ?? 1);
    const f = `${base} + ${dice}d6`;
    return new Roll(f, this.getRollData());
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
    const system = this.system;
    // SR2E Damage Modifiers Table (p.112): wound Initiative Modifier reduces
    // Reaction (the base) before Initiative dice are rolled — NOT the dice count.
    const reaction = system.reaction?.value ?? 0;
    const woundPenalty = system.woundPenalty ?? 0;
    const base = Math.max(0, reaction - woundPenalty);
    const dice = Math.max(1, system.initiative?.dice ?? 1);

    const formula = `${base} + ${dice}d6`;
    const roll = new Roll(formula);
    await roll.evaluate();

    // Build readable notes for the chat message
    let baseNote;
    if (woundPenalty > 0) {
      baseNote = `Reaction: ${reaction} −${woundPenalty} wound = ${base}`;
    } else {
      baseNote = `Reaction: ${base}`;
    }
    const diceNote = `${dice}d6`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<h3>Initiative</h3><p>${baseNote} + ${diceNote}</p>`,
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
      <p style="margin:0 0 2px;font-size:11px;color:#a0a0a0;">Pool Dice (optional)</p>
      <div class="form-group" style="margin:3px 0;">
        <label style="font-size:12px;flex:1;">Combat Pool
          <span style="color:#888;font-size:10px;">(${combatAvail} left)</span>
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
              <td style="color:#888;padding:1px 0;">Incoming Damage:</td>
              <td style="text-align:right;padding:1px 0;font-weight:bold;">${power}${level}</td>
            </tr>
            ${options.ammoName ? `
            <tr>
              <td style="color:#888;padding:1px 0;">Ammunition:</td>
              <td style="text-align:right;padding:1px 0;">${foundry.utils.escapeHTML(options.ammoName)}</td>
            </tr>` : ""}
            <tr>
              <td style="color:#888;padding:1px 0;">${armorLabel} Armor:</td>
              <td style="text-align:right;padding:1px 0;">−${armor}</td>
            </tr>
            <tr>
              <td style="color:#888;padding:1px 0;">Body Dice:</td>
              <td style="text-align:right;padding:1px 0;">${bodyDice}</td>
            </tr>
            <tr style="border-top:1px solid rgba(255,255,255,0.15);">
              <td style="font-weight:bold;padding-top:3px;">Resistance TN:</td>
              <td style="text-align:right;font-weight:bold;padding-top:3px;">${tn}</td>
            </tr>
          </table>
          <p style="margin:4px 0 0;font-size:10px;color:#888;">
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
      poolDice: rollResult.poolDice
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

  /**
   * Apply damage to the condition monitor.
   * @param {string} type - "physical" or "stun"
   * @param {number} amount - Number of boxes to fill
   */
  async applyDamage(type = "physical", amount = 0) {
    if (amount <= 0) return;

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
