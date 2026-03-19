/**
 * Extended Actor document for the Shadowrun 2E system.
 */
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

    // Update initiative (wound penalty reduces score per SR2E rules)
    system.initiative.base = system.reaction.value;
    system.initiative.value = system.reaction.value + system.initiative.mod - (system.woundPenalty || 0);
    system.initiative.dice = 1 + cyberMods.initiativeDice;

    // Recalculate dice pools
    const combatPool = Math.floor(
      (system.quickness.value + system.intelligence.value + system.willpower.value) / 2
    );
    system.dicePools.combat.max = combatPool;
    system.dicePools.combat.value = Math.min(system.dicePools.combat.value, combatPool);

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
      control: "Control Pool", karma: "Karma Pool"
    };

    for (const [key, requested] of Object.entries(poolDice)) {
      if (!requested || requested <= 0) continue;
      const available = key === "karma"
        ? (this.system.karma?.pool ?? 0)
        : (this.system.dicePools?.[key]?.value ?? 0);
      const amount = Math.min(requested, available);
      if (amount > 0) {
        poolsUsed.push({ key, label: poolLabels[key] || key, amount });
        poolDiceTotal += amount;
      }
    }

    // Roll base + pool dice together
    const totalDice = dicePool + poolDiceTotal;
    const formula = `${totalDice}d6cs>=${effectiveTN}`;
    const roll = new Roll(formula);
    await roll.evaluate();

    // Count successes
    const successes = roll.terms[0].results.filter(r => r.result >= effectiveTN && !r.discarded).length;

    // Build chat notes
    const tnNote = woundPenalty > 0
      ? `${effectiveTN} (base ${targetNumber} +${woundPenalty} wound)`
      : `${effectiveTN}`;

    let diceNote = `${dicePool}`;
    if (poolDiceTotal > 0) {
      const poolParts = poolsUsed.map(p => `+${p.amount} ${p.label}`).join(", ");
      diceNote = `${dicePool} ${poolParts} = ${totalDice} total`;
    }

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<h3>${label}</h3><p>TN: ${tnNote} | Dice: ${diceNote} | Successes: ${successes}</p>`,
      rolls: [roll]
    };
    await ChatMessage.create(messageData);

    // --- Reduce pools that were used ---
    if (poolsUsed.length > 0) {
      const updates = {};
      for (const { key, amount } of poolsUsed) {
        if (key === "karma") {
          updates["system.karma.pool"] = Math.max(0, (this.system.karma?.pool ?? 0) - amount);
        } else {
          const cur = this.system.dicePools?.[key]?.value ?? 0;
          updates[`system.dicePools.${key}.value`] = Math.max(0, cur - amount);
        }
      }
      await this.update(updates);
    }

    return { roll, successes, targetNumber: effectiveTN };
  }

  /**
   * Roll Initiative for this actor.
   * Initiative = Reaction + Xd6 (where X depends on initiative dice from cyberware/magic)
   * @returns {Promise}
   */
  async rollInitiative() {
    const system = this.system;
    // initiative.value already has wound penalty applied from prepareDerivedData
    const base = system.initiative?.value || system.initiative?.base || 1;
    const dice = system.initiative?.dice || 1;
    const woundPenalty = system.woundPenalty ?? 0;

    const formula = `${base} + ${dice}d6`;
    const roll = new Roll(formula);
    await roll.evaluate();

    // Show wound penalty breakdown if wounded
    const baseNote = woundPenalty > 0
      ? `${base} (−${woundPenalty} wound)`
      : `${base}`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<h3>Initiative</h3><p>Base: ${baseNote} + ${dice}d6</p>`,
      rolls: [roll]
    });

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
