/**
 * Rigger 2 vehicle combat, the chase (R2 p.41–49; docs/PLAN-vehicles-phase2.md Part 3, 3.0 + 3a). A chase is
 * `flags.sr2e.chase` on a Foundry Combat, written ONLY by the active GM through GM ops:
 *   - `chase:<combatId>` queues every chase write; `chase-membership` (world-wide) every membership change and every
 *     vehicle damage commit's lookup. Lock order: chase-membership → chase:<combatId> → vdmg:<uuid>. External effects
 *     (Stress, damage) are never applied while a chase queue is held.
 *   - Every roll is a ROLLED STEP: reserve (chaseBegin / chaseDPStart, state "rolling") → spend (a receipt keyed by
 *     the step id) → arm ("publishing") → roll, the card carrying the id → record (chaseResolve, from the card) →
 *     apply ("resolving" → "done"). Cancel is acked by the pool writer before the tombstone ("cancelled").
 * Read-only lookups are in chase-state.mjs.
 */
import { gmCall, gmOp, isPoolClient, adjustStress, r2SpeedOf, spendPosition, setChaseRoute } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { defenseQueue } from "./spell-defense.mjs";
import { chaseOf, findEntry, findAboard, activeChases, actionOf, poolsLocked, chaseUnion } from "./chase-state.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { VEHICLE_POINTS, TERRAIN_POINTS, r2ClassFor, speedPoints, maneuverScore, accelerateTN, positioningTN, hidingTN,
         relocatingTN, applySpeedChange, ramEntitled, stopAtPoint, closeDistance, NPC_RELOCATE_TURNS,
         fastestMember, passengerMayAttack, ramTN, ramDamage, pedestrianImpact, r2Impact, movingCastTN,
         occupantSpellSight } from "./rules/vehicle-combat-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const cq = (combatId, fn) => enqueueAttack(`chase:${combatId}`, fn);
const mq = (fn) => enqueueAttack("chase-membership", fn);
const TERMINAL = new Set(["done", "cancelled", "stale"]);
const LIVE = new Set(["rolling", "publishing", "resolving", "cancelRequested"]);
export const ACTION_KINDS = ["accelerate", "brake", "position", "hide", "relocate", "ram"];
const KIND_LABEL = { dp: "Driver Points", accelerate: "Accelerate", brake: "Brake", position: "Positioning",
                     hide: "Hiding", relocate: "Relocating", ram: "Ramming" };

/** Does this combat run a chase (Rigger 2 only)? */
export const hasChase = (combat) => isRigger2() && !!chaseOf(combat)?.entries;

function combatOf(combatId) {
  const c = game.combats.get(combatId);
  if (!c) throw new Error("no such combat");
  return c;
}
/** One Combat update of chase paths (relative to flags.sr2e.chase). */
function write(combat, patch) {
  const upd = {};
  for (const [k, v] of Object.entries(patch)) upd[`flags.sr2e.chase.${k}`] = v;
  return combat.update(upd);
}
const owns = (user, uuid) => {
  if (user?.isGM) return true;
  const a = uuid ? fromUuidSync(uuid) : null;
  return !!a?.testUserPermission?.(user, "OWNER");
};
/** The active player who owns this actor (its pool writer), else null (the GM writes). */
const playerWriter = (actor) => game.users.find(u => u.active && !u.isGM && actor?.testUserPermission(u, "OWNER")) ?? null;

/* ── Vehicle statistics, stamps and the Maneuver Score ───────────────────────────────────────────────────────── */

/** The live statistics a chase test reads (stamped at begin, B3 #4). */
export function vehicleStats(doc) {
  const s = doc?.system ?? {};
  return { handling: s.effectiveHandling ?? s.handling ?? 0, acceleration: s.effective?.acceleration ?? s.acceleration ?? 0,
           speedRating: doc ? r2SpeedOf(doc).rating : 0, autonav: s.effective?.autonav ?? s.autonav ?? 0, body: s.body ?? 0,
           armor: s.effectiveArmor ?? s.armor ?? 0, signature: s.effective?.signature ?? s.signature ?? 0, damageLevel: s.damageLevel ?? "Undamaged",
           damageTn: s.damageTnMod ?? 0 };
}
const stampOf = (entry) => ({ driver: entry.driver ?? "", ...vehicleStats(fromUuidSync(entry.uuid)) });
const sameStamp = (a, b) => Object.keys(a ?? {}).every(k => a[k] === b?.[k]);

/** The Vehicle Points class of a vehicle document (null = no class: a drone, Part 5). */
export function classOf(doc) {
  const s = doc?.system ?? {};
  return r2ClassFor({ r2Class: s.r2Class, vehicleType: s.vehicleType, category: s.design?.category, traits: s.design?.traits ?? [] });
}

/** Is the entry's driver jacked into it through a VCR (the rigger, p.44/p.49)? Derived at action time. */
function riggedOf(entry) {
  const d = entry?.driver ? fromUuidSync(entry.driver) : null;
  return !!(d?.system?.rigging && (d.system.vehicleControlRig ?? 0) > 0);
}
const vcrOf = (entry) => (riggedOf(entry) ? fromUuidSync(entry.driver).system.vehicleControlRig : 0);
const isNpc = (actor) => actor?.type === "npc";

/** An entry's group: [eid…] and the representative (the fastest member, p.49). */
function groupOf(ch, eid) {
  const g = ch.entries[eid]?.group;
  if (!g) return { members: [eid], rep: eid };
  const members = Object.entries(ch.entries).filter(([, e]) => e?.group === g).map(([id]) => id);
  const rep = fastestMember(members.map(id => ({ id, speedRating: vehicleStats(fromUuidSync(ch.entries[id].uuid)).speedRating }))).id;
  return { members, rep };
}

/** The opening turn record's fixed parts (p.42): VP, TP, SP, Escape Bonus, and whether it opens above its rating. */
function openRecord(ch, eid, r) {
  const e = ch.entries[eid];
  const prev = ch.turns?.[r]?.[eid] ?? {};
  if (e.kind === "pedestrian") {
    const q = fromUuidSync(e.uuid)?.system?.quickness?.value ?? 0;
    return { ...prev, pedestrian: true, ms: q };
  }
  const doc = fromUuidSync(e.uuid);
  const cls = classOf(doc);
  const escape = Math.max(0, ...Object.values(ch.pairs ?? {})
    .filter(p => p?.quarry === eid && p.contact && p.contact !== true).map(p => p.contact.successes ?? 0));
  return { ...prev, vp: cls ? VEHICLE_POINTS[cls] : 0, tp: TERRAIN_POINTS[e.terrain] ?? 0, sp: speedPoints(e.speed),
           dp: prev.dp ?? null, dpSlot: prev.dpSlot ?? null, positionBonus: prev.positionBonus ?? 0, escapeBonus: escape,
           ms: null, over: !!prev.over || (e.speed ?? 0) > vehicleStats(doc).speedRating };
}

/** The Maneuver Score with Driver Points recorded: VP + TP + SP + DP (+ Positioning and Escape Bonuses, p.47–48). */
const msWith = (t, dp) => maneuverScore({ vp: t.vp, tp: t.tp, sp: t.sp, dp: dp + (t.positionBonus ?? 0) + (t.escapeBonus ?? 0) });

/* ── Turn open / close (bound to SR2ECombat's staged round change) ───────────────────────────────────────────── */

/** Speeding Stress (R3-2): 1 per Combat Turn above the Speed Rating, ONE receipt per turn whichever path finds it. */
async function chargeOver(combat, r, eid) {
  const e = chaseOf(combat)?.entries?.[eid];
  const v = e?.kind === "vehicle" ? fromUuidSync(e.uuid) : null;
  if (v) await adjustStress(v, 1, { eventId: `chase-over-${combat.id}-${r}-${eid}`, reason: "speeding (Rigger 2 p.44)" });
}

/** Stage "opening" (3.0 step 6): every joined entry's turn record for round r, then Stress for those above rating. */
export async function chaseOpenStage(combat, r) {
  if (!hasChase(combat)) return;
  const overs = await cq(combat.id, async () => {
    const ch = chaseOf(combat);
    if (ch.opened?.[r]) return [];
    const patch = {}, overs = [];
    for (const [eid, e] of Object.entries(ch.entries)) {
      if (!e || (e.joinedRound ?? 1) > r) continue;
      const rec = openRecord(ch, eid, r);
      patch[`turns.${r}.${eid}`] = rec;
      if (rec.over) overs.push(eid);
    }
    patch[`opened.${r}`] = true;
    // Keep this turn and the next (Positioning bonuses); older turns and their settled steps go.
    for (const k of Object.keys(ch.turns ?? {})) if (Number(k) < r - 1) patch[`turns.-=${k}`] = null;
    for (const [aid, a] of Object.entries(ch.actions ?? {})) if (TERMINAL.has(a.state) && a.round < r - 1) patch[`actions.-=${aid}`] = null;
    await write(combat, patch);
    return overs;
  });
  for (const eid of overs) await chargeOver(combat, r, eid);
}

/**
 * Stage "closing" (3.0 step 1): finish every step of round r that can finish (cards found → recorded; effects
 * applied; cancels re-acked), then — only when none is left — close: every pair's distance (p.44 step 7), NPC
 * relocation counters (p.49), `closed.<r>`. Returns {done} or {done:false, waiting:[…]}.
 */
export async function chaseCloseStage(combat, r) {
  if (!hasChase(combat)) return { done: true };
  if (chaseOf(combat).closed?.[r]) return { done: true };
  await gmPass(combat, r);
  for (const [eid, t] of Object.entries(chaseOf(combat).turns?.[r] ?? {})) if (t?.over) await chargeOver(combat, r, eid);
  return cq(combat.id, async () => {
    const ch = chaseOf(combat);
    if (ch.closed?.[r]) return { done: true };
    const waiting = Object.entries(ch.actions ?? {}).filter(([, a]) => a.round === r && !TERMINAL.has(a.state)).map(([aid]) => aid);
    if (waiting.length || Object.keys(ch.overChecks ?? {}).length) return { done: false, waiting };
    const patch = { [`closed.${r}`]: true };
    for (const [pid, p] of Object.entries(ch.pairs ?? {})) {
      const P = ch.entries[p.pursuer], Q = ch.entries[p.quarry];
      if (!P || !Q) continue;
      patch[`pairs.${pid}.distance`] = closeDistance(p.distance, P.speed, Q.speed);
      patch[`pairs.${pid}.rev`] = (p.rev ?? 0) + 1;
      if (p.contact && p.contact !== true && isNpc(fromUuidSync(P.driver))) {
        const turns = (p.contact.npcTurns ?? 0) + 1;
        // An NPC pursuer gives up after 5 Combat Turns: the pair ends, and with it the Escape Bonus (p.48–49).
        if (turns >= NPC_RELOCATE_TURNS) { patch[`pairs.-=${pid}`] = null; delete patch[`pairs.${pid}.distance`]; delete patch[`pairs.${pid}.rev`]; }
        else patch[`pairs.${pid}.contact.npcTurns`] = turns;
      }
    }
    await write(combat, patch);
    return { done: true };
  });
}

/* ── Rolled steps: reserve → spend → arm → record → apply ────────────────────────────────────────────────────── */

/** Refuse a step for round r unless r is live, opened, not closed, and no round change from it is underway. */
function liveRound(combat, ch, r) {
  if (combat.round !== r) throw new Error("that Combat Turn is over");
  if (!ch.opened?.[r]) throw new Error("this Combat Turn hasn't opened yet");
  if (ch.closed?.[r] || combat.getFlag("sr2e", "roundTransition")) throw new Error("this Combat Turn is ending");
}
const involves = (a, eids) => eids.includes(a.eid) || eids.includes(a.targetEid);

/**
 * Reserve the Driver Points Open Test (3a.2 step 1): one live slot per vehicle (or group) per turn.
 * @returns {{aid, inputs}}
 */
async function dpStart({ combatId, round, eid, control = 0 }, user) {
  const combat = combatOf(combatId);
  return cq(combatId, async () => {
    const ch = chaseOf(combat);
    liveRound(combat, ch, round);
    const e = ch.entries[eid];
    if (e?.kind !== "vehicle") throw new Error("not a vehicle in this chase");
    if (!owns(user, e.driver)) throw new Error(`${user?.name} doesn't drive this vehicle`);
    const { rep } = groupOf(ch, eid);
    if (rep !== eid) throw new Error("the group rolls once, with its fastest vehicle");
    const t = ch.turns?.[round]?.[eid];
    if (!t || (e.joinedRound ?? 1) > round) throw new Error("this vehicle joins at the next Combat Turn");
    if (t.dp != null) throw new Error("Driver Points are already recorded this turn");
    if (t.dpSlot && ch.actions?.[t.dpSlot]?.state !== "cancelled") throw new Error("Driver Points are being rolled");
    const driver = fromUuidSync(e.driver), vehicle = fromUuidSync(e.uuid);
    if (!driver || !vehicle) throw new Error("driver or vehicle missing");
    const sk = driver._vehicleSkill(vehicle, { mode: riggedOf(e) ? "rigged" : "manual" });
    const npc = isNpc(driver);
    const inputs = { skill: sk.dice, note: sk.note ?? "", pr: npc ? (driver.system.professionalRating ?? 0) : 0,
                     control: npc ? 0 : Math.max(0, Math.min(Math.floor(Number(control) || 0), sk.dice)) };
    const aid = foundry.utils.randomID(16);
    await write(combat, { [`actions.${aid}`]: { kind: "dp", eid, round, actor: e.driver, user: user.id, state: "rolling", inputs },
                          [`turns.${round}.${eid}.dpSlot`]: aid });
    return { aid, inputs };
  });
}

/** The highest Maneuver Score among `eids` this turn; throws naming anyone whose Driver Points aren't in yet. */
function highestMs(ch, r, eids) {
  let best = null;
  for (const id of eids) {
    const ms = ch.turns?.[r]?.[id]?.ms;
    if (ms == null) throw new Error(`waiting for ${fromUuidSync(ch.entries[id]?.uuid)?.name ?? "an opponent"}'s Driver Points`);
    if (best === null || ms > best) best = ms;
  }
  return best ?? 0;
}

/**
 * Reserve a vehicle action (3.0 action transaction step 1): checks the live round, the actor, that nothing involving
 * the entry or its target is in flight, and the revs the dialog saw; STORES the immutable test inputs and stamps.
 */
async function begin({ combatId, round, eid, kind, actorUuid = null, target = null, expectRevs = {}, stopDistance = null }, user) {
  if (!ACTION_KINDS.includes(kind)) throw new Error("unknown action");
  const combat = combatOf(combatId);
  return cq(combatId, async () => {
    const ch = chaseOf(combat);
    liveRound(combat, ch, round);
    const e = ch.entries[eid];
    if (e?.kind !== "vehicle") throw new Error("not a vehicle in this chase");
    const actor = kind === "relocate" ? actorUuid : e.driver;
    if (kind === "relocate" && !(e.driver === actor || (e.aboard ?? []).includes(actor))) throw new Error("the spotter must be aboard the pursuing vehicle");
    if (!owns(user, actor)) throw new Error(`${user?.name} may not act for that character`);
    const { members, rep } = groupOf(ch, eid);
    if (rep !== eid) throw new Error("the group acts once, with its fastest vehicle");
    const t = ch.turns?.[round]?.[eid];
    if (t?.ms == null) throw new Error("roll this vehicle's Driver Points first");
    // Pairs this action is about.
    const pairs = Object.entries(ch.pairs ?? {}).filter(([, p]) => p && (members.includes(p.pursuer) || members.includes(p.quarry)));
    let targetEid = null, opponents = [];
    if (kind === "hide") {
      opponents = [...new Set(pairs.filter(([, p]) => members.includes(p.quarry) && p.contact === true).map(([, p]) => p.pursuer))];
      if (!opponents.length) throw new Error("no pursuer is in contact");
    } else if (kind === "ram") {
      const pair = pairs.find(([, p]) => (p.pursuer === eid && p.quarry === target) || (p.quarry === eid && p.pursuer === target));
      if (!pair) throw new Error("pick a vehicle or pedestrian you're in a pursuit with");
      // A quarry that hid from this pursuer must be relocated first (p.48–49).
      if (pair[1].pursuer === eid && pair[1].contact !== true) throw new Error("you've lost contact with it: relocate it first (Rigger 2 p.49)");
      targetEid = target;
      opponents = [target];
      const ent = ch.turns?.[round]?.[eid]?.ram?.[target] ?? ch.turns?.[round - 1]?.[eid]?.ram?.[target];
      const seq = Number(combat.getFlag("sr2e", "phaseSeq")) || 0;
      const accel = vehicleStats(fromUuidSync(e.uuid)).acceleration;
      if (!(pair[1].distance < accel || (ent && seq > ent.seq)))
        throw new Error(`to ram, be closer than your Acceleration (${accel} m), or change speed by twice the distance first and ram on your next action (Rigger 2 p.45)`);
    } else if (kind === "relocate") {
      const pair = ch.pairs?.[target];
      if (!pair || !members.includes(pair.pursuer) || pair.contact === true) throw new Error("pick a vehicle that has hidden from you");
      targetEid = pair.quarry;
    } else {
      opponents = [...new Set(pairs.map(([, p]) => (members.includes(p.pursuer) ? p.quarry : p.pursuer)))];
    }
    const busy = Object.values(ch.actions ?? {}).find(a => a.round === round && LIVE.has(a.state) && a.state !== "cancelRequested"
      && involves(a, [...members, ...(targetEid ? [targetEid] : [])]));
    if (busy) throw new Error(`${KIND_LABEL[busy.kind]} is still being resolved`);
    for (const [k, rev] of Object.entries(expectRevs)) {
      const live = k.startsWith("p:") ? ch.pairs?.[k.slice(2)]?.rev : ch.entries?.[k]?.rev;
      if ((live ?? 0) !== rev) throw new Error("the chase changed — reopen the dialog");
    }
    const vehicle = fromUuidSync(e.uuid), stats = vehicleStats(vehicle);
    const actorDoc = fromUuidSync(actor);
    const g = members.length - 1;
    const over = (e.speed ?? 0) > stats.speedRating;
    const autonav = e.autonav ? stats.autonav : 0;
    const vcr = vcrOf(e);
    let tn, dice, note = "";
    if (kind === "relocate") {
      const hideT = ch.turns?.[round]?.[targetEid];
      if (hideT?.ms == null) throw new Error("waiting for the hiding vehicle's Driver Points");
      const hidden = fromUuidSync(ch.entries[targetEid].uuid);
      tn = relocatingTN({ signature: vehicleStats(hidden).signature, ms: t.ms, hideMs: hideT.ms, over, autonav,
                          hideSuccesses: ch.pairs[target].contact.successes ?? 0, hideTerrain: ch.entries[targetEid].terrain,
                          damageTn: stats.damageTn, groupExtra: g });
      dice = actorDoc?.system?.intelligence?.value ?? 0;
    } else {
      const sk = actorDoc._vehicleSkill(vehicle, { mode: vcr ? "rigged" : "manual" });
      const oppMs = opponents.length ? highestMs(ch, round, opponents) : t.ms;
      const fleeing = pairs.filter(([, p]) => members.includes(p.quarry)).length;
      const common = { handling: stats.handling, over, autonav, terrain: e.terrain, vcr, damageTn: stats.damageTn, groupExtra: g };
      tn = kind === "ram" ? ramTN({ ...common, ms: t.ms, oppMs: highestMs(ch, round, [targetEid]) })
        : kind === "position" ? positioningTN(common)
        : kind === "hide" ? hidingTN({ ...common, ms: t.ms, oppMs, extraOpponents: opponents.length - 1 })
        : accelerateTN({ ...common, ms: t.ms, oppMs, extraPursuers: Math.max(0, fleeing - 1) });
      // Defaulting and Vehicle Empathy (R2 p.14: −1, never a remote drone) join before the minimum of 2.
      const empathy = actorDoc.qualityValues?.()["vehicle-empathy"] && vehicle.system.vehicleType !== "drone" ? -1 : 0;
      const extra = [["Defaulting", sk.penalty ?? 0], ["Vehicle Empathy", empathy]].filter(([, v]) => v);
      tn = { ...tn, tn: tn.tn + extra.reduce((t, [, v]) => t + v, 0), parts: [...tn.parts, ...extra] };
      dice = sk.dice;
      note = sk.note ?? "";
    }
    tn = { ...tn, tn: Math.max(2, tn.tn) };
    if (isNpc(actorDoc)) dice += actorDoc.system.professionalRating ?? 0;
    const revs = Object.fromEntries([...members.map(m => [m, ch.entries[m].rev ?? 0]),
                                     ...pairs.map(([pid, p]) => [`p:${pid}`, p.rev ?? 0])]);
    const stamps = Object.fromEntries(members.map(m => [m, stampOf(ch.entries[m])]));
    if (targetEid) stamps[targetEid] = stampOf(ch.entries[targetEid]);
    const aid = foundry.utils.randomID(16);
    const inputs = { dice, tn: tn.tn, base: tn.base, parts: tn.parts, note, members, stopDistance: kind === "position" ? stopDistance : null,
                     controlCap: kind === "relocate" || isNpc(actorDoc) ? 0 : dice };
    await write(combat, { [`actions.${aid}`]: { kind, eid, round, actor, user: user.id, target, targetEid, state: "rolling",
                                                 inputs, revs, stamps } });
    return { aid, inputs };
  });
}

/** Arm a step (rolling → publishing): only then may it be rolled (B4 #4). */
async function arm({ combatId, aid }, user) {
  const combat = combatOf(combatId);
  return cq(combatId, async () => {
    const a = chaseOf(combat).actions?.[aid];
    if (!a) throw new Error("no such step");
    if (a.user !== user.id && !user.isGM) throw new Error("not your roll");
    if (a.state !== "rolling") throw new Error(`that roll is ${a.state}`);
    await write(combat, { [`actions.${aid}.state`]: "publishing" });
    return true;
  });
}

/** Close a Success Test card to Karma (idempotent). */
async function closeTest(message) {
  const st = message.flags?.sr2e?.test;
  if (!st || st.closed) return;
  const { renderSuccessTestCard } = await import("./documents/actor.mjs");
  const next = { ...st, closed: true };
  await message.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
}

/**
 * The roll a card carries: the Open Test total, or the Success Test's final successes. The Apply button closed the
 * test on the roller's client first; the GM's close pass closes any card still open (a roll left unapplied).
 */
async function readCard(message, a) {
  if (a.kind === "dp") return { value: Math.max(0, Number(message.rolls?.[0]?.total) || 0) };
  if (!message.flags?.sr2e?.test) throw new Error("that card has no test");
  await closeTest(message);
  return { successes: testTotalSuccesses(message.flags.sr2e.test) };
}

/**
 * Record a step from its card (3.0 step 3): refused unless "publishing" in the live round; "stale" if anything it
 * depended on changed; else ONE update writes the chase changes with "resolving"/"done" and the effects to apply.
 */
async function resolve({ combatId, aid, messageId }, user) {
  const combat = combatOf(combatId);
  const message = game.messages.get(messageId);
  if (message?.getFlag("sr2e", "chaseAction")?.aid !== aid) throw new Error("that card isn't this roll");
  const pre = chaseOf(combat)?.actions?.[aid];
  if (!pre) throw new Error("no such step");
  if (!user.isGM && pre.user !== user.id && !owns(user, pre.actor)) throw new Error("not your roll");
  const read = pre.state === "publishing" ? await readCard(message, pre) : null;
  const out = await cq(combatId, async () => {
    const ch = chaseOf(combat);
    const a = ch.actions?.[aid];
    if (a.state === "cancelled") return { refused: "cancelled — not counted" };
    if (a.state !== "publishing") return { state: a.state, result: a.result };
    if (combat.round !== a.round || ch.closed?.[a.round]) return { refused: "the Combat Turn is over" };
    const r = a.round, patch = { [`actions.${aid}.messageId`]: messageId };
    const stale = Object.entries(a.revs ?? {}).some(([k, rev]) => ((k.startsWith("p:") ? ch.pairs?.[k.slice(2)]?.rev : ch.entries?.[k]?.rev) ?? 0) !== rev)
      || Object.entries(a.stamps ?? {}).some(([eid, st]) => !ch.entries[eid] || !sameStamp(st, stampOf(ch.entries[eid])));
    if (stale) {
      await write(combat, { ...patch, [`actions.${aid}.state`]: "stale" });
      return { refused: "the chase changed before this was applied — not counted" };
    }
    const effects = [], result = { ...read };
    const members = a.inputs?.members ?? [a.eid];
    const bump = (eid) => { patch[`entries.${eid}.rev`] = (ch.entries[eid].rev ?? 0) + 1; };
    if (a.kind === "dp") {
      for (const m of groupOf(ch, a.eid).members) {
        const t = ch.turns?.[r]?.[m];
        if (!t) continue;
        // Driver Points = the Open Test + Positioning and Escape bonuses (p.47–48): also the passengers' limit (p.49).
        const lead = ch.turns[r][a.eid];
        patch[`turns.${r}.${m}.dp`] = { value: read.value, total: read.value + (lead.positionBonus ?? 0) + (lead.escapeBonus ?? 0), messageId };
        patch[`turns.${r}.${m}.ms`] = msWith(ch.turns[r][a.eid], read.value);   // the group shares its lead's score
      }
    } else if (a.kind === "accelerate" || a.kind === "brake") {
      result.speeds = {};
      for (const m of members) {
        const e = ch.entries[m], st = a.stamps[m];
        const { speed, change } = applySpeedChange({ speed: e.speed ?? 0, acceleration: st.acceleration, successes: read.successes,
                                                     speedRating: st.speedRating, brake: a.kind === "brake" });
        result.speeds[m] = speed;
        patch[`entries.${m}.speed`] = speed; bump(m);
        for (const [pid, p] of Object.entries(ch.pairs ?? {})) {
          const other = p.pursuer === m ? p.quarry : p.quarry === m ? p.pursuer : null;
          // Good for the driver's NEXT action (p.45, B2 #9): a later phase than this one; dropped once that action passes.
          if (other && ramEntitled(change, p.distance)) patch[`turns.${r}.${m}.ram.${other}`] = { pid, seq: Number(combat.getFlag("sr2e", "phaseSeq")) || 0 };
        }
        if (speed > st.speedRating && !ch.turns?.[r]?.[m]?.over) { patch[`turns.${r}.${m}.over`] = true; effects.push({ type: "over", eid: m }); }
      }
    } else if (a.kind === "position") {
      for (const m of members) patch[`turns.${r + 1}.${m}.positionBonus`] = (ch.turns?.[r + 1]?.[m]?.positionBonus ?? 0) + read.successes;
      if (a.inputs.stopDistance != null) {
        result.stop = stopAtPoint({ successes: read.successes, acceleration: a.stamps[a.eid].acceleration, distance: a.inputs.stopDistance });
        if (result.stop.reached) for (const m of members) { patch[`entries.${m}.speed`] = 0; bump(m); }
      }
    } else if (a.kind === "hide" && read.successes > 0) {
      for (const [pid, p] of Object.entries(ch.pairs ?? {})) {
        if (!members.includes(p.quarry) || p.contact !== true) continue;
        patch[`pairs.${pid}.contact`] = { hiddenBy: aid, successes: read.successes, round: r, npcTurns: 0 };
        patch[`pairs.${pid}.rev`] = (p.rev ?? 0) + 1;
      }
    } else if (a.kind === "ram") {
      // The entitlement is used whether the ram lands or not (B2 #9).
      patch[`turns.${r}.${a.eid}.ram.-=${a.targetEid}`] = null;
      if (ch.turns?.[r - 1]?.[a.eid]?.ram?.[a.targetEid]) patch[`turns.${r - 1}.${a.eid}.ram.-=${a.targetEid}`] = null;
      if (read.successes > 0) {
        const R = ch.entries[a.eid], T = ch.entries[a.targetEid];
        const crew = (x) => (x?.kind === "vehicle" ? [...new Set([x.driver, ...(x.aboard ?? [])].filter(Boolean))] : []);
        effects.push({ type: "ram", aid, successes: read.successes, rammer: a.eid, target: a.targetEid,
          snap: { rammerUuid: R.uuid, targetUuid: T.uuid, targetKind: T.kind, rammerSpeed: R.speed ?? 0, targetSpeed: T.kind === "vehicle" ? (T.speed ?? 0) : 0,
                  rammerBody: a.stamps[a.eid].body, occupants: { rammer: crew(R), target: crew(T) } } });
      }
    } else if (a.kind === "relocate" && read.successes > 0) {
      const p = ch.pairs?.[a.target];
      if (p) { patch[`pairs.${a.target}.contact`] = true; patch[`pairs.${a.target}.rev`] = (p.rev ?? 0) + 1; }
    }
    patch[`actions.${aid}.result`] = result;
    patch[`actions.${aid}.effects`] = effects;
    patch[`actions.${aid}.state`] = effects.length ? "resolving" : "done";
    await write(combat, patch);
    return { state: effects.length ? "resolving" : "done", result };
  });
  if (out.state === "resolving") {
    await applyEffects(combat, aid);
    return { ...out, state: chaseOf(combat).actions?.[aid]?.state ?? out.state };
  }
  return out;
}

/** Apply a resolving step's effects by their own idempotent paths, then mark it done (never under the chase queue). */
async function applyEffects(combat, aid) {
  const a = chaseOf(combat)?.actions?.[aid];
  if (a?.state !== "resolving") return;
  for (const fx of a.effects ?? []) {
    if (fx.type === "over") await chargeOver(combat, a.round, fx.eid);
    if (fx.type === "ram") await applyRam(fx);
  }
  await cq(combat.id, async () => {
    if (chaseOf(combat).actions?.[aid]?.state === "resolving") await write(combat, { [`actions.${aid}.state`]: "done" });
  });
}

/**
 * A landed ram (p.47–48, p.50, p.52): each vehicle resists the impact at the difference in speed (the rammer's Power
 * cut by its Body × successes) through its own impact record; a pedestrian resists one level higher and the vehicle one
 * lower. Deterministic follow-up ids (`vcol-<aid>-…`) make a replay a no-op.
 */
async function applyRam(fx) {
  const s = fx.snap, rammer = fromUuidSync(s.rammerUuid), target = fromUuidSync(s.targetUuid);
  const base = { speed: null, ruleset: "rigger2" };
  if (s.targetKind === "pedestrian") {
    const p = pedestrianImpact({ speed: s.rammerSpeed });
    if (!p) return;
    const tag = `vcol-${fx.aid}-ped`;
    if (!game.messages.some(m => m.getFlag("sr2e", "vfollowId") === tag)) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: rammer }), flags: { sr2e: { vfollowId: tag, vsteps: {
        ped: { effectId: `${tag}:pedestrian`, actor: s.targetUuid, power: p.pedestrian.power, level: p.pedestrian.level, armor: "impact",
               combatPool: true, title: "Hit by a vehicle", hardenedAlt: r2Impact(s.rammerSpeed) } } } },
        content: `<div class="sr2e-damage-result"><strong>${esc(rammer?.name)} hits ${esc(target?.name)} at ${s.rammerSpeed} m/CT:
          ${p.pedestrian.power}${p.pedestrian.level}</strong> — one level up (hardened or military-grade armour: no step), impact armour,
          Combat Pool allowed (Rigger 2 p.52). <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-vstep-btn" data-key="ped">🛡 Resist: ${esc(target?.name)}</button></div></div>` });
    }
    if (p.vehicle && rammer) await gmCall("vfollowCrash", { vehicleUuid: rammer.uuid, kind: "impact", why: `hits ${target?.name ?? "a pedestrian"}`,
      fid: `vcol-${fx.aid}-rammer`, ...base, impact: { power: p.vehicle.power, level: p.vehicle.level, source: "collision", stop: false, occupants: s.occupants.rammer } });
    return;
  }
  const d = ramDamage({ rammerSpeed: s.rammerSpeed, targetSpeed: s.targetSpeed, rammerBody: s.rammerBody, successes: fx.successes });
  if (!d) return;
  if (target) await gmCall("vfollowCrash", { vehicleUuid: target.uuid, kind: "impact", why: `is rammed by ${rammer?.name ?? "a vehicle"}`,
    fid: `vcol-${fx.aid}-target`, ...base, impact: { ...d.target, source: "ram", stop: false, occupants: s.occupants.target } });
  if (rammer) await gmCall("vfollowCrash", { vehicleUuid: rammer.uuid, kind: "impact", why: `rams ${target?.name ?? "a vehicle"} (Power −${s.rammerBody} × ${fx.successes})`,
    fid: `vcol-${fx.aid}-rammer`, ...base, impact: { ...d.rammer, source: "ram", stop: false, occupants: s.occupants.rammer } });
}

/**
 * Cancel a step (3a.2): only while "rolling" (the GM may force a "publishing" one whose roller is gone). It becomes
 * terminal only when the spender's pool writer has acknowledged (void receipt, or the dice already spent stay spent).
 */
async function cancel({ combatId, aid, force = false }, user) {
  const combat = combatOf(combatId);
  const ok = await cq(combatId, async () => {
    const a = chaseOf(combat).actions?.[aid];
    if (!a) throw new Error("no such step");
    if (!user.isGM && a.user !== user.id) throw new Error("not your roll");
    if (a.state === "cancelRequested") return true;
    if (a.state === "rolling" || (a.state === "publishing" && user.isGM && force)) {
      await write(combat, { [`actions.${aid}.state`]: "cancelRequested" });
      return true;
    }
    throw new Error(`can't cancel: ${a.state}`);
  });
  if (ok) await requestVoid(combat, aid);
  return ok;
}

/** Ask the step's pool writer to void its receipt (here, when the GM writes that actor's pools). */
async function requestVoid(combat, aid) {
  const a = chaseOf(combat)?.actions?.[aid];
  if (a?.state !== "cancelRequested") return;
  const actor = fromUuidSync(a.actor);
  const writer = actor ? playerWriter(actor) : null;
  if (!writer) return writerVoid(combat.id, aid);
  game.socket.emit("system.sr2e", { type: "chaseWriter", op: "void", to: writer.id, combatId: combat.id, aid });
}

/** On the pool writer: void the receipt inside the pool queue (a later spend under the id is refused), then ack. */
async function writerVoid(combatId, aid) {
  const a = actionOf(combatId, aid);
  const actor = a ? fromUuidSync(a.actor) : null;
  if (!actor) return gmCall("chaseCancelAck", { combatId, aid, spent: 0 });
  const spent = await defenseQueue(actor.uuid, async () => {
    if (a.kind === "dp") {
      const cur = actor.getFlag("sr2e", "positionReserve");
      const same = cur?.combatId === combatId && cur?.round === a.round;
      const prior = same ? cur.byTest?.[aid] : undefined;
      if (prior != null) return Number(prior) || 0;
      if (same) await actor.update({ [`flags.sr2e.positionReserve.byTest.${aid}`]: "void" });
      else {
        if (cur) await actor.update({ "flags.sr2e.-=positionReserve": null });
        await actor.update({ "flags.sr2e.positionReserve": { combatId, round: a.round, byTest: { [aid]: "void" } } });
      }
      return 0;
    }
    const prior = actor.getFlag("sr2e", "chaseSpend")?.[aid];
    if (prior != null) return Number(prior) || 0;
    await actor.update({ [`flags.sr2e.chaseSpend.${aid}`]: "void" });
    return 0;
  });
  return gmCall("chaseCancelAck", { combatId, aid, spent });
}

/** The writer's ack: the tombstone. A round change waiting on it resumes. */
async function cancelAck({ combatId, aid, spent = 0 }) {
  const combat = combatOf(combatId);
  await cq(combatId, async () => {
    if (chaseOf(combat).actions?.[aid]?.state !== "cancelRequested") return;
    await write(combat, { [`actions.${aid}.state`]: "cancelled", [`actions.${aid}.spent`]: Math.max(0, Number(spent) || 0) });
  });
  combat.resumeRound?.();
  return true;
}

/**
 * Spend Control Pool dice on a chase action (3.0 action step 2), on the actor's pool client, with an idempotent
 * receipt `flags.sr2e.chaseSpend.<aid>` in the same update. A "void" receipt (cancelled) refuses the spend. These dice
 * come back at the next refresh like any pool dice (p.44); only Driver Points dice are held for the turn.
 */
export function spendChase(actor, n, combatId, aid) {
  return defenseQueue(actor.uuid, async () => {
    if (poolsLocked(actor)) throw new Error("The Combat Turn is changing — try again in a moment.");
    const ledger = actor.getFlag("sr2e", "chaseSpend") ?? {};
    const prior = ledger[aid];
    if (prior === "void") return 0;
    if (prior != null) return Number(prior) || 0;
    if (actionOf(combatId, aid)?.state !== "rolling") return 0;
    const pool = actor.system.dicePools?.control;
    const d = Math.max(0, Math.min(Math.floor(Number(n) || 0), pool?.value ?? 0));
    const upd = { [`flags.sr2e.chaseSpend.${aid}`]: d };
    if (d) Object.assign(upd, { "system.dicePools.control.value": pool.value - d, "system.dicePools.control.max": pool.max });
    // Settled steps' receipts are no longer needed.
    for (const k of Object.keys(ledger)) {
      const st = activeChases().map(c => chaseOf(c).actions?.[k]?.state).find(Boolean);
      if (!st || TERMINAL.has(st)) upd[`flags.sr2e.chaseSpend.-=${k}`] = null;
    }
    await actor.update(upd);
    return d;
  });
}

/* ── The GM's pass and pool refreshes ────────────────────────────────────────────────────────────────────────── */

const cardFor = (aid) => game.messages.find(m => m.getFlag("sr2e", "chaseAction")?.aid === aid) ?? null;

/** Pending overChecks (a damage commit lowered a chase vehicle's Speed Rating, 3a.2) → the turn's `over` + Stress. */
async function applyOverChecks(combat) {
  const charged = await cq(combat.id, async () => {
    const ch = chaseOf(combat), patch = {}, out = [];
    for (const [id, oc] of Object.entries(ch.overChecks ?? {})) {
      if (oc.over && ch.turns?.[oc.round]?.[oc.eid] && !ch.closed?.[oc.round]) { patch[`turns.${oc.round}.${oc.eid}.over`] = true; out.push(oc); }
      patch[`overChecks.-=${id}`] = null;
    }
    if (Object.keys(patch).length) await write(combat, patch);
    return out;
  });
  for (const oc of charged) await chargeOver(combat, oc.round, oc.eid);
}

/**
 * The GM's reconcile pass over round r (or every round): record published cards, apply resolving effects, re-ask
 * acks, apply pending overChecks. Never re-rolls: a card that exists is the result.
 */
async function gmPass(combat, r = null) {
  await applyOverChecks(combat);
  for (const [aid, a] of Object.entries(chaseOf(combat)?.actions ?? {})) {
    if (r != null && a.round !== r) continue;
    try {
      // Automatically only what no Karma can still change: an Open Test, or a card its roller already applied
      // (closed). Any other card waits for its Apply, or the GM's "Apply now" on the panel (an explicit override).
      if (a.state === "publishing") {
        const m = cardFor(aid);
        if (m && (a.kind === "dp" || m.flags?.sr2e?.test?.closed)) await resolve({ combatId: combat.id, aid, messageId: m.id }, game.user);
      }
      else if (a.state === "resolving") await applyEffects(combat, aid);
      else if (a.state === "cancelRequested") await requestVoid(combat, aid);
    } catch (err) { console.error("SR2E | chase pass", aid, err); }
  }
}

/** GM: refresh this actor once for `receipt` through its pool writer. True when done; false when a player owes it. */
export async function requestRefresh(actor, receipt, combatId) {
  if (actor.getFlag("sr2e", "poolRefresh") === receipt) return true;
  const writer = playerWriter(actor);
  if (!writer) { await actor.refreshDicePools({ receipt }); return true; }
  game.socket.emit("system.sr2e", { type: "chaseWriter", op: "refresh", to: writer.id, actorUuid: actor.uuid, receipt, combatId });
  return false;
}

/** sr2e.mjs routes `chaseWriter` socket messages here: this client is the named pool writer. */
export function onChaseSocket(data) {
  if (data.type !== "chaseWriter" || data.to !== game.user.id) return;
  const run = async () => {
    if (data.op === "void") return writerVoid(data.combatId, data.aid);
    if (data.op === "refresh") {
      // Only for a round change actually refreshing, with ITS receipt, for one of ITS participants, on their writer.
      const combat = game.combats.get(data.combatId), t = combat?.getFlag("sr2e", "roundTransition");
      const actor = fromUuidSync(data.actorUuid);
      const member = actor && (combat?.combatants.some(c => c.actor?.uuid === actor.uuid) || chaseUnion(chaseOf(combat)).includes(actor.uuid));
      if (t?.stage !== "refreshing" || data.receipt !== `${combat.id}:${t.to}` || !member || !isPoolClient(actor)) return;
      await actor.refreshDicePools({ receipt: data.receipt });
      return gmCall("roundResume", { combatId: data.combatId });
    }
  };
  run().catch(err => console.error("SR2E | chase writer", data.op, err));
}

/* ── Membership (chase-membership queue) and the GM panel's edits ────────────────────────────────────────────── */

/** Is this uuid an entry, or aboard an entry, in any chase? */
const inAnyChase = (uuid) => !!(findEntry(uuid) || findAboard(uuid));

async function setup({ combatId }, user) {
  if (!user.isGM) throw new Error("GM only");
  if (!isRigger2()) throw new Error("chases are a Rigger 2 rule: switch the vehicle ruleset first");
  const combat = combatOf(combatId);
  return mq(() => cq(combatId, async () => {
    if (chaseOf(combat)?.entries) return true;
    // Set up mid-combat, the current Combat Turn is open at once (entries added now act this turn).
    const opened = combat.started ? { [combat.round]: true } : {};
    await combat.setFlag("sr2e", "chase", { entries: {}, pairs: {}, turns: {}, actions: {}, opened, closed: {}, left: {} });
    return true;
  }));
}

/** Add a vehicle or pedestrian (GM). An entry joins at the next Combat Turn once this one has opened (B9 #2). */
const leftKey = (uuid) => uuid.replaceAll(".", "_");

async function addEntry({ combatId, kind = "vehicle", uuid, driver = "", speed = 0, terrain = "normal", aboard = [], group = null }, user) {
  if (!user.isGM) throw new Error("GM only");
  const combat = combatOf(combatId);
  return mq(() => cq(combatId, async () => {
    const ch = chaseOf(combat);
    if (!ch?.entries) throw new Error("no chase in this combat");
    const doc = fromUuidSync(uuid);
    if (!doc) throw new Error("not found");
    if (kind === "vehicle" && doc.type !== "vehicle") throw new Error("not a vehicle");
    if (inAnyChase(uuid)) throw new Error(`${doc.name} is already in a chase`);
    const crew = [...new Set([driver, ...aboard].filter(Boolean))];
    for (const u of crew) if (inAnyChase(u)) throw new Error(`${fromUuidSync(u)?.name ?? u} is already aboard a chase vehicle`);
    const r = combat.round ?? 0;
    // It joins THIS turn unless it left another chase during that chase's current turn: then its records for the
    // turn stay there and it joins here at the next one, so nothing is counted twice (B9 #2).
    const movedNow = game.combats.contents.some(c => (chaseOf(c)?.left?.[leftKey(uuid)] ?? -1) === c.round);
    const joinedRound = !combat.started ? 1 : movedNow ? r + 1 : Math.max(1, r);
    const eid = foundry.utils.randomID(16);
    const entry = { kind, uuid, driver: kind === "vehicle" ? driver : "", speed: Math.max(0, Number(speed) || 0), terrain,
                    autonav: false, group: group || null, aboard: kind === "vehicle" ? aboard.filter(u => u !== driver) : [],
                    rev: 0, joinedRound };
    const patch = { [`entries.${eid}`]: entry };
    const rec = joinedRound === r && ch.opened?.[r] ? openRecord({ ...ch, entries: { ...ch.entries, [eid]: entry } }, eid, r) : null;
    if (rec) patch[`turns.${r}.${eid}`] = rec;
    await write(combat, patch);
    return { eid, joinedRound, over: !!rec?.over };
  })).then(async (out) => { if (out.over) await chargeOver(combat, combat.round, out.eid); return out; });
}

/** Edit an entry (GM; a driver's owner may set their own starting speed before their first turn opens, p.42). */
async function editEntry({ combatId, eid, patch = {} }, user) {
  const combat = combatOf(combatId);
  return mq(() => cq(combatId, async () => {
    const ch = chaseOf(combat), e = ch?.entries?.[eid];
    if (!e) throw new Error("no such entry");
    const allowed = user.isGM ? ["speed", "terrain", "driver", "aboard", "group", "autonav"]
      : (owns(user, e.driver) && !ch.opened?.[e.joinedRound ?? 1]) ? ["speed"] : [];
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) throw new Error("not allowed");
    if (Object.values(ch.actions ?? {}).some(a => LIVE.has(a.state) && involves(a, [eid])) && keys.some(k => k !== "aboard"))
      throw new Error("an action of this vehicle is being resolved");
    const upd = {};
    for (const k of keys) {
      let v = patch[k];
      if (k === "speed") v = Math.max(0, Number(v) || 0);
      if (k === "driver" || k === "aboard") {
        const others = new Set([...(k === "driver" ? [v] : v)].filter(Boolean));
        for (const u of others) {
          const hit = findAboard(u);
          if (hit && !(hit.combat.id === combatId && hit.eid === eid)) throw new Error(`${fromUuidSync(u)?.name ?? u} is aboard another vehicle`);
        }
      }
      upd[`entries.${eid}.${k}`] = v;
    }
    upd[`entries.${eid}.rev`] = (e.rev ?? 0) + 1;
    const r = combat.round;
    // A speed set above the Speed Rating during a live turn is speeding too (R3-2): the same per-turn receipt.
    let overNow = false;
    if (keys.includes("speed") && e.kind === "vehicle" && ch.turns?.[r]?.[eid] && !ch.turns[r][eid].over && !ch.closed?.[r]
        && upd[`entries.${eid}.speed`] > vehicleStats(fromUuidSync(e.uuid)).speedRating) {
      upd[`turns.${r}.${eid}.over`] = true;
      overNow = true;
    }
    // Speed or terrain changed this turn before Driver Points: refresh the turn's fixed parts.
    if (ch.turns?.[r]?.[eid] && ch.turns[r][eid].dp == null && (keys.includes("speed") || keys.includes("terrain"))) {
      const next = { ...e, ...Object.fromEntries(keys.map(k => [k, upd[`entries.${eid}.${k}`]])) };
      const rec = openRecord({ ...ch, entries: { ...ch.entries, [eid]: next } }, eid, r);
      upd[`turns.${r}.${eid}.sp`] = rec.sp; upd[`turns.${r}.${eid}.tp`] = rec.tp;
    }
    await write(combat, upd);
    return overNow;
  })).then(async (overNow) => { if (overNow) await chargeOver(combat, combat.round, eid); return true; });
}

/** Remove an entry (GM) when none of its steps is in flight; its records for this turn stay (B9 #2). */
async function removeEntry({ combatId, eid }, user) {
  if (!user.isGM) throw new Error("GM only");
  const combat = combatOf(combatId);
  return mq(() => cq(combatId, async () => {
    const ch = chaseOf(combat), e = ch?.entries?.[eid];
    if (!e) return true;
    if (Object.values(ch.actions ?? {}).some(a => !TERMINAL.has(a.state) && involves(a, [eid]))) throw new Error("finish or cancel its rolls first");
    const patch = { [`entries.-=${eid}`]: null, [`left.${leftKey(e.uuid)}`]: combat.round };
    for (const [pid, p] of Object.entries(ch.pairs ?? {})) if (p.pursuer === eid || p.quarry === eid) patch[`pairs.-=${pid}`] = null;
    await write(combat, patch);
    return true;
  }));
}

/** Add or edit a pursuit pair (GM): who chases whom, how far apart (p.42 step 1). */
async function setPair({ combatId, pid = null, pursuer, quarry, distance = 0, remove = false }, user) {
  if (!user.isGM) throw new Error("GM only");
  const combat = combatOf(combatId);
  return cq(combatId, async () => {
    const ch = chaseOf(combat);
    if (remove) { if (pid) await write(combat, { [`pairs.-=${pid}`]: null }); return true; }
    if (!ch.entries[pursuer] || !ch.entries[quarry] || pursuer === quarry) throw new Error("pick two entries");
    const id = pid ?? foundry.utils.randomID(16);
    const prev = ch.pairs?.[id];
    await write(combat, { [`pairs.${id}`]: { pursuer, quarry, distance: Math.max(0, Number(distance) || 0),
                                             contact: prev?.contact ?? true, rev: (prev?.rev ?? 0) + 1 } });
    return id;
  });
}

/**
 * A ram entitlement lasts for the driver's NEXT action (p.45, B2 #9): when an action of that driver ends (`seq` = the
 * phase that ended), every entitlement granted in an EARLIER phase is dropped. Called by SR2ECombat.nextTurn.
 */
async function expireRam({ combatId, actorUuid, seq }) {
  const combat = game.combats.get(combatId);
  if (!hasChase(combat) || !actorUuid) return false;
  return cq(combatId, async () => {
    const ch = chaseOf(combat), patch = {};
    for (const [r, turn] of Object.entries(ch.turns ?? {})) for (const [eid, t] of Object.entries(turn ?? {})) {
      if (ch.entries[eid]?.driver !== actorUuid) continue;
      for (const [other, ent] of Object.entries(t?.ram ?? {})) if ((ent?.seq ?? 0) < seq) patch[`turns.${r}.${eid}.ram.-=${other}`] = null;
    }
    if (Object.keys(patch).length) await write(combat, patch);
    return true;
  });
}

/** A crash stops the vehicle (GM, R2 p.51): speed 0, rev bumped so in-flight actions go stale. */
async function setSpeed({ combatId, eid, speed }, user) {
  if (!user.isGM) throw new Error("GM only");
  const combat = combatOf(combatId);
  return mq(() => cq(combatId, async () => {
    const e = chaseOf(combat)?.entries?.[eid];
    if (!e) return false;
    await write(combat, { [`entries.${eid}.speed`]: Math.max(0, Number(speed) || 0), [`entries.${eid}.rev`]: (e.rev ?? 0) + 1 });
    return true;
  }));
}

/** Autonav on/off (p.45): a Simple Action, a Free Action for a rigger jacked in. */
async function autonav({ combatId, eid, on }, user) {
  const combat = combatOf(combatId);
  return cq(combatId, async () => {
    const ch = chaseOf(combat), e = ch?.entries?.[eid];
    if (!e) throw new Error("no such entry");
    if (!owns(user, e.driver)) throw new Error("not your vehicle");
    if (Object.values(ch.actions ?? {}).some(a => LIVE.has(a.state) && involves(a, [eid]))) throw new Error("an action of this vehicle is being resolved");
    await write(combat, { [`entries.${eid}.autonav`]: !!on, [`entries.${eid}.rev`]: (e.rev ?? 0) + 1 });
    return riggedOf(e) ? "Free Action" : "Simple Action";
  });
}

/**
 * Damage routing (B8 #3): a vehicle damage commit looks up the vehicle's chase under `chase-membership`, then holds
 * that chase's queue around the commit. If the commit changed a chase vehicle's damage level, an immutable overCheck
 * is recorded in the same queue (B4 #5, B5 #4) and applied after the queues are released.
 */
function routeDamage(vehicle, commit) {
  let combat = null;
  const run = mq(() => {
    const hit = findEntry(vehicle.uuid);
    if (!hit || !hasChase(hit.combat)) return commit();
    combat = hit.combat;
    return cq(combat.id, async () => {
      const level = vehicle.system.damageLevel;
      const out = await commit();
      const ch = chaseOf(combat), e = ch.entries?.[hit.eid], r = combat.round;
      if (!out.skipped && e && vehicle.system.damageLevel !== level && ch.turns?.[r]?.[hit.eid]) {
        const speedRating = vehicleStats(vehicle).speedRating;
        await write(combat, { [`overChecks.${foundry.utils.randomID(16)}`]: { round: r, eid: hit.eid, speed: e.speed ?? 0, speedRating,
                                                                             over: (e.speed ?? 0) > speedRating } });
      }
      return out;
    });
  });
  return run.then(async (out) => { if (combat) await applyOverChecks(combat); return out; });
}

/* ── Passengers (p.49) ────────────────────────────────────────────────────────────────────────────────────────── */

/** This character's passenger limit now: null (none applies), or {phase, dp, vehicle}. Only the rigger is exempt. */
export function passengerLimit(actor) {
  const hit = findAboard(actor?.uuid);
  if (!hit || !hasChase(hit.combat) || !hit.combat.started) return null;
  if (hit.entry.driver === actor.uuid && riggedOf(hit.entry)) return null;
  const cb = hit.combat.combatants.find(c => c.actor?.uuid === actor.uuid);
  if (!cb || cb.initiative == null) return null;
  const rec = chaseOf(hit.combat).turns?.[hit.combat.round]?.[hit.eid]?.dp;
  const dp = rec ? (rec.total ?? rec.value) : null;
  if (passengerMayAttack({ phase: cb.initiative, dp })) return null;
  return { phase: cb.initiative, dp, vehicle: fromUuidSync(hit.entry.uuid)?.name ?? "the vehicle" };
}

/**
 * Weapon attacks and spellcasting from a chase vehicle (p.49): no offensive action in a Combat Phase higher than the
 * vehicle's Driver Points (none before they're rolled). The GM may override with a confirm.
 */
export async function passengerGate(actor) {
  const lim = passengerLimit(actor);
  if (!lim) return true;
  const why = lim.dp == null ? `${lim.vehicle}'s Driver Points aren't rolled yet`
    : `Phase ${lim.phase} is above ${lim.vehicle}'s Driver Points (${lim.dp})`;
  if (!game.user.isGM) {
    ui.notifications.warn(`SR2E | ${actor.name} can't take an offensive action: ${why} (Rigger 2 p.49).`);
    return false;
  }
  return foundry.applications.api.DialogV2.confirm({ window: { title: "Passenger limit (Rigger 2 p.49)" },
    content: `<p>${esc(actor.name)} can't take an offensive action now: ${esc(why)}. Override?</p>` });
}

/* ── Vehicles and magic (p.54–55) ────────────────────────────────────────────────────────────────────────────── */

/**
 * The spell TN modifiers a chase adds (Rigger 2): occupant line of sight (p.54) and casting from a moving vehicle
 * (p.55). Returns {tn, label}, or null when the cast is refused (nothing spent). Outside Rigger 2 chases: nothing.
 */
export async function vehicleSpellMods(caster, target, { damagingManipulation = false, area = false, hasCover = false, manual = null } = {}) {
  const none = { tn: 0, label: "" };
  if (!isRigger2()) return none;
  const mine = findAboard(caster?.uuid), theirs = target ? findAboard(target.uuid) : null;
  const sameVehicle = mine && theirs && mine.combat === theirs.combat && mine.eid === theirs.eid;
  let tn = 0; const labels = [];
  if (theirs && !sameVehicle && hasChase(theirs.combat)) {
    const vname = fromUuidSync(theirs.entry.uuid)?.name ?? "the vehicle";
    const view = damagingManipulation ? "open" : await foundry.applications.api.DialogV2.wait({
      window: { title: `${target.name} is aboard ${vname}` }, rejectClose: false,
      content: `<p>Can ${esc(caster.name)} see ${esc(target.name)}? (Rigger 2 p.54)</p>`,
      buttons: [{ action: "open", label: "Open vehicle (bike, open top)" }, { action: "blown", label: "Enclosed, windows blown out" },
                { action: "limited", label: "Limited windows (camper): +4" }, { action: "enclosed", label: "Enclosed" }] });
    if (!view) return null;
    const sight = occupantSpellSight({ view, damagingManipulation });
    if (!sight.ok) { ui.notifications.warn(`SR2E | ${target.name}: ${sight.why}.`); return null; }
    // The dialog's cover box already counts Partial Cover: never twice (p.54 limited windows ARE that cover).
    if (sight.tn && !hasCover) { tn += sight.tn; labels.push("Partial Cover +4 (p.54)"); }
  }
  if (mine && hasChase(mine.combat) && (mine.entry.speed ?? 0) > 0 && !sameVehicle && target?.uuid !== mine.entry.uuid) {
    // Known outside: a tracked target not aboard this vehicle. Unknown (no target, an area): ask.
    const outside = target && !area ? true : await foundry.applications.api.DialogV2.confirm({ window: { title: "Casting from a moving vehicle" },
      content: "<p>Is the target outside the vehicle? (Rigger 2 p.55: moving vehicle modifiers apply only then)</p>", rejectClose: false });
    if (outside) {
      const m = movingCastTN({ terrain: mine.entry.terrain, combat: !!mine.combat.started });
      if (m) { tn += m; labels.push(`moving vehicle +${m} (p.55)`); }
    }
  }
  // Not in a tracked chase: the caster's own declaration in the spell dialog (p.55, against a target outside).
  if (!mine && manual?.terrain) {
    const m = movingCastTN({ terrain: manual.terrain, combat: !!manual.combat });
    if (m) { tn += m; labels.push(`moving vehicle +${m} (p.55)`); }
  }
  return { tn, label: labels.join(", ") };
}

/** Returning to a body aboard a moving chase vehicle (p.55). True = back in the body (or no test needed). */
export async function returnToMovingBody(actor) {
  if (!isRigger2()) return true;
  const hit = findAboard(actor.uuid);
  if (hit && hasChase(hit.combat) && !((hit.entry.speed ?? 0) > 0)) return true;
  // Not tracked in a chase: the player (or GM) says whether the body is in a moving vehicle.
  if (!hit && !await foundry.applications.api.DialogV2.confirm({ window: { title: `${actor.name} returns to the body` },
    content: "<p>Is the body in a MOVING vehicle? (Rigger 2 p.55: an Intelligence (8) Test to get back in)</p>", rejectClose: false }))
    return true;
  const r = await actor.rollSuccessTest(actor.system.intelligence?.value ?? 1, 8,
    { label: `${actor.name} returns to a body in a moving vehicle (Rigger 2 p.55)`, closed: true });
  if ((r?.successes ?? 0) > 0) return true;
  ui.notifications.info(`SR2E | ${actor.name} misses the moving body and stays projecting: try again.`);
  return false;
}

/* ── Registration ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** Register the chase GM ops, the damage route and the GM's resume passes (sr2e.mjs init). */
export function registerChase() {
  gmOp("chaseSetup", setup);
  gmOp("chaseAddEntry", addEntry);
  gmOp("chaseEditEntry", editEntry);
  gmOp("chaseRemoveEntry", removeEntry);
  gmOp("chasePair", setPair);
  gmOp("chaseAutonav", autonav);
  gmOp("chaseSetSpeed", setSpeed);
  gmOp("chaseExpireRam", expireRam);
  gmOp("chaseDPStart", dpStart);
  gmOp("chaseBegin", begin);
  gmOp("chaseArm", arm);
  gmOp("chaseResolve", resolve);
  gmOp("chaseCancel", cancel);
  gmOp("chaseCancelAck", cancelAck);
  gmOp("roundResume", ({ combatId }) => { game.combats.get(combatId)?.resumeRound?.(); return true; });
  gmOp("roundAdvance", ({ combatId, from }, user) => {
    const combat = combatOf(combatId);
    if (!user.isGM && !combat.combatants.some(c => c.actor?.testUserPermission(user, "OWNER"))) throw new Error("not in this combat");
    combat.advanceRound(from);   // not awaited: the reply mustn't wait on players' acks
    return true;
  });
  setChaseRoute(routeDamage);
  const pass = () => {
    if (!game.users.activeGM?.isSelf) return;
    for (const combat of game.combats.contents) {
      if (hasChase(combat)) gmPass(combat).catch(err => console.error("SR2E | chase pass", err));
      if (combat.getFlag("sr2e", "roundTransition")) combat.resumeRound();
    }
  };
  Hooks.once("ready", pass);
  // The tracker marks aboard characters who can't act offensively this phase (p.49).
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    for (const combat of game.combats.contents.filter(hasChase)) {
      for (const cb of combat.combatants) {
        const lim = cb.actor ? passengerLimit(cb.actor) : null;
        const li = lim && root.querySelector(`[data-combatant-id="${cb.id}"] .token-name, [data-combatant-id="${cb.id}"] .name`);
        if (!li) continue;
        const tag = document.createElement("span");
        tag.className = "sr2e-passenger-limit";
        tag.title = lim.dp == null ? "No offensive actions until the vehicle's Driver Points are rolled (Rigger 2 p.49)"
          : `No offensive actions above Phase ${lim.dp} (Rigger 2 p.49)`;
        tag.textContent = ` 🚫${lim.dp ?? "–"}`;
        li.append(tag);
      }
    }
  });
  // A writer who left: the GM now writes their pools, so waiting acks and refreshes can finish.
  Hooks.on("userConnected", (u, connected) => { if (!connected) pass(); });
}

/** The GM records a published card now, closing it to Karma (the panel's "Apply now"; an explicit override). */
export async function chaseApplyNow(combat, aid) {
  const m = cardFor(aid);
  if (!m) throw new Error("no card for that roll yet");
  return gmCall("chaseResolve", { combatId: combat.id, aid, messageId: m.id });
}

/** Re-run the GM pass now (the panel's "Resume" button). */
export function chaseResume(combat) {
  return gmCall("roundResume", { combatId: combat.id });
}

/* ── Client flows: Driver Points and vehicle actions ─────────────────────────────────────────────────────────── */

const speakerFor = (actor) => ChatMessage.getSpeaker({ actor });
const notify = (err) => ui.notifications.warn(`SR2E | ${err?.message ?? err}`);

/** Ask how many Control Pool dice to add (0..cap) — the dialog shows what will be rolled. */
async function askControl(title, html, cap) {
  if (cap <= 0) return foundry.applications.api.DialogV2.confirm({ window: { title }, content: html }).then(ok => (ok ? 0 : null));
  return foundry.applications.api.DialogV2.prompt({ window: { title },
    content: `${html}<p><label>Control Pool dice <input type="number" name="control" value="0" min="0" max="${cap}"></label></p>`,
    ok: { label: "Roll", callback: (ev, button) => Math.max(0, Math.min(cap, Number(button.form.elements.control.value) || 0)) },
    rejectClose: false });
}

/** Driver Points (p.42/p.44): an Open Test, skill dice + allocated Control Pool (or an NPC's Professional Rating). */
export async function rollDriverPoints(combat, eid) {
  try {
    const ch = chaseOf(combat), e = ch.entries[eid];
    const driver = fromUuidSync(e.driver);
    if (!driver) throw new Error("set a driver on the chase panel first");
    const cap = isNpc(driver) ? 0 : Math.min(driver.system.dicePools?.control?.value ?? 0, driver._vehicleSkill(fromUuidSync(e.uuid)).dice);
    const control = await askControl(`${driver.name}: Driver Points`, `<p>Open Test: vehicle skill dice${isNpc(driver) ? " + Professional Rating" : " + Control Pool dice you allocate (held for the rest of the turn)"}; keep the highest die, sixes re-rolled and added (R2 p.42).</p>`, cap);
    if (control === null) return;
    if (control > 0 && !isPoolClient(driver)) throw new Error(`${driver.name}'s Control Pool is spent on their player's client`);
    const { aid, inputs } = await gmCall("chaseDPStart", { combatId: combat.id, round: combat.round, eid, control });
    const paid = inputs.control ? await spendPosition(driver, inputs.control, aid, { combatId: combat.id, round: combat.round }) : 0;
    await gmCall("chaseArm", { combatId: combat.id, aid });
    const n = inputs.skill + paid + inputs.pr;
    const roll = await new Roll(n > 0 ? `{${Array(n).fill("1d6x6").join(",")}}kh` : "0").evaluate();
    const msg = await roll.toMessage({ speaker: speakerFor(driver),
      flavor: `<strong>Driver Points</strong> — Open Test, ${inputs.skill} skill${paid ? ` + ${paid} Control Pool` : ""}${inputs.pr ? ` + ${inputs.pr} Professional Rating` : ""}${esc(inputs.note)} (R2 p.42)`,
      flags: { sr2e: { chaseAction: { combatId: combat.id, aid } } } });
    await gmCall("chaseResolve", { combatId: combat.id, aid, messageId: msg.id });
  } catch (err) { notify(err); }
}

/**
 * A vehicle action (p.45–49): reserve, show exactly what will be rolled, spend Control Pool with a receipt, arm, roll.
 * The card's "Apply" button records it (after any Karma).
 */
export async function chaseAction(combat, eid, kind, { target = null, actorUuid = null, stopDistance = null } = {}) {
  try {
    const ch = chaseOf(combat), e = ch.entries[eid];
    const members = [eid];
    const expectRevs = { [eid]: e.rev ?? 0 };
    for (const [pid, p] of Object.entries(ch.pairs ?? {})) if (members.includes(p.pursuer) || members.includes(p.quarry)) expectRevs[`p:${pid}`] = p.rev ?? 0;
    const { aid, inputs } = await gmCall("chaseBegin", { combatId: combat.id, round: combat.round, eid, kind, actorUuid, target, expectRevs, stopDistance });
    const actor = fromUuidSync(kind === "relocate" ? actorUuid : e.driver);
    const parts = inputs.parts.map(([l, v]) => `${esc(l)} ${v > 0 ? "+" : ""}${v}`).join(", ");
    const kindNote = kind === "relocate" ? "Perception Test (Intelligence) against the hiding vehicle's Signature" : "Driving Test against Handling";
    const cap = Math.min(inputs.controlCap, actor.system.dicePools?.control?.value ?? 0);
    const control = await askControl(`${actor.name}: ${KIND_LABEL[kind]}`,
      `<p>${kindNote}: <strong>${inputs.dice} dice vs TN ${inputs.tn}</strong> (${inputs.base}${parts ? `; ${parts}` : ""}). A Complex Action (R2 p.45).</p>`, cap);
    if (control === null) { await gmCall("chaseCancel", { combatId: combat.id, aid }); return; }
    if (control > 0 && !isPoolClient(actor)) throw new Error(`${actor.name}'s Control Pool is spent on their player's client`);
    const paid = control ? await spendChase(actor, control, combat.id, aid) : 0;
    await gmCall("chaseArm", { combatId: combat.id, aid });
    await actor.rollSuccessTest(inputs.dice, inputs.tn, {
      label: `${KIND_LABEL[kind]} (R2 p.${{ accelerate: 45, brake: 45, position: 47, hide: 48, relocate: 49, ram: 47 }[kind]})`,
      sourceLabel: kind === "relocate" ? "Intelligence" : "Driving",
      ...(paid ? { paidPoolDice: { control: paid } } : {}),
      flags: { sr2e: { chaseAction: { combatId: combat.id, aid } } } });
  } catch (err) { notify(err); }
}

/** Chat: an unrecorded chase card gets an "Apply" button (the roller, the actor's owner or the GM). */
export function bindChaseCard(message, html) {
  const tag = message.getFlag("sr2e", "chaseAction");
  if (!tag || !message.flags?.sr2e?.test) return;
  const a = actionOf(tag.combatId, tag.aid);
  const div = document.createElement("div");
  div.className = "sr2e-karma-actions";
  if (a?.state === "publishing") {
    div.innerHTML = `<button type="button" class="sr2e-resist-btn"><i class="fas fa-check"></i> Apply to the chase</button>`;
    div.querySelector("button").addEventListener("click", async () => {
      try {
        // Close the test to Karma in the same per-card queue Karma uses on this client, so no reroll can land after
        // the result the GM records (sr2e.mjs karma:<messageId>).
        await enqueueAttack(`karma:${message.id}`, () => closeTest(message));
        const out = await gmCall("chaseResolve", { combatId: tag.combatId, aid: tag.aid, messageId: message.id });
        if (out?.refused) ui.notifications.warn(`SR2E | ${out.refused}`);
        div.innerHTML = `<em>${out?.refused ? `Not counted (${esc(out.refused)}).` : "Applied to the chase."}</em>`;
      } catch (err) { notify(err); }
    });
  } else if (a) {
    div.innerHTML = `<em>${a.state === "done" || a.state === "resolving" ? "Applied to the chase." : `Not counted (${esc(a.state)}).`}</em>`;
  } else return;
  (html.querySelector(".sr2e-test-card, .sr2e-item-card") ?? html).append(div);
}
