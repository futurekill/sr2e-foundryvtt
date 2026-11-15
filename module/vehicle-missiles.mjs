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
import { gmOp, gmCall, followId, controllerOf } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TERMINAL = new Set(["resolved", "lost", "cancelled"]);
/** The test card of a launch's ONE roll attempt (flags.sr2e.missileAttempt), if it was posted. */
const attemptCard = (l) => l?.attempt ? game.messages.find(m => m.getFlag("sr2e", "missileAttempt") === l.attempt) ?? null : null;
/** The damage card that depends on a missile's test (blast launcher or ranged damage), if any. */
const DAMAGE_KEYS = ["blastLaunch", "rangedDamage", "spreadLaunch"];
const damageCard = (testId) => game.messages.find(m => DAMAGE_KEYS.some(k => m.getFlag("sr2e", k)?.testMessageId === testId)) ?? null;
export const launchesOf = (holder) => holder?.getFlag("sr2e", "launches") ?? {};
const hq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);
/** This client's runner id (r2 #4) and how long a silent runner's claim on an attempt holds. */
let RUNNER = null;
const runnerId = () => (RUNNER ??= foundry.utils.randomID(16));
const RUNNER_STALE_MS = 60_000;

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
    // Authorize the REQUESTING user (code review 4b r1 #1): the gunner is theirs, the weapon is reachable (theirs, their
    // vehicle's, or the vehicle they control), the holder is the weapon's vehicle or the firing vehicle the gunner
    // controls, and a direct launch has that vehicle's VALID lock on the target now.
    if (!user.isGM) {
      const own = (d) => !!d?.testUserPermission?.(user, "OWNER");
      const wp = weapon.parent;
      if (!own(gunner)) throw new Error("not allowed");
      if (!(own(weapon) || own(wp) || (wp?.type === "vehicle" && own(controllerOf(wp))))) throw new Error("not your weapon");
      if (!(holder === wp || (holder.type === "vehicle" && (own(holder) || controllerOf(holder) === gunner)))) throw new Error("not your vehicle");
    }
    // The sensor source is the firing platform (r2 #5): the holder vehicle, or the vehicle the gunner controls — and its
    // lock is snapshotted HERE, never taken from the request.
    a = { ...a, sourceVehicleUuid: a.sourceVehicleUuid || holder.uuid };
    const src = fromUuidSync(a.sourceVehicleUuid);
    if (!user.isGM && !(src === holder || (src?.type === "vehicle" && controllerOf(src) === gunner))) throw new Error("not your sensors");
    if (a.mode !== "indirect") {
      const S = await import("./vehicle-sensors.mjs");
      const tgt = fromUuidSync(a.targetUuid);
      if (!src || !tgt || !S.lockOn(src, tgt)) throw new Error("no valid sensor lock on the target (Rigger 2 p.59)");
      a.lock = lockSnapshot(src, tgt);
    } else a.lock = null;
    await enqueueAttack(`round:${combat.id}`, async () => {
      if (combat.round !== a.round || combat.getFlag("sr2e", "roundTransition")) throw new Error("this Combat Turn is ending: launch next Turn");
      if (combat.getFlag("sr2e", "launchAdmit")?.[a.round]?.[a.launchId]) return;
      const args = { ...a, by: user.id };
      await combat.update({ [`flags.sr2e.launchAdmit.${a.round}.${a.launchId}`]: { holderUuid: holder.uuid, weaponUuid: weapon.uuid, state: "reserved", args } });
    });
    return finishLaunch(combat, a, user);
  });

  // Phase 0 (p.59): arm this launch's Missile Attack Test — once (launched → rolling), re-checking a continuous lock.
  gmOp("missileArm", async ({ holderUuid, launchId, runner }, user) => {
    const holder = fromUuidSync(holderUuid);
    return hq(holderUuid, async () => {
      const l = launchesOf(holder)[launchId];
      if (!l) throw new Error("no such launch");
      const gunner = fromUuidSync(l.gunnerUuid);
      if (!user.isGM && !gunner?.testUserPermission(user, "OWNER")) throw new Error("the gunner or the GM rolls this");
      const base = `flags.sr2e.launches.${launchId}`;
      if (l.state === "rolling") {
        // ONE execution at a time for the attempt (r2 #4): the runner holding the claim retries freely; another client
        // (same user or not) takes over only once the claim is stale — the client that held it stopped.
        // The runner's own retry renews its claim (r3), so a slow retry is never taken over mid-post.
        if (l.runner?.id === runner) { await holder.update({ [`${base}.runner.at`]: Date.now() }); return launchesOf(holder)[launchId]; }
        if (l.runner && Date.now() - (l.runner.at ?? 0) < RUNNER_STALE_MS) throw new Error("this Missile Attack Test is being rolled on another client");
        const upd = { [`${base}.runner`]: { id: runner, user: user.id, at: Date.now() }, [`${base}.armedBy`]: user.id };
        await holder.update(upd);
        return launchesOf(holder)[launchId];
      }
      if (l.state !== "launched") throw new Error(`this missile is ${l.state}`);
      const S = await import("./vehicle-sensors.mjs");
      const source = fromUuidSync(l.sourceVehicleUuid), target = fromUuidSync(l.targetUuid);
      let spotter = null;
      if (l.mode === "indirect") {
        const I = await import("./vehicle-indirect.mjs");
        const r = await I.indirectAtPhase0(l);
        if (r.ok) spotter = { successes: r.successes };
      }
      // Continuous contact (r1 #5): the ORIGINAL lock must still stand — a lock lost and re-acquired is a new lock.
      const lost = l.mode === "continuous" ? !(source && target && S.lockOn(source, target)?.id && S.lockOn(source, target).id === l.lock?.id)
        : l.mode === "indirect" ? !spotter : false;
      if (lost) {
        await holder.update({ [`flags.sr2e.launches.${launchId}.state`]: "lost" });
        // p.59: a lost continuous lock — the missile won't strike (the GM may resolve an area-effect attack); p.60: a lost
        // spotting after launch — the area-effect branch with the radar-designator TN, the spotting successes not used.
        await card(holder, `<strong>${esc(l.payload.ammoName)}: ${l.mode === "indirect" ? "the spotter lost the target" : "lock lost"}</strong> —
          the missile won't strike ${esc(target?.name)} directly (Rigger 2 p.${l.mode === "indirect" ? 60 : 59}).
          ${l.mode === "indirect" ? "It scatters as an area-effect attack (p.60–61)." : "The GM may resolve it as an area-effect attack (p.60)."}
          <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-area-effect">💥 Area-effect attack</button></div>`,
          { sr2e: { areaEffect: { gunnerUuid: l.gunnerUuid, name: l.payload.ammoName, lostAfterSpotting: l.mode === "indirect",
            distance: S.distanceBetween(fromUuidSync(l.guidance?.spotterUuid) ?? source ?? holder, target) ?? null } } });
        return { ...l, state: "lost" };
      }
      // The GM's prepared list (added/struck on the card) stands; otherwise the exposures are found and rolled now.
      const exposures = l.exposures ?? await S.missileExposures(source ?? holder, target, l.payload.guided?.sensor ?? 0);
      const upd = { state: "rolling", armedBy: user.id, attempt: foundry.utils.randomID(16), runner: { id: runner, user: user.id, at: Date.now() },
        exposures, ...(spotter ? { spotterSuccesses: spotter.successes } : {}) };
      await holder.update(Object.fromEntries(Object.entries(upd).map(([k, v]) => [`flags.sr2e.launches.${launchId}.${k}`, v])));
      return { ...l, ...upd };
    });
  });

  // The GM's exposure list (4b.4: "the GM may add or strike an exposure", recorded): found and rolled once, then edited.
  gmOp("missileExposures", async ({ holderUuid, launchId, strike = [], add = null }, user) => {
    if (!user.isGM) throw new Error("GM only");
    const holder = fromUuidSync(holderUuid);
    return hq(holderUuid, async () => {
      const l = launchesOf(holder)[launchId];
      if (l?.state !== "launched") throw new Error("only before the Missile Attack Test");
      const S = await import("./vehicle-sensors.mjs");
      let list = l.exposures ?? await S.missileExposures(fromUuidSync(l.sourceVehicleUuid) ?? holder, fromUuidSync(l.targetUuid), l.payload.guided?.sensor ?? 0);
      list = list.filter(e => !strike.includes(e.key));
      if (add) list.push({ key: `gm:${foundry.utils.randomID(8)}`, jammer: String(add.jammer ?? "GM"), effect: Math.max(0, Number(add.effect) || 0), gm: true });
      await holder.update({ [`flags.sr2e.launches.${launchId}.exposures`]: list });
      return list;
    });
  });

  // The attempt's test card is the record (r1 #2–#3): the launch is `struck` (its damage still to resolve); with no card
  // for the attempt (the attack was refused) it goes back to `launched` for another try.
  gmOp("missileDone", async ({ holderUuid, launchId }, user) => {
    const holder = fromUuidSync(holderUuid);
    return hq(holderUuid, async () => {
      const l = launchesOf(holder)[launchId];
      if (l?.state !== "rolling") return l;
      if (!user.isGM && l.armedBy !== user.id) throw new Error("not the armed roller");
      const msg = attemptCard(l);
      const base = `flags.sr2e.launches.${launchId}`;
      if (!msg) await holder.update({ [`${base}.state`]: "launched", [`${base}.-=armedBy`]: null, [`${base}.-=attempt`]: null, [`${base}.-=runner`]: null });
      // Every missile attack posts a damage card (blast, spread or ranged — even a miss); without it the attack was cut
      // short and stays `rolling` for its runner to finish (r2 #3).
      else if (damageCard(msg.id)) await holder.update({ [`${base}.state`]: "struck", [`${base}.messageId`]: msg.id });
      else return false;
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

  // A struck missile's damage card resolving may let the Turn end: the GM resumes any round change that waits.
  const resumeWaiting = (msg) => {
    if (!game.users.activeGM?.isSelf) return;
    const f = msg.flags?.sr2e ?? {};
    if (!(f.resolves || f.resolvesRow || f.resolvedRows || DAMAGE_KEYS.some(k => f[k]))) return;
    for (const c of game.combats.contents) if (c.getFlag("sr2e", "roundTransition")) c.resumeRound?.();
  };
  Hooks.on("createChatMessage", resumeWaiting);
  Hooks.on("updateChatMessage", resumeWaiting);

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const m = message.getFlag("sr2e", "missilePhase0");
    if (!m) return;
    html.querySelectorAll?.(".sr2e-missile-roll").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); rollPhase0(m).catch(err => ui.notifications.warn(`SR2E | ${err.message}`)); }));
    html.querySelectorAll?.(".sr2e-missile-ecm").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); editExposures(m).catch(err => ui.notifications.warn(`SR2E | ${err.message}`)); }));
    html.querySelectorAll?.(".sr2e-missile-cancel").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); gmCall("missileCancel", m).catch(err => ui.notifications.warn(`SR2E | ${err.message}`)); }));
  });
}

/** Spend (atomic, in the ammunition queue) → record → admission launched; a refusal releases the admission. */
async function finishLaunch(combat, a, user) {
  const holder = fromUuidSync(a.holderUuid);
  let receipt;
  try {
    // An indirect launch commits the spotting it cites (p.60) before the missile leaves.
    if (a.mode === "indirect") await gmCall("guidanceCommit", { spotterUuid: a.guidance?.spotterUuid, guidanceId: a.guidance?.id, launchId: a.launchId, targetUuid: a.targetUuid });
    receipt = await gmCall("ammo", { action: "launch", weaponUuid: a.weaponUuid, eventId: a.launchId });
  } catch (err) {
    await gmCall("ammo", { action: "cancel", weaponUuid: a.weaponUuid, eventId: a.launchId }).catch(() => {});
    // A refused indirect launch never existed: unlink it from the spotting (r1 #4).
    if (a.mode === "indirect") await (await import("./vehicle-indirect.mjs")).guidanceUnlink(a.guidance?.spotterUuid, a.guidance?.id, a.launchId).catch(() => {});
    await admit(combat, a.round, a.launchId, "released");
    throw err;
  }
  await recordLaunch(holder, { ...a, by: user.id }, receipt.payload, combat);
  await admit(combat, a.round, a.launchId, "launched");
  const target = fromUuidSync(a.targetUuid);
  await card(holder, `<strong>🚀 ${esc(receipt.payload.ammoName)} launched at ${esc(target?.name)}</strong>
    (${a.mode === "fireAndForget" ? "fire-and-forget" : a.mode === "indirect" ? "indirect fire: the spotter keeps the target designated, +2 to their other tests"
      : "continuous lock: no other targets for the gunner, +2 to this vehicle's Driving Tests"}).
    It strikes at the end of the Combat Turn (Phase 0, Rigger 2 p.59).`);
  return true;
}

/** Write the launch record once (idempotent; the closing stage may finish a launch whose client stopped). */
function recordLaunch(holder, a, payload, combat) {
  return hq(holder.uuid, async () => {
    if (launchesOf(holder)[a.launchId]) return;
    await holder.update({ [`flags.sr2e.launches.${a.launchId}`]: { id: a.launchId, shooterUuid: holder.uuid, gunnerUuid: a.gunnerUuid,
      sourceVehicleUuid: a.sourceVehicleUuid ?? holder.uuid, targetUuid: a.targetUuid, targetTokenUuid: a.targetTokenUuid ?? "",
      mode: ["fireAndForget", "indirect"].includes(a.mode) ? a.mode : "continuous", lock: a.lock ?? null, payload, r2: a.r2 ?? null,
      guidance: a.guidance ?? null,
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
    let l = launchesOf(holder)[id];
    if (l?.state === "struck") {
      // Phase 0 damage resolves before the Turn ends (4b.4): a hit's damage card must be resolved; a miss has none.
      if (await damageSettled(holder, l)) {
        await hq(holder.uuid, () => holder.update({ [`flags.sr2e.launches.${id}.state`]: "resolved" }));
        l = launchesOf(holder)[id];
      }
    }
    if (!l || TERMINAL.has(l.state)) continue;
    waiting.push(id);
    const key = `${holder.uuid}:${id}`;
    if (!game.messages.some(m => m.getFlag("sr2e", "missilePhase0")?.key === key)) {
      const target = fromUuidSync(l.targetUuid);
      await card(holder, `<strong>Phase 0: ${esc(l.payload.ammoName)} strikes ${esc(target?.name)}</strong> (Rigger 2 p.59)<br>
        The gunner rolls the Missile Attack Test: Gunnery + Intelligence ${l.payload.guided?.intelligence ?? 0}${l.mode === "continuous" ? " + ½ Sensor (continuous lock)" : ""}.
        The Combat Turn ends when every missile has struck.
        <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-missile-roll">🎯 Missile Attack Test</button>
        <button type="button" class="sr2e-resist-btn sr2e-missile-ecm" title="GM: the ECM fields crossed in flight — add or strike (p.59)">📡</button>
        <button type="button" class="sr2e-resist-btn sr2e-missile-cancel" title="GM: cancel this launch (the missile is spent)">✖</button></div>`,
        { sr2e: { missilePhase0: { key, holderUuid: holder.uuid, launchId: id } } });
    }
  }
  if (!waiting.length) await (await import("./vehicle-indirect.mjs")).guidanceCleanup(combat, r);
  return { done: !waiting.length, waiting };
}

/** The Phase 0 roll (the gunner's client or the GM's): arm, then the ordinary attack path on the payload. */
const ROLLING = new Set();
export async function rollPhase0({ holderUuid, launchId }, { pool: given = null } = {}) {
  if (ROLLING.has(launchId)) return;   // a double click (r1 #2)
  ROLLING.add(launchId);
  try { return await rollPhase0Once({ holderUuid, launchId }, { given }); } finally { ROLLING.delete(launchId); }
}
async function rollPhase0Once({ holderUuid, launchId }, { given }) {
  const pre = launchesOf(fromUuidSync(holderUuid))[launchId];
  if (!pre) throw new Error("no such launch");
  const gunner = fromUuidSync(pre.gunnerUuid), p = pre.payload;
  // The Combat Pool is chosen BEFORE the claim, so the claimed window is only the roll (r2 #4). Targeted indirect missile
  // attacks take no Combat Pool (p.60); an attempt that already rolled spends nothing more.
  const pool = pre.mode === "indirect" || attemptCard(pre) ? 0 : given != null ? given : await foundry.applications.api.DialogV2.prompt({ window: { title: `Missile Attack Test — ${p.ammoName}` },
    content: `<p>Combat Pool dice (Rigger 2 p.59): <input type="number" name="pool" value="0" min="0" max="${gunner.system.dicePools?.combat?.value ?? 0}" style="width:60px"></p>`,
    ok: { label: "Roll", callback: (_e, b) => Number(b.form.elements.pool.value) || 0 } }).catch(() => null);
  if (pool === null) return;
  const l = await gmCall("missileArm", { holderUuid, launchId, runner: runnerId() });
  const resume = () => { const c = game.combats.get(l.combatId); if (c?.getFlag("sr2e", "roundTransition")) gmCall("roundResume", { combatId: c.id }).catch(() => {}); };
  if (l.state !== "rolling") return resume();   // lost at Phase 0: terminal — the Turn may end
  const posted = attemptCard(l);
  // This attempt already posted its test (a reload, a retry): never roll again (r1 #2) — finish its damage card if the
  // client that rolled stopped before posting it (r2 #3), then record it.
  if (posted && damageCard(posted.id)) { await gmCall("missileDone", { holderUuid, launchId }); return resume(); }
  await missileWeapon(gunner, l)._rollWeaponAttack({ ...attackOptions(l, launchId, pool), ...(posted ? { resumeTest: posted.id } : {}) });
  await gmCall("missileDone", { holderUuid, launchId });
  resume();
}

/** The ephemeral weapon a launch's payload rolls as (never the launcher). */
function missileWeapon(gunner, l) {
  const p = l.payload;
  const Item = foundry.utils.getDocumentClass("Item");
  return new Item({ name: p.ammoName, type: "weapon", system: { weaponType: "heavy", skill: "gunnery", damageCode: p.damageCode,
    damageType: p.damageType, blastType: p.blastType, ammo: { max: 0, current: 0, type: p.ammoType, loadedName: p.ammoName,
      damageMod: p.damageMod, armorMod: p.armorMod, armorCalc: p.armorCalc, damageType: p.ammoDamageType, material: p.material, guided: p.guided } } },
  { parent: gunner });
}

/** The attack options of a launch's Missile Attack Test. */
function attackOptions(l, launchId, pool) {
  const gunner = fromUuidSync(l.gunnerUuid), p = l.payload;
  // A blast warhead (every core missile) resolves through the core blast path, aimed at the target's token (p.96).
  const tokDoc = l.targetTokenUuid ? fromUuidSync(l.targetTokenUuid) : null;
  const center = tokDoc ? { x: tokDoc.x + (tokDoc.width * (tokDoc.parent?.grid?.size ?? 100)) / 2, y: tokDoc.y + (tokDoc.height * (tokDoc.parent?.grid?.size ?? 100)) / 2 } : null;
  const aim = p.blastType && tokDoc ? { mode: "token", tokenUuid: tokDoc.uuid, sceneId: tokDoc.parent?.id ?? null, ...center } : null;
  return { gunner, gunneryMode: "missile", launch: l, firingVehicleUuid: l.sourceVehicleUuid,
    poolDice: pool ? { combat: pool } : undefined, firingMode: "ss", range: "short", rangeExplicit: true,   // the TN is the Signature's, not a bracket
    testFlags: { sr2e: { missileAttempt: l.attempt } },
    _engage: { key: `missile:${launchId}`, token: tokDoc ? { uuid: tokDoc.uuid, sceneId: tokDoc.parent?.id ?? null, ...center } : null, aim } };
}

/** A resist row (`<cardId>#<i>`) is done when its card marks it or an outcome cites it (sr2e.mjs resistRowResolved). */
const rowDone = (card, i) => !!card.flags?.sr2e?.resolvedRows?.[i] || game.messages.some(m => m.flags?.sr2e?.resolvesRow === `${card.id}#${i}`);

/**
 * Has a struck missile's damage fully resolved (r2 #1–#2)? A ranged hit: its card resisted. A miss (no successes, no
 * blast): finalized here — the test closed to Karma — since its card has nothing to resolve. A blast or spread: launched,
 * and every target row on its outcome card resisted. GM, in the closing stage.
 */
async function damageSettled(holder, l) {
  const dep = damageCard(l.messageId);
  if (!dep) return false;
  const { isCardResolved } = await import("./astral-combat.mjs");
  const key = DAMAGE_KEYS.find(k => dep.getFlag("sr2e", k));
  if (key === "rangedDamage") {
    if (isCardResolved(dep, key)) return true;
    const t = game.messages.get(l.messageId)?.flags?.sr2e?.test;
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    if (t && testTotalSuccesses(t) > 0) return false;
    await card(holder, `<strong>${esc(l.payload.ammoName)} missed</strong> — no successes (Rigger 2 p.59); the test is closed.`,
      { sr2e: { resolves: dep.id, closesTests: [l.messageId] } });
    return true;
  }
  const out = game.messages.find(m => m.flags?.sr2e?.resolves === dep.id);
  if (!out) return false;
  const rows = (String(out.content).match(/data-power=/g) ?? []).length;
  return Array.from({ length: rows }, (_, i) => i).every(i => rowDone(out, i));
}

/** GM: review the ECM fields a missile crossed (found and rolled once), strike any, add one by hand. */
async function editExposures(m) {
  if (!game.user.isGM) throw new Error("GM only");
  const list = await gmCall("missileExposures", m);
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: "ECM fields crossed in flight (Rigger 2 p.59)" },
    content: `${list.length ? list.map(e => `<div><label><input type="checkbox" name="strike.${e.key}"> strike</label> ${esc(e.jammer)}: +${e.effect ?? 0}
      ${e.needsGm ? "<em>(no missile Sensor Rating: your call)</em>" : e.gm ? "<em>(GM)</em>" : `<small>(jammer ${e.jam ?? "?"} vs missile ${e.opp ?? "?"})</small>`}</div>`).join("") : "<p>No ECM field on the flight path.</p>"}
      <hr><div>Add: <input name="addJammer" placeholder="jammer" style="width:140px"> +<input type="number" name="addEffect" value="0" style="width:50px"></div>`,
    ok: { label: "Save", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
  if (!res) return;
  const strike = Object.entries(res).filter(([k, v]) => k.startsWith("strike.") && v).map(([k]) => k.slice(7));
  const add = Number(res.addEffect) > 0 || res.addJammer ? { jammer: res.addJammer || "GM", effect: Number(res.addEffect) || 0 } : null;
  if (strike.length || add) await gmCall("missileExposures", { ...m, strike, add });
}

/** The continuous-lock flag a launch carries: the lock's own record (its generations), for the Phase 0 re-check. */
export const lockSnapshot = (vehicle, target) => vehicle?.getFlag("sr2e", "locks")?.[followId(target.uuid)] ?? null;
