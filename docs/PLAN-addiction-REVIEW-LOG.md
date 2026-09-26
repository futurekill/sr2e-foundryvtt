# Plan Review Log: substance lifecycle
Started 2026-09-26. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision before implementation. These are concrete failures or unresolved contracts, using the plan’s quoted rules as authoritative.

1. **The proposed queue does not prevent concurrent writes.** [`enqueueAttack`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/engagement.mjs:60) is a client-local `Map`. Two GMs can tick the same actor, while an owner’s dose can race a GM tick and overwrite ratings, clocks, or state. The existing one-driver assumption no longer holds once GM ticks are automatic.  
   **Fix:** Specify one authoritative writer for every substance mutation, including owner requests; electing a ticking GM alone is insufficient.

2. **One `lossClock` cannot represent independent schedules.** Weekly losses continue during withdrawal while ratings drop daily; resetting a shared clock for either event destroys the other schedule. Recovery also needs an explicit policy for the partially accrued addiction week.  
   **Fix:** Store separate weekly-loss and state-progress clocks, preserving accrued weekly time while recovery pauses it.

3. **Extension handling can prevent withdrawal forever.** “Overdue (and extension used or declined)” leaves an unattended actor indefinitely addicted without withdrawal when nobody answers; `extended: bool` also cannot distinguish unattempted, failed, declined, and successful extension.  
   **Fix:** Persist the extension outcome and effective deadline, with automatic withdrawal at that deadline unless a successful extension was already committed.

4. **The time reducer lacks historical inputs.** A large jump using today’s Body/Willpower cannot reproduce deadlines calculated before a drug wore off, an implant failed, or an attribute changed. Applying a dose or starting recovery before catching up also erases already-due consequences.  
   **Fix:** Persist deadlines and process all elapsed events before every mutation, with explicit attribute-change and equal-timestamp ordering.

5. **Clean-period processing contradicts the quote and loses elapsed time.** The quote requires uninterrupted non-use, not being unaddicted; the plan adds “not addicted.” Restarting the clock at `now` after a large jump also discards complete periods and remainder time. Strength ≥30 creates a nonpositive interval.  
   **Fix:** Apply the quoted eligibility, define interaction with withdrawal/recovery reductions, advance clocks by elapsed interval multiples, and validate interval inputs.

6. **Immunity and dosing have contradictory transitions.** An immune addict enters immediate withdrawal, but the generic withdrawal-dose rule then leaves withdrawal even though the dose has no effect. The next tick has no stated rule to put them back.  
   **Fix:** Define precedence explicitly and enforce the addicted-plus-immune invariant after every transition.

7. **The addiction-test button is not a safe state-changing interface.** [`drugTests`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:281) permits repeated rolls and treats a missing roll as zero successes. The plan adds persistence without exposure-level completion markers, wear-off gating, or protection against successful later tests clearing existing addiction.  
   **Fix:** Persist pending/completed tests per exposure and type, distinguish cancellation from failure, enforce after-effects timing, and make addiction/immunity sticky until an authorized recovery transition.

8. **Karma can change the roll after the state was committed.** Existing success cards support subsequent Karma changes; recovery explicitly permits bought successes, but the proposed reducer consumes only an immediate success count.  
   **Fix:** Define a finalized-result step or idempotent reconciliation keyed to the roll, covering recovery and addiction/tolerance outcomes.

9. **Recovery/rest transitions leave important states undefined.** Recovery entered at base should not wait three days unnecessarily; rest must clear the P/M addiction flags because the quote says “no longer addicted.” “One substance at a time” is also unclear while another substance is resting.  
   **Fix:** Write a transition table with entry invariants, immediate base-rating transitions, and an actor-wide recovery eligibility rule.

10. **Cleansing therapy can accidentally cure mental addiction.** For a mixed P/M addiction, clearing physical addiction must retain mental dependency, its dose window, and applicable losses; “clears physical addiction and returns boxes” does not specify the resulting state or clocks.  
    **Fix:** Define therapy as a partial transition that recomputes state and deadlines from the remaining addiction types.

11. **Monitor shrinkage does not use an existing death path.** [`damageUpdateFor`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:4234) runs on damage, not when a derived maximum changes. Eight existing boxes becoming greater than a seven-box maximum therefore needs explicit handling. Flooring maxima at one also invents protection absent from the quote.  
    **Fix:** Implement and test the quoted lethal threshold directly during loss transitions, with an explicit policy for zero/negative capacity and no synthetic damage through absorption.

12. **Kamikaze implant failure is reversible under the proposed formula.** Recomputing `uses ≥ floor(natural Body/2)` can restore failed implants when Body rises; at Body 1, even zero uses satisfies the formula.  
    **Fix:** Latch failure when a qualifying administration crosses the threshold, define the Body basis, and require an actual exposure.

13. **Skipping modifier collection does not disable implants everywhere.** Skillsoft capacity independently scans installed cyberware, and [`woundPenalty`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1164) independently reads compensators and pain editors. Those remain functional unless separately gated. NPCs also have a separate derivation pipeline.  
    **Fix:** Use one implant-functionality predicate across all passive calculations and activated actions, retaining installation costs.

14. **Derived-state clearing is not specified.** Conditional implant suppression or MAO adjustment can leave stale chipped ratings, modifiers, or readouts after a second preparation—the exact failure described in `CLAUDE.md`. Character and NPC monitor maxima currently reset independently to 10.  
    **Fix:** Rebuild every affected derived value in both directions from authoritative source data and test normal → suppressed → restored on the same documents.

15. **“Flags” still need a persistence contract.** No version, normalization, canonical-key validation, or legacy policy is defined. Old cards contain base ratings and old exposures lack substance history; initializing from an old test card could fabricate or lose lifetime uses. Deleting a record also deletes its supposedly permanent Essence loss.  
    **Fix:** Define versioned, validated flag records, an explicit legacy initialization policy, and preservation of permanent losses; schema migration is necessary only if schema fields change.

16. **Unlinked-token ticking is only a test promise.** “Every actor” does not specify synthetic actors on inactive scenes; iterating `game.actors` misses them, while iterating linked tokens can process the same world actor repeatedly.  
    **Fix:** Enumerate world actors plus unlinked token actors across all scenes, deduplicate by actor UUID, and test independent persisted updates after reload.

17. **Multi-document failures and tick replay remain unspecified.** A dose involves actor flags, inventory, effects, pump activation, and chat. A failure midway can grant effects without recording use or increment use again on retry. “Idempotent by value” also does not guarantee one chat report or safe handling of world-time rewind.  
    **Fix:** Give transitions stable IDs and recoverable completion markers, make chat best-effort after persistence, and define rewind/high-water behavior.

18. **The proposed tests miss the dangerous integration boundaries.** Pure large-jump equivalence cannot catch concurrent writers, stale dialogs, partial document failures, offline tokens, repeated preparation, or death from shrinking maxima. “MAO halves the pump” is also an inaccurate assertion: Reaction stays unchanged and only specified attributes change.  
    **Fix:** Add focused integration cases for those boundaries and assert exact MAO Level 1/2 values before activation, during interaction, and after removal.

The simplest reliable design is a versioned substance ledger with explicit deadlines and a transition table, driven by one authoritative writer and read through shared derived-data helpers.

VERDICT: REVISE
### Claude's response
Accepted essentially all 18. Root cause was mutable shared state; redesigned as an append-only event ledger with state as a pure fold over (events, worldTime). Clocks, idempotency, races and replay (#1–5, #15–17) fall out. Explicit transition table (#9), sticky addiction/immunity and immunity precedence (#6, #7), Karma reconcile by messageId (#8), P-only therapy (#10), death on shrinking maxima (#11), latched implant failure with one predicate across all paths and both-directions derivation (#12–14), integration tests (#18). Clean period applies only in state 'none' — a stated reading: addicted states have their own non-use rules (24 h withdrawal drops, 3-day recovery drops), so applying both would double-count non-use.

## Round 2 — Codex
The ledger removes competing tick writes, but it does **not** make the actions race-safe or replay correct by construction. These issues remain:

1. **Independent event writes preserve concurrent invalid actions (§1, §6).** With one dose remaining, owner and GM can both pass the quantity check, append different exposure IDs, and create two effects while inventory ends at zero. Two simultaneous MAO doses can likewise both see “not active.”  
   **Fix:** Serialize resource-consuming actions through one authority; test inventory, effects, and ledger together under concurrent requests.

2. **The ordering is neither total nor causal (§3).** Two successful recovery events for different drugs at the same world time have no tie-breaker, so collection order decides which recovery starts. More fundamentally, dose → test sorting moves a second dose taken *after* a failed test ahead of that test when world time has not advanced.  
   **Fix:** Give events a stable total order that preserves observed causal order, with an explicit tie-breaker for genuinely concurrent actions.

3. **Tests explicitly overwrite each other (§2).** `<exposureId>_<kind>` prevents two entries, but owner and GM rolling the same test still race on one key; repeated fresh rolls can replace failure with success without spending Karma. This contradicts “events never collide” and “only its own writer.”  
   **Fix:** Claim each exposure/type test once, reject fresh rerolls after resolution, and allow only validated Karma revisions of its designated roll.

4. **Failed recovery cannot receive the promised Karma reconciliation (§6).** Recovery is “written only on success,” so a failed roll has no event/message association for the reconciler to update when a bought success turns it into success.  
   **Fix:** Record failed recovery attempts too, with transition eligibility determined by the finalized result.

5. **Karma rewriting changes dependent history (§2).** “No other event depends on a roll” is false: an extension determines whether a subsequent dose incurs withdrawal’s +1; recovery determines weekly losses and whether another recovery is allowed. Changing an old result can invalidate later actions and leave their already-rolled TNs inconsistent. The original writer may also be offline when the GM changes the card.  
   **Fix:** Finalize and close substance rolls before dependent actions, using the existing closed-test mechanism in [`actor.mjs`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:623); handle reconciliation through the executing authorized client.

6. **The clean-period interpretation still contradicts the supplied quote (§3 and review response).** The quote conditions reductions on uninterrupted non-use, not state `none`. The “double-count” explanation especially fails for **Tolerance**, which withdrawal and recovery never reduce: an abstinent addict’s Tolerance remains elevated indefinitely. `max(1, 30−S)` also invents a rule for invalid intervals.  
   **Fix:** Track clean periods independently of addiction state, explicitly resolve overlapping Addiction reductions, and reject or flag unsupported Strength values instead of inventing a duration.

7. **Rest relapse loses the addiction types (§3).** Entering rest clears P/M, yet a dose returns the character to `addicted` without specifying which flags return. Restoring the drug’s base P/M would incorrectly add physical addiction to someone who previously had only mental addiction to a dual-type drug.  
   **Fix:** Preserve the recovering dependency types separately and explicitly restore them on relapse.

8. **Extension events are not bound to their dose window (§2, §6).** A dialog opened before another dose can finish afterward and extend the new interval. For a dual addiction, “Body or Willpower (the dependency’s)” does not define which deadline is extended or whether the other dependency becomes overdue first.  
   **Fix:** Store the target window ID and dependency type, enforce one attempt in the fold, and specify P/M deadline handling separately.

9. **Test availability conflicts with the existing effect contract (§6).** The plan allows tests on expiration, but [`drugsInForce`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:43) deliberately treats expired-but-enabled effects as active until manually ended. Characters can therefore test “after effects wear off” while still receiving those effects.  
   **Fix:** Gate tests on the same authoritative end-of-effect condition used by attributes, absorption, and drug TNs, including zero-duration exposures.

10. **Compensating deletion is not a transaction (§6).** A disconnect after appending a dose but before effect creation leaves a permanent phantom dose. Failure to delete the event does the same; deleting it can also invalidate tests already written against it. Existing `useDose` generates a fresh exposure ID on every invocation, so a user retry does not reuse the promised stable ID.  
    **Fix:** Persist a resumable dose operation with stable identity and explicit pending/committed/aborted status, and recover incomplete operations on load.

11. **Rewind affects only half the drug state (§1, §5).** Rewinding before a dose removes its uses and implant failure from the fold, but its ActiveEffect, spent inventory, absorption counter, and ACTH pump activation remain. Advancing again can replay consequences against a different physical state.  
    **Fix:** Either reconcile all dose side effects under rewind or explicitly limit rewind to a GM correction workflow that restores a consistent snapshot.

12. **Current-value death checks miss historical death (§5).** A large jump can pass through a fatal monitor shrink and later recovery that restores capacity; evaluating only the final maximum reports the character alive. The fold has neither damage history nor historical Essence inputs to detect that death.  
    **Fix:** Define death as a latched adjudicated outcome, or supply the historical inputs needed to detect and retain lethal transitions; test a jump spanning both fatal loss and restoration.

13. **The declared edit event cannot perform the promised repair (§2, §4).** Its patch supports only Addiction, Tolerance, and clearing addiction, while the implant-failure latch is supposedly removable by GM edit and the Quench test depends on that operation. It also cannot initialize historical uses or losses for existing characters.  
    **Fix:** Specify validated repair/baseline event fields for implant failure and historical counters, with explicit preservation of permanent losses.

14. **Versioning alone does not resolve legacy data or canonical drug identity (§2).** Existing cards/exposures have no corresponding dose event; old tests cannot reliably find a base snapshot. The extra `drugs` fold argument also leaves unclear whether current item edits or item deletion can change historical ratings.  
    **Fix:** Define canonical keys, snapshot precedence, legacy-card behavior, and an explicit baseline/import policy that survives item deletion and compendium updates.

15. **Time-driven re-preparation needs broader regression coverage (§5).** Re-preparing every time tick exercises in-place derivation repeatedly. NPC preparation currently adds initiative modifiers and worn armor to prepared values, so a naive direct `prepareDerivedData()` call can compound them. “Loaded token actors” also leaves inactive-scene coverage and on-access refresh unspecified.  
    **Fix:** Specify a full safe preparation/invalidation path, deduplicate linked actors, and test repeated time hooks plus inactive-scene unlinked tokens without changing armor, initiative, or chipped ratings.

16. **The reporting watermark cannot describe revised history (§6).** A late event or Karma revision can introduce a newly derived step at `t ≤ substanceReported`; a timestamp-only watermark suppresses it forever. Rewind followed by different actions has the same problem.  
    **Fix:** Track stable transition identities and revisions, or explicitly report corrections when previously reported history changes.

The proposed concurrent-write test proves only that two keys survive. Add tests for conflicting actions, permuted event arrival, frozen-world-time action sequences, failed-roll Karma recovery, interrupted dose operations, and replay across death/restoration. A simpler implementation boundary is an immutable ledger of **finalized actions**, with serialized dose commits and read-only timed derivation.

VERDICT: REVISE
### Claude's response
All accepted as 'Round 2 amendments' except #1 is resolved by the system-wide one-driver contract (stated limit, same as every other spend) rather than a new authority. Clean period now follows the quote literally (independent of state, both ratings, overlaps allowed, floored at base; S≥30 = no clean period, no invented interval). Rewind never un-does doses (#11).

## Round 3 — Codex
Several earlier gaps are closed, including clean-period reductions, relapse types, extension-window identity, and effect-end gating. The following blockers remain under the amendments:

1. **`Date.now()` is not causal ordering (amendment 2).** Two sequential actions can share a millisecond and be reversed by random IDs; a GM’s clock can also lag the owner’s despite observing the owner’s event. This fails even without simultaneous drivers.  
   **Fix:** Use a persisted logical sequence derived from observed events, with an ID tie-breaker only for genuinely concurrent events.

2. **The dose commit still spans separate documents (amendment 8).** “Committed (with the dose spend)” cannot make the actor flag and embedded item quantity one atomic write. A disconnect between them leaves either a free dose or an uncertain spend; effect existence does not distinguish those cases.  
   **Fix:** Persist inventory-spend receipts keyed by operation ID alongside the quantity change, and resume each operation stage idempotently.

3. **Effect existence is insufficient recovery evidence (amendment 8).** An effect can be created and subsequently ended before reconciliation; conversely, immune and repeat-MAO doses intentionally create no effect. “No effect → aborted” can discard an administered dose. Overuse damage and ACTH activation also lack completion markers.  
   **Fix:** Record explicit delivery and side-effect completion receipts rather than inferring administration from a currently existing effect.

4. **Finalization ignores time and ordinary gameplay (amendment 3).** A failed recovery card can remain open through weeks of losses and combat, then a bought success retroactively starts recovery at its original timestamp. Closing it only on the next *substance action* does not protect those dependent outcomes.  
   **Fix:** Require explicit roll finalization before timed consequences or gameplay consume its result; a pending roll must not retroactively rewrite settled play.

5. **Card/event reconciliation remains a two-write failure point (amendment 3).** Existing [`applyKarmaToTest`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:623) updates the chat card before synchronizing dependents. If updating the substance event fails, closing that card on the next action can freeze the wrong stored result.  
   **Fix:** Reconcile from the authoritative card before finalization, with a persisted revision and retry path.

6. **Rewind remains internally inconsistent (amendment 9).** Consider recovery at day 10, a relapse dose at day 20, then rewind to day 5. Counting both events while reversing timed progress leaves undefined how the fold processes the interval between those future-dated events. Existing “apply elapsed steps before the next event” logic would still traverse it.  
   **Fix:** Define one precise rewind algorithm; the simpler option is a monotonic substance clock, with historical corrections made through explicit GM edits.

7. **Death adjudication still uses the wrong historical damage (amendment 10).** Comparing current damage with a historical minimum can falsely kill someone who took eight boxes only *after* capacity recovered from seven to ten. It can also miss someone who had eight boxes at the seven-box minimum but healed before the GM report. Calling this adjudicated does not fix an automatic comparison.  
   **Fix:** Require GM confirmation for historical death candidates, or record damage/Essence history sufficient to evaluate the actual lethal instant.

8. **Automatic death writes can still race owner actions (amendments 1 and 10).** The one-driver limitation covers manual spends, but an active GM report can append death while an owner heals, doses, or edits relevant state. Report timing then changes the latched outcome.  
   **Fix:** Treat automatic reporting as observational; commit adjudicated death against a specific reviewed ledger revision.

9. **Pruning report IDs breaks “never re-reports” (amendment 14).** The fold retains all historical transitions, but the reported set retains only 200. Once older IDs are removed, they become “unreported” again. `eventRevision` is also undefined for timed steps depending on several events.  
   **Fix:** Keep a durable acknowledged frontier plus explicit correction revisions, or retain all reported IDs until a defined checkpoint compacts their history.

10. **Legacy cards lack the promised snapshot (amendment 12).** Existing dose cards store Addiction and Tolerance, but not Strength or the canonical drug key; those are not recoverable from the card after its effect/item is deleted. A legacy failure also has no dose window anchor.  
    **Fix:** Keep such cards informational until a GM supplies a validated baseline containing identity, Strength, and timing; do not silently synthesize incomplete history.

11. **Cleansing therapy remains underspecified for mental-only addiction (§3).** “Clears P only … boxes lost return” permits restoring losses on a mental-only addiction despite the quoted “no help for mental.” Pure-physical cleansing also lacks an explicit resulting state, and therapy during rest must update `relapseTypes`.  
    **Fix:** Define therapy transitions for P-only, M-only, mixed, and rest states, including box eligibility and removal of cured physical relapse types.

The revised tests should cover same-millisecond ordering, client clock skew, interruption between inventory and ledger writes, no-effect doses, late Karma after time advancement, both historical-death counterexamples, and more than 200 reportable transitions.

VERDICT: REVISE
### Claude's response
All 11 accepted as 'Round 3 amendments'. Design changes: Lamport seq ordering; commit (event + quantity + absorb) in one actor update with receipted idempotent side effects (no pending/abort); rolls apply at finalise time with the card read at finalisation; monotonic substance clock; Essence death automatic, monitor death a GM-confirmed candidate; unpruned report ids; legacy cards informational until a GM baseline; explicit therapy transitions.

## Round 4 — Codex
Round 3 closes several earlier gaps, but these concrete blockers remain:

1. **The “monotonic” clock still rewinds (R3 §4).** Last event at day 1 → advance to day 20 → rewind to day 5: `max(worldTime, latestEvent.t)` becomes day 5, undoing 15 days of derived progress. No event records the day-20 observation.  
   **Fix:** Persist a processed-time high-water mark, including advances without substance events, and test rewind after a long event-free interval.

2. **Essence history is not entirely in this ledger (R3 §5).** Existing Essence includes installed cyberware, awakened bioware, `essence.max`, and the manual setting—not just substance losses. A character with 0.5 remaining Essence dies after one weekly loss, although drug losses alone are nowhere near six.  
   **Fix:** Evaluate current death against actual total Essence; require snapshots or GM adjudication for historical Essence death.

3. **Receipts written after side effects still permit duplication (R3 §2).** A disconnect after overuse damage but before `receipts.overuse` causes damage again on resume. An effect created and then ended before its receipt can similarly be recreated.  
   **Fix:** Commit overuse’s receipt through [`commitDamage(..., {extra})`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:60), and define equivalent durable completion evidence for effects and pump activation.

4. **Resuming must use the original dose decision, not current state (R3 §2).** After interruption, another dose may be active, the pump may have been deactivated, or immunity may have changed. Recomputing overuse, repeat-MAO suppression, or activation eligibility can deliver different consequences.  
   **Fix:** Store the complete side-effect plan at commit, including effect data, overuse outcome, suppression reason, and target pump ID.

5. **Finalizing after a time jump changes the rules outcome (R3 §3).** A successful recovery rolled at day 0 but auto-finalized when time jumps to day 21 starts at day 21 and incurs three weeks of losses. A successful extension can likewise finalize after its deadline.  
   **Fix:** Resolve open rolls before advancing substance time, or require explicit finalization before accepting a time advance; test a jump across a recovery start and extension deadline.

6. **Finalization and card closure are still separate writes (R3 §3).** Writing `final: true` on the actor does not atomically close its ChatMessage. If closure fails, existing Karma handling can still spend Karma on the card; an automatic GM finalizer can also race an owner’s Karma operation despite the manual one-driver contract.  
   **Fix:** Make the finalized ledger record authoritative in the Karma guard, and serialize/revalidate finalization against the card revision before committing.

7. **The promised failed-recovery purchase is blocked by existing code.** [`applyKarmaToTest`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:685) requires at least one natural success to buy successes. A failed one-success recovery test has zero, so the planned “failed recovery turned by Karma” cannot work through that purchase path.  
   **Fix:** Specify whether recovery has an explicit purchase exception under the quoted rule, and implement/test that scoped behavior rather than assuming the existing button permits it.

8. **Mental-only rest still receives cleansing benefits (R3 §8).** Rest clears active P/M flags. The first therapy branch therefore says “none → no effect,” while the rest branch returns boxes regardless of whether `relapseTypes.P` exists. Depending on branch order, therapy either never works during rest or helps mental-only recovery.  
   **Fix:** Handle rest separately and require physical dependency in `relapseTypes` before granting cleansing benefits.

9. **Report identity does not identify corrections (R3 §6).** `drug:type:t` stays unchanged when a baseline edit changes the amount or resulting rating of a step at the same timestamp. Removing a previously reported step produces no replacement ID at all.  
   **Fix:** Include a semantic revision/hash and explicitly report invalidated prior outcomes, or limit reports to immutable finalized history.

10. **The historical monitor-death test still demands unavailable information (R3 §9).** “Capacity restored before damage → no candidate” cannot be distinguished from “damage existed during the low maximum” using only current damage and historical capacity. GM confirmation makes a broad candidate acceptable, but does not supply that missing chronology.  
    **Fix:** Test that both ambiguous histories produce a clearly labeled adjudication prompt, unless damage history is added.

The atomic `actor.update({items: [...]})` commit also needs a targeted Foundry integration test proving partial embedded updates preserve other items and reject the whole operation on validation failure; the plan currently asserts that guarantee without demonstrating it.

VERDICT: REVISE
### Claude's response
All accepted as 'Round 4 amendments'. A live probe showed actor.update({items}) is NOT atomic (a failing item change still wrote the actor flag) and added an item — so the commit moved onto the drug item itself (quantity − 1 + the full stored side-effect plan in one item update), with every later step idempotent and resumed from the stored plan. #7: Karma needs ≥1 natural success (SR2 core), so no Karma exception for recovery; test dropped.

## Round 5 — Codex
The live probe resolves the atomicity question, but moving the commit onto the inventory item introduces new recovery hazards. These blockers remain:

1. **Item-local commits can disappear or migrate to another actor (R4 §3).** Deleting an exhausted item before its actor-ledger write loses the only record of the administered dose. Transferring or copying an item carrying `doseCommits` can make the recipient replay the original actor’s doses.  
   **Fix:** Bind commits to the originating actor UUID, strip them from ordinary transfers/copies, and prevent deletion or transfer until unfinished commits are durably reconciled.

2. **A ready-only resume permits incorrect subsequent doses (R4 §3).** If effect creation fails after the first dose commits, another dose can run before reload, see no active effect, and incorrectly avoid overuse or repeat-MAO suppression.  
   **Fix:** Drain unfinished committed operations before every subsequent substance action, blocking dependent actions when reconciliation fails.

3. **The clock fix does not cover event timestamps (R4 §1).** The inherited event timestamp remains `max(worldTime, latestEvent.t)`. After processing day 20 and rewinding to day 5, a new dose can be timestamped day 5 despite `substanceClock = day 20`, retroactively changing deadlines and losses.  
   **Fix:** Assign every event timestamp from the same persisted monotonic clock used by the fold.

4. **Clock advancement still outruns roll finalization (R4 §4).** Raising `substanceClock` after finalization is insufficient because the fold also reads `game.time.worldTime`, which has already advanced when the time-update hook runs. Other clients can derive losses before the GM finishes closing and reading cards; without a GM, closure never occurs.  
   **Fix:** Gate substance derivation on an explicitly finalized processing frontier, with a defined no-GM policy, rather than directly consuming the new world time.

5. **Effect deletion still has a crash window (R4 §3).** A `deleteActiveEffect` hook writes its receipt after deletion. Disconnect between those operations leaves neither effect nor receipt, so resume recreates an intentionally ended effect. A deterministic ID prevents duplicate existing effects, not resurrection of deleted ones.  
   **Fix:** Persist an end-intent tombstone before deletion and make both deletion and resume honor it.

6. **Historical death prompts still require missing history (R4 §§2, 8).** “It fell while the character carried damage” cannot be determined after the character heals unless that damage was recorded. Likewise, current total Essence cannot establish a past zero after implant or manual Essence changes. The revised wording still cannot guarantee both promised ambiguous-history prompts.  
   **Fix:** Prompt conservatively whenever an unreviewed capacity-loss interval has unknown damage history, and explicitly leave historical Essence death to GM adjudication unless snapshots exist.

7. **Automatic GM finalization remains outside the stated one-driver protection (R4 §4).** An owner legitimately spending Karma can race automatic GM finalization without anyone violating the manual driver convention. Existing Karma code reads card state before awaiting writes, so a stale operation can spend Karma and overwrite the closed state afterward.  
   **Fix:** Serialize finalization and Karma through one authority, or require explicit driver finalization before processing time; naming this an unsupported race does not prevent routine automatic execution from causing it.

Add focused tests for item deletion/transfer with unfinished commits, a second dose after failed delivery, a dose during rewind, delayed GM finalization, and interruption between effect deletion and receipt persistence.

VERDICT: REVISE
### Claude's response
#1–#6 accepted as 'Round 5 amendments'. MAX_ROUNDS reached without APPROVED: #7 (Karma vs automatic finalisation) is a genuine trade-off, handed to the user with options A/B/C.
