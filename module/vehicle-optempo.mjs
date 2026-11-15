/**
 * Rigger 2 optempo (R2 p.83–84, optional `r2Optempo` = off / replace / split / frequent / mileage;
 * docs/PLAN-vehicles-phase2.md 6a.2).
 *   - An ADVENTURE is a GM record (world setting `vehicleAdventures`). Closing it (the GM enters each billed vehicle's
 *     km) decides each vehicle's optempo ONCE (immutable): its charge `flags.sr2e.optempo.<advId> = { amount, payer, tx,
 *     month, state: due|paid }` and the vehicle-month record `flags.sr2e.overhead.optempoMonths.<m> = { mode, adventures,
 *     replaces, rev }`, in the vehicle queue.
 *   - `split` halves every month's overhead (assessThrough); a mode that REPLACES the monthly overhead supersedes that
 *     vehicle-month's liability: unpaid → `superseded` (never payable, never missed); being paid → wait for the payment's
 *     own settle-or-release; paid → a refund computed from the original receipt (`overheadRefund`, deterministic,
 *     ledger-capped) paid back by the payer's money writer in `moneyQueue`; a missed month's Stress is reversed once
 *     (`ostress-rev:<event>`) unless a restoration already removed it.
 *   - Optempo charges are paid from the overhead dialog: the payer's money writer, `overheadReceipts.<tx>`, the GM settles.
 */
import { enqueueAttack } from "./engagement.mjs";
import { gmCall, gmOp } from "./vehicle-play.mjs";
import { stressPatch } from "./rules/vehicle-overhead-rules.mjs";
import { moneyWriterFor } from "./vehicle-customize.mjs";
import { moneyQueue, adjustNuyen } from "./money.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { optempoRate, optempoEligibility, overheadRefund } from "./rules/vehicle-overhead-rules.mjs";

const num = (v) => Number(v) || 0;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const inVehicle = (v, fn) => enqueueAttack(`vdmg:${v.uuid}`, fn);
const ohOf = (v) => v?.getFlag("sr2e", "overhead") ?? {};
const isActiveGM = () => !!game.users.activeGM?.isSelf;

export function optempoMode() {
  if (!isRigger2()) return "off";
  try { return game.settings.get("sr2e", "r2Optempo") || "off"; } catch (e) { return "off"; }
}
// The adventures record (world setting). Only the active GM writes it, inside the "optempo" queue; a world setting's
// client cache can lag its own write, so the writer keeps the authoritative copy here and reads it back first.
let ADV = null;
const adventures = () => foundry.utils.deepClone(ADV ?? game.settings.get("sr2e", "vehicleAdventures") ?? {});
const saveAdventures = async (all) => { ADV = foundry.utils.deepClone(all); await game.settings.set("sr2e", "vehicleAdventures", all); };
/** Quench / tools: forget the GM's copy (after the setting was put back). */
export const resetAdventureCache = () => { ADV = null; };
const monthRunning = () => num(game.settings.get("sr2e", "vehicleOverheadMonth")) + 1;
/** The character who pays a billed vehicle's overhead: the first character linking it. */
export const payerOf = (v) => game.actors.find(a => a.type === "character" && (a.system.linkedVehicles ?? []).includes(v.uuid)) ?? null;

export function registerOptempo() {
  game.settings.register("sr2e", "r2Optempo", { name: "Rigger 2: optempo", scope: "world", config: true, type: String, default: "off", requiresReload: true,
    hint: "Optional rule (Rigger 2 p.83–84): vehicles' upkeep by mileage per adventure — replace the monthly overhead, split both in half, only for frequently used vehicles, or only above a mileage threshold.",
    choices: { off: "Off", replace: "Replace monthly overhead", split: "Split the cost (half each)", frequent: "Frequently used vehicles", mileage: "Significant mileage" } });
  game.settings.register("sr2e", "r2OptempoKmVehicle", { name: "Optempo: mileage threshold (vehicles, km)", scope: "world", config: true, type: Number, default: 200 });
  game.settings.register("sr2e", "r2OptempoKmDrone", { name: "Optempo: mileage threshold (drones, km)", scope: "world", config: true, type: Number, default: 50 });
  game.settings.register("sr2e", "vehicleAdventures", { scope: "world", config: false, type: Object, default: {} });

  gmOp("adventureStart", async ({ name }, user) => {
    if (!user.isGM) throw new Error("GM only");
    return enqueueAttack("optempo", async () => {
      const all = adventures(), id = foundry.utils.randomID(12);
      all[id] = { id, name: String(name || "Adventure"), startMonth: monthRunning(), startTime: game.time.worldTime, closed: false };
      await saveAdventures(all);
      return all[id];
    });
  });

  // Close an adventure: each vehicle's optempo decided ONCE (immutable), recorded in its queue; months reconciled.
  gmOp("adventureClose", async ({ id, km = {} }, user) => {
    if (!user.isGM) throw new Error("GM only");
    const mode = optempoMode();
    if (mode === "off") throw new Error("optempo is off");
    const { overheadValue } = await import("./vehicle-overhead.mjs");
    const decided = await enqueueAttack("optempo", async () => {
      const all = adventures(), a = all[id];
      if (!a) throw new Error("no such adventure");
      if (a.closed) return null;
      const month = monthRunning(), rows = {};
      for (const [uuid, k] of Object.entries(km)) {
        const v = fromUuidSync(uuid);
        if (v?.type !== "vehicle") continue;
        const el = optempoEligibility(mode, { km: k, drone: v.system.vehicleType === "drone", frequent: !!v.getFlag("sr2e", "optempoFrequent"),
          thresholds: { vehicle: num(game.settings.get("sr2e", "r2OptempoKmVehicle")) || 200, drone: num(game.settings.get("sr2e", "r2OptempoKmDrone")) || 50 } });
        const rate = optempoRate(await overheadValue(v));
        rows[uuid] = { km: num(k), rate, ...el, amount: el.optempo ? Math.round(num(k) * rate * el.factor) : 0 };
      }
      // Every month the adventure ran in (start to close) "carried optempo" (6a.2): those months are reconciled.
      const months = []; for (let m = Math.min(num(a.startMonth) || month, month); m <= month; m++) months.push(m);
      all[id] = { ...a, closed: true, month, months, mode, rows, closedAt: game.time.worldTime };
      await saveAdventures(all);
      return all[id];
    });
    // An adventure decided but not finished (a GM reload between the decision and its rows; Codex 6a r1 #14) replays.
    return finishAdventure(id, decided ? null : adventures()[id]);
  });

  // The decision is saved first, then each row is applied idempotently; `applied` marks the end (the card once).
  async function finishAdventure(id, again) {
    const decided = again ?? adventures()[id];
    if (!decided?.closed || decided.applied) return again ? null : decided;
    const mode = decided.mode;
    for (const [uuid, r] of Object.entries(decided.rows)) {
      const v = fromUuidSync(uuid);
      if (!v) continue;
      await inVehicle(v, async () => {
        const upd = {};
        if (r.optempo && r.amount > 0 && !v.getFlag("sr2e", "optempo")?.[id]) {
          const payer = payerOf(v);
          upd[`flags.sr2e.optempo.${id}`] = { amount: r.amount, km: r.km, rate: r.rate, payer: payer?.uuid ?? "", tx: foundry.utils.randomID(16),
            month: decided.month, state: "due", adventure: decided.name };
        }
        if (r.replacesOverhead) for (const m of decided.months) {
          const om = ohOf(v).optempoMonths?.[m] ?? { adventures: [], rev: 0 };
          // A month already settled is reopened ONCE per adventure (a new rev).
          if (!om.adventures.includes(id)) upd[`flags.sr2e.overhead.optempoMonths.${m}`] = { mode, replaces: true, adventures: [...om.adventures, id], rev: num(om.rev) + 1 };
        }
        if (Object.keys(upd).length) await v.update(upd);
      });
      if (r.replacesOverhead) for (const m of decided.months) await reconcileMonth(v, m);
    }
    const applied = await enqueueAttack("optempo", async () => {
      const all = adventures();
      if (!all[id] || all[id].applied) return false;
      all[id] = { ...all[id], applied: true };
      await saveAdventures(all);
      return true;
    });
    if (!applied) return decided;
    await ChatMessage.create({ whisper: game.users.filter(u => u.isGM).map(u => u.id), content: `<div class="sr2e-item-card"><strong>Adventure closed: ${esc(decided.name)}</strong>
      (optempo: ${esc(mode)}, Rigger 2 p.83–84)<br>${Object.entries(decided.rows).map(([u, r]) => `${esc(fromUuidSync(u)?.name)}: ${r.km} km × ${r.rate}¥ ${r.factor === 0.5 ? "× ½ " : ""}= ${r.amount.toLocaleString()}¥${r.optempo ? "" : " (standard overhead)"}`).join("<br>")}</div>` });
    return decided;
  }

  // An optempo charge's receipt exists → paid (any client may ask; the receipt is the proof).
  gmOp("optempoSettle", async ({ vehicleUuid, id }) => {
    const v = fromUuidSync(vehicleUuid);
    return inVehicle(v, async () => {
      const o = v.getFlag("sr2e", "optempo")?.[id];
      const rec = o?.payer ? fromUuidSync(o.payer)?.getFlag("sr2e", "overheadReceipts")?.[o.tx] : null;
      if (o?.state === "due" && rec && !rec.released) await v.update({ [`flags.sr2e.optempo.${id}.state`]: "paid" });
      return true;
    });
  });
  gmOp("optempoRefundDone", async ({ vehicleUuid, month }, user) => {
    const v = fromUuidSync(vehicleUuid);
    return inVehicle(v, async () => {
      const r = ohOf(v).months?.[month];
      const payer = r?.payer ? fromUuidSync(r.payer) : null;
      if (!user.isGM && !payer?.testUserPermission(user, "OWNER")) throw new Error("not allowed");
      if (r?.refund?.state === "due" && payer?.getFlag("sr2e", "overheadRefunds")?.[r.tx]?.done?.includes(`${v.uuid}|${month}`))
        await v.update({ [`flags.sr2e.overhead.months.${month}.refund.state`]: "done" });
      return true;
    });
  });

  Hooks.on("updateActor", (a, ch) => {
    if (a.type !== "vehicle" || !foundry.utils.hasProperty(ch, "flags.sr2e.overhead")) return;
    payRefunds(a).catch(err => console.error("SR2E | optempo refund", err));
  });
  Hooks.once("ready", () => {
    if (isActiveGM()) for (const [id, a] of Object.entries(adventures())) if (a?.closed && !a.applied)
      finishAdventure(id).catch(err => console.error("SR2E | adventure close", err));
    for (const c of game.actors.filter(x => x.type === "character")) for (const u of c.system.linkedVehicles ?? []) {
      const v = fromUuidSync(u); if (v) payRefunds(v).catch(() => {});
    }
  });
}

/**
 * Reconcile ONE vehicle-month against its optempo record (GM; the vehicle queue): supersede the monthly liability.
 * Unpaid and free → superseded; a payment under way → left for its own settle-or-release (re-run by overheadPass);
 * paid → a refund owed from its receipt; a missed month's Stress reversed once.
 */
export async function reconcileMonth(v, month) {
  if (!isActiveGM()) return;
  await inVehicle(v, async () => {
    const r = ohOf(v).months?.[month], om = ohOf(v).optempoMonths?.[month];
    if (!r || !om?.replaces || r.superseded) return;
    // A payment OR a Stress restoration under way: wait for it to settle or be released (re-run by overheadPass; r1 #17).
    if ((r.tx && !r.paid) || r.restoreTx) { if (!r.supersedePending) await v.update({ [`flags.sr2e.overhead.months.${month}.supersedePending`]: true }); return; }
    const upd = { [`flags.sr2e.overhead.months.${month}.superseded`]: om.rev, [`flags.sr2e.overhead.months.${month}.-=supersedePending`]: null };
    if (r.paid && r.tx) upd[`flags.sr2e.overhead.months.${month}.refund`] = { state: "due", rev: om.rev };
    // The missed month's +1 Stress, reversed with its OWN receipt (round 6 #1) IN THE SAME update as the supersession
    // (r1 #17: never lost between two writes), through the one Stress writer's patch like a restoration.
    const ev = `ostress-rev:overhead-missed-${month}`;
    if (r.missed && !r.restored && v.getFlag("sr2e", "vstress")?.[ev] == null) {
      const before = v.system.stressRating ?? 0, after = Math.max(v.system.stressPermanent ?? 0, before - 1);
      Object.assign(upd, { [`flags.sr2e.vstress.${ev}`]: after - before }, stressPatch({ before, after, counter: num(ohOf(v).stress) }));
    }
    await v.update(upd);
  });
}

/** The payer's money writer pays every refund this vehicle owes, once (ledger `overheadRefunds.<tx>`). */
async function payRefunds(v) {
  const months = Object.entries(ohOf(v).months ?? {}).filter(([, r]) => r?.refund?.state === "due" && r.payer);
  for (const [m, r] of months) {
    const payer = fromUuidSync(r.payer);
    if (!payer || moneyWriterFor(payer)?.id !== game.user.id) continue;
    await moneyQueue(payer, async () => {
      const receipt = payer.getFlag("sr2e", "overheadReceipts")?.[r.tx];
      if (!receipt || receipt.released) return;
      const led = payer.getFlag("sr2e", "overheadRefunds")?.[r.tx] ?? { cash: 0, credit: 0, karma: 0, creditByMonth: {}, done: [] };
      const key = `${v.uuid}|${m}`;
      if (led.done?.includes(key)) return;
      // Every row of this receipt whose vehicle-month is now superseded (so shared credit/Karma come back only once).
      const sup = new Set((receipt.rows ?? []).filter(row => ohOf(fromUuidSync(row.vehicleUuid)).months?.[row.month]?.superseded != null)
        .map(row => `${row.vehicleUuid}|${row.month}`));
      sup.add(key);
      const due = overheadRefund(receipt, sup, led);
      const disc = payer.getFlag("sr2e", "overheadDiscount") ?? {};
      const upd = { "system.karma.current": num(payer.system.karma?.current) + due.karma,
        [`flags.sr2e.overheadRefunds.${r.tx}`]: { cash: led.cash + due.cash, credit: led.credit + due.credit, karma: led.karma + due.karma,
          creditByMonth: Object.fromEntries([...new Set([...Object.keys(led.creditByMonth ?? {}), ...Object.keys(due.creditByMonth)])]
            .map(k => [k, num(led.creditByMonth?.[k]) + num(due.creditByMonth[k])])), done: [...(led.done ?? []), key] } };
      for (const [cm, c] of Object.entries(due.creditByMonth)) upd[`flags.sr2e.overheadDiscount.${cm}`] = Math.max(0, num(disc[cm]) - c);
      await adjustNuyen(payer, due.cash, upd);
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: payer }), content: `<div class="sr2e-item-card"><strong>${esc(v.name)}, month ${m}: overhead
        superseded by optempo</strong> (Rigger 2 p.83) — refunded ${due.cash.toLocaleString()}¥${due.credit ? `, ${due.credit.toLocaleString()}¥ of Lifestyle credit` : ""}${due.karma ? `, ${due.karma} Good Karma` : ""}.</div>` });
    }, "optempo refund");
    await gmCall("optempoRefundDone", { vehicleUuid: v.uuid, month: Number(m) }).catch(() => {});
  }
}

/** Pay optempo charges (the payer's money writer): cash, behind `overheadReceipts.<tx>`; the GM settles. */
export async function payOptempo(payer, picks) {
  if (moneyWriterFor(payer)?.id !== game.user.id) return ui.notifications.warn(`${payer.name}'s player pays from their own client.`);
  for (const { vehicleUuid, id } of picks) {
    const v = fromUuidSync(vehicleUuid), o = v?.getFlag("sr2e", "optempo")?.[id];
    if (!o || o.state !== "due" || o.payer !== payer.uuid) continue;
    const ok = await moneyQueue(payer, async () => {
      if (payer.getFlag("sr2e", "overheadReceipts")?.[o.tx]) return true;
      return adjustNuyen(payer, -o.amount, { [`flags.sr2e.overheadReceipts.${o.tx}`]: { optempo: true, vehicleUuid, adventure: id, amount: o.amount, at: Date.now() } });
    }, "optempo");
    if (!ok) { ui.notifications.warn(`${payer.name} can't pay ${o.amount.toLocaleString()}¥ of optempo.`); continue; }
    await gmCall("optempoSettle", { vehicleUuid, id });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: payer }), content: `<div class="sr2e-item-card"><strong>${esc(payer.name)} pays optempo</strong>
      for ${esc(v.name)} (${esc(o.adventure)}: ${o.km} km × ${o.rate}¥): ${o.amount.toLocaleString()}¥ (Rigger 2 p.83).</div>` });
  }
}

/** GM: start or close an adventure. */
export async function adventureDialog() {
  if (!game.user.isGM) return;
  const open = Object.values(adventures()).filter(a => !a.closed);
  const { billedVehicles } = await import("./vehicle-overhead.mjs");
  const vs = billedVehicles();
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: "Optempo: adventures (Rigger 2 p.83–84)" }, position: { width: 520 },
    content: `<p>Mode: <strong>${esc(optempoMode())}</strong>.</p>
      <div class="form-group"><label>Start a new adventure:</label><input name="name" placeholder="name" style="width:200px"></div>
      ${optempoMode() === "frequent" ? `<hr><p style="font-size:11px">Used on every adventure (frequent mode, p.83):</p>${vs.map(v => `<div class="form-group"><label><input type="checkbox" name="freq.${v.uuid}" ${v.getFlag("sr2e", "optempoFrequent") ? "checked" : ""}> ${esc(v.name)}</label></div>`).join("")}` : ""}
      ${open.length ? `<hr><div class="form-group"><label>Close:</label><select name="close"><option value="">—</option>${open.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div>
        <p style="font-size:11px">Kilometres each vehicle travelled on it:</p>${vs.map(v => `<div class="form-group"><label>${esc(v.name)}</label><input type="number" name="km.${v.uuid}" value="0" min="0" style="width:80px"></div>`).join("")}` : ""}`,
    ok: { label: "Apply", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
  if (!res) return;
  if (optempoMode() === "frequent") for (const v of vs) {
    const want = !!res[`freq.${v.uuid}`];
    if (!!v.getFlag("sr2e", "optempoFrequent") !== want) await v.update({ "flags.sr2e.optempoFrequent": want });
  }
  if (res.close) {
    const km = {};
    for (const [k, val] of Object.entries(res)) if (k.startsWith("km.")) km[k.slice(3)] = Number(val) || 0;
    return gmCall("adventureClose", { id: res.close, km }).catch(err => ui.notifications.warn(`SR2E | ${err.message}`));
  }
  if (res.name) return gmCall("adventureStart", { name: res.name });
}
