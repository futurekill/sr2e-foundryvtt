/**
 * Rigger 2 vehicle combat, the chase (R2 p.41–49; docs/PLAN-vehicles-phase2.md Part 3a). Pure: no Foundry globals.
 * Every table below was read from 300-dpi renders of the page cited.
 */

/** Vehicle Points Table (p.42), in printed order. Keys are the stored `VehicleData.r2Class` values. */
export const VEHICLE_POINTS = {
  car: 0, sportsCar: 3, motorcycle: 5, limousine: -3, heavyTruck: -5, tractorTrailer: -7, tracked: -3,
  ultralight: 10, helicopter: 5, smallAirplane: 0, largeAirplane: -5, fighterJet: 20, lta: -10, hsct: -15,
  semiballistic: -25, smallMotorboat: 0, racingBoat: 5, yacht: -10, acv: 2, train: -10
};

/** The table's row names (p.42). */
export const R2_CLASS_LABELS = {
  car: "Car/Pickup Truck", sportsCar: "Sports Car", motorcycle: "Motorcycle", limousine: "Limousine/Light Truck/Van",
  heavyTruck: "Heavy Truck", tractorTrailer: "Tractor Trailer", tracked: "Tracked Vehicle", ultralight: "Ultralight Aircraft",
  helicopter: "Helicopter", smallAirplane: "Small Airplane", largeAirplane: "Large Airplane", fighterJet: "Fighter Jet",
  lta: "LTA/Zeppelin", hsct: "HSCT/Suborbital", semiballistic: "Semiballistic", smallMotorboat: "Small Motorboat",
  racingBoat: "Racing Boat", yacht: "Yacht", acv: "ACV/Hovercraft", train: "Train/Monorail"
};

/** Terrain Points Table (p.42). */
export const TERRAIN_POINTS = { open: 0, normal: -2, restricted: -4, tight: -10 };
export const TERRAINS = Object.keys(TERRAIN_POINTS);

/**
 * The Vehicle Points class of a vehicle: its own `r2Class` when set, else derived from the Workshop design (category,
 * traits) or the vehicle type. Null = no class (a drone: Part 5) → 0 points and a warning on the panel.
 */
export function r2ClassFor({ r2Class = "", vehicleType = "ground", category = "", traits = [] } = {}) {
  if (r2Class && r2Class in VEHICLE_POINTS) return r2Class;
  if (traits.includes("zeppelin")) return "lta";
  if (traits.includes("tractor")) return "tractorTrailer";
  const byCategory = { bike: "motorcycle", car: "car", hovercraft: "acv", boat: "smallMotorboat", rotor: "helicopter",
                       fixedWing: "smallAirplane", vector: "smallAirplane" }[category];
  if (byCategory) return byCategory;
  return { ground: "car", rotor: "helicopter", aircraft: "smallAirplane", vectored_thrust: "smallAirplane",
           boat: "smallMotorboat", hovercraft: "acv" }[vehicleType] ?? null;
}

/** Speed Points (p.42): speed ÷ 10, rounded down. */
export const speedPoints = (speed) => Math.floor((Number(speed) || 0) / 10);

/**
 * An Open Test's result (p.42): keep the highest single die, where each die is the SUM of its Rule of Six chain.
 * @param {number[][]} chains - one array per die: the first roll, then each re-roll while the last was a 6.
 */
export function openTestResult(chains) {
  return Math.max(0, ...chains.map(c => c.reduce((s, n) => s + n, 0)));
}

/** The Maneuver Score (p.42): VP + TP + SP + DP. A pedestrian's is their Quickness (p.41). */
export const maneuverScore = ({ vp = 0, tp = 0, sp = 0, dp = 0 }) => vp + tp + sp + dp;

/**
 * A Maneuver Score comparison row: [mine exceeds by ≤10, mine by ≥11, theirs exceeds mine by ≤10, theirs by ≥11].
 * Equal scores → 0.
 */
export function msMod(mine, theirs, [nearUp, farUp, nearDown, farDown]) {
  const d = (Number(mine) || 0) - (Number(theirs) || 0);
  if (d > 0) return d <= 10 ? nearUp : farUp;
  if (d < 0) return -d <= 10 ? nearDown : farDown;
  return 0;
}

const ROWS = {
  accelerate: [-2, -4, 2, 4],    // p.45
  hiding: [-2, -4, 3, 6],        // p.48
  relocating: [-2, -4, 2, 4]     // p.49 (relocating vehicle's score vs the hiding vehicle's)
};
const TERRAIN_MOD = {
  accelerate: { open: -1, normal: 0, restricted: 1, tight: 3 },    // p.45
  positioning: { open: -1, normal: 0, restricted: 1, tight: 3 },   // p.47
  hiding: { open: 4, normal: 2, restricted: 0, tight: -2 },        // p.48
  relocating: { open: -3, normal: -1, restricted: 0, tight: 3 }    // p.49: the HIDING vehicle's terrain
};

/** A breakdown line list → total. Lines are [label, value]; zero lines are dropped. */
const sum = (lines) => {
  const parts = lines.filter(([, v]) => v);
  return { parts, total: parts.reduce((s, [, v]) => s + v, 0) };
};

/**
 * The TN helpers below return the UNCLAMPED sum: the caller adds defaulting and Vehicle Empathy, then floors at 2.
 *
 * Accelerate/Brake Target Modifiers (p.45) on top of Handling. `extraPursuers` = pursuers beyond the first while
 * fleeing; `vcr` = the rating of a rigger jacked into this vehicle (else 0); `damageTn` = the vehicle damage modifier;
 * `groupExtra` = additional vehicles in an NPC group (p.49).
 */
export function accelerateTN({ handling = 0, ms = 0, oppMs = 0, extraPursuers = 0, over = false, autonav = 0,
                               terrain = "normal", vcr = 0, damageTn = 0, groupExtra = 0 }) {
  const { parts, total } = sum([
    ["Maneuver Scores", msMod(ms, oppMs, ROWS.accelerate)],
    ["Fleeing more than one pursuer", Math.max(0, extraPursuers)],
    ["Above its Speed Rating", over ? 1 : 0],
    ["Autonav active", autonav],
    ["Terrain", TERRAIN_MOD.accelerate[terrain] ?? 0],
    ["VCR", -vcr],
    ["Vehicle damage", damageTn],
    ["Vehicle group", groupExtra]
  ]);
  return { tn: handling + total, base: handling, parts };
}

/** Positioning Target Modifiers (p.47). */
export function positioningTN({ handling = 0, over = false, autonav = 0, terrain = "normal", vcr = 0, damageTn = 0,
                                groupExtra = 0 }) {
  const { parts, total } = sum([
    ["Above its Speed Rating", over ? 1 : 0],
    ["Autonav active", autonav],
    ["Terrain", TERRAIN_MOD.positioning[terrain] ?? 0],
    ["VCR", -vcr],
    ["Vehicle damage", damageTn],
    ["Vehicle group", groupExtra]
  ]);
  return { tn: handling + total, base: handling, parts };
}

/** Hiding Target Modifiers (p.48). `extraOpponents` = vehicles escaped from beyond the first. */
export function hidingTN({ handling = 0, ms = 0, oppMs = 0, extraOpponents = 0, over = false, autonav = 0,
                           terrain = "normal", vcr = 0, damageTn = 0, groupExtra = 0 }) {
  const { parts, total } = sum([
    ["Maneuver Scores", msMod(ms, oppMs, ROWS.hiding)],
    ["Above its Speed Rating", over ? 2 : 0],
    ["Autonav active", autonav],
    ["Escaping more than one vehicle", Math.max(0, extraOpponents)],
    ["Terrain", TERRAIN_MOD.hiding[terrain] ?? 0],
    ["VCR", -vcr],
    ["Vehicle damage", damageTn],
    ["Vehicle group", groupExtra]
  ]);
  return { tn: handling + total, base: handling, parts };
}

/**
 * Relocating Target Modifiers (p.49): a Perception Test against the hiding vehicle's Signature. `over`/`autonav` are
 * the relocating vehicle's; `hideTerrain` the hiding vehicle's (p.49 note); `damageTn` the relocating vehicle's.
 */
export function relocatingTN({ signature = 0, ms = 0, hideMs = 0, over = false, autonav = 0, hideSuccesses = 0,
                               hideTerrain = "normal", damageTn = 0, groupExtra = 0 }) {
  const { parts, total } = sum([
    ["Maneuver Scores", msMod(ms, hideMs, ROWS.relocating)],
    ["Above its Speed Rating", over ? 4 : 0],
    ["Autonav active", -autonav],
    ["Hiding test successes", hideSuccesses],
    ["Hiding vehicle's terrain", TERRAIN_MOD.relocating[hideTerrain] ?? 0],
    ["Vehicle damage", damageTn],
    ["Vehicle group", groupExtra]
  ]);
  return { tn: signature + total, base: signature, parts };
}

/**
 * Accelerating or braking (p.45): ± Acceleration × successes. Accelerating can't pass Speed Rating × 1.5 (a speed
 * already above that isn't raised and isn't forced down); braking stops at 0. Returns the new speed and the change.
 */
export function applySpeedChange({ speed, acceleration, successes, speedRating, brake = false }) {
  const delta = (Number(acceleration) || 0) * Math.max(0, Number(successes) || 0);
  let next;
  if (brake) next = Math.max(0, speed - delta);
  else {
    const max = Math.floor((Number(speedRating) || 0) * 1.5);
    next = speed >= max ? speed : Math.min(max, speed + delta);
  }
  return { speed: next, change: Math.abs(next - speed) };
}

/** A speed change of at least twice the distance to an opponent lets the driver ram it next action (p.45). */
export const ramEntitled = (change, distance) => (Number(change) || 0) > 0 && change >= 2 * (Number(distance) || 0);

/**
 * Positioning to stop at a point (p.47): successes × Acceleration ≥ the distance → there, speed 0; else it gets that
 * far and its speed is unchanged (ruling).
 */
export function stopAtPoint({ successes, acceleration, distance }) {
  const travelled = Math.max(0, successes) * (Number(acceleration) || 0);
  return travelled >= distance ? { reached: true, travelled: distance, short: 0 }
                               : { reached: false, travelled, short: distance - travelled };
}

/** Close of turn (p.44 step 7): the distance changes by the difference in speeds, never below 0. */
export const closeDistance = (distance, pursuerSpeed, quarrySpeed) =>
  Math.max(0, (Number(distance) || 0) - ((Number(pursuerSpeed) || 0) - (Number(quarrySpeed) || 0)));

/** NPC pursuers try to relocate for 5 Combat Turns, then give up (p.49). */
export const NPC_RELOCATE_TURNS = 5;

/**
 * May an aboard character take an offensive action in this Combat Phase (p.49)? The rigger (the driver jacked in) is
 * exempt; everyone else only in phases ≤ the vehicle's Driver Points, and not at all before the DP is recorded.
 */
export function passengerMayAttack({ phase, dp = null, isRigger = false }) {
  if (isRigger) return true;
  return dp !== null && dp !== undefined && Number(phase) <= Number(dp);
}

/** The NPC group's representative (p.49): the fastest member's statistics. Members are {speedRating, …}. */
export const fastestMember = (members) =>
  members.reduce((best, m) => (best === null || (m.speedRating ?? 0) > (best.speedRating ?? 0) ? m : best), null);

/* ── Part 3b: damage (R2 p.49–53) ────────────────────────────────────────────────────────────────────────────── */

export const STAGES = ["L", "M", "S", "D"];

/** Impact Damage Levels Table (p.50): 1–20 L, 21–60 M, 61–200 S, 201+ D; nothing at 0. */
export function r2ImpactLevel(speed) {
  const s = Number(speed) || 0;
  if (s <= 0) return null;
  return s >= 201 ? "D" : s >= 61 ? "S" : s >= 21 ? "M" : "L";
}

/** Impact damage (p.50): Power = speed ÷ 10 rounded UP (148 → 15); level by the table. Null when not moving. */
export function r2Impact(speed) {
  const level = r2ImpactLevel(speed);
  return level ? { power: Math.ceil((Number(speed) || 0) / 10), level } : null;
}

/** Stage a level down one per 2 successes (p.50); null = staged away. */
export function stageDown(level, successes) {
  const i = STAGES.indexOf(level) - Math.floor(Math.max(0, Number(successes) || 0) / 2);
  return i >= 0 ? STAGES[i] : null;
}

/** Ramming Target Modifiers (p.48), on Handling; unclamped like the others. */
export function ramTN({ handling = 0, ms = 0, oppMs = 0, over = false, autonav = 0, terrain = "normal", vcr = 0, damageTn = 0, groupExtra = 0 }) {
  const { parts, total } = sum([
    ["Maneuver Scores", msMod(ms, oppMs, [-2, -4, 2, 4])],
    ["Above its Speed Rating", over ? 1 : 0],
    ["Autonav active", autonav ? autonav + 2 : 0],
    ["Terrain", { open: -1, normal: 0, restricted: 1, tight: 2 }[terrain] ?? 0],
    ["VCR", -vcr],
    ["Vehicle damage", damageTn],
    ["Vehicle group", groupExtra]
  ]);
  return { tn: handling + total, base: handling, parts };
}

/**
 * A ram's damage (p.47–48, p.50): both vehicles resist impact at the DIFFERENCE in speed; the rammer's Power is cut
 * by its Body × the Ramming Test successes. Mach 6 (152) rams Cruiser #2 (300): 15S each; Body 3 × 5 → the rammer's
 * Power 0, so TN 2.
 */
export function ramDamage({ rammerSpeed, targetSpeed, rammerBody = 0, successes = 0 }) {
  const hit = r2Impact(Math.abs((Number(rammerSpeed) || 0) - (Number(targetSpeed) || 0)));
  if (!hit) return null;
  return { target: hit, rammer: { power: Math.max(0, hit.power - rammerBody * Math.max(0, successes)), level: hit.level } };
}

/** A vehicle's impact Damage Resistance Test (p.50): Body + Control Pool (+ an NPC's Professional Rating) vs Power, min 2. */
export const impactResist = ({ body = 0, control = 0, pr = 0, power }) => ({ dice: body + control + pr, tn: Math.max(2, power) });

/**
 * An occupant's collision damage (p.50, R3-4): the collision's code, one level down for a seat belt, Power halved
 * (round up) by APPS, less impact armour; a crash cage adds 6 dice. 15S → 15M → 8M → 5M.
 */
export function occupantImpact({ power, level, restrained = false, apps = false, impactArmor = 0, crashCage = false }) {
  let lvl = level;
  if (restrained) lvl = STAGES[STAGES.indexOf(level) - 1] ?? null;
  if (!lvl) return null;
  let p = apps ? Math.ceil(power / 2) : power;
  p = Math.max(0, p - Math.max(0, impactArmor));
  return { power: p, level: lvl, extraDice: crashCage ? 6 : 0 };
}

/**
 * Crash Test Modifiers (p.51) on Handling: the vehicle's damage modifier, terrain, and speed against the driver's
 * Reaction (the driver's wound modifier is added by the roll itself). Cruiser #2: 4 + 3 + 4 (+2 wounded) = 13.
 */
export function crashTestTN({ handling = 0, damageTn = 0, terrain = "normal", speed = 0, reaction = 1 }) {
  const r = Math.max(1, Number(reaction) || 1), s = Number(speed) || 0;
  const speedMod = s < r * 20 ? 0 : s < r * 30 ? 1 : s < r * 40 ? 2 : 4;
  const { parts, total } = sum([
    ["Vehicle damaged", damageTn],
    ["Terrain", { open: -1, normal: 0, restricted: 2, tight: 4 }[terrain] ?? 0],
    ["Speed vs Reaction", speedMod]
  ]);
  return { tn: handling + total, base: handling, parts };
}

/**
 * Walls and barriers (p.52): speed ≤ Barrier Rating × 20 → the vehicle halts, impact damage at its speed. Faster →
 * it breaks through, losing Barrier Rating × 20 speed; damage Power = the Barrier Rating, level from the speed lost.
 */
export function wallCollision({ speed, barrier }) {
  const s = Math.max(0, Number(speed) || 0), stop = Math.max(0, Number(barrier) || 0) * 20;
  if (s <= stop) return { halts: true, speed: 0, damage: r2Impact(s) };
  return { halts: false, speed: s - stop, damage: { power: Number(barrier) || 0, level: r2ImpactLevel(stop) } };
}

/**
 * A vehicle hits a pedestrian (p.52–53): the pedestrian resists Power = speed ÷ 10 one level ABOVE the table (past
 * Deadly: Power + half, rounded down), unless their armour is hardened/military-grade; the vehicle resists one level
 * BELOW (nothing at 1–20). Rex Karz at 60 m/turn: 6S.
 */
export function pedestrianImpact({ speed, hardened = false }) {
  const hit = r2Impact(speed);
  if (!hit) return null;
  const i = STAGES.indexOf(hit.level);
  const pedestrian = hardened ? { ...hit } : i === 3 ? { power: hit.power + Math.floor(hit.power / 2), level: "D" } : { power: hit.power, level: STAGES[i + 1] };
  return { pedestrian, vehicle: i > 0 ? { power: hit.power, level: STAGES[i - 1] } : null };
}

/**
 * A weapon against a vehicle under Rigger 2 (p.53). Level −1 (D→S…) unless anti-vehicle; a Light-RATED weapon does
 * nothing without special ammunition (a called shot doesn't help, B2 #12). Armour cuts the Power fully (AV: half,
 * rounded down; APDS keeps its own half-armour rule, Sourcebook Updates p.277); a weapon whose standard Power doesn't
 * exceed the armour does nothing (AV excepted). Resisted with Body dice vs TN = the modified Power (min 2).
 */
export function r2VehicleHit({ body = 0, armor = 0, power, basePower = power, level, ratedLevel = level, damageType = "physical",
                               apds = false, antiVehicle = false }) {
  if (damageType === "stun") return { none: "stun" };
  if (ratedLevel === "L" && !apds && !antiVehicle) return { none: "light" };
  let idx = STAGES.indexOf(level) - (antiVehicle ? 0 : 1);
  if (idx < 0) idx = 0;   // only special ammunition reaches here
  const armorUsed = antiVehicle || apds ? Math.floor(armor / 2) : armor;
  if (!antiVehicle && armor > 0 && basePower <= armorUsed) return { none: "barrier", armorUsed };
  return { none: null, level: STAGES[idx], dice: body, tn: Math.max(2, power - armorUsed), armorUsed };
}

/** Optional Control Pool limits on vehicle Damage Resistance Tests by terrain (p.53): skill, ⌈skill ÷ 2⌉, ⌈skill ÷ 3⌉. */
export const terrainControlCap = (skill, terrain = "normal") =>
  terrain === "restricted" ? Math.ceil(skill / 2) : terrain === "tight" ? Math.ceil(skill / 3) : skill;

/** Attacks against passengers (p.53): Power − the higher of the vehicle's Armor and Body; no level change. */
export const passengerShotPower = ({ power, armor = 0, body = 0 }) => Math.max(0, power - Math.max(armor, body));
