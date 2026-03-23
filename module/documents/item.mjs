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
      label: `${this.name} Attack`,
      poolDice: options.poolDice
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
   *
   * Spell Success Test (SR2E p.140):
   *   Roll Force dice + allocated Magic Pool dice vs. target number.
   *   Cap on Magic Pool dice = caster's Magic Attribute.
   *   Totem bonuses/penalties adjust the effective dice pool.
   *
   * Drain Resistance Test (SR2E p.140):
   *   Roll Willpower dice + allocated Magic Pool dice vs. TN = Force + drain modifier.
   *   Every 2 successes reduces Drain Level by 1.
   *   Drain type = Physical if Force > Magic Rating; Stun otherwise.
   *
   * @private
   */
  async _rollSpellcast(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    const force = this.system.force;
    const spellCategory = this.system.category; // combat, detection, health, illusion, manipulation
    const magicRating  = actor.system.magic?.value ?? 0;
    const targetNumber = options.targetNumber ?? 4;

    // ── Totem modifier ────────────────────────────────────────────────────────
    // Shamans receive bonus or penalty dice from their totem when casting
    // spells in particular categories (SR2E pp.119-124).
    let totemBonus   = 0;
    let totemPenalty = 0;
    if (actor.system.magic?.tradition === "shamanic" && actor.system.magic?.totem) {
      const totemData = CONFIG.SR2E.totems[actor.system.magic.totem];
      if (totemData) {
        totemBonus   = totemData.spellBonus?.[spellCategory]   ?? 0;
        totemPenalty = totemData.spellPenalty?.[spellCategory] ?? 0;
      }
    }

    // Base dice for the spell test = Force + totem net modifier.
    // Totem bonus/penalty dice are treated as part of the Magic Pool at the
    // moment of casting (SR2E p.119) and are free — not drawn from the pool.
    const totemNet  = totemBonus - totemPenalty;
    const spellDice = Math.max(1, force + totemNet);

    let totemNote = "";
    if (totemBonus   > 0) totemNote += ` +${totemBonus} totem`;
    if (totemPenalty > 0) totemNote += ` −${totemPenalty} totem`;

    // ── Spell Success Test ────────────────────────────────────────────────────
    const spellResult = await actor.rollSuccessTest(spellDice, targetNumber, {
      label: `Cast ${this.name} (Force ${force}${totemNote})`,
      poolDice: options.poolDice   // magic pool dice pre-allocated by player
    });

    // ── Drain Resistance Test ─────────────────────────────────────────────────
    const drain = this.system.parsedDrainCode;
    // TN = Force + drain modifier  (SR2E p.140 — NOT Force / 2)
    const drainTN        = Math.max(2, force + drain.modifier);
    // Physical drain if Force > Magic Rating (SR2E p.138)
    const drainType      = force > magicRating ? "physical" : "stun";
    const startLevel     = drain.level;   // L, M, S, or D
    const willpowerDice  = actor.system.willpower?.value ?? 1;

    const drainResult = await actor.rollSuccessTest(willpowerDice, drainTN, {
      label: `Drain Resist — ${startLevel} ${drainType} (TN ${drainTN})`,
      poolDice: options.drainPoolDice   // separately allocated magic pool dice
    });

    // ── Apply Drain Damage ────────────────────────────────────────────────────
    // Each 2 successes in the drain resist test reduces the damage level by 1.
    const stages      = ["L", "M", "S", "D"];
    const startIdx    = stages.indexOf(startLevel);
    const reductions  = Math.floor((drainResult?.successes ?? 0) / 2);
    const finalIdx    = startIdx - reductions;

    if (finalIdx >= 0) {
      const finalLevel = stages[finalIdx];
      // Minimum boxes per drain level: L=1, M=4, S=7, D=10
      const drainBoxes = [1, 4, 7, 10][finalIdx];
      await actor.applyDamage(drainType, drainBoxes);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-drain-result">
          <strong>Drain:</strong> ${finalLevel} ${drainType}
          <em>(${drainBoxes} box${drainBoxes !== 1 ? "es" : ""} applied)</em>
        </div>`
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-drain-result">
          <strong>Drain fully resisted — no damage taken.</strong>
        </div>`
      });
    }

    return spellResult;
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
      label: `${this.name} Test`,
      poolDice: options.poolDice
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
      label: `${this.name} (Rating ${rating})`,
      poolDice: options.poolDice
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
