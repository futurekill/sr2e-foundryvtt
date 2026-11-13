# Plan Review Log: audit fixes (5)
Started 2026-10-16. MAX_ROUNDS=5.

## Round 1 — Codex

The plan needs revision. The Hatamoto diagnosis is correct, but the proposed transaction fixes rely on guarantees the code and Foundry API do not provide.

Verified: `git diff v0.104.2 -- module/rules/weapon-ranges.mjs` confirms Hatamoto was added after the tag; the tag lacks it. The sibling NAGRL pack currently has `10/20/50/100`. Migration `0.104.3` already supports the proposed per-field corrections. The cited locations are substantially accurate; Full Defense’s actual `setFlag` is at 1660, and the guarded melee update is at 1762.

1. **The migration guard will always fail.** `RANGE_FIXES` is an object, so `RANGE_FIXES.length` is `undefined`; only `MODULE_RANGE_FIXES` is an array. Counts also cannot detect edits to existing released entries.  
   **Fix:** Use `Object.keys(RANGE_FIXES).length` and compare released migration data against a fixed snapshot.

2. **The new melee hook lacks its renderer import.** `module/sr2e.mjs:18` does not import `renderMeleeAttackCard`; implementing the listed hook literally produces a `ReferenceError`.  
   **Fix:** Add `renderMeleeAttackCard` to the existing item-module import.

3. **The `mine` rule is not an elected fallback or a retry mechanism.** At `sr2e.mjs:1994`, an active author excludes every other GM; an inactive author permits every GM. If the author disconnects during closure or its update fails, an online GM does not subsequently retry. The stated “neither author nor GM online” limitation is incomplete.  
   **Fix:** Treat the outcome marker as authoritative independently of whether the cosmetic card update succeeds.

4. **Melee does not consume that authoritative marker.** `rollMeleeDefense` at 1507 and Undefended at `sr2e.mjs:2602` check only `state.resolved`; `_syncDependentCards` at `actor.mjs:782` excludes melee from its marker-aware check. After an outcome exists, these paths can still permit another resolution or update the settled exchange while closure is delayed or fails. This is distinct from the explicitly excluded double-click-before-outcome case.  
   **Fix:** Use existing `isCardResolved(message, "melee")` in both action guards and dependent-card synchronization.

5. **“Delete failure throws” is false as a general Foundry contract.** Both callers can pass `actor.items.has` before either deletion completes. Foundry v13 permits `delete()` to resolve `undefined` when nothing is deleted, so merely awaiting it does not authorize payment. [Foundry v13 API](https://foundryvtt.com/api/v13/classes/foundry.ClientDocument.html#delete)  
   **Fix:** Credit only after a confirmed deletion result, handle rejection, and test a cancelled/no-result deletion plus competing clients.

6. **Delete-first introduces uncompensated item loss.** In `onSellItem`, if deletion succeeds and the nuyen update fails, the item is gone without payment; the plan supplies no recovery.  
   **Fix:** Preserve the item source and restore it on failed credit, reporting any failed restoration explicitly.

7. **The sale quote becomes stale while confirmation is open.** Refund calculations precede the dialog at `sheet-actions.mjs:2776`; another client can consume ammunition/drugs or reprice the item before confirmation. Checking existence does not prevent refunding the old quantity or price.  
   **Fix:** Re-read the live item after confirmation and reconfirm if its refundable value changed.

8. **The proposed concurrent-sale test can pass despite two credits being attempted.** Two absolute nuyen writes can both read the same balance and both write `balance + refund`; the final balance then looks correct despite duplicate execution.  
   **Fix:** Assert exactly one successful credit operation and one sale message, with controlled interleaving rather than final balance alone.

9. **Team Karma serialization does not prevent overdrawing.** With one point available, two players can each request one; queued writes produce `1 → 0 → 0`, while `onDrawTeamKarma` at 3395 independently grants both actors a point. Contributions likewise burn personal capacity before confirmed success, and the proposed catch hides write failures from callers.  
   **Fix:** Have the serialized authority validate availability and acknowledge the actual committed transfer before callers change personal Karma; preserve the public boolean contract unless all callers are updated.

10. **Reordering purchase writes lengthens an existing stale-balance window.** `actor-sheet.mjs:548` snapshots nuyen before the proposed awaited flag write. Two purchases can both pass affordability and later overwrite the balance, retaining both items for one effective debit; a concurrent sale can also be overwritten.  
    **Fix:** Serialize balance-changing operations per actor through one authority and read/check the balance inside that serialized operation.

11. **Purchase rollback assumes exceptions are the only failure mode and deletion always succeeds.** Foundry document updates can return `undefined`; a cancelled charge can therefore leave a free item marked paid without entering `catch`. A rejected or cancelled rollback deletion also contradicts “the claim never survives.” [Foundry v13 API](https://foundryvtt.com/api/v13/classes/foundry.documents.Item.html#update)  
    **Fix:** Verify update and deletion outcomes, handle rollback failure explicitly, and test cancelled writes as well as thrown errors.

The purchase-hook concern itself checks out: the repricing hook at `sr2e.mjs:1230` requires changed purchase-driving system fields, so a flags-only stamp does not trigger repricing; ammo consolidation follows the block. The existing melee Quench tests only check early rejection, so I found no current test requiring synchronous successful closure. The proposed GM-only hook test still does not prove the player permission path—retain the two-client test and cover Undefended too.

The current Unreleased changelog describes Hatamoto’s correction but does **not** explicitly say `0.104.2` covers it, contrary to the plan’s wording. No files were modified.

VERDICT: REVISE

### Claude's response
Accepted 1, 2, 3+4 (isCardResolved everywhere melee is guarded), 5, 6, 7, 8, 11, and the fresh-balance re-read from 10. Partly accepted 9: serialisation plus loud errors, overdraw on simultaneous draws documented as a shortcut, because a request/acknowledge protocol needs a reliable socket reply (CLAUDE.md). Rejected the per-actor money authority from 10: purchases are human-paced, and it is a pre-existing pattern outside the five findings.

## Round 2 — Codex

The revision addresses the main melee permission issue and substantially improves sale and purchase recovery. A few concrete gaps remain:

1. **The Team Karma implementation contradicts its return contract and test.** Plan lines 97–108 specify bare `return` for invalid input, but require `changeTeamKarma(NaN)` to return `false`. Bare `return` produces `undefined`.  
   **Fix:** Return `false` explicitly from the public function; keep the socket handler’s bare return.

2. **The Team Karma test depends on the world’s existing balance.** Saving the setting and subtracting twice does not guarantee “total −2”: `_applyTeamKarmaDelta` clamps at zero (`module/sr2e.mjs:673`), so worlds starting at zero or one fail the proposed assertion.  
   **Fix:** Drain pending work, save the setting, seed it to 5, assert two concurrent decrements produce 3, and restore it in `finally`.

3. **Sale deletion errors are silently swallowed.** The proposed `live.delete().catch(() => null)` treats permission failures and database errors identically to an already-removed item, leaving the user with no explanation. The existing drug deletion veto provides its own warning (`module/drugs.mjs:1001`), but arbitrary rejections do not.  
   **Fix:** Catch deletion errors explicitly, log and notify when the item remains, and silently return only for a confirmed already-removed item.

4. **The cross-client double-sale claim still exceeds the proposed test.** Two concurrent calls in one Quench client verify one local collection and one backend connection; they do not establish the phone-plus-computer guarantee claimed in section 3. Returning a deleted document is a better check, but the plan still needs evidence that competing requests cannot both authorize credit.  
   **Fix:** Add a two-client sale check with both confirmations open before either accepts, asserting exactly one refund and one sale message.

5. **Purchase failure coverage omits the original failure being repaired.** The only proposed purchase test cancels the nuyen update; it never exercises a failed purchase-flag write or failed cleanup, despite both being central to section 5.  
   **Fix:** Parameterize the test across rejected/undefined flag writes and charge writes, and include a cleanup failure that must produce the explicit recovery error.

6. **The changelog assertion is still wrong.** `CHANGELOG.md:28` already says “the Eichiro Hatamoto II’s stats and its shotgun ranges”; the revised plan says it does not mention ranges.  
   **Fix:** Change that instruction to clarify that the existing range correction runs in migration `0.104.3`.

The Hatamoto tag history remains verified. The revised marker-aware melee guards cover the identified callers, and the existing `mine` rule is correctly accommodated by making closure cosmetic. Flags-only purchase updates do not trigger the repricing hook; ammo consolidation remains afterward. I accept the explicitly deferred broader money-concurrency and Team Karma acknowledgement work as scope limits, rather than treating them as newly solved.

No files were modified.

VERDICT: REVISE

### Claude's response
Accepted all six. The two-client sale check goes in QA-PLAN as a live check, since Quench runs in one client.

## Round 3 — Codex

No remaining blocking findings within the stated scope. The revision addresses the prior return-contract, test-isolation, deletion-error, cross-client validation, and purchase-failure coverage gaps.

Reconfirmed against the code:

- `v0.104.2` lacks Hatamoto; the proposed `0.104.3` field corrections fit the migration implementation.
- The melee marker checks cover Defend, Undefended, and dependent-card synchronization; the author/GM hook remains cosmetic.
- No existing caller or test found requires successful melee closure to finish synchronously.
- Flags-only purchase updates bypass repricing, and ammo consolidation runs afterward.

Concurrent purchases, Team Karma overdraw, and pre-outcome double defense remain explicitly deferred. Approval covers the plan; the specified Quench and two-client checks still need to pass during implementation.

No files were modified.

VERDICT: APPROVED

Converged in 3 rounds.
