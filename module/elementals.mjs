/**
 * Elemental services that touch sorcery (SR2E p.141–142): Aid Sorcery and
 * Spell Sustaining, for a character mage's own bound elementals.
 *
 * The rules math is pure (planElementalTransition in sr2e-rules.mjs); this
 * module is the ONE place that writes it. Every change to an elemental's
 * service state goes through elementalTransition(), which checks ownership,
 * rejects duplicate in-flight submissions on this client, writes the spirit in
 * one update, and — when a sustaining elemental's Force runs out — ends the
 * spell (p.142: "Once its Force reaches 0, it disappears"; the mage must take
 * the spell over BEFORE that).
 *
 * Out of scope, and left to the GM exactly as before: calling and presence
 * (p.140–141), line of sight, physical service (the manual service counter),
 * delegation to another character, long-term binding for days, Aid Study, and
 * Spell Defense aid. Combat Turns are counted by hand (the −1 Turn button);
 * there is no cross-client lock (no socket relay at this table's host), so one
 * person should drive an elemental at a time.
 */
import { elementalAidsCategory, planElementalTransition } from "./rules/sr2e-rules.mjs";

/** Spirit (and spell) uuids with a transition in flight on THIS client. */
const IN_FLIGHT = new Set();

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** A spirit actor that is an elemental. */
export function isElemental(actor) {
  return actor?.type === "spirit" && actor.system?.spiritType === "elemental";
}

/** Resolve a uuid synchronously, tolerating world-load order and bad input. */
function sync(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch (e) { return null; }
}

/**
 * The caster's own bound elementals: listed in its boundSpirits AND pointing
 * back at it (conjurerUuid). Characters only — NPCs have no binding list.
 */
export function boundElementals(caster) {
  if (caster?.type !== "character") return [];
  return (caster.system.boundSpirits ?? []).map(sync)
    .filter(a => isElemental(a) && a.system.conjurerUuid === caster.uuid);
}

/**
 * The elemental validly holding (sustaining) this spell, or null. Valid means
 * the whole relationship holds: bound to the spell's caster, sustaining exactly
 * this spell, of the spell's category, with Force left and no pending expiry.
 * The sustain-penalty exemption rests on this — a stale link grants nothing.
 */
export function elementalHolderOf(spell) {
  if (spell?.type !== "spell" || !spell.system?.sustaining) return null;
  if (!globalThis.game?.actors) return null;
  for (const el of boundElementals(spell.parent)) {
    const s = el.system;
    if (s.service === "sustain" && s.sustainingSpellUuid === spell.uuid && !s.depleted
        && !s.pendingExpireSpellUuid && elementalAidsCategory(s.domain, spell.system.category)) return el;
  }
  return null;
}

/** Every spirit actor in the world, including unlinked token spirits. */
function allSpirits() {
  const out = [...(game.actors ?? [])].filter(a => a.type === "spirit");
  for (const scene of game.scenes ?? []) {
    for (const t of scene.tokens ?? []) {
      if (!t.actorLink && t.actor?.type === "spirit") out.push(t.actor);
    }
  }
  return out;
}

/**
 * Why this spell may not be recast, locked, quickened or handed to an
 * elemental right now — or null. Looked up by the spell's uuid across ALL
 * spirits, not just the bound ones, so unlinking an elemental cannot hide a
 * pending expiry from a later recast (which the retry would then end).
 */
export function spellBlockedByElemental(spell) {
  if (!spell?.uuid || !globalThis.game?.actors) return null;
  for (const sp of allSpirits()) {
    const s = sp.system;
    if (s.pendingExpireSpellUuid === spell.uuid) {
      return `${sp.name} is still ending ${spell.name} — finish expiring it on ${sp.name}'s sheet first.`;
    }
    if (s.service === "sustain" && s.sustainingSpellUuid === spell.uuid && s.depleted) {
      return `${sp.name}'s Force is spent, so ${spell.name} ends — expire it on ${sp.name}'s sheet first.`;
    }
  }
  return null;
}

/**
 * The mage drops (or deletes, locks, quickens) a spell an elemental holds: the
 * elemental's service simply ends. Never calls back into the spell.
 */
export async function detachElementalHolder(spell) {
  if (!spell?.uuid || !globalThis.game?.actors) return;
  for (const sp of allSpirits()) {
    const s = sp.system;
    if (s.service === "sustain" && s.sustainingSpellUuid === spell.uuid && !s.pendingExpireSpellUuid && sp.isOwner) {
      await sp.update({ "system.service": "", "system.sustainingSpellUuid": "" });
    }
  }
}

/**
 * End a spell whose elemental ran out of Force, then clear the spirit's
 * pending record. A spell that no longer exists counts as ended once any
 * effects it left on the caster are gone. Failure leaves the record, and the
 * spirit sheet offers "Finish" to retry.
 * @returns {Promise<boolean>} whether cleanup completed
 */
async function completeExpiry(spirit) {
  const uuid = spirit.system.pendingExpireSpellUuid;
  if (!uuid) return true;
  try {
    const spell = await fromUuid(uuid);
    if (spell?.system?.sustaining) await spell.setSustaining(false);
    // ALWAYS sweep the effects too: setSustaining clears its flag before it
    // deletes them, so a failure there would otherwise leave effects behind
    // that a retry — seeing "not sustaining" — would never look for again.
    const caster = spell?.parent ?? sync(spirit.system.conjurerUuid);
    const ids = caster?.effects?.filter(e => e.origin === uuid).map(e => e.id) ?? [];
    if (ids.length) await caster.deleteEmbeddedDocuments("ActiveEffect", ids);
    await spirit.update({ "system.pendingExpireSpellUuid": "" });
    return true;
  } catch (err) {
    console.error("SR2E | ending an elemental's spell failed", err);
    ui.notifications.error(`${spirit.name}: the spell could not be ended — use Finish on its sheet to retry.`);
    return false;
  }
}

/** Extra checks for startSustain that need documents (the rest is pure). */
function sustainRefusal(spirit, spell) {
  if (!spell || spell.type !== "spell") return "that spell no longer exists";
  const caster = spell.parent;
  if (!caster || spirit.system.conjurerUuid !== caster.uuid
      || !(caster.system.boundSpirits ?? []).includes(spirit.uuid)) return "it is not bound to that spell's caster";
  if (!spell.isOwner) return "you do not own that spell";
  if (!elementalAidsCategory(spirit.system.domain, spell.system.category)) {
    return `a ${spirit.system.domain} elemental cannot sustain ${spell.system.category} spells (p.141)`;
  }
  if (spell.system.duration !== "sustained" || !spell.system.sustaining) return "the spell is not being sustained";
  if (spell.system.spellLocked || spell.system.quickened) return "a spell lock or quickening already holds it";
  const blocked = spellBlockedByElemental(spell);
  if (blocked) return blocked;
  const holder = elementalHolderOf(spell);
  if (holder) return `${holder.name} already sustains it`;
  return null;
}

/**
 * Run one elemental service transition (see planElementalTransition).
 * @param {Actor} spirit
 * @param {string} kind - aid | startSustain | sustainTurn | takeOver | endService | recall | finishExpire
 * @param {object} [args] - { n } for aid / sustainTurn; { spell } (Item) for startSustain
 * @param {object} [opts] - { quiet } suppresses the chat line (the cast posts its own)
 * @returns {Promise<{ok:boolean, reason?:string, message?:string}>}
 */
export async function elementalTransition(spirit, kind, args = {}, opts = {}) {
  const refuse = (reason) => {
    ui.notifications.warn(`${spirit?.name ?? "Elemental"}: ${reason}`);
    return { ok: false, reason };
  };
  if (!isElemental(spirit)) return refuse("only an elemental performs this service");
  if (!spirit.isOwner) return refuse("you do not own it");
  const keys = [spirit.uuid, args.spell?.uuid].filter(Boolean);
  if (keys.some(k => IN_FLIGHT.has(k))) return { ok: false, reason: "busy" };
  keys.forEach(k => IN_FLIGHT.add(k));
  try {
    if (kind === "finishExpire") {
      if (!spirit.system.pendingExpireSpellUuid) return refuse("nothing is expiring");
      const done = await completeExpiry(spirit);
      return { ok: done };
    }
    if (kind === "startSustain") {
      const why = sustainRefusal(spirit, args.spell);
      if (why) return refuse(why);
    }
    const plan = planElementalTransition(spirit.system, kind,
      { n: args.n, spellUuid: args.spell?.uuid });
    if (plan.refuse) return refuse(plan.refuse);
    await spirit.update(plan.update);
    if (!opts.quiet) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: spirit }),
        content: `<div class="sr2e-item-card"><strong>${esc(spirit.name)}</strong> ${esc(plan.message)}.</div>`
      });
    }
    if (plan.expire && !(await completeExpiry(spirit))) {
      return { ok: false, reason: "the spell could not be ended yet — Finish on its sheet", message: plan.message };
    }
    return { ok: true, message: plan.message };
  } finally {
    keys.forEach(k => IN_FLIGHT.delete(k));
  }
}

/**
 * Before banishing or unbinding an elemental: its sustained spell ends with it
 * (p.142), and a pending expiry must complete. Returns false (and says why)
 * when that cleanup fails, so the removal can be refused and the record kept.
 */
export async function releaseElemental(spirit) {
  if (!isElemental(spirit)) return true;
  const s = spirit.system;
  if (s.service === "sustain" && s.sustainingSpellUuid) {
    await spirit.update({ "system.service": "", "system.sustainingSpellUuid": "",
                          "system.pendingExpireSpellUuid": s.sustainingSpellUuid });
  }
  return completeExpiry(spirit);
}
