# Plan Review Log: astral combat
Started 2026-09-25 02:15 EDT. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. I verified the relevant rules against rendered printed pages 138, 147, and 148. No files were modified.

1. **Resistance routing is incomplete.** [`_resolveMeleeHit`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1634) emits a generic physical resistance button; `rollDamageResistance` uses Body, Combat Pool, and physical armor. Merely adding `realm` to the attack card does not change that downstream behavior.  
   **Fix:** Carry realm and loser UUID into a flag-backed resistance card and explicitly dispatch astral resistance, including Full Defense’s pool-success accounting.

2. **Undefended bypasses astral eligibility and targeting.** Its [handler](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2368) resolves without identifying a defender; Defend uses the selected actor instead of the existing astral card’s stored target.  
   **Fix:** Resolve and validate the intended target, ownership, and astral eligibility before either action, and bind resistance to the actual loser—including counterstrikes.

3. **Non-author resolution remains repeatable.** `_resolveMeleeHit` closes the source only for its author or GM; Full Defense instead calls `message.setFlag` unconditionally and can fail on another player’s message.  
   **Fix:** Define an authorized, persistent resolution record checked by every action, with duplicate-click protection and explicit non-author tests.

4. **Karma synchronization is underspecified.** [`_syncDependentCards`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:687) requires `testMessageId`, skips resolved cards, and does not track defense or resistance dependencies; defense immediately determines the winner.  
   **Fix:** Preserve the attack test linkage, define when each roll becomes final, and either permit Karma before finalization or explicitly close Karma actions afterward; test non-author resolution followed by attacker Karma.

5. **Zero-success attacks can lose their opposed exchange entirely.** Existing `rollAstralAttack` returns before posting a card at zero successes, preventing a defender’s counterstrike and leaving nothing for later Karma to update.  
   **Fix:** Always post the new opposed card, including zero successes, and test zero/zero and zero/positive exchanges.

6. **The proposed pool lifecycle can erase expenditure.** [`applyPool`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1037) treats saved maximum zero as unspent; deriving astral maximum zero while inactive introduces an expenditure-reset risk across state changes and saves.  
   **Fix:** Preserve expenditure independently of astral availability and test spend → leave astral → save/reload → re-enter, with replenishment only at authorized refresh boundaries.

7. **NPC support is an unresolved core requirement.** NPCData has neither `astralState` nor Astral Pool, and `rollAstralAttack` explicitly excludes NPCs; allowing the GM to operate the actor does not bypass that return.  
   **Fix:** Specify and implement NPC astral eligibility, pool schema/derivation, and attack entry points before treating NPC magicians as supported.

8. **The assumed dual-natured data does not exist for shipped critters.** For example, the [Ghoul](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/critters/Ghoul_e97578997a280d0e.json:7) records this only in biography prose; defaulting missing structured data to false rejects it before any GM TN adjustment.  
   **Fix:** Add a canonical editable dual-natured field and populate shipped critters, with a defined treatment for existing actors.

9. **Willpower/Charisma cannot be universal astral attributes.** Rendered p.148 says dual beings retain the same attributes on both planes and purely astral beings use Force or Essence; SpiritData currently derives attributes from physical profiles.  
   **Fix:** Centralize combatant-specific astral attributes and damage, distinguishing projecting magicians, dual beings, and purely astral spirits.

10. **Spirits lack a defined opposed skill path, and their damage choice is incorrectly restricted.** Step 1 searches learned skills, while existing spirit attacks explicitly use `effectiveForce`; p.147 restricts non-sentient entities, not all spirits, to Physical damage.  
    **Fix:** Specify spirit attack/defense dice using current effective Force, preserve service/depletion restrictions, and base forced Physical damage on non-sentience rather than actor type.

11. **Weapon-focus selection is too weakly modeled.** A Boolean cannot identify which focus supplies damage or distinguish its Armed Combat bonus; rendered p.138 establishes that bonus and the owner’s wielding requirement.  
    **Fix:** Select a specific eligible bonded, active, wielded focus and consistently derive skill dice and damage for attacks and counterstrikes.

12. **Rendering and legacy compatibility need explicit regression coverage.** [`renderMeleeAttackCard`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:126) assumes `weaponName` and physical melee wording; “legacy still resolves” does not verify its Karma renderer, target binding, or separation from new rules.  
    **Fix:** Define the complete astral melee-state contract, render realm-specific instructions, and test new-card Karma rerendering alongside unchanged legacy flag dispatch and resolution semantics.

VERDICT: REVISE
### Claude's response
Rewrote the plan. It now uses a separate astralMelee card with flag-backed resistance bound to the loser, target-bound Defend/Undefended, and resolves-marker records. Karma is final at the defence roll. The card posts even at 0 successes. The pool max is always derived, so the spend is preserved. NPC magicians are explicitly out of scope; dual-natured critters get a real flag, populated from the pack. The profile table covers characters, spirits and dual beings. A specific wielded focus is selected. Forced Physical applies only to non-sentient entities. Tests are expanded.

## Round 2 — Codex
The rewrite closes several earlier gaps, but these remain. Rule findings below use the rendered printed pp.147–148 inspected in the previous review. No files changed.

1. **Dual-being resistance still contradicts the stated rule.** [Line 62](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-astral-combat.md:62) specifies their Willpower, although p.148 preserves their normal attributes; their Body remains Body. Their attack damage is also unspecified by the three listed damage formulas.  
   **Fix:** Define dual-being resistance using Body and damage using their applicable physical attack profile, with tests where Body ≠ Willpower and Strength ≠ Charisma.

2. **Karma closure covers only the attacker.** Defense and resistance still produce ordinary success-test cards whose Karma actions can change results after the winner or damage is committed; Undefended never satisfies “once the defence roll is made.”  
   **Fix:** Define finalization and Karma closure for all three tests, including Undefended, and enforce closure in both rendering and the spend handler.

3. **An open defense dialog can resolve stale attacker successes.** Checking only `isCardResolved` misses attacker Karma spent while that dialog is open; the existing [manipulation handler](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:1819) explicitly compares the live successes before spending dice.  
   **Fix:** Revalidate the live attack state immediately before rolling and abort/reopen if Karma changed it.

4. **The resolution guard names the wrong card for damage application.** “Every action checks … `astralMelee`” does not define independent completion for `astralResist`; checking the parent would reject valid resistance after defense, while ignoring completion permits repeated damage. Ownership is also specified only for Defend/Undefended.  
   **Fix:** Give each resistance card its own resolved marker, in-flight guard, and loser-ownership check, with repeat-click and non-owner tests.

5. **A local guard does not prevent cross-client duplicate resolution.** The borrowed manipulation implementation explicitly documents that simultaneous resolvers on different clients can both roll and apply damage.  
   **Fix:** Either serialize resolution through one designated resolver or explicitly document this limitation and require live-state checks before each irreversible step.

6. **Busy spirits become untargetable.** The combatant table makes “not … busy” an eligibility condition, and both target actions require eligibility; that conflates permission to initiate an attack with susceptibility to an attack.  
   **Fix:** Separate astral presence/targetability from service restrictions on initiating attacks, and specify defense behavior for a busy spirit.

7. **Missing targets can produce unusable cards after expenditure.** The new flow requires a stored T-target but specifies neither a pre-roll target requirement nor handling for multiple targets; existing astral attacks allow no target.  
   **Fix:** Require exactly one valid target before rolling or spending resources, and explicitly refuse deleted targets without redirecting damage.

8. **NPC critters remain unreachable through the existing attack path.** Deferring NPC magicians is clear, but supported dual-natured NPCs still encounter `rollAstralAttack`’s character/spirit-only guard; the plan adds only an NPC checkbox, not an attack action.  
   **Fix:** Explicitly extend the actor entry guard and NPC sheet action for eligible dual-natured critters, with an NPC-initiated attack test.

VERDICT: REVISE
### Claude's response
Accepted all 8. Dual beings resist with Body and attack with their physical profile. Karma closes on all three tests at finalization, including Undefended. A beforeRoll re-reads live state. Each card has its own resolution, in-flight guard and owner check. The cross-client limit is documented. Targetability is split from the ability to attack. Exactly one target is required before spending. There is an NPC entry point.

## Round 3 — Codex (after a failed save, re-reviewed)
Round 2 addresses the earlier integration and permission gaps. Two concrete issues remain:

1. **Depleted spirits are now explicitly targetable.** The combatant table exempts targets from both busy and depleted checks, but [`_elementalBusyReason`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2388) distinguishes a busy elemental from one whose Force is spent and which has vanished. The latter would enter this flow with zero-Force attributes.  
   **Fix:** Allow busy, present spirits to be targeted; reject depleted/vanished spirits, and test those cases separately. My earlier finding concerned busy spirits, not vanished ones.

2. **Resistance finalization still depends on damage being applied.** [Lines 78–79](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-astral-combat.md:78) leave closure undefined when resistance stages damage below Light or Full Defense produces a clean miss. These outcomes must also close Karma and prevent another resistance attempt.  
   **Fix:** Finalize resistance on every committed outcome, including zero damage and clean misses; test marker persistence, repeat-click refusal, and Karma closure for both.

No files were modified.

VERDICT: REVISE
### Claude's response
Accepted both. A depleted spirit cannot be targeted, while a busy one can. Resistance finalizes on every committed outcome.

## Round 4 — Codex
Round 3 resolves both remaining findings: depleted spirits cannot be targeted, and every committed resistance outcome closes the card and Karma actions, with regression tests specified.

No remaining blocking findings within the declared scope. NPC magicians remain deferred, and the cross-client resolution race is explicitly documented. No files were modified.

VERDICT: APPROVED
Approved after 4 rounds.
