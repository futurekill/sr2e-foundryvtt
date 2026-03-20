/**
 * Extended Actor document for the Shadowrun 2E system.
 */
import { SR2ESuccessRoll } from "../dice/sr2e-roll.mjs";

export class SR2EActor extends Actor {

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Apply cyberware attribute modifiers for characters
    if (this.type === "character") {
      this._applyCyberwareModifiers();
      this._recalculateEssence();
      this._recalculateInitiativeDice();
      this._recalculateHackingPool();
    }
  }

  /**
   * Apply attribute modifiers from installed cyberware.
   * @private
   */
  _applyCyberwareModifiers() {
    const system = this.system;
    // Reset cyberware mods (they get recalculated)
    let cyberMods = {
      body: 0, quickness: 0, strength: 0,
      charisma: 0, intelligence: 0, willpower: 0,
      reaction: 0, initiativeDice: 0
    };

    for (const item of this.items) {
      if (item.type === "cyberware" && item.system.installed) {
        const mods = item.system.attributeMods;
        for (const [key, val] of Object.entries(mods)) {
          if (cyberMods[key] !== undefined) {
            cyberMods[key] += val;
          }
        }
      }
    }

    // Apply to attributes
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      system[attr].mod = cyberMods[attr];
      system[attr].value = system[attr].base + system[attr].racial + system[attr].mod;
      if (system[attr].value < 1) system[attr].value = 1;
    }

    // Apply reaction mod
    system.reaction.mod = cyberMods.reaction;
    system.reaction.base = Math.floor((system.quickness.value + system.intelligence.value) / 2);
    system.reaction.value = system.reaction.base + system.reaction.mod;

    // Initiative base = Adjusted Reaction. Wound penalty reduces dice at roll time, not the base.
    system.initiative.base = system.reaction.value;
    system.initiative.value = system.reaction.value;
    system.initiative.dice = 1 + cyberMods.initiativeDice;

    // Recalculate combat pool max with cyberware-modified attributes.
    // The data model already preserved spent dice in value; just recompute max
    // and re-apply the same spent-preservation logic so cyberware boosts to
    // Quickness/Intelligence/Willpower are reflected correctly.
    const combatPool = Math.floor(
      (system.quickness.value + system.intelligence.value + system.willpower.value) / 2
    );
    const spent = system.dicePools.combat.max > 0
      ? Math.max(0, system.dicePools.combat.max - system.dicePools.combat.value)
      : 0;
    system.dicePools.combat.max   = combatPool;
    system.dicePools.combat.value = Math.max(0, combatPool - spent);

    // Movement
    system.movement.walk = system.quickness.value;
    system.movement.run = system.quickness.value * 3;

    // Armor
    this._recalculateArmor();
  }

  /**
   * Recalculate Essence from installed cyberware.
   * @private
   */
  _recalculateEssence() {
    if (this.type !== "character") return;
    const system = this.system;
    let totalEssenceLoss = 0;

    for (const item of this.items) {
      if (item.type === "cyberware" && item.system.installed) {
        totalEssenceLoss += item.system.actualEssenceCost;
      }
    }

    system.essence.value = Math.max(0, system.essence.max - totalEssenceLoss);

    // Magic is linked to Essence for magicians
    if (system.magic.type !== "none") {
      system.magic.max = Math.floor(system.essence.value);
      if (system.magic.value > system.magic.max) {
        system.magic.value = system.magic.max;
      }
    }
  }

  /**
   * Recalculate initiative dice from cyberware.
   * @private
   */
  _recalculateInitiativeDice() {
    if (this.type !== "character") return;
    const system = this.system;
    let extraDice = 0;

    for (const item of this.items) {
      if (item.type === "cyberware" && item.system.installed) {
        extraDice += item.system.attributeMods.initiativeDice || 0;
      }
    }

    system.initiative.dice = 1 + extraDice;
  }

  /**
   * Recalculate Hacking Pool from Computer skill and MPCP.
   * @private
   */
  _recalculateHackingPool() {
    if (this.type !== "character") return;
    const system = this.system;
    if (system.cyberdeck.mpcp <= 0) return;

    // Find computer skill
    let computerSkill = 0;
    for (const item of this.items) {
      if (item.type === "skill" && item.name.toLowerCase() === "computer") {
        computerSkill = item.system.rating;
        break;
      }
    }

    const hackingPool = Math.floor((computerSkill + system.cyberdeck.mpcp) / 3);
    system.dicePools.hacking.max = hackingPool;
    system.dicePools.hacking.value = hackingPool;
  }

  /**
   * Recalculate total armor from equipped items.
   * @private
   */
  _recalculateArmor() {
    const system = this.system;
    let ballistic = 0;
    let impact = 0;

    for (const item of this.items) {
      if (item.type === "armor" && item.system.equipped) {
        ballistic += item.system.ballistic || 0;
        impact += item.system.impact || 0;
      }
    }

    // Troll dermal armor
    if (system.race === "troll") {
      ballistic += 1;
      impact += 1;
    }

    system.armor.ballistic = ballistic;
    system.armor.impact = impact;
  }

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
    // Apply wound penalty to target number (SR2E rules: +1 TN per wound level)
    const woundPenalty = this.system.woundPenalty ?? 0;
    const effectiveTN = targetNumber + woundPenalty;
    const label = options.label || "Success Test";

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
    // Use Reaction directly as the base (the "Adjusted Reaction Rating")
    const base = system.reaction?.value ?? 0;
    const totalDice = Math.max(1, system.initiative?.dice ?? 1);
    const woundPenalty = system.woundPenalty ?? 0;
    // Wound penalty removes initiative dice (minimum 0 dice)
    const effectiveDice = Math.max(0, totalDice - woundPenalty);
    const f = effectiveDice > 0 ? `${base} + ${effectiveDice}d6` : `${base}`;
    return new Roll(f, this.getRollData());
  }

  /**
   * Initiative = Adjusted Reaction + Xd6 (where X = initiative dice minus wound penalty).
   * Per SR2E p.56: "add his adjusted Reaction to the result of his Initiative roll."
   *
   * Manually evaluates the roll and writes the result directly to the combatant record
   * so the value always appears correctly in the tracker, regardless of which Foundry
   * API path triggered the roll.
   * @returns {Promise<Roll>}
   */
  async rollInitiative() {
    const system = this.system;
    // Base = Adjusted Reaction (floor((Quickness + Intelligence) / 2) + cyberware mods)
    const base = system.reaction?.value ?? 0;
    const totalDice = Math.max(1, system.initiative?.dice ?? 1);
    const woundPenalty = system.woundPenalty ?? 0;
    // SR2E: wound penalty reduces initiative dice, not the base reaction
    const effectiveDice = Math.max(0, totalDice - woundPenalty);

    const formula = effectiveDice > 0 ? `${base} + ${effectiveDice}d6` : `${base}`;
    const roll = new Roll(formula);
    await roll.evaluate();

    // Build readable notes for the chat message
    let diceNote;
    if (effectiveDice <= 0) {
      diceNote = `0d6 (all dice removed by wounds)`;
    } else if (woundPenalty > 0) {
      diceNote = `${effectiveDice}d6 (${totalDice}d6 −${woundPenalty} wound)`;
    } else {
      diceNote = `${effectiveDice}d6`;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<h3>Initiative</h3><p>Reaction: ${base} + ${diceNote}</p>`,
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
