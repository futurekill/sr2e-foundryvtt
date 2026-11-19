# Code review log: vehicles bought at creation (S9, system side)
Codex gpt-6-sol, read-only. Branch chargen/s-prereqs: 30924db3 (round 1), b6288d05 (round 2).

## Round 1 — Codex (high)
- **P1 — [module/sheets/actor-sheet.mjs:556](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:556):** If a `preUpdateActor` hook vetoes the character update, `actor.update()` can resolve without throwing. The imported vehicle then remains in the world, unlinked and without a receipt. **Fix:** Treat a falsy update result as failure and delete the imported copy; add a Quench case that stubs a falsy result.

- **P2 — [module/sheets/actor-sheet.mjs:551](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:551):** Dropping an already-linked world vehicle and choosing Buy appends another receipt each time, charging Resources repeatedly for the same actor. **Fix:** Reject an already-linked world vehicle before offering Buy, with unlink and re-drop available to change its classification.

The unit test could not start under the read-only filesystem: Vitest attempted to write a temporary config file and received `EPERM`. No files were changed.

VERDICT: REVISE
### Response
Both fixed: a falsy update result is a failure (the import is deleted; Quench case); an already-linked vehicle is refused before the dialog (Quench case).

## Round 2 — Codex (medium, fix-only)
The veto fix is correct: a falsey `actor.update()` result now reaches the imported vehicle cleanup.

- [actor-sheet.mjs:551](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:551): **Duplicate Buy is still possible.** If two drops of the same world vehicle open dialogs before either purchase finishes, both pass the sheet’s early check. After the first Buy links it, the second `addVehicle(..., { buy: true })` bypasses this check and adds another receipt. Fix: change the condition to `if (!vehicleUuid || current.includes(vehicleUuid)) return false;`.

VERDICT: REVISE
### Response
Fixed as proposed: addVehicle refuses any already-linked vehicle. Stopped here (a one-line fix; lint and unit tests pass).
