/**
 * Rigger 2 sensors and electronic warfare, Part 4a (docs/PLAN-vehicles-phase2.md 4.0, 4a.1–4a.5). Rigger 2 ruleset only.
 *
 *   - Transmitters: a vehicle's working devices (Sensors, ECM, ECCM, ED, ECD vehicle mods; RC decks/radios flagged by
 *     rule) identified by item id, plus `builtin-sensor` for stock sensors with no Sensors item (`transmitterOf`).
 *   - Every record is written by the ACTIVE GM in the vehicle queue `vdmg:<uuid>` (GM ops below). Records store the
 *     generations they depend on and are valid only while those still match (R4-2: "until contact is lost"):
 *       flags.sr2e.ewGen = { device: { <deviceId>: n }, link: { <deviceId>~<recipientKey>: n } }
 *     `device` bumps when a device is switched off, stops working or is removed; `link` when the recipient leaves that
 *     transmitter's range (the GM's sweep on token moves, chase-distance changes, boosts and conditions). Hiding from a
 *     pursuer is the chase pair's `hideGen` (chase.mjs). Readers never mutate records.
 *   - ECM/ECCM/ED/ECD Tests are equipment against equipment, "not … an action by either character" (R2 p.31): the GM's
 *     client rolls them when an observer first needs them and posts the card. The Sensor Test (Sensor Rating dice, no
 *     pools) is rolled and recorded by the GM in one step for the controlling player.
 */
import { gmCall, gmOp, controllerOf, followId } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { activeChases, chaseOf } from "./chase-state.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { sensorComponents, sensorTestTN, sensorResult, baseFlux, modifiedFlux, fluxRange, boostProblems, deviceBoost,
  ecmEffect, edEffect, maxEffect } from "./rules/vehicle-sensor-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const vq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);
const isActiveGM = () => !!game.users.activeGM?.isSelf;
const WORKING = ["", "done", "factory"];
const KIND_BY_MODKEY = { sensors: "sensor", ecm: "ecm", eccm: "eccm", ed: "ed", ecd: "ecd" };
export const BUILTIN = "builtin-sensor";
const gmWhisper = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id);

/** The optional ED/ECD rule (R2 p.32), off by default. */
export const edRuleOn = () => { try { return isRigger2() && !!game.settings.get("sr2e", "r2ElectronicDeception"); } catch (e) { return false; } };

/* ── Transmitters ─────────────────────────────────────────────────────────────────────────────────────────── */

const isPort = (i) => i.type === "vehicle_mod" && (i.system.modKey === "electronics-port" || /electronics port/i.test(i.name));
const itemWorking = (i) => WORKING.includes(i.system.custom?.state ?? "");

/** Is this device connected through an installed Electronics Port (R2 p.30, p.139)? Ports name their device. */
export function ported(vehicle, deviceId) {
  return !!vehicle?.items?.some(i => isPort(i) && itemWorking(i) && i.system.custom?.choice?.device === deviceId);
}

/** Does the vehicle have a sensor system at all (R2 p.27, p.31; plan 4a.3)? */
export function hasSensors(vehicle) {
  const s = vehicle?.system;
  if (!s) return false;
  if (s.sensorInstalled != null) return s.sensorInstalled;
  return (s.effective?.sensor ?? s.sensor ?? 0) > 0 || !!vehicle.items.some(i => i.system?.modKey === "sensors" && itemWorking(i));
}

/** Every transmitter on the vehicle, working or not: { id, kind, rating, item, working, on, ported }. */
export function transmitters(vehicle) {
  if (vehicle?.type !== "vehicle") return [];
  const on = vehicle.getFlag("sr2e", "ewOn") ?? {};
  const out = [];
  let sensorItem = null;
  for (const i of vehicle.items) {
    const kind = i.type === "vehicle_mod" ? KIND_BY_MODKEY[i.system.modKey]
      : ["rc-deck", "radio"].includes(i.flags?.sr2e?.rule) ? (i.flags.sr2e.rule === "rc-deck" ? "rcDeck" : "radio") : null;
    if (!kind) continue;
    if (kind === "sensor") { if (sensorItem) continue; sensorItem = i; }
    const working = i.type === "vehicle_mod" ? itemWorking(i) : true;
    // Sensors, decks and radios are always on while working; ECM/ECCM/ED/ECD are toggled (Simple Actions, p.32).
    const toggled = ["ecm", "eccm", "ed", "ecd"].includes(kind);
    out.push({ id: i.id, kind, rating: kind === "sensor" ? (vehicle.system.effective?.sensor ?? i.system.rating) : Number(i.system.rating) || 0,
      item: i, working, on: working && (!toggled || !!on[i.id]), ported: ported(vehicle, i.id) });
  }
  if (!sensorItem && hasSensors(vehicle))
    out.unshift({ id: BUILTIN, kind: "sensor", rating: vehicle.system.effective?.sensor ?? vehicle.system.sensor ?? 0, item: null,
      working: true, on: true, ported: ported(vehicle, BUILTIN) });
  return out;
}

/** The one resolver (plan 4a.3): an installed, working transmitter by id (embedded item or the built-in sensor). */
export const transmitterOf = (vehicle, deviceId) => transmitters(vehicle).find(t => t.id === deviceId && t.working) ?? null;
const activeOf = (vehicle, kind) => transmitters(vehicle).filter(t => t.kind === kind && t.on);
/** The vehicle's sensor transmitter, if any. */
export const sensorOf = (vehicle) => transmitters(vehicle).find(t => t.kind === "sensor" && t.working) ?? null;
const best = (list) => list.reduce((b, t) => (t.rating > (b?.rating ?? -1) ? t : b), null);

/** A transmitter's Flux and range (p.30–31): base, a valid boost, its conditions, the vehicle's ECCM and ECD. */
export function txFlux(vehicle, t) {
  if (!t) return null;
  const alloc = vehicle.getFlag("sr2e", "fluxBoosts") ?? {};
  const valid = !boostProblems(alloc, boostContext(vehicle)).length;
  const conditions = vehicle.getFlag("sr2e", "txConditions")?.[t.id] ?? {};
  const eccm = t.kind === "eccm" ? 0 : (best(activeOf(vehicle, "eccm"))?.rating ?? 0);
  const ecd = t.kind === "ecd" ? 0 : (best(activeOf(vehicle, "ecd"))?.rating ?? 0);
  const base = Number.isFinite(conditions.runAt) ? conditions.runAt : baseFlux(t.kind, t.rating);
  const { flux, used } = modifiedFlux({ base, boost: valid ? deviceBoost(alloc, t.id) : 0, kind: t.kind, conditions, eccm, ecd });
  let range = fluxRange(flux);
  if (range && typeof range === "object") range = Number.isFinite(conditions.halfRange) ? conditions.halfRange : range.low;
  if (range == null && Number.isFinite(conditions.gmRange)) range = conditions.gmRange;
  return { base, flux, range, used, boostValid: valid };
}

/** What the boost validator needs from the live vehicle. */
export function boostContext(vehicle) {
  const devices = {}, amplifiers = {};
  for (const t of transmitters(vehicle)) devices[t.id] = { working: t.working, ported: t.ported };
  for (const i of vehicle?.items ?? []) if (i.type === "vehicle_mod" && i.system.modKey === "power-amplifier" && itemWorking(i)) amplifiers[i.id] = Number(i.system.rating) || 0;
  return { body: vehicle?.system?.body ?? 0, devices, amplifiers };
}

/**
 * Sensor components (p.27): the rating's, plus every installed "Sensor Upgrade" mod (modKey `sensor-upgrade`, bought
 * and installed through the customization flow; its `system.components` names what it adds, magnification levels =
 * its rating). Works the same for a Sensors item and stock sensors.
 */
export function componentsOf(vehicle) {
  const t = sensorOf(vehicle);
  if (!t) return null;
  const up = {};
  for (const i of vehicle.items) {
    if (i.type !== "vehicle_mod" || i.system.modKey !== "sensor-upgrade" || !itemWorking(i)) continue;
    for (const [k, v] of Object.entries(i.system.components ?? {})) {
      if (k === "magnification") up.magnification = { level: (up.magnification?.level ?? 0) + (Number(i.system.rating) || 0) };
      else if (v?.added) up[k] = { added: true };
    }
  }
  return sensorComponents(t.rating, up);
}

/* ── Distance and generations ─────────────────────────────────────────────────────────────────────────────── */

const keyOf = (actor) => followId(actor.uuid);
/** A token of this actor on a scene (the viewed scene first). */
function tokenOf(actor, scene) {
  if (actor?.isToken) return actor.token?.parent === scene ? actor.token : null;
  return scene?.tokens?.find(t => t.actorId === actor?.id && t.actorLink) ?? null;
}
/** Metres between two actors: their chase pair if they have one, else their tokens on a shared scene, else null. */
export function distanceBetween(a, b, positions = null) {
  for (const chase of activeChases().map(chaseOf)) {
    const ea = Object.entries(chase.entries ?? {}).find(([, e]) => e.uuid === a.uuid)?.[0];
    const eb = Object.entries(chase.entries ?? {}).find(([, e]) => e.uuid === b.uuid)?.[0];
    if (!ea || !eb) continue;
    const p = Object.values(chase.pairs ?? {}).find(p => (p.pursuer === ea && p.quarry === eb) || (p.pursuer === eb && p.quarry === ea));
    if (p && Number.isFinite(p.distance)) return p.distance;
  }
  const scenes = [game.scenes?.viewed, ...(game.scenes ?? [])].filter(Boolean);
  for (const scene of scenes) {
    const ta = tokenOf(a, scene), tb = tokenOf(b, scene);
    if (!ta || !tb) continue;
    const pa = positions?.[ta.uuid] ?? ta, pb = positions?.[tb.uuid] ?? tb;
    const g = scene.grid;
    const px = Math.hypot((pa.x ?? 0) - (pb.x ?? 0), (pa.y ?? 0) - (pb.y ?? 0));
    const dz = ((pa.elevation ?? 0) - (pb.elevation ?? 0));
    const metres = (px / (g.size || 100)) * (g.distance || 1);
    return Math.hypot(metres, dz);
  }
  return null;
}

const gens = (vehicle) => vehicle?.getFlag("sr2e", "ewGen") ?? {};
const devGen = (vehicle, id) => gens(vehicle).device?.[id] ?? 0;
const linkKey = (deviceId, recipient) => `${deviceId}~${keyOf(recipient)}`;
const linkGen = (vehicle, deviceId, recipient) => gens(vehicle).link?.[linkKey(deviceId, recipient)] ?? 0;
/** The chase pair's hide generation between an observer and a target (chase.mjs bumps it when the target hides). */
function hideState(observer, target) {
  for (const chase of activeChases().map(chaseOf)) {
    const eo = Object.entries(chase.entries ?? {}).find(([, e]) => e.uuid === observer.uuid)?.[0];
    const et = Object.entries(chase.entries ?? {}).find(([, e]) => e.uuid === target.uuid)?.[0];
    if (!eo || !et) continue;
    const p = Object.values(chase.pairs ?? {}).find(p => p.pursuer === eo && p.quarry === et);
    if (p) return { inContact: p.contact === true, gen: p.hideGen ?? 0 };
  }
  return { inContact: true, gen: 0 };
}

/* ── Validity ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** A sensor lock on `target` held by `vehicle` (plan 4a.2), or null when missing or invalid (R4-2). */
export function lockOn(vehicle, target) {
  const lock = vehicle?.getFlag("sr2e", "locks")?.[keyOf(target)];
  if (!lock || lock.cleared) return null;
  const sensor = transmitterOf(vehicle, lock.deviceId);
  if (!sensor) return null;
  if (devGen(vehicle, lock.deviceId) !== lock.deps.device) return null;
  if (linkGen(vehicle, lock.deviceId, target) !== lock.deps.link) return null;
  const h = hideState(vehicle, target);
  if (!h.inContact || h.gen !== lock.deps.hide) return null;
  return lock;
}

/** The valid ECM outcome of jammer J against observer O, or null (plan 4a.4). */
function jamOn(jammer, observer) {
  const ev = jammer.getFlag("sr2e", "jamEvent"), vs = jammer.getFlag("sr2e", "jamVs")?.[keyOf(observer)];
  if (!ev || !vs || vs.eventId !== ev.id) return null;
  const ecm = transmitterOf(jammer, ev.deviceId);
  if (!ecm || !activeOf(jammer, "ecm").some(t => t.id === ev.deviceId)) return null;
  if (devGen(jammer, ev.deviceId) !== ev.deviceGen || linkGen(jammer, ev.deviceId, observer) !== vs.link) return null;
  const sensor = sensorOf(observer);
  if (!sensor || devGen(observer, sensor.id) !== vs.observerDeviceGen) return null;
  // A cancellation layer stands only while its ECCM is still on and unchanged (plan 4.0).
  const eccmOk = vs.eccm && activeOf(observer, "eccm").some(t => t.id === vs.eccm.deviceId) && devGen(observer, vs.eccm.deviceId) === vs.eccm.deviceGen;
  return ecmEffect({ jamDice: ev.dice.map(total => ({ total })), observerSensor: vs.observerSensor, observerSuccesses: vs.observerSuccesses,
    eccm: eccmOk ? vs.eccm : null }).effect;
}

/** The valid ED outcome of deceiver T against observer O (optional rule), or null. */
function edOn(target, observer) {
  if (!edRuleOn()) return null;
  const rec = target.getFlag("sr2e", "edVs")?.[keyOf(observer)];
  if (!rec) return null;
  if (!activeOf(target, "ed").some(t => t.id === rec.deviceId) || devGen(target, rec.deviceId) !== rec.deviceGen) return null;
  if (linkGen(target, rec.deviceId, observer) !== rec.link) return null;
  const ecdOk = rec.ecd && activeOf(observer, "ecd").some(t => t.id === rec.ecd.deviceId) && devGen(observer, rec.ecd.deviceId) === rec.ecd.deviceGen;
  return edEffect({ edSuccesses: rec.edSuccesses, ecdSuccesses: ecdOk ? rec.ecd.successes : 0 });
}

/** Jammers whose ECM field covers the observer (any field other than its own, p.58). */
function jammersCovering(observer) {
  const out = [];
  for (const j of game.actors.filter(a => a.type === "vehicle" && a !== observer)) {
    const ecm = best(activeOf(j, "ecm"));
    if (!ecm) continue;
    const d = distanceBetween(j, observer), r = txFlux(j, ecm)?.range;
    if (d != null && r != null && d <= r) out.push({ jammer: j, ecm });
  }
  return out;
}

/** The observer-specific EW term for O against T (plan 4a.5), from the VALID records only. */
export function ewTermOf(observer, target) {
  const ecm = jammersCovering(observer).map(({ jammer }) => jamOn(jammer, observer) ?? 0);
  const ed = target?.type === "vehicle" ? edOn(target, observer) ?? 0 : 0;
  return { ecm: maxEffect(ecm), ed, total: maxEffect(ecm) + ed };
}

/* ── GM: rolling ECM / ECCM / ED / ECD as needed (p.31–32) ────────────────────────────────────────────────── */

async function card(speakerActor, html) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: speakerActor }), content: `<div class="sr2e-damage-result">${html}</div>`,
    flags: { sr2e: { ewCard: true } } });
}
const roll = async (dice, tn) => SR2ESuccessRoll.successTest(Math.max(0, dice), Math.max(2, tn));

/** Make sure every jammer covering O has a valid outcome against O, and T's ED against O (rolling what's missing). */
async function ensureEw(observer, target) {
  const sensor = sensorOf(observer);
  if (!sensor) return;
  for (const { jammer, ecm } of jammersCovering(observer)) {
    if (jamOn(jammer, observer) != null) continue;
    await vq(jammer.uuid, async () => {
      if (jamOn(jammer, observer) != null) return;
      const jf = txFlux(jammer, ecm);
      let ev = jammer.getFlag("sr2e", "jamEvent");
      const evValid = ev && ev.deviceId === ecm.id && ev.deviceGen === devGen(jammer, ecm.id);
      const patch = {};
      if (!evValid) {
        // ONE ECM Test for this jammer (p.32): its Flux in dice (R4-1), stored and read at each observer's Sensor Rating.
        const r = await roll(Math.floor(jf.flux), 2);
        ev = { id: foundry.utils.randomID(16), deviceId: ecm.id, deviceGen: devGen(jammer, ecm.id), dice: r.results, ecm: ecm.rating, flux: jf.flux };
        patch["flags.sr2e.jamEvent"] = ev;
        patch["flags.sr2e.-=jamVs"] = null;
      }
      const sf = txFlux(observer, sensor);
      const opp = await roll(Math.floor(sf.flux), ecm.rating);
      let eccm = null;
      const counter = best(activeOf(observer, "eccm"));
      if (counter) {
        const c = await roll(counter.rating, ecm.rating), j = await roll(ecm.rating, counter.rating);
        eccm = { deviceId: counter.id, deviceGen: devGen(observer, counter.id), counterSuccesses: c.successes, jammerSuccesses: j.successes };
      }
      const vs = { eventId: ev.id, observerUuid: observer.uuid, observerSensor: sensor.rating, observerSuccesses: opp.successes, observerDeviceGen: devGen(observer, sensor.id),
        link: linkGen(jammer, ecm.id, observer), eccm };
      if (!evValid) await jammer.update(patch);
      await jammer.update({ [`flags.sr2e.jamVs.${keyOf(observer)}`]: vs });
      const res = ecmEffect({ jamDice: ev.dice.map(total => ({ total })), observerSensor: sensor.rating, observerSuccesses: opp.successes, eccm });
      await card(jammer, `<strong>ECM Test: ${esc(jammer.name)} vs ${esc(observer.name)}</strong> (Rigger 2 p.31–32)<br>
        Jammer: ${ev.dice.length} dice (ECM Flux ${ev.flux}) vs ${Math.max(2, sensor.rating)} (Sensor) → ${res.jam};
        ${esc(observer.name)}: ${Math.floor(sf.flux)} dice (sensor Flux) vs ${ecm.rating} (ECM) → ${opp.successes}.
        ${eccm ? `<br>ECCM ${eccm.counterSuccesses} vs jammer ${eccm.jammerSuccesses}: cancels ${res.cancel ?? 0}.` : ""}
        <br><strong>${res.won ? `${esc(jammer.name)}'s Signature +${res.effect} against ${esc(observer.name)}'s sensors.` : "No jamming."}</strong>
        <br><em>Holds until contact is lost (R4-2).</em>`);
    });
  }
  if (!edRuleOn() || target?.type !== "vehicle") return;
  const ed = best(activeOf(target, "ed"));
  if (!ed || edOn(target, observer) != null) return;
  const d = distanceBetween(target, observer), r = txFlux(target, ed)?.range;
  if (d == null || r == null || d > r) return;
  await vq(target.uuid, async () => {
    if (edOn(target, observer) != null) return;
    const e = await roll(ed.rating, sensor.rating);
    let ecd = null;
    const counter = best(activeOf(observer, "ecd"));
    if (counter) { const c = await roll(counter.rating, ed.rating); ecd = { deviceId: counter.id, deviceGen: devGen(observer, counter.id), successes: c.successes }; }
    await target.update({ [`flags.sr2e.edVs.${keyOf(observer)}`]: { deviceId: ed.id, observerUuid: observer.uuid, deviceGen: devGen(target, ed.id), edSuccesses: e.successes,
      link: linkGen(target, ed.id, observer), ecd } });
    // ED is secret (p.32: the GM doesn't tell the observer's player).
    await ChatMessage.create({ whisper: gmWhisper(), speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="sr2e-damage-result"><strong>ED (secret): ${esc(target.name)} vs ${esc(observer.name)}</strong> (Rigger 2 p.32)<br>
        ED ${ed.rating} dice vs ${sensor.rating} → ${e.successes}${ecd ? `; ECD ${counter.rating} vs ${ed.rating} → ${ecd.successes}` : ""}:
        Signature +${edEffect({ edSuccesses: e.successes, ecdSuccesses: ecd?.successes ?? 0 })} against these sensors.</div>` });
  });
}

/* ── GM ops ───────────────────────────────────────────────────────────────────────────────────────────────── */

const mayOperate = (user, vehicle) => user?.isGM || vehicle?.testUserPermission(user, "OWNER") || !!controllerOf(vehicle)?.testUserPermission(user, "OWNER");
function vehicleArg(uuid, user) {
  const v = fromUuidSync(uuid);
  if (v?.type !== "vehicle") throw new Error("not a vehicle");
  if (!isRigger2()) throw new Error("Rigger 2 rules are off");
  if (!mayOperate(user, v)) throw new Error("not allowed");
  return v;
}

/** The base TN for a Sensor Test against this target (p.28, p.61): a vehicle's Signature, 6 for a (meta)human. */
export function baseSignature(target, gmValue = null) {
  if (Number.isFinite(gmValue)) return gmValue;
  if (target?.type === "vehicle") return target.system.effectiveSignature ?? target.system.signature ?? 0;
  if (target?.type === "character") return 6;
  return null;   // critters and NPCs: the GM's value (4b.7)
}

/** Bump generations in the vehicle's queue (the caller holds it). */
async function bump(vehicle, paths) {
  const g = gens(vehicle), patch = {};
  for (const p of paths) patch[`flags.sr2e.ewGen.${p}`] = (foundry.utils.getProperty(g, p) ?? 0) + 1;
  if (Object.keys(patch).length) await vehicle.update(patch);
}

/** Re-check every recorded relationship from this vehicle and bump the links that broke (GM, in its queue). */
async function sweepVehicle(vehicle, positions = null) {
  const records = [];
  for (const lock of Object.values(vehicle.getFlag("sr2e", "locks") ?? {})) records.push({ deviceId: lock.deviceId, recipient: lock.targetUuid });
  const ev = vehicle.getFlag("sr2e", "jamEvent");
  for (const vs of Object.values(vehicle.getFlag("sr2e", "jamVs") ?? {})) if (ev) records.push({ deviceId: ev.deviceId, recipient: vs.observerUuid });
  for (const rec of Object.values(vehicle.getFlag("sr2e", "edVs") ?? {})) records.push({ deviceId: rec.deviceId, recipient: rec.observerUuid });
  const broken = new Set();
  for (const { deviceId, recipient } of records) {
    const other = recipient && fromUuidSync(recipient), t = transmitterOf(vehicle, deviceId);
    if (!other || !t) continue;
    const range = txFlux(vehicle, t)?.range;
    const now = distanceBetween(vehicle, other), before = positions ? distanceBetween(vehicle, other, positions) : now;
    if (range == null || now == null || now > range || (before != null && before > range)) broken.add(`link.${linkKey(deviceId, other)}`);
  }
  await bump(vehicle, [...broken]);
}

export function registerVehicleSensors() {
  game.settings.register("sr2e", "r2ElectronicDeception", {
    name: "Rigger 2: electronic deception (ED/ECD)",
    hint: "Optional rule (Rigger 2 p.32): ED raises a vehicle's Signature against each opposing sensor (ED rating dice vs its Sensor Rating); ECD cancels it. Requires the Rigger 2 vehicle ruleset.",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });

  // The Sensor Test (p.28, p.30, p.58): Sensor Rating dice vs the target's Signature + modifiers + the EW term. Rolled
  // and recorded by the GM in one queue step (no pools apply to sensors, R2 p.16); a success makes a lock.
  gmOp("sensorTest", async ({ vehicleUuid, targetUuid = null, gmValue = null, conditions = {}, spiritForce = 0, distance = null, label = "" }, user) => {
    const vehicle = vehicleArg(vehicleUuid, user);
    const sensor = sensorOf(vehicle);
    if (!sensor) throw new Error(`${vehicle.name} has no sensors`);
    const target = targetUuid ? fromUuidSync(targetUuid) : null;
    const base = baseSignature(target, Number.isFinite(gmValue) ? gmValue : null);
    if (base == null) throw new Error("enter the target's Signature (critters: the Critter Signature Ratings Table, R2 p.61)");
    const range = txFlux(vehicle, sensor)?.range;
    const dist = target ? distanceBetween(vehicle, target) : null;
    const usedDist = dist ?? (user.isGM && Number.isFinite(distance) ? distance : null);
    if (target && range != null && usedDist != null && usedDist > range) throw new Error(`${target.name} is beyond the sensors' range (${usedDist} m > ${range} m)`);
    if (target?.type === "vehicle") await ensureEw(vehicle, target);
    const ew = target ? ewTermOf(vehicle, target) : { total: 0, ecm: 0, ed: 0 };
    const { tn, parts } = sensorTestTN({ base, ewTerm: ew.total, conditions, spiritForce: Number(spiritForce) || 0, damageMod: vehicle.system.damageTnMod ?? 0 });
    return vq(vehicleUuid, async () => {
      const r = await roll(sensor.rating, tn);
      const result = sensorResult(r.successes);
      const patch = {};
      if (target && r.successes > 0) {
        const h = hideState(vehicle, target);
        patch[`flags.sr2e.locks.${keyOf(target)}`] = { id: foundry.utils.randomID(16), targetUuid: target.uuid, deviceId: sensor.id,
          successes: r.successes, tn, deps: { device: devGen(vehicle, sensor.id), link: linkGen(vehicle, sensor.id, target), hide: h.gen },
          at: Date.now() };
      }
      if (Object.keys(patch).length) await vehicle.update(patch);
      const LABEL = { Signature: "Signature", directLos: "direct LOS", urban: "urban", weather: "weather", restricted: "restricted terrain",
        tight: "tight terrain", spirit: "concealing spirit", damage: "vehicle damage", ew: "ECM" };
      // ED is secret (p.32: "the gamemaster keeps that a secret"): with ED in play the public card hides the TN.
      const secret = ew.ed > 0;
      const shown = parts.map(p => p.label === "ew" ? { ...p, value: ew.ecm } : p).filter(p => p.label !== "ew" || p.value);
      const parts2 = shown.map(p => `${LABEL[p.label] ?? p.label} ${p.value >= 0 && p.label !== "Signature" ? "+" : ""}${p.value}`).join(", ");
      if (secret) await ChatMessage.create({ whisper: gmWhisper(), speaker: ChatMessage.getSpeaker({ actor: vehicle }),
        content: `<div class="sr2e-damage-result"><strong>Secret TN:</strong> ${esc(vehicle.name)}'s Sensor Test: TN ${tn} (ED +${ew.ed}, ECM +${ew.ecm}).</div>` });
      const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
        content: `<div class="sr2e-damage-result"><strong>Sensor Test: ${esc(vehicle.name)}${target ? ` → ${esc(target.name)}` : ""}</strong>${label ? ` (${esc(label)})` : ""}
          (Rigger 2 p.28–30; a Complex Action, p.58)<br>${sensor.rating} dice vs ${secret ? "the GM's TN" : `TN ${tn} (${esc(parts2)})`}: <strong>${r.successes} success${r.successes === 1 ? "" : "es"}</strong>
          — ${game.i18n.localize(`SR2E.Sensors.Result.${result}`)}${target && r.successes > 0 ? `<br>🔒 Locked on ${esc(target.name)} until contact is lost.` : ""}
          <br><small>Dice: ${r.results.join(", ")}</small></div>`, flags: { sr2e: { sensorTest: { vehicleUuid, targetUuid, successes: r.successes, tn } } } });
      return { successes: r.successes, tn, messageId: msg.id };
    });
  });

  // ECM / ECCM / ED / ECD on or off: Simple Actions (p.32). Switching off bumps the device generation, ending every
  // result that depends on it (R4-2).
  gmOp("ewToggle", async ({ vehicleUuid, deviceId, on }, user) => {
    const vehicle = vehicleArg(vehicleUuid, user);
    const t = transmitterOf(vehicle, deviceId);
    if (!t || !["ecm", "eccm", "ed", "ecd"].includes(t.kind)) throw new Error("not a toggled device");
    if (["ed", "ecd"].includes(t.kind) && !edRuleOn()) throw new Error("the ED/ECD optional rule is off");
    return vq(vehicleUuid, async () => {
      await vehicle.update({ [`flags.sr2e.ewOn.${deviceId}`]: !!on });
      if (!on) await bump(vehicle, [`device.${deviceId}`]);
      await card(vehicle, `<strong>${esc(vehicle.name)}: ${esc(t.item?.name ?? t.kind.toUpperCase())} ${on ? "on" : "off"}</strong> (a Simple Action, Rigger 2 p.32)`);
      return true;
    });
  });

  // Flux boosts (p.30): the WHOLE allocation validated against the live vehicle in one step (GM only).
  gmOp("fluxBoost", async ({ vehicleUuid, alloc }, user) => {
    const vehicle = vehicleArg(vehicleUuid, user);
    if (!user.isGM) throw new Error("the GM sets boosts");
    return vq(vehicleUuid, async () => {
      const problems = boostProblems(alloc, boostContext(vehicle));
      if (problems.length) throw new Error(problems.join("; "));
      await vehicle.update({ "flags.sr2e.-=fluxBoosts": null });
      await vehicle.update({ "flags.sr2e.fluxBoosts": alloc });
      await sweepVehicle(vehicle);
      return true;
    });
  });

  // A transmitter's situational conditions (p.31) and the GM's half-point/negative-Flux range choice (plan 4a.3).
  gmOp("txConditions", async ({ vehicleUuid, deviceId, conditions }, user) => {
    const vehicle = vehicleArg(vehicleUuid, user);
    if (!transmitterOf(vehicle, deviceId)) throw new Error("no such working transmitter");
    const allowed = ["highElevation", "electricalStorm", "encryption", "humidAir", "urban"];
    const clean = Object.fromEntries(allowed.map(k => [k, !!conditions?.[k]]));
    if (user.isGM) for (const k of ["halfRange", "gmRange", "runAt"]) if (Number.isFinite(conditions?.[k])) clean[k] = conditions[k];
    return vq(vehicleUuid, async () => {
      await vehicle.update({ [`flags.sr2e.txConditions.${deviceId}`]: clean });
      await sweepVehicle(vehicle);
      return true;
    });
  });

  // The GM clears a lock or an EW result (R4-2): a generation bump, never a deletion readers could race.
  gmOp("ewClear", async ({ vehicleUuid, deviceId, recipientUuid }, user) => {
    if (!user.isGM) throw new Error("GM only");
    const vehicle = fromUuidSync(vehicleUuid), other = fromUuidSync(recipientUuid);
    if (vehicle?.type !== "vehicle" || !other) throw new Error("not found");
    return vq(vehicleUuid, () => bump(vehicle, [`link.${linkKey(deviceId, other)}`]));
  });

  // Range sweeps (plan 4.0): on the active GM, every move is checked against the position BEFORE and AFTER it, so a
  // move out of range and back still ends the result.
  const last = new Map();
  const remember = (tok) => last.set(tok.uuid, { x: tok.x, y: tok.y, elevation: tok.elevation });
  Hooks.on("updateToken", (tok, changes) => {
    if (!isActiveGM() || !isRigger2() || !("x" in changes || "y" in changes || "elevation" in changes)) return;
    const before = last.get(tok.uuid);
    remember(tok);
    if (!before) return;
    const moved = tok.actor;
    // Every vehicle whose records involve the moved actor (as transmitter or recipient) sweeps with the before-position.
    const involved = game.actors.filter(a => a.type === "vehicle" && (a === moved || JSON.stringify(a.flags?.sr2e?.locks ?? {}).includes(moved?.uuid ?? "~")
      || JSON.stringify(a.flags?.sr2e?.jamVs ?? {}).includes(moved?.uuid ?? "~") || JSON.stringify(a.flags?.sr2e?.edVs ?? {}).includes(moved?.uuid ?? "~")));
    for (const v of involved) vq(v.uuid, () => sweepVehicle(v, { [tok.uuid]: before })).catch(err => console.error("SR2E | ew sweep", err));
  });
  Hooks.on("canvasReady", () => { for (const t of canvas.scene?.tokens ?? []) remember(t); });
  // A device removed or no longer working ends its results; chase distances and round changes re-sweep.
  Hooks.on("updateItem", (item) => deviceChanged(item));
  Hooks.on("deleteItem", (item) => deviceChanged(item, true));
  Hooks.on("updateCombat", (combat, changes) => {
    if (!isActiveGM() || !isRigger2() || !foundry.utils.hasProperty(changes, "flags.sr2e.chase")) return;
    for (const e of Object.values(combat.getFlag("sr2e", "chase")?.entries ?? {})) {
      const v = fromUuidSync(e.uuid);
      if (v?.type === "vehicle") vq(v.uuid, () => sweepVehicle(v)).catch(() => {});
    }
  });
}

function deviceChanged(item, deleted = false) {
  if (!isActiveGM() || !isRigger2()) return;
  const v = item.parent;
  if (v?.type !== "vehicle" || !(KIND_BY_MODKEY[item.system?.modKey] || ["rc-deck", "radio"].includes(item.flags?.sr2e?.rule))) return;
  if (!deleted && WORKING.includes(item.system.custom?.state ?? "")) return;
  vq(v.uuid, () => bump(v, [`device.${item.id}`])).catch(err => console.error("SR2E | ew device", err));
}

/* ── Client entry points ──────────────────────────────────────────────────────────────────────────────────── */

/** Ask for a Sensor Test (the vehicle sheet / panel). The current target token is the default target. */
export async function promptSensorTest(vehicle) {
  if (!isRigger2()) return ui.notifications.warn("SR2E | Sensor Tests use the Rigger 2 vehicle rules.");
  if (!sensorOf(vehicle)) return ui.notifications.warn(`SR2E | ${vehicle.name} has no sensors.`);
  const target = [...(game.user.targets ?? [])][0]?.actor ?? null;
  const cb = (k, label) => `<label style="display:block"><input type="checkbox" name="${k}"> ${label}</label>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Sensor Test: ${vehicle.name}` },
    content: `<p>Target: <strong>${target ? esc(target.name) : "none targeted"}</strong>${target ? "" : " — target a token first, or enter a Signature."}</p>
      ${target?.type === "vehicle" || target?.type === "character" ? "" : `<label>Signature (GM / critter table, R2 p.61): <input type="number" name="gmValue" style="width:60px"></label>`}
      ${cb("directLos", "Direct line of sight (−2)")}${cb("urban", "Urban setting (+1)")}${cb("weather", "Fog / smog / precipitation (+1)")}
      ${cb("restricted", "Restricted terrain (+1)")}${cb("tight", "Tight terrain (+2)")}
      <label>Concealed by a spirit, Force: <input type="number" name="spiritForce" value="0" min="0" style="width:50px"></label>
      ${game.user.isGM ? `<label style="display:block">Distance if no tokens/chase (m): <input type="number" name="distance" style="width:80px"></label>` : ""}
      <p><small>A Complex Action (R2 p.58). Vehicle damage and any ECM/ED in play are added automatically.</small></p>`,
    ok: { label: "Roll", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }
  }).catch(() => null);
  if (!res) return;
  const n = (v) => (v === "" || v == null ? null : Number(v));
  const conditions = Object.fromEntries(["directLos", "urban", "weather", "restricted", "tight"].map(k => [k, !!res[k]]));
  return gmCall("sensorTest", { vehicleUuid: vehicle.uuid, targetUuid: target?.uuid ?? null, gmValue: n(res.gmValue), conditions,
    spiritForce: n(res.spiritForce) ?? 0, distance: n(res.distance) }).catch(err => ui.notifications.warn(`SR2E | ${err.message ?? err}`));
}

/** Toggle an EW device (the panel). */
export const toggleEw = (vehicle, deviceId, on) => gmCall("ewToggle", { vehicleUuid: vehicle.uuid, deviceId, on })
  .catch(err => ui.notifications.warn(`SR2E | ${err.message ?? err}`));
