/**
 * Spell Defense for anyone the magician chooses to protect (SR2E p.132).
 *
 * "When protected characters or objects are attacked by magic, the magician
 * that allocated the Spell Defense dice … can choose to use those dice to
 * protect that target. Spell Defense dice, once expended, are lost." The
 * magician GRANTS dice to a target of a specific attack from their own client
 * (they own the dice): the dice leave their pool and a grant message
 * (`flags.sr2e.spellDefenseGrant`) records them, keyed by
 * (casting test message id, normalised target actor uuid) — the same key for a
 * public single-target card and a whispered area card, so an ally never needs
 * to see a private card. The target's resistance adds every grant for its key
 * and records which it used (`usedGrants`) in a public outcome carrying
 * `resolvesAttack`, after which further grants are refused.
 *
 * All Spell Defense mutations of one magician on a client run through one
 * queue (grant + rollback, own resistance spend, allocate, clear, refresh).
 */
import { enqueueAttack } from "./engagement.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Run `fn` in the magician's Spell Defense queue on this client. */
export function defenseQueue(actorUuid, fn) {
  return enqueueAttack(`sd:${actorUuid}`, fn);
}

/** A token's actor uuid (the world actor's for a linked token), else the uuid itself. */
export function normActorUuid(uuid) {
  if (!uuid) return "";
  let doc = null;
  try { doc = fromUuidSync(uuid); } catch (e) { doc = null; }
  if (doc?.documentName === "Token") return doc.actor?.uuid ?? uuid;
  if (doc?.documentName === "Actor") return doc.uuid;
  return uuid;
}

/** Defence dice a magician can grant or spend: Spell Defense + Shielding. */
export function defenceBalance(actor) {
  const p = actor?.system?.dicePools ?? {};
  return Math.max(0, (p.spellDefense ?? 0)) + Math.max(0, (p.shieldingBonus ?? 0));
}

/** Split a spend: ordinary Spell Defense first, then Shielding. */
export function defenceSplit(actor, n) {
  const p = actor?.system?.dicePools ?? {};
  const sd = Math.min(Math.max(0, p.spellDefense ?? 0), n);
  const shield = Math.min(Math.max(0, p.shieldingBonus ?? 0), n - sd);
  return { sd, shield };
}

const matches = (f, castTestId, targetActorUuid) =>
  f && f.castTestId === castTestId && f.targetActorUuid === targetActorUuid;

/** Has the attack on this target been resisted? (public record) */
export function attackResolved(castTestId, targetActorUuid) {
  return !!game.messages?.some?.(m => matches(m.flags?.sr2e?.resolvesAttack, castTestId, targetActorUuid));
}

/** Every grant for this attack and target. */
export function grantsFor(castTestId, targetActorUuid) {
  return (game.messages?.contents ?? [])
    .filter(m => matches(m.flags?.sr2e?.spellDefenseGrant, castTestId, targetActorUuid))
    .map(m => ({ messageId: m.id, ...m.flags.sr2e.spellDefenseGrant }));
}

/**
 * Grant `n` of a magician's defence dice to a target of an attack.
 * @returns {Promise<boolean>} whether the grant was made
 */
export async function grantSpellDefense(magician, { castTestId, targetActorUuid, targetName = "", n }) {
  if (!magician?.isOwner) { ui.notifications.warn("You can only spend your own magician's Spell Defense."); return false; }
  const target = normActorUuid(targetActorUuid);
  return defenseQueue(magician.uuid, async () => {
    if (attackResolved(castTestId, target)) {
      ui.notifications.warn(`${targetName || "That target"} has already resisted — the grant is too late.`);
      return false;
    }
    const want = Math.max(0, Math.min(Math.trunc(Number(n) || 0), defenceBalance(magician)));
    if (want <= 0) { ui.notifications.warn(`${magician.name} has no Spell Defense dice left.`); return false; }
    const split = defenceSplit(magician, want);
    const pools = magician.system.dicePools;
    await magician.update({ "system.dicePools.spellDefense": pools.spellDefense - split.sd,
                            "system.dicePools.shieldingBonus": pools.shieldingBonus - split.shield });
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: magician }),
        content: `<div class="sr2e-damage-result"><strong>${esc(magician.name)}</strong> spends
          <strong>${want}</strong> Spell Defense ${want === 1 ? "die" : "dice"} protecting
          <strong>${esc(targetName || "the target")}</strong> (SR2E p.132).</div>`,
        flags: { sr2e: { spellDefenseGrant: { id: foundry.utils.randomID(), castTestId, targetActorUuid: target,
          magicianUuid: magician.uuid, magicianName: magician.name, n: want } } }
      });
    } catch (e) {
      // The one refund: the grant never existed, so the dice come straight back.
      const now = magician.system.dicePools;
      await magician.update({ "system.dicePools.spellDefense": now.spellDefense + split.sd,
                              "system.dicePools.shieldingBonus": now.shieldingBonus + split.shield });
      throw e;
    }
    return true;
  });
}

/**
 * The "Spell Defense" button on a spell card (single-target resist card or the
 * public area summary): pick one of your magicians, the target(s) and the dice.
 */
export async function promptGrant({ castTestId, targetUuid = "", targetName = "" }) {
  const mine = game.actors.filter(a => a.type === "character" && a.isOwner && defenceBalance(a) > 0);
  if (!mine.length) return ui.notifications.warn("None of your magicians has Spell Defense dice allocated.");
  const targets = targetUuid
    ? [{ uuid: normActorUuid(targetUuid), name: targetName || "the target" }]
    : [...(game.user?.targets ?? [])].map(t => ({ uuid: normActorUuid(t.document.uuid), name: t.name }));
  if (!targets.length) return ui.notifications.warn("Target (T) the character(s) you want to protect first.");
  let out = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Spell Defense (SR2E p.132)" },
    rejectClose: false,
    content: `<div>
      <div class="form-group"><label>Magician:</label>
        <select name="mag">${mine.map(a => `<option value="${a.uuid}">${esc(a.name)} (${defenceBalance(a)} dice)</option>`).join("")}</select></div>
      <div class="form-group"><label>Dice for each:</label>
        <input type="number" name="n" value="1" min="1" style="width:52px;text-align:center;"></div>
      <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">Protecting: ${targets.map(t => esc(t.name)).join(", ")}.
        The target must be in your magician's line of sight (GM's call). The dice are spent now,
        and count only if they land before the target resists.</p></div>`,
    buttons: [
      { action: "go", label: "Protect", default: true, callback: (ev, b) => {
        out = { mag: b.form.elements.mag.value, n: parseInt(b.form.elements.n.value) || 0 }; } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !out) return;
  const magician = await fromUuid(out.mag);
  for (const t of targets) {
    await grantSpellDefense(magician, { castTestId, targetActorUuid: t.uuid, targetName: t.name, n: out.n });
  }
}
