/**
 * Vehicle design from scratch: the Rigger 2 rules (book p.108–120; tables p.114, p.116, p.167–171), pure.
 * docs/archive/plans/PLAN-vehicle-builder.md §1a. No Foundry here: the Workshop, the data model and the tests all call this.
 *
 * `designVehicle(design, tables, { mods })` returns the itemized Design Points (each line with its page), the stats
 * the design gives (BASE stats: Cargo and Load GROSS; mod effects are the data model's), the Cargo/Load budgets, the
 * Mark-Up and the price, and every problem that blocks building it.
 *
 * The book data (Chassis/Power Plant/Fuel Tank/Mark-Up tables) comes in `tables` (registered by the Rigger 2
 * module); the design-option rules below are the rule entries themselves (p.115–118).
 *
 * User rulings (2026-11-07), each tested: Acceleration Increase 2 DP/pt (p.115; Steffi's "25", p.113, is a misprint);
 * the Handling floor binds the FINAL rating, Smart Materials' −1 included; Cargo Factor stays fractional.
 */

/* ── Body formulas (Power Plant Table "B denotes Body", p.169) ──────────────────────────────────────────────────── */

/**
 * Evaluate a table cell or a mod formula: a number, or an expression over single-letter variables — B (Body) in the
 * Power Plant Table ("5 x B", "10 + (30 x B)", "60 x B^3", "9 - B"); R, B, P, C, E, K in mod formulas — with
 * + − × (x, *, ×) ÷ (/) ^ ( ) and floor()/ceil(). Returns null for an empty / NA / unreadable cell. A recursive-descent
 * parser; no eval.
 */
export function evalExpr(v, vars = {}) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // × and a standalone x (not the x inside "max") multiply.
  const src = v.replace(/×/g, "*").replace(/(?<![a-z])[xX](?![a-z])/g, "*").replace(/[÷]/g, "/").replace(/\s+/g, "");
  if (!src || /^(na|—|-)$/i.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const atom = () => {
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (m) { i += m[0].length; return Number(m[0]); }
    const f = /^(floor|ceil|min|max)\(/.exec(src.slice(i));
    if (f) {
      i += f[0].length;
      const args = [expr()];
      while (peek() === ",") { i++; args.push(expr()); }
      if (peek() !== ")") throw new Error("paren");
      i++;
      return Math[f[1]](...args);
    }
    // Identifiers: an upper-case letter, then upper-case letters / digits (R0, S0, HO, EY); the longest one that's a
    // known variable wins, so "B" in "60B" still reads as the variable B.
    const id = /^[A-Z][A-Z0-9]*/.exec(src.slice(i));
    if (id) {
      let k = id[0];
      while (k.length > 1 && !(k in vars)) k = k.slice(0, -1);
      if (!(k in vars)) throw new Error(`unknown ${k}`);
      i += k.length;
      const val = Number(vars[k]);
      if (vars[k] == null || !Number.isFinite(val)) throw new Error(`missing ${k}`);   // an unknown input blocks, never 0
      return val;
    }
    if (peek() === "(") { i++; const r = expr(); if (peek() !== ")") throw new Error("paren"); i++; return r; }
    if (peek() === "-") { i++; return -atom(); }
    throw new Error(`unexpected ${peek()}`);
  };
  const pow = () => { let b = atom(); while (peek() === "^") { i++; b = b ** atom(); } return b; };
  const term = () => {
    let a = pow();
    for (;;) {
      if (peek() === "*") { i++; a *= pow(); }
      else if (peek() === "/") { i++; a /= pow(); }
      else if (/[A-Z(\d]/.test(peek() ?? "")) a *= pow();   // "60B3" style juxtaposition
      else return a;
    }
  };
  const expr = () => {
    let a = term();
    for (;;) {
      if (peek() === "+") { i++; a += term(); }
      else if (peek() === "-") { i++; a -= term(); }
      else return a;
    }
  };
  try {
    const r = expr();
    return i === src.length && Number.isFinite(r) ? r : null;
  } catch (e) { return null; }
}

/** A formula's syntax is valid (all variables set to 1): for validators. */
/** Every variable a mod formula may use (customization plan C2.3). */
export const FORMULA_VARS = ["R", "R0", "R1", "B", "P", "C", "E", "K", "L", "EDP", "EY", "V", "N", "H", "HO", "A0", "A1", "S0", "S", "STR"];
export const formulaOk = (f) => !f || evalExpr(f, Object.fromEntries(FORMULA_VARS.map(k => [k, 1]))) !== null;

/** A Power Plant Table cell, B = the chassis' Body. */
export const evalCell = (v, body = 0) => evalExpr(v, { B: body });

/* ── The design options (p.115–118) ─────────────────────────────────────────────────────────────────────────── */

/** Per-step Design Point costs from the option entries. */
export const OPTION_DP = Object.freeze({
  speed: 2,          // Speed Increase, per +1 (p.117)
  acceleration: 2,   // Acceleration Increase, per +1 (p.115; user ruling 1)
  load: 1,           // Load Increase, per +10 kg (p.117)
  handling: 25,      // Handling Improvement, per −1 (p.116)
  cargo: 5,          // Increased Cargo Space, per +1 CF (p.116)
  economy: 5,        // Improved Economy, per 5% step (p.116)
  signature: 200,    // Signature Improvement, per level (p.117)
  smartMaterials: 100,          // p.117
  stol: 250, vstol: 400,        // p.116
  hydrofoil: 50,                // p.116
  structuralAgility: 150,       // per level (p.118)
  medicalBase: 400, medicalPerPatient: 80,                              // p.117
  amenities: { basic: [0, 40], improved: [50, 40], high: [100, 40] }    // flat + per occupant incl. driver (p.117)
});

/** Option CF / Load consumption (p.116–117). */
const OPTION_USE = Object.freeze({
  hydrofoil: { cf: 8, load: 0 },
  amenities: { cf: 200, load: 100, usableCf: 160 },
  medical: { cf: 225, load: 500 }
});

/** Chassis categories whose Handling is an on-road/off-road pair (bikes and cars, p.109, p.116). */
const GROUND = new Set(["bike", "car"]);

/** Engine customization (p.120): what one level adds. */
const ENGINE_CUSTOM_STEP = { speed: 30, acceleration: 2 };

/** One level-by-level customization cost: Σ DP × (1.25 + 0.5(k−1)), k = 1..levels (p.120). */
export function engineCustomizationDP(plantDP, levels) {
  let dp = 0;
  for (let k = 1; k <= (Math.max(0, Math.floor(levels || 0))); k++) dp += (plantDP || 0) * (1.25 + 0.5 * (k - 1));
  return Math.round(dp * 100) / 100;
}

/* ── Mods in design: their Design Cost (p.113, catalog p.118–146) ───────────────────────────────────────────── */

const num0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** A rated value: by-rating table (absolute), else flat + per level × rating. */
export function ratedValue(rating, flat, perLevel, table) {
  const r = num0(rating);
  if (Array.isArray(table) && table.length) return r < 1 ? 0 : num0(table[Math.min(r, table.length) - 1]);
  return num0(flat) + num0(perLevel) * Math.max(r, 0);
}

/** The variables a mod formula sees: its rating and the build's numbers. */
const modVars = (m, build = {}) => ({ R: num0(m.rating), B: num0(build.body), P: num0(build.pilot), C: num0(build.chassisDP),
  E: num0(build.plantDP), K: num0(build.engineCustomDP), L: num0(build.engineCustomLevels) });
const formula = (f, m, build) => f ? (evalExpr(f, modVars(m, build)) ?? 0) : 0;

/**
 * One stat effect of a mod (p.120–146): its `effects` formula for this key — `key@<category>` first, then
 * `key@transport` on a transport or tractor, then the plain key — evaluated over R B P C E K L. A mod without an Armor /
 * Signature formula falls back to the old rule (an armor / signature mod adds its Rating). Returns null when the mod has
 * no such effect, else { formula, value } (value null when the formula can't be worked out). The design engine and
 * VehicleData both use it, so the Workshop's review and the saved vehicle agree.
 */
/** Medium/heavy transports and tractors take some mods' `@transport` effect (p.125). */
export const isTransport = (ch = {}) => /transport|tractor/i.test(ch.name ?? "");

export function modEffect(m = {}, key, { category = "", transport = false, build = {} } = {}) {
  const fx = m.effects ?? {};
  const f = [fx[`${key}@${category}`], transport ? fx[`${key}@transport`] : undefined, fx[key]].find(v => v != null && v !== "");
  if (f != null) return { formula: String(f), value: evalExpr(String(f), modVars(m, build)) };
  if ((key === "armor" || key === "signature") && m.modType === key) return { formula: "R", value: num0(m.rating) };
  return null;
}

/** Most specific first (customization plan C2.8): a "key@trait" override is tried in this order, then the plain key. */
export const TRAIT_ORDER = ["zeppelin", "tractor", "truck", "transport", "drone", "electricAircraft",
  "bike", "car", "hovercraft", "boat", "fixedWing", "rotor", "vector", "special"];

/** A customization spec formula for these vehicle traits: the most specific "key@trait" set, else the plain key. */
export function specFormula(m, key, traits = new Set()) {
  const f = m.custom?.formulas ?? {};
  for (const t of TRAIT_ORDER) if (traits.has(t) && f[`${key}@${t}`] != null && f[`${key}@${t}`] !== "") return String(f[`${key}@${t}`]);
  return f[key] != null && f[key] !== "" ? String(f[key]) : null;
}

/** The installed levels of a mod family (its modKey) among these mods. */
export const familyLevels = (mods, key) => mods.filter(m => (m.modKey || m.key) === key).reduce((t, m) => t + num0(m.rating), 0);

/** What an item's customization state means (plan C1.3): "" legacy/ordinary and "done" are installed; "factory" is
 * already in the base; "parts"/"tested" are bought but not working yet; "removed" is gone. */
export const modCounts = (m) => { const st = m.custom?.state ?? m.state ?? ""; return st === "" || st === "done"; };
export const modBaked = (m) => (m.custom?.state ?? m.state) === "factory";

/**
 * Tires (p.146; ruling 14). Standard tires halve (round down) the effect of any suspension or Handling modification;
 * performance tires suit improved suspension and drive-by-wire but negate off-road suspension off-road; off-road tires
 * suit off-road suspension but negate improved suspension / drive-by-wire on-road (and halve them off-road, "as
 * standard tires"); dual-purpose tires run everything. Unset ("auto"): a vehicle with improved suspension or
 * drive-by-wire is assumed to have dual-purpose tires (p.146), one with only off-road suspension off-road tires (it
 * requires them), anything else standard. Only wheeled ground vehicles (bikes, cars) have tires.
 */
export const TIRE_FAMILIES = new Set(["drive-by-wire", "improved-suspension", "off-road-suspension"]);
export function tireType(tires, keys, category) {
  if (!["bike", "car"].includes(category)) return null;
  if (tires) return tires;
  if (keys.has("drive-by-wire") || keys.has("improved-suspension")) return "dualPurpose";
  return keys.has("off-road-suspension") ? "offRoad" : "standard";
}
export function tireFactor(tire, family, key) {
  if (!tire || !TIRE_FAMILIES.has(family) || !["handling", "handlingOff"].includes(key)) return 1;
  const offRoadSusp = family === "off-road-suspension";
  if (tire === "dualPurpose") return 1;
  if (tire === "standard") return 0.5;
  if (tire === "performance") return offRoadSusp && key === "handlingOff" ? 0 : 1;
  if (tire === "offRoad") return offRoadSusp ? 1 : key === "handling" ? 0 : 0.5;
  return 1;
}

const EFFECT_KEYS = ["handling", "handlingOff", "speed", "acceleration", "load", "signature", "armor", "cargo", "economyMult", "speedMult"];
/** Absolute ratings (plan C2.6): the vehicle's rating becomes at least the mod's (Sensors, autonav, remote pilot). */
const SET_KEYS = { sensorSet: "sensor", autonavSet: "autonav", pilotSet: "pilot" };

/**
 * THE mod-effect pass (customization plan C1.2): the base stats plus every installed mod's effects (p.120–146). A
 * "levels" family (`stack: "levels"`, one system bought in level batches) is evaluated once on its total levels, so
 * constant terms apply once; anything else per item. Effects are INCREMENTAL over baked levels (factory items):
 * additive E(total) − E(baked), multipliers E(total) ÷ E(baked). Then drive-by-wire's single +10% (p.124) and armor's
 * +1 Handling per 6 points added (p.127). Used by designVehicle and VehicleData, so the Workshop and the sheet agree.
 * @param {object} base  { handling (number | {onRoad, offRoad}), speed, acceleration, load, cargo, armor, signature, economy, … }
 * @param {object[]} mods  mod system data (+ name, modKey, rating, custom.state, design)
 * @param {object} ctx  { category, transport, build, dbwSplit (fallback split when the DBW item has none) }
 */
export function applyModEffects(base = {}, mods = [], { category = "", transport = false, build = {}, dbwSplit = null, tires = "" } = {}) {
  const problems = [];
  const fx = { handling: 0, handlingOff: 0, speed: 0, acceleration: 0, load: 0, signature: 0, armor: 0, cargo: 0, economyMult: 1, speedMult: 1 };
  const live = mods.filter(m => modCounts(m) || modBaked(m));
  const sets = {};
  for (const m of live.filter(modCounts)) for (const [k, stat] of Object.entries(SET_KEYS)) {
    const e = modEffect(m, k, { category, transport, build });
    if (e?.value != null) sets[stat] = Math.max(sets[stat] ?? -Infinity, e.value);
  }
  // Groups: a levels family is one group; every other item its own.
  const groups = new Map();
  live.forEach((m, i) => {
    const key = m.stack === "levels" && (m.modKey || m.key) ? `fam:${m.modKey || m.key}` : `item:${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const evalAt = (m, k, R) => modEffect({ ...m, rating: R }, k, { category, transport, build });
  const familyOf = (m) => m.modKey || m.key || (/off-?road suspension/i.test(m.name ?? "") ? "off-road-suspension" : "");
  const tire = tireType(tires, new Set(live.filter(modCounts).map(familyOf).filter(Boolean)), category);
  let armorTotal = 0, armorBaked = 0;
  for (const items of groups.values()) {
    // A family's effects come from whichever of its items carries them (a synthetic factory item may carry none).
    const rep = items.find(m => Object.keys(m.effects ?? {}).length) ?? items[0];
    const total = items.reduce((t, m) => t + num0(m.rating), 0);
    const baked = items.filter(modBaked).reduce((t, m) => t + num0(m.rating), 0);
    const allBaked = items.every(modBaked);
    for (const k of EFFECT_KEYS) {
      const eT = evalAt(rep, k, total);
      if (!eT) continue;
      if (eT.value == null) { problems.push({ code: "badFormula", msg: `${rep.name}: its ${k} effect "${eT.formula}" can't be worked out.`, page: rep.page ?? "p.118" }); continue; }
      const eB = baked || allBaked ? evalAt(rep, k, allBaked ? total : baked) : null;
      const vB = eB?.value ?? (k.endsWith("Mult") ? 1 : 0);
      if (k === "armor") { armorTotal += eT.value; armorBaked += vB; }
      if (k.endsWith("Mult")) fx[k] *= vB ? eT.value / vB : eT.value;
      else fx[k] += Math.trunc((eT.value - vB) * tireFactor(tire, familyOf(rep), k));   // halved effects round down (p.146)
    }
  }
  // Drive-by-wire: ONE +10% (never per level, never twice), split among Acceleration / Speed / Load in whole percents.
  const dbws = live.filter(m => (m.modKey || m.key) === "drive-by-wire" && num0(m.rating) > 0);
  let split = null;
  if (dbws.length && !dbws.some(modBaked)) {
    const owner = dbws.find(m => m.design !== false && m.designMod !== false) ?? dbws[0];
    const raw = { acceleration: 10, speed: 0, load: 0, ...(owner.custom?.choice && Object.keys(owner.custom.choice).length ? owner.custom.choice : (dbwSplit ?? {})) };
    split = Object.fromEntries(["acceleration", "speed", "load"].map(k => [k, num0(raw[k])]));
    const vals = Object.values(split);
    if (vals.some(v => v < 0 || !Number.isInteger(v)) || vals.reduce((a, b) => a + b, 0) !== 10)
      problems.push({ code: "dbwSplit", msg: "Drive-by-wire's +10% must be split in whole percents adding up to 10 (Acceleration, Speed, Load).", page: "p.124" });
  }
  const pct = (v, k) => v == null || !split?.[k] ? v : Math.round(v * (1 + split[k] / 100));
  // Armor: +1 Handling per 6 points added (p.127), counted on the total incl. baked points.
  const armorHandling = Math.floor(armorTotal / 6) - Math.floor(armorBaked / 6);
  fx.handling += armorHandling; fx.handlingOff += armorHandling;
  let handling = typeof base.handling === "object" && base.handling !== null ? { ...base.handling } : base.handling;
  if (typeof handling === "object" && handling !== null) {
    handling.onRoad = num0(handling.onRoad) + fx.handling;
    if (handling.offRoad != null) handling.offRoad = num0(handling.offRoad) + fx.handlingOff;
  } else if (handling != null) handling += fx.handling;
  const stats = { ...base, handling,
    speed: base.speed == null ? null : pct(Math.floor((num0(base.speed) + fx.speed) * fx.speedMult), "speed"),   // floats: "round down" (p.144)
    acceleration: base.acceleration == null ? null : pct(num0(base.acceleration) + fx.acceleration, "acceleration"),
    load: base.load == null ? null : pct(num0(base.load) + fx.load, "load"),
    cargo: num0(base.cargo) + fx.cargo,
    armor: num0(base.armor) + fx.armor,
    signature: base.signature == null ? null : num0(base.signature) + fx.signature,
    economy: base.economy == null ? null : base.economy * fx.economyMult };
  for (const [stat, v] of Object.entries(sets)) stats[stat] = Math.max(num0(base[stat]), v);
  return { stats, fx, dbwSplit: split, problems, tire };
}

const AIRCRAFT = new Set(["fixedWing", "rotor", "vector"]);
/**
 * Why a mod can't go on this build (its printed maximum and restrictions, p.118–146), as messages. `ctx`: { category,
 * engine, drone, body, engineCustomLevels, keys (the modKeys installed) }.
 */
export function modProblems(m = {}, build = {}, ctx = {}) {
  const out = [];
  for (const k of ["dpFormula", "cfFormula", "loadFormula", "maxRating"]) {
    if (m[k] && evalExpr(m[k], modVars(m, build)) === null) out.push(`its ${k} "${m[k]}" can't be worked out`);
  }
  const max = m.maxRating ? evalExpr(m.maxRating, modVars(m, build)) : null;
  if (max != null && num0(m.rating) > max) out.push(`its rating ${m.rating} is over the maximum ${max}`);
  const keys = ctx.keys ?? new Set();
  for (const t of m.restrictions ?? []) {
    const [tag, arg = ""] = t.split(":"), list = arg.split(",").filter(Boolean);
    if (tag === "only" && !list.includes(ctx.category)) out.push(`it fits ${list.join("/")} only`);
    else if (tag === "not" && list.includes(ctx.category)) out.push(`not on a ${ctx.category}`);
    else if (tag === "engine" && !list.includes(ctx.engine)) out.push(`it needs a ${list.join("/")} engine`);
    else if (tag === "notDrone" && ctx.drone) out.push("not on a drone");
    else if (tag === "minBody" && num0(ctx.body) < Number(arg)) out.push(`it needs Body ${arg} or more`);
    else if (tag === "needsEngineCustom" && !num0(ctx.engineCustomLevels)) out.push("it needs engine customization");
    else if (tag === "needsRemote" && !ctx.drone && !keys.has("remote-control-interface")) out.push("it needs a Remote-Control Interface (or a drone)");
    else if (tag === "needsRiggerBase" && (!(ctx.drone || keys.has("datajack-port") || keys.has("remote-control-interface")) || !(num0(ctx.sensor) >= 1 || keys.has("sensors")))) out.push("it needs a datajack port or remote-control interface, and Sensor 1 or more");
    else if (tag === "notWith" && list.some(k => keys.has(k))) out.push(`it can't be combined with ${list.filter(k => keys.has(k)).join(", ")}`);
    else if (tag === "notAircraftUnlessElectric" && AIRCRAFT.has(ctx.category) && ctx.engine !== "electric") out.push("aircraft can't take it unless electrically powered");
  }
  return out;
}

/** A mod's Design Cost in this build: its rated value plus its build-relative formula (p.118–146). */
export function modDesignDP(m = {}, build = {}) {
  if (m.designable === false || m.designNuyen) return 0;
  return ratedValue(m.rating, m.designPoints, m.dpPerLevel, m.dpTable) + formula(m.dpFormula, m, build);
}

/** The CF and Load a mod consumes (p.115, p.120): rated value plus formula. */
export const modCf = (m = {}, build = {}) => ratedValue(m.rating, m.cfConsumed, m.cfPerLevel, m.cfTable) + formula(m.cfFormula, m, build);
export const modLoad = (m = {}, build = {}) => ratedValue(m.rating, m.loadReduction, m.loadPerLevel, m.loadTable) + formula(m.loadFormula, m, build);

/**
 * THE capacity rule (plan §1a "one capacity rule"): usable Cargo/Load = gross − the design options' consumption −
 * every installed mod's (design or customization). The data model and the Workshop both call this, so nothing is
 * counted twice or forgotten. `restricted`: CF still usable for gear/passengers but not for mods (living amenities).
 * `build` gives formulas their Body etc.
 */
export function vehicleCapacity({ cargo = 0, load = 0, optionCf = 0, optionLoad = 0, restrictedCf = 0 } = {}, mods = [], build = {}) {
  // Factory equipment is already in a production vehicle's printed figures; a removed item takes nothing (plan C1.3).
  mods = mods.filter(m => !["factory", "removed"].includes(m.custom?.state ?? m.state ?? ""));
  // Each item by its origin's spec (plan C2.4): a customization (bought through the flow) by its Customization
  // Specifications when they give CF / Load, otherwise as in design. A "levels" family counts its FIXED part — f(0)
  // of its earliest item — once, and each item its per-level part f(R) − f(0).
  const use = (m, R) => {
    const custom = ["parts", "tested", "done"].includes(m.custom?.state ?? "");
    const f = m.custom?.formulas ?? {};
    const at = { ...m, rating: R };
    const cfF = specFormula(m, "cf", build.traits), ldF = specFormula(m, "load", build.traits);   // trait overrides, as quoted
    const row = custom && f.set ? (m.custom?.market ?? [])[Math.max(1, Math.min(R, (m.custom?.market ?? []).length)) - 1] ?? {} : {};
    const cf = custom && row.cf != null ? (R > 0 ? num0(row.cf) : 0)
      : custom && cfF != null ? (evalExpr(cfF, modVars(at, build)) ?? 0) : modCf(at, build);
    const ld = custom && row.load != null ? (R > 0 ? num0(row.load) : 0)
      : custom && ldF != null ? (evalExpr(ldF, modVars(at, build)) ?? 0) : modLoad(at, build);
    return { cf, ld };
  };
  let modsCf = 0, modsLoad = 0;
  const seen = new Set();
  for (const m of mods) {
    const fam = m.stack === "levels" ? (m.modKey || m.key || "") : "";
    const full = use(m, num0(m.rating));
    if (!fam) { modsCf += full.cf; modsLoad += full.ld; continue; }
    const zero = use(m, 0);
    modsCf += full.cf - zero.cf; modsLoad += full.ld - zero.ld;
    if (!seen.has(fam)) { seen.add(fam); modsCf += zero.cf; modsLoad += zero.ld; }
  }
  const cfUsed = num0(optionCf) + modsCf, loadUsed = num0(optionLoad) + modsLoad;
  const round = (n) => Math.round(n * 100) / 100;
  return { cargo: num0(cargo), load: num0(load), cfUsed: round(cfUsed), loadUsed: round(loadUsed),
    cargoFree: round(num0(cargo) - cfUsed + num0(restrictedCf)), loadFree: round(num0(load) - loadUsed),
    restrictedCf: num0(restrictedCf), modCfFree: round(num0(cargo) - cfUsed) };
}

/* ── Mark-Up (table p.114) ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Mark-Up = (base for the chassis category + Special Features) × each Special Design multiplier in turn (never
 * added, p.114). `spec.base` is used only where the table gives a range (special vehicles, 1–2.5).
 */
export function markUpFactor(category, spec = {}, table = {}, { smartMaterials = false } = {}) {
  const baseCell = table.base?.[category];
  const base = Array.isArray(baseCell) ? clamp(num0(spec.base) || baseCell[0], baseCell[0], baseCell[1]) : num0(baseCell) || 1;
  let add = smartMaterials ? num0(table.features?.smartMaterials ?? 0.5) : 0;
  for (const [k, v] of Object.entries(spec.features ?? {})) {
    const cell = table.features?.[k];
    if (cell == null || k === "smartMaterials") continue;
    add += Array.isArray(cell) ? (v ? clamp(num0(v), cell[0], cell[1]) : 0) : (v ? num0(cell) : 0);
  }
  let total = base + add;
  const mults = [];
  for (const [k, v] of Object.entries(spec.multipliers ?? {})) {
    const cell = table.multipliers?.[k];
    if (cell == null || !v) continue;
    const m = Array.isArray(cell) ? clamp(num0(v), cell[0], cell[1]) : num0(cell);
    mults.push({ key: k, value: m });
    total *= m;
  }
  return { base, add: Math.round(add * 100) / 100, multipliers: mults, total: Math.round(total * 10000) / 10000 };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Price in ¥ (p.114): DP × Mark-Up × 100, optionally rounded to the nearest 500 or 1,000. */
export function designPrice(dp, markUp, round = 0) {
  const raw = Math.round(num0(dp) * num0(markUp) * 100 * 100) / 100;
  return round > 0 ? Math.round(raw / round) * round : raw;
}

/* ── The whole design ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object} design  `system.design` (version 2): chassisKey, powerPlantKey and the option choices:
 *   speed / acceleration / load (kg) / cargo (CF) / handling (points) as deltas (negative = a free downgrade),
 *   handlingTrack "onRoad" | "offRoad", economySteps, fuelSteps, signature (levels), smartMaterials, takeoff
 *   "" | "stol" | "vstol", hydrofoil, amenities {level, occupants}, medicalPatients (0–2), structuralAgility,
 *   engineCustom {speed, acceleration, load} (levels), gmDP, markUp {base, features, multipliers}, round.
 * @param {object} tables  { chassis: {key: row}, powerPlants: {key: row}, fuel: {engine: row}, markUp }
 * @param {object} [o]
 * @param {object[]} [o.mods]  installed mods: { name, key, rating, design (bool), …DP/CF/Load rule fields }
 */
export function designVehicle(design = {}, tables = {}, { mods = [] } = {}) {
  const problems = [], lines = [];
  const add = (label, dp, page) => { if (dp) lines.push({ label, dp: Math.round(dp * 100) / 100, page }); };
  const problem = (code, msg, page) => problems.push({ code, msg, page });
  // Every count and level is a whole number (a half level would grant half an effect for no cost).
  for (const [k, v] of [["speed", design.speed], ["acceleration", design.acceleration], ["load", design.load],
    ["handling", design.handling], ["cargo", design.cargo], ["economySteps", design.economySteps],
    ["fuelSteps", design.fuelSteps], ["signature", design.signature], ["structuralAgility", design.structuralAgility],
    ["medicalPatients", design.medicalPatients], ["amenities.occupants", design.amenities?.occupants],
    ...Object.entries(design.engineCustom ?? {}).map(([r, l]) => [`engineCustom.${r}`, l])]) {
    if (v != null && v !== "" && !Number.isInteger(Number(v))) problem("notWhole", `${k} must be a whole number.`, "p.115");
  }
  const ch = tables.chassis?.[design.chassisKey] ?? null;
  const pp = tables.powerPlants?.[design.powerPlantKey] ?? null;
  if (!design.chassisKey) problem("noChassis", "Pick a chassis.", "p.109");
  else if (!ch) problem("unknownChassis", "That chassis isn't in the loaded tables.", "p.170");
  if (!design.powerPlantKey) problem("noPlant", "Pick a power plant.", "p.112");
  else if (!pp) problem("unknownPlant", "That power plant isn't in the loaded tables.", "p.167");
  if (ch && pp && Array.isArray(pp.chassis) && !pp.chassis.includes(design.chassisKey)) {
    problem("plantNotForChassis", `The Power Plant Table doesn't list ${pp.name ?? pp.label} for a ${ch.name}.`, "p.112");
  }
  if (!ch || !pp) return { valid: false, problems, dpLines: lines, dp: lines.reduce((s, l) => s + l.dp, 0), stats: {}, budgets: null, markUp: null, price: 0 };

  const body = num0(ch.body), cat = ch.category;
  const cell = (v) => evalCell(v, body);
  const chassisDP = cell(ch.dp), plantDP = cell(pp.dp);
  if (chassisDP == null) problem("chassisDP", `${ch.name}'s Design Points aren't readable in the table.`, ch.page);
  if (plantDP == null) problem("plantDP", `${pp.name ?? pp.label}'s Design Points aren't readable in the table.`, pp.page);
  add(`Chassis: ${ch.name}`, chassisDP ?? 0, ch.page ?? "p.170");
  add(`Power plant: ${pp.name ?? pp.label}`, plantDP ?? 0, pp.page ?? "p.167");

  const sm = !!design.smartMaterials;
  if (sm) add("Smart materials", OPTION_DP.smartMaterials, "p.117");
  const up115 = (n) => n == null ? null : Math.ceil(n * 1.15 - 1e-9);   // Smart materials: maxima ×1.15, rounded up (p.117)

  // Speed (fixed-wing stall speed can't change, p.117), Acceleration, Load: start + Δ ≤ max (+ engine customization).
  const ec = design.engineCustom ?? {};
  const rating = (key, startV, maxV, dpPer, unitLabel, page) => {
    const start = cell(startV), tableMax = cell(maxV);
    const max = sm ? up115(tableMax) : tableMax;
    const delta = num0(design[key]);
    let v = start == null ? null : start + delta;
    if (delta > 0) add(`${unitLabel} +${delta}`, (key === "load" ? Math.ceil(delta / 10) : delta) * dpPer, page);
    if (v != null && max != null && v > max) problem(`${key}OverMax`, `${unitLabel} can't exceed the power plant's maximum ${max} by design options (engine customization goes beyond it).`, page);
    const levels = num0(ec[key]);
    if (levels > 0 && v != null) {
      const per = key === "load" ? body * 50 : ENGINE_CUSTOM_STEP[key];
      const cap = tableMax == null ? null : Math.ceil(tableMax * 1.75 - 1e-9);
      v += per * levels;
      if (cap != null && v > cap) problem(`${key}OverCustom`, `Engine customization can raise ${unitLabel} only to ${cap} (the plant's maximum × 1.75).`, "p.120");
      add(`Engine customization: ${unitLabel} ×${levels} level${levels === 1 ? "" : "s"}`, engineCustomizationDP(plantDP ?? 0, levels), "p.120");
    }
    return { value: v, start, max, bought: start == null ? null : start + delta };
  };
  const speed = rating("speed", pp.speed?.start, pp.speed?.max, OPTION_DP.speed, "Speed", "p.117");
  const accel = rating("acceleration", pp.acceleration?.start, pp.acceleration?.max, OPTION_DP.acceleration, "Acceleration", "p.115");
  if (num0(design.load) % 10) problem("loadStep", "Load is bought in 10 kg steps.", "p.117");
  const load = rating("load", pp.load?.start, pp.load?.max, OPTION_DP.load, "Load (kg)", "p.117");

  // Handling (p.116): −1 per 25 DP on ONE track for ground vehicles; the floor (½ the original, rounded up) binds the
  // final rating, Smart Materials' −1 included (ruling 5).
  const hBought = Math.max(0, num0(design.handling)), hWorse = Math.max(0, -num0(design.handling));
  const pair = typeof ch.handling === "object" && ch.handling !== null;
  const origOn = pair ? num0(ch.handling.onRoad) : num0(ch.handling), origOff = pair ? num0(ch.handling.offRoad) : null;
  const track = GROUND.has(cat) && pair ? (design.handlingTrack === "offRoad" ? "offRoad" : "onRoad") : "onRoad";
  if (hBought) add(`Handling −${hBought} (${track === "offRoad" ? "off-road" : pair ? "on-road" : "handling"})`, hBought * OPTION_DP.handling, "p.116");
  const final = (orig, bought) => {
    const floor = Math.ceil(orig / 2);
    const v = orig - bought - (sm ? 1 : 0) + hWorse;
    if (bought > 0 && v < floor) problem("handlingFloor", `Handling can't go below ${floor} (half the chassis' ${orig}, rounded up), Smart Materials included: buy at most ${Math.max(0, orig - (sm ? 1 : 0) - floor)}.`, "p.116");
    return Math.max(v, floor);   // Smart Materials alone never takes it under the floor either
  };
  let handling = pair
    ? { onRoad: final(origOn, track === "onRoad" ? hBought : 0), offRoad: final(origOff, track === "offRoad" ? hBought : 0) }
    : final(origOn, hBought);

  // Cargo (p.116): +1 CF per 5 DP, ≤ the chassis' maximum.
  const cargoStart = num0(cell(ch.cargo?.start)), cargoMax = cell(ch.cargo?.max);
  const dCargo = num0(design.cargo);
  if (dCargo > 0) add(`Cargo +${dCargo} CF`, dCargo * OPTION_DP.cargo, "p.116");
  const cargo = cargoStart + dCargo;
  if (cargoMax != null && cargo > cargoMax) problem("cargoOverMax", `Cargo can't exceed the chassis' maximum ${cargoMax} CF.`, "p.116");

  // Economy (p.116): 5 DP per 5% step, each ×1.05 of the INITIAL rating (compounding), ≤ the plant's maximum.
  const ecoStart = cell(pp.economy?.start), ecoMax = cell(pp.economy?.max), steps = Math.max(0, num0(design.economySteps));
  let economy = ecoStart;
  if (steps && ecoStart != null) {
    economy = ecoStart * 1.05 ** steps;   // full precision (0.05 → 0.0525); only display rounds
    add(`Economy +${steps * 5}%`, steps * OPTION_DP.economy, "p.116");
    if (ecoMax != null && economy > ecoMax + 1e-9) problem("economyOverMax", `Economy can't exceed the plant's maximum ${ecoMax}.`, "p.116");
  }

  // Fuel tank (Fuel Tank Capacity Table, p.116).
  const fuelRow = tables.fuel?.[pp.engine];
  const fuelSteps = Math.max(0, num0(design.fuelSteps));
  let fuel = cell(pp.fuel?.size), fuelCf = 0;
  if (fuelSteps) {
    if (!fuelRow) problem("noFuelTable", `No Fuel Tank Capacity row for ${pp.engine} engines.`, "p.116");
    else {
      const more = fuelSteps * num0(fuelRow.increase);
      fuel = (fuel ?? 0) + more;
      add(`Fuel tank +${more} ${fuelRow.unit}`, fuelSteps * num0(fuelRow.dp), "p.116");
      fuelCf = fuelRow.cfPer ? (more / num0(fuelRow.cfPer)) * num0(fuelRow.cf) : fuelSteps * num0(fuelRow.cf);
    }
  }

  // Signature (p.117): 200 DP per level; the GM's limit guidance travels with the result.
  const sigLevels = Math.max(0, num0(design.signature));
  if (sigLevels) add(`Signature +${sigLevels}`, sigLevels * OPTION_DP.signature, "p.117");
  const sigBase = cell(pp.signature);
  const signature = sigBase == null ? null : sigBase + sigLevels + (sm && cat === "rotor" ? 1 : 0);

  // Category-bound options.
  let optCf = fuelCf, optLoad = 0, restrictedCf = 0, seatingExtra = 0;
  if (design.takeoff === "stol" || design.takeoff === "vstol") {
    if (cat !== "fixedWing") problem("takeoffCategory", "STOL/VSTOL is for fixed-wing aircraft only.", "p.116");
    add(design.takeoff === "stol" ? "STOL" : "VSTOL", OPTION_DP[design.takeoff], "p.116");
  }
  if (design.hydrofoil) {
    if (cat !== "boat" || ch.subtype === "skiff" || pp.engine === "sail") problem("hydrofoilCategory", "Hydrofoils fit motorboats only, never skiffs or sailboats.", "p.116");
    add("Hydrofoil", OPTION_DP.hydrofoil, "p.116"); optCf += OPTION_USE.hydrofoil.cf;
  }
  const am = design.amenities ?? {};
  if (am.level && OPTION_DP.amenities[am.level]) {
    const occ = Math.max(1, num0(am.occupants));
    const [flat, per] = OPTION_DP.amenities[am.level];
    add(`Living amenities (${am.level}, ${occ} incl. driver)`, flat + per * occ, "p.117");
    optCf += OPTION_USE.amenities.cf; optLoad += OPTION_USE.amenities.load; restrictedCf += OPTION_USE.amenities.usableCf;
  }
  const patients = Math.max(0, num0(design.medicalPatients));   // one, two "and so on" (p.117)
  if (patients) {
    add(`Medical-treatment gear (${patients} patient${patients === 1 ? "" : "s"})`, OPTION_DP.medicalBase + OPTION_DP.medicalPerPatient * patients, "p.117");
    optCf += OPTION_USE.medical.cf; optLoad += OPTION_USE.medical.load; seatingExtra += 2.5 * patients;
  }
  const agility = Math.max(0, num0(design.structuralAgility));
  if (agility) {
    const dbw = mods.find(m => m.design !== false && /drive-?by-?wire/i.test(m.key ?? m.name ?? ""));
    if (!dbw || agility > num0(dbw.rating)) problem("agilityNeedsDbw", "Structural agility needs a drive-by-wire system of at least that level, installed in design.", "p.118");
    add(`Structural agility ${agility}`, agility * OPTION_DP.structuralAgility, "p.118");
  }
  if (num0(design.gmDP)) add("GM-set design options", num0(design.gmDP), "p.117");

  // Mods installed in design: their Design Cost (p.113). Every installed mod counts against capacity.
  const ecDP = lines.filter(l => l.label.startsWith("Engine customization")).reduce((t, l) => t + l.dp, 0);
  const keyOf = (m) => m.modKey || m.key || "";
  const keys = new Set(mods.map(keyOf).filter(Boolean));
  // The Pilot the build actually has: a Remote-Control Interface gives 1, advanced programming raises it (p.125–126).
  const rpap = mods.find(m => keyOf(m) === "remote-pilot");
  const pilot = Math.max(num0(cell(ch.pilot)), keys.has("remote-control-interface") ? 1 : 0, rpap ? num0(rpap.rating) : 0);
  const ecLevels = Object.values(design.engineCustom ?? {}).reduce((t, l) => t + num0(l), 0);
  const build = { chassisDP: chassisDP ?? 0, plantDP: plantDP ?? 0, body, pilot, engineCustomDP: ecDP, engineCustomLevels: ecLevels };
  const ctx = { category: cat, engine: pp.engine, drone: !!ch.drone, body, keys, sensor: cell(ch.sensor), engineCustomLevels: ecLevels };
  let designNuyen = 0, mountPoints = 0;
  for (const m of mods) {
    mountPoints += num0(m.mountPoints);   // every installed mount counts toward the Body limit (p.131)
    if (m.design === false) continue;
    if (m.designable === false) problem("notDesignable", `${m.name} can't be added during design; install it afterwards as a customization.`, m.page ?? "p.118");
    for (const why of modProblems(m, build, ctx)) problem("modRestriction", `${m.name}: ${why}.`, m.page ?? "p.118");
    if (m.designNuyen) designNuyen += num0(m.cost);
    add(`${m.name}${num0(m.rating) ? ` ${m.rating}` : ""}`, modDesignDP(m, build), m.page ?? "p.118");
  }
  if (mountPoints > body) problem("mountPoints", `Weapon mounts need ${mountPoints} points (hardpoint 2, firmpoint 1); a Body ${body} vehicle has ${body}.`, "p.131");

  // Bikes: Autonav above 2 only with rigger adaptation (p.109).
  if (cat === "bike") {
    const auto = mods.find(m => /autonav/i.test(m.key ?? m.name ?? ""));
    const rigger = mods.some(m => /rigger-?adapt/i.test(m.key ?? m.name ?? ""));
    if (auto && num0(auto.rating) > 2 && !rigger) problem("bikeAutonav", "A bike can't have Autonav above 2 without rigger adaptation.", "p.109");
  }

  // What the design options alone bought (the option steppers' limits apply to these, not to mod-adjusted stats).
  const optionStats = { speed: speed.bought, acceleration: accel.bought, load: load.bought, cargo,
    handling: typeof handling === "object" ? { ...handling } : handling };
  // The BASE stats: every design option applied (engine customization included), no mod-item effect. The Workshop saves
  // these; the mods' effects are applied on top by applyModEffects, here and in VehicleData (customization plan C1).
  const baseStats = { handling: typeof handling === "object" ? { ...handling } : handling, speed: speed.value,
    acceleration: accel.value, load: load.value, cargo, armor: num0(cell(ch.armor)), signature, economy,
    sensor: cell(ch.sensor), autonav: cell(ch.autonav), pilot: cell(ch.pilot) };
  const eff = applyModEffects(baseStats, mods.filter(m => m.design !== false),
    { category: cat, transport: isTransport(ch), build, dbwSplit: design.dbwSplit, tires: design.tires ?? "" });
  for (const p of eff.problems) problem(p.code, p.msg, p.page);
  // Turbocharging in design: no further than the plant's maximum Speed × 1.25 (rounded down), but always 1 level (p.122).
  const turbo = familyLevels(mods.filter(m => m.design !== false), "turbocharging");
  if (turbo > 1 && speed.max != null && speed.value != null && speed.value + 15 * turbo > Math.floor(speed.max * 1.25))
    problem("turboMax", `Turbocharging can raise Speed only to ${Math.floor(speed.max * 1.25)} (the maximum × 1.25), or by 1 level.`, "p.122");
  handling = eff.stats.handling; speed.value = eff.stats.speed; accel.value = eff.stats.acceleration; load.value = eff.stats.load;
  economy = eff.stats.economy;
  const sigFinal = eff.stats.signature, dbwSplit = eff.dbwSplit, fx = { cargo: eff.stats.cargo - cargo }, tire = eff.tire;

  const cargoFinal = cargo + fx.cargo;
  const cap = vehicleCapacity({ cargo: cargoFinal, load: load.value ?? 0, optionCf: optCf, optionLoad: optLoad, restrictedCf }, mods, build);
  if (cap.modCfFree < -1e-9) problem("cfOver", `The options and mods need ${cap.cfUsed} CF; the vehicle has ${cargoFinal}.`, "p.115");
  if (cap.loadFree < -1e-9) problem("loadOver", `The options and mods weigh ${cap.loadUsed} kg; the vehicle's Load is ${load.value}.`, "p.115");

  const dp = Math.round(lines.reduce((s, l) => s + l.dp, 0) * 100) / 100;
  const markUp = markUpFactor(cat, design.markUp ?? {}, tables.markUp ?? {}, { smartMaterials: sm });
  const stats = {
    handling, body, armor: eff.stats.armor, speed: speed.value, stallSpeed: cell(pp.speed?.stall),
    acceleration: accel.value, load: load.value, cargo: cargoFinal, signature: sigFinal, dbwSplit,
    autonav: cell(ch.autonav), pilot: cell(ch.pilot), sensor: cell(ch.sensor),
    seating: ch.seating ?? "", seatingExtra, entryPoints: ch.entry ?? "", setupTime: ch.setup ?? "", ltProfile: design.takeoff ? design.takeoff.toUpperCase() : (ch.lt ?? ch.ltProfile ?? ""),
    economy, economyUnit: pp.economy?.unit ?? "", economyIdle: typeof pp.economy?.idle === "object" ? [pp.economy.idle.start, pp.economy.idle.max].filter(Boolean).join(" / ") : (pp.economy?.idle ?? ""), fuelType: pp.engine, fuelSize: fuel, fuelUnit: pp.fuel?.unit ?? "",
    accessories: ch.accessories ?? []
  };
  return { valid: problems.length === 0, problems, dpLines: lines, dp, stats,
    limits: { speed: speed.max, acceleration: accel.max, load: load.max, cargo: cargoMax, economy: ecoMax },
    options: { cf: Math.round(optCf * 100) / 100, load: optLoad, restrictedCf },
    budgets: cap, markUp, designNuyen, optionStats, baseStats, tire,
    // Design Points × Mark-Up × 100, plus what design-installed tires and the like cost in ¥ (p.115, p.146).
    price: designPrice(dp, markUp.total, num0(design.markUp?.round)) + designNuyen };
}
