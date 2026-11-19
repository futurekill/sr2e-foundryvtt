/**
 * Karma after creation in Foundry (SR2E p.190–191; sr2e-chargen docs/PLAN-M4a.md): the shared pure transition
 * (`karmaTransition` in rules/sr2e-rules.mjs) applied to an actor. The skill write goes first and is checked; then the
 * Karma; if the Karma write fails or is vetoed, the skill write is reverted (every field it changed; a created skill is
 * deleted), so Karma is never charged without the raise or the raise kept without the charge.
 */
import { karmaTransition } from "./rules/sr2e-rules.mjs";

/** The attribute context `karmaTransition` prices with: Foundry's effective natural rating after permanent losses. */
export function karmaAttributeContext(actor) {
  const system = actor.system, maxes = CONFIG.SR2E.racialMaximums[system.race] ?? {}, out = {};
  for (const key of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
    const info = system.naturalInfo?.[key];
    if (!info) {
      const natural = system[key].base + system[key].racial, next = natural + 1;
      out[key] = { natural, next, overMax: maxes[key] != null && next > maxes[key], stuck: false };
      continue;
    }
    // After creation the maximum no longer clamps (p.192): it only marks the double-cost line.
    const clamp = system.chargen?.inProgress !== false && info.cap != null;
    const eff = (raw) => Math.max(1, (clamp ? Math.min(raw, info.cap) : raw) - info.loss);
    const ceiling = info.cap == null ? null : info.cap - info.loss;
    const live = (raw) => Math.max(1, (clamp ? Math.min(raw, info.cap) : raw) + (info.form ?? 0) - info.loss);
    out[key] = { natural: eff(info.raw), next: eff(info.raw + 1), overMax: ceiling != null && info.raw + 1 - info.loss > ceiling,
      stuck: live(info.raw + 1) === live(info.raw) };
  }
  return out;
}

/** The transition's context for this actor (the world's More Metahumans setting, the attributes). */
export function karmaContext(actor) {
  let moreMetahumans = false;
  try { moreMetahumans = game.settings.get("sr2e", "moreMetahumans"); } catch (e) { /* default */ }
  return { moreMetahumans, race: actor.system.race, attributes: karmaAttributeContext(actor) };
}

/** The actor's source as the transition reads it. */
export const karmaSource = (actor) => ({ system: actor.system, items: actor.items.map(i => ({ _id: i.id, type: i.type, name: i.name, system: i.system })) });

/**
 * Apply a transition record. Returns true when every write landed. Order (code review M4a r1 #2, #5): skill changes,
 * a created skill, then the Karma, and only then a removal — so a vetoed Karma write never follows a delete. On a
 * failure every earlier write is reversed, each reversal CHECKED; if one fails too, the GM is told exactly what to
 * repair (nothing is reported as cleanly refused while a change still stands).
 * @param {Actor} actor
 * @param {object} record - from karmaTransition(...).record
 */
export async function applyKarmaRecord(actor, record) {
  const after = (m) => Object.fromEntries(Object.entries(m).map(([p, [, a]]) => [p, a]));
  const before = (m) => Object.fromEntries(Object.entries(m).map(([p, [b]]) => [p, b]));
  const undo = [];   // [label, fn → truthy on success]
  try {
    for (const it of record.items ?? []) {
      const item = actor.items.get(it._id);
      if (!item || !(await item.update(after(it.set)))) throw new Error("the skill write was refused");
      undo.push([`${item.name} back to its old rating`, () => item.update(before(it.set))]);
    }
    if (record.create) {
      const [made] = await actor.createEmbeddedDocuments("Item", [record.create], { keepId: !!record.create._id });
      if (!made) throw new Error("the new skill was refused");
      undo.push([`remove ${made.name}`, () => made.delete()]);
    }
    if (!(await actor.update(after(record.actor)))) throw new Error("the Karma write was refused");
    undo.push(["the Karma back", () => actor.update(before(record.actor))]);
    if (record.remove) {
      const gone = actor.items.get(record.remove);
      if (gone && !(await gone.delete())) throw new Error("the skill removal was refused");
    }
    return true;
  } catch (err) {
    const stuck = [];
    for (const [label, fn] of undo.reverse()) if (!(await Promise.resolve().then(fn).catch(() => null))) stuck.push(label);
    console.error("SR2E | Karma change not applied:", err, stuck);
    if (stuck.length) ui.notifications.error(`${actor.name}: the Karma change failed (${err.message}) and couldn't be fully reversed — fix by hand: ${stuck.join("; ")}.`, { permanent: true });
    else ui.notifications.error(`${actor.name}: the Karma change wasn't applied (${err.message}).`);
    return false;
  }
}

/** Award Karma to one actor by the book's split (p.190–191). Returns the record, or null. */
export async function awardKarma(actor, amount) {
  const r = karmaTransition(karmaSource(actor), { award: amount }, karmaContext(actor));
  if (!r.ok) { ui.notifications.warn(r.reason); return null; }
  return (await applyKarmaRecord(actor, r.record)) ? r.record : null;
}
