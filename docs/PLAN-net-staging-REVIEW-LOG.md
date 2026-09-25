# Plan Review Log: net-success damage staging
Started 2026-09-24 22:50 EDT. MAX_ROUNDS=5.

## Round 1 — Codex
The net-staging formula is sound, but the plan leaves several integration failures unresolved.

1. **Complete-miss and staging use different attack totals.** [The handler](module/sr2e.mjs:2159) reads static `data-attacker-successes`; the plan updates only `stageVs`. An attack raised by Karma from 2 to 4 successes still completely misses against 3 Combat Pool successes.
   **Fix:** Resolve one attack-success snapshot and use it for both comparisons, retaining a separate flag for complete-miss eligibility.

2. **“Live at resist time” is actually live at dialog opening.** [Resistance](module/documents/actor.mjs:2084) awaits user confirmation; Karma spent while that dialog is open invalidates the captured total. The manipulation path already handles this with `beforeRoll`.
   **Fix:** Reuse the snapshot/revalidation guard before spending dice, and define when the attack becomes settled.

3. **Blast geometry and damage can use different versions of the attack.** [Scatter](module/sr2e.mjs:1880) uses the supplied static successes, while proposed resistance buttons read live successes later. Karma can therefore strengthen a blast without correcting its landing point or affected targets; successive targets can also face different totals.
   **Fix:** Read and freeze one success snapshot when resolving the blast, using it for scatter and every target’s staging.

4. **The shotgun producer chain is incomplete.** The plan mentions carrying a test-message ID on the blast button, but [the spread launcher](module/documents/item.mjs:931) and [its click handler](module/sr2e.mjs:2212) also need that plumbing.
   **Fix:** Explicitly cover item launcher → resolver arguments → per-target row for both area paths.

5. **Vehicle dispatch discards the new option.** [The forwarding call](module/documents/actor.mjs:2025) passes only `basePower` and `damageType`; modifying the vehicle method alone leaves ordinary vehicle targets on legacy staging with newly unstaged input.
   **Fix:** Forward `stageVs` and any resolution-validation options through the vehicle branch.

6. **Vehicle Light immunity loses the weapon’s printed rating.** The proposed pre-staging level includes burst bonuses, so a printed Light weapon firing a burst becomes Moderate and bypasses the plan’s own “weapons rated as Light” rule without a called shot.
   **Fix:** Carry printed damage level and called-shot status separately; evaluate immunity from those, then apply the prescribed modifiers and net staging.

7. **Manipulation explicitly retains the same defect.** [Its dedicated consumer](module/sr2e.mjs:1812) stages up by attacker successes before calling ordinary resistance, reproducing C1’s independent-rounding error. “Has its own path” does not establish different staging semantics; the code describes it as ranged combat.
   **Fix:** Pass its base level and guarded success snapshot through net staging, or explicitly document and justify this remaining defect as deferred scope.

8. **Karma cannot rescue an initially missed direct attack.** [Damage-card creation](module/documents/item.mjs:947) requires initial successes greater than zero. Rerolling zero successes into a hit creates no resist button for the proposed live lookup to update.
   **Fix:** Persist an attack card for initial misses and activate its damage action when Karma produces a hit.

9. **Legacy handling is underspecified across two generations of area cards.** Existing resist rows contain staged levels, but existing Blast/Spread launchers contain base levels. Clicking an old launcher after upgrading would produce new net-staging rows, contradicting the blanket promise that legacy cards retain old behavior.
   **Fix:** Specify compatibility separately for launcher cards and resist rows, using an explicit format/version marker where old behavior must persist.

10. **Missing test messages need an explicit fallback.** `testTotalSuccesses({})` returns zero; a deleted or unavailable source message must not silently erase the attack successes.
    **Fix:** Require valid test state before using the live total; otherwise retain the finite stored snapshot, preserving absent versus zero attributes.

11. **The proposed integration test has an ambiguous expected result and misses the risky branches.** A burst from a base-M weapon starts at S, so 4 versus 3 should yield S, not M. One burst test also cannot detect dropped vehicle options, stale complete-miss totals, or broken area-card propagation.
    **Fix:** Specify a base-L burst fixture for the M expectation, and add focused integration cases for vehicle ordering, both area paths, legacy cards, Karma during dialogs, missing messages, and complete-miss eligibility.

12. **Resistance UI would still teach the old rule.** [The dialog](module/documents/actor.mjs:2110) says every two defender successes reduce damage, even when the proposed net path requires beating the attacker first.
    **Fix:** Show the captured attacker total and net-staging explanation on new cards while retaining legacy wording for legacy resolution.

A simpler alternative is to ship net staging with immutable attack snapshots first, then handle live Karma through the existing dependent-card machinery. [That machinery already exists](module/documents/actor.mjs:687); rejecting it as extra moving parts overlooks the infrastructure already solving related lifecycle problems.

I found no separate mounted-weapon producer: both vehicle firing entry points delegate to `weapon.roll(...)`. The concrete vehicle omission is the resistance dispatch. No files were modified.

VERDICT: REVISE

### Claude's response
Took Codex's simpler alternative: immutable snapshots, no live read. That makes 1, 2, 3 and 10 moot. Accepted 4 (both launchers enumerated), 5 (vehicle forwarding), 6 (rated level + called shot carried separately), 7 (manipulation is included), 9 (a format marker on launchers and rows), 11 (single-shot fixture, more cases) and 12 (dialog wording). Point 8 (Karma turning a miss into a hit) predates this change; it is logged as a follow-up with live sync.

## Round 2 — Codex
The snapshot approach closes the main live-success races, but these gaps remain:

1. **Manipulation bypasses the legacy-format guarantee.** The shared handler calls `resistManipDamage(message)` before ordinary attribute processing ([module/sr2e.mjs:2124](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:2124)). Changing that function unconditionally makes existing, unmarked manipulation cards resolve differently from their displayed staged damage.
   **Fix:** Persist a staging version in manipulation flags and branch both rendering and resolution on it, preserving unversioned cards.

2. **Vehicle metadata stops at the direct-card producer.** Blast and spread rows can target vehicles, but the plan supplies `ratedLevel` and `calledShot` only for direct attacks; their new vehicle path therefore lacks inputs needed for its immunity decision.
   **Fix:** Define and propagate rated level and called-shot status through both launcher chains, including explicit defaults where called shots do not apply.

3. **The special-ammunition exception has no implementation input.** Step 5 promises “unless called shot / special ammo,” then evaluates only `ratedLevel + calledShot`; qualifying ammunition can never trigger the stated exception.
   **Fix:** Specify the qualifying ammunition rule and carry an explicit eligibility value, or explicitly defer that exception instead of claiming it is implemented.

4. **Pre-staging saturation is unspecified.** “Printed level + burst levels + called shot” can exceed D, while `stageByNet` caps only its positive-net branch. An uncapped base can produce an invalid index on a tie or excess damage when the defender wins.
   **Fix:** Explicitly cap the modified base at D before vehicle reduction and net staging, with tests for above-D modifier sums and tied/negative nets.

5. **The vehicle test does not prove forwarding works.** A Light-rated burst exits at the immunity check, so it passes even if `stageVs` never reaches vehicle resistance.
   **Fix:** Add an eligible base-M vehicle hit with attacker 4 versus defender 3, asserting L after vehicle reduction, separately from the Light-immunity test.

6. **Compatibility and eligibility tests still miss the branch boundaries.** One legacy resist button does not exercise old Blast/Spread launchers or the dedicated manipulation consumer; row-marker tests do not prove blasts avoid complete miss while spreads retain it.
   **Fix:** Test both old launcher chains, unversioned manipulation cards, and identical Combat Pool results that trigger complete miss for spread but ordinary net staging for blast.

7. **The claimed Karma follow-up is not actually logged.** The revised plan says it is “logged in RULES-AUDIT-3,” but that file contains no such entry. Manipulation also remains synchronized, so the blanket frozen-snapshot description is inaccurate for that path.
   **Fix:** Add the deferred ranged-Karma finding and explicitly distinguish frozen weapon cards from manipulation’s existing synchronized, guarded snapshots.

The proposed vehicle floor also needs simplification: a Light weapon with a called shot already becomes M, then reduces to L; no extra floor is needed for that case. **Fix:** Remove the floor unless a separately specified ammunition case requires it.

VERDICT: REVISE
### Claude's response
Accepted all 7 points. Manipulation cards are versioned (`staging:"net"`). Vehicle metadata is on both launcher chains, with called shot fixed at 0. Special ammo and AV missiles are deferred and logged as C9. The base is clamped at D. Vehicle forwarding has its own test, as do the legacy launchers and blast/spread eligibility. Karma is logged as C8, with manipulation noted as already synced. Dropped the floor.

## Round 3 — Codex
Most previous gaps are closed. Two concrete issues remain:

1. **The new “spread/launcher attacks cannot be called shots” assumption contradicts the accepted inputs.** [`canCallShot`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2648) accepts firearms and heavy weapons firing SS/SA/BF; neither it nor the attack dialog excludes shotgun spreads or blast-capable heavy weapons. The attack applies +4 TN before entering those producer branches, yet the plan hardcodes `calledShot="0"` and uses the unmodified base level. That accepts the penalty while discarding the benefit and vehicle exception.
   **Fix:** Define and enforce eligibility consistently in the dialog and pre-mutation attack validation; propagate called-shot status and its level bonus for any combinations that remain accepted.

2. **C1’s “Always in the attacker’s favour” claim is false because staging caps at D.** For base M, attacker 4 versus defender 4, existing code produces M→D→M, correctly matching the tie; with 6 versus 6 it produces M→D→L, whereas net staging gives M. The defect can understate damage as well as overstate it.
   **Fix:** Correct the audit’s characterization and add base-M 6-versus-6 → M as a saturation regression test.

One remaining test weakness: the above-D unit tests exercise the helper but do not verify that a producer encodes a valid `data-level` or that vehicle reduction happens after the initial cap. A modified base exceeding D must become D, then S against a vehicle, before net staging.
**Fix:** Add an end-to-end burst/called-shot case exceeding D, with tied successes, asserting D against a character and S against an eligible vehicle.

The frozen weapon snapshots, versioned manipulation path, old-launcher compatibility, and explicitly deferred C8/C9 scope are otherwise coherent. No files were modified.

VERDICT: REVISE
### Claude's response
Accepted. The called shot propagates through both launchers, since the TN was already paid, and lifts the row level plus the vehicle exception. The audit claim is corrected to say it can also under-state. Added a 6-vs-6 test and an end-to-end over-D clamp before the vehicle −1.

## Round 4 — Codex
No remaining blocking flaws found in the revised plan.

The revisions cover the producer/consumer chains, preserve legacy launchers and manipulation cards, keep complete-miss and staging totals consistent, and specify vehicle modifier ordering. The added tests cover saturation, option forwarding, and called-shot propagation. C8/C9 now clearly record the deferred limitations.

The frozen-snapshot approach is a reasonable scope reduction. Approval applies to the plan; implementation still needs to pass the specified tests. No files were modified.

VERDICT: APPROVED
Approved after 4 rounds.
