# Plan Review Log: netguns
Started 2026-10-16. MAX_ROUNDS=5.

## Round 1 — Codex

The plan needs revisions at these integration points; the settled success thresholds are not disputed.

1. **Attack Karma synchronization is incomplete.** `reconcileDependentCard` only repairs creation-time races; later Karma updates use `_syncDependentCards`’ explicit renderer registry and resolved-card whitelist in `actor.mjs`, neither of which includes `netHit`. **Fix:** Register `netHit` in both, and add its renderer to the `resolves` hook in `sr2e.mjs`.

2. **Resistance and escape Karma can contradict token state.** `rollSuccessTest` creates a Karma-enabled test, but the plan immediately applies its initial successes without linking subsequent rerolls to the entanglement outcome. **Fix:** Persist the resistance/escape test ID and finalize its live total before committing the token state, or reconcile later Karma against the same entanglement instance.

3. **Projection copies a body’s net onto its astral form.** `astral-forms.mjs:formData` copies token flags and does not strip `net`; projecting while physically netted therefore creates a netted astral token. **Fix:** Remove `sr2e.net` from copied form data.

4. **Ending projection deletes an astrally netted form.** The existing reconciliation deletes the form when projection ends, allowing projection off/on to discard the restraint. **Fix:** Explicitly handle netted forms in projection transitions and reconciliation so ending projection cannot silently erase an active net.

5. **Target plane and token identity are unspecified.** Body and astral form share an actor; `resolveCardDefender` returns an actor and can fall back after a missing UUID, while `isOnAstralPlane` deliberately requires token flags. **Fix:** Resolve and retain the exact TokenDocument, validate its plane using `isOnAstralPlane`, and refuse missing recorded targets instead of falling back.

6. **Actor ownership is not a token-write preflight.** Copying the existing `actor.isOwner` button check does not verify that the actual token flag update can succeed; failure after rolling can leave spent pools and a resolved card without restraint. **Fix:** Check both actor and TokenDocument update permission before rolling, and publish resolution only after the required writes succeed.

7. **The proposed “once” guard is only client-local.** Existing handlers explicitly acknowledge that two clients can resolve during the same roll/apply window; GM and player can both resist, or HUD and card can both escape. **Fix:** Serialize resolution and escape claims through one authoritative writer, keyed by token and entanglement instance.

8. **Creation-time reconciliation can reopen a resolved card.** `reconcileDependentCard` checks only `st.resolved`, not outcome markers, and writes a whole state snapshot that can race the author-side close hook. **Fix:** Make net reconciliation honor `isCardResolved` and serialize its updates with resolution commits.

9. **Movement enforcement can be bypassed by existing early returns.** `preMoveToken` skips non-tactical movement and uncapped tokens, and direct coordinate updates have a separate `preUpdateToken` path. **Fix:** Check net restraint before those skips in both paths, allowing `sr2eBypassMovement` only for a GM.

10. **The visual status is actor-wide and lacks provenance.** Linked body/form tokens share actor effects, and clearing `restrain` can remove an unrelated restraint; unlinked tokens require their synthetic actor rather than the world actor. **Fix:** Prefer a token-local visual, or manage a net-specific effect on the exact token’s actor and remove only that effect.

11. **A second net overwrites the first, and old cards can clear newer nets.** The single `flags.sr2e.net` record has no instance identifier or originating card ID. **Fix:** Define repeated-hit handling and assign each restraint an ID that every escape commit must match.

12. **Round bookkeeping breaks across combat transitions.** A bare `lastAttemptRound` can collide in a new combat, while falling back to attempt count loses elapsed turns when combat ends. **Fix:** Qualify attempt limits by combat ID and preserve elapsed entanglement turns when switching between combat and noncombat tracking.

13. **Pool allocation and the impossibility check need separate inputs.** `rollSuccessTest` adds and deducts only dice supplied through `options.poolDice`; passing the dialog’s combined total as base dice would avoid deduction, and selected/spent pool dice are not “all available Astral Pool.” **Fix:** Pass only the attribute as base dice, allocate pool through `poolDice`, and evaluate impossibility from an explicitly timed snapshot of the full available Astral Pool.

VERDICT: REVISE

### Claude's response
Accepted 1-6 and 8-13. Karma on resist/escape tests is closed on commit (astral-combat precedent). 7 (cross-client) kept as the documented limit shared with the ranged card, mitigated by per-net ids. Ending projection while netted is refused for players; a GM override deletes the form and its net, logged.

## Round 2 — Codex

Remaining concrete flaws:

1. **Dialog-time validation is missing.** Step 3 checks before opening the dialog, but attack Karma, resolution, token deletion, or plane changes can occur while it is open; `rollSuccessTest` does not invoke `beforeRoll`. **Fix:** Explicitly revalidate the live attack total, resolution marker, token, plane, and permissions immediately before rolling.

2. **Karma closure arrives too late.** `rollSuccessTest` publishes its Karma-enabled message before returning; a reroll can start before the outcome’s `closesTests` marker exists, and `applyKarmaToTest` does not recheck closure after its awaits. **Fix:** Create resist/escape tests with persisted `test.closed: true` from inception if immediate automatic resolution is intended.

3. **Replacing a net leaves its old effect behind.** Step 4 replaces the token record with a new ID but only specifies removing effects when escaping; escaping the replacement then leaves the original “Netted” effect. **Fix:** Remove the previous record’s matching effect when replacing that record.

4. **The mundane visual still spreads to the astral form.** A dedicated ActiveEffect on a linked body’s actor is also visible on its linked astral form; stripping token flags does not strip shared actor effects. **Fix:** Render the net visual from the token flag instead of adding an actor ActiveEffect.

5. **An old card can still escape a replacement net.** Comparing the ID captured when escape starts with the ID at commit only detects replacement during the attempt; an old card clicked *after* replacement can capture the new ID. **Fix:** Require the initiating card’s ID to equal the current restraint’s `cardId` before opening the escape dialog.

6. **The escape guard is underspecified for HUD versus card.** Reusing a card-keyed in-flight guard does not prevent two entry points on the same client from rolling against the same net; both retain the same net ID after a failed attempt. **Fix:** Share a token/net-ID guard across both entry points and recheck `lastAttempt` before rolling and committing.

7. **Projection protection exists only in one UI action.** `toggleAstral` is just an actor update; other actor updates bypass it, and reconciliation then deletes the netted form. **Fix:** Enforce the non-GM projection-exit restriction at the actor update boundary, checking the actor’s forms across all scenes.

8. **Combat-transition accounting has no designated writer.** Adding elapsed rounds and resetting fields requires token writes, but combat hooks run on multiple clients, including users without permission for affected tokens. **Fix:** Assign transition bookkeeping to the active GM, make it idempotent, and specify initialization when an already-netted token enters combat.

9. **Net branch precedence remains ambiguous.** “Beside `isShotSpread`” can place net handling after the existing blast early return or allow spread-specific attack modifiers before dispatch. **Fix:** Determine net ammunition before spread/blast processing and explicitly route it ahead of both incompatible branches.

VERDICT: REVISE

### Claude's response
Accepted all nine: live re-validation before rolling; resist/escape tests created closed to Karma; token-flag overlay instead of an actor effect (fixes 3 and 4); card-id match for escape; shared token+net guard; projection exit refused in preUpdateActor; turns kept by the active GM per round; net routed before blast/spread.

## Round 3 — Codex

Remaining concrete flaws:

1. **Round counting treats rewinds as elapsed time.** Step 6 adds one on every round change: rewinding 5→4 grants another TN reduction, while jumping 4→7 grants only one. A single `lastCounted` pair also cannot prevent recounting 4→5 after a rewind. **Fix:** Track a per-combat high-water round and add only positive advancement beyond it.

2. **The GM’s round writer can race an escape or replacement.** An asynchronous update based on net A can arrive after A is cleared or replaced by B, restoring stale fields or overwriting B; the escape-side ID check does not protect the GM writer. **Fix:** Serialize round bookkeeping and net mutations through the same authoritative token queue, validating the net ID when executing each operation.

3. **Attack Karma remains mutable during resistance.** Revalidation before rolling leaves the awaits inside `rollSuccessTest` and token updates exposed; attack Karma can change the card’s successes while the restraint commits using the earlier total. **Fix:** Freeze the attack total when resistance starts and coordinate attack-Karma writes with that resolution boundary.

4. **The overlay has no explicit refresh trigger.** Registering `refreshToken` only draws when a refresh occurs; the plan does not request one when the net flag changes, so an idle token can retain a stale overlay. The existing astral body cue explicitly requests `refreshState`. **Fix:** On net-flag addition, replacement, or deletion, request a token refresh and cover an idle token in the overlay test.

VERDICT: REVISE

### Claude's response
Accepted all four. 1+2 by removing the GM writer entirely: turns are brought up to date lazily by the escaping client from a per-combat high-water round (rewinds add nothing). 3: decide with the live attack successes at commit and close the attack test to Karma in the same outcome. 4: an updateToken hook requests refreshState when the net flag changes.

## Round 4 — Codex

Three issues remain:

1. **The “live card” can lag behind the attack test.** `applyKarmaToTest` updates the test before awaiting `_syncDependentCards`, so step 3 can still resolve against stale successes. **Fix:** Read `testTotalSuccesses` from the source test identified by `testMessageId`, not the dependent net card.

2. **Closing attack Karma after the token commit still leaves a race.** A Karma action can pass its closure check before the outcome exists and finish afterward; `applyKarmaToTest` never rechecks closure after its awaits. Step 3 also contradicts itself between closing both tests and emitting only `[testId]`. **Fix:** Serialize attack-Karma actions and net finalization through one authority, freeze the total before committing, and consistently close both test IDs.

3. **Lazy counting loses elapsed turns when combat ends.** A token netted in round 1 that makes no attempts before combat ends in round 5 receives only `+1` on its next attempt; entering another combat also grants an arbitrary turn immediately. **Fix:** Preserve the outgoing combat’s final elapsed count in durable bookkeeping and initialize the new combat baseline without adding a turn merely for switching combats.

VERDICT: REVISE

### Claude's response
Accepted 1 (read the source test) and 3 (active-GM fold on deleteCombat with an id check; a new combat starts a baseline without a free turn). 2: fixed the closesTests inconsistency (both ids); the cross-client in-flight Karma race is documented as an accepted limit, consistent with the ranged card.

## Round 5 — Codex

Two bookkeeping defects remain outside the accepted limits:

1. **Deleting a rewound combat subtracts elapsed turns.** Step 6 uses `turns += round − seen.round` without the earlier nonnegative clamp; counting through round 5, rewinding to 3, then deleting subtracts two turns and raises escape TN. **Fix:** Use `max(0, round − seen.round)` when folding a deleted combat.

2. **Switching combats without deleting the old one loses elapsed turns.** The “different combat” branch assumes deletion already folded the old rounds, then overwrites `seen`; a later deletion cannot recover them because `seen.combatId` no longer matches. **Fix:** Before replacing `seen`, fold any uncounted advancement from the previous combat if it still exists, then initialize the new baseline.

VERDICT: REVISE

### Claude's response
Both accepted and applied (non-negative fold; fold the old combat before switching baselines). MAX_ROUNDS reached with no disagreement left: the remaining notes were applied, not disputed.
