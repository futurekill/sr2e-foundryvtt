/**
 * SR2E — Request a Skill Roll (GM Macro)
 *
 * The GM picks a skill, a target number, and WHICH characters are being asked.
 * A card is posted with a roll button per requested character; the owning
 * player (or the GM) clicks it and that character rolls the skill — trained if
 * they have it, otherwise defaulted through the Skill Web (SR2E p.69). No need
 * to open anyone's sheet.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can request a roll.");
}

const characters = game.actors.filter((a) => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
if (!characters.length) {
  return ui.notifications.warn("No character actors found in this world.");
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
const opts = [...names].sort((a, b) => a.localeCompare(b))
  .map((s) => `<option value="${foundry.utils.escapeHTML(s)}">${foundry.utils.escapeHTML(s)}</option>`).join("");

const charRows = characters.map((a) => `
  <div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
    <input type="checkbox" id="char-${a.id}" name="char-${a.id}" value="${a.id}" checked>
    <img src="${a.img}" style="width:24px;height:24px;object-fit:cover;border-radius:3px;border:1px solid #30363d;">
    <label for="char-${a.id}" style="cursor:pointer;font-size:13px;">${foundry.utils.escapeHTML(a.name)}</label>
  </div>`).join("");

const result = await foundry.applications.api.DialogV2.wait({
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
      <hr>
      <p style="font-size:11px;color:#888;margin:0 0 4px;">Ask these characters:</p>
      ${charRows}
    </form>`,
  buttons: [
    {
      action: "request", label: "Request", default: true,
      callback: (event, button) => {
        const f = button.form.elements;
        return {
          skill: f.skill.value,
          tn: parseInt(f.tn.value) || 4,
          ids: characters.filter((a) => f[`char-${a.id}`]?.checked).map((a) => a.id)
        };
      }
    },
    { action: "cancel", label: "Cancel" }
  ]
});

if (!result || result === "cancel" || !result.ids?.length) return;

const skill = foundry.utils.escapeHTML(result.skill);
const rows = result.ids.map((id) => {
  const a = game.actors.get(id);
  return `<button type="button" class="sr2e-skill-request-btn" style="display:block;width:100%;margin:2px 0;text-align:left;"
    data-skill="${skill}" data-tn="${result.tn}" data-actor-uuid="${a.uuid}">
    🎲 ${foundry.utils.escapeHTML(a.name)} — roll ${skill}</button>`;
}).join("");

await ChatMessage.create({
  speaker: { alias: "Gamemaster" },
  content: `<div class="sr2e-skill-request">
    <strong>Roll requested: ${skill}</strong> — TN ${result.tn}
    <br><em>The listed character's owner (or the GM) rolls it — trained, or defaulted via the Skill Web.</em>
    <div style="margin-top:4px;">${rows}</div>
  </div>`
});
