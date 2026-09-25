/**
 * Restricted-use spells (SR2E p.133) — the document-level checks.
 *
 * Exclusive: while casting one, no other spell is cast or sustained in the same
 * action; while the magician personally SUSTAINS one, no other spell and no
 * other magical skill. "Personally" = not held by a spell lock, quickening or an
 * elemental (the same predicate the sustaining penalty uses).
 *
 * Fetish-required: the fetish chosen at learning must be in hand (or worn and
 * touched). A reusable fetish is that one gear item; an expendable one is a
 * stock of gear bound to the spell (flags.sr2e.fetishFor), one used per cast.
 */
import { elementalHolderOf } from "./elementals.mjs";
import { exclusiveConflict } from "./rules/sr2e-rules.mjs";

export const EXCLUSIVE_WHY = "an exclusive spell shares the magician's concentration with nothing else (SR2E p.133)";

/** Is the magician (not a lock, quickening or elemental) holding this spell? */
export function personallySustaining(spell) {
  const s = spell?.system;
  return !!s?.sustaining && !s.spellLocked && !s.quickened && !elementalHolderOf(spell);
}

/** Spells the actor personally sustains, optionally as if one more were added. */
export function sustainedSet(actor, { adding = null, removing = null } = {}) {
  const list = (actor?.items ?? []).filter(i => i.type === "spell" && i.id !== removing?.id && personallySustaining(i));
  if (adding && !list.some(i => i.id === adding.id)) list.push(adding);
  return list;
}

/** Why a transition that leaves `set` sustained is refused, or null. */
export function exclusiveBlock(actor, change = {}) {
  const set = sustainedSet(actor, change).map(i => ({ restriction: i.system.restriction }));
  return exclusiveConflict(set) ? `Refused — ${EXCLUSIVE_WHY}.` : null;
}

/** Casting `spell` now: blocked by exclusivity (any duration, success or not)? */
export function preCastBlock(actor, spell) {
  const others = sustainedSet(actor, { removing: spell });
  if (spell.system.restriction === "exclusive" && others.length) {
    return `${spell.name} is exclusive, and ${actor.name} is sustaining ${others[0].name} — ${EXCLUSIVE_WHY}.`;
  }
  const excl = others.find(i => i.system.restriction === "exclusive");
  if (excl) return `${actor.name} is sustaining ${excl.name}, an exclusive spell — ${EXCLUSIVE_WHY}.`;
  return null;
}

/** Another magical skill (conjuring, astral combat, learning, Sorcery rolls) while sustaining an exclusive spell? */
export function magicalSkillBlock(actor) {
  const excl = sustainedSet(actor).find(i => i.system.restriction === "exclusive");
  return excl ? `${actor.name} is sustaining ${excl.name}, an exclusive spell: no other magical skill while it lasts (SR2E p.133).` : null;
}

/** Gear bound as this spell's expendable fetish stock. */
export function fetishStock(actor, spell) {
  return (actor?.items ?? []).filter(i => i.type === "gear" && i.getFlag?.("sr2e", "fetishFor") === spell.id);
}

/**
 * Can this fetish-required spell be cast? Returns { ok, reason, consume } where
 * `consume` is the expendable stock item to decrement.
 */
export function fetishCheck(actor, spell, inHand) {
  const r = spell.system.restriction;
  if (r !== "fetishReusable" && r !== "fetishExpendable") return { ok: true, consume: null };
  const kind = r === "fetishReusable" ? "reusable" : "expendable";
  if (!inHand) return { ok: false, reason: `${spell.name} needs its ${kind} fetish in hand (or worn and touched) — SR2E p.133.` };
  if (r === "fetishReusable") {
    const f = actor.items.get(spell.system.fetish?.itemId ?? "");
    if (!f || (f.system.quantity ?? 1) <= 0) {
      return { ok: false, reason: `${spell.name}'s fetish is gone — it cannot be replaced by another (SR2E p.133).` };
    }
    return { ok: true, consume: null };
  }
  const stock = fetishStock(actor, spell).find(i => (i.system.quantity ?? 0) > 0);
  if (!stock) return { ok: false, reason: `${spell.name} needs its expendable fetish (${spell.system.fetish?.label || "its stock"}) — none left (SR2E p.133).` };
  return { ok: true, consume: stock };
}

/** Bind a gear item as expendable fetish stock for a spell (restock). */
export async function bindFetishStock(spell, gear) {
  if (spell.system.restriction !== "fetishExpendable") return ui.notifications.warn(`${spell.name} does not use an expendable fetish.`);
  const label = spell.system.fetish?.label ?? "";
  if (gear.name !== label) return ui.notifications.warn(`${spell.name}'s fetish is "${label}" — it cannot use ${gear.name} (SR2E p.133).`);
  const other = gear.getFlag("sr2e", "fetishFor");
  if (other && other !== spell.id) return ui.notifications.warn(`${gear.name} is already another spell's fetish.`);
  await gear.setFlag("sr2e", "fetishFor", spell.id);
  ui.notifications.info(`${gear.name} is now ${spell.name}'s fetish stock.`);
}
