/**
 * Vehicle rules in play, core rulebook (docs/PLAN-vehicles-phase2.md Part 1). Pure: no Foundry.
 * Pages: SR2 core p.85 (Control Pool), p.104–109 (vehicles and combat), p.183 (Vehicle Operation Table).
 */

const STAGES = ["L", "M", "S", "D"];

/** Impact Table (p.107): Damage Level by speed in m/CT. */
export function impactLevel(speed) {
  if (speed >= 201) return "D";
  if (speed >= 61) return "S";
  if (speed >= 21) return "M";
  return "L";
}

/** A crash's or a collision's Damage Code (p.107, p.109): Power = speed ÷ 10 round down (at least 1), level by speed. */
export function impactDamage(speed) {
  const s = Math.max(0, Number(speed) || 0);
  return { power: Math.max(1, Math.floor(s / 10)), level: impactLevel(s) };
}

/** Boxes → the wound level one application deals (1 L, 3 M, 6 S, 10 D; in between rounds down). */
export function woundLevelOf(boxes) {
  if (boxes >= 10) return "D";
  if (boxes >= 6) return "S";
  if (boxes >= 3) return "M";
  return boxes >= 1 ? "L" : null;
}

/** One level lower (p.109 surviving barrier: occupants take the impact one level less; below L = nothing). */
export function levelBelow(level) {
  const i = STAGES.indexOf(level);
  return i > 0 ? STAGES[i - 1] : null;
}

/**
 * Vehicle Operation Table (p.183), "apply only to non-combat situations". The rigger row counts only when the
 * tester is rigging AND controls this vehicle (plan R1 #4).
 * @param {{complex?:boolean, unfamiliar?:""|"calm"|"stress", size?:""|"large"|"veryLarge",
 *          conditions?:""|"bad"|"terrible", vcr?:number, riggedIn?:boolean}} o
 */
export function vehicleOperationMod(o = {}) {
  const parts = [];
  if (o.complex) parts.push(["Complex controls", 1]);
  if (o.unfamiliar === "calm") parts.push(["Unfamiliar vehicle", 1]);
  if (o.unfamiliar === "stress") parts.push(["Unfamiliar vehicle, stressful", 3]);
  if (o.size === "large") parts.push(["Large vehicle of type", 2]);
  if (o.size === "veryLarge") parts.push(["Very large vehicle of type", 3]);
  if (o.conditions === "bad") parts.push(["Bad conditions", 2]);
  if (o.conditions === "terrible") parts.push(["Terrible conditions", 4]);
  const vcr = Math.max(0, Number(o.vcr) || 0);
  if (o.riggedIn && vcr > 0) parts.push([`Rigger in control (VCR ${vcr})`, -2 * vcr]);
  return { mod: parts.reduce((t, [, m]) => t + m, 0), parts };
}

/** Moving Target Table (p.108): target's speed against the attacker's (a stationary attacker is 5). */
export function movingTargetMod(targetSpeed, attackerSpeed) {
  const t = Math.max(0, Number(targetSpeed) || 0), a = Math.max(0, Number(attackerSpeed) || 0);
  if (t <= a) return 0;
  if (a > 0 && t <= 2 * a) return 2;
  if (a > 0 && t <= 3 * a) return 4;
  return 6;
}

/**
 * Position Test outcomes (p.105–106) for every intention (chosen in secret, so the card lists all three).
 * Flee/pursue: successes × cruising speed m and one attack per 2 successes; fight: attacks = successes and
 * ⌊successes/2⌋ × cruising speed m to open or close.
 */
export function positionOutcomes(successes, cruising) {
  const s = Math.max(0, Math.floor(Number(successes) || 0)), v = Math.max(0, Number(cruising) || 0);
  const half = Math.floor(s / 2);
  return { flee: { meters: s * v, attacks: half }, pursue: { meters: s * v, attacks: half }, fight: { attacks: s, meters: half * v } };
}

/**
 * What a vehicle damage commit triggers (p.107). Destroyed by weapons or spells → automatic crash; a Serious wound
 * during combat → a Crash Test (ruling: "takes Serious damage" = a Serious wound). Crash and collision damage never
 * trigger another crash; manual monitor edits trigger nothing.
 * @returns {"autoCrash"|"crashTest"|null}
 */
export function crashTrigger({ source, woundLevel, destroyedNow = false, inCombat = false }) {
  if (!["weapon", "spell"].includes(source)) return null;
  if (destroyedNow) return "autoCrash";
  if (woundLevel === "S" && inCombat) return "crashTest";
  return null;
}

/**
 * Dice for a vehicle-control test (p.69 defaulting, p.85 Control Pool cap): trained rating; else the Skill Web
 * default; else Reaction at +4. The Control Pool cap is the rating of the skill in use (the default's dice when
 * defaulting).
 */
export function vehicleSkillDice({ rating = 0, web = null, reaction = 1, defaultingPenalty = 4 }) {
  if (rating > 0) return { dice: rating, penalty: 0, cap: rating, defaulted: null };
  if (web) return { dice: web.dice, penalty: web.penalty, cap: web.dice, defaulted: web.label ?? "web" };
  const r = Math.max(1, Number(reaction) || 1);
  return { dice: r, penalty: defaultingPenalty, cap: r, defaulted: "reaction" };
}

/**
 * Damaging manipulations against vehicles (p.109): "as if they were regular weapons … They do not, however,
 * suffer the reductions in Power and Damage Code" — no barrier test, no Power cut, no level step-down.
 */
export function manipulationVsVehicle({ body = 1, armor = 0, power, level }) {
  return { dice: Math.max(1, (Number(body) || 0) + Math.floor((Number(armor) || 0) / 2)), tn: Math.max(2, Number(power) || 0), level };
}

/** Control Pool dice still out for this round's Position Tests (p.105): the sum over this round's tests. */
export function reservedControl(reserve, combatId, round) {
  if (!reserve || reserve.combatId !== combatId || reserve.round !== round) return 0;
  return Object.values(reserve.byTest ?? {}).reduce((t, n) => t + Math.max(0, Number(n) || 0), 0);
}
