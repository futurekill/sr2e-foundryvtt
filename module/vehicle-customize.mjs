/**
 * Vehicle customization (Rigger 2 p.118–146; docs/PLAN-vehicle-customization.md C3): buying a modification for an
 * EXISTING vehicle, its Installation Test, and finishing it. The pure rules are module/rules/vehicle-custom.mjs.
 *
 * A purchase is a REQUEST record on the vehicle (`flags.sr2e.custRequests.<id>`), which any owner may write:
 *   pending → (active GM admits on the LIVE vehicle, one at a time) admitted | rejected
 *   admitted → (the requesting client, the payer's usual money writer, inside moneyQueue(payer): nuyen − price and the
 *               receipt `flags.sr2e.custReceipts.<id>` in ONE update) paid | unpaid
 *   paid → (active GM: the item, keyed by the request id, then `flags.sr2e.custDelivery.<id> = "delivered"`) done
 *   cancelRequested (GM) → (the payer's writer acknowledges: no receipt → cancelled; a receipt → paid, delivered)
 * Removing a bought item writes `custDelivery.<id> = "removed"` first; recovery never recreates it and finishes the
 * deletion. Every step re-reads the live documents, so a replay changes nothing.
 */
import { customizationQuote, vehicleTraits, installTime, installSkills, familyOf } from "./rules/vehicle-custom.mjs";
import { applyModEffects, modProblems, vehicleCapacity, modCounts, modBaked } from "./rules/vehicle-design.mjs";
import { moneyQueue, adjustNuyen } from "./money.mjs";
import { streetPrice } from "./rules/sr2e-rules.mjs";
import { recomputeDesign } from "./vehicle-base.mjs";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const CATEGORY_BY_SKILL = { bike: "bike", car: "car", hovercraft: "hovercraft", motorboat: "boat", sailboat: "boat", rotor: "rotor", winged: "fixedWing", vectorThrust: "vector" };
const ENGINE_FAMILIES = { speed: "engine-custom-speed", acceleration: "engine-custom-acceleration", load: "engine-custom-load" };
const TIRE_NEEDS = { "drive-by-wire": ["performance", "dualPurpose"], "improved-suspension": ["performance", "dualPurpose"], "off-road-suspension": ["offRoad", "dualPurpose"] };

/* ── Catalog and family identity ─────────────────────────────────────────────────────────────────────────────── */

let catalogCache = null;
/** Every vehicle_mod in the Item compendiums (the Workshop's catalog). */
export async function customizationCatalog() {
  if (!catalogCache) catalogCache = (await import("./apps/vehicle-workshop.mjs")).VehicleWorkshop.loadCatalog();
  return catalogCache;
}

/**
 * An existing item's rule family (plan C2.8b): its modKey; else its compendium source's; else an exact name match in
 * the catalogs; else unresolved (null) — such an item blocks customization on its vehicle until the GM sets a key.
 */
export function resolveFamily(item, catalog = []) {
  const s = item.system;
  if (s.modKey) return s.modKey;
  const src = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  const bySrc = src && catalog.find(c => c.uuid === src);
  if (bySrc) return bySrc.system.modKey || "independent";
  const byName = catalog.find(c => c.name === item.name);
  if (byName) return byName.system.modKey || "independent";
  return null;
}

/* ── The vehicle as the customization rules see it ───────────────────────────────────────────────────────────── */

const requestsOf = (vehicle) => Object.values(vehicle.getFlag("sr2e", "custRequests") ?? {});
const deliveryOf = (vehicle, id) => (vehicle.getFlag("sr2e", "custDelivery") ?? {})[id];

/**
 * The context for customizationQuote (vehicle-custom.mjs). Admitted purchases not yet delivered count as items in
 * "parts" (their levels and room are reserved), except `skipRequest`.
 */
export function customizeContext(vehicle, catalog = [], { skipRequest = null, skipItem = null, installedOnly = false } = {}) {
  const sys = vehicle.system, d = sys.design ?? {};
  const r = d.version === 2 ? recomputeDesign(vehicle) : null;
  const category = d.category || CATEGORY_BY_SKILL[sys.skill] || (sys.vehicleType === "ground" ? "car" : sys.vehicleType === "watercraft" ? "boat" : "");
  const traits = vehicleTraits({ category, drone: sys.vehicleType === "drone" || (d.traits ?? []).includes("drone"), transport: d.transport, traits: d.traits ?? [] });
  const items = vehicle.items.filter(i => i.type === "vehicle_mod" && i.id !== skipItem && deliveryOf(vehicle, i.id) !== "removed")
    .map(i => ({ ...i.system.toObject(), name: i.name, id: i.id, resolvedKey: resolveFamily(i, catalog) }));
  // Unknown, or known only by name/source while lacking the modKey the sheet's derivation reads: the GM fixes it first
  // (normalizeFamilies), so admission, effects and capacity all see the same family (review C3 #11).
  const unresolved = items.filter(i => i.resolvedKey == null || (!i.modKey && i.resolvedKey !== "independent")).map(i => i.name);
  // Reservations: admitted (and paid) requests not delivered yet.
  // A cancellation keeps its reservation until the payer's writer confirms nothing was charged (review C3 #1).
  const reserved = requestsOf(vehicle).filter(q => q.id !== skipRequest && ["admitted", "paid", "cancelRequested"].includes(q.state) && !deliveryOf(vehicle, q.id));
  for (const q of reserved) {
    // A reservation takes the catalog item's own spec, so a later purchase of the same family is marginal to it (R2 #3).
    const cat = catalog.find(c => c.uuid === q.uuid);
    items.push({ ...(cat ? foundry.utils.deepClone(cat.system) : {}), name: q.name, modKey: q.family || cat?.system?.modKey || "", rating: q.levels,
      mountPoints: num(q.mountPoints ?? cat?.system?.mountPoints), custom: { ...(cat?.system?.custom ?? {}), state: "parts" }, reserved: true, specless: !cat });
  }
  // Engine customization: the design option's levels stand in for the families (synthetic), and its ¥ cost (EY).
  const ec = d.version === 2 ? (d.choices?.engineCustom ?? {}) : {};
  const synthetic = Object.fromEntries(Object.entries(ENGINE_FAMILIES).map(([k, fam]) => [fam, num(ec[k])]));
  const plantDP = r ? num(r.dpLines.find(l => /^Power plant/.test(l.label))?.dp) : 0;
  const plantCost = d.version === 2 && r ? Math.round(plantDP * num(r.markUp?.total) * 100) : (sys.plantCost ?? null);
  // Levels already in the stored stats (a design option's, factory items'): a maximum's base leaves their gain out once.
  const baked = { ...synthetic };
  for (const i of items) if (modBaked(i) && familyOf(i)) baked[familyOf(i)] = num(baked[familyOf(i)]) + num(i.rating);
  const installedEc = Object.values(ENGINE_FAMILIES).reduce((t, fam) => t + num(synthetic[fam])
    + items.filter(i => !i.reserved && familyOf(i) === fam && (modCounts(i) || modBaked(i))).reduce((s2, i) => s2 + num(i.rating), 0), 0);
  let ecCost = 0, ecLevels = 0;
  for (const fam of Object.values(ENGINE_FAMILIES)) {
    const n = synthetic[fam] + items.filter(i => familyOf(i) === fam).reduce((t, i) => t + num(i.rating), 0);
    ecLevels += n;
    for (let k = 1; k <= n; k++) ecCost += num(plantCost) * (1.25 + 0.15 * (k - 1));
  }
  // A stat without one family (its maximum's base, p.120, p.122): the same at any batching (review C3 #14).
  const base = { handling: sys.handlingOffRoad != null ? { onRoad: sys.handling, offRoad: sys.handlingOffRoad } : sys.handling,
    speed: sys.speed, acceleration: sys.acceleration, load: sys.load, cargo: sys.cargo, armor: sys.armor, signature: sys.signature, economy: sys.economy };
  const build = { body: sys.body, pilot: sys.pilot, traits };
  const statWithout = (stat, fam) => applyModEffects(base, items.filter(i => !i.reserved && familyOf(i) !== fam), { category, transport: d.transport, build, tires: sys.tires }).stats[stat];
  // Room left, reservations included: the shared capacity rule over installed items + reservations (a reservation
  // whose item left the catalog keeps its admitted CF / Load).
  const real = items.filter(i => !i.reserved);
  const withResv = [...real, ...items.filter(i => i.reserved && !i.specless)];
  const capReal = vehicleCapacity({ cargo: 0, load: 0 }, real, { body: sys.body, pilot: sys.pilot, traits });
  const capResv = vehicleCapacity({ cargo: 0, load: 0 }, withResv, { body: sys.body, pilot: sys.pilot, traits });
  const lost = reserved.filter(q => !catalog.find(c => c.uuid === q.uuid));
  const resvCap = { cfUsed: capResv.cfUsed - capReal.cfUsed + lost.reduce((t, q) => t + num(q.cf), 0),
    loadUsed: capResv.loadUsed - capReal.loadUsed + lost.reduce((t, q) => t + num(q.load), 0) };
  return { traits, category, body: sys.body, pilot: sys.effective?.pilot ?? sys.pilot, chassisDP: r ? num(r.dpLines[0]?.dp) : 0, plantDP,
    engineCustomDP: r ? r.dpLines.filter(l => l.label.startsWith("Engine customization")).reduce((t, l) => t + l.dp, 0) : 0,
    engineCustomLevels: ecLevels, engineCustomCost: Math.round(ecCost), cost: num(sys.cost), plantCost,
    effective: sys.effective ?? {}, statWithout, build, installedOnly, items, synthetic, baked, installedEc, unresolved, tires: sys.tires, drone: traits.has("drone"),
    engine: r ? CONFIG.SR2E.vehicleDesignTables?.powerPlants?.[d.powerPlantKey]?.engine : (sys.fuelType || null),
    cargoFree: num(sys.cargoFree) - resvCap.cfUsed, loadFree: num(sys.loadFree) - resvCap.loadUsed };
}

/**
 * Quote a catalog mod for this vehicle: the rules' quote plus restrictions, family identity, required tires, market
 * access and the street price (p.118: parts are obtained by the core rules, Street Index included).
 */
export function quoteCustomization(vehicle, cat, levels, catalog, { user = game.user, skipRequest = null, ctx = null } = {}) {
  ctx ??= customizeContext(vehicle, catalog, { skipRequest });
  const m = { ...cat.system, name: cat.name };
  const q = customizationQuote(m, levels, { ...ctx, cargoFree: null, loadFree: null });
  const problems = [...q.problems];
  if (!vehicle.system.baseConverted) problems.push("the GM must first settle this vehicle's design (the notice on its sheet)");
  // Room = what the shared capacity rule charges with the item added, minus without it: inherited design CF, a levels
  // family's fixed part and per-class values all counted the same way the sheet will (review C3 #12, #13).
  const real = ctx.items.filter(i => !i.reserved || !i.specless);   // installed + reservations with their specs (R2 #3)
  const before = vehicleCapacity({ cargo: 0, load: 0 }, real, ctx.build);
  const after = vehicleCapacity({ cargo: 0, load: 0 }, [...real, { ...m, rating: q.R, custom: { ...(m.custom ?? {}), state: "parts" } }], ctx.build);
  q.cf = Math.round((after.cfUsed - before.cfUsed) * 100) / 100;
  q.load = Math.round((after.loadUsed - before.loadUsed) * 100) / 100;
  if (ctx.cargoFree != null && q.cf > num(ctx.cargoFree) + 1e-9) problems.push(`it needs ${q.cf} CF; ${ctx.cargoFree} free`);
  if (ctx.loadFree != null && q.load > num(ctx.loadFree) + 1e-9) problems.push(`it weighs ${q.load} kg; ${ctx.loadFree} kg of Load free`);
  // Weapon mounts: hardpoints 2, firmpoints 1, never more than the Body in all (p.131).
  const mp = ctx.items.reduce((t, i) => t + num(i.mountPoints), 0) + num(m.mountPoints);
  if (num(m.mountPoints) && mp > num(ctx.body)) problems.push(`weapon mounts would take ${mp} points; Body ${ctx.body} allows ${ctx.body} (p.131)`);
  if (ctx.unresolved.length) problems.push(`the GM must first identify ${ctx.unresolved.join(", ")} (set its family on the item)`);
  // Prerequisites: at Finish only what's installed (or factory) counts, never parts still waiting (review C3 #5).
  const keys = new Set((ctx.installedOnly ? ctx.items.filter(i => !i.reserved && (modCounts(i) || modBaked(i))) : ctx.items).map(familyOf).filter(Boolean));
  const ecl = ctx.installedOnly ? ctx.installedEc : ctx.engineCustomLevels;   // Finish: only installed engine levels (R2 #5)
  for (const why of modProblems({ ...m, rating: q.R1, maxRating: "" }, { body: ctx.body, pilot: ctx.pilot, engineCustomLevels: ecl },
    { category: ctx.category, engine: ctx.engine, drone: ctx.drone, body: ctx.body, keys, sensor: ctx.effective.sensor, engineCustomLevels: ecl }))
    problems.push(/engine$/.test(why) && !ctx.engine ? `${why}: set the vehicle's fuel type (under More) first` : why);
  const need = TIRE_NEEDS[familyOf(m)];
  if (need && vehicle.system.tires && !need.includes(vehicle.system.tires) && ["bike", "car"].includes(ctx.category))
    problems.push(`it needs ${need.map(t => ({ performance: "performance", dualPurpose: "dual-purpose", offRoad: "off-road" })[t]).join(" or ")} tires (p.146)`);
  if (q.restricted === "military" && !user.isGM) problems.push("military only: the GM must arrange it");
  const charged = q.price == null ? null : Math.round(q.streetIndex != null ? streetPrice(q.price, q.streetIndex) : q.price);
  return { ...q, ok: problems.length === 0, problems, charged, family: familyOf(m), mountPoints: num(m.mountPoints) };
}

/* ── The request (buyer's client) ────────────────────────────────────────────────────────────────────────────── */

/** Ask to buy `levels` of the catalog mod for the vehicle, paid by `payer` (an actor) or null = no charge (GM only). */
export async function requestCustomization(vehicle, cat, levels, payer) {
  const catalog = await customizationCatalog();
  const q = quoteCustomization(vehicle, cat, levels, catalog);
  if (!q.ok) return ui.notifications.warn(`${cat.name}: ${q.problems.join("; ")}.`);
  if (!payer && !game.user.isGM) return ui.notifications.warn("Choose who pays.");
  if (payer && !payer.isOwner) return ui.notifications.warn(`You don't control ${payer.name}.`);
  const id = foundry.utils.randomID(16);
  const req = { id, uuid: cat.uuid, name: cat.name, family: q.family, levels: q.R, payer: payer?.uuid ?? "", userId: game.user.id,
    state: "pending", quoted: q.charged, created: Date.now() };
  await vehicle.update({ [`flags.sr2e.custRequests.${id}`]: req });
  ui.notifications.info(`${cat.name}: purchase requested (${q.charged?.toLocaleString()}¥); waiting for the GM to approve it.`);
  return id;
}

/* ── The GM: admission and delivery (one writer) ─────────────────────────────────────────────────────────────── */

const gmQueues = new Map();
const isActiveGM = () => game.users.activeGM?.isSelf;
function inVehicleQueue(vehicle, fn) {
  const key = vehicle.uuid;
  const run = (gmQueues.get(key) ?? Promise.resolve()).then(fn, fn);
  gmQueues.set(key, run.catch(err => console.error("SR2E | customization", err)));
  return run;
}
const setRequest = (vehicle, id, patch) => vehicle.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`flags.sr2e.custRequests.${id}.${k}`, v])));

/** The active GM works through every vehicle's requests: admit, deliver, recover. */
export function gmProcess(vehicle) {
  if (!isActiveGM() || vehicle?.type !== "vehicle") return;
  return inVehicleQueue(vehicle, async () => {
    const catalog = await customizationCatalog();
    for (const q of requestsOf(vehicle)) {
      const live = vehicle.getFlag("sr2e", "custRequests")?.[q.id];
      if (!live) continue;
      if (live.state === "pending") {
        const cat = catalog.find(c => c.uuid === live.uuid);
        const requester = game.users.get(live.userId);
        const quote = cat ? quoteCustomization(vehicle, cat, live.levels, catalog, { user: requester ?? game.user, skipRequest: live.id }) : null;
        if (!quote) await setRequest(vehicle, live.id, { state: "rejected", reason: "the modification isn't in the catalog any more" });
        else if (!quote.ok) await setRequest(vehicle, live.id, { state: "rejected", reason: quote.problems.join("; ") });
        else if (!live.payer && !requester?.isGM) await setRequest(vehicle, live.id, { state: "rejected", reason: "no payer" });
        else {
          // The payer's money writer is fixed now and never handed over: only its queue pays or acknowledges a
          // cancellation, so nothing it sent can land after the reservation is released (review R2 #1).
          const payerDoc = live.payer ? fromUuidSync(live.payer) : null;
          await setRequest(vehicle, live.id, { state: "admitted", price: live.payer ? quote.charged : 0, cf: quote.cf, load: quote.load,
            mountPoints: quote.mountPoints, writer: payerDoc ? moneyWriterFor(payerDoc)?.id ?? "" : "" });
          // No charge (the GM's own decision): the receipt is the GM's, on the vehicle.
          if (!live.payer) await vehicle.update({ [`flags.sr2e.custReceipts.${live.id}`]: { amount: 0, gm: game.user.id }, [`flags.sr2e.custRequests.${live.id}.state`]: "paid" });
        }
      } else if (["admitted", "paid", "cancelRequested", "cancelled", "unpaid"].includes(live.state) && !deliveryOf(vehicle, live.id) && receiptFor(vehicle, live)) {
        await deliver(vehicle, live, catalog);   // the durable receipt is the proof, not the request's marker (review C3 #3)
      }
    }
    // Finish an interrupted removal (round 4 #3).
    const removed = vehicle.items.filter(i => deliveryOf(vehicle, i.id) === "removed").map(i => i.id);
    if (removed.length) await deleteIfThere(vehicle, removed);
  });
}

/** Delete these items unless another client already did (a concurrent finisher is fine; anything else is an error). */
async function deleteIfThere(vehicle, ids) {
  const live = ids.filter(id => vehicle.items.get(id));
  if (!live.length) return;
  try { await vehicle.deleteEmbeddedDocuments("Item", live); }
  catch (err) { if (live.some(id => vehicle.items.get(id))) throw err; }
}

/** The receipt that proves payment: on the payer (their money writer wrote it) or the GM's no-charge one. */
function receiptFor(vehicle, req) {
  if (!req.payer) return vehicle.getFlag("sr2e", "custReceipts")?.[req.id] ?? null;
  const payer = fromUuidSync(req.payer);
  return payer?.getFlag("sr2e", "custReceipts")?.[req.id] ?? null;
}

async function deliver(vehicle, req, catalog) {
  const receipt = receiptFor(vehicle, req);
  if (!receipt) return;   // not proven paid yet (the payer's write may still be on its way)
  if (!vehicle.items.get(req.id)) {
    const cat = catalog.find(c => c.uuid === req.uuid);
    if (!cat) return console.warn(`SR2E | ${vehicle.name}: paid purchase ${req.name} can't be delivered (not in the catalog).`);
    const system = foundry.utils.mergeObject(foundry.utils.deepClone(cat.system), { rating: req.levels,
      custom: { state: "parts", receipt: { id: req.id, payer: req.payer, amount: num(receipt.amount) }, attempt: {} } });
    try {
      await vehicle.createEmbeddedDocuments("Item", [{ _id: req.id, name: cat.name, type: "vehicle_mod", img: cat.img, system,
        _stats: { compendiumSource: cat.uuid } }], { keepId: true });
    } catch (err) { if (!vehicle.items.get(req.id)) throw err; }   // a replay: the server refused the duplicate
  }
  // Only a delivery that actually landed is recorded (a vetoed create must stay recoverable; review C3 #4).
  if (!vehicle.items.get(req.id)) return console.warn(`SR2E | ${vehicle.name}: ${req.name} wasn't created; it will be retried.`);
  await vehicle.update({ [`flags.sr2e.custDelivery.${req.id}`]: "delivered", [`flags.sr2e.custRequests.${req.id}.state`]: "done" });
}

/** GM: give items known only by name or source their catalog family (modKey, stacking), so every rule agrees. */
export async function normalizeFamilies(vehicle) {
  if (!game.user.isGM) return;
  const catalog = await customizationCatalog();
  const updates = [];
  for (const i of vehicle.items.filter(i => i.type === "vehicle_mod" && !i.system.modKey)) {
    const key = resolveFamily(i, catalog) ?? "independent";   // unknown to every catalog: independent equipment
    const src = catalog.find(c => c.system.modKey === key);
    updates.push({ _id: i.id, "system.modKey": key, "system.stack": src?.system.stack ?? "" });
  }
  if (updates.length) await vehicle.updateEmbeddedDocuments("Item", updates);
  return updates.length;
}

/** GM: cancel a request. An admitted one waits for the payer's writer to confirm nothing was charged (round 5). */
export async function cancelCustomization(vehicle, id) {
  const req = vehicle.getFlag("sr2e", "custRequests")?.[id];
  if (!req || !game.user.isGM) return;
  if (req.state === "pending" || req.state === "rejected" || req.state === "unpaid") return setRequest(vehicle, id, { state: "cancelled" });
  if (req.state === "admitted") return setRequest(vehicle, id, { state: "cancelRequested" });
}

/* ── The payer's writer (the requesting client) ──────────────────────────────────────────────────────────────── */

/**
 * The client that writes this character's money: the active player who owns it (the one whose client runs its
 * ordinary purchases), else the active GM — never two at once (review C3 #2). Ties: the lowest user id.
 */
export function moneyWriterFor(payer) {
  const owners = game.users.filter(u => u.active && !u.isGM && payer.testUserPermission(u, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0] ?? game.users.activeGM ?? null;
}

/** Pay admitted requests (and answer cancellations) this client writes the money for — inside the payer's queue. */
export function payerProcess(vehicle) {
  if (vehicle?.type !== "vehicle") return;
  for (const q of requestsOf(vehicle)) {
    if (!q.payer || !["admitted", "cancelRequested"].includes(q.state)) continue;
    const payer = fromUuidSync(q.payer);
    if (!payer || (q.writer || moneyWriterFor(payer)?.id) !== game.user.id) continue;
    moneyQueue(payer, async () => {
      const live = vehicle.getFlag("sr2e", "custRequests")?.[q.id];   // re-read inside the queue
      if (!live) return;
      const paid = payer.getFlag("sr2e", "custReceipts")?.[q.id];
      if (live.state === "cancelRequested") return setRequest(vehicle, q.id, { state: paid ? "paid" : "cancelled" });
      if (live.state !== "admitted") return;
      if (paid) return setRequest(vehicle, q.id, { state: "paid" });
      const ok = await adjustNuyen(payer, -num(live.price), { [`flags.sr2e.custReceipts.${q.id}`]: { amount: num(live.price), vehicle: vehicle.uuid, name: live.name, levels: live.levels } });
      await setRequest(vehicle, q.id, ok ? { state: "paid" } : { state: "unpaid", reason: `${payer.name} can't pay ${num(live.price).toLocaleString()}¥` });
    }, `customize ${q.name}`);
  }
}

/* ── Installation (p.118, p.120; rulings 7, 10) ──────────────────────────────────────────────────────────────── */

/**
 * This item is a purchase made for THIS vehicle (review C3 #6): its receipt names it, the vehicle recorded its
 * delivery, and the payer's durable receipt (or the GM's no-charge one) exists for this vehicle.
 */
export function verifiedPurchase(vehicle, item) {
  const rec = item.system.custom?.receipt ?? {};
  if (!rec.id || rec.id !== item.id || deliveryOf(vehicle, item.id) !== "delivered") return false;
  if (!rec.payer) return !!vehicle.getFlag("sr2e", "custReceipts")?.[item.id];
  return fromUuidSync(rec.payer)?.getFlag("sr2e", "custReceipts")?.[item.id]?.vehicle === vehicle.uuid;
}

/** The spec an Installation Test is bound to (plan C3.4/C3.5), from the full quote (restrictions, tires, maxima). */
async function liveSpec(vehicle, item, { installedOnly = false } = {}) {
  const catalog = await customizationCatalog();
  const ctx = customizeContext(vehicle, catalog, { skipItem: item.id, installedOnly });
  const cat = { name: item.name, system: { ...item.system.toObject(), custom: { ...item.system.toObject().custom, state: "" } } };
  const q = quoteCustomization(vehicle, cat, item.system.rating, catalog, { ctx, user: game.users.activeGM ?? game.user });
  return { q, spec: { levels: num(item.system.rating), choice: item.system.custom?.choice ?? {}, tn: q.tn, baseTime: q.baseTime, R0: q.R0 } };
}

/** Roll the Installation Test for a bought item, by `worker` (a character the user controls). */
export async function installationTest(vehicle, item, worker) {
  const c = item.system.custom ?? {};
  if (!verifiedPurchase(vehicle, item)) return ui.notifications.warn(`${item.name} isn't a purchase delivered to ${vehicle.name} through Customize.`);
  if (c.state !== "parts") return ui.notifications.warn(`${item.name} is ${c.state === "tested" ? "already tested: Finish it" : "not waiting to be installed"}.`);
  const { q, spec } = await liveSpec(vehicle, item);
  if (q.procedure === "fixed") {
    await item.update({ "system.custom.state": "tested", "system.custom.attempt": { id: foundry.utils.randomID(), by: "", results: [], ok: true, hours: q.fixedHours, unit: "hours", spec } });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<p><strong>${item.name}</strong>: no Installation Test (${q.fixedHours} hours, p.127). It can be finished.</p>` });
  }
  if (q.tn == null || q.baseTime == null) return ui.notifications.warn(`${item.name}: its Target Number or base time can't be worked out (${q.problems.join("; ")}).`);
  const skills = installSkills(q.skills.length ? q.skills : ["vehicleBR"], customizeContext(vehicle).traits);
  const results = [];
  for (const name of skills) {
    const r = await worker.rollNamedSkill(name, q.tn, { label: `${name}: installing ${item.name}` });
    if (!r) return;   // cancelled
    results.push({ skill: name, successes: num(r.successes) });
  }
  const hours = installTime(q.baseTime, results, q.combine);
  const ok = hours != null;
  await item.update({ "system.custom.state": ok ? "tested" : "parts",
    "system.custom.attempt": ok ? { id: foundry.utils.randomID(), by: worker.uuid, results, ok, hours, unit: q.baseUnit, spec } : {} });
  const line = results.map(r => `${r.skill} ${r.successes}`).join(", ");
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: worker }), content: ok
    ? `<p><strong>${item.name}</strong> installed on ${vehicle.name} in <strong>${hours} ${q.baseUnit}</strong> (base ${q.baseTime} ÷ ${q.combine === "sum" ? "all" : "the lowest"} successes: ${line}). Click Finish on the vehicle when the time has passed.</p>`
    : `<p><strong>${item.name}</strong>: the Installation Test failed (${line}; every test needs a success, TN ${q.tn}). The parts stay; try again.</p>` });
}

/** Finish the installation: the passed test must still cover the work; prerequisites, room and maxima re-checked. */
export async function finishInstallation(vehicle, item) {
  const c = item.system.custom ?? {};
  if (c.state !== "tested" || !c.attempt?.ok) return ui.notifications.warn(`${item.name} needs a passed Installation Test first.`);
  if (!verifiedPurchase(vehicle, item)) return ui.notifications.warn(`${item.name} isn't a purchase delivered to ${vehicle.name} through Customize.`);
  const { q, spec } = await liveSpec(vehicle, item, { installedOnly: true });
  const a = c.attempt.spec ?? {};
  const same = a.levels === spec.levels && JSON.stringify(a.choice ?? {}) === JSON.stringify(spec.choice ?? {}) && a.tn === spec.tn && a.baseTime === spec.baseTime && a.R0 === spec.R0;
  if (!same) {
    await item.update({ "system.custom.state": "parts", "system.custom.attempt": {} });
    return ui.notifications.warn(`${item.name}: the vehicle or the work changed since the test (levels, existing levels or the test itself); roll the Installation Test again.`);
  }
  // The item already takes its room (checked on the vehicle's totals below); the GM already admitted the market.
  const blocking = q.problems.filter(p => !/needs .* CF|kg of Load free|no customization price|military only/.test(p));
  if (blocking.length) return ui.notifications.warn(`${item.name} can't be finished: ${blocking.join("; ")}.`);
  if (num(vehicle.system.cargoFree) < -1e-9 || num(vehicle.system.loadFree) < -1e-9) return ui.notifications.warn(`${vehicle.name} is over its Cargo or Load; make room first.`);
  await item.update({ "system.custom.state": "done" });
  ui.notifications.info(`${item.name} is installed on ${vehicle.name}.`);
}

/** Remove a bought modification: the terminal record first, then the item (round 3 #2, round 4 #3). */
export async function removeCustomization(vehicle, item) {
  const id = item.id;
  if (item.system.custom?.receipt?.id) await vehicle.update({ [`flags.sr2e.custDelivery.${id}`]: "removed" });
  await deleteIfThere(vehicle, [id]);   // the GM's recovery pass may already have deleted it (the record triggers it)
}

/* ── Wiring ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export function registerVehicleCustomize() {
  // Levels and the drive-by-wire choice are locked while bought; the GM may change them, which clears the test.
  Hooks.on("preUpdateItem", (item, change, options, userId) => {
    const st = item.system.custom?.state;
    // A purchase's levels never change without a new purchase: also once finished (review C3 #7).
    if (item.type !== "vehicle_mod" || !(["parts", "tested"].includes(st) || (st === "done" && item.system.custom?.receipt?.id))) return;
    const touches = foundry.utils.hasProperty(change, "system.rating") || foundry.utils.hasProperty(change, "system.custom.choice");
    if (!touches) return;
    if (!game.users.get(userId)?.isGM) { if (userId === game.user.id) ui.notifications.warn(`${item.name}'s levels are fixed while it's being installed.`); return false; }
    if (st === "done") return;   // the GM's own call
    if (st === "tested") foundry.utils.setProperty(change, "system.custom.state", "parts");
    foundry.utils.setProperty(change, "system.custom.attempt", {});
  });
  const touch = (actor) => {
    if (actor?.type === "vehicle") { gmProcess(actor); payerProcess(actor); return; }
    // A payer's receipt landed: the GM delivers on the vehicles it names.
    if (!isActiveGM()) return;
    for (const r of Object.values(actor?.getFlag?.("sr2e", "custReceipts") ?? {})) { const v = r.vehicle && fromUuidSync(r.vehicle); if (v) gmProcess(v); }
  };
  Hooks.on("updateActor", (actor) => touch(actor));
  Hooks.once("ready", () => {
    for (const a of game.actors) if (a.type === "vehicle") touch(a);
    for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && t.actor?.type === "vehicle") touch(t.actor);
  });
}

