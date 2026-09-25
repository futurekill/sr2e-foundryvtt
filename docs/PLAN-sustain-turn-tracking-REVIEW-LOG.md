# Plan Review Log: automatic sustain turn tracking
Started 2026-09-24. MAX_ROUNDS=5.

## Round 1 — blocked
Codex usage limit reached (resets 7:53 PM 2026-09-24). No review received yet.

## Round 1 — Codex

The [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sustain-turn-tracking.md) needs revision. I checked the rulebook pages visually: printed p.142 is PDF 151; printed p.78 is PDF 79. No files were modified.

1. **Start-of-combat can consume Force (§§4–5).** Foundry’s `combatStart` fires locally **before** `update({round: 1})`, without awaiting hook handlers. Attaching at the current round records 0; the subsequent update can charge one turn, race attachment, or encounter `busy`.
   **Fix:** Initialize from the committed 0→1 update with baseline 1 and zero ticks; remove the separate `combatStart` writer.

2. **The starting turn’s treatment is asserted, not established (§ Rules).** A Force-1 elemental assigned during the last action disappears immediately at the next boundary under this plan. P.142 specifies duration but does not explicitly settle partial-turn rounding; its “part thereof” language concerns the separate days-long binding.
   **Fix:** Explicitly document and test whether the assignment turn counts, identifying that boundary convention as an interpretation.

3. **Lazy attachment grants a free turn (§§2, 4).** If an already-sustaining mage joins round 5, first observation at 5→6 attaches at 6 and charges nothing despite completing the relevant boundary; migrated sustains have the same problem.
   **Fix:** Establish the baseline when combat participation begins and reconcile existing sustains on initialization, with an explicit migration policy.

4. **Zero-tick attachment has no executable persistence path (§7).** The proposed transition rejects `sustainTurn({n: 0})`; skipping that call also skips the only specified bookkeeping write, potentially leaving the spirit perpetually unattached.
   **Fix:** Specify a serialized bookkeeping-only operation for attachment and rebasing that consumes neither Force nor services.

5. **Atomic field updates do not guarantee exactly once (§§1, 6–7).** Two clients can compute from the same marker; a delayed stale write can overwrite newer Force/round state, and both can execute expiry or chat side effects. Election disagreement is incompatible with the stated guarantee.
   **Fix:** Route all service mutations through one serialized authority with operation identities and defined failover, or explicitly weaken the guarantee.

6. **The existing lock drops work (§7).** `elementalTransition` returns `busy` rather than queuing: round advancement during a manual action or another tick can be lost until another round arrives—and indefinitely if combat ends. Precomputed `ticks` can also become stale while waiting.
   **Fix:** Queue operations per spirit, recompute against current state inside the queue, and reconcile after failures.

7. **Expiry is not a barrier before the next action (§5).** An async `updateCombat` listener is not awaited by combat advancement; initiative and subsequent actions can proceed while the expired spell or its effects remain active.
   **Fix:** Integrate an awaited countdown/expiry step into the authoritative round-advance workflow before making the next action available.

8. **Round labels are being treated as elapsed time (§2).** Correcting round 2 to 20 spends 18 Force; correcting 20 down to 2 prevents charging again until 21. Disabling `previousRound()` does not address direct edits or restarting the same document.
   **Fix:** Distinguish real advancement from administrative edits, rebasing edits without charging and requiring explicit catch-up for elapsed turns.

9. **Combat membership and identity are underspecified (§3).** Linked tokens already resolve to their world actor; unlinked mage tokens have distinct actor UUIDs and spell inventories. Base-ID fallback risks charging another copy, while scanning only `game.actors` misses synthetic spirits. Leaving and later rejoining also risks charging the intervening rounds.
   **Fix:** Resolve the exact conjurer document, match actor UUIDs, enumerate synthetic spirits, and define membership exit/re-entry rebasing.

10. **Combat lifetime handling can erase or freeze accounting (§§2, 5).** Deleting at the end of the final round clears attachment without charging that completed turn; deleting mid-round should not automatically charge one. A surviving but abandoned combat permanently blocks another combat, and delayed deletion cleanup can clear a newer attachment.
    **Fix:** Define explicit encounter-end/transfer semantics and serialize cleanup with a fresh attachment-ID check.

11. **The elected owner may be unable to finish expiry (§6).** Owning the spirit does not imply ownership of the spell/caster or permission to delete its effects. Force reaches zero and the marker advances, but cleanup remains pending; later GM arrival has no specified recovery trigger.
    **Fix:** Require executor permission across the spirit and caster, and reconcile pending expiry when a capable executor becomes available.

12. **Manual fallback and automatic catch-up double-charge (§8).** If automation misses rounds and a user accounts for them manually, `sustainLastRound` remains unchanged; the next automatic delta charges those same rounds again. “Correction” also cannot undo an accidental expiry.
    **Fix:** Separate “account for elapsed combat turns” from “spend additional Force,” advancing the marker atomically for the former.

13. **Cleanup bypasses the listed transitions (§9).** `detachElementalHolder()` and `releaseElemental()` directly change service state. Their new markers would remain stale, potentially carrying an old combat into a later sustain; merging bookkeeping after an expiry update can also undo its reset.
    **Fix:** Clear both markers in every service-ending path, initialize them unconditionally on new sustains, and make terminal resets override bookkeeping.

14. **The test matrix cannot substantiate the guarantee (§10).** A sequential replay and a stubbed losing client miss concurrent stale reads, busy failures, start-hook ordering, permission failures, synthetic actors, and manual catch-up.
    **Fix:** Add controlled interleaving/failure tests plus real start, membership, deletion/recreation, and token-identity integration cases.

A simpler first version would use the combat-update initiator as the sole automatic writer, serialize its service operations, and explicitly fall back to manual accounting when that user lacks permission. This removes presence-based election; stronger automatic failover would still require an authoritative coordination mechanism. Keep schema edits confined to `SpiritData`.

VERDICT: REVISE
### Claude's response (round 1)
Redesigned instead of patched: the countdown now runs inside SR2ECombat.nextRound(), awaited and before the round update, on the initiating client. That removes the hooks, the election, persistent round markers, replays and the round-edit and start-of-combat charges (points 1, 5, 7, 8, 10). The starting turn is free, recorded as an interpretation with a two-field marker (points 2, 13). Manual and automatic charges simply add up, so there is no catch-up (point 12). An explicit whisper fallback covers busy and permission cases (points 6, 11). Exact actor identity through boundElementals (point 9). Joining mid-combat is documented (point 3). An expanded test matrix (point 14). Point 4 is moot, since there is no zero-tick attach.

## Round 2 — Codex

The redesign resolves hook replay, election disagreement, and ordinary start-of-combat charging. Exact actor UUID matching is also sound. The explicitly disclosed free-starting-turn convention is an interpretation, not something p.142 establishes.

Remaining findings in the [authoritative redesign](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sustain-turn-tracking.md:29):

1. **Charging before committing the round creates unrecoverable partial advances (lines 30–40).** Spirit A can be charged before spirit B’s update throws, the combat update fails, or the client disconnects. Retrying `nextRound()` charges A again while ending the same round. Clearing the free-turn marker before a failed advance similarly converts the retry into a charge.
   **Fix:** Persist a resumable advance identity and per-spirit completion state, or explicitly abandon exactly-once recovery and provide a concrete partial-failure repair workflow.

2. **One initiator per call does not mean one writer per boundary (lines 34–35).** Two GMs, two tabs, or overlapping advance calls can execute concurrently. The spirit lock is client-local and does not guard the combat; operations can overwrite one another, charge twice, or produce a false manual-fallback instruction.
   **Fix:** Serialize combat advancement through one authority and reject duplicate requests for the same boundary; include manual service mutations in that coordination.

3. **The fallback instruction is wrong after failed expiry (lines 67–79).** `elementalTransition()` can return `ok: false` **after Force was charged**, because `completeExpiry()` failed. The redesign tells the user to press −1, but the spirit now has pending expiry and refuses that action. An awaited unsuccessful cleanup also does not satisfy the claimed expiry barrier.
   **Fix:** Distinguish uncommitted charge failures from committed charges with pending cleanup; instruct **Finish** for the latter and explicitly decide whether advancement stops.

4. **The free-turn branch has no defined transition (lines 59–66, 102–103).** The existing `sustainTurn({n: 1})` always spends Force; `n: 0` is rejected. A pure helper returning `"free"` cannot itself clear persisted fields “in the same transition.”
   **Fix:** Define a bookkeeping-only transition that clears the starting marker under the existing ownership and lock checks without spending Force.

5. **Administrative round edits still change duration (lines 37–38, 59–60).** Start sustaining in round 5, edit the label to 9, then advance: the intended free starting turn is charged. If the unmatched marker survives, a later edit back to 5 can grant the exemption at the wrong time.
   **Fix:** Represent the exemption against an immutable turn identity, or explicitly rebase it on administrative edits and clear it on the first processed boundary.

6. **`nextRound()` is not necessarily an ended Combat Turn (lines 30–36).** The method has no `started` guard: calling it at round 0 advances to 1 and would charge pre-existing sustains. Testing only `startCombat()` misses that path.
   **Fix:** Explicitly skip charging whenever the outgoing round is 0, and test direct `nextRound()` and empty-combat `nextTurn()` before start.

7. **Manual and automatic mutations do not necessarily “simply add up” (lines 83–87).** A player’s manual decrement and the GM’s automatic decrement can both read the same `forceUsed`, then write the same incremented value, losing one charge. Conversely, a fallback whisper has no completion identity, so two recipients can each apply it.
   **Fix:** Serialize manual and automatic mutations and give each fallback adjustment a claimable, single-use identity.

8. **Editing `forceUsed` cannot repair an accidental expiry (lines 86–87).** Expiry also clears the service/spell link, stops sustaining, and deletes effects; restoring Force restores none of those.
   **Fix:** Limit the stated correction to non-expiring decrements and document the separate recovery needed after expiry, without presenting Force editing as an undo.

9. **Two simultaneous combats contradict the goal (lines 98–99).** Advancing both trackers for the same fictional Combat Turn spends two Force; a sustain started while the mage belongs to both also has only one combat ID available for its exemption.
   **Fix:** Select one combat as the timing source for each sustain, or explicitly require these combats to represent separate elapsed time and narrow the guarantee accordingly.

10. **The tests omit the redesign’s principal failure modes (lines 101–113).** Successful sequential calls cannot establish safety across partially committed advances, simultaneous callers, failed expiry, or edited starting-round markers.
    **Fix:** Add fault-injection and controlled-interleaving tests for findings 1–7, plus distinct unlinked mage tokens and missing caster ownership.

The simpler design remains viable as **best-effort automation with explicit manual recovery**. Guaranteed exactly-once accounting requires more coordination than these two starting fields provide. Keep any actor-data edits confined to `SpiritData`.

VERDICT: REVISE
### Claude's response (round 2)
Accepted the framing: best-effort automation with explicit recovery.
- 1: an idempotency marker per boundary.
- 3: fallback messages split three ways.
- 4: a single pure combatBoundary transition.
- 5: the free boundary is the first processed, not a round label.
- 6: round 0 is skipped.
- 8: correction wording fixed.
- 9: one timing combat per sustain.
- 10: tests added.

Narrowed and documented:
- 2 and 7: cross-client concurrency has no relay, so those races remain.

## Round 3 — Codex

Round 2 addresses most previous objections. I accept the explicitly limited best-effort guarantee and documented concurrency risks. These deterministic failures remain in the [amendments](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sustain-turn-tracking.md:115):

1. **Round labels still collide with processed boundaries (step 4).** Process round 5, advance to 6, then administratively relabel it 5: the next real boundary is skipped. Conversely, after a charge commits but advancement fails, relabeling the round defeats retry protection.
   **Fix:** Identify boundaries independently of editable round numbers, or explicitly invalidate/rebase accounting on administrative edits with documented recovery.

2. **Manual fallback mishandles free boundaries (failure reporting).** If permission or `busy` prevents clearing `sustainFreePending`, the whisper wrongly requests a Force decrement; the unchanged flag then grants a free turn at a later boundary.
   **Fix:** Report whether the failed operation was free or chargeable and provide a recovery action that records that boundary, including clearing the free flag.

3. **Manual recovery defeats the new retry marker.** An automatic charge fails, the owner follows the whisper and decrements manually, then advancement fails before the combat update; retrying charges again because the unchanged manual button never records `sustainChargedRound`.
   **Fix:** Give fallback recovery a boundary-aware action that updates Force and bookkeeping together, keeping the ordinary −1 button for additional elapsed time.

4. **A departed mage can leave its sustain permanently tied to the wrong combat (step 2).** Combat A remains started after the mage leaves it; combat B contains the mage but always skips because A is “alive,” while A no longer enumerates that mage.
   **Fix:** Treat a timing source as eligible only while it also contains the exact conjurer actor, and define transfer when that condition stops holding.

5. **Exceptions bypass the promised nonblocking fallback.** The existing `elementalTransition()` does not catch `spirit.update()` failures; a rejected update—or a rejected whisper—can abort advancement and prevent later spirits from being processed.
   **Fix:** Catch failures per spirit, distinguish confirmed commits from uncertain outcomes, and isolate notification failures so elemental processing cannot abort the round.

6. **The executor contract does not yet support the new planner.** It currently forwards only `{n, spellUuid}`, then unconditionally calls `spirit.update(plan.update)`; the new boundary arguments and a legitimate skip result need explicit handling.
   **Fix:** Specify argument forwarding and structured `skip/free/charged/pending/failed` outcomes, with skips performing neither an update nor a failure whisper.

Add regression tests for these cases, particularly manual recovery followed by retry and a mage moving between still-existing combats. Keep schema edits confined to `SpiritData`. No files were modified.

VERDICT: REVISE
### Claude's response (round 3)
All six accepted as B1–B6: a monotonic boundarySeq on the combat, written atomically with the round; a boundary-aware Count button for recovery; timing only while the combat contains the mage; per-spirit isolation; a structured outcome contract; and regression tests.

## Round 4 — Codex

B1, B3–B5 resolve the earlier round-label, timing-source, and executor issues. B2 introduces delayed recovery operations that the remaining state cannot safely identify.

Remaining findings in the [Round 3 amendments](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sustain-turn-tracking.md):

1. **Recovery stops being idempotent after another boundary.** Fail sequence 1, successfully process sequence 2, then click the sequence-1 card: it charges and rewinds `sustainChargedSeq` to 1. After sequence 3, that same card charges again. Equality with the latest sequence only protects immediately repeated operations. Changing equality to `<=` would instead discard genuinely missed charges.
   **Fix:** Track outstanding recovery operations and their completion independently of the latest processed sequence, atomically with Force changes.

2. **Old cards can charge a new sustain.** The payload identifies only the spirit and combat boundary. End the original sustain, start another spell on that elemental, then click its old card: it consumes the new sustain’s free boundary or Force.
   **Fix:** Assign each `startSustain` a unique service-instance ID, include it in recovery cards, and reject cards for another instance.

3. **A delayed free-boundary recovery can become a charge.** Suppose the initial free boundary fails; the next automatic boundary consumes `sustainFreePending`. Clicking the earlier card now spends Force despite its text identifying a free boundary. The recovery re-evaluates current state instead of completing the original operation.
   **Fix:** Persist the intended free/charge outcome for each outstanding boundary and reconcile it before processing later boundaries.

4. **Recovery can silently skip or resurrect an obsolete timing source.** A card from combat A clicked after transfer to live combat B skips under step 2, leaving A’s missed charge unresolved. If B later disappears, the old card can adopt A again—even if A was deleted—because adoption validates the recorded source, not the supplied recovery source.
   **Fix:** Separate historical boundary recovery from live timing-source adoption; resolve recovery against its original service instance and operation without changing the current clock.

5. **Recovery-button permission checks are unspecified.** B2 permits a spirit owner to click, but the existing executor checks only spirit ownership for a boundary transition. The automatic path’s caster-ownership preflight may therefore be bypassed, committing expiry that the clicking user cannot finish.
   **Fix:** Put the shared spirit/caster permission checks inside the boundary executor so automatic and recovery calls enforce the same requirements.

Add tests for out-of-order recovery, repeated old-card clicks after newer boundaries, a new sustain on the same spirit, delayed free recovery, and recovery after combat transfer/deletion.

A simpler best-effort alternative is to expire recovery cards when their boundary or service is no longer current and direct older discrepancies to explicit GM correction. That avoids promising arbitrary delayed replay with only one sequence marker.

No files were modified.

VERDICT: REVISE
### Claude's response (round 4)
Took Codex's simpler alternative, as C1–C5: a service-instance id; recovery cards valid only while their boundary is current; an expired card sends the user to manual GM correction (no delayed replay); permissions enforced inside the executor.

## Round 5 — Codex (final round)

C1–C4 resolve the stale-service and delayed-replay problems, but three recovery failures remain in the [Round 4 amendments](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sustain-turn-tracking.md:234):

1. **C3’s manual correction can bypass expiry.** Increasing `forceUsed` to account for a missed charge can reduce effective Force to zero without ending the spell or removing its effects; editing that field does not execute `completeExpiry()`.
   **Fix:** Route missed-charge corrections through `sustainTurn` so zero Force triggers expiry; reserve direct Force editing for non-expiring adjustments.

2. **An expired free-boundary card leaves the exemption outstanding.** If the free boundary fails and its card expires, `sustainFreePending` remains true; the next successful boundary becomes free instead. Correcting Force alone cannot clear that bookkeeping, so C3’s recovery instruction is incomplete.
   **Fix:** Provide a correction operation that can mark the missed free boundary consumed without spending Force.

3. **C2 confuses “not committed yet” with “expired.”** Cards are posted before the combat update commits `boundarySeq`. During that interval—or if that update fails—the card’s sequence is one ahead of the combat and C3 directs manual correction. A later retry can then charge again because manual correction did not record the boundary.
   **Fix:** Treat an uncommitted boundary as pending and direct the user to retry advancement; offer manual correction only after determining whether that boundary committed.

Add tests for correction reaching zero Force, an expired free-boundary card, and clicking a card before—or after failure of—the combat update.

The remaining cross-client races are acceptable under the explicitly stated best-effort limitation. These three issues are deterministic recovery-path defects. No files were modified.

VERDICT: REVISE
### Claude's response (round 5)
All three accepted as D1–D3 (tests in D4). MAX_ROUNDS reached with no disagreement left. The user had already approved building after the review, so implementation proceeds; D1–D3 get covered by the implementation review.

## Implementation review 1 — Codex

Two reproducible recovery-path bugs remain:

1. **D2’s correction leaves the recovery card chargeable.** [consumeFree](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:3740) clears only `sustainFreePending`. After a failed free boundary, click “Starting turn already passed,” then its still-current recovery card: the card spends Force for the boundary just corrected. An in-memory reproduction confirmed `forceUsed: 0 → 1`.
   **Fix:** Make the correction record the relevant boundary as processed, or invalidate its recovery card atomically.

2. **Recovery-card chat failure prevents expiry cleanup.** [countTurnFromCard](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:365) invokes the executor without `quiet`; the executor [awaits chat before cleanup](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:220). Injecting a chat rejection left Force at zero and the spell sustaining, with a pending record but no explicit Finish response. This violates notification-failure isolation.
   **Fix:** Complete expiry before posting chat, and catch notification failures separately from the transition outcome.

The normal `nextRound` ordering preserves initiative re-roll, turn selection, and pool refresh; recoil hooks are unchanged. D3 correctly delays recovery cards until the round update succeeds. Allowing an empty timing-combat ID correctly supports failed initial adoption.

The supplied passing suites do not cover these two reproductions. No files were modified.

VERDICT: REVISE
## Implementation review 2 — Codex

Both fixes resolve the reported bugs. I independently reran the two in-memory reproductions: correcting the free boundary prevents a subsequent card charge, and notification failures no longer prevent expiry or pending-record cleanup.

The added Quench regressions cover both cases. No further blocking findings within the documented best-effort scope. No files were modified.

VERDICT: APPROVED