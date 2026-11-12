/**
 * The Rigger 2 Vehicle List in play (docs/PLAN-vehicle-list.md; rules in module/rules/vehicle-list-rules.mjs).
 * The Rigger 2 module registers the list (CONFIG.SR2E.registerVehicleList); with it registered:
 *  - a vehicle IMPORTED from a compendium the list covers takes the list's stats and factory equipment (ruling 2);
 *  - the GM's "Update vehicles to Rigger 2 stats" window brings vehicles already in the world up to date, one ticked
 *    target at a time, re-checking each before it writes.
 * A designed vehicle (Workshop or the old Design tab) is never changed.
 */
import { hasDesign, listIdentity, statChanges, reconcileFactory, withListNote, nameKey, factorySignature } from "./rules/vehicle-list-rules.mjs";

const list = () => CONFIG.SR2E.vehicleList;
const registered = () => Object.keys(list()?.rows ?? {}).length > 0;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The create-time changes for an import (source data), or null when the list doesn't apply. */
export function importChanges(data) {
  if (data?.type !== "vehicle" || !registered()) return null;
  const st = data._stats ?? {};
  if (!st.compendiumSource || st.duplicateSource || data.flags?.sr2e?.r2Stats) return null;   // imports only (R1 #10)
  if (hasDesign(data.system)) return null;
  const id = listIdentity(data, list());
  if (!id) return null;
  const row = list().rows[id.vehicleId];
  const { patch } = statChanges(data.system ?? {}, row);
  const items = foundry.utils.deepClone(data.items ?? []);
  const { create, mark } = reconcileFactory(items, row.factory);
  for (const m of mark) {
    const i = items.find(x => x._id === m._id);
    foundry.utils.setProperty(i, "system.rating", m.rating);
    foundry.utils.setProperty(i, "system.custom.state", "factory");
    foundry.utils.mergeObject(i, { system: { modKey: m.modKey, stack: m.stack } });
  }
  return { vehicleId: id.vehicleId, patch, items: [...items, ...freshIds(create, items)], notes: withListNote(data.system?.notes ?? "", row.notes),
    stamp: { source: st.compendiumSource, page: row.page } };
}

/** Copies of the factory entries to create, re-id'd where the entry's _id is already taken (a bought item, say). */
const freshIds = (create, items) => create.map(i => {
  const c = foundry.utils.deepClone(i);
  if (items.some(x => x._id === c._id)) c._id = foundry.utils.randomID();
  return c;
});

/** Everything the update window could change: world vehicles and every unlinked token's synthetic actor (R1 #5). */
export function updateCandidates() {
  if (!registered()) return [];
  const rowsByName = new Map(Object.entries(list().rows).map(([vid, r]) => [nameKey(r.name), vid]));
  const targets = game.actors.filter(a => a.type === "vehicle").map(a => ({ actor: a, label: a.name }));
  for (const sc of game.scenes) for (const t of sc.tokens) {
    if (t.actorLink || t.actor?.type !== "vehicle") continue;
    targets.push({ actor: t.actor, label: `${t.name} (token on ${sc.name})` });
  }
  const out = [];
  for (const { actor, label } of targets) {
    const src = actor.toObject();
    if (hasDesign(src.system)) continue;
    let id = listIdentity(src, list()), byName = false;
    if (!id) { const vid = rowsByName.get(nameKey(actor.name)); if (vid) { id = { vehicleId: vid, by: "name" }; byName = true; } }
    if (!id) continue;
    const row = list().rows[id.vehicleId];
    const { changes, patch } = statChanges(src.system, row);
    const fac = reconcileFactory(src.items, row.factory);
    const stamped = src.flags?.sr2e?.vehicleId === id.vehicleId;
    if (!changes.length && !fac.create.length && !fac.mark.length && stamped) continue;
    out.push({ uuid: actor.uuid, label, vehicleId: id.vehicleId, rowName: row.name, byName, changes, patch, fac,
      snapshot: Object.fromEntries(changes.map(c => [c.key, c.from])), equipment: factorySignature(src.items, row.factory), tick: !byName && !fac.ambiguous.length });
  }
  return out;
}

/** Apply one target, re-reading it first; returns "applied", or why it was skipped (R1 #9). */
export async function applyCandidate(c, { keepAmbiguous = false } = {}) {
  const actor = await fromUuid(c.uuid);
  if (!actor) return "gone";
  const src = actor.toObject();
  if (hasDesign(src.system)) return "now has a design";
  for (const [k, v] of Object.entries(c.snapshot)) {
    const cur = foundry.utils.getProperty(src.system, k) ?? null;
    if (JSON.stringify(cur) !== JSON.stringify(v ?? null)) return "edited since the list was built";
  }
  const row = list().rows[c.vehicleId];
  if (factorySignature(src.items, row.factory) !== c.equipment) return "equipment edited since the list was built";
  const fac = reconcileFactory(src.items, row.factory, { keepAmbiguous });
  await actor.update({ ...c.patch, "system.notes": withListNote(src.system.notes ?? "", row.notes),
    "flags.sr2e.vehicleId": c.vehicleId, "flags.sr2e.r2Stats": { source: src._stats?.compendiumSource ?? "", page: row.page, by: c.byName ? "name" : "identity" } });
  if (fac.mark.length) await actor.updateEmbeddedDocuments("Item", fac.mark.map(m => ({ _id: m._id, "system.rating": m.rating, "system.custom.state": "factory",
    "system.modKey": m.modKey, "system.stack": m.stack })));
  if (fac.create.length) await actor.createEmbeddedDocuments("Item", freshIds(fac.create, src.items), { keepId: true });
  return "applied";
}

const fmt = (v) => v == null || v === "" ? "—" : Array.isArray(v) ? (v.join(", ") || "—") : typeof v === "number" ? v.toLocaleString() : esc(v);

/** The GM's window: every candidate with its changes; applies the ticked ones. */
export async function openVehicleListUpdate() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can update vehicles.");
  if (!registered()) return ui.notifications.warn("The Rigger 2 module (its Vehicle List) isn't active.");
  const cands = updateCandidates();
  if (!cands.length) return ui.notifications.info("Every vehicle the Rigger 2 Vehicle List covers is up to date.");
  const rows = cands.map((c, n) => {
    const stats = c.changes.map(ch => `${esc(ch.key)} ${fmt(ch.from)} → <strong>${fmt(ch.to)}</strong>`).join("; ");
    const items = [...c.fac.create.map(i => `+ ${esc(i.name)}${i.system?.rating > 1 ? ` ${i.system.rating}` : ""}`),
      ...c.fac.mark.map(m => `${esc(m.name)} → factory${m.rating > 1 ? ` ${m.rating}` : ""}`)].join("; ");
    const flag = c.byName ? `<br><em>Matched by name only (${esc(c.rowName)}): check it's the same vehicle.</em>` : "";
    const amb = c.fac.ambiguous.length ? `<br><em>Has ${esc([...new Set(c.fac.ambiguous)].join(", "))} at another rating:</em>
      <select name="k${n}"><option value="adopt">adopt it as the factory equipment</option>
      <option value="keep">keep it as aftermarket and add the factory equipment</option></select>` : "";
    return `<tr><td><input type="checkbox" name="c${n}" ${c.tick ? "checked" : ""}></td><td><strong>${esc(c.label)}</strong>${flag}${amb}</td>
      <td>${stats || "—"}</td><td>${items || "—"}</td></tr>`;
  }).join("");
  const content = `<p>With the Rigger 2 module, vehicles use its Vehicle List stats (book p.148–166). Tick the vehicles to update;
    designed vehicles are never listed.</p><div style="max-height:60vh;overflow:auto"><table class="sr2e-vlist">
    <thead><tr><th></th><th>Vehicle</th><th>Stats</th><th>Factory equipment</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const picked = await foundry.applications.api.DialogV2.prompt({ window: { title: "Update vehicles to Rigger 2 stats" }, position: { width: 900 }, content,
    ok: { label: "Update the ticked vehicles", callback: (ev, button) => cands.flatMap((c, n) => button.form.elements[`c${n}`]?.checked
      ? [{ c, keepAmbiguous: button.form.elements[`k${n}`]?.value === "keep" }] : []) } });
  if (!picked?.length) return;
  const results = [];
  for (const { c, keepAmbiguous } of picked) results.push([c.label, await applyCandidate(c, { keepAmbiguous }).catch(err => (console.error(err), "failed"))]);
  const skipped = results.filter(([, r]) => r !== "applied");
  ui.notifications.info(`${results.length - skipped.length} vehicle(s) updated to Rigger 2 stats.`);
  if (skipped.length) ui.notifications.warn(`Skipped: ${skipped.map(([l, r]) => `${l} (${r})`).join("; ")}. Open the window again to review.`);
}

export function registerVehicleList() {
  // Imports take the list's stats (ruling 2). preCreate runs on the creating client only.
  Hooks.on("preCreateActor", (doc, data) => {
    const ch = importChanges(doc.toObject());
    if (!ch) return;
    doc.updateSource({ ...ch.patch, "system.notes": ch.notes, items: ch.items, "flags.sr2e.vehicleId": ch.vehicleId, "flags.sr2e.r2Stats": ch.stamp });
  });
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.isGM || !registered()) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const actions = root?.querySelector(".header-actions");
    if (!actions || actions.querySelector("[data-sr2e-vlist]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.sr2eVlist = "1";
    b.innerHTML = `<i class="fas fa-list-check"></i> Rigger 2 stats`;
    b.title = "Update vehicles already in the world to the Rigger 2 Vehicle List stats";
    b.addEventListener("click", () => openVehicleListUpdate());
    actions.append(b);
  });
}
