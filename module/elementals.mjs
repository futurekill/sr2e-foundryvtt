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

/** The automatic Combat Turn clock of a sustain — cleared when it ends. */
const CLOCK_CLEAR = {
  "system.sustainInstanceId": "", "system.sustainCombatId": "",
  "system.sustainFreePending": false, "system.sustainChargedSeq": 0
};

/** Whether this combat has a combatant whose actor IS this exact document. */
function combatHasActor(combat, actor) {
  return !!actor && !!combat?.combatants?.some(c => c.actor?.uuid === actor.uuid);
}

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
      await sp.update({ "system.service": "", "system.sustainingSpellUuid": "", ...CLOCK_CLEAR });
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
    if (spell?.system?.sustaining) {
      try { await spell.setSustaining(false); }
      catch (err) {
        // setSustaining ends the spell, then posts a chat line; judge by the
        // spell's state, not by whether that notice went out.
        if (spell.system?.sustaining) throw err;
        console.warn("SR2E | spell ended, but its notice failed", err);
      }
    }
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
    // The automatic countdown reports through its own recovery card instead.
    if (!opts.silent) ui.notifications.warn(`${spirit?.name ?? "Elemental"}: ${reason}`);
    return { ok: false, outcome: "failed", reason };
  };
  if (!isElemental(spirit)) return refuse("only an elemental performs this service");
  if (!spirit.isOwner) return refuse("you do not own it");
  const keys = [spirit.uuid, args.spell?.uuid].filter(Boolean);
  if (keys.some(k => IN_FLIGHT.has(k))) return { ok: false, outcome: "failed", reason: "busy" };
  keys.forEach(k => IN_FLIGHT.add(k));
  try {
    if (kind === "finishExpire") {
      if (!spirit.system.pendingExpireSpellUuid) return refuse("nothing is expiring");
      const done = await completeExpiry(spirit);
      return { ok: done };
    }
    const planArgs = { n: args.n, spellUuid: args.spell?.uuid, combatId: args.combatId,
                       seq: args.seq, round: args.round, timingAlive: args.timingAlive };
    if (kind === "startSustain") {
      const why = sustainRefusal(spirit, args.spell);
      if (why) return refuse(why);
      // A fresh Combat Turn clock; the combat is the one the mage is fighting
      // in right now, if any (its first boundary is then free).
      const caster = args.spell.parent;
      const combat = game.combats?.find(c => c.started && combatHasActor(c, caster));
      planArgs.instanceId = foundry.utils.randomID();
      planArgs.combatId = combat?.id ?? "";
    }
    if (kind === "consumeFree") {
      // Mark the free turn passed AND the latest boundary of its combat as
      // processed, so that boundary's recovery card cannot charge it again.
      const caster = sync(spirit.system.conjurerUuid);
      const combat = game.combats?.get(spirit.system.sustainCombatId)
        ?? game.combats?.find(c => c.started && combatHasActor(c, caster));
      planArgs.combatId = combat?.id ?? "";
      planArgs.seq = combat?.getFlag("sr2e", "boundarySeq") ?? 0;
    }
    if (kind === "combatBoundary" || kind === "consumeFree") {
      // The same check for the automatic step and for a recovery card: whoever
      // runs it must be able to finish an expiry on the caster too.
      const caster = sync(spirit.system.conjurerUuid);
      if (!caster?.isOwner) return { ok: false, outcome: "failed", reason: "cannot update the mage" };
    }
    const plan = planElementalTransition(spirit.system, kind, planArgs);
    if (plan.skip) return { ok: true, outcome: "skip" };
    if (plan.refuse) return refuse(plan.refuse);
    try {
      await spirit.update(plan.update);
    } catch (err) {
      console.error("SR2E | elemental update failed", err);
      return { ok: false, outcome: "failed", committed: false, reason: "the update was rejected" };
    }
    // The expiry completes BEFORE any chat: a failed notice must never leave a
    // spell running on an elemental whose Force is spent.
    const expiredOk = plan.expire ? await completeExpiry(spirit) : true;
    if (!opts.quiet) {
      try {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: spirit }),
          content: `<div class="sr2e-item-card"><strong>${esc(spirit.name)}</strong> ${esc(plan.message)}.</div>`
        });
      } catch (err) { console.warn("SR2E | elemental notice failed", err); }
    }
    if (!expiredOk) {
      return { ok: false, outcome: "pending", committed: true,
               reason: "the spell could not be ended yet — Finish on its sheet", message: plan.message };
    }
    return { ok: true, outcome: plan.outcome ?? "done", expired: !!plan.expire, message: plan.message };
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
                          "system.pendingExpireSpellUuid": s.sustainingSpellUuid, ...CLOCK_CLEAR });
  }
  return completeExpiry(spirit);
}

// ---------------------------------------------------------------------------
// Automatic Combat Turn countdown (0.97.0) — best effort, with recovery
// ---------------------------------------------------------------------------
// SR2ECombat#nextRound calls processCombatBoundary BEFORE it commits the new
// round, on the client advancing it (no election, no hook replay). Each
// sustaining elemental of a mage in the combat is charged once per boundary;
// its sustainChargedSeq makes a retried Next Round skip it. There is no
// cross-client coordination: two people advancing the same combat at the same
// instant, or a manual −1 racing it, can lose or duplicate one charge.

/** GM + owner user ids for a spirit's whispers. */
function audience(spirit) {
  return game.users.filter(u => u.isGM || spirit.testUserPermission(u, "OWNER")).map(u => u.id);
}

async function whisper(spirit, html) {
  try {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: spirit }), whisper: audience(spirit),
      content: `<div class="sr2e-item-card">${html}</div>` });
  } catch (err) { console.warn("SR2E | elemental notice failed", err); }
}

/** Whether a sustain's recorded timing combat still runs with its mage in it. */
function timingAlive(spirit, combatId) {
  const rec = spirit.system.sustainCombatId;
  if (!rec || rec === combatId) return false;
  const c = game.combats?.get(rec);
  return !!c?.started && combatHasActor(c, sync(spirit.system.conjurerUuid));
}

/**
 * Charge every sustaining elemental of every mage in this combat for the
 * Combat Turn that is ending. Never throws: per-spirit failures are returned
 * so the caller can post recovery cards AFTER the round update commits.
 * @param {Combat} combat
 * @param {number} seq   - the boundary being processed (boundarySeq + 1)
 * @param {number} round - the OUTGOING round
 * @returns {Promise<Array<{spirit:Actor, reason:string}>>}
 */
export async function processCombatBoundary(combat, seq, round) {
  const failures = [];
  if (!(round >= 1)) return failures;
  const seen = new Set();
  for (const cb of combat.combatants ?? []) {
    const mage = cb.actor;
    if (mage?.type !== "character") continue;
    for (const spirit of boundElementals(mage)) {
      if (seen.has(spirit.uuid)) continue;
      seen.add(spirit.uuid);
      const s = spirit.system;
      if (s.service !== "sustain") continue;
      const spell = sync(s.sustainingSpellUuid);
      if (spell?.parent !== mage) continue;
      try {
        const r = await elementalTransition(spirit, "combatBoundary",
          { combatId: combat.id, seq, round, timingAlive: timingAlive(spirit, combat.id) },
          { quiet: true, silent: true });
        if (r.outcome === "skip" || r.outcome === "free") continue;
        if (r.outcome === "charged") {
          await whisper(spirit, r.expired
            ? `<strong>${esc(spirit.name)}</strong>'s Force is spent — <strong>${esc(spell.name)}</strong> ends (SR2E p.142).`
            : `<strong>${esc(spirit.name)}</strong>: ${esc(r.message)} sustaining ${esc(spell.name)}.`);
        } else if (r.outcome === "pending") {
          await whisper(spirit, `<strong>${esc(spirit.name)}</strong>'s Force is spent and <strong>${esc(spell.name)}</strong> must end — press <em>Finish ending the spell</em> on its sheet.`);
        } else {
          failures.push({ spirit, reason: r.reason ?? "failed" });
        }
      } catch (err) {
        console.error("SR2E | Combat Turn countdown failed for", spirit.name, err);
        failures.push({ spirit, reason: "error" });
      }
    }
  }
  return failures;
}

/**
 * After the round update committed: one recovery card per spirit whose turn
 * could not be counted. The card works only while that boundary is still the
 * latest and the sustain is the same one; after that it expires.
 */
export async function postCountCards(combat, seq, round, failures) {
  for (const { spirit } of failures) {
    const s = spirit.system;
    const free = !!s.sustainFreePending && s.sustainCombatId === combat.id;
    await whisper(spirit, `<strong>${esc(spirit.name)}</strong>: Combat Turn ${round} ended but could not be counted
      automatically${free ? " (it is the free starting turn)" : ""}.
      <br><button type="button" class="sr2e-count-turn-btn"
        data-spirit-uuid="${spirit.uuid}" data-instance-id="${s.sustainInstanceId}"
        data-combat-id="${combat.id}" data-seq="${seq}" data-round="${round}">Count this Combat Turn</button>
      <br><em class="sr2e-hint">One person, once. It works until the next Combat Turn ends.</em>`);
  }
}

/**
 * The "Count this Combat Turn" card. Valid only while its boundary is still
 * current and the sustain is the same one; otherwise it expires and says how
 * to correct by hand (−1 Combat Turn, or "Starting turn already passed").
 */
export async function countTurnFromCard(data) {
  const spirit = await fromUuid(data.spiritUuid);
  if (!isElemental(spirit)) return ui.notifications.warn("That elemental no longer exists.");
  const s = spirit.system;
  const combat = game.combats?.get(data.combatId);
  const seq = Number(data.seq);
  const current = s.service === "sustain" && s.sustainInstanceId === data.instanceId
    // "" = no timing combat yet (the sustain began outside combat): the failed
    // step would have adopted this combat, so the card may too.
    && (s.sustainCombatId === data.combatId || s.sustainCombatId === "") && combat
    && (combat.getFlag("sr2e", "boundarySeq") ?? 0) === seq && (s.sustainChargedSeq ?? 0) < seq;
  if (!current) {
    return ui.notifications.warn(`This Combat Turn can no longer be counted automatically. If ${spirit.name} still owes it, press ${
      s.sustainFreePending ? "“Starting turn already passed” (if it was the free turn) or " : ""}“−1 Combat Turn” on its sheet.`);
  }
  const r = await elementalTransition(spirit, "combatBoundary",
    { combatId: data.combatId, seq, round: Number(data.round), timingAlive: false });
  if (r.outcome === "skip") ui.notifications.info("That Combat Turn was already counted.");
  return r;
}
