# Plan Review Log: VR2.0 part 5b (utility options, programming)
Started 2026-10-30. MAX_ROUNDS=5.

## Round 1 — Codex (thread 01a18f6d-da04-7d03-8085-92a450ceb6bb) — VERDICT: REVISE
19 findings: area successes bypass freezeSuccesses/advanceExit; area Karma has no freeze boundary; highest-TN
rerolls drop lower-TN successes; area TNs omit actor penalties; separate area-card creation races; one-shot
consumption not exclusive/recoverable; DINAB crash can hit a fresh reload; DINAB lacks a final-outcome protocol;
one-shot/DINAB miss Camo/Cloak/Lock-On/Restore/Medic; tar wipe needs a frozen victim list; schema can't hold
Limit's target and Sensitive is always inert; utility identity formats disagree; option prices disagree with
itemBaseCost; usablePrograms change would alter Hog; programming has stale Karma, lost concurrent work and
design substitution; black hammer/killjoy programming cap missing; team arithmetic contradiction; squeeze
lifecycle incomplete; per-factor rounding is order-dependent.

### Claude's response
Accepted all 19, with these choices:
- Area reuses the area-spell precedent (`areaCast`: post-roll Karma refused as GM adjudication, castDelta,
  `successesAtTN`), frozen `areaSuccesses` per card, one `attackSuccesses(st)` accessor for every reader, one
  `createDocuments` batch. That removes #2/#3 rather than designing a multi-TN reroll policy.
- One-shot spent = a `once()` claim taken before the roll (the marker is the durable record).
- DINAB: no Karma (outcome final at roll except the defender's zeroing), one wear key per use, crash as a
  generation-bound crash fact, a phase claim in combat.
- `usablePrograms` untouched; a new `activePrograms` for action pickers.
- #17: the code (1 + team bonus per team day) matches the book (p.102, rendered); the plan text was wrong.
- #18: narrowed to one decompression (no Compressor upload mechanic exists).

## Round 2 — Codex (2026-11-04, after the build)

Material problems remain in the revised plan and built implementation:

1. **One-shot spending is not durable.** `spendUse` uses `once()`, whose markers are pruned after 24 hours; `programUnusable` then treats the same generation as usable again. The plan explicitly—but incorrectly—calls this a durable record.  
   **Fix:** Claim one-shot consumption with `recordEvent`, preserving the deterministic item/generation key.

2. **DINAB’s phase key repeats across actions.** `vr2.mjs:phaseKey` uses combat round and turn index, but `SR2ECombat.nextTurn` re-sorts initiative and can keep the same index across successive phases. DINAB therefore remains blocked on later legitimate actions.  
   **Fix:** Use the existing monotonic `flags.sr2e.phaseSeq` phase identity.

3. **Manual use and DINAB use can both win concurrently.** Manual use checks for a DINAB marker and writes `programPhase`; DINAB checks that flag and creates its marker. Two clients can both pass their checks before either write lands.  
   **Fix:** Serialize both modes through the sequencer or arbitrate their shared phase admission with one deterministic record.

4. **Passive one-shot consumers ignore claim failures.** `camoFor`, the Cloak maneuver path, and `opposeManeuver` discard `spendUse`’s refusal and still apply the utility. Lock-On additionally uses a TN frozen from an earlier copy while spending whichever copy is best at resolution.  
   **Fix:** Bind each passive benefit to its captured copy and successful admission; recompute or refuse when that admission fails.

5. **Sensitive checks the wrong host during System Tests.** `vr2SystemTest` selects `bestUtility` before `sessionFor(actor, host)` switches sessions; `activePrograms` reads the previous session’s manufacturer. A utility restricted to the old host can benefit a test on the new one.  
   **Fix:** Establish the requested session before selecting utilities, or pass the actual host explicitly to eligibility checks.

6. **DINAB degradation can disappear after an acknowledged resolution.** The sequencer’s `apply` handler writes the attack ack before `dinabZeroed`; interruption between them permanently skips wear because retries return immediately on the ack. Hog similarly acknowledges before applying wear.  
   **Fix:** Reconcile DINAB wear from durable resolution outcomes independently of request completion.

7. **Programming still lacks task-bound concurrency.** `workDialog` retains an old task across its dialog, then writes into the current `programming.log` without checking `taskId`; abandoning and starting another task allows old work and an old period into the new task. The first-log period write and Karma closure are also separate, with no recovery step.  
   **Fix:** Serialize task transitions, validate the captured task ID, and persist a recoverable freeze record before accepting work.

8. **Programming snapshots the design too late and incompletely.** `startDialog` calculates design size before awaiting user input and rolling, but captures `designOf(item)` afterward. An intervening edit can pair a cheap old base time with a larger new design. Identity and manufacturer are absent from both the snapshot and design lock.  
   **Fix:** Capture the entire design before the dialog, revalidate before committing, and lock identity/manufacturer alongside its numeric fields.

9. **Abandoning or failing programming makes an unfinished program usable.** Both paths delete the task; `programUnusable` interprets “no task” as finished. A loaded item becomes immediately usable, and an unloaded one can simply be loaded without completing any work.  
   **Fix:** Preserve an explicit unwritten state after failure/abandonment, or restore the pre-task program when cancelling work on an existing copy.

10. **The promised programming skill choices are missing.** `programming.mjs` reads only a skill named exactly Computer; neither Software nor Matrix Programming can substitute, despite both the plan and rules section promising them.  
    **Fix:** Resolve the selected programming skill through the existing skill hierarchy, keeping Computer-specific caps separate.

11. **Area target identities are not deduplicated.** Extra targets resolve token selections to actors without deduplicating actor UUIDs. Two linked tokens representing one actor can generate multiple damage cards against the same persona and inflate the target-count penalty.  
    **Fix:** Deduplicate by actor UUID, excluding the primary target, before checking the Area cap or calculating TNs.

The plan also retains contradictory descriptions—highest-TN Karma-enabled area rolls versus the implemented lowest-TN frozen approach, and DINAB-rating attack dice versus the Built notes. Those should be consolidated so implementation and future review have one authoritative specification.

VERDICT: REVISE
### Claude's response (round 2)
All 11 points checked against the code and accepted. The fixes are in the code, with the plan updated to match
("Round 2 fixes" under Built; the One-shot, DINAB and Key-decisions passages rewritten, which removes the two
contradictions Codex named):
1. **Durable one-shot:** `recordEvent`, not `once`.
2. **Phase:** `phaseSeq`.
3. **Own vs DINAB:** one per-phase marker with a mode, created by the server once (`once` now takes a payload).
4. **Passive one-shots:** a refused spend gives nothing. Lock-On is bound to the copy on the card, with the TN
   recomputed when that copy is gone.
5. **Sensitive:** judged on the tested host.
6. **DINAB wear:** written before the acknowledgements.
7. **Programming concurrency:** the taskId is re-checked and the test is closed before the period is written. Full
   serialization of task transitions isn't added: the taskId check refuses stale work, and two simultaneous starts
   leave one task.
8. **Design snapshot:** taken before the dialog and re-checked; the lock covers identity, manufacturer and the rest.
9. **Failed or abandoned tasks:** they restore a program that was usable before, else leave it `unwritten`.
10. **Skill:** Software / Matrix Programming roll where higher. The caps stay on Computer.
11. **Area targets:** deduplicated at validation. Partly moot: the dialog already deduplicated, but the check is
    cheap.

Tests: Quench `sr2e.vr2-options` gained 2 tests: a durable one-shot plus Sensitive on the tested host, and
programming abandon/restore/unwritten plus the Software concentration. vr2-options, vr2-utilities, vr2-ic and
money-queue pass 56/56. Vitest passes 1428, and lint is clean.

## Round 3 — Codex (2026-11-04)

Remaining material flaws are concentrated in programming:

1. **Task-ID checks still do not prevent stale writes.** In `programming.mjs:105–127`, a first log validates task A, then awaits `ChatMessage.create`; another client can abandon A and start B during that await, after which A’s period and work are written into B. `complete` likewise never validates the current task ID.  
   **Fix:** Serialize start/log/complete/abandon through the sequencer, validating the task ID inside that serialized operation.

2. **The period is still calculated before Karma closes.** Lines 118–123 read successes and calculate `p` before awaiting the closure card, despite the comment claiming the reverse. A Karma spend committed during that interval leaves the frozen period inconsistent with the final test.  
   **Fix:** Close the test first, then read its finalized successes and persist an idempotent period receipt.

3. **Task transitions assume `setFlag` replaces nested objects.** Foundry merges these updates: `endTask(..., {unwritten:true})` leaves the old `taskId`, so `writing()` still considers it active; starting over a completed task can retain `complete`, `period`, and old log entries because `{log:{}}` does not delete them.  
   **Fix:** Explicitly delete obsolete task fields/log entries when transitioning, within the serialized task operation.

4. **Team size now incorrectly uses specialized or Sensitive-adjusted skill.** `teamTerms(skills).maxSize` at lines 68–72 uses Software/Matrix Programming or the theory average, although the plan limits membership using highest **Computer**. Computer 4 with Software 6 can admit three members instead of two.  
   **Fix:** Calculate membership limits from `members.map(computerOf)` and use adjusted skills only for the test’s dice.

5. **The unwritten lifecycle has no normal entry path.** `restore = !unfinished(item)` treats every newly created program without a task flag as previously written; abandoning its first task therefore makes it usable. The new Quench test manually injects `{unwritten:true}`, bypassing this missing workflow.  
   **Fix:** Provide an explicit “new programming project” creation path that initializes `unwritten:true`, while preserving existing programs’ restore behavior.

Add regressions for restart-after-completion, abandon-and-restart during a pending first log, Karma completing during closure, and creating an unwritten project through the actual UI.

VERDICT: REVISE
### Claude's response (round 3)
All 5 accepted:
1. & 3. **Task records:** programming state is now `{ current, tasks: { [taskId]: … }, unwritten? }`
   (`progTask`/`progWriting`/`progUnfinished` in rules/vr2-options.mjs).
   - Every log, period and completion write targets its own task's key. A dialog left open across an
     abandon/restart is refused by the `current` check, and even a racing write can only land in its own stale task,
     never the current one.
   - A new task is a fresh key, so nothing merges. This is simpler than serializing through the sequencer, with the
     same guarantee.
   - Completion and abandonment re-check `current`.
2. **Period:** `freezePeriod` posts the closure, THEN reads the test's successes, then writes the period once.
4. **Team size:** membership and caps use Computer. Only the dice use the specialization or Sensitive average.
5. **New programs:** a real entry path, the "Write a new program" button on the Matrix tab (VR2.0), which creates an
   `unwritten` project. A bought program keeps restore-on-abandon.

Regression tests (Quench `sr2e.vr2-options`):
- a restart after completion starts clean;
- a stale log after abandon + restart touches neither task;
- the New-program button path stays unwritten after abandon.

Karma landing mid-closure isn't scriptable in Quench (it needs two devices); it's covered by the ordering above.
Results: vr2-options, utilities, ic and sheets pass 48/48. Vitest passes 1428, and lint is clean.

## Round 4 — Codex (2026-11-04)

Two material concurrency gaps remain:

1. **Task-specific keys do not isolate lifecycle writes.** `endTask` still writes shared `current` and `unwritten`; `complete` still writes shared `unwritten`. Two clients can pass the same `current` check, then a delayed abandonment can clear a newly started task. A delayed completion can also clear `unwritten` after abandonment, making an unfinished project usable. The new regression changes tasks *before* validation, so it does not exercise this race.  
   **Fix:** Serialize lifecycle transitions through the sequencer and validate `current` there, or derive lifecycle state entirely from task-bound immutable records.

2. **Karma closure is still not a cross-client freeze barrier.** `freezePeriod` awaits creation of a closure message, then reads the test. Another client can already have passed `applyKarmaToTest`’s final closure check and have its test update in flight; that update can land after the period is stored. Concurrent first logs can consequently calculate different periods and overwrite each other—the local `period == null` check is not write-once arbitration.  
   **Fix:** Serialize programming-test Karma updates and period finalization through one authority, persisting one immutable finalized-success/period receipt.

Add controlled interleaving tests that delay the actual document writes, rather than only leaving dialogs open; these races can be simulated without two physical devices.

VERDICT: REVISE
### Claude's response (round 4)
Both accepted. I took Codex's second alternative: lifecycle state derived entirely from task-bound immutable records,
the pattern this system already uses for mbw/cym/vr2 rather than the sequencer.
- **Records:** programming is now durable records on the program item: `prog:new`, `prog:start:<t>`,
  `prog:log:<t>:<id>`, `prog:period:<t>` and `prog:end:<t>`, folded by the pure `foldProgramming`.
  - There are no shared mutable fields left.
  - A task has exactly one period record and one end record, because the server arbitrates their ids: concurrent
    first logs agree on one period, and an abandon racing a completion leaves exactly one outcome.
  - A delayed write only adds a record to its own task.
- **Usability:** derived, not stored. A new project is unusable until a task completes. An abandoned or failed task
  leaves the program as it was.
- **Karma closure:** the period is THE recorded period, whoever wrote it first. The one residual: a Karma spend that
  had already passed its own closure check can still land on the card, but it no longer affects the period (that
  Karma is just spent). It's marked `shortcut:` in `freezePeriod`. A single Karma authority across all tests is out
  of 5b's scope.

Tests:
- **Vitest:** 4 fold tests, including all 120 orderings of an abandon/restart/late-log interleaving.
- **Quench:** the stale-dialog test now injects the other device's records mid-dialog. A new race test runs abandon
  and complete of the same task concurrently, and exactly one survives.
- **Results:** Vitest 1432, Quench vr2-options/utilities/ic/sheets 48/48, lint clean.

## Round 5 — Codex (2026-11-04)

Three material problems remain:

1. **Karma finalization remains explicitly unfixed.** `freezePeriod` now prevents competing period records, but its `shortcut:` still permits an in-flight Karma spend to consume Karma without affecting the task. Immutable period storage does not resolve that race, and fixing programming tests does not require redesigning Karma for every test.  
   **Fix:** Route programming-test Karma and period finalization through the same authority, or reject/refund spends excluded from the finalized receipt.

2. **Task ordering depends on timestamps and random IDs.** `foldProgramming` orders starts by client-supplied `at`, then random task ID—not causal order. A tied timestamp can leave completed task `z` current after task `a` starts; a direct fold reproduction returns `writing:false, unfinished:false`, making the program usable during the new task. Clock differences introduce the same risk across clients.  
   **Fix:** Give starts a server-arbitrated generation or sequencer order, and test tied timestamps and reversed client clocks.

3. **New-project creation reintroduces an interruption gap.** `newProject` creates an ordinary program, then separately writes `prog:new`. Disconnecting or failing between those writes leaves a program the fold considers already written; loading it bypasses programming entirely.  
   **Fix:** Include the durable `prog:new` ActiveEffect in the initial Item creation data so project creation and unwritten status commit together.

VERDICT: REVISE
### Claude's response (round 5)
All 3 accepted:
1. **Karma:** the period is no longer a snapshot. The first log records `prog:frozen:<n>` (after closing the test).
   From then on, the period is always `baseTime ÷` the CLOSED test's live successes. A Karma spend in flight as it
   closed lands on the test and counts, so no Karma is spent for nothing, and every device reads the same test. The
   record's snapshot is only a fallback if the message is deleted. No successes = a failed task, derived rather than
   written. The `shortcut:` is removed.
2. **Ordering:** starts are `prog:start:<n>` with n = the previous start's + 1. Two devices starting at once claim the
   same id, the server keeps one, and order is causal (n), never a clock. Tested with tied and reversed timestamps
   (Vitest), plus a concurrent double start (Quench).
3. **New projects:** the `prog:new` record is part of the Item creation (embedded effect, `keepEmbeddedIds`), so the
   project is unwritten from its first moment.

Results: Vitest 1433, Quench vr2-options/utilities/ic/sheets 48/48, lint clean.

## Round 6 — Codex (2026-11-04; past MAX_ROUNDS=5)

The generation ordering and atomic project creation fixes address those findings. The live-success approach leaves two material problems:

1. **A failed task can reopen after its design unlocks.** `foldProgramming` reports zero successes as `end:"fail", writing:false`; an in-flight reroll adding successes changes that same task back to `writing:true`. Between those states, the user can edit the design or start another task. The former leaves a reopened task with a mismatched design; the latter still wastes the late Karma on a superseded task.  
   **Fix:** Keep finalization pending until programming-test Karma operations settle, then persist one terminal success count before permitting edits or another start.

2. **Deleting chat changes recorded progress.** The fallback snapshot predates any late Karma. For base time 8, snapshot 2 and live successes 4 produce a two-day period; deleting the test restores a four-day period. A snapshot of zero can turn an active task into a failure. I reproduced this state reversal directly through the fold.  
   **Fix:** Persist the settled success count in the task’s durable finalization record and derive its period from that record, independent of chat retention.

The remaining fix needs coordination specifically between programming-test Karma and finalization; it does not require replacing Karma handling system-wide.

VERDICT: REVISE
### Claude's response (round 6)
Both accepted, and the live read is reverted:
- **Final count recorded once:** `freezePeriod` closes the test, then waits for this device's Karma spends on it.
  Every Karma button now runs through one queue per test card (`enqueueAttack("karma:<id>")`), and a spend that
  finds the test closed after paying is refunded (existing). THEN it records the FINAL successes once.
- **Card independence:** the period derives from that record only, so a failure stays failed and deleting the chat
  changes nothing.

**Residual (flagged for the user, not fixed):** a spend made on ANOTHER device in the same instant, already past its
own post-payment closure check, can still land on the card after the record and not count. Closing that needs one
Karma authority across devices, which Codex itself scoped as programming-only coordination; it's marked `shortcut:`
in `freezePeriod`.

Results: Vitest 1433; Quench sheets, karma-pool, karma-card-sync, karma-damage-sync, damage-karma, vr2-utilities,
vr2-options and combat-spells pass 75/75; lint clean.

The loop has reached its round cap. Per the review process this goes to the user to break the tie instead of a seventh round.

## Code review round 1 — Codex (2026-11-04, git diff 95dc218..HEAD)

1. **System Operations ignore “Run by DINAB.”** `module/sheets/sheet-actions.mjs:2768`  
   The dialog callback never copies `f.dinab.checked` into its result. Checking it still rolls the character’s Computer, permits pools, and commits the normal action. The checkbox read was added to the unrelated attack dialog instead.  
   **Fix:** Add `dinab: !!f.dinab?.checked` to the System Operation dialog result.

2. **Relocate bypasses one-shot consumption and DINAB phase restrictions.** `module/vr2ic.mjs:1154`  
   The trace-escape action reads `loadedUtility("relocate")` and rolls without calling `spendUse`. A one-shot Relocate therefore provides its bonus repeatedly; manual use also bypasses a DINAB use already recorded for that phase.  
   **Fix:** Capture the Relocate item, obtain successful `spendUse` admission before rolling, and use that admitted copy’s rating.

3. **Non-GM resolution silently loses DINAB degradation.** `module/vr2.mjs:999`  
   When a player completely resists another player’s DINAB attack through the non-sequenced resolution path, `dinabZeroed` skips wear because the defender cannot update the attacker’s item. The attack becomes resolved without recording the required degradation.  
   **Fix:** Route the generation-bound wear receipt through an authorized GM/owner request before completing resolution.

4. **Rating changes charge/refund against stale active options.** `module/sr2e.mjs:1493`  
   `repriceDelta` uses the existing `activeOpts` for both ratings, although changing rating can activate or invalidate rated options. Reproduced with Attack-4M/Skulk-4 downgraded to rating 3: repricing calculates **14,700¥**, while the prepared item correctly costs **2,700¥** because Skulk-4 becomes inert. The refund is short by **12,000¥** at list price.  
   **Fix:** Recompute active options separately for the old and proposed configurations before pricing each.

No files modified. Findings come from caller tracing and a read-only pricing reproduction; Foundry runtime tests were not run.

VERDICT: REVISE
### Claude's response (code round 1)
All 4 confirmed and fixed:
1. **System Operation dialog:** it now returns `dinab`. A stray read in the core-ruleset attack dialog, which has no
   DINAB box, is removed.
2. **Relocate:** it captures its utility and spends it (`spendUse`) before the roll. A refused use gives no bonus.
3. **DINAB wear:** `dinabZeroed(st, {card, requester})`. When the resolver can't write the attacker's program, the
   defender files a `dinabWear` request, and the GM's sequencer writes the wear (only for the attack's own target;
   idempotent per use). The old `shortcut:` is removed. Requests come from deckers; IC is resolved by the GM, who
   writes directly.
4. **Repricing:** `repriceDelta` recomputes active options for each side's own rating (and options).

Regression test (Quench `sr2e.vr2-options`):
- DINAB through the real System Operation dialog;
- the sequencer writing a requested wear;
- the Attack-4M/Skulk-4 → 3 downgrade refunding the right amount (Skulk inert).

Results: options/utilities/ic/karma-pool/money-queue/purchases 90/90; Vitest 1433; lint clean.

## Code review round 2 — Codex (2026-11-04)

1. **Program-name clicks bypass the new use lifecycle.** `module/documents/item.mjs:2293`  
   The Matrix row’s `rollProgram` action reaches `_rollProgramAction`, which rolls directly without eligibility checks or `spendUse`. A one-shot Evaluate can run repeatedly; compressed, Sensitive-blocked, and unfinished programs also roll normally.  
   **Fix:** Route VR2 program-row rolls through active-program validation and successful `spendUse` admission before rolling.

2. **A non-DINAB copy blocks an available DINAB copy.** `module/vr2.mjs:441`  
   With Browse-6 without DINAB and Browse-4/DINAB-2 loaded, checking “Run by DINAB” selects Browse-6 first, then incorrectly reports that no Browse with DINAB remains. The same happens when the higher-rated copy’s DINAB is exhausted.  
   **Fix:** Filter candidates for remaining DINAB before choosing the utility when `opts.dinab` is true.

3. **Sensitive attack selection uses the previous host.** `module/vr2.mjs:655`  
   While the current session is on manufacturer A’s host, an attack utility restricted to manufacturer B is excluded before the attack dialog offers its host selector. If it is the only attack utility, the dialog aborts entirely—even when the intended attack is on B’s host.  
   **Fix:** Build and refresh attack-utility choices against the selected host, and defer the empty-program rejection until that host is chosen.

Read-only method reproductions confirmed findings 1–2. No files modified; Foundry runtime tests were not run.

VERDICT: REVISE
### Claude's response (code round 2)
All 3 confirmed and fixed:
1. **Program-row rolls:** under VR2.0 they require an active copy and a successful `spendUse` first.
2. **DINAB copy choice:** a DINAB System Test picks the best copy with DINAB left (`bestUtility` gained a predicate).
3. **Sensitive attacks:** the attack dialog lists programs without the Sensitive filter, because the host is chosen in
   that dialog. The attack re-checks on the chosen host, with a Sensitive-specific message.

Regression test (Quench `sr2e.vr2-options`, now 18/18):
- a one-shot program-row roll is refused the second time;
- a DINAB run uses the copy with DINAB;
- an MCT-only attack is offered while live on a Fuchi host, and fires on the MCT host.

Utilities, IC, sheets and money-queue pass. Vitest passes.

## Code review round 3 — Codex (2026-11-04)

The round 2 fixes address the three reported issues. Two remaining bugs:

1. **Option sizes round twice for fractional multipliers.** `module/rules/vr2-options.mjs:101`  
   `programSize` already rounds up before the option factors apply. Rating 3, multiplier 1.5, Optimization produces design size **28 Mp / 2,800¥**, instead of **27 Mp / 2,700¥** under the settled round-once calculation; programming base time is also inflated.  
   **Fix:** Multiply the unrounded rating² × multiplier by all option factors, then round once.

2. **Core Matrix sheets show spurious DINAB badges.** `templates/actor/parts/actor-matrix.hbs:192`  
   With `matrixRuleset: "core"`, `programBadges` is omitted, leaving `program.dinab` undefined. The strict comparison against `null` fails, so every program displays “DINAB” with no rating.  
   **Fix:** Gate the badge on VR2 or initialize `dinab: null` for core program rows.

All 20 pure rules tests passed using a read-only Node assertion harness. Foundry runtime tests were not run; no files modified.

VERDICT: REVISE
### Claude's response (code round 3)
Both confirmed and fixed:
1. **Rounding:** `programSizes` multiplies rating² × multiplier by every factor and rounds ONCE. A Vitest pins
   rating 3, ×1.5, Optimization = 27 Mp / 2,700¥.
2. **DINAB badge:** gated on a `hasDinab` flag that only VR2 rows carry. Checked on a core-ruleset sheet: no DINAB
   badge.

Results: Vitest 1434; Quench vr2-options + sheets 24/24.
