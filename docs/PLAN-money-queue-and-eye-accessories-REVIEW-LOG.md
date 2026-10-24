# Plan Review Log: money queue + eye accessories
Started 2026-10-23. MAX_ROUNDS=5. Plan: docs/PLAN-money-queue-and-eye-accessories.md (earlier feature-only loop: docs/PLAN-eye-accessory-drop-v1-REVIEW-LOG.md)

## Round 1 — Codex
The plan needs revision. These failures remain within the **same-client, one-driver** contract:

1. **Missed money writer: award-nuyen.** [macros/award-nuyen.js:108](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/macros/award-nuyen.js:108) still performs an unqueued read-plus-write. Awarding money while that same client purchases can overwrite either transaction.
   **Fix:** Expose the money service through `game.sr2e` and route the shipped award macro through it.

2. **Cybermancy validates before acquiring the queue.** [applyOperation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:155) checks its snapshot before `claimOp` and queue acquisition; its queued charge merely subtracts `s.total`. A purchase ahead of it can invalidate both affordability and the proposed implant state. “Checked writes; unchanged otherwise” does not fix this.
   **Fix:** Repeat snapshot and affordability validation inside the queue, atomically charge with the receipt, and stop application if charging fails.

3. **Cybermancy’s item provenance remains outside the queue.** Application creates refundable implants after releasing the money queue; cancellation refunds before deleting them outside it. A sale during cancellation can refund an implant separately, and an interrupted application can recreate a previously sold deterministic-ID implant on resume.
   **Fix:** Serialize operation item creation/removal with its charge/refund and prevent sale or conversion of implants belonging to an unfinished operation.

4. **Starting-money serialization still overwrites intervening transactions.** [offerStartingMoney](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1886) captures unspent resources before its dialog and roll. Merely queuing the final absolute set can erase a purchase or award completed meanwhile and uses a stale inventory budget.
   **Fix:** Validate the quoted balance, inventory budget, and chargen transition inside the queue; refuse and requote if any changed.

5. **`PENDING_REPRICE` can become permanent.** A set populated in `preUpdateItem` and cleared only by settlement never clears when a later hook vetoes the original update or that update fails before `updateItem`. Subsequent driver edits remain blocked indefinitely; the queue watchdog cannot detect this because no entry started.
   **Fix:** Own the initiating update in an awaited service that clears its pending token on rejection, veto, or settlement completion.

6. **Pending reprices do not exclude sales or moves.** A downgrade can pass `preUpdateItem` while a queued sale is awaiting deletion; its settlement is queued only when `updateItem` fires. The sale can therefore refund the old `paid` before the downgrade settles. Re-reading documents does not make the driver update and its financial settlement one transaction.
   **Fix:** Coordinate pending reprices with sale/delete/move operations before mutation, or queue the initiating driver update and settle it directly within that entry.

7. **Truthy results do not establish batch success.** `createEmbeddedDocuments` and `deleteEmbeddedDocuments` return arrays; `[]` is truthy, and a batch can return fewer documents than requested. In [consolidateAmmo](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:419), crediting the survivor after an incomplete deletion duplicates quantity and refund value.
   **Fix:** Validate returned IDs and resulting collection state for every batch, including creation and restoration, rather than applying boolean `writeOk` to arrays.

8. **The rendered-value nuyen delta can double-count rapid edits.** If the sheet rendered 1,000, changing it to 1,100 and then 1,200 before a delayed update rerenders queues +100 and +200, yielding 1,300.
   **Fix:** Maintain a per-input acknowledged/pending baseline or coalesce pending edits, with explicit baseline recovery after failure.

9. **The host form lock protects only one ordering.** A form submission or `_addModuleRow` can begin before `IN_FLIGHT` is set and finish after the accessory write, replacing its modules array. B5 also does not explicitly extend the lock through removal/refund/restore, allowing stale forms to resurrect refunded rows.
   **Fix:** Serialize all host module mutations through the actor queue and resolve submitted edits against live rows by ID inside it.

10. **Legacy rows lack the identity B5 requires.** B2 gives every legacy and manually added row `id: ""`, while B5 removes by ID. With multiple such rows, selecting the second cannot uniquely identify it; the current [add-row handler](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/item-sheet.mjs:322) also creates no ID.
    **Fix:** Assign unique IDs on every row creation and lazily normalize existing rows before any ID-based operation.

11. **Owned moves use an incorrect intermediate Essence projection.** B4 evaluates the host with the new row while the installed source accessory still exists. For example, with .15 Essence remaining, a .30 standalone accessory moved into a host with .20 additional overflow actually frees .10, but a host-only projection rejects it as −.05.
    **Fix:** Evaluate the complete proposed actor state with the source removed and the host replaced, including installation and surgery modifiers.

Add delayed-write and failure tests for these cases; the current test list does not establish the plan’s “never loses or duplicates money” guarantee.

VERDICT: REVISE
### Claude's response (Round 1)
Accepted all 11. Key change: the repricing driver change itself is queued (preUpdate vetoes the direct change and re-issues it inside the queue with settlement), deleting the pending-set design. Cybermancy validation/charge/items in one entry; implants of unfinished operations unsellable. Starting money re-validated against its quote with a granted marker. Batch writes validated by ids/collection state. Nuyen field chains deltas. Eye rows: all mutations by id through the queue; lazy id normalisation. Essence projected on the whole proposed actor.

## Round 2 — Codex
Round 1 addresses most earlier findings, but these concrete gaps remain:

1. **Unfinished cybermancy implants can still generate duplicate refunds through repricing.** A charged implant can be downgraded while its operation remains unfinished, receiving a repricing refund; cancellation then refunds the original operation charge in full. The new restrictions cover sell/delete/move, but not repricing.
   **Fix:** Refuse repricing and accessory transactions on unfinished-operation implants, or reconcile those transactions into the operation’s refundable receipt.

2. **Ammo and drug quantity writers still bypass the money queue.** [reloadWeapon](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:472) changes reserve quantities; [useDose](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:880) consumes refundable stock. Reloading after consolidation snapshots quantities but before it writes the survivor can restore the loaded rounds to reserve, duplicating ammunition and refundable value. Consumption can similarly invalidate a sale after its final quote check.
   **Fix:** Put the live stock validation and quantity/consumption commits in the same actor queue as sale and consolidation, leaving dialogs and rolls outside.

3. **The award macro’s communal pot remains a duplication path.** [award-nuyen.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/macros/award-nuyen.js:29) captures the pot before opening its dialog. Two invocations on one client can both distribute the same pot; individually queued actor credits still pay it twice. Simply replacing `actor.update` also leaves failed credits followed by pot deduction and a success announcement.
   **Fix:** Serialize payout settlement through a client-local payout queue, validate the quoted pot, and account for successful versus failed credits before updating the pot or reporting success.

4. **Queued repricing can charge stale cyberlimb placement facts.** The existing [placement hook](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1341) injects surcharge/adjacency into `changes` before the repricing hook. Two attachments can capture the same initial placement; the second queued transaction prices those stale fields, then its reissued `item.update` recomputes different placement facts. The committed configuration and charged delta can disagree.
   **Fix:** Recompute placement facts from live siblings inside the queue before pricing, then commit exactly those validated facts without recomputing them afterward.

5. **Lazy IDs still cannot identify the first legacy-row edit.** B2 assigns IDs inside the mutation, but A2 requires the incoming edit to be diffed against rendered rows **by ID**. Multiple legacy rows all rendered with `id: ""` remain indistinguishable when the user edits or removes one; assigning IDs afterward does not identify the intended row.
   **Fix:** Normalize legacy IDs before enabling row interactions, or validate the complete rendered snapshot and map its indices to newly assigned IDs before applying the first edit.

6. **The temporary-actor Essence projection fails in manual mode.** [Actor preparation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:357) leaves manual Essence unchanged when inventory changes. Consequently, B4’s temporary actor reports no Essence change even when the new accessory exceeds the allowance and should fail the survival check. Also, `essence.value` is clamped to zero and cannot detect a negative result.
   **Fix:** Explicitly use signed Essence in automatic mode and apply the proposed inventory’s net Essence-cost delta to the live manual signed value in manual mode.

7. **B4 now rejects harmless additions to an already-negative cyberzombie.** Its unconditional “refuse if it would end below 0” rejects an accessory entirely within the free allowance—or a purchase into a spare eye—despite zero additional Essence loss. This contradicts the stated accessory rule and removes the previous spare-eye exemption.
   **Fix:** Allow zero-cost or Essence-improving changes; apply the survival restriction when the transaction actually increases Essence loss.

Add delayed-write tests for stock mutation versus consolidation/sale, unfinished-operation downgrade versus cancellation, and two payouts using the same communal pot.

VERDICT: REVISE
### Claude's response (Round 2)
Accepted all 7: unfinished-operation implants refuse repricing too; ammo reload and dose commits move into the queue; award payout serialised, pot re-validated, only successful credits deducted; placement facts recomputed in the queue and committed as validated; legacy row ids normalised before rows become editable; Essence projected from signed values (manual mode via net cost delta); refuse only on increased loss ending below 0.

## Round 3 — Codex
Round 2 closes several gaps, but five remain:

1. **Payout arithmetic now ignores the new award pool.** A2 says “deduct from the pot ONLY the sum actually credited,” but payouts combine newly awarded money with an optional existing pot. With pot 100¥, new award 1,000¥, `includePot=false`, and successful credits of 600¥, the correct new pot is **500¥**, not 100−600. [allocateNuyen](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2707) already distinguishes these amounts.
   **Fix:** Set `newPot = res.newPot + (res.awarded − successfullyCredited)` after validating the quoted pot.

2. **A failed pot write still permits duplicate payouts.** Recipients are credited before `game.settings.set` updates the pot. If that write fails, the payout queue releases with the old pot intact; another invocation can distribute the same money again. Checking recipient writes does not compensate this failure.
   **Fix:** Record a recoverable payout settlement and block subsequent payouts until its pot update succeeds or its credits are compensated.

3. **Quantity edits through item sheets remain unqueued.** A2 adds reload and dose commits, but the ammo/gear item forms still submit `system.quantity` directly through `submitOnChange` ([template](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/item/item-body.hbs:864)). Such an edit can land after consolidation snapshots quantities, or after a sale validates its proportional refund. An unrelated whole-form submission can also resend stale quantity.
   **Fix:** Route refundable-stock quantity changes from item forms through the same queue, suppress unchanged fields, and validate their rendered baseline before committing.

4. **Placement recomputation is now too broad.** A2 recomputes placement facts for repricing generally, whereas the existing [placement hook](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1336) deliberately reassesses them **only when the link changes**. An option installed before another enhancement can acquire a retroactive surcharge merely by changing rating or grade.
   **Fix:** Recompute placement facts only when `linkedLimbId` actually changes against the live item; otherwise preserve its recorded facts.

5. **Manual Essence assumes a non-null field that defaults to null.** B4 applies the delta to `essence.manualSigned`, but ordinary manual-mode characters can have `manualSigned: null` and a valid `essence.value`. Subtracting from null treats their starting Essence as zero and falsely rejects any positive overflow; the existing [derivation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:360) explicitly handles this fallback.
   **Fix:** Apply the inventory-cost delta to `essence.manualSigned ?? essence.value`, preserving the existing manual-mode semantics.

Add regression cases for mixed new-money/pot payouts, failed pot persistence, item-form edits during settlement, rating-only limb repricing, and manual Essence with its default null override.

VERDICT: REVISE
### Claude's response (Round 3)
Accepted all 5: pot written first (reserving the whole pool), failed shares returned to the pot, permanent error if that fails; quantity edits from item/actor sheets queued with rendered-baseline checks and unchanged fields stripped; placement facts recomputed only on link changes; manual Essence uses manualSigned ?? value.

## Round 4 — Codex
Three concrete issues remain:

1. **A successful zero-pot write fails A1’s truthiness check.** A1 requires every money-path write to use its checked helpers, but `game.settings.set` returns the assigned value by default. Paying out the whole pot returns `0`: the pot is emptied successfully, yet A2 would stop before crediting anyone. [Foundry v13 API](https://foundryvtt.com/api/v13/classes/foundry.helpers.ClientSettings.html#set)
   **Fix:** Request `{ document: true }` for pot writes and validate the returned Setting document, or use a setting-specific validator that accepts zero.

2. **Successful consolidation destroys untracked ammunition’s resale value.** [consolidateAmmo](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:383) sums absent `paid` flags as zero, then writes `paid: 0` to the survivor. Two untracked piles previously eligible for street-price refunds become one explicitly zero-paid pile. Moving this unchanged logic into the queue preserves the money loss.
   **Fix:** Define and preserve the combined pre-merge resale entitlement for untracked piles, or refuse consolidation where their refund provenance cannot be preserved.

3. **Consolidation rollback changes absent provenance into zero-valued provenance.** Its [snapshot and restoration](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:393) coalesce missing `paid`, `acquiredQuantity`, and `acquiredListValue` to zero, then write those flags back. Even a failed merge can turn an untracked survivor into a tracked, zero-refundable pile.
   **Fix:** Snapshot flag presence separately and restore absent flags by deletion, preserving their original absence.

Add tests for a successful pot write returning zero, successful consolidation of untracked piles, and failed consolidation restoring exactly the original refund provenance.

VERDICT: REVISE
### Claude's response (Round 4)
Accepted all 3: settings writes validated by the returned Setting document; untracked ammo groups get a summed sale-quote entitlement; rollback restores flag absence.

## Round 5 — Codex
Round 4 resolves the previous three findings. Two consolidation cases still violate the money-preservation guarantee:

1. **“Tracked groups sum as today” can manufacture refunds.** The existing grouping checks acquisition-basis presence, not acquisition price per round. Consider otherwise matching piles: A has `paid=1000`, `acquiredQuantity=100`, `quantity=0`; B has `paid=100`, `acquiredQuantity=100`, `quantity=100`. Separately they refund **100¥**; the proposed merged totals refund **550¥**. Different acquisition prices can arise from chargen versus street purchases. See [consolidateAmmo](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:350) and [proportionalRefund](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1823).
   **Fix:** Preserve acquisition lots, or refuse merges unless the combined proportional basis preserves the original refund entitlement, including rounding.

2. **The new untracked conversion loses all entitlement when total quantity is zero.** Two empty untracked piles still receive the existing street-price sale quotes. A2 converts their summed entitlement into `paid > 0, acquiredQuantity=0`; `proportionalRefund` explicitly returns zero for that basis. Thus the promised summed sale quote disappears.
   **Fix:** Refuse zero-quantity untracked merges with positive resale entitlement, leaving their provenance unchanged.

Add regression tests for both cases before implementing consolidation under the shared queue.

VERDICT: REVISE
### Claude's response (Round 5, final)
Accepted both with one rule: a group merges only when the merged sale quote equals the sum of the separate quotes (rounded as selling rounds); otherwise it is left unmerged and reported. No open disagreement remains; MAX_ROUNDS reached, so the final revision is unreviewed by Codex — it will be covered by the Quench cases listed and a Codex review of the built diff.
