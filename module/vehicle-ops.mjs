/**
 * Rigger 2 special vehicle operations — Part 5c (R2 p.33–36; docs/PLAN-vehicles-phase2.md 5c). The arithmetic is in
 * module/rules/vehicle-ops-rules.mjs; Stress goes through the GM op `stress` (adjustStress, receipted); takeoff and
 * landing are Driving Tests (promptDrivingTest/rollDrivingTest with `flight`); legs keep a vehicle out of the chase
 * (chase.mjs); an ACV's crash cap lives in the crash record (vehicle-damage.mjs).
 */
import { controllerOf, riggedInto, adjustStress } from "./vehicle-play.mjs";
import { pullTest, armTestTn, armHandlingMod, ltProfileOf, runwayDistances } from "./rules/vehicle-ops-rules.mjs";
import { stressDice } from "./rules/vehicle-r2-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const num = (n) => Number(n) || 0;
const warn = (m) => ui.notifications.warn(m);
const prompt = (title, content, callback) => foundry.applications.api.DialogV2.prompt({ window: { title }, rejectClose: false,
  content, ok: { label: "Roll", callback: (_e, b) => callback(b.form.elements) } }).catch(() => null);
const bodyOf = (v) => num(v.system.effective?.body ?? v.system.body);

/* ── Pull Tests (p.33–34) ─────────────────────────────────────────────────────────────────────────────────────── */

export async function pullDialog(vehicle) {
  const load = num(vehicle.system.effective?.load ?? vehicle.system.load), body = bodyOf(vehicle);
  const maxPush = stressDice(99, body).dice;
  const ground = ["ground", "drone"].includes(vehicle.system.vehicleType);
  const f = await prompt(`Pull or lift — ${vehicle.name}`, `<p>Rigger 2 p.33–34: within the Load Rating (${load} kg) it's safe and needs no test;
      up to 2 × Load over a short distance, a <strong>Pull Test</strong> (the vehicle's Body ${body}). Only a crane, winch or boom lifts.</p>
    <div class="form-group"><label>Object's weight (kg)</label><input type="number" name="weight" value="${load}" min="0"></div>
    <div class="form-group"><label>Other vehicles pulling with it (their Load, kg)</label><input type="number" name="extra" value="0" min="0"></div>
    <div class="form-group"><label>Conditions</label><select name="conditions"><option value="">Normal</option><option value="bad">Bad (+1)</option><option value="terrible">Terrible (+3)</option></select></div>
    <div class="form-group"><label>Stuck in the ground (GM, +1 to +4)</label><input type="number" name="stuck" value="0" min="0" max="4"></div>
    ${ground ? `<label><input type="checkbox" name="noRollers"> Pulling along the ground without rollers (+4)</label>` : ""}
    <label><input type="checkbox" name="braced"> Braced in place (−2; it can't move)</label>
    ${maxPush ? `<div class="form-group"><label>Push it: +dice (2 Stress each, max ${maxPush})</label><input type="number" name="push" value="0" min="0" max="${maxPush}"></div>` : ""}`,
    (e) => ({ weight: num(e.weight.value), extra: num(e.extra.value), conditions: e.conditions.value, stuck: num(e.stuck.value),
      noRollers: !!e.noRollers?.checked, braced: e.braced.checked, push: num(e.push?.value) }));
  if (!f) return null;
  return rollPull(vehicle, f);
}

export async function rollPull(vehicle, f) {
  const body = bodyOf(vehicle), load = num(vehicle.system.effective?.load ?? vehicle.system.load) + num(f.extra);
  const t = pullTest({ weight: f.weight, load, conditions: f.conditions, stuck: f.stuck, noRollers: f.noRollers, braced: f.braced });
  if (!t.allowed) return warn(`${vehicle.name} can't move ${f.weight} kg: more than twice the Load Rating (${load} kg) is beyond a Pull Test (Rigger 2 p.33).`);
  // Within the Load Rating it's safe and needs no test (p.33; 5c review #5) — unless the GM's conditions make it one
  // (the table's ≤ 1 × Load row, TN 3: a load stuck in mud, a cliff), which the dialog's modifiers show.
  const hard = f.conditions || num(f.stuck) || f.noRollers;
  if (t.ratio <= 1 && !hard) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)}</strong> moves ${num(f.weight)} kg safely: within its Load Rating (${load} kg), no test (Rigger 2 p.33).</div>` });
  const driver = controllerOf(vehicle);
  const push = stressDice(f.push, body);
  if (push.stress) await adjustStress(vehicle, push.stress, { reason: "extra Pull Test dice (Rigger 2 p.33)", driverUuid: driver?.uuid ?? "" });
  const label = `${vehicle.name}: Pull Test (${t.parts.map(([n, m], i) => `${n} ${i && m > 0 ? "+" : ""}${m}`).join(", ")})${push.dice ? `, +${push.dice} pushed (${push.stress} Stress)` : ""}`;
  const res = await vehicle.rollSuccessTest(body + push.dice, t.tn, { label });
  if (!res) return null;
  const lines = [res.successes > 0 ? `<strong>It moves the load.</strong>` : `<strong>The Pull Test fails</strong> — the side effects still apply.`];
  if (t.speed) lines.push(`While it pulls: ${t.speed === "half" ? "half" : "a quarter of its"} Speed, and <strong>+1 Stress per ${t.stress}</strong> (Rigger 2 p.34).`);
  // Over 1.5 × Load: a Body (4) Test, or +1 Stress (p.34) — rolled now, once per Pull Test.
  if (t.extraBodyTest) {
    const b = await vehicle.rollSuccessTest(body, 4, { label: `${vehicle.name}: Body (4) Test — over 1.5 × Load (Rigger 2 p.34)` });
    if (b && b.successes === 0) {
      await adjustStress(vehicle, 1, { eventId: `pullx-${res.testMessageId}`, reason: "over 1.5 × Load (Rigger 2 p.34)", driverUuid: driver?.uuid ?? "" });
      lines.push("The Body (4) Test failed: <strong>+1 Stress</strong>.");
    } else if (b) lines.push("The Body (4) Test held.");
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    flags: t.stress ? { sr2e: { pullStress: { vehicleUuid: vehicle.uuid, rate: t.stress } } } : {},
    content: `<div class="sr2e-damage-result"><strong>${esc(vehicle.name)}: Pull Test</strong><br>${lines.join("<br>")}
      ${t.stress ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-pull-stress">+1 Stress (another ${t.stress} of pulling)</button></div>` : ""}</div>` });
}

/** The pull card's button: one more hour/minute of over-Load pulling = +1 Stress, each click receipted on its own. */
export function bindPullCard(message, html) {
  const p = message.flags?.sr2e?.pullStress;
  if (!p) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  root?.querySelector(".sr2e-pull-stress")?.addEventListener("click", async () => {
    const v = fromUuidSync(p.vehicleUuid);
    if (!v) return;
    await adjustStress(v, 1, { reason: `pulling over Load for another ${p.rate} (Rigger 2 p.34)`, driverUuid: controllerOf(v)?.uuid ?? "" })
      .then(r => ui.notifications.info(`${v.name}: Stress ${r?.stress ?? "+1"}.`)).catch(err => warn(err.message));
  });
}

/* ── Mechanical arms (p.34–35) ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Who works the arm: the character controlling the vehicle, else — a DRONE only — the drone itself on its Pilot (p.34),
 * with what its own tests get (5c review #6): a robot's Threat dice and its network's meaconing modifier.
 */
function armHands(vehicle) {
  const c = controllerOf(vehicle);
  if (c) return { actor: c, rigged: riggedInto(c, vehicle), dice: num(c.system.quickness?.value), what: "Quickness" };
  if (vehicle.system.vehicleType !== "drone") return null;
  const pilot = num(vehicle.system.effective?.pilot ?? vehicle.system.pilot);
  const threat = vehicle.system.isRobot ? Math.max(0, num(vehicle.system.threatRating)) : 0;
  return pilot > 0 ? { actor: vehicle, rigged: false, dice: pilot + threat, threat, what: threat ? `Pilot + ${threat} Threat` : "Pilot", drone: true } : null;
}
/** The drone's network meaconing on its own test (R2 p.70; 5b.3), 0 when not networked. */
async function droneMod(vehicle) { return (await import("./ew.mjs")).droneTestMod(vehicle); }
/** A drone's Learning Pool and IVIS Pool on its own test, as its Driving Test offers them (p.67). */
async function dronePools(vehicle, label) {
  const LP = await import("./learning-pool.mjs"), RC = await import("./rc-net.mjs");
  const learnMax = LP.learningUsable(vehicle) ? LP.learningBalance(vehicle) : 0, ivisMax = RC.ivisBalance(vehicle);
  if (!learnMax && !ivisMax) return { n: 0, notes: [] };
  const scope = vehicle.system.learningPool?.scope ?? "";
  const f = await foundry.applications.api.DialogV2.prompt({ window: { title: label }, rejectClose: false,
    content: `${learnMax ? `<div class="form-group"><label>Learning Pool (max ${learnMax})</label><input type="number" name="l" value="0" min="0" max="${learnMax}"></div>
      ${scope ? `<label><input type="checkbox" name="s"> Within “${esc(scope)}” (the GM may veto)</label>` : ""}` : ""}
      ${ivisMax ? `<div class="form-group"><label>IVIS Pool (max ${ivisMax})</label><input type="number" name="i" value="0" min="0" max="${ivisMax}"></div>` : ""}`,
    ok: { label: "Roll", callback: (_e, b) => ({ l: num(b.form.elements.l?.value), s: !!b.form.elements.s?.checked, i: num(b.form.elements.i?.value) }) } }).catch(() => null);
  if (!f) return null;
  const learn = f.l > 0 && (!scope || f.s) ? await LP.spendLearning(vehicle, Math.min(f.l, learnMax), { scope }) : { n: 0 };
  const { gmCall } = await import("./vehicle-play.mjs");
  const ivis = f.i > 0 ? await gmCall("rcIvisSpend", { vehicleUuid: vehicle.uuid, n: Math.min(f.i, ivisMax) }) : { n: 0 };
  const notes = [learn.n ? `+${learn.n} Learning Pool` : "", ivis.n ? `+${ivis.n} IVIS Pool` : ""].filter(Boolean);
  return { n: learn.n + ivis.n, notes, flags: learn.n ? { sr2e: { learningSpend: { vehicleUuid: vehicle.uuid, eventId: learn.eventId, n: learn.n, scope } } } : undefined };
}

export async function armTestDialog(vehicle) {
  const h = armHands(vehicle);
  if (!h) return warn(`${vehicle.name} has no one controlling it${vehicle.system.vehicleType === "drone" ? " and no Pilot" : ""} to work its arm.`);
  const handling = num(vehicle.system.effectiveHandling);
  const poolMax = h.rigged ? Math.min(num(h.actor.system.dicePools?.control?.value), h.dice) : 0;
  const f = await prompt(`Arm Test — ${vehicle.name}`, `<p>Rigger 2 p.34: ${esc(h.actor.name)}'s ${h.what} (${h.dice}) vs the Handling (${handling}).
      The GM may lower the TN for a simple task or raise it for a hard one.</p>
    <div class="form-group"><label>GM's TN change</label><input type="number" name="gm" value="0"></div>
    ${poolMax ? `<div class="form-group"><label>Control Pool (rigged, max ${poolMax})</label><input type="number" name="pool" value="0" min="0" max="${poolMax}"></div>` : ""}`,
    (e) => ({ gm: num(e.gm.value), pool: num(e.pool?.value) }));
  if (!f) return null;
  const label = `${vehicle.name}: Arm Test (${h.what}; Handling ${handling}${f.gm ? `, GM ${f.gm > 0 ? "+" : ""}${f.gm}` : ""}; Rigger 2 p.34)`;
  if (h.drone) {
    const pools = await dronePools(vehicle, label);
    if (!pools) return null;
    const mod = await droneMod(vehicle);
    return vehicle.rollSuccessTest(h.dice + pools.n, armTestTn(handling, f.gm + mod), { label: `${label}${pools.notes.length ? `, ${pools.notes.join(", ")}` : ""}${mod ? `, meaconing +${mod}` : ""}`,
      ...(pools.flags ? { flags: pools.flags } : {}) });
  }
  const paid = f.pool > 0 ? await h.actor._payControl(Math.min(f.pool, poolMax), h.dice) : 0;
  return h.actor.rollSuccessTest(h.dice, armTestTn(handling, f.gm), { label, paidPoolDice: paid ? { control: paid } : undefined });
}

/** A Skill Test through the arm (p.34): the skill's usual TN, +1 per Handling point above 3; a drone uses its Pilot. */
export async function armSkillDialog(vehicle) {
  const h = armHands(vehicle);
  if (!h) return warn(`${vehicle.name} has no one controlling it${vehicle.system.vehicleType === "drone" ? " and no Pilot" : ""} to work its arm.`);
  const mod = armHandlingMod(vehicle.system.effectiveHandling);
  const skills = h.drone ? [] : h.actor.items.filter(i => i.type === "skill" && num(i.system.rating) > 0).sort((a, b) => a.name.localeCompare(b.name));
  const f = await prompt(`Skill through the arm — ${vehicle.name}`, `<p>Rigger 2 p.34: the skill's usual target number +${mod} (Handling ${vehicle.system.effectiveHandling} above 3).</p>
    ${h.drone ? `<p>The drone uses its Pilot (${h.dice}).</p>` : `<div class="form-group"><label>Skill</label><select name="skill">${skills.map(s => `<option value="${s.id}">${esc(s.name)} ${s.system.rating}</option>`).join("")}</select></div>`}
    <div class="form-group"><label>The task's TN</label><input type="number" name="tn" value="4" min="2"></div>`,
    (e) => ({ skill: e.skill?.value ?? "", tn: Math.max(2, num(e.tn.value)) }));
  if (!f) return null;
  const tn = f.tn + mod, label = `${vehicle.name}'s arm: TN ${f.tn} + ${mod} Handling (Rigger 2 p.34)`;
  if (h.drone) {
    const pools = await dronePools(vehicle, label);
    if (!pools) return null;
    const em = await droneMod(vehicle);
    return vehicle.rollSuccessTest(h.dice + pools.n, tn + em, { label: `${label}, ${h.what}${pools.notes.length ? `, ${pools.notes.join(", ")}` : ""}${em ? `, meaconing +${em}` : ""}`,
      ...(pools.flags ? { flags: pools.flags } : {}) });
  }
  return h.actor.rollSkillTest(f.skill, tn, { label });
}

/** A melee attack with the arm (p.35): the controller's Unarmed Strike, through the arm's Strength and Handling. */
export async function armMelee(vehicle) {
  const arms = vehicle.system.effective?.arms ?? [];
  const c = controllerOf(vehicle);
  if (!arms.length) return warn(`${vehicle.name} has no working mechanical arm.`);
  if (!c) return warn(`Someone has to control ${vehicle.name} to swing its arm (Rigger 2 p.35).`);
  let arm = arms[0];
  if (arms.length > 1) {
    const id = await foundry.applications.api.DialogV2.prompt({ window: { title: "Which arm?" }, rejectClose: false,
      content: `<select name="a">${arms.map(a => `<option value="${a.itemId}">${esc(a.name)} (Strength ${a.strength})</option>`).join("")}</select>`,
      ok: { label: "Attack", callback: (_e, b) => b.form.elements.a.value } }).catch(() => null);
    arm = arms.find(a => a.itemId === id);
    if (!arm) return null;
  }
  const unarmed = c.items.find(i => i.type === "weapon" && i.name === "Unarmed Strike");
  if (!unarmed) return warn(`${c.name} has no Unarmed Strike to swing the arm with.`);
  const { rollWeaponInteractive } = await import("./sheets/sheet-actions.mjs");
  return rollWeaponInteractive(c, unarmed, { vehicleArm: { vehicleUuid: vehicle.uuid, itemId: arm.itemId } });
}

/* ── Aircraft (p.36) ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Takeoff or landing: the runway it needs, and — on an unusual surface, in bad weather or combat — the Driving Test. */
export async function flightDialog(vehicle) {
  const sys = vehicle.system;
  const profile = sys.vehicleType === "rotor" ? "vtol" : ltProfileOf(sys.ltProfile);
  const body = bodyOf(vehicle), under = runwayDistances(body, profile), over = runwayDistances(body, profile, { loaded: true });
  const pick = await foundry.applications.api.DialogV2.wait({ window: { title: `Takeoff or landing — ${vehicle.name}` }, rejectClose: false,
    content: `<p>Rigger 2 p.36. ${profile === "vtol" ? "VTOL: no runway needed." : `Runway (${profile.toUpperCase()}, Body ${body}): takeoff ${under.takeoff} m / landing ${under.landing} m
      under the Load Rating; ${over.takeoff} m / ${over.landing} m at or over it.`}</p>
      <p>A takeoff or landing from an irregular surface, in adverse weather or in combat needs a Driving Test.</p>`,
    buttons: [{ action: "takeoff", label: "Takeoff test" }, { action: "landing", label: "Landing test" }, { action: "none", label: "No test needed" }] }).catch(() => null);
  if (!pick || pick === "none") return null;
  const vp = await import("./vehicle-play.mjs");
  const driver = controllerOf(vehicle);
  return vp.rollDrivingTest(driver, vehicle, await vp.promptDrivingTest(driver, vehicle, { flight: pick }));
}

export function registerVehicleOps() {
  Hooks.on("renderChatMessageHTML", (message, html) => bindPullCard(message, html));
}
