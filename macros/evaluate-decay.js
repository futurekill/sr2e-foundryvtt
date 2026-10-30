/**
 * SR2E — End of run: Evaluate decays (GM Macro, VR2.0 p.97)
 *
 * Rolls 1D6 ÷ 2 (round up) once and takes it off every evaluate program in the
 * world, in play or not. The chat card keeps the roll; its Resume button finishes
 * an interrupted run end without rerolling. Deckers buy points back with Karma
 * from the program's row on their Matrix tab.
 */
if (!game.sr2e?.degradeEvaluate) return ui.notifications.error("This macro needs SR2E 0.128.0 or later.");
return game.sr2e.degradeEvaluate();
