/**
 * SR2E — Award Nuyen (GM Macro)
 *
 * The GM enters a TOTAL payout and selects the characters splitting it.
 * The total is divided as evenly as possible; any remainder that will not
 * divide evenly goes to the communal pot (world setting), which the GM can
 * pay out later by including it in a future award.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can award nuyen.");
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
    <label for="char-${a.id}" style="cursor:pointer;font-size:13px;">${a.name} <span style="color:#9d8fc2;">(${a.system.nuyen ?? 0}¥)</span></label>
  </div>
`).join("");

const result = await foundry.applications.api.DialogV2.wait({
  window: { title: "Award Nuyen" },
  content: `<form>
    <p style="font-size:12px;color:#9d8fc2;margin:0 0 6px;">
      Total payout, split as evenly as possible between the selected runners.
      The indivisible remainder goes to the <strong>communal pot</strong>
      (currently <strong>${pot}¥</strong>).
    </p>
    <div class="form-group">
      <label>Total nuyen:</label>
      <input type="number" name="total" value="0" min="0" step="1" autofocus>
    </div>
    <div class="form-group" style="align-items:center;">
      <label>Include communal pot (${pot}¥) in the split:</label>
      <input type="checkbox" name="includePot" style="width:auto;">
    </div>
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
        return {
          total: Math.max(0, parseInt(f.total?.value) || 0),
          includePot: !!f.includePot?.checked,
          ids: characters.filter(a => f[`char-${a.id}`]?.checked).map(a => a.id)
        };
      }
    },
    { action: "cancel", label: "Cancel" }
  ],
  rejectClose: false
});

if (!result || result === "cancel" || !result.ids?.length) return;

let total = result.total + (result.includePot ? pot : 0);
if (total <= 0) return ui.notifications.warn("Nothing to award.");

const share = Math.floor(total / result.ids.length);
const remainder = total - share * result.ids.length;

for (const id of result.ids) {
  const actor = game.actors.get(id);
  if (!actor) continue;
  await actor.update({ "system.nuyen": (actor.system.nuyen ?? 0) + share });
}

const newPot = (result.includePot ? 0 : pot) + remainder;
await game.settings.set("sr2e", "communalNuyen", newPot);

const names = result.ids.map(id => game.actors.get(id)?.name).filter(Boolean);
ChatMessage.create({
  speaker: { alias: "Mr. Johnson" },
  content: `<div class="sr2e-award">
    <strong>Payday:</strong> ${total.toLocaleString()}¥ split ${result.ids.length} ways —
    <strong>${share.toLocaleString()}¥ each</strong> to ${names.join(", ")}.
    ${remainder > 0 ? `<br><em>${remainder}¥ to the communal pot (now ${newPot}¥).</em>` : ""}
    ${result.includePot && pot > 0 ? `<br><em>Included ${pot}¥ from the communal pot.</em>` : ""}
  </div>`
});
