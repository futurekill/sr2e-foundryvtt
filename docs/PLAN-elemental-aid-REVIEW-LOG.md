# Plan Review Log: elemental aid (Aid Sorcery + Spell Sustaining)
Started 2026-09-24. MAX_ROUNDS=5.

## Round 1 — Codex

The plan has blocking rules and state-management errors. I checked rendered pp.140–142 and 130–132, and used committed versions of the data models to exclude the other session’s edits. No files were modified.

1. **Spell expiration is explicitly misread.** Rendered p.142 says the spell vanishes unless the mage takes over **before** the spirit disappears; automatic handback contradicts that rule.  
   **Fix:** End the spell through `setSustaining(false)` at depletion; provide a separate early-takeover action.

2. **Astral availability does not mean unlimited remote availability.** Pages 140–141 require calling the elemental, its arrival, and continued line-of-sight, including permitted magical senses; membership in `boundSpirits` proves none of these.  
   **Fix:** Track called/standby/depleted state and require a visible user assertion of valid presence and line-of-sight when geometry cannot establish it.

3. **The cast-dialog re-call bypasses action requirements.** Calling requires a Complex Action and is exclusive—p.141 prohibits calling while the mage sustains spells—and commanding a service requires a Simple Action after arrival.  
   **Fix:** Make call/re-call and service commands explicit transitions with these prerequisites, rather than immediate restoration inside a cast submission.

4. **Keeping full-Force stats is an unsupported exception.** Page 141 reduces the spirit’s Force, not merely a separately named aid reserve; existing `prepareDerivedData`, `rollSpiritAttack`, and astral attacks would still use full Force, including after disappearance.  
   **Fix:** Preserve full Force for restoration, use effective Force consistently for derived statistics and Force-based actions, and block actions while vanished.

5. **The service flags admit contradictory states.** Page 141 permits only one service at a time, but `aidActive` can remain true while `sustainingSpellUuid` is populated, then grant free resumed aid after sustaining ends.  
   **Fix:** Replace independent service flags with one current-service state and explicit start/end transitions.

6. **Sustaining eligibility permits an unpaid new service.** “Services ≥1 or already under an active command” lets a zero-service elemental switch from aid to sustaining, although each service costs one to initiate.  
   **Fix:** Require and debit a remaining service for each new sustaining command; an existing different command is not payment.

7. **Re-call accounting differs between entry points.** The cast path charges “starting or re-calling,” while the sheet button only promises to reset `forceUsed`; subsequent casting could charge again, and premature re-call could replenish a partially depleted spirit.  
   **Fix:** Define one shared re-call transition covering eligibility, service debit, restored Force, and resulting service state, and use it everywhere.

8. **The proposed aid addition bypasses allocation limits.** Adding aid directly to `baseDice` leaves `spellCastDice.poolCap` applying only to ordinary Magic Pool dice; multiple elementals can bypass the same-manner allocation requirement and the area spell’s original-Force limit.  
   **Fix:** Resolve ordinary and auxiliary Magic Pool allocations together under the applicable test limits, while retaining separate depletion and unchanged `ratingDice`/Karma caps.

9. **The preview can promise dice that will never roll.** Summing requested aid ignores each elemental’s shared cast/drain budget, service eligibility, and aggregate caps; the existing focus preview already sums raw requests.  
   **Fix:** Share a pure allocation resolver between preview and execution, including focus/aid splits, cap priority, finite nonnegative integers, and area withholding.

10. **Sustaining links have no complete lifecycle.** Existing `setSustaining(false)` does not clear either proposed link; lock toggling, quickening, recasting, deletion, or assigning a second elemental can leave orphan links, duplicate holders, or needless Force consumption.  
    **Fix:** Centralize attach/detach operations and integrate every sustaining lifecycle path, enforcing one holder per spell and one spell per elemental.

11. **A nonempty UUID becomes permanent penalty immunity.** Both proposed `sustainPenalty` changes trust the string even if its spirit was deleted, unbound, depleted, or no longer points back; partial cross-document writes produce the same failure.  
    **Fix:** Grant exemption only for a valid reciprocal active relationship and reconcile broken links, including actor preparation and sheet refresh.

12. **Fresh reads do not prevent double spending.** Two casts can read the same Force/services before either writes; separate service, depletion, and link updates also permit partial states.  
    **Fix:** Serialize operations per elemental through one authorized executor, write each spirit transition atomically, and make cross-document attachment recoverable and retry-safe.

13. **Round tracking lacks an exactly-once policy.** Duplicate combatants, multiple combats, round jumps, combat start, repeated updates, and GM handoff can double-charge or skip depletion; `combatRound`’s existing GM gate is insufficient for a consumable resource.  
    **Fix:** Associate each sustain with one combat and persist its last processed round, deduplicate spirit UUIDs, and define elapsed-turn handling for start, jumps, and reassignment.

14. **GM absence silently grants unlimited duration.** An active-GM-only hook stops working without a GM, and the proposed manual “−1 turn” can overlap automatic processing.  
    **Fix:** Define one deterministic authorized owner fallback, or visibly switch to manual tracking, with both paths using the same persisted countdown transition.

15. **Ownership assumptions are stale.** [`createActorViaGM`](module/sr2e.mjs:695) currently creates directly and requires actor-creation permission; its relay comments are obsolete, and GM-created spirits need not belong to the caster’s player.  
    **Fix:** Check the acting user’s update permission on both spirit and spell before spending, support explicit ownership assignment, and report permission failure without partial mutation.

16. **The spirit sheet remains a bypass.** `useSpiritPower`, `rollSpiritAttack`, and manual `adjustServices` do not enforce the new service/depletion state; Force editing can also invalidate `forceUsed`.  
    **Fix:** Enforce availability in actor methods as well as UI controls, and route manual service/Force corrections through state reconciliation.

17. **Delegated service is excluded without acknowledgment.** Page 141 allows the summoner to command an elemental to obey another character; requiring both caster-list membership and matching `conjurerUuid` rejects that legitimate case.  
    **Fix:** Either explicitly limit this release to summoners’ own elementals or model the authorized controller separately from the conjurer.

18. **Spell Defense’s exclusion has a false rationale.** The repository already has `allocateSpellDefense`, `clearSpellDefense`, resistance consumption, and an allocation dialog in `sheet-actions.mjs`.  
    **Fix:** Describe Spell Defense aid as deliberately deferred and keep elemental dice distinguishable so future release/reset logic cannot turn them into refreshing Magic Pool dice.

19. **The acceptance tests miss the failure paths.** Happy-path Quench coverage will not catch simultaneous casts, denied second-document writes, stale links, double assignment, multiple GMs, or preview/cap disagreement.  
    **Fix:** Add targeted tests for those cases and replace the expiration test with spell termination plus Active Effect cleanup.

20. **Implementation will touch the other session’s files.** The schema and penalty changes require `actor-data.mjs`; the spell link requires `item-data.mjs`, both currently modified elsewhere.  
    **Fix:** Coordinate ownership of those exact sections and apply narrow additive patches against the latest working files without restoring, formatting, or staging unrelated changes.

A simpler first release would use explicit call/service controls, one authoritative service state, and manual turn advancement through a shared transition function; automatic combat tracking can follow once its ownership and timing policy is specified.

VERDICT: REVISE
### Claude's response (round 1)
Accepted:
- 1: the spell ends at 0.
- 3 (as explicit call and service transitions) and 4 (effective Force everywhere).
- 5, 6, 7 (one transition function) and 8, 9 (one shared allocation resolver; aid counts as Magic Pool for caps).
- 10, 11 (link on the spirit, reciprocal validity), 15, 16, 17 (summoner-only scope), 18 (the Spell Defense rationale was wrong; deferred) and 19, 20 (dual-apply; item-data untouched).
- 13, 14: manual turn countdown; automatic combat tracking is deferred.

Partly accepted:
- 12: a per-client lock only; a cross-client lock needs a socket relay, which does not work at this host.

Rejected:
- 2 (enforcing line of sight and presence): the system has no astral line-of-sight model anywhere. The dialog reminds the player and the GM adjudicates.

## Round 2 — Codex

The revision fixes spell expiration and allocation caps. Manual countdown, GM-adjudicated LOS, and deferred delegation/Spell Defense are acceptable scope choices. These issues still need revision:

1. **Dismissal destroys depletion identity.** With `vanished = called && effectiveForce === 0`, dismissing a depleted elemental makes it “not vanished”; the next call either bypasses the re-call charge or leaves it permanently depleted.  
   **Fix:** Determine depletion independently of `called`, and specify call/dismiss behavior for every presence/depletion combination.

2. **Re-call service accounting remains unresolved.** `call` spends one service and restores Force, but `startAid` then spends another; the plan never specifies the resulting service state or explains this two-service sequence against p.141.  
   **Fix:** Explicitly define and test the total cost and post-call state for depletion → re-call → resumed aid/sustaining.

3. **Idle, unbound elementals can still be called.** Initial calling has no remaining-service requirement; a spirit whose last service ended can remain in `boundSpirits` and pass the current checks.  
   **Fix:** Distinguish completing an already-paid final service from starting/calling after the binding is exhausted.

4. **Physical services still bypass exclusivity.** The revised attack/power guards reject only vanished or uncalled spirits; [`useSpiritPower`](module/documents/actor.mjs:2195) can still spend another service while `service === "sustain"` or `"aid"`.  
   **Fix:** Route physical-service commands through the same exclusive service state, with an explicit end/switch requirement.

5. **The new guards can disable nature spirits.** `SpiritData` serves both spirit types; additive `called: false` plus unconditional guards in shared attack/power methods would block existing nature spirits.  
   **Fix:** Apply elemental presence/service restrictions only to elementals and test unchanged nature-spirit behavior.

6. **“Refusal before anything is spent” is false for multiple elementals.** Elemental A can spend successfully before B refuses; even one elemental can pay `startAid` before `spendAid` fails.  
   **Fix:** Preflight and reserve the complete allocation under the operation lock, combine start-and-spend, and define recovery for partial persistence failures.

7. **The local lock does not enforce the promised invariants.** Separate spirits can concurrently attach to one spell, and the GM/player manual controls explicitly contradict “only the owning mage acts”; two clients can overwrite the same depletion value.  
   **Fix:** Serialize by both caster/spell and spirit, and select one authorized executor for these operations—even if other clients must be refused without a relay.

8. **Spirit-first writes do not recover spell expiration.** If depletion commits and `setSustaining(false)` fails, the spell and Active Effects remain; clearing the service/link may also discard the information needed to retry.  
   **Fix:** Persist a pending-expiration target until spell/effect cleanup succeeds, with idempotent retry and reconciliation.

9. **The proposed “reciprocal” validity check is incomplete.** It does not require `called`, matching `conjurerUuid`, or matching category; transition-level validation of the target spell’s parent, duration, lock/quickening state, and existing sustain is also unspecified.  
   **Fix:** Use one eligibility predicate for transitions, penalty exemption, and UI, validating the full summoner–elemental–spell relationship.

10. **Force clamping conceals invalid state rather than repairing it.** Lowering full Force below `forceUsed` depletes a sustaining spirit without running expiration; raising it later can restore effective Force while stale service state survives.  
    **Fix:** Reconcile Force edits through the transition machinery, including expiration, and reject negative/noninteger depletion or turn arguments.

11. **Generic `setSustaining` routing risks changing the spell while merely changing its holder.** Its existing `true` branch creates Active Effects; its `false` branch deletes them and clears lock/quickening state. Calling either indiscriminately during takeover or holder changes is destructive or duplicative.  
    **Fix:** Separate holder detachment from spell activation/deactivation, and specify nonrecursive behavior for `endService`, takeover, lock, quicken, recast, and deletion.

12. **The caster sheet will not automatically follow spirit-only updates.** The penalty getter can read live state, but the rendered spell row and turn count belong to another actor; the existing `updateActor` hook has no spirit-to-conjurer refresh.  
    **Fix:** Refresh affected caster sheets on spirit update/delete and binding changes, including relevant synthetic token actors.

13. **NPC support has no binding storage.** Committed `NPCData` lacks `boundSpirits`, so its revised penalty getter and picker cannot discover elementals through the required relationship.  
    **Fix:** Add NPC binding support or explicitly limit this release to character actors.

14. **The rapid-cast test has the wrong invariant.** Serialization does not imply “two casts → one spend”: two valid casts with sufficient Force should both consume dice.  
    **Fix:** Test sufficient-budget sequential spends, insufficient-budget refusal, and duplicate submission handling separately.

The shared-file approach is acceptable provided the HEAD-based staging copy stays separate from the live working file and the staged diff contains only this task’s hunks. `actor-data.mjs` still requires coordinated edits; the spirit-only link avoids touching `item-data.mjs`.

VERDICT: REVISE
### Claude's response (round 2)
All 14 accepted as amendments R1–R13. R2 records my reading of the p.141 re-call cost: the re-call service is the resumed aid.

## Round 3 — Codex

R1–R13 resolve several earlier issues, but the transition model still has concrete failure paths. No files were modified.

1. **R2 cannot distinguish aid depletion from sustaining depletion.** Both end with `service === ""`; after expiration cleanup, no specified field preserves which re-call behavior applies.  
   **Fix:** Persist the depletion cause, or use one uniform re-call rule that requires no history.

2. **R2’s asymmetric re-call pricing lacks rules support.** Rendered p.142 says depleted sustaining spirits may be re-called identically to Aid Sorcery; R2 instead grants resumed aid for one service but charges re-call plus another service for renewed sustaining.  
   **Fix:** Apply a consistent interpretation to both services, or explicitly identify the asymmetric charge as a house rule.

3. **R4 still allows unpaid attacks.** Manifest and astral attacks accept `service === ""`, but only *power use* starts and pays for `"physical"`; an idle elemental can attack without entering a service.  
   **Fix:** Require an active physical service for commanded attacks, or atomically start and charge it before the first attack.

4. **R6 does not prevent automated cross-client races.** “One person tracks turns” does not govern R8/R9 hooks: the player and every GM can satisfy `isOwner` and concurrently retry expiration or reconcile Force edits.  
   **Fix:** Elect one authorized executor for mutations and reconciliation, refusing other clients’ operations when no relay is available.

5. **R5’s compensation can overwrite legitimate newer state.** If A commits, another client advances A, and B fails, restoring A’s preflight snapshot erases the intervening action; compensation can itself fail without any recovery record.  
   **Fix:** Restrict rollback to unchanged operation-owned fields and persist unresolved compensation, or simplify the release to one elemental per cast.

6. **R8 can expire a later casting of the same spell item.** If expiration fails, the mage can recast or quicken that item before retry; `pendingExpireSpellUuid` still identifies the item and the retry clears its current spell and effects.  
   **Fix:** Block recast/holder changes until pending cleanup completes, or identify the specific casting generation being expired.

7. **R8’s retry triggers can re-enter each other.** Writing pending expiration fires `updateActor`; clearing it fires another update; R11 re-renders the caster, whose render also retries—potentially duplicating cleanup or waiting on a lock already held by the initiating transition.  
   **Fix:** Schedule one deduplicated reconciliation job after the initiating operation releases its locks, with explicit handling for missing spells and repeated cleanup.

8. **R13 still confuses serialization with duplicate suppression.** A duplicate that waits for the lock can subsequently execute and spend again; a lock alone cannot produce “exactly the requested dice … in total.”  
   **Fix:** Reject duplicate in-flight submissions or assign an operation ID and reuse its result; test distinct casts separately from retries.

9. **R9’s Force-edit repair leaves aid depletion inconsistent.** Lowering Force to the spent amount only invokes expiration for sustaining; an aid spirit can remain `service === "aid"` while depleted, contrary to the normal `spendAid` transition.  
   **Fix:** Route Force-edit depletion through the same terminal transition for every service, preserving the depletion cause and ending the active service.

10. **R12’s character-only scope conflicts with global elemental gating.** Existing NPC-bound or standalone elementals also receive `called: false`, but the new eligibility model cannot serve their owners; their existing attacks/powers can become unusable.  
    **Fix:** Define compatibility behavior for unmanaged/NPC elementals and test existing world actors, rather than applying character-binding gates universally.

The shared-file constraint remains unchanged: keep `actor-data.mjs` edits narrowly scoped and separately staged; `item-data.mjs` need not change.

VERDICT: REVISE
### Claude's response (round 3)
The design was growing too much, so it is simplified instead of patched:
- no called flag; presence and calling are GM adjudication;
- one elemental per cast, which removes compensation (point 5);
- a uniform history-free re-call (points 1 and 2);
- busy or depleted elementals are gated from powers and attacks, while unmanaged and NPC elementals are untouched (points 3 and 10);
- no automatic reconciliation hooks: expiry is inline, with a manual Finish, and recast is blocked while an expiry is pending (points 4, 6, 7 and 9);
- duplicate submissions are rejected (point 8).

## Round 4 — Codex

The simplification removes much of the earlier complexity. Manual calling/LOS, manual countdown, and one elemental per cast are workable scope choices. These blockers remain:

1. **The recast refusal happens too late.** `_rollSpellcast` spends resources, rolls, applies drain, and posts results before calling `setSustaining(true)`; refusing there does not prevent recasting.  
   **Fix:** Check pending expiration at `_rollSpellcast` entry, before any spending or rolling, as well as in `setSustaining(true)`.

2. **Pending expiration does not protect other spell changes.** Existing lock and quickening actions bypass `setSustaining(true)`; a failed expiration can therefore be quickened for Karma and subsequently destroyed by “Finish.”  
   **Fix:** Block lock, quicken, and elemental attachment while the spell has pending expiration, before any payment or mutation.

3. **An unresolved expiration can be overwritten.** The transition table permits re-call and another sustaining service while `pendingExpireSpellUuid` remains; a second expiration replaces the first pending UUID.  
   **Fix:** While pending expiration exists, allow only Finish and explicit missing-target cleanup on that elemental.

4. **Per-spirit guards cannot enforce one holder per spell.** Two different elementals can simultaneously pass R7’s “not already held” check for the same spell, even on one client.  
   **Fix:** Guard attachment by spell UUID as well as spirit UUID, covering eligibility checking through persistence.

5. **Force-edit depletion permits a forbidden late takeover.** A sustaining elemental reduced to zero Force still allows `takeOver`/`endService`, preserving the spell; `recall` can likewise clear its service without expiring it, contrary to p.142’s requirement to take over *before* disappearance.  
   **Fix:** For depleted sustaining spirits, require expiration before takeover, ending service, or re-call.

6. **Finish has no missing-target completion rule.** If the spell is deleted after expiration fails, retrying `spell.setSustaining(false)` cannot succeed, leaving the pending operation stuck.  
   **Fix:** Treat an absent spell as completed cleanup, remove any surviving caster effects with that spell origin, and clear the pending UUID.

Keep the existing allocation resolver and Karma-cap tests; the simplification does not remove their necessity. `actor-data.mjs` still needs narrowly scoped edits that preserve the other session’s changes; `item-data.mjs` remains untouched. No files were modified.

VERDICT: REVISE
### Claude's response (round 4)
All six accepted as G1–G6. G7 confirms the allocation resolver and its tests remain.

## Round 5 — Codex (final round)

G1–G7 close the six previously identified paths, but three blockers remain:

1. **Existing banishment bypasses expiration entirely.** [`banishSpirit`](module/sheets/sheet-actions.mjs:3305) unlinks and deletes the elemental without ending its spell; the proposed deletion hook only refreshes the sheet. Rendered p.142 explicitly says banishing a sustaining spirit ends the spell. Deletion also destroys any pending-expiration record.  
   **Fix:** Complete spell/effect expiration before unlinking or deleting a sustaining or pending-expiration elemental, and refuse removal if cleanup fails.

2. **G1’s protection disappears when binding membership changes.** It searches only `boundSpirits`; an unlinked elemental can retain `pendingExpireSpellUuid` while the caster recasts, allowing a later Finish to terminate the newer casting.  
   **Fix:** Find pending expiration by exact spell UUID independently of current binding membership, and test unlink → recast refusal → Finish.

3. **G5 leaves a gap before pending expiration is recorded.** After a Force edit depletes a sustaining elemental, `pendingExpireSpellUuid` remains empty until “Expire now”; G1/G2 therefore allow recast, lock, quicken, or another attachment despite the spell already requiring expiration.  
   **Fix:** Make the shared spell guard recognize both pending expiration and a depleted sustaining holder, blocking those operations before spending until cleanup completes.

Add regression tests for these paths. The shared allocation resolver, manual tracking scope, and one-elemental-per-cast simplification remain reasonable.

No files were modified. Implementation still requires isolated `actor-data.mjs` hunks preserving the other session’s edits; `item-data.mjs` need not change.

VERDICT: REVISE
### Claude's response (round 5)
All three accepted as G8–G10. MAX_ROUNDS reached. G8–G10 are adopted but were not re-reviewed; they go to the human for sign-off along with the interpretation choices.

## Implementation review 1 — Codex

Three bugs remain. I reproduced the expiration-retry failure with a read-only Node harness; I did not rerun the live Foundry suites.

1. **[P1] Finish can permanently leave spell Active Effects behind.** In [completeExpiry](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:123), cleanup runs only while `spell.system.sustaining` is true. But `setSustaining(false)` clears that flag **before** deleting effects. If effect deletion fails, Finish skips cleanup and clears the pending UUID. My reproduction ended with `effectsLeft: 1`, `pending: ""`, and `{ok:true}`. The initial expiration also incorrectly returns `{ok:true}` when cleanup fails.  
   **Fix:** Always retry spell/effect cleanup regardless of the sustaining flag, clear pending only after successful cleanup, and propagate failure in the transition result.

2. **[P1] Recasting an actively held spell silently transfers the existing service to the new casting.** The [cast-entry guard](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1251) rejects pending/depleted holders, but permits a healthy holder. Successful recasting calls `setSustaining(true)`, which neither detaches that holder nor removes the previous casting’s effects. The new casting inherits penalty exemption and the old countdown without another service; effects can accumulate. This misses the planned recast-detachment path.  
   **Fix:** Either refuse recasting a held spell before spending, requiring an explicit drop, or explicitly end the old casting and detach its holder before replacing it.

3. **[P2] Deleting the spirit through the Actors directory bypasses expiration.** Cleanup is attached to `banishSpirit`, while the [deleteActor hook](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1695) only refreshes the conjurer. Ordinary deletion therefore leaves a held spell running with its effects, or destroys a pending-expiration record and removes the recast block.  
   **Fix:** Guard document deletion while a spirit holds a spell or has pending expiration, requiring successful release/Finish first.

One plan gap also remains: [readPreview](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:1724) still sums raw focus requests rather than using the execution path’s `clampFocusAllocation`; the promised shared focus allocation resolver was not implemented. This is an existing discrepancy left unresolved, rather than a new regression.

One elemental per cast, the separate re-call charge, and excluding aid from the Karma cap match the accepted decisions. No files were modified; the unrelated working edits were excluded.

VERDICT: REVISE
## Implementation review 2 — Codex

All four findings are resolved in the revised diff. No additional blocking issues found.

I independently reproduced the partial-expiration failure: it now returns `ok:false`, preserves pending cleanup, and Finish removes leftover effects before clearing pending. The recast guard, deletion guard, and shared focus clamp address the other findings.

Live suite results are user-reported; no files were modified.

VERDICT: APPROVED