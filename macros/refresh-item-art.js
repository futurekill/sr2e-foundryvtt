/**
 * SR2E — Refresh Item Art (GM Macro)
 *
 * An actor's items are COPIES made when the item was dropped onto the sheet,
 * so they keep their old placeholder icon even after the compendium item gets
 * new artwork. This sweeps the world and re-points each embedded item's icon to
 * the matching compendium art.
 *
 * Covers every world actor (characters, NPCs, vehicles), the synthetic actors
 * behind UNLINKED tokens — whose items are a separate copy the actor loop never
 * sees — and loose items in the world Items directory.
 *
 * Art is matched from every loaded Item compendium, so content modules
 * (Rigger 2, Shadowtech, Street Samurai Catalog, …) are picked up too, not just
 * the system's own packs.
 *
 * Safe + idempotent: it only replaces core placeholder icons (icons/…) with
 * generated art that actually exists in a compendium — it never touches a
 * custom image you set yourself. Re-run it any time more art ships.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can refresh item art.");
}

// Build a (type::name → icon) map from the system's item compendia. Only entries
// that actually carry generated item art are eligible.
const artMap = new Map();
for (const pack of game.packs) {
  if (pack.metadata.type !== "Item") continue;
  let index;
  try { index = await pack.getIndex({ fields: ["type", "img"] }); }
  catch (e) { continue; }
  for (const entry of index) {
    if (entry.img && entry.img.includes("/item_icons/")) {
      artMap.set(`${entry.type}::${entry.name}`, entry.img);
    }
  }
}
if (!artMap.size) {
  return ui.notifications.warn("No generated item art found in the compendia — is the SR2E system up to date?");
}

const isPlaceholder = (img) => !img || img.startsWith("icons/");

/** Re-point an item-owning document's embedded items. Returns how many changed. */
async function refresh(owner) {
  const updates = [];
  for (const item of owner.items) {
    const art = artMap.get(`${item.type}::${item.name}`);
    if (art && item.img !== art && isPlaceholder(item.img)) {
      updates.push({ _id: item.id, img: art });
    }
  }
  if (!updates.length) return 0;
  await owner.updateEmbeddedDocuments("Item", updates);
  return updates.length;
}

let itemCount = 0, ownerCount = 0;

// Every world actor, not just characters — NPCs and vehicles carry gear too.
for (const actor of game.actors) {
  const n = await refresh(actor);
  if (n) { itemCount += n; ownerCount++; }
}

// Unlinked tokens own a synthetic actor whose items are a separate copy, so they
// are NOT reached by the loop above. Missing these is the usual reason a sheet
// still shows the old icon after a refresh.
for (const scene of game.scenes) {
  for (const token of scene.tokens) {
    if (token.actorLink || !token.actor) continue;
    const n = await refresh(token.actor);
    if (n) { itemCount += n; ownerCount++; }
  }
}

// Loose items in the world Items directory (a GM's staging area).
const looseUpdates = [];
for (const item of game.items) {
  const art = artMap.get(`${item.type}::${item.name}`);
  if (art && item.img !== art && isPlaceholder(item.img)) {
    looseUpdates.push({ _id: item.id, img: art });
  }
}
if (looseUpdates.length) {
  await Item.updateDocuments(looseUpdates);
  itemCount += looseUpdates.length;
}

ui.notifications.info(itemCount
  ? `Refreshed art on ${itemCount} item(s) across ${ownerCount} actor(s)${looseUpdates.length ? ` and ${looseUpdates.length} world item(s)` : ""}.`
  : "All item art is already up to date.");
