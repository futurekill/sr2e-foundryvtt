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
import { r2Speed, engineFailureStress, permanentStress, repairQuote, repairHours, drivingTN, stressDice, ruleOfOne, drivingStressOutcome, overhaul } from "./rules/vehicle-r2-rules.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
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
  on(".sr2e-driving-resolve-btn", () => resolveDrivingTest(message));
}

/* ── Rigger 2 standard operations (docs/PLAN-vehicles-phase2.md Part 2a) ──────────────────────────────────────── */

/** Working equipment: a factory item, a Workshop design mod, or an installed customization with one of these keys. */
export function hasWorkingMod(vehicle, ...keys) {
  return !!vehicle?.items?.some(i => i.type === "vehicle_mod" && keys.includes(i.system.modKey)
    && ["", "done", "factory"].includes(i.system.custom?.state ?? ""));
}
/** Adapted for rigger control (R2 p.21): a drone, or Rigger Adaptation. */
export const riggerAdapted = (v) => v?.system?.vehicleType === "drone" || hasWorkingMod(v, "rigger-adaptation");
/** The effective Rigger 2 Speed Rating and maximum (p.22): off-road halves it for a ground vehicle without off-road suspension. */
export function r2SpeedOf(vehicle, offRoad = false) {
  return r2Speed(vehicle.system.effectiveSpeed ?? 0, { offRoad: offRoad && vehicle.system.vehicleType === "ground",
    suspension: hasWorkingMod(vehicle, "off-road-suspension") });
}
const ENGINE_KEYS = ["engine-custom-speed", "engine-custom-acceleration", "engine-custom-load"];
export const isEngineCustomization = (item) => item?.type === "vehicle_mod" && ENGINE_KEYS.includes(item.system.modKey);

/** Change a vehicle's Stress by `delta` (never below its permanent part), once per event id. */
export function adjustStress(vehicle, delta, { eventId = foundry.utils.randomID(16), reason = "" } = {}) {
  return gmCall("stress", { vehicleUuid: vehicle.uuid, delta: Math.trunc(Number(delta) || 0), eventId, reason });
}
GM_OPS.stress = async ({ vehicleUuid, delta, eventId }, user) => {
  const vehicle = fromUuidSync(vehicleUuid);
  if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
  return enqueueAttack(`vdmg:${vehicleUuid}`, async () => {
    if (!mayCommit(user, vehicle)) throw new Error(`${user?.name} may not change ${vehicle.name}'s Stress`);
    const path = `flags.sr2e.vstress.${eventId}`;
    if (foundry.utils.getProperty(vehicle, path) != null) return { skipped: true, stress: vehicle.system.stressRating };
    const before = vehicle.system.stressRating ?? 0;
    const after = Math.max(vehicle.system.stressPermanent ?? 0, before + delta, 0);
    await vehicle.update({ [path]: after - before, "system.stress": after });
    return { before, stress: after };
  });
};

/**
 * A Driving Test resolved exactly once: the driver's owner, the controller's owner, a self-driving drone's owner, or the
 * GM may claim it (plan R2 #2).
 */
export function claimDriving(vehicle, key, driverUuid = "") {
  return gmCall("drivingClaim", { vehicleUuid: vehicle.uuid, key, driverUuid });
}
GM_OPS.drivingClaim = async ({ vehicleUuid, key, driverUuid }, user) => {
  const vehicle = fromUuidSync(vehicleUuid);
  if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
  const driver = driverUuid ? fromUuidSync(driverUuid) : null;
  const ok = user?.isGM || driver?.testUserPermission(user, "OWNER") || controllerOf(vehicle)?.testUserPermission(user, "OWNER")
    || (!driverUuid && vehicle.testUserPermission(user, "OWNER"));
  return ok ? once(vehicle, key) : false;
};

/* Engine customization (R2 p.120): the secret test, recorded with its Stress in ONE actor update. */

/**
 * The GM's secret Build/Repair Test for a finished engine customization: the installer's skill vs 2 × the Installation
 * TN. Failure → ⌈1D6 ÷ 2⌉ permanent Stress. Keyed by the installation attempt: never rolled twice.
 */
export function engineCheckForInstall(vehicle, item) {
  return gmCall("engineInstall", { vehicleUuid: vehicle.uuid, itemId: item.id });
}
GM_OPS.engineInstall = async ({ vehicleUuid, itemId }, user) => {
  const vehicle = fromUuidSync(vehicleUuid), item = vehicle?.items.get(itemId);
  if (!isEngineCustomization(item)) throw new Error("not an engine customization");
  if (!mayCommit(user, vehicle)) throw new Error(`${user?.name} may not finish work on ${vehicle.name}`);
  const a = item.system.custom?.attempt ?? {};
  if (!a.ok || !a.id) throw new Error("no passed Installation Test");
  const worker = a.by ? fromUuidSync(a.by) : null;
  const skill = a.results?.[0]?.skill ?? "";
  const trained = worker?.items.find(i => i.type === "skill" && i.name.toLowerCase() === skill.toLowerCase() && (i.system.rating ?? 0) > 0);
  const web = trained ? null : worker?._webDefault?.({ name: skill, id: null, system: { rating: 0 } });
  const dice = trained ? trained.system.rating : (web?.dice ?? 1);
  const tn = 2 * (Number(a.spec?.tn) || 0) + (trained ? 0 : (web?.penalty ?? CONFIG.SR2E.defaultingPenalty));
  return recordEngineCheck(vehicle, a.id, { source: item.id, label: `${item.name} (installed by ${worker?.name ?? "?"}, ${skill} ${dice} vs TN ${tn})`, dice, tn });
};

/** Resolve a pending Workshop engine check (6 dice vs TN 6, design). */
async function resolveDesignCheck(vehicle, id, pending) {
  await recordEngineCheck(vehicle, id, { source: "design", levels: pending.addedLevels, label: `Workshop engine customization (+${pending.addedLevels} level${pending.addedLevels === 1 ? "" : "s"}, 6 dice vs TN 6)`, dice: 6, tn: 6,
    extra: { [`flags.sr2e.pendingEngineChecks.-=${id}`]: null } });
}

function recordEngineCheck(vehicle, id, { source, levels = null, label, dice, tn, extra = {} }) {
  return enqueueAttack(`vdmg:${vehicle.uuid}`, async () => {
    if (vehicle.getFlag("sr2e", "engineStress")?.[id]) {
      if (Object.keys(extra).length) await vehicle.update(extra);
      return { skipped: true };
    }
    const roll = await SR2ESuccessRoll.successTest(Math.max(1, dice), Math.max(2, tn));
    const ok = (roll?.successes ?? 0) > 0;
    const d6 = ok ? 0 : (await new Roll("1d6").evaluate()).total;   // hidden: the result goes to the GM's whisper only
    const points = ok ? 0 : engineFailureStress(d6);
    await vehicle.update({ ...extra, [`flags.sr2e.engineStress.${id}`]: { source, levels, successes: roll?.successes ?? 0, d6, points, at: Date.now() },
      "system.stress": (vehicle.system.stressRating ?? 0) + points });
    await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), speaker: ChatMessage.getSpeaker({ actor: vehicle }),
      content: `<div class="sr2e-damage-result"><strong>Secret engine check: ${esc(vehicle.name)}</strong> — ${esc(label)}:
        ${roll?.successes ?? 0} success${roll?.successes === 1 ? "" : "es"}. ${ok ? "The engine holds." : `It will fail: +${points} permanent Stress (1D6 = ${d6}, ÷ 2 rounded up; R2 p.120).`}</div>` });
    return { points };
  });
}

/** The GM's pass: pending Workshop checks and engine installs whose record exists but whose item wasn't finalized. */
export async function gmEnginePass(vehicle) {
  if (!isActiveGM() || vehicle?.type !== "vehicle") return;
  for (const [id, p] of Object.entries(vehicle.getFlag("sr2e", "pendingEngineChecks") ?? {})) await resolveDesignCheck(vehicle, id, p);
  const recs = vehicle.getFlag("sr2e", "engineStress") ?? {};
  for (const it of vehicle.items.filter(i => isEngineCustomization(i) && i.system.custom?.state === "tested" && recs[i.system.custom?.attempt?.id])) {
    try { await it.update({ "system.custom.state": "done" }); }
    catch (err) { if (vehicle.items.get(it.id)) throw err; }   // removed meanwhile (a factory engine): nothing to finish
  }
}

/** GM: fit a factory-standard engine (R2 p.120): every engine customization goes, and with it the permanent Stress. */
export async function replaceEngine(vehicle) {
  if (!game.user.isGM) return ui.notifications.warn("The GM replaces an engine.");
  await gmEnginePass(vehicle);   // no pending check may be skipped
  const items = vehicle.items.filter(isEngineCustomization).map(i => i.id);
  const recs = vehicle.getFlag("sr2e", "engineStress") ?? {};
  const points = permanentStress(recs);
  // Workshop engine levels go through the Workshop's own design maths, so the baked Speed/Acceleration/Load fall back.
  let designUpdate = {};
  const levels = Object.values(vehicle.system.design?.choices?.engineCustom ?? {}).reduce((t, l) => t + (Number(l) || 0), 0);
  if (levels) {
    const { VehicleWorkshop, workshopUpdate } = await import("./apps/vehicle-workshop.mjs");
    const ws = new VehicleWorkshop({ actor: vehicle });
    ws.design.engineCustom = { speed: 0, acceleration: 0, load: 0 };
    const r = ws.result(), ch = ws.tables.chassis[ws.design.chassisKey], pp = ws.tables.powerPlants[ws.design.powerPlantKey];
    if (!ch || !pp || !r.valid) return ui.notifications.warn(`${vehicle.name}'s design can't be recomputed without its engine customization: open it in the Workshop.`);
    designUpdate = workshopUpdate(ws.design, r, ch, pp, vehicle.name);
  }
  await enqueueAttack(`vdmg:${vehicle.uuid}`, async () => {
    if (items.length) await vehicle.deleteEmbeddedDocuments("Item", items.filter(id => vehicle.items.get(id)));
    await vehicle.update({ ...designUpdate, "flags.sr2e.-=engineStress": null, "system.stress": Math.max(0, (vehicle.system.stress ?? 0) - points) });
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)} gets a factory-standard engine.</strong> Its engine customizations are gone, and with them ${points} permanent Stress (R2 p.120).</div>` });
}

/* Repairs (R2 p.26): a job on the vehicle, every step through the GM queue. */

/** The vehicle's total cost incl. modifications: its cost (design and factory equipment included) + each installed aftermarket purchase once. */
export function vehicleValue(vehicle) {
  let v = Number(vehicle.system.cost) || 0;
  for (const i of vehicle.items) {
    const c = i.system.custom ?? {};
    if (i.type === "vehicle_mod" && c.state === "done" && c.receipt?.id) v += Number(c.receipt.amount) || 0;
  }
  return v;
}

export function repairOp(vehicle, action, data = {}) {
  return gmCall("repair", { vehicleUuid: vehicle.uuid, action, data, jobId: data.jobId ?? null });
}
GM_OPS.repair = async ({ vehicleUuid, action, data, jobId }, user) => {
  const vehicle = fromUuidSync(vehicleUuid);
  if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
  return enqueueAttack(`vdmg:${vehicleUuid}`, async () => {
    const job = vehicle.getFlag("sr2e", "repairJob") ?? null;
    const repairer = (job?.repairerUuid || data.repairerUuid) ? fromUuidSync(job?.repairerUuid || data.repairerUuid) : null;
    const may = user?.isGM || vehicle.testUserPermission(user, "OWNER") || controllerOf(vehicle)?.testUserPermission(user, "OWNER")
      || repairer?.testUserPermission(user, "OWNER");
    if (!may) throw new Error(`${user?.name} may not repair ${vehicle.name}`);
    if (action !== "quote" && (!job || job.id !== jobId)) return { stale: true };
    const set = (patch) => vehicle.update({ "flags.sr2e.repairJob": { ...job, ...patch } });
    switch (action) {
      case "quote": {
        if (job && job.state !== "done") return { stale: true };
        if (job) await vehicle.update({ "flags.sr2e.-=repairJob": null });
        const boxes = Math.max(1, Math.min(Number(data.boxes) || 0, vehicle.system.conditionMonitor.value ?? 0));
        const q = repairQuote({ boxes, value: vehicleValue(vehicle) });
        const nj = { id: foundry.utils.randomID(12), state: "parts", boxes, tn: q.tn, baseHours: q.baseHours, parts: q.parts,
          availability: vehicle.system.availability ?? "", streetIndex: vehicle.system.streetIndex ?? 1, repairerUuid: data.repairerUuid ?? "",
          hoursLeft: null, successes: null };
        await vehicle.update({ "flags.sr2e.repairJob": nj });
        return nj;
      }
      case "partsArrived": if (job.state !== "parts") return { stale: true }; await set({ state: "test" }); return { ok: true };
      case "tested": {
        if (job.state !== "test") return { stale: true };
        const s = Math.floor(Number(data.successes) || 0);
        const hours = repairHours(job.baseHours, s);
        if (hours == null) return { failed: true };
        await set({ state: "working", successes: s, hoursLeft: hours, repairerUuid: data.repairerUuid ?? job.repairerUuid });
        return { hours };
      }
      case "interrupt": if (job.state !== "working") return { stale: true }; await set({ state: "paused", hoursLeft: Math.max(0, Number(data.hoursLeft ?? job.hoursLeft) || 0) }); return { ok: true };
      case "resume": if (job.state !== "paused") return { stale: true }; await set({ state: "working" }); return { ok: true };
      case "finish": {
        if (job.state !== "working") return { stale: true };
        const cm = vehicle.system.conditionMonitor;
        await vehicle.update({ "system.conditionMonitor.value": Math.max(0, (cm.value ?? 0) - job.boxes), "flags.sr2e.repairJob": { ...job, state: "done" } });
        return { repaired: job.boxes };
      }
      case "cancel": await vehicle.update({ "flags.sr2e.-=repairJob": null }); return { ok: true };
    }
    throw new Error(`unknown repair action ${action}`);
  });
};

// The GM finishes engine checks wherever they're pending: a new or updated vehicle, and everything on load.
globalThis.Hooks?.on("createActor", (a) => gmEnginePass(a));
globalThis.Hooks?.on("updateActor", (a, change) => {
  if (foundry.utils.hasProperty(change, "flags.sr2e.pendingEngineChecks") || foundry.utils.hasProperty(change, "flags.sr2e.engineStress")) gmEnginePass(a);
});
globalThis.Hooks?.once("ready", () => {
  for (const a of game.actors.filter(a => a.type === "vehicle")) gmEnginePass(a);
  // Rigger 2 rules without the Rigger 2 module: the rules work, but vehicles keep their own compendium stats.
  if (game.user.isGM && isRigger2() && !game.modules.get("sr2e-rigger-2")?.active)
    ui.notifications.info("Vehicle ruleset: Rigger 2. The Rigger 2 module isn't active, so vehicles keep their own stats (its Vehicle List supplies the Rigger 2 ones).");
});

/* ── The Rigger 2 Driving Test (R2 p.20–21, p.23, p.26) ──────────────────────────────────────────────────────── */

const hasDatajack = (c) => !!c?.items?.some(i => i.type === "cyberware" && /datajack/i.test(i.name));

/** The modes a driver can use on this vehicle, best first (plan 2a.2). */
export function drivingModes(driver, vehicle) {
  if (!driver) return ["drone"];
  const out = [];
  if (riggedInto(driver, vehicle) && riggerAdapted(vehicle)) out.push("rigged");
  if (hasDatajack(driver) && (hasWorkingMod(vehicle, "datajack-port") || riggerAdapted(vehicle))) out.push("datajack");
  out.push("manual");
  return out;
}

/** The Driving Test dialog; `driver` null = a drone driving itself on its Pilot. */
export async function promptDrivingTest(driver, vehicle) {
  const modes = drivingModes(driver, vehicle);
  const ground = vehicle.system.vehicleType === "ground";
  const offRoadRating = vehicle.system.effectiveHandlingOffRoad;
  const sk = driver ? driver._vehicleSkill(vehicle) : null;
  const poolMax = driver && isPoolClient(driver) ? Math.min(driver.system.dicePools?.control?.value ?? 0, sk.cap) : 0;
  const maxStressDice = driver ? stressDice(99, vehicle.system.body).dice : 0;
  const sel = (name, opts, v = "") => `<select name="${name}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const label = { rigged: "Rigged (VCR)", datajack: "Datajack (−1)", manual: "Manual", drone: "The drone itself (Pilot)" };
  return foundry.applications.api.DialogV2.prompt({
    window: { title: `Driving Test: ${vehicle.name}` }, rejectClose: false,
    content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
      <div class="form-group"><label>Control:</label>${sel("mode", modes.map(m => [m, label[m]]))}</div>
      <div class="form-group"><label>Terrain:</label>${sel("terrain", [["open", "Open (−1)"], ["normal", "Normal"], ["restricted", "Restricted (+1)"], ["tight", "Tight (+3)"]], "normal")}</div>
      <div class="form-group"><label>Situation:</label>${sel("situation", [["", "—"], ["calm", "Non-stressful (−1)"], ["stress", "Stressful (+3)"]])}</div>
      <div class="form-group"><label>Weather:</label>${sel("weather", [["", "Normal"], ["bad", "Bad (+2)"], ["terrible", "Terrible (+4)"]])}</div>
      <div class="form-group"><label>Size of type:</label>${sel("size", [["", "Normal"], ["large", "Large (+2)"], ["veryLarge", "Very large (+3)"]])}</div>
      <div class="form-group"><label>Other mod:</label><input type="number" name="otherMod" value="0" style="width:52px;"></div>
      <label style="font-size:12px;"><input type="checkbox" name="unfamiliar"> Unfamiliar vehicle (+1)</label>
      <label style="font-size:12px;"><input type="checkbox" name="combat"> During combat (+2)</label>
      ${ground ? `<label style="font-size:12px;"><input type="checkbox" name="offRoad"> Off-road</label>
        ${offRoadRating == null ? `<div class="form-group"><label>Off-road Handling:</label><input type="number" name="offRoadHandling" placeholder="GM" style="width:52px;"></div>` : "<span></span>"}` : ""}
      ${poolMax ? `<div class="form-group"><label>Control Pool (rigged, max ${poolMax}):</label><input type="number" name="control" value="0" min="0" max="${poolMax}" style="width:52px;"></div>` : ""}
      ${maxStressDice ? `<div class="form-group"><label>Push it: +dice (2 Stress each, max ${maxStressDice}):</label><input type="number" name="stressDice" value="0" min="0" max="${maxStressDice}" style="width:52px;"></div>` : ""}
      <p style="grid-column:1/-1;font-size:10px;color:#aaa1c0;margin:4px 0 0;">Rigger 2 p.20–21: Handling + the Driving Test Modifiers Table; the vehicle's Autonav adds dice.
        Control Pool dice here can't resist damage. A failed test or many 1s can cost Stress (p.26).</p></div>`,
    ok: { label: "Roll", callback: (ev, b) => {
      const e = b.form.elements;
      return { mode: e.mode.value, terrain: e.terrain.value, situation: e.situation.value, weather: e.weather.value, size: e.size.value,
        otherMod: parseInt(e.otherMod.value) || 0, unfamiliar: e.unfamiliar.checked, combat: e.combat.checked, offRoad: !!e.offRoad?.checked,
        offRoadHandling: e.offRoadHandling?.value === "" || e.offRoadHandling == null ? null : parseInt(e.offRoadHandling.value),
        control: parseInt(e.control?.value) || 0, stressDice: parseInt(e.stressDice?.value) || 0 };
    } }
  });
}

/** Roll a Driving Test (R2 p.20). Stress bought for dice is committed before the roll; Resolve applies the rest. */
export async function rollDrivingTest(driver, vehicle, o) {
  if (!o) return null;
  const sys = vehicle.system;
  const drone = !driver;
  const sk = drone ? { key: null, dice: sys.effective?.pilot ?? sys.pilot ?? 0, penalty: 0, cap: 0, note: " (Pilot)" } : driver._vehicleSkill(vehicle);
  if (drone && !(sk.dice > 0)) return ui.notifications.warn(`${vehicle.name} has no Pilot rating to drive itself.`);
  const handling = o.offRoad ? (sys.effectiveHandlingOffRoad ?? o.offRoadHandling) : sys.effectiveHandling;
  if (handling == null || !Number.isFinite(handling)) return ui.notifications.warn(`${vehicle.name} has no off-road Handling: enter the GM's rating.`);
  const { tn, parts } = drivingTN({ handling, unfamiliar: o.unfamiliar, situation: o.situation, size: o.size, weather: o.weather,
    terrain: o.terrain, combat: o.combat, mode: o.mode, vcr: driver?.system.vehicleControlRig ?? 0, damageMod: sys.damageTnMod ?? 0,
    otherMod: (o.otherMod ?? 0) + sk.penalty });
  const autonav = Math.max(0, sys.effective?.autonav ?? sys.autonav ?? 0);
  const paid = o.mode === "rigged" && driver ? await driver._payControl(o.control, sk.cap) : 0;
  const push = drone ? { dice: 0, stress: 0 } : stressDice(o.stressDice, sys.body);
  if (push.stress) await adjustStress(vehicle, push.stress, { reason: "extra Driving Test dice" });
  const roller = driver ?? vehicle;
  const label = `${vehicle.name}: Driving Test (${parts.map(([n, m]) => `${n} ${m > 0 && n !== "Handling" ? "+" : ""}${m}`).join(", ")})${sk.note ?? ""}`
    + `${autonav ? `, +${autonav} Autonav` : ""}${push.dice ? `, +${push.dice} pushed (${push.stress} Stress)` : ""}`;
  const res = await roller.rollSuccessTest(sk.dice + autonav + push.dice, tn, { label, paidPoolDice: paid ? { control: paid } : undefined,
  });
  if (!res) return null;
  const st = { vehicleUuid: vehicle.uuid, driverUuid: driver?.uuid ?? "", testMessageId: res.testMessageId ?? "", skill: sk.dice, body: sys.body ?? 0, resolved: false };
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: roller }), flags: { sr2e: { drivingTest: st } },
    content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)}: Driving Test</strong> — spend Karma first if you will, then Resolve.
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-driving-resolve-btn">✔ Resolve (Stress, R2 p.26)</button></div></div>` });
  return res;
}

/** Resolve a Driving Test card once: the Stress Test on a failure, the Rule of One, system failures (R2 p.26). */
export async function resolveDrivingTest(message) {
  const st = message.getFlag("sr2e", "drivingTest");
  const vehicle = st && fromUuidSync(st.vehicleUuid);
  if (!vehicle || game.messages.some(m => m.flags?.sr2e?.resolves === message.id)) return ui.notifications.warn("That Driving Test is resolved.");
  if (!await claimDriving(vehicle, `drive:${message.id}`, st.driverUuid)) return ui.notifications.warn("That Driving Test is already resolved (or isn't yours).");
  const test = game.messages.get(st.testMessageId)?.flags?.sr2e?.test;
  const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
  const successes = test ? testTotalSuccesses(test) : 0;
  const ones = (test?.dice ?? []).filter(d => d.total === 1).length;
  const failed = successes === 0;
  const stress = vehicle.system.stressRating ?? 0;
  const stressRoll = failed ? (await new Roll("2d6").evaluate()).total : null;
  const ruleRoll = ruleOfOne(ones, st.skill) ? (await new Roll("1d6").evaluate()).total : null;
  const out = drivingStressOutcome({ failed, stress, body: st.body, ones, skill: st.skill, stressRoll, ruleRoll });
  if (out.addStress) await adjustStress(vehicle, out.addStress, { eventId: `rule1-${message.id}`, reason: "Stress Rule of One" });
  const lines = [`${successes} success${successes === 1 ? "" : "es"}, ${ones} one${ones === 1 ? "" : "s"}.`];
  if (failed) lines.push(`Failed: the GM's Stress Test rolls ${stressRoll} against Stress ${stress}${out.failure === "stressTest" ? " — <strong>a system fails</strong>" : ": no effect"}.`);
  if (ruleRoll != null) lines.push(`Stress Rule of One (${ones} ones ≥ ${st.skill}): +${ruleRoll} Stress, now ${stress + ruleRoll}${out.failure === "ruleOfOne" ? ` ≥ 2 × Body ${st.body}: <strong>a system fails</strong>` : ""}.`);
  if (out.failure) lines.push("The GM picks the major system (brakes, steering, transmission…).");
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)}: Driving Test resolved</strong><br>${lines.join("<br>")}</div>`,
    flags: { sr2e: { resolves: message.id, closesTests: [st.testMessageId].filter(Boolean) } } });
  if (out.failure) await postCrashTestDue(vehicle, "suffered a system failure");
  return out;
}

/** The GM's Stress Test (R2 p.26): 2D6 against the Stress Rating, "any time the vehicle is running". */
export async function gmStressTest(vehicle) {
  if (!game.user.isGM) return ui.notifications.warn("The GM makes Stress Tests.");
  const stress = vehicle.system.stressRating ?? 0;
  const roll = (await new Roll("2d6").evaluate()).total;
  const fails = roll < stress;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)}: Stress Test</strong>
    2D6 = ${roll} against Stress ${stress}: ${fails ? "<strong>a major system fails</strong> (GM's pick)" : "no failure"} (R2 p.26).</div>` });
  if (fails) await postCrashTestDue(vehicle, "suffered a system failure");
  return { roll, fails };
}

/* ── Sheet flows (Rigger 2 only) ──────────────────────────────────────────────────────────────────────────────── */

/** The vehicle's Build/Repair skill name (car/bike → Ground Vehicles (B/R), boats, aircraft). */
async function brSkillFor(vehicle) {
  const { customizeContext } = await import("./vehicle-customize.mjs");
  const { installSkills } = await import("./rules/vehicle-custom.mjs");
  return installSkills(["vehicleBR"], customizeContext(vehicle).traits)[0];
}

/** Pick a character the user owns to do the work. */
async function pickWorker(title, extra = "") {
  const workers = game.actors.filter(a => a.type === "character" && a.isOwner);
  if (!workers.length) { ui.notifications.warn("You need a character to do the work."); return null; }
  return foundry.applications.api.DialogV2.prompt({ window: { title }, rejectClose: false,
    content: `<div class="form-group"><label>Who does the work?</label><select name="worker">${workers.map(a => `<option value="${a.uuid}">${esc(a.name)}</option>`).join("")}</select></div>${extra}`,
    ok: { label: "Roll", callback: (ev, b) => ({ worker: fromUuidSync(b.form.elements.worker.value), elements: b.form.elements }) } });
}

/** +1 Stress for pushing past the Speed Rating (R2 p.22, p.25). */
export async function exceedSpeed(vehicle) {
  const { rating, max } = r2SpeedOf(vehicle);
  const r = await adjustStress(vehicle, 1, { reason: "past its Speed Rating" });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<div class="sr2e-damage-result">${esc(vehicle.name)} goes past its Speed Rating ${rating} (at most ${max}): +1 Stress, now ${r?.stress ?? "?"} (R2 p.25).</div>` });
}

/** Maintenance overhaul (R2 p.26): in a Vehicle Facility; B/R vs Stress + 4; 2 successes a point. */
export async function overhaulFlow(vehicle) {
  const stress = vehicle.system.stressRating ?? 0, permanent = vehicle.system.stressPermanent ?? 0;
  if (stress <= Math.max(1, permanent)) return ui.notifications.info(`${vehicle.name}'s Stress (${stress}) can't come down any further${permanent ? ` (${permanent} is permanent)` : ""}.`);
  const skill = await brSkillFor(vehicle);
  const f = await pickWorker(`Overhaul ${vehicle.name}`, `<label style="font-size:12px;"><input type="checkbox" name="facility"> In a Vehicle Facility (SRII p.244, p.259)</label>
    <p style="font-size:10px;color:#aaa1c0;">${esc(skill)} against Stress ${stress} + 4 = ${stress + 4}; every 2 successes remove 1 (never below 1, never the permanent ${permanent}); parts 50¥ a point.</p>`);
  if (!f?.worker) return;
  if (!f.elements.facility.checked) return ui.notifications.warn("A maintenance overhaul needs a Vehicle Facility (R2 p.26).");
  const res = await f.worker.rollNamedSkill(skill, stress + 4, { label: `${skill}: overhauling ${vehicle.name}` });
  if (!res) return;
  const o = overhaul({ stress, permanent, successes: res.successes ?? 0 });
  if (o.removed) await adjustStress(vehicle, -o.removed, { eventId: `overhaul-${res.testMessageId ?? foundry.utils.randomID(8)}`, reason: "overhaul" });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: f.worker }), content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)} overhauled</strong>:
    ${o.removed ? `−${o.removed} Stress (now ${stress - o.removed}); parts ${o.parts.toLocaleString()}¥` : "no Stress removed"} (R2 p.26).</div>` });
}

/** Repairs (R2 p.26), one step per click by the job's state. */
export async function repairFlow(vehicle) {
  const job = vehicle.getFlag("sr2e", "repairJob");
  const say = (html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), content: `<div class="sr2e-damage-result">${html}</div>` });
  const dmg = vehicle.system.conditionMonitor.value ?? 0;
  if (!job || job.state === "done") {
    if (!dmg) return ui.notifications.info(`${vehicle.name} isn't damaged.`);
    const workers = game.actors.filter(a => a.type === "character" && a.isOwner);
    const f = await foundry.applications.api.DialogV2.prompt({ window: { title: `Repair ${vehicle.name}` }, rejectClose: false,
      content: `<div class="form-group"><label>Boxes to repair:</label><input type="number" name="boxes" value="${dmg}" min="1" max="${dmg}" style="width:52px;"></div>
        <div class="form-group"><label>Repairer:</label><select name="worker"><option value="">(decide later)</option>${workers.map(a => `<option value="${a.uuid}">${esc(a.name)}</option>`).join("")}</select></div>`,
      ok: { label: "Quote", callback: (ev, b) => ({ boxes: parseInt(b.form.elements.boxes.value) || 0, repairerUuid: b.form.elements.worker.value }) } });
    if (!f) return;
    const q = await repairOp(vehicle, "quote", f);
    if (q?.stale) return ui.notifications.warn("A repair is already under way.");
    return say(`<strong>Repair quoted: ${esc(vehicle.name)}</strong>, ${q.boxes} box${q.boxes === 1 ? "" : "es"}: TN ${q.tn}, ${q.baseHours} hours base;
      parts ${q.parts.toLocaleString()}¥ (Availability ${esc(q.availability || "as the vehicle")}, Street Index ${q.streetIndex}; acquired with Vehicle B/R).
      The repair can't start until the parts arrive (R2 p.26).`);
  }
  if (job.state === "parts") {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Parts arrived?" }, content: `<p>Have the parts for ${esc(vehicle.name)} arrived (${job.parts.toLocaleString()}¥)?</p>` });
    if (ok) { await repairOp(vehicle, "partsArrived", { jobId: job.id }); return say(`Parts for ${esc(vehicle.name)} are in: the repair can start.`); }
    return;
  }
  if (job.state === "test") {
    const skill = await brSkillFor(vehicle);
    const f = await pickWorker(`Repair ${vehicle.name}`, `<p style="font-size:10px;color:#aaa1c0;">${esc(skill)} against TN ${job.tn}.</p>`);
    if (!f?.worker) return;
    const res = await f.worker.rollNamedSkill(skill, job.tn, { label: `${skill}: repairing ${vehicle.name}` });
    if (!res) return;
    const r = await repairOp(vehicle, "tested", { jobId: job.id, successes: res.successes ?? 0, repairerUuid: f.worker.uuid });
    return say(r?.failed ? `No success: the repair of ${esc(vehicle.name)} doesn't get anywhere; try again.`
      : `${esc(vehicle.name)} is in the shop for <strong>${r.hours} hours</strong> (${job.baseHours} ÷ ${res.successes}); it can't be used meanwhile. Finish it when the time has passed.`);
  }
  const choice = await foundry.applications.api.DialogV2.wait({ window: { title: `Repair: ${vehicle.name}` }, rejectClose: false,
    content: `<p>${job.state === "working" ? `In the shop: ${job.hoursLeft} hours of work.` : `Taken back mid-repair: ${job.hoursLeft} hours left.`}</p>`,
    buttons: job.state === "working"
      ? [{ action: "finish", label: "Finish (time has passed)", default: true }, { action: "interrupt", label: "Take it back (1 h to make it run)" }, { action: "cancel", label: "Close" }]
      : [{ action: "resume", label: "Resume the repair", default: true }, { action: "cancel", label: "Close" }] });
  if (choice === "finish") { const r = await repairOp(vehicle, "finish", { jobId: job.id }); if (r?.repaired) return say(`${esc(vehicle.name)} is repaired: ${r.repaired} box${r.repaired === 1 ? "" : "es"} off.`); }
  if (choice === "interrupt") {
    const left = await foundry.applications.api.DialogV2.prompt({ window: { title: "Hours left" }, rejectClose: false,
      content: `<div class="form-group"><label>Hours of work left:</label><input type="number" name="h" value="${job.hoursLeft}" min="0" style="width:64px;"></div>`,
      ok: { callback: (ev, b) => parseFloat(b.form.elements.h.value) } });
    if (left == null) return;
    await repairOp(vehicle, "interrupt", { jobId: job.id, hoursLeft: left });
    return say(`${esc(vehicle.name)} is taken out of the shop mid-repair (an extra hour to make it run, not counted; ${left} hours left).`);
  }
  if (choice === "resume") { await repairOp(vehicle, "resume", { jobId: job.id }); return say(`${esc(vehicle.name)} goes back into the shop.`); }
}

/** GM: the secret check for engine customizations installed before 0.147.0 (no record yet). */
export async function adjudicateLegacyEngines(vehicle) {
  if (!game.user.isGM) return;
  const recs = vehicle.getFlag("sr2e", "engineStress") ?? {};
  for (const it of legacyEngines(vehicle, recs)) {
    const a = it.system.custom?.attempt;
    if (a?.ok && a.id) await GM_OPS.engineInstall({ vehicleUuid: vehicle.uuid, itemId: it.id }, game.user);
    else await recordEngineCheck(vehicle, `legacy-${it.id}`, { source: it.id, label: `${it.name} (no installation record: 6 dice vs TN 6)`, dice: 6, tn: 6 });
  }
}
/** Engine customizations working without an engine record (installed before the checks existed). Factory engines are standard. */
export function legacyEngines(vehicle, recs = vehicle.getFlag("sr2e", "engineStress") ?? {}) {
  return vehicle.items.filter(i => isEngineCustomization(i) && ["", "done"].includes(i.system.custom?.state ?? "")
    && !recs[i.system.custom?.attempt?.id] && !recs[`legacy-${i.id}`] && !i.getFlag("sr2e", "designMod"));
}

/** The Rigger 2 panel's context for a vehicle (null under the core rules). */
export function r2Context(vehicle) {
  if (!isRigger2()) return null;
  const job = vehicle.getFlag("sr2e", "repairJob");
  const sp = r2SpeedOf(vehicle);
  return { stress: vehicle.system.stressRating ?? 0, permanent: vehicle.system.stressPermanent ?? 0, speed: sp.rating, maxSpeed: sp.max, kph: Math.round(sp.rating * 1.2),
    drone: vehicle.system.vehicleType === "drone", isGM: game.user.isGM,
    repair: job && job.state !== "done" ? { parts: "waiting for parts", test: "parts in: roll the repair", working: `in the shop (${job.hoursLeft} h)`, paused: `taken back (${job.hoursLeft} h left)` }[job.state] : null,
    legacyEngine: game.user.isGM && legacyEngines(vehicle).length > 0,
    engine: game.user.isGM && (vehicle.items.some(isEngineCustomization) || (vehicle.system.stressPermanent ?? 0) > 0) };
}
