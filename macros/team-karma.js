/**
 * SR2E — Team Karma Pool (GM Macro)
 *
 * Lets the GM deposit (or withdraw, or set) an arbitrary amount of Karma in the
 * shared Team Karma Pool (SR2E p.246). Players contribute/draw from their own
 * Karma Pool via the buttons on their character sheet's Bio tab; this macro is
 * the GM's direct lever on the pool. Changes re-render open character sheets so
 * everyone sees the new total live.
 *
 * Only GMs can run this macro.
 */

if (!game.user.isGM) {
  return ui.notifications.warn("Only the GM can adjust the Team Karma Pool.");
}

const current = game.settings.get("sr2e", "teamKarma") ?? 0;

const result = await foundry.applications.api.DialogV2.wait({
  window: { title: "Team Karma Pool — SR2E" },
  rejectClose: false,
  content: `
    <form>
      <p style="margin:0 0 8px;">Current Team Karma Pool: <strong style="color:#d29922;">${current}</strong></p>
      <div class="form-group" style="align-items:center;gap:10px;">
        <label style="white-space:nowrap;">Amount:</label>
        <input type="number" name="amt" value="1" step="1" autofocus
               style="width:90px;text-align:center;font-size:14px;font-weight:bold;">
      </div>
      <p style="font-size:11px;color:#888;margin:8px 0 0;">
        <strong>Deposit</strong> adds to the pool (use a negative amount to withdraw);
        <strong>Set To</strong> replaces the total. The pool never drops below 0.
      </p>
    </form>`,
  buttons: [
    { action: "deposit", label: "Deposit", default: true,
      callback: (event, button) => ({ mode: "deposit", amt: Math.floor(Number(button.form.elements.amt.value) || 0) }) },
    { action: "set", label: "Set To",
      callback: (event, button) => ({ mode: "set", amt: Math.floor(Number(button.form.elements.amt.value) || 0) }) },
    { action: "cancel", label: "Cancel", callback: () => null }
  ],
  close: () => null
});

if (!result) return;

const next = result.mode === "set"
  ? Math.max(0, result.amt)
  : Math.max(0, current + result.amt);

await game.settings.set("sr2e", "teamKarma", next);

await ChatMessage.create({
  speaker: { alias: "Gamemaster" },
  content: `
    <div style="border-left:3px solid #d29922;padding-left:8px;margin:4px 0;">
      <h3 style="margin:0 0 4px;color:#d29922;">Team Karma Pool</h3>
      <p style="margin:0;">
        ${result.mode === "set" ? "Set to" : "Now"}
        <strong style="color:#d29922;">${next}</strong>
        ${result.mode === "deposit" ? `(${result.amt >= 0 ? "+" : ""}${result.amt})` : ""}.
      </p>
    </div>`
});

ui.notifications.info(`Team Karma Pool: ${next}`);
