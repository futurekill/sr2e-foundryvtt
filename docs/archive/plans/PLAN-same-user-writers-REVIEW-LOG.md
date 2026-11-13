# Plan Review Log: same-user background writers
Started 2026-10-19. MAX_ROUNDS=5.

## Round 1 — Codex

The plan still has material correctness gaps. I would revise these before implementation:

1. **Cleanup can delete another writer’s live claim** (plan lines 40–41). A holds attempt 0, stalls; B takes attempt 1; A resumes and its `finally` deletes B’s claim. C can then acquire attempt 0 while B is still executing. Reusing attempt numbers also permits delayed deletes to hit later claims.
   **Fix:** Delete only the acquisition’s own uniquely identified claim; handle obsolete claims through separate cleanup that cannot target a current holder.

2. **A timeout does not establish that the holder crashed** (lines 34–38, 87–89). A suspended browser or delayed request can resume after takeover and continue writing alongside the new holder. This directly contradicts the stated server-enforced exactly-once goal; increasing the timeout or adding client-side ownership checks cannot close the check/write race.
   **Fix:** Either require server-enforced fencing for takeover or explicitly downgrade the guarantee and avoid automatic takeover while the previous writer might resume.

3. **Another client can permanently suppress a fresh dose’s effect.** In `completeDose`, only `COMMITTED_THIS_SESSION` permits effect creation. Client A commits a dose; B’s `settleSubstances` wins the claim, records `effect: "lost"`, posts the card, and clears the commit. A then cannot finish its valid fresh effect. “Steps unchanged” preserves this bug.
   **Fix:** Acquire ownership before publishing the dose commit and retain it through initial completion; define recovery eligibility separately from the session-local set.

4. **Busy recovery has no eventual retry** (lines 48–53). A crashes holding a fresh claim; B reloads, sees busy, and finishes its one-shot `resumeAllDoses`. Nothing runs when the claim becomes stale. Maneuver recovery similarly runs on message creation or ready, so an unapplied result can remain stranded.
   **Fix:** Schedule bounded retries for unfinished busy work, including after reconnect and writer changes, and cancel them once durable completion is observed.

5. **The proposed tests do not establish cross-client server exclusion** (lines 64–76). Two calls in one browser share document collections, session sets, and the `damage:${actor.uuid}` queue—even when the dose queue is bypassed. They cannot validate independent client caches or receipt visibility. Also, v13.351 observations do not establish v14 behavior: the [v14 API documents `keepId` as ID preservation](https://foundryvtt.com/api/v14/interfaces/foundry.abstract.types.DatabaseCreateOperation.html), not an atomic locking contract.
   **Fix:** Require independent-browser tests on both v13 and v14, for world and synthetic actors, with server-persisted assertions and forced delays between claim creation, writes, and deletion.

6. **Socket delivery order is insufficient proof of fresh document state** (lines 19–21, 43–44). Receiving packets in order does not by itself establish completion order of asynchronous document processing, nor freshness of a retained synthetic actor/item reference. The plan needs evidence for the actual Foundry processing path.
   **Fix:** Establish and test a document-state synchronization barrier after acquisition, and reacquire current actor/item references before checking receipts.

7. **Per-result maneuver claims do not order different results.** An older result R1 can pause during acquisition while R2 acquires a different claim and writes a newer `position`; R1 then overwrites it. The session check also occurs before the new asynchronous acquisition, so it can become stale.
   **Fix:** Revalidate both sessions inside the protected operation and serialize maneuver application per actor with durable ordering checks for superseded results.

8. **Dose claims do not protect the spend or shared damage state.** Two `useDose` calls can both pass settlement, create different exposure IDs, and spend from the same quantity snapshot; their claims never conflict. Different dose recoveries can also read the same monitor or absorption counter and overwrite one another’s damage updates.
   **Fix:** Coordinate dose planning/spending per actor and serialize shared damage mutations across clients, or explicitly document these remaining races and narrow the guarantee.

9. **The release-before-clear justification creates unnecessary complexity** (lines 45–47). A crash can orphan a claim anywhere, so clearing the commit first is not uniquely responsible for orphan markers. Releasing first deliberately permits another acquisition while completion bookkeeping remains unfinished.
   **Fix:** Clear the commit while holding the claim, release in `finally`, and clean orphan markers independently of pending commits.

10. **A resolved create call is not enough evidence of acquisition.** Foundry’s creation workflow permits cancellation through pre-create processing; the plan handles rejection but never requires a returned claim document. An empty result must not authorize `fn()`. See the [v13 Document lifecycle API](https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html).
    **Fix:** Run `fn()` only after verifying that creation returned the expected claim with this acquisition’s identity; treat cancellation as failure to acquire.

VERDICT: REVISE
### Claude's response
- #1, #2, #4, #9: dropped the lease entirely. Each non-idempotent step is arbitrated by its own embedded marker (at most once); no takeover, no timeout, no busy state, no retry needed. A crash between winning and acting loses that step, visibly — chosen over doubling.
- #3: accepted (a real pre-existing cross-client bug): commits carry committedAt; a missing effect is created within 5 min of the commit on any client; the effect create is its own arbiter.
- #5: partly. Arbitration is server-side, so concurrent creates from one browser exercise it; v14 re-verified empirically on the isolated install + a manual two-browser QA entry.
- #6: moot (no post-claim re-read is relied on).
- #7: VR2 maneuvers moved out of scope: their writes are pure sets carried by the message; result ordering is a separate property.
- #8: documented as out of scope (general last-write-wins between editors, not the election race).
- #10: accepted: win only if the create returned the document.

## Round 2 — Codex

The revision removes the lease race, but independent step claims introduce new ordering failures. These remain material:

1. **A loser can advance past an unfinished prerequisite.** A wins the overuse marker and pauses before `commitDamage`; B loses that marker, creates this dose’s effect, and finishes. A then computes damage with the new effect active—allowing the dose’s own Kamikaze absorption or Hyper overload to affect its overuse wound, contrary to `completeDose`’s explicit ordering requirement.
   **Fix:** Require durable completion of each prerequisite before advancing; losing a marker must mean “pending,” not “step finished.”

2. **Losing the event step can corrupt the ledger permanently.** A wins the event marker but crashes before writing the event. B proceeds and writes nested receipts under that exposure ID, creating an incomplete event. Subsequent `if (!ev())` checks see that object and never restore the dose event, snapshot, effect plan, or absorption counter.
   **Fix:** Do not execute downstream steps until a complete dose event exists; preserve unresolved commits for explicit recovery.

3. **Clearing the commit while another winner runs breaks `settleSubstances`.** B can clear the commit and report successful settlement while A still owes damage or pump activation. Subsequent substance actions—and item deletion—then proceed against unfinished state. Holding the plan in memory does not preserve the settlement barrier.
   **Fix:** Clear commits only after every required step has a durable completion receipt or an explicit, visible terminal failure.

4. **The claimed visibility of lost steps does not exist.** `renderDoseCard` prints the Light Stun statement from `st.overuse`, regardless of the damage receipt; it does not omit a wound line when damage was lost. A card winner that crashes before posting leaves no card at all, while a loser can still write `receipts.card = true`.
   **Fix:** Record completion only from actual success evidence and expose unresolved/failed steps through a persistent GM-facing status independent of the dose card.

5. **The effect is not a permanent arbiter because users can delete it.** B checks “no effect, no tombstone” and pauses before creating; A creates the effect and the user ends it; B’s delayed create can then succeed with the now-free ID. The five-minute eligibility window permits this across clients, and a client-side tombstone check cannot fence an already prepared create.
   **Fix:** Give effect creation a persistent one-shot marker separate from the deletable effect, with explicit handling for an interrupted winner.

6. **TTL cleanup contradicts the at-most-once guarantee.** The acknowledged paused-client case is precisely a violation: A retains a plan, the marker expires and is deleted, and a delayed duplicate can acquire the same step again. Checking the commit only at function entry cannot prevent this.
   **Fix:** Retain permanent deduplication evidence, or explicitly limit the guarantee to the retention period and stop describing it as unconditional at-most-once.

7. **The VR2 exclusion’s justification is incorrect.** Two identical writes are harmless only without intervening writes: A applies R1, then R2 applies—or an attack consumes R1’s bonus—then B’s delayed duplicate of R1 restores the old state. This is the original same-user duplicate problem, not merely ordering between distinct results.
   **Fix:** Either retain VR2 duplicate suppression in scope or document the delayed-duplicate overwrite/resurrection bug as explicitly unresolved.

8. **The tests miss the new failure modes.** Concurrent happy-path calls do not test a winner paused after marker creation, another client advancing past it, creation followed by deletion, or a claimed step whose operation rejects.
   **Fix:** Add controlled interleaving and failure tests at every marker/action boundary, plus independent-browser verification on both supported Foundry versions.

A simpler direction is one persistent claim for the whole dose, with losers preserving the pending commit and settlement barrier, plus explicit recovery for an interrupted holder. That preserves step order and makes the deliberately accepted loss policy reviewable.

VERDICT: REVISE
### Claude's response
Adopted Codex's suggested direction: ONE claim per dose, taken by the dosing client BEFORE the commit (so R1 #3 needs no freshness window); non-holders are PENDING and the settle barrier holds (#1, #2, #3); receipts only from actual success (#4); only the holder creates the effect (#5); markers retained 24 h and never while their commit is open, guarantee stated as retention-limited (#6); VR2 back in scope with per-result markers (#7); interleaving/failure/stuck tests added (#8). Interrupted holder: GM-confirmed recovery via a deduplicated GM card that claims the next generation — no automatic takeover.

## Round 3 — Codex (after quota reset)

The normal dose path now preserves ordering and the settlement barrier. Recovery still has material gaps:

1. **GM confirmation does not fence the previous holder (§3).** A pauses after checking a receipt; the GM claims g1; A resumes with `held: true` while g1 runs. Both can post cards or apply damage. This happens after two minutes, well within marker retention.
   **Fix:** Make recovery explicitly conditional on terminating the previous execution and reconciling outstanding writes; otherwise label it an unsafe override, not an exactly-once recovery.

2. **The recovery notification can disappear permanently (§3).** A wins `dose.<exp>.g<n>.stuck` and crashes—or posting rejects—before creating the card. Every subsequent detector loses that marker. Substance actions remain blocked while claiming “the GM has a card,” although none exists.
   **Fix:** Provide a persistent sheet-based pending-dose list and recovery action independent of chat delivery; treat the whisper as a best-effort notification.

3. **Nothing schedules detection when a pending dose becomes stuck (§3).** A reload before two minutes sees PENDING, then `resumeAllDoses` ends. Crossing `STUCK_MS` triggers nothing. Recovery requires another action or reload, and the promised GM card may never appear.
   **Fix:** Schedule a detection-only recheck at the threshold, including after a failed recovery generation; do not automatically take over.

4. **Recovery still assumes fresh receipts without establishing that prerequisite (§3).** Even if the former holder is dead, claiming a different generation does not itself establish that the recovering client has applied all prior document updates. `completeDose` checks local actor flags and `game.messages`; stale state can repeat damage, reset absorption, or duplicate the card.
   **Fix:** Require synchronized authoritative state before recovery and test recovery with delayed receipt/chat processing in independent browsers on both versions.

5. **VR2 checks become stale across the new claim request (§5).** The existing session check occurs before acquisition. A result can pass it, wait for claim creation, then write after an icon disconnects or reconnects. A delayed first application can also overwrite a newer result; duplicate exclusion alone does not solve that.
   **Fix:** Revalidate sessions and `applied` after acquisition, and either enforce result ordering or explicitly retain delayed-first-application ordering as an unresolved limitation.

6. **The failure tests stop before the dangerous recovery interleaving (§6).** Pausing g0 while an ordinary resume returns PENDING proves exclusion only before takeover. It does not exercise the procedure that introduces a second authorized holder.
   **Fix:** Add tests that resume g0 during g1 recovery, fail notification posting after its claim, and fail g1 before completion; assert both data integrity and continued access to recovery.

The simplest remaining improvement is a persistent pending-dose UI with advisory chat notifications, plus an explicit recovery precondition that the former execution has stopped. A confirmation click alone cannot supply that precondition.

VERDICT: REVISE
### Claude's response
- #1: accepted that a click cannot fence; recovery is now an explicitly labelled GM OVERRIDE ("only if that device is closed"), plus a per-step superseded check in the holder as mitigation.
- #2, #3: chat card and stuck marker dropped; a persistent, render-time "Unfinished doses" list on the sheet (GM override button after 2 min). No scheduling needed.
- #4: stated as an assumption (override >= 2 min after the holder's last write, ordered broadcasts); receipts skip completed steps. Not enforceable client-side.
- #5: revalidate sessions + applied after acquisition; delayed first application across results documented as unresolved (pre-existing).
- #6: tests added: g0 resumed during g1 override, failed g1 then g2.

## Round 4 — Codex

The normal execution path is now sound enough to implement. The override still presents unsafe conditions as sufficient for recovery:

1. **“Closed or offline” is not a safe recovery precondition (§3).** An offline tab can reconnect and resume; closing one tab also does not stop another connection of the same user. The marker stores only `user`, so the UI cannot identify the “device named.” The per-step check cannot stop an already-issued write.
   **Fix:** Require closing all potentially executing connections of the recorded user, explicitly exclude “offline” as sufficient, and label the action “Force finish — may duplicate effects.”

2. **Marker age does not establish receipt freshness (§3 and review-log response #4).** The timestamp records acquisition, not the holder’s last write. A two-minute-old holder could have written milliseconds before the override. The review log’s “≥2 min after the holder’s last write” is therefore false, and the confirmation mentions a running device but omits stale or outstanding writes.
   **Fix:** Remove the last-write/freshness claim and explicitly include outstanding writes and stale receipts in the override’s risk disclosure; require reconciliation before forcing completion.

3. **The recovery button does not become available merely as time passes (§3).** Eligibility is computed only at render. A sheet opened before two minutes can remain indefinitely without the button, despite being described as “persistent and live.”
   **Fix:** Add a refresh action or a render-only timer at the eligibility threshold; test an already-open sheet crossing that threshold.

These are focused corrections to the recovery contract and UI; the one-holder dose sequencing, pending settlement barrier, and restored VR2 duplicate suppression address the earlier structural problems.

VERDICT: REVISE
### Claude's response
All three accepted: the button is "Force finish — may duplicate effects", the confirm requires closing every tab/device of the holder user (offline is not enough) and discloses outstanding/unseen writes; the freshness claim is removed; a one-shot render timer surfaces the button on an already-open sheet at the threshold (tested).

## Round 5 — Codex

No remaining material blockers within the stated scope. The revision addresses the recovery disclosures and live-button issue while preserving one-holder sequencing and the settlement barrier.

Two nonblocking clarifications:

- **Conflicting button labels:** §3 still says “Finish it here” before specifying the warning label. **Fix:** Use “Force finish — may duplicate effects” consistently.
- **Failed-generation test timing:** g1’s failure does not immediately make its fresh marker overridable. **Fix:** Advance the test clock past `STUCK_MS` before attempting g2.

Approval is for implementation, not certification of server behavior; complete the planned integration and two-browser checks before shipping. Forced recovery, retention expiry, and delayed first VR2 applications retain the explicitly documented limitations.

VERDICT: APPROVED
### Claude's response
Both nonblocking clarifications applied (one label; the g2 test advances past STUCK_MS). Plan final.
