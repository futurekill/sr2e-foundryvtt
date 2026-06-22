/**
 * Pure SR2E rules math — no Foundry dependencies.
 *
 * These helpers were extracted from the TypeDataModels and document methods so
 * the core mechanics can be unit-tested in plain Node (see test/) and so the
 * same constants/formulas stop being copy-pasted across call sites. Anything
 * here must stay free of `foundry`, `game`, `CONFIG`, `Roll`, etc.
 */

/** Damage levels in ascending order (SR2E p.113). */
export const DAMAGE_LEVELS = ["L", "M", "S", "D"];

/**
 * Net successes convert to damage-staging steps at 2 successes per step
 * (SR2E p.110): the attacker stages damage up by net/2, and a resistance test
 * stages it down by its successes/2. Also the drain-reduction rate.
 * @param {number} successes
 * @returns {number}
 */
export function netToSteps(successes) {
  return Math.floor((successes ?? 0) / 2);
}

/**
 * Astral Reaction (SR2E p.146): (Intelligence + Willpower) / 2, rounded down.
 * @param {number} intelligence
 * @param {number} willpower
 * @returns {number}
 */
export function astralReaction(intelligence, willpower) {
  return Math.floor((intelligence + willpower) / 2);
}

/**
 * Spell Drain target number (SR2E p.131, p.140): ⌊Force ÷ 2⌋ + the spell's
 * drain modifier, minimum 2.
 * @param {number} force
 * @param {number} modifier
 * @returns {number}
 */
export function drainTargetNumber(force, modifier) {
  return Math.max(2, Math.floor(force / 2) + modifier);
}

/** Condition-monitor boxes filled by each damage level (SR2E p.113). */
export const DAMAGE_BOXES = { L: 1, M: 3, S: 6, D: 10 };

/**
 * Boxes a damage level fills.
 * @param {"L"|"M"|"S"|"D"} level
 * @returns {number}
 */
export function damageBoxes(level) {
  return DAMAGE_BOXES[level] ?? 0;
}

/**
 * Stage a damage level up (+) or down (−) by a number of steps, clamped to the
 * L…D range (SR2E p.110). Net successes / 2 stage up; armoured resistance
 * successes stage down.
 * @param {"L"|"M"|"S"|"D"} level
 * @param {number} steps - positive stages up, negative stages down
 * @returns {"L"|"M"|"S"|"D"}
 */
export function stageLevel(level, steps) {
  const idx = DAMAGE_LEVELS.indexOf(level);
  if (idx < 0) return level;
  const next = Math.min(DAMAGE_LEVELS.length - 1, Math.max(0, idx + steps));
  return DAMAGE_LEVELS[next];
}

/**
 * Injury Modifier for a single condition column (SR2E p.112). Thresholds:
 * 1 box = Light (+1), 3 = Moderate (+2), 6 = Serious (+3); a full 10 (Deadly)
 * means unconscious/down rather than an additional TN step.
 * @param {number} boxes
 * @returns {0|1|2|3}
 */
export function columnWoundPenalty(boxes) {
  if (boxes >= 6) return 3;
  if (boxes >= 3) return 2;
  if (boxes >= 1) return 1;
  return 0;
}

/**
 * Total Injury Modifier, cumulative across the Physical and Stun monitors
 * (SR2E p.112).
 * @param {number} physicalBoxes
 * @param {number} stunBoxes
 * @returns {number}
 */
export function totalWoundPenalty(physicalBoxes, stunBoxes) {
  return columnWoundPenalty(physicalBoxes) + columnWoundPenalty(stunBoxes);
}

/**
 * Wound level for a number of filled condition boxes (SR2E p.113): the same
 * 1/3/6/10 thresholds as the Injury Modifier.
 * @param {number} boxes
 * @returns {"Undamaged"|"Light"|"Moderate"|"Serious"|"Deadly"}
 */
export function woundLevel(boxes) {
  if (boxes >= 10) return "Deadly";
  if (boxes >= 6)  return "Serious";
  if (boxes >= 3)  return "Moderate";
  if (boxes >= 1)  return "Light";
  return "Undamaged";
}

/**
 * First Aid target-number modifier from the patient's Body (SR2E p.115):
 * a tougher patient is easier to stabilise. −1 at Body 4+, −2 at 7+, −3 at 10+.
 * @param {number} body
 * @returns {0|-1|-2|-3}
 */
export function firstAidBodyMod(body) {
  if (body >= 10) return -3;
  if (body >= 7)  return -2;
  if (body >= 4)  return -1;
  return 0;
}

/**
 * Resolve an opposed melee exchange (SR2E p.100–101): whoever rolls more
 * successes hits; ties favour the attacker. Net = the winner's margin (drives
 * the damage staging via netToSteps).
 * @param {number} attackerSuccesses
 * @param {number} defenderSuccesses
 * @returns {{ winner: "attacker"|"defender", net: number }}
 */
export function meleeOutcome(attackerSuccesses, defenderSuccesses) {
  if (defenderSuccesses > attackerSuccesses) {
    return { winner: "defender", net: defenderSuccesses - attackerSuccesses };
  }
  return { winner: "attacker", net: attackerSuccesses - defenderSuccesses };
}

/**
 * Target number for a Matrix system operation (SR2E p.166–167): the node's
 * System Rating, +2 for every prior attempt this run, plus any untrained
 * Skill-Web default penalty.
 * @param {number} systemRating
 * @param {number} priorAttempts
 * @param {number} [defaultPenalty=0]
 * @returns {number}
 */
export function systemOperationTN(systemRating, priorAttempts, defaultPenalty = 0) {
  return systemRating + (priorAttempts * 2) + defaultPenalty;
}

/**
 * A persona attribute derived from a loaded program is capped at the deck's
 * MPCP rating (SR2E p.172–174).
 * @param {number} programRating
 * @param {number} mpcp
 * @returns {number}
 */
export function personaAttribute(programRating, mpcp) {
  return Math.min(programRating, mpcp);
}

/**
 * Rounds fired by a weapon's firing mode (SR2E p.92–93): a burst-fire weapon
 * fires a fixed 3-round burst; full auto fires a declared 3–10 rounds; single
 * shot / semi-auto fire 1.
 * @param {"ss"|"sa"|"bf"|"fa"} firingMode
 * @param {number} [declared] - declared rounds for full auto
 * @returns {number}
 */
export function burstRounds(firingMode, declared) {
  if (firingMode === "bf") return 3;
  if (firingMode === "fa") return Math.min(10, Math.max(3, declared ?? 3));
  return 1;
}

/**
 * Recoil penalty (SR2E p.93): +1 TN per uncompensated round fired this Action
 * Phase. A burst's own rounds count toward its recoil (firearms/heavy only);
 * recoil compensation cancels rounds one-for-one.
 * @param {number} shotsFired - rounds already fired this phase (recoil counter)
 * @param {number} rounds     - rounds in this attack
 * @param {object} opts
 * @param {boolean} opts.isBurst
 * @param {boolean} opts.hasRecoil  - weapon type is subject to recoil
 * @param {number}  opts.recoilComp - recoil compensation
 * @returns {number}
 */
export function recoilPenalty(shotsFired, rounds, { isBurst, hasRecoil, recoilComp }) {
  const recoilRounds = shotsFired + (isBurst && hasRecoil ? rounds : 0);
  return Math.max(0, recoilRounds - (recoilComp ?? 0));
}

/**
 * Burst / full-auto damage bonus (SR2E p.93): +1 Power per round in the burst,
 * +1 Damage Level per 3 full rounds.
 * @param {number} rounds
 * @returns {{ powerBonus: number, levelSteps: number }}
 */
export function burstDamageBonus(rounds) {
  return { powerBonus: rounds, levelSteps: Math.floor(rounds / 3) };
}

/**
 * Memory size (Mp) of a Matrix program (SR2E p.174–177): Rating² × multiplier,
 * rounded up. The multiplier is the program's per-type factor (Browse ×1,
 * Attack/Evaluate/Decrypt/Scramble/Deception/Relocate/Slow ×2, Analyze/Mirrors/
 * Medic ×3, Shield/Smoke ×4).
 * @param {number} rating
 * @param {number} multiplier
 * @returns {number}
 */
export function programSize(rating, multiplier) {
  return Math.ceil(rating * rating * multiplier);
}

/**
 * Nuyen cost of a Matrix program (SR2E p.174): Size × 100¥ (Street Index 1).
 * @param {number} rating
 * @param {number} multiplier
 * @returns {number}
 */
export function programCost(rating, multiplier) {
  return programSize(rating, multiplier) * 100;
}

/**
 * Nuyen cost of a magical focus: Force × the focus type's per-Force unit cost
 * (Power 20,000 / Spell·Spirit·Weapon 10,000 / Spell Lock 5,000 ¥, SR2E p.249).
 * @param {number} force
 * @param {number} costPerForce
 * @returns {number}
 */
export function focusCost(force, costPerForce) {
  return force * costPerForce;
}

/** Base Reaction speed an IC's node Security Code grants (SR2E p.169). */
export const IC_REACTION_BASE = { blue: 0, green: 5, orange: 7, red: 9 };

/**
 * Base of an IC's Reaction Time (SR2E p.169): the node's Security Code gives a
 * base speed to which the IC's Rating is added; then roll 1D6. Blue nodes carry
 * no IC, so they contribute 0.
 * @param {"blue"|"green"|"orange"|"red"} securityCode
 * @returns {number}
 */
export function icReactionBase(securityCode) {
  return IC_REACTION_BASE[securityCode] ?? 0;
}

/**
 * Apply an alert's modifier to an IC rating (SR2E p.168): a passive alert adds
 * +50% to all IC ratings (rounded down); an active alert inherits that boost.
 * @param {number} rating
 * @param {"none"|"passive"|"active"} alert
 * @returns {number}
 */
export function alertAdjustedRating(rating, alert) {
  if (alert === "passive" || alert === "active") return Math.floor(rating * 1.5);
  return rating;
}

/**
 * Escalate a node/IC alert one step (SR2E p.168): no alert → passive; a second
 * trigger (already passive, or active) → active.
 * @param {"none"|"passive"|"active"} current
 * @returns {"passive"|"active"}
 */
export function escalateAlert(current) {
  return current === "none" ? "passive" : "active";
}

/**
 * Essence cost of a "container" cyberware (cybereyes/cyberears) that absorbs
 * add-on modules up to a free capacity (SR2E p.247: cybereyes accept vision
 * enhancements up to 0.5 Essence without further loss). Only module essence
 * beyond `capacity` adds to the base.
 * @param {number} baseEssence - the container's own essence (e.g. 0.2 for eyes)
 * @param {number} moduleEssenceSum - summed essence of the ACTIVE modules
 * @param {number} capacity - free essence allowance (e.g. 0.5)
 * @returns {number} total essence, rounded to 2 decimals
 */
export function containerEssence(baseEssence, moduleEssenceSum, capacity) {
  const over = Math.max(0, (moduleEssenceSum || 0) - (capacity || 0));
  return Math.round(((baseEssence || 0) + over) * 100) / 100;
}

/**
 * Vehicle design-from-scratch point-buy (Rigger 2 p.108-123). Computes the total
 * Design Point Value and the final price of a custom vehicle. The design process
 * is: chassis + power plant give a base Design Point Value; rating improvements
 * (Speed/Accel/Load/Handling/Armor/Cargo) and modifications each ADD Design
 * Points; the final price = Design Point Value × Mark-Up Factor.
 *
 * This is a PURE accumulator: the chassis/power-plant base Design Points, the
 * per-point improvement costs, the mod Design-Point costs, and the Mark-Up Factor
 * all come from the Chassis Table (p.170-171), Power Plant Table (p.168-169), the
 * modification entries, and the Mark-Up rules — they're passed in as data, so the
 * tables plug in without changing this logic.
 *
 * Verified against the book's worked examples (p.110-113): the Sand Buggy chassis
 * is 20 DP and the Sports Car chassis is 110 DP; Rich's Sports Car reaches 599 DP
 * after maxing Accel (+11 ×2) and Speed (+151 ×2) on top of its power plant, then
 * 659 DP after mods.
 *
 * @param {object} d
 * @param {number} [d.chassisDP=0]    base Design Points of the chassis
 * @param {number} [d.powerPlantDP=0] base Design Points of the power plant
 * @param {Object<string,number>} [d.improvements={}] rating increases bought,
 *   e.g. { speed: 151, accel: 11, armor: 2 } (deltas above the starting value)
 * @param {Object<string,number>} [d.costPerPoint={}] Design-Point cost per +1 of
 *   each rating, e.g. { speed: 2, accel: 2, armor: 50 } (from the power plant /
 *   improvement rules). Ratings absent here cost 0 per point.
 * @param {number[]} [d.modDP=[]] Design-Point cost of each installed modification
 * @param {number} [d.markUp=1] Mark-Up Factor (final-price multiplier)
 * @returns {{ designPoints:number, cost:number }}
 */
export function vehicleDesign({ chassisDP = 0, powerPlantDP = 0, improvements = {}, costPerPoint = {}, modDP = [], markUp = 1 } = {}) {
  let dp = (chassisDP || 0) + (powerPlantDP || 0);
  for (const rating of Object.keys(improvements)) {
    dp += (improvements[rating] || 0) * (costPerPoint[rating] || 0);
  }
  dp += (modDP || []).reduce((sum, m) => sum + (m || 0), 0);
  return { designPoints: dp, cost: dp * (markUp || 1) };
}

/**
 * Engine Customization design cost (Rigger 2 p.120): the first level costs the
 * power plant's Design-Point cost × 1.25, and each additional level adds 0.5 to
 * the multiplier. So N levels cost powerPlantDP × (1.25 + 0.5 × (N − 1)).
 * NOTE: read as the TOTAL cost for N levels (the multiplier represents the whole),
 * not a per-level sum — confirm against a worked example if one surfaces.
 * @param {number} powerPlantDP
 * @param {number} levels
 * @returns {number} Design Points (rounded)
 */
export function engineCustomizationCost(powerPlantDP, levels) {
  if (!levels || levels <= 0) return 0;
  return Math.round((powerPlantDP || 0) * (1.25 + 0.5 * (levels - 1)));
}
