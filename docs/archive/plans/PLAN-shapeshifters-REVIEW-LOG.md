# Plan Review Log: Shapeshifters
Started 2026-10-29. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. These findings are based on its quoted rules and the repository; no files were modified.

1. **Player damage never triggers the proposed GM death checks.** `commitDamage` calls `Hooks.callAll` locally in `module/drugs.mjs:98`; an active-GM-only listener never receives a player’s commit. Its payload also lacks the before/after monitors needed to detect “became full.”  
   **Fix:** Persist a receipt containing before/after monitors and damage provenance in the damage update, then let the GM reconcile pending receipts.

2. **Regeneration can overwrite concurrent damage.** `once()` deduplicates a tick; it does not serialize its monitor write against player damage, healing, or another manual regeneration operation. The existing damage queue is client-local.  
   **Fix:** Establish one authoritative writer for regeneration and conflicting monitor operations, with revision checks and pending-operation recovery.

3. **Claims do not make retries safe.** A crash after claiming but before healing/card creation permanently skips that operation; ordinary claims can also be pruned.  
   **Fix:** Store durable operation receipts and explicit pending/completed states, with a recovery procedure.

4. **Unresolved death checks do not block healing.** The next tick can erase the wounds while the GM’s card is unanswered; only NPC ticks explicitly exclude dead actors, and token status does not define actor-wide death for linked tokens or tokenless actors.  
   **Fix:** Persist an actor-scoped wound episode and death outcome, block regeneration while pending/dead, and mirror that outcome to token statuses.

5. **Death detection misses further qualifying damage.** “Was below max” ignores subsequent Deadly hits while already full, and sheet edits/bleeding bypass `damageCommitted`; the proposed `deathCheckFor` signature cannot distinguish PC/NPC or human/animal form.  
   **Fix:** Define qualifying wound events explicitly and pass actor kind, form, before/after totals, and wound provenance into a single episode evaluator.

6. **The survivor rate contradicts the quoted rule.** Human-origin damage remains in the half-Essence bucket even after surviving a Deadly check, although the plan says survivors heal Essence boxes per turn.  
   **Fix:** Model the surviving-Deadly episode’s regeneration rate explicitly.

7. **Mixed buckets have an unspecified total healing budget.** Independently healing animal damage by E and human damage by E/2 permits 9 boxes per turn at Essence 6; the quoted rules do not establish that additive allowance.  
   **Fix:** Specify and substantiate a shared per-turn allocation rule for mixed-origin wounds.

8. **One damage-source option misclassifies secondary damage.** `commitDamage` can apply the original hit, Hyper Stun, and Stun overflow to Physical in one update; tagging the whole update `"bane"` or `"drain"` gives unrelated secondary damage that provenance.  
   **Fix:** Pass per-monitor, per-source deltas from `damageUpdateFor`/`commitDamage`, including an explicit Stun-overflow policy.

9. **Existing wounds and copied flags have no initialization policy.** Converting a wounded actor to a shapeshifter cannot recover wound provenance; copied/unlinked actors can inherit stale buckets and carry. “Clamp sums” does not define which bucket receives missing damage.  
   **Fix:** Specify deterministic initialization and actor-UUID ownership, with value-based migration/repair rules tested against schema-cleaned defaults.

10. **The social-skill prohibition never matches.** `SkillData.category` has `active`, `build_repair`, `knowledge`, `language`, and `special`—no `social` (`item-data.mjs:65`). Blocking every language roll also exceeds “cannot speak,” preventing comprehension tests.  
    **Fix:** Use an explicit social-skill classifier and distinguish spoken language use from comprehension.

11. **Adept suppression misses independent paths.** `_applyAdeptSkills()` separately grants Improved Ability; Killing Hands is discovered in `sheet-actions.mjs:613` and applied in `item.mjs:1144`. Skipping `_collectItemModifiers` leaves these operational.  
    **Fix:** Share an adept-power eligibility predicate across derivation and execution, clearing `_adeptBonus`/`_adeptSource` before any early return.

12. **Weapon restrictions miss defensive and astral attacks.** `rollMeleeDefense` resolves counterattacks directly, and `actorAstralProfile` selects the first melee weapon regardless of form; neither is necessarily covered by “the attack entry point.” Blank weapons are also described as unrestricted but rejected for animal PCs.  
    **Fix:** Define one weapon/form eligibility contract and apply it to attack, defense, astral selection, and execution after dialogs.

13. **Always returning `"dual"` changes more than attributes.** `astralProfile`’s dual branch removes Sorcery/focus choices and Astral Pool, uses physical armor, and selects a physical weapon—even while projecting.  
    **Fix:** Separate astral presence, projected state, attribute mapping, and combat profile instead of overloading `astralKind`.

14. **Astral visibility and movement remain wrong.** `astral.mjs:19` checks only `astralState`; `movement.mjs:123` uses Intelligence for projected Quickness; `CharacterData.astralReaction` remains unchanged. NPC `shapeshifter.enabled` does not imply the existing `dualNatured` field.  
    **Fix:** Route visibility, perception controls, NPC dual presence, projection, Reaction, and movement through shared shapeshifter-aware helpers.

15. **The proposed maximum becomes a form-dependent advancement price.** All four direct `racialMaximums` reads are identified, but `naturalInfo.cap` also feeds `advanceKarma`; substituting `6 + formMod` invents a racial maximum despite the quoted exemption and lets shifting alter advancement cost.  
    **Fix:** Separate the creation base cap from advancement ceilings and define form-independent advancement pricing.

16. **NPC forms can stick or become authored accidentally.** Overwriting bases, Reaction modifiers, initiative dice, and armor requires restoration when selecting blank/deleting a form; existing editable sheet fields can save prepared form values into the underlying stat block.  
    **Fix:** Derive effective form stats from authoritative source each pass and expose authored values separately in editors, preserving intended Active Effects.

17. **Blank schema contracts are incomplete.** Only character species explicitly gets `blank:true`; NPC `activeForm`, weapon form, and other optional choice fields need valid blank defaults. A validation failure prevents runtime migration from reaching the document.  
    **Fix:** Specify complete field options and test construction of legacy actors/items with all new defaults before relying on migrations.

18. **Implant rejection contradicts the user decision and is interruptible.** The decision says every implant, but the implementation removes only cyberware, leaving installed bioware. Updating form first permits failure or another shift before uninstall completes; existing uninstalled cyberware can be installed through updates despite the creation guard.  
    **Fix:** Include cyberware and bioware, enforce installation eligibility on updates, and make shifting a recoverable operation that suppresses implants throughout transition.

19. **Priority-table substitution can break rendering and does not enforce magic eligibility.** The renderer reads every category for every A–E row and calls `resources.toLocaleString`; “A = race” needs a complete row. Existing magic comes from tradition items, not those descriptive dropdowns.  
    **Fix:** Provide complete render-safe rows and explicit validation of race, selected tradition, magic priority, and supported priority methods.

20. **Clock coexistence is not solved by revision bumps.** Healing-clock bleeding writes can occur outside `commitDamage`, pending bleeding must settle before treatment, and manual elapsed-minute regeneration has no protection against overlapping combat ticks or repeated submissions.  
    **Fix:** Settle healing-clock work outside the damage queue, fence regeneration with revisions, and record the interval each regeneration operation consumes.

21. **Several promised mechanics have no consumer or validation plan.** Bear/tiger Reach is returned but never integrated; Magic-loss checks are quoted but unimplemented; only pure Vitest coverage is specified for a feature dominated by persistence and cross-client behavior.  
    **Fix:** Wire Reach and survivor Magic-loss handling, and require Quench cases for player-origin damage, pending death, simultaneous writes, repeated preparation, form removal, and failed shifts.

VERDICT: REVISE
### Claude response
Accepted most. User changed stun decision mid-review: Physical only. Rejected: bioware rejection (#18 — book says cyberware); cross-client CAS for ticks (#2 — documented shortcut, same as healing clock); astral visibility change (#14 — token is physical); interval records for manual regen (#20 — refused during combat instead). Mixed budget (#7) resolved conservatively (shared E budget).

## Round 2 — Codex
The Physical-only change is reflected consistently, but several blocking defects remain.

1. **§7 explicitly accepts lost damage.** A GM tick can read 6 boxes, a player commit 3 more, then the tick overwrite 9 with 0. Absolute writes are not idempotent against intervening damage, and the local queue does not protect other clients.  
   **Fix:** Serialize conflicting monitor operations through one authoritative writer with durable requests, or defer automatic ticks until a safe coordination mechanism exists.

2. **NPC death checks are never created.** §6 limits the hook that creates `death` to shapeshifter characters; §8 nevertheless promises NPCs use that state, while §7 clears their Physical wounds.  
   **Fix:** Run death admission for both actor types, keeping only bucket accounting PC-specific.

3. **Death resolution still races across GM clients.** Checking that the ID matches does not stop two clients resolving the same pending ID, nor a stale result overwriting a newly worsened `diesOn` under that ID.  
   **Fix:** Claim resolution against a versioned pending snapshot and persist one recoverable outcome before applying consequences.

4. **The survivor bonus never expires.** Nothing clears `survived` after the qualifying wounds heal, so a survivor can permanently regenerate future human-origin damage at full Essence.  
   **Fix:** Scope the bonus to a wound episode and reset it when that episode ends.

5. **Claiming before eligibility silently consumes regeneration.** §7 claims the round before checking pending/dead; resolving the death check afterward cannot recover that tick. A crash between claim and write similarly loses it.  
   **Fix:** Specify whether blocked ticks are forfeited or deferred, and track pending/completed tick receipts with recovery.

6. **The new natural-attribute formula clamps advancement forever.** §2 unconditionally clamps base plus edge to 6, whereas existing `_naturalAttribute` stops clamping after chargen; buying base 7 would cost Karma without improving the attribute. Negative species modifiers can also produce zero/negative natural ratings without an explicit floor.  
   **Fix:** Apply the base ceiling only during creation and define the minimum after form modifiers and permanent losses.

7. **Cyberware rejection is not interruption-safe.** After the form update, a failed uninstall followed by shifting human reactivates the supposedly rejected implants. Suppressing `_collectItemModifiers` alone also misses skillwires, cranial decks, limb modeling, armor, and other `workingImplant`/installed checks.  
   **Fix:** Persist rejected implant IDs with the transition and make every operational consumer treat them as uninstalled until cleanup completes.

8. **Direct form updates bypass uninstall entirely.** The proposed `preUpdateActor` only refuses prohibited changes; an otherwise legal macro/sheet update to animal form does not execute `shiftForm`’s cleanup.  
   **Fix:** Reconcile rejection from every accepted form transition, rather than only from the button handler.

9. **The projection restriction still lacks an enforcement path.** Existing `toggleAstral` cycles `none → perceiving → projecting` without checking form or magician eligibility; §5 says “human-form magicians only” but leaves that toggle in place.  
   **Fix:** Enforce projection eligibility in the actor update boundary and make the toggle skip unavailable states.

10. **Astral branch precedence remains underspecified.** Calling `isDualNatured` at `astral-combat.mjs:35` returns `"dual"` before the existing projecting branch, contradicting the promised projecting profile. That profile also currently reads Charisma/Willpower directly.  
    **Fix:** Handle projection first and explicitly feed mapped astral Strength/Body into projected damage/resistance, preserving magician skills and pools.

11. **Clock settlement remains missing.** Refusing manual regeneration during combat does not settle overdue bleeding outside combat; healing can erase wounds before owed bleeding is applied. `reconcileHealing` expressly requires treatment to wait when settlement is pending.  
    **Fix:** Settle the healing clock before regeneration, outside the damage queue, and abort when settlement returns false.

12. **Magic loss can duplicate existing clock handling.** The plan adds a survivor Magic-loss roll without coordinating with healing-clock’s existing owed-Magic-loss processing; its own receipt does not deduplicate another subsystem’s receipt.  
    **Fix:** Give both systems one episode-level Magic-loss admission and result record.

13. **NPC source restoration can discard Active Effects.** Rebuilding Reaction modifiers and armor directly from `_source` conflicts with the architecture’s preserved AE contributions on those fields.  
    **Fix:** Combine authoritative form/base values with the current preparation’s AE contributions, and test selecting and clearing forms with effects active.

14. **The priority renderer still mislabels the race.** `actor-sheet.mjs:1657` renders anything other than `"metahuman"` as “Human only,” so the new `"shapeshifter"` row receives that label despite complete numeric fields.  
    **Fix:** Add explicit shapeshifter race labels and distinguish unavailable categories from valid zero allocations.

15. **The tests omit the acknowledged failure modes.** Two sequential tick calls do not test competing clients, claim/write interruption, same-ID death resolution, or a failed uninstall followed by shifting back.  
    **Fix:** Add adversarial persistence tests for those interleavings before treating the lifecycle as covered.

The earlier visibility finding needs narrowing: physical token visibility itself needs no change, and voluntary perception can legitimately continue using `astralState`. The concrete remaining astral problems are projection admission, branch precedence, and mapped combat attributes.

VERDICT: REVISE
### Claude response
Accepted all but #1 (rejected with reasons in Key decisions #7). Cyberware rejection reordered (uninstall first) and every form write guarded; tick receipt moved into the healing write (no claim); blocked ticks forfeited (book rolls the check at once); death resolution claim on id+rev.

## Round 3 — Codex
I accept Key decision 7 as an explicit scope tradeoff and am not requiring a global monitor-writer redesign. The following failures remain independently of that tradeoff.

1. **`activeGM` identifies a user, not one client.** Two tabs/devices logged in as that GM both run regeneration; their queues are separate. One can read the healed monitor before receiving `lastTick` locally and apply another tick. Sequential duplicate-call tests do not establish cross-client exclusion.  
   **Fix:** Use server-arbitrated admission for each actor/combat/round, with recoverable completion receipts.

2. **A single `lastTick` permits repeat healing after rewinding.** After healing rounds 2 and 3, rewind to 1 and advance to 2: `lastTick === combat:3`, so round 2 heals again despite the “never on decrease” check.  
   **Fix:** Store a per-combat round high-water mark and reject every round already covered.

3. **Death-resolution claims can permanently strand an actor.** A crash or failed update after `once("deathres:<id>:<rev>")` leaves the check pending, but every retry loses the claim; the sheet button only recovers missing cards.  
   **Fix:** Add explicit resolution takeover/recovery, or publish the rolled outcome as a durable event before applying it.

4. **Death resolution can overwrite outright death without changing its fence.** `rev` advances only on a worse `diesOn`; another hit can set `state:"dead"` while an existing resolver still holds the same ID/revision and later writes “survived.”  
   **Fix:** Advance the generation on every invalidating death-state transition and require matching ID, revision, and `state:"pending"` immediately before publication.

5. **The Magic-loss deduplication argument is false.** Resolution rolls Magic loss before regeneration changes a monitor. A Deadly healing course can complete between those operations—or during the mandatory `reconcileHealing` before regeneration—and roll its own check first. Subsequent revision invalidation cannot undo either roll.  
   **Fix:** Share a wound-episode Magic-loss receipt between regeneration and healing-clock processing.

6. **NPC AE restoration violates the repeated-preparation contract.** `prepared − _source` is not necessarily an AE contribution: it includes the previous form override. Source Reaction modifier 0 → form modifier 2 → second preparation can produce 4. Initiative also already adds `initiative.mod` separately.  
   **Fix:** Rebuild from authoritative source/form values and independently obtained AE contributions, never infer effects from previously derived output.

7. **Projection still relies on a nonexistent eligibility guard.** “Keeps whatever check exists for non-magicians” supplies no check: `toggleAstral` directly cycles states, and the existing `astralKind` character branch does not require magician eligibility. A human-form mundane shapeshifter can therefore project through an update.  
   **Fix:** Explicitly validate projector eligibility and the resulting form in `preUpdateActor`, including updates changing both fields.

8. **Advancement’s permanent-loss calculation conflicts with the new natural rating.** Example: base 2, form bonus +5, permanent loss 2 gives natural 5; raising base to 3 gives 6. But form-free `naturalInfo` makes `advanceKarma` compare `max(1,2−2)` with `max(1,3−2)` and refuse the purchase as ineffective.  
   **Fix:** Separate the form-independent price calculation from the effective-rating eligibility calculation.

9. **A legacy astral resistance caller remains unmapped.** `SR2EActor.rollAstralResistance` at `module/documents/actor.mjs:2877` directly rolls Willpower; updating `astralProfile`, Reaction, and movement does not fix existing `flags.sr2e.astral` cards.  
   **Fix:** Route that legacy handler through the shared astral attribute map as well.

10. **Round 1 now regenerates prematurely.** The revised trigger handles every round increase and no longer excludes combat start; moving from round 0 to 1 heals before a Combat Turn has elapsed.  
    **Fix:** Require an elapsed prior round and define how round jumps account for elapsed turns.

These need targeted tests for rewind/replay, failed death publication, outright death during resolution, healing-course completion before regeneration, and repeated NPC preparation with form overrides.

VERDICT: REVISE
### Claude response
All 10 accepted: once() admission + per-combat high-water; elapsed-round rule; rev on every transition + takeover recovery; shared wound-episode Magic loss key; aeDelta from effects; explicit projection eligibility; advancement split; legacy astral resistance mapped.

## Round 4 — Codex
Key decision 7 remains accepted as a scope tradeoff. The revision still has these concrete defects:

1. **Regeneration calculates elapsed turns before its queued re-read.** If handlers for 2→3 and 3→5 overlap, the latter can heal two turns first, then the older handler skips—losing one turn.  
   **Fix:** Calculate elapsed turns inside the queue from a persisted processed-round cursor, explicitly recording forfeited rounds.

2. **Death takeover works only once.** If `deathres:<id>:<rev>:takeover` also fails before publication, all subsequent recovery attempts lose that same claim forever.  
   **Fix:** Use numbered recovery attempts with durable outcomes and fencing against earlier attempts.

3. **The new Magic-loss claim can swallow the check permanently.** A resolver claims `magicloss-ep`, then fails its outcome write or becomes stale; its replacement loses the Magic-loss claim and skips an outcome that was never committed.  
   **Fix:** Distinguish pending from completed Magic-loss operations and recover incomplete claims rather than treating every losing claim as completed.

4. **Magic-loss deduplication misses non-clock healing.** `actor.mjs:3709` calls `_magicLossChecks` after ordinary Deadly healing, independently of `settleMagicLoss`; that path can still charge a second check after shapeshifter survival.  
   **Fix:** Route every Deadly-wound Magic-loss caller through the shared receipt, while preserving separate treatment-related checks.

5. **A shared Magic-loss key needs the original wound’s episode, not the current one.** Healing-clock obligations can remain pending after healing or subsequent injuries; reading the actor’s current episode during settlement can claim the wrong wound’s key. Existing obligations also combine Deadly and waived-magician checks as a count.  
   **Fix:** Persist episode and check reason on each owed check when created, and deduplicate only the Deadly component.

6. **`naturalInfo` has contradictory requirements.** §2 says it gains `form`, then immediately says the form modifier is “NOT in `naturalInfo`.” The proposed effectiveness formula also omits the creation clamp and edge contributions used by `_naturalAttribute`.  
   **Fix:** Specify one authoritative structure and reuse the natural-rating calculation for before/after eligibility, keeping pricing separate.

7. **NPC effect handling now silently drops non-ADD effects.** Summing ADD changes preserves additive bonuses but overwrites previously supported OVERRIDE/MULTIPLY effects on Reaction or armor—even when no form is selected.  
   **Fix:** Apply the applicable effects in their normal order to the selected source/form baseline, or explicitly preserve existing behavior when no form is active.

Add focused tests for overlapping round handlers, repeated takeover failure, interrupted Magic-loss publication, non-clock Deadly healing, delayed obligations across wound episodes, and non-ADD effects.

VERDICT: REVISE
### Claude response
Simplified instead of adding locks: death results are durable chat events (earliest per id/rev wins, idempotent apply, no claims); Magic loss = existing _magicLossChecks via a once-per-card GM button (documented shortcut vs. other healing paths); per-actor regen cursor computed inside the queue, defaulting to the join round; NPC forms set in prepareBaseData so Foundry applies all effect modes normally; naturalInfo form-free, eligibility via _naturalAttribute.

## Round 5 — Codex
The NPC `prepareBaseData` change resolves the effect-order problem. Key decision 7 remains an accepted tradeoff. These issues still need revision:

1. **Death outcomes cannot safely copy the second-hand settlement pattern.** Second-hand duplicates all write the same `failed:true`; competing death messages can disagree. The plan provides no concrete server-order field or mechanism ensuring a client has received the earliest result before applying its own.  
   **Fix:** Publish the rolled outcome using existing `recordEvent(actor, deterministicKey, payload)` and render chat from that authoritative record—no separate claim or takeover needed.

2. **The Magic-loss button is not once-per-card.** `_magicLossChecks` changes Magic before the card flag is written; two clicks/devices can both run it, and failure between those writes leaves an executable button after Magic was already lost. This is separate from the documented overlap with normal healing.  
   **Fix:** Either make the button a manual roll/reminder without automatic Magic mutation, or persist its outcome and apply Magic plus its receipt in one actor update.

3. **Existing combatants lack `joinedRound`.** `preCreateCombatant` only covers newly created combatants; existing saved combats have neither that flag nor a regeneration cursor, making the elapsed-turn calculation undefined.  
   **Fix:** Lazily initialize missing legacy cursors to the observed pre-transition round and test an existing in-progress combat.

4. **Removing and re-adding an actor heals time spent outside combat.** Its old `high[combat]` survives, so the new combatant’s join round is ignored whenever that cursor exists.  
   **Fix:** Reset or bound the cursor by the new participation’s join round, deduplicating multiple combatants representing the same actor.

5. **The documented crash-forfeit behavior contradicts the cursor algorithm.** If round 3 is claimed but its write fails with `high=2`, round 4 computes `4−2` and heals both turns; the supposedly forfeited turn is recovered.  
   **Fix:** Explicitly choose catch-up behavior and document/test it, or persist forfeiture before later elapsed-time calculation.

6. **Per-round claims do not serialize overlapping rounds across GM clients.** Different clients can win rounds 3 and 5, both read `high=2`, then write in reverse order; the older write can restore wounds and regress the cursor to 3. The promised three-turn total only holds within one client’s queue.  
   **Fix:** Use one designated client for tick execution, or arbitrate each cursor advance by its starting cursor rather than only its destination round.

Add tests for conflicting death results, duplicate/interrupted Magic-loss clicks, legacy combatants, rejoining, and overlapping rounds on separate clients.

VERDICT: REVISE
### Claude response (MAX_ROUNDS reached)
All 6 accepted and applied: recordEvent for death results and Magic loss (durable, one accepted, idempotent apply); cursor per combatant with join/legacy defaults; advance claimed by starting cursor; crash = catch-up (documented). Not re-reviewed: the loop cap was hit. Points still open: none Claude disputes; Key decision 7 (no CAS) was accepted by Codex in rounds 3–5.

## Code round 1 — Codex
Found seven concrete issues. No files modified; the accepted cross-client monitor-write tradeoff is not included below.

1. **[P1] A failed regeneration write blocks every subsequent tick.** In [shapeshift.mjs:188](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:188), the claim key contains the starting cursor. If the following write fails, that cursor stays unchanged, so every later round loses the same claim. The plan’s promised catch-up never happens.  
   **Fix:** Add recovery for claimed-but-uncommitted cursor advances, with a test injecting failure after admission.

2. **[P1] Already-wounded characters cannot regenerate without another monitor change.** [regenWrite:154](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:154) passes empty buckets directly to `regenStep` for imported actors, newly enabled shapeshifters, and unlinked actors without their own state. Healing returns zero; the update hook sees unchanged totals and returns before reconciling buckets. This repeats indefinitely.  
   **Fix:** Reconcile buckets against the current Physical-plus-overflow total before calculating regeneration.

3. **[P2] Projected Initiative still uses Intelligence instead of the planned shapeshifter mapping.** [CharacterData.astralReaction:1659](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1659) remains `astralReaction(this.intelligence.value)`. Movement was updated, but this caller was missed, leaving projected Reaction and Initiative inconsistent with §5.  
   **Fix:** Route the getter through the shared astral Quickness mapping and test a projecting shapeshifter whose Intelligence and Quickness differ.

4. **[P1] Retrying Magic loss can restore previously lost Magic.** [deathMagicLoss:302](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:302) writes `rec.magic - 1`, using the rating captured when the roll was recorded. If that application fails, another effect reduces Magic from 6 to 4, and the GM retries, this writes **5**.  
   **Fix:** Apply the recorded loss against current Magic with its receipt atomically, refusing or explicitly resolving a changed-rating snapshot.

5. **[P2] Required survivor Magic-loss checks can become inaccessible.** [deathMagicLoss:289](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:289) rejects an old death ID as “done” after another wound replaces `death`. Additionally, `applyDeath` claims result-card creation before creating the sole Magic-loss button; a failed chat write leaves no sheet recovery once the death state is already “survived.”  
   **Fix:** Keep outstanding Magic-loss checks keyed by death ID independently of the current death state, and expose them on the sheet.

6. **[P2] Adding forms generates duplicate keys after deletion.** [addForm:3822](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3822) uses `forms.length + 1`: create `form1`, `form2`, delete `form1`, then add another—the new key is also `form2`. Since `activeFormOf` selects the first matching key, the second form cannot be selected correctly; manual edits also allow duplicates.  
   **Fix:** Generate an unused stable key and reject duplicate or blank keys in the forms editor.

7. **[P2] Ordinary ammunition inherits the firearm’s material.** [item.mjs:1279](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1279) uses `(hasAmmo && ammo.material) || weapon.material`. Loaded ordinary rounds with blank material therefore become “silver” when fired from a silver-tagged weapon, incorrectly preselecting the bane bonus and damage provenance.  
   **Fix:** When ammunition is loaded, use its material even when blank; fall back to weapon material only without loaded ammunition.

The 13 Quench cases cover successful flows but do not exercise these failure/recovery cases, wounded-state initialization, projected Initiative, or form-key collisions.

VERDICT: REVISE
### Claude response
All 7 fixed: stuck-claim takeover after STUCK_MS (tested by planting an old marker); buckets reconciled before regenStep (pre-wounded test); astralReaction = Quickness + Intelligence for shapeshifters (core p.149 "twice Intelligence" = astral Q + Int); Magic loss owed by death id (`magicOwed`, sheet button), applied to the CURRENT rating with its receipt; unique form keys + duplicate/blank refused; loaded ammo material wins even when blank. Found while testing: flag updates MERGE nested objects, so deleted keys survived — state now writes explicit false/null. Quench 17/17; full sr2e.** 712/712 before these fixes.

## Code round 2 — Codex
The seven fixes are present, but two concurrency defects remain. Neither requires reopening the accepted general monitor-write tradeoff.

1. **[P1] Takeover claims reintroduce competing regeneration writers.** In [shapeshift.mjs:197](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:197), the takeover key includes `newRound`. After the original claim expires, clients processing rounds 3 and 5 can both win different takeover claims for the same cursor. Both can pass the cursor check before either update lands; the older write can then restore wounds and regress the cursor. The new test covers only one takeover.  
   **Fix:** Arbitrate recovery by a shared cursor-attempt generation, independent of destination round, and reject superseded attempts before applying.

2. **[P2] Concurrent outstanding Magic-loss checks overwrite each other’s receipts and deductions.** [deathMagicLoss:311–317](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:311) is outside any queue and writes the entire state snapshot. With two owed IDs and Magic 6, concurrent failing checks can both write Magic 5; one snapshot also restores the other ID’s `magicOwed:true`. This occurs even with two clicks in one client.  
   **Fix:** Serialize Magic-loss applications per actor, re-read inside that queue, and update only the specific receipt plus Magic rather than the entire shift state.

Add tests with two simultaneous takeover destinations and two simultaneous owed Magic-loss IDs; the current sequential recovery tests do not exercise either failure.

VERDICT: REVISE
### Claude response
Both fixed. Takeover attempts are numbered per cursor (n = highest attempt + 1, only once the latest attempt is older than STUCK_MS), independent of the destination round. Death application and Magic loss run in the actor damage queue, re-read inside, and write ONLY their own fields; the preUpdate hook and regenWrite also write only their own subpaths (b / survived / death; cursor / carry), so no whole-state snapshot can revert another writer. Tests: two owed Magic loss checks + a duplicate click in parallel (6 → 4, both receipts false); overlapping round updates after a stuck claim (cursor reaches 5, never regresses). Quench 19/19.

## Code round 3 — Codex
One correctness issue remains in the Magic-loss fix:

**[P2] Concurrent checks still roll against the same pre-loss Magic rating.** In [deathMagicLoss](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:310), reading Magic, rolling, and recording `lost` happen **before** entering the queue; only application is serialized. With Magic 6 and two rolls totaling 5, both records say “lost,” producing Magic 4. Sequential checks should produce Magic 5: the second roll equals the now-current rating and causes no loss. The added test uses rolls of 2, which cannot expose this difference.

**Fix:** Queue the entire read-rating → roll/record → apply operation, rechecking the receipt inside; add a concurrent two-check test with both totals equal to 5.

The other reviewed fixes address their reported failure cases. No files modified.

VERDICT: REVISE
### Claude response
Fixed: the whole check (read rating, roll, record, apply) runs inside the actor queue with the receipt re-checked. Test: two concurrent checks rolling 5 each at Magic 6 → 5. Quench 20/20.
