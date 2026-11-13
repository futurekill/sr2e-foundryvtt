/**
 * Maintenance overhead (Rigger 2 p.18–19; docs/PLAN-vehicles-phase2.md 2b.5). Rigger 2 ruleset only.
 *
 * Months are GM-advanced: the hidden world setting `vehicleOverheadMonth` is the last month that has ENDED (0 = none).
 * Each billed vehicle (linked to a character) carries `flags.sr2e.overhead = { stress (this month's Stress so far),
 * assessedThrough, months: { <m>: { amount, stress, paid, missed, tx, payer, restored, restoreTx, restorePayer } } }`.
 * Every record change runs on the active GM in the vehicle's queue (`vdmg:<uuid>`, shared with Stress). Money moves
 * only in the payer's `moneyQueue`, behind a receipt `flags.sr2e.overheadReceipts.<tx>` on the payer; a `released`
 * marker in that slot makes a late charge abort. Nothing is charged twice.
 */
import { enqueueAttack } from "./engagement.mjs";
import { gmCall, gmOp, brSkillFor } from "./vehicle-play.mjs";
import { moneyWriterFor } from "./vehicle-customize.mjs";
import { moneyQueue, adjustNuyen, updated, settingSet } from "./money.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { assessMonth, overheadPayment, catchUpProblems, lifestyleDiscount, stressPatch, KARMA_NUYEN } from "./rules/vehicle-overhead-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const num = (v) => Number(v) || 0;
const isActiveGM = () => !!game.users.activeGM?.isSelf;
const ohOf = (v) => v?.getFlag("sr2e", "overhead") ?? {};
const monthNow = () => { try { return num(game.settings.get("sr2e", "vehicleOverheadMonth")); } catch (e) { return 0; } };
const inVehicle = (v, fn) => enqueueAttack(`vdmg:${v.uuid}`, fn);
/**
 * Only the payer's money writer charges or releases (code review R1 #2): the active player who owns the character, else
 * the active GM — one client, one queue, so a release can never race a debit.
 */
const isMoneyWriter = (payer) => moneyWriterFor(payer)?.id === game.user.id;

/** The vehicles that pay overhead: those linked to a character (world actors), each once. */
export function billedVehicles() {
  const seen = new Set(), out = [];
  for (const c of game.actors.filter(a => a.type === "character")) for (const u of c.system.linkedVehicles ?? []) {
    if (seen.has(u)) continue;
    seen.add(u);
    const v = fromUuidSync(u);
    if (v?.type === "vehicle") out.push(v);
  }
  return out;
}

/**
 * The cost value (p.18): the vehicle's base value plus all its accessories and modifications at their LISTED prices —
 * its cost (design and factory equipment included), each installed aftermarket customization re-quoted without Street
 * Index, and every other item at its listed cost. Never what was paid.
 */
export async function overheadValue(vehicle) {
  let value = num(vehicle.system.cost);
  let catalog = null, cz = null;
  for (const i of vehicle.items) {
    if (i.getFlag("sr2e", "factory") || i.getFlag("sr2e", "designMod") || i.system.custom?.state === "factory") continue;
    const c = i.system.custom ?? {};
    if (i.type === "vehicle_mod" && c.receipt?.id) {
      if (c.state !== "done") continue;   // bought, not installed yet
      cz ??= await import("./vehicle-customize.mjs");
      catalog ??= await cz.customizationCatalog();
      const ctx = cz.customizeContext(vehicle, catalog, { skipItem: i.id, installedOnly: true });
      const cat = { name: i.name, system: { ...i.system.toObject(), custom: { ...i.system.toObject().custom, state: "" } } };
      value += num(cz.quoteCustomization(vehicle, cat, i.system.rating, catalog, { ctx, user: game.users.activeGM ?? game.user }).price);
      continue;
    }
    value += num(i.system.cost) * Math.max(1, num(i.system.quantity) || 1);
  }
  return value;
}

/* ── Month ends (the GM) ─────────────────────────────────────────────────────────────────────────────────────── */

/** The payer's receipt for a reservation, if it was charged (not released, not a restore). */
function chargedReceipt(r) {
  const rec = r?.payer ? fromUuidSync(r.payer)?.getFlag("sr2e", "overheadReceipts")?.[r.tx] : null;
  return rec && !rec.released && !rec.restore ? rec : null;
}

/** Close every month up to `m` for this vehicle, in its queue; idempotent by month. */
function assessThrough(vehicle, m) {
  return inVehicle(vehicle, async () => {
    for (;;) {
      const o = ohOf(vehicle);
      const done = o.assessedThrough;
      if (done != null && done >= m) return;
      const next = done == null ? m : done + 1;
      // A reservation already charged (its receipt exists) is paid, whatever stopped its settlement (code review R1 #5).
      const months = foundry.utils.deepClone(o.months ?? {});
      const upd = {};
      for (const [k, r] of Object.entries(months)) if (r?.tx && !r.paid && chargedReceipt(r)) { r.paid = true; upd[`flags.sr2e.overhead.months.${k}.paid`] = true; }
      const a = assessMonth(months, next, { value: await overheadValue(vehicle), stress: o.stress ?? 0 });
      Object.assign(upd, { [`flags.sr2e.overhead.months.${next}`]: a.record, "flags.sr2e.overhead.assessedThrough": next, "flags.sr2e.overhead.stress": 0 });
      if (a.addStress) {
        const before = vehicle.system.stressRating ?? 0;
        Object.assign(upd, stressPatch({ before, after: before + a.addStress, counter: 0 }));   // counted in the new month
        for (const k of a.missed) Object.assign(upd, { [`flags.sr2e.overhead.months.${k}.missed`]: true, [`flags.sr2e.vstress.overhead-missed-${k}`]: 1 });
      }
      await vehicle.update(upd);
    }
  });
}

// `only` (vehicle uuids) scopes it — Quench, so tests never touch a world's real vehicles.
gmOp("overheadMonthEnd", async ({ expectedMonth, only = null }, user) => {
  if (!user?.isGM) throw new Error("only a GM ends the month");
  const billed = () => only ? only.map(u => fromUuidSync(u)).filter(v => v?.type === "vehicle") : billedVehicles();
  return enqueueAttack("overhead-month", async () => {
    const cur = monthNow();
    if (cur !== expectedMonth) return { month: cur, already: true };   // a replay or a second click
    // A vehicle billed for the first time gets its starting cursor BEFORE the month moves, so an interruption can't
    // skip its first month (code review 2b-2 R1 #1); every vehicle behind is brought up to date.
    for (const v of billed()) {
      if (ohOf(v).assessedThrough == null) await inVehicle(v, () => ohOf(v).assessedThrough == null ? v.update({ "flags.sr2e.overhead.assessedThrough": cur }) : null);
      else if (ohOf(v).assessedThrough < cur) await assessThrough(v, cur);
    }
    if (!await settingSet("sr2e", "vehicleOverheadMonth", cur + 1)) throw new Error("the month couldn't be advanced");
    for (const v of billed()) await assessThrough(v, cur + 1);
    return { month: cur + 1 };
  });
});

/** GM: end the month. */
export async function endMonth() {
  if (!game.user.isGM) return;
  const m = monthNow();
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Month ends: vehicle overhead" },
    content: `<p>Close month ${m + 1} for every vehicle linked to a character: its overhead is set (1% of its value + 10 per Stress Point this month), and any earlier month still unpaid is missed (+1 Stress; Rigger 2 p.18–19).</p>` });
  if (!ok) return;
  const r = await gmCall("overheadMonthEnd", { expectedMonth: m });
  ui.notifications.info(r.already ? `Month ${r.month} had already ended.` : `Month ${r.month} has ended: overhead is due.`);
}

/* ── Paying (the payer's client; the GM reserves and settles) ────────────────────────────────────────────────── */

function mayPay(user, payer, vehicle) {
  return !!user?.isGM || (payer?.testUserPermission(user, "OWNER") && (payer.system.linkedVehicles ?? []).includes(vehicle?.uuid));
}

gmOp("overheadReserve", async ({ tx, payerUuid, picks }, user) => {
  const payer = fromUuidSync(payerUuid);
  if (payer?.getFlag("sr2e", "overheadReceipts")?.[tx]) throw new Error("that payment id was used before");
  const byV = new Map();
  for (const p of picks ?? []) {
    const v = fromUuidSync(p.vehicleUuid);
    if (v?.type !== "vehicle" || !mayPay(user, payer, v)) throw new Error(`${user?.name} may not pay for that vehicle`);
    byV.set(v, [...(byV.get(v) ?? []), Number(p.month)]);
  }
  const rows = [];
  let refused = null;
  for (const [v, months] of byV) {
    await inVehicle(v, async () => {
      if (refused) return;
      const recs = ohOf(v).months ?? {};
      const bad = months.find(m => !recs[m] || recs[m].paid || recs[m].tx);
      if (bad != null) { refused = `${v.name}, month ${bad}: already paid or being paid`; return; }
      const cu = catchUpProblems(recs, months);
      if (cu.length) { refused = `${v.name}: a missed month is paid only with the current month (p.19)`; return; }
      await v.update(Object.fromEntries(months.flatMap(m => [[`flags.sr2e.overhead.months.${m}.tx`, tx], [`flags.sr2e.overhead.months.${m}.payer`, payerUuid]])));
      for (const m of months) rows.push({ vehicleUuid: v.uuid, vehicle: v.name, month: m, amount: num(recs[m].amount) });
    });
  }
  if (refused) { await freeTx(tx, [...byV.keys()], "tx", payerUuid); return { ok: false, why: refused }; }
  return { ok: true, rows };
});

/** Free the months reserved by `tx` that aren't paid. */
async function freeTx(tx, vehicles, field = "tx", payerUuid = null) {
  if (field !== "tx" && field !== "restoreTx") throw new Error("bad field");
  const who = field === "tx" ? "payer" : "restorePayer";
  for (const v of vehicles) await inVehicle(v, async () => {
    const upd = {};
    for (const [m, r] of Object.entries(ohOf(v).months ?? {})) if (r?.[field] === tx && (field !== "tx" || !r.paid) && (!payerUuid || r[who] === payerUuid)) {
      upd[`flags.sr2e.overhead.months.${m}.${field}`] = null;
    }
    if (Object.keys(upd).length) await v.update(upd);
  });
}

/** The vehicles a receipt or reservation can touch: the payer's linked ones and every billed one. */
const vehiclesFor = (payer) => [...new Set([...billedVehicles(), ...(payer?.system.linkedVehicles ?? []).map(u => fromUuidSync(u)).filter(v => v?.type === "vehicle")])];

/** GM: months reserved by `tx` whose receipt exists → paid. */
async function settleTx(payer, tx) {
  const rec = payer?.getFlag("sr2e", "overheadReceipts")?.[tx];
  if (!rec || rec.released || rec.restore) return 0;
  let n = 0;
  for (const row of rec.rows ?? []) {
    const v = fromUuidSync(row.vehicleUuid);
    if (!v) continue;
    await inVehicle(v, async () => {
      const r = ohOf(v).months?.[row.month];
      if (r?.tx === tx && !r.paid) { await v.update({ [`flags.sr2e.overhead.months.${row.month}.paid`]: true }); n++; }
    });
  }
  return n;
}
gmOp("overheadSettle", async ({ tx, payerUuid }, user) => {
  const payer = fromUuidSync(payerUuid);
  if (!user?.isGM && !payer?.testUserPermission(user, "OWNER")) throw new Error("not your payment");
  return { settled: await settleTx(payer, tx) };
});
gmOp("overheadFree", async ({ tx, payerUuid, field = "tx" }, user) => {
  const payer = fromUuidSync(payerUuid);
  if (!user?.isGM && !payer?.testUserPermission(user, "OWNER")) throw new Error("not your payment");
  // Only after the payer's writer marked the slot released: a charge can't land afterwards.
  if (!payer?.getFlag("sr2e", "overheadReceipts")?.[tx]?.released) throw new Error("the payment isn't released");
  await freeTx(tx, vehiclesFor(payer), field, payerUuid);
  return { ok: true };
});

/**
 * The payer's money writer: release `tx` — inside the payer's queue, a receipt means it was charged (settle instead),
 * none means it never will be (the `released` marker makes a late charge abort). Then the GM frees the months.
 */
export async function releaseOverhead(payer, tx, { field = "tx" } = {}) {
  if (!isMoneyWriter(payer)) return ui.notifications.warn(`${payer.name}'s player releases it from their own client.`);
  const r = await moneyQueue(payer, async () => {
    const slot = payer.getFlag("sr2e", "overheadReceipts")?.[tx];
    if (slot && !slot.released) return "charged";
    if (!slot) return (await updated(payer.update({ [`flags.sr2e.overheadReceipts.${tx}`]: { released: true, at: Date.now() } }), "overhead release")) ? "released" : "failed";
    return "released";
  }, "overhead release");
  if (r === "charged") return field === "tx" ? gmCall("overheadSettle", { tx, payerUuid: payer.uuid }) : { charged: true };
  if (r === "released") return gmCall("overheadFree", { tx, payerUuid: payer.uuid, field });
  return null;
}

/** Pay the chosen months: reserve (all or nothing), charge once behind the receipt, settle. */
export async function payOverhead(payer, picks, { useCredit = true, karma = 0 } = {}) {
  if (!picks.length) return;
  if (!isMoneyWriter(payer)) return ui.notifications.warn(`${payer.name}'s player pays from their own client.`);
  const tx = foundry.utils.randomID(16);
  const res = await gmCall("overheadReserve", { tx, payerUuid: payer.uuid, picks });
  if (!res?.ok) return ui.notifications.warn(`Overhead not paid: ${res?.why ?? "refused"}.`);
  const outcome = await moneyQueue(payer, async () => {
    const slots = payer.getFlag("sr2e", "overheadReceipts") ?? {};
    if (slots[tx]?.released) return { state: "released" };
    if (slots[tx]) return { state: "paid", pay: slots[tx] };   // charged already: never again
    const used = payer.getFlag("sr2e", "overheadDiscount") ?? {};
    const credit = lifestyleDiscount(payer.system.lifestyle);
    const allowance = useCredit ? Object.fromEntries(res.rows.map(r => [r.month, Math.max(0, credit - num(used[r.month]))])) : {};
    const pay = overheadPayment(res.rows, allowance, Math.min(num(karma), num(payer.system.karma?.current)));
    const upd = { "system.karma.current": num(payer.system.karma?.current) - pay.karma,
      [`flags.sr2e.overheadReceipts.${tx}`]: { rows: res.rows, amount: pay.nuyen, karma: pay.karma, discount: pay.discount, gross: pay.gross, at: Date.now() } };
    for (const [m, d] of Object.entries(pay.discount)) upd[`flags.sr2e.overheadDiscount.${m}`] = num(used[m]) + d;
    return (await adjustNuyen(payer, -pay.nuyen, upd)) ? { state: "paid", pay } : { state: "funds", pay };
  }, "overhead");
  if (outcome.state !== "paid") {
    await releaseOverhead(payer, tx);
    return ui.notifications.warn(outcome.state === "funds" ? `${payer.name} can't pay ${outcome.pay.nuyen.toLocaleString()}¥ of overhead.` : "The payment was released.");
  }
  await gmCall("overheadSettle", { tx, payerUuid: payer.uuid });
  const p = outcome.pay;
  const lines = res.rows.map(r => `${esc(r.vehicle)}, month ${r.month}: ${r.amount.toLocaleString()}¥`).join("<br>");
  const credit = Object.values(p.discount ?? {}).reduce((t, d) => t + d, 0);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: payer }), content: `<div class="sr2e-item-card"><strong>${esc(payer.name)} pays vehicle overhead</strong> (Rigger 2 p.18–19)<br>${lines}
    <br>Total ${num(p.gross).toLocaleString()}¥${credit ? `, Lifestyle −${credit.toLocaleString()}¥` : ""}${p.karma ? `, ${p.karma} Good Karma (−${(p.karma * KARMA_NUYEN).toLocaleString()}¥)` : ""}: <strong>${num(p.amount ?? p.nuyen).toLocaleString()}¥ paid</strong>.</div>` });
}

/* ── Restoring the Stress of a missed month (p.19) ──────────────────────────────────────────────────────────── */

gmOp("overheadRestoreReserve", async ({ vehicleUuid, month, rtx, payerUuid }, user) => {
  const v = fromUuidSync(vehicleUuid), payer = fromUuidSync(payerUuid);
  if (v?.type !== "vehicle" || !mayPay(user, payer, v)) throw new Error("not allowed");
  return inVehicle(v, async () => {
    const r = ohOf(v).months?.[month];
    if (!r?.paid || !r.missed || r.restored) return { ok: false, why: "nothing to restore" };
    if (r.restoreTx) return { ok: false, why: "another attempt is under way" };
    if (payer.getFlag("sr2e", "overheadReceipts")?.[rtx]) return { ok: false, why: "that attempt id was used before" };
    await v.update({ [`flags.sr2e.overhead.months.${month}.restoreTx`]: rtx, [`flags.sr2e.overhead.months.${month}.restorePayer`]: payerUuid });
    return { ok: true };
  });
});
gmOp("overheadRestoreResult", async ({ vehicleUuid, month, rtx, payerUuid, successes }, user) => {
  const v = fromUuidSync(vehicleUuid), payer = fromUuidSync(payerUuid);
  if (v?.type !== "vehicle" || !mayPay(user, payer, v)) throw new Error("not allowed");
  return inVehicle(v, async () => {
    const r = ohOf(v).months?.[month];
    const receipt = payer?.getFlag("sr2e", "overheadReceipts")?.[rtx];
    // The reservation's own Karma receipt (code review R1 #4): a restore, this vehicle and month, this payer.
    if (r?.restoreTx !== rtx || r.restorePayer !== payerUuid || !receipt || receipt.released || !receipt.restore
      || receipt.vehicleUuid !== v.uuid || Number(receipt.month) !== Number(month) || num(receipt.karma) < 1) return { stale: true };
    const upd = { [`flags.sr2e.overhead.months.${month}.restoreTx`]: null };
    if (num(successes) > 0) {
      const before = v.system.stressRating ?? 0, after = Math.max(v.system.stressPermanent ?? 0, before - 1);
      Object.assign(upd, { [`flags.sr2e.overhead.months.${month}.restored`]: true, [`flags.sr2e.vstress.overhead-restore-${month}`]: after - before },
        stressPatch({ before, after, counter: num(ohOf(v).stress) }));
    }
    await v.update(upd);
    return { restored: num(successes) > 0 };
  });
});

/**
 * Restore 1 Stress lost to a missed month (p.19): the month is paid; 1 Good Karma and a Vehicle B/R (4) Test per
 * attempt. A reservation whose Karma was spent but whose test never came back rolls again without spending more.
 */
export async function restoreOverhead(payer, vehicle, month, worker = payer) {
  if (!isMoneyWriter(payer)) return ui.notifications.warn(`${payer.name}'s player restores it from their own client.`);
  const r = ohOf(vehicle).months?.[month];
  let rtx = r?.restoreTx;
  const slot = rtx ? payer.getFlag("sr2e", "overheadReceipts")?.[rtx] : null;
  if (rtx && r.restorePayer !== payer.uuid) return ui.notifications.warn("Another character's attempt is under way.");
  if (rtx && (!slot || slot.released)) return ui.notifications.warn("An attempt is reserved but its Karma wasn't spent: Release it first.");
  if (!rtx) {
    rtx = foundry.utils.randomID(16);
    const res = await gmCall("overheadRestoreReserve", { vehicleUuid: vehicle.uuid, month, rtx, payerUuid: payer.uuid });
    if (!res?.ok) return ui.notifications.warn(`Can't restore: ${res?.why}.`);
    const spent = await moneyQueue(payer, async () => {
      const s = payer.getFlag("sr2e", "overheadReceipts")?.[rtx];
      if (s?.released) return false;
      if (s) return true;
      const k = num(payer.system.karma?.current);
      if (k < 1) return false;
      return updated(payer.update({ "system.karma.current": k - 1,
        [`flags.sr2e.overheadReceipts.${rtx}`]: { restore: true, vehicleUuid: vehicle.uuid, month, karma: 1, at: Date.now() } }), "overhead restore");
    }, "overhead restore");
    if (!spent) {
      await releaseOverhead(payer, rtx, { field: "restoreTx" });
      return ui.notifications.warn(`${payer.name} has no Good Karma to spend.`);
    }
  }
  const skill = await brSkillFor(vehicle);
  const roll = await worker.rollNamedSkill(skill, 4, { label: `${skill} (4): restoring ${vehicle.name}'s Stress from missed month ${month} (R2 p.19)` });
  if (!roll) return;   // cancelled: the Karma is spent; Restore again rolls without spending more
  const out = await gmCall("overheadRestoreResult", { vehicleUuid: vehicle.uuid, month, rtx, payerUuid: payer.uuid, successes: roll.successes ?? 0 });
  ui.notifications.info(out?.restored ? `${vehicle.name}: 1 Stress restored.` : out?.stale ? "That attempt was already settled." : "No success: try again (1 more Good Karma).");
}

/* ── The dialog (character sheet) ────────────────────────────────────────────────────────────────────────────── */

export async function openOverheadDialog(payer) {
  const vehicles = (payer.system.linkedVehicles ?? []).map(u => fromUuidSync(u)).filter(v => v?.type === "vehicle");
  const credit = lifestyleDiscount(payer.system.lifestyle);
  const used = payer.getFlag("sr2e", "overheadDiscount") ?? {};
  const rows = [];
  for (const v of vehicles) for (const [m, r] of Object.entries(ohOf(v).months ?? {}).sort((a, b) => a[0] - b[0])) {
    if (!r.paid) rows.push(`<tr><td>${r.tx ? `<button type="button" data-release="${esc(r.tx)}" data-payer="${esc(r.payer)}" title="A payment in progress: release it if it's stuck">Release</button>`
        : `<input type="checkbox" name="pick" value="${esc(v.uuid)}|${m}">`}</td><td>${esc(v.name)}</td><td>${m}</td><td>${num(r.amount).toLocaleString()}¥</td>
      <td>${r.missed ? "<strong>missed</strong>" : "due"}</td></tr>`);
    else if (r.missed && !r.restored) rows.push(`<tr><td><button type="button" data-restore="${esc(v.uuid)}|${m}">Restore</button>${r.restoreTx && r.restorePayer === payer.uuid && (!payer.getFlag("sr2e", "overheadReceipts")?.[r.restoreTx] || payer.getFlag("sr2e", "overheadReceipts")[r.restoreTx].released)
        ? ` <button type="button" data-release-restore="${esc(r.restoreTx)}">Release</button>` : ""}</td><td>${esc(v.name)}</td><td>${m}</td><td>paid</td>
      <td>missed — Restore: 1 Good Karma + ${esc(await brSkillFor(v))} (4) for 1 Stress</td></tr>`);
  }
  const content = `<p style="font-size:11px;">Month ${monthNow()} has ended. Overhead is 1% of each vehicle's value + 10 per Stress Point that month.
    Lifestyle credit: ${credit.toLocaleString()}¥ a month (used: ${Object.entries(used).map(([m, d]) => `month ${m} ${num(d).toLocaleString()}¥`).join(", ") || "none"}).
    A missed month can be paid only with the current month (p.19).</p>
    ${rows.length ? `<table style="font-size:12px;"><tr><th></th><th>Vehicle</th><th>Month</th><th>Overhead</th><th></th></tr>${rows.join("")}</table>` : "<p>Nothing due.</p>"}
    <label style="font-size:12px;"><input type="checkbox" name="credit" ${credit ? "checked" : "disabled"}> Use the Lifestyle credit</label>
    <div class="form-group"><label>Good Karma (500¥ each, have ${num(payer.system.karma?.current)}):</label><input type="number" name="karma" value="0" min="0" max="${num(payer.system.karma?.current)}" style="width:52px;"></div>`;
  const dlg = await foundry.applications.api.DialogV2.prompt({ window: { title: `Vehicle overhead: ${payer.name}` }, position: { width: 640 }, rejectClose: false, content,
    render: (ev, d) => {
      const root = d.element ?? d;
      root.querySelectorAll("[data-restore]").forEach(b => b.addEventListener("click", () => {
        const [vu, m] = b.dataset.restore.split("|"); d.close(); restoreOverhead(payer, fromUuidSync(vu), Number(m));
      }));
      root.querySelectorAll("[data-release]").forEach(b => b.addEventListener("click", async () => {
        d.close(); const p = fromUuidSync(b.dataset.payer) ?? payer; await releaseOverhead(p, b.dataset.release); ui.notifications.info("Released.");
      }));
      root.querySelectorAll("[data-release-restore]").forEach(b => b.addEventListener("click", async () => {
        d.close(); await releaseOverhead(payer, b.dataset.releaseRestore, { field: "restoreTx" }); ui.notifications.info("Released.");
      }));
    },
    ok: { label: "Pay", callback: (ev, b) => ({ picks: [...b.form.querySelectorAll("[name=pick]:checked")].map(i => { const [vehicleUuid, m] = i.value.split("|"); return { vehicleUuid, month: Number(m) }; }),
      useCredit: !!b.form.elements.credit?.checked, karma: parseInt(b.form.elements.karma.value) || 0 }) } });
  if (dlg?.picks?.length) return payOverhead(payer, dlg.picks, dlg);
}

/* ── Wiring ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The GM's pass: finish interrupted assessments and settle payments whose receipt exists. */
export async function overheadPass() {
  if (!isActiveGM() || !isRigger2()) return;
  const m = monthNow();
  for (const v of billedVehicles()) {
    const o = ohOf(v);
    if (o.assessedThrough != null && o.assessedThrough < m) await assessThrough(v, m);
    for (const r of Object.values(o.months ?? {})) {
      const slots = (u) => fromUuidSync(u)?.getFlag("sr2e", "overheadReceipts") ?? {};
      // Charged → settle; released but not yet freed (an interrupted release) → free (code review R1 #6).
      if (r?.tx && !r.paid && r.payer) {
        if (slots(r.payer)[r.tx]?.released) await freeTx(r.tx, [v], "tx", r.payer);
        else await settleTx(fromUuidSync(r.payer), r.tx);
      }
      if (r?.restoreTx && slots(r.restorePayer)[r.restoreTx]?.released) await freeTx(r.restoreTx, [v], "restoreTx", r.restorePayer);
    }
  }
}

export function registerVehicleOverhead() {
  game.settings.register("sr2e", "vehicleOverheadMonth", { scope: "world", config: false, type: Number, default: 0 });
  Hooks.once("ready", () => overheadPass().catch(err => console.error("SR2E | overhead pass", err)));
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.isGM || !isRigger2()) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const actions = root?.querySelector(".header-actions");
    if (!actions || actions.querySelector("[data-sr2e-month]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.sr2eMonth = "1";
    b.innerHTML = `<i class="fas fa-calendar-check"></i> Month ends`;
    b.title = "Rigger 2 p.18–19: close the month's vehicle overhead";
    b.addEventListener("click", () => endMonth());
    actions.append(b);
  });
}
