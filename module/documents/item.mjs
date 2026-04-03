import { parseDrainCode } from "../data/item-data.mjs";

/**
 * Extended Item document for the Shadowrun 2E system.
 */
export class SR2EItem extends Item {

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
   *
   * TN = Base(4) + range + cover + attackerRunning + targetRunning + inMelee
   *              + other + cyberware + woundPenalty + recoilPenalty
   * (SR2E p.100–110)
   *
   * Firing mode determines:
   *   - How many shots accumulate on the recoil counter (SS/SA: 1, BF: 3, FA: 10)
   *   - Power bonus applied to the damage code (BF: +2, FA: +4) per SR2E p.108
   *
   * @private
   */
  async _rollWeaponAttack(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    const RANGE_TN_MODS = { short: 0, medium: 2, long: 4, extreme: 6 };
    const FIRING_MODE_DATA = {
      ss: { shots: 1,  powerBonus: 0 },
      sa: { shots: 1,  powerBonus: 0 },
      bf: { shots: 3,  powerBonus: 2 },
      fa: { shots: 10, powerBonus: 4 }
    };
    const BASE_TN = 4;

    // Dice pool — linked skill rating
    const skillName = this.system.skill;
    let skillRating = 0;
    for (const item of actor.items) {
      if (item.type === "skill" && item.name.toLowerCase().includes(skillName)) {
        skillRating = item.system.rating;
        break;
      }
    }
    const dicePool = skillRating || 1;

    // Situational modifiers from the dialog
    const range        = options.range        ?? "short";
    const firingMode   = options.firingMode   ?? "sa";
    const coverMod     = options.coverMod     ?? 0;
    const attackerMod  = options.attackerMod  ?? 0;
    const targetMod    = options.targetMod    ?? 0;
    const meleeMod     = options.meleeMod     ?? 0;
    const otherMod     = options.otherMod     ?? 0;

    const rangeMod     = RANGE_TN_MODS[range] ?? 0;
    const rangeLabel   = range.charAt(0).toUpperCase() + range.slice(1);
    const modeData     = FIRING_MODE_DATA[firingMode] ?? FIRING_MODE_DATA.sa;

    // Auto-detected modifiers
    let cyberwareMod = 0;
    if (this.system.smartgunCompatible) {
      for (const item of actor.items) {
        if (item.type === "cyberware" && item.system.installed && item.system.combatTnMod !== 0) {
          cyberwareMod += item.system.combatTnMod;
        }
      }
    }

    const woundPenalty  = actor.system.woundPenalty ?? 0;
    const shotsFired    = actor.system.combatRecoil  ?? 0;
    const recoilComp    = this.system.recoilComp     ?? 0;
    const recoilPenalty = Math.max(0, shotsFired - recoilComp);

    const targetNumber = Math.max(2,
      BASE_TN + rangeMod + coverMod + attackerMod + targetMod + meleeMod + otherMod
              + cyberwareMod + woundPenalty + recoilPenalty
    );

    // Build a readable label for the chat card
    const modParts = [];
    if (rangeMod)    modParts.push(`${rangeLabel} range`);
    if (coverMod)    modParts.push(`cover +${coverMod}`);
    if (attackerMod) modParts.push(`running +${attackerMod}`);
    if (targetMod)   modParts.push(`target running +${targetMod}`);
    if (meleeMod)    modParts.push(`in melee +${meleeMod}`);
    if (otherMod)    modParts.push(`other ${otherMod > 0 ? "+" : ""}${otherMod}`);
    const modeLabel = firingMode.toUpperCase();
    const label = `${this.name} [${modeLabel}]${modParts.length ? " — " + modParts.join(", ") : ""} TN ${targetNumber}`;

    const result = await actor.rollSuccessTest(dicePool, targetNumber, {
      label,
      poolDice: options.poolDice
    });

    // Accumulate recoil — BF adds 3 shots, FA adds 10
    const hasRecoil = ["firearm", "heavy"].includes(this.system.weaponType);
    if (hasRecoil) {
      await actor.update({ "system.combatRecoil": shotsFired + modeData.shots });
    }

    // Post damage result if the attack connected
    if (result.successes > 0) {
      const dmg        = this.system.parsedDamageCode;
      // BF/FA increase effective power before staging (SR2E p.108)
      const effectivePower = dmg.power + modeData.powerBonus;
      const stageUps   = Math.floor(result.successes / 2);
      const stages     = ["L", "M", "S", "D"];
      const baseIdx    = stages.indexOf(dmg.level);
      const finalIdx   = Math.min(baseIdx + stageUps, 3);
      const powerNote  = modeData.powerBonus > 0
        ? ` <em>(base ${dmg.power} +${modeData.powerBonus} ${modeLabel} bonus)</em>`
        : "";

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-damage-result">
          <strong>${this.name} Damage:</strong> ${effectivePower}${stages[finalIdx]}${powerNote}
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
   *   Roll Willpower dice + allocated Magic Pool dice vs. TN = ⌊Force÷2⌋ + drain modifier.
   *   Every 2 successes reduces Drain Level by 1.
   *   Drain type = Physical if Force > Magic Rating; Stun otherwise.
   *
   * @private
   */
  async _rollSpellcast(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    // Force is provided by the cast dialog; fall back to the item's stored value
    const force = options.force ?? this.system.force;
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
    // Parse directly from the raw string field — avoids any DataModel prototype
    // chain issues that could silently return the fallback {modifier:0, level:"M"}.
    const drain = parseDrainCode(this.system.drainCode);
    // TN = ⌊Force÷2⌋ + drain modifier  (SR2E p.140)
    // e.g. Fireball "((F / 2) + 3)D" at Force 4 → TN = ⌊4÷2⌋+3 = 5, level D
    const drainTN        = Math.max(2, Math.floor(force / 2) + drain.modifier);
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
