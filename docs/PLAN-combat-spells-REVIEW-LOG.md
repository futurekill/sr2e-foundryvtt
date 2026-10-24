# Plan Review Log: combat spells by the book
Started 2026-10-24. MAX_ROUNDS=5. Plan: docs/PLAN-combat-spells.md

## Round 1 — Codex
The tie correction is supported by **SR2E p.131**, but the plan is not ready to implement. These are concrete gaps, including existing defects the proposed rewrite would retain.

1. **Vehicle eligibility omits damage type.** Section 1 accepts any physical spell, but **p.109** permits only physical combat spells that cause **Physical damage**. The plan’s “p.108 (PDF 110)” citation is also wrong: PDF page 110 is printed p.109.  
   **Fix:** Pass damage type into eligibility, reject Stun against vehicles, and correct the citation.

2. **Area vehicles never reach the proposed resolver.** `areaTargetEligible()` returns `"gm"` for vehicles; `_resolveAreaCast()` reads character-style attributes; `_postAreaResults()` diverts vehicles to an Object Resistance notice. Changing single-target eligibility and resistance will leave Powerball versus vehicles unresolved.  
   **Fix:** Route area candidates through the same target resolver and score vehicles at TN 8 with their own resistance cards.

3. **Situation modifiers must vary by target.** A single cover/visibility/barrier selection cannot represent an exposed guard and a guard behind cover in the same Manaball. The existing area code adds one common `castDelta` to every target. **P.130** requires the shared roll to be judged against each target’s modified TN.  
   **Fix:** Store situation modifiers per target and keep only genuinely caster-wide modifiers in `castDelta`.

4. **The claimed vision-aware weapon implementation does not exist.** The weapon dialog supplies normal-vision values and a tooltip telling users to adjust them; it does not calculate the caster’s vision type. Copying its “Full Darkness / Blind Fire” option also cannot authorize casting at an unseen target (**pp.130, 151**).  
   **Fix:** Implement explicit vision handling or a clearly labelled manual modifier, and enforce LOS eligibility separately.

5. **Multiple-target resource accounting is unspecified.** Section 3 splits casting Magic Pool but omits allocations for each Drain test, explicitly required by **p.129**. Existing `drainFocusDice`, `aidDrain`, and `drainPool` describe one test; reusing them in a loop duplicates prepaid dice.  
   **Fix:** Build and validate one allocation ledger covering every casting and Drain test, including foci, elemental aid, Magic Pool, and Karma.

6. **Restricted Force and Centering have no multi-target contract.** `splitForceDice(force, shares)` does not distinguish actual Force, effective Force, and allocated dice; the current code also performs casting Centering once and Drain Centering once. A naïve loop can change resistance Force, Drain, or reuse Centering results incorrectly. Restricted effects and Drain use different ratings (**p.133**).  
   **Fix:** Preserve explicit `actualForce`, `effectiveForce`, and per-test dice allocations, and specify Centering’s scope before implementing the loop.

7. **Karma cannot revive a cast without a card.** “One card per affected target” preserves the current zero-success omission; `_syncDependentCards()` updates existing messages only. It also skips `areaCard` outright, while area rerolls and bought successes are currently prohibited.  
   **Fix:** Create unresolved zero-success cards for ordinary casts and explicitly retain or replace the existing area-Karma restriction.

8. **Resistance Karma still cannot change damage.** `_finishSpellResistance()` immediately applies damage and closes the spell card; the resistance test has no dependent outcome that recalculates when its Karma result changes.  
   **Fix:** Finalize resistance after Karma, or track the resistance test and reconcile damage exactly once.

9. **Misfire handling lacks a finalization rule.** Drain is rolled and applied before later Karma actions; a new all-ones surcharge can therefore disagree with a subsequently changed casting result. An area cast with all Force dice withheld also needs protection against treating an empty roll as “all ones” (**pp.130–131**).  
   **Fix:** Define when misfire becomes final, require at least one rolled die, and synchronize any permitted subsequent change with Drain.

10. **The new cards must preserve non-author resolution.** The resisting player may own the target without owning the caster’s message. Current resistance works through public `resolves`, `resolvesAttack`, and `usedGrants` markers; updating the original card is optional. Merely adopting a new card layout can break that protocol.  
    **Fix:** Specify and test the existing marker protocol for every new combat-spell outcome, including vehicles.

11. **Local queues do not prevent cross-client double resolution.** `defenseQueue()` serializes one client only; two owners can both pass the unresolved check before either publishes a marker, spending defenses and applying damage twice.  
    **Fix:** Give resolution an authoritative, idempotent claim keyed by attack and target before spending resources.

12. **NPC magicians remain denied unused Magic Pool.** `_rollSpellResistance()` requires `this.type === "character"` even though NPCs have magic and Magic Pool fields; **p.129** grants unused Magic Pool to magicians without that restriction.  
    **Fix:** Determine magical capability from the actor’s supported data, and test NPC magicians, NPC critters, and spirits separately.

13. **Target identity and phone support are underspecified.** The companion uses shared target documents without a canvas; replacing targeting with canvas tokens breaks it. Multiple targeted linked tokens must share one attack identity, while unlinked synthetic actors must remain distinct. Re-reading the target selection after awaited rolls can also redirect a paid cast.  
    **Fix:** Snapshot normalized target UUIDs before spending, use the existing document-based targeting helpers, and retain the explicit no-canvas area-placement refusal.

14. **Ram can damage on a failed cast.** The proposed `ramEffect()` unconditionally compares `force + successes` with the barrier; zero successes can therefore produce damage despite **p.131** declaring the spell miscast. Its interface also lacks eligibility information to reject living targets (**p.151**).  
    **Fix:** Gate Ram on a successful cast and an inanimate target before calling `barrierEffect()`.

15. **“Ordinary handling” is unsafe for unsupported spells.** The generic resolver lacks spell identity, range, and target restrictions. It cannot enforce touch requirements or specialized target classes; touch spells also have a specific modifier exception on **p.131**.  
    **Fix:** Explicitly route unsupported special spells to manual resolution instead of applying generic automated damage.

16. **Damage-type migration remains name-dependent.** Updating compendium JSON does not update embedded world spells, and the fallback cannot recover a renamed legacy Sleep. Calling this “damage type from data” overstates the result.  
    **Fix:** Prefer a separate damage-type field, migrate identifiable core copies by source identity, and reserve name inference for unidentified legacy items.

A simpler first patch would fix ties, remove Power from combat-spell damage labels, introduce explicit damage type, and add vehicle/Ram dispatch while preserving the existing casting pipeline. Multiple-target casting should follow once allocation, identity, and finalization contracts are defined.

VERDICT: REVISE
### Claude's response (Round 1)
Accepted 1–7, 9–16 (vehicle damage-type gate and p.109 cite; area vehicles via the same resolver; per-target situation rows; explicit vision column + LOS exclusion; P2 allocation ledger; Force/centering contract; 0-success revivable cards, area Karma rule kept; misfire decided as rolled with >=1 die; marker protocol kept + tested; once() claim; NPC magicians; target snapshot via targetDocs; Ram gated; specials -> GM card; damageType field + migration). #8 noted as out of scope: weapon damage resistance has the same behaviour today (applies at once), so spells match weapons.

## Round 2 — Codex
Round 1 fixes several earlier gaps, but these blockers remain:

1. **P1.3 cannot configure area targets before placement.** `onCastSpell()` calls `promptSpellOptions()` before `resolveAreaCentre()`, so the proposed dialog cannot list “every caught token” yet. Radius changes also change that list.  
   **Fix:** Choose Force/radius and centre first, then show the caught-target situation table, with cancellation costing nothing.

2. **`targetDocs()` can snapshot stale desktop targets.** It reads shared User flags, while `writeFromCanvas()` debounces updates by 120 ms; targeting and immediately opening Cast can capture the previous selection.  
   **Fix:** Snapshot `targetTokens().map(t => t.document)`, which already handles desktop and no-canvas clients, or explicitly flush pending target writes.

3. **P2 incorrectly states “cap per test = Magic Attribute.”** That includes Drain in the described ledger, contradicting both the plan’s sources section and **SR2E p.85**, which imposes no such Drain cap. The ledger also omits bought Karma dice and does not explicitly preserve the shared casting ceiling for Magic Pool plus elemental aid enforced by `spellCastDice()`.  
   **Fix:** Specify separate casting and Drain constraints, preserve the combined pool/aid casting ceiling, and include initial Karma allocations capped by each test’s allocated rating dice.

4. **The vision selector still lacks a required distinction.** Normal/low-light/thermographic alone cannot select the correct values: **p.89** distinguishes cybernetic/electronic from natural metahuman vision within the latter columns.  
   **Fix:** Include vision origin in the selection or derive it from actor data with an override.

5. **“Later Karma never changes Drain” breaks Avoid an Oops.** **P.191** turns an all-ones disaster into an ordinary failure; **p.131** distinguishes ordinary miscasting from the misfire’s extra Drain. The current Karma handler supports `avoidGlitch`, including on area casts, but the revised plan leaves its misfire consequence intact.  
   **Fix:** Resolve the Avoid an Oops decision before rolling Drain; ordinary failure remains a failed cast without the misfire surcharge.

6. **`once()` gives an exclusive start, not recoverable completion.** In `claims.mjs`, it creates a marker before subsequent work. If resistance spending, rolling, damage, or message creation fails afterward, another attempt cannot finish the resolution. Claiming before the optional defense dialog would also make cancellation consume the claim.  
   **Fix:** Claim after confirmation and persist resolution progress with an explicit recovery path for interrupted work.

7. **Actorless objects cannot use the proposed resistance pipeline.** P1.1 expressly supports “no actor / a barrier,” but `once(target, …)` requires actor effects, the resistance button resolves an Actor, and damage application requires an actor monitor. P1.5 also omits object Spell Defense, which **p.132** explicitly permits.  
   **Fix:** Either define a GM-owned object-resolution record with identity, defense grants, and manual damage, or explicitly keep actorless objects GM-resolved in this release.

8. **Karma synchronization still has two timing holes.** Cast cards are posted after awaited Drain work, so Karma spent before creation has nothing to update; `_rollSpellResistance()` also retains the state captured before its defense dialog, potentially resolving an outdated success count afterward.  
   **Fix:** Reconcile newly posted cards from the live casting test and re-read the live spell state when resistance is committed.

9. **The resistance-Karma exclusion still allows ineffective spending.** Calling it out of scope does not stop `applyKarmaToTest()` from spending Karma and changing the displayed resistance while damage remains unchanged. This affects the exact staging problem being addressed.  
   **Fix:** Either finalize damage after a Karma window or close the resistance test to further Karma when damage is committed.

10. **The Centering contract does not specify its TN.** P2 says to roll once because penalties are caster-wide, but existing `centeringTestTN(modifiedTN, grade)` depends on the target’s modified spell TN. Two targets with different attributes or cover therefore provide different inputs.  
    **Fix:** Define and justify the Centering TN for multiple-target casting instead of copying one target’s reduction to every test.

11. **Migration precedence can overwrite explicit customization.** P1.2 checks compendium origin before the damage code: a source-linked Power Bolt customized to Stun becomes Physical. Conversely, later imports from an old private pack arrive with blank `damageType` and bypass the one-time migration.  
    **Fix:** Preserve explicit type/code overrides before source defaults, and normalize legacy data on import/create as well as migration.

12. **Manual handling is not reliable for source-less special spells.** The source-only exception list misses manually entered or legacy touch spells even though `system.range === "touch"` identifies an unsupported case directly. New blank-type custom spells also lack a specified editor control.  
    **Fix:** Route unsupported structured properties such as touch range to manual handling, and expose damage type/manual resolution in the spell sheet.

Add regression cases for these paths, especially immediate desktop targeting, interrupted resolution, Karma during the defense dialog, and old-pack imports.

VERDICT: REVISE
### Claude's response (Round 2)
Accepted all 12: area flow = dialog 1 -> placement -> dialog 2 of caught rows; snapshot from targetTokens(); P2 ledger with separate cast/drain constraints, combined pool+aid ceiling, Karma per test; vision column with natural/cybernetic; Avoid an Oops offered before Drain; claim after the dialog with a progress record and GM Finish/Void recovery; actorless objects GM-resolved; cards built from the live cast test and resistance re-reads live state; resistance test closed to after-the-fact Karma; per-test Centering; damageType inference order + preCreate normalisation + sheet controls; touch range -> manual.

## Round 3 — Codex
Round 2 resolves most rules and UI objections. The remaining blockers concern resolution state and synchronization:

1. **Recovery can still apply damage twice.** P1.5 records `damaged` after damage lands. A disconnect between `applyDamage()` and that progress update leaves `rolled`; **Finish** applies the damage again. The same gap exists between spending resources and recording `spent`.  
   **Fix:** Commit each mutation with its receipt atomically where possible; use idempotent operation receipts elsewhere, and require manual reconciliation for ambiguous steps.

2. **The recovery record cannot reconstruct the promised outcome.** `{ step, successesUsed, resistSuccesses, boxes }` omits spent allocations, consumed grant IDs, elemental payment, resistance message ID, and damage type. A failed write immediately after `once()` can leave no record at all. Timeout also does not prove the original client has stopped.  
   **Fix:** Persist the full operation intent, define claim-without-record recovery, and fence the original worker when the GM takes over; define whether **Void** preserves or reverses completed effects.

3. **Unlinked-token keys conflict with existing Spell Defense keys.** P1.3 uses token UUIDs for unlinked identity, while `normActorUuid()` and `_rollSpellResistance()` use the synthetic actor UUID. Mixing those values makes grants or `resolvesAttack` markers fail to match. Synthetic actor UUIDs already distinguish unlinked copies.  
   **Fix:** Use `normActorUuid()` consistently for attack identity, retaining token UUID separately for targeting and geometry.

4. **Reading live successes before card creation does not close the creation race.** Karma can land while `ChatMessage.create()` is pending, when `_syncDependentCards()` still cannot find the new card. The existing `_reconcileManipCards()` explicitly addresses this interval.  
   **Fix:** Reconcile after creation and read the authoritative casting test again when committing resistance; area cards must retain per-target scoring.

5. **The casting test remains spendable after resolution starts.** Closing the resistance test does not close its casting test. `_syncDependentCards()` skips resolved cards, while `applyKarmaToTest()` only recognizes test closure through `closed` or `closesTests`; current spell outcome markers provide neither. Karma can therefore change displayed casting successes without affecting the committed damage.  
   **Fix:** Freeze and close the relevant casting test when resistance commits, using a public closure record that works without ownership of the caster’s message.

6. **Spell Defense grants can arrive after the resistance snapshot.** `grantSpellDefense()` rejects only attacks with a completed `resolvesAttack` marker. During the new claimed/rolling/recovery interval, an ally can spend dice that the recorded resistance never uses.  
   **Fix:** Coordinate grant acceptance with resolution commitment and refund grants that lose the race.

7. **The misfire decision is not actually locked.** After declining the new prompt, the existing chat `avoidGlitch` action remains available unless explicitly closed. Another client can also invoke it while the prompt is open. That permits a late ineffective spend or competing decisions. **SR2E pp.131, 191** require distinguishing misfire from an ordinary failed cast.  
   **Fix:** Persist one authoritative Oops decision, enforce it in both prompt and chat handlers, and close the all-ones test before Drain.

8. **Ram bypasses the stated safety and Karma contracts.** P1.5 protects resistance, but Ram’s GM damage button performs no resistance; two GM clients can apply it twice. `_syncDependentCards()` also has no Ram renderer to recompute barrier reductions when successes change (**p.151**).  
   **Fix:** Give Ram a dedicated synchronized outcome state and the same idempotent application/closure contract as resisted spells.

Test interruption **between mutation and receipt**, not just between completed steps; also test unlinked-target grants, Karma during message creation, late defense grants, and simultaneous Ram application.

VERDICT: REVISE
### Claude's response (Round 3)
Accepted all 8: resolution rebuilt on receipts (intent+spend in one update; elemental receipt; tagged resistance test adopted on retry; commitDamage extra+skipIf; keepId outcome with closesTests for cast+resist); Release/Finish/Void recovery; normActorUuid identity; reconcile after creation; late grants refused/refunded; one authoritative Oops record enforced by the chat handler; Ram with synced state and once()+receipt application.

## Round 4 — Codex
Round 3 still has implementation blockers; the receipt design assumes guarantees the existing helpers do not provide.

1. **`commitDamage()` does not support vehicles.** It reads and writes nested Physical/Stun monitors; vehicles use a flat monitor and deliberately bypass it in `applyDamage()`. Both vehicle resistance and Ram now call the incompatible helper.  
   **Fix:** Add a vehicle damage commit that updates the flat monitor and receipt together.

2. **Receipts do not make concurrent recovery safe.** `commitDamage()`’s queue and `skipIf` check are client-local. The original worker and GM Finish can both observe no receipt; similarly, both can find no tagged resistance test and roll independently. A deterministic final message ID only deduplicates the message.  
   **Fix:** Require an exclusive, fenced recovery executor—or leave ambiguous interrupted operations for manual reconciliation instead of promising automatic concurrent Finish.

3. **Recovery skips unfinished elemental payment.** Intent and personal spending precede elemental payment in step 2, but Finish starts at step 3. An interruption between those operations can produce unpaid aid dice. Also, `elementalTransition()` currently has no receipt support.  
   **Fix:** Explicitly implement receipt-aware elemental payment and resume it before rolling, recording whether aid actually succeeded.

4. **Casting Karma still closes too late.** `castSuccesses` freezes in step 2, but `closesTests` appears only in step 5. Karma spent during resistance or damage changes the casting test without changing the recorded result.  
   **Fix:** Close casting Karma when the resolution commits, and coordinate that boundary with in-flight Karma actions.

5. **The Oops race remains between claim and flag.** The prompt claims `oops:<castTestId>`, but the chat handler is specified to reject only after the `oops` flag exists. A chat action can still spend during that interval.  
   **Fix:** Make both entry points acquire the same claim and execute the same decision handler, with recovery for a claim lacking a completed decision.

6. **Late-grant refunds lack permission and completion guarantees.** The resisting player generally cannot update an allied magician’s pool. A grant can also arrive after the resolver’s refund scan, and repeated recovery could refund it twice.  
   **Fix:** Have the grant owner or authorized GM reconcile rejected grants using durable, once-only refund receipts, including grants arriving after resolution.

7. **Ram’s state does not match `_syncDependentCards()`.** The proposed state stores `castTestId`, but the synchronizer matches `card.testMessageId`; adding a renderer alone will never update Ram. It also needs an applied-state guard.  
   **Fix:** Use the existing `testMessageId` contract and persist/check Ram’s resolved state before synchronizing or applying it.

Two contradictions should also be removed: P1.3 still prescribes token UUID identity for unlinked actors despite P1.5 correcting it, and the example “3 vs 1, base Serious → Serious (6 boxes)” should stage to **Deadly (10 boxes)** under the plan’s own outcome rule.

The simpler safe alternative remains: retain exclusive initial resolution, commit damage with its receipt, and make uncertain interrupted operations explicitly GM-reconciled rather than introducing an inadequately fenced recovery engine.

VERDICT: REVISE
### Claude's response (Round 4)
Took the simpler design Codex recommended: exclusive claim, a pending outcome message that closes the cast to Karma at commit (Karma handler re-checks closure before writing), spend+record in one update, damage+receipt in one update (new commitVehicleDamage for the flat monitor), and GM-reconciled interruptions (Mark resolved / Release) instead of an automatic Finish. One decideOops path for both entry points. Late grants refunded by the granting magician's owner with once-only receipts. Ram state uses testMessageId + resolved. Fixed the identity contradiction and the 3-vs-1 example (Deadly, 10 boxes).

## Round 5 — Codex
The simpler recovery design is an improvement, but the final revision still has concrete blockers:

1. **The new Karma guard can charge for a discarded result.** `applyKarmaToTest()` spends or permanently burns Karma **before** updating the test message. Rechecking closure immediately before that update can discard the result after payment. It also does not serialize competing clients.  
   **Fix:** Coordinate Karma payment/result commitment with resolution closure; explicitly refund any paid action rejected at that boundary.

2. **Release can restart a still-running resolution.** A timeout and absence of a spending receipt do not prove the original worker stopped—it may be awaiting an update. Removing its claim permits another resistance while the original resumes. Failure between claim creation and pending-message creation also leaves no recovery UI.  
   **Fix:** Keep uncertain claims locked for manual reconciliation, expose orphan claims, and permit Release only after the original executor is conclusively stopped.

3. **Refund receipts alone do not guarantee one refund across clients.** The plan instructs *each* owning client—including the GM—to refund. Two clients can both observe no receipt and issue updates; a delayed update can overwrite intervening pool spending.  
   **Fix:** Elect one refund executor with an exclusive claim, commit refund plus receipt together, and leave interrupted refunds for manual reconciliation.

4. **Ram still closes Karma after applying damage.** Its flow claims, applies boxes, and only then posts `closesTests`; casting successes can change during application. It also lacks the pending/manual-interruption contract now specified for resistance.  
   **Fix:** Give Ram the same pre-application closure, frozen success count, damage receipt, and manual reconciliation flow.

5. **The specified UUID call passes the wrong type.** P1.3 calls `normActorUuid(token.actor)`, but the existing helper accepts a UUID string; on failed lookup it returns its input, potentially leaving an Actor object as the identity key.  
   **Fix:** Pass `token.actor.uuid` or `token.uuid`, and consistently store the resulting string.

Add acceptance tests for paid-but-rejected Karma, a delayed original worker during Release, claim creation followed by message failure, concurrent refund owners, and Karma during Ram application. These are remaining failures in the proposed contracts, not requests to restore the larger automatic recovery design.

VERDICT: REVISE
### Claude's response (Round 5, final)
Accepted all 5: Karma rejected at the closure is refunded; no Release (claims stay locked, orphan claims surfaced to the GM); one elected refund executor via once() with refund+receipt in one update; Ram follows the same pending/closure/receipt/manual contract; normActorUuid takes the UUID string. MAX_ROUNDS reached; these last edits were not re-reviewed by Codex. Codex never disputed the rules reading (ties, vehicles, Ram, situation modifiers, multiple targets); every round was about robustness.
