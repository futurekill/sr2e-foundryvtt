/**
 * Extended Item document for the Shadowrun 2E system.
 */
export class SR2EItem extends Item {

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /**
   * Roll the item (context-dependent based on type).
   * @param {object} [options] - Roll options
   * @returns {Promise}
   */
  async roll(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    switch (this.type) {
      case "weapon":
        return this._rollWeaponAttack(options);
      case "spell":
        return this._rollSpellcast(options);
      case "skill":
        return this._rollSkillTest(options);
      case "program":
        return this._rollProgramAction(options);
      default:
        return this._displayItemCard();
    }
  }

  /**
   * Roll a weapon attack.
   * @private
   */
  async _rollWeaponAttack(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    // Find the relevant combat skill
    const skillName = this.system.skill;
    let skillRating = 0;
    for (const item of actor.items) {
      if (item.type === "skill" && item.name.toLowerCase().includes(skillName)) {
        skillRating = item.system.rating;
        break;
      }
    }

    // Default target number for ranged = 4 (short range)
    const targetNumber = options.targetNumber || 4;
    const dicePool = skillRating || 1;

    // Parse damage code
    const dmg = this.system.parsedDamageCode;

    const result = await actor.rollSuccessTest(dicePool, targetNumber, {
      label: `${this.name} Attack`
    });

    // Post damage info
    if (result.successes > 0) {
      // Stage up damage based on successes
      const stageUps = Math.floor(result.successes / 2);
      const stages = ["L", "M", "S", "D"];
      let baseLevelIndex = stages.indexOf(dmg.level);
      let finalLevelIndex = Math.min(baseLevelIndex + stageUps, 3);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-damage-result">
          <strong>${this.name} Damage:</strong> ${dmg.power}${stages[finalLevelIndex]}
          <br><em>Base: ${this.system.damageCode} | Staged up ${stageUps} level(s)</em>
        </div>`
      });
    }

    return result;
  }

  /**
   * Roll a spellcasting test.
   * @private
   */
  async _rollSpellcast(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    // Find Sorcery skill
    let sorceryRating = 0;
    for (const item of actor.items) {
      if (item.type === "skill" && item.name.toLowerCase() === "sorcery") {
        sorceryRating = item.system.rating;
        break;
      }
    }

    const force = this.system.force;
    const targetNumber = options.targetNumber || 4;

    // Spellcasting test: roll Force dice against TN
    const result = await actor.rollSuccessTest(force, targetNumber, {
      label: `Cast ${this.name} (Force ${force})`
    });

    // Drain resist test
    const drain = this.system.parsedDrainCode;
    const drainTN = this.system.drainTarget;
    const drainDice = actor.system.willpower?.value || 1;
    const drainType = force > actor.system.magic?.value ? "physical" : "stun";

    await actor.rollSuccessTest(drainDice, drainTN, {
      label: `Drain Resist (${drainType}) - TN ${drainTN}`
    });

    return result;
  }

  /**
   * Roll a skill test.
   * @private
   */
  async _rollSkillTest(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    const targetNumber = options.targetNumber || 4;
    return actor.rollSuccessTest(this.system.rating, targetNumber, {
      label: `${this.name} Test`
    });
  }

  /**
   * Roll a program action in the Matrix.
   * @private
   */
  async _rollProgramAction(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    const rating = this.system.rating;
    const targetNumber = options.targetNumber || 4;

    return actor.rollSuccessTest(rating, targetNumber, {
      label: `${this.name} (Rating ${rating})`
    });
  }

  /**
   * Display an item info card in chat.
   * @private
   */
  async _displayItemCard() {
    const content = `
      <div class="sr2e-item-card">
        <h3>${this.name}</h3>
        <p><strong>Type:</strong> ${this.type}</p>
        ${this.system.notes ? `<p>${this.system.notes}</p>` : ""}
      </div>
    `;

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.parent }),
      content
    });
  }
}
