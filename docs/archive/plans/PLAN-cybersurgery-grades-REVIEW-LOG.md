# Plan Review Log: delta / secondhand / cybersurgery
Started 2026-10-19. MAX_ROUNDS=5.

## Round 1 — Codex

Found eight concrete gaps requiring revision:

1. **Discount edits will not reliably reprice.** In `module/sr2e.mjs`, `PURCHASE_DRIVERS` omits `secondhandDiscount`, and `sysFor()` omits its current value. Discount-only edits do nothing; grade/rating edits can calculate against the default discount instead of the purchased discount.  
   **Fix:** Add `secondhandDiscount` to both the driver list and old/new pricing snapshots, with tests for discount-only edits and subsequent regrades.

2. **Default surgery changes existing worlds’ Essence.** The proposed unconditional `ceil100(...)` rounds even when `surgeryEssencePct` defaults to zero; existing standard ware authored at `.025` would become `.03`, whereas `gradeEssenceCost()` explicitly preserves that precision.  
   **Fix:** Preserve the graded cost exactly when the surgery modifier is zero, and test existing items without the new field.

3. **The overflow check lacks a safe calculation point.** `_dropItemWorkflow()` creates the installed item before charging, and actor derivation clamps Essence to zero (`module/data/actor-data.mjs:355`). Checking the resulting actor value cannot detect negatives; subtracting the implant again double-counts it. Raw dropped data also misses rating-derived Essence, container overflow, and cranial-deck calculations.  
   **Fix:** Prepare the selected candidate and compute unclamped projected actor Essence before embedded creation, including existing bioware and substance losses.

4. **The separate surgery charge has no failure contract.** The existing flow checks affordability for equipment alone and only transacts when `base > 0`; a separate fee can fail after equipment succeeds, while zero-price implants can bypass surgery charging entirely. Wound or chat failures introduce further partial outcomes.  
   **Fix:** Check equipment-plus-fee affordability together, debit the combined amount while recording equipment-only `paid`, and define rollback/idempotency for creation, damage, and reporting.

5. **The proposed multi-implant workaround undercharges and under-wounds.** Two `.30` implants total `.60`, requiring the plan’s major category; charging/wounding for the first minor procedure and skipping the second leaves a minor procedure.  
   **Fix:** Accept a procedure-wide Essence total or implement grouped purchases before offering the “skip later ones” instruction.

6. **Surgery is applied to purchases that do not install anything.** Dropped data retains `system.installed`, but the proposed eligibility is simply an in-play cyberware purchase; buying an uninstalled spare would incur a wound, fee, and potentially an overflow rejection despite consuming no actor Essence.  
   **Fix:** Gate surgery on actual installation and explicitly define how uninstalled purchases later enter that flow.

7. **The existing number parser cannot accept zero successes.** `_promptPurchaseOptions()` uses `intOr()` with `Math.max(1, n)`; reusing it silently converts the important zero-success outcome into one success.  
   **Fix:** Parse successes separately as a finite nonnegative integer and test zero through the actual dialog callback.

8. **Secondhand grade metadata breaks the existing price description.** The proposed `{bodyCostMultiplier: 1}` lacks `costMultiplier`; `describeGrade()` tests `undefined !== 1` and consequently renders `×undefined ¥`.  
   **Fix:** Render secondhand pricing from the selected discount and refresh its description when the discount changes.

VERDICT: REVISE
### Claude's response
All eight accepted: discount in PURCHASE_DRIVERS + sysFor; no re-rounding at pct 0; projected Essence from a prepared unembedded candidate before creation; one affordability check + one debit (paid = item only); procedure-total Essence field for multi-implant surgeries; surgery only when installed; successes parsed separately (0 allowed); describeGrade renders the discount.

## Round 2 — Codex

The revision closes most first-round gaps, but these remain:

1. **Failed payment creates refundable money.** The new order stamps `paid` before the debit and explicitly retains the item if payment fails. Sell-back and downgrade refunds trust that flag, allowing refunds for money never spent.  
   **Fix:** Record `paid` only after a confirmed debit, and remove or explicitly mark unpaid items when payment fails.

2. **Concurrent purchases can bypass both checks.** “Once, on the buyer’s client” does not serialize two drops: both can pass the same Essence/balance checks before creation, then jointly exceed Essence or overwrite a debit.  
   **Fix:** Serialize purchases per actor and recheck current Essence and combined affordability inside that transaction before creation.

3. **The displayed surgeon TN is circular.** The prepared candidate includes the entered surgery percentage, so changing the test’s successes can change the TN of that same test; near an integer Essence boundary, this changes the required roll.  
   **Fix:** Calculate the test TN from projected Essence before the test’s success modifier, and display the post-result Essence separately.

4. **Missing `installed` bypasses surgery despite installing the item.** Eligibility requires raw dropped data’s `system.installed === true`, but `CyberwareData` defaults omitted `installed` to true; a minimal `data.data` drop therefore installs ware without surgery.  
   **Fix:** Determine eligibility from the schema-normalized candidate’s `installed` value.

5. **Standard-grade surgery remains hidden on the item sheet.** `item-sheet.mjs` sets `gradeReducesEssence` solely from grade, and `item-body.hbs` gates actual-Essence hints on it; standard ware with a surgery modifier displays its unmodified base without the actual-cost hint.  
   **Fix:** Show actual Essence whenever surgery or grade changes it, including rated items.

VERDICT: REVISE
### Claude's response
All five accepted: paid stamped only after a confirmed debit; per-actor purchase queue with re-checks inside (cross-client remains general LWW); TN from the pct-0 projection; eligibility from the prepared candidate; item-sheet hint when actual ≠ base.

## Round 3 — Codex

Three concrete gaps remain:

1. **No `paid` flag does not prevent resale.** The revised failure path assumes an unpaid implant cannot be refunded, but `onSellItem()` in `module/sheets/sheet-actions.mjs` falls back to street price when `paid` is absent; failed payment therefore still grants saleable ware.  
   **Fix:** Persist an explicit unpaid state that blocks resale and repricing until settlement, or delete the implant after a failed debit.

2. **Purchase provenance can be inherited, and successful payment can go unrecorded.** `_dropItemWorkflow()` copies `item.toObject()`, including another actor’s `paid` flag; “create WITHOUT paid” must explicitly strip it. Conversely, the plan defines no recovery when the debit succeeds but setting the new `paid` flag fails, leaving resale and future repricing inconsistent with money spent.  
   **Fix:** Strip inherited acquisition flags and define a recoverable settlement record for debit-success/flag-failure, with failure-injection tests.

3. **Procedure categories still have a precision gap.** Zero-percent surgery deliberately preserves fine precision, but the category specification only rounds values between `.40` and `.41`; an authored `.995` Essence implant matches neither `.41–.99` nor `≥1`.  
   **Fix:** Round every procedure total upward to hundredths before classification, preserving exact zero, and test `.401` and `.995`.

VERDICT: REVISE
### Claude's response
Reordered: debit first, then create WITH the paid flag in the create data; a failed create refunds the debit; a failed debit creates nothing. Inherited acquisition flags are overwritten. The procedure total rounds up to hundredths before classification (.401, .995 tested).
