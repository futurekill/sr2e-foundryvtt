# Plan Review Log: healing on the game clock
Started 2026-10-25. MAX_ROUNDS=5.

## Round 1 — Codex
The plan has material correctness gaps. I read the requested code and the corrected-printing rulebook prose; no files were modified.

1. **Claims do not serialize healing against damage (§4–5).** `once()` arbitrates only identical keys; `commitDamage` uses a client-local queue. A GM can claim completion, a player can apply damage and cancel the course, then the GM’s stale update can erase that damage. Different Physical/Stun completion claims can also overlap.
   **Fix:** Serialize all monitor mutations through one authoritative per-actor writer, with durable requests and course-generation validation; a local queue alone is insufficient.

2. **Starting a course is unprotected (§3).** Desktop and phone can both observe no course, roll, then overwrite each other’s course and `stunFirst`; damage arriving during either roll also invalidates its assumptions.
   **Fix:** Admit starts through the same authoritative writer and revalidate the injury generation after rolling.

3. **Claim-before-update can permanently strand healing (§4, §8).** If the claim succeeds but the actor update fails or its client disconnects, subsequent scans cannot claim the unfinished work. Existing pruning protects open dose claims, not healing claims.
   **Fix:** Persist completion receipts atomically with monitor changes, protect pending claims from pruning, and specify a recoverable takeover procedure.

4. **Other healing can make a scheduled course inflict damage (§4–5).** Schedule Serious → Moderate, then magically heal to one box: writing stored `toBoxes: 3` later adds damage. Recomputing the level instead gives a different stage using the old stage’s timing. Manual monitor edits have the same problem.
   **Fix:** Invalidate or explicitly reconcile courses on every relevant monitor change, including First Aid, magical healing and manual edits.

5. **Damage bookkeeping must use actual monitor changes (§5).** Stun spills into Physical; Hyper can add Stun during Physical damage; Kamikaze can absorb the entire hit. Dispatching by requested damage type misses these cases. Also, the nonvehicle `applyDamage` path already delegates to `commitDamage`.
   **Fix:** Compute clock changes once inside `commitDamage` from before/after monitors, distinguishing landed injury from absorption and overflow conversion.

6. **Disabling the feature leaves dangerous stale courses (§1, D4).** While disabled, instant healing or new damage can change the monitor without invalidating frozen state; re-enabling can apply the obsolete course. Unchanged absolute deadlines also mean “freeze” actually becomes immediate catch-up.
   **Fix:** Define pause versus catch-up explicitly, and maintain course invalidation even while automatic completion is disabled.

7. **Bleeding has no complete episode lifecycle (§8).** Existing overflow has no `bleedAt`; healing out of overflow and later re-entering can reuse stale timestamps; restarting bleeding after maintained care stops is unspecified. Timestamp-only claim keys can collide after clock rewinds.
   **Fix:** Give each bleeding episode an ID, explicit start/stop transitions and a tick cursor; treat missing historical timestamps as unknown.

8. **Death handling is internally inconsistent (§8).** Capping at Body prevents satisfying `overflow > Body`; announcing death at Body kills too early. Without a terminal notification receipt, later scans can repeatedly announce death.
   **Fix:** Distinguish the maximum survivable overflow from the first lethal value, and persist one lethal-crossing receipt per episode without forcing a GM death decision.

9. **Permanent stabilization contradicts p.115 (§8, D6).** First-aid stabilization must be maintained continually until professional help takes over. A permanent boolean lets the medic leave indefinitely. D6 also references a “Cancel/stabilize” control absent from §6; canceling healing and stabilizing are different actions.
   **Fix:** Model maintained aid separately from self-stabilization/professional care, with explicit controls for ending aid and resuming bleeding.

10. **The golden-hour timestamp makes old wounds fresh (§2, §7).** One new Physical box resets eligibility for all existing injuries. The wording in §5 could even reset it for Stun. Existing and manually entered wounds have no trustworthy timestamp.
    **Fix:** Track an injury episode with explicit unknown/mixed-age status, and require GM adjudication rather than silently refreshing old injuries.

11. **Treat identification never reaches the application method (§7).** `applyMagicalHealing` receives a spell name, successes and message; it receives no `healingTnBase`. Ritual healing cards likewise omit that field. Reading the current spell later would also make old cards depend on edits or deletion.
    **Fix:** Snapshot a semantic Treat/Heal discriminator on every healing card and pass it through application, with a defined legacy-card fallback.

12. **The proposed Stun cap has an unresolved zero-success trap (§3).** Setting `stunFirst = 0` on the first failed roll makes every later capped roll zero until Stun reaches zero—which recovery can never accomplish. The quoted p.112 restriction concerns interrupted recovery; it does not establish the plan’s blanket injury-long cap unambiguously.
    **Fix:** Define the interrupted-recovery episode and failed-roll behavior explicitly before implementing `stunFirst`.

13. **Magic-loss consequences are lost or repeated (§3–4).** `healPhysical` currently calls `_magicLossChecks` after healing. Leaving it there makes canceled/restarted courses repeatedly trigger checks; moving it to completion requires information absent from the proposed course, including `waiveMagician`.
    **Fix:** Specify each check’s trigger, store the required treatment facts, and receipt the consequence independently of course retries.

14. **Unlinked-token enumeration alone is insufficient (§4, §9).** Synthetic actors can inherit base-actor flags and effects; a placed token may inherit a course or its claim. Actor-delete cleanup does not specify token/scene deletion, and the copied `allCharacters` helper excludes NPCs.
    **Fix:** Define course ownership by actor UUID, explicitly handle inherited/copied courses, enumerate supported types, and reconcile token/scene lifecycle changes.

15. **Visible notes expose more than the owner’s recovery (§9).** The existing Calendaria setting explicitly means visible to everyone, not just actor owners; copying it with default visibility on exposes NPC and private-character injuries.
    **Fix:** Default notes to hidden or implement verified owner-specific visibility.

16. **Instant First Aid is an unjustified scope exception.** P.115 requires uninterrupted treatment and allows interruption to abort it; its duration can materially consume the golden hour and world time. “Too short” is especially inconsistent with clocking individual Stun boxes.
    **Fix:** Clock First Aid treatment, or obtain an explicit ruling that its duration remains manual.

The validation plan also needs concrete multi-client tests: same-user desktop/phone starts, damage during completion, failure after claim, GM handoff, healing during a pending stage, off/on transitions, and inactive-scene unlinked tokens. Pure helper tests and unspecified “flows” will not establish these guarantees.

VERDICT: REVISE
### Claude's response
Accepted #2,#3 (receipt = course cleared in the same update),#4-#6 (snapshot validation replaces damage hooks),#7-#16. #1: accepted as a documented limitation shared with commitDamage (cross-client damage is not serialized anywhere today); completion validates inside the GM damage queue. #12: cap only after an interrupted course; 0 successes sets nothing. #15: notes hidden by default. #16: First Aid treatment clocked.

## Round 2 — Codex
The revision fixes several omissions, but still has material problems. No files were modified.

1. **Failed starts lock out future attempts (§3).** `healstart:<gen>` is claimed before rolling, but zero successes, failed natural-healing admission, or a changed monitor leave `gen` unchanged. The next attempt loses the same claim despite no course existing.  
   **Fix:** Persist a recoverable start attempt and advance its generation on every terminal outcome, including failure and cancellation.

2. **“Finish now” cannot recover the claimed failure described (§4, §7).** It follows §4, so its `healdone:<id>` claim fails too. Claims do not expire automatically: `pruneMarkers` must actually run, and its existing caller is substance settlement.  
   **Fix:** Specify an explicit, fenced takeover protocol for stuck starts/completions instead of relying on TTL or reusing the blocked claim.

3. **The acknowledged cross-client race remains a blocker (§4).** A player’s damage update can land after snapshot validation and before the GM’s healing write, which then erases damage. An existing race elsewhere does not make introducing automatic competing writes sound.  
   **Fix:** Coordinate healing and damage through an authoritative writer or a server-arbitrated mutation protocol; otherwise defer automatic monitor writes.

4. **Snapshot equality does not prove uninterrupted recovery (§2).** Start at six Physical boxes, take damage to seven, then receive healing back to six: completion accepts the original snapshot. The same happens during off/on periods. This directly contradicts “ANY other change … voids.”  
   **Fix:** Track monitor-change revisions and invalidate the course when a relevant change occurs, rather than comparing only final values.

5. **Bleeding starts at the next scan, losing elapsed time (§6).** Take overflow damage at noon, then advance world time to 13:00: the first scan initializes `cursor` at 13:00 and applies no bleeding. With the listed hooks, ordinary damage does not trigger a scan.  
   **Fix:** Initialize known bleeding episodes in the damage commit at the actual injury time; reserve “start now” for genuinely unknown historical overflow.

6. **Bleeding episode resets can be missed (§6).** Heal overflow to zero and take new overflow before the next scan: the old episode survives, including its cursor, stabilization or `lethal` flag. New damage can therefore remain permanently stabilized or never tick.  
   **Fix:** Commit episode creation, termination and renewed-injury handling alongside monitor changes.

7. **Concurrent scans can create different bleeding episodes (§4, §6).** Two hooks—or two sessions logged in as the active GM—can both see no episode and assign different IDs. Claims using those different IDs do not arbitrate the initialization.  
   **Fix:** Serialize episode initialization and transitions with a shared generation claim, including rereads after admission.

8. **Magic-loss work disappears after healing commits (§4).** Clearing the course removes the only pending-work record before checks run. A disconnect before `magicloss` skips them forever; a disconnect after claiming it also strands them. Two required checks can fail halfway through.  
   **Fix:** Persist pending consequences in the healing update and receipt each check’s result independently.

9. **One course per actor invents a substantial rules restriction (§2, D5).** Nothing cited establishes that recovering Stun cannot happen during days of natural Physical healing. The plan forces a wounded character to cancel that entire Physical stage to recover one Stun box.  
   **Fix:** Allow independent Physical and Stun recovery, with explicitly defined interruption rules; obtain a user ruling before imposing mutual exclusion.

10. **Automatic interruption bypasses the Stun cap (§2–3, §7).** Damage causes generic voiding, but only the “Rest interrupted” button stores `stunCap`. A player can therefore reroll without the cap after damage interrupts rest. Repeated interruptions also replace the original cap with a potentially lower reroll result.  
    **Fix:** Route interrupted Stun recovery through one transition that preserves the original attempt’s cap across retries.

11. **Synthetic ownership checks cover only the course (§2).** An unlinked token can still inherit `gen`, `stunCap`, injury/bleeding state and the base actor’s `healstart:<gen>` claim. Hiding an inherited course does not prevent that inherited claim from blocking its own start.  
    **Fix:** Namespace claims by actor UUID and validate ownership of the complete clock state, initializing token-local state explicitly.

12. **Starting during a wound change remains ambiguous (§3).** The plan says both “snap read AFTER the rolls” and “if the monitor changed … refuse,” without storing the admission snapshot. Checking only the re-derived wound level misses same-level changes and changed Stun penalties.  
    **Fix:** Capture the monitor revision before rolling and require it to remain unchanged before installing the course.

13. **The test clock is not scoped as claimed (§10).** `game.time.advance` changes world time and invokes unrelated listeners; an actor filter in healing code cannot prevent substance, cybermancy or other clocks from reacting. This conflicts with `CLAUDE.md`’s explicit testing guidance.  
    **Fix:** Inject time into a reconciliation entry point scoped to test actors, and reserve real world-time advancement for an isolated test world.

Also specify how care ends, how existing lethal overflow is handled without reducing its value to the cap, and how a GM clears a lethal episode after adjudicating survival. Those transitions currently have no defined controls.

VERDICT: REVISE
### Claude's response
Accepted #1 (startGen bumped on every terminal outcome + GM Clear stuck start), #2 (completion writes absolute values from the course: duplicates are harmless, no completion claim to strand), #4-#7 (one preUpdateActor hook: per-column revisions, damage interrupts rest, wound and bleeding episodes in the same update as the damage), #8 (pendingLoss with per-check receipts), #9 (Physical and Stun independent), #10 (cap kept across interruptions), #11 (owner field, uuid in every key), #12 (revision captured before rolling), #13 (injected now, no world-time advance), care/lethal controls. REJECTED #3 as a blocker: the same cross-client window exists for every pair of clients damaging one actor today; a server-arbitrated monitor sequencer is a separate project. Documented in the plan with the mitigation.

## Round 3 — Codex
I accept the documented general cross-client damage race for this review. The following problems remain specific to the proposed healing implementation. No files were modified.

1. **Completion is not fully idempotent (§4).** Two GM sessions can validate the same course before either writes. Although monitor values match, `careReceipt()` generates a different random receipt for each completion, producing duplicate cybermancy consequences; a delayed duplicate can also reset `pendingLoss.done` to zero.  
   **Fix:** Key every completion consequence deterministically by course ID and prevent duplicate writes from resetting existing progress.

2. **“Clear stuck start” does not fence the original starter (§3).** A phone can remain suspended during a roll, the GM advances `startGen`, another device starts a course, then the phone resumes and overwrites it because only the monitor revision is checked.  
   **Fix:** Before committing, require the original `startGen` still to be current and the target course slot still to be empty.

3. **Physical damage during a Stun start is undetected (§2a–3).** While the Stun roll is pending, Physical damage increments only `rev.phys`; there is no Stun course yet to void. The starter checks unchanged `rev.stun` and installs recovery using the old injury penalty despite interrupted rest.  
   **Fix:** Validate both monitor revisions for Stun admission, or maintain a separate rest-interruption revision.

4. **New damage after stabilization can cause immediate backdated bleeding (§2a, §6).** Stabilize at noon, take another overflow box at 18:00: the hook clears `stable` but retains the noon cursor, so the next scan charges six hours of bleeding during maintained care.  
   **Fix:** When new injury changes a stable episode to unstable, reset its cursor to the new injury time.

5. **Bleeding still has an unrecoverable claim-before-write gap (§6).** A successful tick or initialization claim followed by a failed update leaves the same claim blocking every retry. None of the recovery controls addresses bleeding claims.  
   **Fix:** Give bleeding initialization and ticks explicit receipted recovery/takeover behavior, with failure-injection tests.

6. **Automatic bleeding is misclassified as a fresh injury (§2a).** Every tick increases overflow, so the hook refreshes `injury.lastAt`, making an old wound appear mixed-age for First Aid/Treat. It also applies generic course-interruption logic to a scheduled consequence.  
   **Fix:** Distinguish internally generated bleeding updates from fresh injuries while still incrementing the appropriate monitor revision.

7. **First Aid completion omits existing treatment flags (§4).** `_healOneLevel` sets `firstAided` and clears `magicallyHealed` when fully healed; the new completion update lists neither. Without those writes, repeated clocked First Aid can reduce multiple levels without even the existing warning.  
   **Fix:** Extract and reuse the complete healing-update builder, including treatment markers and their reset rules.

8. **The single `pendingLoss` slot can overwrite unresolved checks (§2, §4).** A course finishes with checks pending; another course starts and is finished before those checks resolve, replacing their ID and count. Nothing blocks that sequence.  
   **Fix:** Store pending checks by course ID, or refuse new treatment until existing consequences have been resolved.

9. **Stun completion references missing state and omits cap reset (§2, §4).** “Its value at start − 1” is not stored in the Stun course. Also, the interrupted-recovery cap now clears only at zero Stun, contradicting the prior round’s completed-box reset and this round’s “cap applies once” test.  
   **Fix:** Store the absolute target Stun value and explicitly clear the cap when that recovery box completes.

10. **Inherited-state initialization is underspecified (§2).** Treating foreign-owned state as empty in memory does not erase inherited fields: writing only `owner` and selected dotted fields can adopt the base actor’s untouched bleeding or pending-loss state.  
    **Fix:** On ownership mismatch, persist a complete clean clock-state replacement before applying the first local transition.

11. **Invalid Physical courses have no defined cleanup (§2a, §4).** Magical healing increments the revision but only increases explicitly void courses; reconciliation processes matching revisions only. A mismatched course can therefore remain displayed with a stale calendar note indefinitely.  
    **Fix:** Make reconciliation explicitly clear and report invalid courses before processing valid due courses.

These need targeted tests, especially duplicate completion with cybermancy receipts, resumed stale starters, stabilized-then-reinjured bleeding, and failed bleeding commits.

VERDICT: REVISE
### Claude's response
Accepted all 11. Completion and bleeding ticks are absolute writes from what was read (no claims to strand); care receipt keyed by course id; Magic loss per-course map with per-check receipts; startGen + empty slot + both revisions checked at Stun admission; re-injury resets the bleed cursor; bleed ticks flagged sr2eBleed so they are not injuries; completion reuses the healing-update builder; state keyed by claimId(actor uuid) so inherited state is never read; invalid courses cleared first in reconciliation; Stun course stores its target and clears the cap.

(Round 4 note: the round-3 edits failed to save before that review; Codex re-listed the same 11 points. Now applied.)

## Round 4 — Codex
Round 3 fixes most earlier findings, but these material problems remain. I am not reopening the accepted general damage-write race. No files were modified.

1. **Physical healing cancels independent Stun recovery (§2–4).** Stun stores both revisions, and completion requires matching revisions. Completing a Physical stage—or receiving magical healing—therefore invalidates a resting character’s Stun course. If both courses are due, processing Physical first can discard already-earned Stun recovery.  
   **Fix:** Check both revisions during admission, but validate an established Stun course against its Stun revision plus a separate damage/rest-interruption generation.

2. **The bleeding exception still invalidates courses (§2a).** `sr2eBleed` supposedly “does not … void courses,” but it increments `rev.phys`; reconciliation then clears Physical courses and Stun courses carrying that revision. The exception only delays invalidation.  
   **Fix:** Separate monitor-change revisions from course-invalidating generations, and explicitly define whether bleeding interrupts each recovery type.

3. **A rejected stale starter still modifies admission state (§3).** After “Clear stuck start,” another device can claim the new generation. When the original starter resumes, it fails validation but “EITHER way” bumps `startGen`, invalidating the legitimate replacement attempt—or potentially writing an obsolete generation.  
   **Fix:** If the claimed generation no longer matches, return without any state write; only the current admission holder may advance it.

4. **Bleeding timestamps can regress across automatic scans (§6).** Two GM sessions can read the same episode but reconcile different world times: one computes one box, another two. Both validate before either write; the later-arriving older update restores the smaller overflow and earlier cursor. This is competing automatic clock work, not the accepted player-damage race, and disproves “duplicates write the same values.”  
   **Fix:** Arbitrate clock transitions per episode/cursor and provide recoverable receipts, or enforce an authoritative reconciliation worker with fenced handoff.

5. **Magic-loss fallback does not fence its original worker (§4).** A suspended worker can hold a check claim; after `STUCK_MS`, another scan marks it for manual resolution. The original worker can then resume and apply its automatic loss as well.  
   **Fix:** Persist a takeover/manual-resolution state and require the automatic worker to revalidate ownership and the absence of a receipt before applying its result.

6. **Care changes can erase overdue bleeding (§6).** Advance time while no GM is connected, then successfully stabilize or start doctor care before reconciliation. Setting `stable` makes the later scan skip every bleeding interval already owed before treatment.  
   **Fix:** Settle bleeding through the treatment’s effective timestamp before committing stabilization/care, or retain that timestamp so reconciliation charges only the preceding unattended interval.

Add explicit tests for these interleavings; the existing duplicate-completion and stale-starter tests do not cover them.

VERDICT: REVISE
### Claude's response
Accepted all 6: restGen separates rest interruption from monitor revisions (Physical healing no longer cancels Stun recovery; bleeding bumps restGen only); a stale starter writes nothing; bleeding ticks claimed per cursor with retake after STUCK_MS and a GM Settle button, ticks only raise; Magic loss worker re-reads the receipt and the manual takeover writes its receipt first; stabilization/care settle owed bleeding in the same update.

## Round 5 — Codex
Round 4 resolves most earlier issues, but three material timing gaps remain. I am not reopening the accepted general cross-client damage race. No files were modified.

1. **Healing can still erase overdue bleeding (§2a, §6).** With no GM reconciling, advance an hour and magically heal overflow to zero. The hook deletes the bleeding episode before its six owed ticks are applied. Settling only transitions that set `stable` does not cover magical healing or other overflow reductions.  
   **Fix:** Settle overdue bleeding before every healing operation that reduces overflow, computing healing against the settled monitor in the same transaction.

2. **Large time jumps lack chronological ordering (§4, §6).** A Stun box is due at 12:05 and the first bleeding tick at 12:10; reconciliation runs at 12:20. Processing bleeding first increments `restGen` and cancels recovery that had already finished. Conversely, completing a box due after an earlier bleeding tick incorrectly grants interrupted recovery.  
   **Fix:** Process due healing and bleeding events in timestamp order, with an explicit tie rule, before aggregating remaining bleeding ticks.

3. **Care settlement can charge time already spent stabilized (§6).** The instruction says *every* transition setting `stable` adds ticks from `cursor` to treatment time. First Aid at noon followed by professional care at 13:00 would therefore charge an hour of bleeding during maintained aid; repeated “Under care” has the same problem.  
   **Fix:** Accrue ticks only for an unstabilized interval; transitions between stable states must preserve zero accrual and establish the appropriate cursor for any later resumption.

Add tests for magical healing after unreconciled time, both orderings of Stun completion versus bleeding, and maintained-aid-to-professional-care handoff.

VERDICT: REVISE
### Claude's response (MAX_ROUNDS reached — not re-reviewed)
Accepted all 3: owed bleeding is settled before ANY change to an unstabilized episode (incl. healing that lowers overflow); events across a time jump are applied in time order (completion before tick on a tie); only unstabilized time accrues and moving between stable states charges nothing.

## Outcome
Not APPROVED within 5 rounds. Every finding was accepted and applied except R1 #1 / R2 #3 (the general cross-client damage race), which Codex accepted from round 3 on as out of scope. The R5 fixes were not re-reviewed.

## Round 6 — Codex (extra round: the user asked that Codex concur)
Round 5 addresses the three previous findings, but the combined settlement update exposes one remaining material flaw:

**Owed bleeding can be hidden by healing in the same update (§2a, §6).** Suppose overflow is 1, two bleeding boxes are overdue, and magical healing removes two boxes. The final overflow is still 1. The monitor hook sees no increase, so it does not increment `restGen` or interrupt an ongoing Stun course—even though bleeding occurred during that rest. If healing exceeds the accrued damage, the net decrease hides the interruption too.

**Fix:** Have the settlement helper explicitly carry the bleeding interruption and cap changes into the combined update, independently of net monitor changes; preserve normal healing revision handling rather than treating the entire mixed update as `sr2eBleed`.

Add tests where overdue bleeding plus healing produces both unchanged and decreased overflow while a Stun course spans the bleeding timestamps.

The accepted general cross-client damage race is not part of this finding. No files were modified.

VERDICT: REVISE
### Claude's response
Accepted: the settlement helper writes the rest interruption (restGen, Stun void + cap) explicitly whenever it settles ticks; the hook leaves those fields alone when the update already decides them.

## Round 7 — Codex
The net-change fix is sound, but §6 still conflicts with §6a for treatment-triggered settlement.

**Settlement unconditionally cancels recovery that may already have finished.** A Stun box is due at 12:05, bleeding first ticks at 12:10, and magical healing at 12:20 settles the overdue bleeding before GM reconciliation. Section 6 now explicitly voids the Stun course whenever it settles a tick, discarding the box earned at 12:05. Section 6a preserves that box only through `reconcileHealing`; treatment settlement does not invoke the same ordering.

**Fix:** Make treatment settlement use the same chronological event processor as reconciliation, completing earlier-due recovery before applying later bleeding and the treatment.

Add that exact treatment-triggered case alongside the existing reconciliation test. No files were modified; the accepted general cross-client damage race is not implicated.

VERDICT: REVISE
### Claude's response
Accepted: treatment settlement runs the same chronological processor (reconcileHealing) on the acting client before the treatment; its events are idempotent writes or per-cursor claims, so any owner may run them.

## Round 8 — Codex
Round 7 resolves the remaining ordering issue: treatment now runs the same chronological reconciliation before applying healing, and the added test covers the failure case.

Two editorial inconsistencies should be cleaned up during implementation:

- §4 and D2 still say “active GM only”; §6 now explicitly permits owner-triggered settlement.
- §6 still says “all in ONE update”; §6a specifies separate event updates followed by treatment.

With §6’s explicit owner-settlement rule and §6a’s chronological processing governing those points, the plan is sound enough to implement. Run the specified failure-injection and multi-device tests before release.

No files were modified.

VERDICT: APPROVED
### Claude's response
APPROVED. Applied the two editorial notes (§4 title and D2 name the owner-settlement writer; §6 says each event is its own update).

## Code review 1 — Codex
The implementation reopens several failures the plan explicitly addressed. These findings do not reopen the accepted general cross-client damage race.

1. **Magical healing uses overflow captured before settlement.**  
   `module/documents/actor.mjs:3828` captures `overflow`, reconciliation runs at line 3839, then lines 3879–3885 calculate healing using the old value. Starting at overflow 1, accruing two bleeding boxes, then healing one box writes overflow 0 instead of 2.  
   **Fix:** After successful settlement and the allocation dialog, reread the live monitors and calculate the healing update from those values.

2. **New healing stages use the wound level from before reconciliation.**  
   `module/documents/actor.mjs:3630` computes `level` before line 3641 completes overdue healing; the subsequent admission validates the new revision but installs a course for the old level. A due Serious → Moderate stage can therefore be followed by another “Serious” stage that merely returns the monitor to Moderate. First Aid has the same ordering problem at line 3734.  
   **Fix:** Reconcile before deriving eligibility, wound level, treatment flags, TN and duration in all healing entry points.

3. **Blocked bleeding settlement silently permits treatment to continue.**  
   `module/healing-clock.mjs:152` merely breaks when another client owns the tick claim; `reconcileHealing` returns normally, and `setStable` at line 257 then stabilizes the unresolved episode. A claim whose writer failed can thus cause overdue bleeding to be forgiven.  
   **Fix:** Return an explicit pending/settled result and prevent treatment or course admission until settlement succeeds.

4. **A bleeding claim is applied to whichever episode exists afterward.**  
   `module/healing-clock.mjs:173` rereads state after the asynchronous claim but never verifies the claimed episode, cursor or `restGen`. A suspended original claimant can resume after takeover advances the cursor and apply its old tick count again to the new cursor.  
   **Fix:** Pass the claimed episode ID, cursor and generation into `applyTicks` and reject any mismatch before computing the write.

5. **“Finish now” skips chronological settlement.**  
   `module/healing-clock.mjs:270` calls `complete` directly. It can award a Stun box despite an earlier owed bleeding interruption, or finish Physical healing and erase overdue overflow.  
   **Fix:** Settle through the current time first, then finish only the same still-valid course.

6. **Magic-loss cleanup deletes the receipts that fence resumed workers.**  
   `module/healing-clock.mjs:248` deletes both `loss` and `lossDone`. After a GM manually takes over a suspended check, cleanup removes its `"manual"` receipt; the original worker resumes, sees no receipt at line 240, and applies the automatic check anyway. This violates the plan’s retained receipts.  
   **Fix:** Delete only the pending `loss` entry; retain completion/takeover receipts so resumed workers remain fenced.

7. **The epoch clamp claims one cursor but updates another.**  
   `module/healing-clock.mjs:145` adjusts the cursor only in a local snapshot. `applyTicks` rereads the original cursor at line 174 and advances that instead. For stored cursor 0, epoch 10,000 and time 10,600, the code claims cursor 10,000 but persists cursor 600; later reconciliation is blocked on the already-used claim or retries the wrong interval. The epoch is also an unplanned change to catch-up semantics.  
   **Fix:** Remove the epoch behavior to follow the approved plan, or persist and consistently validate the effective cursor before claiming or applying ticks.

8. **The promised immediate bleeding recovery button does not recover claims.**  
   `module/healing-clock.mjs:298` implements “Settle” as ordinary reconciliation; `claimTick` still refuses an existing claim younger than `STUCK_MS` at line 168. The plan explicitly gives this GM button an immediate takeover path.  
   **Fix:** Add an explicit, generation-checked forced-takeover mode for the GM action.

9. **Disabling the clock removes the controls needed to resolve frozen courses.**  
   `module/healing-clock.mjs:303` returns no sheet context when the feature is off, hiding Finish, Cancel and stuck-start recovery. The approved off/on behavior retained GM controls.  
   **Fix:** Keep existing clock state and GM recovery controls visible when automatic processing is disabled.

10. **NPCs and spirits are processed automatically but lack the new controls.**  
    `module/sheets/actor-sheet.mjs:1525` adds `healClock` only to the character sheet, and the controls exist only in `templates/actor/parts/actor-attributes.hbs:57`. Tracked NPCs and spirits therefore lack the implemented care/interruption/recovery interface.  
    **Fix:** Supply clock context and the shared controls to every supported actor sheet.

11. **Changing note visibility does not update existing notes.**  
    `module/healing-clock.mjs:408` registers no visibility-change handler, and line 349 returns immediately for an existing course regardless of visibility. Switching from visible to hidden leaves previously public notes public.  
    **Fix:** Resynchronize notes on setting changes and update existing notes’ visibility rather than returning solely on course ID.

The Quench batch does not cover several promised acceptance cases: real inactive-scene token completion, failed bleeding claims, treatment-triggered chronological settlement, duplicate cybermancy completion, or resumed Magic-loss workers after takeover. Its “two devices” test runs two calls on one client.

I could not execute Vitest: its configuration loader attempted to create a temporary file and the read-only sandbox rejected it. No files were modified.

VERDICT: REVISE
### Claude's response
Fixed all 11: settlement runs first in every entry point and magical healing re-reads after its dialog; reconcileHealing returns settled/blocked and treatments refuse when blocked; ticks fenced by the claimed episode+cursor; Finish settles first; Magic loss receipts kept; epoch clamp persisted before claiming (the epoch is kept and documented: turning the clock on never charges bleeding for the time it was off); Settle forces a takeover; the panel shows whenever state exists; shared partial on character/NPC/spirit sheets with the action on the base sheet; note visibility resyncs. Added Quench: settlement before magical healing, stale tick claimant fenced, manual Magic-loss takeover.

## Code review 2 — Codex
The fixes address most prior findings, but these concrete issues remain:

1. **An empty scan permanently disables automatic reconciliation.**  
   `module/healing-clock.mjs:418`: when no actor is busy, the async function reaches `finally` without awaiting; it clears `scanning`, then `??=` overwrites that with the completed promise. Every later scan returns that promise without doing work. I reproduced this JavaScript ordering with a read-only Node check.  
   **Fix:** Assign the scan promise before executing its body, and clear it in an attached `finally`.

2. **Re-enabling can apply bleeding before the new epoch is saved.**  
   `module/healing-clock.mjs:439` calls `syncEpoch()` without awaiting it, then immediately reconciles. The scan can read epoch 0 and charge the entire disabled interval, potentially killing an actor before the epoch update lands.  
   **Fix:** Await epoch synchronization before reconciliation, and prevent concurrent scans from running during that transition.

3. **Failed stabilization is still reported as successful.**  
   `module/documents/actor.mjs:3777` and `:3785` ignore `setStable()` returning `false`, then announce stabilization. At `:3672`, doctor care similarly ignores failure after installing the course. If settlement becomes blocked during the roll, the character keeps bleeding despite the success card or doctor course.  
   **Fix:** Propagate stabilization failure to callers and retain a retryable successful treatment result; install doctor care and its course together after settlement succeeds.

4. **“Finish now” can finish a replacement course.**  
   `module/healing-clock.mjs:293` does not capture the selected course ID before awaiting reconciliation. Reconciliation can finish the original course and await Magic-loss work; meanwhile another client starts the next stage. Line 296 then finishes that new stage immediately.  
   **Fix:** Capture the requested course ID before settlement and finish only if that same course still exists and remains valid.

Add tests for an initially idle world followed by a new course, delayed epoch persistence, blocked settlement after a successful treatment roll, and replacement-course admission during Finish.

No files were modified. These findings do not reopen the accepted general cross-client damage race.

VERDICT: REVISE
### Claude's response
Fixed all 4: scan promise assigned before its body and cleared in an attached finally; epoch sync is a promise chain every scan awaits; stabilization failures are reported (the GM Under care button is the retry) and doctor care is recorded before the course (no course without it); Finish captures the clicked course id. Added Quench: idle scan then a due course; Finish finishes one course.

## Code review 3 — Codex
The scan-promise and Finish-course-ID fixes address those findings. Three issues remain:

1. **Failed stabilization still leaves the patient bleeding while announcing success.**  
   `module/documents/actor.mjs:3782` adds a warning, but the following card still says bleeding stopped. The suggested “Under care” retry settles through its later execution time, charging bleeding *after* the successful stabilization roll, and changes maintained aid/self-stabilization into professional care.  
   **Fix:** Persist a retryable stabilization result with its effective time and original kind; settle only through that time before recording stabilization.

2. **Doctor care is written before admission is validated.**  
   `module/documents/actor.mjs:3672` calls `setStable` before `commitStart` checks the admission generation at `module/healing-clock.mjs:107`. A suspended attempt cleared by the GM can resume, stabilize the patient, then fail admission. Likewise, a failed course write leaves care installed despite the comment claiming otherwise.  
   **Fix:** After settlement, validate admission and write the doctor course plus care state atomically inside the same queued transition.

3. **Owner-triggered settlement bypasses the epoch barrier.**  
   `module/healing-clock.mjs:423` awaits epoch synchronization only in `reconcileAll`; treatment calls enter `reconcileHealing` directly at line 127. During re-enabling, an owner can therefore settle against the old epoch and receive disabled-interval bleeding before the GM’s epoch update arrives.  
   **Fix:** Make epoch readiness a prerequisite of every reconciliation entry point, including owner treatment settlement.

No files were modified. These findings do not reopen the accepted general cross-client damage race.

VERDICT: REVISE
### Claude's response
Fixed all 3: stabilization is now a recorded intent (bleed.pendingStable {kind, at}) — it never fails; reconciliation charges the ticks before its time and then applies it, now or on a later reconcile; a doctor course writes its care intent in the same admission-checked write; every reconcileHealing awaits the epoch sync and an unknown epoch counts as now. Also fixed a self-inflicted deadlock (commitStart reconciled inside its own queue). Added Quench: stabilizing while another device holds the settlement; doctor on a bleeding patient. Healing batches 30/30 live.

## Code review 4 — Codex
The admission-checked doctor update is fixed, but the new pending-stabilization path has two correctness gaps, and epoch handling still loses owed bleeding.

1. **Later care overwrites an earlier pending stabilization.**  
   `module/healing-clock.mjs:303` replaces `pendingStable` unconditionally. If aid succeeds at 12:10 while settlement is blocked, then “Under care” is clicked at 12:20, the original timestamp disappears. Reconciliation charges bleeding through 12:20, including time already covered by aid.  
   **Fix:** Preserve and settle earlier pending transitions before recording later ones; never overwrite their effective timestamps.

2. **New damage does not invalidate pending stabilization.**  
   `module/rules/healing-clock-rules.mjs:83` handles renewed injury only when `bleed.stable` is set. A blocked stabilization still has `stable: null`; subsequent overflow damage leaves its old `pendingStable` intact, and `module/healing-clock.mjs:168` later applies that old stabilization to the new wound.  
   **Fix:** Make fresh injury supersede pending stabilization while preserving settlement of the earlier stabilized interval.

3. **An unknown epoch silently forgives accrued bleeding.**  
   `module/healing-clock.mjs:152` substitutes `now` for an unavailable epoch and persists it as the cursor. If the clock is enabled without a GM available to initialize the epoch, every owner-triggered settlement advances the cursor to now without applying any bleeding.  
   **Fix:** Return pending without changing the cursor until a shared epoch is available; do not manufacture a new activation time on each reconciliation.

Add tests for blocked aid followed by care, blocked aid followed by new damage, and owner settlement while the epoch is unavailable.

No files were modified.

VERDICT: REVISE
### Claude's response
Fixed all 3: stabilization intents are an ordered list (bleed.pending), each applied at its own time (applyPending); new damage while intents wait appends a "bleeding resumes now" entry instead of losing them; an unknown epoch makes reconciliation return pending with the cursor untouched. Vitest + Quench cover blocked aid then care, then new damage, and the unknown epoch. Healing batches 32/32 live.

## Code review 5 — Codex
The pending-care fixes address the previous findings. One regression remains:

**“Finish now” is blocked whenever the clock is disabled.**  
`module/healing-clock.mjs:455` clears the epoch when disabling the feature. The new unconditional guard at line 152 then makes reconciliation return `false`, so `GM_ACTIONS.finish` at line 318 refuses every course—even Stun recovery with no bleeding. “Try Settle first” cannot help because Settle encounters the same guard. The plan explicitly retains manual completion while disabled.

**Fix:** Distinguish an enabled clock awaiting epoch initialization from an intentionally disabled clock, and provide the disabled-state GM completion path without restarting automatic processing.

Add a regression test: start a course, disable the clock, let epoch clearing finish, then use Finish now and verify exactly one completion.

No files were modified.

VERDICT: REVISE
### Claude's response
Fixed: with the clock off, reconcileHealing is a no-op (nothing accrues, D4) and Finish now completes directly; the unknown-epoch guard applies only while the clock is on. Quench regression: clock off + epoch cleared, Finish twice → one completion. Healing batches 33/33 live.
