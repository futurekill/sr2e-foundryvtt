# Plan Review Log: permanent damage from Deadly wounds
Started 2026-10-28. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. These are concrete failures in the proposed design; rules observations below use the text quoted in the plan.

1. **Duplicate episodes across clients** — Two clients can both read Physical below Deadly, generate different check IDs, and successfully resolve both; `once()` deduplicates each ID independently, and `enqueueAttack` is client-local. **Fix:** Serialize episode admission through an authoritative writer and give each transition one durable identity.

2. **Resolution cannot be “ONE update”** — `recordEvent` creates an embedded ActiveEffect; marking `deadlyCheck` resolved requires a separate actor update, leaving a crash window and potentially overwriting a newer episode. **Fix:** Make the durable outcome authoritative for resolution and derive pending status from it.

3. **Claim-before-roll can permanently strand a check** — Disconnecting or throwing after `once()` leaves no outcome and blocks subsequent clicks; the plan specifies no recovery. **Fix:** Roll without side effects and atomically publish the winning outcome with `recordEvent`, or specify a fenced recovery protocol.

4. **Healing multiplier disappears too early** — Approach 1 clears the resolved check below Deadly, while Approach 3 stores its multiplier there until Physical reaches zero; Serious, Moderate, and Light stages therefore lose the penalty. **Fix:** Separate episode admission state from healing penalties retained through full recovery.

5. **Unresolved checks suppress subsequent wounds** — Drop below Deadly without resolving, then cross again: “no unresolved check” prevents recording the second episode. **Fix:** Retain pending checks per episode and admit later episodes independently.

6. **Delayed resolution bypasses healing penalties** — `healPhysical` can start or immediately complete healing before the check resolves; clock courses retain their original `dueAt`, and `commitStart` fences monitor revisions, not complication changes. **Fix:** Require resolution before admitting natural healing and fence course creation against the complication revision.

7. **Limb timing modifies the wrong quantity** — The quoted rule increases *base* healing time by 50%; multiplying `naturalHealingHours()` also increases its already-applied minimum—for example, Deadly at 20 successes becomes 108 hours instead of 72. **Fix:** Apply the limb multiplier to `baseH` before division and the minimum clamp; handle organ doubling separately.

8. **Healing ignores permanent attribute losses** — `SR2EActor._naturalAttrs()` reads `base + racial`, bypassing `_naturalAttribute`; Body loss will not reduce healing dice, and Body/Willpower loss will not affect doctoring modifiers. **Fix:** Expose and reuse one authoritative natural-attribute calculation across medical callers.

9. **Advancement prices the wrong rating** — `advanceKarma` calculates the new rating from unreduced `base + racial`; lowering only its maximum makes a character with authored Body 6 and one loss pay for 7 while advancing effective Body 5→6. **Fix:** Calculate displayed rating, cost, and maximum comparison from the effective natural rating while translating the increase back to authored base.

10. **Synthetic actors inherit another actor’s check** — A bare `flags.sr2e.deadlyCheck` lacks the owning-UUID isolation explicitly used by the healing clock; unlinked tokens can inherit pending/resolved state from their base actor. **Fix:** Key episode state by owning actor UUID and define ownership filtering for inherited outcome records.

11. **Undo leaves contradictory healing state** — Voiding the loss record restores attributes, but the separately stored multiplier and existing course duration remain unchanged. **Fix:** Derive penalties from nonvoided records and specify how voiding reconciles active courses.

12. **Continuous medical care is not enforced** — After the Deadly stage, `healPhysical` permits unattended healing despite the quoted zero-success requirement for continuous Biotech treatment. **Fix:** Persist the care requirement through recovery and enforce it when starting and continuing natural-healing courses.

13. **Card-only access is not recoverable** — A disconnect after the monitor update but before card creation leaves a pending check with no specified way to resolve it; Phase 4 explicitly provides a durable sheet control panel. **Fix:** List pending checks and voidable outcomes on the actor sheet, with cards as notifications.

VERDICT: REVISE
### Claude's response
Accepted all 13 (see Round 1 plan): derived episodes keyed by owner uuid; the durable record is the only resolution; roll first, publish atomically; effects derived per wound episode; limb on base time, organ on the total; Heal refused while pending and without a doctor after an organ result; void re-derives and cancels a running course; one natural-attribute source; advanceKarma priced from the effective rating; sheet panel.

## Round 2 — Codex
Several blockers remain in the revised plan:

1. **§1: Idempotent counters do not serialize transitions.** A delayed client can submit a crossing computed before another client crossed and healed; its stale `deadlyGen` reuses an already-resolved episode and its `crossed` array can overwrite newer entries. **Fix:** Serialize monitor transitions and episode admission through one authority, with stale-write fencing.

2. **§1: Pending episodes have no wound identity.** `crossed: [g…]` does not record `woundGen`; after magical healing to zero, an unresolved old check cannot be distinguished from a current-wound check, and late resolution can attach penalties to the wrong wound. **Fix:** Persist `{ episodeId, woundGen }` at crossing and copy that immutable association into the outcome.

3. **§3: Void creates an unresolvable pending check.** Pending means “no non-void record,” but the voided outcome’s deterministic ActiveEffect still exists, so `recordEvent` rejects every reroll while natural healing remains blocked. **Fix:** Make void terminal for admission, or introduce an explicit replacement-attempt generation with distinct outcome keys.

4. **§3: Healing admission still has a race.** A void can occur after Heal checks pending status but before `commitStart`; cancellation finds no course, then the old course commits because the existing fence checks only monitor revision. **Fix:** Persist an outcome revision on courses and validate it at admission, commit, and completion.

5. **§3: “Continuous” care is checked only at startup.** A doctor can start an organ-damage course and then end care; existing `careEnds` changes bleeding stabilization but does not invalidate the natural-healing course. **Fix:** Persist caregiver availability and interrupt organ-damage courses when care ends, checking it again at completion.

6. **§4: Adding one authored point does not necessarily raise the effective rating.** With base 1 and two losses, effective Body remains 1 after base becomes 2; at the racial clamp, increases likewise buy no improvement despite charging and announcing one. **Fix:** Calculate the resulting effective rating before charging and define advancement explicitly at both the floor and cap.

7. **§3–4: Loss/clamp ordering remains ambiguous enough to double-apply loss.** Lowering the maximum passed to `naturalAttribute` *and* subtracting loss afterward makes base 6/max 6/one loss produce 4 instead of 5. **Fix:** Specify one formula and tests: subtract losses once, with the effective ceiling reduced once.

8. **§1/§3: UUID-scoped flags do not isolate inherited event records.** `eventsOf(actor)` returns all durable effects, including inherited records; the plan does not require `foldPermLoss` to filter their owning UUID. **Fix:** Filter both outcomes and void targets by exact owning-actor identity before folding.

9. **§5: Older permanent losses become inaccessible to Undo.** The panel lists only current-wound outcomes, although attribute losses survive recovery; deleting the old chat card removes the remaining control. **Fix:** Provide a permanent outcome history with GM void controls across all wound generations.

VERDICT: REVISE
### Claude's response
Accepted #2-#9. #1 rejected as a blocker: it is the general cross-client damage race accepted for the healing clock; writers reading the same state write the same values.

## Round 3 — Codex
The general monitor-write race is not a blocker in this review. Four feature-specific gaps remain:

1. **§3: Care ending during admission is still lost.** Start an organ-damage healing roll after overflow has cleared; GM clicks **Care ends** before the course exists; cancellation finds nothing, then `commitStart` installs a course flagged `care`. Its completion passes the proposed “no bleeding episode” check. **Fix:** Persist a wound-scoped care generation/status independently of courses and fence admission, commit, and completion against it.

2. **§3–4: The explicit formula drops Exceptional Attribute.** Existing `_naturalAttribute` passes `mods.edgeMax[attr]` to `naturalAttribute`; the proposed ceiling omits it, so base 7/max 6/Exceptional +1/one loss becomes 5 instead of 6. **Fix:** Include the maximum bonus in both the natural-rating ceiling and advancement threshold, with a regression test.

3. **§2: Karma finalization disappeared from the plan.** The original plan closed the test when its outcome landed; round 2 publishes dice cards without specifying closure. Standard `rollSuccessTest` cards allow Karma actions, so a player can spend Karma and change displayed successes after permanent loss is already recorded. **Fix:** Specify a finalization boundary and reject Karma actions on finalized or losing attempts, including already-open cards.

4. **§2: “Working dermal armor” does not account for partial skin loss.** The existing attribute pipeline applies `skinBody(raw, item.system.skinLoss)` to dermal plating/sheathing; reading a working implant’s printed Body bonus restores dice that cyberdamage removed. **Fix:** Reuse the effective dermal Body contribution, including `skinLoss`, rather than summing raw implant modifiers.

VERDICT: REVISE
### Claude's response
Accepted all 4: careGen fences admission, commit and completion; the formula includes Exceptional Attribute; the test is closed to after-the-fact Karma; dermal Body uses the pipeline effective value (skinLoss).

## Round 4 — Codex
One blocker remains:

- **§2: Pre-roll Karma breaks the side-effect-free resolution protocol.** `rollSuccessTest` deducts Karma before returning (`module/documents/actor.mjs:609`), even with `closed: true`. Two clients can roll the same attempt and both spend Karma, although only one outcome survives `recordEvent`; a disconnect before publication also leaves a charge without an outcome. **Fix:** Either disable Karma spending for this flow or specify a recoverable, receipted transaction that charges only the winning attempt.

Minor inconsistency: §4 still states the advancement threshold as “racial maximum − losses,” omitting Exceptional Attribute despite §3’s correction. **Fix:** Reference the same effective-ceiling helper in both sections.

VERDICT: REVISE
### Claude's response
Accepted: no Karma on this test at all (no pre-roll dice, card closed); §4 uses the §3 ceiling helper.

## Round 4 — Codex
Round 4 resolves the remaining blocker: losing or interrupted rolls spend no Karma, and advancement now uses the same effective ceiling as attribute derivation. No further blocking findings within the agreed scope.

VERDICT: APPROVED
APPROVED.

## Code review 1 — Codex
1. **[module/permanent-damage.mjs:117](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/permanent-damage.mjs:117): Interrupted care blocks restarting healing.** `careEnds` only increments the counter; `admitStart` still considers the existing course valid until its original due date because `courseValid` ignores that counter. **Fix:** Invalidate and clear interrupted courses during reconciliation/admission, retaining the completion fence.

2. **[module/sheets/sheet-actions.mjs:3747](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3747): The new Care ends button leaves bleeding stabilized.** It calls only `permCareEnds`, unlike the clock button, which also calls `setStable(actor, null)`; a patient in overflow remains under recorded medical care after the caregiver leaves. **Fix:** Route both buttons through the same care-ending transition.

3. **[module/permanent-damage.mjs:110](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/permanent-damage.mjs:110): Duplicate or historical Void cancels unrelated healing.** The return from `recordEvent` is ignored, and cancellation targets whichever natural course currently exists—even after another client already voided, rerolled, and started a replacement course. **Fix:** Cancel only the specific course invalidated by a successfully created void, checking its ID and penalty key inside the queue.

4. **[module/documents/actor.mjs:3687](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3687): Clock-disabled healing bypasses the new fences.** If an outcome is voided or care ends while the healing roll awaits completion, `_healOneLevel` still reduces damage using the stale admission. **Fix:** Recheck pending status, penalty key, and required care generation immediately before the instant healing update.

5. **[module/sheets/sheet-actions.mjs:4250](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:4250): Advancement charges for no improvement when there is no loss.** Base 6/cap 6/loss 0 produces effective 6→6, charges 12 Karma, and sets `stuck: false`; the comment incorrectly claims only losses can prevent improvement. **Fix:** Reject every purchase whose computed effective rating does not increase, as specified by the plan.

6. **[module/healing-clock.mjs:49](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:49): Bleeding lethality ignores permanent Body loss.** This medical caller still reads authored `base + racial`; Body 5 reduced to 4 consequently retains the old overflow survival threshold. **Fix:** Read the authoritative natural Body value, retaining the existing cybermantic override.

The new Quench batch forces the clock off throughout (`module/quench/sr2e-quench.mjs:12925`), so it does not exercise course admission, cancellation, or completion fences. Findings above are from code inspection; the advancement example was also checked with Node. No files were modified.

VERDICT: REVISE
### Claude's response
Fixed all 6. #5 at its root: core p.192 (Good Karma) lets a GM-approved raise exceed the racial maximum at double cost, but _naturalAttribute clamped every character at the maximum, so that purchase bought nothing; the clamp now applies only during creation (p.44), and any raise that would not change the rating is refused. Reconciliation clears courses whose penalty key or care generation changed (with a card); one Care-ends transition; Void cancels only via the penalty fence and only if its record landed; the instant path re-checks penalties; bleeding lethality reads the natural Body. Quench adds clock-on fences and the above-maximum raise. 46/46 live.
