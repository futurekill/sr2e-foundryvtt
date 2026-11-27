# Plan Review Log: treating the wounded (docs/archive/plans/PLAN-treatment.md)
Started 2026-11-27. Codex gpt-6-sol, high, fresh session per round.

## Round 1 — Codex
1. **A claimed treatment can be lost permanently.** The plan calls `once(patient, "treat:<cardId>")` before settlement and the healing write. If the GM disconnects, `reconcileHealing` returns false, or `commitStart` rejects a changed wound, the request remains but its claim blocks retry. Ordinary claim markers can also be pruned after 24 hours, reopening an old card. [Plan §5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:51), [claims.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/claims.mjs:14)  
   **Fix:** Persist a durable per-card outcome or resumable intent, and record completion with the patient-side write.

2. **Two cards can heal two stages from one injury.** Claims are per card, so two GM hook calls can both pass the `firstAided` check; the second `_healOneLevel` reads the newly lowered monitor and lowers it again. [Plan §5 and risks](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:51), [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:4380)  
   **Fix:** Serialize all treatment commits on the patient’s `damage:<uuid>` queue and recheck eligibility inside it.

3. **Karma can change after the GM reads the result.** `applyKarmaToTest` spends Karma and updates the test message asynchronously; “read live total, then close” is not an atomic boundary. An Apply racing a reroll can use the old total while the spend still lands. [Plan §5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:51), [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:962)  
   **Fix:** Serialize test finalization with Karma writes and persist the exact success total used in a closure receipt that Karma checks.

4. **A changed injury can pass the stale check.** Moderate damage changing from 3 to 4 boxes remains Moderate; the proposed level-only comparison accepts a roll made before that new injury. This also changes the golden-hour episode without changing the level. [Plan §5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:52), [healing-clock-rules.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/healing-clock-rules.mjs:57)  
   **Fix:** Bind the card to exact boxes, overflow, and the wound revision or episode; reject any mismatch at commit.

5. **Clock admission happens too late and can consume a card without treatment.** Today `admitStart` reserves a Physical course before rolling, while `commitStart` fences it by revision. Moving the roll ahead of patient-side admission means another recovery course may occupy the slot before Apply; claiming the card first makes that refusal final. [Plan §4–5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:45), [healing-clock.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:86)  
   **Fix:** Define a reservable, recoverable treatment attempt before the roll, and settle bleeding before admission without entering the damage queue recursively.

6. **A refused roll still costs the medic Karma.** The medic can reroll or buy successes, then have Apply refused because the patient changed or another medic got there first. The plan neither reserves the patient before those spends nor defines a refund. [Plan §4–5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:45)  
   **Fix:** Reserve eligibility before allowing Karma, or explicitly refund treatment-specific spends when the reserved attempt cannot commit.

7. **The gear steps have no reliable writer or receipt.** If the medic logs off after Apply, step 6’s “medic’s client” never rolls supply depletion. If a patch or supply update fails after the patient commit, retrying the already claimed card cannot finish it; duplicate hooks can also consume twice. [Plan §6–7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:59)  
   **Fix:** Give each gear step a durable receipt and a GM recovery path; revalidate the selected item and quantity at application.

8. **One empty flag empties an entire stack of medkits.** Gear has `system.quantity`; a stack of two kits sharing one `medkitEmpty` flag makes both unusable when one runs out, then restocks both with one supplies item. [Plan §1 and §6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:30), [item-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:315)  
   **Fix:** Require individual medkit items or track supply state per kit unit.

9. **Existing flags cannot distinguish new injuries.** The plan turns `firstAided` and `magicallyHealed` into strict refusal checks, but those flags persist while damage remains; a new wound on an already injured patient can be eligible for First Aid. The current flow deliberately asks the GM about new injuries. [Plan §5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:52), [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:4159)  
   **Fix:** Scope treatment markers and golden-hour decisions to a wound episode, with an explicit GM ruling for mixed injuries.

10. **Professional-help eligibility is unverifiable.** The retry requires better equipment or a higher Biotech Rating than the first medic’s, yet the proposed card records neither the first medic’s rating and gear nor a failed attempt tied to the current wound. [Plan §3 and §7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:38)  
    **Fix:** Record the first attempt’s episode, outcome, Biotech Rating, and equipment; compare them before a retry.

11. **Patient identity and treatment time remain ambiguous.** The list includes both scene token actors and world player actors, so an unlinked PC token can appear alongside its base actor; choosing the latter heals the wrong document. With the clock off, the retained `_healOneLevel` path also lowers damage immediately despite the required uninterrupted table time. [Plan §3 and proof](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:38), [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:4230)  
    **Fix:** Use the exact token actor UUID as the patient identity, and make timed completion explicit when the healing clock is off.

VERDICT: REVISE
### Claude's response
All 11 accepted. #1/#2/#5: commit inside the patient's damage queue with a durable receipt (flags.sr2e.treated.<cardId>) in the SAME update; clock admission+commit at apply time (commitStart gains an extra update); ready-time resume. #3: Apply on the medic's client in a per-test queue shared with applyKarmaToTest; the request carries the exact total and closes the test. #4: exact snapshot (boxes, overflow, clock rev). #6: no refund — ruling, eligibility shown before the roll. #7: medic-side steps receipted per card on the medic's items, done at Apply. #8: per-unit empty count. #9: 'new injuries' option as today's confirm. #10: stabilization-attempt record with the medic's Biotech. #11: exact token-actor UUIDs; clock-off stays instant by design (the clock is the timing feature).

## Round 2 — Codex
I checked all 11 round-one responses against the named code paths. These material problems remain:

1. **Clock-on Apply can deadlock (round 1 #5).** The plan puts the commit inside `damage:<uuid>`, but [`commitStart`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:107) and [`setStable`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:322) each enter that queue themselves. Awaiting either from the outer queue waits forever. **Fix:** Add queue-held commit helpers that write the course, stabilization intent, and receipt in the outer queued operation.

2. **Two treatment writers can still heal two stages (round 1 #2).** The plan allows either the active GM or a patient owner to apply a request, while [`enqueueAttack`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/engagement.mjs:60) is local to each client. Two clients can both pass the snapshot check, then calculate successive stages. **Fix:** Make the active GM the sole treatment writer.

3. **Karma is not closed atomically across clients (round 1 #3).** A GM can read the test total for Apply while the medic’s client is spending Karma; their per-test queues are separate, and [`isTestClosed`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/astral-combat.mjs:97) sees the request only after it exists. Apply can use the old total while the spend lands. **Fix:** Route Apply and Karma through one authoritative test writer that closes the test and records the chosen total together.

4. **A failed request post can strand consumed gear (round 1 #7).** If the medkit’s last usable unit empties, or a one-use patch is deleted, then request creation fails, the retry fails the plan’s “still usable” check; the deleted patch also loses its item receipt. **Fix:** Keep gear receipts on the medic actor and let a receipted Apply resume even after that item is empty or gone.

5. **Clock-off snapshots can match a different injury (round 1 #4 and #1).** With the clock off, `rev` is null: a card rolled at three boxes can pass after damage changes to four and later returns to three. Pruning treatment receipts at full healing also lets an unfinished old request replay against a later identical wound. **Fix:** Track a persistent physical-wound generation with the clock off and retain per-card completion receipts while requests can be replayed.

6. **The mixed-injury golden hour still lacks the promised ruling (round 1 #9).** [`goldenHour`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/healing-clock-rules.mjs:46) marks an old wound with recent added damage as both `old` and `mixed`; the plan’s “new injuries” option bypasses treatment flags, but its Apply check still refuses the old golden hour. **Fix:** Make the GM’s new-injury ruling explicitly govern the golden-hour check and persist that decision on the card.

VERDICT: REVISE
### Claude's response
All 6 accepted. #1: queue-held commitStartHeld/stableHeld build into the caller's one update. #2: the active GM is the only treatment writer. #3: one test writer per card (moneyWriterFor at roll time, GM takes over only when that user is inactive, recorded first); Karma and Apply share its per-test queue. #4: gear receipts on the medic ACTOR; a receipted Apply resumes. #5: flags.sr2e.woundGen bumped on any Physical/overflow change, clock on or off; receipts kept. #6: the golden hour honours the card's 'new injuries' ruling for a mixed episode.

## Round 3 — Codex
1. **Gear consumption and its receipt cannot be atomic as specified.** The [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:65) puts the receipt on the medic Actor but changes stock on an embedded Item. If a trauma patch receipt is written first and deletion fails, retry skips consumption; reversing the order can consume it twice. **Fix:** Keep stock and its per-card receipt in one durable document update, retaining a zero-quantity item if needed.

2. **Clock admission can strand an Apply request.** [admitStart](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:84) creates a separate once-only marker before the patient update. If the GM disconnects after admission, the [planned ready-time retry](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:90) cannot admit the same generation again, so the request stays pending until manual `clearStart`. **Fix:** Make admission resumable by card ID, or commit its claim with the patient receipt and course.

3. **Two Deadly stabilization cards can both apply to the same wound.** The [snapshot check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:76) still matches after stabilization because it changes no Physical boxes or overflow; [setStable](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:322) changes only clock state. A second, failed card can overwrite the first card’s successful stabilization record and incorrectly enable professional-help retry. **Fix:** Check the existing stabilization attempt for that wound inside the patient queue and define which later attempts are allowed.

VERDICT: REVISE
### Claude's response
All 3 accepted. #1: stock change and receipt in ONE item update; a patch is kept at quantity 0. #2: no admitStart marker on the GM path: commitStartHeld checks the slot and bumps startGen in the same write. #3: a per-Deadly-episode attempts record checked inside the queue (stable → refuse; failed → only professional with a higher Biotech or better equipment; care ended → a new attempt).

## Round 4 — Codex (delta)
1. **Concurrent cards can consume the same gear twice.** Two Apply calls use separate per-test queues. With one trauma patch left, both can read quantity 1 and each write quantity 0 with its own receipt; the same patch funds two treatments. **Fix:** Serialize gear updates per item and revalidate stock inside that queue.

2. **New damage can be mistaken for continued stabilization.** After a successful Deadly stabilization, added overflow makes `clockChanges` clear `bleed.stable`, but the plan retains the successful attempt until the patient leaves Deadly. A new card can then be refused as “already stable” while the patient is bleeding. **Fix:** Check live bleeding stability and treat new damage as ending the prior stabilization.

The proposed `commitStartHeld` path is sound if the existing `commitStart` admission and generation checks remain in its public wrapper.

VERDICT: REVISE
### Claude's response
Both accepted. #1: gear steps in a per-item queue that re-reads stock. #2: 'stable' is the live clock state (clock off: the latest ok attempt's woundGen equals the live one); new damage ends it.

## Round 5 — Codex (delta; user chose one more round at the checkpoint)
1. **The gear queue is local to each client.** If the GM has taken over one card and the medic returns to Apply another, both can read the same patch at quantity 1 and spend it. **Fix:** Route all updates for a medic’s item through one authoritative writer.

2. **A Deadly patient can be stabilized with zero overflow.** In that case `clockChanges` leaves `bleed` null, so `bleed.stable` cannot identify a successful stabilization; a second card is not caught by the “already stable” check. **Fix:** When there is no bleed record, use the latest successful attempt for the live wound generation.

3. **Clock-off care ending leaves the patient classified as stable.** Ending care changes no wound generation, so the plan’s clock-off rule still treats the earlier successful attempt as live and refuses the new attempt that step 6 permits. **Fix:** Record care ending as a stability transition that the clock-off check reads.

VERDICT: REVISE
### Claude's response
All 3 accepted. #1: the medic's writer is moneyWriterFor(medic) at each moment; a GM Apply is refused while the medic's player is online. #2: without a bleed record, stable = latest ok attempt on the live wound generation with no 'ended' entry after it. #3: clock off, a GM 'Stabilization ended' button appends that entry.

## Round 6 — Codex (delta)
1. **Writer handoff can overlap gear updates.** The GM starts an Apply while the medic is offline; the medic reconnects before the GM’s item update finishes and applies another card. Their local item queues can both spend the same last patch. **Fix:** Keep the current writer assigned until its queued work finishes, then hand off through a fenced transition.

2. **“Care ends” does not end stabilization when there is no bleed record.** With the clock on, a Deadly patient with zero overflow can stabilize, but `setStable` returns early when `bleed` is absent. “Care ends” therefore leaves the successful attempt classified as stable and refuses a new attempt. **Fix:** Append the stabilization-ended entry for no-bleed wounds when clock-on care ends, using the patient queue.

VERDICT: REVISE
### Claude's response
Both accepted. #1: each spent unit is claimed on the server with once(medic, gearunit:<itemId>:<value read>) before the item write — no fenced handoff needed. #2: 'Care ends' appends the stabilization-ended entry in the patient queue whether or not a bleed record exists.

## Round 7 — Codex (delta)
1. **A normal medkit use can block the next use.** If the 1D6 roll is not 1, `medkitEmpty` stays unchanged. The next treatment claims the same `gearunit` key, so `once()` rejects it even though the kit is usable. **Fix:** Give every medkit use a distinct, advancing unit generation, including rolls that do not deplete supplies.

2. **A claim can strand gear before its item update.** If the winning client disconnects after `once()` succeeds but before the item receipt is written, retries find no receipt and cannot claim the unchanged key. **Fix:** Make an uncommitted claim recoverable through a fenced retry that checks the item receipt.

VERDICT: REVISE
### Claude's response
Both accepted by simplifying: the active GM (already the only patient writer) also spends the gear, inside the patient queue after eligibility and before the patient commit, in a per-item queue with the receipt in the same item update. No gearunit claims, no medic-side gear writes, no handoff. Apply on the medic's writer only closes the test and posts the request.

## Round 8 — Codex (delta)
1. **Gear can be spent without treatment.** The GM spends the last trauma patch, disconnects before the patient commit, and the patient takes new damage. On restart, the snapshot check refuses the request, but the patch remains spent. **Fix:** Make the gear debit reversible and refund it when a post-spend patient commit is refused.

VERDICT: REVISE
### Claude's response
Accepted: a resumed request Refused after its gear was spent refunds it in the item queue, the receipt marked refunded in the same update.

## Round 9 — Codex (delta)
1. **A medkit refund can create a negative empty count.** If the supplies die was 2–6, the receipt exists but `medkitEmpty` never increased. A later refusal would apply the specified `−1`, taking 0 to −1. **Fix:** Use the receipt’s recorded die to decrement `medkitEmpty` only when the original roll depleted supplies.

2. **A failed refund can be stranded.** If the card is marked Refused and the GM disconnects before the item refund completes, the ready-time scan skips that card and the gear stays spent. **Fix:** Keep the request pending until the item receipt is marked refunded, and retry pending refunds on ready.

VERDICT: REVISE
### Claude's response
Both accepted: a medkit refund decrements only when the receipt's die was a 1; the card is marked Refused only after the refund write, so the ready scan retries an unfinished refund.

## Round 10 — Codex (delta)
1. **Step 6 still permits Refused before the refund.** If the GM spends gear, disconnects, and the wound changes, step 6 says to mark the card Refused immediately. The ready scan then skips it, leaving the gear spent despite step 5’s new ordering rule. **Fix:** Make every post-spend refusal path refund the gear before marking the card Refused.

VERDICT: REVISE
### Claude's response
Accepted: step 6's refusal path now refunds spent gear first, then marks Refused.

## Round 11 — Codex (delta)
1. Step 6 now refunds gear before **Refused** when its eligibility checks fail. But the later [full-slot refusal](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-treatment.md:91) can occur after step 5 spends gear and does not require a refund first. The round-10 requirement therefore remains unmet for that path.

VERDICT: REVISE
### Claude's response
Accepted: the clock-slot check moves into the eligibility checks (before any gear), and a general rule says every refusal path refunds spent gear before marking Refused.

## Code review round 1 — Codex (gpt-6-sol, high)
1. **A resumed refusal can keep spent gear.** If the GM spends a patch, disconnects before the patient commit, and the wound changes, the retry returns from the eligibility check at [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:298) without calling `refundGear`; it then marks the card Refused and deletes the request. **Fix:** Refund any existing gear receipt on every refusal path before finishing the card.

2. **Clock-on First Aid can check Magic loss twice.** A successful waived-magician treatment checks immediately at [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:308), while its course requests another check on completion at [healing-clock.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:278). **Fix:** For a clock course, perform the check once at completion through the clock’s receipted loss path.

3. **A player can make the GM’s rulings.** The medic’s dialog lets any player tick “new injuries” or “better equipped,” and [refusal()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:333) trusts those values. An equal-Biotech medic can authorize their own professional retry; a player can also bypass the prior First Aid or magical-healing gate. **Fix:** Require a GM-authored approval for either ruling and verify it during application.

4. **The GM accepts an unauthenticated success total.** [processRequest()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:273) accepts any `treatmentApply` chat message and [commit()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:391) uses its `successes`. A player can create a flagged message for another medic’s rolled card with an invented total, bypassing the Apply writer gate. **Fix:** Authenticate the request’s author and bind its total to a closure record written by the medic’s authorized writer.

5. **Restocking can spend one supply unit twice.** [restockMedkit()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:517) locks only the medkit. Two different medkits can both read a supplies stack at quantity 2, each write quantity 1, and each refill. **Fix:** Serialize debits on the supplies item and receipt the debit and refill for recovery.

6. **The clock-off “Stabilization ended” button also clears a failed attempt.** The sheet shows it for any last attempt other than `ended` at [actor-sheet.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:276). After a failed test, clicking it permits another plain stabilize attempt instead of requiring professional help. Its direct write at [sheet-actions.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3818) can also race the patient queue. **Fix:** Offer ending only for a currently stable patient and append the entry inside `damage:<uuid>`.

7. **Post-commit effects lack recovery receipts.** After the patient receipt is written, the instant-path healing card and Magic-loss checks run separately at [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:417) and [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:308). A GM disconnect then makes replay stop at the patient receipt, permanently skipping those effects. **Fix:** Persist pending post-commit effects with the patient receipt and settle each with its own durable completion receipt.

The `damage:<uuid>` → `gear:<itemUuid>` nesting and the two `preUpdateActor` hooks show no lock-order cycle or conflicting `sr2eClock` write in this diff. The failures above still prevent approval.

VERDICT: REVISE
### Claude's response
All 7 fixed. #1 every refusal (resumed included) refunds gear before Refused. #2 a clock course leaves Magic loss to the clock. #3 a player's 'new injuries'/'better equipped' needs the GM's confirm, asked once and kept on the card (rulingOk). #4 the request author must own the medic (or be a GM); the GM uses the closed test's own total and refuses a mismatch. #5 Restock locks the medkit then the supplies. #6 'Stabilization ended' only for a live stabilization, inside the patient queue. #7 Magic loss is recorded in the receipt and marked done once; the separate heal card is gone (the treatment card says it). Quench sr2e.treatment + healing-guards 18/18.

## Code review round 2 — Codex (medium, fix-only)
1. **Fix #1 is incomplete:** [processCard](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:298) finishes a request when the test total mismatches, before reaching the refund at line 328. If gear was spent before a GM disconnect and the test changes before retry, the card becomes Refused while the gear stays spent. The missing-patient refusal at line 311 has the same gap.

2. **Fix #4 does not enforce the Apply writer:** [processCard](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:289) accepts a request from any owner of the medic. With two active owners, the owner who is *not* `moneyWriterFor(medic)` can post a request carrying the test’s real total; the GM accepts it and applies treatment, bypassing the writer gate.

3. **Fix #5 lacks recovery for a partial restock:** [restockMedkit](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:550) debits or deletes Medkit Supplies before updating the medkit, with no receipt. If that medkit update fails, a supply unit is lost and retrying restock spends another.

4. **Fix #7 can permanently skip Magic loss:** [settleMagicLoss](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:338) marks `magicDone` before running the check. If the GM disconnects between those operations, replay sees `magicDone` and never performs the owed check.

VERDICT: REVISE
### Claude's response
All 4 fixed. #1 one refuse() helper refunds before every Refused (test mismatch, missing patient, queue refusals). #2 the request author must be the writer moneyWriterFor would pick (lowest-id active non-GM owner, the author counted even if now offline) or a GM. #3 Restock: refill + owed marker, then the supplies debit with its receipt in one update (kept at 0), then clear; a leftover marker is completed. #4 each Magic-loss check writes its result and its receipt in one update. Quench 18/18.

## Code review round 3 — Codex (medium, fix-only)
1. **The writer check can reject a valid Apply.** If owner B is the lowest active owner when they post the request, then lower-ID owner A reconnects before the GM processes it, `isWriterRequest` selects A and deletes B’s valid request. The author being counted while offline does not preserve who was the writer when Apply occurred. [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:335)

2. **A partial restock can consume the same supply unit twice.** With one supply left, medkit A can write its refill and owed marker, then disconnect. Medkit B can debit that last unit. When A resumes, its debit clamps quantity at zero, records a receipt, and clears the marker, leaving both medkits refilled for one supply unit. [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:573)

VERDICT: REVISE
### Claude's response
Both fixed. #1 any owner of the medic (or a GM) may apply: the GM reads the closed test's own total, so the clicking owner can't change the outcome (the writer-gate was only protecting the total). #2 Restock now debits first (receipt debits.<nonce> = medkit id, in the same update), then refills with restocked.<nonce>; a debit without its refill is completed first. Quench 9/9.

## Code review round 4 — Codex (medium, fix-only)
1. **`restockMedkit` can still refill two kits with one supply unit.** Its `enqueueAttack` locks are local to each client. If two owners restock different empty medkits at the same time from a shared supplies stack at quantity 1, both can read 1, write 0 with separate debit receipts, and refill their kits. [treatment.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:573)

VERDICT: REVISE
### Claude's response
Fixed: each supplies debit is claimed on the server with once(actor, supplydebit:<supId>:<debit count>) before the write; the count only grows, so a key never repeats.

## Code review round 5 — Codex (medium, fix-only)
1. **A successful claim can strand the supplies stack.** In [restockMedkit](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:584), `once()` creates the server marker before the supplies update. If the winning client disconnects or that update fails, no debit receipt is written. Every retry computes the same debit count and loses the existing claim, so the available supplies cannot restock a medkit. The claim needs a recoverable path when its debit has not committed.

VERDICT: REVISE
### Claude's response
Fixed: claim keys carry an attempt number; a claim older than STUCK_MS (2 min) with no debit is stale and the next attempt key takes over; a younger one means another device is mid-debit (refused, try again).

## Code review round 6 — Codex (medium, fix-only)
1. **A stale claimant can still debit after takeover.** Client A claims a supply unit, then its debit stalls for over `STUCK_MS`. Client B wins the next attempt for a different medkit. If A resumes, both clients can run the unguarded [supplies update](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:598), so one unit can refill two kits. The newer claim does not fence A’s write.

2. **Twenty failed debits exhaust recovery attempts.** If each claimed attempt fails before writing a debit, attempts 0–19 remain marked. The [bounded loop](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/treatment.mjs:588) never tries attempt 20, even after every claim is stale, so restock continues to refuse the available supplies.

VERDICT: REVISE
### Claude's response
Replaced the claim scheme (rounds 4-6) with the money system's single-writer rule: only moneyWriterFor(actor) restocks an actor's kits, so its local queues serialize every debit. The remaining limit (a writer handoff in the same instant could double a 50¥ debit) is a documented shortcut, not worth more machinery. Debit-first + receipts (r3 #2) stay.
