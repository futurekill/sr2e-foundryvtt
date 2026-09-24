# Plan Review Log: damaging manipulation spells
Started 2026-09-24. MAX_ROUNDS=5.

## Round 1 — Codex

Findings below use your verified rule excerpts and the repository code; I did not independently render the PDF.

1. **The staging test contradicts the rule.** Step 7 expects four successes to produce M → S; two increases produce **M → D**.  
   **Fix:** Expect M for 1 success, S for 2–3, and D for 4+, using existing `stageLevel(level, netToSteps(successes))`.

2. **The parser’s Power is discarded.** Step 1 supports `(F+n)X`, but step 3 always posts Power = Force, so `(F+2)M` silently loses two Power.  
   **Fix:** Populate the card’s Power and base Power from `manipulationDamage(...).power`.

3. **Vehicle reuse changes the entire resistance procedure.** `actor.mjs:1927` forwards only `basePower` and `damageType`; the vehicle method ignores `half_impact` and attacker successes, reduces the damage level, checks armor penetration, and uses Power − Body − Armor. Routing exists, but correctness for these spells is not established.  
   **Fix:** Explicitly verify and specify the vehicle interaction before enabling it; otherwise retain GM adjudication for vehicles.

4. **Frozen cards make normal Karma spending ineffective.** `_syncDependentCards` cannot update these HTML cards; rerolls change neither staged damage nor the complete-miss threshold, and a zero-success cast has no card to update at all. Matching an existing weapon limitation perpetuates it.  
   **Fix:** Store linked damage-card state and synchronize unresolved cards, including creating cards when Karma turns failure into success.

5. **Whisper recipients are not authorization checks.** The damage handler at `sr2e.mjs:2013` never checks defender ownership; the caster receives every area card and can invoke resistance for actors they cannot update. Conversely, target owners need not own the message to use the current handler.  
   **Fix:** Require defender ownership or GM status before rolling, and test caster, defender-owner, and GM clients separately.

6. **Whispered inputs produce public outputs.** `rollDamageResistance` posts resistance results and damage messages without carrying the originating whisper audience, exposing target identity and outcome.  
   **Fix:** Pass the intended audience through resistance rolls and their result messages.

7. **Flame Bomb’s complete-miss policy is unspecified.** Single-target cards explicitly carry attacker successes, but area cards merely say “each with its own Resist Damage button”; existing blast rows deliberately omit that attribute. Copying either path silently chooses a different rule.  
   **Fix:** Explicitly specify and test whether Flame Bomb carries `attackerSuccesses`, supported by the spell’s ranged-combat instruction.

8. **“Same base TN” does not establish “same final TN.”** The plan acknowledges situation modifiers such as cover, then assumes every area target shares one adjusted TN without explaining target-dependent circumstances.  
   **Fix:** Establish whether modifiers apply to the blast’s aim point or individual victims; if individual, score the shared dice per target and revisit Karma handling.

9. **Single-target capture happens too late.** Reading the caster’s T-target after drain allows targeting changes during intervening dialogs to redirect an already-rolled spell.  
   **Fix:** Snapshot the single target before the first awaited roll, matching the area path.

10. **Migration registration is missing from the concrete steps.** The empty-value guard correctly avoids the documented schema-default trap, but an entry at an already-stamped version never runs.  
    **Fix:** Register a new migration version above the shipped stamp and test schema-cleaned world, embedded, and unlinked-token items through the runner.

The half-Impact extraction and reuse of existing staging helpers are sensible. The unsupported vehicle assumption and stale Karma behavior are the strongest blockers.

VERDICT: REVISE
### Claude's response (round 1)
Accepted 1,2,3 (vehicles → GM),4 (flag-backed synced cards, posted even at 0 successes),5 (owner/GM check on every resist-damage button),7,8 (aim-point TN, stated),9,10. Rejected 6: resolution output stays public like every other attack; the whisper policy covers pre-resolution disclosure. See amendments A–J.

## Round 2 — Codex

F is an explicit visibility policy; I accept it and withdraw that objection. A–C, E, G, I, and J address the earlier findings. Remaining issues:

1. **D’s permission gap defeats its sync guarantee.** A target owner can apply damage but cannot mark the caster-authored card resolved; subsequent caster Karma then updates an already-resolved attack and leaves it clickable (`actor.mjs:2865`, `_syncDependentCards`).  
   **Fix:** Provide an authorized resolution acknowledgment or require GM resolution for these cards until that exists.

2. **D needs a resolution guard, not merely a flag write.** The shared damage handler never reads `manipDamage.resolved`; repeated clicks can apply damage again, and canceling the resistance dialog returns no result.  
   **Fix:** Check authoritative card state, prevent concurrent clicks, remove the button after successful resolution, and leave canceled attempts unresolved.

3. **Karma during drain still produces stale cards.** The casting test appears before drain finishes; spending Karma then finds no dependent cards, and later posting from the original `spellResult.successes` restores the obsolete count.  
   **Fix:** Reconcile newly posted cards against the casting message’s current test state after creation, with a regression test for Karma spent during drain.

4. **C’s vehicle exclusion can be bypassed through an untargeted card.** Selecting a vehicle before clicking an untargeted Resist button still reaches `rollVehicleDamageResistance`; ownership checking does not prevent this.  
   **Fix:** Enforce manipulation-specific defender eligibility in the click handler as well as during card creation.

5. **A deleted snapshotted target redirects damage.** `resolveCardDefender` falls back to the selected token or assigned character when a nonempty UUID no longer resolves, potentially damaging the wrong actor.  
   **Fix:** For manipulation cards, abort on an unresolved nonempty target UUID; allow fallback only when no target was originally recorded.

6. **H presents an adjudication choice as a verified rule.** Base TN 4 alone does not establish that situation modifiers apply exclusively to the aim point; the per-victim hint acknowledges incomplete handling.  
   **Fix:** Label the single-TN approach explicitly as the automation’s limitation and require GM adjudication where victim-specific modifiers change results.

VERDICT: REVISE
### Claude's response (round 2)
All six accepted as amendments K (resolver-authored marker message), L (handler guards), M (current total at creation) and N (aim-point TN relabelled as a limitation).

## Round 3 — Codex

K–N address the earlier permission, targeting, and adjudication concerns. Two resolution races remain:

1. **L prevents double clicks only on one client.** A defender and GM can both open resistance before either posts K’s marker; both pass the guards and can apply damage.  
   **Fix:** Serialize each card’s resolution through one designated resolver, with a shared claim established before opening resistance.

2. **Karma can change damage while resistance is open.** The handler captures level and attacker successes before awaiting the dialog; `_syncDependentCards` can then update the card, but resistance still applies the old damage and complete-miss threshold before marking it resolved.  
   **Fix:** Version the attack state and revalidate it before spending resistance dice or applying damage; restart resistance if the casting result changed.

Add regression coverage for simultaneous resolver clients and caster Karma spent during an open resistance dialog.

VERDICT: REVISE
### Claude's response (round 3)
Accepted 2 as O (a beforeRoll revalidation hook in rollDamageResistance). Rejected the shared claim in 1 (P): it needs a socket relay, which is documented as not delivering at this host. O shrinks the race to an instant, which matches all existing attack cards; documented.

## Implementation review 1 — Codex

The implementation still has three correctness gaps and missing integration coverage.

1. **[P2] The local double-click lock is acquired too late.** [sr2e.mjs:2044](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2044) checks the set, awaits target resolution, then adds the ID at line 2098. Two handlers can pass the check before either acquires the lock; this exceeds P’s accepted cross-client limitation.  
   **Fix:** Acquire the lock before the first `await`, and wrap all subsequent validation and resolution in `try/finally`.

2. **[P2] Karma revalidation can approve stale damage.** Damage level is read from the button before target resolution, but `clickedSuccesses` is read from the message afterward ([sr2e.mjs:2097](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2097)). If the card updates between those reads—or its DOM is awaiting rerender—the comparison accepts the new success count while resistance uses the old level and threshold.  
   **Fix:** Snapshot authoritative `manipDamage` state before awaiting anything, derive all resistance inputs from that snapshot, and compare against that same snapshot before rolling.

3. **[P2] Flame Bomb caches successes across asynchronous card creation.** [item.mjs:1725](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1725) reads the total once outside the loop. Karma spent after the first card appears can update existing cards while later cards are created with the old count and remain stale. This violates amendment M.  
   **Fix:** Read current successes for each card and reconcile the completed batch against the latest casting-test state.

4. **[P2] Quench does not exercise the promised handler regressions.** [sr2e-quench.mjs:3953](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:3953) directly calls resistance with a constant `beforeRoll` callback. It never tests the real callback, clicking twice, deleted targets, vehicle fallback, ownership, Karma during drain/dialogs, or a resolution marker arriving before confirmation. The outcome test also randomly covers only one outcome branch.  
   **Fix:** Exercise rendered buttons with controlled asynchronous boundaries and deterministic tests for all three outcome markers, cancellation, and failed revalidation.

5. **[P3] Promised fallback guidance is absent.** An unparseable manipulation damage code still silently bypasses damage posting, and neither the dialog nor damage card explains the manual Spell Defense handling promised by the plan.  
   **Fix:** Add the unsupported-code GM notice and the Spell Defense/misc-dice hint.

The three outcome messages are correctly tagged, and cancellation/revalidation exits precede rolling. I found no regression in the supported ballistic/Impact armor calculations or the intended weapon ownership restriction.

Release check: `system.json` remains **0.94.0** while the migration is **0.95.0**, so local world loads repeatedly consider it pending until the version advances. Live Quench remains unverified; the reported 844 unit passes do not cover the handler issues above.

VERDICT: REVISE
## Implementation review 2 — Codex

The handler fixes look correct: the lock and authoritative snapshot precede every `await`, and the new Quench cases exercise the real resistance path. Two reconciliation issues remain:

1. **[P2] Reconciliation can rewrite resolved cards.** [item.mjs:1761](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1761) checks only `st.resolved`, ignoring K’s outcome markers. A player can resolve an early Flame Bomb card while later cards are posting; subsequent reconciliation then changes that settled card’s damage. Single-target reconciliation also writes the original `resolved:false` state without checking resolution.  
   **Fix:** Use `isManipCardResolved(msg)` in both reconciliation paths and preserve the current card state when updating.

2. **[P2] The reconciliation loop can overwrite newer Karma results.** `finalSuccesses` is captured once before awaiting multiple updates. Another Karma spend during that loop can synchronize cards to a newer total, after which reconciliation writes the older total back onto later cards.  
   **Fix:** Read the current casting total for each reconciliation update and serialize reconciliation with Karma-driven updates.

Add controlled creation/reconciliation tests for an outcome marker and a second Karma spend arriving mid-batch; the current live tests do not cover these cases.

Minor remaining deviation: the unsupported-code notice is bypassed for area spells because the `isArea` branch runs first.

I found no additional weapon-resistance regression. The reported live passes are useful evidence; the unrelated notification errors and planned release-version bump are not blockers here.

VERDICT: REVISE
## Implementation review 3 — Codex

The previous blockers are addressed: both paths share reconciliation, honor resolution markers, preserve current card state, and reread successes per update. The area notice and Quench hook timeout are also fixed.

One nonblocking correction: the helper’s “never” guarantee is too strong—three retry passes are bounded reconciliation, not atomic serialization. Describe it accordingly.

The reported 18/18 clean batch results support approval; I have not independently rerun Foundry.

VERDICT: APPROVED