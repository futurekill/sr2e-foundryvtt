/**
 * SR2E — Award Nuyen (GM Macro)
 *
 * The GM enters a total payout and picks how it's split among the selected
 * runners:
 *   • Even split          — divided as evenly as possible (the default).
 *   • By amount (¥)        — type each runner's exact payout.
 *   • By percentage (%)    — each runner gets a share of the total.
 *   • By weight            — proportional shares (2 / 1 / 1 → 50% / 25% / 25%).
 *
 * In every mode the unallocated remainder (or rounding) goes to the communal
 * pot (world setting), which the GM can fold back into a future award.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can award nuyen.");
}
if (!game.sr2e?.allocateNuyen) {
  return ui.notifications.error("SR2E allocateNuyen helper missing — update the system.");
}

const characters = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
if (!characters.length) {
  return ui.notifications.warn("No character actors found in this world.");
}

const pot = game.settings.get("sr2e", "communalNuyen");

const charRows = characters.map(a => `
  <div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
    <input type="checkbox" id="char-${a.id}" name="char-${a.id}" value="${a.id}" checked>
    <img src="${a.img}" style="width:24px;height:24px;object-fit:cover;border-radius:3px;border:1px solid #30363d;">
    <label for="char-${a.id}" style="cursor:pointer;font-size:13px;flex:1;">${a.name} <span style="color:#9d8fc2;">(${a.system.nuyen ?? 0}¥)</span></label>
    <input type="number" name="share-${a.id}" value="1" step="1" min="0" title="Share for custom modes (¥ / % / weight). Ignored in Even split." style="width:80px;">
  </div>
`).join("");

const result = await foundry.applications.api.DialogV2.wait({
  window: { title: "Award Nuyen" },
  content: `<form>
    <p style="font-size:12px;color:#9d8fc2;margin:0 0 6px;">
      Enter the total payout and choose how it's split. Any unallocated
      remainder goes to the <strong>communal pot</strong> (currently
      <strong>${pot}¥</strong>).
    </p>
    <div class="form-group">
      <label>Total nuyen:</label>
      <input type="number" name="total" value="0" min="0" step="1" autofocus>
    </div>
    <div class="form-group">
      <label>Split mode:</label>
      <select name="mode">
        <option value="even" selected>Even split</option>
        <option value="amount">By amount (¥)</option>
        <option value="percent">By percentage (%)</option>
        <option value="weight">By weight</option>
      </select>
    </div>
    <div class="form-group" style="align-items:center;">
      <label>Include communal pot (${pot}¥) in the pool:</label>
      <input type="checkbox" name="includePot" style="width:auto;">
    </div>
    <p style="font-size:11px;color:#7a6f9c;margin:4px 0 2px;">
      The number beside each runner is their <strong>share</strong> — a flat ¥,
      a %, or a weight, depending on the mode. It is ignored for an even split.
    </p>
    <hr>
    ${charRows}
  </form>`,
  buttons: [
    {
      action: "award",
      label: "Award",
      default: true,
      callback: (event, button) => {
        const f = button.form.elements;
        const ids = characters.filter(a => f[`char-${a.id}`]?.checked).map(a => a.id);
        const shares = {};
        for (const id of ids) shares[id] = parseFloat(f[`share-${id}`]?.value) || 0;
        return {
          total: Math.max(0, parseInt(f.total?.value) || 0),
          mode: f.mode?.value ?? "even",
          includePot: !!f.includePot?.checked,
          ids, shares
        };
      }
    },
    { action: "cancel", label: "Cancel" }
  ],
  rejectClose: false
});

if (!result || result === "cancel" || !result.ids?.length) return;

const res = game.sr2e.allocateNuyen({
  total: result.total, pot, includePot: result.includePot,
  mode: result.mode, ids: result.ids, shares: result.shares
});
if (!res.ok) return ui.notifications.warn(res.error);
if (res.pool <= 0) return ui.notifications.warn("Nothing to award.");

for (const id of result.ids) {
  const actor = game.actors.get(id);
  const amt = res.awards[id] ?? 0;
  if (!actor || amt <= 0) continue;
  await actor.update({ "system.nuyen": (actor.system.nuyen ?? 0) + amt });
}
await game.settings.set("sr2e", "communalNuyen", res.newPot);

const modeLabel = { even: "even split", amount: "by amount", percent: "by percentage", weight: "by weight" }[result.mode] ?? result.mode;
const lines = result.ids
  .map(id => ({ name: game.actors.get(id)?.name, amt: res.awards[id] ?? 0 }))
  .filter(r => r.name && r.amt > 0)
  .map(r => `<li><strong>${r.name}</strong> — ${r.amt.toLocaleString()}¥</li>`)
  .join("");

ChatMessage.create({
  speaker: { alias: "Mr. Johnson" },
  content: `<div class="sr2e-award">
    <strong>Payday:</strong> ${res.awarded.toLocaleString()}¥ of ${res.pool.toLocaleString()}¥ (${modeLabel})
    <ul style="margin:4px 0 4px 16px;padding:0;">${lines}</ul>
    ${res.leftover > 0 ? `<em>${res.leftover.toLocaleString()}¥ to the communal pot (now ${res.newPot.toLocaleString()}¥).</em>` : ""}
    ${result.includePot && pot > 0 ? `<br><em>Folded ${pot.toLocaleString()}¥ from the communal pot into the pool.</em>` : ""}
  </div>`
});
