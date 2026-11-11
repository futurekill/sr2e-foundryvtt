/**
 * Customization plan C1.6 (docs/PLAN-vehicle-customization.md): convert vehicles designed in the 0.143.0 Workshop,
 * whose stored Handling / Speed / Acceleration / Load / Cargo / Economy have the design mods' effects BAKED in, to the
 * new representation (stored = base, every mod's effects derived on top; `design.baseVersion: 2`).
 *
 * A pending pass, not a world migration (the world version stamps regardless): on every active-GM load, once the
 * Rigger 2 tables are registered, over world actors and unlinked token actors. A vehicle converts automatically only
 * when its stored fields equal what 0.143.0 wrote; one edited since is left as it was (old behaviour) with a GM notice
 * and two choices on its sheet (reapplyDesign / keepAsEdited). Armor and Signature were always stored without mod
 * effects and are never touched here.
 */
import { designVehicle, vehicleCapacity, applyModEffects } from "./rules/vehicle-design.mjs";

const BAKED = ["handling", "handlingOffRoad", "speed", "acceleration", "load", "cargo", "economy"];
const close = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-6);

/** Every vehicle actor in the world, linked or not. */
function allVehicles() {
  const out = game.actors.filter(a => a.type === "vehicle");
  for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && t.actor?.type === "vehicle") out.push(t.actor);
  return out;
}

const needsConversion = (a) => a.system.design?.version === 2 && !(a.system.design?.baseVersion >= 2);

/** The stored-field values a design writes, from a stats object (0.143.0 wrote r.stats; now r.baseStats). */
function storedFields(stats) {
  const pair = typeof stats.handling === "object" && stats.handling !== null;
  return { handling: pair ? stats.handling.onRoad : stats.handling, handlingOffRoad: pair ? stats.handling.offRoad : null,
    speed: stats.speed, acceleration: stats.acceleration, load: stats.load, cargo: stats.cargo, economy: stats.economy };
}

/** Recompute a v2 vehicle's design from its stored choices and items. Null when a table row is missing. */
export function recomputeDesign(actor, tables = CONFIG.SR2E.vehicleDesignTables) {
  const d = actor.system.design ?? {}, choices = d.choices ?? {};
  if (!tables?.chassis?.[choices.chassisKey] || !tables?.powerPlants?.[choices.powerPlantKey]) return null;
  const mods = actor.items.filter(i => i.type === "vehicle_mod").map(i => ({ ...i.system.toObject?.() ?? i.system, name: i.name,
    design: !!i.getFlag("sr2e", "designMod") }));
  return designVehicle(choices, tables, { mods });
}

/** What differs between a vehicle's stored baked fields and what 0.143.0 would have stored. */
export function bakedDiff(actor, r) {
  const want = storedFields(r.stats), sys = actor.system;
  return BAKED.filter(k => !close(sys[k], want[k])).map(k => ({ field: k, stored: sys[k], design: want[k] }));
}

const updateFor = (r) => {
  const base = storedFields(r.baseStats);
  return { ...Object.fromEntries(BAKED.map(k => [`system.${k}`, base[k]])), "system.design.baseVersion": 2,
    "flags.sr2e.-=baseConvert": null };
};

/** Move the design's DBW split onto the drive-by-wire item (plan C1.5). */
async function moveDbwSplit(actor) {
  const split = actor.system.design?.choices?.dbwSplit;
  const dbw = actor.items.find(i => i.type === "vehicle_mod" && i.getFlag("sr2e", "designMod") && i.system.modKey === "drive-by-wire");
  if (dbw && !Object.keys(dbw.system.custom?.choice ?? {}).length)
    await dbw.update({ "system.custom.choice": { acceleration: 10, speed: 0, load: 0, ...(split ?? {}) } });
}

const ctxOf = (actor) => { const d = actor.system.design ?? {}; return { category: d.category, transport: d.transport,
  build: { body: actor.system.body, pilot: actor.system.pilot } }; };
const designModsOf = (actor) => actor.items.filter(i => i.type === "vehicle_mod" && i.getFlag("sr2e", "designMod"))
  .map(i => ({ ...i.system.toObject(), name: i.name, design: true }));

/**
 * Convert one vehicle if it still has exactly what 0.143.0 stored. Checked before anything is written: the new base +
 * the design mods' effects (the one effect pass) must reproduce the stored baked fields exactly. (Mods added on the
 * sheet afterwards start applying their effects once converted: that's the point of the change, not a difference.)
 * Returns "converted" | "edited" | "missingRows" | "skip".
 */
export async function convertVehicle(actor) {
  if (!needsConversion(actor)) return "skip";
  const r = recomputeDesign(actor);
  if (!r) return "missingRows";
  const diff = bakedDiff(actor, r);
  const check = storedFields(applyModEffects(r.baseStats, designModsOf(actor), { ...ctxOf(actor), dbwSplit: actor.system.design?.choices?.dbwSplit }).stats);
  const stored = storedFields(r.stats);
  const reproduces = BAKED.every(k => close(check[k], stored[k]));
  if (diff.length || !reproduces) {
    const why = diff.length ? diff : [{ field: "conversion", stored: "", design: "the base + mods don't reproduce the design" }];
    if (JSON.stringify(actor.getFlag("sr2e", "baseConvert")?.diff) !== JSON.stringify(why))
      await actor.setFlag("sr2e", "baseConvert", { status: "edited", diff: why });
    return "edited";
  }
  await moveDbwSplit(actor);
  await actor.update(updateFor(r));
  return "converted";
}

/** GM choice on an edited vehicle: its stats come from the design again. */
export async function reapplyDesign(actor) {
  const r = recomputeDesign(actor);
  if (!r) return ui.notifications.warn(`${actor.name}: its chassis or power plant isn't in the design tables (is the Rigger 2 module on?).`);
  await moveDbwSplit(actor);
  await actor.update(updateFor(r));
}

/**
 * GM choice on an edited vehicle: keep what it has now as a production vehicle (plan C1.6). Its printed stats become
 * what it shows now, counting only what's converted: Armor/Signature + the design mods' share; Cargo/Load minus the
 * design options and the design mods' consumption. Design mods become factory items; design engine-customization
 * levels become factory engine-customization items. Checked before writing: the new base must give the same Armor,
 * Signature and usable Cargo/Load with the remaining (unflagged) mods as the vehicle shows now.
 */
export async function keepAsEdited(actor) {
  const sys = actor.system, d = sys.design ?? {}, ctx = ctxOf(actor);
  const designItems = actor.items.filter(i => i.type === "vehicle_mod" && i.getFlag("sr2e", "designMod"));
  const designMods = designModsOf(actor);
  const others = actor.items.filter(i => i.type === "vehicle_mod" && !i.getFlag("sr2e", "designMod")).map(i => ({ ...i.system.toObject(), name: i.name }));
  const share = applyModEffects({ armor: 0, signature: 0 }, designMods, ctx).stats;
  const used = vehicleCapacity({ cargo: 0, load: 0 }, designMods, ctx.build);
  const base = { armor: (sys.armor || 0) + share.armor, signature: (sys.signature || 0) + (share.signature ?? 0),
    cargo: (sys.cargo || 0) - (d.optionCf || 0) - used.cfUsed, load: (sys.load || 0) - (d.optionLoad || 0) - used.loadUsed };
  // The check: with only the other mods on top (factory items add nothing), Armor/Signature and free space match now.
  const fxOthers = applyModEffects({ armor: 0, signature: 0 }, others, ctx).stats;
  const capAfter = vehicleCapacity({ cargo: base.cargo, load: base.load, restrictedCf: d.restrictedCf }, others, ctx.build);
  const fxOthersOld = others.reduce((t, m) => ({ armor: t.armor + (applyModEffects({ armor: 0 }, [m], ctx).stats.armor), signature: t.signature + (applyModEffects({ signature: 0 }, [m], ctx).stats.signature ?? 0) }), { armor: 0, signature: 0 });
  const ok = close(base.armor + fxOthers.armor, sys.armor + share.armor + fxOthersOld.armor)
    && close(capAfter.cargoFree, sys.cargoFree) && close(capAfter.loadFree, sys.loadFree);
  if (!ok) {
    console.warn(`SR2E | ${actor.name}: keeping it as edited would change its stats.`, { base, capAfter, cargoFree: sys.cargoFree, loadFree: sys.loadFree });
    return ui.notifications.warn(`${actor.name} couldn't be kept as edited without changing its stats; nothing was changed. See the console.`);
  }
  // Engine customization levels as factory items, with the family's effects (p.120) so a later customized level is
  // worked out on the total (review C3 #9).
  const EC_FX = { speed: { speed: "30 x R" }, acceleration: { acceleration: "2 x R" }, load: { load: "B x 50 x R" } };
  const ec = Object.entries(d.choices?.engineCustom ?? {}).filter(([, l]) => Number(l) > 0).map(([k, l]) => ({
    _id: foundry.utils.randomID(16), name: `Engine Customization (${{ speed: "Speed", acceleration: "Acceleration", load: "Load" }[k] ?? k})`, type: "vehicle_mod",
    system: { modType: "engine", rating: Number(l), modKey: `engine-custom-${k}`, stack: "levels", effects: EC_FX[k] ?? {}, custom: { state: "factory", choice: {} } } }));
  // A resumable transaction (review C3 #8): the plan first, then the items, then the stats and the stamp; an
  // interruption anywhere is finished by the pending pass (resumeKeepAsEdited), never applied twice.
  await actor.update({ "flags.sr2e.keepEdited": { base, items: designItems.map(i => i.id), ec } });
  if (await resumeKeepAsEdited(actor)) ui.notifications.info(`${actor.name} is now a production vehicle with its current stats.`);
}

/** Finish a recorded "Keep as edited" (idempotent: each step checks what's already done). */
export async function resumeKeepAsEdited(actor) {
  const plan = actor.getFlag("sr2e", "keepEdited");
  if (!plan) return;
  const items = (plan.items ?? []).map(id => actor.items.get(id)).filter(i => i && i.system.custom?.state !== "factory");
  if (items.length) await actor.updateEmbeddedDocuments("Item", items.map(i => ({ _id: i.id, "system.custom.state": "factory", "flags.sr2e.-=designMod": null })));
  const missing = (plan.ec ?? []).filter(e => !actor.items.get(e._id));
  if (missing.length) {
    try { await actor.createEmbeddedDocuments("Item", missing, { keepId: true }); }
    catch (err) { if (missing.some(e => !actor.items.get(e._id))) throw err; }
  }
  // Only a fully converted vehicle is stamped: every planned item factory, every engine item present (review R2 #2).
  const notFactory = (plan.items ?? []).filter(id => actor.items.get(id) && actor.items.get(id).system.custom?.state !== "factory");
  const notMade = (plan.ec ?? []).filter(e => !actor.items.get(e._id));
  if (notFactory.length || notMade.length) {
    console.warn(`SR2E | ${actor.name}: Keep as edited isn't finished yet (items not converted); it will be retried.`, { notFactory, notMade });
    ui.notifications.warn(`${actor.name}: keeping it as edited didn't finish; it will be retried on the next load.`);
    return false;
  }
  const b = plan.base;
  await actor.update({ "system.armor": b.armor, "system.signature": b.signature, "system.cargo": b.cargo, "system.load": b.load,
    "system.design.version": 1, "system.design.baseVersion": 2, "system.design.chassisKey": "", "system.design.powerPlantKey": "",
    "system.design.optionCf": 0, "system.design.optionLoad": 0, "flags.sr2e.-=baseConvert": null, "flags.sr2e.-=keepEdited": null });
  return true;
}

let running = false;
/** The pending pass (GM only). */
export async function convertVehicleBases() {
  if (running || !game.users.activeGM?.isSelf) return;
  if (!Object.keys(CONFIG.SR2E.vehicleDesignTables?.chassis ?? {}).length) return;   // waits for the tables hook
  running = true;
  const report = { converted: [], edited: [], missingRows: [] };
  try {
    for (const a of allVehicles()) {
      try {
        if (a.getFlag("sr2e", "keepEdited")) { await resumeKeepAsEdited(a); continue; }   // an interrupted Keep as edited
        const r = await convertVehicle(a); if (report[r]) report[r].push(a.name);
      }
      catch (err) { console.error(`SR2E | converting ${a.name}`, err); }
    }
  } finally { running = false; }
  if (report.converted.length) console.log(`SR2E | Vehicle bases converted: ${report.converted.join(", ")}`);
  if (report.edited.length) ui.notifications.warn(`SR2E: ${report.edited.length} vehicle(s) were edited after design and need your choice on their sheet: ${report.edited.join(", ")}.`);
  if (report.missingRows.length) console.warn(`SR2E | Vehicles not converted (design tables missing rows): ${report.missingRows.join(", ")}`);
}

export function registerVehicleBase() {
  Hooks.once("ready", () => convertVehicleBases());
  Hooks.on("sr2e.vehicleDesignTables", () => { if (game.ready) convertVehicleBases(); });
}
