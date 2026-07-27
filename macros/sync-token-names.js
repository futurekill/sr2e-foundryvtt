/**
 * SR2E — Sync Token Names to Actor Names (GM Macro)
 *
 * The combat tracker labels a combatant from its TOKEN, not its Actor:
 *
 *     this.name ||= token?.name || this.actor?.name || "Unknown"
 *
 * so renaming an Actor leaves every already-placed token — and the actor's own
 * prototype token — carrying the old name, and the tracker keeps showing it.
 * This sweeps the world and re-points token names at their actor's name.
 *
 * Covers each actor's prototype token (so future placements are right) and every
 * placed token on every scene (so the current fight is right). Only touches
 * tokens whose name actually differs, and only LINKED tokens by default —
 * unlinked tokens are frequently renamed on purpose ("Ganger 3"), so they are
 * reported rather than changed unless you pass includeUnlinked.
 *
 * Only GMs can run this macro.
 */

const includeUnlinked = false;   // flip to true to rename unlinked tokens too

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can sync token names.");
}

const protoUpdates = [];
for (const actor of game.actors) {
  if (actor.prototypeToken?.name && actor.prototypeToken.name !== actor.name) {
    protoUpdates.push({ _id: actor.id, "prototypeToken.name": actor.name });
  }
}
if (protoUpdates.length) await Actor.updateDocuments(protoUpdates);

let placed = 0;
const skipped = [];
for (const scene of game.scenes) {
  const updates = [];
  for (const token of scene.tokens) {
    const actorName = token.actor?.name;
    if (!actorName || token.name === actorName) continue;
    if (!token.actorLink && !includeUnlinked) {
      skipped.push(`${token.name} (${scene.name})`);
      continue;
    }
    updates.push({ _id: token.id, name: actorName });
  }
  if (updates.length) {
    await scene.updateEmbeddedDocuments("Token", updates);
    placed += updates.length;
  }
}

const parts = [];
if (protoUpdates.length) parts.push(`${protoUpdates.length} prototype token(s)`);
if (placed) parts.push(`${placed} placed token(s)`);
ui.notifications.info(parts.length
  ? `Renamed ${parts.join(" and ")} to match their actors.`
  : "Every token name already matches its actor.");

if (skipped.length) {
  console.log("SR2E | Unlinked tokens left alone (set includeUnlinked = true to include):", skipped);
  ui.notifications.warn(`${skipped.length} unlinked token(s) left alone — see the console (F12).`);
}
