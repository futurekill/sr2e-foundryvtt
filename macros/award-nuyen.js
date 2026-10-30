/**
 * SR2E — Award Nuyen (GM Macro)
 *
 * Opens the system's payout dialog: enter the payout and it splits evenly across
 * the ticked runners as you type. Type a runner's amount to fix their share; the
 * others split the rest. Anything not handed out goes to the communal pot, which
 * you can fold into a later payout. Selected tokens start ticked; with none
 * selected, the players' own characters do.
 *
 * Only GMs can run this macro.
 */
if (!game.sr2e?.awardNuyen) return ui.notifications.error("This macro needs SR2E 0.127.0 or later — update the system.");
return game.sr2e.awardNuyen();
