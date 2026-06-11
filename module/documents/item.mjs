import { parseDrainCode } from "../data/item-data.mjs";

// ---------------------------------------------------------------------------
// DAMAGE CODE EVALUATION
// ---------------------------------------------------------------------------

/**
 * Evaluate a SR2E damage code string, resolving attribute-based formulas
 * using the supplied actor's derived stats.
 *
 * Supported formats
 *   "9M"       — plain numeric  (power 9, level M)
 *   "(Str+3)S" — formula        (power = actor.strength.value + 3, level S)
 *   "(Body)L"  — formula        (power = actor.body.value, level L)
 *
 * Attribute keywords (case-insensitive):
 *   Str / Strength, Bod / Body, Qui / Quickness,
 *   Int / Intelligence, Wil / Willpower,
 *   Cha / Charisma,   Rea / Reaction
 *
 * @param {string}     code  - Raw damage code from the weapon item.
 * @param {Actor|null} actor - Attacking actor (required for formula codes).
 * @returns {{ power: number, level: string }}
 */
function evaluateDamageCode(code, actor = null) {
  if (!code) return { power: 0, level: "M" };

  // 1. Plain numeric code — "9M", "6S", "4D"
  const simpleMatch = code.match(/^(\d+)(L|M|S|D)$/i);
  if (simpleMatch) {
    return { power: parseInt(simpleMatch[1]), level: simpleMatch[2].toUpperCase() };
  }

  // 2. Formula code — "(Str+3)S", "(Body)L"
  const formulaMatch = code.match(/^\(([^)]+)\)(L|M|S|D)$/i);
  if (formulaMatch && actor?.system) {
    const expr  = formulaMatch[1];
    const level = formulaMatch[2].toUpperCase();
    const sys   = actor.system;

    // Longest keys first so "strength" isn't shadowed by "str"
    const ATTR_MAP = {
      strength:     sys.strength?.value     ?? 0,
      intelligence: sys.intelligence?.value ?? 0,
      quickness:    sys.quickness?.value    ?? 0,
      willpower:    sys.willpower?.value    ?? 0,
      charisma:     sys.charisma?.value     ?? 0,
      reaction:     sys.reaction?.value     ?? 0,
      body:         sys.body?.value         ?? 0,
      str:          sys.strength?.value     ?? 0,
      bod:          sys.body?.value         ?? 0,
      qui:          sys.quickness?.value    ?? 0,
      int:          sys.intelligence?.value ?? 0,
      wil:          sys.willpower?.value    ?? 0,
      cha:          sys.charisma?.value     ?? 0,
      rea:          sys.reaction?.value     ?? 0,
    };

    // Substitute attribute names (sorted longest-first to prevent partial matches)
    const keys = Object.keys(ATTR_MAP).sort((a, b) => b.length - a.length);
    let resolved = expr.toLowerCase();
    for (const key of keys) {
      resolved = resolved.replace(new RegExp(`\\b${key}\\b`, "g"), String(ATTR_MAP[key]));
    }

    // After substitution only digits and arithmetic operators should remain
    if (/^[\d\s+\-*/().]+$/.test(resolved)) {
      try {
        // Roll.safeEval is Foundry's sandboxed arithmetic evaluator — unlike
        // Function()/eval it works under strict Content Security Policies.
        const power = Math.max(0, Math.floor(Roll.safeEval(resolved)));
        return { power, level };
      } catch { /* fall through to default */ }
    }
  }

  return { power: 0, level: "M" };
}

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
   * Reload this weapon from its selected reserve ammo item.
   *
   * Reloads are all-or-nothing: a clip only ever holds ONE ammo type.
   * Reloading from the same reserve tops the clip up; reloading from a
   * different reserve ejects ALL currently-loaded rounds first (returning
   * them to the reserve they came from when it still exists — rounds with
   * no known origin are discarded) and then loads fresh from the new one.
   */
  async reloadWeapon() {
    const actor = this.parent;
    if (!actor || this.type !== "weapon") return;
    const ammo = this.system.ammo;
    if (!(ammo?.max > 0)) {
      return ui.notifications.warn(`${this.name} does not track ammunition (set a clip size first).`);
    }

    const source = actor.items.get(ammo.sourceId);
    if (!source || source.type !== "ammo") {
      return ui.notifications.warn(`Select the ammo to reload ${this.name} from first.`);
    }

    let current = ammo.current;
    let ejectNote = "";

    // Clip swap: any rounds not from the selected reserve are ejected so the
    // clip never mixes types. This includes rounds with no recorded origin
    // (loaded manually or before the loading feature existed).
    if (current > 0 && ammo.loadedSourceId !== source.id) {
      const oldReserve = ammo.loadedSourceId ? actor.items.get(ammo.loadedSourceId) : null;
      const oldName = ammo.loadedName || "untracked";
      if (oldReserve?.type === "ammo") {
        await oldReserve.update({ "system.quantity": oldReserve.system.quantity + current });
        ejectNote = `<br><em>Ejected ${current} ${foundry.utils.escapeHTML(oldName)} round${current === 1 ? "" : "s"} back to reserve.</em>`;
      } else {
        ejectNote = `<br><em>Ejected ${current} ${foundry.utils.escapeHTML(oldName)} round${current === 1 ? "" : "s"} (no reserve to return them to — discarded).</em>`;
      }
      current = 0;
    }

    const need = ammo.max - current;
    const take = Math.min(need, source.system.quantity);
    if (take <= 0 && !ejectNote) {
      return ui.notifications.warn(need <= 0
        ? `${this.name} is already fully loaded with ${ammo.loadedName || "this ammo"}.`
        : `No ${source.name} remaining to load.`);
    }
    if (take <= 0 && ejectNote) {
      // Swapped to an empty reserve: the clip ends up empty but typed.
      ui.notifications.warn(`No ${source.name} remaining — ${this.name} is now empty.`);
    }

    const remaining = source.system.quantity - take;
    await source.update({ "system.quantity": remaining });
    await this.update({
      "system.ammo.current":        current + take,
      "system.ammo.loadedSourceId": source.id,
      "system.ammo.loadedName":     source.name,
      "system.ammo.type":           source.system.ammoType,
      "system.ammo.damageMod":      source.system.damageModifier ?? 0,
      "system.ammo.armorMod":       source.system.armorModifier ?? 0,
      "system.ammo.armorCalc":      source.system.armorCalc ?? "standard",
      "system.ammo.damageType":     source.system.damageType ?? ""
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-item-card">
        <strong>${foundry.utils.escapeHTML(this.name)}</strong> reloaded with
        ${take} round${take === 1 ? "" : "s"} of
        <strong>${foundry.utils.escapeHTML(source.name)}</strong>
        <em>(${remaining} left in reserve)</em>
        ${ejectNote}
      </div>`
    });
  }

  /**
   * Roll a weapon attack.
   *
   * Ranged TN = Base(4) + range + cover + attackerRunning + targetRunning + inMelee
   *           + other + cyberware + woundPenalty + recoilPenalty  (SR2E p.100–110)
   *
   * Melee TN  = targetQuickness + reachDisadvantage + attackerRunning
   *           + targetRunning + other + woundPenalty  (SR2E p.113)
   *
   * Firing mode (ranged only, SR2E p.92–93):
   *   - SS/SA: 1 round. SA takes +1 recoil per shot already fired this phase.
   *   - BF: 3-round burst — Power +3, Damage Level +1, +3 recoil
   *     (the burst's own rounds count toward its recoil).
   *   - FA: N-round burst (3–10 declared) — Power +N, Damage Level +1 per
   *     3 full rounds, +N recoil including this burst.
   *   Rounds fired accumulate on the recoil counter; recoil compensation
   *   reduces the penalty. Ammunition is decremented when tracked.
   *
   * The chat card embeds a "Resist Damage" button so the defender can roll
   * their Body dice against the incoming damage code.
   *
   * @private
   */
  async _rollWeaponAttack(options = {}) {
    const actor = this.parent;
    if (!actor) return;

    const RANGE_TN_MODS = { short: 0, medium: 2, long: 4, extreme: 6 };
    const BASE_TN = 4;

    const isMelee  = ["melee", "throwing"].includes(this.system.weaponType);
    const isRanged = !isMelee;

    // Dice pool — linked skill rating.
    //
    // SR2E weapon-type → default skill mapping (core book p.88–92):
    //   Firearms   → Firearms
    //   Melee      → Armed Combat  (covers all hand-to-hand weapons)
    //   Throwing   → Throwing Weapons
    //   Heavy      → Heavy Weapons
    //   Projectile → Projectile Weapons (bows, crossbows)
    //   Grenade    → Throwing Weapons
    //
    // The weapon's explicit `skill` field overrides the type default when set.
    // Both the field value and each skill item's name are normalized to slug
    // form (spaces/slashes/parens → underscores) before comparing so that
    // "Armed Combat" and "armed_combat" always resolve to the same skill.
    const WEAPON_TYPE_DEFAULT_SKILLS = {
      firearm:    "firearms",
      melee:      "armed_combat",
      throwing:   "throwing_weapons",
      heavy:      "heavy_weapons",
      projectile: "projectile_weapons",
      grenade:    "throwing_weapons"
    };

    const normalize = s =>
      s.toLowerCase()
       .replace(/[\s/()]+/g, "_")
       .replace(/_+/g, "_")
       .replace(/^_|_$/g, "");

    // Build a priority list of skill keys to search: explicit field first,
    // then the weapon-type default.  Empty strings are filtered out.
    const typeFallback = WEAPON_TYPE_DEFAULT_SKILLS[this.system.weaponType] ?? "";
    const skillKeys = [
      normalize(this.system.skill ?? ""),
      normalize(typeFallback)
    ].filter(k => k !== "");

    let skillRating = 0;
    for (const item of actor.items) {
      if (item.type !== "skill") continue;
      if (skillKeys.includes(normalize(item.name))) {
        skillRating = item.system.rating;
        break;
      }
    }

    // Untrained: default to the skill's linked Attribute via the Skill Web
    // (SR2E p.69) — attribute dice at +CONFIG.SR2E.defaultingPenalty TN.
    let dicePool = skillRating;
    let defaultingPenalty = 0;
    let defaultingNote = "";
    if (skillRating <= 0) {
      const defaultSkillKey = skillKeys.find(k => CONFIG.SR2E.activeSkills[k]) ?? "";
      const attrKey = CONFIG.SR2E.activeSkills[defaultSkillKey]?.attribute ?? "quickness";
      // "reaction" lives outside system.<attr>; everything else is an attributeField
      const attrValue = attrKey === "reaction"
        ? (actor.system.reaction?.value ?? 1)
        : (actor.system[attrKey]?.value ?? 1);
      dicePool = Math.max(1, attrValue);
      defaultingPenalty = CONFIG.SR2E.defaultingPenalty;
      const attrLabel = attrKey.charAt(0).toUpperCase() + attrKey.slice(1);
      defaultingNote = `defaulting to ${attrLabel} +${defaultingPenalty}`;
    }

    // Common modifiers
    const attackerMod  = options.attackerMod ?? 0;
    const targetMod    = options.targetMod   ?? 0;
    const otherMod     = options.otherMod    ?? 0;
    const woundPenalty = actor.system.woundPenalty ?? 0;

    const modParts = [];
    let targetNumber;
    let label;

    // Ranged-only state — resolved in the ranged branch, used later
    let shotsFired = 0;
    let hasRecoil  = false;
    let firingMode = "sa";
    let isBurst    = false;
    let rounds     = 1;     // rounds fired by this attack

    if (isMelee) {
      // ── Melee TN (SR2E p.113) ──────────────────────────────────────────────
      const targetQuickness = options.targetQuickness ?? 4;
      const reachMod        = options.reachMod        ?? 0;

      targetNumber = Math.max(2,
        targetQuickness + reachMod + attackerMod + targetMod + otherMod + woundPenalty
                        + defaultingPenalty
      );

      if (defaultingNote) modParts.push(defaultingNote);
      if (reachMod)    modParts.push(`reach +${reachMod}`);
      if (attackerMod) modParts.push(`attacker running +${attackerMod}`);
      if (targetMod)   modParts.push(`target running +${targetMod}`);
      if (otherMod)    modParts.push(`other ${otherMod > 0 ? "+" : ""}${otherMod}`);
      label = `${this.name} [Melee]${modParts.length ? " — " + modParts.join(", ") : ""} TN ${targetNumber}`;

    } else {
      // ── Ranged TN (SR2E p.100–110) ─────────────────────────────────────────
      const range    = options.range      ?? "short";
      firingMode     = options.firingMode ?? "sa";
      const coverMod = options.coverMod   ?? 0;
      const meleeMod = options.meleeMod   ?? 0;
      const rangeMod = RANGE_TN_MODS[range] ?? 0;
      const rangeLabel = range.charAt(0).toUpperCase() + range.slice(1);

      // Rounds fired: BF is a fixed 3-round burst; FA fires 3–10 declared rounds.
      isBurst = firingMode === "bf" || firingMode === "fa";
      if (firingMode === "bf") rounds = 3;
      else if (firingMode === "fa") rounds = Math.min(10, Math.max(3, options.rounds ?? 3));

      // Ammunition check (only when the weapon tracks ammo, i.e. max > 0)
      const ammo = this.system.ammo;
      if (ammo?.max > 0) {
        if (ammo.current <= 0) {
          return ui.notifications.warn(`${this.name} is out of ammunition.`);
        }
        if (isBurst && ammo.current < rounds) {
          // SR2E short-burst rules (p.93) are not automated — require a full burst.
          return ui.notifications.warn(
            `${this.name} has only ${ammo.current} round${ammo.current === 1 ? "" : "s"} left — not enough for a ${rounds}-round burst.`
          );
        }
      }

      // Cyberware TN mods (smartgun link, etc.) — only for smartgun-compatible weapons
      let cyberwareMod = 0;
      if (this.system.smartgunCompatible) {
        for (const item of actor.items) {
          if (item.type === "cyberware" && item.system.installed && item.system.combatTnMod !== 0) {
            cyberwareMod += item.system.combatTnMod;
          }
        }
      }

      // Recoil (SR2E p.93): +1 per round already fired this phase; a burst's
      // own rounds also count toward its recoil (first BF burst = +3).
      shotsFired          = actor.system.combatRecoil ?? 0;
      const recoilComp    = this.system.recoilComp    ?? 0;
      hasRecoil           = ["firearm", "heavy"].includes(this.system.weaponType);
      const recoilRounds  = shotsFired + (isBurst && hasRecoil ? rounds : 0);
      const recoilPenalty = Math.max(0, recoilRounds - recoilComp);

      targetNumber = Math.max(2,
        BASE_TN + rangeMod + coverMod + attackerMod + targetMod + meleeMod + otherMod
                + cyberwareMod + woundPenalty + recoilPenalty + defaultingPenalty
      );

      if (defaultingNote) modParts.push(defaultingNote);
      if (rangeMod)    modParts.push(`${rangeLabel} range`);
      if (coverMod)    modParts.push(`cover +${coverMod}`);
      if (attackerMod) modParts.push(`running +${attackerMod}`);
      if (targetMod)   modParts.push(`target running +${targetMod}`);
      if (meleeMod)    modParts.push(`in melee +${meleeMod}`);
      if (otherMod)    modParts.push(`other ${otherMod > 0 ? "+" : ""}${otherMod}`);
      const modeLabel = firingMode === "fa"
        ? `FA ${rounds} rounds`
        : firingMode.toUpperCase();
      label = `${this.name} [${modeLabel}]${modParts.length ? " — " + modParts.join(", ") : ""} TN ${targetNumber}`;
    }

    const result = await actor.rollSuccessTest(dicePool, targetNumber, {
      label,
      poolDice: options.poolDice,
      karmaDice: options.karmaDice
    });

    // Accumulate rounds fired on the recoil counter and decrement ammunition.
    // The counter is reset automatically at the start of each combat turn/round
    // (see hooks in sr2e.mjs) or manually via the Reset Recoil button.
    if (isRanged) {
      if (hasRecoil) {
        await actor.update({ "system.combatRecoil": shotsFired + rounds });
      }
      if (this.system.ammo?.max > 0) {
        await this.update({
          "system.ammo.current": Math.max(0, this.system.ammo.current - rounds)
        });
      }
    }

    // Post staged damage + resist button if the attack connected
    if (result.successes > 0) {
      // Evaluate damage code with actor context so formula codes like
      // "(Str+3)S" resolve against the attacker's current attributes.
      const dmg          = evaluateDamageCode(this.system.damageCode, actor);
      const armorType    = isMelee ? "impact" : "ballistic";
      let effectivePower = dmg.power;
      let levelBonus     = 0;
      const powerNotes   = [];

      // Loaded ammunition effects (SR2E p.93–94) — ranged, tracked weapons only
      const ammo      = this.system.ammo;
      const hasAmmo   = isRanged && ammo?.max > 0;
      const ammoCalc  = hasAmmo ? (ammo.armorCalc || "standard") : "standard";
      const ammoMod   = hasAmmo ? (ammo.armorMod ?? 0) : 0;
      const ammoName  = hasAmmo ? (ammo.loadedName || "") : "";
      if (hasAmmo && ammo.damageMod) {
        effectivePower += ammo.damageMod;
        powerNotes.push(`${ammo.damageMod > 0 ? "+" : ""}${ammo.damageMod} ${ammoName || "ammo"}`);
      }
      // Damage type: loaded ammo override (gel → stun), else the weapon's own type
      const damageType = (hasAmmo && ammo.damageType) || this.system.damageType || "physical";

      // Burst damage (SR2E p.93): Power +1 per round in the burst, Damage
      // Level +1 per 3 full rounds (BF's fixed 3-round burst = +3 Power, +1 Level).
      if (isRanged && isBurst) {
        effectivePower += rounds;
        levelBonus = Math.floor(rounds / 3);
        powerNotes.push(`+${rounds} burst, level +${levelBonus}`);
      }
      effectivePower = Math.max(1, effectivePower);
      const powerNote = powerNotes.length
        ? ` <em>(base ${dmg.power}, ${foundry.utils.escapeHTML(powerNotes.join(", "))})</em>` : "";

      const stageUps = Math.floor(result.successes / 2);
      const stages   = ["L", "M", "S", "D"];
      const baseIdx  = stages.indexOf(dmg.level);
      const finalIdx = Math.min(baseIdx + levelBonus + stageUps, 3);
      const safeName = foundry.utils.escapeHTML(this.name);
      const ammoLine = ammoName
        ? `<br><em>Loaded: ${foundry.utils.escapeHTML(ammoName)}</em>` : "";

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-damage-result">
          <strong>${safeName} Damage:</strong> ${effectivePower}${stages[finalIdx]}${powerNote}
          <br><em>Base: ${foundry.utils.escapeHTML(this.system.damageCode)} | Staged up ${stageUps} level(s)</em>
          ${ammoLine}
          <br>
          <button class="sr2e-resist-btn"
                  data-power="${effectivePower}"
                  data-level="${stages[finalIdx]}"
                  data-armor-type="${armorType}"
                  data-damage-type="${damageType}"
                  data-armor-calc="${ammoCalc}"
                  data-armor-mod="${ammoMod}"
                  data-ammo-name="${foundry.utils.escapeHTML(ammoName)}"
                  title="Defender rolls Body vs. TN = Power − Armor (SR2E p.116)">
            ${game.i18n.localize("SR2E.Chat.ResistDamage")}
          </button>
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
      poolDice: options.poolDice,   // magic pool dice pre-allocated by player
      karmaDice: options.karmaDice  // extra dice bought with Karma Pool
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
      // Boxes per drain level (SR2E p.113): L=1, M=3, S=6, D=10
      const drainBoxes = [1, 3, 6, 10][finalIdx];
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
   * Roll a skill test. Delegates to the actor so untrained defaulting
   * (Skill Web, SR2E p.69) is handled in one place.
   * @private
   */
  async _rollSkillTest(options = {}) {
    const actor = this.parent;
    if (!actor) return;
    return actor.rollSkillTest(this.id, options.targetNumber || 4, options);
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
      poolDice: options.poolDice,
      karmaDice: options.karmaDice
    });
  }

  /**
   * Display an item info card in chat.
   * @private
   */
  async _displayItemCard() {
    const content = `
      <div class="sr2e-item-card">
        <h3>${foundry.utils.escapeHTML(this.name)}</h3>
        <p><strong>Type:</strong> ${this.type}</p>
        ${this.system.notes ? `<p>${foundry.utils.escapeHTML(this.system.notes)}</p>` : ""}
      </div>
    `;

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.parent }),
      content
    });
  }
}
