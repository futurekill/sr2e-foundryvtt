/**
 * Eye accessories dropped onto a cybereye (Cybertechnology p.45;
 * docs/PLAN-money-queue-and-eye-accessories.md, Part B).
 *
 * A compendium/sidebar accessory (a purchase) or one the character already owns (a move)
 * dropped on a cybereye's row on the Gear tab becomes a row of that eye. Accessories are
 * bought at the EYE's grade (p.45 grades their Essence with the eye), at their own Street
 * Index, with no surgery ("added or removed without impacting the Essence"). Everything
 * that touches money or the rows runs in ONE money-queue entry against live documents.
 */
import { moneyQueue, adjustNuyen, updated, deleted, saleQuote } from "./money.mjs";
import { eyeAccessoryKind, wareRule, withRowIds } from "./rules/ware-rules.mjs";
import { itemBaseCost, streetPrice } from "./rules/sr2e-rules.mjs";
import { unfinishedCymImplant } from "./cybermancy.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const autoEssence = () => { try { return game.settings.get("sr2e", "autoEssence"); } catch (e) { return true; } };

/** The eye-accessory kind of dropped item data, or null (then it's an ordinary drop). */
export function accessoryKindOf(itemData) {
  if (itemData?.type !== "cyberware") return null;
  return eyeAccessoryKind(itemData.flags, itemData._stats?.compendiumSource ?? null);
}

/** Dropped item data that remembers where it came from (a compendium entry's own uuid). */
export function withSource(item) {
  const data = item.toObject();
  if (!data._stats?.compendiumSource && item.pack) data._stats = { ...(data._stats ?? {}), compendiumSource: item.uuid };
  return data;
}

/** A cybereye on this actor the drop landed on, or null. */
export function eyeHostAt(actor, event) {
  const row = event?.target?.closest?.(".cyber-row[data-item-id]");
  const host = row ? actor.items.get(row.dataset.itemId) : null;
  return host?.type === "cyberware" && wareRule(host.flags, host._stats?.compendiumSource ?? null) === "cybereye-pair" ? host : null;
}

/** An unembedded, prepared copy of item data (its derived Essence and price at a rating/grade). */
const candidate = (actor, data, system = {}) => {
  const d = foundry.utils.mergeObject(foundry.utils.deepClone(data), { system }, { inplace: false });
  delete d._id;
  return new Item.implementation(d, { parent: actor });
};

/** The row an accessory makes at `rating` in `host`, with its list and street price. Pure enough to test. */
export function rowFrom(actor, host, data, { rating, kind, eye }) {
  const cand = candidate(actor, data, { rating, grade: host.system.grade });
  const list = Math.round(itemBaseCost({ type: cand.type, ...cand.system }, { authoredCost: data.system?.cost ?? 0 }));
  const street = Math.round(streetPrice(list, cand.system.streetIndex));
  const row = { id: foundry.utils.randomID(), name: data.name, essenceCost: Number(cand.system.essenceCost) || 0,
    cost: list, rating: Number(rating) || 0, combatTnMod: Number(cand.system.combatTnMod) || 0, active: true,
    kind, eye, notes: "", paid: 0, listValue: 0 };
  return { row, list, street };
}

/**
 * The Essence this change costs the character (+ = more loss) and the signed Essence it
 * would leave. Automatic Essence: a prepared copy of the whole character with the change;
 * manual Essence: the change in item Essence costs applied to the manual value.
 */
function essenceAfter(actor, host, rows, removeId) {
  const liveSigned = actor.system.essence?.signed ?? actor.system.essence?.value ?? 0;
  if (autoEssence()) {
    const data = actor.toObject();
    data.items = data.items.filter(i => i._id !== removeId)
      .map(i => (i._id === host.id ? foundry.utils.mergeObject(i, { system: { modules: rows } }, { inplace: false }) : i));
    const proposed = new Actor.implementation(data);
    const signed = proposed.system.essence?.signed ?? proposed.system.essence?.value ?? 0;
    return { loss: Math.round((liveSigned - signed) * 100) / 100, signed };
  }
  const counts = (i) => i && i.system.installed !== false;
  const hostNow = counts(host) ? Number(host.system.actualEssenceCost) || 0 : 0;
  const hostNext = counts(host) ? Number(candidate(actor, host.toObject(), { modules: rows }).system.actualEssenceCost) || 0 : 0;
  const src = removeId ? actor.items.get(removeId) : null;
  const freed = counts(src) ? Number(src.system.actualEssenceCost) || 0 : 0;
  const loss = Math.round((hostNext - hostNow - freed) * 100) / 100;
  const manual = actor.system.essence?.manualSigned ?? actor.system.essence?.value ?? 0;
  return { loss, signed: Math.round((manual - loss) * 100) / 100 };
}

/** Ask the Rating (when the accessory has a table) and, for a weapon or tool laser in a pair, the eye. */
async function askFitting(host, data, kind, { ratings, rating }) {
  const pair = host.system.eyes !== "single";
  const needsEye = pair && (kind === "weapon" || kind === "toolLaser");
  if (ratings.length <= 1 && !needsEye) return { rating, eye: "both" };
  const takenLeft = (host.system.modules ?? []).some(r => (r.kind === "weapon" || r.kind === "toolLaser") && r.eye === "left");
  const content = `<p>Fit <strong>${esc(data.name)}</strong> into <strong>${esc(host.name)}</strong>.</p>
    ${ratings.length > 1 ? `<div class="form-group"><label>Rating</label><select name="rating">${ratings.map(r => `<option value="${r}" ${r === rating ? "selected" : ""}>${r}</option>`).join("")}</select></div>` : ""}
    ${needsEye ? `<div class="form-group"><label>Which eye</label><select name="eye"><option value="left" ${takenLeft ? "" : "selected"}>Left</option><option value="right" ${takenLeft ? "selected" : ""}>Right</option></select>
      <p class="hint">One weapon or tool laser per eye, none in an eye with a camera (Cybertechnology p.45).</p></div>` : ""}`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Fit ${data.name}` }, content, rejectClose: false,
    ok: { label: "Fit", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  });
  if (!res) return null;
  return { rating: res.rating != null ? Number(res.rating) : rating, eye: needsEye ? res.eye : "both" };
}

// Rows have no item to test (SSC p.100), so second-hand accessories stay separate implants.
const SECONDHAND_ROW = "Second-hand accessories stay separate items so they can be tested (SSC p.100): leave it as its own implant.";

/** Why an owned accessory can't move into `host` (null = it can). Checked before the dialog and again in the queue. */
function moveProblem(actor, src, host) {
  if (src.system.secondhand || src.system.secondhandFailed) return SECONDHAND_ROW;
  if (src.system.grade !== host.system.grade) return `${src.name} is ${src.system.grade}-grade and ${host.name} is ${host.system.grade}: an accessory must match its eye's grade.`;
  if (src.system.conditions?.length) return `${src.name} is damaged: repair it before moving it into an eye.`;
  if (src.effects.size) return `${src.name} has Active Effects, which an eye row can't carry: leave it as a separate implant.`;
  if (unfinishedCymImplant(actor, src)) return `${src.name} belongs to an unfinished cybermantic operation: finish or cancel it first.`;
  return null;
}

/**
 * Fit an accessory into a cybereye. `source` = the owned item for a move, else null (a
 * purchase from `data`). Resolves the host on success, null when nothing changed.
 */
export async function fitEyeAccessory(actor, host, data, { source = null, free = false } = {}) {
  const kind = accessoryKindOf(data);
  if (!kind) return null;
  if (unfinishedCymImplant(actor, host)) { ui.notifications.warn(`${host.name} belongs to an unfinished cybermantic operation: finish or cancel it first.`); return null; }
  // A purchase from second-hand data, too (a move is checked in moveProblem, live in the queue).
  if (!source && (data.system?.secondhand || data.system?.secondhandFailed)) { ui.notifications.warn(SECONDHAND_ROW); return null; }
  const problem = source && moveProblem(actor, source, host);
  if (problem) { ui.notifications.warn(problem); return null; }
  // What the dialog was shown: plain values, compared with the live documents in the queue.
  const quoted = { grade: host.system.grade,
    src: source ? { quote: saleQuote(source).price, rating: source.system.rating, grade: source.system.grade } : null };
  // A move keeps the item's own Rating (a different one would be a free upgrade); a purchase picks one.
  const ratings = source ? [] : [...new Set((data.system?.ratingStats ?? []).map(r => r.rating))].sort((a, b) => a - b);
  const fitting = await askFitting(host, data, kind, { ratings, rating: Number(source ? source.system.rating : data.system?.rating) || 0 });
  if (!fitting) return null;

  const character = actor.type === "character";
  let charge = character && !free && !source;
  try { charge &&= game.settings.get("sr2e", "autoChargePurchases"); } catch (e) { /* default on */ }

  return moneyQueue(actor, async () => {
    // a. Live documents against what was shown: the host still a cybereye of that grade; a
    //    moved item still there, same grade, Rating and quote, and still movable.
    const live = actor.items.get(host.id);
    if (!live || live.system.grade !== quoted.grade || wareRule(live.flags, live._stats?.compendiumSource ?? null) !== "cybereye-pair" || unfinishedCymImplant(actor, live)) {
      ui.notifications.warn(`${host.name} changed while you were deciding — drop the accessory again.`); return null;
    }
    const src = source ? actor.items.get(source.id) : null;
    if (source) {
      const changed = !src || saleQuote(src).price !== quoted.src.quote || src.system.rating !== quoted.src.rating || src.system.grade !== quoted.src.grade;
      const why = changed ? `${source.name} changed while you were deciding — drop it again.` : moveProblem(actor, src, live);
      if (why) { ui.notifications.warn(why); return null; }
    }
    const { row, list, street } = rowFrom(actor, live, src ? src.toObject() : data, { rating: src ? src.system.rating : fitting.rating, kind, eye: fitting.eye });
    if (src) { row.paid = saleQuote(src).price; row.listValue = list; row.active = src.system.installed !== false; }
    const inChargen = !!actor.system.chargen?.inProgress;
    const price = charge ? (inChargen ? list : street) : 0;
    if (charge) { row.paid = price; row.listValue = list; }

    // b. Essence: refuse only a change that costs Essence and would leave it below 0.
    const rows = withRowIds(foundry.utils.deepClone(live._source.system.modules ?? []), () => foundry.utils.randomID())
      ?? foundry.utils.deepClone(live._source.system.modules ?? []);
    const next = [...rows, row];
    const ess = essenceAfter(actor, live, next, src?.id ?? null);
    if (ess.loss > 0 && ess.signed < 0) {
      ui.notifications.warn(`Fitting ${data.name} would take ${actor.name} below 0 Essence (to ${ess.signed}) — nothing was done.`); return null;
    }
    if (price > (actor.system.nuyen ?? 0)) {
      ui.notifications.warn(`${actor.name} can't afford ${data.name} (${price}¥ > ${actor.system.nuyen ?? 0}¥) — nothing bought.`); return null;
    }

    // c. The row first, then the money (or, for a move, the source item); undo the row on failure.
    if (!(await updated(live.update({ "system.modules": next }), "fit accessory"))) {
      ui.notifications.warn(`${data.name} couldn't be fitted — nothing changed.`); return null;
    }
    const undoRow = async (why) => {
      const now = foundry.utils.deepClone(actor.items.get(live.id)?._source.system.modules ?? []);
      if (await updated(live.update({ "system.modules": now.filter(r => r.id !== row.id) }), "undo fit")) {
        ui.notifications.warn(`${data.name} wasn't fitted (${why}) — nothing changed.`);
      } else {
        ui.notifications.error(`${data.name} is in ${live.name} but ${why}: ${price ? `charge ${price}¥ by hand or remove the row` : "remove the row by hand"}.`, { permanent: true });
      }
      return null;
    };
    if (price) {
      const fresh = actor.system.nuyen ?? 0;
      if (fresh < price) return undoRow(`${actor.name} has only ${fresh}¥ now`);
      if (!(await adjustNuyen(actor, -price))) return undoRow("the charge failed");
    }
    if (src && !(await deleted(actor, src.delete(), [src.id], "move accessory"))) return undoRow(`${src.name} couldn't be removed`);

    const notes = [];
    if (ess.loss > 0) notes.push(`+${ess.loss} Essence past the eye's allowance`);
    ui.notifications.info(`${data.name} fitted into ${live.name}${price ? ` for ${price}¥${inChargen ? " (list — character creation)" : ""}` : src ? " (moved; its value stays refundable)" : ""}${notes.length ? ` — ${notes.join("; ")}` : ""}.`);
    return live;
  }, "fit eye accessory");
}
