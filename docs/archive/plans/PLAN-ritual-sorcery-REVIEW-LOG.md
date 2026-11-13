# Plan Review Log: ritual sorcery
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs explicit contracts for spending, finalization, and reuse; the verified tables are not the problem.

- **`_rollSpellcast` also rolls and applies leader Drain, posts results, and starts ordinary sustaining** ([item.mjs:1713](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1713)); adding only the proposed overrides would duplicate Drain and apply incorrect sustaining. **Fix:** Extract an effect-only path and make the ritual state machine own Drain and sustaining.
- **The shared pool has no spending specification:** “uses the pooled dice” leaves allocation, depletion between tests, and the leftover balance undefined. **Fix:** Record requested and committed allocations per test, debit one persistent ritual ledger exactly once, and reserve Drain/sustaining shares against that balance.
- **Ordinary casting clamps and spends the leader’s personal Magic Pool** ([item.mjs:1638](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1638)); passing ritual dice through `poolDice.magic` would clamp against an already-debited actor. **Fix:** Give ritual allocations a separate dice source that never recharges personal pools.
- **Owning an actor does not let its player update the leader-authored chat message:** Join and Drain completion lack an authorized persistence route. **Fix:** Use member-authored contribution/outcome records consumed by an authoritative leader/GM, or a validated GM relay.
- **Debit and membership registration can fail separately, while concurrent joins or repeated clicks can duplicate contributions.** **Fix:** Use unique operation IDs, serialized acceptance, recoverable debit receipts, and a frozen roster before Link.
- **“Drain as if casting alone” lacks a concrete member-specific implementation:** the existing code reads the item’s parent, personal Magic, Willpower, astral state, and focus allocations. **Fix:** Resolve Drain separately for each member with their own stats, unused bonus ledger, assigned ritual dice, and an exactly-once damage receipt.
- **Remote targeting is incompatible with current reuse:** healing and single-target resistance read live `game.user.targets`, sometimes falling back to the caster; area resolution requires the active canvas and filters invisible targets ([item.mjs:1972](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1972)). **Fix:** Persist the ritual subject and destination scene/centre, and have the GM resolve remote area membership privately.
- **The resistance override does not survive existing cards:** resistance rolls use `state.force`, which also represents damage Force ([actor.mjs:3372](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3372)). **Fix:** Carry a separate `resistTN` through single-target and area cards, rendering and resolution, while preserving Force and Spell Defense keys.
- **Modifier suppression is underspecified:** ordinary rolls add more than Injury, while casting can invoke Centering and healing modifiers. **Fix:** Define an explicit ritual modifier policy at the roll boundary, preserving only the modifiers allowed for each stage.
- **Karma can change successes after time, advancement, abort, or damage has been committed:** existing tests remain editable unless closed ([actor.mjs:603](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:603)). **Fix:** Identify the Karma spender and legal extra-dice cap for each test, then finalize live successes and close the test before committing consequences, retaining area-test restrictions.
- **Abort handling covers only zero successes:** effect preflight can return `null` after hours and contributions are already committed, and disconnected members can leave Drain unfinished. **Fix:** Distinguish retryable UI cancellation from ritual termination, persist outstanding Drain obligations, and permit GM completion before terminal status.
- **Time accounting is incomplete:** zero successes makes division undefined, skipped Link needs zero duration, and repeated advancement can advance world time twice. **Fix:** Specify failure durations and rounding, store finalized stage durations, and record each GM-approved seconds advancement exactly once.
- **Sustaining is described but absent from the workflow:** leftover dice can be allocated twice, and ordinary `setSustaining` affects only the leader. **Fix:** Choose sustaining mode before Drain, reserve its dice, apply the stated member Drain modifier, and persist expiry or group-release state.
- **The proposed tests do not establish multiplayer correctness.** **Fix:** Add targeted coverage for different owners, concurrent/retried contributions, member-specific Drain, remote areas, resistance TN versus damage Force, Karma finalization, abort recovery, and duplicate time advancement.

VERDICT: REVISE
### Claude's response
Rewrote the plan and accepted all 14: a GM-authoritative ledger with member request messages by opId; a ritualHeld pool field; castEffect split out of _rollSpellcast; a persisted subject and GM area resolution; resistTN; a stage modifier policy; Karma until Finalise; a time contract; sustaining reserved before Drain; drain obligations with receipts; cancellation vs termination; multiplayer tests.

## Round 2 — Codex
The revision addresses most structural gaps, but these concrete problems remain:

- **Duplicate Join handling contradicts itself:** architecture refunds duplicates, while tests ignore them; refunding an accepted `opId` restores personal dice while retaining its ritual contribution. **Fix:** Treat accepted duplicates as no-ops and refund only proven, unaccepted debits.
- **Per-ritual queues cannot safely update one shared `sr2e.rituals` setting:** concurrent read–modify–write operations can overwrite another ritual. **Fix:** Serialize all writes to that setting globally or store rituals in independently updated documents.
- **Request authority is unspecified:** a member-authored message can claim another actor, leader action, or contribution amount. **Fix:** Validate message authorship against actor ownership, action role, current stage, and persisted debit receipts before accepting requests.
- **GM-authored tests break player Karma:** `rollSuccessTest` creates the message as the executing GM, but `applyKarmaToTest` spends the player’s Karma before updating that message ([actor.mjs:680](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:680)). **Fix:** Route ritual Karma requests through the authority and serialize them with stage finalization.
- **The effect crosses the finalization boundary:** `castEffect` publishes actionable resistance/healing cards while the stage still permits Karma; existing area cards also freeze per-target results. **Fix:** Separate rolling from effect publication, finalize the test first, then generate cards from the finalized dice while retaining area Karma restrictions.
- **“Exactly once” receipts arrive too late to guarantee exactly-once damage:** a member and GM can both resolve an obligation, or damage can apply before receipt publication fails. **Fix:** Claim each obligation before rolling and persist its operation marker with the actor damage update, reconciling interrupted completions.
- **Stage debit recovery is missing:** a crash after ledger commitment but before test persistence leaves paid dice without a roll, while retrying with a new `opId` can charge again. **Fix:** Persist stage operation identity and pending/result states, and resume the existing operation after interruption.
- **The “existing drain function” does not exist as a reusable member-specific function:** Drain remains embedded in `_rollSpellcast`, including immediate damage application. **Fix:** Explicitly extract Drain calculation, test finalization, and damage application, with member-specific bonus accounting and a Karma window before damage.
- **Elemental sustaining is incompatible with the proposed reuse:** the existing service requires an already-sustained spell and uses a Combat Turn clock, not Force days ([elementals.mjs:207](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:207)). **Fix:** Implement a distinct ritual duration mode or leave elemental ritual sustaining explicitly manual.
- **Time rounding changes the stated rules:** Force 5 with two successes becomes three hours instead of 2.5 hours for both Link and Sending. **Fix:** Preserve fractional hours, apply only Sending’s one-hour minimum, and round only when converting to supported clock precision.
- **`timeApplied` alone cannot guarantee exactly-once world-time advancement:** interruption between advancing time and saving the marker can repeat or lose the advance. **Fix:** Persist a pending time operation with before/after timestamps and reconcile ambiguous recovery before allowing another advance.
- **Prepare requirements remain descriptive:** nothing validates sustained spells were dropped before freezing the roster. **Fix:** Make preparation checks an enforced prerequisite to accepting and freezing participants.

VERDICT: REVISE
### Claude's response
Redesigned instead of patching: the GM runs the ritual on one client and owns every actor, which removes the request, authority, receipt and relay issues (#1–#4, #6, #7). The effect is finalised before any cards are posted (#5). A resolveDrain helper is extracted (#8). Elemental sustaining is left manual (#9). Fractional time is kept, and time is advanced once (#10, #11). Prepare is enforced (#12).

## Round 3 — Codex
The GM workflow is simpler, but several correctness gaps remain:

- **`ritualTN: true` preserves Injury for every stage**, contradicting the table-only Link/Sending policy, and does not explicitly suppress dump shock, MPCP overload, or casting Centering. **Fix:** Pass a stage-specific modifier policy: table modifiers for Link/Sending, Injury and totem only for Effect.
- **`ritual.finalSuccesses` is insufficient for area combat:** `_postAreaResults` counts individual dice against each target’s TN ([item.mjs:2067](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:2067)). **Fix:** Persist and pass the finalized dice, test message ID, effective TN, and target snapshot, preserving area Karma restrictions.
- **Calling `_rollSpellcast` twice can repeat preflight and consumable spending**, including expendable fetishes, or fail after the effect test already succeeded. **Fix:** Make the second call an explicit publication-only phase that cannot roll, spend, or rerun casting preflight.
- **“Karma works as usual” still exposes the GM-authored test to player owners:** the handler checks actor ownership, while Karma spending precedes updating the GM’s message. **Fix:** Enforce GM-only ritual Karma mutations in the handler and method, serialized with Finalise.
- **The pool-only tests lack an explicit Karma extra-dice cap:** `rollSuccessTest` defaults that cap to its base dice argument, so passing ritual pool dice as base dice incorrectly makes them eligible. **Fix:** Supply the legal rating-only `karmaDiceCap` explicitly, excluding ritual pool dice.
- **The Drain helper lacks the subject-dependent Drain level:** healing Drain currently derives severity from the patient’s wounds, which each member’s client must not resolve from its own targets. **Fix:** Store the resolved Drain level from the persisted subject and calculate physical/stun Drain separately from each member’s Magic and astral state.
- **Drain Karma remains unresolved:** extracting the existing immediate-damage behavior lets later Karma change the test without correcting damage. **Fix:** Finalize and close each Drain test before applying its damage.
- **Outcome markers do not guarantee one Drain application:** the existing manipulation implementation explicitly permits simultaneous resolution across clients. **Fix:** Have the GM claim each obligation before authorizing a member roll, and persist completion before allowing another resolver.
- **Sustaining markers have no expiry or release lifecycle:** clearing the ritual flag loses team membership, while neither timed expiry nor group release is specified. **Fix:** Persist sustaining state independently of ritual completion, including expiry or member identities and an explicit end action.
- **Closing the ritual can erase unapplied time:** `End` clears the flag containing hours and `timeAdvanced`, even if the GM has not advanced time. **Fix:** Retain a completed record until time is applied or explicitly waived.
- **One open dialog per client does not prevent a second GM or reopening from overwriting the same leader’s ritual**, and the persisted record lacks enough context to resume safely. **Fix:** Restrict execution to the active GM and reopen existing records containing the frozen roster, spell, Force, subject, test IDs, and pending operations.
- **Effect rejection after Link/Sending is still undefined:** `_rollSpellcast` can return `null` for a missing fetish, exclusive-spell conflict, or invalid area after resources and hours have been spent. **Fix:** Define retryable preflight failures and an explicit termination path that always creates outstanding Drain obligations.

VERDICT: REVISE
### Claude's response
Accepted all 12: stage tnPolicy; two phases (roll with preflight, then publish from the snapshot); GM-only ritual Karma; karmaDiceCap 0; stored Drain level with per-member physical/stun; GM-rolled Drain with finalise before damage; sustaining state on the item with expiry and End; the record kept until time is applied or waived; active-GM resume; preflight retry or terminate.

## Round 4 — Codex (run 2026-09-25 after the quota reset; session 01a0d91a…)
The revision fixes several earlier findings, but “one client” still does not guarantee once-only execution. These gaps remain:

1. **Start, stage spending, and Drain completion remain crash-unsafe.** The plan debits actors before saving the ritual, deducts stage dice before recording the roll, and applies damage before marking an obligation done. A reload or failed update can lose contributions, strand spent dice, or apply Drain twice; a refund handler cannot recover from a disconnected client.  
   **Fix:** Persist pending operation IDs before spending, tag resulting tests, and store each Drain application marker in the same actor update as its damage.

2. **Only Karma versus Finalise is explicitly serialized.** Double-clicked Start, Roll, Publish, or Terminate can overlap across `await`s even on one client; an active-GM change can also leave the old GM’s operation running.  
   **Fix:** Queue all ritual mutations, validate the live stage inside the queue, and recheck active-GM authority before committing writes.

3. **Publication has no replay protection.** `ritualPublish` creates several cards and potentially a template; interruption halfway through followed by resume can duplicate them. Spell resistance checks the individual card’s resolution, while Spell Defense grants are keyed by casting test and target ([actor.mjs:3350](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3350), [spell-defense.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/spell-defense.mjs)). Duplicate cards can therefore repeat resistance/damage and reuse grants.  
   **Fix:** Give each published artifact a stable ritual/test/target key, resume only missing artifacts, and refuse resistance when that attack-target key is already resolved.

4. **The hidden-target snapshot is stored on a player-owned actor.** Moving hidden tokens into `caught` and persisting that list in `leader.flags.sr2e.ritual` exposes their identities and TNs through the leader document; ownership also means “updated only here” is not an authority boundary. Whispering the eventual cards does not protect that snapshot.  
   **Fix:** Store authoritative ritual state and hidden-target snapshots in a GM-only document, leaving only a non-sensitive reference on the leader.

5. **Time advancement still has the previously reported failure window.** Advancing world time and saving `timeAdvanced` are separate writes; failure between them repeats the advance on resume, while saving the flag first can lose it.  
   **Fix:** Persist a pending time operation with before/after timestamps and reconcile ambiguous recovery before offering another advance.

6. **Timed sustaining starts before the ritual’s elapsed time is applied.** With six hours of ritual time pending and two hours of sustaining purchased, `expiresAt = worldTime + 2 hours` makes the new spell expire immediately when the GM advances those six hours. Expiry also lacks catch-up after a reload or GM handover.  
   **Fix:** Anchor expiry to the ritual’s completion time, define waived-time behavior, and reconcile overdue sustains on startup and active-GM changes.

7. **The sustaining flag does not integrate with existing mechanics.** `personallySustaining` and the actor’s `sustainPenalty` ignore `ritualSustain`; setting `system.sustaining` penalizes the leader in leftover-dice mode, while setting only the flag bypasses existing sustaining effects and exclusivity checks. Other locked-in members have no corresponding spell item ([restricted-spells.mjs:19](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/restricted-spells.mjs:19), [actor-data.mjs:1227](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1227)). Recasting the same item can also overwrite its single sustain record.  
   **Fix:** Define mode-aware sustaining predicates, member references, effect cleanup, and recast protection, with the locked-in Drain modifier applied exactly once.

8. **The effect’s TN and totem contracts are incomplete.** `_rollSpellcast` defaults non-area casting TN to `options.targetNumber ?? 4`; merely supplying the persisted subject does not calculate its normal spell TN. Totem modifiers are **dice**, not TN adjustments, so putting them under `tnPolicy` while using exactly `ritual.dice` can omit them ([item.mjs:1553](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1553)).  
   **Fix:** Resolve and snapshot the normal subject-specific base TN, apply Injury through the TN policy, and apply the leader’s totem modifier separately to casting dice.

9. **Drain severity can be calculated after healing changes the patient.** The plan publishes actionable healing cards before resolving the patient-dependent Drain level; a player can heal the patient during that gap, reducing everyone’s Drain. Existing casting calculates Drain before publishing healing ([item.mjs:1730](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1730)).  
   **Fix:** Freeze subject-dependent Drain inputs before effect publication, with an explicit resolution point for aborted rituals.

10. **“Unused foci/totem/spirit dice as entered” is not a resource contract.** Existing casting validates spell-bound focus eligibility and spends focus charges and elemental Force before rolling; a numeric bonus alone bypasses those checks. A member’s focus also binds to that member’s spell item, not the leader’s item ID.  
    **Fix:** Accept identified bonus sources, validate member-specific eligibility, reserve and debit consumable dice, and record which totem dice have already been used.

11. **Drain Centering crosses the new finalization boundary.** Existing Drain optionally rolls Centering and adds derived successes; finalizing only the primary Drain test neither freezes the Centering test nor specifies recomputation after Karma ([item.mjs:1756](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1756)).  
    **Fix:** Treat Drain and its Centering test as one obligation, recompute their combined finalized result, and close both tests before applying damage.

12. **The two-phase split omits lasting spell effects.** `_rollSpellcast` also invokes Ignite, Poltergeist, and Ice Sheet after its ordinary cards; Ice Sheet uses the current canvas, and Poltergeist requires `system.sustaining`. Leaving that tail in the roll phase applies effects before Finalise; skipping it loses supported behavior ([item.mjs:1880](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1880)).  
    **Fix:** Move all lasting-effect creation into replay-safe publication using the persisted scene, subject, and sustaining mode, or explicitly reject unsupported spells before Start.

13. **Preparation and subject validation do not fully implement the stated Goal.** The workflow does not require a lodge/circle or material-link confirmation, does not guarantee the leader belongs to the unique Drain roster, and permits a healing spell to select a text-only place with no wounds to inspect.  
    **Fix:** Validate a unique roster including the leader, preparation/link prerequisites, finite integer allocations, and spell-compatible subjects before committing contributions.

A simpler implementation would retain the GM workflow but extract shared preflight, calculation, and publication helpers instead of threading a privileged ritual option through the entire side-effect-heavy `_rollSpellcast`. Add interruption-and-resume tests at each write boundary; the current sequential happy-path tests do not establish the claimed guarantees.

VERDICT: REVISE
### Claude's response
Re-read p.133–137 from the rendered pages first. The plan had missed:
- the materials cost by category;
- the ban on combat spells;
- the lodge/circle rating ≥ Force;
- the team-size and tradition rules;
- withdrawal and the astral guide.

Then simplified rather than adding machinery. Point by point:
- **#1**: no member debit (the pool is a number on the record). A stage test is tagged and adopted on resume. Drain damage and its marker go in one actor update.
- **#2**: one queue per ritual, with a live-stage check and an active-GM check.
- **#3**: every card carries a ritualCard key, and a resume posts only the missing ones.
- **#4**: the record is a GM-whispered message.
- **#5**: time is reported, not advanced.
- **#6/#7**: sustaining is recorded, not automated; the spell item isn't marked sustained.
- **#8**: a proper subject TN, and totem as dice.
- **#9**: the Drain level is frozen before publication.
- **#10/#11**: GM-attested dice; no Centering (stated limits).
- **#12**: a ritual-only effect path; Poltergeist and Ice Sheet refused at Start.
- **#13**: full Start validation.


## Round 5 — Codex (final round)
The manual boundaries are acceptable for a GM-run, between-scenes worksheet: time reporting, manual expiry, attested focus/spirit dice, and explicit unsupported spells do not need more automation. However, the automated parts still contain these correctness gaps:

1. **The leader receives the same totem bonus twice.** Effect adds the leader’s category dice, then Drain automatically adds every member’s category dice—including the leader’s—despite the stated “haven’t used in this ritual” rule.  
   **Fix:** Record totem bonus dice used in Effect and offer only the unused balance for Drain, handling penalties separately.

2. **Early healing aborts have no frozen Drain level.** The level is frozen only in Effect, but Link failure, Sending failure, withdrawal, or Terminate can create Drain obligations before Effect occurs.  
   **Fix:** Resolve and persist wound-dependent Drain severity when an abort creates obligations if no level has already been frozen.

3. **Astral Drain regresses existing behavior.** “Physical if Force > Magic” omits projecting members, particularly the newly supported astral guide; ordinary casting makes their Drain Physical regardless of Force ([item.mjs:1726](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1726)).  
   **Fix:** Use each member’s projecting state as an additional Physical-Drain condition.

4. **Sustaining dice are not explicitly removed before Drain allocation.** Recording “Magic × dice hours” while validating Drain shares against the unchanged leftover pool permits the same dice to buy duration and resist Drain. Also, the blanket claim that sustaining penalties/exclusivity do not apply contradicts the locked-in mode’s stated “counts as sustaining.”  
   **Fix:** Subtract sustaining allocations before splitting Drain dice, and describe locked-in restrictions as GM-enforced rather than inapplicable.

5. **Withdrawal misses concrete boundary cases.** Subtracting a contribution can make the pool negative, but the abort condition says “At 0”; withdrawing the guide does not expressly abort, and withdrawing the leader leaves later tests without a defined leader.  
   **Fix:** Abort at pool ≤ 0 and on guide withdrawal, and either forbid leader withdrawal or explicitly terminate the ritual.

6. **Restricted spells lose existing Force and consumption semantics.** The new path checks the fetish but never says to consume an expendable one, and it uses one Force throughout instead of the actual/effective split implemented by `spellForces` ([restricted-spells.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/restricted-spells.mjs), [item.mjs:1494](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1494)).  
   **Fix:** Preserve actual/effective Force semantics and explicitly require fetish consumption, either implemented once or confirmed as a manual GM step.

7. **The recovery tags are inconsistent and must exist at message creation.** Link/Sending use `{ ritualId, stage, dice }`, but Effect uses only `"effect"`, which cannot identify the owning ritual. Existing `rollSuccessTest` does not propagate arbitrary flags, so tagging afterward introduces precisely the untagged-roll failure window adoption is intended to solve ([actor.mjs:478](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:478)).  
   **Fix:** Pass one structured ritual tag into the original `ChatMessage.create`, and adopt pending Effect and member Drain tests as well as Link/Sending tests.

8. **Card keys do not cover all publication side effects.** `_postAreaResults` creates a template, public summary, target cards, and private summary; `ritualId + ":" + targetUuid` cannot distinguish all those artifacts. `igniteFromCast` also changes actor state, which a card-only marker cannot protect ([item.mjs:2049](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:2049), [spell-effects.mjs:282](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/spell-effects.mjs:282)).  
   **Fix:** Give each artifact an identity including its kind, and either make Ignite’s actor mutation recoverable or leave Ignite application explicitly manual.

9. **The atomic Drain update needs to preserve overflow.** Existing `applyDamage` performs separate updates for monitor damage, physical overflow, and Stun conversion; calling it and then writing the marker violates the proposed guarantee, while updating only the primary monitor loses damage ([actor.mjs:2560](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2560)).  
   **Fix:** Calculate the complete damage update—including overflow and Stun conversion—and commit it with the ritual marker, including a marker for fully resisted Drain.

10. **Automated material charging retains a Start retry problem.** Removing Magic Pool debits does not remove the separate nuyen-write/record-write failure window; retrying an interrupted Start can charge materials again.  
    **Fix:** Make material payment a GM-confirmed manual step, or commit a payment marker with the nuyen deduction.

11. **The privacy guarantee needs a data-access test, not merely a hidden-card test.** “Whispered messages never reach players” is stronger than the visibility behavior documented by the [Foundry v13 ChatMessage API](https://foundryvtt.com/api/v13/classes/foundry.documents.ChatMessage.html); that documentation alone does not establish that arbitrary flags are withheld.  
    **Fix:** Verify from a player client that the ritual flags cannot be read through the message collection or incoming document data before treating whispers as confidential storage.

I would keep the simplified architecture. These fixes concern calculations, recovery promises, and misleading rules statements—not a requirement to automate the GM’s adjudication.

VERDICT: REVISE

### Claude's response
All 11 accepted; **no point is left in dispute**:
- #1: the leader's totem dice are recorded and only the balance is offered.
- #2: the Drain level is frozen at an abort.
- #3: a projecting member's Drain is Physical.
- #4: sustaining dice are removed before the split, and locked-in restrictions are GM-enforced.
- #5: abort at ≤ 0, a guide withdrawal aborts, and the leader can't withdraw.
- #6: spellForces actual/effective; an expendable fetish is consumed once at preflight.
- #7: one structured tag set at creation via a rollSuccessTest flags pass-through.
- #8: artifact keys with kinds; Ignite via a GM button.
- #9: a pure damageUpdate committed with the marker.
- #10: the materials charge and its paid marker go in one update.
- #11: the record is not called confidential; Foundry already sends world data, hidden tokens included, to every client.

MAX_ROUNDS reached. The architecture was approved in substance ("I would keep the simplified architecture"), and the remaining points were fixes, all applied. Building.
