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
