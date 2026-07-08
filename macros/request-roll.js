/**
 * SR2E — Request a Skill Roll (GM Macro)
 *
 * The GM picks a skill and target number and posts a card to the table. Each
 * player clicks the card and THEIR OWN character rolls that skill — trained if
 * they have it, otherwise defaulted through the Skill Web (SR2E p.69). No need
 * to open anyone's sheet.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can request a roll.");
}

// Every rollable skill name: the Skill Web's skill nodes (canonical labels,
// including knowledge/vehicle skills) plus any activeSkills not on the web.
const names = new Set();
for (const n of Object.values(CONFIG.SR2E?.skillWeb?.nodes ?? {})) {
  if (n.type === "skill") names.add(n.label);
}
for (const k of Object.keys(CONFIG.SR2E?.activeSkills ?? {})) {
  names.add(k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
}
const sorted = [...names].sort((a, b) => a.localeCompare(b));
const opts = sorted.map((s) => `<option value="${foundry.utils.escapeHTML(s)}">${foundry.utils.escapeHTML(s)}</option>`).join("");

let result = null;
const action = await foundry.applications.api.DialogV2.wait({
  window: { title: "Request a Skill Roll" },
  rejectClose: false,
  content: `
    <form>
      <div class="form-group">
        <label>Skill:</label>
        <select name="skill" autofocus>${opts}</select>
      </div>
      <div class="form-group">
        <label>Target Number:</label>
        <input type="number" name="tn" value="4" min="2" max="30">
      </div>
      <p style="font-size:10px;color:#888;margin:4px 0 0;">Posts a card the players click; each rolls with their own character (trained or defaulted via the Skill Web).</p>
    </form>`,
  buttons: [
    {
      action: "request", label: "Request", default: true,
      callback: (event, button) => {
        result = { skill: button.form.elements.skill.value, tn: parseInt(button.form.elements.tn.value) || 4 };
      }
    },
    { action: "cancel", label: "Cancel" }
  ]
});

if (action !== "request" || !result) return;

await ChatMessage.create({
  speaker: { alias: "Gamemaster" },
  content: `<div class="sr2e-skill-request">
    <strong>🎲 Roll requested: ${foundry.utils.escapeHTML(result.skill)}</strong> — TN ${result.tn}
    <br><em>Roll it with your character (trained, or defaulted via the Skill Web).</em>
    <br><button type="button" class="sr2e-skill-request-btn" data-skill="${foundry.utils.escapeHTML(result.skill)}" data-tn="${result.tn}">Roll ${foundry.utils.escapeHTML(result.skill)}</button>
  </div>`
});
