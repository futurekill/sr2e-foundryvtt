# Review log: changes released without review (0.157.1, 0.158.0)

Tracers, elemental release, smoke radius, removal of Launch Weapons / Pilot / Subsonic. Reviewed after release at the
user's prompt (2026-11-16).

## Round 1 — Codex (v0.157.0..v0.158.0 + FoF v0.4.0..v0.4.1; gpt-6-sol, high; 1.17M input): REVISE, 4 findings

**Findings**

- **Existing skill ratings are silently stranded.** The [0.158.0 migration](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/migrations.mjs:711) changes weapon skill fields, but leaves characters’ existing *Launch Weapons* and *Pilot* skill items untouched. A character with Launch Weapons 6 now defaults when firing their migrated launcher; Pilot no longer matches the new vehicle defaults. A vehicle explicitly set to `system.skill: "pilot"` also keeps that override. **Fix:** migrate or report these source values for GM reconciliation before stamping 0.158.0, and test an actor carrying both legacy skills.

- **The new vehicle names bypass Skill Web defaulting.** `_vehicleSkill` accepts *Winged Plane*, *Rotor Craft*, and *Vectored Thrust*, but [_webDefaultByKey](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1321) cannot resolve their `winged`, `rotor`, or `vectorThrust` keys to web nodes; [webNodeForLabel](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2179) also cannot use the new names as related skills. An untrained aircraft driver therefore loses a valid related-skill default and falls back to Reaction +4. **Fix:** use the vehicle alias mapping for both Skill Web target and owned-skill lookup, with a driving-roll test.

- **Caster deletion can race elemental deletion.** The [deleteActor hook](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2205) starts `detachElementalHolder` without awaiting it. Immediately deleting the elemental after `await caster.delete()` can hit the [preDeleteActor veto](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2191) while the old sustain link remains; the added test waits for that link to clear. **Fix:** await release in the caster’s document deletion flow and test immediate sequential deletion.

- **Point aiming still previews a zero-metre smoke cloud.** The sheet action uses [blastRadius](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:1864) for a `0M` smoke grenade, while resolution places a 10 m cloud. A player aiming at a point sees no affected area. **Fix:** use `smokeCloudRadius` in that preview and test the point-aim path.

VERDICT: REVISE

### Claude's response (commit 061e4b80) — all 4 taken
1 Characters' Launch Weapons / Pilot items are REPORTED on every GM load (which skill a rating stood for is the GM's call,
so nothing is converted); vehicles with skill "pilot" migrate to the type default. 2 webNodeForLabel and _webDefaultByKey
resolve vehicle skills by any book name / node key. 3 The preDeleteActor veto ignores a hold on a spell that no longer
exists (synchronous; the Quench test now deletes immediately). 4 The point-aim preview uses smokeCloudRadius.
Quench (r2-advanced, vehicle-chase, elemental-aid, vehicle-play, vehicle-r2) 92/92.

## Round 2 — Codex (fix-only, 061e4b80; gpt-6-sol, medium; 238K input): REVISE, 1 finding

- **The vehicle migration misses worlds already stamped `0.158.0`.** The fix adds the `pilot` check to the existing `0.158.0` migration in [migrations.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/migrations.mjs:721), but `pendingMigrations` selects only versions newer than the world’s stamp. A world that ran the released `0.158.0` migration keeps a vehicle’s `system.skill: "pilot"`, so its driving skill remains invalid. **Fix:** put the value guarded vehicle repair in a new, higher version migration.

The other changed paths showed no material regression within this review’s scope.

VERDICT: REVISE

### Claude's response (commit a2c27fc8) — taken
The vehicle repair moved to its own 0.158.1 migration (system 0.158.1), so worlds stamped 0.158.0 run it; test updated.

## Round 3 — Codex (fix-only, a2c27fc8; gpt-6-sol, medium; 125K input): APPROVED

No material findings in a2c27fc8. The `0.158.1` migration is selected for worlds stamped `0.158.0`; its value check clears only a vehicle’s `skill: "pilot"`, allowing the vehicle type default to apply.

I could not run the targeted test: Vitest tried to write a temporary config file, which the read-only workspace blocked.

VERDICT: APPROVED
