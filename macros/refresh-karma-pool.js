/**
 * SR2E — Refresh Karma Pool (GM Macro)
 *
 * Restores every player character's Karma Pool to its full value at the start
 * of a session/encounter. In SR2E one-tenth of a character's Career (Total)
 * Karma goes into their Karma Pool (p.246), so "full" = Total ÷ 10, rounded
 * down, with a minimum of 1. The pool also refreshes to full each encounter.
 *
 * Note: this restores the pool to its derived size and does not subtract Karma
 * Pool points a character has permanently contributed to a Team Karma Pool.
 *
 * GM only.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can refresh Karma Pools.");
}

const characters = game.actors
  .filter(a => a.type === "character")
  .sort((a, b) => a.name.localeCompare(b.name));

if (!characters.length) {
  return ui.notifications.warn("No character actors found in this world.");
}

const rows = characters.map(a => {
  const total = a.system.karma?.total ?? 0;
  return { actor: a, from: a.system.karma?.pool ?? 0, to: Math.max(1, Math.floor(total / 10)) };
});

const listHtml = rows.map(r =>
  `<li style="display:flex;justify-content:space-between;gap:12px;">
     <span>${r.actor.name}</span>
     <span>${r.from} → <strong>${r.to}</strong></span>
   </li>`).join("");

const confirmed = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Refresh Karma Pool — SR2E" },
  content: `
    <p style="margin:0 0 8px;font-size:12px;color:#a0a0a0;">
      Restore each character's Karma Pool to its full value (Career Karma ÷ 10,
      minimum 1).
    </p>
    <ul style="list-style:none;margin:0;padding:0;font-size:13px;">${listHtml}</ul>`,
  rejectClose: false
});

if (!confirmed) return;

await Promise.all(rows.map(r => r.actor.update({ "system.karma.pool": r.to })));

ChatMessage.create({
  speaker: { alias: "SR2E" },
  content: `<div><strong>Karma Pools refreshed</strong>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:13px;">${listHtml}</ul></div>`
});
