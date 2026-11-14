/**
 * Rigger 2 missiles (R2 p.59–60; docs/PLAN-vehicles-phase2.md 4b.4). A launch is a durable record on the shooter's
 * vehicle (or the shooter), `flags.sr2e.launches.<id> = { shooterUuid, gunnerUuid, sourceVehicleUuid, targetUuid,
 * targetTokenUuid, mode: continuous|fireAndForget, lock, payload, combatId, round, state }` — state launched → rolling
 * → resolved | lost | cancelled. Nothing is rolled at launch: every missile strikes at the end of its Combat Turn
 * (Phase 0), in the round change's closing stage, which every combat now has and which waits for every launch of that
 * round to be terminal.
 *   - Admission (round queue `round:<combatId>`): `flags.sr2e.launchAdmit.<round>.<id> = { holderUuid, weaponUuid,
 *     state: reserved|launched|released }` on the Combat, refused once that round's change has begun.
 *   - The spend is the ammunition queue's atomic `launch` (payload snapshot in its receipt); the record copies it.
 *   - Phase 0: one card per launch; the gunner (or the GM) rolls the Missile Attack Test from the payload — never the
 *     launcher — through the ordinary attack path, with the ECM exposures recorded at that moment.
 *   - Continuous lock: until Phase 0 the gunner's other attacks are refused (GM override) and the vehicle's Driving
 *     Tests take +2; contact is re-checked at Phase 0 (R4-2): lost → the missile doesn't strike (p.59).
 */
import { gmOp, gmCall, followId } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TERMINAL = new Set(["resolved", "lost", "cancelled"]);
export const launchesOf = (holder) => holder?.getFlag("sr2e", "launches") ?? {};
const hq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);

/** +2 to every Driving Test of a vehicle guiding a missile in continuous lock (p.59; plan round 2 #2). */
export function guidanceDrivingMod(vehicle) {
  return Object.values(launchesOf(vehicle)).some(l => l.mode === "continuous" && !TERMINAL.has(l.state)) ? 2 : 0;
}

/** A continuous-lock commitment that forbids this gunner attacking anything but its target (p.59), or null. */
export function guidanceCommitment(gunner, vehicle) {
  return Object.values(launchesOf(vehicle)).find(l => l.mode === "continuous" && !TERMINAL.has(l.state) && l.gunnerUuid === gunner?.uuid) ?? null;
}

async function card(actor, html, flags = {}) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">${html}</div>`, flags });
}

export function registerMissiles() {
  // The launch (p.59): admitted under the round queue, the missile spent atomically in the ammunition queue, recorded.
  gmOp("missileLaunch", async (a, user) => {
    const combat = game.combats.get(a.combatId);
    const weapon = fromUuidSync(a.weaponUuid), holder = fromUuidSync(a.holderUuid), gunner = fromUuidSync(a.gunnerUuid);
    if (!combat || !weapon || !holder || !gunner) throw new Error("the launch is missing its combat, weapon or shooter");
    if (!user.isGM && !gunner.testUserPermission(user, "OWNER")) throw new Error("not allowed");
    await enqueueAttack(`round:${combat.id}`, async () => {
      if (combat.round !== a.round || combat.getFlag("sr2e", "roundTransition")) throw new Error("this Combat Turn is ending: launch next Turn");
      if (combat.getFlag("sr2e", "launchAdmit")?.[a.round]?.[a.launchId]) return;
      const args = { ...a, by: user.id };
      await combat.update({ [`flags.sr2e.launchAdmit.${a.round}.${a.launchId}`]: { holderUuid: holder.uuid, weaponUuid: weapon.uuid, state: "reserved", args } });
    });
    return finishLaunch(combat, a, user);
  });

  // Phase 0 (p.59): arm this launch's Missile Attack Test — once (launched → rolling), re-checking a continuous lock.
  gmOp("missileArm", async ({ holderUuid, launchId }, user) => {
    const holder = fromUuidSync(holderUuid);
    return hq(holderUuid, async () => {
      const l = launchesOf(holder)[launchId];
      if (!l) throw new Error("no such launch");
      const gunner = fromUuidSync(l.gunnerUuid);
      if (!user.isGM && !gunner?.testUserPermission(user, "OWNER")) throw new Error("the gunner or the GM rolls this");
      if (l.state === "rolling" && l.armedBy === user.id) return l;   // the same roller retrying
      if (l.state !== "launched") throw new Error(`this missile is ${l.state}`);
      const S = await import("./vehicle-sensors.mjs");
      const source = fromUuidSync(l.sourceVehicleUuid), target = fromUuidSync(l.targetUuid);
      if (l.mode === "continuous" && !(source && target && S.lockOn(source, target))) {
        await holder.update({ [`flags.sr2e.launches.${launchId}.state`]: "lost" });
        await card(holder, `<strong>${esc(l.payload.ammoName)}: lock lost</strong> — the missile won't strike ${esc(target?.name)} (Rigger 2 p.59).
          The GM may resolve it as an area-effect attack (p.60).`);
        return { ...l, state: "lost" };
      }
      const exposures = await S.missileExposures(source ?? holder, target, l.payload.guided?.sensor ?? 0);
      const upd = { state: "rolling", armedBy: user.id, exposures };
      await holder.update(Object.fromEntries(Object.entries(upd).map(([k, v]) => [`flags.sr2e.launches.${launchId}.${k}`, v])));
      return { ...l, ...upd };
    });
  });

  // The roll's card is the record: the launch is resolved (terminal), once.
  gmOp("missileDone", async ({ holderUuid, launchId, messageId }, user) => {
    const holder = fromUuidSync(holderUuid);
    return hq(holderUuid, async () => {
      const l = launchesOf(holder)[launchId];
      if (l?.state !== "rolling") return l;
      if (!user.isGM && l.armedBy !== user.id) throw new Error("not the armed roller");
      await holder.update({ [`flags.sr2e.launches.${launchId}.state`]: "resolved", [`flags.sr2e.launches.${launchId}.messageId`]: messageId ?? "" });
      return true;
    });
  });

  // The GM cancels a launch that hasn't struck (a stuck roller, a mistaken launch): the missile is spent all the same.
  gmOp("missileCancel", async ({ holderUuid, launchId }, user) => {
    if (!user.isGM) throw new Error("GM only");
    const holder = fromUuidSync(holderUuid);
    return hq(holderUuid, async () => {
      const l = launchesOf(holder)[launchId];
      if (l && !TERMINAL.has(l.state)) await holder.update({ [`flags.sr2e.launches.${launchId}.state`]: "cancelled" });
      return true;
    });
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const m = message.getFlag("sr2e", "missilePhase0");
    if (!m) return;
    html.querySelectorAll?.(".sr2e-missile-roll").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); rollPhase0(m).catch(err => ui.notifications.warn(`SR2E | ${err.message}`)); }));
    html.querySelectorAll?.(".sr2e-missile-cancel").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); gmCall("missileCancel", m).catch(err => ui.notifications.warn(`SR2E | ${err.message}`)); }));
  });
}

/** Spend (atomic, in the ammunition queue) → record → admission launched; a refusal releases the admission. */
async function finishLaunch(combat, a, user) {
  const holder = fromUuidSync(a.holderUuid);
  let receipt;
  try {
    receipt = await gmCall("ammo", { action: "launch", weaponUuid: a.weaponUuid, eventId: a.launchId });
  } catch (err) {
    await gmCall("ammo", { action: "cancel", weaponUuid: a.weaponUuid, eventId: a.launchId }).catch(() => {});
    await admit(combat, a.round, a.launchId, "released");
    throw err;
  }
  await recordLaunch(holder, { ...a, by: user.id }, receipt.payload, combat);
  await admit(combat, a.round, a.launchId, "launched");
  const target = fromUuidSync(a.targetUuid);
  await card(holder, `<strong>🚀 ${esc(receipt.payload.ammoName)} launched at ${esc(target?.name)}</strong>
    (${a.mode === "fireAndForget" ? "fire-and-forget" : "continuous lock: no other targets for the gunner, +2 to this vehicle's Driving Tests"}).
    It strikes at the end of the Combat Turn (Phase 0, Rigger 2 p.59).`);
  return true;
}

/** Write the launch record once (idempotent; the closing stage may finish a launch whose client stopped). */
function recordLaunch(holder, a, payload, combat) {
  return hq(holder.uuid, async () => {
    if (launchesOf(holder)[a.launchId]) return;
    await holder.update({ [`flags.sr2e.launches.${a.launchId}`]: { id: a.launchId, shooterUuid: holder.uuid, gunnerUuid: a.gunnerUuid,
      sourceVehicleUuid: a.sourceVehicleUuid ?? holder.uuid, targetUuid: a.targetUuid, targetTokenUuid: a.targetTokenUuid ?? "",
      mode: a.mode === "fireAndForget" ? "fireAndForget" : "continuous", lock: a.lock ?? null, payload, r2: a.r2 ?? null,
      combatId: combat.id, round: a.round, state: "launched", by: a.by ?? "", at: Date.now() } });
  });
}

const admit = (combat, round, id, state) => enqueueAttack(`round:${combat.id}`,
  () => combat.update({ [`flags.sr2e.launchAdmit.${round}.${id}.state`]: state }));

/**
 * The closing stage's Phase 0 (called inside the round queue by SR2ECombat#_advance): drain admissions (spent →
 * launched, else released), post each pending launch's card once, and report what is still waiting.
 */
export async function missileCloseStage(combat, r) {
  const adm = combat.getFlag("sr2e", "launchAdmit")?.[r] ?? {};
  const waiting = [];
  for (const [id, x] of Object.entries(adm)) {
    if (x.state === "released") continue;
    const holder = fromUuidSync(x.holderUuid);
    if (x.state === "reserved") {
      // Drain an admitted launch: cancel returns the spend's receipt if the spend won the race (one ammo queue), so the
      // missile is either spent and recorded (launched) or never spent (released).
      const w = fromUuidSync(x.weaponUuid);
      const rec = w ? await gmCall("ammo", { action: "cancel", weaponUuid: w.uuid, eventId: id }).catch(() => null) : null;
      if (rec?.payload && holder) await recordLaunch(holder, x.args, rec.payload, combat);
      await combat.update({ [`flags.sr2e.launchAdmit.${r}.${id}.state`]: rec?.payload ? "launched" : "released" });
      if (!rec?.payload) continue;
    }
    const l = launchesOf(holder)[id];
    if (!l || TERMINAL.has(l.state)) continue;
    waiting.push(id);
    const key = `${holder.uuid}:${id}`;
    if (!game.messages.some(m => m.getFlag("sr2e", "missilePhase0")?.key === key)) {
      const target = fromUuidSync(l.targetUuid);
      await card(holder, `<strong>Phase 0: ${esc(l.payload.ammoName)} strikes ${esc(target?.name)}</strong> (Rigger 2 p.59)<br>
        The gunner rolls the Missile Attack Test: Gunnery + Intelligence ${l.payload.guided?.intelligence ?? 0}${l.mode === "continuous" ? " + ½ Sensor (continuous lock)" : ""}.
        The Combat Turn ends when every missile has struck.
        <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-missile-roll">🎯 Missile Attack Test</button>
        <button type="button" class="sr2e-resist-btn sr2e-missile-cancel" title="GM: cancel this launch (the missile is spent)">✖</button></div>`,
        { sr2e: { missilePhase0: { key, holderUuid: holder.uuid, launchId: id } } });
    }
  }
  return { done: !waiting.length, waiting };
}

/** The Phase 0 roll (the gunner's client or the GM's): arm, then the ordinary attack path on the payload. */
export async function rollPhase0({ holderUuid, launchId }, { pool: given = null } = {}) {
  const l = await gmCall("missileArm", { holderUuid, launchId });
  if (l.state !== "rolling") return;
  const gunner = fromUuidSync(l.gunnerUuid), p = l.payload;
  const pool = given != null ? given : await foundry.applications.api.DialogV2.prompt({ window: { title: `Missile Attack Test — ${p.ammoName}` },
    content: `<p>Combat Pool dice (Rigger 2 p.59): <input type="number" name="pool" value="0" min="0" max="${gunner.system.dicePools?.combat?.value ?? 0}" style="width:60px"></p>`,
    ok: { label: "Roll", callback: (_e, b) => Number(b.form.elements.pool.value) || 0 } }).catch(() => null);
  if (pool === null) return;
  const Item = foundry.utils.getDocumentClass("Item");
  const weapon = new Item({ name: p.ammoName, type: "weapon", system: { weaponType: "heavy", skill: "gunnery", damageCode: p.damageCode,
    damageType: p.damageType, blastType: p.blastType, ammo: { max: 0, current: 0, type: p.ammoType, loadedName: p.ammoName,
      damageMod: p.damageMod, armorMod: p.armorMod, armorCalc: p.armorCalc, damageType: p.ammoDamageType, material: p.material, guided: p.guided } } },
  { parent: gunner });
  const before = new Set(game.messages.map(m => m.id));
  await weapon._rollWeaponAttack({ gunner, gunneryMode: "missile", launch: l, firingVehicleUuid: l.sourceVehicleUuid,
    poolDice: pool ? { combat: pool } : undefined, firingMode: "ss",
    _engage: { key: `missile:${launchId}`, token: l.targetTokenUuid ? { uuid: l.targetTokenUuid } : null } });
  const msg = game.messages.contents.filter(m => !before.has(m.id)).find(m => m.getFlag("sr2e", "test"));
  await gmCall("missileDone", { holderUuid, launchId, messageId: msg?.id ?? "" });
  const combat = game.combats.get(l.combatId);
  if (combat?.getFlag("sr2e", "roundTransition")) gmCall("roundResume", { combatId: combat.id }).catch(() => {});
}

/** The continuous-lock flag a launch carries: the lock's own record (its generations), for the Phase 0 re-check. */
export const lockSnapshot = (vehicle, target) => vehicle?.getFlag("sr2e", "locks")?.[followId(target.uuid)] ?? null;
