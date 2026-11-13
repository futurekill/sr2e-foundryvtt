# Plan Review Log: drag an eye accessory onto a cybereye's row
Started 2026-10-23. MAX_ROUNDS=5. Plan: docs/PLAN-eye-accessory-drop.md

## Round 1 — Codex
The plan needs revision. These are concrete failures in the proposed integration:

1. **Owned-item conversion is unreachable.** `_dropItemWorkflow` returns immediately when the source item belongs to this actor (`actor-sheet.mjs:666`), before the proposed “before generic create” interception.
   **Fix:** Resolve the host and handle eligible same-actor moves before that early return and before purchase dialogs.

2. **The eligibility filter accepts unrelated implants.** Wired reflexes, dermal plating, and other non-container cyberware satisfy `capacity === 0 && !limbOption`; they would gain the eye allowance and lose behavior on conversion. Also, `_addModuleRow` can give *any* cyberware capacity, so capacity does not identify an eye or ear.
   **Fix:** Require explicit host identity and compatible accessory identity, with an intentional override for custom content.

3. **The referenced transaction pattern is wrong.** The ordinary drop path creates the item, writes its flags, then debits nuyen; the debit-first/refund pattern belongs to `_surgeryPurchase`. Neither two-document sequence is atomic.
   **Fix:** Specify a dedicated transaction with checked return values, compensation for every failed write, and a persistent error when compensation fails.

4. **The queue does not prevent the stated races.** `enqueueAttack` is client-local (`engagement.mjs:57`); ordinary purchases, sales, purchase hooks, and item-sheet row edits do not share this queue. Concurrent updates can lose money or overwrite a paid row.
   **Fix:** Serialize participating mutations through one authoritative executor and revalidate live host/source documents inside it.

5. **Move rollback lacks stable row identity.** Rows have no ID; deleting “the added row” by index or restoring an old array can remove another edit. Two queued conversions can also reuse the same resolved source unless existence is checked again.
   **Fix:** Give rows stable IDs, re-fetch the source before committing, check deletion success, and compensate only the transaction’s row.

6. **Chargen and configured-eye purchases omit accessory value.** `moduleCost` is derived, but `itemBaseCost` ignores it, and the chargen item projection omits modules entirely. Buying a configured eye therefore charges only its base while copied row `paid` values could later generate refunds.
   **Fix:** Define aggregate list pricing and reset/reallocate purchase provenance when copying or buying configured hosts; include module value in chargen spending.

7. **Conversion can silently destroy refund value.** An untracked standalone accessory currently sells for street price; converting its absent `paid` flag into a row defaulting to zero eliminates that fallback.
   **Fix:** Represent untracked value separately from explicitly free purchases and preserve a defined resale basis during conversion.

8. **Host grade changes leave accessories financially inconsistent.** The existing repricing hook uses `itemBaseCost`, which excludes modules; changing a purchased eye’s grade changes accessory Essence treatment without repricing its accessories.
   **Fix:** Include module grade-dependent prices and their purchase balances in host repricing, or explicitly preserve each module’s acquisition grade.

9. **The rating helper assumes prepared data exists.** `toObject()` supplies source data; `essenceCost` is assigned in `prepareDerivedData`, not a rating-aware getter on that plain object. Reading it directly can capture the wrong rating’s Essence.
   **Fix:** Resolve the selected rating row explicitly, matching the existing fallback for Essence, cost, and Street Index.

10. **The overflow warning is numerically wrong for graded eyes.** `capacityOver` uses raw module Essence, while `actualEssenceCost` grades before allowance. A beta pair with .6 raw accessory Essence reports .1 overflow despite its graded accessories fitting within .5.
    **Fix:** Calculate the warning from the same graded calculation as actual Essence, distinguishing allowance overflow from the character’s actual Essence change.

11. **Slot selection disappears on free and owned-item paths.** The proposed left/right question lives in the Buy dialog, which Alt-drop, NPCs, auto-charge-off, and owned moves skip; weapon rows then default to both eyes.
    **Fix:** Separate placement selection from payment and run it for every applicable insertion.

12. **Schema classification conflates ordinary accessories with unknown items.** `kind: ""` means both “Accessory” in the schema and “unclassified” in `eyeReports`; correctly imported low-light vision consequently produces an unresolvable classification warning.
    **Fix:** Add an explicit ordinary-accessory kind and reserve blank for unknown classification.

13. **Owned conversion silently changes state and grade.** Every row becomes `active: true`, while source installation, damage, surgery adjustment, and grade are discarded; moving standard ware into a delta host grants delta Essence treatment without a purchase.
    **Fix:** Define supported conversion states, preserve applicable activation state, and reject or explicitly reconcile incompatible grades and unsupported effects.

14. **“Never block” also permits crossing zero Essence.** The existing surgery purchase aborts below zero; this path can add overflow to an installed eye without that check.
    **Fix:** Preserve advisory capacity/slot reports while separately enforcing the established character-survival check.

The tests should cover these failures, especially concurrent mutations, failed debit/write/delete/refund, configured-host copies, untracked moves, graded overflow, and chargen accounting.

VERDICT: REVISE
### Claude's response (Round 1)
Accepted: #1/#5/#7/#13 by cutting owned-item moves from scope; #2 identity table + host rule; #3 surgery-order transaction with persistent error on failed refund; #6 zero copied rows' paid, chargen counts rows' paid; #9 prepared candidate; #10/#14 Essence delta from a prepared host copy, below-0 refused; #11 placement prompt independent of payment; #12 explicit "accessory" kind.
Rejected: #4 cross-client executor — the system-wide contract is one driver per actor; every purchase path already relies on it. #8 — accessory prices are ungraded by decision, so host repricing is unaffected.

## Round 2 — Codex
Round 1 fixes eligibility and placement, but several failures remain. I accept the one-driver contract and ungraded accessory pricing as explicit scope decisions.

1. **One driver still permits concurrent operations.** A drop awaiting `actor.update` can overlap that same user’s sale, ordinary purchase, or item-sheet edit; those operations do not share `purchase:${actor.uuid}`. Lost nuyen updates and overwritten paid rows remain possible.
   **Fix:** Serialize conflicting operations on this client through the same queue, or disable those mutations while the transaction runs.

2. **The Essence check is outside the specified transaction.** Two drops can each pass against the original Essence, then commit sequentially and collectively cross zero; host grade or installation state can also change during dialogs.
   **Fix:** Recompute price, placement validity, and projected actor Essence from live documents inside the queue immediately before debit.

3. **Uninstalled eyes produce false Essence failures.** `actualEssenceCost` returns an implant’s cost regardless of installation; actor aggregation only counts installed implants. Adding accessories to a spare eye should not lower character Essence or fail the below-zero check.
   **Fix:** Calculate the actor’s effective Essence delta, including whether the host is installed.

4. **“Awaited” does not mean committed.** Existing purchase code explicitly checks falsy update results; Round 1 only tests a throwing `host.update`. A vetoed debit could grant a free paid row, and a vetoed host update could consume money without fitting anything.
   **Fix:** Treat falsy debit, row-write, and refund results as failures and test each alongside exceptions.

5. **Chargen creates refundable money without spending nuyen.** Step 7 sets `paid = list price` without debiting cash; selling the host credits that amount and removes the row from resource spending. Repeating the cycle manufactures nuyen.
   **Fix:** Follow the existing chargen purchase debit convention, or separate chargen allocation from cash-refund provenance and make selling respect that distinction.

6. **The proposed chargen projection cannot safely “add” row payments.** `chargenItemCost` sends projected cost through rating-table resolution, single-eye discount, and grade multiplication. Adding payments to `cost` can therefore ignore or multiply them; adding an unused property does nothing. Furthermore, `paid` is historical expenditure, not list value.
   **Fix:** Add a separate module list-value term after host pricing in `chargenItemCost`, independent of refund tracking.

7. **Ungraded pricing is not implemented by hiding grade.** `moduleRowFrom` calls `itemBaseCost`, which applies the candidate’s grade multiplier. A world-sidebar accessory already marked beta still costs beta prices even with the selector hidden.
   **Fix:** Explicitly price accessory candidates as standard grade while retaining the host’s grade only for Essence calculations.

8. **Configured copies still bypass accessory charges.** Zeroing copied rows’ `paid` prevents inherited refunds, but purchasing a configured eye still charges only the host while retaining all accessory benefits.
   **Fix:** Either strip accessory rows from purchased copies or charge their independently calculated list/street prices and record the new payments.

9. **The catalogue problem is confirmed and directly breaks the default workflow.** The core Cybereyes item contains **1.0 Essence** of rows; inactive rows still count. A fresh standard pair therefore costs **.7 Essence**, and dropping Low-Light adds another .2 instead of using free allowance.
   **Fix:** Make correcting the core catalogue rows a prerequisite and test the actual compendium eye, not only an empty fixture.

10. **The scope instructions contradict themselves.** The final “Out of scope” section still promises owned-item drag conversion; the new workaround—delete the paid implant and drop another—also loses its recorded payment and charges again.
    **Fix:** Remove the stale promise and document an explicit free-drop/manual-accounting procedure for existing implants.

Add regression coverage for these cases, particularly same-client overlap, falsy writes, chargen buy/sell cycles, single/uninstalled eyes, and the shipped core eye.

VERDICT: REVISE
### Claude's response (Round 2)
Accepted all ten. #9 fixed outright (core Cybereyes rows removed, sr2e 0.116.2). Money redesigned: the eye's base price includes Σ row costs (ungraded) and `modules` becomes a purchase driver, so the existing preUpdateItem repricing hook charges/refunds/vetoes every row change atomically within the item update — this answers #1, #4, #5, #6, #8 without new transaction code. #2 recompute inside the queue; #3 spare eyes skip the Essence check; #7 rows priced explicitly at standard grade; #10 out-of-scope text fixed.

## Round 3 — Codex
The central assumption is false: **the hook does not charge or fold `paid` atomically into the item update.** The core catalogue rows are now empty, as stated.

1. **Payment happens after the item commits.** In `sr2e.mjs:1476`, `preUpdateItem` merely stores `{ delta, newPaid, revert }` in options. The async `updateItem` hook then separately updates actor nuyen and calls `item.setFlag`. Foundry does not await hook callbacks, so awaiting `host.update()` does not await payment or rollback. [Foundry v13 hook documentation](https://foundryvtt.com/api/v13/modules/hookEvents.html)
   **Fix:** Expose an explicitly awaited purchase operation that completes payment, flag updates, and compensation before releasing the queue or reporting success.

2. **Even this path’s double drops can race.** The queue can advance while the first payment hook is suspended; the second purchase can read stale nuyen or `paid`. Both rows may survive while one debit or paid increment overwrites the other. A failed first purchase can also restore its old modules array over the second purchase.
   **Fix:** Keep the complete settlement inside the shared queue and serialize other conflicting edits/sales through it.

3. **Falsy settlement results are still treated as success.** `updateItem` checks exceptions, but never checks the return values of `actor.update`, `setFlag`, refund, or rollback. A vetoed debit can therefore produce a paid accessory without payment.
   **Fix:** Check every settlement write’s result and test falsy returns separately from thrown errors.

4. **Accessories inherit the wrong Street Index.** The hook multiplies the entire new base by the **host’s** SI. Core eyes use .75; Low-Light uses 1.25 and costs 3,000¥. This plan charges **2,250¥ instead of 3,750¥**; Eye Camera becomes **3,750¥ instead of 10,000¥**.
   **Fix:** Preserve accessory SI in each row and compute host and accessory street prices separately, while summing list prices during chargen.

5. **The refund formula breaks free-host purchases.** In chargen, a free 5,000¥ eye receives a bought 3,000¥ accessory: `paid = 3000`. Removing it computes `min(3000, 5000) − 3000 = 0`, so **nothing is refunded**.
   **Fix:** Track the refundable acquisition value of accessories separately from the host’s unpurchased catalogue value.

6. **Free rows also defeat refunds on bought hosts.** In chargen, buy a 5,000¥ eye, Alt-add a 3,000¥ row, buy another 3,000¥ row: `paid = 8000`. Removing the bought row leaves a configuration worth 8,000¥, so the hook refunds zero.
   **Fix:** Preserve free-versus-purchased provenance per row; aggregate catalogue value cannot determine which removal deserves a refund.

7. **Initializing `paid = 0` changes the host even when purchase fails.** That preliminary write survives an affordability veto or failed module update. It also changes the existing untracked host’s sell quote from street-price fallback to zero.
   **Fix:** Commit provenance initialization only with successful settlement, restoring the original absence of the flag on failure.

8. **Legacy rows can still suppress legitimate refunds.** The risks section says old rows appear on both sides, but the negative-delta branch uses the absolute **new price**, not simply the difference. Unpaid historical rows can keep that price above `paid`, preventing a newly bought accessory from being refunded.
   **Fix:** Define acquisition provenance for legacy rows and calculate refunds from the removed purchase, not aggregate replacement value.

Chargen’s existing hook does correctly select list prices and debit nuyen; the synchronous affordability veto also exists. Those parts are reusable. The atomicity, completion, Street Index, and refund assumptions are not.

The simpler reliable design is shared list/street pricing helpers plus an awaited purchase service and per-row acquisition tracking. Add tests for delayed settlement, falsy writes, mixed free/paid rows, failed first purchase on a free host, and the actual accessory Street Indices.

VERDICT: REVISE
### Claude's response (Round 3)
Accepted #1–#4: the repricing hook is dropped; a dedicated awaited purchase in one queue entry, checked writes, the ordinary drop's row-then-money order, removal by row id on failure, accessory priced at its own SI. #5–#8 removed by a scope decision: accessory purchases are final (no refunds), so no per-row provenance. Chargen counts rows via a recorded `listValue`.

## Round 4 — Codex
The dedicated awaited purchase fixes the hook problem. I accept final purchases and free configured copies as deliberate decisions. Five concrete gaps remain:

1. **One driver does not prevent cross-path races.** That user can sell the eye or edit its rows while `host.update` is pending, or start another purchase while the debit is pending. The result can be payment for a deleted accessory or an overwritten nuyen update.
   **Fix:** Serialize conflicting mutations on this client, or block them while an accessory purchase is settling; no cross-client lock is required.

2. **The second affordability check is missing.** Step (f) re-reads nuyen but does not explicitly require the fresh balance to cover the price. Another expenditure between (e) and (f) can produce a negative balance.
   **Fix:** Recheck `freshNuyen >= price` immediately before debit and remove the inserted row if funds are insufficient.

3. **Chargen still will not receive the rows.** `chargenBudgetOf` constructs an explicit item projection without `modules`; changing only `chargenItemCost` cannot count `listValue`.
   **Fix:** Add modules or their summed list value to the projection and test through `chargenBudgetOf`, not just the pricing helper.

4. **Deleting rows implicitly refunds final purchases during chargen finalization.** Removing a purchased row—or selling its host—removes its `listValue` from resource spending. `sr2e.mjs:1888` derives unspent resources from that budget for starting money, so the expenditure disappears despite the no-refund decision.
   **Fix:** Preserve nonrefundable chargen expenditure in an actor-level ledger when a purchased row or host is removed.

5. **Free copies inherit another character’s chargen expenditure.** Configured copies retain row `listValue`; consequently, rows received “at no extra charge” consume the recipient’s resources, including on Alt-drop.
   **Fix:** Clear row `listValue` when creating a copied host whose accessories are free under the chosen policy.

Add regression tests for overlapping sale/purchase, insufficient funds after row insertion, actual chargen projection, removal before finalization, and free configured copies.

VERDICT: REVISE
### Claude's response (Round 4)
Accepted #1 (client-local settling lock over sell/delete/row buttons/another drop), #2 (fresh-balance recheck, row removed by id), #3 (projection carries moduleListValue; tested through chargenBudgetOf), #5 (copied eyes' rows zeroed).
Rejected #4: in character creation, deleting any bought item already removes it from the Resources spend — creation is a draft. Accessories behave the same; a ledger only for them would be inconsistent.

## Round 5 — Codex (reviewing Round 4)
I accept the chargen rejection: treating creation as a revisable draft is consistent with existing behavior. The remaining blockers concern the settling lock.

1. **The lock still permits competing nuyen writes.** It blocks this eye’s sale and accessory drops, but ordinary purchases, another item’s sale, and grade/rating repricing remain unrestricted. With 10,000¥, two operations can both read 10,000 and write 7,000 and 8,000, losing one expenditure. Rechecking before debit cannot prevent overlap while that debit is awaiting completion.
   **Fix:** Use an actor-level settlement guard shared by conflicting money operations, held through their actual completion.

2. **Existing-row edits are not harmless.** The item sheet uses `submitOnChange`; row fields include Essence and grade remains editable. An edit after the purchase’s Essence check can invalidate that check, and a grade edit can launch the asynchronous repricing hook during settlement.
   **Fix:** Block host form submissions during settlement, including row fields and price/Essence drivers—not merely add/remove buttons.

3. **A one-sided lock does not protect against operations already underway.** `onSellItem` awaits confirmation and later deletion/payment. A sale started before `IN_FLIGHT` is set can resume during the purchase; checking the lock only when the sell button is clicked is insufficient.
   **Fix:** Have sale/delete and purchase acquire the same guard immediately before mutation and retain it through completion, rechecking after dialogs.

Add tests with delayed writes—not just actions invoked after setting the lock—including an ordinary purchase overlapping the debit, a host form submission during settlement, and a previously opened sale confirmation.

VERDICT: REVISE
### Claude's response (Round 5)
Accepted all three: one per-actor client-local money queue shared by the accessory purchase, the ordinary drop's charge, the surgery charge, the sale (after its dialog, with re-validation) and the repricing settlement; dialogs outside the queue. The host's item-sheet form and row buttons refuse while it settles.
