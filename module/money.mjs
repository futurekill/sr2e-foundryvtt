/**
 * One money queue per actor (docs/PLAN-money-queue-and-eye-accessories.md, Part A).
 *
 * Every operation that moves a character's nuyen, or the `paid` provenance that decides
 * refunds, runs its re-read → check → write → compensate section inside
 * `moneyQueue(actor, …)` on the client doing it, and checks every write. Dialogs, rolls
 * and confirmations stay OUTSIDE the queue; inside, each operation re-validates its
 * documents. Cross-client overlap is the one-driver-per-actor contract (jackpoints.mjs).
 *
 * RULE: code running inside a moneyQueue entry never AWAITS another moneyQueue call for
 * the same actor — it would wait on itself forever. Hooks fired by writes inside an entry
 * may enqueue (not await). The watchdog makes a stuck entry loud.
 */
import { enqueueAttack } from "./engagement.mjs";
import { proportionalRefund, streetPrice } from "./rules/sr2e-rules.mjs";
import { rowsPaid } from "./rules/ware-rules.mjs";

const ACTIVE = new Map();   // actor uuid → label of the running entry (this client)
const STUCK_MS = 30_000;

/** Run `fn` in this actor's money queue (the same key surgery and cybermancy use). */
export function moneyQueue(actor, fn, label = "money") {
  const uuid = actor?.uuid ?? String(actor);
  return enqueueAttack(`purchase:${uuid}`, async () => {
    ACTIVE.set(uuid, label);
    const dog = setTimeout(() => console.warn(`sr2e | money queue for ${actor?.name ?? uuid} stuck in "${label}" for ${STUCK_MS / 1000} s`), STUCK_MS);
    try { return await fn(); }
    finally { clearTimeout(dog); if (ACTIVE.get(uuid) === label) ACTIVE.delete(uuid); }
  });
}

/** Is a money entry running for this actor on this client? (tests, debugging) */
export const moneyBusy = (actor) => ACTIVE.has(actor?.uuid);

const fail = (what, err) => { console.error(`sr2e | ${what}`, err); return false; };

/** An update/setFlag/unsetFlag landed: a truthy document, no throw. */
export async function updated(promise, what = "write") {
  try { return !!(await promise); } catch (err) { return fail(what, err); }
}

/**
 * Update `doc` and check it landed. Foundry resolves NOTHING for an update that changes
 * nothing, so a write whose values are already in place counts as done rather than failed
 * (a rollback to the current state must not be reported — or treated — as a failure).
 */
export async function applyUpdate(doc, data, options = {}, what = "write") {
  const noop = Object.entries(data).every(([k, v]) => {
    const m = k.match(/^(.*)\.-=([^.]+)$/);
    if (m) return foundry.utils.getProperty(doc._source, `${m[1]}.${m[2]}`) === undefined;
    return foundry.utils.objectsEqual({ v: foundry.utils.getProperty(doc._source, k) }, { v });
  });
  if (noop) return true;
  return updated(doc.update(data, options), what);
}

/** Exactly `n` documents came back and each is now on the actor. Returns them, or null. */
export async function created(actor, promise, n, what = "create") {
  try {
    const docs = await promise;
    if (!Array.isArray(docs) || docs.length !== n || !docs.every(d => d && actor.items.has(d.id))) return null;
    return docs;
  } catch (err) { fail(what, err); return null; }
}

/** Afterwards none of `ids` is on the actor (an empty or short result is not enough). */
export async function deleted(actor, promise, ids, what = "delete") {
  try { await promise; } catch (err) { fail(what, err); }
  return ids.every(id => !actor.items.has(id));
}

/** A setting write; success is the returned Setting document, so a legitimate 0 counts. */
export async function settingSet(ns, key, value, what = `setting ${ns}.${key}`) {
  try { return !!(await game.settings.set(ns, key, value, { document: true })); } catch (err) { return fail(what, err); }
}

/** The balance after `delta`, or null when it would go below 0. Pure. */
export function nextBalance(live, delta) {
  const n = Math.round((Number(live) || 0) + (Number(delta) || 0));
  return n < 0 ? null : n;
}

/**
 * INSIDE a money entry only: move the LIVE balance by `delta` (and write `extra` in the
 * same update). Refuses (false) when it would go below 0 or the write fails.
 */
export async function adjustNuyen(actor, delta, extra = {}) {
  const next = nextBalance(actor.system.nuyen ?? 0, delta);
  if (next == null) return false;
  if (!delta && !Object.keys(extra).length) return true;
  return updated(actor.update({ "system.nuyen": next, ...extra }), `nuyen ${delta > 0 ? "+" : ""}${delta} on ${actor.name}`);
}

/** Public entry (macros): queue + adjust. Resolves true/false. */
export function adjustNuyenQueued(actor, delta, label = "adjust") {
  return moneyQueue(actor, () => adjustNuyen(actor, delta), label);
}

/**
 * What selling an item pays now: its `paid` price, proportional to what's left for ammo
 * and drugs with an acquisition basis, or the street price when it was never tracked.
 * The ONE quote selling, consolidation and eye-accessory moves agree on.
 */
export function saleQuote(it) {
  const paid = it.getFlag("sr2e", "paid");
  const acquiredQuantity = it.getFlag("sr2e", "acquiredQuantity");
  const isDrug = it.type === "gear" && !!it.flags?.sr2e?.drug;
  if ((it.type === "ammo" || isDrug) && acquiredQuantity != null) return {
    price: proportionalRefund({ paid: paid ?? 0, acquiredQuantity, currentQuantity: it.system.quantity ?? 0 }),
    note: ` (${it.system.quantity ?? 0}/${acquiredQuantity} ${isDrug ? "doses" : "rounds"} left — proportional refund)` };
  // An eye's accessory rows refund what was paid for each, with the eye (Part B).
  const rows = rowsPaid(it.system?.modules ?? []);
  return { price: (paid ?? streetPrice(Number(it.system.cost) || 0, it.system.streetIndex)) + rows,
    note: (paid != null ? " (refund of the price paid" : " (street price") + (rows ? `, plus ${rows}¥ for its accessories)` : ")") };
}

/** Ammo, or a drug with an acquisition basis: its quantity decides what selling refunds. */
export const hasRefundableStock = (item) =>
  (item.type === "ammo" || (item.type === "gear" && !!item.flags?.sr2e?.drug)) && item.getFlag("sr2e", "acquiredQuantity") != null;

/**
 * A hand edit of refundable stock, applied in the owner's money queue only if the live
 * quantity is still the one the sheet showed (else nothing is written; the caller
 * re-renders). docs/PLAN-money-queue-and-eye-accessories.md, A2.
 */
export function queuedQuantityEdit(item, shown, value) {
  const actor = item.parent;
  return moneyQueue(actor, async () => {
    const live = actor.items.get(item.id);
    if (!live || Number(live.system.quantity ?? 0) !== Number(shown)) {
      ui.notifications.warn(`${item.name}'s quantity changed meanwhile — check it and edit again.`);
      return false;
    }
    return updated(live.update({ "system.quantity": value }), "quantity edit");
  }, "quantity edit");
}

/**
 * Pay a GM award (the Award Nuyen macros). One client-local `payout` queue entry:
 * re-check the communal pot against the quote, write the new pot FIRST (so a failure
 * after it can never pay the same money twice), credit each recipient in their own
 * money queue, then put the shares that failed back into the pot.
 * @param {{quotedPot?: number|null, newPot?: number|null, awards: Object<string, number>}} p
 *   quotedPot/newPot null = leave the pot alone; awards: actor id → ¥
 * @returns {Promise<{ok: boolean, paid: string[], failed: string[], why?: string}>}
 */
export function payAwards({ quotedPot = null, newPot = null, awards }) {
  return enqueueAttack("payout", async () => {
    const usesPot = quotedPot != null && newPot != null;
    if (usesPot) {
      const live = game.settings.get("sr2e", "communalNuyen");
      if (live !== quotedPot) return { ok: false, paid: [], failed: [], why: `the communal pot changed (${quotedPot}¥ → ${live}¥) — open the award again` };
      if (!(await settingSet("sr2e", "communalNuyen", newPot))) return { ok: false, paid: [], failed: [], why: "the communal pot couldn't be updated — nothing was paid" };
    }
    const paid = [], failed = [];
    let back = 0;
    for (const [id, amt] of Object.entries(awards)) {
      if (!(amt > 0)) continue;
      const actor = game.actors.get(id);   // deleted while the dialog was open: its share goes back
      if (actor && await adjustNuyenQueued(actor, amt, "award")) paid.push(id);
      else { failed.push(id); back += amt; }
    }
    if (back && usesPot) {
      const now = game.settings.get("sr2e", "communalNuyen");
      if (!(await settingSet("sr2e", "communalNuyen", now + back))) {
        ui.notifications.error(`${back}¥ of the award couldn't be paid out or returned to the communal pot: add it to the pot by hand.`, { permanent: true });
      }
    }
    return { ok: true, paid, failed };
  });
}
