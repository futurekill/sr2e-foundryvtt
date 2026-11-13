# Plan Review Log: ranged multiple targets
Started 2026-09-24 23:15 EDT. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. Concrete findings, with a one-line fix each:

1. **Walking fire has no declared-round budget.** Subtracting waste only from the magazine permits a declared 10-round FA attack to spend 13 rounds across a 3 m transition; successive target rolls also receive fresh 3–10-round allocations ([item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:680)).
   **Fix:** Represent one FA action with a shared declared-round budget, allocating both walking rounds and target bursts from it.

2. **Waste must affect this attack’s recoil, not merely the stored counter.** The existing calculation consumes `shotsFired` and effective burst rounds before the counter update; adding waste only afterward understates the current TN, including heavy-weapon doubling and gyro effects.
   **Fix:** Calculate recoil using `shotsFired + wasted` and effective target rounds, while applying damage bonuses only to target rounds.

3. **Short-burst handling needs explicit zero/one/two-round cases.** `burstFired` clamps available rounds to at least one, so calling it with zero after walking invents ammunition; one remaining round also changes `isBurst` ([sr2e-rules.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:335)).
   **Fix:** Reject exhausted budgets before calling `burstFired`, keep preflight mutation-free, and test zero/one/two remaining rounds for ammo, recoil, and damage.

4. **Called-shot validation could regress during effective-mode handling.** Existing validation rejects declared FA before mutations; an FA attack reduced to one target round must not become called-shot eligible ([item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:435)).
   **Fix:** Preserve declared-mode validation before walking calculations or spending, with a direct-macro regression test.

5. **An untouched dialog field overrides fresh state.** Every dialog sends its prefetched count, so another attack, target change, or phase reset while it remains open makes the dialog disagree with a macro.
   **Fix:** Send an override only when explicitly edited; otherwise recompute history, target, walking cost, and ammo in `item.roll`.

6. **The proposed preview remains numerically wrong.** `currentRecoil()` uses the whole magazine and cached `liveShotsFired`; adding a walking label and multiple-target term does not account for walking-induced short bursts ([sheet-actions.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:830)).
   **Fix:** Share one pure attack calculation between preview and execution, and refresh the dialog’s count and recoil after reset.

7. **Concurrent rolls lose history and overspend ammunition.** Two rolls can read the same history and ammo, calculate identical penalties, then overwrite each other’s append; a phase reset can likewise be overwritten by an old roll.
   **Fix:** Serialize attack commits and resets through one authority, snapshot the target before awaiting, and reject stale phase generations.

8. **Existing reset hooks are insufficient.** `_resetCombatRecoil` skips actors with zero recoil; custom `nextTurn()` can advance initiative while retaining the same numeric turn index, and combat deletion currently refreshes only pools ([sr2e.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1149), [combat.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/combat.mjs:80)).
   **Fix:** Introduce an explicit phase generation advanced by combat lifecycle methods and manual reset, and invalidate history independently of recoil being positive.

9. **Vehicle ownership is factually misidentified.** The roll uses `options.gunner ?? this.parent`, and both mounted-weapon dialogs use the gunner; vehicle-scoped history would disagree with recoil/reset state and mix different gunners’ targets ([item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:414)).
   **Fix:** Store engagement history on the resolved gunner and keep weapon ammunition on the vehicle.

10. **Permission failures can occur after the roll.** Owning a gunner does not establish permission to update a linked vehicle; the linked-vehicle handler does not check that permission, and vehicle flag writes would add another failing mutation.
    **Fix:** Preflight permission for every affected document before rolling, using an authorized GM execution path when necessary, and test as a non-GM player.

11. **Blanket spread exclusion loses ordinary target changes.** Firing a shotgun spread at A and then B bypasses the proposed modifier entirely, although the spread path already supports burst recoil and damage ([item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:936)).
    **Fix:** Track the deliberately aimed target for eligible spread attacks, without counting incidental cone victims as separately engaged targets.

12. **Walking history lacks weapon/action identity.** SA at A followed by FA from another weapon at B currently satisfies the proposed walking predicate solely because A was the previous target that phase.
    **Fix:** Separate phase-wide engagement history from the previous target within a particular FA action.

13. **Distance failure cases are unspecified.** The shown record omits its promised scene ID; cross-scene pixel coordinates are incomparable, and tokenless attacks have a count override but no walking-distance override.
    **Fix:** Store scene identity explicitly, validate finite same-scene measurements and units, and provide a manual walking-distance input when automatic measurement is unavailable.

14. **Numeric sanitization is inadequate.** Clamping to ≥0 still permits `Infinity` and fractional counts, while `NaN` can poison the TN; the same issue applies to computed walking rounds.
    **Fix:** Validate finite numbers and normalize counts and rounds to nonnegative integers inside the roll path.

A simpler implementation is a bounded phase record containing unique target IDs plus separate FA-action state, consumed by a shared preview/execution calculator; an ever-growing append log is unnecessary.

VERDICT: REVISE
### Claude's response
Rejected #1: p.93 declares rounds per target, and the Wedge example has three separate bursts, so nothing caps the sum. Accepted #2 through #6, #8, #9 and #11 through #14. #7 is handled with a phase key instead of locks. #10 is moot: the record moves to the gunner, whom the player owns. #8 exposed a recoil-reset bug that predates this work (same combatant stays on top), and it is fixed by the phaseSeq bump.

## Round 2 — Codex
I withdraw the shared FA-budget objection given the verified per-target declaration and Wedge example. The revised recoil, short-burst, called-shot, and spread handling address those concerns. Remaining flaws:

1. **Phase keys do not make reset races harmless.** An old roll can overwrite a newer record; re-reading and adopting the new key would instead misattribute the old attack. The unkeyed recoil update can still restore old recoil after reset.
   **Fix:** Capture the phase generation before rolling and serialize generation-checked recoil/history commits with resets.

2. **Manual reset does not change identity.** Unsetting the record leaves the same phase key, so an in-flight attack can immediately recreate valid history; manual tracker edits and `previousTurn()` likewise lack a sequence bump.
   **Fix:** Advance a reset generation on every reset/rewind path and include it in the record identity.

3. **Delayed resets can erase new-phase attacks.** Running resets after the sequence update, while retaining turn/round hooks, allows overlapping resets; a late reset can delete a record already written under the new key.
   **Fix:** Use one authoritative boundary handler and make cleanup conditional on the outgoing generation.

4. **Concurrent attacks remain functionally incorrect, even if recoil already has that bug.** Two attacks at A and B can both receive +0 and leave only one target recorded; accepting existing recoil races does not satisfy automatic target tracking.
   **Fix:** Add an attacker-scoped execution queue, with one authority for attacks issued from multiple clients.

5. **Missing walking distance silently becomes free walking for macros.** `round(null)` is zero, and the plan specifies prompting only in the dialog; a cross-scene or tokenless direct roll can evade the cost.
   **Fix:** Distinguish “no walking required” from “walking distance unknown” and refuse the latter without a finite explicit override.

6. **The ammunition precheck drops the existing tracking guard.** The current code checks ammunition only when `ammo.max > 0` and the weapon is not thrown; unconditional `ammo.current − walked ≥ 1` rejects weapons configured without ammunition tracking ([item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:683)).
   **Fix:** Preserve that guard and use unlimited availability for untracked ammunition while still counting walking recoil.

7. **An excluded attack can leave stale `lastFA`.** FA at A, then a blast or melee attack, then FA at B retains the first FA target if record maintenance occurs only inside the proposed eligible branch.
   **Fix:** Define interruption semantics explicitly and clear walking continuity outside the eligibility branch whenever an intervening attack should break it.

8. **Vehicle identity is fixed, but permissions remain unresolved.** The linked-vehicle handler permits reaching the roll without checking vehicle update permission; owning the gunner does not guarantee ammunition can be spent, leaving a posted roll and partially updated state ([sheet-actions.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3426)).
   **Fix:** Check gunner and weapon update permissions before rolling and test the refusal path as a non-GM player.

9. **A gunner outside the tracker never advances beyond `"free"`.** A vehicle can be a combatant while its gunner is not, so the new gunner-scoped history and recoil persist across vehicle phases.
   **Fix:** Resolve mounted attacks’ phase from the participating vehicle when necessary and include their gunners in boundary handling.

10. **Unknown targets have undefined identity semantics.** With `targetUuid = null`, every recorded target differs from the current target; appending null also creates a fictitious shared identity for all tokenless attacks.
    **Fix:** Never store null target IDs and require explicit counts for unknown targets, with separately defined walking continuity.

A simpler state model would put recoil and engagement history under the same generation and update them together; the current keyed-history/unkeyed-recoil split preserves much of the reset complexity.

VERDICT: REVISE
### Claude's response
Accepted #1 through #7, #9 and #10, as follows. The key is captured before the roll and records are written under it. A per-actor resetSeq is part of the key, and previousTurn bumps it too. History is never deleted by resets. There is a per-gunner client queue. walkUnknown is refused. The ammo guard is kept. lastFA is cleared by any other engagement. The vehicle combatant is the fallback. Null targets are never stored. #8 (vehicle ammo permission) and late recoil-hook resets both predate this work; they are recorded as risks and left out of scope.

## Round 3 — Codex
Remaining concrete gaps:

1. **Manual tracker edits retain valid old history.** The retained hooks reset only recoil; manual turn/round edits do not bump `phaseSeq`, so the engagement key remains unchanged.
   **Fix:** Advance phase identity for manual tracker changes, suppressing duplicate bumps for changes already made by combat methods.

2. **The queue’s entry point is ambiguous.** “From the dialog’s confirm” does not guarantee direct `item.roll()` calls are queued, and reading `game.user.targets` after waiting can turn queued attacks at A and B into two attacks at B.
   **Fix:** Queue inside the weapon roll entry point, capture target identity/position and phase at invocation, and read ammo/history when execution starts.

3. **The captured key protects history, but not recoil.** A roll spanning a phase boundary still writes its old `shotsFired + walked + fired.rounds` into the new phase’s unkeyed counter ([item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:835)).
   **Fix:** Associate recoil with the same generation and ignore stale-generation recoil commits while still accounting for ammunition actually fired.

4. **Vehicle fallback fixes history expiry but misses recoil reset.** `_resetCombatRecoil` visits combatants’ actors only; a gunner absent from the tracker retains recoil even though their vehicle-derived engagement key advances ([sr2e.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1149)).
   **Fix:** Derive effective recoil from generation-keyed gunner state, or explicitly include participating gunners in resets.

5. **Tokenless bursts break walking continuity.** FA at A → tokenless FA → FA at B either leaves A as `lastFA` or requires clearing it; the first measures from the wrong target, while the second permits free walking. A first tokenless burst also leaves no basis for applying a later override.
   **Fix:** Track the previous FA burst separately from known target IDs, allowing an unknown endpoint that requires an explicit walking override.

6. **Unknown-current-target counting is still unspecified.** “No token target is recorded” prevents storing null, but the calculator still counts every known ID as different from null—even when firing again at the same target without selecting its token.
   **Fix:** For an unknown current target, use an explicit prior-target override or a documented manual fallback rather than inferring distinctness.

7. **Walking overrides can become stale independently of counts.** An edited distance survives another attack, a changed target, or a manual reset while the dialog remains open; execution recomputes history but applies the old distance to a different transition.
   **Fix:** Bind distance overrides to phase, weapon, previous target, and current target, invalidating them when that context changes.

8. **Weapon IDs are not globally unique.** A gunner can fire mounted weapons from different actors whose embedded items share an ID, falsely satisfying “same weapon.”
   **Fix:** Store and compare the weapon’s document UUID.

The tests also need to exercise these boundaries: queued macro calls, an attack crossing reset, manual tracker edits, a vehicle-only combatant, and tokenless FA transitions. The current test asserting that the record is “cleared” contradicts the new retained-but-stale design.

The shared FA-budget objection remains withdrawn. The explicitly deferred cross-client and vehicle-ammunition permission gaps are not the basis for this verdict.

VERDICT: REVISE
### Claude's response
Accepted all 8. The key now includes round, turn, phaseSeq and resetSeq. Recoil is generation-keyed (effective recoil is 0 on a stale key), which covers #3 and #4. The queue lives in item.roll, capturing at invocation. lastFA can carry a null endpoint, which makes walking unknown. No target means an automatic count of 0 plus a hint. Walk overrides are bound to their context. Weapons are compared by UUID. The tests are updated.

## Round 4 — Codex
The revision closes most earlier gaps, but these remain:

1. **The commit instructions contradict each other.** Approach 1 requires recoil and engagement state in the same actor update; Approach 4 still specifies a separate `setFlag`. Separate writes can expose new recoil under an old key or vice versa.
   **Fix:** Replace both existing recoil persistence and the proposed `setFlag` with one `actor.update` containing recoil and the complete engagement record.

2. **Manual tracker keys can repeat.** Turn 0 → manually select turn 1 → manually return to turn 0 recreates the original key if no attack intervenes; retained target history becomes valid again.
   **Fix:** Increment a monotonic generation for manual tracker transitions instead of relying on round/turn values for uniqueness.

3. **Late recoil resets are not harmless.** A delayed hook can erase recoil from a completed new-phase attack while leaving its matching engagement key intact; the next burst receives an incorrectly reduced TN. Adding direct resets alongside existing hooks also creates additional reset calls.
   **Fix:** Make generation-keyed recoil authoritative and remove redundant automatic zeroing, or serialize generation-checked resets with attack commits.

4. **Tokenless persistence remains contradictory.** Approach 2 says a tokenless attack is “not recorded,” while later walking requires a persisted `lastFA` with a null endpoint; Approach 4 does not explicitly require that write.
   **Fix:** State that tokenless attacks omit only `targets` membership but still persist the key, recoil, and `lastFA` endpoint.

5. **Two consecutive tokenless bursts can bypass walking validation.** The walking predicate requires a “different” target, but both UUIDs are null; the later unknown-endpoint clause must override that equality check.
   **Fix:** Treat either missing endpoint as unknown continuity requiring an override, and test tokenless FA → tokenless FA explicitly.

6. **The concurrency contract still contradicts itself.** Approach 4 guarantees a per-gunner queue, but Key decisions explicitly accepts concurrent same-client reads of the same record.
   **Fix:** Remove the obsolete exception and specify that the queue covers calculation through the awaited ammo/recoil/history commits, recovering after rejected operations.

The simpler consistent design is generation-keyed recoil/history committed together, with automatic phase changes invalidating state rather than asynchronously clearing it.

VERDICT: REVISE
### Claude's response
Accepted all 6. Recoil and the record are one update. phaseSeq is monotonic, and a hook bumps it on manual edits. The automatic zeroing hooks are removed; invalidation happens by key, and sheets re-render. A tokenless attack still writes the key, recoil and lastFA. A missing endpoint means continuity is unknown. The obsolete concurrency exception is removed, and the queue is released in finally.

## Round 5 — Codex
One material problem remains:

- **Manual phase changes still have a race.** The `updateCombat` hook bumps `phaseSeq` in a second update. Between the tracker change and that update, an attack can capture the previous phase’s key, apply its recoil/history, and then have its newly committed state invalidated. The per-gunner queue does not serialize combat updates.
  **Fix:** Inject the generation increment into the original manual combat update, before persistence, and test an attack immediately following a manual tracker change.

The other previously flagged material issues are addressed within the plan’s stated scope.

VERDICT: REVISE
### Claude's response
Accepted. phaseSeq is now injected in preUpdateCombat, in the same write, with a test added. MAX_ROUNDS was reached with this single point outstanding; it is applied exactly as Codex proposed, and Codex marked every other issue as addressed. Proceeding to build.
