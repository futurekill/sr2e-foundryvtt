/**
 * Rigger 2 sensors, Flux and range, ECM/ECCM, ED/ECD (R2 p.27–32, p.58; docs/PLAN-vehicles-phase2.md Part 4a).
 * Pure: no Foundry globals. Every table was re-read from 200-dpi renders of the page cited.
 */
import { successesAtTN } from "./sr2e-rules.mjs";

/* ── Components (p.27) ─────────────────────────────────────────────────────────────────────────────────────── */

/** Components each rating band includes (p.27), cumulative from Rating 0. */
const COMPONENT_BANDS = [
  { min: 0, keys: ["rangefinder", "ultrasound", "laserProximity"] },
  { min: 1, keys: ["proximity", "video", "radar", "signatureRecognition", "lowLight", "telescopic"] },
  { min: 2, keys: ["thermographic"] },
  { min: 5, keys: ["flareCompensation"] }
];
export const SENSOR_COMPONENT_KEYS = COMPONENT_BANDS.flatMap(b => b.keys);

/**
 * The sensor system's components: what its rating includes (p.27) plus added components (`upgrades.<key>.added`);
 * magnification = 50 × rating + 50 per upgrade level (Skyrie: +2 levels = +100×, p.28).
 * @param {number} rating
 * @param {Object<string,{added?:boolean, level?:number}>} upgrades
 */
export function sensorComponents(rating, upgrades = {}) {
  const r = Math.max(0, Number(rating) || 0);
  const set = new Set(COMPONENT_BANDS.filter(b => r >= b.min).flatMap(b => b.keys));
  for (const [k, u] of Object.entries(upgrades ?? {})) if (u?.added && SENSOR_COMPONENT_KEYS.includes(k)) set.add(k);
  const magLevels = Math.max(0, Number(upgrades?.magnification?.level) || 0);
  return { components: SENSOR_COMPONENT_KEYS.filter(k => set.has(k)), magnification: 50 * r + 50 * magLevels };
}

/** Parts cost of a component upgrade (p.27): the sensors' original cost × .10 × levels (Skyrie: 15,000 → 3,000¥). */
export const componentUpgradeCost = (sensorCost, levels) => Math.round((Number(sensorCost) || 0) * 0.10 * Math.max(0, Number(levels) || 0));

/* ── Sensor Test (p.28, p.30) ──────────────────────────────────────────────────────────────────────────────── */

/** Sensor Test Modifiers Table (p.28). ECM/ECCM are the separate EW term. */
export const SENSOR_TEST_MODS = { directLos: -2, urban: 1, weather: 1, restricted: 1, tight: 2 };

/**
 * The Sensor Test target number: base (the target's Signature, or 6 for a character, a critter value, a GM value)
 * + the EW term + the table's conditions + concealing spirit's Force + the sensing vehicle's damage modifier; min 2.
 */
export function sensorTestTN({ base = 4, ewTerm = 0, conditions = {}, spiritForce = 0, damageMod = 0 } = {}) {
  let tn = Number(base) || 0;
  const parts = [{ label: "Signature", value: tn }];
  for (const [k, v] of Object.entries(SENSOR_TEST_MODS)) if (conditions[k]) { tn += v; parts.push({ label: k, value: v }); }
  if (spiritForce > 0) { tn += spiritForce; parts.push({ label: "spirit", value: spiritForce }); }
  if (damageMod) { tn += damageMod; parts.push({ label: "damage", value: damageMod }); }
  if (ewTerm) { tn += ewTerm; parts.push({ label: "ew", value: ewTerm }); }
  return { tn: Math.max(2, tn), parts };
}

/** Sensor Test Results Table (p.30), by successes. */
export function sensorResult(successes) {
  const s = Math.max(0, Number(successes) || 0);
  return ["none", "basic", "general", "positive", "features"][Math.min(4, s)];
}

/* ── Flux and range (p.30–31) ──────────────────────────────────────────────────────────────────────────────── */

/** Flux Rating Table (p.30): RC deck 2; sensors and ECM-family rating × 1.5 rounded up; others the rating; cyberware 0. */
export function baseFlux(kind, rating) {
  const r = Math.max(0, Number(rating) || 0);
  if (kind === "rcDeck") return 2;
  if (kind === "cyberware") return 0;
  if (["sensor", "ecm", "eccm", "ed", "ecd"].includes(kind)) return Math.ceil(r * 1.5);
  return r;
}

/** Situational Range Modifiers Table (p.31). */
export const RANGE_MODS = { highElevation: 4, electricalStorm: -2, encryption: -0.5, humidAir: -0.5, urban: -1 };

/**
 * The modified Flux (p.31): base + boosts + situational modifiers − ECCM ÷ 2 (the vehicle's ECCM draws on the
 * transmitter) − ECD rating (p.32), rounded DOWN to the nearest half. Encryption only for radios and RC decks; humid
 * air never with an electrical storm.
 */
export function modifiedFlux({ base = 0, boost = 0, kind = "", conditions = {}, eccm = 0, ecd = 0 } = {}) {
  let f = (Number(base) || 0) + (Number(boost) || 0);
  const used = [];
  for (const [k, v] of Object.entries(RANGE_MODS)) {
    if (!conditions[k]) continue;
    if (k === "encryption" && !["radio", "rcDeck"].includes(kind)) continue;
    if (k === "humidAir" && conditions.electricalStorm) continue;
    f += v; used.push(k);
  }
  if (eccm > 0) { f -= eccm / 2; used.push("eccm"); }
  if (ecd > 0) { f -= ecd; used.push("ecd"); }
  return { flux: Math.floor(f * 2) / 2, used };
}

/** Flux Rating and Range Table (p.31), metres. */
const RANGE_TABLE = [250, 1000, 2000, 4000, 6000, 9000, 12000, 16000, 20000, 25000];

/**
 * Range in metres for a WHOLE Flux; null below 0. A half-point Flux has no row (the GM chooses, plan 4a.3):
 * `fluxRange(8.5)` returns `{ low, high }` bracketing it.
 */
export function fluxRange(flux) {
  const f = Number(flux);
  if (!Number.isFinite(f) || f < 0) return null;
  const at = (n) => n >= 10 ? (2 * n + 10) * 1000 : RANGE_TABLE[n];
  if (Number.isInteger(f)) return at(f);
  return { low: at(Math.floor(f)), high: at(Math.ceil(f)) };
}

/* ── Flux boosts (p.30) ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Validate a whole boost allocation (p.30): engine boosts only for a device on an Electronics Port, ≤ ⌊Body ÷ 2⌋ per
 * device and ≤ Body in total; each amplifier's total ≤ its rating; every target a known working transmitter.
 * @param {Object<string,{engine?:number, amplifiers?:Object<string,number>}>} alloc
 * @param {{body:number, devices:Object<string,{working:boolean, ported:boolean}>, amplifiers:Object<string,number>}} vehicle
 * @returns {string[]} problems (empty = valid)
 */
export function boostProblems(alloc = {}, { body = 0, devices = {}, amplifiers = {} } = {}) {
  const problems = [];
  let engineTotal = 0;
  const ampUse = {};
  for (const [id, a] of Object.entries(alloc ?? {})) {
    const dev = devices[id];
    if (!dev?.working) { problems.push(`${id}: not an installed, working transmitter`); continue; }
    const engine = Math.max(0, Number(a?.engine) || 0);
    if (engine) {
      if (!dev.ported) problems.push(`${id}: engine boosts need an Electronics Port`);
      if (engine > Math.floor(body / 2)) problems.push(`${id}: engine boost ${engine} over ⌊Body ÷ 2⌋ = ${Math.floor(body / 2)}`);
      engineTotal += engine;
    }
    for (const [amp, n] of Object.entries(a?.amplifiers ?? {})) {
      if (!(amp in amplifiers)) { problems.push(`${id}: amplifier ${amp} not installed`); continue; }
      ampUse[amp] = (ampUse[amp] ?? 0) + Math.max(0, Number(n) || 0);
    }
  }
  if (engineTotal > body) problems.push(`engine boosts total ${engineTotal} over Body ${body}`);
  for (const [amp, used] of Object.entries(ampUse)) if (used > amplifiers[amp]) problems.push(`amplifier ${amp}: ${used} over its rating ${amplifiers[amp]}`);
  return problems;
}

/** The boost a device gets from a valid allocation. */
export const deviceBoost = (alloc, id) => {
  const a = alloc?.[id];
  return a ? (Number(a.engine) || 0) + Object.values(a.amplifiers ?? {}).reduce((s, n) => s + (Number(n) || 0), 0) : 0;
};

/* ── ECM / ECCM (p.31–32) ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * One observer's ECM outcome (p.31–32) from the jammer's STORED dice (one ECM Test, read at this observer's Sensor
 * Rating), the observer's own opposed roll (its sensors' Flux vs the jammer's ECM rating) and an optional ECCM exchange
 * (counterjammer ECCM rating vs TN = jammer's ECM; jammer ECM rating vs TN = counterjammer's ECCM).
 * Jammer more successes → Signature + jammer successes − net ECCM successes (floor 0); otherwise 0.
 */
export function ecmEffect({ jamDice = [], observerSensor = 0, observerSuccesses = 0, eccm = null } = {}) {
  const jam = successesAtTN(jamDice, Math.max(2, Number(observerSensor) || 0));
  if (jam <= observerSuccesses) return { jam, effect: 0, won: false };
  const cancel = eccm ? Math.max(0, (eccm.counterSuccesses ?? 0) - (eccm.jammerSuccesses ?? 0)) : 0;
  return { jam, effect: Math.max(0, jam - cancel), won: true, cancel };
}

/** ECM is not cumulative (p.32): of several applicable effects the largest applies. */
export const maxEffect = (effects = []) => effects.reduce((m, e) => Math.max(m, Number(e) || 0), 0);

/**
 * ED (p.32, optional): ED rating dice vs the opposing Sensor Rating (or a missile's Intelligence); each success +1
 * Signature; ECD successes (ECD rating vs TN = the ED rating) cancel one each, floor 0.
 */
export function edEffect({ edSuccesses = 0, ecdSuccesses = 0 } = {}) {
  return Math.max(0, (Number(edSuccesses) || 0) - (Number(ecdSuccesses) || 0));
}

/** The per-observer EW term (plan 4a.5): the largest applicable ECM effect + this target's ED effect. */
export const ewTerm = ({ ecm = [], ed = 0 } = {}) => maxEffect(ecm) + (Number(ed) || 0);
