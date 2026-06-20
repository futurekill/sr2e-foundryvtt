/**
 * SR2E — Reset Condition Monitors (GM Macro)
 *
 * Clears all Stun and Physical damage (and physical overflow) on the actors of
 * the currently selected tokens. Handy between scenes or after a long rest.
 *
 * GM only.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can reset condition monitors.");
}

const actors = canvas.tokens.controlled
  .map(t => t.actor)
  .filter(a => a && a.system?.conditionMonitor);

if (!actors.length) {
  return ui.notifications.warn("Select one or more tokens with a condition monitor first.");
}

const confirmed = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Reset Condition Monitors — SR2E" },
  content: `<p>Clear all Stun and Physical damage on
    <strong>${actors.length}</strong> selected token(s)?</p>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:#a0a0a0;">
      ${actors.map(a => `<li>${a.name}</li>`).join("")}
    </ul>`,
  rejectClose: false
});

if (!confirmed) return;

await Promise.all(actors.map(a => a.update({
  "system.conditionMonitor.stun.value": 0,
  "system.conditionMonitor.physical.value": 0,
  "system.conditionMonitor.overflow": 0
})));

ui.notifications.info(`Reset condition monitors on ${actors.length} actor(s).`);
