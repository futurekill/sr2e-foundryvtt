# Plan Review Log: Karma reaching ranged damage cards
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
- **Vehicle resistance bypasses the proposed safeguards.** `rollDamageResistance` drops `beforeRoll` and `resolvesMessageId` when delegating to vehicles; vehicle outcomes emit no resolution marker (`module/documents/actor.mjs:2119`, `:1960`). Karma can therefore change an open vehicle test, and non-author resolution leaves the card live. **Fix:** Forward both options, enforce the guard before spending dice/pools, and mark every terminal vehicle outcome.

- **Barrier revival lacks the state needed to enforce its exception.** The proposed schema stores no barrier declaration, while its renderer enables Resist whenever successes become positive; a note alone permits unreduced damage through a stopped shot or against a barrier-only target (`module/documents/item.mjs:1119`). **Fix:** Persist a manual-barrier-resolution flag and suppress Resist on revived barrier attacks until adjudicated.

- **Launchers become permanently resolved on unsuccessful clicks.** Both resolvers can return immediately for missing scene/tokens, yet step 3 closes the launcher on click (`module/sr2e.mjs:1873`, `:2029`). **Fix:** Validate prerequisites before claiming the launcher and distinguish successful resolution from failure so safe retries remain possible.

- **Launcher closure assumes permission to edit the attacker's message.** Existing launcher handlers allow another user to resolve; that user may create the outcome but cannot persist `resolved` on the source card. **Fix:** Put `flags.sr2e.resolves` on launcher outcome messages and check the shared resolution predicate before execution and synchronization.

- **The stated resist guard checks changed successes but omits already-resolved cards.** Two dialogs opened against the same count can both proceed after one resolves; the manipulation guard explicitly checks resolution too (`module/sr2e.mjs:1823`). **Fix:** Require existence and unresolved status at click and `beforeRoll`, and reuse the manipulation handler’s in-flight guard.

VERDICT: REVISE
### Claude's response
Accepted all 5: the vehicle guard and markers, a persisted barrier state with no Resist on revival, launchers marked only on success via a resolves marker, and the full manipulation guard shape.

## Round 2 — Codex
- **Smoke launchers have no rows card to carry the resolution marker.** `resolveBlast` returns early with a smoke-deployment message (`module/sr2e.mjs:1945`), so step 3 leaves non-author smoke resolutions open to Karma and repeat deployment. **Fix:** Tag every successful launcher outcome, including smoke, with `flags.sr2e.resolves`.

- **Launcher execution remains unguarded while awaiting resolution.** Step 3 delays closure until the outcome exists but specifies no in-flight guard or resolved check; rapid clicks can roll scatter twice and create duplicate templates/rows. **Fix:** Guard launcher execution per card, reject already-resolved launchers, and release the guard in `finally`.

- **Karma during launcher execution can leave contradictory success counts.** Launchers remain eligible for synchronization while scatter/template creation awaits; their flag can change after the resolver captured its count, then close displaying a different count from the rows. **Fix:** Capture an execution snapshot and close/render the launcher with the exact successes recorded in its outcome.

VERDICT: REVISE
### Claude's response
Accepted all 3: smoke is marked too, launchers get an in-flight guard, and execution snapshots its successes and is excluded from sync while running.

## Round 3 — Codex
- **The in-flight sync exclusion does not cover non-author execution.** A local set on the resolver’s client is invisible to the attacker’s `_syncDependentCards`; a persisted launcher flag requires permissions the non-author lacks. **Fix:** Define an author-side outcome reconciliation that closes the launcher using the recorded snapshot, rather than relying on cross-client visibility of the local guard.

- **Failed execution can discard a Karma update.** If synchronization skips an in-flight launcher and resolution subsequently fails, releasing the guard leaves the retryable card at its old count; `_syncDependentCards` does not automatically run again. **Fix:** On unsuccessful execution, reconcile the launcher against its source test’s current total before allowing retry, and test Karma during a failed launch.

VERDICT: REVISE
### Claude's response
Replaced the in-flight sync exclusion. The resolver reads the live total from the source test at click; closing is reconciled author-side from the outcome's recorded snapshot; a failed launch records nothing, and a retry re-reads the live total.
