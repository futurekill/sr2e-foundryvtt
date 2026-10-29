/**
 * Permanent damage from Deadly wounds (SR2E core p.113–114; docs/PLAN-deadly-permanent-damage.md).
 *
 * A `preUpdateActor` hook keeps the episode state (`flags.sr2e.permDmg.<permKey(uuid)>`) in the
 * same update as the monitor change. Each episode's outcome is a durable record
 * (`permdmg:<uuid>:<g>:<attempt>`) the server creates once; the roll has no side effects before
 * that publish, and no Karma. Everything else — attribute loss, healing penalties, pending checks —
 * is derived from the non-void records.
 */
import { dermalDiceOf } from "./rules/shapeshift-rules.mjs";
import { recordEvent, eventsOf } from "./claims.mjs";
import { wareRule } from "./rules/ware-rules.mjs";
import { skinBody } from "./rules/cyberdamage-rules.mjs";
import { permKey, normalizePerm, permanentDamageResult, deadlyTransition, liveOutcomes, pendingEpisodes,
         woundPenalties } from "./rules/permanent-damage-rules.mjs";
import { workingImplant } from "./drugs.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TRACKED = new Set(["character", "npc"]);
const tracked = (a) => TRACKED.has(a?.type) && !!a.system?.conditionMonitor?.physical;
const physOf = (cm) => (cm.physical?.value ?? 0) + (cm.overflow ?? 0);
export const permPath = (a) => `flags.sr2e.permDmg.${permKey(a.uuid)}`;
export const permState = (a) => normalizePerm(a?.flags?.sr2e?.permDmg?.[permKey(a.uuid)]);
export const outcomesOf = (a) => liveOutcomes(eventsOf(a), a.uuid);

/** Healing penalties of the current wound (for healPhysical and the clock). */
export function currentPenalties(actor) {
  if (!tracked(actor)) return { baseMult: 1, totalMult: 1, doctorRequired: false, key: "", careGen: 0, pending: false };
  const st = permState(actor), o = outcomesOf(actor);
  return { ...woundPenalties(o.live, st.woundGen), careGen: st.careGen,
    pending: pendingEpisodes(st, o).some(c => c.woundGen === st.woundGen) };
}

// ── The hook ───────────────────────────────────────────────────────────────

const OPENED = new Set();
function onPreUpdate(actor, changes, options) {
  if (!tracked(actor) || options?.sr2ePerm) return;
  if (!foundry.utils.getProperty(changes, "system.conditionMonitor")) return;
  const cm = actor.system.conditionMonitor;
  const g = (p, d) => foundry.utils.getProperty(changes, p) ?? d;
  const before = physOf(cm);
  const after = g("system.conditionMonitor.physical.value", cm.physical.value) + g("system.conditionMonitor.overflow", cm.overflow ?? 0);
  if (before === after) return;
  const prior = actor.flags?.sr2e?.permDmg?.[permKey(actor.uuid)];
  const st = deadlyTransition(prior, before, after, cm.physical.max || 10);
  if (JSON.stringify(st) === JSON.stringify(normalizePerm(prior))) return;
  if (st.crossed.length > normalizePerm(prior).crossed.length) OPENED.add(actor.uuid);
  foundry.utils.setProperty(changes, permPath(actor), st);
}
function onUpdate(actor, changes, options, userId) {
  if (userId !== game.user.id || !OPENED.delete(actor.uuid)) return;
  const owners = game.users.filter(u => actor.testUserPermission(u, "OWNER")).map(u => u.id);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [...new Set([...owners, ...game.users.filter(u => u.isGM).map(u => u.id)])],
    content: `<div class="sr2e-damage-result"><strong>${esc(actor.name)} suffers a Deadly wound</strong> — roll for permanent damage:
      Body (dermal armor counts) vs 4 (SR2E p.113). <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-permdmg-btn"
      data-actor-uuid="${actor.uuid}">Roll permanent damage</button></div></div>` });
}

// ── The roll ───────────────────────────────────────────────────────────────

/** Natural Body + dermal armor: dermal plating/sheathing as the attribute pipeline counts it, troll +1. */
export function permanentDamageDice(actor) {
  const natural = actor.system.naturalAttrs?.body ?? Math.max(1, (actor.system.body?.base ?? 1) + (actor.system.body?.racial ?? 0));
  let dermal = dermalDiceOf(actor.type, actor.system);   // troll +1, bear animal form +2 (Companion p.36)
  for (const i of actor.items) {
    if (i.type !== "cyberware" && i.type !== "bioware") continue;
    const rule = wareRule(i.flags, i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null);
    if ((rule === "dermal-plating" || rule === "dermal-sheath") && workingImplant(actor, i)) {
      dermal += skinBody(i.system.attributeMods?.body ?? 0, i.system.skinLoss ?? 0);
    }
  }
  return { natural, dermal, dice: natural + dermal };
}

/** Roll the oldest pending episode; publish the outcome once (§2). */
export async function rollPermanentDamage(actor) {
  if (!actor?.isOwner) return ui.notifications.warn("Only the character's owner or the GM can roll this.");
  const st = permState(actor), o = outcomesOf(actor);
  const ep = pendingEpisodes(st, o)[0];
  if (!ep) return ui.notifications.info(`${actor.name} has no permanent-damage check waiting.`);
  const trauma = await foundry.applications.api.DialogV2.confirm({ window: { title: `${actor.name}: permanent damage` },
    content: `<p>Body (dermal armor counts) vs 4 (SR2E p.113). Was a <strong>trauma patch</strong> used? (+2)</p>`,
    yes: { label: "Yes (+2)" }, no: { label: "No" }, rejectClose: false });
  if (trauma === null) return;
  const { dice, dermal } = permanentDamageDice(actor);
  const tn = 4 + (trauma ? 2 : 0);
  const test = await actor.rollSuccessTest(dice, tn, { label: `Permanent damage: Body${dermal ? ` + ${dermal} dermal` : ""} vs ${tn} (p.113)`,
    isResistance: true, closed: true, karmaDice: 0, tnContext: { kind: "other" } });
  const successes = test?.successes ?? 0;
  const r1 = successes < 2 ? await new Roll("1d6").evaluate() : null;
  const r2 = r1 && successes === 1 && r1.total >= 5 ? await new Roll("1d6").evaluate() : null;
  const out = permanentDamageResult(successes, r1?.total ?? 1, r2?.total ?? 1);
  const attempt = o.voidedCount(ep.g);
  const won = await recordEvent(actor, `permdmg:${actor.uuid}:${ep.g}:${attempt}`,
    { type: "permdmg", ...out, woundGen: ep.woundGen, successes, trauma: !!trauma });
  if (!won) return ui.notifications.info("That check was already resolved on another device — this roll doesn't count.");
  const text = out.kind === "none" ? "no limb or organ damage."
    : out.kind === "organ" ? `a vital organ or system is gravely damaged (1D6 ${r1.total}): <strong>${out.attr} −1 permanently</strong>,
        and its racial maximum drops by 1. The patient needs continuous care by a Biotech character, and the entire healing
        takes twice as long; a replacement organ must be transplanted.`
      : `the <strong>${out.side ? `${out.side} ` : ""}${out.part}</strong> is mangled beyond healing (1D6 ${r1.total}${r2 ? `, ${r2.total}` : ""}) —
        it needs a replacement, natural or cyber, and the base healing time rises by 50%.`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">
    <strong>${esc(actor.name)}: permanent damage</strong> — ${successes} success${successes === 1 ? "" : "es"}: ${text} <em>(SR2E p.113–114)</em></div>` });
}

/** GM: void an outcome (its effects re-derive; the episode is pending again). */
export async function voidPermanentDamage(actor, id) {
  if (!game.user.isGM) return;
  if (!await recordEvent(actor, `permdmg-void:${actor.uuid}:${id}`, { type: "void", target: id, by: game.user.id })) return;
  // A running stage rolled with this outcome's penalty is stale now; the next reconcile clears it
  // (its penalty key no longer matches) — reconcile at once so the sheet shows it.
  const mod = await import("./healing-clock.mjs");
  await mod.reconcileHealing(actor);
}

/** GM: the Biotech caregiver leaves — any course needing continuous care stops (§3). */
export async function careEnds(actor) {
  const st = permState(actor);
  st.careGen += 1;
  await actor.update({ [permPath(actor)]: st }, { sr2ePerm: true });
}

/** What the sheet shows: pending checks and the full outcome history. */
export function permView(actor) {
  if (!tracked(actor)) return null;
  const st = permState(actor), o = outcomesOf(actor);
  const pending = pendingEpisodes(st, o);
  const history = o.live.map(x => ({ id: x.id, current: x.woundGen === st.woundGen,
    text: x.kind === "none" ? "no lasting damage" : x.kind === "organ" ? `${x.attr} −1 (organ)` : `${x.side ? `${x.side} ` : ""}${x.part} lost` }));
  const care = woundPenalties(o.live, st.woundGen).doctorRequired;
  return pending.length || history.length ? { pending: pending.length, history, care, isGM: game.user.isGM } : null;
}

export function registerPermanentDamage() {
  Hooks.on("preUpdateActor", onPreUpdate);
  Hooks.on("updateActor", onUpdate);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-permdmg-btn").forEach(b => b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const actor = fromUuidSync(b.dataset.actorUuid);
      if (actor) await rollPermanentDamage(actor);
    }));
  });
}
