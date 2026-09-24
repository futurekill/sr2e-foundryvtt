# Plan Review Log: area-effect spells + spell dialog facelift
Started 2026-09-24. MAX_ROUNDS=5.

## Round 1 — Codex

The plan needs revision. I accepted the supplied rendered-book rules; I did not independently recheck the PDF. No files were modified.

1. **Per-target counting drops caster TN penalties.** `rollSuccessTest` adds wounds, sustaining, dumpshock, MPCP overload, and centering adjustments, but the proposed `successesAtTN(dice, targetAttribute)` ignores them. A die totaling 4 incorrectly succeeds against Willpower 4 when the caster has +2 TN.
   **Fix:** Store each target’s effective casting TN, including the cast-time modifier delta, and reuse that snapshot during Karma sync.

2. **The Rule-of-Six uncertainty is already resolved by the code.** [sr2e-roll.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/dice/sr2e-roll.mjs) stores compounded values in `die.total` and explodes sixes regardless of the display TN; `attributeDice` preserves those fields. Neither `die.success` nor the first raw face supports per-target counting.
   **Fix:** Count `die.total >= effectiveTargetTN`, with tests for `[6, 2] → 8`, multiple explosions, and Rule of Six disabled.

3. **“Lowest TN” is a mechanical Karma decision disguised as presentation.** With totals `[4, 5]` against TNs 4 and 6, the existing reroll handler offers no failures, although both dice fail against the harder target. Adding an easy target changes whether the caster can spend Karma against the hard target. “Roll once” does not establish that interpretation.
   **Fix:** Specify a supported multi-TN Karma policy before implementation; until then, disable automatic area-test Karma actions and leave those adjustments to GM adjudication.

4. **Bought successes can turn a completely unsuccessful target result into a hit.** `buySuccess` requires a natural success, but checks only `state.dice[].success` at the display TN. Adding `boughtSuccesses` to every target grants successes against TNs where no die succeeded.
   **Fix:** Define and enforce natural-success eligibility per target instead of unconditionally adding the shared purchased count.

5. **The sync guard is an implementation blocker, not merely an open question.** Suppose the shared total is 3, a hard target’s stored count is 3, and its recomputed count becomes 2: the existing early comparison skips the required update.
   **Fix:** Compute the card-specific next count before the equality guard, retaining shared-total behavior for legacy and non-spell cards.

6. **Zero-success casts have no downstream cards to synchronize.** The current combat branch only executes when `spellResult.successes > 0`. A subsequently successful Karma reroll cannot update cards that were never created; similarly, omitting individual zero-success targets loses them permanently.
   **Fix:** Persist every eligible target’s result even at zero successes, with resistance disabled until that target has successes.

7. **Pool caps are not actually enforced at the casting boundary.** The dialog caps Magic Pool by **Magic**, while `rollSuccessTest` caps only by availability; `_rollSpellcast` accepts macro-supplied allocations unchanged. “Original Force and existing caps” therefore leaves conflicting behavior. Retaining `karmaDiceCap: force` after withholding also needs justification: the existing rule comment caps purchased dice by rating dice **in use**.
   **Fix:** Normalize cast/drain allocations inside `_rollSpellcast`, enforce the specified original-Force Magic Pool ceiling, and explicitly determine the reduced rating-dice ceiling for Karma.

8. **Cancellation must precede focus spending and Centering, not just the main roll.** `_rollSpellcast` currently consumes cast **and drain** focus dice before rolling Centering. Inserting placement near the existing area branch would happen after drain damage, and inserting it just before the spell test still consumes resources.
   **Fix:** Resolve and validate the centre and scene before any focus update, Centering roll, pool expenditure, or drain; abort cleanly for missing canvas, missing caster token, timeout, Escape, and scene changes.

9. **Template creation is not guaranteed for players.** The current code silently swallows creation failures. Reusing it can charge the entire cast while failing the promised template placement.
   **Fix:** Check MeasuredTemplate creation permission before commitment and provide either an authorized GM creation path or an explicit optional-template fallback that cannot abort spell resolution.

10. **Hidden-token exclusion neither implements LOS nor prevents all leakage.** Non-hidden tokens behind walls or outside perception still enter the proposed scan; public counts, names, vehicle notes, and TNs can expose them. Conversely, GM-hidden state is not a rules definition of whether a target can be affected.
    **Fix:** Separate rules eligibility from disclosure, filter against the caster’s applicable perception/LOS, and keep secret candidates and adjudication in GM-only output.

11. **Target validity remains underspecified.** “Tokens with an actor” admits `host` and `ic`; actor type alone cannot establish materialization or astral eligibility. Physical spells need eligibility filtering too, not merely a vehicle exception.
    **Fix:** Use one explicit target-eligibility function covering actor type and applicable plane, with GM adjudication where state is unavailable.

12. **The dialog plan contains two concrete regressions.** Removing `name="tn"` makes `button.form.elements.tn.value` throw. Also, the existing CSS hard-codes `-shot/-tactics/-dice` to panels 1/2/3: a two-tab Spell/Dice layout will not work simply by reusing those classes.
    **Fix:** Make TN reading conditional, add scoped two-panel selectors with unique radio IDs, and explicitly forward centre/radius options through `onCastSpell`’s enumerated `item.roll` arguments.

13. **Existing resistance-card permissions undermine “resolved cards stay frozen.”** `rollSpellResistance` applies damage but marks the message resolved only for its author or a GM. A different player defending against the caster’s card can leave it unresolved, allowing repeated resistance/damage and later Karma synchronization after resolution.
    **Fix:** Persist resolution through an authorized author/GM path and prevent repeat application before depending on the resolved guard.

14. **The proposed circle and inclusion test can disagree.** `canvas.grid.measurePath` uses grid measurement behavior; a circular MeasuredTemplate represents radial geometry. Diagonal settings can therefore produce visibly inconsistent inclusion.
    **Fix:** Use a shared geometric distance definition for both the template and target inclusion, converting scene units explicitly.

15. **The math API cannot validate its own stated contract.** `areaSpellRadius(magic, grow, shrink)` supposedly validates withholding against Force but receives no Force; separate grow/shrink inputs also permit combinations the signed UI cannot express.
    **Fix:** Prefer `areaSpellGeometry({magic, force, radiusDelta})`, returning validated radius and withholding cost from finite integer inputs.

16. **The tests miss the failure paths most likely to ship.** “Different Willpower yields different successes” is not guaranteed without deterministic dice, and a GM-only happy-path test misses permissions, disclosure, cancellations, and cross-player resolution.
    **Fix:** Add deterministic coverage for effective TNs, Karma/zero-success synchronization, cancellation before all expenditure, ordinary-player permissions, hidden output, and actual two-tab submission.

A simpler design is one authoritative area-cast state containing the shared dice and target snapshots, with dependent cards treated as views. Keep template placement optional and separate the dialog facelift from the casting changes. That reduces duplicated state without requiring a second dice engine.

VERDICT: REVISE
### Claude's response (round 1)
Accepted:
- 1: effective TN = attribute + caster delta.
- 2: count `die.total`.
- 3, 4, 5, 6: Karma post-roll actions disabled on area casts, so sync is moot. The summary card records zero-success targets.
- 7: allocations normalized in `_rollSpellcast`; pool ≤ original Force; karmaDiceCap = Force − withheld.
- 8: placement moved to `onCastSpell` before `item.roll`.
- 9: TEMPLATE_CREATE check; the template is optional.
- 10, 11: eligibility function plus `token.visible` / hidden handling; LOS left to the GM.
- 12: scoped two-tab CSS; `tn` input kept; `area` forwarded explicitly.
- 14: Euclidean geometry.
- 15: `areaSpellGeometry({ magic, force, radiusDelta })`.
- 16: deterministic stubs and cancel tests.

Rejected/deferred:
- 13 is a pre-existing resolution-permission issue; it is reported, not fixed here.
- The authoritative area-state object is replaced by an immutable summary card.
- The facelift stays in the same release, as a separate commit.

## Round 2 — Codex

The revision fixes compounded-die counting, effective-TN propagation, placement ordering, and the two-tab CSS issue. The immutable-summary approach is reasonable, but its immutability is not enforced yet. These blockers remain:

1. **Hiding Karma buttons does not disable Karma actions.** Setting `hasKarma=false` affects rendering only; `applyKarmaToTest` never checks it. A macro can still reroll or buy successes, after which `_syncDependentCards` overwrites every resistance card with the shared total while the summary stays unchanged.  
   **Fix:** Persist an explicit area-test action policy, enforce it in `applyKarmaToTest`, and exclude immutable area cards from generic synchronization.

2. **The Karma restriction also removes “Avoid an Oops.”** `hasKarma=false` hides that action alongside rerolls and purchases, although avoiding an all-ones disaster has no multi-TN ambiguity. It also unnecessarily disables ordinary Karma handling for the proposed single-TN non-combat tests.  
   **Fix:** Restrict only the ambiguous actions on multi-TN casts; preserve disaster avoidance and ordinary single-TN Karma behavior.

3. **GM casts still leak hidden tokens.** Approach §3 explicitly includes hidden tokens when the executing user is a GM, then publishes their names, TNs, and successes. The tradeoffs section contradicts this by saying GMs use non-hidden tokens. Player-client visibility also does not guarantee that another player should see the resulting names.  
   **Fix:** Define one disclosure policy and send secret target information and its resistance cards only to authorized recipients, regardless of who executes the cast.

4. **Geometry validation is only described as a warning.** The plan forwards redundant `radius`, `radiusDelta`, and `withheld` values without requiring `_rollSpellcast` to recompute them. A stale dialog or macro can supply a large radius with zero withholding, negative withholding, or invalid geometry and still reach resource consumption.  
   **Fix:** Recompute geometry from current Magic, chosen Force, and `radiusDelta` inside `_rollSpellcast`, rejecting invalid coordinates, scene, or geometry before spending anything.

5. **The non-combat TN path contradicts the shared roll algorithm.** §3 rolls against the lowest caught attribute, whereas §4 promises the typed TN. Merely displaying the typed TN would leave the actual roll, Centering, and sustained-spell success gate using the wrong number; displaying the raw typed TN also omits caster modifiers.  
   **Fix:** Explicitly branch TN selection before Centering: combat uses target attributes, non-combat uses the submitted TN, and summaries show the resulting effective TN.

6. **Existing resistance cards do not identify their target.** `renderSpellResistCard` prints caster, spell, and successes but no defender name; its tooltip tells users to select a defender even though the handler resolves the stored `targetUuid`. Several identical cards cannot reliably be matched to the summary.  
   **Fix:** Persist and render an escaped target name on every area resistance card and make its instructions match UUID-bound resolution.

7. **The dice readout will disagree with the roll.** Its formula omits totem modifiers, applies no explicit zero floor, and can show requested pool/Karma dice that the casting boundary subsequently clamps. For example, withholding all Force dice must reduce the pre-roll Karma ceiling to zero in the UI too.  
   **Fix:** Derive the preview and submission from the same allocation calculation, including totem modifiers, remaining rating dice, availability, shared budgets, and the final zero floor.

8. **The new tests bypass important behavior they claim to verify.** Stubbing `actor.rollSuccessTest` cannot verify persisted Karma restrictions, effective-TN calculation, or actual pool consumption. The list still lacks player-template denial, GM hidden-token disclosure, invalid-geometry rejection, and the fixed-TN non-combat branch.  
   **Fix:** Keep the deterministic orchestration tests, but add focused integration checks for those boundaries using the real success-test method with deterministic dice.

I accept deferring the pre-existing cross-player resolution-permission bug as explicitly documented scope; it still permits repeated damage, so disabling sync does not make that defect harmless. I also accept separate commits in the same release and do not require a new authoritative area-state object.

No files were modified.

VERDICT: REVISE
### Claude's response (round 2)
All eight points are accepted, as amendments A–G in the plan:
- The Karma restriction is enforced in `applyKarmaToTest` and the sync skips area cards. Avoid an Oops stays, and non-combat area casts keep normal Karma.
- Hidden tokens are never caught.
- Geometry is recomputed at the roll boundary.
- The TN branch is explicit.
- Resist cards carry the target's name.
- One shared `spellCastDice` function drives both the preview and the roll.
- Tests use the real dice through `CONFIG.Dice.randomUniform`.

## Round 3 — Codex

A, C, D, and E resolve their earlier blockers. Two remain, plus one allocation mismatch that needs an explicit decision:

1. **B still mistakes caster visibility for public visibility.** A non-hidden enemy visible to Player A can remain outside Player B’s vision. A GM also sees non-hidden enemies behind walls. Publishing their names and counts reveals them; token visibility also does not establish that its name is publicly displayed.  
   **Fix:** Whisper target-bearing summaries and resistance cards to the casting user and GMs by default; keep public output free of target identities, counts, and attributes.

2. **A makes non-combat summaries mutable without supplying synchronization.** Non-combat area spells retain rerolls and bought successes, but their summary still records fixed successes—including “0 — unaffected.” `_syncDependentCards` has no summary renderer, so a successful reroll leaves contradictory results. This is newly introduced summary state, independent of the deferred resistance-permission bug.  
   **Fix:** For single-TN non-combat casts, make the summary list geometric candidates only and link to the authoritative test card for TN and successes, or explicitly synchronize the summary.

3. **F’s final-floor arithmetic conflicts with the earlier base-dice floor and existing roll interface.** With all Force dice withheld, a −2 totem penalty, and two Magic Pool dice, F predicts zero dice; flooring the base first produces two. Passing F’s `total` as the base while also forwarding pool/Karma/misc options instead double-counts those additions.  
   **Fix:** Specify the exact arguments passed to `rollSuccessTest`, apply the floor at one agreed stage, and test that actual dice and expenditures match the preview when penalties exceed remaining Force dice.

Add regression cases for different players’ visibility, a non-combat Karma reroll after the summary appears, and the negative-base allocation example. The other accepted fixes and documented deferrals need not be reopened.

No files were modified.

VERDICT: REVISE
### Claude's response (round 3)
All three accepted as amendments H (whisper policy), I (candidate-only non-combat summary) and J (single floor matching rollSuccessTest), plus the regression cases in K.
