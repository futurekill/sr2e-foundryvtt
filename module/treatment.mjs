/**
 * Treating the wounded (core p.111–115; docs/archive/plans/PLAN-treatment.md). A MEDIC rolls First Aid on a PATIENT who may belong
 * to another player:
 *   1. the medic's client rolls Biotech and posts a treatment card (`flags.sr2e.treatment`);
 *   2. Apply — on the medic's writer (`moneyWriterFor`), after any Karma — posts an apply REQUEST message carrying the
 *      exact success total and closing the test;
 *   3. the ACTIVE GM applies it inside the patient's `damage:<uuid>` queue: eligibility against the live patient, the
 *      gear step (receipted on the item), then ONE patient update with the receipt `flags.sr2e.treated.<cardId>`.
 * Chat messages are documents, so no socket is involved (the system socket drops at this table — CLAUDE.md).
 */
import { enqueueAttack } from "./engagement.mjs";

import { moneyWriterFor } from "./vehicle-customize.mjs";
import { healingClockOn, reconcileHealing, clockState, commitStartHeld, stableHeld, physicalSlotBusy } from "./healing-clock.mjs";
import { goldenHour } from "./rules/healing-clock-rules.mjs";
import { testTotalSuccesses, magicLost } from "./rules/sr2e-rules.mjs";
import { permanentDamageDice } from "./permanent-damage.mjs";
import { targetTokens } from "./targeting.mjs";
import * as T from "./rules/treatment-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isActiveGM = () => !!game.users?.activeGM?.isSelf;
const DEADLY = 10;
const PATIENT_TYPES = new Set(["character", "npc", "spirit"]);

/** The Physical generation (bumped on every Physical/overflow change, PLAN 2). */
export const physGen = (a) => Number(a?.flags?.sr2e?.physGen) || 0;
export const snapshotOf = (a) => T.woundSnapshot({ boxes: a.system.conditionMonitor?.physical?.value ?? 0,
  overflow: a.system.conditionMonitor?.overflow ?? 0, gen: physGen(a) });
const levelOf = (a) => a.constructor.levelForBoxes(a.system.conditionMonitor?.physical?.value ?? 0);
const damaged = (a) => PATIENT_TYPES.has(a?.type) && ((a.system.conditionMonitor?.physical?.value ?? 0) > 0
  || (a.system.conditionMonitor?.overflow ?? 0) > 0);

// ── The Physical generation hook ───────────────────────────────────────────

function onPreUpdate(actor, changes) {
  if (!PATIENT_TYPES.has(actor.type)) return;
  const g = (path, fallback) => { const v = foundry.utils.getProperty(changes, path); return v === undefined ? fallback : v; };
  const cm = actor.system.conditionMonitor ?? {};
  const before = { phys: cm.physical?.value ?? 0, over: cm.overflow ?? 0 };
  const after = { phys: g("system.conditionMonitor.physical.value", before.phys), over: g("system.conditionMonitor.overflow", before.over) };
  if (after.phys === before.phys && after.over === before.over) return;
  foundry.utils.setProperty(changes, "flags.sr2e.physGen", physGen(actor) + 1);
  // Out of Deadly: the episode's stabilization record ends with it (PLAN 6).
  if (after.phys < DEADLY && (actor.flags?.sr2e?.stabilize?.attempts ?? []).length) {
    foundry.utils.setProperty(changes, "flags.sr2e.stabilize.attempts", []);
  }
}

// ── Gear ───────────────────────────────────────────────────────────────────

/** The medic's usable medkit stacks and trauma patches. */
export function medicalGearOf(actor) {
  const items = [...(actor?.items ?? [])].filter(i => i.type === "gear");
  return { medkits: items.filter(T.medkitUsable), patches: items.filter(T.patchUsable) };
}
const biotechOf = (actor) => actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "biotech");

/** The medic's dice and defaulting penalty for this test (trained / the medkit's 3 dice / the Skill Web). */
function medicDiceFor(medic, medkit) {
  const skill = biotechOf(medic);
  const rating = skill?.system?.rating ?? 0;
  const passive = medic._passiveSkillDice?.("biotech") ?? 0;
  const web = rating > 0 ? null : medic._webDefaultByKey?.("biotech");
  const webDefault = web ? { dice: web.dice, penalty: web.penalty }
    : { dice: Math.max(1, medic.system.intelligence?.value ?? 1), penalty: CONFIG.SR2E.defaultingPenalty };
  return { ...T.medicDice({ biotech: rating, passive, webDefault, medkit: !!medkit }), rating };
}

// ── Patients ───────────────────────────────────────────────────────────────

/** Damaged patients by their EXACT document: scene tokens' actors, then player characters with no token here. */
export function patientCandidates() {
  const out = new Map();
  for (const t of canvas?.scene?.tokens ?? []) if (t.actor && damaged(t.actor) && !out.has(t.actor.uuid)) out.set(t.actor.uuid, t.actor);
  const onScene = new Set([...(canvas?.scene?.tokens ?? [])].map(t => t.actorId));
  for (const a of game.actors ?? []) if (a.hasPlayerOwner && damaged(a) && !onScene.has(a.id) && !out.has(a.uuid)) out.set(a.uuid, a);
  return [...out.values()];
}

function patientNotes(p) {
  const notes = [];
  const lvl = levelOf(p);
  if (p.getFlag("sr2e", "magicallyHealed")) notes.push("magically healed: first aid no longer helps these injuries (p.115)");
  else if (lvl !== "Deadly" && p.getFlag("sr2e", "firstAided")) notes.push("first aid already reduced this wound by its one level (p.115)");
  if (healingClockOn()) {
    const g = goldenHour(clockState(p).injury, game.time.worldTime);
    if (g.old) notes.push(g.mixed ? "the wound is over an hour old, with a newer injury inside the hour" : "the wound is more than an hour old: first aid won't help (p.115)");
    if (lvl !== "Deadly" && physicalSlotBusy(p)) notes.push("already healing (a course is under way)");
  }
  if (lvl === "Deadly") {
    const st = T.stabilization(p.flags?.sr2e?.stabilize?.attempts ?? [], { liveGen: physGen(p), bleedStable: bleedStable(p) });
    if (st.stable) notes.push("stabilized");
    else if (st.lastFailed) notes.push(`a stabilization attempt failed (best Biotech ${st.best}): only professional help may try again`);
  }
  return notes;
}
const bleedStable = (p) => { if (!healingClockOn()) return undefined; const b = clockState(p).bleed; return b ? (b.stable ?? null) : undefined; };

// ── The dialog and the roll ────────────────────────────────────────────────

/**
 * Open the Treat dialog for `medic` (optionally with a preselected patient) and roll. Returns the card or null.
 * @param {Actor} medic
 * @param {{patient?: Actor}} [o]
 */
export async function treatDialog(medic, { patient = null } = {}) {
  const list = patientCandidates();
  const pre = patient ?? targetTokens()[0]?.actor ?? null;
  if (pre && damaged(pre) && !list.some(a => a.uuid === pre.uuid)) list.unshift(pre);
  if (!list.length) return ui.notifications.info("Nobody on this scene has Physical damage to treat.");
  const gear = medicalGearOf(medic);
  const sel = pre && list.some(a => a.uuid === pre.uuid) ? pre.uuid : list[0].uuid;
  const row = (a) => `<option value="${esc(a.uuid)}" ${a.uuid === sel ? "selected" : ""}>${esc(a.name)}${a === medic ? " (self)" : ""} — ${esc(levelOf(a))}${(a.system.conditionMonitor?.overflow ?? 0) ? ` +${a.system.conditionMonitor.overflow} overflow` : ""}</option>`;
  const notesHtml = (a) => { const n = patientNotes(a); return n.length ? `<ul style="margin:2px 0 0 1rem;">${n.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""; };
  const dice = medicDiceFor(medic, gear.medkits[0]);
  let out = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Treat a patient — ${medic.name}` },
    position: { width: 520 },
    rejectClose: false,
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form") ?? dialog.element;
      const sync = () => {
        const p = list.find(a => a.uuid === form.querySelector('[name="patient"]').value);
        const deadly = p && levelOf(p) === "Deadly";
        form.querySelector(".sr2e-treat-notes").innerHTML = p ? notesHtml(p) : "";
        form.querySelectorAll("[data-deadly]").forEach(el => { el.hidden = !deadly; });
        form.querySelectorAll("[data-mage]").forEach(el => { el.hidden = !p?._medicalMagician?.(); });
      };
      form.querySelector('[name="patient"]').addEventListener("change", sync);
      sync();
    },
    content: `<div>
      <p class="hint" style="margin:0 0 6px;">First Aid (SR2E p.115): your <strong>Biotech</strong> test, in the first hour after the
        injury, one Damage Level at most; a Deadly wound can only be stabilized. You roll now; <strong>Apply</strong> on
        the card (after any Karma) and the GM's client heals the patient.</p>
      <div class="form-group"><label>Patient:</label><select name="patient">${list.map(row).join("")}</select></div>
      <div class="sr2e-treat-notes hint"></div>
      <div class="form-group"><label>Conditions:</label><select name="cond">
        <option value="0">Normal (+0)</option><option value="1">Bad (+1)</option><option value="3">Terrible (+3)</option></select></div>
      <div class="form-group"><label>Medkit:</label><select name="medkit">${gear.medkits.map(k => `<option value="${k.id}">${esc(k.name)}${k.system.quantity > 1 ? ` (${k.system.quantity - T.medkitEmpty(k)} with supplies)` : ""}</option>`).join("")}<option value="">None (+4)</option></select></div>
      <p class="hint" style="margin:0 0 6px;">${dice.source === "biotech" ? `You roll Biotech ${dice.rating}${dice.dice > dice.rating ? ` +${dice.dice - dice.rating}` : ""}.`
        : gear.medkits.length ? "You have no Biotech: with a medkit you roll its expert system's 3 dice (ruling); without one you default." : "You have no Biotech: you default (Skill Web)."}</p>
      <div class="form-group" data-mage><label title="A magician can be treated without the +2, but then checks for Magic loss (p.115)">Treat without the magician +2:</label>
        <input type="checkbox" name="waiveMagician" style="width:auto;"></div>
      <div class="form-group"><label title="First aid helps each set of injuries once, within the hour (p.115): the GM decides what counts as new">These are new injuries (GM's call):</label>
        <input type="checkbox" name="newInjuries" style="width:auto;"></div>
      <fieldset data-deadly><legend>Deadly wound (p.115)</legend>
        <div class="form-group"><label>Treatment:</label><select name="kind">
          <option value="stabilize">Stabilize (Biotech test)</option>
          <option value="professional">Professional help — another try after a failed attempt</option>
          ${gear.patches.length ? `<option value="trauma">Trauma patch — the patient's own Body test (uses one)</option>` : ""}</select></div>
        <div class="form-group"><label title="Professional help needs a better Biotech Rating than the first medic's, or better equipment (a hospital, a DocWagon™ crew)">Better equipped (GM's call):</label>
          <input type="checkbox" name="betterEquipped" style="width:auto;"></div>
      </fieldset>
    </div>`,
    buttons: [
      { action: "go", label: "Treat", default: true, callback: (ev, b) => {
        const el = b.form.elements;
        out = { patientUuid: el.patient.value, conditionMod: parseInt(el.cond.value) || 0, medkitId: el.medkit.value || null,
          waiveMagician: !!el.waiveMagician?.checked, newInjuries: !!el.newInjuries?.checked, kind: el.kind?.value || "stabilize",
          betterEquipped: !!el.betterEquipped?.checked };
      } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !out) return null;
  const p = list.find(a => a.uuid === out.patientUuid);
  return p ? rollTreatment(medic, p, out) : null;
}

/**
 * Roll a treatment and post its card. `opts`: { conditionMod, medkitId, waiveMagician, newInjuries, kind,
 * betterEquipped }. A trauma patch rolls nothing here: it is the patient's own test, rolled at Apply.
 * @returns {Promise<ChatMessage|null>}
 */
export async function rollTreatment(medic, patient, opts = {}) {
  if (!damaged(patient)) { ui.notifications.info(`${patient.name} has no Physical damage to treat.`); return null; }
  const level = levelOf(patient);
  const deadly = level === "Deadly";
  const kind = deadly ? (["stabilize", "professional", "trauma"].includes(opts.kind) ? opts.kind : "stabilize") : "aid";
  const gear = medicalGearOf(medic);
  const patch = kind === "trauma" ? gear.patches[0] ?? null : null;
  if (kind === "trauma" && !patch) { ui.notifications.warn(`${medic.name} has no trauma patch.`); return null; }
  const medkit = kind === "trauma" ? null : gear.medkits.find(k => k.id === opts.medkitId) ?? null;
  const snap = snapshotOf(patient);
  const dice = medicDiceFor(medic, medkit);
  const magician = !!patient._medicalMagician?.();
  let testMessageId = null, tn = null;
  if (kind !== "trauma") {
    const t = T.firstAidTn({ level, magician, waiveMagician: !!opts.waiveMagician, body: patient.system.body?.value ?? 1,
      conditionMod: Number(opts.conditionMod) || 0, medkit: !!medkit, defaultingPenalty: dice.penalty });
    tn = t.tn;
    const what = kind === "aid" ? "First Aid" : kind === "professional" ? "Stabilize (professional help)" : "Stabilize";
    const r = await medic.rollSuccessTest(dice.dice, tn, {
      label: `${what} on ${esc(patient.name)} (${level}) — Biotech${dice.source === "medkit" ? " (medkit, 3 dice)" : ""} vs ${tn}${t.parts.length ? ` — ${t.parts.join(", ")}` : ""} (SR2E p.115)`,
      tnContext: { kind: "skill", skill: "biotech", skillCategory: "active" },
      flags: { sr2e: { treatmentTest: { medicUuid: medic.uuid } } }
    });
    if (!r) return null;
    testMessageId = r.testMessageId;
  }
  const tr = { kind, level, patientUuid: patient.uuid, patientName: patient.name, medicUuid: medic.uuid, medicName: medic.name,
    testMessageId, tn, snap, magician, medicBiotech: dice.rating, gearId: medkit?.id ?? patch?.id ?? null,
    gearKind: medkit ? "medkit" : patch ? "traumaPatch" : null,
    opts: { waiveMagician: !!opts.waiveMagician, newInjuries: !!opts.newInjuries, betterEquipped: !!opts.betterEquipped },
    phase: "rolled" };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: medic }), content: renderTreatmentCard(tr),
    flags: { sr2e: { treatment: tr } } });
}

export function renderTreatmentCard(tr) {
  const what = { aid: "First Aid", stabilize: "Stabilize", professional: "Stabilize — professional help", trauma: "Trauma patch" }[tr.kind];
  const head = `<strong>${esc(what)}: ${esc(tr.medicName)} → ${esc(tr.patientName)}</strong> <em>(${esc(tr.level)}, SR2E p.115)</em>`;
  const gear = tr.gearKind === "medkit" ? " With a medkit." : tr.gearKind === "traumaPatch" ? " Uses one trauma patch." : " No medkit (+4).";
  let tail;
  if (tr.phase === "applied") tail = `<br><strong>Applied:</strong> ${esc(tr.result ?? "")}`;
  else if (tr.phase === "refused") tail = `<br><strong>Refused:</strong> ${esc(tr.reason ?? "")}`;
  else if (tr.phase === "requested") tail = `<br><em>Applying…</em>`;
  else tail = `<br><em>Spend Karma on the test first if you want to, then Apply.</em>
    <div class="sr2e-karma-actions"><button type="button" class="sr2e-treatment-apply">Apply</button></div>`;
  return `<div class="sr2e-damage-result sr2e-treatment">${head}<br><em>${esc(gear.trim())}</em>${tail}</div>`;
}

// ── Apply (the medic's writer) ─────────────────────────────────────────────

const TEST_QUEUES = new Map();
/** Serialize Apply and Karma on one treatment test, on this client (PLAN 4). */
function testQueue(id, fn) {
  const prev = TEST_QUEUES.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  TEST_QUEUES.set(id, next.finally(() => { if (TEST_QUEUES.get(id) === next) TEST_QUEUES.delete(id); }));
  return next;
}

/** Karma on a treatment test: only on the medic's writer, in the test's queue (applyKarmaToTest calls this). */
export function treatmentKarmaGate(medic, message, fn) {
  if (moneyWriterFor(medic)?.id !== game.user.id) {
    ui.notifications.warn(`Karma on ${medic.name}'s treatment test is spent by ${medic.name}'s player (or the GM when they are away).`);
    return null;
  }
  return testQueue(message.id, fn);
}

/** The card's Apply button: post the request with the exact total and close the test. */
export async function applyTreatment(card) {
  const tr = card?.flags?.sr2e?.treatment;
  if (!tr || tr.phase !== "rolled") return;
  const medic = await fromUuid(tr.medicUuid).catch(() => null);
  if (!medic) return ui.notifications.warn("The medic no longer exists.");
  const writer = moneyWriterFor(medic);
  if (writer?.id !== game.user.id) {
    return ui.notifications.warn(writer?.isGM ? "Only the GM can apply this now." : `${writer?.name ?? "The medic's player"} applies this treatment.`);
  }
  const run = async () => {
    const live = game.messages.get(card.id)?.flags?.sr2e?.treatment;
    if (!live || live.phase !== "rolled" || requestFor(card.id)) return;
    const test = tr.testMessageId ? game.messages.get(tr.testMessageId)?.flags?.sr2e?.test : null;
    const successes = tr.kind === "trauma" ? null : (test ? testTotalSuccesses(test) : 0);
    await ChatMessage.create({ content: `<em>${esc(tr.medicName)} applies the treatment.</em>`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id),
      flags: { sr2e: { treatmentApply: { cardId: card.id, successes }, ...(tr.testMessageId ? { closesTests: [tr.testMessageId] } : {}) } } });
  };
  return tr.testMessageId ? testQueue(tr.testMessageId, run) : run();
}
const requestFor = (cardId) => game.messages.find(m => m.flags?.sr2e?.treatmentApply?.cardId === cardId) ?? null;

// ── Application (the active GM) ────────────────────────────────────────────

const IN_FLIGHT = new Map();   // card id → the running promise (a second caller awaits the same work)

/** Process an apply request on the active GM's client. Safe to call again for the same card (receipts). */
export function processRequest(req) {
  if (!isActiveGM()) return Promise.resolve();
  const ask = req?.flags?.sr2e?.treatmentApply;
  const card = ask ? game.messages.get(ask.cardId) : null;
  const tr = card?.flags?.sr2e?.treatment;
  if (!tr || tr.phase === "applied" || tr.phase === "refused") return Promise.resolve();
  if (IN_FLIGHT.has(card.id)) return IN_FLIGHT.get(card.id);
  const run = processCard(req, ask, card, tr).finally(() => IN_FLIGHT.delete(card.id));
  IN_FLIGHT.set(card.id, run);
  return run;
}

async function processCard(req, ask, card, tr) {
  // Only the medic's owner (or a GM) may apply it (code review r1 #4).
  const medic = await fromUuid(tr.medicUuid).catch(() => null);
  if (req?.id && !isWriterRequest(req.author, medic)) { await req.delete().catch(() => {}); return; }
  // EVERY refusal gives back gear this card already spent (a resumed run included), THEN Refused (r1 #1, r2 #1).
  const refuse = async (reason) => { await refundGear(medic, tr, card.id); return finish(card, null, req, { reason }); };
  if (tr.phase === "rolled") { tr = { ...tr, phase: "requested" }; await setCard(card, tr); }
  await closeTest(tr.testMessageId);
  // The total: the closed test's own, and it must match what the medic's writer sent (r1 #4).
  const test = tr.testMessageId ? game.messages.get(tr.testMessageId)?.flags?.sr2e?.test : null;
  const successes = tr.kind === "trauma" ? null : (test ? testTotalSuccesses(test) : null);
  if (tr.kind !== "trauma" && (successes == null || (ask.successes != null && ask.successes !== successes))) {
    return refuse("the test changed after Apply — roll again");
  }
  // A player's "GM's call" ticks need the GM's yes, asked once and kept on the card (r1 #3).
  if ((tr.opts.newInjuries || tr.opts.betterEquipped) && !card.author?.isGM && tr.rulingOk == null) {
    const asks = [tr.opts.newInjuries ? "these are NEW injuries (first aid may help again)" : null,
      tr.opts.betterEquipped ? "the medic is BETTER EQUIPPED (professional help)" : null].filter(Boolean);
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Treatment: your ruling" },
      content: `<p>${esc(tr.medicName)} treating ${esc(tr.patientName)} says ${asks.map(esc).join(" and ")}. Allow it?</p>` }).catch(() => false);
    tr = { ...tr, rulingOk: !!ok, opts: ok ? tr.opts : { ...tr.opts, newInjuries: false, betterEquipped: false } };
    await setCard(card, tr);
  }
  const patient = await fromUuid(tr.patientUuid).catch(() => null);
  if (!patient) return refuse("the patient no longer exists");
  // Settle bleeding first (outside the queue: it queues itself); a device still holding it → try again shortly.
  if (healingClockOn() && !await reconcileHealing(patient)) { setTimeout(() => processRequest(req), 5000); return; }
  let stabilized = false;
  const outcome = await enqueueAttack(`damage:${patient.uuid}`, async () => {
    const cur = game.messages.get(card.id)?.flags?.sr2e?.treatment ?? tr;
    const done = patient.flags?.sr2e?.treated?.[card.id];
    if (done) return { result: done.result ?? "already applied" };
    const reason = refusal(patient, cur);
    if (reason) return { reason };
    const g = await spendGear(medic, cur, card.id);
    if (g.reason) return g;
    const r = await commit(patient, cur, card.id, successes, g);
    stabilized = !!r.stabilized;
    return r;
  });
  if (outcome?.reason) return refuse(outcome.reason);
  if (stabilized && healingClockOn()) await reconcileHealing(patient);
  await settleMagicLoss(patient, card.id);
  return finish(card, patient, req, outcome);
}

/**
 * May this user's request apply the card (r1 #4, r2 #2, r3 #1)? A GM, or an owner of the medic. The total is never
 * taken on trust — the GM reads the closed test's own — so which owner clicked Apply can't change the outcome.
 */
function isWriterRequest(author, medic) {
  if (!author || !medic) return false;
  return author.isGM || medic.testUserPermission(author, "OWNER");
}

/** Magic-loss checks owed by an applied treatment, run once: recorded in the receipt, marked done after (r1 #7). */
async function settleMagicLoss(patient, cardId) {
  const path = `flags.sr2e.treated.${cardId}`;
  const n = Number(patient.flags?.sr2e?.treated?.[cardId]?.magic) || 0;
  for (let i = 0; i < n; i++) {
    // Each check's result and its receipt land in ONE update: a replay never repeats or skips one (r2 #4).
    const done = patient.flags?.sr2e?.treated?.[cardId]?.magicChecked ?? [];
    if (done.includes(i)) continue;
    const magic = patient.system.magic?.value ?? 0;
    const roll = await new Roll("2d6").evaluate();
    const lost = magic > 0 && magicLost(roll.total, magic);
    await patient.update({ [`${path}.magicChecked`]: [...done, i], ...(lost ? { "system.magic.value": magic - 1 } : {}) });
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: patient }),
      flavor: `Magic loss check (first aid without the magician modifier, SR2E p.115): 2D6 ${roll.total} vs Magic ${magic} — ${lost
        ? `<strong>1 point of Magic is lost permanently</strong> (now ${magic - 1})` : "no loss"}.` });
  }
}

async function setCard(card, next) {
  await card.update({ content: renderTreatmentCard(next), "flags.sr2e.treatment": next });
}
async function finish(card, patient, req, outcome) {
  const tr = game.messages.get(card.id)?.flags?.sr2e?.treatment;
  if (!tr) return;
  const next = outcome?.reason ? { ...tr, phase: "refused", reason: outcome.reason } : { ...tr, phase: "applied", result: outcome?.result ?? "" };
  await setCard(card, next);
  if (req && game.messages.has(req.id)) await req.delete().catch(() => {});
}
async function closeTest(id) {
  const m = id ? game.messages.get(id) : null;
  const st = m?.flags?.sr2e?.test;
  if (!st || st.closed) return;
  const { renderSuccessTestCard } = await import("./documents/actor.mjs");
  const next = { ...st, closed: true };
  await m.update({ content: renderSuccessTestCard(next), "flags.sr2e.test": next });
}

/** Why this card may not apply to the live patient (null = it may). Inside the patient's queue. */
function refusal(patient, tr) {
  if (!T.sameWound(snapshotOf(patient), tr.snap)) return "the wound changed after the roll — roll again";
  const lvl = levelOf(patient);
  if (tr.kind === "aid") {
    if (healingClockOn()) {
      const g = goldenHour(clockState(patient).injury, game.time.worldTime);
      if (g.old && !(g.mixed && tr.opts.newInjuries)) return "the wound is more than an hour old (p.115)";
      if (physicalSlotBusy(patient)) return "the patient is already healing (a course is under way)";
    }
    if (patient.getFlag("sr2e", "magicallyHealed") && !tr.opts.newInjuries) return "magically healed: first aid no longer helps these injuries (p.115)";
    if (patient.getFlag("sr2e", "firstAided") && !tr.opts.newInjuries) return "first aid already reduced this wound by its one level (p.115)";
    return null;
  }
  if (lvl !== "Deadly") return "the wound is no longer Deadly";
  const st = T.stabilization(patient.flags?.sr2e?.stabilize?.attempts ?? [], { liveGen: physGen(patient), bleedStable: bleedStable(patient) });
  return T.stabilizeRefusal(tr.kind, st, { biotech: tr.medicBiotech, betterEquipped: tr.opts.betterEquipped });
}

/** The gear step: one item update carrying the stock change and its receipt. Returns { die?, reason? }. */
async function spendGear(medic, tr, cardId) {
  if (!tr.gearId) return {};
  const item = medic?.items?.get(tr.gearId);
  if (!item) return { reason: `the ${tr.gearKind === "medkit" ? "medkit" : "trauma patch"} is gone` };
  return enqueueAttack(`gear:${item.uuid}`, async () => {
    const live = medic.items.get(tr.gearId);
    const rec = live?.flags?.sr2e?.treatUse?.[cardId];
    if (rec) return { die: rec.die ?? null };
    if (!live) return { reason: "the gear is gone" };
    if (tr.gearKind === "medkit") {
      if (!T.medkitUsable(live)) return { reason: "the medkit's supplies ran out after the roll" };
      const roll = await new Roll("1d6").evaluate();
      const die = roll.total;
      await live.update({ "flags.sr2e.medkitEmpty": T.medkitEmpty(live) + (die === 1 ? 1 : 0), [`flags.sr2e.treatUse.${cardId}`]: { die } });
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: medic }), flavor: `${esc(live.name)}: supplies check after a treatment (SR2E p.250) — ${die === 1 ? "<strong>the supplies run out</strong>; restock with Medkit Supplies" : "supplies hold"}.` });
      return { die };
    }
    if (!T.patchUsable(live)) return { reason: "no trauma patch left" };
    await live.update({ "system.quantity": live.system.quantity - 1, [`flags.sr2e.treatUse.${cardId}`]: { patch: true } });
    return {};
  });
}

/** Give back gear a refused card already spent (once). */
async function refundGear(medic, tr, cardId) {
  const item = tr.gearId ? medic?.items?.get(tr.gearId) : null;
  if (!item) return;
  await enqueueAttack(`gear:${item.uuid}`, async () => {
    const live = medic.items.get(tr.gearId);
    const rec = live?.flags?.sr2e?.treatUse?.[cardId];
    if (!rec || rec.refunded) return;
    const upd = { [`flags.sr2e.treatUse.${cardId}.refunded`]: true };
    if (tr.gearKind === "traumaPatch") upd["system.quantity"] = live.system.quantity + 1;
    else if (rec.die === 1) upd["flags.sr2e.medkitEmpty"] = Math.max(0, T.medkitEmpty(live) - 1);
    await live.update(upd);
  });
}

/** The patient side: ONE update with the receipt. Returns { result } | { reason } (+ stabilized, magicChecks). */
async function commit(patient, tr, cardId, successes, gear) {
  const receipt = (result, magic = 0) => ({ [`flags.sr2e.treated.${cardId}`]: { at: game.time.worldTime, result, ...(magic ? { magic } : {}) } });
  const clock = healingClockOn();
  const level = levelOf(patient);
  const name = patient.name;
  const magicChecks = tr.magician && tr.opts.waiveMagician && successes > 0 ? 1 : 0;
  if (tr.kind === "aid") {
    if (!(successes > 0)) {
      const result = "no successes — first aid fails (p.115)";
      await patient.update(receipt(result));
      return { result };
    }
    const minutes = T.firstAidMinutes(level, successes);
    if (clock) {
      const now = game.time.worldTime;
      const course = { id: foundry.utils.randomID(), kind: "aid", startedAt: now, dueAt: now + Math.max(60, minutes * 60), level,
        successes, doctor: false, waiveMagician: tr.opts.waiveMagician, magician: tr.magician, deadly: false };
      const result = `${name}'s wound drops a level after ${minutes} minutes of uninterrupted treatment (p.115)`;
      // The course carries waiveMagician: the clock checks Magic loss when it completes (r1 #2), not here.
      const r = await commitStartHeld(patient, "physical", null, course, { extra: receipt(result) });
      if (!r.fits) return { reason: "the patient is already healing (a course is under way)" };
      return { result };
    }
    const before = patient.system.conditionMonitor.physical.value;
    const upd = { ...patient.healStageUpdate("physical", level, { firstAided: true }) };
    const after = upd["system.conditionMonitor.physical.value"];
    const result = `${level} → ${patient.constructor.levelForBoxes(after)} after ${minutes} uninterrupted minutes; never more than one level through first aid (p.115)`;
    await patient.update({ ...upd, ...receipt(result, magicChecks) });
    return { result, before };
  }
  // Deadly: stabilize, professional help or a trauma patch (p.115).
  const attempts = patient.flags?.sr2e?.stabilize?.attempts ?? [];
  const nat = patient._naturalAttrs?.() ?? { body: patient.system.body?.value ?? 1 };
  let ok, result;
  if (tr.kind === "trauma") {
    const dermal = permanentDamageDice(patient).dermal;
    const bloodFilter = patient.items.filter(i => i.type === "cyberware" && T.isBloodFilter(i)).reduce((m, i) => Math.max(m, Number(i.system.rating) || 0), 0);
    const ptn = T.traumaPatchTn({ dermal, bloodFilter });
    const self = await patient.rollSuccessTest(nat.body, ptn, { label: `Trauma patch: natural Body vs ${ptn} (SR2E p.115)`,
      isResistance: true, ...(patient._bodyTestOpts?.() ?? {}) });
    ok = (self?.successes ?? 0) > 0;
    result = ok ? `${name} is stabilized by the trauma patch` : `the trauma patch fails: ${name} is not stabilized`;
  } else if (successes > 0) {
    ok = true; result = `${name} is stabilized; first aid can't heal a Deadly wound — keep them stable until professional help takes over`;
  } else {
    const self = await patient.rollSuccessTest(nat.body, 10, { label: `Stabilize self: natural Body vs 10 (SR2E p.115)`,
      isResistance: true, ...(patient._bodyTestOpts?.() ?? {}) });
    ok = (self?.successes ?? 0) > 0;
    result = ok ? `${name}'s body stabilizes itself (natural Body vs 10)` : `${name} is not stabilized — a box every 10 minutes until help arrives (p.111)`;
  }
  const entry = { cardId, kind: tr.kind, biotech: tr.kind === "trauma" ? 0 : tr.medicBiotech, ok, gen: physGen(patient) };
  const extra = { "flags.sr2e.stabilize.attempts": [...attempts, entry], ...receipt(result, tr.kind === "trauma" ? 0 : magicChecks) };
  if (ok && clock) await stableHeld(patient, "aid", extra);
  else await patient.update(extra);
  return { result, stabilized: ok };
}

// ── "Ask for treatment" ────────────────────────────────────────────────────

export async function askForTreatment(patient) {
  if (!damaged(patient)) return ui.notifications.info(`${patient.name} has no Physical damage.`);
  const notes = patientNotes(patient);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: patient }),
    content: `<div class="sr2e-damage-result"><strong>${esc(patient.name)} needs treatment</strong> — ${esc(levelOf(patient))}
      ${notes.length ? `<br><em>${esc(notes.join("; "))}</em>` : ""}
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-treatment-treat" data-patient-uuid="${esc(patient.uuid)}">Treat</button></div></div>`,
    flags: { sr2e: { askTreatment: { patientUuid: patient.uuid } } } });
}

async function treatFromAsk(uuid) {
  const patient = await fromUuid(uuid).catch(() => null);
  if (!patient) return ui.notifications.warn("That patient no longer exists.");
  const mine = game.actors.filter(a => a.type === "character" && a.isOwner && (biotechOf(a)?.system?.rating > 0 || medicalGearOf(a).medkits.length));
  const pref = game.user.character && mine.includes(game.user.character) ? [game.user.character] : mine;
  if (!pref.length) return ui.notifications.warn("None of your characters has Biotech or a medkit.");
  let medic = pref[0];
  if (pref.length > 1 && !game.user.character) {
    let id = null;
    const ok = await foundry.applications.api.DialogV2.wait({ window: { title: "Who treats?" }, rejectClose: false,
      content: `<div class="form-group"><label>Medic:</label><select name="m">${pref.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div>`,
      buttons: [{ action: "go", label: "Treat", default: true, callback: (e, b) => { id = b.form.elements.m.value; } }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
    if (ok !== "go") return;
    medic = game.actors.get(id) ?? medic;
  }
  return treatDialog(medic, { patient });
}

// ── Wiring ─────────────────────────────────────────────────────────────────

/** Chat-card buttons (from renderChatMessageHTML). */
export function wireTreatmentButtons(message, html) {
  html.querySelectorAll?.(".sr2e-treatment-apply").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); applyTreatment(message); }));
  html.querySelectorAll?.(".sr2e-treatment-treat").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); treatFromAsk(b.dataset.patientUuid); }));
}

export function registerTreatmentHooks() {
  Hooks.on("preUpdateActor", onPreUpdate);
  Hooks.on("createChatMessage", (m) => { if (m.flags?.sr2e?.treatmentApply && isActiveGM()) processRequest(m).catch(err => console.error("SR2E | treatment", err)); });
  // A reload or a GM change never loses a request: re-run the open ones (receipts make this safe).
  Hooks.once("ready", () => {
    if (!isActiveGM()) return;
    for (const m of game.messages.filter(x => x.flags?.sr2e?.treatmentApply)) processRequest(m).catch(err => console.error("SR2E | treatment resume", err));
  });
}

/**
 * The macro/legacy API (`actor.firstAid`): roll and apply at once. On the active GM the request is processed inline
 * (awaited); elsewhere the GM's hook applies it.
 */
export async function treatNow(medic, patient, opts = {}) {
  const gear = medicalGearOf(medic);
  const card = await rollTreatment(medic, patient, { medkitId: opts.medkitId ?? gear.medkits[0]?.id ?? null, ...opts });
  if (!card) return null;
  await applyTreatment(card);
  const req = requestFor(card.id);
  if (req && isActiveGM()) await processRequest(req);
  return game.messages.get(card.id);
}

/**
 * A medkit's Restock (p.250, p.263): one Medkit Supplies item from the same actor refills one used-up unit. Crash-safe
 * (r2 #3, r3 #2): the supplies DEBIT comes first, with its receipt `debits.<nonce>` = the medkit's id in the same update
 * (the item kept at 0); then the refill with `restocked.<nonce>`. A debit whose refill never landed is completed first,
 * so one unit never refills two kits and a refill never happens without its debit.
 */
export async function restockMedkit(item) {
  const actor = item?.parent;
  if (!actor || T.medicalGearRule(item) !== "medkit") return;
  const supplies = () => actor.items.filter(i => T.medicalGearRule(i) === "medkitSupplies");
  const owedDebit = () => {
    const kit = actor.items.get(item.id);
    for (const sup of supplies()) for (const [nonce, kitId] of Object.entries(sup.flags?.sr2e?.debits ?? {})) {
      if (kitId === item.id && !kit?.flags?.sr2e?.restocked?.[nonce]) return { sup, nonce };
    }
    return null;
  };
  if (!owedDebit() && T.medkitEmpty(item) < 1) return ui.notifications.info(`${item.name} has its supplies.`);
  const sup0 = owedDebit()?.sup ?? supplies().find(i => (Number(i.system.quantity) || 0) >= 1);
  if (!sup0) return ui.notifications.warn(`${actor.name} has no Medkit Supplies (50¥, SR2E p.263) to restock with.`);
  // One client restocks an actor's kits: its money writer (the owner the money system already picks), so the local
  // queues below serialize every debit (r4–r6). shortcut: a writer handoff in the same instant could double a 50¥
  // debit; upgrade to a GM request (like treatments) if a table ever sees it.
  if (moneyWriterFor(actor)?.id !== game.user.id) return ui.notifications.warn(`${moneyWriterFor(actor)?.name ?? "The owner"} restocks ${actor.name}'s medkits.`);
  // Lock order: the medkit, then the supplies (nothing else nests gear queues) — r1 #5.
  return enqueueAttack(`gear:${item.uuid}`, () => enqueueAttack(`gear:${sup0.uuid}`, async () => {
    let owed = owedDebit();
    if (!owed) {
      const kit = actor.items.get(item.id), sup = actor.items.get(sup0.id);
      if (!kit || T.medkitEmpty(kit) < 1 || !sup || (Number(sup.system.quantity) || 0) < 1) return;
      // Two owners on two clients: the server admits ONE debit per step of the stack's debit count (r4 #1).
      const nonce = foundry.utils.randomID();
      await sup.update({ "system.quantity": sup.system.quantity - 1, [`flags.sr2e.debits.${nonce}`]: item.id });
      owed = { sup, nonce };
    }
    const kit = actor.items.get(item.id);
    if (!kit) return;
    await kit.update({ "flags.sr2e.medkitEmpty": Math.max(0, T.medkitEmpty(kit) - 1), [`flags.sr2e.restocked.${owed.nonce}`]: true });
    ui.notifications.info(`${kit.name} restocked.`);
  }));
}

/** GM, clock off: end a CURRENT stabilization (p.115), inside the patient queue (code review r1 #6). */
export async function endStabilization(actor) {
  if (!game.user.isGM) return;
  const { stabilizeEndedUpdate } = await import("./healing-clock.mjs");
  return enqueueAttack(`damage:${actor.uuid}`, async () => {
    if (!canEndStabilization(actor)) return;
    await actor.update(stabilizeEndedUpdate(actor));
  });
}
/** Is there a live (clock-off) stabilization a GM may end? */
export function canEndStabilization(actor) {
  if (healingClockOn()) return false;
  const st = T.stabilization(actor.flags?.sr2e?.stabilize?.attempts ?? [], { liveGen: physGen(actor) });
  return st.stable;
}
