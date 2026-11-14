/**
 * Rigger 2 indirect fire and area-effect attacks (R2 p.60–61; docs/PLAN-vehicles-phase2.md 4b.5–4b.6).
 *
 * Equipment (p.60): the FDDM route — the spotter, the weapon's platform and the rigger's remote-control deck each carry
 * a BattleTac FDDM (`flags.sr2e.rule: "fddm"`: receiver module, Snake-Eyes, master units) — or a target designator
 * (`designator-laser|microwave|radar`). The GM may override a missing endpoint (stated on the card).
 *
 * The spotting is a durable record on the SPOTTER, `flags.sr2e.guidance.<id> = { spotterUuid, route, deviceId |
 * designatorItemId, targetUuid, successes, messageId, deps, launches: [], state: acquired|committed|lost|ended,
 * combatId, round }`, written by the GM from the spotter's Indirect Fire Test card. A missile launch citing it commits
 * it (+2 to the spotter's other Success Tests, riggerTnParts); Phase 0 re-checks its contact: valid → the Missile
 * Attack Test adds the spotting successes; lost → the area-effect branch (radar-designator TN, no spotting successes).
 */
import { gmOp, gmCall, controllerOf } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { workingImplant } from "./drugs.mjs";
import { areaEffect, scatter, SCATTER, indirectFireTest } from "./rules/vehicle-gunnery-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const hq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);
const ruleOf = (i) => i?.flags?.sr2e?.rule ?? "";
/** Designator ranges (the Area-Effect Target Numbers Table's extreme band, p.61). */
const DESIGNATOR_RANGE = { laser: 5000, microwave: 8000, radar: 10000 };

/** An item that works where it is: installed ware, equipped gear, a working vehicle mod. */
function working(actor, i) {
  if (i.type === "cyberware" || i.type === "bioware") return workingImplant(actor, i);
  if (i.type === "vehicle_mod") return ["", "done", "factory"].includes(i.system.custom?.state ?? "");
  return i.system.equipped !== false;
}
export const hasFddm = (actor) => !!actor?.items?.some(i => ruleOf(i) === "fddm" && working(actor, i));
export function designatorOf(actor) {
  const i = actor?.items?.find(x => ruleOf(x).startsWith("designator-") && working(actor, x));
  return i ? { item: i, kind: ruleOf(i).slice("designator-".length) } : null;
}
export const guidanceOf = (spotter) => spotter?.getFlag("sr2e", "guidance") ?? {};
/** A committed spotting gives the spotter +2 to all OTHER Success Tests (p.60). */
export const spottingTnMod = (actor) => [actor, ...(actor?.system?.controlledVehicles ?? []).map(u => fromUuidSync(u))]
  .some(a => Object.values(guidanceOf(a)).some(g => g.state === "committed")) ? 2 : 0;   // a rigger spotting through their vehicle too

/** Is this actor keeping a designator on a committed spotting (p.60's Second Firearm case)? */
export const designatorBusy = (actor) => Object.values(guidanceOf(actor)).some(g => g.state === "committed" && g.designatorItemId);

/** The p.60 equipment for this spotting: { route, ok, missing[] }. */
export function indirectEquipment({ spotter, weaponActor = null, deckOwner = null }) {
  const des = designatorOf(spotter);
  if (des) return { route: "designator", ok: true, missing: [], designator: des };
  const missing = [];
  if (!hasFddm(spotter)) missing.push(`${spotter?.name ?? "the spotter"} (FDDM)`);
  if (weaponActor && !hasFddm(weaponActor)) missing.push(`${weaponActor.name} (FDDM receiver)`);
  if (deckOwner && !hasFddm(deckOwner)) missing.push(`${deckOwner.name}'s remote-control deck (FDDM master unit)`);
  return { route: "fddm", ok: !missing.length, missing };
}

/** Is a spotting still in contact (R4-2)? A vehicle's sensors: the lock's generations. A designator: still working and
 *  the target in its range when measurable. shortcut: a character's designator isn't swept between checks (its range is
 *  measured at each check, not on every move); upgrade if designator spotters become common. */
export async function guidanceValid(g) {
  const spotter = fromUuidSync(g.spotterUuid), target = fromUuidSync(g.targetUuid);
  if (!spotter || !target || !["acquired", "committed"].includes(g.state)) return false;
  const S = await import("./vehicle-sensors.mjs");
  if (g.deviceId && spotter.type === "vehicle") return S.contactOk(spotter, g.deviceId, target, g.deps);
  const des = designatorOf(spotter);
  if (!des || des.item.id !== g.designatorItemId) return false;
  const d = S.distanceBetween(spotter, target);
  return d == null || d <= (DESIGNATOR_RANGE[des.kind] ?? Infinity);
}

export function registerIndirect() {
  // The GM records a spotting from the spotter's Indirect Fire Test card (successes read from the card, never sent).
  gmOp("guidanceRecord", async ({ messageId }, user) => {
    const msg = game.messages.get(messageId), st = msg?.getFlag("sr2e", "indirectFire"), test = msg?.getFlag("sr2e", "test");
    if (!st || !test) throw new Error("not an Indirect Fire Test");
    const spotter = fromUuidSync(st.spotterUuid), target = fromUuidSync(st.targetUuid);
    if (!spotter || !target) throw new Error("the spotter or the target is gone");
    if (!user.isGM && !spotter.testUserPermission(user, "OWNER") && !controllerOf(spotter)?.testUserPermission(user, "OWNER")) throw new Error("not allowed");
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    const successes = testTotalSuccesses(test);
    return hq(spotter.uuid, async () => {
      const id = st.id;
      if (guidanceOf(spotter)[id]) return guidanceOf(spotter)[id];
      if (!successes) return null;   // p.60: a failed test is no lock (an area-effect attack remains possible)
      const S = await import("./vehicle-sensors.mjs");
      const sensor = spotter.type === "vehicle" && !st.designatorItemId ? S.sensorOf(spotter) : null;
      const rec = { id, spotterUuid: spotter.uuid, route: st.route, targetUuid: target.uuid, targetTokenUuid: st.targetTokenUuid ?? "",
        successes, messageId, launches: [], state: "acquired", combatId: st.combatId ?? "", round: st.round ?? 0,
        ...(sensor ? { deviceId: sensor.id, deps: S.contactDeps(spotter, sensor.id, target) } : { designatorItemId: st.designatorItemId ?? "" }) };
      await spotter.update({ [`flags.sr2e.guidance.${id}`]: rec });
      return rec;
    });
  });

  // A launch citing a spotting commits it (p.60), from the GM's missileLaunch; idempotent by launch id.
  gmOp("guidanceCommit", async ({ spotterUuid, guidanceId, launchId, targetUuid }) => {
    const spotter = fromUuidSync(spotterUuid);
    return hq(spotterUuid, async () => {
      const g = guidanceOf(spotter)[guidanceId];
      if (!g || !["acquired", "committed"].includes(g.state)) throw new Error("that spotting is no longer valid");
      if (g.targetUuid !== targetUuid) throw new Error("the spotter is locked on another target");
      if (!(await guidanceValid(g))) throw new Error("the spotter has lost the target");
      if (!g.launches.includes(launchId)) await spotter.update({ [`flags.sr2e.guidance.${guidanceId}.launches`]: [...g.launches, launchId],
        [`flags.sr2e.guidance.${guidanceId}.state`]: "committed" });
      return { ...g, state: "committed" };
    });
  });

  // End a spotting (cleanup: every linked launch terminal, or its Turn closed unused) or mark it lost.
  gmOp("guidanceEnd", async ({ spotterUuid, guidanceId, state = "ended" }) => {
    const spotter = fromUuidSync(spotterUuid);
    return hq(spotterUuid, async () => {
      const g = guidanceOf(spotter)[guidanceId];
      if (g && !["ended", "lost"].includes(g.state)) await spotter.update({ [`flags.sr2e.guidance.${guidanceId}.state`]: state });
      return true;
    });
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (message.getFlag("sr2e", "indirectFire")) html.querySelectorAll?.(".sr2e-guidance-record").forEach(b => b.addEventListener("click", (ev) => {
      ev.preventDefault();
      gmCall("guidanceRecord", { messageId: message.id }).then(r => ui.notifications.info(r ? "SR2E | Target lock recorded for indirect fire." : "SR2E | No lock (the test failed)."))
        .catch(err => ui.notifications.warn(`SR2E | ${err.message}`));
    }));
    const ae = message.getFlag("sr2e", "areaEffect");
    if (ae) html.querySelectorAll?.(".sr2e-area-effect").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); areaEffectAttack(ae).catch(err => ui.notifications.warn(`SR2E | ${err.message}`)); }));
  });
}

/**
 * The spotter's Indirect Fire Test (p.60): Indirect Fire Concentration, else Gunnery at +2, + ⌊missile Sensor ÷ 2⌋ +
 * missile Intelligence; TN = the target's Signature (+ the GM's visibility); no Combat Pool; a Complex Action.
 */
export async function promptIndirectFire(spotter, { targetToken = null } = {}) {
  const tok = targetToken ?? [...(game.user.targets ?? [])][0] ?? null, target = tok?.actor;
  if (!target) return ui.notifications.warn("SR2E | Target the token to spot for indirect fire.");
  const S = await import("./vehicle-sensors.mjs");
  const eq = indirectEquipment({ spotter, deckOwner: null });
  const missiles = [];
  for (const a of game.actors) for (const i of a.items) if (i.type === "weapon" && i.system.ammo?.guided?.kind === "missile" && a.testUserPermission(game.user, "OBSERVER"))
    missiles.push({ uuid: i.uuid, label: `${a.name}: ${i.system.ammo.loadedName || i.name} (Int ${i.system.ammo.guided.intelligence}, Sensor ${i.system.ammo.guided.sensor})`, g: i.system.ammo.guided });
  const sig = S.baseSignature(target, null);
  // A vehicle spots with its sensors; its controller (the rigger) rolls (p.60).
  const roller = spotter.type === "vehicle" ? controllerOf(spotter) : spotter;
  if (!roller) return ui.notifications.warn(`SR2E | ${spotter.name} has no controller to make the Indirect Fire Test.`);
  const skill = roller.items.find(i => i.type === "skill" && /gunnery/i.test(i.name));
  // The Indirect Fire Concentration of Gunnery (p.60): its own rating when the skill has it.
  const c = skill?.system?.concentration;
  const conc = c && /indirect/i.test(c.name ?? "") && c.rating > 0 ? c.rating : null;
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: `Indirect Fire Test — ${spotter.name}` },
    content: `<p>Spot <strong>${esc(target.name)}</strong> for indirect fire (Rigger 2 p.60). ${eq.ok ? `Equipment: ${eq.route === "designator" ? `${esc(eq.designator.item.name)}` : "BattleTac FDDM"}.`
      : `<span style="color:#c44">Missing FDDM: ${eq.missing.map(esc).join(", ")}${game.user.isGM ? " — GM override below" : ""}.</span>`}</p>
      <div class="form-group"><label>Missile:</label><select name="missile">${missiles.map(m => `<option value="${m.uuid}">${esc(m.label)}</option>`).join("")}<option value="">— another (enter below) —</option></select></div>
      <div class="form-group"><label>Intelligence / Sensor (if another):</label><input type="number" name="int" value="0" style="width:50px"> <input type="number" name="sen" value="0" style="width:50px"></div>
      <div class="form-group"><label>Signature${sig == null ? " (GM)" : ""}:</label><input type="number" name="sig" value="${sig ?? ""}" style="width:60px" ${sig != null && !game.user.isGM ? "readonly" : ""}></div>
      <div class="form-group"><label>Visibility (GM, p.89):</label><input type="number" name="vis" value="0" style="width:50px"></div>
      ${game.user.isGM && !eq.ok ? `<div class="form-group"><label><input type="checkbox" name="override"> GM: allow without the missing FDDM</label></div>` : ""}`,
    ok: { label: "Roll", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
  if (!res) return;
  if (!eq.ok && !res.override) return ui.notifications.warn(`SR2E | Indirect fire needs a BattleTac FDDM on ${eq.missing.join(", ")} or a target designator (Rigger 2 p.60).`);
  const picked = missiles.find(m => m.uuid === res.missile)?.g ?? { intelligence: Number(res.int) || 0, sensor: Number(res.sen) || 0 };
  const base = Number.isFinite(Number(res.sig)) && res.sig !== "" ? Number(res.sig) : null;
  if (base == null) return ui.notifications.warn("SR2E | The GM must set this target's Signature (Rigger 2 p.61).");
  const gun = skill?.system?.rating ?? 0;
  const t = indirectFireTest({ concentration: conc, gunnery: gun, sensor: picked.sensor, intelligence: picked.intelligence });
  const tn = Math.max(2, base + (Number(res.vis) || 0) + t.tnMod);
  const id = foundry.utils.randomID(16);
  const combat = game.combat;
  const result = await roller.rollSuccessTest(t.dice, tn, {
    label: `Indirect Fire Test → ${target.name} (R2 p.60: ${conc != null ? "Indirect Fire Concentration" : "Gunnery +2 TN"}, +${t.dice - (conc ?? gun)} missile dice)`,
    sourceLabel: "Indirect Fire", tnContext: { kind: "indirectFire", key: "gunnery", skillCategory: "active" },
    flags: { sr2e: { indirectFire: { id, spotterUuid: spotter.uuid, targetUuid: target.uuid, targetTokenUuid: tok.document?.uuid ?? tok.uuid,
      route: eq.ok ? eq.route : "override", designatorItemId: eq.designator?.item.id ?? "", combatId: combat?.id ?? "", round: combat?.round ?? 0 } } } });
  if (!result) return;
  await gmCall("guidanceRecord", { messageId: result.testMessageId }).catch(err => ui.notifications.warn(`SR2E | ${err.message}`));
}

/**
 * An area-effect attack (p.60–61): the TN from the Area-Effect Target Numbers Table by device and range, a Gunnery Test
 * (Combat Pool allowed; no Sensor or missile Intelligence dice), then the Remote Gunnery Scatter (always scatters;
 * each success −4 m short/medium, −15 m long/extreme; ≤ 0 on target). `ae` = { gunnerUuid, device, distance, flux,
 * lostAfterSpotting, name }.
 */
export async function areaEffectAttack(ae) {
  const gunner = fromUuidSync(ae.gunnerUuid);
  if (!gunner) throw new Error("the gunner is gone");
  if (!gunner.isOwner) throw new Error("the gunner's player or the GM rolls this");
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: `Area-effect attack — ${ae.name ?? ""}` },
    content: `<p>Rigger 2 p.60–61${ae.lostAfterSpotting ? ": the lock was lost after a successful Indirect Fire Test — the TN as for a radar designator; the spotting successes don't count" : ""}.</p>
      <div class="form-group"><label>Targeting device:</label><select name="device">${[["laser", "Laser designator"], ["microwave", "Microwave designator"], ["radar", "Radar designator"], ["sensor", "Vehicle sensor only"]]
        .map(([k, l]) => `<option value="${k}" ${k === (ae.lostAfterSpotting ? "radar" : ae.device ?? "sensor") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="form-group"><label>Range (m) — spotter's device or vehicle sensor to the target:</label><input type="number" name="dist" value="${ae.distance ?? ""}" style="width:80px"></div>
      <div class="form-group"><label>Sensor Flux (vehicle sensor only):</label><input type="number" name="flux" value="${ae.flux ?? 0}" style="width:60px"></div>
      <div class="form-group"><label>Combat Pool dice:</label><input type="number" name="pool" value="0" min="0" style="width:60px"></div>`,
    ok: { label: "Roll", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
  if (!res) return;
  const band = areaEffect(res.device, Number(res.dist), Number(res.flux) || 0);
  if (!band) return ui.notifications.warn("SR2E | Outside every range on the Area-Effect Target Numbers Table (Rigger 2 p.61): the GM's call.");
  const skill = gunner.items.find(i => i.type === "skill" && /gunnery/i.test(i.name))?.system?.rating ?? 0;
  const r = await gunner.rollSuccessTest(skill, band.tn, { label: `Area-effect attack: ${band.band} range, TN ${band.tn} (R2 p.61)`, sourceLabel: "Gunnery",
    poolDice: Number(res.pool) ? { combat: Number(res.pool) } : undefined, tnContext: { kind: "attack", key: "gunnery", skillCategory: "active" } });
  if (!r) return;
  const sc = SCATTER[band.band];
  const roll = await new Roll(`${sc.dice}d6`).evaluate();
  const succ = r.successes ?? 0;
  const m = scatter(band.band, roll.total, succ);
  const d6 = (await new Roll("1d6").evaluate()).total;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: gunner }), content: `<div class="sr2e-damage-result">
    <strong>Scatter (Remote Gunnery Scatter Table, R2 p.61):</strong> ${sc.dice}D6 × ${sc.mult} = ${roll.total * sc.mult} m − ${succ} × ${sc.cut} m
    → ${m ? `<strong>${m} m</strong>, Scatter Diagram ${d6} (core p.97)` : "<strong>on target</strong>"}. Damage by the standard rules (living targets) or
    Vehicle Damage from Weapons (p.53).</div>` });
}

/** Turn-end cleanup (4b.5): a spotting never used ends with its Turn; a committed one when every linked launch is terminal. */
export async function guidanceCleanup(combat, r) {
  const { launchesOf } = await import("./vehicle-missiles.mjs");
  const actors = new Set([...game.actors, ...game.scenes.contents.flatMap(sc => sc.tokens.contents.map(t => t.actor).filter(Boolean))]);
  const state = new Map();
  for (const a of actors) for (const [id, l] of Object.entries(launchesOf(a))) state.set(id, l.state);
  const terminal = (id) => ["resolved", "lost", "cancelled"].includes(state.get(id));
  for (const a of actors) {
    for (const g of Object.values(guidanceOf(a))) {
      if (g.combatId && g.combatId !== combat.id) continue;
      const end = (g.state === "acquired" && (g.round ?? 0) <= r) || (g.state === "committed" && g.launches.every(terminal));
      if (end) await gmCall("guidanceEnd", { spotterUuid: a.uuid, guidanceId: g.id }).catch(() => {});
    }
  }
}

/** The Missile Attack Test's spotter dice for an indirect launch at Phase 0, or the area-effect branch (p.60). */
export async function indirectAtPhase0(l) {
  const spotter = fromUuidSync(l.guidance?.spotterUuid), g = guidanceOf(spotter)[l.guidance?.id];
  if (g && await guidanceValid(g)) return { ok: true, successes: g.successes };
  if (spotter && g) await gmCall("guidanceEnd", { spotterUuid: spotter.uuid, guidanceId: g.id, state: "lost" }).catch(() => {});
  return { ok: false };
}
