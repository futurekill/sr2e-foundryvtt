/**
 * SR2E — Repair Stale Implants (GM Macro)
 *
 * Foundry copies a compendium item onto a character when you drag it, and never
 * updates that copy afterwards. So when a system update adds a mechanical field
 * (bone lacing's unarmed Power, Enhanced Articulation's +1 die), implants already
 * installed keep the old default and silently do nothing.
 *
 * This previews every fix first, then writes only after you confirm. It fills a
 * field only when the character's copy still holds the schema default and the
 * compendium has a real value — it never changes something you've edited, and
 * skips implants on unlinked tokens. Wraps game.sr2e.repairStaleImplants().
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  ui.notifications.warn("Only the GM can repair implants.");
  return;
}

// 1. Dry run — find what would change without writing anything.
const preview = await game.sr2e.repairStaleImplants();

if (!preview.changes.length) {
  ui.notifications.info(
    `No stale implants found (${preview.scanned} scanned, ${preview.noSource} with no compendium source).`
  );
  return;
}

// 2. Show the GM exactly what would change, and let them apply or cancel.
const rows = preview.changes.map(c =>
  `<tr><td>${foundry.utils.escapeHTML(c.actor)}</td>
       <td>${foundry.utils.escapeHTML(c.item)}</td>
       <td>${c.fields.map(f => `${f.field}: ${f.from} → <strong>${f.to}</strong>`).join("<br>")}</td></tr>`
).join("");

const apply = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Repair Stale Implants" },
  content: `
    <p>${preview.changes.length} implant(s) would be updated. Nothing has changed yet.</p>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead><tr style="text-align:left;border-bottom:1px solid #888;">
        <th>Character</th><th>Implant</th><th>Fix</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:8px;">Apply these fixes?</p>`,
  yes: { label: "Apply" },
  no: { label: "Cancel" },
  defaultYes: false
});

if (!apply) {
  ui.notifications.info("Repair cancelled — nothing was changed.");
  return;
}

// 3. Write.
await game.sr2e.repairStaleImplants({ apply: true });
