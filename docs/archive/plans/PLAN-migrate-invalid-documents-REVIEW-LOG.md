# Plan Review Log: migrate invalid documents
Started 2026-10-16. MAX_ROUNDS=5.

## Round 1 — Codex

Reviewed against installed **Foundry V13 build 351**. No files modified. The plan has several blocking assumptions.

1. **`game.data` is not pristine database data.** `Game.initializeDocuments` passes its arrays directly into collections; collection initialization constructs documents from those objects; `DataModel._initializeSource` migrates and cleans them in place. Missing `_stats.systemVersion` can therefore acquire the current version before this pass, defeating “missing → all.” The normal migration pass can further change these arrays.  
   **Fix:** obtain or preserve genuinely pre-construction source and version metadata; do not describe ready-time `game.data` as untouched raw storage.  
   Evidence: `client/game.mjs:906`, `client/documents/abstract/document-collection.mjs:54`, `common/abstract/data.mjs:255`, `common/data/fields.mjs:3153`.

2. **Updating an invalid document can persist, but does not restore it to the live collection.** Pre-update lookup explicitly permits invalid documents. However, the response handler retrieves documents without `invalid: true` and skips missing ones. Consequently, a successful database repair can return `undefined` from `.update()`, leave `invalidDocumentIds` unchanged, and leave the local raw source stale. This also affects invalid embedded-item updates.  
   **Fix:** treat recovery as requiring reload and persistence verification; neither the returned document nor live collection membership proves whether the write succeeded.  
   Evidence: `client/data/client-backend.mjs:209,290`, `common/abstract/document.mjs:700`.

3. **Failures do not reliably throw, and successful updates do not prove full validity.** Client validation errors are caught internally and the update is omitted; hook vetoes also produce empty results. Conversely, `updateSource` validates changed fields and joint constraints, not every unchanged field. Another invalid stored value can survive a successful partial repair.  
   **Fix:** strictly validate the complete proposed source with fallbacks disabled, distinguish rejected/no-op writes from confirmed persistence, and report unresolved documents even when no migration produces changes.  
   Evidence: `client/data/client-backend.mjs:223–249`, `common/abstract/data.mjs:442–469`.

4. **Unarmed Strike backfill is effectively unreachable.** The proposed `game.actors.get(id)` check remains false after repairing an invalid world actor. After reload, the actor is valid and the world stamp already current, so neither pass supplies the missing item.  
   **Fix:** persist a retryable backfill task before repair, then complete and clear it after reload using the original pending-migration information.

5. **The “every migration is harmless to replay” claim is false.** Migration 0.92.0 overwrites named concentration/specialization ratings from the general rating and clears `allocated` for finalized skills. An independently advanced skill can lose purchased ratings; 0.92.1 does not undo those writes. Mathematical idempotence does not protect intervening player edits.  
   **Fix:** give recovery an audited migration policy that preserves explicit finalized ratings and reports ambiguous legacy skills instead of recomputing them.  
   Evidence: [migrations.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/migrations.mjs:203).

6. **Truly raw input changes Karma migration behavior.** On raw data without `poolAdjust`, 0.91.0 now executes the preservation branch that the later repair comments say previously never ran. A legacy `pool: 0` can become a negative adjustment, producing the zero-capacity outcome 0.92.1 explicitly avoids; the legacy pool field is also deleted.  
   **Fix:** define and test the intended raw-data Karma policy explicitly, preserving ambiguous legacy values rather than blindly replaying 0.91.0.  
   Evidence: [migrations.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/migrations.mjs:268).

7. **Last-save version is not a migration checkpoint—even for invalid documents.** A document can have been saved after a migration was missed and only become invalid later. Partial recovery can also advance its save metadata while other repairs remain unfinished. Embedded items have independent histories, so the actor’s version is insufficient for selecting all child migrations.  
   **Fix:** use explicit recovery completion metadata and value-based repair eligibility; define version selection separately for actors and embedded items.

8. **Two GMs can run both passes concurrently.** The ready hook checks only `game.user.isGM`. Both clients can read the same stamp and stale source, overwrite repairs, and duplicate item additions or notifications.  
   **Fix:** restrict the entire migration runner to the active GM, guard against local re-entry, and recheck ownership before writes and deferred additions.  
   Evidence: [sr2e.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:623); V13 exposes `game.user.isActiveGM`.

9. **The proposed integration stub hides the principal failure.** A real valid actor still present in the collection takes the successful response-handler branch that actual invalid actors miss. It cannot establish recovery, return-value behavior, or persistence across reload.  
   **Fix:** test genuinely absent collection entries, unchanged invalid-ID sets, rejected updates, persisted repairs across reload, retained sibling items, and deferred backfills in a disposable fixture world.

The embedded-array question has a favorable answer: **`actor.update({items: [...]}, {diff: false})` merges embedded entries by `_id` under recursive updates; omitted items are retained.** `recursive: false` replaces the array. `diff: false` does not request replacement. Preserve recursive behavior and test an untouched sibling. Evidence: `common/data/fields.mjs:2301–2369`.

One additional integration issue: the supposedly “pure” migration loop mutates notification accumulators. Running recovery after the normal pass’s notification flush—or after its early return—can leave recovery notices unreported. **Fix:** return diagnostics explicitly and flush them once after both passes.

VERDICT: REVISE

### Claude's response
Accepted the core of 1-7 and 9: automatic repair is unsafe (old migrations are not safe to replay on raw data, last-save version is not a checkpoint) and unverifiable (V13 keeps a repaired invalid document out of the collection until reload). Rewrote the plan to report invalid documents by name every load and leave the repair (re-import or delete) to the GM. Accepted 8: migrations run on the active GM only. The diagnostics-flush point is moot now that the report is a separate read-only step.

## Round 2 — Codex

The report-only approach removes the unsafe replay and repair paths, but the revised plan still needs changes. Checked against installed **V13 build 351**; no files modified.

1. **`validationFailures` does not record “every failure.”** Collection initialization adds an ID to `invalidDocumentIds` for any construction exception, but `_trackValidationFailure` records only `DataModelValidationError` instances. An actor failing during preparation with a `TypeError` remains invisible to this reporter.  
   **Fix:** enumerate world Actor/Item `invalidDocumentIds` and supplement them with `validationFailures`, using an explicit “diagnostic unavailable; see startup console” fallback.  
   Evidence: `client/documents/abstract/document-collection.mjs:54–62`, `client/helpers/client-issues.mjs:248`.

2. **Embedded-item reporting lacks a reliable diagnostic and can itself throw.** `getInvalid(id, {strict:false})` only suppresses the error for an unlisted ID; it still constructs a document. Construction can throw, and fallback validation can replace the offending value. There is no recorded `{name,error}` entry equivalent to the world-level issue record. One bad item could abort the entire report. Support → Document Issues also does not list these embedded failures.  
   **Fix:** isolate each lookup with `try/catch`, always retain actor/item IDs and the parent name, and report available validation failures or a fallback diagnostic; direct embedded-item cases to the console.  
   Evidence: `common/abstract/embedded-collection.mjs:298`, `client/applications/sidebar/apps/support-details.mjs:207`.

3. **The notification invents a cause and recommends potentially destructive recovery.** Validation failure does not establish that data came from an older system version. Re-importing and deleting can discard advancement, inventory edits, flags, and actor references; not every document has a compendium original. Even Tiger’s current compendium stats do not establish that its old world copy contains no unique changes.  
   **Fix:** say “failed validation,” recommend preserving the original and investigating the diagnostic, and present re-import as an option only for verified replaceable copies.

4. **`isActiveGM` reduces races but does not guarantee single execution.** It elects a user dynamically, not a migration lock. A newly connected higher-priority GM can become active while the previous GM’s awaited migration is still running; both ready hooks can then execute migrations. Multiple sessions of the same elected user are also not distinguished.  
   **Fix:** either provide migration coordination that covers overlapping sessions and ownership changes, or explicitly narrow the guarantee and document the remaining race instead of claiming the runner cannot run twice.  
   Evidence: `client/documents/collections/users.mjs:70–96`; existing awaited writes in `migrateWorld()`.

5. **“After `migrateWorld()` on EVERY load” needs an explicit exception path.** If reporting is placed after the awaited call inside its existing `try`, an unexpected migration/settings failure skips the report precisely when diagnostics matter.  
   **Fix:** call the reporter after the migration `catch`, with its own error boundary, so migration failure cannot suppress it.  
   Evidence: [ready hook](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:623).

6. **The integration tests cover only the easiest branch.** Stubbing world validation records does not exercise missing issue records, throwing embedded lookups, parent identification, or reporting after migration failure.  
   **Fix:** add those cases and verify that one uninspectable document does not suppress the remaining report.

Confirmed: the proposed world-level `{Actor: {id: {name,error}}}` shape is correct for recorded validation failures, and the authored Tiger compendium source has `physical_adept` and the corrected Katana. Automatic-update semantics, raw-data replay, and deferred backfills are no longer blockers because this revision performs none of them.

VERDICT: REVISE

### Claude's response
Accepted all six. Enumerate invalidDocumentIds with validationFailures as the detail source; embedded names from the parent _source (no construction); per-actor try/catch; neutral wording that does not push deletion; the report runs after the migration catch in its own boundary; the active-GM claim narrowed and documented; tests for the fallbacks.

## Round 3 — Codex

No remaining implementation blockers for the report-only scope. V13 supports the revised approach: enumerate invalid IDs, supplement with recorded errors, read embedded names without constructing documents, and report independently of migration success. The remaining GM race is now explicitly accepted rather than claimed solved.

Three nonblocking wording corrections:

- **Re-import does not replace the broken document.** V13’s `WorldCollection.importFromCompendium` creates a document and normally removes the source ID. **Fix:** say “imports a new copy; the original and its references remain unchanged.”
- **Not every reported document failed validation, and Support does not cover every case.** Construction exceptions and embedded-item failures may have only console diagnostics. **Fix:** use “failed to load”; direct everyone to the console and mention Support only for recorded validation failures.
- **Some summary statements contradict the revised approach.** “The runner stops running twice” and “rather than walking collections” are now inaccurate. **Fix:** say concurrency is reduced, and invalid-ID enumeration is supplemented by Foundry’s issue records.

The planned tests cover the previously identified reporting failures. No files modified; this approves the plan, not an implementation or live recovery.

VERDICT: APPROVED

Converged in 3 rounds. The three wording notes are applied in the implementation (\"failed to load\", re-import makes a new copy, Support only for recorded validation failures).
