/**
 * Cybermancy (optional `cybermancy`; docs/PLAN-cybertechnology-phase6.md; Cybertechnology pp.78–84).
 * Every operation, scheduled event and death is a durable event record (`recordEvent`),
 * folded by `foldCym`. Every lethal or permanent outcome is a GM click; periodic events are
 * PROMPTED on the game clock, never applied. The sheet panel is the durable list of what's pending.
 */
import { recordEvent, eventsOf, once, markersOf } from "./claims.mjs";
import { claimId, STUCK_MS } from "./rules/claim-rules.mjs";
import { foldCym, survivalTN, cdsBand, cancerDevelops, cdsTreatTN, cdsRecoveryDays, characterTN, perPoint, DAY_S } from "./rules/cym-rules.mjs";
import { MONTH_S } from "./rules/mbw-rules.mjs";
import { surgeryEssencePct, surgicalEssence, testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { commitDamage } from "./drugs.mjs";
import { moneyQueue, adjustNuyen, created, deleted } from "./money.mjs";
import { RL } from "./util/roll-label.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const r2 = (n) => Math.round(n * 100) / 100;
const WEEK_S = 7 * DAY_S, REFILL_S = 10 * DAY_S;
export const IMS_COST = 137750, IMS_ESSENCE = 0.25, REFILL_COST = 15000;
const CT_ITEMS = { ims: "Compendium.sr2e-cybertechnology.ct-bodyware.Item.797911b4b3489c01",
  "auto-medication": "Compendium.sr2e-cybertechnology.ct-bodyware.Item.85c9a547aa6fe5bc" };
const FALLBACK = {
  ims: { name: "Invoked Memory Stimulator", type: "cyberware", img: "icons/svg/item-bag.svg",
    system: { location: "headware", grade: "standard", essenceCost: IMS_ESSENCE, rating: 1, cost: IMS_COST, installed: true,
      notes: "Received in every cybermantic operation (Cybertechnology p.80)." }, flags: { sr2e: { rule: "ims" } } },
  "auto-medication": { name: "Automatic-Medication System", type: "cyberware", img: "icons/svg/item-bag.svg",
    system: { location: "bodyware", grade: "standard", essenceCost: 0, rating: 1, cost: 0, installed: true,
      notes: "Refills 15,000¥ every 10 days, or the character dies (Cybertechnology p.80)." }, flags: { sr2e: { rule: "auto-medication" } } }
};

export const cymOn = () => { try { return game.settings.get("sr2e", "cybermancy"); } catch (e) { return false; } };
export const cymFold = (actor) => foldCym(eventsOf(actor).filter(e => String(e.key).startsWith("cym:")),
  game.time.worldTime, actor?.flags?.sr2e?.cymReceipts ?? {});
const signedOf = (actor) => actor.system.essence?.signed ?? actor.system.essence?.value ?? 0;
const negOf = (actor) => Math.max(0, -signedOf(actor));
const hasRule = (actor, rule) => actor.items.some(i => i.type === "cyberware" && i.system.installed && i.system.wareRule === rule);
const autoEssence = () => { try { return game.settings.get("sr2e", "autoEssence"); } catch (e) { return true; } };
const d6 = async (n = 1) => (await new Roll(`${n}d6`).evaluate()).total;
const roll = async (dice, tn) => { const r = await SR2ESuccessRoll.successTest(Math.max(0, dice), tn); return { successes: r.successes, results: r.results }; };
const date = (wt) => { try { return game.time.calendar?.format?.(wt) ?? `${Math.round(wt / DAY_S)} days`; } catch (e) { return `day ${Math.round(wt / DAY_S)}`; } };

/** GM-only, characters only, the setting on; resolves a token actor by its full UUID (cards carry it). */
async function actorFor(uuidOrActor) {
  const a = typeof uuidOrActor === "string" ? await fromUuid(uuidOrActor) : uuidOrActor;
  if (!a || a.type !== "character") { ui.notifications.warn("Cybermancy: that character is gone."); return null; }
  if (!game.user.isGM) { ui.notifications.warn("Cybermancy is the GM's to resolve."); return null; }
  if (!cymOn()) { ui.notifications.warn("The Cybermancy setting is off."); return null; }
  return a;
}
const btn = (actor, op, label, arg = "", title = "") =>
  `<button type="button" class="sr2e-resist-btn sr2e-cym-btn" data-actor="${esc(actor.uuid)}" data-op="${op}" data-arg="${esc(arg)}" title="${esc(title)}">${esc(label)}</button>`;
async function card(actor, html, { whisper = true } = {}) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-damage-result sr2e-cym-card">${html}</div>`,
    ...(whisper ? { whisper: ChatMessage.getWhisperRecipients("GM") } : {}) });
}
async function record(actor, key, payload, lost = "Already recorded (another click got there first).") {
  const ok = await recordEvent(actor, key, { wt: game.time.worldTime, ...payload });
  if (!ok) ui.notifications.info(lost);
  return ok;
}
const confirm = (title, html) => foundry.applications.api.DialogV2.confirm({ window: { title }, content: `<p>${html}</p>` });
const askNumbers = (title, html, fields) => foundry.applications.api.DialogV2.prompt({ window: { title },
  content: `<p>${html}</p>${fields.map(([n, l, v]) => `<div class="form-group"><label>${l}</label><input type="number" name="${n}" value="${v}"></div>`).join("")}`,
  ok: { callback: (e, b) => Object.fromEntries(fields.map(([n]) => [n, Number(b.form.elements[n].value) || 0])) } }).catch(() => null);

// ── The operation (p.79–80) ─────────────────────────────────────────────────────

/** Is this surgery cybermancy (§2)? `pv` is the sheet's surgery preview. */
export function cymSurgery(actor, pv) {
  const ims = hasRule(actor, "ims") ? 0 : IMS_ESSENCE;
  const intended = r2(pv.now - pv.plain - ims);
  return { intended, ims: !!ims, cybermancy: intended < 0 || pv.end - ims < 0, tn: survivalTN(-intended) };
}

/** Freeze a proposed operation and post the GM's card. Called inside the purchase queue. */
export async function proposeOperation(actor, { itemData, pv, pick, price, fee }) {
  if (!cymOn() || !game.user.isGM || actor.type !== "character") return null;
  if (cymFold(actor).dead) { ui.notifications.warn(`${actor.name} is dead (cybermancy).`); return null; }
  const cs = cymSurgery(actor, pv);
  const items = [{ slot: "implant", data: foundry.utils.deepClone(itemData) }];
  for (const rule of ["ims", "auto-medication"]) {
    if (hasRule(actor, rule)) continue;
    const doc = await fromUuid(CT_ITEMS[rule]).catch(() => null);
    const data = doc ? doc.toObject() : foundry.utils.deepClone(FALLBACK[rule]);
    delete data._id; data.system.installed = true;
    foundry.utils.setProperty(data, "flags.sr2e.rule", rule);
    items.push({ slot: rule, data });
  }
  const imsCost = cs.ims ? IMS_COST : 0;
  if ((actor.system.nuyen ?? 0) < price + fee + imsCost) {
    ui.notifications.warn(`${actor.name} can't afford the operation (${(price + fee + imsCost).toLocaleString("en-US")}¥): nothing proposed.`);
    return null;
  }
  const opId = foundry.utils.randomID();
  const snapshot = { cyberIds: actor.items.filter(i => i.type === "cyberware" && i.system.installed).map(i => i.id).sort(),
    nuyen: actor.system.nuyen ?? 0, signed: signedOf(actor), manualSigned: actor.system.essence?.manualSigned ?? null,
    willpower: actor.system.willpower?.value ?? 0, intended: cs.intended, tn: cs.tn, plain: pv.plain,
    price, fee, imsCost, total: price + fee + imsCost, items, wound: !!pick.wound, woundBoxes: pv.category?.boxes ?? 0 };
  if (!await record(actor, `cym:op:${opId}`, { type: "op", opId, snapshot })) return null;
  await card(actor, `<strong>${esc(actor.name)}: cybermancy proposed</strong> — ${esc(itemData.name)}${cs.ims ? " + IMS" : ""}${items.some(i => i.slot === "auto-medication") ? " + automatic-medication system" : ""}.
    <br>Intended Essence <strong>${cs.intended}</strong>: the doctor's Biotech test vs <strong>TN ${cs.tn}</strong> (Cybersurgery/Cybermancy Survival Table, p.79),
    plus Doctoring modifiers except intensive care. No Karma; failure kills the patient (p.80).
    <br>${(price + fee + imsCost).toLocaleString("en-US")}¥ on success (${price}¥ implant, ${fee}¥ surgery${imsCost ? `, ${imsCost.toLocaleString("en-US")}¥ IMS` : ""}).
    <div class="sr2e-karma-actions">${btn(actor, "opRoll", "Roll the doctor's test", opId)}${btn(actor, "opCancel", "Withdraw", opId)}</div>`);
  return opId;
}

/** The doctor's test: rolled side-effect-free and recorded in the same create (no Karma, p.80). */
export async function rollOperation(uuid, opId) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor), o = f.ops.get(opId);
  if (!o || o.done || o.cancelIntent || o.cancelled) return ui.notifications.info("That operation isn't awaiting the doctor's test.");
  if (o.roll) return ui.notifications.info("The doctor's test is already rolled (void it from the sheet to reroll).");
  const s = o.proposal.snapshot;
  const v = await askNumbers("Cybermancy: the doctor's test", `Biotech dice and the Doctoring Table modifiers (intensive care excluded) vs TN ${s.tn}.`,
    [["dice", "Doctor's Biotech dice", 6], ["mod", "TN modifiers", 0]]);
  if (!v) return;
  const tn = s.tn + v.mod;
  const { successes, results } = await roll(v.dice, tn);
  const survived = successes > 0, pct = surgeryEssencePct(successes);
  const a = f.attemptsOf(`cym:op-roll:${opId}:`) + 1;
  if (!await record(actor, `cym:op-roll:${opId}:${a}`, { type: "opRoll", opId, survived, successes, results, pct, dice: v.dice, tn },
    "That test was already rolled.")) return;
  return card(actor, survived
    ? `<strong>${esc(actor.name)} survives the cybermancy</strong>: ${successes} success${successes === 1 ? "" : "es"} vs TN ${tn}; implant Essence ${pct > 0 ? "+" : ""}${pct}% (p.53).
       <div class="sr2e-karma-actions">${btn(actor, "opApply", "Apply the operation", opId)}${btn(actor, "cancerRoll", "Roll for cancer (GM only)", opId, "p.84")}</div>`
    : `<strong>${esc(actor.name)} dies on the table</strong>: 0 successes vs TN ${tn} (p.80). Nothing was charged.
       <div class="sr2e-karma-actions">${btn(actor, "death", "Confirm death on the table", `op:${opId}`)}</div>`);
}

/** The claimed step owner for an operation (Apply, Resume and Cancel share it). */
async function claimOp(actor, opId, resume) {
  const prefix = `cym:apply:${opId}:`;
  const claims = markersOf(actor).filter(m => String(m.key).startsWith(prefix));
  const last = claims.sort((x, y) => (x.at ?? 0) - (y.at ?? 0)).at(-1);
  if (last && !resume) { ui.notifications.info("That operation is already being applied; if it stopped, use Resume on the sheet."); return false; }
  if (last && game.time.serverTime - (Number(last.at) || 0) <= STUCK_MS) {
    ui.notifications.info("That operation is still being applied (try again in two minutes if it stopped)."); return false;
  }
  return once(actor, `${prefix}${claims.length + 1}`);
}
const receiptOf = (actor, opId) => actor.flags?.sr2e?.cymReceipts?.[opId] ?? {};
const itemId = (opId, slot) => claimId(`cym:item:${opId}:${slot}`);

/** Apply (or resume) a survived operation: charge, items one by one, wound, done. Each step receipted. */
export async function applyOperation(uuid, opId, { resume = false } = {}) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor), o = f.ops.get(opId);
  if (!o || o.done || o.cancelled) return ui.notifications.info("That operation is already finished.");
  if (o.cancelIntent) return cancelOperation(uuid, opId, { resume: true, confirmed: true });
  if (!o.roll?.survived) return ui.notifications.warn("Only a survived operation can be applied.");
  const s = o.proposal.snapshot;
  // Before the charge the proposal must still be true. Checked here for a quick answer,
  // and again inside the money queue, where nothing can change under it.
  const stale = () => {
    if (receiptOf(actor, opId).charged) return false;
    const ids = actor.items.filter(i => i.type === "cyberware" && i.system.installed).map(i => i.id).sort();
    return JSON.stringify(ids) !== JSON.stringify(s.cyberIds) || (actor.system.nuyen ?? 0) !== s.nuyen
      || signedOf(actor) !== s.signed || (actor.system.essence?.manualSigned ?? null) !== s.manualSigned;
  };
  const staleMsg = `${actor.name} changed since the operation was proposed (cyberware, nuyen or Essence): withdraw it and propose it again.`;
  if (stale()) return ui.notifications.warn(staleMsg);
  if (!await claimOp(actor, opId, resume)) return;
  const pct = o.roll.pct ?? 0;
  const final = r2(s.intended + s.plain - surgicalEssence(s.plain, pct));
  // 1–2. In ONE money-queue entry: re-validate, charge (nuyen, receipt and manual
  // Essence in one update), then the items by deterministic id — so no sale, purchase or
  // reprice on this client lands between the charge and the implants it paid for.
  const applied = await moneyQueue(actor, async () => {
    if (stale()) { ui.notifications.warn(staleMsg); return false; }
    if (!receiptOf(actor, opId).charged) {
      const manual = !autoEssence();
      const charged = await adjustNuyen(actor, -s.total, {
        [`flags.sr2e.cymReceipts.${opId}.charged`]: { amount: s.total, manualBefore: s.manualSigned, manualAfter: manual ? final : null },
        ...(manual ? { "system.essence.manualSigned": final } : {}) });
      if (!charged) { ui.notifications.warn(`${actor.name} couldn't be charged ${s.total.toLocaleString("en-US")}¥ for the operation: nothing was applied.`); return false; }
    }
    for (const { slot, data } of s.items) {
      const id = itemId(opId, slot);
      if (actor.items.has(id)) continue;
      const d = foundry.utils.deepClone(data);
      d._id = id;
      d.system = { ...(d.system ?? {}), installed: true, ...(slot === "implant" ? { surgeryEssencePct: pct } : {}) };
      d.flags = foundry.utils.mergeObject(d.flags ?? {}, { sr2e: { cymOp: opId, ...(slot === "implant" && s.price > 0 ? { paid: s.price } : {}) } });
      if (!(await created(actor, actor.createEmbeddedDocuments("Item", [d], { keepId: true }), 1, "cybermancy item")) && !actor.items.has(id)) {
        ui.notifications.error(`The operation was charged but ${d.name} couldn't be added: use Resume on the sheet.`, { permanent: true });
        return false;
      }
    }
    return true;
  }, "cybermancy apply");
  if (!applied) return;
  // 3. The surgery wound, receipted in the monitor update.
  if (s.wound && s.woundBoxes > 0) {
    const wounded = () => !!receiptOf(actor, opId).wounded;
    if (!wounded()) await commitDamage(actor, "physical", s.woundBoxes, { extra: { [`flags.sr2e.cymReceipts.${opId}.wounded`]: true }, skipIf: wounded, source: "cybermancy" });
  }
  // 4. Done. Only the FIRST establishes the schedules (later ones append, §2).
  const wt = game.time.worldTime;
  const first = !f.established;
  const band = cdsBand(-final);
  await recordEvent(actor, `cym:op-done:${opId}`, { type: "opDone", opId, wt, final, willpowerBefore: s.willpower,
    nextRefill: wt + REFILL_S, nextCds: wt + (band?.periodS ?? 6 * MONTH_S) });
  if (first && final >= 0) await recordEvent(actor, "cym:suspend:0", { type: "suspend", wt });
  return card(actor, `<strong>${esc(actor.name)}: cybermancy complete</strong>. Essence ${final}; ${s.total.toLocaleString("en-US")}¥ charged.
    <br>Automatic-medication refills: 15,000¥ every 10 days, or death (p.80). Chronic Dissociation Syndrome tests on the game clock (p.83).
    ${first ? `<br>Willpower before cybermancy: ${s.willpower}.` : ""}`);
}

/**
 * An implant created by a cybermantic operation that isn't done or cancelled yet. Its
 * money lives in the operation's receipt, so selling, deleting, repricing or moving it
 * would refund it twice (docs/PLAN-money-queue-and-eye-accessories.md).
 */
export function unfinishedCymImplant(actor, item) {
  const opId = item?.flags?.sr2e?.cymOp;
  if (!opId) return false;
  const o = cymFold(actor).ops.get(opId);
  return !!o && !o.done && !o.cancelled;
}

/** Cancel and refund (same claim as Apply): intent, refund, items, terminal record. */
export async function cancelOperation(uuid, opId, { resume = false, confirmed = false } = {}) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor), o = f.ops.get(opId);
  if (!o || o.done || o.cancelled) return ui.notifications.info("That operation can't be cancelled.");
  if (!confirmed && !await confirm("Cancel the operation", `Refund ${actor.name}'s operation and remove what it installed?`)) return;
  if (!await claimOp(actor, opId, resume || o.cancelIntent)) return;
  await recordEvent(actor, `cym:op-cancel-intent:${opId}`, { type: "opCancelIntent", opId, wt: game.time.worldTime });
  const notes = [];
  // One money-queue entry: the operation's items go first (checked), then the refund
  // with its receipt — never a refund while its implants are still on the character.
  const undone = await moneyQueue(actor, async () => {
    const ids = o.proposal.snapshot.items.map(({ slot }) => itemId(opId, slot)).filter(id => actor.items.has(id));
    if (ids.length && !(await deleted(actor, actor.deleteEmbeddedDocuments("Item", ids), ids, "cybermancy cancel"))) {
      ui.notifications.error("The operation's implants couldn't all be removed: nothing was refunded. Try Cancel again.", { permanent: true });
      return false;
    }
    const r = receiptOf(actor, opId);
    if (!r.charged || r.refunded) return true;
    const restore = !autoEssence() && r.charged.manualAfter != null;
    const same = (actor.system.essence?.manualSigned ?? null) === r.charged.manualAfter;
    if (restore && !same) notes.push("Manual Essence was edited since the charge: set it by hand.");
    if (!(await adjustNuyen(actor, r.charged.amount, { [`flags.sr2e.cymReceipts.${opId}.refunded`]: true,
      ...(restore && same ? { "system.essence.manualSigned": r.charged.manualBefore } : {}) }))) {
      ui.notifications.error(`The implants were removed but the ${r.charged.amount.toLocaleString("en-US")}¥ refund failed: add it to ${actor.name} by hand.`, { permanent: true });
      return false;
    }
    return true;
  }, "cybermancy cancel");
  if (!undone) return;
  await recordEvent(actor, `cym:op-cancelled:${opId}`, { type: "opCancelled", opId, wt: game.time.worldTime });
  return card(actor, `<strong>${esc(actor.name)}</strong>: the cybermantic operation was cancelled${receiptOf(actor, opId).refunded ? " and refunded" : ""}.${notes.map(n => ` <em>${esc(n)}</em>`).join("")}`);
}

// ── Death and its correction ─────────────────────────────────────────────────────

/** Record a death the fold allows: the op failed, CDS ran out, or a treatment succeeded. */
export async function confirmDeath(uuid, cause) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor);
  if (f.dead) return ui.notifications.info(`${actor.name} is already dead.`);
  const [kind, ref] = String(cause).split(/:(.*)/s);
  const ok = kind === "op" ? f.ops.get(ref)?.roll?.survived === false
    : kind === "cds" ? !!f.cds && f.cds.deathAt <= game.time.worldTime
    : kind === "cds-treat" ? f.live.has(ref) && f.byKey.get(ref)?.outcome === "fatal"
    : false;
  if (!ok) return ui.notifications.warn("That death isn't (or is no longer) on record.");
  if (!await confirm("Confirm death", `${esc(actor.name)} dies (cybermancy). This can only be undone with Revive.`)) return;
  if (!await record(actor, `cym:death:${cause}`, { type: "death", cause })) return;
  return card(actor, `<strong>${esc(actor.name)} is dead</strong> (cybermancy).`, { whisper: false });
}

export async function revive(uuid) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor);
  if (!f.dead) return ui.notifications.info(`${actor.name} isn't dead.`);
  if (!await confirm("Revive", `Correct a mistaken cybermantic death for ${esc(actor.name)}?`)) return;
  const n = eventsOf(actor).filter(e => e.type === "revive").length + 1;
  await record(actor, `cym:revive:${n}`, { type: "revive" });
}

export async function voidRecord(uuid, key) {
  const actor = await actorFor(uuid); if (!actor) return;
  if (!cymFold(actor).voidable.some(e => e.key === key)) return ui.notifications.warn("That record can't be voided.");
  await record(actor, `cym:void:${key}`, { type: "void", target: key });
}

// ── Refills and CDS (pp.80, 83–84) ─────────────────────────────────────────────

/** Resolve the due refill: "refilled" | "corp" | "died". Nuyen is the GM's (manual). */
export async function resolveRefill(uuid, outcome) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor), due = f.refillDue;
  if (!due || f.dead) return ui.notifications.info(`${actor.name}: no refill is due.`);
  if (outcome === "died" && !await confirm("Not refilled", `The medication runs out: ${esc(actor.name)} dies immediately (p.80).`)) return;
  const a = f.attemptsOf(`cym:refill:${due.n}:`) + 1;
  if (!await record(actor, `cym:refill:${due.n}:${a}`, { type: "refill", n: due.n, outcome, nextDue: due.dueAt + REFILL_S })) return;
  return card(actor, outcome === "died" ? `<strong>${esc(actor.name)} dies</strong>: the automatic-medication system ran out (p.80).`
    : `<strong>${esc(actor.name)}</strong>: medication refill #${due.n} ${outcome === "corp" ? "paid by the corp" : `bought (15,000¥, less any corp discount of 1D6 × 5%: deduct it by hand)`}. Next due ${esc(date(due.dueAt + REFILL_S))}.`,
    { whisper: outcome !== "died" });
}

/** The due CDS test: cybermantic Willpower vs the band's TN (CDS's own +3 if already active). */
export async function rollCds(uuid) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor), due = f.cdsDue;
  if (!due || f.dead) return ui.notifications.info(`${actor.name}: no CDS test is due.`);
  const b = cdsBand(negOf(actor));
  if (!b) return ui.notifications.info(`${actor.name}'s Essence isn't negative.`);
  const w = actor.system.willpower?.value ?? 0, tn = characterTN(actor, b.tn);
  const { successes, results } = await roll(w, tn);
  const failed = successes === 0, now = game.time.worldTime;
  const deathAt = failed ? (f.cds?.deathAt ?? now + (3 + w) * WEEK_S) : null;
  const a = f.attemptsOf(`cym:cds:${due.n}:`) + 1;
  if (!await record(actor, `cym:cds:${due.n}:${a}`, { type: "cds", n: due.n, failed, deathAt, successes, results, tn, nextDue: due.dueAt + b.periodS },
    "That test was already rolled.")) return;
  return card(actor, failed
    ? `<strong>${esc(actor.name)} develops Chronic Dissociation Syndrome</strong> (Willpower ${w} vs ${tn}: no successes). Can't initiate actions, only react; +4 Perception, +3 all other tests; dies ${esc(date(deathAt))} unless treated (p.83–84).`
    : `<strong>${esc(actor.name)}</strong>: CDS test passed (${successes} vs ${tn}). Next due ${esc(date(due.dueAt + b.periodS))}.`);
}

/** CDS treatment (p.84): the character's Spell Resistance (8 − earlier treatments) test. */
export async function treatCds(uuid) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor);
  if (!f.cds || f.dead) return ui.notifications.info(`${actor.name} has no active CDS.`);
  const k = f.treatments + 1, a = f.attemptsOf(`cym:cds-treat:${k}:`) + 1;
  const w = actor.system.willpower?.value ?? 0, tn = characterTN(actor, cdsTreatTN(f.treatments));
  const res = await roll(w, tn);
  let outcome = "fatal", recoveryUntil = null, rec = null;
  if (res.successes === 0) {
    outcome = "reversed";
    rec = await roll(w, 6);
    recoveryUntil = game.time.worldTime + cdsRecoveryDays(rec.successes) * DAY_S;
  }
  const key = `cym:cds-treat:${k}:${a}`;
  if (!await record(actor, key, { type: "cdsTreat", k, outcome, successes: res.successes, tn, recoverySuccesses: rec?.successes ?? null, recoveryUntil })) return;
  return card(actor, outcome === "fatal"
    ? `<strong>${esc(actor.name)}</strong> resists the treatment (${res.successes} vs ${tn}): the cybermantic magic fails and the character dies (p.84).
       <div class="sr2e-karma-actions">${btn(actor, "death", "Confirm death", `cds-treat:${key}`)}</div>`
    : `<strong>${esc(actor.name)}</strong>: the CDS reverses (${tn}: no successes). Recovery ${cdsRecoveryDays(rec.successes)} day(s), until ${esc(date(recoveryUntil))} (p.84).`);
}

// ── Better Off Dead (p.80) ──────────────────────────────────────────────────────

/** The healing update's own care receipt when the patient is in overflow (§7). */
export function careReceipt(actor, key = null) {
  if (actor?.type !== "character" || !actor.system.cym || (actor.system.conditionMonitor?.overflow ?? 0) <= 0) return {};
  // A deterministic `key` (a clocked healing course) makes a duplicate completion write the same receipt.
  return { [`flags.sr2e.cymCare.${key ?? foundry.utils.randomID()}`]: { overflowBefore: actor.system.conditionMonitor.overflow, wt: game.time.worldTime } };
}

export async function overflowTest(uuid, receipt) {
  const actor = await actorFor(uuid); if (!actor) return;
  const f = cymFold(actor);
  const care = f.cares.find(c => c.receipt === receipt);
  if (!care || f.dead || f.overflowOut(receipt)) return ui.notifications.info("That overflow test isn't pending.");
  const tn = 2 * care.overflowBefore;
  const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, tn,
    { label: RL("BetterOffDead", { tn }), tnContext: { kind: "other" } });
  return card(actor, `<strong>${esc(actor.name)}</strong>: once Karma is spent on that test,
    <div class="sr2e-karma-actions">${btn(actor, "overflowFinal", "Finalize the result", `${receipt}|${r?.testMessageId ?? ""}`)}</div>`);
}

/** Close the test to Karma, re-read its CURRENT successes, record ONE outcome. */
export async function finalizeOverflow(uuid, arg) {
  const actor = await actorFor(uuid); if (!actor) return;
  const [receipt, msgId] = String(arg).split("|");
  const f = cymFold(actor);
  if (f.dead || f.overflowOut(receipt) || !f.cares.some(c => c.receipt === receipt)) return ui.notifications.info("That overflow test is already finalized.");
  const m = game.messages.get(msgId), st = m?.flags?.sr2e?.test;
  if (!st) return ui.notifications.warn("The test's chat card is gone: roll it again from the sheet.");
  if (!st.closed) {
    const { renderSuccessTestCard } = await import("./documents/actor.mjs");
    const next = { ...st, closed: true };
    await m.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
  }
  const successes = testTotalSuccesses(game.messages.get(msgId).flags.sr2e.test);
  const outcome = successes > 0 ? "survived" : "died";
  if (outcome === "died" && !await confirm("Better Off Dead", `${esc(actor.name)} failed (0 successes) and dies (p.80).`)) return;
  const a = f.attemptsOf(`cym:overflow-out:${receipt}:`) + 1;
  if (!await record(actor, `cym:overflow-out:${receipt}:${a}`, { type: "overflowOut", receipt, outcome, successes, messageId: msgId })) return;
  return card(actor, `<strong>${esc(actor.name)}</strong> ${outcome === "died" ? "dies" : `pulls through (${successes} successes)`} (Better Off Dead, p.80).`, { whisper: outcome !== "died" });
}

// ── Cancer (p.84): GM-private ─────────────────────────────────────────────────────

const GM_JOURNAL = "SR2E cybermancy (GM)";
async function gmJournal() {
  return game.journal.find(j => j.getFlag("sr2e", "cymJournal"))
    ?? JournalEntry.create({ name: GM_JOURNAL, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: { sr2e: { cymJournal: true } } });
}
const pageKey = (actor, opId) => `cancer:${actor.uuid}:${opId}`;
const cancerPage = (actor, opId) => game.journal.find(j => j.getFlag("sr2e", "cymJournal"))?.pages.find(p => p.getFlag("sr2e", "key") === pageKey(actor, opId)) ?? null;

export async function rollCancer(uuid, opId) {
  const actor = await actorFor(uuid); if (!actor) return;
  const o = cymFold(actor).ops.get(opId);
  if (!o?.roll?.survived) return ui.notifications.info("Cancer is rolled for a survived operation.");
  if (cancerPage(actor, opId)) return ui.notifications.info(`Already rolled: see the "${GM_JOURNAL}" journal.`);
  const v = await askNumbers("Cybermancy cancer (p.84)", "Optional bonuses: +1 for unaugmented Body 4–7, +2 for 8+; +1 for symbiotes.", [["bonus", "Bonus", 0]]);
  if (!v) return;
  const r = await d6(2), neg = -o.proposal.snapshot.intended;
  const develops = cancerDevelops(r, v.bonus, neg);
  const onsetWt = develops ? game.time.worldTime + await d6(10) * MONTH_S : null;
  const deathWt = develops ? onsetWt + (4 + await d6()) * WEEK_S : null;
  const j = await gmJournal();
  if (cancerPage(actor, opId)) return;
  await j.createEmbeddedDocuments("JournalEntryPage", [{ name: `${actor.name}: cancer check`, type: "text",
    flags: { sr2e: { key: pageKey(actor, opId), actorUuid: actor.uuid, opId, develops, onsetWt, deathWt } },
    text: { content: `<p>2D6 ${r} + ${v.bonus} vs 2 × ${neg} = ${2 * neg}: ${develops ? `<strong>cancer</strong>. Onset ${esc(date(onsetWt))}; death ${esc(date(deathWt))} (p.84).` : "no cancer."}</p>` } }]);
  return card(actor, develops
    ? `Cancer check for ${esc(actor.name)}: <strong>develops</strong> (details in the "${GM_JOURNAL}" journal).
       <div class="sr2e-karma-actions">${btn(actor, "cancerConfirm", "Confirm cancer", opId)}</div>`
    : `Cancer check for ${esc(actor.name)}: no cancer.`);
}

export async function confirmCancer(uuid, opId) {
  const actor = await actorFor(uuid); if (!actor) return;
  const p = cancerPage(actor, opId);
  if (!p?.getFlag("sr2e", "develops")) return ui.notifications.warn("No cancer proposal for that operation (roll it first).");
  await record(actor, `cym:cancer:${opId}`, { type: "cancer", opId, confirmed: true, page: pageKey(actor, opId) });
}

// ── Plain rolls ─────────────────────────────────────────────────────────────────

/** Karma hazing (optional, p.81): Essence (4), Essence treated as positive, rounded up. */
export async function hazingCheck(uuid) {
  const actor = await actorFor(uuid); if (!actor) return;
  const n = perPoint(negOf(actor));
  const { successes } = await roll(n, 4);
  return card(actor, `Karma hazing for ${esc(actor.name)}: ${n} dice vs 4 → ${successes} success${successes === 1 ? "" : "es"}${successes ? ": something hostile takes an interest (p.81)." : "."}`);
}

// ── Reconciliation (active GM only; never in preparation) ──────────────────────────

const pending = new Map();
function schedule(actor) {
  if (!game.users.activeGM?.isSelf || actor?.type !== "character") return;
  clearTimeout(pending.get(actor.uuid));
  pending.set(actor.uuid, setTimeout(() => { pending.delete(actor.uuid); reconcile(actor).catch(err => console.error("SR2E | cybermancy reconcile", err)); }, 500));
}

/** Transitions, care facts and once-only notices. Repeating it is always a no-op. */
export async function reconcile(actor) {
  if (!game.users.activeGM?.isSelf || actor?.type !== "character" || !cymOn()) return;
  let f = cymFold(actor);
  if (!f.active || f.dead) return;
  const now = game.time.worldTime, neg = negOf(actor);
  if (!f.suspended && neg <= 0) await recordEvent(actor, `cym:suspend:${f.transitions}`, { type: "suspend", wt: now });
  else if (f.suspended && neg > 0) {
    await recordEvent(actor, `cym:resume:${f.transitions}`, { type: "resume", wt: now,
      nextRefill: Math.max(f.nextRefill ?? now, now), nextCds: Math.max(f.nextCds ?? now, now) });
  }
  // Care receipts written by the healing update become durable facts.
  for (const [receipt, c] of Object.entries(actor.flags?.sr2e?.cymCare ?? {})) {
    await recordEvent(actor, `cym:care:${receipt}`, { type: "care", receipt, overflowBefore: c.overflowBefore, wt: c.wt });
  }
  f = cymFold(actor);
  const notice = (k) => recordEvent(actor, `cym:notice:${k}`, { type: "notice" });
  if (f.refillDue && await notice(`refill:${f.refillDue.n}`)) {
    await card(actor, `<strong>${esc(actor.name)}</strong>: automatic-medication refill #${f.refillDue.n} due (15,000¥, p.80).
      <div class="sr2e-karma-actions">${btn(actor, "refill", "Refilled", "refilled")}${btn(actor, "refill", "Corp pays", "corp")}${btn(actor, "refill", "Not refilled (death)", "died")}</div>`);
  }
  if (f.cdsDue && await notice(`cds:${f.cdsDue.n}`)) {
    await card(actor, `<strong>${esc(actor.name)}</strong>: Chronic Dissociation Syndrome test #${f.cdsDue.n} due (p.83).
      <div class="sr2e-karma-actions">${btn(actor, "cds", "Roll Willpower")}</div>`);
  }
  if (f.cds && f.cds.deathAt <= now && await notice(`cds-death:${f.cds.since}`)) {
    await card(actor, `<strong>${esc(actor.name)}</strong>'s untreated CDS has run its course (p.83).
      <div class="sr2e-karma-actions">${btn(actor, "death", "Confirm death", `cds:${f.cds.since}`)}</div>`);
  }
  for (const c of f.cares) {
    if (!f.overflowOut(c.receipt) && await notice(`care:${c.receipt}`)) {
      await card(actor, `<strong>${esc(actor.name)}</strong> was healed out of Physical Damage Overflow (${c.overflowBefore}): Better Off Dead (p.80).
        <div class="sr2e-karma-actions">${btn(actor, "overflowTest", `Willpower vs ${2 * c.overflowBefore}`, c.receipt)}</div>`);
    }
  }
  // Cancer onset and death, from the GM-private page; the page's own flags are the delivery markers.
  for (const opId of f.cancer) {
    const p = cancerPage(actor, opId);
    if (!p) continue;
    for (const [at, flag, what] of [[p.getFlag("sr2e", "onsetWt"), "onsetNoticed", "cancer onset"], [p.getFlag("sr2e", "deathWt"), "deathNoticed", "death from cancer"]]) {
      if (at != null && at <= now && !p.getFlag("sr2e", flag)) {
        await p.setFlag("sr2e", flag, true);
        await card(actor, `GM: ${esc(actor.name)}'s ${what} (p.84). Telling the player is yours.`);
      }
    }
  }
}

function allCharacters() {
  const seen = new Map();
  for (const a of game.actors) if (a.type === "character") seen.set(a.uuid, a);
  for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && t.actor?.type === "character") seen.set(t.actor.uuid, t.actor);
  return [...seen.values()];
}

export const reconcileAllCym = () => { for (const a of allCharacters()) schedule(a); };

export function registerCybermancyHooks() {
  const all = reconcileAllCym;
  Hooks.once("ready", all);
  for (const h of ["updateWorldTime", "canvasReady", "userConnected"]) Hooks.on(h, all);
  const byItem = (item) => item.parent instanceof Actor && schedule(item.parent);
  for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, byItem);
  Hooks.on("updateActor", (a) => schedule(a));
  const byEffect = (e) => e.parent instanceof Actor && schedule(e.parent);
  for (const h of ["createActiveEffect", "deleteActiveEffect"]) Hooks.on(h, byEffect);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-cym-btn").forEach(b => b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const { actor: uuid, op, arg } = b.dataset;
      try { await cymOp(uuid, op, arg); } catch (err) { console.error("SR2E | cybermancy", err); ui.notifications.error(err.message); }
    }));
  });
}

/** One dispatcher for card buttons and the sheet. */
export async function cymOp(uuid, op, arg = "") {
  const ops = {
    opRoll: () => rollOperation(uuid, arg), opApply: () => applyOperation(uuid, arg), opResume: () => applyOperation(uuid, arg, { resume: true }),
    opCancel: () => cancelOperation(uuid, arg), death: () => confirmDeath(uuid, arg), revive: () => revive(uuid), void: () => voidRecord(uuid, arg),
    refill: () => resolveRefill(uuid, arg), cds: () => rollCds(uuid), treat: () => treatCds(uuid),
    overflowTest: () => overflowTest(uuid, arg), overflowFinal: () => finalizeOverflow(uuid, arg),
    cancerRoll: () => rollCancer(uuid, arg), cancerConfirm: () => confirmCancer(uuid, arg), hazing: () => hazingCheck(uuid)
  };
  return ops[op]?.();
}
