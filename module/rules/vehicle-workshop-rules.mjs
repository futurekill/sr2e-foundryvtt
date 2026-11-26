/**
 * The Vehicle Workshop's pure parts (Rigger 2 p.108–146): the working design's shape, what a save writes, the mod
 * step's rules, and the effective stats a vehicle shows. No Foundry: the Workshop (module/apps/vehicle-workshop.mjs),
 * VehicleData and the chargen app's Workshop (sr2e-chargen docs/PLAN-workshop.md) all use these, so they agree.
 */
import { applyModEffects, modEffect, modCounts, modProblems, evalCell, isTransport, QUALITY_FACTORS, OPTION_DP } from "./vehicle-design.mjs";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** A fresh, empty v2 design. */
export const blankDesign = () => ({ chassisKey: "", powerPlantKey: "", speed: 0, acceleration: 0, load: 0, cargo: 0, handling: 0,
  handlingTrack: "onRoad", economySteps: 0, fuelSteps: 0, signature: 0, smartMaterials: false, takeoff: "", hydrofoil: false,
  amenities: { level: "", occupants: 1 }, medicalPatients: 0, structuralAgility: 0, engineCustom: { speed: 0, acceleration: 0, load: 0 },
  gmDP: 0, markUp: { base: 0, features: {}, multipliers: {}, round: 0 } });

/** The vehicle type and driving skill a chassis category gives (CONFIG.SR2E.vehicleTypes). */
export function vehicleTypeFor(ch) {
  if (!ch) return { vehicleType: "ground", skill: "" };
  const t = { bike: "ground", car: "ground", hovercraft: "hovercraft", boat: "boat", fixedWing: "aircraft", rotor: "rotor", vector: "vectored_thrust" }[ch.category];
  if (t) return { vehicleType: ch.drone && t === "ground" ? "drone" : t, skill: ch.category === "bike" ? "bike" : "" };
  // Special: zeppelins and blimps fly; walkers and anthroforms are drones.
  return { vehicleType: /zeppelin|blimp/i.test(ch.name) ? "aircraft" : "drone", skill: "" };
}

/**
 * A chassis' default artwork (Rigger 2 module data `art: { img, aspect }`) as an actor update: the portrait and a token
 * of the house footprint (width from type and Body, length from the trimmed art's aspect; 1 square = 1 m), rotation
 * locked. Null when the chassis has none.
 */
export function chassisArt(ch) {
  if (!ch?.art?.img) return null;
  const b = Number(ch.body) || 0, t = vehicleTypeFor(ch).vehicleType;
  const w = ch.category === "bike" ? 1
    : t === "drone" ? (b <= 2 ? 1 : b <= 4 ? 2 : 3)
    : t === "rotor" ? (b <= 3 ? 8 : 12)
    : t === "aircraft" || t === "vectored_thrust" ? (/blimp|zeppelin/i.test(ch.name) ? Math.max(8, 4 * b) : 8)
    : b <= 4 ? 2 : b <= 6 ? 3 : 4;
  const h = Math.max(1, Math.round(w * (Number(ch.art.aspect) || 1)));
  return { img: ch.art.img, "prototypeToken.texture.src": ch.art.img, "prototypeToken.texture.fit": "contain",
    "prototypeToken.width": w, "prototypeToken.height": h, "prototypeToken.lockRotation": true };
}

/** The actor update a design writes: BASE stats (gross Cargo/Load), the vehicle type, the stored design. */
export function workshopUpdate(design, r, ch, pp, name) {
  // BASE stats (plan C1): design options only; the sheet applies every mod's effects on top (applyModEffects).
  const s = { ...r.stats, ...r.baseStats };
  const t = vehicleTypeFor(ch);
  const pair = typeof s.handling === "object";
  return {
    ...(name ? { name } : {}),
    "system.vehicleType": t.vehicleType, "system.skill": t.skill ?? "",
    "system.handling": pair ? s.handling.onRoad : s.handling, "system.handlingOffRoad": pair ? s.handling.offRoad : null,
    "system.speed": num(s.speed), "system.stallSpeed": num(s.stallSpeed), "system.acceleration": num(s.acceleration),
    "system.body": num(s.body), "system.armor": num(s.armor), "system.signature": num(s.signature),
    "system.pilot": num(s.pilot), "system.sensor": num(s.sensor), "system.autonav": num(s.autonav),
    "system.cargo": num(s.cargo), "system.load": num(s.load),
    "system.seating": String(s.seating ?? ""), "system.seatingExtra": num(s.seatingExtra), "system.entryPoints": String(s.entryPoints ?? ""),
    "system.ltProfile": String(s.ltProfile ?? ""), "system.setupTime": String(s.setupTime ?? ""),
    "system.economy": num(s.economy), "system.economyUnit": String(s.economyUnit ?? ""), "system.economyIdle": String(s.economyIdle ?? ""),
    "system.fuelType": String(s.fuelType ?? ""), "system.fuelSize": num(s.fuelSize), "system.fuelUnit": String(s.fuelUnit ?? ""),
    "system.otherFeatures": (s.accessories ?? []).join(", "),
    "system.designPointValue": num(r.dp), "system.cost": num(r.price),
    "system.design.version": 2, "system.design.baseVersion": 2, "system.tires": String(design.tires ?? ""), "system.design.category": ch.category ?? "", "system.design.transport": isTransport(ch), "system.design.chassisKey": design.chassisKey, "system.design.powerPlantKey": design.powerPlantKey,
    "system.design.choices": structuredClone(design),
    "system.design.optionCf": num(r.options?.cf), "system.design.optionLoad": num(r.options?.load), "system.design.restrictedCf": num(r.options?.restrictedCf)
  };
}

/* ── The mod step ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** The engine's view of the mods (`{ name, system, customization }`): the design's own DBW split (`design.dbwSplit`) is
 *  the one being edited, not a design mod item's saved choice. */
export const engineMods = (mods) => mods.map(m => ({ ...m.system, name: m.name, design: !m.customization,
  custom: { ...(m.system.custom ?? {}), choice: m.customization ? m.system.custom?.choice : {} } }));

/** What a design mod item stores as its `custom.choice` on save: drive-by-wire takes the design's split. */
export const choiceFor = (design, system) => system.modKey === "drive-by-wire"
  ? { acceleration: 10, speed: 0, load: 0, ...(design.dbwSplit ?? {}) } : (system.custom?.choice ?? {});

/** The build and restriction context a mod is checked in (the Workshop's mod step). `mods`: installed `{ system }`. */
export function modBuildContext(design, ch, pp, mods = []) {
  const body = num(ch?.body);
  const build = { body, pilot: num(evalCell(ch?.pilot, body)), chassisDP: num(evalCell(ch?.dp, 0)), plantDP: num(evalCell(pp?.dp, body)) };
  const ctx = { category: ch?.category, engine: pp?.engine, drone: !!ch?.drone, body, sensor: num(ch?.sensor),
    keys: new Set(mods.map(m => m.system.modKey).filter(Boolean)),
    engineCustomLevels: Object.values(design.engineCustom ?? {}).reduce((t, l) => t + num(l), 0) };
  return { build, ctx };
}

/** Why a catalog mod can't be installed in this design (none = it can), at `rating` (default: its own, at least 1). */
export function designModProblems(system, { build, ctx }, rating = null) {
  if (system.designable === false) return ["customization only (install it after the vehicle is built)"];
  return modProblems({ ...system, rating: rating ?? Math.max(1, num(system.rating) || 1) }, build, ctx);
}

/* ── The design's shape (the chargen app's trust boundary; the Workshop's own inputs produce only these) ─────── */

const int = (lo, hi) => ({ t: "int", lo, hi });
const real = (lo, hi) => ({ t: "num", lo, hi });
const oneOf = (...vals) => ({ t: "enum", vals });
const bool = { t: "bool" };
const str = { t: "str" };
/** Every key a v2 design may hold, with its type and bounds. Deltas may be negative (a worse rating is free). */
export const CHOICES_SCHEMA = Object.freeze({
  chassisKey: str, powerPlantKey: str,
  speed: int(-1000, 1000), acceleration: int(-1000, 1000), load: int(-1000000, 1000000), cargo: int(-10000, 10000),
  handling: int(-20, 20), handlingTrack: oneOf("onRoad", "offRoad"),
  economySteps: int(0, 100), fuelSteps: int(0, 100), signature: int(0, 20), smartMaterials: bool,
  takeoff: oneOf("", "stol", "vstol"), hydrofoil: bool,
  amenities: { level: oneOf("", ...Object.keys(OPTION_DP.amenities)), occupants: int(1, 100) },
  medicalPatients: int(0, 100), structuralAgility: int(0, 20),
  engineCustom: { speed: int(0, 20), acceleration: int(0, 20), load: int(0, 20) },
  gmDP: real(0, 100000),
  markUp: { base: real(0, 10), features: "markUpFeatures", multipliers: "markUpMultipliers", round: oneOf(0, 500, 1000) },
  // Optional (absent from blankDesign): tires (p.146), Quality Factors (p.84), drive-by-wire's split (p.124).
  tires: oneOf("", "standard", "performance", "offRoad", "dualPurpose"),
  quality: "quality",
  dbwSplit: { acceleration: int(0, 10), speed: int(0, 10), load: int(0, 10) }
});
const OPTIONAL = new Set(["tires", "quality", "dbwSplit"]);

/**
 * Problems with a design's SHAPE (not its rules): own keys only, the schema's keys only, types and bounds, table keys
 * from the loaded tables (`{ chassis, powerPlants, markUp }`). [] = well-formed.
 */
export function checkChoices(choices, tables = {}) {
  const out = [];
  const plain = (o) => o !== null && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
  const leaf = (spec, v, path) => {
    if (spec.t === "bool") { if (typeof v !== "boolean") out.push(`${path} must be true or false`); return; }
    if (spec.t === "str") { if (typeof v !== "string" || v.length > 64) out.push(`${path} must be a short text`); return; }
    if (spec.t === "enum") { if (!spec.vals.includes(v)) out.push(`${path} must be one of ${spec.vals.map(x => JSON.stringify(x)).join(", ")}`); return; }
    if (typeof v !== "number" || !Number.isFinite(v) || (spec.t === "int" && !Number.isInteger(v)) || v < spec.lo || v > spec.hi)
      out.push(`${path} must be a ${spec.t === "int" ? "whole " : ""}number from ${spec.lo} to ${spec.hi}`);
  };
  const markUpMap = (v, path, table) => {
    if (!plain(v)) return out.push(`${path} must be an object`);
    for (const [k, x] of Object.entries(v)) {
      const cell = table?.[k];
      if (cell === undefined || k === "smartMaterials") { out.push(`${path}.${k} isn't in the Mark-Up table`); continue; }
      if (Array.isArray(cell)) { if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > cell[1]) out.push(`${path}.${k} must be 0 or ${cell[0]}–${cell[1]}`); }
      else if (typeof x !== "boolean") out.push(`${path}.${k} must be true or false`);
    }
  };
  const walk = (schema, obj, path, top) => {
    if (!plain(obj)) return out.push(`${path || "the design"} must be an object`);
    for (const k of Object.keys(obj)) if (!Object.hasOwn(schema, k)) out.push(`${path ? `${path}.` : ""}${k} isn't a design field`);
    for (const [k, spec] of Object.entries(schema)) {
      const p = path ? `${path}.${k}` : k;
      if (!Object.hasOwn(obj, k)) { if (!(top && OPTIONAL.has(k))) out.push(`${p} is missing`); continue; }
      const v = obj[k];
      if (spec === "markUpFeatures") markUpMap(v, p, tables.markUp?.features);
      else if (spec === "markUpMultipliers") markUpMap(v, p, tables.markUp?.multipliers);
      else if (spec === "quality") {
        if (!plain(v)) { out.push(`${p} must be an object`); continue; }
        for (const [q, n] of Object.entries(v)) {
          if (!Object.hasOwn(QUALITY_FACTORS, q)) out.push(`${p}.${q} isn't a Quality Factor`);
          else leaf(int(0, QUALITY_FACTORS[q].max), n, `${p}.${q}`);
        }
      } else if (spec.t) leaf(spec, v, p);
      else walk(spec, v, p, false);
    }
  };
  walk(CHOICES_SCHEMA, choices, "", true);
  if (out.length) return out;
  if (choices.chassisKey && !Object.hasOwn(tables.chassis ?? {}, choices.chassisKey)) out.push("chassisKey isn't in the Chassis Table");
  if (choices.powerPlantKey && !Object.hasOwn(tables.powerPlants ?? {}, choices.powerPlantKey)) out.push("powerPlantKey isn't in the Power Plant Table");
  if (choices.dbwSplit) {
    const s = choices.dbwSplit;
    if (s.acceleration + s.speed + s.load !== 10) out.push("dbwSplit must add up to 10 (%)");
  }
  return out;
}

/* ── The effective stats (VehicleData; customization plan C1) ─────────────────────────────────────────────────── */

export const CATEGORY_BY_SKILL = { bike: "bike", car: "car", hovercraft: "hovercraft", motorboat: "boat", sailboat: "boat", rotor: "rotor", winged: "fixedWing", vectorThrust: "vector" };

/**
 * The effective stats of a vehicle: its stored BASE plus every installed mod's effects, the one effect pass the
 * Workshop also uses. `sys` = the vehicle's system data, `items` = its items (`{ _id|id, type, name, system, flags }`).
 * `removed` = `flags.sr2e.custDelivery` (a mod whose removal is written is gone at once); `subsysItems` = each mod's
 * worst live subsystem damage level (R2 p.85–87), or null. Returns `{ effective, mods, build, baseConverted }`;
 * `effective` before fuel grades and subsystem damage, which VehicleData applies on top.
 */
export function vehicleEffective(sys, items = [], { removed = {}, subsysItems = null } = {}) {
  const design = sys.design ?? {};
  const live = items.filter(i => i.type === "vehicle_mod" && removed[i._id ?? i.id] !== "removed");
  const category = design.category || CATEGORY_BY_SKILL[sys.skill] || (sys.vehicleType === "ground" ? "car" : "");
  // The vehicle's traits, so a customization's per-class CF / Load is the one it was quoted at (plan C2.8).
  const traits = new Set([...(design.traits ?? []), category, ...(sys.vehicleType === "drone" ? ["drone"] : []), ...(design.transport ? ["transport"] : [])].filter(Boolean));
  const build = { body: sys.body, pilot: sys.pilot, traits };
  const ctx = { category, transport: design.transport, build, tires: sys.tires };
  const mods = live.map(i => ({ ...i.system, name: i.name, designMod: !!i.flags?.sr2e?.designMod, subsysLevel: subsysItems?.[i._id ?? i.id] ?? null }));
  const pair = sys.handlingOffRoad != null;
  const base = { handling: pair ? { onRoad: sys.handling, offRoad: sys.handlingOffRoad } : sys.handling,
    speed: sys.speed, acceleration: sys.acceleration, load: sys.load, cargo: sys.cargo, armor: sys.armor,
    signature: sys.signature, economy: sys.economy, sensor: sys.sensor, autonav: sys.autonav, pilot: sys.pilot };
  // A 0.143.0 Workshop design not yet converted (design.baseVersion < 2) has its design mods baked in: only Armor/Signature.
  const baseConverted = design.version !== 2 || design.baseVersion >= 2;
  let eff;
  if (baseConverted) eff = applyModEffects(base, mods, ctx).stats;
  else {
    const add = (k) => mods.filter(modCounts).reduce((t, m) => t + (modEffect(m, k, ctx)?.value ?? 0), 0);
    eff = { ...base, armor: (Number(sys.armor) || 0) + add("armor"), signature: (Number(sys.signature) || 0) + add("signature") };
  }
  const h = eff.handling;
  const effective = {
    handling: typeof h === "object" && h !== null ? h.onRoad : h, handlingOffRoad: typeof h === "object" && h !== null ? h.offRoad : null,
    speed: eff.speed, acceleration: eff.acceleration, load: eff.load, cargo: eff.cargo, armor: eff.armor,
    signature: eff.signature, economy: eff.economy, sensor: eff.sensor, autonav: eff.autonav, pilot: eff.pilot,
    body: Number(sys.body) || 0
  };
  return { effective, mods, build, baseConverted };
}
