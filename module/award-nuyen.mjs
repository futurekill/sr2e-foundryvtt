// The Award Nuyen dialog (both GM macros open it). One total, split evenly as you
// type; type a runner's amount to fix it and the others share the rest. Whatever
// isn't handed out goes to the communal pot. Paid through payAwards (money.mjs).
import { splitAward } from "./rules/sr2e-rules.mjs";
import { payAwards } from "./money.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const yen = (n) => `${Number(n).toLocaleString()}¥`;

/** Who the dialog lists, and who starts ticked: the selected characters, else the players' own characters, else everyone listed. */
function recipients() {
  const selected = new Set((canvas.tokens?.controlled ?? []).map(t => t.actor).filter(a => a?.type === "character").map(a => a.id));
  const assigned = new Set(game.users.filter(u => !u.isGM && u.character).map(u => u.character.id));
  const list = game.actors.filter(a => a.type === "character" && (a.hasPlayerOwner || selected.has(a.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ticked = selected.size ? selected : assigned.size ? assigned : new Set(list.map(a => a.id));
  return list.map(a => ({ actor: a, checked: ticked.has(a.id) }));
}

/** Read the form: the pool, the ticked ids and the amounts the GM typed. */
function readForm(form, pot) {
  const pool = Math.max(0, parseInt(form.elements.total.value) || 0) + (form.elements.includePot?.checked ? pot : 0);
  const ids = [], pinned = {};
  for (const row of form.querySelectorAll(".sr2e-award-row")) {
    if (!row.querySelector("input[type=checkbox]").checked) continue;
    ids.push(row.dataset.id);
    const amt = row.querySelector("input.amount");
    if (amt.dataset.pinned) pinned[row.dataset.id] = amt.value;
  }
  return { pool, ids, pinned, includePot: !!form.elements.includePot?.checked };
}

export async function awardNuyenDialog() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can award nuyen.");
  const rows = recipients();
  if (!rows.length) return ui.notifications.warn("No player characters in this world.");
  const pot = game.settings.get("sr2e", "communalNuyen");

  const rowHtml = rows.map(({ actor: a, checked }) => `
    <div class="sr2e-award-row" data-id="${a.id}" style="display:flex;align-items:center;gap:8px;margin:3px 0;">
      <input type="checkbox" id="award-${a.id}" ${checked ? "checked" : ""} style="flex:0 0 auto;">
      <img src="${esc(a.img)}" alt="" style="width:24px;height:24px;object-fit:cover;border:0;">
      <label for="award-${a.id}" style="flex:1;">${esc(a.name)} <span class="hint">has ${yen(a.system.nuyen ?? 0)}</span></label>
      <input type="number" class="amount" min="0" step="1" aria-label="${esc(a.name)}'s share" style="flex:0 0 90px;">
      <button type="button" class="unpin" title="Back to an even share" aria-label="Back to an even share" style="flex:0 0 26px;visibility:hidden;"><i class="fas fa-rotate-left"></i></button>
    </div>`).join("");

  let result = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Award Nuyen" },
    position: { width: 440 },
    rejectClose: false,
    content: `
      <div class="form-group"><label>Payout</label>
        <input type="number" name="total" value="0" min="0" step="1" autofocus></div>
      ${pot > 0 ? `<div class="form-group"><label>Add the communal pot (${yen(pot)})</label>
        <input type="checkbox" name="includePot"></div>` : ""}
      <p class="hint" style="margin:4px 0;">Split evenly. Type an amount to set someone's share; the others split the rest.</p>
      ${rowHtml}
      <p class="sr2e-award-summary" style="margin:8px 0 0;font-weight:bold;"></p>`,
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      const pay = dialog.element.querySelector('button[data-action="pay"]');
      const refresh = () => {
        const { pool, ids, pinned } = readForm(form, pot);
        const r = splitAward(pool, ids, pinned);
        for (const row of form.querySelectorAll(".sr2e-award-row")) {
          const on = row.querySelector("input[type=checkbox]").checked;
          const amt = row.querySelector("input.amount");
          amt.disabled = !on;
          if (!on) { amt.value = ""; delete amt.dataset.pinned; }
          else if (!amt.dataset.pinned) amt.value = r.awards[row.dataset.id];
          row.querySelector(".unpin").style.visibility = on && amt.dataset.pinned ? "visible" : "hidden";
        }
        const sum = form.querySelector(".sr2e-award-summary");
        sum.textContent = !r.ok ? r.error
          : !ids.length ? "Tick at least one runner."
          : `Paying ${yen(r.awarded)}${r.leftover ? ` · ${yen(r.leftover)} to the communal pot` : ""}`;
        sum.style.color = r.ok ? "" : "var(--color-level-error, #c33)";
        pay.disabled = !r.ok || !ids.length || pool <= 0;
      };
      form.addEventListener("input", (ev) => {
        const t = ev.target;
        if (t.classList.contains("amount")) {
          if (t.value === "") delete t.dataset.pinned; else t.dataset.pinned = "1";
        }
        refresh();
      });
      form.addEventListener("change", refresh);
      form.addEventListener("click", (ev) => {
        const b = ev.target.closest(".unpin");
        if (!b) return;
        delete b.closest(".sr2e-award-row").querySelector("input.amount").dataset.pinned;
        refresh();
      });
      refresh();
    },
    buttons: [
      { action: "pay", label: "Pay Out", icon: "fas fa-coins", default: true,
        callback: (e, b) => { result = readForm(b.form, pot); } },
      { action: "cancel", label: "Cancel" }
    ]
  });
  if (!result) return;

  const r = splitAward(result.pool, result.ids, result.pinned);
  if (!r.ok) return ui.notifications.warn(r.error);
  if (result.pool <= 0) return ui.notifications.warn("Nothing to award.");
  const newPot = (result.includePot ? 0 : pot) + r.leftover;
  // The pot is written first and each credit is checked: a failed share goes back to the
  // pot, and a pot that changed while the dialog was open refuses the whole payout.
  const payout = await payAwards({ quotedPot: pot, newPot, awards: r.awards });
  if (!payout.ok) return ui.notifications.warn(`Nothing awarded: ${payout.why}.`);

  const name = (id) => esc(game.actors.get(id)?.name);
  const lines = result.ids.filter(id => payout.paid.includes(id) && r.awards[id] > 0)
    .map(id => `<li><strong>${name(id)}</strong> — ${yen(r.awards[id])}</li>`).join("");
  const failed = payout.failed.map(name).filter(Boolean);
  const finalPot = game.settings.get("sr2e", "communalNuyen");
  await ChatMessage.create({
    speaker: { alias: "Mr. Johnson" },
    content: `<div class="sr2e-award">
      <strong>Payday</strong>${result.includePot && pot > 0 ? ` (including ${yen(pot)} from the communal pot)` : ""}
      <ul style="margin:4px 0 4px 16px;padding:0;">${lines}</ul>
      ${finalPot !== pot ? `<em>Communal pot: ${yen(finalPot)}.</em>` : ""}
      ${failed.length ? `<br><strong>Not paid (returned to the pot):</strong> ${failed.join(", ")}.` : ""}
    </div>`
  });
}
