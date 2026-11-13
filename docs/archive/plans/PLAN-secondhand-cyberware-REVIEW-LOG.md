# Plan Review Log: second-hand cyberware
Started 2026-10-29. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. These are concrete gaps in the proposed implementation:

1. **Chargen still counts full-price ware.** The explicit item snapshot in `module/sheets/actor-sheet.mjs:553` passes `secondhandDiscount` but would omit the new `secondhand` flag, so purchase deductions and chargen resource accounting disagree.  
   **Fix:** Add `secondhand` to the chargen snapshot and test both the money balance and resource total.

2. **The purchase checkbox needs an explicit persistence path.** `_promptPurchaseOptions` returns selected fields, and its caller individually copies them into `itemData.system` (`actor-sheet.mjs:788`); adding UI alone does not save the choice, including before `_surgeryPurchase`. Also, `_wireGradeFields` currently previews surgery, not the item price.  
   **Fix:** Specify checkbox extraction, copying both `true` and `false` before the surgery branch, and creation of an actual item-price preview.

3. **Marking failure does not finalize the test.** After the GM marks replacement required, `applyKarmaToTest` can still reroll successfully while the implant remains failed; a concurrent Karma action also races the GM’s state read. The existing method already supports `state.closed` and checks closure again after spending (`module/documents/actor.mjs:728–824`).  
   **Fix:** Serialize failure settlement with Karma, close the test when failure is committed, and make duplicate settlement idempotent.

4. **The proposed `off` change can incorrectly lower Reaction.** Failed muscle replacement would stop adding Quickness but still add `reactionExemptQuickness`, because that accumulation sits outside `if (!off)` (`module/data/actor-data.mjs:1046`).  
   **Fix:** Guard the Reaction-exempt Quickness contribution with `!off` and test failed muscle replacement.

5. **Cyberlimb attributes bypass the proposed failure guard.** `_limbEssenceAndModel` runs before the item-mod loop, and `_applyLimbAverages` later replaces Strength and Quickness from that model; failed limbs and limb enhancements therefore retain effects beyond the explicitly deferred vision/smartlink features.  
   **Fix:** Define failed-limb functional stats and propagate failure into the limb model while preserving physical presence and Essence.

6. **The reliability TN silently gains character penalties.** `rollSuccessTest(5, tn)` applies wounds, sustaining, dump shock, withdrawal, and other modifiers; merely passing `isResistance` suppresses only wounds (`actor.mjs:390–447`).  
   **Fix:** Define an explicit modifier policy for this equipment test, using the existing table-policy machinery where appropriate, and test that the GM-entered TN is respected.

7. **The repair guards target the wrong file.** `module/cyberdamage.mjs` has no repair actions; `cdRepair` and `cdSkinRepair` live in `module/sheets/sheet-actions.mjs:3821–3833`.  
   **Fix:** Guard those actual handlers and their controls against `secondhandFailed`.

8. **Eye accessories lose second-hand identity when converted into rows.** `module/eye-accessories.mjs:47` can price a second-hand source through its candidate, but the resulting module row stores neither second-hand status nor failure state; the accessory then has no Item on which to run the proposed reliability method.  
   **Fix:** Preserve and support reliability state on accessory rows, or explicitly block converting second-hand accessories until that path is supported.

9. **Failed ware remains eligible for a full purchase-price refund.** The existing sell flow refunds recorded `paid` for non-ammo items (`module/sheets/sheet-actions.mjs:3013`), so a player can sell irreparable ware and finance its replacement.  
   **Fix:** Define failed-ware resale handling and prevent the ordinary full refund, with a regression test.

10. **The delta policy can hide a mechanically failed item.** Changing failed second-hand ware to delta hides its controls, while the proposed unconditional `secondhandFailed` guard still disables its bonuses; the claim that stale flags are harmless is false.  
    **Fix:** Keep failure visible independently of grade and prohibit ordinary grade/condition edits from implicitly repairing failed ware.

VERDICT: REVISE
### Claude's response
Accepted all 10. #5 resolved by the Phase 5 precedent (dead limb = reminder; limbs skip the off gate) rather than inventing dead-limb stats. #2: no price preview exists, so none is added; the checkbox label states the effect.

## Round 2 — Codex
The revision fixes several earlier gaps, but these remain:

1. **The settlement claim does not serialize Karma.** The GM reads zero successes, then awaits `once`; a Karma reroll can succeed during that await, after which the GM closes the stale state and marks failure. Conversely, Karma can pass its final closure check before the GM’s close arrives and subsequently overwrite the test state (`actor.mjs:818–833`).  
   **Fix:** Route settlement and Karma through the same cross-client arbitration, with the success check inside that protected operation.

2. **A failed settlement write becomes unretryable.** `once` creates its marker before either document update; if closing the message or updating the item fails, subsequent presses lose the claim and cannot finish (`module/claims.mjs:16`).  
   **Fix:** Record resumable settlement status and allow retries to complete missing writes without reopening Karma.

3. **`tnPolicy: "table"` does not guarantee the entered TN.** `testTnModifiers` adds `cdsTN` unconditionally, so a character with Chronic Dissociation Syndrome still adds +3 to this equipment test (`actor.mjs:428`). The wounded-character test will miss this.  
   **Fix:** Add an explicit equipment-test modifier policy that suppresses all character penalties, and test CDS as well as wounds.

4. **Zero resale value does not prevent refunds through configuration changes.** A failed second-hand beta implant can still be downgraded to standard; `repriceQueued` calls `repriceDelta` and refunds the difference regardless of `secondhandFailed` (`sr2e.mjs:1572`). This recovers money from supposedly worthless ware without selling it.  
   **Fix:** Reject ordinary purchase-driver changes on failed implants, with an explicit GM correction path that does not transact money.

5. **The accessory conversion guard can be bypassed without clearing failure.** The plan allows unticking `secondhand` while retaining `secondhandFailed`; its conversion restriction checks only whether the item is second-hand. Existing `moveProblem` checks ordinary conditions and effects, but knows nothing about this failure flag, and conversion discards that flag (`eye-accessories.mjs:101–145`).  
   **Fix:** Reject conversion when either `secondhand` or `secondhandFailed` is set, for both source-item moves and direct purchases, rechecking live sources inside the queue.

6. **The new delta guard can trap invalid imported items.** Rejecting every update whose resulting state remains delta plus second-hand blocks unrelated edits, while the item sheet hides the very checkbox needed to correct it; the plan explicitly anticipates invalid pack data.  
   **Fix:** Reject transitions into the invalid combination while allowing unrelated edits to existing invalid records, and expose a correction control for those records.

VERDICT: REVISE
### Claude's response
Accepted all 6. #1/#2: settlement now uses the existing closesTests message mechanism (astral/combat-spells), no once(); the settlement message is the retryable record. Residual race = the accepted combat-spells P1.5 window. #3: new tnPolicy equipment zeroes wounds + CDS. #4: purchase drivers refused on failed parts. #5, #6 as suggested.

## Round 3 — Codex
Three gaps remain:

1. **Normal Karma’s “buy additional dice” action is missing.** The proposed prompt collects only TN, while `rollSuccessTest` buys initial dice only through `options.karmaDice` (`module/documents/actor.mjs:501–502`). Chat buttons cannot add those dice afterward, so this test omits a normal Karma option.  
   **Fix:** Add a pre-roll Karma-dice input, pass it through `karmaDice`, and test the normal cost and five-die cap.

2. **Settlement retry cannot distinguish a failed write from an intentional GM correction.** After settlement succeeds, the GM may untick `secondhandFailed`; the proposed “settlement exists + item not failed” check then offers “Finish” again and reapplies the failure. That contradicts the stated correction workflow.  
   **Fix:** Record settlement application separately from the current item condition, and retry only unapplied settlements.

3. **The equipment-policy description still assumes a guard that does not exist.** `phobiaTN` is `computing ? phobia : 0`, independent of `tnPolicy` (`module/documents/actor.mjs:429`); changing only wounds and CDS does not implement “zeroes every character modifier.” A computing context would still increase an equipment test’s TN.  
   **Fix:** Explicitly suppress `phobiaTN` for equipment tests and add a policy test with cyberphobia plus a computing context.

The remaining settlement race and manual handling of failed limbs are now explicit tradeoffs; I am not reopening them as undisclosed implementation gaps.

VERDICT: REVISE
### Claude's response
Accepted all 3: karmaDice input; applied flag on the settlement message; equipment policy zeroes phobiaTN too.

## Round 4 — Codex
The revision addresses the remaining blockers: pre-roll Karma dice, settlement application tracking, and equipment-policy coverage now have explicit requirements and tests.

No further blocking flaws found. The settlement race and partial automation of failed implants remain documented limitations.

VERDICT: APPROVED
## Code review round 1 — Codex
- **P1 — Settlement can permanently record an unapplied failure.** [secondhand.mjs:61](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/secondhand.mjs:61) ignores the item update’s result. A hook veto can resolve without throwing; the next line marks the settlement applied, closing Karma and disabling retries while the part still works. **Fix:** verify `item.system.secondhandFailed === true` after the update before marking the settlement applied.

- **P2 — Duplicate settlements can undo a later GM correction.** [secondhand.mjs:75](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/secondhand.mjs:75) prioritizes any pending settlement over an applied sibling. If two GMs settle concurrently and one write fails, retrying that pending duplicate after the GM clears failure marks the part failed again. **Fix:** treat an applied settlement for the test as authoritative and retire pending duplicates without updating the item.

- **P2 — The planned settlement UI is missing.** [sr2e.mjs:2996](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2996) only attaches a listener: players see the GM button, applied tests retain it, and pending settlements never display “Finish: mark failed.” **Fix:** derive button visibility and retry labeling from GM status and current settlement records during rendering.

- **P2 — Quench pricing test depends on world settings.** [sr2e-quench.mjs:13319](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:13319) expects a charge without enabling `autoChargePurchases`; running this batch alone with that setting disabled fails valid behavior. **Fix:** save, enable, and restore the setting in batch setup/teardown.

- **P2 — Required integration coverage is absent.** [sr2e-quench.mjs:13294](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:13294) omits purchase-dialog persistence, chargen totals, CDS/phobia, upfront Karma dice, player failure-field protection, repair/eye-row refusal, and delta template rendering; its closed-test check never exercises the post-payment refund race. **Fix:** add the plan’s missing cases, including settlement injected during Karma payment and a nonthrowing item-update veto.

Direct pricing and reroll-cost assertions passed. Foundry/Quench execution was not performed; no files were modified.

VERDICT: REVISE
### Claude's response
All 5 fixed: settlement verifies the item really failed before marking applied; an applied settlement is authoritative over pending duplicates; settle button decorated per client on render (GM only, Finish label while pending, removed once applied) and re-rendered when a settlement appears/applies; batch enables/restores autoChargePurchases; added coverage (veto -> pending/Finish, duplicate vs correction, CDS/phobia/Karma dice, Buy-dialog persistence, chargen half price, repair refusal, eye-row refusal). Player-side lock on secondhandFailed is enforced in preUpdateItem but not Quench-tested (needs a non-GM client). Live: 70/70 across 7 batches.

## Code review round 2 — Codex
Reviewed committed HEAD `54a113f`. The settlement verification, duplicate handling, GM-only UI, and test-setting isolation fixes address the implementation findings.

One prior finding remains:

- **P2 — The settlement-during-Karma-payment regression is still untested.** [sr2e-quench.mjs:13350](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:13350) settles before invoking Karma, so the test exits at the initial closure check; it never verifies the required post-payment refund. Passing 70/70 does not cover that branch. **Fix:** wrap `_spendKarmaPool` to settle after the real debit, then assert all 10 Karma are refunded and the test’s dice/reroll state remains unchanged.

No additional implementation blockers found within the plan’s accepted limitations. I did not independently rerun live Quench.

VERDICT: REVISE

### Claude's response
Added the test: _spendKarmaPool wrapped to settle after the real debit; asserts settled, all 10 Karma refunded, dice and rerolls unchanged. Live: 28/28 (second-hand 12 + karma-pool).

## Code review round 3 — Codex
Reviewed HEAD `a8a0f79`. The new test exercises settlement after the real Karma debit and verifies the refund, failed part, and unchanged dice/reroll state. This resolves the remaining finding.

No further blocking flaws found. Live Quench results are user-reported; I did not rerun them.

VERDICT: APPROVED