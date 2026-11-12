/**
 * The Rigger 2 Vehicle List (book p.148–166; docs/PLAN-vehicle-list.md): with the Rigger 2 module active, a vehicle the
 * list covers uses the list's stats (ruling 2). Pure rules: which list row a vehicle is, what changes, and how its
 * factory equipment reconciles. No Foundry dependencies; module/vehicle-list.mjs applies them.
 */

/** The stat-line fields the list sets (and the update window compares). */
export const LIST_KEYS = ["vehicleType", "skill", "handling", "handlingOffRoad", "speed", "stallSpeed", "acceleration", "body",
  "armor", "signature", "autonav", "pilot", "sensor", "cargo", "load", "seating", "entryPoints", "ltProfile", "setupTime",
  "fuelType", "fuelSize", "fuelUnit", "economy", "economyUnit", "economyIdle", "designPointValue", "cost", "otherFeatures"];
export const LIST_DESIGN_KEYS = ["category", "transport", "traits"];

/** Any design, the Workshop's (version 2) or the old Design tab's: the list never overrides a designed vehicle. */
export function hasDesign(sys) {
  const d = sys?.design ?? {};
  if (Number(d.version) === 2) return true;
  if (d.chassisKey || d.powerPlantKey) return true;
  return Object.values(d.improvements ?? {}).some(v => Number(v) > 0);
}

/**
 * The list row a vehicle is: its compendium source in the identity map, or a list document's own vehicleId flag.
 * `{ vehicleId, by }` or null. A name match is never returned here (the update window offers those for review).
 */
export function listIdentity(data, list) {
  const src = data?._stats?.compendiumSource ?? "";
  const viaSource = src && list?.identity?.[src]?.vehicleId;
  if (viaSource && list.rows?.[viaSource]) return { vehicleId: viaSource, by: "source" };
  const flag = data?.flags?.sr2e?.vehicleId;
  if (flag && list?.rows?.[flag]) return { vehicleId: flag, by: "flag" };
  return null;
}

const same = (a, b) => Array.isArray(a) || Array.isArray(b)
  ? JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort())
  : (a ?? null) === (b ?? null) || (a === "" && b == null) || (a == null && b === "");

/** The stat changes: `{ changes: [{key, from, to}], patch: {"system.<key>": to} }` (design keys as `design.<key>`). */
export function statChanges(sys, row) {
  sys ??= {};
  const changes = [], patch = {};
  for (const k of LIST_KEYS) {
    const to = row.system[k] ?? null, from = sys[k] ?? null;
    if (!same(from, to)) { changes.push({ key: k, from, to }); patch[`system.${k}`] = to; }
  }
  for (const k of LIST_DESIGN_KEYS) {
    const to = row.system.design?.[k], from = sys.design?.[k];
    if (!same(from, to)) { changes.push({ key: `design.${k}`, from, to }); patch[`system.design.${k}`] = Array.isArray(to) ? [...to] : to; }
  }
  return { changes, patch };
}

/**
 * Reconcile a vehicle's embedded mods with the row's factory equipment (plan "Reconciliation"): for each catalog item
 * the row lists (n copies, each with a rating), the vehicle's existing items of that name are paired in order: a pair
 * becomes factory at the row's rating; missing copies are created; extra existing items stay (aftermarket). A bought
 * customization (it carries a receipt) is never paired. A pair whose rating differs and that isn't factory yet is
 * AMBIGUOUS: by default it's adopted as factory; with `keepAmbiguous` it stays aftermarket and the factory copy is created
 * beside it (the update window's per-vehicle choice). A marked item takes the row's family metadata (modKey, stack) too,
 * so Customize can group it. Idempotent: a reconciled vehicle gives nothing to do.
 * items: [{ _id, name, system: { rating, custom: { state, receipt } } }]; factory: the row's factory item data.
 * Returns { create: [itemData], mark: [{ _id, rating, name, modKey, stack }], ambiguous: [name] }.
 */
export function reconcileFactory(items = [], factory = [], { keepAmbiguous = false } = {}) {
  const create = [], mark = [], ambiguous = [];
  const byKey = Map.groupBy(factory, f => `${f.type ?? "vehicle_mod"}|${f.name}`);
  for (const wanted of byKey.values()) {
    const name = wanted[0].name;
    const type = wanted[0].type ?? "vehicle_mod";
    const free = items.filter(i => (i.type ?? "vehicle_mod") === type && i.name === name && !i.system?.custom?.receipt?.id)
      .sort((a, b) => (b.system?.custom?.state === "factory") - (a.system?.custom?.state === "factory"));   // factory first: idempotent
    // An item that is this entry (same _id) pairs with it first, so deleting one of two copies restores THAT copy.
    const pair = new Map();
    for (const f of wanted) { const j = free.findIndex(i => i._id === f._id); if (j >= 0) pair.set(f, free.splice(j, 1)[0]); }
    for (const f of wanted) if (!pair.has(f) && free.length) pair.set(f, free.shift());
    for (const f of wanted) {
      const i = pair.get(f);
      if (!i) { create.push(f); continue; }
      if (type === "weapon") continue;   // an included weapon: present is enough (no rating or factory state)
      const rating = Number(f.system?.rating ?? 1), cur = Number(i.system?.rating ?? 0), state = i.system?.custom?.state ?? "";
      const modKey = f.system?.modKey ?? "", stack = f.system?.stack ?? "";
      const meta = (i.system?.modKey ?? "") === modKey && (i.system?.stack ?? "") === stack;
      if (state !== "factory" && cur && cur !== rating) {
        ambiguous.push(name);
        if (keepAmbiguous) { create.push(f); continue; }   // it stays aftermarket
      }
      if (state === "factory" && cur === rating && meta) continue;
      mark.push({ _id: i._id, rating, name, modKey, stack });
    }
  }
  return { create, mark, ambiguous };
}

/** What reconciliation reads from a vehicle's items, to detect equipment edited after the update window was built. */
export const factorySignature = (items = [], factory = []) => {
  const names = new Set(factory.map(f => f.name));
  return JSON.stringify(items.filter(i => names.has(i.name)).map(i => [i._id, i.type, i.system?.rating ?? null,
    i.system?.custom?.state ?? "", i.system?.custom?.receipt?.id ?? "", i.system?.modKey ?? "", i.system?.stack ?? ""]).sort());
};

/** The notes paragraph the list adds, once. */
export function withListNote(notes = "", rowNotes = "") {
  const para = (rowNotes.match(/<p><em>Rigger 2 Vehicle List:<\/em>.*?<\/p>/) ?? [""])[0];
  if (!para || String(notes).includes("Rigger 2 Vehicle List:")) return notes;
  return `${notes ?? ""}${para}`;
}

/** A name a vehicle might share with a list row, for the update window's flagged suggestions only. */
export const nameKey = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
