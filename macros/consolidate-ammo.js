/**
 * SR2E — Consolidate Ammo (GM Macro)
 *
 * Rolls a character's duplicate ammo piles into one stack each — for tidying up
 * someone who bought ammo a box at a time. Only piles that are genuinely the same
 * merge; different bundle sizes (a 10-round box vs a 50-round belt) stay separate,
 * because for ammo the cost is the price of the whole bundle. Quantity and the
 * paid value are summed, so nothing is lost and sell-back still refunds correctly.
 *
 * Select the character's token first. Previews what would merge, then acts only
 * after you confirm. Wraps game.sr2e.consolidateAmmo().
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  ui.notifications.warn("Only the GM can consolidate ammo.");
  return;
}

const actor = canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
if (!actor) {
  ui.notifications.warn("Select the character's token (or assign yourself a character) first.");
  return;
}

// 1. Dry run — see what would merge without touching anything.
const preview = await game.sr2e.consolidateAmmo(actor, { dryRun: true });

if (!preview.groups.length) {
  ui.notifications.info(`No duplicate ammo piles on ${actor.name}.`);
  return;
}

// 2. Show what would merge, then apply or cancel.
const rows = preview.groups.map(g =>
  `<tr><td>${foundry.utils.escapeHTML(g.name)}</td>
       <td style="text-align:center;">${g.piles} piles</td>
       <td style="text-align:center;">→ ${g.quantity} rounds</td></tr>`
).join("");

const apply = await foundry.applications.api.DialogV2.confirm({
  window: { title: `Consolidate Ammo — ${actor.name}` },
  content: `
    <p>These piles would be merged. Nothing has changed yet.</p>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead><tr style="text-align:left;border-bottom:1px solid #888;">
        <th>Ammo</th><th style="text-align:center;">From</th><th style="text-align:center;">Into</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:8px;">Consolidate?</p>`,
  yes: { label: "Consolidate" },
  no: { label: "Cancel" },
  defaultYes: false
});

if (!apply) {
  ui.notifications.info("Consolidation cancelled — nothing was changed.");
  return;
}

// 3. Do it.
await game.sr2e.consolidateAmmo(actor);
