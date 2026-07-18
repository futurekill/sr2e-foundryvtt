/**
 * SR2E — Refresh Item Art (GM Macro)
 *
 * A character's items are COPIES made when the item was dropped onto the sheet,
 * so they keep their old placeholder icon even after the compendium item gets
 * new artwork. This sweeps every world character and re-points each embedded
 * item's icon to the matching compendium art.
 *
 * Safe + idempotent: it only replaces core placeholder icons (icons/…) with
 * generated art that actually exists in the system compendia — it never touches
 * a custom image you set yourself. Re-run it any time more art ships.
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
const characters = game.actors.filter(a => a.type === "character");

let itemCount = 0, actorCount = 0;
for (const actor of characters) {
  const updates = [];
  for (const item of actor.items) {
    const art = artMap.get(`${item.type}::${item.name}`);
    if (art && item.img !== art && isPlaceholder(item.img)) {
      updates.push({ _id: item.id, img: art });
    }
  }
  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
    itemCount += updates.length;
    actorCount++;
  }
}

ui.notifications.info(itemCount
  ? `Refreshed art on ${itemCount} item(s) across ${actorCount} character(s).`
  : "All character item art is already up to date.");
