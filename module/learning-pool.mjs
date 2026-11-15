/**
 * The robotic Learning Pool (Rigger 2 p.67; docs/PLAN-vehicles-phase2.md 5a.4). A vehicle's pool (`learningPoolDice`)
 * augments its OWN tests the way Combat/Control/Task Pool augment a character's; never while a rigger is jumped into
 * it (then it's the rigger's test). It refreshes at the start of each Combat Turn and of each phase the vehicle acts.
 *   - The refresh key is PERSISTED: `flags.sr2e.learningKey = <combatId>:<round>:<phaseSeq>`, advanced by the active GM
 *     only at a boundary where THIS vehicle acts (a robot's own phase; a networked vehicle's operator's phase) or a new
 *     Turn — a control transition never changes it, so spending carries over to a new operator.
 *   - Spends: `flags.sr2e.learningSpends.<eventId> = { key, n, scope }`; balance = pool − Σ n under the current key.
 *   - A SCOPED pool ("for Search & Rescue") is offered only when the roller declares the test within it; the GM may veto
 *     the declaration on the card, which voids that spend (`void: true`, n 0).
 * Outside a started combat each test gets the full pool (narrative time; a fresh key).
 */
import { poolBalance } from "./rules/drone-rules.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { gmOp, gmCall } from "./vehicle-play.mjs";
import * as RC from "./rc-net.mjs";

const keyOf = (c) => `${c.id}:${c.round}:${Number(c.getFlag("sr2e", "phaseSeq")) || 0}`;
const liveKey = (v) => {
  const k = v?.flags?.sr2e?.learningKey ?? "";
  const c = game.combats?.get(k.split(":")[0]);
  return c?.started ? k : null;
};
const spendsOf = (v) => v?.flags?.sr2e?.learningSpends ?? {};

/** Dice left in the vehicle's Learning Pool now. */
export function learningBalance(vehicle) {
  const dice = vehicle?.system?.learningPoolDice ?? 0;
  if (!dice) return 0;
  const key = liveKey(vehicle);
  return key ? poolBalance(dice, spendsOf(vehicle), key) : dice;
}
/** Is the pool usable now (not while its operator is jumped into it, p.67)? */
export const learningUsable = (vehicle) => learningBalance(vehicle) > 0 && RC.droneModeOf(vehicle) !== "primary";

/** Spend n dice (the roller's client), re-checked in the vehicle's queue. Returns { n, eventId } actually spent. */
export function spendLearning(vehicle, n, { scope = "" } = {}) {
  return enqueueAttack(`learn:${vehicle.uuid}`, async () => {
    const want = Math.max(0, Math.floor(Number(n) || 0));
    const have = learningUsable(vehicle) ? learningBalance(vehicle) : 0;
    const spend = Math.min(want, have);
    if (!spend) return { n: 0, eventId: null };
    const eventId = foundry.utils.randomID(16);
    await vehicle.update({ [`flags.sr2e.learningSpends.${eventId}`]: { key: liveKey(vehicle) ?? `free:${eventId}`, n: spend, scope } });
    return { n: spend, eventId };
  });
}

/** The card's GM veto of a scoped declaration: the spend is void (receipted by `void`). */
export async function vetoLearning(message) {
  const t = message.flags?.sr2e?.learningSpend;
  if (!t) return;
  await gmCall("learningVeto", { vehicleUuid: t.vehicleUuid, eventId: t.eventId });
  ChatMessage.create({ content: `<div class="sr2e-damage-result">GM: that test isn't within the Learning Pool's scope — its ${t.n} pool dice don't count (Rigger 2 p.67).</div>` });
}

export function bindLearningCard(message, html) {
  const t = message.flags?.sr2e?.learningSpend;
  if (!t?.scope || !game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const v = fromUuidSync(t.vehicleUuid);
  if (!root || v?.flags?.sr2e?.learningSpends?.[t.eventId]?.void) return;
  const div = document.createElement("div");
  div.className = "sr2e-karma-actions";
  div.innerHTML = `<button type="button" class="sr2e-resist-btn">GM: veto (outside “${foundry.utils.escapeHTML(t.scope)}”)</button>`;
  div.querySelector("button").addEventListener("click", () => vetoLearning(message).catch(err => ui.notifications.warn(err.message)));
  root.querySelector(".message-content")?.append(div);
}

export function registerLearningPool() {
  gmOp("learningVeto", async ({ vehicleUuid, eventId }, user) => {
    if (!user.isGM) throw new Error("GM only");
    const v = fromUuidSync(vehicleUuid), s = spendsOf(v)[eventId];
    if (!s || s.void) return false;
    await v.update({ [`flags.sr2e.learningSpends.${eventId}`]: { ...s, n: 0, void: true, vetoed: s.n } });
    return true;
  });
  // Refresh boundaries: a new Turn, or a phase in which the vehicle acts (its own combatant, or its operator's).
  Hooks.on("updateCombat", (c, ch) => {
    if (!game.users.activeGM?.isSelf || !c.started) return;
    const newRound = "round" in ch;
    if (!newRound && !foundry.utils.hasProperty(ch, "flags.sr2e.phaseSeq") && !("turn" in ch)) return;
    const acting = c.combatant?.actor ?? null, key = keyOf(c);
    for (const v of game.actors.filter(a => a.type === "vehicle" && (a.system.learningPoolDice ?? 0) > 0)) {
      const acts = newRound || acting === v || (!v.system.isRobot && acting && RC.networkControllerOf(v) === acting);
      if (acts && v.flags.sr2e?.learningKey !== key) v.update({ "flags.sr2e.learningKey": key }).catch(err => console.error("SR2E | learning key", err));
    }
  });
}
