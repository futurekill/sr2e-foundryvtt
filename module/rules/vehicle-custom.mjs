/**
 * Vehicle customization (Rigger 2 p.118–146; docs/PLAN-vehicle-customization.md C2/C3): pure rules. What a
 * customization costs, where it can be bought, whether the vehicle can take it, and how long it takes to install.
 * No Foundry dependencies; the Workshop's customize mode and the purchase flow call these.
 */
import { evalExpr, modEffect, modCounts, modBaked } from "./vehicle-design.mjs";

const num0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Most specific first (plan C2.8): a "key@trait" override is tried in this order, then the plain key. */
export const TRAIT_ORDER = ["zeppelin", "tractor", "truck", "transport", "drone", "electricAircraft",
  "bike", "car", "hovercraft", "boat", "fixedWing", "rotor", "vector", "special"];

/** The traits a vehicle has: its category and the ticked ones. */
export function vehicleTraits({ category = "", drone = false, transport = false, traits = [] } = {}) {
  const t = new Set(traits);
  if (category) t.add(category);
  if (drone) t.add("drone");
  if (transport) t.add("transport");
  return t;
}

/** A spec formula for this vehicle: the most specific "key@trait" it has, else the plain key. */
export function specFormula(m, key, traits = new Set()) {
  const f = m.custom?.formulas ?? {};
  for (const t of TRAIT_ORDER) if (traits.has(t) && f[`${key}@${t}`] != null && f[`${key}@${t}`] !== "") return String(f[`${key}@${t}`]);
  return f[key] != null && f[key] !== "" ? String(f[key]) : null;
}

/** A mod's rule family (plan C2.8b): its modKey, else the caller-resolved key, else none. */
export const familyOf = (m) => m.modKey || m.resolvedKey || "";

/**
 * The family's levels already on the vehicle (p.120: "existing modification levels count against the maximum"):
 * every item of the family that's installed, factory, or bought and waiting; plus `extra` (a design option's levels
 * standing in for a family, e.g. engine customization chosen in design).
 */
export function familyLevels(items, key, extra = 0) {
  if (!key) return 0;
  return items.filter(m => familyOf(m) === key && (m.custom?.state ?? "") !== "removed")
    .reduce((t, m) => t + num0(m.rating), num0(extra));
}

/** The market row for a rating: row R1, or the last, or the only one. */
export function marketRow(m, rating) {
  const rows = m.custom?.market ?? [];
  if (!rows.length) return {};
  return rows[Math.min(Math.max(1, rating), rows.length) - 1] ?? {};
}

/**
 * Quote a customization: the mod `m` (catalog system data + name) to add `levels` levels to the vehicle `v`.
 * v: { traits (Set), body, pilot, chassisDP, plantDP, engineCustomDP, engineCustomLevels, engineCustomCost (¥),
 *      cost (V), plantCost (N, null = unknown), effective {handling, handlingOffRoad, armor, speed}, speedPreTurbo,
 *      items (the vehicle's mods), synthetic {familyKey: levels}, cargoFree, loadFree }
 * Returns { ok, problems[], price, availability, streetIndex, restricted, tn, baseTime, baseUnit, procedure,
 *   fixedHours, skills, combine, equipment, cf, load, R, R0, R1 }.
 */
export function customizationQuote(m = {}, levels = 1, v = {}) {
  const problems = [];
  const traits = v.traits ?? new Set();
  const key = familyOf(m);
  // A rating-table item (autonav, sensors, ECM…: formulas.set) is bought AT a rating: R is that rating, nothing stacks.
  const set = !!m.custom?.formulas?.set;
  const rated = set || (m.custom?.max && Object.keys(m.custom.max).length) || /R/.test(Object.values(m.custom?.formulas ?? {}).join(" "));
  const R = rated ? Math.max(1, Math.floor(num0(levels))) : 1;
  const R0 = set ? 0 : familyLevels(v.items ?? [], key, v.synthetic?.[key] ?? 0);
  const R1 = R0 + R;
  const eff = v.effective ?? {};
  const vars = { R, R0, R1, B: num0(v.body), P: num0(v.pilot), C: num0(v.chassisDP), E: num0(v.plantDP),
    K: num0(v.engineCustomDP), L: num0(v.engineCustomLevels), EDP: num0(v.engineCustomDP), EY: num0(v.engineCustomCost),
    V: num0(v.cost), N: v.plantCost == null ? null : num0(v.plantCost),
    H: num0(eff.handling), HO: eff.handlingOffRoad == null ? num0(eff.handling) : num0(eff.handlingOffRoad),
    A0: num0(eff.armor), A1: num0(eff.armor) + (modEffect({ ...m, rating: R }, "armor")?.value ?? 0),
    S0: num0(v.speedPreTurbo ?? eff.speed), S: num0(eff.speed) };
  const ev = (k) => {
    const f = specFormula(m, k, traits);
    if (f == null) return { f: null, value: null };
    const value = evalExpr(f, vars);
    if (value == null) problems.push(`its ${k} "${f}" can't be worked out${/\bN\b/.test(f) && vars.N == null ? " (the GM hasn't entered this vehicle's power plant cost)" : ""}`);
    return { f, value };
  };

  if (m.custom?.customizable === false) problems.push("it can only be installed during design");
  const row = marketRow(m, R1);
  if (set && R > (m.custom?.market?.length ?? 0)) problems.push(`it comes in ratings 1–${m.custom?.market?.length ?? 0}`);
  const fromRow = (k, e) => e.f == null && row[k] != null ? { f: String(row[k]), value: num0(row[k]) } : e;
  const price = fromRow("cost", ev("partsCost"));
  if (price.f == null) problems.push("it has no customization price");
  const tn = ev("tn"), base = fromRow("baseTime", ev("baseTime"));
  const cf = fromRow("cf", ev("cf")), load = fromRow("load", ev("load"));
  if (row.restricted === "unavailable") problems.push("it isn't available");

  // The maximum, on the family total (p.120).
  const mx = m.custom?.max ?? {};
  if (mx.value != null && mx.value !== "") {
    const cap = evalExpr(String(mx.value), vars);
    if (cap == null) problems.push(`its maximum "${mx.value}" can't be worked out`);
    else if ((mx.basis ?? "rating") === "rating") {
      if (R1 > cap) problems.push(`the vehicle would have ${R1} levels; the maximum is ${cap}`);
    } else {
      const stat = String(mx.basis).replace(/^stat:/, "");
      const capR = mx.round === "up" ? Math.ceil(cap - 1e-9) : Math.floor(cap + 1e-9);
      const before = stat === "speed" ? num0(v.speedPreTurbo ?? eff.speed) : num0(eff[stat]);
      const gain = modEffect({ ...m, rating: R1 }, stat)?.value ?? 0;
      const after = before + gain;
      if (after > capR && !(mx.minOneLevel && R1 === 1)) problems.push(`${stat} would reach ${after}; the maximum is ${capR}`);
    }
  }
  // Room (p.118, p.120): the vehicle must have the CF and Load free.
  const needCf = num0(cf.value ?? 0), needLoad = num0(load.value ?? 0);
  if (v.cargoFree != null && needCf > num0(v.cargoFree) + 1e-9) problems.push(`it needs ${needCf} CF; ${v.cargoFree} free`);
  if (v.loadFree != null && needLoad > num0(v.loadFree) + 1e-9) problems.push(`it weighs ${needLoad} kg; ${v.loadFree} kg of Load free`);

  const procedure = m.custom?.procedure || "test";
  return { ok: problems.length === 0, problems, price: price.value == null ? null : Math.round(price.value * 100) / 100,
    availability: row.availability ?? "", streetIndex: row.streetIndex ?? null, restricted: row.restricted ?? "",
    tn: tn.value, baseTime: base.value, baseUnit: row.baseUnit || m.custom?.formulas?.baseUnit || "hours", procedure,
    fixedHours: num0(m.custom?.fixedHours), skills: [...(m.custom?.skills ?? [])], combine: m.custom?.combine || "lowest",
    equipment: m.custom?.equipment ?? "", cf: needCf, load: needLoad, R, R0, R1 };
}

/**
 * The installation time (p.118: base time ÷ successes). Several tests: each must succeed; their successes combine by
 * `combine` — "lowest" (ruling 10) or "sum" (drive-by-wire, p.124). Returns null when any test failed.
 */
export function installTime(baseTime, results = [], combine = "lowest") {
  if (!results.length || results.some(r => num0(r.successes) < 1)) return null;
  const s = combine === "sum" ? results.reduce((t, r) => t + num0(r.successes), 0) : Math.min(...results.map(r => num0(r.successes)));
  return Math.round((num0(baseTime) / s) * 100) / 100;
}

/** The Build/Repair skill names a token stands for, for this vehicle (plan C3.3). */
export function installSkills(tokens = [], traits = new Set()) {
  const vehicleBR = traits.has("boat") ? "Boats (B/R)"
    : (traits.has("fixedWing") || traits.has("rotor") || traits.has("vector") || traits.has("zeppelin")) ? "Aircraft (B/R)"
    : "Ground Vehicles (B/R)";
  const map = { vehicleBR, computerBR: "Computers (B/R)", electronicsBR: "Electronics (B/R)", electronics: "Electronics",
    computer: "Computers", demolitionsBR: "Demolitions (B/R)", cyberBR: "Cybertechnology (B/R)", weaponsBR: "Weapons (B/R)" };
  return tokens.map(t => map[t] ?? t);
}

export { modCounts, modBaked };
