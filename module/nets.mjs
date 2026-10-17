/**
 * Netguns (SSC p.72; astral FAB-NG, CSH p.103). docs/PLAN-netguns.md.
 *
 * A net hit posts a flag-backed card (`flags.sr2e.netHit`) instead of damage. Its
 * target resists once; a net that holds lives on the TOKEN (`flags.sr2e.net`), so an
 * astral net holds only the astral form. Each net has its own id: an escape commits
 * only against the net it started on, and the card's escape only while its net is the
 * current one. Turns entangled are brought up to date lazily at each attempt
 * (advanceTurns); the one background write is the active GM folding a deleted combat.
 */
import { netTN, escapeTN, netHolds, escapeImpossible, advanceTurns } from "./rules/net-rules.mjs";
import { isOnAstralPlane } from "./rules/astral-rules.mjs";
import { testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { isCardResolved } from "./astral-combat.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const RESIST_IN_FLIGHT = new Set();
const ESCAPE_IN_FLIGHT = new Set();

/** The net card: who it caught and the Resist button (state in flags.sr2e.netHit). */
export function renderNetCard(st) {
  const hit = (st.successes ?? 0) > 0;
  const tn = netTN({ net: st.net });
  const attr = st.astral ? "Astral Reaction (+ Astral Pool)" : "Strength (+ Combat Pool)";
  const button = !st.resolved && hit && st.targetTokenUuid
    ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-net-resist-btn"
         title="${esc(st.targetName || "The target")} rolls ${attr} vs TN ${tn} (3 if a normal net hits a large target)">🕸 Resist the net</button></div>` : "";
  return `<div class="sr2e-damage-result sr2e-net-card">
    <strong>🕸 ${esc(st.weaponName)}${st.astral ? " (astral net)" : ""}</strong>
    — ${st.successes ?? 0} success${st.successes === 1 ? "" : "es"}
    ${hit ? `<br><em>${esc(st.targetName || "No target was picked")} must get more than ${2 * st.successes}
      successes on ${attr} against TN ${tn}${st.net === "large" ? " (large net)" : ""}, or be entangled
      (${st.astral ? "Corporate Security Handbook p.103" : "Street Samurai Catalog p.72"}).</em>` : "<br><em>The net misses.</em>"}
    ${st.resolution ?? ""}
    ${button}</div>`;
}

const combatFor = (tok) => (game.combats ?? []).find(c => c.started && c.scene?.id === tok?.parent?.id) ?? null;
const seenOf = (tok) => { const c = combatFor(tok); return c ? { combatId: c.id, round: c.round } : null; };
const diceOf = (actor, astral) => astral ? (actor.system.astralReaction ?? 0) : (actor.system.strength?.value ?? 0);
const poolKey = (astral) => astral ? "astral" : "combat";

/** Can this user act for this token right now? Checked before ANY roll. */
function permitted(tok) {
  const actor = tok?.actor;
  if (!actor?.isOwner || !tok.canUserModify(game.user, "update")) return `Only ${tok?.name ?? "its"}'s owner or the GM can do that.`;
  return null;
}

/** Pool dice + (for the first resist) the large-target box. */
async function netDialog({ title, actor, astral, tn, attackerSuccesses, askLarge, largeDefault }) {
  const key = poolKey(astral);
  const avail = actor.system.dicePools?.[key]?.value ?? 0;
  const base = diceOf(actor, astral);
  const hopeless = escapeImpossible({ attackerSuccesses, dice: base + avail });
  let pick = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title }, rejectClose: false,
    content: `<div>
      <p>${astral ? "Astral Reaction" : "Strength"} ${base} dice vs TN ${tn}; more than ${2 * attackerSuccesses} successes needed.</p>
      ${hopeless ? `<p class="warning"><strong>No escape is possible:</strong> twice the attacker's successes is more than every die you can roll (CSH p.103).</p>` : ""}
      ${askLarge ? `<label class="sr2e-attack__check"><input type="checkbox" name="largeTarget" ${largeDefault ? "checked" : ""}> Large target (troll-sized): a normal net is TN 3</label>` : ""}
      ${avail > 0 ? `<div class="form-group"><label>${astral ? "Astral" : "Combat"} Pool <span>(${avail} left)</span></label>
        <input type="number" name="pool" value="0" min="0" max="${avail}" style="width:52px;text-align:center;"></div>` : ""}
    </div>`,
    buttons: [
      { action: "roll", label: "SR2E.Dialog.Roll", default: true, callback: (ev, b) => {
        const f = b.form.elements;
        pick = { pool: Math.max(0, Math.min(avail, parseInt(f.pool?.value) || 0)), largeTarget: !!f.largeTarget?.checked };
      } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "roll" ? pick : null;
}

/** Live checks for a net card's resistance; returns an error string or the context. */
function resistContext(message) {
  const live = game.messages.get(message.id);
  const st = live?.flags?.sr2e?.netHit;
  if (!st || isCardResolved(live, "netHit")) return { err: "That net has already been resisted." };
  const tok = sync(st.targetTokenUuid);
  if (!tok?.actor) return { err: "The net's target is gone." };
  if (!!st.astral !== isOnAstralPlane(tok.flags?.sr2e)) {
    return { err: st.astral ? "An astral net only catches a token on the astral plane." : "A physical net can't catch an astral form." };
  }
  const deny = permitted(tok);
  if (deny) return { err: deny };
  const atk = game.messages.get(st.testMessageId)?.flags?.sr2e?.test;
  const attackerSuccesses = atk ? testTotalSuccesses(atk) : (st.successes ?? 0);
  if (attackerSuccesses <= 0) return { err: "The net missed." };
  return { live, st, tok, actor: tok.actor, attackerSuccesses };
}

/** Resist the net on a net card (the target's owner or the GM), once. */
export async function resistNet(message) {
  if (RESIST_IN_FLIGHT.has(message.id)) return;
  RESIST_IN_FLIGHT.add(message.id);
  try {
    let c = resistContext(message);
    if (c.err) return ui.notifications.warn(c.err);
    const isTroll = c.actor.items.some(i => i.type === "race" && /troll/i.test(i.name));
    const pick = await netDialog({ title: `Resist the net — ${c.tok.name}`, actor: c.actor, astral: c.st.astral,
      tn: netTN({ net: c.st.net }), attackerSuccesses: c.attackerSuccesses, askLarge: c.st.net !== "large", largeDefault: isTroll });
    if (!pick) return;
    c = resistContext(message);                       // re-validated live after the dialog
    if (c.err) return ui.notifications.warn(c.err);
    const tn = netTN({ net: c.st.net, largeTarget: pick.largeTarget });
    const res = await c.actor.rollSuccessTest(diceOf(c.actor, c.st.astral), tn, {
      label: `Resist the net (${c.st.astral ? "Astral Reaction" : "Strength"}) TN ${tn}`,
      poolDice: pick.pool ? { [poolKey(c.st.astral)]: pick.pool } : {},
      isResistance: true, closed: true, tnContext: { kind: "other" }
    });
    if (!res) return;
    // The attack's CURRENT successes, from its own test (Karma may have moved them).
    const atk = game.messages.get(c.st.testMessageId)?.flags?.sr2e?.test;
    const attackerSuccesses = atk ? testTotalSuccesses(atk) : c.attackerSuccesses;
    if (isCardResolved(game.messages.get(message.id), "netHit")) {
      return ui.notifications.warn("That net was resolved on another device while you rolled.");
    }
    const holds = attackerSuccesses > 0 && netHolds({ successes: res.successes, attackerSuccesses });
    const id = foundry.utils.randomID();
    if (holds) {
      await c.tok.update({ "flags.sr2e.net": { id, cardId: message.id, tn, astral: !!c.st.astral,
        attackerSuccesses, turns: 0, seen: seenOf(c.tok), lastAttempt: null } });
    }
    const text = holds ? `${c.tok.name} is entangled: immobile and unable to act.`
      : `${c.tok.name} slips the net.`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: c.actor }),
      content: `<div class="sr2e-damage-result"><strong>🕸 ${esc(text)}</strong>
        <br><em>${res.successes} success${res.successes === 1 ? "" : "es"} against ${2 * attackerSuccesses} needed to beat.</em>
        ${holds ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-net-escape-btn"
          data-token-uuid="${esc(c.tok.uuid)}" data-card-id="${esc(message.id)}">Try to escape</button></div>` : ""}</div>`,
      flags: { sr2e: { resolves: message.id, closesTests: [c.st.testMessageId, res.testMessageId],
        netResolution: `<br><strong>Resolved:</strong> ${esc(text)}` } }
    });
  } finally { RESIST_IN_FLIGHT.delete(message.id); }
}

/** Live checks for an escape; `cardId` (from a card) must be the current net's. */
function escapeContext(tokenUuid, cardId = null) {
  const tok = sync(tokenUuid);
  const net = tok?.flags?.sr2e?.net;
  if (!tok || !net) return { err: "That token isn't caught in a net." };
  if (cardId && net.cardId !== cardId) return { err: "That net is gone; this card is out of date." };
  const deny = permitted(tok);
  if (deny) return { err: deny };
  const combat = combatFor(tok);
  if (combat && net.lastAttempt?.combatId === combat.id && net.lastAttempt.round === combat.round) {
    return { err: "One escape attempt per Combat Turn." };
  }
  return { tok, net, actor: tok.actor, combat };
}

/** Try to escape a net (the token HUD, or the entangle card), once per Combat Turn. */
export async function escapeNet(tokenUuid, cardId = null) {
  const first = escapeContext(tokenUuid, cardId);
  if (first.err) return ui.notifications.warn(first.err);
  const key = `${tokenUuid}#${first.net.id}`;
  if (ESCAPE_IN_FLIGHT.has(key)) return;
  ESCAPE_IN_FLIGHT.add(key);
  try {
    let c = first;
    const now = c.combat ? { combatId: c.combat.id, round: c.combat.round } : null;
    const oldRound = c.net.seen ? (game.combats.get(c.net.seen.combatId)?.round ?? null) : null;
    const counted = advanceTurns(c.net, now, oldRound);
    const tn = escapeTN(c.net.tn, counted.turns);
    const pick = await netDialog({ title: `Escape the net — ${c.tok.name}`, actor: c.actor, astral: c.net.astral,
      tn, attackerSuccesses: c.net.attackerSuccesses, askLarge: false });
    if (!pick) return;
    c = escapeContext(tokenUuid, cardId);
    if (c.err) return ui.notifications.warn(c.err);
    if (c.net.id !== first.net.id) return ui.notifications.warn("That net was replaced while you decided.");
    const res = await c.actor.rollSuccessTest(diceOf(c.actor, c.net.astral), tn, {
      label: `Escape the net (${c.net.astral ? "Astral Reaction" : "Strength"}) TN ${tn}, ${counted.turns} turn${counted.turns === 1 ? "" : "s"} entangled`,
      poolDice: pick.pool ? { [poolKey(c.net.astral)]: pick.pool } : {},
      isResistance: true, closed: true, tnContext: { kind: "other" }
    });
    if (!res) return;
    const live = sync(tokenUuid)?.flags?.sr2e?.net;
    if (!live || live.id !== first.net.id) return ui.notifications.warn("That net changed while you rolled; nothing was applied.");
    const free = !netHolds({ successes: res.successes, attackerSuccesses: live.attackerSuccesses });
    if (free) await c.tok.update({ "flags.sr2e.-=net": null });
    else await c.tok.update({ "flags.sr2e.net.turns": counted.turns, "flags.sr2e.net.seen": counted.seen,
      "flags.sr2e.net.lastAttempt": now });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: c.actor }),
      content: `<div class="sr2e-damage-result"><strong>🕸 ${esc(c.tok.name)} ${free ? "breaks free of the net" : "is still entangled"}.</strong>
        <br><em>${res.successes} success${res.successes === 1 ? "" : "es"} against ${2 * live.attackerSuccesses} needed to beat, TN ${tn}.</em></div>`,
      flags: { sr2e: { closesTests: [res.testMessageId] } }
    });
  } finally { ESCAPE_IN_FLIGHT.delete(key); }
}

/** Card buttons (wired from renderChatMessageHTML). */
export function wireNetButtons(message, html) {
  html.querySelectorAll?.(".sr2e-net-resist-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault(); return resistNet(message);
  }));
  html.querySelectorAll?.(".sr2e-net-escape-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault(); return escapeNet(btn.dataset.tokenUuid, btn.dataset.cardId);
  }));
}

/** Is this token held by a net? */
export const netted = (tokenDoc) => !!tokenDoc?.flags?.sr2e?.net;

const NET_ICON = "icons/svg/net.svg";

export function registerNetHooks() {
  // The overlay comes from the TOKEN flag only (an astral net never shows on the body).
  Hooks.on("refreshToken", (token) => {
    const on = netted(token.document);
    let icon = token.children?.find?.(ch => ch.name === "sr2eNet");
    if (!on) { if (icon) { token.removeChild(icon); icon.destroy(); } return; }
    if (!icon) {
      icon = new PIXI.Sprite(PIXI.Texture.from(NET_ICON));
      icon.name = "sr2eNet"; icon.alpha = 0.85; icon.eventMode = "none";
      token.addChild(icon);
    }
    const s = Math.min(token.w, token.h);
    icon.width = icon.height = s * 0.6;
    icon.position.set((token.w - icon.width) / 2, (token.h - icon.height) / 2);
  });
  // A set, replaced or removed net redraws the token, idle or not.
  Hooks.on("updateToken", (doc, changes) => {
    const keys = Object.keys(foundry.utils.flattenObject(changes.flags?.sr2e ?? {}));
    if (keys.some(k => k === "net" || k.startsWith("net.") || k === "-=net") || changes.flags?.["-=sr2e"] !== undefined)
      doc.object?.renderFlags.set({ refreshState: true });
  });
  // Token HUD: try to escape.
  Hooks.on("renderTokenHUD", (hud, html) => {
    const doc = hud.object?.document;
    if (!netted(doc) || !doc.actor?.isOwner) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const col = root?.querySelector(".col.right");
    if (!col) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "control-icon"; b.dataset.action = "sr2eNetEscape";
    b.title = "Caught in a net: try to escape (once per Combat Turn)";
    b.innerHTML = `<i class="fa-solid fa-spider"></i>`;
    b.addEventListener("click", () => escapeNet(doc.uuid));
    col.appendChild(b);
  });
  // A netted astral form can't act, so a player can't end the projection under it.
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (game.user.isGM) return;
    const next = foundry.utils.getProperty(changes, "system.astralState");
    if (next === undefined || actor.system.astralState !== "projecting" || next === "projecting") return;
    const caught = game.scenes.some(s => s.tokens.some(t => t.flags?.sr2e?.astralForm && t.actorId === actor.id && netted(t)));
    if (!caught) return;
    ui.notifications.warn("Your astral form is caught in a net: escape first (or ask the GM).");
    return false;
  });
  // A deleted combat's rounds count toward the nets it saw (active GM, the only background write).
  Hooks.on("deleteCombat", async (combat) => {
    if (!game.users.activeGM?.isSelf || !combat.scene) return;
    for (const t of combat.scene.tokens) {
      const net = t.flags?.sr2e?.net;
      if (!net?.seen || net.seen.combatId !== combat.id) continue;
      const live = t.flags?.sr2e?.net;                     // re-read just before writing
      if (!live || live.id !== net.id) continue;
      await t.update({ "flags.sr2e.net.turns": (live.turns ?? 0) + Math.max(0, combat.round - live.seen.round),
        "flags.sr2e.net.seen": null });
    }
  });
}
