/**
 * SR2E — Award Karma (GM Macro)
 *
 * Presents a dialog listing all player characters. The GM selects one or
 * more of them, enters an amount, and clicks "Award Karma". Each selected
 * character's Good Karma (available) and Total Earned karma both increase
 * by the entered amount, and a chat message is posted to the table.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can award karma.");
}

const characters = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
if (!characters.length) {
  return ui.notifications.warn("No character actors found in this world.");
}

// Build one checkbox row per character, all pre-checked
const charRows = characters.map(a => `
  <div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
    <input type="checkbox" id="char-${a.id}" name="char-${a.id}" value="${a.id}" checked>
    <img src="${a.img}" style="width:24px;height:24px;object-fit:cover;border-radius:3px;border:1px solid #30363d;">
    <label for="char-${a.id}" style="cursor:pointer;font-size:13px;">${a.name}</label>
  </div>
`).join("");

const result = await foundry.applications.api.DialogV2.wait({
  window: { title: "Award Karma — SR2E" },
  content: `
    <form>
      <p style="margin:0 0 8px;font-size:12px;color:#a0a0a0;">
        Select which characters receive karma, then enter the amount.
        Good Karma (available to spend) and Total Earned both increase.
      </p>
      <div style="max-height:220px;overflow-y:auto;
                  border:1px solid #30363d;border-radius:4px;
                  padding:8px 10px;margin-bottom:12px;
                  background:#161b22;">
        ${charRows}
      </div>
      <div class="form-group" style="align-items:center;gap:10px;">
        <label style="font-size:13px;white-space:nowrap;">Karma to Award:</label>
        <input type="number" name="amount" value="1" min="1" max="100" autofocus
               style="width:70px;text-align:center;font-size:14px;font-weight:bold;">
      </div>
    </form>
  `,
  buttons: [
    {
      action: "award",
      label: "Award Karma",
      default: true,
      callback: (event, button) => {
        const amount = parseInt(button.form.elements.amount.value) || 0;
        if (amount <= 0) return null;
        const selected = characters
          .filter(a => button.form.elements[`char-${a.id}`]?.checked)
          .map(a => a.id);
        return { amount, selected };
      }
    },
    {
      action: "cancel",
      label: "Cancel",
      callback: () => null
    }
  ],
  close: () => null
});

if (!result || !result.selected?.length) return;

const { amount, selected } = result;
const awarded = [];

for (const id of selected) {
  const actor = game.actors.get(id);
  if (!actor) continue;
  const current = actor.system.karma?.current ?? 0;
  const total   = actor.system.karma?.total   ?? 0;
  await actor.update({
    "system.karma.current": current + amount,
    "system.karma.total":   total   + amount
  });
  awarded.push(actor.name);
}

if (!awarded.length) return;

const nameList = awarded.map(n => `<strong>${n}</strong>`).join(", ");
await ChatMessage.create({
  content: `
    <div style="border-left:3px solid #d29922;padding-left:8px;margin:4px 0;">
      <h3 style="margin:0 0 4px;color:#d29922;">Karma Awarded</h3>
      <p style="margin:0;">
        ${nameList}
        ${awarded.length === 1 ? "has" : "have"} each received
        <strong style="color:#d29922;">${amount} Good Karma</strong>.
      </p>
    </div>
  `,
  speaker: { alias: "GM" }
});

ui.notifications.info(`Awarded ${amount} karma to: ${awarded.join(", ")}`);
