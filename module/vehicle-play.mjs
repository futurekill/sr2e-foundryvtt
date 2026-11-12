/**
 * Vehicles in play, core rulebook (docs/PLAN-vehicles-phase2.md Part 1): who controls a vehicle, the ONE vehicle
 * damage commit (the active GM's per-vehicle queue) with its crash triggers, and Control Pool spends.
 */
import { enqueueAttack } from "./engagement.mjs";
import { defenseQueue } from "./spell-defense.mjs";
import { once } from "./claims.mjs";
import { claimId } from "./rules/claim-rules.mjs";
import { crashTrigger, woundLevelOf, impactDamage, reservedControl, levelBelow } from "./rules/vehicle-play-rules.mjs";
import { resolveBarrier } from "./rules/sr2e-rules.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { isCardResolved } from "./astral-combat.mjs";
import { RL } from "./util/roll-label.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isActiveGM = () => !!game.users.activeGM?.isSelf;

/* ── GM calls over the system socket (request → the active GM → reply) ─────────────────────────────────────── */

const pending = new Map();
const GM_OPS = {};

/** Run `op` on the active GM's client (here when this IS the active GM) and return its result. */
export function gmCall(op, args) {
  if (isActiveGM()) return GM_OPS[op](args, game.user);
  if (!game.users.activeGM) {
    ui.notifications.error("A GM must be connected for this (vehicle damage and control are written by the GM).");
    return Promise.reject(new Error("no active GM"));
  }
  const reqId = foundry.utils.randomID(16);
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    setTimeout(() => { if (pending.delete(reqId)) reject(new Error(`GM didn't answer ${op}`)); }, 30000);
    game.socket.emit("system.sr2e", { type: "vehiclePlay", op, args, reqId, userId: game.user.id });
  });
}

/** sr2e.mjs routes the system socket's vehiclePlay messages here. */
export function onVehicleSocket(data) {
  if (data.type === "vehiclePlay" && isActiveGM() && GM_OPS[data.op]) {
    // shortcut: the system socket doesn't say who sent a message, so `userId` is trusted (as for teamKarmaDelta).
    const user = game.users.get(data.userId);
    const reply = (payload) => game.socket.emit("system.sr2e", { type: "vehiclePlayReply", reqId: data.reqId, to: data.userId, ...payload });
    Promise.resolve().then(() => GM_OPS[data.op](data.args, user))
      .then(result => reply({ result }), err => { console.error("SR2E | vehicle", data.op, err); reply({ error: String(err?.message ?? err) }); });
  } else if (data.type === "vehiclePlayReply" && data.to === game.user.id) {
    const p = pending.get(data.reqId);
    if (!p) return;
    pending.delete(data.reqId);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
  }
}

/* ── Control (plan: "Foundation: who controls a vehicle") ───────────────────────────────────────────────────── */

/** The character controlling this vehicle (driving or rigging it), if any. */
export function controllerOf(vehicle) {
  const uuid = vehicle?.uuid;
  if (!uuid) return null;
  return game.actors.find(a => a.type === "character" && (a.system.controlledVehicles ?? []).includes(uuid)) ?? null;
}

/** The worst damage Initiative modifier among the vehicles this character controls (p.106, p.109). */
export function worstControlledInitMod(character) {
  let mod = 0;
  for (const uuid of character?.system?.controlledVehicles ?? []) {
    const m = globalThis.fromUuidSync?.(uuid)?.system?.damageInitMod ?? 0;
    if (m < mod) mod = m;
  }
  return mod;
}

/**
 * The one client that spends this actor's pools: its active player owner, else the active GM (code review #5), so
 * a GM and a player never debit the same pool at once.
 */
export function isPoolClient(actor) {
  if (!actor) return false;
  const player = game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  return player ? player.isSelf : !!game.users.activeGM?.isSelf;
}

/** Is this character jacked into this vehicle through a VCR (rigging AND controlling it)? */
export function riggedInto(character, vehicle) {
  return !!(character?.system?.rigging && (character.system.vehicleControlRig ?? 0) > 0
    && (character.system.controlledVehicles ?? []).includes(vehicle?.uuid));
}

/** Take or give up control of a linked vehicle (the GM writes it, clearing every other controller). */
export function setControl(character, vehicleUuid, on) {
  return gmCall("control", { characterUuid: character.uuid, vehicleUuid, on: !!on });
}

GM_OPS.control = ({ characterUuid, vehicleUuid, on }, user) => enqueueAttack("vehicle-control", async () => {
  const character = fromUuidSync(characterUuid);
  if (character?.type !== "character") throw new Error("not a character");
  if (!user?.isGM && !character.testUserPermission(user, "OWNER")) throw new Error(`${user?.name} doesn't own ${character.name}`);
  if (on && !(character.system.linkedVehicles ?? []).includes(vehicleUuid)) throw new Error("link the vehicle first");
  for (const a of game.actors.filter(a => a.type === "character" && a !== character && (a.system.controlledVehicles ?? []).includes(vehicleUuid)))
    await a.update({ "system.controlledVehicles": a.system.controlledVehicles.filter(u => u !== vehicleUuid) });
  const mine = (character.system.controlledVehicles ?? []).filter(u => u !== vehicleUuid);
  await character.update({ "system.controlledVehicles": on ? [...mine, vehicleUuid] : mine });
  return true;
});

/* ── The one vehicle damage commit (plan: "Foundation: one vehicle damage commit") ──────────────────────────── */

/** May this user commit damage to this vehicle: the GM, an owner, or the owner of its current controller. */
function mayCommit(user, vehicle) {
  return !!(user?.isGM || vehicle.testUserPermission(user, "OWNER") || controllerOf(vehicle)?.testUserPermission(user, "OWNER"));
}

/**
 * The Combat Phase key a Serious-wound Crash Test is deduplicated by (one per vehicle per phase, p.107): the
 * system's phase sequence of the combat the vehicle or its driver is in (else the current one), null out of combat.
 */
function phaseKeyFor(vehicle) {
  const inIt = (c, a) => a && c.combatants.some(cb => cb.actor?.uuid === a.uuid);
  const started = [game.combat, ...(game.combats?.contents ?? [])].filter(c => c?.started);
  const driver = controllerOf(vehicle);
  const c = started.find(c => inIt(c, vehicle) || inIt(c, driver)) ?? (game.combat?.started ? game.combat : null);
  return c ? `${c.id}:${Number(c.getFlag("sr2e", "phaseSeq")) || 0}:${c.round}` : null;
}

/**
 * Damage a vehicle. Every automated vehicle damage path calls this; the active GM serializes it per vehicle.
 * @param {Actor} vehicle
 * @param {number} boxes
 * @param {object} o
 * @param {"weapon"|"spell"|"crash"|"collision"} o.source
 * @param {string} [o.eventId]     - idempotency key; the receipt lands at flags.sr2e.vdmg.<eventId>
 * @param {{path:string, value:*}} [o.receipt] - a caller's own receipt path instead (under flags.sr2e.)
 * @param {string} [o.woundLevel]  - the staged level of this application (else from the boxes)
 * @returns {Promise<{landedBoxes:number, skipped?:boolean, trigger?:string|null}>}
 */
export function commitVehicleDamage(vehicle, boxes, { source = "weapon", eventId = null, receipt = null, woundLevel = null } = {}) {
  return gmCall("damage", { vehicleUuid: vehicle.uuid, boxes, source, eventId: eventId ?? foundry.utils.randomID(16), receipt, woundLevel });
}

GM_OPS.damage = async ({ vehicleUuid, boxes, source, eventId, receipt, woundLevel }, user) => {
  const vehicle = fromUuidSync(vehicleUuid);
  if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
  const path = receipt?.path ?? `flags.sr2e.vdmg.${eventId}`;
  if (!path.startsWith("flags.sr2e.")) throw new Error("bad receipt path");
  const r = await enqueueAttack(`vdmg:${vehicleUuid}`, async () => {
    // Validated at commit time (control may have changed while this waited; code review #8).
    if (!mayCommit(user, vehicle)) throw new Error(`${user?.name} may not damage ${vehicle.name}`);
    if (foundry.utils.getProperty(vehicle, path) != null) return { landedBoxes: 0, skipped: true };
    const phase = phaseKeyFor(vehicle);
    const cm = vehicle.system.conditionMonitor;
    const before = cm.value ?? 0, max = cm.max ?? 10;
    const preSpeed = vehicle.system.effectiveSpeed ?? vehicle.system.speed ?? 0;   // 0 once destroyed: snapshot first
    const value = Math.min(before + Math.max(0, boxes), max);
    await vehicle.update({ [path]: receipt?.value ?? boxes, "system.conditionMonitor.value": value });
    const trigger = crashTrigger({ source, woundLevel: woundLevel ?? woundLevelOf(boxes), destroyedNow: before < max && value >= max,
      inCombat: !!phase });
    return { landedBoxes: value - before, trigger, preSpeed, phase };
  });
  // Triggers run after the queued step (the crash commits through this same queue), on what the step captured.
  if (r.trigger === "autoCrash") await resolveCrash(vehicle, { speed: r.preSpeed, auto: true });
  else if (r.trigger === "crashTest" && await once(vehicle, `crashTestDue:${r.phase}`)) await postCrashTestDue(vehicle);
  return { landedBoxes: r.landedBoxes, skipped: !!r.skipped, trigger: r.trigger ?? null };
};

/**
 * A once-only step on a vehicle, claimed on the GM's client (players may not own the vehicle; code review #7). The
 * claim is refused unless `driverUuid` (or "" for none) still controls it and the user may act for that driver, so a
 * dialog left open across a change of control can't take the step (code review R2).
 */
export function claimOnVehicle(vehicle, key, driverUuid = "") {
  return gmCall("claim", { vehicleUuid: vehicle.uuid, key, driverUuid });
}
GM_OPS.claim = async ({ vehicleUuid, key, driverUuid = "" }, user) => {
  const vehicle = fromUuidSync(vehicleUuid);
  if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
  const now = controllerOf(vehicle);
  if ((now?.uuid ?? "") !== driverUuid) return false;
  if (!user?.isGM && !now?.testUserPermission(user, "OWNER")) return false;
  return once(vehicle, key);
};

/* ── Crashes (p.107) ─────────────────────────────────────────────────────────────────────────────────────────── */

/** "Crash Test required": the controller's owner (or the GM) clicks to make it. */
export async function postCrashTestDue(vehicle, why = "took Serious damage") {
  const who = controllerOf(vehicle);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)} ${esc(why)}: Crash Test required</strong>
      (SR2E p.107)${who ? ` — ${esc(who.name)} drives.` : "."}
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-crash-test-btn" data-vehicle-uuid="${vehicle.uuid}">
        <i class="fas fa-car-burst"></i> Crash Test</button></div></div>`,
    flags: { sr2e: { crashTestDue: { vehicleUuid: vehicle.uuid } } } });
}

/**
 * A crash (p.107): Power and level from the speed (default: effective cruising speed), resisted with Body + ½ armour
 * vs Power − armour, no Control Pool. Passengers then resist the staged-down level at the same Power.
 */
export async function resolveCrash(vehicle, { speed = null, auto = false } = {}) {
  const v = speed ?? vehicle.system.effectiveSpeed ?? vehicle.system.speed ?? 0;
  const { power, level } = impactDamage(v);
  const armor = vehicle.system.effectiveArmor ?? 0, body = vehicle.system.body ?? 1;
  const resist = await vehicle.rollSuccessTest(body + Math.floor(armor / 2), Math.max(2, power - armor), {
    label: RL("Crash", { name: vehicle.name, power, level }), isResistance: true });
  const stages = ["L", "M", "S", "D"];
  const idx = stages.indexOf(level) - Math.floor((resist?.successes ?? 0) / 2);
  const why = auto ? "Destroyed by weapons: automatic crash" : "Crash";
  if (idx < 0) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
      content: `<div class="sr2e-damage-result"><strong>${why}: damage fully resisted.</strong>
        <em>Passengers are unhurt; the vehicle stops for the rest of the Combat Turn (SR2E p.107).</em></div>` });
  }
  const final = stages[idx], boxes = [1, 3, 6, 10][idx];
  await commitVehicleDamage(vehicle, boxes, { source: "crash", woundLevel: final });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    content: `<div class="sr2e-damage-result"><strong>${why}: ${final} damage (${boxes} box${boxes === 1 ? "" : "es"})</strong>
      at ${v} m/CT. <em>The vehicle stops for the rest of the Combat Turn.</em>
      <br>Passengers face <strong>${power}${final}</strong>, resisted as melee damage: Impact armour only, no Combat Pool (SR2E p.107).
      ${passengerButton({ power, level: final, key: foundry.utils.randomID(12), mode: "impact" })}</div>`,
    flags: { sr2e: { crashPassengers: { power, level: final } } } });
}

/** A per-actor "Resist" button for occupants (each actor resolves once). */
export function passengerButton({ power, level, key, mode = "impact", poolOk = false }) {
  if (!level) return "";
  return `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-passenger-resist-btn"
    data-power="${power}" data-level="${level}" data-key="${key}" data-mode="${mode}" data-pool="${poolOk ? 1 : 0}"
    title="Select your token (or use your character), then resist">🛡 Resist (occupant)</button></div>`;
}

/* ── Control Pool spends (plan Part 1 #6, #7) ─────────────────────────────────────────────────────────────────── */

/** Debit up to `n` dice of a pool on this client, in the actor's one pool queue; returns what was debited. */
export function spendPool(actor, key, n) {
  return defenseQueue(actor.uuid, async () => {
    const pool = actor.system.dicePools?.[key];
    const d = Math.max(0, Math.min(Math.floor(Number(n) || 0), pool?.value ?? 0));
    if (d) await actor.update({ [`system.dicePools.${key}.value`]: pool.value - d, [`system.dicePools.${key}.max`]: pool.max });
    return d;
  });
}

/**
 * A Position Test's Control Pool dice (p.105): debited AND recorded as held for this round in one queued update, so a
 * refresh can never land between the two (code review #6). Returns the dice paid.
 */
export function spendPosition(rigger, n, testId = foundry.utils.randomID(12)) {
  const c = game.combat;
  return defenseQueue(rigger.uuid, async () => {
    const pool = rigger.system.dicePools?.control;
    const d = Math.max(0, Math.min(Math.floor(Number(n) || 0), pool?.value ?? 0));
    if (!d) return 0;
    const upd = { "system.dicePools.control.value": pool.value - d, "system.dicePools.control.max": pool.max };
    if (c?.started) {
      const cur = rigger.getFlag("sr2e", "positionReserve");
      if (cur?.combatId === c.id && cur?.round === c.round) upd[`flags.sr2e.positionReserve.byTest.${testId}`] = d;
      else {
        // A new round replaces the record: unset first, since a flag update merges and would keep old tests.
        if (cur) await rigger.update({ "flags.sr2e.-=positionReserve": null });
        upd["flags.sr2e.positionReserve"] = { combatId: c.id, round: c.round, byTest: { [testId]: d } };
      }
    }
    await rigger.update(upd);
    return d;
  });
}

/** Control Pool dice still held by this round's Position Tests. */
export function positionReserved(rigger) {
  const c = game.combat;
  return c?.started ? reservedControl(rigger?.getFlag("sr2e", "positionReserve"), c.id, c.round) : 0;
}

/* ── Ramming (p.107): the opposed card ────────────────────────────────────────────────────────────────────────── */

export function renderVehicleRamCard(st) {
  const terr = game.i18n.localize(CONFIG.SR2E.vehicleTerrains[st.terrain] ?? st.terrain);
  return `<div class="sr2e-damage-result"><strong>${esc(st.rammerVehicleName)} rams ${esc(st.oppName)}</strong>
    — ${st.successes} success${st.successes === 1 ? "" : "es"} (${esc(terr)} terrain).
    <br><em>The other driver rolls Vehicle Skill + Body + ½ armour − Handling against ${esc(st.rammerVehicleName)}'s
    Body + ½ armour − terrain; Control Pool applies. Fewer successes must make a Crash Test; a tie, no crash (SR2E p.107).</em>
    ${st.resolution ?? ""}
    ${st.resolved ? "" : `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-vram-resist-btn"
      title="The other vehicle's driver (or the GM) rolls">🚗 Resist ram</button></div>`}</div>`;
}

export async function resistVehicleRam(message) {
  const st = message.getFlag("sr2e", "vehicleRam");
  if (!st || isCardResolved(message, "vehicleRam")) return ui.notifications.warn("That ram has already been resolved.");
  const oppVehicle = st.oppVehicleUuid ? fromUuidSync(st.oppVehicleUuid) : null;
  const driver = oppVehicle ? controllerOf(oppVehicle) : null;
  if (driver && !driver.isOwner) return ui.notifications.warn(`${driver.name} drives ${oppVehicle.name}: their player (or the GM) rolls.`);
  if (!driver && !game.user.isGM) return ui.notifications.warn(`Nobody controls ${st.oppName}: the GM rolls for it.`);

  // The defending driver's dice: their own skill and pool, or the GM's figure for an NPC driver.
  const sk = driver ? driver._vehicleSkill(oppVehicle) : null;
  const body = oppVehicle?.system.body ?? st.oppBody, armor = oppVehicle?.system.effectiveArmor ?? st.oppArmor;
  const handling = oppVehicle?.system.effectiveHandling ?? st.oppHandling;
  const terrainMod = CONFIG.SR2E.vehicleTerrainMods.ram[st.terrain] ?? 0;
  const cap = isPoolClient(driver) ? Math.min(driver?.system.dicePools?.control?.value ?? 0, sk?.cap ?? 0) : 0;
  const form = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Resist ram: ${st.oppName}` }, rejectClose: false,
    content: `<div>${sk ? `<p style="margin:0 0 4px;">${esc(driver.name)}: ${sk.dice} dice${esc(sk.note)}.</p>`
      : `<div class="form-group"><label>NPC driver's Vehicle Skill:</label><input type="number" name="skill" value="3" min="0" style="width:52px;"></div>`}
      ${cap > 0 ? `<div class="form-group"><label>Control Pool (max ${cap}):</label><input type="number" name="pool" value="0" min="0" max="${cap}" style="width:52px;"></div>` : ""}</div>`,
    ok: { label: "Roll", callback: (ev, button) => ({ skill: parseInt(button.form.elements.skill?.value) || 0, pool: parseInt(button.form.elements.pool?.value) || 0 }) }
  });
  if (!form) return;
  const claimant = driver ?? oppVehicle ?? fromUuidSync(st.rammerUuid);
  if (!await once(claimant, `vram:${message.id}`)) return ui.notifications.warn("That ram is already being resolved.");

  const skillDice = sk ? sk.dice : form.skill, penalty = sk ? sk.penalty : 0;
  const dice = Math.max(1, skillDice + body + Math.floor(armor / 2) - handling);
  const tn = Math.max(2, st.rammerBody + Math.floor(st.rammerArmor / 2) - terrainMod + (oppVehicle?.system.damageTnMod ?? 0) + penalty);
  const paid = driver && form.pool > 0 ? await spendPool(driver, "control", Math.min(form.pool, cap)) : 0;
  const label = `${st.oppName} resists the ram (TN ${tn})`;
  const res = driver ? await driver.rollSuccessTest(dice, tn, { label, paidPoolDice: paid ? { control: paid } : undefined, closed: true })
    : oppVehicle ? await oppVehicle.rollSuccessTest(dice, tn, { label, closed: true })
    : await SR2ESuccessRoll.successTest(dice, tn);
  const theirs = res?.successes ?? 0;
  const { liveCastSuccesses } = await import("./combat-spells.mjs");
  const mine = liveCastSuccesses(st.testMessageId, st.successes);

  let verdict, loser = null;
  if (mine === theirs) verdict = "Tie: no crash (SR2E p.107).";
  else if (mine < theirs) { verdict = `${st.rammerVehicleName} loses and must make a Crash Test.`; loser = fromUuidSync(st.rammerVehicleUuid); }
  else { verdict = `${st.oppName} loses and must make a Crash Test.`; loser = oppVehicle; }
  const resolution = `<br><strong>${esc(st.rammerVehicleName)} ${mine} vs ${esc(st.oppName)} ${theirs}: ${esc(verdict)}</strong>
    ${mine !== theirs && !loser ? "<br><em>The losing vehicle isn't an actor: run its Crash Test by hand.</em>" : ""}`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: claimant }), content: `<div class="sr2e-damage-result">${resolution}</div>`,
    flags: { sr2e: { resolves: message.id, closesTests: [st.testMessageId].filter(Boolean) } } });
  if (message.isOwner) await message.update({ content: renderVehicleRamCard({ ...st, resolved: true, resolution }), "flags.sr2e.vehicleRam.resolved": true });
  if (loser) await postCrashTestDue(loser, "lost the ram");
}

/* ── Crash Test button, occupants ─────────────────────────────────────────────────────────────────────────────── */

export async function crashTestFromCard(message) {
  const vehicle = fromUuidSync(message.getFlag("sr2e", "crashTestDue")?.vehicleUuid ?? "");
  if (!vehicle) return;
  if (game.messages.some(m => m.flags?.sr2e?.resolves === message.id)) return ui.notifications.warn("That Crash Test has been made.");
  const driver = controllerOf(vehicle);
  if (driver && !driver.isOwner) return ui.notifications.warn(`${driver.name} drives ${vehicle.name}: their player (or the GM) makes the test.`);
  if (!driver && !game.user.isGM) return ui.notifications.warn(`Nobody controls ${vehicle.name}: the GM makes its Crash Test.`);

  let opts, npc = null;
  if (driver) {
    const { promptVehicleTestOptions } = await import("./sheets/sheet-actions.mjs");
    opts = await promptVehicleTestOptions(driver, vehicle, { testType: "crash" });
  } else {
    // No controlling character: the GM enters the NPC driver's skill (no Control Pool).
    npc = await foundry.applications.api.DialogV2.prompt({ window: { title: `Crash Test: ${vehicle.name}` }, rejectClose: false,
      content: `<div><div class="form-group"><label>NPC driver's Vehicle Skill:</label><input type="number" name="skill" value="3" min="0" style="width:52px;"></div>
        <div class="form-group"><label>Terrain:</label><select name="terrain">${Object.entries(CONFIG.SR2E.vehicleTerrains)
          .map(([k, l]) => `<option value="${k}" ${k === "normal" ? "selected" : ""}>${game.i18n.localize(l)}</option>`).join("")}</select></div></div>`,
      ok: { label: "Roll", callback: (ev, b) => ({ skill: parseInt(b.form.elements.skill.value) || 0, terrain: b.form.elements.terrain.value }) } });
    opts = npc;
  }
  if (!opts) return;
  // Exactly once whoever drives by then: claimed on the vehicle (by the GM), and a PUBLIC receipt.
  if (!await claimOnVehicle(vehicle, `crashTest:${message.id}`, driver?.uuid ?? ""))
    return ui.notifications.warn("That Crash Test is already being made, or the driver changed: click again.");
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: driver ?? vehicle }),
    content: `<div class="sr2e-damage-result"><em>${esc(driver?.name ?? "The NPC driver")} makes ${esc(vehicle.name)}'s Crash Test.</em></div>`,
    flags: { sr2e: { resolves: message.id } } });
  if (driver) return driver.rollVehicleTest(vehicle, opts);
  const tn = Math.max(2, (vehicle.system.effectiveHandling ?? 0) + (CONFIG.SR2E.vehicleTerrainMods.crash[npc.terrain] ?? 0) + (vehicle.system.damageTnMod ?? 0));
  const res = await vehicle.rollSuccessTest(Math.max(1, npc.skill), tn, { label: `${vehicle.name}: Crash Test (TN ${tn})` });
  if ((res?.successes ?? 0) === 0) await resolveCrash(vehicle);
  return res;
}

/** May the clicking user resist for this actor (an owner; for a vehicle, also its controller's owner). */
export function mayResistFor(actor) {
  return !!(actor?.isOwner || (actor?.type === "vehicle" && controllerOf(actor)?.isOwner));
}

export async function occupantResist(btn, who = null) {
  const actor = who ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character;
  if (!actor || actor.type === "vehicle") return ui.notifications.warn("Select your character's token (or assign a character) to resist.");
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can resist for them.`);
  const { power, level, key, mode } = btn.dataset;
  const mana = mode === "mana";
  const claimKey = `occupant:${key}`;
  if (actor.effects.has(claimId(claimKey))) return ui.notifications.warn(`${actor.name} has already resisted this.`);
  return actor.rollDamageResistance(Number(power), level, "impact", "physical", {
    noCombatPool: !(btn.dataset.pool === "1"), armorCalc: mana ? "none" : "impact",
    beforeRoll: async () => (await once(actor, claimKey)) || (ui.notifications.warn(`${actor.name} has already resisted this.`), false)
  });
}

/* ── Hitting walls and barriers (p.109) ───────────────────────────────────────────────────────────────────────── */

/**
 * A vehicle hits an object: Power = speed ÷ 10, level by the Impact Table. A wall/physical barrier: the vehicle resists
 * like a crash, the barrier takes the hit (as a blast, p.97); reduced to 0 → the driver's Crash Test, otherwise the
 * occupants take the same Power one level less. A mana barrier ignores the vehicle; an exposed rider hits it as a wall
 * (no armour; Combat Pool only if aware).
 */
export async function hitObjectFlow(driver, vehicle) {
  const speed0 = vehicle.system.effectiveSpeed ?? 0;
  const f = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${vehicle.name} hits an object` }, rejectClose: false,
    content: `<div>
      <div class="form-group"><label>Speed (m/CT):</label><input type="number" name="speed" value="${speed0}" min="0" style="width:64px;"
        title="Cruising speed in combat; the vehicle's actual speed otherwise (top speed is in its notes)"></div>
      <div class="form-group"><label>Object:</label><select name="kind"><option value="wall">Wall / physical barrier</option>
        <option value="mana">Mana barrier spell</option></select></div>
      <div class="form-group"><label>Barrier Rating / Force:</label><input type="number" name="rating" value="6" min="0" style="width:52px;"></div>
      <label style="font-size:12px;"><input type="checkbox" name="exposed"> Rider exposed (bike, open vehicle)</label>
      <label style="font-size:12px;"><input type="checkbox" name="aware"> Rider saw it coming (may add Combat Pool)</label>
      <p style="font-size:10px;color:#aaa1c0;margin:4px 0 0;">Power = speed ÷ 10; Damage Level by speed (Impact Table, SR2E p.107, p.109).</p></div>`,
    ok: { label: "Resolve", callback: (ev, b) => { const e = b.form.elements;
      return { speed: parseInt(e.speed.value) || 0, kind: e.kind.value, rating: parseInt(e.rating.value) || 0, exposed: e.exposed.checked, aware: e.aware.checked }; } }
  });
  if (!f) return;
  const { power, level } = impactDamage(f.speed);
  const key = foundry.utils.randomID(12);
  const barrier = resolveBarrier({ baseRating: f.rating, barrierMode: "break", comparisonPower: power, attackKind: "blast" });
  const broken = barrier.newBaseRating <= 0;
  const head = `${esc(vehicle.name)} hits ${f.kind === "mana" ? "a mana barrier" : "a barrier"} (rating ${f.rating}) at ${f.speed} m/CT: <strong>${power}${level}</strong>`;

  if (f.kind === "mana") {
    const lines = [`${head}. The vehicle passes through unaffected (SR2E p.109).`,
      broken ? "The barrier is knocked down." : `The barrier drops to ${barrier.newBaseRating} and rebuilds on its caster's next action.`];
    if (f.exposed) lines.push(`The exposed rider hits it as a wall: <strong>${power}${level}</strong>, no armour${f.aware ? ", Combat Pool allowed" : ""}.`
      + passengerButton({ power, level, key, mode: "mana", poolOk: f.aware }));
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<div class="sr2e-damage-result">${lines.join("<br>")}</div>` });
  }

  // The vehicle resists like a crash (p.109: "makes its Damage Resistance Test with its Body dice, plus one-half … armor").
  const armor = vehicle.system.effectiveArmor ?? 0, body = vehicle.system.body ?? 1;
  const resist = await vehicle.rollSuccessTest(body + Math.floor(armor / 2), Math.max(2, power - armor), {
    label: `${vehicle.name} resists the impact (${power}${level})`, isResistance: true });
  const stages = ["L", "M", "S", "D"];
  const idx = stages.indexOf(level) - Math.floor((resist?.successes ?? 0) / 2);
  if (idx >= 0) await commitVehicleDamage(vehicle, [1, 3, 6, 10][idx], { source: "collision", woundLevel: stages[idx] });
  const lines = [`${head}. ${idx >= 0 ? `The vehicle takes ${stages[idx]} damage.` : "The vehicle resists all damage."}`];
  if (broken) lines.push("The barrier breaks: the driver must make a Crash Test (SR2E p.107).");
  else {
    const occ = levelBelow(level);
    lines.push(`The barrier holds (now ${barrier.newBaseRating}). ${occ ? `Occupants take <strong>${power}${occ}</strong> (one level less).` : "Occupants are unhurt."}`
      + (occ ? passengerButton({ power, level: occ, key, mode: "impact" }) : ""));
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<div class="sr2e-damage-result">${lines.join("<br>")}</div>` });
  if (broken) await postCrashTestDue(vehicle, "broke through a barrier");
}

/* ── Chat card buttons ────────────────────────────────────────────────────────────────────────────────────────── */

/** Bind this module's chat card buttons (called from the system's chat render hook). */
export function bindVehicleCardButtons(message, html) {
  const on = (sel, fn) => html.querySelectorAll?.(sel).forEach(btn => btn.addEventListener("click", (ev) => { ev.preventDefault(); fn(btn); }));
  on(".sr2e-vram-resist-btn", () => resistVehicleRam(message));
  on(".sr2e-crash-test-btn", () => crashTestFromCard(message));
  on(".sr2e-passenger-resist-btn", (btn) => occupantResist(btn));
}
