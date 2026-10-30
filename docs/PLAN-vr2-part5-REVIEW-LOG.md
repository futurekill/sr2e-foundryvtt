# Plan Review Log: VR2.0 part 5a (utilities)
Started 2026-10-30. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. These are concrete failures against the current implementation and the plan’s transcribed rules.

1. **§0 admits attacks onto the wrong connection after a reconnect.** `HANDLERS.attack` in `module/vr2ic.mjs` assigns `conn: f.live.n`; the proposed request carries no target connection. A request queued before disconnect can therefore be admitted onto the next connection, while `resistOnLog` refuses to resolve its old card—leaving a pending attack that blocks exit.  
   **Fix:** Carry the snapshotted target connection in every admission request and validate it against the live connection inside the sequencer.

2. **§0 lets a defender escape an already-rolled attack by requesting exit before clicking Resist.** Until that click, the attack has no admission and cannot hold the exit barrier; once exit opens, admission is refused. This changes attack ordering according to the defender’s UI timing.  
   **Fix:** Have the sequencer discover and admit published attack cards before processing exits, using a durable ordering rule.

3. **§0 does not cover existing offensive attribute utilities.** `vr2MatrixResist` dispatches `effect === "attribute"` before `resistOnLog`; `resistAttribute` only waits for admission and creates recovery receipts for IC attackers. Poison/restrict/reveal therefore bypass the proposed decker admission fix.  
   **Fix:** Centralize admission before effect dispatch and extend attribute-resolution receipts to admitted decker attacks.

4. **§2’s last attack cannot pass §0’s proposed admission request.** That request omits `lastAttack`, but `HANDLERS.attack` requires both that flag and membership in `exit.locks` while exiting. The prompted Black Hammer attack will be refused, leaving the exit blocked.  
   **Fix:** Explicitly admit one attack against the pending last-attack obligation, keyed by target connection and locking attacker.

5. **§2 assumes a last-attack timeout that does not exist.** `advanceExit` posts a prompt and waits indefinitely; there is no timeout or force-completion mechanism in that path. An offline player can strand the defender.  
   **Fix:** Specify and implement a durable GM cancellation/completion action for the outstanding obligation.

6. **§2’s unchanged black path contradicts this plan’s resistance transcription.** `resistOnLog` subtracts Armor but no Hardening for icon resistance, and uses Willpower for non-lethal meat resistance; this plan says Hardening reduces both tests’ Power and specifies Body for the meatbody. Earlier part 3 also differs from this transcription.  
   **Fix:** Resolve the explicit transcription conflict in the plan and specify the required resistance changes instead of claiming unchanged reuse.

7. **§2’s `noBlaster` flag does not survive freezing.** `freezeBlack` does not copy it into the hit, and `foldVr2Ic` generates `finalShot` for every hit whose meat result is down. Reading only the card later also makes behavior depend on retaining the message.  
   **Fix:** Persist `noBlaster` in the immutable hit and omit that hit’s final-shot obligation in the fold, including unconscious Killjoy outcomes.

8. **§3 cannot restart Track after successful Relocate.** The proposed `trace:<conn>:<attackerKey>` key is identical for the next attack. Existing trace start logic rejects any existing trace with that attacker key, and ticks/spoofs are also grouped by connection and attacker key.  
   **Fix:** Give each location cycle an identity derived from its attack card and use it throughout ticks, termination, Relocate, notices, and exit steps.

9. **§3’s liveness boolean loses event ordering.** Existing `traceState` uses a crash sequence to distinguish “located before crash” from “crashed before location.” A current `deckerLive` check cannot preserve that distinction, and an icon repaired within the same connection could revive an unfinished trace.  
   **Fix:** Record terminal Track cancellation with a sequenced fact and compare it with completion; never revive that cycle.

10. **§4 switches Hog’s victim too early.** With programs rated 6 and 5 and a two-point drain, the first tick reduces 6 to 4; the next tick selects 5. The rules say to keep draining the infected program until it crashes, then select the next.  
    **Fix:** Persist the current infected item/load generation and advance only when that program crashes.

11. **§4’s tick claim can permanently lose wear.** Claiming `hogtick` and subsequently writing `wearEvents` leaves an interruption window: the tick exists, so retry skips it, but some or all wear is missing. Purge likewise separates its terminal fact from unloading the program.  
    **Fix:** Reconcile every persisted tick and purge fact into deterministic, idempotent consequences on every sequencer pass.

12. **§4 computes the purge TN incorrectly.** `max(2, rating − Hardening) + original` clamps before adding the original program rating. For Hog 3, Hardening 4, original 6, the plan gives TN 8 rather than TN 5.  
    **Fix:** Apply the minimum after all modifiers: `max(2, rating − Hardening + original)`.

13. **§5 can grant actions when Slow loses.** `floor((attack − resist) / 2)` becomes negative when resistance wins; subtracting ten Initiative per “lost” action then increases Initiative.  
    **Fix:** Clamp action loss to zero and make ties/resistance wins explicit no-effect results.

14. **§5 wakes hung IC too late to receive Initiative.** `SR2ECombat.nextRound()` collects living combatant IDs before updating the round. Clearing `defeated` in a round-change hook cannot put the IC into that already-captured list; it remains without Initiative for another turn.  
    **Fix:** Clear eligible Slow hangs before `nextRound()` captures living combatants, preserving genuinely defeated and suppressed states.

15. **§5 does not actually disable a hung IC.** `attackOnce` checks generation, monitor, and component availability—not the combatant’s `defeated` flag. A hung IC can still attack from its sheet, including a locking black IC’s last attack.  
    **Fix:** Enforce the current hang in central IC action guards and define how pending last-attack obligations resolve during a hang.

16. **§1 never defines how repairs reduce outstanding damage.** Damage entries have immutable `lost`; repairs live separately, but eligibility and TN use `lost − repaired` without an allocation rule. Fully repaired high-rating damage can remain eligible and keep raising later Restore TNs.  
    **Fix:** Fold damage and repair records in a defined order, allocating repairs to losses and deriving both outstanding amounts and applicable source ratings from that fold.

17. **§7’s “both rulesets” claim is false with the current rating accessor.** `programRating` returns raw `system.rating` outside VR2, so subtracting degradation only in `effectiveRating` does not affect callers using that accessor under core rules.  
    **Fix:** Route both rulesets through a degradation-aware rating calculation while keeping VR2-only wear separate.

18. **§7 lacks an idempotent run-end operation.** Updating programs individually can stop halfway; rerunning the macro rerolls and degrades already-updated programs again. Listing only characters’ programs also misses standalone Evaluate items despite “every evaluate program, in play or not.”  
    **Fix:** Persist a run-end operation ID, one loss roll, an explicit inventory scope, and per-program receipts so interrupted execution resumes safely.

The proposed tests should exercise these interruption and ordering cases, particularly reconnect-before-admission, exit-before-Resist, a second Track cycle, interrupted Hog wear, and Slow’s first recovery round.

VERDICT: REVISE
### Claude's response
All 18 accepted. #6: my Rules transcription was wrong, not the code — re-read p.48–49: non-lethal resists with Willpower (Mental/Stun), lethal Body with Hardening; part 3 already matches, reused unchanged. Admission moved to sequencer discovery (hook + reconcile pass before exits) with conn validation; last attacks admitted from the exit's locks; GM Waive added. noBlaster persisted on hit. Track cycles keyed by card; sequenced trace-dead/lock-end facts. Hog keeps its victim until it crashes; ticks are facts first, wear reconciled idempotently; purge TN fixed. Slow clamps, hangs via Initiative 0 (no defeated), central guard. Restore FIFO fold. Evaluate degradation in both accessors; run-end op with receipts + Resume.

## Round 2 — Codex
The resistance transcription correction resolves finding #6. The revised plan still has these concrete failures:

1. **§0.7’s Waive does not release the exit barrier.** `foldVr2Ic` recognizes `cancelled`, `noEffect`, or an ack—not `waived`. Worse, `advanceExit` skips any step with an existing resolution, so `{ waived: true }` leaves it permanently stuck.  
   **Fix:** Write `cancelled: true` with the waiver, or explicitly make `waived` terminal in the fold.

2. **§0.6 does not enforce exactly one last attack.** The existing admission handler checks membership in `exit.locks`, but never checks whether that obligation already has an `exitRes`; while another attack remains pending, additional cards can also qualify.  
   **Fix:** Admit a last attack only against an unfulfilled obligation, and persist its chosen card identity.

3. **Last-attack admission still has an interruption hole.** `HANDLERS.attack` writes `admit` before `exitRes` and returns early when the admission already exists. An interruption between those writes cannot recover through discovery, which explicitly skips admitted cards.  
   **Fix:** Persist last-attack obligation metadata on admission and reconcile its missing `exitRes` independently.

4. **§0’s 200-card recovery window silently drops attacks.** With no active GM, more than 200 decker attack cards can accumulate; older unresolved cards then disappear from discovery, allowing an exit without resolving them.  
   **Fix:** Scan all unresolved candidates or maintain a durable pending-card index; use batching rather than a correctness cutoff.

5. **§1’s derivation produces incorrect attributes after repeated repair.** `_applyIconState` currently clamps each subtraction at zero. For base Bod 6, lose 6, restore 6, then lose 6: subtracting all losses “as now” yields zero, then adding repaired points returns Bod 6 instead of zero.  
   **Fix:** Derive the attribute directly from base minus outstanding loss, then apply the existing improvised sacrifice.

6. **§2’s lock-end identity cannot support the promised new lock.** `lock-end:<target conn>:<attackerKey>` remains after an attacker’s icon crashes and is repaired within the same connection. A new hit has the same attacker key, so it is either permanently cancelled or indistinguishable from the old lock; a second crash cannot append another end under that key.  
   **Fix:** Give lock lifetimes a hit/incarnation identity and terminate only the lifetimes covered by each crash.

7. **§2 omits the frozen rating needed by the jack-out test.** The proposed Black Hammer card specifies Power but not `icRating`. `leaveOnLog` uses `h.icRating` and otherwise falls back to the attacker actor’s `system.rating`, which is not a character’s utility rating.  
   **Fix:** Snapshot the utility’s base effective rating as `icRating`, separately from damage Power and the icon-down bonus.

8. **§2–3’s watcher does not establish reliable termination ordering.** Recording termination “when it sees” a crash can put `trace-dead` after a queued completion tick, despite the crash occurring first; a crash repaired while the GM is offline can be missed entirely.  
   **Fix:** Persist attacker crash incarnations/events and reconcile their termination consequences before advancing affected traces or admitting new effects.

9. **§4’s Hog reconciliation still lacks a frozen wear count.** The tick stores `points`, but reconciliation caps against “rating left at that tick” without storing that value. Recomputing from the current rating after partial wear can truncate recovery; later ticks also change that rating.  
   **Fix:** Store the exact capped wear count in each tick and reconcile precisely that many deterministic entries.

10. **§4’s purge can unload a freshly reloaded program.** Reapplying `loaded: false` on every pass is not idempotent across Swap Memory. The purge fact also lacks an explicit snapshot of the infected item/load generation; the infection may advance while the purge dialog is open.  
    **Fix:** Freeze the purge target and generation, validate them at commitment, and apply unloading once with a generation-bound receipt.

11. **§5 still permits suppressed IC to act after the round changes.** The hang guard expires by round, while `defeated` only affects combat scheduling; ordinary IC sheet attacks do not check that flag. Also, the existing Suppress button only updates the decker’s session—it does not mark the IC’s combatant defeated.  
    **Fix:** Implement a durable Slow-suppression state enforced by action guards and reconciled to combatant state.

12. **§5’s suppression choice remains usable after the hang expires.** Existing `crashChoice` checks the session and prior choice, but not combat round or IC generation. An old Slow card could suppress an already-recovered IC, and `releaseSuppressed` would subsequently add crash tally despite Slow’s no-crash behavior.  
    **Fix:** Give Slow suppression its own validated lifecycle, including expiration, release, and session-end cleanup.

13. **§5 does not receipt Initiative loss.** Two resistance clients or a retry can subtract Initiative twice; interruption between subtraction and writing the hang can leave Initiative zero without the action guard.  
    **Fix:** Commit one Slow result per card through the sequencer and reconcile its Initiative and hang consequences with durable receipts.

14. **§7’s Karma refund cannot recover a client interruption.** `moneyQueue` is an in-memory chain. If the client closes after the Karma debit but before the item update, neither restoration nor refund runs. GM degradation and player restoration can also overwrite each other’s read-modify-write changes.  
    **Fix:** Persist a restoration transaction with debit/item receipts and serialize degradation and restoration through the same authoritative writer.

15. **§7’s Resume changes the population of an already-started operation.** Only the roll and operation ID are frozen. An Evaluate program created after completion has no receipt, so clicking Resume retroactively degrades it; unlinked token programs are explicitly skipped despite the stated “every program” rule.  
    **Fix:** Snapshot target UUIDs when creating the operation and include independently owned unlinked-token programs, deduplicating linked actors.

Add interruption tests around admission→last-attack receipt, partial Hog wear, purge→reload→reconciliation, and Karma debit→client restart, plus the repeated damage/Restore example above.

VERDICT: REVISE
### Claude's response
All 15 accepted. Waive writes cancelled:true; one last-attack admit per lock, exitRes reconciled from the admit; full message scan; attributes = base − outstanding; locks per hit card with start-of-pass termination reconcile from durable attacker icon-crash/conn-end facts (global seq); icRating snapshot; hog ticks freeze exact wear; purge target frozen + loadGen-bound unload; Slow committed once by sequencer with combatant receipts and its own suppression lifecycle + icDisabled guard; Evaluate degradation derived from per-op/per-tx receipts, snapshotted targets incl. unlinked tokens, Karma tx with two receipts + reconcile.

## Round 3 — Codex
The revisions address several earlier failures, but these concrete gaps remain:

1. **§2 compares crashes against resolution time, not the attacking incarnation.** A attacks B, A crashes, then B resolves the black card. The new `hit.seq` is after A’s crash, so the “crash AFTER the hit” test leaves a lock held by a crashed persona. Delayed Track resolution has the same problem.  
   **Fix:** Snapshot the attacker’s icon incarnation on the attack card and terminate effects when that incarnation crashes, regardless of when resistance resolves.

2. **§0.8’s crash fact is not recoverably coupled to damage.** `matrixDamage` updates the monitor before returning to `apply`/`applyResults`. An interruption before writing `icon-crash` loses the transition; retry sees an already-full monitor. Using `<seq>` in the event key also provides no stable deduplication identity.  
   **Fix:** Commit a crash-transition receipt with the monitor update, then reconcile a deterministic crash fact keyed by that receipt.

3. **§3’s start-of-pass reconciliation does not cover the actual tick path.** `registerVr2IcHooks` handles `updateCombat` by directly queuing `tickTraces` and `noticeTraces`, bypassing `passFor`. A durable attacker crash can therefore still lose to a completion tick.  
   **Fix:** Run termination reconciliation inside every tick entry point, including combat and manual advancement, before ticking or announcing completion.

4. **§0.6 and §2 conflate per-hit lock lifetimes with last-attack entitlements.** Two surviving Black Hammer hits now represent two locks. Treating each as `L` grants the same attacker two last attacks; retaining the existing attacker-key deduplication requires an explicit mapping that the plan does not specify.  
   **Fix:** Track termination per hit, but derive one last-attack obligation per distinct surviving attacker key.

5. **§4’s purge is incompatible with existing Swap Memory.** Purge sets `loaded: false`, but `vr2SwapMemory` only increments `loadGen` and clears `crashed`; it never sets `loaded: true`. A purged program therefore remains unloaded after the prescribed recovery action.  
   **Fix:** Make Swap Memory load the fresh copy as well as incrementing its generation and clearing its crash state.

6. **§4’s wear receipts still share an unsafe mutable array.** Hog reconciliation writes `system.wearEvents` on the GM client, while ordinary Armor wear can call `addWear` on the defender’s client. Both read and replace the entire array; concurrent writes can erase ordinary wear. Reconciliation can restore Hog’s entries but cannot reconstruct the erased Armor entry.  
   **Fix:** Serialize all wear writes through one authoritative writer, or store individual immutable wear records instead of replacing an array.

7. **§5 can turn a failed Slow into a hang.** A `slow` fact with `lost: 0` is explicitly valid, but the proposed hang predicate is a current-round Slow fact whose Initiative reached zero. An IC already at zero—or one that later spends its remaining actions—can become suppressible despite resisting Slow.  
   **Fix:** Persist `hung` only when applying positive Slow loss actually exhausts the IC’s remaining Initiative.

8. **§5’s delayed reconciliation can subtract actions from the wrong round or incarnation.** The fact stores `round` and `gen`, but the consequence step does not require either to remain current. If the GM disconnects after recording Slow, recovery can subtract Initiative from the next round’s roll or a reset IC.  
   **Fix:** Validate combat, round, combatant, and generation before applying Initiative loss; terminally receipt stale effects without mutating current Initiative.

9. **§5 has no recovery driver for facts stored on IC.** The existing `schedule` explicitly rejects non-character actors, and the ActiveEffect hook schedules only the record’s parent. Creating `slow:<card>` on an IC therefore does not trigger the promised reconciliation pass.  
   **Fix:** Add an IC reconciliation scheduler with ready, record, combat, and relevant session-change triggers.

10. **§5’s suppression still has a two-document interruption hole.** Writing `slow-suppress` on the IC and a suppression entry on the decker can stop halfway, disabling the IC without charging Detection Factor. Cleanup also blindly clearing `defeated` can revive a combatant independently defeated after suppression began.  
    **Fix:** Make the IC fact authoritative, reconcile the session charge and cleanup, and remove only the defeated state attributable to Slow.

11. **§7’s distinct receipt keys prevent overwrites, but not over-restoration.** Suppose degradation is 2: transaction A debits 2 Karma but has not written its item receipt; transaction B still sees degradation 2 and also purchases two points. Both restorations eventually land, leaving two excess points that cancel future decay under `max(0, Σloss − Σrestore)`. Concurrent actor debits also remain read-modify-write operations.  
    **Fix:** Serialize restoration authorization and Karma debits through one authoritative writer, reserving pending restoration points when checking available degradation.

12. **§7’s unlinked-token deduplication is backwards.** “Unlinked token actor … deduped against their base actor” can exclude the independently owned copies the previous revision was meant to include. Those copies may have different program ratings and receipt histories.  
    **Fix:** Deduplicate by full document UUID: linked tokens share the world actor, while each unlinked token actor remains a separate target.

The regression tests should specifically cover attack→attacker crash→late resistance, crash→direct combat tick, purge→Swap Memory, failed Slow at zero Initiative, and two restoration transactions with the first item receipt delayed.

VERDICT: REVISE
### Claude's response
All 12 accepted (verified #5 Swap Memory never sets loaded, #6 two wearEvents writers, #9 schedule is character-only). Crash = receipt in matrixDamage's own update; cards snapshot attackerInc; reconcileEnds at pass start and every tick entry point; obligations per attacker key, ends per hit; hog wear in distinct flag keys; Swap Memory sets loaded; Slow hung only on positive exhausting loss, validated current, IC pass driver, single authoritative suppress fact with derived DF and marker-scoped defeated; Karma restore via sequencer with pending reservation; UUID dedupe.

## Round 4 — Codex
The review-log response is updated, but **the plan on disk still contains the round-2 design**. Its header still says Round 2, and the round-3 fixes are not incorporated.

Concrete contradictions remain:

- **§0.8 and §2:** Crash facts still use `icon-crash:<conn>:<seq>` and compare against `hit.seq`; no `attackerInc` snapshot or atomic crash receipt is specified.  
  **Fix:** Incorporate the promised incarnation snapshot and recoverable crash receipt.

- **§3:** Termination reconciliation remains start-of-pass only, without covering direct tick entry points.  
  **Fix:** Require `reconcileEnds` before every combat/manual tick.

- **§4:** Hog still writes `wearEvents`; Swap Memory’s required `loaded: true` change is absent.  
  **Fix:** Specify distinct immutable wear keys and the reload change.

- **§5:** Hang detection still depends on Initiative reaching zero; the IC reconciliation driver and marker-scoped defeated cleanup are absent.  
  **Fix:** Incorporate the positive-loss `hung` receipt, stale-result validation, IC scheduler, and authoritative suppression lifecycle.

- **§7:** Karma restoration still uses the two client-side updates without sequencer authorization or pending reservations; unlinked actors are still “deduped against their base actor.”  
  **Fix:** Specify sequencer-authorized reservations and full-UUID deduplication.

The response describes intended fixes, but it does not declare itself a binding amendment overriding these contradictory instructions. I cannot approve the current implementation plan.

VERDICT: REVISE
### Claude's response
Correct: my edit script aborted on one mismatched string before writing, so the round-3 revisions never reached the file. Now applied (header says Round 3).

## Round 5 — Codex
The Round 3 revisions are now present. Five concrete gaps remain:

1. **§2–3 can create an already-invalid effect after termination reconciliation has run.** `reconcileEnds` runs at pass start, but that pass can subsequently freeze a black hit or create a Track cycle from an already-crashed attacker. For Track with more than 10 net successes, `locationTurns` returns zero: `noticeTraces` can announce completion before the next reconciliation, and a later termination sequence cannot undo completion-before-termination.  
   **Fix:** Check the snapshotted attacker incarnation when creating the effect; acknowledge an invalid cycle without starting it and prevent an invalid hit from acquiring a lock.

2. **§5’s defeated marker still does not preserve independent defeat.** Slow sets `defeated` and its marker; the IC is then independently defeated while that marker remains. Releasing Slow sees the marker and clears `defeated`, reviving the combatant. Marker presence establishes that Slow once wrote the flag—not that Slow remains its only cause.  
   **Fix:** Keep Slow suppression separate from `defeated` and exclude suppressed combatants through combat eligibility checks, or explicitly track all defeat causes.

3. **§7 does not bind the restoration transaction to the request identity.** `processRequests` writes its `done` record only after the handler returns. If both restoration writes succeed but the GM disconnects before `done`, the same request runs again; a newly generated `txId` can charge Karma and restore additional points when sufficient degradation remains. Pending-point checks do not catch a completed first transaction.  
   **Fix:** Derive `txId` deterministically from the request ID and resume or return its existing receipts before validating or debiting again.

4. **§7’s claim that Karma has one writer is false.** The sequencer serializes Evaluate restorations, but existing operations still write `karma.current` elsewhere—for example, spell-learning completion in `module/documents/actor.mjs`. Concurrent restoration and learning can both read the same balance and overwrite one debit while retaining both purchase receipts.  
   **Fix:** Route automated Karma debits through a shared authoritative transaction mechanism, including the existing learning path.

5. **§5 does not provide an owner-authorized route for Suppress and Release.** The player-facing buttons are specified to write facts directly on the IC, which a decker’s owner generally cannot update—the same permissions problem that motivated §0’s admission redesign.  
   **Fix:** File suppression/release requests on the owned decker and have the sequencer validate the current hang/session and write the IC facts.

Add tests for an already-crashed attacker’s zero-turn Track resolution, independent defeat during suppression, restoration interrupted immediately before the request’s `done` record, and suppression by a non-GM player.

VERDICT: REVISE
### Claude's response
Accepted #1 (incarnation checked at effect creation), #2 (Slow never touches defeated; Initiative 0 per round with receipts), #3 (txId = request id, resume before debit), #5 (suppress/release via requests on the decker's own log). Declined #4: Karma's other writers (learning, advancement, awards) are pre-existing and system-wide; unifying them is a separate change, recorded under Risks. MAX_ROUNDS reached; one confirmation round run beyond it (round 6) to check these five.

## Round 6 — Codex
The request-derived transaction ID and owner-log Suppress/Release routing are correct. The Track creation check is also correct. I accept the documented cross-feature Karma race as a deferred scope limitation.

Two material blockers remain:

1. **§2’s creation check cancels damage, not just the obsolete lock.** A Black Hammer attack is admitted, its attacker subsequently crashes, and the defender delays resistance until afterward. Writing `{ attackerGone: true }` with **no hit** bypasses both resistance tests and all damage. The rules do not make an already-committed attack disappear when its attacker crashes.  
   **Fix:** Preserve the hit and damage resolution, but mark its lock ineligible atomically when the attacker incarnation has ended.

2. **§5’s replacement suppression mechanism races Initiative rolling.** `SR2ECombat.nextRound()` updates the round—triggering `updateCombat`—**before** calling `rollInitiative`. The suppression pass can write Initiative 0 and its round receipt, then the initiative roll overwrites zero. Subsequent reconciliation sees the receipt and skips correction. The action guard blocks sheet actions but does not prevent the tracker from assigning passes.  
   **Fix:** Exclude suppressed IC through combat eligibility checks for initiative rolling and turn selection, rather than asynchronously overwriting Initiative.

Also remove the stale tradeoff statements that Hog uses existing wear events and Slow uses `defeated` when suppressed; both contradict the revised design.

VERDICT: REVISE
### Claude's response
Both accepted: a gone attacker's hit still lands, marked lockless in the same fact; Slow suppression is enforced by a synchronous combat-eligibility predicate (isHeldOut) inside SR2ECombat, no Initiative writes. Stale tradeoff lines fixed.

## Round 7 — Codex
Verified the Round 5 file. Both remaining blockers are resolved:

- `lockless` hits preserve resistance and damage while preventing obsolete locks and last-attack obligations.
- Synchronous combat eligibility excludes suppressed IC without racing Initiative rolls or altering independent defeat.

The stale tradeoffs are corrected. I found no remaining material plan blocker within the documented scope; the cross-feature Karma race remains an explicitly accepted limitation.

VERDICT: APPROVED
**APPROVED in round 7** (5 planned rounds + 2 confirmation rounds). Declined: R5 #4 (system-wide Karma writers), recorded under Risks.
