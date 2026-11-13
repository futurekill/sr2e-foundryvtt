/**
 * Rigger 2 standard vehicle operations (docs/PLAN-vehicles-phase2.md Part 2a). Pure: no Foundry.
 * Pages: Rigger 2 p.20–26 (Driving Test, attributes, Stress, repairs), p.120 (engine customization).
 */

/** Driving Test Modifiers Table (R2 p.21), each row as printed. */
export const DRIVING_MODS = {
  unfamiliar: 1,
  situation: { "": 0, calm: -1, stress: 3 },
  size: { "": 0, large: 2, veryLarge: 3 },
  weather: { "": 0, bad: 2, terrible: 4 },
  terrain: { open: -1, normal: 0, restricted: 1, tight: 3 },
  combat: 2,
  datajack: -1
};

/**
 * The Driving Test's TN (R2 p.20–21): Handling + the table + the vehicle damage modifier + other.
 * @param {object} o handling, unfamiliar, situation, size, weather, terrain, combat, mode ("manual"|"datajack"|"rigged"),
 *                   vcr, damageMod, otherMod
 */
export function drivingTN(o = {}) {
  const parts = [["Handling", Number(o.handling) || 0]];
  if (o.unfamiliar) parts.push(["Unfamiliar vehicle", DRIVING_MODS.unfamiliar]);
  if (DRIVING_MODS.situation[o.situation ?? ""]) parts.push([o.situation === "calm" ? "Non-stressful" : "Stressful", DRIVING_MODS.situation[o.situation]]);
  if (DRIVING_MODS.size[o.size ?? ""]) parts.push([o.size === "large" ? "Large vehicle of type" : "Very large vehicle of type", DRIVING_MODS.size[o.size]]);
  if (DRIVING_MODS.weather[o.weather ?? ""]) parts.push([o.weather === "bad" ? "Bad weather" : "Terrible weather", DRIVING_MODS.weather[o.weather]]);
  const t = DRIVING_MODS.terrain[o.terrain ?? "normal"] ?? 0;
  if (t) parts.push([`${o.terrain} terrain`, t]);
  if (o.combat) parts.push(["During combat", DRIVING_MODS.combat]);
  if (o.mode === "datajack") parts.push(["Datajack", DRIVING_MODS.datajack]);
  const vcr = Math.max(0, Number(o.vcr) || 0);
  if (o.mode === "rigged" && vcr) parts.push([`Rigger in control (VCR ${vcr})`, -2 * vcr]);
  if (o.empathy) parts.push(["Vehicle Empathy", -1]);   // Handling −1 in physical contact (p.16)
  if (o.damageMod) parts.push(["Vehicle damage", Number(o.damageMod)]);
  if (o.otherMod) parts.push(["Other", Number(o.otherMod)]);
  const raw = parts.reduce((s, [, m]) => s + m, 0);
  return { tn: Math.max(2, raw), parts };
}

/**
 * Stress for extra dice (R2 p.26): 1 die per 2 Stress Points; at most Body Stress Points in one action, except that a
 * Body 1 vehicle may take 2 for 1 die. Returns the largest legal die count for a request.
 */
export function stressDice(requested, body) {
  const b = Math.max(0, Math.floor(Number(body) || 0));
  const capStress = b === 1 ? 2 : b;
  const dice = Math.max(0, Math.min(Math.floor(Number(requested) || 0), Math.floor(capStress / 2)));
  return { dice, stress: dice * 2 };
}

/** Stress Rule of One (R2 p.26): 1s on the Driving Test ≥ the driver's Vehicle Skill (or the drone's Pilot). */
export function ruleOfOne(ones, skill) {
  return Math.max(0, Number(skill) || 0) > 0 && (Number(ones) || 0) >= Number(skill);
}

/**
 * What a resolved Driving Test does to Stress (R2 p.26), in the book's order (Rigger X's Westwind): a FAILED test →
 * the GM's Stress Test (2D6) against the Stress as it stands; then the Rule of One adds 1D6 and, if Stress reaches
 * 2 × Body, a system fails automatically.
 * @param {object} o failed, stress (after any purchased Stress), body, ones, skill, stressRoll (2D6), ruleRoll (1D6)
 * @returns {{stressTest: boolean, failure: null|"stressTest"|"ruleOfOne", addStress: number}}
 */
export function drivingStressOutcome({ failed, stress, body, ones, skill, stressRoll = null, ruleRoll = null }) {
  let failure = null, addStress = 0;
  const s0 = Math.max(0, Number(stress) || 0);
  const stressTest = !!failed;
  if (stressTest && stressRoll != null && stressRoll < s0) failure = "stressTest";
  if (ruleOfOne(ones, skill) && ruleRoll != null) {
    addStress = ruleRoll;
    if (!failure && s0 + addStress >= 2 * (Number(body) || 0)) failure = "ruleOfOne";
  }
  return { stressTest, failure, addStress };
}

/** Speed (R2 p.22): the effective Speed Rating (halved off-road without off-road suspension) and the 1.5× maximum. */
export function r2Speed(effectiveSpeed, { offRoad = false, suspension = false } = {}) {
  const rating = Math.max(0, Math.floor((Number(effectiveSpeed) || 0) / (offRoad && !suspension ? 2 : 1)));
  return { rating, max: Math.floor(rating * 1.5) };
}

/**
 * Maintenance overhaul (R2 p.26): TN = Stress + 4; every 2 successes −1 Stress; never below 1 once a vehicle has had
 * Stress, never into its permanent Stress. Parts 50¥ per point removed.
 */
export function overhaul({ stress, permanent = 0, successes }) {
  const s = Math.max(0, Number(stress) || 0);
  const floor = Math.max(s > 0 ? 1 : 0, Math.max(0, Number(permanent) || 0));
  const removed = Math.max(0, Math.min(Math.floor((Number(successes) || 0) / 2), s - floor));
  return { tn: s + 4, removed, stress: s - removed, parts: removed * 50 };
}

/** Repair (R2 p.26): TN = boxes + 2; 16 h per box ÷ successes; parts = boxes × 5% of the total vehicle cost. */
export function repairQuote({ boxes, value }) {
  const b = Math.max(0, Math.floor(Number(boxes) || 0));
  return { tn: b + 2, baseHours: 16 * b, parts: Math.round(b * 0.05 * Math.max(0, Number(value) || 0)) };
}
export function repairHours(baseHours, successes) {
  const s = Math.floor(Number(successes) || 0);
  return s > 0 ? baseHours / s : null;
}

/** Engine customization failure (R2 p.120): ⌈1D6 ÷ 2⌉ permanent Stress. */
export const engineFailureStress = (d6) => Math.ceil((Number(d6) || 0) / 2);

/** Permanent Stress = the sum of the engine records (only factory replacement removes one). */
export function permanentStress(records = {}) {
  return Object.values(records ?? {}).reduce((t, r) => t + Math.max(0, Number(r?.points) || 0), 0);
}

/**
 * The rig's bonuses under Rigger 2 (p.16–18). Move-by-wire lowers the EFFECTIVE VCR level by 1 per level for Reaction
 * (+2/level) and Initiative (+1D6/level), and the Control Pool by 1 per level: pool = Reaction + 2 × VCR − MBW
 * (Monkeywrench: VCR 3 → 10; MBW 1 → 9; MBW 3 → 7; MBW 4 → 6).
 */
export function rigBonuses({ vcr = 0, mbw = 0, reaction = 0 } = {}) {
  const eff = Math.max(0, vcr - mbw);
  return { reaction: 2 * eff, initiativeDice: 1 + eff, controlPool: vcr > 0 ? Math.max(0, reaction + 2 * vcr - mbw) : 0 };
}

/** The vehicle skills on the Skill Web (SR2E p.68–69), by node: the Rigger 2 p.12 half-cost defaulting set. */
export const VEHICLE_WEB_NODES = new Set(["car", "bike", "hovercraft", "motorboat", "sailboat", "winged", "rotor", "vectorThrust"]);
const VEHICLE_SKILL_KEYS = new Set(["car", "bike", "hovercraft", "motorboat", "sailboat", "winged_aircraft", "rotor_aircraft",
  "vector_thrust_aircraft", "pilot"]);
/** A skill name → is it a vehicle (driving) skill? Names are normalised as vehicle tests do. */
export const isVehicleSkillName = (name) =>
  VEHICLE_SKILL_KEYS.has(String(name ?? "").toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));

/**
 * Rigger 2 p.12: a rigger defaulting while controlling the vehicle by VCR takes +1 per web dot instead of +2 — only
 * from Reaction or a vehicle skill TO a vehicle skill (the source and destination; the path between doesn't matter).
 * Returns the Skill Web perCircle cost function for a target node, or undefined (normal costs).
 */
export function vcrPerCircle(target) {
  if (!VEHICLE_WEB_NODES.has(target)) return undefined;
  return (source, kind) => (kind === "attribute" ? source === "reaction" : VEHICLE_WEB_NODES.has(source)) ? 1 : 2;
}
