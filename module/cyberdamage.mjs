/**
 * Cyberware damage, repair and scarring (optional; docs/PLAN-cybertechnology-phase5.md;
 * Cybertechnology pp.44–49, 56). GM-EDITABLE state: each cyberware item's `conditions`,
 * `skinMissed`, `skinLoss`, and the character's `flags.sr2e.scars`. A Serious/Deadly
 * physical wound posts ONE GM card whose snapshot is persisted at creation; each action
 * resolves on its own, and Apply refuses a snapshot that no longer matches (the GM edits by
 * hand). Recorded limit: two GMs applying the SAME action at the same instant can both pass.
 */
import { once } from "./claims.mjs";
import { wareRule } from "./rules/ware-rules.mjs";
import { sourceOf } from "./rules/limb-rules.mjs";
import { woundLevel, woundThreshold, gradeResistTN, TABLES, secondaryEffect, degrades, skinRepairPrice,
         SCAR_TREATMENT, SCAR_MAGIC, SCAR_PLATING, SCAR_SKIN, SCAR_SALVE, scarSeverity } from "./rules/cyberdamage-rules.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const cyberDamageOn = () => { try { return game.settings.get("sr2e", "cyberDamage"); } catch (e) { return false; } };
const d6 = async (n = 2) => (await new Roll(`${n}d6`).evaluate()).total;
const ruleOf = (i) => wareRule(i.flags, sourceOf(i));
const SKIN = new Set(["dermal-plating", "dermal-sheath"]);

/** The secondary table an item's identity implies. */
export function tableFor(item) {
  const r = ruleOf(item);
  if (r === "cybereye-pair") return "eye";
  if (r === "cyberear") return "ear";
  if (r === "comm-headware") return "comm";
  if (item.system.limbIdentity?.role === "limb") return "limb";
  return "other";
}

/** Post the wound card (the committing client, deduped on the commit's receipt). */
export async function postWoundCard(actor, { boxes, receipt, manual = false }) {
  const level = woundLevel(boxes);
  if (actor?.type !== "character" || !level) return;
  if (!manual && !await once(actor, `cdmg-card:${receipt}`)) return;
  const ware = actor.items.filter(i => i.type === "cyberware" && i.system.installed);
  const skins = ware.filter(i => SKIN.has(ruleOf(i))).filter(i => ruleOf(i) === "dermal-plating" || level === "D")
    .map(i => ({ itemId: i.id, name: i.name, kind: ruleOf(i), missed: i.system.skinMissed ?? 0, loss: i.system.skinLoss ?? 0,
      rating: Math.max(0, i.system.attributeMods?.body ?? 0) }));
  const st = { actorUuid: actor.uuid, actorName: actor.name, level, boxes, hasWare: ware.length > 0, skins,
    plating: ware.some(i => ruleOf(i) === "dermal-plating"), sheath: ware.some(i => ruleOf(i) === "dermal-sheath"),
    qualifying: false, resolved: {}, results: {} };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM"),
    content: renderCard(st), flags: { sr2e: { cdmg: st } } });
}

const b = (op, label, title = "", disabled = false) =>
  `<button type="button" class="sr2e-resist-btn sr2e-cd-btn" data-op="${op}" title="${esc(title)}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;

export function renderCard(st) {
  const R = st.resolved, X = st.results;
  const parts = [`<strong>${esc(st.actorName)}: ${st.level === "D" ? "Deadly" : "Serious"} wound (${st.boxes} boxes)</strong> — Cybertechnology checks (optional rules)`];
  if (st.hasWare) {
    let line = "<br><strong>Cyberware damage</strong> (p.44): ";
    if (X.check) line += `2D6 = ${X.check.roll} vs ${woundThreshold(st.level)}: ${X.check.damaged ? "<strong>damaged</strong>" : "no damage"}. `;
    if (X.damage) line += esc(X.damage.text);
    else if (!X.check) line += b("check", "Roll 2D6");
    else if (X.check.damaged) line += b("damage", "Choose the item and roll");
    parts.push(line);
  }
  for (const s of st.skins) {
    const k = `${s.itemId}`, kind = s.kind === "dermal-sheath" ? "sheathing" : "plating";
    let line = `<br><strong>${esc(s.name)}</strong> (${kind}, ${s.missed} missed treatment${s.missed === 1 ? "" : "s"}, −${s.loss}): `;
    line += R[`${k}:missed`] ? `missed ${kind === "plating" ? "bonder" : "sealer"} recorded. ` : b(`missed:${k}`, `Missed the ${kind === "plating" ? "bonder (24 h)" : "sealer (12 h)"}`, "Only once the deadline has passed without treatment (p.47–48)") + " ";
    if (s.missed > 0) {
      if (X[`${k}:degrade`]) line += esc(X[`${k}:degrade`]);
      else if (s.loss >= s.rating) line += "no further loss (fully degraded). ";
      else line += b(`degrade:${k}`, `Degradation check (2D6 < ${s.missed})`, "A wound from non-explosive weapons or magic", !st.qualifying);
    }
    if (kind === "sheathing" && R[`${k}:missed`]) line += R[`${k}:scar`] ? " Minor scar recorded." : " " + b(`sheathScar:${k}`, "Record Minor scar (p.48)");
    line += ` <em>Repair: ${skinRepairPrice(s.kind, Math.max(1, s.loss)).toLocaleString("en-US")}¥ for the next point, Biotech (${kind === "plating" ? 5 : 4}).</em>`;
    parts.push(line);
  }
  if (st.skins.some(s => s.missed > 0)) parts.push(`<br><label><input type="checkbox" class="sr2e-cd-qualify" ${st.qualifying ? "checked" : ""}> From non-explosive weapons or magic (enables degradation, p.47)</label>`);
  parts.push(`<br><strong>Scarring</strong> (p.56): ${X.scar ? esc(X.scar) : b("scar", "Scarring check")}`);
  return `<div class="sr2e-damage-result sr2e-cd-card">${parts.join("")}</div>`;
}

async function save(message, st) { await message.update({ content: renderCard(st), "flags.sr2e.cdmg": st }); }

/** One dispatcher for the card's buttons (GM only). */
export async function cardOp(message, op, preset = null) {   // preset: the dialogs' answers (tests)
  if (!game.user.isGM) return ui.notifications.warn("Cyberware damage checks are the GM's.");
  const st = foundry.utils.deepClone(message.flags.sr2e.cdmg);
  const actor = await fromUuid(st.actorUuid);
  if (actor?.type !== "character") return ui.notifications.warn("That character is gone.");
  const [verb, itemId] = op.split(":");
  const item = itemId ? actor.items.get(itemId) : null;
  const snap = st.skins.find(s => s.itemId === itemId);
  const stale = (field, want) => { if ((item?.system[field] ?? 0) !== want) { ui.notifications.warn(`${item?.name ?? "That item"} changed since this card: edit it by hand.`); return true; } return false; };

  if (verb === "check" && !st.results.check) {
    const roll = await d6();
    st.results.check = { roll, damaged: roll < woundThreshold(st.level) };
    return save(message, st);
  }
  if (verb === "damage" && st.results.check?.damaged && !st.results.damage) {
    const ware = actor.items.filter(i => i.type === "cyberware" && i.system.installed);
    const order = (i) => ({ eye: 0, ear: 1, limb: 2, comm: 3 }[tableFor(i)] ?? 4);
    const pick = preset ?? await foundry.applications.api.DialogV2.prompt({ window: { title: "Damaged cyberware (p.44)" },
      content: `<p>Pick the piece with a logical connection to the wound, and not one that unduly hinders the character (p.44).</p>
        <div class="form-group"><label>Item</label><select name="item">${ware.sort((a, c) => order(a) - order(c)).map(i => `<option value="${i.id}">${esc(i.name)} (${tableFor(i)})</option>`).join("")}</select></div>
        <div class="form-group"><label>Table</label><select name="table"><option value="">from the item</option>${Object.entries(TABLES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("")}<option value="other">none (GM)</option></select></div>`,
      ok: { callback: (ev, button) => ({ item: button.form.elements.item.value, table: button.form.elements.table.value }) } });
    if (!pick) return;
    const target = actor.items.get(pick.item);
    if (!target?.system.installed) return ui.notifications.warn("That item isn't installed any more.");
    const table = pick.table || tableFor(target);
    const tn = gradeResistTN(target.system.grade, st.level);
    let resisted = false, gradeText = "";
    if (tn) { const r = await SR2ESuccessRoll.successTest(5, tn); resisted = r.successes > 0; gradeText = ` ${target.system.grade} grade: 5 dice vs ${tn} → ${r.successes} (${resisted ? "resisted" : "damaged"}).`; }
    if (resisted) { st.results.damage = { text: `${target.name}${gradeText}` }; return save(message, st); }
    const roll = await d6();
    const fx = secondaryEffect(table, roll);
    const id = `${message.id}:damage`;
    if (!(target.system.conditions ?? []).some(c => c.id === id)) {
      await target.update({ "system.conditions": [...(target.system.conditions ?? []), { id, table, roll, effect: fx.effect, repairTN: fx.repairTN }] });
    }
    const prior = (target.system.conditions ?? []).filter(c => c.id !== id).length;
    st.results.damage = { text: `${target.name}${gradeText} Secondary 2D6 = ${roll}: ${fx.effect} Repair TN ${fx.repairTN}.${prior ? ` (It already had ${prior} unrepaired effect${prior === 1 ? "" : "s"}: both stand.)` : ""}${target.system.grade === "delta" ? " Delta: ×4 medical costs and repair time." : ""}` };
    return save(message, st);
  }
  if (verb === "missed" && snap && !st.resolved[`${itemId}:missed`]) {
    if (!item || stale("skinMissed", snap.missed)) return;
    await item.update({ "system.skinMissed": snap.missed + 1 });
    st.resolved[`${itemId}:missed`] = true;
    return save(message, st);
  }
  if (verb === "degrade" && snap && st.qualifying && !st.results[`${itemId}:degrade`]) {
    if (!item || stale("skinLoss", snap.loss)) return;
    const roll = await d6();
    const loss = degrades(roll, snap.missed) && snap.loss < snap.rating;
    if (loss) await item.update({ "system.skinLoss": Math.min(snap.rating, snap.loss + 1) });
    st.results[`${itemId}:degrade`] = `2D6 = ${roll} vs ${snap.missed}: ${loss ? "the rating drops by 1" : "no loss"}. `;
    return save(message, st);
  }
  if (verb === "sheathScar" && snap && !st.resolved[`${itemId}:scar`]) {
    await addScar(actor, `${message.id}:${itemId}:scar`, "Minor", "sheathing without sealer (p.48)");
    st.resolved[`${itemId}:scar`] = true;
    return save(message, st);
  }
  if (verb === "scar" && !st.results.scar) {
    const r = await scarDialog(actor, st, preset);
    if (!r) return;
    await addScar(actor, `${message.id}:general:scar`, r.severity, `${st.level === "D" ? "Deadly" : "Serious"} wound`);
    st.results.scar = `Body ${r.dice} vs TN ${r.tn} (${r.parts}): ${r.successes} success${r.successes === 1 ? "" : "es"} → ${r.severity}.`;
    return save(message, st);
  }
}

async function addScar(actor, id, severity, source) {
  const scars = actor.getFlag("sr2e", "scars") ?? [];
  if (scars.some(s => s.id === id)) return;
  await actor.setFlag("sr2e", "scars", [...scars, { id, severity, source, at: game.time.worldTime, treatedTo: null }]);
}

/** The scarring check (p.56): Body at TN = boxes + Scarring Modifiers + overstress, nothing else. */
async function scarDialog(actor, st, preset = null) {
  const opt = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${k} (${v >= 0 ? "+" : ""}${v})</option>`).join("");
  const f = preset ?? await foundry.applications.api.DialogV2.prompt({ window: { title: "Scarring check (p.56)" },
    content: `<div class="form-group"><label>Treatment conditions</label><select name="treat">${opt(SCAR_TREATMENT).replace('value="none"', 'value="none" selected')}</select></div>
      <div class="form-group"><label>Magical healing</label><select name="magic">${opt(SCAR_MAGIC)}</select></div>
      <div class="form-group"><label>Dermal plating (+3)</label><input type="checkbox" name="plating" ${st.plating ? "checked" : ""}></div>
      <div class="form-group"><label>Dermal sheathing / semi-artificial skin (+2)</label><input type="checkbox" name="skin" ${st.sheath ? "checked" : ""}></div>
      <div class="form-group"><label>Proper healing salve (−2)</label><input type="checkbox" name="salve"></div>`,
    ok: { callback: (ev, button) => { const e = button.form.elements; return { treat: e.treat.value, magic: e.magic.value, plating: e.plating.checked, skin: e.skin.checked, salve: e.salve.checked }; } } });
  if (!f) return null;
  const mods = SCAR_TREATMENT[f.treat] + SCAR_MAGIC[f.magic] + (f.plating ? SCAR_PLATING : 0) + (f.skin ? SCAR_SKIN : 0) + (f.salve ? SCAR_SALVE : 0);
  const over = actor._bodyTestOpts?.() ?? {};
  const tn = Math.max(2, st.boxes + mods);
  const dice = actor.system.body?.value ?? 0;
  const res = await actor.rollSuccessTest(dice, tn, { label: `Scarring check (Cybertechnology p.56): TN ${st.boxes} boxes ${mods >= 0 ? "+" : ""}${mods}`,
    tnPolicy: "table", ...(over.extraTN ? { extraTN: over.extraTN, extraTNLabel: over.extraTNLabel } : {}) });
  const successes = res?.successes ?? 0;
  return { dice, tn: tn + (over.extraTN ?? 0), rolledTN: res?.targetNumber, successes, severity: scarSeverity(successes), parts: `${st.boxes} + ${mods}${over.extraTN ? ` + ${over.extraTN} overstress` : ""}` };
}

export function registerCyberDamageHooks() {
  Hooks.on("sr2e.damageCommitted", (actor, out, opts) => {
    if (!cyberDamageOn() || opts?.type !== "physical" || actor?.type !== "character" || !actor.isOwner) return;
    postWoundCard(actor, { boxes: out?.landedBoxes ?? 0, receipt: opts.receipt }).catch(err => console.error("SR2E | cyberware damage card", err));
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.flags?.sr2e?.cdmg) return;
    html.querySelectorAll?.(".sr2e-cd-btn").forEach(btn => btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try { await cardOp(message, btn.dataset.op); } catch (err) { console.error("SR2E | cyberware damage", err); ui.notifications.error(err.message); }
    }));
    html.querySelector?.(".sr2e-cd-qualify")?.addEventListener("change", async (ev) => {
      if (!game.user.isGM) return;
      const st = foundry.utils.deepClone(message.flags.sr2e.cdmg);
      st.qualifying = ev.target.checked;
      await save(message, st);
    });
  });
}
