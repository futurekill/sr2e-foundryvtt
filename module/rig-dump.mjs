/**
 * Rigger dump shock (Rigger 2 p.64; docs/PLAN-vehicles-phase2.md 5a.6). Any time a rigger is DUMPED from a remote-control
 * network — a forced ejection, never a voluntary disconnect — three things happen, each once:
 *   (1) disorientation: +2 on ALL the rigger's Success Tests for 10 Combat Turns (a timed Active Effect carrying the
 *       event id, read by `testTnModifiers`);
 *   (2) resist (RC deck Rating + 4)S Stun from neural biofeedback (Willpower, Sensitive Neural Structure / Spike
 *       Resistance applied): a resistance step with its `dmgReceipts` receipt (vehicle-damage.mjs `stepClick`);
 *   (3) one Willpower (4) Test: ⌈⌈30 ÷ successes⌉ ÷ 3⌉ Combat Turns instead (0 successes: the full 10), applied once.
 * State: `flags.sr2e.rigDumps.<eventId> = { cause, deckRating, deckName, deckUuid, state: pending|open|done, effect,
 * card, will }` on the rigger. A `pending` event becomes `open` only once its cause is verified (5a in this module: the
 * deck is really gone); the GM's reconcile drives every step and is idempotent. Independent of the Matrix dump shock.
 */
import { gmOp, gmCall } from "./vehicle-play.mjs";
import { dumpDamage, DUMP_TN, dumpDuration } from "./rules/drone-rules.mjs";
import { effectTiming, timingData, timingUpdate } from "./effects-compat.mjs";
import { claimId } from "./rules/claim-rules.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const effectIdOf = (eid) => claimId(`rigdump:${eid}`);
export const dumpsOf = (actor) => Object.entries(actor?.flags?.sr2e?.rigDumps ?? {});

/** Is the rigger disoriented by a dump right now (an unexpired dump effect)? */
export function rigDumpActive(actor) {
  return (actor?.effects ?? []).some(e => e.flags?.sr2e?.rigDump && !e.disabled && !effectTiming(e).expired);
}

/** A dump's timing: Combat Turns of the started combat the rigger is in, else 3 s a Turn of world time. */
function turnsTiming(actor, turns) {
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
  return combat ? { rounds: turns, combat: combat.id, startRound: combat.round, startTurn: combat.turn ?? 0 }
    : { seconds: turns * 3, startTime: game.time.worldTime };
}

/**
 * Write a PENDING dump on the rigger (GM, inside `rc-control`): called BEFORE the change that dumps them, so a crash in
 * between leaves a pending event the reconcile verifies. Returns the event id.
 */
export async function pendDump(rigger, { cause, deck }) {
  const eid = foundry.utils.randomID(16);
  await rigger.update({ [`flags.sr2e.rigDumps.${eid}`]: { cause, deckRating: Number(deck?.system?.rating) || 0, deckName: deck?.name ?? "",
    deckUuid: deck?.uuid ?? "", state: "pending", at: Date.now() } });
  return eid;
}

/** GM: verify pending causes, then run each open dump's steps once. Idempotent; safe on every load. */
export async function reconcileDumps(rigger) {
  if (!game.users.activeGM?.isSelf || !rigger) return;
  for (const [eid, d] of dumpsOf(rigger)) {
    if (d.state === "pending") {
      if (d.cause !== "deck-removed") continue;   // 5b causes carry their own receipts
      const deck = d.deckUuid ? fromUuidSync(d.deckUuid) : null;
      if (deck) await deck.delete({ sr2eRcDelete: true });   // the intended deletion, retried
      if (d.deckUuid && fromUuidSync(d.deckUuid)) continue;   // still there: the next reconcile retries
      await rigger.update({ [`flags.sr2e.rigDumps.${eid}.state`]: "open" });
    }
    const cur = rigger.flags.sr2e.rigDumps[eid];
    if (cur.state !== "open") continue;
    if (!cur.effect) {
      const id = effectIdOf(eid);
      if (!rigger.effects.has(id)) {
        try {
          await rigger.createEmbeddedDocuments("ActiveEffect", [{ _id: id, name: "Dump shock (rigger)", img: "icons/svg/daze.svg",
            transfer: false, ...timingData(turnsTiming(rigger, 10)), flags: { sr2e: { rigDump: eid } } }], { keepId: true });
        } catch (err) { if (!rigger.effects.has(id)) throw err; }
      }
      await rigger.update({ [`flags.sr2e.rigDumps.${eid}.effect`]: true });
    }
    if (!rigger.flags.sr2e.rigDumps[eid].card) {
      // A duplicate card (a crash before this update) is harmless: every step is receipted.
      const msg = await postCard(rigger, eid, cur);
      await rigger.update({ [`flags.sr2e.rigDumps.${eid}.card`]: msg.id });
    }
  }
}

function postCard(rigger, eid, d) {
  const { power, level } = dumpDamage(d.deckRating);
  const steps = { dump: { effectId: `rigdump:${eid}`, actor: rigger.uuid, power, level, track: "stun", attr: "willpower", armor: "none",
    combatPool: true, title: "Dump shock" } };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: rigger }), flags: { sr2e: { vsteps: steps, rigDump: { actor: rigger.uuid, eid } } },
    content: `<div class="sr2e-damage-result"><strong>${esc(rigger.name)} is dumped</strong> from ${esc(d.deckName || "the remote-control network")}
      (Rigger 2 p.64): disoriented, +${DUMP_TN} on all Success Tests for 10 Combat Turns; resist <strong>${power}${level} Stun</strong>
      (Willpower); a Willpower (4) Test shortens the disorientation.
      <div class="sr2e-karma-actions">
        <button type="button" class="sr2e-resist-btn sr2e-vstep-btn" data-key="dump">🛡 Resist: ${esc(rigger.name)}</button>
        <button type="button" class="sr2e-resist-btn sr2e-rigdump-will">Willpower (4): shake it off</button>
      </div></div>` });
}

/** The Willpower (4) Test (rigger's client), recorded once by the GM. */
export async function willClick(message) {
  const { actor: uuid, eid } = message.flags.sr2e.rigDump;
  const actor = fromUuidSync(uuid);
  if (!actor?.isOwner) return ui.notifications.warn(`Only ${actor?.name ?? "the rigger"}'s owner or the GM rolls this.`);
  if (actor.flags.sr2e?.rigDumps?.[eid]?.will) return ui.notifications.warn(`${actor.name} has already rolled this.`);
  const r = await actor.rollSuccessTest(actor.system.willpower?.value ?? 0, 4, { label: "Willpower (4): dump shock (Rigger 2 p.64)",
    tnContext: { kind: "other" }, flags: { sr2e: { rigDumpWill: { actor: uuid, eid } } } });
  if (!r?.testMessageId) return;
  const out = await gmCall("rigDumpWill", { actorUuid: uuid, eid, messageId: r.testMessageId });
  if (out?.turns != null) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-damage-result">${esc(actor.name)}'s disorientation lasts <strong>${out.turns} Combat Turn${out.turns === 1 ? "" : "s"}</strong>.</div>` });
}

export function bindRigDumpCard(message, html) {
  if (!message.flags?.sr2e?.rigDump) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  root?.querySelector(".sr2e-rigdump-will")?.addEventListener("click", () => willClick(message).catch(err => ui.notifications.warn(err.message)));
}

export function registerRigDump() {
  // The Willpower result, once: the duration replaces the 10 Turns from the dump's start.
  gmOp("rigDumpWill", async ({ actorUuid, eid, messageId }, user) => {
    const actor = fromUuidSync(actorUuid), d = actor?.flags?.sr2e?.rigDumps?.[eid];
    if (!d || !actor.testUserPermission(user, "OWNER")) throw new Error("no such dump");
    if (d.will) return { turns: d.will.turns, already: true };
    const msg = game.messages.get(messageId), test = msg?.flags?.sr2e?.test;
    if (msg?.flags?.sr2e?.rigDumpWill?.eid !== eid || !test) throw new Error("that card isn't this test");
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    const successes = testTotalSuccesses(test), turns = dumpDuration(successes);
    const e = actor.effects.get(effectIdOf(eid));
    await actor.update({ [`flags.sr2e.rigDumps.${eid}.will`]: { successes, turns, messageId }, [`flags.sr2e.rigDumps.${eid}.state`]: "done" });
    if (e) { const st = durationStart(e); await e.update(timingUpdate(st.combat ? { ...st, rounds: turns } : { ...st, seconds: turns * 3 })); }
    return { turns };
  });
  // Deck deletion while connected is a dump (5a.6; plan round 4 #5): routed through `rc-control` so the rigger's
  // pending event is written FIRST, then the deck is deleted, then the GM verifies it's gone and opens the dump.
  Hooks.on("preDeleteItem", (item, options, userId) => {
    if (options.sr2eRcDelete || !isRigger2() || item.flags?.sr2e?.rcNet?.connection?.state !== "connected" || !item.flags.sr2e.rcNet.operator) return;
    if (userId === game.user.id) gmCall("rcDeleteDeck", { deckUuid: item.uuid }).catch(err => ui.notifications.warn(err.message));
    return false;
  });
  Hooks.once("ready", () => {
    if (!game.users.activeGM?.isSelf) return;
    for (const a of game.actors) if (dumpsOf(a).some(([, d]) => d.state === "pending" || d.state === "open")) reconcileDumps(a).catch(err => console.error("SR2E | rig dump", err));
  });
}

/** Keep the effect's original start when re-timing it (the Willpower Test shortens the same disorientation). */
function durationStart(e) {
  const d = e._source.duration ?? {}, s = e._source.start ?? {};
  return d.combat || s.combat ? { combat: d.combat ?? s.combat, startRound: d.startRound ?? s.round, startTurn: d.startTurn ?? s.turn ?? 0 }
    : { startTime: d.startTime ?? s.time ?? game.time.worldTime };
}
