/**
 * Rigger 2 vehicle subsystem damage (R2 p.85–87; docs/PLAN-vehicles-phase2.md 6a.4). Pure: no Foundry. Tables 1–8 read
 * from the page render (p.86); the Light row of Table 8 is ruling R6-1 (+1 target modifier).
 */

/** How many subsystems may be hit (p.85): 1D6 − 4 (Moderate) / 3 (Serious) / 2 (Deadly), ÷ 2 rounding up, min 0. */
export function subsystemCount(level, d6) {
  const mod = { M: 4, S: 3, D: 2 }[level];
  if (mod == null) return 0;
  return Math.max(0, Math.ceil(((Number(d6) || 0) - mod) / 2));
}

/** Table 1 → the category tables (2–7). Entries: { key, label } or a directive { again: table } / { twice: 1 } / { gm }. */
export const SUBSYSTEM_TABLES = {
  1: { dice: 1, rows: { 1: { table: 2 }, 2: { table: 3 }, 3: { table: 4 }, 4: { table: 5 }, 5: { table: 6 }, 6: { table: 7 } } },
  2: { dice: 1, rows: { 1: { key: "ecm", label: "ECM" }, 2: { key: "eccm", label: "ECCM" }, 3: { key: "sensors", label: "Sensor Systems" },
    4: { key: "otherElectronics", label: "Other electronics (or roll again on Table 2)", gm: true }, 5: { key: "ecd", label: "ECD" }, 6: { key: "ed", label: "ED" } } },
  3: { dice: 1, rows: { 1: { key: "controlBox", label: "Rigger Control Box" }, 2: { key: "autonav", label: "Autonav" },
    3: { key: "rcLinkup", label: "Remote Control Linkup" }, 4: { key: "handling", label: "Handling" }, 5: { key: "driveByWire", label: "Drive-by-Wire System" },
    6: { key: "otherControl", label: "Other control modification (or roll again on Table 3)", gm: true } } },
  4: { dice: 2, rows: { 2: { key: "apps", label: "APPS System" }, 3: { key: "amphibious", label: "Amphibious System" }, 4: { key: "antiTheft", label: "Anti-Theft System" },
    5: { key: "comms", label: "Communications Gear" }, 6: { key: "droneRack", label: "Drone Rack" }, 7: { key: "enviroSeal", label: "EnviroSeal" },
    8: { key: "cargoMount", label: "External Cargo Mount" }, 9: { key: "lifeSupport", label: "Life Support" }, 10: { key: "spotlight", label: "Spotlight" },
    11: { key: "gmChoice", label: "GM's choice of any vehicle device (or roll again on Table 1)", gm: true }, 12: { twice: 1 } } },
  5: { dice: 1, rows: { 1: { key: "turret", label: "Turret" }, 2: { key: "turret", label: "Turret" }, 3: { key: "weapon", label: "Vehicle Weapon" },
    4: { key: "weapon", label: "Vehicle Weapon" }, 5: { key: "targetAcquisition", label: "Target Acquisition System" }, 6: { key: "targetAcquisition", label: "Target Acquisition System" } } },
  6: { dice: 1, rows: { 1: { key: "gridlink", label: "Gridlink" }, 2: { key: "turbo", label: "Turbocharger/Superconductive Drive" }, 3: { key: "engine", label: "Engine Hit" },
    4: { key: "engineCustom", label: "Engine Customization" }, 5: { key: "nitrous", label: "Nitrous Injector" }, 6: { key: "sunCell", label: "SunCell" } } },
  7: { dice: 1, rows: { 1: { key: "fuelTank", label: "Fuel Tank" }, 2: { key: "compartment", label: "Passenger Compartment" }, 3: { key: "body", label: "Aggravated Body Damage" },
    4: { key: "armor", label: "Armor Defeating Hit" }, 5: { again: 1 }, 6: { twice: 1 } } }
};

/** Table 8: Damage Severity (1–2 Light, 3–4 Moderate, 5 Serious, 6 Deadly). */
export const severity = (d6) => (d6 <= 2 ? "L" : d6 <= 4 ? "M" : d6 === 5 ? "S" : "D");

/**
 * Resolve ONE potential subsystem hit from a dice source `roll(n)` (returns the sum of nD6): Table 1 → its table →
 * the row, following "roll again" / "roll twice" (bounded), then Table 8. Returns [{ key, label, table, gm, level }].
 */
export function resolveSubsystemHit(roll, depth = 0) {
  if (depth > 6) return [];
  const out = [];
  const t1 = SUBSYSTEM_TABLES[1].rows[roll(1)];
  const t = SUBSYSTEM_TABLES[t1.table];
  const row = t.rows[roll(t.dice)];
  if (row.twice) return [...resolveSubsystemHit(roll, depth + 1), ...resolveSubsystemHit(roll, depth + 1)];
  if (row.again) return resolveSubsystemHit(roll, depth + 1);
  out.push({ key: row.key, label: row.label, table: t1.table, gm: !!row.gm, level: severity(roll(1)) });
  return out;
}

/** Engine damage (p.87): Acceleration, Speed and Load × .9 / .7 / .4 (round down); Deadly loses power. */
export const ENGINE_FACTOR = { L: 0.9, M: 0.7, S: 0.4 };
/** Handling (p.86): +1 / +2 / +3; Deadly → an automatic crash. */
export const HANDLING_ADD = { L: 1, M: 2, S: 3 };
/** Fuel tank leak per Turn (p.87): fuel remaining × .01 / .05 / .1; Deadly ruptures (a Crash Test). */
export const LEAK_RATE = { L: 0.01, M: 0.05, S: 0.1 };
/** Armor-Defeating Hit (p.87): −1 / −3 / −6 / −10, cumulative ("lost for good"). */
export const ARMOR_LOSS = { L: 1, M: 3, S: 6, D: 10 };
/** Aggravated Body (p.87): −1 (Body 1: none) / ½ round up / ⅓ round up / destroyed. */
export function aggravatedBody(body, level) {
  const b = Number(body) || 0;
  if (level === "L") return b <= 1 ? b : b - 1;
  if (level === "M") return Math.ceil(b / 2);
  if (level === "S") return Math.ceil(b / 3);
  return 0;
}
/** A mod's bonus under damage (Table 8): Light −1, Moderate halved, Serious inoperable (0), Deadly destroyed (0). */
export function reducedBonus(value, level) {
  const v = Number(value) || 0;
  if (level === "L") return Math.max(0, v - 1);
  if (level === "M") return Math.floor(v / 2);
  return 0;
}
/** With no bonus to reduce (Table 8): +1 (Light, R6-1) / +3 (Moderate) to Success Tests with the device. */
export const NO_BONUS_TN = { L: 1, M: 3 };
/** The worst of several levels (records for one target don't multiply; 6a.4). */
/** A damaged subsystem's damage modifier on the weapons using it (Turret, Target Acquisition; p.86): L +1, M +2, S +3. */
export const SUBSYS_DAMAGE_MOD = { L: 1, M: 2, S: 3 };
/** The worst live level of records with this key on the vehicle (item or built-in), or null. */
export function liveLevelOf(v, key) {
  const lv = Object.values(subsystemsOf(v)).filter(r => r.key === key && recordLive(v, r)).map(r => r.level);
  return worstLevel(lv);
}
export const worstLevel = (levels) => ["D", "S", "M", "L"].find(l => levels.includes(l)) ?? null;

/* ── Records → derived state (pure: reads the vehicle's flags and items only) ─────────────────────────── */

export const subsystemsOf = (v) => v?.flags?.sr2e?.subsystems ?? {};
export const genOf = (v, target) => Number(v?.flags?.sr2e?.subsysGen?.[target]) || 0;

/** Is a record still bound to a live instance? */
export function recordLive(v, r) {
  if (r?.state !== "active") return false;
  if (r.target.kind === "builtin") return (r.target.gen ?? 0) === genOf(v, r.target.id);
  return !!v.items.get(r.target.id);
}

/**
 * The derived subsystem state of a vehicle (VehicleData, each preparation): per item id its worst level; the built-in
 * effects. Armor-Defeating Hits are cumulative (p.87: "gone for good"); everything else takes its worst record.
 */
export function subsystemState(v) {
  const live = Object.values(subsystemsOf(v)).filter(r => recordLive(v, r));
  const items = {}, by = {};
  for (const r of live) {
    if (r.target.kind === "item") items[r.target.id] = worstLevel([items[r.target.id], r.level].filter(Boolean));
    else (by[r.target.id] ??= []).push(r.level);
  }
  const lv = (k) => worstLevel(by[k] ?? []);
  return { items, handling: lv("handling"), engine: lv("engine"), body: lv("body"), fuelTank: lv("fuelTank"),
    armorLoss: (by.armor ?? []).reduce((t, l) => t + (ARMOR_LOSS[l] ?? 0), 0), controlBox: lv("controlBox"), autonav: lv("autonav") };
}

/** Apply the built-in effects to a derived stat block (VehicleData; never stored). */
export function applySubsystemEffects(eff, st, baseBody) {
  if (st.handling && st.handling !== "D") {
    const add = HANDLING_ADD[st.handling];
    if (eff.handlingOffRoad != null) eff.handlingOffRoad += add;
    eff.handling += add;
  }
  const f = st.engine && st.engine !== "D" ? ENGINE_FACTOR[st.engine] : null;
  if (f) for (const k of ["acceleration", "speed", "load"]) if (eff[k] != null) eff[k] = Math.floor(eff[k] * f);
  if (st.armorLoss) eff.armor = Math.max(0, (Number(eff.armor) || 0) - st.armorLoss);
  eff.body = st.body ? aggravatedBody(baseBody, st.body) : baseBody;
  return eff;
}
