/**
 * SR2E — Refresh Karma Pool (GM Macro)
 *
 * Returns every player character's Karma Pool for the next encounter
 * (SR2E p.191: "The full value of the Karma Pool returns with the next
 * encounter").
 *
 * The pool is DERIVED — capacity is one-tenth of Career Karma, ROUND UP, less
 * anything permanently expended. So refreshing is not a matter of computing a
 * value and writing it: it just clears the two temporary counters.
 *
 *   system.karma.spent  — points used this encounter
 *   system.karma.drawn  — Team Karma held this encounter (unused loans lapse)
 *
 * `system.karma.burned` is deliberately untouched. p.191: Karma spent buying
 * successes is "gone (pffft!) forever… They do not refresh with the pool in the
 * next scene." That is why a refresh cannot hand those points back.
 *
 * This macro previously computed the pool itself as `floor(total / 10)` with a
 * minimum of 1 — rounded the wrong way, and invented a floor the rule does not
 * have. The system now owns the arithmetic.
 *
 * Also available on any actor via the standard pool refresh, which clears the
 * Karma Pool alongside Combat/Magic/Control/Hacking.
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

const rows = characters
  .map(a => {
    const k = a.system.karma ?? {};
    return {
      actor: a,
      from: k.pool ?? 0,
      to: k.poolMax ?? 0,                        // capacity, once spent/drawn clear
      burned: k.burned ?? 0,
      dirty: (k.spent ?? 0) !== 0 || (k.drawn ?? 0) !== 0
    };
  });

const listHtml = rows.map(r =>
  `<li style="display:flex;justify-content:space-between;gap:12px;${r.dirty ? "" : "opacity:.5;"}">
     <span>${foundry.utils.escapeHTML(r.actor.name)}${
       r.burned ? ` <em style="font-size:11px;color:#c98;">${r.burned} burned</em>` : ""}</span>
     <span>${r.from} &rarr; <strong>${r.to}</strong></span>
   </li>`).join("");

const confirmed = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Refresh Karma Pool — SR2E" },
  content: `
    <p style="margin:0 0 8px;font-size:12px;color:#a0a0a0;">
      Return each character's Karma Pool for the next encounter (SR2E p.191).
      Capacity is Career Karma &divide; 10, <strong>rounded up</strong>, less any
      Karma permanently spent buying successes &mdash; which does not come back.
      Unused Team Karma loans lapse.
    </p>
    <ul style="list-style:none;margin:0;padding:0;font-size:13px;">${listHtml}</ul>`,
  rejectClose: false
});

if (!confirmed) return;

await Promise.all(rows.map(r => r.actor.update({
  "system.karma.spent": 0,
  "system.karma.drawn": 0
})));

ChatMessage.create({
  speaker: { alias: "SR2E" },
  content: `<div><strong>Karma Pools refreshed</strong>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;">${
      rows.map(r => `<li>${foundry.utils.escapeHTML(r.actor.name)}: ${r.to}</li>`).join("")
    }</ul></div>`
});
