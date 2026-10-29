/**
 * Second-hand cyberware (SSC p.100; Cybertechnology p.42; docs/PLAN-secondhand-cyberware.md).
 * Half price and the same Essence (priced in itemBaseCost). Once per adventure the GM may
 * call a Resistance Test: 5 dice vs TN 4, raised by circumstance (up to 8 for a crucial
 * strain), Karma rerolls at 2 per die. A part that fails "must be replaced. No repair is
 * possible." Failure is settled by the GM on the card — Karma can still change the result —
 * through a separate message that closes the test (isTestClosed), the record a retry reads.
 */
import { cyberSecondhand, testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { isTestClosed } from "./astral-combat.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const SECONDHAND_TEST_DICE = 5;
export const SECONDHAND_TEST_TN = 4;

/** Why this item can't take the test, or "" when it can. */
export function secondhandTestProblem(item) {
  if (item?.type !== "cyberware" || !cyberSecondhand({ ...item.system, type: item.type })) return "Only second-hand cyberware takes this test.";
  if (item.system.secondhandFailed) return "That part has already failed — it must be replaced.";
  if (!item.system.installed) return "That part isn't installed.";
  return "";
}

/** Prompt for the GM's TN (and Karma dice), then roll the part's test. */
export async function rollSecondhandTest(item) {
  const problem = secondhandTestProblem(item);
  if (problem) return ui.notifications.warn(problem);
  const actor = item.parent;
  if (!actor?.isOwner) return ui.notifications.warn("Only this character's owner can roll for their cyberware.");
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Second-hand cyberware: ${item.name}` },
    content: `<p>Once per adventure, when it is crucial that it not break, the GM may call this test (SSC p.100).</p>
      <div class="form-group"><label>Target Number</label>
        <input type="number" name="tn" value="${SECONDHAND_TEST_TN}" min="2" max="12" step="1" autofocus></div>
      <p class="hint">GM: 4, raised by circumstance — up to 8 for a crucial strain (a cyberarm holding the character's weight).</p>
      <div class="form-group"><label>Karma dice</label>
        <input type="number" name="karmaDice" value="0" min="0" max="${SECONDHAND_TEST_DICE}" step="1"></div>
      <p class="hint">Karma rerolls cost 2 per die re-rolled; otherwise normal Karma rules.</p>`,
    ok: { label: "Roll", callback: (ev, btn) => ({
      tn: Math.min(12, Math.max(2, parseInt(btn.form.elements.tn.value) || SECONDHAND_TEST_TN)),
      karmaDice: Math.max(0, parseInt(btn.form.elements.karmaDice.value) || 0) }) },
    rejectClose: false
  });
  if (!picked) return null;
  return actor.rollSuccessTest(SECONDHAND_TEST_DICE, picked.tn, {
    label: `${item.name}: second-hand Resistance Test (SSC p.100)`,
    tnPolicy: "equipment", karmaDice: picked.karmaDice, rerollCostPerDie: 2,
    secondhand: { itemUuid: item.uuid, itemName: item.name }
  });
}

/** The settlement messages that closed this test (normally one). */
export const settlementsOf = (testId) =>
  (game.messages?.contents ?? []).filter(m => m.flags?.sr2e?.secondhandSettle?.testId === testId);

/** "none" | "pending" (a write failed: Finish) | "applied", and the pending record. */
export function settleState(testId) {
  const all = settlementsOf(testId);
  if (all.some(m => m.flags.sr2e.secondhandSettle.applied)) return { state: "applied", pending: null };
  const pending = all[0] ?? null;
  return { state: pending ? "pending" : "none", pending };
}

/**
 * The card's settle button as this client should see it: GM only, relabelled "Finish" while
 * a settlement is pending, gone once one is applied (called on render).
 */
export function decorateSettleButton(message, html) {
  const btn = html.querySelector?.(".sr2e-secondhand-settle");
  if (!btn) return;
  const { state } = settleState(message.id);
  if (!game.user.isGM || state === "applied") return btn.closest(".sr2e-karma-actions")?.remove();
  if (state === "pending") btn.textContent = "Finish: mark failed (GM)";
}

/** Set the item's failure, then mark the settlement applied (steps 3–4). */
async function applySettlement(settle) {
  const { itemUuid } = settle.flags.sr2e.secondhandSettle;
  const item = await fromUuid(itemUuid);
  if (!item) return ui.notifications.warn("That cyberware no longer exists — nothing to mark.");
  await item.update({ "system.secondhandFailed": true }, { sr2eSecondhandSettle: true });
  // A hook may veto without throwing: record it applied only once the part really failed.
  if (!item.system.secondhandFailed) return ui.notifications.warn(`${item.name} wasn't marked failed — press the button again.`);
  await settle.update({ "flags.sr2e.secondhandSettle.applied": true });
}

/**
 * GM: settle a 0-success test as a failed part. Refused while the test has successes. An
 * existing UNAPPLIED settlement (a write failed) is finished instead; an applied one is never
 * re-applied, so a GM who later clears the failure is not re-failed.
 */
export async function settleSecondhandTest(message) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM decides whether the part fails.");
  const state = message.getFlag("sr2e", "test");
  if (!state?.secondhand) return;
  // An APPLIED settlement is authoritative: a pending duplicate (two GMs at once) is never
  // applied after it, or it would undo a later GM correction.
  const { state: st, pending } = settleState(message.id);
  if (st === "applied") return ui.notifications.info("This test is already settled.");
  if (pending) return applySettlement(pending);
  const live = game.messages.get(message.id)?.flags?.sr2e?.test ?? state;
  if (testTotalSuccesses(live) > 0) return ui.notifications.warn("The part held — it has at least one success.");
  if (isTestClosed(message.id)) return ui.notifications.info("This test is already closed.");
  const settle = await ChatMessage.create({
    content: `<div class="sr2e-roll-message"><strong>${esc(state.secondhand.itemName)} fails</strong> — it must be replaced; no repair is possible (SSC p.100). A failed cyberlimb is dead weight: the GM decides its effects (Cybertechnology p.49). Its other functions (vision, smartlink, …) stop too: GM.</div>`,
    flags: { sr2e: { closesTests: [message.id], secondhandSettle: { testId: message.id, itemUuid: state.secondhand.itemUuid, applied: false } } }
  });
  return applySettlement(settle);
}

// The test card's button follows its settlement on every client: re-render it when one appears or applies.
for (const hook of ["createChatMessage", "updateChatMessage"]) {
  Hooks.on(hook, (m) => {
    const testId = m.flags?.sr2e?.secondhandSettle?.testId;
    const test = testId && game.messages.get(testId);
    if (test) ui.chat?.updateMessage?.(test);
  });
}
