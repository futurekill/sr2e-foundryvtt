/**
 * One authoritative ammunition queue under Rigger 2 (docs/PLAN-vehicles-phase2.md 4b.4). EVERY mutation of a weapon's
 * loaded ammunition — ordinary attacks, missile launches, cancellations, reloads — is the GM op `ammo`, run by the
 * active GM in the queue `ammo:<weaponUuid>`, with its receipt in the SAME weapon update:
 *   weapon flags.sr2e.ammoReceipts.<eventId> = { spent } | { payload } | { cancelled: true }
 *   weapon flags.sr2e.reloadPlans.<reloadId>  = { clipRev, need, eject, ejectTo, retained, ammoItemId, state }
 *   reserve item flags.sr2e.reserveReceipts.<reloadId> = { loaded, props, escrow, cancelAck }   (the money writer's)
 *   eject item  flags.sr2e.escrowReleased.<reloadId> = true
 * A reload is a journalled transaction: (1) GM plan, fencing the weapon → (2) the reserve owner's money writer debits
 * the reserve (receipt on the reserve item, one write) → (3) GM settle: clip = retained + loaded → (4) the money writer
 * credits the escrowed ejected rounds → (5) GM lifts the fence. Cancellation only from `planned`: the GM writes
 * `cancelled` first; the money writer refunds any debit with its acknowledgement; only that ack lifts the fence.
 * Every step is idempotent and re-run by `reconcileReloads` on ready and on every relevant update, so a reload or
 * a crash part-way resumes.
 */
import { gmOp, gmCall, controllerOf } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { moneyQueue, applyUpdate } from "./money.mjs";
import { moneyWriterFor } from "./vehicle-customize.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";

const isActiveGM = () => !!game.users.activeGM?.isSelf;
const aq = (uuid, fn) => enqueueAttack(`ammo:${uuid}`, fn);
const plansOf = (w) => w?.getFlag("sr2e", "reloadPlans") ?? {};
const receiptsOf = (w) => w?.getFlag("sr2e", "ammoReceipts") ?? {};
const openPlan = (w) => Object.values(plansOf(w)).find(p => ["planned", "settled", "cancelled"].includes(p.state)) ?? null;
const clipRev = (w) => Number(w.getFlag("sr2e", "clipRev")) || 0;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Is the R2 ammunition queue in charge of this weapon? */
export const ammoQueued = (weapon) => isRigger2() && weapon?.type === "weapon" && (weapon.system.ammo?.max ?? 0) > 0;

/** The loaded-round snapshot a launch carries (4b.4: Phase 0 never rereads the launcher). */
function payloadOf(weapon) {
  const s = weapon.system, a = s.ammo;
  return { weaponName: weapon.name, weaponUuid: weapon.uuid, damageCode: s.damageCode, damageType: s.damageType,
    blastType: s.blastType ?? "", ammoName: a.loadedName || weapon.name, ammoType: a.type, damageMod: a.damageMod ?? 0,
    armorMod: a.armorMod ?? 0, armorCalc: a.armorCalc ?? "standard", ammoDamageType: a.damageType ?? "",
    material: a.material ?? "", guided: { ...(a.guided ?? {}) } };
}

function weaponArg(uuid, user) {
  const w = fromUuidSync(uuid);
  if (w?.type !== "weapon") throw new Error("not a weapon");
  // The weapon's or its actor's owner — or, for a vehicle's mounted weapon, the player of its live controller (control
  // doesn't imply vehicle ownership; code review 4b r1 #10).
  const p = w.parent;
  if (!user.isGM && !w.testUserPermission(user, "OWNER") && !p?.testUserPermission(user, "OWNER")
    && !(p?.type === "vehicle" && controllerOf(p)?.testUserPermission(user, "OWNER"))) throw new Error("not allowed");
  return w;
}

/** The reload plan for `reserve` (4b.4 step 1): what the clip keeps, ejects and can take. Pure; exported for tests. */
export function planReload(ammo, reserveId, reserveExists = true) {
  const current = ammo.current ?? 0, max = ammo.max ?? 0;
  if (current > 0 && ammo.loadedSourceId !== reserveId)
    return { retained: 0, eject: current, ejectTo: reserveExists ? (ammo.loadedSourceId || "") : "", need: max };
  return { retained: current, eject: 0, ejectTo: "", need: max - current };
}

export function registerAmmoQueue() {
  gmOp("ammo", async ({ action, weaponUuid, eventId, rounds = 1, reloadId, ammoItemId }, user) => {
    const w = weaponArg(weaponUuid, user);
    return aq(w.uuid, async () => {
      if (["spend", "launch", "cancel"].includes(action)) {
        const prior = receiptsOf(w)[eventId];
        if (prior) {
          if (action === "spend" && prior.spent == null) throw new Error("that attack was cancelled");
          if (action === "launch" && !prior.payload) throw new Error("that launch was cancelled");
          return prior;
        }
        if (action === "cancel") {   // a terminal receipt first, so a later spend for this id is refused
          await w.update({ [`flags.sr2e.ammoReceipts.${eventId}`]: { cancelled: true } });
          return { cancelled: true };
        }
        if (openPlan(w)) throw new Error(`${w.name} is being reloaded`);
        const n = action === "launch" ? 1 : Math.max(1, Math.floor(rounds));
        const cur = w.system.ammo.current ?? 0;
        if (cur < n) throw new Error(`${w.name} has ${cur} round${cur === 1 ? "" : "s"} left`);
        if (action === "launch" && w.system.ammo.guided?.kind !== "missile") throw new Error(`${w.name} isn't loaded with a missile`);
        const receipt = action === "launch" ? { payload: payloadOf(w) } : { spent: n };
        await w.update({ "system.ammo.current": cur - n, "flags.sr2e.clipRev": clipRev(w) + 1,
          [`flags.sr2e.ammoReceipts.${eventId}`]: receipt });
        return receipt;
      }
      if (action === "plan") {
        if (openPlan(w)) throw new Error(`${w.name} is already being reloaded`);
        const reserve = w.parent?.items.get(ammoItemId);
        if (reserve?.type !== "ammo") throw new Error(`select the ammo to reload ${w.name} from first`);
        const p = planReload(w.system.ammo, reserve.id, !!w.parent.items.get(w.system.ammo.loadedSourceId));
        if (p.need <= 0 && !p.eject) throw new Error(`${w.name} is already fully loaded`);
        const plan = { id: reloadId, clipRev: clipRev(w), ...p, ammoItemId: reserve.id, state: "planned", by: user.id };
        await w.update({ [`flags.sr2e.reloadPlans.${reloadId}`]: plan });
        return plan;
      }
      if (action === "cancelPlan") {
        const plan = plansOf(w)[reloadId];
        if (plan?.state !== "planned") throw new Error("only a reload that hasn't settled can be cancelled");
        await w.update({ [`flags.sr2e.reloadPlans.${reloadId}.state`]: "cancelled" });
        return true;
      }
      throw new Error(`unknown ammo action ${action}`);
    });
  });

  const kick = (doc) => {
    const w = doc?.type === "weapon" ? doc : null;
    if (w && Object.keys(plansOf(w)).length) reconcileReloads(w);
    if (doc?.type === "ammo") for (const x of doc.parent?.items ?? []) if (x.type === "weapon" && openPlan(x)) reconcileReloads(x);
  };
  Hooks.on("updateItem", (doc) => kick(doc));
  Hooks.once("ready", () => {
    for (const a of game.actors ?? []) for (const i of a.items) if (i.type === "weapon" && openPlan(i)) reconcileReloads(i);
  });
}

/** Run every step of every open reload of `w` that THIS client is responsible for. Idempotent. */
export function reconcileReloads(w) {
  const owner = w.parent;
  if (!owner) return;
  const writer = moneyWriterFor(owner)?.id === game.user.id;
  for (const plan of Object.values(plansOf(w))) {
    if (plan.state === "closed") continue;
    const reserve = owner.items.get(plan.ammoItemId);
    const rec = reserve?.getFlag("sr2e", "reserveReceipts")?.[plan.id];
    if (writer) moneyQueue(owner, () => writerStep(w, plan.id), "reload").catch(err => console.error("SR2E | reload", err));
    if (isActiveGM()) {
      if (plan.state === "planned" && rec && !rec.cancelAck) aq(w.uuid, () => settle(w, plan.id)).catch(err => console.error("SR2E | reload", err));
      if ((plan.state === "settled" && rec?.escrow === "released") || (plan.state === "cancelled" && rec?.cancelAck))
        aq(w.uuid, async () => {
          const live = plansOf(w)[plan.id];
          if (live && live.state !== "closed") await w.update({ [`flags.sr2e.reloadPlans.${plan.id}.state`]: "closed" });
        }).catch(err => console.error("SR2E | reload", err));
      if (plan.state === "planned" && !reserve) aq(w.uuid, () => w.update({ [`flags.sr2e.reloadPlans.${plan.id}.state`]: "cancelled" }))
        .catch(err => console.error("SR2E | reload", err));
      // The reserve is gone, so no acknowledgement can ever be written on it (r1 #11): nothing is left to refund — the
      // GM closes the plan and lifts the fence (a settled plan's escrow, likewise, has nowhere left to wait).
      if (!reserve && ["cancelled", "settled"].includes(plan.state)) aq(w.uuid, async () => {
        const live = plansOf(w)[plan.id];
        if (live && ["cancelled", "settled"].includes(live.state) && !owner.items.get(live.ammoItemId)) await w.update({ [`flags.sr2e.reloadPlans.${plan.id}.state`]: "closed" });
      }).catch(err => console.error("SR2E | reload", err));
    }
  }
}

/** The money writer's steps, inside the owner's money queue (re-read there). */
async function writerStep(w, id) {
  const owner = w.parent, plan = plansOf(w)[id];
  if (!plan || plan.state === "closed") return;
  const reserve = owner.items.get(plan.ammoItemId);
  if (!reserve) {
    return;   // the GM cancels a plan whose reserve is gone
  }
  const rec = reserve.getFlag("sr2e", "reserveReceipts")?.[id];
  const path = `flags.sr2e.reserveReceipts.${id}`;
  if (plan.state === "planned" && !rec) {
    // (2) debit the ACTUAL quantity (partial reloads as before); the ejected rounds stay escrowed in the receipt.
    const loaded = Math.min(plan.need, reserve.system.quantity ?? 0);
    const s = reserve.system;
    await applyUpdate(reserve, { "system.quantity": (s.quantity ?? 0) - loaded, [path]: { loaded, escrow: plan.eject ? "pending" : "released",
      props: { loadedSourceId: reserve.id, loadedName: reserve.name, type: s.ammoType, damageMod: s.damageModifier ?? 0,
        armorMod: s.armorModifier ?? 0, armorCalc: s.armorCalc ?? "standard", damageType: s.damageType ?? "", material: s.material ?? "",
        guided: s.guided ?? { kind: "", intelligence: 0, sensor: 0 } } } }, {}, "reload: reserve");
    return;
  }
  if (plan.state === "cancelled" && !rec?.cancelAck) {
    // Refund any debit and discard the escrow (the ejected rounds never left the unchanged clip), with the ack.
    await applyUpdate(reserve, { "system.quantity": (reserve.system.quantity ?? 0) + (rec?.loaded ?? 0),
      [path]: { ...(rec ?? { loaded: 0 }), cancelAck: true } }, {}, "reload: cancel");
    return;
  }
  if (plan.state === "settled" && rec && rec.escrow !== "released") {
    // (4) credit the escrowed ejected rounds once (the eject item's own marker), then mark the receipt released.
    const to = plan.ejectTo ? owner.items.get(plan.ejectTo) : null;
    if (to && plan.eject && !to.getFlag("sr2e", "escrowReleased")?.[id])
      await applyUpdate(to, { "system.quantity": (to.system.quantity ?? 0) + plan.eject, [`flags.sr2e.escrowReleased.${id}`]: true }, {}, "reload: eject");
    await applyUpdate(reserve, { [`${path}.escrow`]: "released" }, {}, "reload: escrow");
  }
}

/** (3) The GM's settle: the clip = retained + the receipt's loaded rounds, with the receipt's properties. */
async function settle(w, id) {
  const plan = plansOf(w)[id];
  if (plan?.state !== "planned") return;
  const reserve = w.parent.items.get(plan.ammoItemId);
  const rec = reserve?.getFlag("sr2e", "reserveReceipts")?.[id];
  if (!rec || rec.cancelAck) return;
  const p = rec.props;
  await w.update({ "system.ammo.current": plan.retained + rec.loaded, "system.ammo.loadedSourceId": p.loadedSourceId,
    "system.ammo.loadedName": p.loadedName, "system.ammo.type": p.type, "system.ammo.damageMod": p.damageMod,
    "system.ammo.armorMod": p.armorMod, "system.ammo.armorCalc": p.armorCalc, "system.ammo.damageType": p.damageType,
    "system.ammo.material": p.material, "system.ammo.guided": p.guided, "flags.sr2e.clipRev": clipRev(w) + 1,
    [`flags.sr2e.reloadPlans.${id}.state`]: "settled" });
  const ejected = plan.eject ? `<br><em>Ejected ${plan.eject} round${plan.eject === 1 ? "" : "s"}${plan.ejectTo ? " back to reserve" : " (no reserve to return them to — discarded)"}.</em>` : "";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: w.parent }),
    content: `<div class="sr2e-item-card"><strong>${esc(w.name)}</strong> reloaded with ${rec.loaded} round${rec.loaded === 1 ? "" : "s"} of
      <strong>${esc(p.loadedName)}</strong> <em>(${reserve.system.quantity} left in reserve)</em>${ejected}</div>` });
}

/** The R2 reload entry point (item.reloadWeapon under Rigger 2): plan through the GM; the steps follow by reconcile. */
export async function queuedReload(weapon) {
  const reloadId = foundry.utils.randomID(16);
  try {
    await gmCall("ammo", { action: "plan", weaponUuid: weapon.uuid, reloadId, ammoItemId: weapon.system.ammo.sourceId });
  } catch (err) { return ui.notifications.warn(`SR2E | ${err.message}`); }
  reconcileReloads(weapon);
  return reloadId;
}

/** An ordinary attack's spend (4b.4): awaited BEFORE rolling; throws when refused. */
export const spendRounds = (weapon, rounds, eventId = foundry.utils.randomID(16)) =>
  gmCall("ammo", { action: "spend", weaponUuid: weapon.uuid, eventId, rounds });
