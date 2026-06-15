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
