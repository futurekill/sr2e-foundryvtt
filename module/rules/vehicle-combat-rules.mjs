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
