/**
 * Extended Actor document for the Shadowrun 2E system.
 */
import { SR2ESuccessRoll } from "../dice/sr2e-roll.mjs";

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
   * @param {boolean} [options.useKarma] - Whether karma pool can be used
   * @returns {Promise<Roll>}
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

    // Roll base + pool dice together using SR2ESuccessRoll (respects Rule of Six)
    const totalDice = dicePool + poolDiceTotal;
    const testResult = await SR2ESuccessRoll.successTest(totalDice, effectiveTN);
    const successes = testResult.successes;

    // Build chat notes
    const tnNote = woundPenalty > 0
      ? `${effectiveTN} (base ${targetNumber} +${woundPenalty} wound)`
      : `${effectiveTN}`;

    let diceNote = `${dicePool}`;
    if (poolDiceTotal > 0) {
      const poolParts = poolsUsed.map(p => `+${p.amount} ${p.label}`).join(", ");
      diceNote = `${dicePool} ${poolParts} = ${totalDice} total`;
    }

    // Build per-die display HTML
    let diceHtml = '<div class="sr2e-dice-results">';
    for (const die of testResult.dice) {
      const successClass = die.success ? "success" : "failure";
      const explodedClass = die.exploded ? "exploded" : "";
      const title = die.exploded ? die.rolls.join(" + ") : String(die.total);
      diceHtml += `<span class="sr2e-die ${successClass} ${explodedClass}" title="${title}">${die.total}</span>`;
    }
    diceHtml += "</div>";

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      // Attach the evaluated Roll objects so message.isRoll is true and
      // Dice So Nice can animate the dice.
      rolls: testResult.rolls,
      sound: CONFIG.sounds.dice,
      content: `
        <div class="sr2e-roll-message">
          <h3 class="sr2e-roll-header">${label}</h3>
          <div class="sr2e-roll-info">
            <span class="sr2e-roll-pool">Dice: ${diceNote}</span>
            <span class="sr2e-roll-tn">TN: ${tnNote}</span>
          </div>
          ${diceHtml}
          <div class="sr2e-roll-result">
            <strong>Successes: ${successes}</strong>
            ${testResult.isCriticalGlitch ? '<span class="sr2e-critical-glitch">CRITICAL GLITCH!</span>' : ""}
            ${!testResult.isSuccess && !testResult.isCriticalGlitch ? '<span class="sr2e-failure">FAILURE</span>' : ""}
          </div>
        </div>`
    };
    await ChatMessage.create(messageData);

    // --- Reduce pools that were used ---
    // Persist both `value` (remaining) and `max` (computed ceiling) so that
    // _calculateDicePools() can recover the spent count on the next prepare.
    if (poolsUsed.length > 0) {
      const updates = {};
      for (const { key, amount } of poolsUsed) {
        const pool = this.system.dicePools?.[key] ?? { value: 0, max: 0 };
        updates[`system.dicePools.${key}.value`] = Math.max(0, pool.value - amount);
        updates[`system.dicePools.${key}.max`]   = pool.max;
      }
      await this.update(updates);
    }

    return { ...testResult, successes, targetNumber: effectiveTN };
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
      poolDice: options.poolDice
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

    const dicePool = skill.system.rating;
    return this.rollSuccessTest(dicePool, targetNumber, {
      label: `${skill.name} Test`,
      poolDice: options.poolDice
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
   */
  async rollDamageResistance(power, level, armorType = "ballistic", damageType = "physical") {
    const system     = this.system;
    const armor      = system.armor?.[armorType] ?? 0;
    // Troll Dermal Armor is "+1 Body" (SR2E Racial Modifications Table) —
    // an extra Body die for resisting damage, not an armor rating bonus.
    const dermalBonus = system.race === "troll" ? 1 : 0;
    const bodyDice   = (system.body?.value ?? 1) + dermalBonus;
    const tn         = Math.max(2, power - armor);
    const armorLabel = armorType === "ballistic" ? "Ballistic" : "Impact";

    const stages   = ["L", "M", "S", "D"];
    const startIdx = stages.indexOf(level);
    if (startIdx < 0) {
      console.warn("SR2E | rollDamageResistance: invalid damage level", level);
      return;
    }

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
      window: { title: `Resist Damage: ${level} (Power ${power})` },
      rejectClose: false,
      content: `<form>
        <div style="font-size:11px;background:rgba(0,0,0,0.15);border-radius:4px;
                    padding:6px 8px;margin-bottom:6px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#888;padding:1px 0;">Incoming Damage:</td>
              <td style="text-align:right;padding:1px 0;font-weight:bold;">${power}${level}</td>
            </tr>
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
        </div>
        ${poolHTML}
      </form>`,
      buttons: [
        {
          action: "roll",
          label: "Resist",
          default: true,
          callback: (event, button) => {
            const raw = parseInt(button.form.elements.pool_combat?.value) || 0;
            rollResult = {
              poolDice: { combat: Math.min(Math.max(0, raw), combatAvail) }
            };
          }
        },
        { action: "cancel", label: "Cancel" }
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
