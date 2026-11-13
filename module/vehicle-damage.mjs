/**
 * Vehicle damage follow-ups, crashes and occupant damage (docs/PLAN-vehicles-phase2.md 3b.1, 3b.3; both rulesets):
 *   - A damage commit records its follow-ups (rigger feedback, a Crash Test, an automatic crash) in the SAME update
 *     (vehicle-play.mjs GM_OPS.damage); the GM's delivery here posts each card once (`flags.sr2e.vfollowId` reconcile).
 *   - A crash is one recoverable transaction on the vehicle, `flags.sr2e.crashes.<cid>` keyed by its follow-up id:
 *     open → testing → (no crash: done) | crashed → resisting → resolving → done. Its two rolls (the Crash Test, then
 *     the vehicle's Damage Resistance Test) are rolled steps: reserve an attempt in `vdmg:<uuid>`, spend with a receipt,
 *     arm, roll (the card carries the attempt), record from the card. Effects carry ids derived from the follow-up id.
 *   - Occupant / rigger-feedback resistance is a rolled step on the OCCUPANT's pool writer: the damage is written in
 *     ONE actor update with its receipt `flags.sr2e.dmgReceipts.<key> = <effectId>`; a card found without its receipt
 *     is applied from the card, never re-rolled.
 */
import { gmCall, gmOp, controllerOf, isPoolClient, commitVehicleDamage, setFollowupDelivery, followId, mayResistFor } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { defenseQueue } from "./spell-defense.mjs";
import { commitDamage } from "./drugs.mjs";
import { findEntry, findAboard } from "./chase-state.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { impactDamage } from "./rules/vehicle-play-rules.mjs";
import { STAGES, r2Impact, stageDown, occupantImpact, crashTestTN, terrainControlCap, wallCollision, pedestrianImpact } from "./rules/vehicle-combat-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const BOXES = { L: 1, M: 3, S: 6, D: 10 };
const vq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);
const warn = (m) => ui.notifications.warn(`SR2E | ${m}`);
const cardWith = (key, value) => game.messages.find(m => foundry.utils.getProperty(m, `flags.sr2e.${key}`) === value) ?? null;
const named = (v, re) => !!v?.items?.some(i => i.type === "vehicle_mod" && re.test(i.name) && ["", "done", "factory"].includes(i.system.custom?.state ?? ""));
/** APPS and a crash cage (R2 p.50): matched by name — the Rigger 2 catalog gives them no modKey. */
export const hasApps = (v) => named(v, /\bAPPS\b|Advanced Passenger Protection/i);
export const hasCrashCage = (v) => named(v, /crash cage/i);

/* ── Follow-up delivery (3b.1) ───────────────────────────────────────────────────────────────────────────────── */

/** GM: post every pending follow-up card of this vehicle once; record a crash transaction for each crash. */
function deliver(vehicle) {
  if (!game.users.activeGM?.isSelf) return null;
  return vq(vehicle.uuid, async () => {
    for (const [fid, f] of Object.entries(vehicle.getFlag("sr2e", "vfollow") ?? {})) {
      for (const kind of ["feedback", "crash"]) {
        const x = f?.[kind];
        if (x?.state !== "pending") continue;
        const tag = `${fid}.${kind}`;
        if (kind === "crash") await openCrash(vehicle, fid, x);
        const msg = cardWith("vfollowId", tag) ?? await postFollowup(vehicle, fid, kind, x, tag);
        await vehicle.update({ [`flags.sr2e.vfollow.${fid}.${kind}.state`]: "posted", [`flags.sr2e.vfollow.${fid}.${kind}.messageId`]: msg.id });
      }
    }
  });
}

/** The crash record for a follow-up id (created at most once, in the vehicle queue). */
const crashOf = (vehicle, fid) => Object.entries(vehicle.getFlag("sr2e", "crashes") ?? {}).find(([, c]) => c?.fid === fid) ?? null;

async function openCrash(vehicle, fid, x) {
  if (crashOf(vehicle, fid)) return;
  // kind "impact" (a ram, a wall, a pedestrian): an explicit code, its damage source, whether it stops, who is aboard.
  const extra = x.kind === "impact" ? { power: x.power, level: x.level, source: x.source ?? "collision", stop: !!x.stop,
    ...(x.occupants ? { occupants: x.occupants } : {}), restraintNegates: !!x.restraintNegates, ...(x.newSpeed != null ? { newSpeed: x.newSpeed } : {}) } : {};
  // Who is aboard is snapshotted NOW (Codex 3b R1 #13); a speed of null = not in a chase, entered on the card.
  await vehicle.update({ [`flags.sr2e.crashes.${foundry.utils.randomID(16)}`]: { fid, kind: x.kind, ruleset: x.ruleset ?? "core",
    speed: x.speed == null ? null : Number(x.speed) || 0, why: x.why ?? "", state: x.kind === "test" ? "open" : "crashed",
    occupants: aboardOf(vehicle), ...extra } });
}

function postFollowup(vehicle, fid, kind, x, tag) {
  const speaker = ChatMessage.getSpeaker({ actor: vehicle });
  if (kind === "feedback") {
    const rigger = fromUuidSync(x.rigger);
    const effectId = `${fid}:feedback`;
    return ChatMessage.create({ speaker, flags: { sr2e: { vfollowId: tag, vsteps: { fb: { effectId, actor: x.rigger, power: x.power,
      level: x.level, armor: "none", combatPool: true, title: "Rigger feedback" } } } },
      content: `<div class="sr2e-damage-result"><strong>Rigger feedback (Rigger 2 p.49):</strong> ${esc(rigger?.name ?? "the rigger")}
        resists <strong>${x.power}${x.level} Physical</strong> — Body, no armour, Combat Pool allowed.${stepButtons({ fb: { actor: x.rigger } })}</div>` });
  }
  const r2 = x.ruleset === "rigger2", driver = controllerOf(vehicle);
  const page = r2 ? "Rigger 2 p.51" : "SR2E p.107";
  const head = x.kind === "auto"
    ? (x.why ? `<strong>${esc(vehicle.name)} ${esc(x.why)}: it crashes</strong> (${page}).`
      : `<strong>${esc(vehicle.name)} is destroyed: it crashes automatically</strong> (${r2 ? "Rigger 2 p.53" : page}).`)
    : `<strong>${esc(vehicle.name)} ${esc(x.why || "took Serious damage")}: Crash Test required</strong> (${page})${driver ? ` — ${esc(driver.name)} drives.` : "."}`;
  if (x.kind === "impact") {
    return ChatMessage.create({ speaker, flags: { sr2e: { vfollowId: tag, crashDue: { vehicleUuid: vehicle.uuid, fid, step: "resist" } } },
      content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)} ${esc(x.why || "collides")}: ${x.power}${x.level}</strong>
        — Body dice + Control Pool vs the Power, no armour (Rigger 2 p.50).
        <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-crash-step-btn"><i class="fas fa-car-burst"></i> Resist (vehicle)</button></div></div>` });
  }
  const step = x.kind === "auto" ? "resist" : "test";
  return ChatMessage.create({ speaker, flags: { sr2e: { vfollowId: tag, crashDue: { vehicleUuid: vehicle.uuid, fid, step } } },
    content: `<div class="sr2e-damage-result">${head} ${x.speed == null ? "Speed: entered on the roll." : `Speed ${Number(x.speed) || 0} m/CT.`}
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-crash-step-btn">
        <i class="fas fa-car-burst"></i> ${step === "test" ? "Crash Test" : "Resist the crash (vehicle)"}</button></div></div>` });
}

/** Ask for a crash outside a damage commit (a lost core ram, a barrier, a system failure): one follow-up, delivered. */
export function requestCrash(vehicle, { kind = "test", why = "", speed = null, ruleset = null } = {}) {
  return gmCall("vfollowCrash", { vehicleUuid: vehicle.uuid, kind, why, speed, ruleset: ruleset ?? (isRigger2() ? "rigger2" : "core") });
}

/* ── The crash transaction (3b.3) ────────────────────────────────────────────────────────────────────────────── */

/** May this user roll for this vehicle: the GM, its owner, or its driver's owner. */
function mayDriveFor(user, vehicle) {
  return !!(user?.isGM || vehicle.testUserPermission(user, "OWNER") || controllerOf(vehicle)?.testUserPermission(user, "OWNER"));
}

/**
 * GM op `crash`: one step of a crash's rolled step, in the vehicle queue.
 *   reserve {cid, step}         → an exclusive attempt (refused while another is live with an active roller)
 *   arm {cid, step, attemptId, control}
 *   record {cid, step, attemptId, messageId} → the result from the card; on a resist: "resolving" + the effects
 *   cancel {cid, step, attemptId}            → back to the waiting state (before any card)
 */
async function crashOp({ vehicleUuid, cid, step, op, attemptId = null, messageId = null, control = 0, force = false, speed = null }, user) {
  const vehicle = fromUuidSync(vehicleUuid);
  if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
  if (!mayDriveFor(user, vehicle)) throw new Error(`${user?.name} may not roll for ${vehicle.name}`);
  const message = messageId ? game.messages.get(messageId) : null;
  let read = null;
  if (op === "record") {
    if (message?.getFlag("sr2e", "crashStep")?.attemptId !== attemptId) throw new Error("that card isn't this roll");
    await closeTest(message);
    read = testTotalSuccesses(message.flags.sr2e.test);
  }
  const out = await vq(vehicleUuid, async () => {
    const c = vehicle.getFlag("sr2e", "crashes")?.[cid];
    if (!c) throw new Error("no such crash");
    const base = `flags.sr2e.crashes.${cid}`;
    const waiting = step === "test" ? "open" : "crashed", active = step === "test" ? "testing" : "resisting";
    const att = c[step]?.attempt;
    if (op === "reserve") {
      if (c.state !== waiting && c.state !== active) return { refused: `already ${c.state}` };
      if (att && cardWith("crashStep.attemptId", att.id)) return { refused: "that roll is on its way to being recorded" };
      // Exclusive: a live attempt is refused, the roller's own included; only the GM may force one whose roller is gone
      // or stuck (its dice, if any were spent, stay spent).
      if (att && game.users.get(att.user)?.active && !(force && user.isGM)) return { refused: `${game.users.get(att.user)?.name} is rolling it`, live: true };
      const id = foundry.utils.randomID(16);
      const upd = { [`${base}.state`]: active, [`${base}.${step}`]: { attempt: { id, user: user.id, state: "reserved" } } };
      if (c.speed == null) {
        if (speed == null) return { refused: "enter the vehicle's speed" };
        upd[`${base}.speed`] = Math.max(0, Number(speed) || 0);
      }
      await vehicle.update(upd);
      return { attemptId: id, crash: { ...c, state: active } };
    }
    if (att?.id !== attemptId) return { refused: "that roll was replaced" };
    if (op === "cancel") {
      if (att.state !== "reserved") return { refused: "already rolling" };
      await vehicle.update({ [`${base}.state`]: waiting, [`${base}.-=${step}`]: null });
      return { cancelled: true };
    }
    if (op === "arm") {
      if (att.state !== "reserved") return { refused: "not reserved" };
      await vehicle.update({ [`${base}.${step}.attempt.state`]: "publishing", [`${base}.${step}.control`]: Math.max(0, Number(control) || 0) });
      return { armed: true };
    }
    if (op === "record") {
      if (att.state !== "publishing") return { refused: `the roll is ${att.state}` };
      const upd = { [`${base}.${step}.attempt.state`]: "rolled", [`${base}.${step}.messageId`]: messageId, [`${base}.${step}.successes`]: read };
      if (step === "test") {
        // A Crash Test with no success crashes the vehicle (core p.107, Rigger 2 p.51).
        upd[`${base}.state`] = read > 0 ? "done" : "crashed";
      } else {
        const r2 = c.ruleset === "rigger2";
        const hit = c.kind === "impact" ? { power: c.power, level: c.level } : r2 ? r2Impact(c.speed) : impactDamage(c.speed);
        const level = !hit ? null : r2 ? stageDown(hit.level, read) : (STAGES[STAGES.indexOf(hit.level) - Math.floor(read / 2)] ?? null);
        const occ = !hit ? null : r2 ? { power: hit.power, level: hit.level } : level ? { power: hit.power, level } : null;
        upd[`${base}.state`] = "resolving";
        upd[`${base}.outcome`] = { power: hit?.power ?? 0, level: hit?.level ?? null, vehicleLevel: level, occupants: occ,
                                  control: c.test?.control ?? 0 };
      }
      const next = upd[`${base}.state`];   // read before update(): Foundry mutates the change object
      await vehicle.update(upd);
      return { state: next };
    }
    throw new Error("unknown crash op");
  });
  if (out.state === "resolving") await applyCrash(vehicle, cid);
  return out;
}

/** Apply a resolving crash's effects by their derived ids, then mark it done (never inside the vehicle queue). */
async function applyCrash(vehicle, cid) {
  const c = vehicle.getFlag("sr2e", "crashes")?.[cid];
  if (c?.state !== "resolving") return;
  const o = c.outcome ?? {}, r2 = c.ruleset === "rigger2", fid = c.fid;
  // The vehicle stops (core p.107; Rigger 2 p.51): a chase entry's speed drops to 0.
  const hit = findEntry(vehicle.uuid);
  const to = c.kind !== "impact" || c.stop ? 0 : c.newSpeed ?? null;   // a wall broken through keeps the rest (p.52)
  if (hit && to != null && hit.entry.speed !== to) await gmCall("chaseSetSpeed", { combatId: hit.combat.id, eid: hit.eid, speed: to });
  if (o.vehicleLevel) await commitVehicleDamage(vehicle, BOXES[o.vehicleLevel], { source: c.kind === "impact" ? c.source : "crash", eventId: `${fid}:vehicle`,
    woundLevel: o.vehicleLevel, ruleset: c.ruleset });
  const tag = `${fid}:occupants`;
  if (!cardWith("vfollowId", tag)) await postOccupants(vehicle, c, tag);
  await vq(vehicle.uuid, async () => {
    if (vehicle.getFlag("sr2e", "crashes")?.[cid]?.state === "resolving") await vehicle.update({ [`flags.sr2e.crashes.${cid}.state`]: "done" });
  });
  return r2;
}

/** Who is aboard (the chase entry's driver and passengers; else the controller). */
function aboardOf(vehicle, c = null) {
  if (c?.occupants) return c.occupants;
  const e = findEntry(vehicle.uuid)?.entry;
  const list = e ? [e.driver, ...(e.aboard ?? [])] : [controllerOf(vehicle)?.uuid];
  return [...new Set(list.filter(Boolean))];
}

/** The crash's result card, with a resistance row per occupant (and one for anyone else aboard). */
function postOccupants(vehicle, c, tag) {
  const o = c.outcome ?? {}, r2 = c.ruleset === "rigger2";
  const stops = c.kind !== "impact" || c.stop;
  const head = `<strong>${esc(vehicle.name)} ${c.kind === "impact" ? esc(c.why || "collides") : `crashes at ${c.speed} m/CT`}</strong>: ${o.vehicleLevel ? `the vehicle takes ${o.vehicleLevel} damage` : "the vehicle resists all damage"}${stops ? "; it stops" : ""}.`;
  if (!o.occupants) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flags: { sr2e: { vfollowId: tag } },
      content: `<div class="sr2e-damage-result">${head}<br><em>Passengers are unhurt.</em></div>` });
  }
  const spec = { power: o.occupants.power, level: o.occupants.level, armor: "impact", combatPool: false, title: "Crash",
                 restraint: r2, apps: r2 && hasApps(vehicle), cage: r2 && hasCrashCage(vehicle),
                 // Only a crash adds the rigger's Crash Test Control Pool dice (p.50); a wall spares the restrained (p.52).
                 control: r2 && c.kind !== "impact" ? (o.control ?? 0) : 0, restraintNegates: !!c.restraintNegates };
  const steps = {};
  for (const u of aboardOf(vehicle, c)) steps[followId(u)] = { ...spec, actor: u, effectId: `${c.fid}:occupant:${followId(u)}` };
  steps.any = { ...spec, actor: null, effectId: `${c.fid}:occupant` };
  const note = r2 ? `Occupants resist <strong>${o.occupants.power}${o.occupants.level}</strong> even if the vehicle staged it away: seat belt
      −1 level, ${spec.apps ? "APPS halves the Power, " : ""}${spec.cage ? "crash cage +6 dice, " : ""}impact armour only, no Combat Pool${spec.control ? `,
      +${spec.control} dice from the rigger's Control Pool` : ""} (Rigger 2 p.50).`
    : `Occupants resist <strong>${o.occupants.power}${o.occupants.level}</strong> as melee damage: impact armour only, no Combat Pool (SR2E p.107).`;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flags: { sr2e: { vfollowId: tag, vsteps: steps } },
    content: `<div class="sr2e-damage-result">${head}<br>${note}${stepButtons(steps)}</div>` });
}

/** Close a Success Test card to Karma (idempotent). */
async function closeTest(message) {
  const st = message?.flags?.sr2e?.test;
  if (!st || st.closed) return;
  const { renderSuccessTestCard } = await import("./documents/actor.mjs");
  const next = { ...st, closed: true };
  await message.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
}

/**
 * Spend Control Pool dice for a rolled step with an idempotent receipt `flags.sr2e.stepSpend.<attemptId>` in the same
 * update (a retried spend under the same attempt returns what was paid).
 */
export function spendStep(actor, n, attemptId) {
  return defenseQueue(actor.uuid, async () => {
    const prior = actor.getFlag("sr2e", "stepSpend")?.[attemptId];
    if (prior != null) return Number(prior) || 0;
    const pool = actor.system.dicePools?.control;
    const d = Math.max(0, Math.min(Math.floor(Number(n) || 0), pool?.value ?? 0));
    const upd = { [`flags.sr2e.stepSpend.${attemptId}`]: d };
    if (d) Object.assign(upd, { "system.dicePools.control.value": pool.value - d, "system.dicePools.control.max": pool.max });
    // Old receipts: an attempt with a card or a settled crash no longer needs one; keep the last 20.
    const keys = Object.keys(actor.getFlag("sr2e", "stepSpend") ?? {});
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) upd[`flags.sr2e.stepSpend.-=${k}`] = null;
    await actor.update(upd);
    return d;
  });
}

/** The crash card's button: the Crash Test, or the vehicle's Damage Resistance Test after a crash. */
export async function crashStepClick(message) {
  const due = message.getFlag("sr2e", "crashDue");
  const vehicle = due && fromUuidSync(due.vehicleUuid);
  if (!vehicle) return;
  const found = crashOf(vehicle, due.fid);
  if (!found) return warn("That crash isn't recorded yet — the GM's client posts it.");
  const [cid, c] = found;
  const step = c.state === "open" || c.state === "testing" ? "test" : c.state === "crashed" || c.state === "resisting" ? "resist" : null;
  if (!step) return warn(c.state === "done" ? "That crash is settled." : "That crash is being resolved.");
  const driver = controllerOf(vehicle);
  if (driver && !driver.isOwner && !game.user.isGM) return warn(`${driver.name} drives ${vehicle.name}: their player (or the GM) rolls.`);
  if (!driver && !game.user.isGM && !vehicle.isOwner) return warn(`Nobody drives ${vehicle.name}: the GM rolls.`);

  const r2 = c.ruleset === "rigger2";
  const entry = findEntry(vehicle.uuid)?.entry;
  const npc = !driver || driver.type === "npc";
  const sk = driver?._vehicleSkill(vehicle) ?? null;
  const skill = sk?.dice ?? 0;
  const empathy = driver?.qualityValues?.()["vehicle-empathy"] && vehicle.system.vehicleType !== "drone" ? -1 : 0;
  // The optional terrain limit (p.53) applies to the vehicle's resistance, not to the Crash Test.
  const capTerrain = step === "resist" && c.ruleset === "rigger2" && game.settings.get("sr2e", "r2ControlPoolTerrain") ? (findEntry(vehicle.uuid)?.entry?.terrain ?? "normal") : "normal";
  const cap = driver && !npc && isPoolClient(driver) ? Math.min(driver.system.dicePools?.control?.value ?? 0, terrainControlCap(skill, capTerrain)) : 0;
  const pr = driver?.type === "npc" ? (driver.system.professionalRating ?? 0) : 0;
  const terrain0 = entry?.terrain ?? "normal";
  const codeAt = (sp) => (c.kind === "impact" ? { power: c.power, level: c.level } : r2 ? r2Impact(sp) : impactDamage(sp));
  const askSpeed = c.speed == null;
  let hit = askSpeed ? null : codeAt(c.speed);

  const f = await foundry.applications.api.DialogV2.prompt({ window: { title: `${vehicle.name}: ${step === "test" ? "Crash Test" : "resist the crash"}` },
    rejectClose: false,
    content: `<div>
      ${askSpeed ? `<div class="form-group"><label>Its speed (m/CT) when it crashed</label><input type="number" name="speed" value="${vehicle.system.effectiveSpeed ?? 0}" min="0"></div>` : ""}
      ${!driver ? `<div class="form-group"><label>NPC driver's Vehicle Skill</label><input type="number" name="skill" value="3" min="0"></div>` : ""}
      ${step === "test" ? `<div class="form-group"><label>Terrain</label><select name="terrain">${["open", "normal", "restricted", "tight"]
        .map(k => `<option value="${k}" ${k === terrain0 ? "selected" : ""}>${k}</option>`).join("")}</select></div>` : ""}
      ${step === "test" && r2 && (vehicle.system.effective?.autonav ?? vehicle.system.autonav) > 0 ? `<label><input type="checkbox" name="autonav" ${entry?.autonav ? "checked" : ""}> Add the Autonav's ${vehicle.system.effective?.autonav ?? vehicle.system.autonav} dice (Rigger 2 p.51)</label>` : ""}
      ${cap > 0 && (r2 || step === "test") ? `<div class="form-group"><label>Control Pool dice (max ${cap})</label><input type="number" name="control" value="0" min="0" max="${cap}"></div>` : ""}
      ${step === "resist" && hit ? `<p>${hit.power}${hit.level} at ${c.speed} m/CT — ${r2 ? "Body dice + Control Pool vs the Power, no armour (Rigger 2 p.50)" : "Body + ½ armour vs Power − armour (SR2E p.107)"}.</p>` : ""}
      </div>`,
    ok: { label: "Roll", callback: (ev, b) => { const e = b.form.elements;
      return { speed: e.speed ? Math.max(0, Number(e.speed.value) || 0) : null, skill: Number(e.skill?.value) || 0, terrain: e.terrain?.value ?? terrain0, autonav: !!e.autonav?.checked,
               control: Math.max(0, Math.min(cap, Number(e.control?.value) || 0)) }; } } });
  if (!f) return;
  let res = await gmCall("crash", { vehicleUuid: vehicle.uuid, cid, step, op: "reserve", speed: f.speed }).catch(err => ({ refused: err.message }));
  if (res.live && game.user.isGM && await foundry.applications.api.DialogV2.confirm({ window: { title: "Take over the roll?" },
    content: `<p>${esc(res.refused)}. Take it over (only if that roll is stuck)?</p>`, rejectClose: false }))
    res = await gmCall("crash", { vehicleUuid: vehicle.uuid, cid, step, op: "reserve", speed: f.speed, force: true }).catch(err => ({ refused: err.message }));
  if (res.refused) return warn(res.refused);
  const speed = c.speed ?? f.speed;
  if (askSpeed) hit = codeAt(speed);
  const attemptId = res.attemptId;
  try {
    let dice, tn, label, roller = driver ?? vehicle;
    if (step === "test") {
      const base = r2
        ? crashTestTN({ handling: vehicle.system.effectiveHandling ?? 0, damageTn: vehicle.system.damageTnMod ?? 0, terrain: f.terrain,
                        speed, reaction: driver?.system?.reaction?.value ?? 1 }).tn
        : (vehicle.system.effectiveHandling ?? 0) + (CONFIG.SR2E.vehicleTerrainMods.crash[f.terrain] ?? 0) + (vehicle.system.damageTnMod ?? 0);
      tn = Math.max(2, base + (sk?.penalty ?? 0) + empathy);
      dice = (driver ? skill : f.skill) + pr + (f.autonav ? (vehicle.system.effective?.autonav ?? vehicle.system.autonav ?? 0) : 0);
      label = `${vehicle.name}: Crash Test (${r2 ? "Rigger 2 p.51" : "SR2E p.107"})`;
    } else {
      const armor = vehicle.system.effectiveArmor ?? 0, body = vehicle.system.body ?? 1;
      if (r2) { dice = body + pr; tn = Math.max(2, hit?.power ?? 2); }
      else { dice = body + Math.floor(armor / 2); tn = Math.max(2, (hit?.power ?? 2) - armor); }
      roller = vehicle;
      label = `${vehicle.name} resists the crash (${hit ? `${hit.power}${hit.level}` : "parked"})`;
    }
    const paid = f.control && driver ? await spendStep(driver, f.control, attemptId) : 0;
    const armed = await gmCall("crash", { vehicleUuid: vehicle.uuid, cid, step, op: "arm", attemptId, control: paid });
    if (armed.refused) return warn(armed.refused);
    await roller.rollSuccessTest(Math.max(0, dice), tn, { label, isResistance: step === "resist",
      ...(paid ? { paidPoolDice: { control: paid } } : {}),
      flags: { sr2e: { crashStep: { vehicleUuid: vehicle.uuid, cid, step, attemptId } } } });
  } catch (err) {
    await gmCall("crash", { vehicleUuid: vehicle.uuid, cid, step, op: "cancel", attemptId }).catch(() => {});
    throw err;
  }
}

/** Record a crash roll's card (its "Apply" button; Karma first). */
export async function crashApply(message) {
  const st = message.getFlag("sr2e", "crashStep");
  await enqueueAttack(`karma:${message.id}`, () => closeTest(message));
  const out = await gmCall("crash", { vehicleUuid: st.vehicleUuid, cid: st.cid, step: st.step, op: "record", attemptId: st.attemptId, messageId: message.id })
    .catch(err => ({ refused: err.message }));
  if (out?.refused) warn(out.refused);
  return out;
}

/* ── Occupant and rigger-feedback resistance: rolled steps on the occupant's writer (3b.3) ───────────────────── */

const hasReceipt = (actor, effectId) => actor?.getFlag("sr2e", "dmgReceipts")?.[followId(effectId)] === effectId;
/** Steps rolling on THIS client (the occupant's one writer): a second click can't start a parallel roll. */
const inflight = new Set();

function stepButtons(steps) {
  const rows = Object.entries(steps).map(([key, s]) => {
    const who = s.actor ? fromUuidSync(s.actor)?.name ?? "occupant" : "anyone else aboard (select your token)";
    return `<button type="button" class="sr2e-resist-btn sr2e-vstep-btn" data-key="${esc(key)}" title="Each occupant resists once">🛡 Resist: ${esc(who)}</button>`;
  });
  return rows.length ? `<div class="sr2e-karma-actions">${rows.join(" ")}</div>` : "";
}

/** Resist one occupant's (or the rigger's) share of a damage event, once, on that character's pool writer. */
export async function stepClick(message, key) {
  const spec = message.flags?.sr2e?.vsteps?.[key];
  if (!spec) return;
  const actor = spec.actor ? fromUuidSync(spec.actor) : (canvas.tokens?.controlled?.[0]?.actor ?? game.user.character);
  if (!actor || actor.type === "vehicle") return warn("Select your character's token (or assign a character) to resist.");
  if (!mayResistFor(actor)) return warn(`Only ${actor.name}'s owner or the GM can resist for them.`);
  if (!isPoolClient(actor)) return warn(`${actor.name} resists on their player's client.`);
  const effectId = spec.actor ? spec.effectId : `${spec.effectId}:${followId(actor.uuid)}`;
  const rk = followId(effectId);
  if (hasReceipt(actor, effectId)) return warn(`${actor.name} has already resisted this.`);
  // A card of an earlier attempt without its receipt: apply it from the card (never re-roll).
  const prior = actor.getFlag("sr2e", "vstep")?.[rk];
  const priorCard = prior?.attempt ? cardWith("vstep.attempt", prior.attempt) : null;
  if (priorCard) return applyFromCard(actor, priorCard);

  let power = spec.power, level = spec.level, bonus = (spec.cage ? 6 : 0) + (spec.control ?? 0);
  // A pedestrian in hardened or military-grade armour takes the impact without the step up (Rigger 2 p.52).
  if (spec.hardenedAlt && await foundry.applications.api.DialogV2.confirm({ window: { title: `${actor.name}: armour` },
    content: `<p>Is ${esc(actor.name)} wearing hardened or military-grade armour? (No step up: ${spec.hardenedAlt.power}${spec.hardenedAlt.level})</p>`, rejectClose: false })) {
    power = spec.hardenedAlt.power; level = spec.hardenedAlt.level;
  }
  if (spec.restraint || spec.apps) {
    const restrained = spec.restraint ? await foundry.applications.api.DialogV2.confirm({ window: { title: `${actor.name}: seat belt?` },
      content: `<p>Was ${esc(actor.name)} wearing a seat belt or other restraint? (−1 Damage Level, Rigger 2 p.50)</p>`, rejectClose: false }) : false;
    const o = spec.restraintNegates && restrained ? null : occupantImpact({ power, level, restrained: !!restrained, apps: !!spec.apps });
    if (!o) {
      await defenseQueue(actor.uuid, async () => { if (!hasReceipt(actor, effectId)) await actor.update({ [`flags.sr2e.dmgReceipts.${rk}`]: effectId }); });
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">${esc(actor.name)}: the restraint stages it to nothing.</div>` });
    }
    power = o.power; level = o.level;
  }
  const fkey = `${actor.uuid}|${rk}`;
  if (inflight.has(fkey)) return warn(`${actor.name} is already resisting this.`);
  inflight.add(fkey);
  try {
    const attempt = foundry.utils.randomID(16);
    const ok = await defenseQueue(actor.uuid, async () => {
      if (hasReceipt(actor, effectId)) return false;
      await actor.update({ [`flags.sr2e.vstep.${rk}`]: { effectId, attempt, power, level } });
      return true;
    });
    if (!ok) return warn(`${actor.name} has already resisted this.`);
    // Only the CURRENT attempt may apply (validated again in the damage queue).
    const current = () => actor.getFlag("sr2e", "vstep")?.[rk]?.attempt === attempt && !hasReceipt(actor, effectId);
    const res = await actor.rollDamageResistance(power, level, "impact", "physical", {
      noCombatPool: !spec.combatPool, armorCalc: spec.armor === "none" ? "none" : "impact", bonusDice: bonus,
      testFlags: { sr2e: { vstep: { attempt, effectId, power, level, actorUuid: actor.uuid } } },
      damageExtra: { [`flags.sr2e.dmgReceipts.${rk}`]: effectId }, damageSkipIf: () => !current(), beforeRoll: current
    });
    // Fully resisted: no damage update carried the receipt.
    if (res) await defenseQueue(actor.uuid, async () => { if (current()) await actor.update({ [`flags.sr2e.dmgReceipts.${rk}`]: effectId }); });
    return res;
  } finally { inflight.delete(fkey); }
}

/** Recovery: an attempt's card exists but its receipt doesn't — apply what the card says, once. */
async function applyFromCard(actor, card) {
  const v = card.flags.sr2e.vstep, st = card.flags.sr2e.test;
  const rk = followId(v.effectId);
  if (actor.getFlag("sr2e", "vstep")?.[rk]?.attempt !== v.attempt) return;
  const net = testTotalSuccesses(st);
  const idx = STAGES.indexOf(v.level) - Math.floor(net / 2);
  if (idx < 0) {
    await defenseQueue(actor.uuid, async () => { if (!hasReceipt(actor, v.effectId)) await actor.update({ [`flags.sr2e.dmgReceipts.${rk}`]: v.effectId }); });
  } else {
    await commitDamage(actor, "physical", BOXES[STAGES[idx]], { extra: { [`flags.sr2e.dmgReceipts.${rk}`]: v.effectId }, skipIf: () => hasReceipt(actor, v.effectId) });
  }
  ui.notifications.info(`SR2E | ${actor.name}'s earlier roll is applied from its card.`);
}

/* ── Walls, barriers and pedestrians under Rigger 2 (3b.4, 3b.5) ──────────────────────────────────────────────── */

/**
 * The vehicle "Hit" under Rigger 2 (p.52–54): a wall or a physical barrier spell (Barrier Rating = Force) stops the
 * vehicle when its speed ≤ Rating × 20 (a crash at its speed), else it breaks through losing Rating × 20 (Power = the
 * rating, level from the speed lost; restrained occupants unhurt). A mana barrier ignores the vehicle; an exposed rider
 * hits it as a wall. A pedestrian: one level up for them, one down for the vehicle.
 */
export async function r2HitObject(driver, vehicle) {
  const entry = findEntry(vehicle.uuid)?.entry;
  const speed0 = entry?.speed ?? vehicle.system.effectiveSpeed ?? 0;
  const f = await foundry.applications.api.DialogV2.prompt({ window: { title: `${vehicle.name} hits…` }, rejectClose: false,
    content: `<div>
      <div class="form-group"><label>Speed (m/CT)</label><input type="number" name="speed" value="${speed0}" min="0"></div>
      <div class="form-group"><label>What</label><select name="kind"><option value="wall">a wall / physical barrier</option>
        <option value="physical">a physical barrier spell</option><option value="mana">a mana barrier spell</option>
        <option value="pedestrian">a pedestrian</option></select></div>
      <div class="form-group"><label>Barrier Rating / Force</label><input type="number" name="rating" value="6" min="0"></div>
      <label><input type="checkbox" name="exposed"> The rider is exposed (bike, open top)</label>
      <p class="hint">Rigger 2 p.52–54. A wall at Barrier Rating × 20 or more stops the vehicle.</p></div>`,
    ok: { label: "Resolve", callback: (ev, b) => { const e = b.form.elements;
      return { speed: Math.max(0, Number(e.speed.value) || 0), kind: e.kind.value, rating: Math.max(0, Number(e.rating.value) || 0), exposed: e.exposed.checked }; } } });
  if (!f) return;
  const occupants = aboardOf(vehicle);
  const ask = (impact, why) => gmCall("vfollowCrash", { vehicleUuid: vehicle.uuid, kind: "impact", why, speed: f.speed, ruleset: "rigger2", impact });
  if (f.kind === "pedestrian") {
    const p = pedestrianImpact({ speed: f.speed });
    if (!p) return warn("A parked vehicle hits nobody.");
    const tag = `ped-${foundry.utils.randomID(12)}`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flags: { sr2e: { vfollowId: tag, vsteps: {
      any: { effectId: `${tag}:pedestrian`, actor: null, power: p.pedestrian.power, level: p.pedestrian.level, armor: "impact", combatPool: true,
             title: "Hit by a vehicle", hardenedAlt: r2Impact(f.speed) } } } },
      content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)} hits a pedestrian at ${f.speed} m/CT: ${p.pedestrian.power}${p.pedestrian.level}</strong>
        (Rigger 2 p.52).${stepButtons({ any: { actor: null } })}</div>` });
    if (p.vehicle) await ask({ power: p.vehicle.power, level: p.vehicle.level, source: "collision", stop: false, occupants }, "hits a pedestrian");
    return;
  }
  const w = wallCollision({ speed: f.speed, barrier: f.rating });
  const riderCode = w.damage;
  if (f.kind === "mana") {
    // The vehicle and anyone enclosed pass through (p.54); an exposed rider hits it as a wall of rating Force.
    if (!f.exposed || !riderCode) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
      content: `<div class="sr2e-damage-result">${esc(vehicle.name)} passes through the mana barrier unaffected (Rigger 2 p.54).</div>` });
    const tag = `mana-${foundry.utils.randomID(12)}`;
    const rows = { any: { effectId: `${tag}:rider`, actor: null, power: riderCode.power, level: riderCode.level, armor: "impact", combatPool: false, title: "Mana barrier" } };
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flags: { sr2e: { vfollowId: tag, vsteps: rows } },
      content: `<div class="sr2e-damage-result">The vehicle passes through; the exposed rider hits the barrier as a wall:
        <strong>${riderCode.power}${riderCode.level}</strong> (Rigger 2 p.52, p.54).${stepButtons(rows)}</div>` });
  }
  if (w.halts) {
    if (!w.damage) return warn("A parked vehicle hits nothing.");
    return ask({ power: w.damage.power, level: w.damage.level, source: "collision", stop: true, occupants }, `hits a barrier (rating ${f.rating}) and stops`);
  }
  return ask({ power: w.damage.power, level: w.damage.level, source: "collision", stop: false, newSpeed: w.speed, occupants, restraintNegates: true },
    `breaks through a barrier (rating ${f.rating}), down to ${w.speed} m/CT`);
}

/* ── GM pass, buttons, registration ──────────────────────────────────────────────────────────────────────────── */

/** GM: deliver pending follow-ups, record published crash rolls whose card is closed, replay resolving crashes. */
async function gmPass() {
  if (!game.users.activeGM?.isSelf) return;
  const vehicles = [...game.actors.filter(a => a.type === "vehicle"),
    ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor?.type === "vehicle").map(t => t.actor))];
  for (const v of vehicles) {
    try {
      if (Object.values(v.getFlag("sr2e", "vfollow") ?? {}).some(f => f?.feedback?.state === "pending" || f?.crash?.state === "pending")) await deliver(v);
      for (const [cid, c] of Object.entries(v.getFlag("sr2e", "crashes") ?? {})) {
        if (c.state === "resolving") await applyCrash(v, cid);
        for (const step of ["test", "resist"]) {
          const att = c[step]?.attempt;
          const card = att?.state === "publishing" ? cardWith("crashStep.attemptId", att.id) : null;
          if (card?.flags?.sr2e?.test?.closed) await crashOp({ vehicleUuid: v.uuid, cid, step, op: "record", attemptId: att.id, messageId: card.id }, game.user);
        }
      }
    } catch (err) { console.error("SR2E | vehicle damage pass", v.name, err); }
  }
}

/** Chat: crash-card, crash-roll and occupant buttons. */
export function bindVehicleDamageCard(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.querySelector(".sr2e-crash-step-btn")?.addEventListener("click", () => crashStepClick(message).catch(err => warn(err.message)));
  for (const b of root.querySelectorAll(".sr2e-vstep-btn")) b.addEventListener("click", () => stepClick(message, b.dataset.key).catch(err => warn(err.message)));
  const st = message.getFlag("sr2e", "crashStep");
  if (st && message.flags?.sr2e?.test) {
    const v = fromUuidSync(st.vehicleUuid);
    const att = v?.getFlag("sr2e", "crashes")?.[st.cid]?.[st.step]?.attempt;
    const div = document.createElement("div");
    div.className = "sr2e-karma-actions";
    if (att?.id === st.attemptId && att.state === "publishing") {
      div.innerHTML = `<button type="button" class="sr2e-resist-btn"><i class="fas fa-check"></i> Apply the result</button>`;
      div.querySelector("button").addEventListener("click", async () => {
        const out = await crashApply(message);
        if (!out?.refused) div.innerHTML = "<em>Applied.</em>";
      });
    } else div.innerHTML = `<em>${att?.id === st.attemptId ? "Applied." : "Not counted."}</em>`;
    (root.querySelector(".sr2e-test-card, .sr2e-item-card") ?? root).append(div);
  }
}

/** Register the GM ops, the delivery, the ruleset stamp and the optional setting (sr2e.mjs init). */
export function registerVehicleDamage() {
  gmOp("crash", crashOp);
  gmOp("vfollowCrash", async ({ vehicleUuid, kind, why, speed, ruleset, fid = null, impact = null, cardId = null }, user) => {
    const vehicle = fromUuidSync(vehicleUuid);
    if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
    // A resolved core ram card authorizes the LOSER's Crash Test whoever resolved it (its id is the follow-up id).
    const byRam = !!cardId && game.messages.some(m => m.flags?.sr2e?.resolves === cardId && m.flags.sr2e.vramLoser === vehicleUuid);
    if (byRam) fid = `vram-${cardId}`;
    if (!byRam && !mayDriveFor(user, vehicle)) throw new Error("not allowed");
    // A caller's deterministic id (a ram's `vcol-<aid>-…`) makes a replay a no-op.
    fid = fid ? followId(fid) : `req-${foundry.utils.randomID(12)}`;
    // Rigger 2 outside a chase: unknown (null), entered on the first roll; core: cruising speed.
    const snap = speed ?? findEntry(vehicleUuid)?.entry?.speed ?? (ruleset === "rigger2" ? null : vehicle.system.effectiveSpeed ?? 0);
    await vq(vehicleUuid, async () => {
      if (vehicle.getFlag("sr2e", "vfollow")?.[fid]) return;
      await vehicle.update({ [`flags.sr2e.vfollow.${fid}`]: { crash: { kind, why, speed: snap, ruleset, state: "pending", ...(impact ?? {}) } } });
    });
    await deliver(vehicle);
    return fid;
  });
  // A Deadly hit on a passenger gives the vehicle Light damage (p.53), committed by the GM for the passenger's client.
  gmOp("passengerCollateral", async ({ outcomeId }, user) => {
    // Only from a Deadly passenger outcome card resolving a Rigger 2 ranged attack, by its author, once per attack.
    const out = game.messages.get(outcomeId), pd = out?.flags?.sr2e?.passengerDeadly;
    const attack = pd ? game.messages.get(out.flags.sr2e.resolves ?? "") : null;
    if (!pd || out.author?.id !== user.id || !attack?.flags?.sr2e?.rangedDamage || attack.flags.sr2e.vehicleRuleset !== "rigger2")
      throw new Error("no qualifying passenger hit");
    if (findAboard(pd.actorUuid)?.entry?.uuid !== pd.vehicleUuid) throw new Error("not aboard that vehicle");
    return commitVehicleDamage(fromUuidSync(pd.vehicleUuid), 1, { source: "passenger", eventId: `pd-${attack.id}-${followId(pd.actorUuid)}`,
      woundLevel: "L", ruleset: "rigger2" });
  });
  // A Rigger 2 vehicle Damage Resistance Test against a weapon: one durable attempt per damage event (plan 3.0),
  // `flags.sr2e.vresist.<event>` in the vehicle queue. A live attempt is refused (its roller active) unless the GM forces.
  gmOp("vresist", async ({ vehicleUuid, eventId, op, attempt = null, force = false }, user) => {
    const vehicle = fromUuidSync(vehicleUuid);
    if (vehicle?.type !== "vehicle") throw new Error("not a vehicle");
    if (!mayDriveFor(user, vehicle)) throw new Error("not allowed");
    const key = followId(eventId), path = `flags.sr2e.vresist.${key}`;
    return vq(vehicleUuid, async () => {
      const cur = vehicle.getFlag("sr2e", "vresist")?.[key];
      if (op === "reserve") {
        if (vehicle.getFlag("sr2e", "vdmg")?.[eventId] != null) return { refused: "that damage has already been applied" };
        if (cur && cardWith("vresist.attempt", cur.id)) return { refused: "that roll is already on the table: click Resist again to apply it" };
        // The same player may restart one that's only reserved and spent nothing (an aborted roll).
        const unspent = cur?.state === "reserved" && controllerOf(vehicle)?.getFlag("sr2e", "stepSpend")?.[`wr-${cur.id}`] == null;
        if (cur && game.users.get(cur.user)?.active && !(force && user.isGM) && !(unspent && cur.user === user.id))
          return { refused: `${game.users.get(cur.user)?.name} is rolling it`, live: true };
        const id = foundry.utils.randomID(16);
        await vehicle.update({ [path]: { id, user: user.id, state: "reserved" } });
        return { attempt: id };
      }
      if (op === "arm") {
        if (cur?.id !== attempt || cur.state !== "reserved") return { refused: "that roll was replaced" };
        await vehicle.update({ [`${path}.state`]: "publishing" });
        return { armed: true };
      }
      throw new Error("unknown op");
    });
  });
  setFollowupDelivery(deliver);
  // Every SR2E card records the vehicle ruleset it was made under (plan 3a.8): an old card resolves by its own rules.
  Hooks.on("preCreateChatMessage", (doc) => {
    if (doc.flags?.sr2e && doc.flags.sr2e.vehicleRuleset == null) doc.updateSource({ "flags.sr2e.vehicleRuleset": isRigger2() ? "rigger2" : "core" });
  });
  game.settings.register("sr2e", "r2ControlPoolTerrain", {
    name: "Rigger 2: terrain limits the Control Pool",
    hint: "Optional rule (Rigger 2 p.53): on a vehicle's Damage Resistance Test, Control Pool dice are capped at the driving skill (open/normal), half of it (restricted) or a third (tight), rounded up.",
    scope: "world", config: true, type: Boolean, default: false
  });
  Hooks.once("ready", () => { gmPass().catch(err => console.error("SR2E | vehicle damage pass", err)); });
  Hooks.on("userConnected", (u, on) => { if (!on) gmPass().catch(() => {}); });
}

/** Re-run the GM pass (tests, the chase panel's Resume). */
export const vehicleDamagePass = gmPass;
export { terrainControlCap };
