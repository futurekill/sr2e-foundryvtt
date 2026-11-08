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
import { applyModEffects, modProblems, vehicleCapacity } from "./rules/vehicle-design.mjs";
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
export function customizeContext(vehicle, catalog = [], { skipRequest = null, skipItem = null } = {}) {
  const sys = vehicle.system, d = sys.design ?? {};
  const r = d.version === 2 ? recomputeDesign(vehicle) : null;
  const category = d.category || CATEGORY_BY_SKILL[sys.skill] || (sys.vehicleType === "ground" ? "car" : sys.vehicleType === "watercraft" ? "boat" : "");
  const traits = vehicleTraits({ category, drone: sys.vehicleType === "drone" || (d.traits ?? []).includes("drone"), transport: d.transport, traits: d.traits ?? [] });
  const items = vehicle.items.filter(i => i.type === "vehicle_mod" && i.id !== skipItem && deliveryOf(vehicle, i.id) !== "removed")
    .map(i => ({ ...i.system.toObject(), name: i.name, id: i.id, resolvedKey: resolveFamily(i, catalog) }));
  const unresolved = items.filter(i => i.resolvedKey == null).map(i => i.name);
  // Reservations: admitted (and paid) requests not delivered yet.
  const reserved = requestsOf(vehicle).filter(q => q.id !== skipRequest && ["admitted", "paid"].includes(q.state) && !deliveryOf(vehicle, q.id));
  for (const q of reserved) items.push({ name: q.name, modKey: q.family, rating: q.levels, custom: { state: "parts" }, reserved: true });
  // Engine customization: the design option's levels stand in for the families (synthetic), and its ¥ cost (EY).
  const ec = d.version === 2 ? (d.choices?.engineCustom ?? {}) : {};
  const synthetic = Object.fromEntries(Object.entries(ENGINE_FAMILIES).map(([k, fam]) => [fam, num(ec[k])]));
  const plantDP = r ? num(r.dpLines.find(l => /^Power plant/.test(l.label))?.dp) : 0;
  const plantCost = d.version === 2 && r ? Math.round(plantDP * num(r.markUp?.total) * 100) : (sys.plantCost ?? null);
  let ecCost = 0, ecLevels = 0;
  for (const fam of Object.values(ENGINE_FAMILIES)) {
    const n = synthetic[fam] + items.filter(i => familyOf(i) === fam).reduce((t, i) => t + num(i.rating), 0);
    ecLevels += n;
    for (let k = 1; k <= n; k++) ecCost += num(plantCost) * (1.25 + 0.15 * (k - 1));
  }
  // Speed before any turbocharging (turbocharging's maximum, p.122).
  const base = { handling: sys.handlingOffRoad != null ? { onRoad: sys.handling, offRoad: sys.handlingOffRoad } : sys.handling,
    speed: sys.speed, acceleration: sys.acceleration, load: sys.load, cargo: sys.cargo, armor: sys.armor, signature: sys.signature, economy: sys.economy };
  const noTurbo = items.filter(i => !i.reserved && familyOf(i) !== "turbocharging");
  const speedPreTurbo = applyModEffects(base, noTurbo, { category, transport: d.transport, build: { body: sys.body, pilot: sys.pilot }, tires: sys.tires }).stats.speed;
  // Room left, reservations included.
  const resvCap = vehicleCapacity({ cargo: 0, load: 0 }, reserved.map(q => ({ name: q.name, cfConsumed: num(q.cf), loadReduction: num(q.load) })));
  return { traits, category, body: sys.body, pilot: sys.effective?.pilot ?? sys.pilot, chassisDP: r ? num(r.dpLines[0]?.dp) : 0, plantDP,
    engineCustomDP: r ? r.dpLines.filter(l => l.label.startsWith("Engine customization")).reduce((t, l) => t + l.dp, 0) : 0,
    engineCustomLevels: ecLevels, engineCustomCost: Math.round(ecCost), cost: num(sys.cost), plantCost,
    effective: sys.effective ?? {}, speedPreTurbo, items, synthetic, unresolved, tires: sys.tires, drone: traits.has("drone"),
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
  const q = customizationQuote(m, levels, ctx);
  const problems = [...q.problems];
  if (ctx.unresolved.length) problems.push(`the GM must first identify ${ctx.unresolved.join(", ")} (set its family on the item)`);
  const keys = new Set(ctx.items.map(familyOf).filter(Boolean));
  for (const why of modProblems({ ...m, rating: q.R1, maxRating: "" }, { body: ctx.body, pilot: ctx.pilot, engineCustomLevels: ctx.engineCustomLevels },
    { category: ctx.category, engine: ctx.engine, drone: ctx.drone, body: ctx.body, keys, sensor: ctx.effective.sensor, engineCustomLevels: ctx.engineCustomLevels }))
    problems.push(/engine$/.test(why) && !ctx.engine ? `${why}: set the vehicle's fuel type (under More) first` : why);
  const need = TIRE_NEEDS[familyOf(m)];
  if (need && vehicle.system.tires && !need.includes(vehicle.system.tires) && ["bike", "car"].includes(ctx.category))
    problems.push(`it needs ${need.map(t => ({ performance: "performance", dualPurpose: "dual-purpose", offRoad: "off-road" })[t]).join(" or ")} tires (p.146)`);
  if (q.restricted === "military" && !user.isGM) problems.push("military only: the GM must arrange it");
  const charged = q.price == null ? null : Math.round(q.streetIndex != null ? streetPrice(q.price, q.streetIndex) : q.price);
  return { ...q, ok: problems.length === 0, problems, charged, family: familyOf(m) };
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
          await setRequest(vehicle, live.id, { state: "admitted", price: live.payer ? quote.charged : 0, cf: quote.cf, load: quote.load });
          // No charge (the GM's own decision): the receipt is the GM's, on the vehicle.
          if (!live.payer) await vehicle.update({ [`flags.sr2e.custReceipts.${live.id}`]: { amount: 0, gm: game.user.id }, [`flags.sr2e.custRequests.${live.id}.state`]: "paid" });
        }
      } else if (live.state === "paid" && !deliveryOf(vehicle, live.id)) await deliver(vehicle, live, catalog);
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
  await vehicle.update({ [`flags.sr2e.custDelivery.${req.id}`]: "delivered", [`flags.sr2e.custRequests.${req.id}.state`]: "done" });
}

/** GM: cancel a request. An admitted one waits for the payer's writer to confirm nothing was charged (round 5). */
export async function cancelCustomization(vehicle, id) {
  const req = vehicle.getFlag("sr2e", "custRequests")?.[id];
  if (!req || !game.user.isGM) return;
  if (req.state === "pending" || req.state === "rejected" || req.state === "unpaid") return setRequest(vehicle, id, { state: "cancelled" });
  if (req.state === "admitted") return setRequest(vehicle, id, { state: "cancelRequested" });
}

/* ── The payer's writer (the requesting client) ──────────────────────────────────────────────────────────────── */

/** Pay this client's admitted requests (and answer cancellations) — inside the payer's money queue. */
export function payerProcess(vehicle) {
  if (vehicle?.type !== "vehicle") return;
  for (const q of requestsOf(vehicle)) {
    if (q.userId !== game.user.id || !q.payer || !["admitted", "cancelRequested"].includes(q.state)) continue;
    const payer = fromUuidSync(q.payer);
    if (!payer) continue;
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

/** The spec an Installation Test is bound to (plan C3.4/C3.5). */
async function liveSpec(vehicle, item) {
  const catalog = await customizationCatalog();
  const ctx = customizeContext(vehicle, catalog, { skipItem: item.id });
  const q = customizationQuote({ ...item.system.toObject(), name: item.name, custom: { ...item.system.custom, state: "" } }, item.system.rating, { ...ctx, cargoFree: null, loadFree: null });
  return { q, spec: { levels: num(item.system.rating), choice: item.system.custom?.choice ?? {}, tn: q.tn, baseTime: q.baseTime, R0: q.R0 } };
}

/** Roll the Installation Test for a bought item, by `worker` (a character the user controls). */
export async function installationTest(vehicle, item, worker) {
  const c = item.system.custom ?? {};
  if (!c.receipt?.id) return ui.notifications.warn(`${item.name} wasn't bought through Customize.`);
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
  const { q, spec } = await liveSpec(vehicle, item);
  const a = c.attempt.spec ?? {};
  const same = a.levels === spec.levels && JSON.stringify(a.choice ?? {}) === JSON.stringify(spec.choice ?? {}) && a.tn === spec.tn && a.baseTime === spec.baseTime && a.R0 === spec.R0;
  if (!same) {
    await item.update({ "system.custom.state": "parts", "system.custom.attempt": {} });
    return ui.notifications.warn(`${item.name}: the vehicle or the work changed since the test (levels, existing levels or the test itself); roll the Installation Test again.`);
  }
  const blocking = q.problems.filter(p => !/needs .* CF|kg of Load free|no customization price/.test(p));
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
    if (item.type !== "vehicle_mod" || !["parts", "tested"].includes(item.system.custom?.state)) return;
    const touches = foundry.utils.hasProperty(change, "system.rating") || foundry.utils.hasProperty(change, "system.custom.choice");
    if (!touches) return;
    if (!game.users.get(userId)?.isGM) { if (userId === game.user.id) ui.notifications.warn(`${item.name}'s levels are fixed while it's being installed.`); return false; }
    if (item.system.custom.state === "tested") foundry.utils.setProperty(change, "system.custom.state", "parts");
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

