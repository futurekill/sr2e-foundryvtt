# Plan Review Log: Aid Study + Spell Defense aid
Started 2026-09-24. MAX_ROUNDS=5.
User decisions before review: learning dice = Sorcery + Magical Theory; elemental Spell Defense dice only vs its own category; study days round up.

## Round 1 — Codex

The three user decisions stand. I checked rendered folios 132, 133, 141, 190 and 191: Force-cost Good Karma, no Karma on failure, teacher TN, and learning totem modifiers are supported. The blockers are implementation gaps.

1. **Karma buttons cannot finalize learning correctly.** A3 creates the item or declares failure immediately, but `applyKarmaToTest` only updates test/dependent cards; a rerolled failure never creates the spell, and extra successes never shorten the recorded days. Additional Karma dice also require pre-roll options, not existing card buttons.  
   **Fix:** Persist a learning attempt, expose pre-roll Karma dice with a skill-only cap, and finalize item creation, cost and days once after Karma actions.

2. **Aid-only allocation and clearing hit existing early returns.** `onAllocateSpellDefense` rejects an empty Magic Pool and zero Magic allocation; `allocateSpellDefense` rejects `give <= 0`; `clearSpellDefense` returns when ordinary defense and shielding are zero.  
   **Fix:** Make all three paths recognize elemental-only reservations independently, preserving ordinary defense and shielding accounting.

3. **The proposed zero-Force service start does not exist.** `planElementalTransition("aid")` rejects `n: 0` and spends Force for every accepted call; using it during allocation either fails or spends Force prematurely.  
   **Fix:** Add an explicit start-Aid transition that charges one service without spending Force and enforces the existing exclusivity/depletion guards.

4. **Reserved dice remain available to casting.** `_rollSpellcast` and its preview use the elemental’s entire effective Force; reserving four dice from Force 6 still permits casting with all six, silently destroying the defense commitment.  
   **Fix:** Subtract outstanding defense reservations from casting/drain availability in both preview and execution, releasing them explicitly on clear or refresh.

5. **Old reservations can revive under a new service.** Reserve dice, end Aid, start another Aid service: the stored UUID/count again passes `service === "aid"`; depletion and recall allow the same stale resurrection.  
   **Fix:** Bind reservations to a service-instance identifier or invalidate them whenever that Aid service ends.

6. **Ownership failures can grant unpaid aid.** `boundElementals` does not filter ownership, while `elementalTransition` returns `{ok:false}` for denied updates; C’s validity checks do not require successful payment before adding dice.  
   **Fix:** Preflight actor/spirit ownership and count aid only after a successful transition, aborting before ordinary defense/shielding consumption on refusal.

7. **The resistance card lacks the category being tested.** Both combat-card producers omit category, and `rollSpellResistance` only handles combat spells; water, air and earth reservations have no automated matching use here.  
   **Fix:** Explicitly treat existing cards as combat and limit this UI to fire until other resistance paths exist, or persist categories and wire those paths.

8. **Source IDs do not enforce once per spell.** After failed aided study from a compendium, selecting a world copy supplies a different ID and permits another elemental’s assistance.  
   **Fix:** Store a canonical spell identity shared by source copies and use it consistently for history and duplicate checks.

9. **The learning TN preview omits automatic penalties.** A1’s helper excludes wounds, sustaining, dumpshock and overload, while `rollSuccessTest` adds them; an injured learner sees a lower TN than actually rolled.  
   **Fix:** Share effective-TN calculation between preview and execution, applying each modifier exactly once.

10. **Copying a world spell “as authored” can copy live state.** Existing spells carry sustaining, locking and quickening state; changing only Force can create a newly learned spell already marked active or externally maintained.  
    **Fix:** Copy spell-definition fields and reset runtime state, external links and document identity before creation.

Add regression cases for these boundaries; the listed happy-path tests would miss them. No files were modified.

VERDICT: REVISE
### Claude's response (round 1)
All ten accepted as E1–E10. Point 7 narrowed to fire only (combat), the one automated resist path.

## Round 2 — Codex

E2–E10 address the original reservation, identity and preview issues. E1 still needs concrete completion safeguards; one refresh path also remains uncovered.

1. **Deferred completion makes the original preflight stale.** Roll two learning attempts while enough Karma exists for either; completing the first can leave insufficient Karma—or an already-known spell—when completing the second.  
   **Fix:** Recheck live Karma and duplicate-spell identity immediately before completion, leaving the attempt pending if either check fails.

2. **“Actor owner” does not imply permission to resolve the card.** If the GM creates the learning card for a player’s actor, the player can create the spell and spend its Karma but cannot necessarily update the GM-authored message; E1 marks `resolved` only afterward.  
   **Fix:** Store authoritative completion state on the actor, or require actor ownership plus message-update permission before any completion writes.

3. **“Finalizes ONCE” lacks a mechanism.** Two quick clicks can both observe `resolved: false`; failure after item creation but before Karma deduction/card resolution also leaves a retryable, partially completed attempt.  
   **Fix:** Give each attempt an ID, serialize completion locally, and persist recoverable progress so retries cannot duplicate the item or charge.

4. **Karma remains spendable after completion.** `_syncDependentCards` skips resolved cards, but `applyKarmaToTest` still spends Karma and changes the originating test, leaving its result inconsistent with the finalized learning outcome.  
   **Fix:** Reject further Karma actions on a test whose learning attempt is finalized, and hide those buttons.

5. **The individual Magic Pool reset bypasses reservation cleanup.** `onResetPool` directly restores `magic.value`; it never calls `dicePoolRefreshUpdates`, so the Attributes-tab reset retains reserved aid and keeps those dice unavailable to casting.  
   **Fix:** Route the Magic Pool reset through shared defense cleanup, clearing ordinary defense, shielding and aid reservations without spending elemental Force.

Add focused regression cases for these paths. No rule decisions need reopening, and no files were modified.

VERDICT: REVISE
### Claude's response (round 2)
All five accepted as F1–F5 (tests in F6): completion state on the actor; idempotent create, pay and done steps; live rechecks; Karma closed after completion; the reset path cleans reservations.

## Round 3 — Codex

F4–F5 address the prior Karma and refresh issues. The revised completion flow still has four concrete gaps:

1. **F1 blocks F3’s recovery.** After item creation succeeds but payment fails, retry hits “already known”; after payment succeeds but marking done fails, retry can hit insufficient Karma.  
   **Fix:** Make preflight phase-aware: exempt the item bearing this attempt’s ID, and require sufficient Karma only when payment remains unpaid.

2. **F2 loses the spell definition snapshot.** The card now stores only actor/attempt IDs, while the actor record contains no `spellSource`; completion cannot reconstruct the selected definition, especially after reload or source deletion.  
   **Fix:** Persist E10’s clean definition snapshot in the actor’s attempt record.

3. **An attempt-level lock does not serialize shared Karma.** Two different successful attempts can complete concurrently on the same client, both pass the balance check, and create spells before either payment finishes.  
   **Fix:** Serialize completion by actor UUID, with live checks and payment inside that lock.

4. **F1 can prevent recording a failed attempt.** Its unconditional Karma/duplicate checks run even when the final test has zero successes, although F3 correctly specifies no item and no payment for failure.  
   **Fix:** Finalize zero-success attempts as failed before running success-only affordability and duplicate checks.

Extend F6 to cover recovery after payment, concurrent completion of different attempts, and failure completion after Karma has changed. No files were modified.

VERDICT: REVISE
### Claude's response (round 3)
All four accepted as G1–G4 (tests in G5).

## Round 4 — Codex

G2–G4 resolve the snapshot, locking and failed-attempt issues. G1 introduces one ordering bug:

1. **Insufficient Karma now leaves a usable, unpaid spell.** G1 creates the item before checking affordability in step 3. With Karma for only one of two attempts, the second attempt still creates its spell, then remains pending; the actor lock does not prevent this.  
   **Fix:** Under the actor lock, check affordability before creating any unpaid attempt’s item, while retaining phase-aware recovery for existing items and already-paid attempts.

Extend G5’s two-attempt test to assert **one spell item**, not merely one done/one pending status.

VERDICT: REVISE
### Claude's response (round 4)
Accepted as H1: pay before create.

## Implementation review 1 — Codex

Five findings remain:

1. **Existing Aid Sorcery services cannot reserve working defense dice.** [startAid](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:3754) returns an empty update for an active service, but pre-update spirits have no `aidInstanceId`; `aidReservation` therefore rejects every reservation made under that service. Confirmed with a read-only rules invocation.  
   **Fix:** Assign a missing instance ID when continuing an existing service, without charging another service.

2. **A missing test message permanently converts learning into failure.** [completeLearning](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3050) treats a missing message as zero successes. Deleting the test before completion destroys a successful attempt; during recovery after payment, it can leave Karma spent with no spell and mark the attempt failed.  
   **Fix:** Refuse completion when the test is unavailable, and persist the finalized success count alongside the payment receipt for recovery.

3. **Concurrent Aid Study requests bypass once-per-spell enforcement.** [learnSpell](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3006) checks history before awaiting the elemental transition, then records usage afterward. Two requests using different elementals can both pass; the existing spirit-level locks do not serialize them.  
   **Fix:** Lock the actor’s Aid Study check, service debit and usage recording together.

4. **The dice preview excludes purchased Karma dice.** [The dialog calculation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:1988) never reads the Karma input: Sorcery 6 + Theory 4 with two purchased dice still displays 10, while execution rolls 12.  
   **Fix:** Include `readKarmaDice(...)` in the displayed total using the same cap as execution.

5. **The public learning method still bypasses definition cleaning.** Despite the implementation note, [learnSpell](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2981) accepts `o.definition` unchanged. Passing a spell’s raw definition preserves sustaining/quickening state through completion, violating E10.  
   **Fix:** Remove that input path or validate and clean it before storing the snapshot.

The reported passing tests do not cover these cases. No files were modified.

VERDICT: REVISE
## Implementation review 2 — Codex

The five previous findings are fixed. One recovery inconsistency remains:

**Paid, pending attempts still accept Karma that completion ignores.** [learningClosed](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:199) checks only status. If item creation fails after payment, the attempt remains pending: buying successes permanently spends Karma and updates the card, but retrying completion uses the older `rec.successes` receipt.

**Fix:** Treat `karmaPaid` as closing the learning test; add a regression that injects creation failure after payment and verifies subsequent Karma actions spend nothing.

No files were modified.

VERDICT: REVISE
## Implementation review 3 — Codex

Verified: `karmaPaid` now closes the test in both the action handler and renderer. The regression exercises creation failure after payment and successful retry without another charge.

No remaining blocking findings. No files modified; live test results are as reported.

VERDICT: APPROVED