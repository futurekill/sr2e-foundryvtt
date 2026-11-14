/**
 * Rigger 2 fuel (R2 p.81–83; docs/PLAN-vehicles-phase2.md 6a.1). EVERY change to `system.fuelLevel` — travel, chase
 * rounds, idle drones, flight maneuvers, leaks, refuelling and the owner's edits — is the GM op `fuel` in the vehicle
 * queue with its receipt `flags.sr2e.vfuel.<eventId>` in the same update. The op authorizes each change by its ORIGIN's
 * option (travel/chase/idle → r2Fuel, flight → r2FlightFuel, leak → r2Subsystems); refuelling and edits always pass.
 * Reaching 0 opens ONE exhaustion episode `flags.sr2e.fuelOut` (coasting → stopped | crash), in the same update.
 */
import { gmOp, gmCall, controllerOf } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { r2Option, isRigger2 } from "./vehicle-mode.mjs";
import { economyFor, fuelUsed, maneuverFuel, FLIGHT_MANEUVERS, coastSchedule, stallTurn, coastDistance } from "./rules/vehicle-fuel-rules.mjs";
const coastDistanceOf = (o) => coastDistance(o.startSpeed, o.accel, o.successes ?? 0);

const vq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const GATE = { travel: "r2Fuel", chase: "r2Fuel", idle: "r2Fuel", flight: "r2FlightFuel", leak: "r2Subsystems" };
const round3 = (n) => Math.round(n * 1000) / 1000;

/** Fuel left: blank = a full tank. */
export const fuelLeft = (v) => (v?.system?.fuelLevel == null ? Number(v?.system?.fuelSize) || 0 : Number(v.system.fuelLevel) || 0);
export const fuelOutOf = (v) => v?.getFlag("sr2e", "fuelOut") ?? null;

function mayFuel(user, v, origin) {
  if (user.isGM) return true;
  if (origin === "leak") return false;   // the GM's subsystem damage only
  return v.testUserPermission(user, "OWNER") || !!controllerOf(v)?.testUserPermission(user, "OWNER");
}

/**
 * The op. `travel`: km + band ("below" | "over" | "combat"); `chase`: metres (the chase passes its own receipts);
 * `idle`: hours (a drone's Idle Economy, hours per unit); `flight`: maneuver key + overLoad/tiltWing; `leak`: amount;
 * `refuel`: amount (null = fill); `edit`: level (absolute; blank = full).
 */
/** The coasting Turn this vehicle is in (its episode's next unprocessed Turn), or null. */
export function coastTurn(v) {
  const o = fuelOutOf(v);
  if (o?.state !== "coasting") return null;
  return coastSchedule(o.startSpeed, o.accel, o.successes ?? 0)[o.turnsProcessed] ?? null;
}

export function registerFuel() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const f = message.getFlag("sr2e", "fuelOutCard");
    if (!f) return;
    html.querySelector(".sr2e-fuel-coax")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const v = fromUuidSync(f.vehicleUuid);
      if (!v) return;
      const vp = await import("./vehicle-play.mjs");
      const driver = controllerOf(v);
      const res = await vp.rollDrivingTest(driver, v, await vp.promptDrivingTest(driver, v));
      if (res?.testMessageId) gmCall("fuelCoast", { vehicleUuid: v.uuid, testMessageId: res.testMessageId })
        .then(n => ui.notifications.info(`SR2E | ${n} successes: +${Math.floor(n / 2)} × Acceleration of coasting.`))
        .catch(err => ui.notifications.warn(`SR2E | ${err.message}`));
    });
  });
  // One Driving ("Vehicle") Test to coax more distance (p.82; R6-4: + Acceleration per 2 successes), once per episode.
  gmOp("fuelCoast", async ({ vehicleUuid, testMessageId }, user) => {
    const v = fromUuidSync(vehicleUuid);
    if (v?.type !== "vehicle" || !r2Option("r2Fuel")) throw new Error("not available");
    if (!mayFuel(user, v, "travel")) throw new Error("not allowed");
    const test = game.messages.get(testMessageId)?.getFlag("sr2e", "test");
    if (!test) throw new Error("no Driving Test card");
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    return vq(v.uuid, async () => {
      const o = fuelOutOf(v);
      if (o?.state !== "coasting") throw new Error(`${v.name} isn't coasting`);
      if (o.successes != null) throw new Error("the coasting test is already made");
      const n = testTotalSuccesses(test);
      await v.update({ "flags.sr2e.fuelOut.successes": n, "flags.sr2e.fuelOut.testMessageId": testMessageId });
      return n;
    });
  });

  gmOp("fuel", async (a, user) => {
    const v = fromUuidSync(a.vehicleUuid);
    if (v?.type !== "vehicle" || !isRigger2()) throw new Error("not a Rigger 2 vehicle");
    const origin = a.origin;
    if (!mayFuel(user, v, origin)) throw new Error("not allowed");
    if (GATE[origin] && !r2Option(GATE[origin])) throw new Error("that optional fuel rule is off");
    const id = a.eventId ?? foundry.utils.randomID(16);
    return vq(v.uuid, async () => {
      const prior = v.getFlag("sr2e", "vfuel")?.[id];
      if (prior) return prior;
      const size = Number(v.system.fuelSize) || 0, left = fuelLeft(v);
      const eco = v.system.effective?.economy ?? v.system.economy ?? 0;
      let used = 0, level = left, note = "";
      if (origin === "travel" || origin === "chase") {
        const km = origin === "chase" ? (Number(a.metres) || 0) / 1000 : Number(a.km) || 0;
        const e = economyFor({ base: eco, combat: a.band === "combat" || origin === "chase",
          speed: a.band === "over" ? 1 : 0, speedRating: a.band === "over" ? 1 : 0 });
        if (!(e > 0)) throw new Error(`${v.name} has no Economy Rating`);
        used = fuelUsed(km, e); note = `${round3(km)} km at Economy ${round3(e)}`;
      } else if (origin === "idle") {
        const perUnit = parseIdle(v.system.economyIdle);
        const hrs = Number(a.hours) || 0;
        if (!(perUnit > 0) && a.amount == null) throw new Error(`${v.name}'s Idle Economy "${v.system.economyIdle}" can't be read: the GM enters the fuel used`);
        used = a.amount != null ? Number(a.amount) || 0 : hrs / perUnit; note = `${round3(hrs)} hours idle`;
      } else if (origin === "flight") {
        const u = maneuverFuel(size, a.maneuver, { overLoad: !!a.overLoad, tiltWing: !!a.tiltWing });
        if (u == null) throw new Error("that maneuver doesn't apply to this aircraft");
        used = u; note = FLIGHT_MANEUVERS[a.maneuver]?.label ?? a.maneuver;
      } else if (origin === "leak") { used = Math.max(0, Number(a.amount) || 0); note = "leak"; }
      else if (origin === "refuel") { level = a.amount == null ? size : Math.min(size, left + Math.max(0, Number(a.amount) || 0)); note = "refuelled"; }
      else if (origin === "edit") { level = a.level == null || a.level === "" ? size : Math.max(0, Math.min(size, Number(a.level) || 0)); note = "set by hand"; }
      else throw new Error(`unknown fuel origin ${origin}`);
      if (used) level = Math.max(0, left - used);
      level = round3(level);
      const receipt = { origin, used: round3(left - level), level, note };
      const patch = { "system.fuelLevel": level >= size ? null : level, [`flags.sr2e.vfuel.${id}`]: receipt };
      // Running out of gas (p.81): ONE episode from the moment the tank reaches 0; refuelling ends it.
      const out = fuelOutOf(v);
      if (level <= 0 && left > 0 && !out && r2Option("r2Fuel")) {
        patch["flags.sr2e.fuelOut"] = { id, startSpeed: Number(a.speed ?? v.system.effective?.speed ?? v.system.speed) || 0,
          accel: Number(v.system.effective?.acceleration ?? v.system.acceleration) || 0, turnsProcessed: 0, extra: 0, state: "coasting", moved: {} };
      }
      if (level > 0 && out) patch["flags.sr2e.-=fuelOut"] = null;
      await v.update(patch);
      if (a.card !== false) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: v }), content: `<div class="sr2e-damage-result">
        <strong>${esc(v.name)}: fuel</strong> — ${esc(note)}${receipt.used > 0 ? `: ${receipt.used} ${esc(v.system.fuelUnit || "units")} used` : ""};
        ${level} / ${size} left (Rigger 2 p.81–83).${patch["flags.sr2e.fuelOut"] ? `<br><strong>Out of fuel:</strong> it loses 2 × Acceleration a Turn and
        coasts to a stop (${Math.round(coastDistanceOf(patch["flags.sr2e.fuelOut"]))} m). The driver may make one Vehicle Test to coax more distance
        (+ Acceleration per 2 successes).<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-fuel-coax">🛞 Coax more distance</button></div>` : ""}</div>`,
        flags: patch["flags.sr2e.fuelOut"] ? { sr2e: { fuelOutCard: { vehicleUuid: v.uuid } } } : {} });
      return receipt;
    });
  });
}

/** A drone's Idle Economy, as hours per unit ("1 hour/liter", "2 hrs/l"); 0 when unreadable (the GM enters it). */
export function parseIdle(text) {
  const m = String(text ?? "").match(/([\d.]+)\s*(h|hr|hrs|hour|hours)\b/i);
  return m ? Number(m[1]) || 0 : 0;
}

/** The sheet's fuel dialog (owner or GM). */
export async function fuelDialog(v) {
  const size = Number(v.system.fuelSize) || 0, left = fuelLeft(v), unit = v.system.fuelUnit || "units";
  const grades = r2Option("r2FuelGrades");
  const cur = v.getFlag("sr2e", "fuelGrade") ?? { grade: "regular", custom: 0 };
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: `Fuel — ${v.name}` },
    content: `<p>${left} / ${size} ${esc(unit)} left${fuelOutOf(v) ? " — <strong>out of fuel, coasting</strong>" : ""}. Economy ${v.system.effective?.economy ?? v.system.economy ?? 0} km/${esc(unit)} (Rigger 2 p.81–82).</p>
      <div class="form-group"><label>Do:</label><select name="op">
        ${r2Option("r2Fuel") ? `<option value="travel">Travel</option>` : ""}<option value="refuel">Refuel</option><option value="edit">Set the level</option>
        ${r2Option("r2Fuel") && v.system.vehicleType === "drone" ? `<option value="idle">Idle (drone)</option>` : ""}
        ${r2Option("r2FlightFuel") && v.system.vehicleType === "aircraft" ? Object.entries(FLIGHT_MANEUVERS).map(([k, f]) => `<option value="flight:${k}">${f.label}</option>`).join("") : ""}
      </select></div>
      <div class="form-group"><label>Travel km / idle hours / refuel or set amount:</label><input type="number" name="n" step="any" style="width:90px"></div>
      <div class="form-group"><label>Speed:</label><select name="band"><option value="below">below the Speed Rating</option><option value="over">1–1.5 × the Speed Rating</option><option value="combat">vehicle combat</option></select></div>
      <div class="form-group"><label><input type="checkbox" name="overLoad"> cargo over the Load Rating</label> <label><input type="checkbox" name="tiltWing"> tilt-wing</label></div>
      ${grades ? `<hr><div class="form-group"><label>Fuel grade (p.83):</label><select name="grade">${["cheap", "regular", "premium", "custom"].map(g => `<option value="${g}" ${cur.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select>
        <input type="number" name="custom" value="${cur.custom ?? 0}" style="width:50px" title="custom: ± Acceleration"></div>` : ""}`,
    ok: { label: "Apply", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
  if (!res) return;
  if (grades && (res.grade !== cur.grade || Number(res.custom) !== Number(cur.custom))) await v.update({ "flags.sr2e.fuelGrade": { grade: res.grade, custom: Number(res.custom) || 0 } });
  const n = res.n === "" || res.n == null ? null : Number(res.n);
  const [op, maneuver] = String(res.op).split(":");
  const args = { vehicleUuid: v.uuid, origin: op };
  if (op === "travel") { if (!(n > 0)) return; Object.assign(args, { km: n, band: res.band }); }
  if (op === "idle") { if (!(n > 0)) return; args.hours = n; }
  if (op === "refuel") args.amount = n;
  if (op === "edit") args.level = n;
  if (op === "flight") Object.assign(args, { maneuver, overLoad: !!res.overLoad, tiltWing: !!res.tiltWing });
  return gmCall("fuel", args).catch(err => ui.notifications.warn(`SR2E | ${err.message}`));
}

/**
 * The closing stage's fuel step for one combat Turn (6a.1; GM, inside the staged round change, resumable): every chase
 * vehicle with fuel burns this Turn's metres at the vehicle-combat Economy (receipt per vehicle and Turn), BEFORE the
 * chase moves; returns the chase entries' coasting metres to use instead of their speed.
 */
export async function fuelChaseStage(combat, r) {
  if (!r2Option("r2Fuel")) return {};
  const { chaseOf } = await import("./chase-state.mjs");
  const ch = chaseOf(combat), coast = {};
  for (const [eid, e] of Object.entries(ch?.entries ?? {})) {
    if (e?.kind !== "vehicle") continue;
    const v = fromUuidSync(e.uuid);
    if (!v || v.getFlag("sr2e", "missile")) continue;
    const ct = coastTurn(v);
    if (ct) { coast[eid] = ct.metres; continue; }
    if ((Number(e.speed) || 0) > 0 && fuelLeft(v) > 0)
      await gmCall("fuel", { vehicleUuid: v.uuid, origin: "chase", metres: Number(e.speed) || 0, speed: Number(e.speed) || 0,
        eventId: `chase-${combat.id}-${r}-${v.id}`, card: false });
  }
  return coast;
}

/**
 * After the chase moved (or for a vehicle in a combat without a chase), every coasting episode advances one Turn
 * (receipt `fuelOut.moved.<combatId>:<r>`): speed falls 2 × Acceleration; an aircraft's Crash Test is due at its Stall
 * Speed (p.82); at speed 0 it stops.
 */
export async function fuelAdvanceStage(combat, r) {
  if (!r2Option("r2Fuel")) return;
  const { chaseOf } = await import("./chase-state.mjs");
  const ch = chaseOf(combat);
  const vehicles = new Map();
  for (const e of Object.values(ch?.entries ?? {})) if (e?.kind === "vehicle") { const v = fromUuidSync(e.uuid); if (v) vehicles.set(v.uuid, v); }
  for (const c of combat.combatants) if (c.actor?.type === "vehicle") vehicles.set(c.actor.uuid, c.actor);
  const { postCrashTestDue } = await import("./vehicle-play.mjs");
  for (const v of vehicles.values()) {
    const o = fuelOutOf(v);
    if (o?.state !== "coasting") continue;
    const key = `${combat.id}:${r}`;
    const step = await vq(v.uuid, async () => {
      const live = fuelOutOf(v);
      if (live?.state !== "coasting" || live.moved?.[key] != null) return null;
      const sch = coastSchedule(live.startSpeed, live.accel, live.successes ?? 0);
      const t = sch[live.turnsProcessed];
      const next = sch[live.turnsProcessed + 1];
      const travelled = (live.travelled ?? 0) + (t?.metres ?? 0);
      const isAir = v.system.vehicleType === "aircraft";
      const stall = isAir ? stallTurn(sch, v.system.stallSpeed) : null;
      const crashNow = isAir && stall != null && live.turnsProcessed + 1 >= stall && !live.crashDue;
      const patch = { [`flags.sr2e.fuelOut.moved.${key}`]: t?.metres ?? 0, "flags.sr2e.fuelOut.turnsProcessed": live.turnsProcessed + 1,
        "flags.sr2e.fuelOut.travelled": travelled, ...(crashNow ? { "flags.sr2e.fuelOut.crashDue": true } : {}),
        ...(!next ? { "flags.sr2e.fuelOut.state": "stopped" } : {}) };
      await v.update(patch);
      return { next, crashNow, travelled, stopped: !next };
    });
    if (!step) continue;
    if (ch?.entries) {
      const eid = Object.entries(ch.entries).find(([, e]) => e?.uuid === v.uuid)?.[0];
      if (eid) await combat.update({ [`flags.sr2e.chase.entries.${eid}.speed`]: step.next?.speed ?? 0 });
    }
    if (step.crashNow) await postCrashTestDue(v, `ran out of fuel and fell to its Stall Speed (p.82; ${Math.round(step.travelled)} m coasted)`,
      { ruleset: "rigger2", speed: Number(v.system.stallSpeed) || 0 });
  }
}

