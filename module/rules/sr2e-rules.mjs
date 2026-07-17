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
 * Astral Reaction (SR2E p.147): twice Intelligence. Astral Initiative is this
 * value +15 with 1 Initiative die (applied at roll time).
 * @param {number} intelligence
 * @returns {number}
 */
export function astralReaction(intelligence) {
  return 2 * intelligence;
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
 * Injury Modifier after cyber/bioware that suppresses it (Shadowtech).
 *
 * Damage Compensator (p.24): while a track's damage is AT OR BELOW the
 * compensator's Level, that track inflicts NO target-number/Initiative penalty.
 * Once a track EXCEEDS the Level, that track's penalty applies in full. The
 * Physical and Mental tracks are judged separately.
 *
 * Pain Editor (p.26), while active: the penalties from MENTAL damage are
 * ignored entirely (physical penalties still apply).
 *
 * @param {number} physicalBoxes
 * @param {number} stunBoxes
 * @param {{compensator?:number, ignoreStun?:boolean}} [opts]
 * @returns {number} the effective Injury Modifier
 */
export function compensatedWoundPenalty(physicalBoxes, stunBoxes, opts = {}) {
  const comp = Math.max(0, Number(opts.compensator) || 0);
  const phys = Number(physicalBoxes) || 0;
  const stun = Number(stunBoxes) || 0;
  // A track at/below the compensator level contributes nothing; over it, in full.
  const effPhys = phys > comp ? phys : 0;
  let effStun = stun > comp ? stun : 0;
  if (opts.ignoreStun) effStun = 0;   // active Pain Editor
  return totalWoundPenalty(effPhys, effStun);
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
export function recoilPenalty(shotsFired, rounds, { isBurst, hasRecoil, recoilComp, heavyRecoil }) {
  const recoilRounds = shotsFired + (isBurst && hasRecoil ? rounds : 0);
  const net = Math.max(0, recoilRounds - (recoilComp ?? 0));
  // Heavy weapons (medium/heavy MGs and shotguns) DOUBLE the uncompensated
  // recoil (p.89-90: 9 rounds - 6 comp = 3, doubled to +6).
  return heavyRecoil ? net * 2 : net;
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

/**
 * Whether the SR2 astral-visibility rule permits a viewer to see a token
 * (SR2E p.145, p.148): an astral-only entity (unmanifested spirit, focus,
 * quickened spell, a projecting/perceiving magician's astral form) is invisible
 * to normal sight — "a magician can see it only if astrally perceiving." Seen by
 * the GM, the token's owner, and any astrally active viewer. Two allied
 * exceptions so the table can play: a **friendly** astral being (an allied
 * spirit) is visible to everyone, and a spirit's **summoner** always sees their
 * own bound spirit regardless of astral state — both rendered translucent while
 * unmanifested. Only neutral/hostile unknowns stay hidden from mundanes.
 * Non-astral tokens are unaffected (physical visibility is decided elsewhere).
 * @param {{astralOnly:boolean, isGM:boolean, viewerAstralActive:boolean, ownsToken:boolean, friendly?:boolean, isSummoner?:boolean}} p
 * @returns {boolean} whether the astral rule allows the view
 */
export function astralAllowsView({ astralOnly, isGM, viewerAstralActive, ownsToken, friendly, isSummoner }) {
  if (!astralOnly) return true;
  return !!(isGM || ownsToken || isSummoner || friendly || viewerAstralActive);
}

/**
 * Weapon focus price (SR2E p.126): a melee weapon enchanted as a focus costs
 * [(Reach + 1) × 100,000¥] + Rating × 90,000¥. Reach comes from the weapon,
 * Rating is the focus's Force.
 * @param {number} reach   weapon reach (0 for most, higher for polearms)
 * @param {number} rating  focus Force
 * @returns {number} nuyen price
 */
export function weaponFocusCost(reach, rating) {
  return (Math.max(0, reach) + 1) * 100000 + Math.max(0, rating) * 90000;
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
 * Design-Point cost to improve each vehicle rating by one unit (Rigger 2 design
 * options, book p.115-117), VERIFIED against the worked walkthrough (Steffi's
 * Light Strike reconstructs exactly to its published 154 DP total, p.111-115):
 * lowering Handling by 1 = 25 DP; Acceleration = 25 DP/point ("Improving the
 * Acceleration costs 25 Design Points per point", p.113 — the option stat block's
 * "2 points" is a book typo the worked total contradicts); Speed = 2 DP/point;
 * Cargo = 5 DP/CF (Increased Cargo Space, p.116: "5 Design Points for every 1
 * point"); Load = 0.1 DP/kg (1 DP / 10 kg). Armor isn't a design option — it's
 * added via armor mods (50 DP/Armor Point), kept here for a quick equivalent buy.
 * Speed/Accel/Load are capped by the power plant; Cargo/Handling by the chassis.
 */
export const DESIGN_OPTION_COSTS = Object.freeze({
  handling: 25, speed: 2, acceleration: 25, armor: 50, cargo: 5, load: 0.1,
  // Improved Economy 5/pt (p.116); Signature Improvement 200/pt, military for 3+
  // (p.117); Increase Fuel Tank Capacity 25 per capacity unit (p.116).
  economy: 5, signature: 200, fuel: 25
});

/**
 * Vehicle design-from-scratch point-buy (Rigger 2 p.108-123). Computes the total
 * Design Point Value and the final ¥ price of a custom vehicle:
 *   DesignPoints = chassisDP + powerPlantDP + Σ(improvement × per-point cost) + Σ(modDP)
 *   cost = DesignPoints × Mark-Up Factor × 100   (book p.115)
 *
 * A PURE accumulator: chassis/power-plant base DP, the mod DP, and the Mark-Up
 * Factor come from the Chassis Table (p.170-171), Power Plant Table (p.168-169),
 * the modification entries, and the GM-set Mark-Up — passed in as data. The
 * per-point improvement costs default to DESIGN_OPTION_COSTS but can be overridden.
 *
 * Verified against the worked examples: Sand Buggy chassis 20 DP, Sports Car 110
 * DP; Rich's Sports Car 599 DP after maxing Accel (+11 ×2) and Speed (+151 ×2),
 * 659 after the first mods; the final 1,239-DP car at Mark-Up 2.5 costs 309,750¥;
 * Steff's 154-DP Light Strike at Mark-Up 2 costs 30,800¥ (p.115).
 *
 * @param {object} d
 * @param {number} [d.chassisDP=0]    base Design Points of the chassis
 * @param {number} [d.powerPlantDP=0] base Design Points of the power plant
 * @param {Object<string,number>} [d.improvements={}] rating increases bought,
 *   e.g. { speed: 151, acceleration: 11, armor: 2 } (deltas)
 * @param {Object<string,number>} [d.costPerPoint=DESIGN_OPTION_COSTS] DP cost per
 *   +1 of each rating; ratings absent here cost 0 per point.
 * @param {number[]} [d.modDP=[]] Design-Point cost of each installed modification
 * @param {number} [d.markUp=1] Mark-Up Factor (GM-set; base + class/performance mods)
 * @returns {{ designPoints:number, cost:number }}
 */
export function vehicleDesign({ chassisDP = 0, powerPlantDP = 0, improvements = {}, costPerPoint = DESIGN_OPTION_COSTS, modDP = [], markUp = 1 } = {}) {
  let dp = (chassisDP || 0) + (powerPlantDP || 0);
  for (const rating of Object.keys(improvements)) {
    dp += (improvements[rating] || 0) * (costPerPoint[rating] || 0);
  }
  dp += (modDP || []).reduce((sum, m) => sum + (m || 0), 0);
  return { designPoints: dp, cost: dp * (markUp || 1) * 100 };
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

/**
 * Parse a design-table cell to a finite number, or null. The Chassis / Power
 * Plant tables store some cells as drone formulas ("5x8" = ×Body) or as null
 * (camera-shadowed captures); those aren't directly usable by the point-buy.
 * @param {*} v
 * @returns {number|null}
 */
export function designNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Only accept strings that are PURELY a number — reject formula/range cells
  // like "5x8" (= ×Body) or "0-8", which parseFloat would silently truncate.
  if (typeof v === "string" && /^\s*-?\d*\.?\d+\s*$/.test(v)) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const _clampMax = (val, max) => {
  const m = designNum(max);
  return m === null ? val : Math.min(val, m);
};

/**
 * Resolve a stored vehicle design against the registered design tables into its
 * Design Points, cost, and the concrete base stats to write onto the vehicle.
 *
 * The DP/cost math is the verified part (see {@link vehicleDesign}). Stat
 * application uses each table's STARTING value plus the bought improvement
 * delta, clamped to the power plant's / chassis' maximum:
 *   speed = speedStart + Δspeed (≤ speedMax);  accel likewise;
 *   handling = chassisHandling − Δhandling (lower = better, ≥ 1);
 *   armor = chassisArmor + Δarmor;  cargo/load = start + Δ (≤ max);
 *   body/signature/pilot/sensor/autonav/seating come straight from the tables.
 *
 * @param {object} design  stored on the vehicle (system.design)
 * @param {string} design.chassisKey
 * @param {string} design.powerPlantKey
 * @param {Object<string,number>} [design.improvements]
 * @param {number} [design.modDP]   total Design Points of installed mods
 * @param {number} [design.markUp]
 * @param {{chassis:Object<string,object>, powerPlants:Object<string,object>}} tables
 *   the registered, normalized design tables (CONFIG.SR2E.vehicleDesign)
 * @returns {{valid:boolean, missing:string[], designPoints:number, cost:number,
 *   chassis:object|null, powerPlant:object|null, baseStats:object}}
 */
export function resolveVehicleDesign(design = {}, tables = {}) {
  const chassis = tables.chassis?.[design.chassisKey] ?? null;
  const pp      = tables.powerPlants?.[design.powerPlantKey] ?? null;
  const imp     = design.improvements ?? {};
  const markUp  = design.markUp || 1;
  const modDP   = designNum(design.modDP) ?? 0;

  const missing = [];
  if (!design.chassisKey) missing.push("chassis");
  else if (!chassis) missing.push("unknownChassis");
  if (!design.powerPlantKey) missing.push("powerPlant");
  else if (!pp) missing.push("unknownPowerPlant");

  const chassisDP = chassis ? designNum(chassis.dp) : null;
  const ppDP      = pp ? designNum(pp.dp) : null;
  if (chassis && chassisDP === null) missing.push("chassisDP");
  if (pp && ppDP === null) missing.push("powerPlantDP");

  const { designPoints, cost } = vehicleDesign({
    chassisDP: chassisDP ?? 0,
    powerPlantDP: ppDP ?? 0,
    improvements: imp,
    modDP: [modDP],
    markUp
  });

  // Base stats to apply (only meaningful when both rows are present).
  const baseStats = {};
  if (chassis && pp) {
    const ch = (k) => designNum(chassis[k]);
    const pk = (k) => designNum(pp[k]);
    const d  = (k) => designNum(imp[k]) ?? 0;

    // Handling may be an on-road/off-road pair like "4/8" (Rigger 2 cars) — take
    // the on-road (first) value; reject true formula cells ("5x8").
    const handlingBase = ch("handling") ?? designNum(String(chassis.handling ?? "").split("/")[0]);
    if (handlingBase !== null) baseStats.handling = Math.max(1, handlingBase - d("handling"));
    if (pk("speedStart") !== null) baseStats.speed = _clampMax(pk("speedStart") + d("speed"), pp.speedMax);
    if (pk("accelStart") !== null) baseStats.acceleration = _clampMax(pk("accelStart") + d("acceleration"), pp.accelMax);
    if (ch("body") !== null) baseStats.body = ch("body");
    baseStats.armor = (ch("armor") ?? 0) + d("armor");
    if (pk("sig") !== null) baseStats.signature = pk("sig") + d("signature");
    if (ch("pilot") !== null) baseStats.pilot = ch("pilot");
    if (ch("sensor") !== null) baseStats.sensor = ch("sensor");
    if (ch("autonav") !== null) baseStats.autonav = ch("autonav");
    if (ch("cargoStart") !== null) baseStats.cargo = _clampMax(ch("cargoStart") + d("cargo"), chassis.cargoMax);
    if (pk("loadStart") !== null) baseStats.load = _clampMax(pk("loadStart") + d("load"), pp.loadMax);
    if (chassis.seating != null) baseStats.seating = String(chassis.seating);
    baseStats.cost = cost;
  }

  return {
    valid: missing.length === 0,
    missing,
    designPoints,
    cost,
    chassis,
    powerPlant: pp,
    baseStats
  };
}

/**
 * The Design-Point cost of a single vehicle modification as a design option
 * (Rigger 2 "Design Cost", book p.118-146). A mod expresses its DP rule on its
 * system data, evaluated against its Rating:
 *   - `dpTable` (array): non-linear DP by rating, e.g. Autonavigation [5,10,50,150]
 *     → dpTable[rating-1] (clamped). Rating 0 = not installed = 0.
 *   - `dpPerLevel` (number): linear per rating level, e.g. Nitrous Oxide 55/level
 *     → dpPerLevel × rating.
 *   - else `designPoints` (number): a flat value (Ring Mount 10, Pintle 1, …).
 * NOTE: power-plant-relative mods (Engine Customization / Turbocharging =
 * power-plant DP × 1.25 …) depend on the build, not the mod alone — those use
 * {@link engineCustomizationCost} (entered via the design's manual "Extra DP").
 * @param {object} m  vehicle_mod system data
 * @returns {number}
 */
export function modDesignPoints(m = {}) {
  return ratedModValue(m.rating, m.designPoints, m.dpPerLevel, m.dpTable);
}

/**
 * Evaluate a per-mod value (Design Points, CF Consumed, or Load Reduction)
 * against a Rating, with the same precedence used throughout the design system:
 * a `table` (absolute value by rating) overrides; otherwise `flat` base + `perLevel`
 * × rating (additive, e.g. Life Support DP = 5 + 1/level, armor CF = 2/Armor Point).
 * @returns {number}
 */
export function ratedModValue(rating, flat, perLevel, table) {
  const r = designNum(rating) ?? 0;
  if (Array.isArray(table) && table.length) {
    if (r < 1) return 0;
    return designNum(table[Math.min(r, table.length) - 1]) ?? 0;
  }
  return (designNum(flat) ?? 0) + (designNum(perLevel) ?? 0) * Math.max(r, 0);
}

/** Cargo Factor a mod consumes from the chassis' Cargo Rating (book p.115). */
export function modCfConsumed(m = {}) {
  return ratedModValue(m.rating, m.cfConsumed, m.cfPerLevel, m.cfTable);
}

/** Kilograms a mod takes from the power plant's Load Rating (book p.115). */
export function modLoadReduction(m = {}) {
  return ratedModValue(m.rating, m.loadReduction, m.loadPerLevel, m.loadTable);
}

/**
 * Sum the contributions of a vehicle's installed modifications to a design.
 * Each mod's Design Points (see {@link modDesignPoints}) fold into the build's DP
 * via {@link resolveVehicleDesign}'s modDP; ¥-priced customization mods add their
 * `cost` on top of the design's computed price. So dragging a mod onto a vehicle
 * moves DP and/or the total cost.
 * @param {Array<object>} mods  vehicle_mod system data
 * @returns {{designPoints:number, cost:number}}
 */
export function aggregateModDesign(mods = []) {
  let designPoints = 0, cost = 0, cf = 0, load = 0;
  for (const m of mods) {
    designPoints += modDesignPoints(m);
    cost += designNum(m?.cost) ?? 0;
    cf += modCfConsumed(m);
    load += modLoadReduction(m);
  }
  return { designPoints, cost, cf, load };
}

// ---------------------------------------------------------------------------
// METAMAGIC — initiate techniques (Grimoire 2nd ed., p.42–46)
// Pure rules math; the sheet/roll flows call these so the numbers are testable.
// ---------------------------------------------------------------------------

/**
 * Centering vs. Drain (Grimoire p.43): every 2 successes on the Centering Test
 * count as 1 extra success on the actual Drain Resistance Test — but only if
 * that Drain test scored at least 1 success on its own.
 * @returns {number} bonus successes to add to the drain resistance
 */
export function centeringDrainBonus(centeringSuccesses, drainSuccesses) {
  if (centeringSuccesses < 2 || drainSuccesses < 1) return 0;
  return Math.floor(centeringSuccesses / 2);
}

/**
 * Centering vs. Penalties (Grimoire p.44): every 2 Centering successes remove 1
 * point of negative TN modifier (never more than the penalty present, and it
 * can only reduce modifiers — never the base target number).
 * @returns {number} points of penalty removed
 */
export function centeringPenaltyReduction(centeringSuccesses, penalty = Infinity) {
  return Math.min(Math.floor(centeringSuccesses / 2), Math.max(0, penalty));
}

/**
 * The Centering Test's own target number when used against penalties
 * (Grimoire p.44): the modified magic TN reduced by the initiate grade,
 * floored at the minimum target number of 2.
 */
export function centeringTestTN(modifiedTN, grade) {
  return Math.max(2, modifiedTN - grade);
}

/**
 * Shielding (Grimoire p.45): an initiate gains bonus spell-defense dice equal
 * to their initiate grade, over and above any Magic Pool dice committed.
 */
export function shieldingBonusDice(grade) {
  return Math.max(0, grade);
}

/**
 * Quickening (Grimoire p.44): the Karma to lock a sustained spell permanently
 * runs from the spell's actual Force (minimum) to twice its Force (the extra
 * making it harder to dispel).
 * @returns {{min:number, max:number}}
 */
export function quickeningKarmaRange(force) {
  const f = Math.max(0, force);
  return { min: f, max: 2 * f };
}

/**
 * Initiation Karma cost (Grimoire p.42): base = 6 + the target grade, times a
 * multiplier — self ×3, group ×2; undertaking an ordeal lowers it to ×2.5 (self)
 * or ×1.5 (group).
 */
export function initiationKarmaCost(targetGrade, { group = false, ordeal = false } = {}) {
  const base = 6 + Math.max(0, targetGrade);
  const mult = group ? (ordeal ? 1.5 : 2) : (ordeal ? 2.5 : 3);
  return Math.floor(base * mult);   // "Always round down" (Grimoire p.41)
}

// ---------------------------------------------------------------------------
// BLAST / AREA EFFECT (SR2 core p.96–97, Grenade Damage Table)
// A blast's Power falls off with distance from ground zero; each target in the
// area resists individually using Body vs (adjusted Power − Impact armor).
// ---------------------------------------------------------------------------

/**
 * Power lost per metre from ground zero by blast type (core p.96): offensive and
 * concussion grenades lose 1 Power/m, defensive loses 2/m ("−1 per half-metre").
 * Unknown types default to the standard 1/m.
 */
export const BLAST_FALLOFF = Object.freeze({ offensive: 1, concussion: 1, defensive: 2 });
export function blastFalloffRate(type) {
  return BLAST_FALLOFF[type] ?? 1;
}

/**
 * Adjusted blast Power at a distance from ground zero (core p.96): base Power
 * minus falloff × distance, floored at 0. A result of 0 means the target is
 * outside the blast. (Offensive Power 10 → 7 at 3 m, 4 at 6 m.)
 */
export function blastPowerAtRange(basePower, distanceMeters, falloffRate = 1) {
  return Math.max(0, basePower - falloffRate * Math.max(0, distanceMeters));
}

/**
 * Farthest distance (metres) at which the blast still has Power ≥ 1 — used to
 * gather affected tokens. (Offensive Power 10, falloff 1 → 9 m; defensive
 * Power 10, falloff 2 → 4 m.)
 */
export function blastRadius(basePower, falloffRate = 1) {
  if (falloffRate <= 0) return Math.max(0, basePower);
  return Math.max(0, Math.floor((basePower - 1) / falloffRate));
}

/**
 * Scatter distance dice and per-success reduction by delivery method (core p.96
 * Grenade Range Table): a standard grenade scatters 1D6 m and the thrower
 * reduces it 2 m per success; aerodynamic grenades and grenade launchers scatter
 * 2D6 / 3D6 m and reduce 4 m per success.
 */
export const SCATTER = Object.freeze({
  standard:    { dice: 1, perSuccess: 2 },
  aerodynamic: { dice: 2, perSuccess: 4 },
  launcher:    { dice: 3, perSuccess: 4 }
});
export function scatterProfile(deliveryType) {
  return SCATTER[deliveryType] ?? SCATTER.standard;
}

/**
 * Final scatter distance after the attack's successes reduce the rolled scatter
 * (core p.96): rolled metres minus successes × per-success reduction, floored at
 * 0 (0 = the grenade lands on the target).
 */
export function scatterDistance(rolledMeters, successes, perSuccess) {
  return Math.max(0, rolledMeters - Math.max(0, successes) * perSuccess);
}

/**
 * Thrown-weapon range brackets (core p.96–97 Grenade Range Table — all throwing
 * weapons use it): the brackets scale with the thrower's Strength. Non-aerodynamic
 * (grenades, throwing knives) reach Str×3 / ×5 / ×10 / ×20 metres; aerodynamic
 * (shuriken, aero grenades) reach Str×3 / ×5 / ×20 / ×30.
 */
export const THROWN_RANGE_MULT = Object.freeze({
  standard:    { short: 3, medium: 5, long: 10, extreme: 20 },
  aerodynamic: { short: 3, medium: 5, long: 20, extreme: 30 }
});
export function thrownRange(strength, aerodynamic = false) {
  const m = aerodynamic ? THROWN_RANGE_MULT.aerodynamic : THROWN_RANGE_MULT.standard;
  const s = Math.max(0, strength);
  return { short: s * m.short, medium: s * m.medium, long: s * m.long, extreme: s * m.extreme };
}

/* ── MOVEMENT (SR2E p.83) — walking & running rates per Combat Phase ── */

/** Running Modifier by metatype (SR2E p.83 Running Table). Default ×3 (human). */
export const RUN_MULTIPLIER = Object.freeze({
  human: 3, elf: 3, ork: 3, dwarf: 2, troll: 2
});

/** Running Modifier for a metatype key (case-insensitive); unknown → 3. */
export function runMultiplierForRace(raceKey) {
  return RUN_MULTIPLIER[String(raceKey ?? "").toLowerCase()] ?? 3;
}

/**
 * Movement rates in metres per Combat Phase (SR2E p.83): walking = Quickness,
 * running = Quickness × the metatype's Running Modifier. Running also imposes a
 * +4 target modifier to tests that phase (applied elsewhere / by the GM).
 * @param {number} quickness
 * @param {number} [runMultiplier=3]
 * @returns {{walk:number, run:number}}
 */
export function movementRates(quickness, runMultiplier = 3) {
  const q = Math.max(0, Math.floor(quickness || 0));
  return { walk: q, run: q * runMultiplier };
}

/* ── INITIATIVE PASSES (SR2E p.78–79) — pure decision helpers for SR2ECombat ── */

/** Initiative left after taking an action: −10, floored at 0 (you simply stop
 * acting at ≤0; never show negatives). */
export function spendInitiative(total) {
  return Math.max(0, (total ?? 0) - 10);
}

/** The next Combat Phase: index of the first combatant with a positive total
 * that isn't defeated, or `null` if nobody can act (clear the turn pointer).
 * `combatants` must already be in descending-initiative order (Foundry's sort). */
export function nextEligibleTurnIndex(combatants) {
  const i = combatants.findIndex(c => (c.initiative ?? 0) > 0 && !c.isDefeated);
  return i === -1 ? null : i;
}

/** IDs of the combatants that re-roll on a new Combat Turn — the living only.
 * The defeated stay out (null initiative) so a re-rolled corpse can't jump to
 * the top of the tracker. */
export function livingCombatantIds(combatants) {
  return combatants.filter(c => !c.isDefeated).map(c => c.id);
}

/**
 * Skill Memory Table (SR2E p.248) — a skillsoft's Memory cost (Mp) by skill
 * rating 1–10. General covers Active and Knowledge skills; Language covers
 * LinguaSofts. (Concentration/Specialization soft variants aren't modelled.)
 */
export const SKILL_MEMORY = Object.freeze({
  general:  [10, 20, 30, 200, 250, 300, 700, 800, 900, 2000],
  language: [3, 6, 9, 24, 30, 36, 70, 80, 90, 300]
});

/**
 * Per-Mp nuyen rate by skillsoft type (Skillsoft Costs, SR2E p.243).
 *
 * `data` is NOT in the core table — core says DataSoft "Varies with value of
 * data" and prints no rate, which left every DataSoft costing 0. Fields of Fire
 * is the only book that pins one: Mp x 100Y on its consolidated gear list. It's
 * a FLOOR for generic data, not a valuation of paydata — so a DataSoft with an
 * authored cost keeps it (see skillsoftCost).
 */
export const SKILLSOFT_MP_COST = Object.freeze({ active: 100, knowledge: 150, language: 50, data: 100 });

/**
 * Memory (Mp) a skillsoft of the given type + rating consumes (SR2E p.248).
 * LinguaSofts use the Language row; Active/Know skills use General. 0 outside 1–10.
 * @param {string} category - "active" | "knowledge" | "language"
 * @param {number} rating
 */
export function skillsoftMemory(category, rating) {
  const r = Math.round(rating || 0);
  if (r < 1 || r > 10) return 0;
  const row = category === "language" ? SKILL_MEMORY.language : SKILL_MEMORY.general;
  return row[r - 1];
}

/**
 * Nuyen cost of a skillsoft = its Memory (Mp) × the per-type rate (SR2E p.243).
 * 0 for DataSofts / unknown types (cost "varies with the value of the data").
 * @param {string} category - "active" | "knowledge" | "language"
 * @param {number} rating
 */
export function skillsoftCost(category, rating, authoredCost = 0) {
  // A DataSoft's worth is the data, not the megapulses — core explicitly leaves
  // it open ("Varies with value of data"). So an authored price wins for data,
  // and FoF's Mp x 100Y is only the fallback. Skill-bearing softs always derive:
  // their price IS a function of rating.
  if (category === "data" && authoredCost > 0) return authoredCost;
  const rate = SKILLSOFT_MP_COST[category];
  return rate ? skillsoftMemory(category, rating) * rate : 0;
}

/**
 * Shotgun shot-round spread (SR2E p.95, per the Shotgun Spread diagram). The
 * choke (2–10) sets how fast the shot cone widens: every `choke` metres the
 * shot travels, it spreads one more metre to each side AND loses 1 Power while
 * the attacker's TN drops 1 (wider = easier to hit, but weaker). So at distance
 * d with choke C: steps = ⌊d/C⌋ → −steps Power, −steps TN, reaching steps+1
 * metres to each side of the centre line. (Choke 3: 0–3 m no penalty/1 m spread;
 * 3–6 m −1/−1, 2 m; 6–9 m −2/−2, 3 m.)
 * @param {number} choke           - 2–10
 * @param {number} distanceMeters
 * @returns {{steps:number, powerPenalty:number, tnModifier:number, halfWidthM:number}}
 */
export function shotgunSpread(choke, distanceMeters) {
  const c = Math.min(10, Math.max(2, Math.round(choke || 2)));
  const steps = Math.max(0, Math.floor(Math.max(0, distanceMeters) / c));
  return { steps, powerPenalty: steps, tnModifier: -steps || 0, halfWidthM: steps + 1 };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Firearm accessories (SR2E p.240–241) and their combat effects (p.88–90)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Range brackets in order, for scope shifting (Weapon Range Table, p.88). */
export const RANGE_BRACKETS = ["short", "medium", "long", "extreme"];

/**
 * Image Modification Systems (SR2E p.88): a magnifying scope shortens the
 * weapon's range category by its rating — "Long range would change to short
 * range" for a Rating 2 scope. Short range is the floor.
 *
 * @param {string} bracket - Actual range bracket ("short".."extreme").
 * @param {number} shift   - Scope magnification rating (levels to shift left).
 * @returns {string} The effective range bracket.
 */
export function shiftRangeBracket(bracket, shift) {
  const i = RANGE_BRACKETS.indexOf(bracket);
  if (i < 0 || !(shift > 0)) return bracket;
  return RANGE_BRACKETS[Math.max(0, i - Math.floor(shift))];
}

/**
 * Aggregate the mechanical effects of the accessories attached to one weapon.
 *
 * Recoil compensation is cumulative across accessories and with the weapon's
 * own compensation (p.90; the p.92–93 example stacks a Rating 3 gas vent with
 * a shock pad for 4 points). Bipods/tripods only brace the weapon when set up
 * (p.240–241), so their compensation is gated on `deployed`.
 *
 * The laser sight's −1 is returned separately (`laserMod`): it only works out
 * to 50 metres and never combines with a smartlink bonus (p.90, p.240) — the
 * caller applies those gates.
 *
 * @param {Array<{system: object}>} accessories - Gear items linked to the weapon.
 * @param {{deployed?: boolean}} [opts]
 * @returns {{recoilComp:number, tnMod:number, laserMod:number, gyroRating:number,
 *            rangeShift:number, grantsSmartgun:boolean, needsDeployment:string[]}}
 */
export function accessorySummary(accessories, { deployed = false } = {}) {
  const out = { recoilComp: 0, tnMod: 0, laserMod: 0, gyroRating: 0,
                rangeShift: 0, grantsSmartgun: false, needsDeployment: [] };
  for (const a of accessories) {
    const s = a.system ?? a;
    if (s.requiresDeployment) {
      out.needsDeployment.push(a.name ?? "accessory");
      if (deployed) out.recoilComp += s.accessoryRecoilComp ?? 0;
    } else {
      out.recoilComp += s.accessoryRecoilComp ?? 0;
    }
    if (s.laserSight) out.laserMod += s.combatTnMod ?? 0;
    else              out.tnMod    += s.combatTnMod ?? 0;
    out.gyroRating = Math.max(out.gyroRating, s.gyroRating ?? 0);
    out.rangeShift = Math.max(out.rangeShift, s.rangeShift ?? 0);
    if (s.grantsSmartgun) out.grantsSmartgun = true;
  }
  return out;
}

/**
 * Gyro-stabilization (SR2E p.90): "The total recoil and movement modifiers
 * are reduced by −1 for every point of gyro-stabilization the system
 * provides." Cumulative with recoil compensation (which is applied first via
 * recoilPenalty); it never reduces non-recoil, non-movement modifiers.
 *
 * @param {number} rating        - Gyro mount rating (5 standard / 6 deluxe).
 * @param {number} recoilPenalty - Net recoil TN penalty after recoil comp.
 * @param {number} movementMod   - Attacker movement TN modifier (walk/run).
 * @returns {number} Points of penalty removed (subtract from the TN).
 */
export function gyroReduction(rating, recoilPenalty, movementMod) {
  if (!(rating > 0)) return 0;
  return Math.min(rating, Math.max(0, recoilPenalty) + Math.max(0, movementMod));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Worn armor (SR2E p.242) and heavy-armor Combat Pool reduction (p.84)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Layered armor detection: explicit flag, or the two book exceptions —
 * helmets "add [their] rating to other exterior armor" (p.242) and
 * form-fitting body armor layers under other armor (SSC). */
function isLayeredArmor(item) {
  return !!item.system?.isLayered || /helmet|form.?fit/i.test(item.name ?? "");
}

/**
 * Total worn armor (SR2E p.242): "No matter how many pieces of armor are
 * worn, only the highest rating counts for Damage Resistance Tests."
 * Layered pieces (helmets, form-fitting body armor) ADD to that highest
 * rating instead. Ballistic and impact are evaluated independently.
 *
 * @param {Array<{name?:string, system:{ballistic?:number, impact?:number,
 *                isLayered?:boolean, equipped?:boolean}}>} items
 *        Equipped armor items (pre-filtered by the caller).
 * @returns {{ballistic:number, impact:number}}
 */
export function wornArmorTotals(items) {
  let bBest = 0, iBest = 0, bAdd = 0, iAdd = 0;
  for (const a of items) {
    const s = a.system ?? a;
    if (isLayeredArmor(a)) {
      bAdd += s.ballistic || 0;
      iAdd += s.impact || 0;
    } else {
      bBest = Math.max(bBest, s.ballistic || 0);
      iBest = Math.max(iBest, s.impact || 0);
    }
  }
  return { ballistic: bBest + bAdd, impact: iBest + iAdd };
}

/**
 * Heavy-armor Combat Pool reduction (SR2E p.84): partial or full heavy armor
 * reduces the Combat Pool by 1 die for every point of Ballistic Armor Rating
 * over the wearer's Quickness.
 *
 * @param {number} quickness - Wearer's Quickness rating.
 * @param {Array<{system:{ballistic?:number, heavyArmor?:boolean}}>} items
 *        Equipped armor items (pre-filtered by the caller).
 * @returns {number} Dice removed from the Combat Pool (≥ 0).
 */
export function heavyArmorPoolPenalty(quickness, items) {
  let penalty = 0;
  for (const a of items) {
    const s = a.system ?? a;
    // Flag, with a name fallback so pre-0.26 world copies still count
    if (!s.heavyArmor && !/heavy armor|military armor/i.test(a.name ?? "")) continue;
    penalty += Math.max(0, (s.ballistic || 0) - Math.max(0, quickness));
  }
  return penalty;
}

/**
 * Concentration/Specialization ratings from the FINAL general skill rating
 * (SR2E p.55, p.70). Allocating 5 points with a Specialization yields
 * general 3 / concentration 5 / specialization 7 — so concentration rolls
 * general + 2 and specialization general + 4.
 *
 * @param {number} general - The skill's final (already reduced) general rating.
 * @returns {{concentration:number, specialization:number}}
 */
export function skillSubRatings(general) {
  const g = Math.max(0, general || 0);
  return { concentration: g + 2, specialization: g + 4 };
}

/**
 * Street price of an item: base cost × Street Index, rounded to the nearest
 * nuyen (SR2E p.238: legal-channel prices are list; the street marks gear up
 * or down by its Street Index). SI ≤ 0 / missing means "no street market
 * data" and is treated as list price.
 *
 * @param {number} cost - Base (list) cost in nuyen.
 * @param {number|string} streetIndex - Street Index multiplier.
 * @returns {number}
 */
export function streetPrice(cost, streetIndex) {
  const si = parseFloat(streetIndex);
  const c = Math.max(0, cost || 0);
  return (si > 0) ? Math.round(c * si) : c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Knockdown / stopping power (SR2E p.91)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Knockdown Body-Test target number (SR2E p.91): one-half the attack's Power,
 * rounded down. Gel rounds instead use the FULL Power (they knock down more
 * readily). Minimum 2.
 * @param {number} power
 * @param {boolean} [gel=false]
 * @returns {number}
 */
export function knockdownTN(power, gel = false) {
  const p = Math.max(0, power || 0);
  return Math.max(2, gel ? p : Math.floor(p / 2));
}

/**
 * Successes needed to stay firmly on your feet (SR2E p.91): half the damage
 * done, i.e. Light 1 / Moderate 2 / Serious 3. Deadly always knocks down
 * (Infinity — unreachable).
 * @param {"L"|"M"|"S"|"D"} level
 * @returns {number}
 */
export function knockdownThreshold(level) {
  return { L: 1, M: 2, S: 3, D: Infinity }[level] ?? 1;
}

/**
 * Resolve a knockdown Body Test (SR2E p.91). A Deadly wound always drops the
 * target; otherwise: successes ≥ threshold = no effect, 0 successes = prone,
 * anything between = a 1-metre stagger (still standing).
 * @param {"L"|"M"|"S"|"D"} level - the damage level actually dealt
 * @param {number} successes - Body Test successes
 * @returns {"none"|"stagger"|"prone"}
 */
export function knockdownOutcome(level, successes) {
  if (level === "D") return "prone";
  const s = Math.max(0, successes || 0);
  if (s === 0) return "prone";
  if (s >= knockdownThreshold(level)) return "none";
  return "stagger";
}

/**
 * Reaction base (SR2E p.60): ⌊(Quickness + Intelligence) / 2⌋. Quickness gained
 * from Muscle Replacement / Muscle Augmentation is EXCLUDED — "this change does
 * not affect Reaction" (p.249) — though it still counts for Combat Pool and
 * skill tests.
 * @param {number} quickness - augmented Quickness value
 * @param {number} intelligence - augmented Intelligence value
 * @param {number} [exemptQuickness=0] - Quickness from muscle aug that must not feed Reaction
 * @returns {number}
 */
export function reactionBase(quickness, intelligence, exemptQuickness = 0) {
  return Math.floor((Math.max(0, quickness - exemptQuickness) + intelligence) / 2);
}

/** Item types whose nuyen cost counts against the chargen Resources budget. */
export const CHARGEN_RESOURCE_TYPES = ["weapon", "armor", "gear", "ammo", "cyberware", "bioware", "focus", "lifestyle"];

/**
 * An attribute's natural, unaugmented rating: what the character has before any
 * cyber/bio/adept/Active-Effect modifier.
 *
 * The two Companion Attribute Edges (p.24) both land here rather than in the
 * modifier total, because the book bounds them the way it bounds the natural
 * rating and a modifier would escape the clamp:
 *  - **Bonus Attribute Point** (`edgeBonus`) raises the RATING, and "cannot
 *    raise the Attribute Ratings of characters beyond the racial maximums."
 *  - **Exceptional Attribute** (`maxBonus`) raises that attribute's racial
 *    MAXIMUM by 1 and explicitly does NOT raise the rating with it.
 *
 * Pass `racialMax = null` for an attribute with no published maximum, which
 * leaves the rating unclamped.
 *
 * @param {number} base - the rating bought at character creation
 * @param {number} [racial=0] - the metatype's modifier
 * @param {number} [edgeBonus=0] - Bonus Attribute Points applied to this attribute
 * @param {number|null} [racialMax=null] - the metatype's maximum, or null for none
 * @param {number} [maxBonus=0] - Exceptional Attribute's raise to that maximum
 * @returns {number}
 */
export function naturalAttribute(base, racial = 0, edgeBonus = 0, racialMax = null, maxBonus = 0) {
  const natural = (Number(base) || 0) + (Number(racial) || 0) + (Number(edgeBonus) || 0);
  if (racialMax === null || racialMax === undefined) return natural;
  return Math.min(natural, (Number(racialMax) || 0) + (Number(maxBonus) || 0));
}

/**
 * Whether two ammo items are the same pile and may be merged.
 *
 * Shape equality is ALWAYS required — a shared compendium source never
 * overrides it, because the drop path is `fromUuid().toObject()` + create and
 * nothing guarantees `compendiumSource` is populated (packs-src has it null).
 * Two *conflicting* sources block the merge; a missing source on either side
 * falls back to shape alone.
 *
 * `cost` is part of the shape: for ammo it means "price of this whole bundle",
 * so a 10-round box at 15¥ and a 50-round belt at 100¥ are NOT the same pile
 * even if they fire identically.
 *
 * @param {object} a - plain ammo data: {src, name, ammoType, damageModifier, armorModifier, damageType, armorCalc, streetIndex, cost}
 * @param {object} b
 * @returns {boolean}
 */
export function ammoStacks(a, b) {
  if (!a || !b) return false;
  const SHAPE = ["name", "ammoType", "damageModifier", "armorModifier",
                 "damageType", "armorCalc", "streetIndex", "cost"];
  const sameShape = SHAPE.every((k) => (a[k] ?? null) === (b[k] ?? null));
  if (!sameShape) return false;
  // Both sides carry a source: they must agree. Otherwise shape alone decides.
  if (a.src && b.src) return a.src === b.src;
  return true;
}

/**
 * Whether an update re-opening character creation must be refused.
 *
 * "Creation in progress" is one-way for players: they may finish creation, but
 * only a GM may reopen it. The flag is not cosmetic — while it's set, purchases
 * are auto-charged at LIST price with no Street Index markup, so re-opening
 * creation restores book prices mid-campaign and is a GM call.
 *
 * Only the off -> on transition is blocked; turning it off, a GM doing anything,
 * and updates that leave the flag alone (`next === undefined`) all pass.
 *
 * Pure so it can be tested without Foundry — the veto itself lives in the
 * preUpdateActor hook, and Quench can't cover it because Quench runs as a GM.
 *
 * @param {boolean} isGM
 * @param {boolean} current - the flag's stored value
 * @param {boolean|undefined} next - the flag's incoming value, if the update sets it
 * @returns {boolean} true if the update should be vetoed
 */
export function blocksChargenReopen(isGM, current, next) {
  if (isGM) return false;
  return next === true && current === false;
}

/** "Players can take no more than 5 bonus Attribute Points." (Companion p.24) */
export const MAX_BONUS_ATTRIBUTE_POINTS = 5;

/**
 * The two limits the Companion places on the Attribute Edges (p.24), checked
 * against a character's quality items.
 *
 * Both are unqualified: "Players can take no more than 5 bonus Attribute
 * Points," and "Player characters can take Exceptional Attribute only once per
 * Attribute." The book's one GM override — "Unless authorized by the
 * gamemaster" — attaches solely to *exceeding racial maximums*, so it does not
 * license going past either of these. They're still only reported, never
 * blocked: the whole chargen panel is informational (see the sheet), and a GM
 * who wants to break a rule shouldn't have to fight the sheet to do it.
 *
 * Only Edges with an `attribute` set are counted — one without a target does
 * nothing mechanically, so charging it against the cap would be a false alarm.
 *
 * @param {{attribute?:string, attributeBonus?:number, maximumBonus?:number}[]} [qualities]
 * @returns {{bonusTotal:number, bonusOverCap:boolean, exceptionalRepeats:string[]}}
 */
export function attributeEdgeViolations(qualities = []) {
  const applied = qualities.filter((q) => q?.attribute);
  const bonusTotal = applied.reduce((s, q) => s + (Number(q.attributeBonus) || 0), 0);
  const maxByAttr = {};
  for (const q of applied) {
    const raise = Number(q.maximumBonus) || 0;
    if (raise) maxByAttr[q.attribute] = (maxByAttr[q.attribute] ?? 0) + raise;
  }
  return {
    bonusTotal,
    bonusOverCap: bonusTotal > MAX_BONUS_ATTRIBUTE_POINTS,
    exceptionalRepeats: Object.keys(maxByAttr).filter((a) => maxByAttr[a] > 1).sort()
  };
}

/**
 * Character-creation point spend per category, versus the allotment granted by
 * the chosen priorities (SR2E p.44–45). Pure counting — the caller pulls plain
 * data off the actor so this stays testable.
 *
 * - Attributes: sum of the six Physical/Mental **base** ratings. Reaction,
 *   Essence and Magic are Special Attributes (not bought), so they're excluded.
 *   Bonus Attribute Points (Companion p.24) are bought with Edge, not with the
 *   attribute budget; they live outside `base` (see naturalAttribute) and so are
 *   excluded here for free.
 * - Skills: sum of **Active + Build/Repair** skill ratings. Knowledge, Language
 *   and Special skills follow the p.74 special rules (native language is free,
 *   others need GM approval), so they are NOT charged against the skill budget.
 * - Resources: sum of the **list** nuyen cost of owned gear (chargen pays list
 *   price with no Street Index), priced at the item's rating and grade × quantity.
 * - Force Points (magicians only): sum of spell Force + focus Bonding cost.
 *
 * @param {object} data
 * @param {{base:number}[]} [data.attributes] - the six physical/mental attributes
 * @param {{category:string, rating:number}[]} [data.skills]
 * @param {{type:string, cost:number, rating?:number, grade?:string, ratingStats?:Array,
 *          quantity?:number, force?:number, bondingCost?:number}[]} [data.items]
 * @param {{attributes?:number, skills?:number, resources?:number, forcePoints?:number}} [allot]
 * @returns {{attributes:object, skills:object, resources:object, forcePoints:object}}
 *          each row is {spent, total, remaining, over}
 */
export function chargenSpend({ attributes = [], skills = [], items = [] } = {}, allot = {}) {
  const attrSpent = attributes.reduce((s, a) => s + (a.base ?? 0), 0);
  const skillSpent = skills
    .filter((k) => k.category === "active" || k.category === "build_repair")
    .reduce((s, k) => s + (k.rating ?? 0), 0);
  // Price each item through itemBaseCost, not its flat `cost`: a rated item
  // keeps its prices in ratingStats (its flat cost is often 0), and a grade
  // multiplies them. Reading `cost` alone counted rated ware as free and ignored
  // alpha/beta/cultured entirely.
  const resSpent = items
    .filter((i) => CHARGEN_RESOURCE_TYPES.includes(i.type))
    .reduce((s, i) => s + itemBaseCost(i) * (i.quantity ?? 1), 0);
  const forceSpent = items.reduce((s, i) => {
    if (i.type === "spell") return s + (i.force ?? 0);
    if (i.type === "focus") return s + (i.bondingCost ?? 0);
    return s;
  }, 0);
  const row = (spent, total) => ({ spent, total, remaining: total - spent, over: spent > total });
  return {
    attributes:  row(attrSpent, allot.attributes ?? 0),
    skills:      row(skillSpent, allot.skills ?? 0),
    resources:   row(resSpent, allot.resources ?? 0),
    forcePoints: row(forceSpent, allot.forcePoints ?? 0)
  };
}

/**
 * Power-point cost of a single physical-adept power (SR2E p.124–126). Most
 * powers are linear (pointCost × level), but two are not:
 *  - **Increased Reflexes**: 1 / 4 / 6 total for 1 / 2 / 3 Initiative dice (p.126).
 *  - **Increased Reaction**: tiered by how the bonus compares to the racial
 *    Reaction maximum — 0.5/+1 up to ½ max, 1/+1 up to max, 2/+1 up to 1.5×max.
 * Identified by name so the compendium data can stay simple.
 *
 * @param {{name?:string, pointCost?:number, level?:number}} power
 * @param {number} [racialReactionMax=6] - the adept's racial Reaction maximum
 * @returns {number} power points spent on this power
 */
export function adeptPowerCost(power, racialReactionMax = 6) {
  const level = Math.max(1, power.level ?? 1);
  const name = power.name ?? "";
  if (/increased reflexes/i.test(name)) {
    return [1, 4, 6][Math.min(level, 3) - 1] ?? 6;
  }
  if (/increased reaction/i.test(name)) {
    const half = Math.floor(racialReactionMax / 2);
    let cost = 0;
    for (let i = 1; i <= level; i++) {
      if (i <= half) cost += 0.5;
      else if (i <= racialReactionMax) cost += 1;
      else cost += 2;
    }
    return cost;
  }
  return (power.pointCost ?? 0) * level;
}

// ───────────────────────────────────────────────────────────────────────────
// VIRTUAL REALITIES 2.0 — Matrix 2.0 primitives (FASA7904)
//
// Pure rules for the optional VR2.0 Matrix ruleset. These are inert until the
// `matrixRuleset` world setting is "vr2"; the core-book Matrix is unchanged.
// All values verified against the VR2.0 PDF / docs/AUDIT-VR2.md (page cites).
// ───────────────────────────────────────────────────────────────────────────

/** Cybercombat Target Numbers Table (VR2.0 p.123): TN by host Security Code
 *  and the target icon's status. */
export const CYBERCOMBAT_TN = {
  blue:   { intruding: 6, legitimate: 3 },
  green:  { intruding: 5, legitimate: 4 },
  orange: { intruding: 4, legitimate: 5 },
  red:    { intruding: 3, legitimate: 6 }
};

/**
 * Cybercombat attack target number (VR2.0 p.123). Depends only on the host's
 * Security Code and whether the target icon is intruding or legitimate — not on
 * the target's Bod or the node's numeric rating.
 * @param {"blue"|"green"|"orange"|"red"} securityCode
 * @param {"intruding"|"legitimate"} [iconStatus="intruding"]
 * @returns {number}
 */
export function cybercombatTN(securityCode, iconStatus = "intruding") {
  return CYBERCOMBAT_TN[securityCode]?.[iconStatus] ?? 4;
}

/**
 * IC attack Damage Level, fixed by the host's Security Code before staging
 * (VR2.0 IC Damage Table, p.124): Blue/Green = Moderate, Orange/Red = Serious.
 * @param {"blue"|"green"|"orange"|"red"} securityCode
 * @returns {"M"|"S"}
 */
export function icDamageLevel(securityCode) {
  return (securityCode === "orange" || securityCode === "red") ? "S" : "M";
}

/**
 * Dump-shock Stun Damage Code (VR2.0 p.124). Power = the host's Security Value,
 * Damage Level from the Dump Shock Damage Levels table (Blue L / Green M /
 * Orange S / Red D). A cool deck and ICCM each cut Power by 2 and the Level by
 * one step (they stack); tortoise users are immune. Returns null when there is
 * no effective damage (immune or fully mitigated).
 * @param {"blue"|"green"|"orange"|"red"} securityCode
 * @param {number} securityValue - host Security Value (the damage Power)
 * @param {{coolDeck?:boolean, iccm?:boolean, tortoise?:boolean}} [opts]
 * @returns {{power:number, level:"L"|"M"|"S"|"D", type:"stun"}|null}
 */
export function dumpShockDamage(securityCode, securityValue, opts = {}) {
  if (opts.tortoise) return null;                       // immune (p.124)
  const baseIdx = { blue: 0, green: 1, orange: 2, red: 3 }[securityCode];
  if (baseIdx == null) return null;
  let power = securityValue;
  let levelIdx = baseIdx;
  if (opts.coolDeck) { power -= 2; levelIdx -= 1; }
  if (opts.iccm)     { power -= 2; levelIdx -= 1; }
  if (power <= 0 || levelIdx < 0) return null;          // fully mitigated
  return { power, level: DAMAGE_LEVELS[Math.min(levelIdx, 3)], type: "stun" };
}

/**
 * Detection Factor (VR2.0 p.17–18): the average (round up) of the decker's
 * Masking rating and the rating of a running Sleaze-type utility. Gates
 * proactive System Tests against the decker.
 * @param {number} masking
 * @param {number} [sleazeRating=0] - rating of a running Sleaze utility (0 if none)
 * @returns {number}
 */
export function detectionFactor(masking, sleazeRating = 0) {
  return Math.ceil((masking + sleazeRating) / 2);
}

/**
 * Program price multiplier tier (VR2.0 Program Prices Table, p.107): the flat
 * ×100 of the core book becomes a rating-banded multiplier.
 * @param {number} rating
 * @returns {100|200|500|1000}
 */
export function matrixProgramMultiplierVR2(rating) {
  if (rating >= 10) return 1000;
  if (rating >= 7)  return 500;
  if (rating >= 4)  return 200;
  return 100;
}

/**
 * VR2.0 program price (p.107): size (Rating² × sizeMultiplier) × the banded
 * price multiplier for the rating.
 * @param {number} rating
 * @param {number} sizeMultiplier - the program's per-type size factor
 * @returns {number}
 */
export function programCostVR2(rating, sizeMultiplier) {
  return programSize(rating, sizeMultiplier) * matrixProgramMultiplierVR2(rating);
}

/**
 * VR2.0 program Street Index (p.107): 1 / 1.5 / 2 / 3 by rating band.
 * @param {number} rating
 * @returns {1|1.5|2|3}
 */
export function programStreetIndexVR2(rating) {
  if (rating >= 10) return 3;
  if (rating >= 7)  return 2;
  if (rating >= 4)  return 1.5;
  return 1;
}

/** VR2.0 Condition Monitor Table (p.124): boxes an icon fills per Damage Level.
 *  Note this differs from the meat-body track (L1/M3/S6/D10). */
export const MATRIX_CONDITION_BOXES = { L: 1, M: 2, S: 3, D: 6 };

/**
 * Boxes a Matrix icon's Condition Monitor fills for a Damage Level (VR2.0 p.124).
 * @param {"L"|"M"|"S"|"D"} level
 * @returns {number}
 */
export function matrixConditionBoxes(level) {
  return MATRIX_CONDITION_BOXES[level] ?? 0;
}

/**
 * Resolve a VR2.0 cybercombat hit (p.123–124). The attack has a base Damage
 * Level; the attacker's successes stage it UP (1 level per 2, clamped at
 * Deadly), then the target's Damage Resistance successes stage it DOWN (1 per
 * 2). Returns the final level and the Condition-Monitor boxes it fills, or
 * {level:null, boxes:0} when fully resisted (staged below Light). The Power /
 * armor-utility reduction is handled at roll time (it sets the resist TN); this
 * pure helper only stages the level.
 * @param {"L"|"M"|"S"|"D"} baseLevel
 * @param {number} attackerSuccesses
 * @param {number} resistSuccesses
 * @returns {{level:("L"|"M"|"S"|"D"|null), boxes:number}}
 */
export function matrixCombatOutcome(baseLevel, attackerSuccesses, resistSuccesses) {
  const staged = stageLevel(baseLevel, netToSteps(attackerSuccesses));  // up, clamps at D
  const idx = DAMAGE_LEVELS.indexOf(staged) - netToSteps(resistSuccesses);
  if (idx < 0) return { level: null, boxes: 0 };
  const level = DAMAGE_LEVELS[idx];
  return { level, boxes: matrixConditionBoxes(level) };
}

/** VR2.0 flat Condition Monitor size — every icon has 10 boxes (p.123). */
export const MATRIX_MONITOR_MAX = 10;

/** Simsense-overload Willpower-test TN by the icon's Damage Level (VR2.0 p.124,
 *  Overload Damage Target Numbers). Deadly auto-crashes (no test) → null. */
export const SIMSENSE_OVERLOAD_TN = { L: 2, M: 3, S: 5 };

/**
 * Willpower-test TN a decker resists simsense overload at, from white/gray IC
 * (VR2.0 p.124). Returns null for Deadly (the icon auto-crashes and the decker
 * is dumped instead of testing). Hot-DNI +2 and ICCM −2 are applied at roll
 * time.
 * @param {"L"|"M"|"S"|"D"} level
 * @returns {number|null}
 */
export function simsenseOverloadTN(level) {
  return SIMSENSE_OVERLOAD_TN[level] ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// SKILL WEB defaulting (SR2E p.68–69)
//
// The web is a DIRECTED graph. Two ways to default, each adding +2 per circle
// crossed along the cheapest legal (arrow-respecting) path:
//   • related skill — trace from the desired skill → a skill the character has
//   • attribute     — trace from an attribute → the desired skill
// Some skills "simply do not connect" (p.69) → no default possible (null).
// The graph DATA lives in CONFIG.SR2E.skillWeb; this algorithm is pure so it can
// be unit-tested with a fixture and with the real web.
// ───────────────────────────────────────────────────────────────────────────

/** Attribute node keys that can seed an attribute-default (SR2E p.69). */
export const WEB_ATTRIBUTES = ["body", "quickness", "strength", "charisma", "intelligence", "willpower", "reaction"];

/** Directed adjacency over the route graph's `links`. Circle counts are the
 *  edge weights; junctions (ids not in `nodes`) are just zero-labelled waypoints.
 *  dir: "both" (default), "aToB" (from→to only), "bToA" (to→from only). */
function webAdjacency(web) {
  const adj = new Map();
  const add = (a, b, w) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ node: b, w }); };
  for (const l of web?.links ?? []) {
    const w = l.circles ?? 0;
    if (l.dir !== "bToA") add(l.from, l.to, w);
    if (l.dir !== "aToB") add(l.to, l.from, w);
  }
  return adj;
}

/**
 * Shortest legal Skill Web route from one entity anchor to another, by number
 * of black circles crossed (SR2E p.68–69). Circles are the cost; junctions and
 * arrow landings are free; one-way arrows block travel against them. Returns
 * null when no legal route exists (defaulting is not allowed — do NOT assign a
 * penalty). Mirrors the reference `findBestPath` contract.
 *
 * @param {{links: {from:string,to:string,circles?:number,dir?:string}[]}} web
 * @param {string} fromId  starting entity id (attribute or skill)
 * @param {string} toId    destination entity id
 * @returns {{from:string,to:string,circles:number,targetNumberModifier:number,path:string[]}|null}
 */
export function findBestPath(web, fromId, toId) {
  if (fromId === toId) return { from: fromId, to: toId, circles: 0, targetNumberModifier: 0, path: [fromId] };
  const adj = webAdjacency(web);
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const seen = new Set();
  while (true) {
    let u = null, best = Infinity;
    for (const [n, d] of dist) if (!seen.has(n) && d < best) { best = d; u = n; }
    if (u == null || u === toId) break;
    seen.add(u);
    for (const { node: v, w } of adj.get(u) ?? []) {
      const nd = best + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  if (!dist.has(toId)) return null;
  const path = [toId];
  for (let c = toId; c !== fromId; ) { c = prev.get(c); path.unshift(c); }
  const circles = dist.get(toId);
  return { from: fromId, to: toId, circles, targetNumberModifier: circles * 2, path };
}

/**
 * Minimum Skill Web defaulting TN penalty for rolling `target` untrained
 * (SR2E p.68–69). Considers attribute defaulting (attribute → target) and
 * related-skill defaulting (target → an owned skill), returning the cheaper.
 * Ties favour the related skill (you roll its rating — usually more dice).
 * Returns null when the skill cannot be reached from any attribute or owned
 * skill (an unconnected skill — defaulting is not allowed).
 *
 * @param {object} web  the route graph (CONFIG.SR2E.skillWeb)
 * @param {string} target  desired skill entity id
 * @param {string[]} [owned]  skill entity ids the character has at rating > 0
 * @returns {{penalty:number, source:string, kind:"skill"|"attribute"}|null}
 */
export function webDefaultingTN(web, target, owned = []) {
  let best = null;
  // Selection order (SR2E p.68–69 + house policy): fewest circles wins; on an
  // equal-circle tie a related skill beats an attribute (RAW intent), and among
  // skills the highest-rated one wins (more dice at the same TN). `rating` only
  // participates in the skill-vs-skill tie-break.
  const consider = (circles, source, kind, rating = 0) => {
    if (circles == null) return;
    if (best == null
        || circles < best.circles
        || (circles === best.circles && kind === "skill" && best.kind === "attribute")
        || (circles === best.circles && kind === "skill" && best.kind === "skill" && rating > best.rating)) {
      best = { circles, source, kind, rating };
    }
  };

  // Attributes first, so the skill-over-attribute tie-break can replace them.
  for (const a of WEB_ATTRIBUTES) {
    const p = findBestPath(web, a, target);
    if (p) consider(p.circles, a, "attribute");
  }

  // Owned skills: accept {node, rating} or a bare node string (rating 0). Dedup
  // by node keeping the MAX rating, so a later lower-rated item on the same node
  // can't clobber a higher one before the tie-break sees it.
  const byNode = new Map();
  for (const o of owned) {
    const node = typeof o === "string" ? o : o?.node;
    if (!node) continue;
    const rating = typeof o === "string" ? 0 : (Number(o?.rating) || 0);
    byNode.set(node, Math.max(byNode.get(node) ?? 0, rating));
  }
  for (const [node, rating] of byNode) {
    if (node === target) continue;
    const p = findBestPath(web, target, node);
    if (p) consider(p.circles, node, "skill", rating);
  }

  return best ? { penalty: best.circles * 2, source: best.source, kind: best.kind } : null;
}

/**
 * Resolve a skill NAME to its Skill Web node key by exact (case-insensitive)
 * label match. The "(B/R)" suffix is significant — "Throwing Weapons (B/R)" must
 * map to the throwingBR node, NOT collapse onto its parent "Throwing Weapons"
 * (which would make a B/R check default to the attribute instead of the parent
 * skill, SR2E p.68–69).
 * @param {object} web CONFIG.SR2E.skillWeb
 * @param {string} name skill label
 * @returns {string|null} node key
 */
export function webNodeForLabel(web, name) {
  const norm = (s) => (s ?? "").toLowerCase().trim();
  const t = norm(name);
  return Object.keys(web?.nodes ?? {}).find((k) => norm(web.nodes[k].label) === t) ?? null;
}

// --- Bioware / Body Index (Shadowtech FASA7110, p.5–7) ------------------------

/** Cultured bioware is implanted at 0.75× its listed Body Cost (Shadowtech p.7). */
export const BIOWARE_CULTURED_MULTIPLIER = 0.75;

/**
 * A bioware item's effective Body Cost after its grade. Cultured reduces the
 * cost by 25%; standard is unchanged. Non-finite/negative costs normalise to 0
 * so bad imported content can't poison Body Index / Essence totals. Unrounded —
 * callers round only the final sum / display (one canonical representation).
 * @param {number} bodyCost listed (pre-grade) Body Cost
 * @param {string} grade "standard" | "cultured"
 * @returns {number}
 */
export function effectiveBodyCost(bodyCost, grade) {
  const bc = Number(bodyCost);
  if (!Number.isFinite(bc) || bc < 0) return 0;
  return grade === "cultured" ? bc * BIOWARE_CULTURED_MULTIPLIER : bc;
}

/**
 * Body Index = Σ effective Body Cost of INSTALLED bioware (Shadowtech p.6).
 * Returned UNROUNDED (the locked decision: the mechanical total stays raw so
 * overstress thresholds and Essence can't shift; the sheet rounds for display
 * only). The model's collector sums identically, so model == helper.
 * @param {Array<{installed:boolean, bodyCost:number, grade:string}>} rows
 * @returns {number}
 */
export function bodyIndexTotal(rows) {
  let total = 0;
  for (const r of rows ?? []) {
    if (!r?.installed) continue;
    total += effectiveBodyCost(r.bodyCost, r.grade);
  }
  return total;
}

/**
 * Essence lost to bioware. Shadowtech p.6: bioware "costs most characters no
 * Essence Points" — only the magically active (magicians/adepts) pay Essence,
 * equal to the Body Cost. Mundanes pay Body Index only.
 * @param {Array<{installed:boolean, bodyCost:number, grade:string}>} rows
 * @param {boolean} isAwakened
 * @returns {number}
 */
export function biowareEssence(rows, isAwakened) {
  return isAwakened ? bodyIndexTotal(rows) : 0;
}

// --- Matrixware: the cranial cyberdeck / "C2" (Shadowtech p.54–59) ------------

/** Exceeding the MPCP cap costs +4 TN to ALL actions (Shadowtech p.54). */
export const MPCP_OVERLOAD_TN = 4;

/**
 * Maximum MPCP rating a cranial deck may carry: 1.5 × Intelligence, rounded UP
 * (Shadowtech p.54). Installing higher is legal but inflicts MPCP_OVERLOAD_TN
 * on every roll.
 * @param {number} intelligence
 * @returns {number}
 */
export function mpcpMaxRating(intelligence) {
  return Math.ceil(1.5 * (Number(intelligence) || 0));
}

/** Persona module cap: 75% of MPCP, round down (Shadowtech p.55). */
export function personaModuleMax(mpcp) {
  return Math.floor(0.75 * (Number(mpcp) || 0));
}

/** Hardening cap: one-half MPCP, round down (Shadowtech p.56). */
export function hardeningMax(mpcp) {
  return Math.floor((Number(mpcp) || 0) / 2);
}

/** Response cap: MPCP / 4, round down (Shadowtech p.59). */
export function responseMax(mpcp) {
  return Math.floor((Number(mpcp) || 0) / 4);
}

/**
 * Total Essence a cranial cyberdeck costs, summed from its installed components
 * (Shadowtech p.54–59): MPCP = (Rating/10) + 0.1; Persona Module = 0.30;
 * Hardening = 0.3; Transfer (I/O) = 0.1; Response = 0.2. Components rated 0 are
 * simply not installed. Headware memory is a separate implant and is NOT counted
 * here (the C2's own active memory, MPCP × 50 Mp, is dedicated and included).
 * @param {{mpcp:number, hardening:number, ioSpeed:number, response:number}} deck
 * @returns {number} Essence, rounded to 2 dp
 */
export function cranialDeckEssence(deck = {}) {
  const mpcp = Math.max(0, Number(deck.mpcp) || 0);
  if (mpcp <= 0) return 0;                     // no MPCP = no deck
  let e = (mpcp / 10) + 0.1;                   // MPCP
  e += 0.30;                                   // persona module (essential to C2 ops)
  if ((Number(deck.hardening) || 0) > 0) e += 0.3;
  if ((Number(deck.ioSpeed) || 0) > 0)   e += 0.1;   // Transfer
  if ((Number(deck.response) || 0) > 0)  e += 0.2;
  return Math.round(e * 100) / 100;
}

// --- Purchase pricing: rating + grade (Street Samurai Catalog / Shadowtech) ----

/**
 * Custom cyberware grades — Street Samurai Catalog (Revised) p.98.
 *
 * In SR2 "alphaware" is not a generic quality tier: it is *custom cyberware*
 * from a Shadow Clinic, and Alpha/Beta are the only grades the book offers
 * ("The Shadow Clinics to which the characters are most likely to have access
 * offer basic levels of Custom Cyberware: Alpha and Beta"). There is no
 * deltaware in SR2, and the core rulebook has no grade rules at all.
 *
 *          Essence Reduction   Cost Multiple   Damage Resist
 *   Alpha  -20% (×.8)          ×3              5/6
 *   Beta   -40% (×.6)          ×7              4/5
 *
 * damageResist is recorded from the table for completeness; nothing consumes it
 * yet because the system models no cyberware damage (SSC: roll 5 dice vs the
 * Serious/Deadly target, one success ignores the damage entirely).
 *
 * NOTE: Shadowtech p.40 — "None of the cyberware presented in the book is
 * currently available in either alpha or beta grades."
 */
export const CYBERWARE_GRADES = {
  standard: { essenceMultiplier: 1.0, costMultiplier: 1 },
  alpha:    { essenceMultiplier: 0.8, costMultiplier: 3, damageResist: [5, 6] },
  beta:     { essenceMultiplier: 0.6, costMultiplier: 7, damageResist: [4, 5] }
};

/** Bioware grades — Shadowtech p.7. Cultured is ×0.75 Body Cost and ×4 nuyen. */
export const BIOWARE_GRADES = {
  standard: { bodyCostMultiplier: 1.0,                        costMultiplier: 1 },
  cultured: { bodyCostMultiplier: BIOWARE_CULTURED_MULTIPLIER, costMultiplier: 4 }
};

/** Smallest Essence a grade reduction may leave (SSC p.98). */
export const CYBERWARE_GRADE_ESSENCE_FLOOR = 0.05;

/**
 * Cost multiplier for an item's quality grade — the single source of truth,
 * read by both the purchase hooks and CONFIG.SR2E.
 *
 * (Neural bioware is stored at standard grade with its already-cultured price,
 * so it correctly gets ×1 — see the Shadowtech module notes.)
 * @param {string} type item type
 * @param {string} grade item grade
 * @returns {number}
 */
export function gradeCostMultiplier(type, grade) {
  if (type === "cyberware") return CYBERWARE_GRADES[grade]?.costMultiplier ?? 1;
  if (type === "bioware")   return BIOWARE_GRADES[grade]?.costMultiplier ?? 1;
  return 1;
}

/**
 * Essence cost of a piece of cyberware at a given grade (SSC p.98): "Reduce the
 * amount of Base Essence Cost by the percentage listed... Round all numbers up.
 * Essence Cost may never be reduced below .05 in this manner."
 *
 * The book doesn't state a precision for "round up"; hundredths is implied by
 * the .05 floor, and matches how the system stores Essence. The epsilon keeps
 * binary floats (0.8 × 0.3 = 0.24000000000000002) from rounding up a whole cent.
 *
 * The floor applies only to a grade REDUCTION — a standard item authored below
 * .05 keeps its printed value.
 * @param {number} baseEssence
 * @param {string} grade
 * @returns {number}
 */
export function gradeEssenceCost(baseEssence, grade) {
  const base = Math.max(0, Number(baseEssence) || 0);
  const mult = CYBERWARE_GRADES[grade]?.essenceMultiplier ?? 1;
  // No reduction → the authored value stands, untouched (don't re-round it: an
  // item authored to finer precision than hundredths keeps what it was given).
  if (mult === 1) return base;
  // Free ware stays free — nothing has been "reduced below .05" from zero.
  if (base === 0) return 0;
  const cost = Math.ceil((base * mult * 100) - 1e-9) / 100;
  return Math.max(CYBERWARE_GRADE_ESSENCE_FLOOR, cost);
}

/**
 * The ratingStats row that governs a given rating: exact match, else nearest.
 * Extracted so cost and Street Index can never disagree about WHICH row applies.
 * @param {Array<{rating:number}>} ratingStats
 * @param {number} rating
 * @returns {object|null} the row, or null when there is no table
 */
export function ratedRow(ratingStats, rating) {
  if (!ratingStats?.length) return null;
  const rows = [...ratingStats].sort((a, b) => a.rating - b.rating);
  return rows.find(r => r.rating === rating)
    ?? rows.reduce((b, r) => Math.abs(r.rating - rating) < Math.abs(b.rating - rating) ? r : b, rows[0]);
}

/**
 * The base cost of a rated item at a given rating: the governing ratingStats row's
 * cost, or the flat cost when there's no table.
 *
 * NOTE the deliberate asymmetry: a row that EXISTS but has no `cost` yields 0, NOT
 * the flat cost. That is the long-standing behaviour and partial/malformed tables
 * depend on it — `?? flatCost` here would silently re-price them.
 * @param {Array<{rating:number, cost:number}>} ratingStats
 * @param {number} rating
 * @param {number} flatCost
 * @returns {number}
 */
export function ratedCost(ratingStats, rating, flatCost) {
  const row = ratedRow(ratingStats, rating);
  return row ? (row.cost ?? 0) : (flatCost ?? 0);
}

/**
 * The Street Index governing a given rating — the row's, else the flat one.
 *
 * NOT `||`: a numeric 0 is a PRESENT index (free on the street), not an absent one.
 * Only "", null and undefined mean "this row doesn't specify one".
 * @param {Array<{rating:number, streetIndex:*}>} ratingStats
 * @param {number} rating
 * @param {*} flatSI
 * @returns {*}
 */
export function ratedStreetIndex(ratingStats, rating, flatSI) {
  const row = ratedRow(ratingStats, rating);
  const si = row ? row.streetIndex : flatSI;
  return (si === "" || si === null || si === undefined) ? flatSI : si;
}

/**
 * Cost of an item whose price is COMPUTED from other fields rather than authored
 * or read off a rating table. Returns null for everything else.
 *
 * Why this exists: `system.cost` on such an item is the value already derived for
 * its CURRENT configuration — a snapshot, not a formula. Pricing a HYPOTHETICAL
 * configuration (what the purchase hook does when a rating changes) off that
 * snapshot returns the old price, so the delta computes as zero and the change is
 * free. This recomputes from the formula instead.
 *
 * The rules module is Foundry-free: it can read neither `game.settings` (the VR2
 * ruleset) nor a document's `_source` (an authored DataSoft price) nor a sibling
 * item (a weapon focus's bonded Reach). Every caller supplies those via `ctx`.
 *
 * MUST be the only derivation site — `prepareDerivedData` calls it too, or the two
 * drift and the hook prices something the sheet doesn't.
 *
 * @param {object} sys item system data (plus `type`)
 * @param {{authoredCost?:number, vr2?:boolean, bondedWeaponReach?:number|null}} [ctx]
 * @returns {number|null} null when the item's cost is authored/rated, not derived
 */
export function derivedItemCost(sys, ctx = {}) {
  if (!sys) return null;
  // Every branch REFUSES to compute unless it has every input. A caller that
  // projects a partial item (chargenSpend passes no `multiplier`) must fall back to
  // the stored snapshot, not receive NaN — and `NaN ?? fallback` does NOT fall
  // through, so a garbage number here would propagate silently into a nuyen total.
  const num = (v) => (typeof v === "number" && Number.isFinite(v));

  if (sys.type === "gear" && sys.category === "skillsoft") {
    if (!num(sys.rating)) return null;
    return skillsoftCost(sys.grantedSkillCategory, sys.rating, ctx.authoredCost ?? 0);
  }
  if (sys.type === "program") {
    if (!num(sys.rating) || !num(sys.multiplier)) return null;
    return ctx.vr2 ? programCostVR2(sys.rating, sys.multiplier)
                   : programCost(sys.rating, sys.multiplier);
  }
  if (sys.type === "focus") {
    // A WEAPON focus bonded to a weapon prices off that weapon's Reach (p.126) and
    // OVERRIDES the flat per-Force path — mirroring _applyWeaponFoci, which runs
    // after the item's own prepare. Gate on focusType exactly as that pass does:
    // a focus retyped to "spell" while a stale bondedWeaponId lingers must NOT keep
    // weapon pricing, or the hook prices something the sheet doesn't.
    if (sys.focusType === "weapon" && num(ctx.bondedWeaponReach) && num(sys.force)) {
      return weaponFocusCost(ctx.bondedWeaponReach, sys.force);
    }
    if (num(sys.force) && num(sys.costPerForce) && sys.costPerForce > 0) {
      return focusCost(sys.force, sys.costPerForce);
    }
  }
  return null;
}

/**
 * Full base (list) nuyen cost of an item at its rating AND grade — before the
 * Street Index markup. The single source of truth for what a configured item costs.
 * @param {{type:string, grade:string, rating:number, ratingStats:Array, cost:number}} sys
 * @param {{authoredCost?:number, vr2?:boolean, bondedWeaponReach?:number|null}} [ctx]
 * @returns {number}
 */
export function itemBaseCost(sys, ctx = {}) {
  const base = derivedItemCost(sys, ctx)
    ?? ratedCost(sys?.ratingStats, sys?.rating, sys?.cost);
  return base * gradeCostMultiplier(sys?.type, sys?.grade);
}

/**
 * Overstress penalty (Shadowtech p.7): +1 TN to Body tests per whole or partial
 * point the Body Index exceeds its max; zero-floored so it never reads negative.
 * @param {number} value Body Index
 * @param {number} max cap (natural Body)
 * @returns {number}
 */
export function overstressPenalty(value, max) {
  return Math.ceil(Math.max(0, (Number(value) || 0) - (Number(max) || 0)));
}

/**
 * Magical-healing interference (Shadowtech p.6): heal-test TNs rise by half the
 * subject's current Body Index, rounded down.
 * @param {number} bodyIndex
 * @returns {number}
 */
export function biowareHealingTnMod(bodyIndex) {
  return Math.floor((Number(bodyIndex) || 0) / 2);
}

/**
 * Unarmed damage code with a cyber-implant Power bonus folded in — bone lacing
 * (Shadowtech p.42): "Unarmed blows by persons with plastic bone lacing are at
 * (Str + 1)M2, (Str + 2)M2 for aluminum, and (Str + 3)M2 for titanium."
 *
 * NOTE ON THE BOOK'S NOTATION: Shadowtech is a 1st-edition book, and "M2" is 1e
 * damage notation — Power, Level, then the STAGING interval. SR2 made staging
 * universally 2 successes and dropped the trailing digit (the SR2 core lists
 * unarmed as plain "(STR)M Stun"). So the SR2 code is "(Str+1)M", not "(Str+1)M2".
 *
 * Rewrites the formula inside the parens rather than replacing the whole code, so
 * a modified base survives: an adept's Killing Hands "(Str+2)M" plus titanium
 * becomes "(Str+2+3)M", which evaluateDamageCode resolves arithmetically. A plain
 * numeric code ("6M") is wrapped so it stays parseable.
 *
 * @param {string} baseCode e.g. "(Str)M"
 * @param {number} powerBonus 0 = unchanged
 * @returns {string}
 */
export function unarmedDamageCode(baseCode, powerBonus) {
  const bonus = Math.max(0, Math.floor(Number(powerBonus) || 0));
  const code = String(baseCode ?? "").trim();
  if (bonus === 0 || !code) return code;
  const formula = code.match(/^\(([^)]+)\)([LMSD])$/i);
  if (formula) return `(${formula[1]}+${bonus})${formula[2].toUpperCase()}`;
  const simple = code.match(/^(\d+)([LMSD])$/i);
  if (simple) return `(${simple[1]}+${bonus})${simple[2].toUpperCase()}`;
  return code;   // unrecognised shape — leave it alone rather than corrupt it
}

/**
 * Unarmed Power when the wielder opts to do PHYSICAL rather than Stun damage
 * (Shadowtech p.42): "A character with bone lacing can also choose to have his
 * unarmed blows do physical damage, but the Power Level of the attack is halved
 * (round up)."
 * @param {number} power
 * @returns {number}
 */
export function unarmedPhysicalPower(power) {
  return Math.ceil(Math.max(0, Number(power) || 0) / 2);
}

/**
 * Tactical computer initiative cap (Shadowtech p.53): the implant's rating adds
 * to Initiative, but "an Initiative value calculated in this fashion cannot
 * exceed the normal Reaction maximum" — i.e. the highest total the character
 * could have rolled unaided (base + 6 per Initiative die). The book's example:
 * Reaction 4 + 1D6 with a Level 2 computer may add +2 but never exceed 10.
 *
 * The bonus therefore only fills the gap up to that ceiling; it never raises it.
 * @param {number} rolled  base + dice result, before the implant
 * @param {number} rating  tactical computer effective level
 * @param {number} base    adjusted Reaction (initiative base)
 * @param {number} dice    number of Initiative dice
 * @returns {number} final Initiative total
 */
export function tacticalComputerInitiative(rolled, rating, base, dice) {
  const r = Math.max(0, Number(rating) || 0);
  const cap = (Number(base) || 0) + 6 * Math.max(0, Number(dice) || 0);
  return Math.min((Number(rolled) || 0) + r, cap);
}
