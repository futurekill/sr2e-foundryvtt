/**
 * Rigger 2 vehicle gunnery (R2 p.56–61; docs/PLAN-vehicles-phase2.md Part 4b). Pure: no Foundry. Every table here was
 * read from 300-dpi renders of the printed pages.
 */

/** Manual Gunnery Modifiers Table, size/type of target (p.57). */
export const TARGET_SIZE_MODS = {
  human: 0, humanCritter: 0, smallCritter: 1, largeCritter: -1, smallDrone: 1, motorcycle: 0, automobile: -1,
  limousine: -1, heavyTruck: -3, boat: -1, yacht: -3, freighter: -8, ultralight: 0, fixedWing: -2, airliner: -6,
  helicopter: -2, lta: -6, lav: -3, military: -3
};

/** Relative Speeds of Attacker and Target (p.57–58): a speed under 5 m/turn counts as 5. */
export function relativeSpeedMod(a, b) {
  const x = Math.max(5, Math.abs(Number(a) || 0)), y = Math.max(5, Math.abs(Number(b) || 0));
  const ratio = Math.max(x, y) / Math.min(x, y);
  if (ratio <= 1) return 0;   // "roughly equal": exactly equal here; the dialog lets the GM call it
  if (ratio <= 2) return 2;
  if (ratio <= 3) return 4;
  return 6;
}

/** p.58: both under 5 m/turn → standard ranged combat instead of manual gunnery. */
export const bothSlow = (a, b) => Math.abs(Number(a) || 0) < 5 && Math.abs(Number(b) || 0) < 5;

/** Recoil (p.57 / p.58 tables, key p.57): `uncompensated` recoil, the mount and the accessories' compensation.
 *  Fixed mounts and turrets halve (round down) before accessories, which cancels the heavy-weapon doubling. */
export function vehicleRecoil({ recoil = 0, heavy = false, mount = "", accessories = 0 }) {
  let r = Math.max(0, recoil);
  if (mount === "fixed" || mount === "turret") r = Math.floor(r / 2);
  else if (heavy) r *= 2;
  r -= Math.max(0, accessories);
  if (mount === "pintle") r -= 2;
  if (mount === "ring") r -= 6;
  return Math.max(0, r);
}

/**
 * Manual gunnery situational modifiers (p.57). `o` is the dialog's answers; returns [{ label, value }].
 * Wounds are NOT here (central in rollSuccessTest); the attacking vehicle's damage modifier is.
 */
export function manualGunneryMods(o = {}) {
  const parts = [];
  const add = (label, value) => { if (value) parts.push({ label, value }); };
  if (o.blind) add("blind fire", 8);
  if (o.partialCover) add("partial cover", 4);
  if (o.smartlink === 1) add("smartlink", -2);
  add("smartlink II", o.smartlinkII ?? 0);   // Fields of Fire pp.84–85: the item's own value
  add("aimed shot", -Math.max(0, o.aimed ?? 0));
  add("multiple targets", 2 * Math.max(0, o.extraTargets ?? 0));
  if (o.legs === "walk") add("attacking drone walking", o.difficultGround ? 2 : 1);
  if (o.legs === "run") add("attacking drone running", o.difficultGround ? 6 : 4);
  if (o.targetRunning) add("target running", 2);
  if (o.targetStationary) add("target stationary", -1);
  add("recoil", o.recoil ?? 0);
  if (o.unmounted) add("firing unmounted weapon", 2);
  if (o.motion === "toward") add("moving toward", -1);
  if (o.motion === "away") add("moving away", 1);
  if (Number.isFinite(o.attackerMS) && Number.isFinite(o.targetMS)) {
    if (o.attackerMS - o.targetMS > 10) add("Maneuver Score", -1);
    else if (o.targetMS - o.attackerMS > 10) add("Maneuver Score", 1);
  }
  if (Number.isFinite(o.attackerSpeed) && Number.isFinite(o.targetSpeed)) add("relative speed", relativeSpeedMod(o.attackerSpeed, o.targetSpeed));
  add("target size", TARGET_SIZE_MODS[o.targetSize] ?? 0);
  add("vehicle damage", o.vehicleDamage ?? 0);
  add("visibility", o.visibility ?? 0);
  add("magnification", o.magnification ?? 0);
  return parts;
}

/** Sensor-Enhanced Targeting Modifiers Table (p.58). `los`: "direct" | "interrupted". ECM/ED are the EW term. */
export function sensorGunneryTN({ signature, ewTerm = 0, urban = false, los = "interrupted", recoil = 0, vehicleDamage = 0 }) {
  const parts = [{ label: "Signature", value: signature }];
  const add = (label, value) => { if (value) parts.push({ label, value }); };
  if (urban) add("urban", 2);
  if (los === "direct") add("direct LOS", -3);
  add("ew", ewTerm);
  add("recoil", recoil);
  add("vehicle damage", vehicleDamage);
  const raw = parts.reduce((t, p) => t + p.value, 0);
  return { tn: Math.max(2, raw), raw, parts };   // p.58–59: Steeler's 0 "is rounded up to 2"
}

/** Sensor-enhanced gunnery dice (p.58): Gunnery (or Pilot for a drone without a rigger) + ⌊Sensor ÷ 2⌋. */
export const sensorGunneryDice = (skill, sensor) => Math.max(0, skill) + Math.floor(Math.max(0, sensor) / 2);

/** Missile Attack Test dice (p.59–60): Gunnery + Intelligence, + ⌊Sensor ÷ 2⌋ in continuous lock, + spotter successes. */
export const missileDice = ({ gunnery, intelligence = 0, sensor = 0, continuous = false, spotter = 0 }) =>
  Math.max(0, gunnery) + Math.max(0, intelligence) + (continuous ? Math.floor(Math.max(0, sensor) / 2) : 0) + Math.max(0, spotter);

/** Indirect Fire Test dice and TN modifier (p.60): Concentration, else Gunnery at +2; + ⌊Sensor ÷ 2⌋ + Intelligence. */
export const indirectFireTest = ({ concentration = null, gunnery = 0, sensor = 0, intelligence = 0 }) => ({
  dice: (concentration ?? gunnery) + Math.floor(Math.max(0, sensor) / 2) + Math.max(0, intelligence),
  tnMod: concentration == null ? 2 : 0
});

/** Area-Effect Target Numbers Table (p.61): bands [short, medium, long, extreme] with their TNs. */
export const AREA_TN = [4, 5, 6, 9];
const AREA_BANDS = {
  laser: [[50, 300], [301, 1500], [1501, 3000], [3001, 5000]],
  microwave: [[50, 500], [501, 2500], [2501, 5000], [5001, 8000]],
  radar: [[50, 500], [501, 3000], [3001, 6000], [6001, 10000]]
};
const sensorBands = (flux) => [[100, flux * 200], [flux * 200, flux * 500], [flux * 500, flux * 2000], [flux * 2000, flux * 4000]];
export const BAND_NAMES = ["short", "medium", "long", "extreme"];

/** The band and TN for an area-effect attack, or null outside every band (the GM's call). */
export function areaEffect(device, meters, flux = 0) {
  const bands = device === "sensor" ? sensorBands(flux) : AREA_BANDS[device];
  if (!bands) return null;
  const i = bands.findIndex(([lo, hi]) => meters >= lo && meters <= hi);
  return i < 0 ? null : { band: BAND_NAMES[i], index: i, tn: AREA_TN[i] };
}

/** Remote Gunnery Scatter Table (p.61): { dice, mult } and the per-success reduction. */
export const SCATTER = { short: { dice: 2, mult: 2, cut: 4 }, medium: { dice: 2, mult: 5, cut: 4 },
  long: { dice: 3, mult: 15, cut: 15 }, extreme: { dice: 3, mult: 40, cut: 15 } };
/** Scatter distance from the rolled dice total and the Gunnery successes; ≤ 0 → on target (returns 0). */
export function scatter(band, diceTotal, successes) {
  const s = SCATTER[band];
  return Math.max(0, diceTotal * s.mult - successes * s.cut);
}

/** Signatures of biological forms (p.61): humans/metahumans 6; the Critter Signature Ratings Table; size steps. */
export const CRITTER_SIGNATURES = { cockatrice: 8, barghest: 7, harpy: 7, sasquatch: 6, thunderbird: 6, eyekiller: 5,
  griffin: 5, merrow: 5, phoenix: 5, unicorn: 5, kraken: 4, naga: 4, dracoform: 3 };
export function critterSignature(name) {
  const n = String(name ?? "").toLowerCase();
  for (const [k, v] of Object.entries(CRITTER_SIGNATURES)) if (n.includes(k)) return v;
  if (/dragon/.test(n)) return CRITTER_SIGNATURES.dracoform;
  return null;
}
/** By size (p.61): 3× larger 5, 6× larger 4, "and so on"; 3× smaller 7, 6× smaller 8. `steps` = ±1 per 3×. */
export const sizeSignature = (steps) => 6 - steps;
