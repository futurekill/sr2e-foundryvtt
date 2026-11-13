# Plan Review Log: drugs, full rules
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex (session 01a0da84…)
The damage hook is suitable, but the plan needs revision. I read both plans and audited the requested code; no files were modified.

The choke-point claim is accurate **for automated Physical/Stun damage on dual-monitor actors**: weapon/melee resistance, spell and conjuring Drain, falls, astral combat, spirit damage, ritual Drain, and toxins reach `damageUpdate`. Vehicles, IC, and Matrix persona damage use separate tracks. Sheet monitor buttons also bypass it and increment/decrement values; calling these “absolute corrections” is inaccurate.

1. **Centering cannot actually remove drug-only penalties.** [item.mjs:1669](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1669) offers Centering only when `woundP + sustainP > 0`, and caps its reduction at that sum; changing `testTnModifiers` alone leaves an otherwise healthy Hyper user unable to center away +5.  
   **Fix:** Use the casting-context modifier helper for Centering eligibility, modified TN, and reduction cap, and add `drugTN` to both the central calculation and chat breakdown.

2. **The proposed ritual exception contradicts the existing policy.** [actor.mjs:336](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:336) defines `"injury"` as *only* the leader’s Injury Modifier; drug penalties are not injury, and `"all TNs"` penalties such as dump shock are already excluded.  
   **Fix:** Keep drug penalties excluded under both ritual policies unless an explicit rules precedence decision changes that contract and its tests.

3. **“Everything else: other” silently exempts real skill tests.** Chipped skills call directly at [actor.mjs:1191](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1191), as do astral attack/defence, learning, and first aid; `rollSkillTest` itself reconstructs options and currently drops caller context.  
   **Fix:** Inventory every direct `rollSuccessTest` call, preserve/derive context in wrappers, and classify actual skill tests—including chipped skills and selected astral skills—while keeping attribute resistance separate.

4. **Range and attack classification need stricter definitions.** [item.mjs:871](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:871) resolves range locally as `blastRange ?? options.range ?? "short"`; the generic weapon path also handles non-firearms, and its `isMelee` includes throwing weapons. A blanket short-range/melee flag can charge Atropine’s additional +1 incorrectly.  
   **Fix:** Pass explicit attack context using the resolved bracket and qualifying firearm/combat type, with separate tests for firearms, thrown attacks, melee defence, and mounted weapons.

5. **Technical skills are knowingly undercharged.** The quoted rule explicitly says +2; the absence of a `technical` schema category does not justify giving Computer, Electronics, etc. +1 ([config.mjs:286](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/config.mjs:286)).  
   **Fix:** Add a rules-backed technical-skill classification or context override and apply +2 instead of the generic Active modifier.

6. **The overuse acceptance test contradicts the reducer.** A second Kamikaze dose with the first dose’s absorption intact sends its 1 Stun through `damageUpdate`, so absorption removes it; it cannot invariably produce “1 Stun at once.” Creating the new effect first could also let its fresh counter absorb that wound.  
   **Fix:** Specify dose ordering and whether overuse damage is absorbable, then test intact/exhausted prior counters and ensure the new counter’s participation matches that decision.

7. **Single-update atomicity does not prevent same-client lost updates.** Toxins use `dose:${actor.uuid}`, rituals use `ritual:${id}`, and ordinary `applyDamage` has no shared damage queue ([drugs.mjs:16](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:16), [ritual.mjs:101](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ritual.mjs:101)). Concurrent events can calculate from identical monitors/counters and overwrite each other despite each update containing its marker.  
   **Fix:** Serialize damage calculation and commit through one actor-UUID queue shared by all damage callers, retaining marker writes in that commit and the existing cross-client limitation.

8. **Damage consequences still use pre-absorption damage.** [actor.mjs:2354](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2354) applies damage, then derives knockdown from the original damage level; cards likewise report original boxes, including ritual Drain. Full absorption can therefore still offer knockdown and claim damage was taken.  
   **Fix:** Expose the reducer’s outcome to callers and use it for damage reporting and damage-dependent consequences.

9. **“In force” includes disabled effects and conflicts with manual attribute expiry.** The proposed predicate checks only flags/time; disabling an effect would leave its absorption/TN/overload working, while expired Kamikaze attribute bonuses remain applied under the shipped manual-ending contract.  
   **Fix:** Exclude disabled/suppressed effects and explicitly retain and label the split expiry behavior—or extend scope to expire attribute changes consistently.

10. **Content regeneration does not upgrade existing documents.** [gen-drugs.mjs:55](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-shadowtech/tools/gen-drugs.mjs:55) explicitly serializes allowed flags, while existing actor items and exposure effects retain old data; merely adding properties to compound definitions will not propagate them.  
    **Fix:** Extend the serializer and effect snapshot, rebuild/validate packs, and specify migration or replacement/re-dosing instructions for existing items and exposures.

11. **The reducer test contains impossible accounting and misses spill coverage.** “5 boxes with 4 absorb → 1 lands, 3 absorb used” must consume four; the second `damageUpdateFor` call also requires reconstructed `{value,max}` monitors, because its output contains numbers.  
    **Fix:** Correct absorption consumption to four and test sequential overload with Stun spill, Physical overflow, multiple absorbers, disabled/expired effects, NPCs, and isolated unlinked-token counters.

Positive ADD halving itself matches the supplied rule and generated Kamikaze changes: Body/Quickness/Willpower and the extra initiative die become zero; Strength becomes +1; negative changes remain unchanged. The plan should assert the initiative result explicitly.

VERDICT: REVISE

### Claude's response
All 11 accepted; see "Round 1 amendments". Technical skills are verified on core p.71 (Biotech, Computer, Electronics).

## Round 2 — Codex
Most amendments resolve the original findings, but four gaps remain. I treated the amendments as overriding Round 0; no files were modified.

1. **The context inventory still misidentifies callers.** Chipped skills, untrained named skills, learning, and first aid call `rollSuccessTest` directly at [actor.mjs:1191](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1191), lines 1085, 3193, and 3582. Updating `rollSkillTest` does not cover them. Matrix system operations are explicitly Computer tests (line 2906), and vehicle handling/crash tests roll driving skills (line 1785); classifying these as `other`/`resist` incorrectly exempts them from Atropine.  
   **Fix:** Explicitly annotate these direct callers with the tested skill’s identity/category, including a canonical skill key or technical flag for Biotech, Computer, and Electronics.

2. **Manual expiry activates zero-duration Hyper.** [drugs.mjs:114](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:114) preserves a fully shrugged-off dose as an enabled tracking effect with no attribute changes; copying Hyper’s flags and checking only `!disabled` would give that exposure indefinite TN penalties and overload.  
   **Fix:** Mark zero-duration exposures as tracking-only and exclude them from `drugsInForce`, while retaining their damage/card recovery functionality.

3. **Knockdown needs numeric boxes throughout, not just at the initial prompt.** Absorption produces nonstandard wounds—for example, 3 incoming minus 1 absorbed leaves 2 boxes—but [actor.mjs:2406](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2406), the button payload, and `knockdownOutcome` still accept L/M/S/D. Merely changing `rollDamageResistance` cannot preserve the actual threshold.  
   **Fix:** Carry landed boxes through the button, handler, and knockdown rules, testing partial absorption that leaves 2 or 5 boxes and a reduced Deadly hit.

4. **Chat failure must not turn committed damage into an apparent failed operation.** Amendment 8 adds chat creation inside `commitDamage`; if it rejects after the actor update, ordinary damage callers can abort before marking their attack resolved, allowing a retry to apply damage again.  
   **Fix:** Make post-commit reporting best-effort: catch chat failures and always return the committed damage outcome after a successful actor update.

The manual-ending decision is workable as an explicit limitation, but replace the superseded “expired Hyper: no overload, no TN” test with expired-but-enabled and zero-duration cases.

VERDICT: REVISE
### Claude's response
All four findings accepted — see 'Round 2 amendments' in the plan. Knockdown threshold generalised to ⌈landed boxes ÷ 2⌉ (matches the book's L1/M2/S3 exactly).

## Round 3 — Codex
Round 2 resolves the four remaining findings: direct skill contexts, zero-duration exclusions, numeric knockdown propagation with old-card compatibility, and best-effort post-commit reporting.

Reading the amendments as overriding earlier sections, I found no remaining blocking issue. Manual expiry and existing-content replacement remain explicit limitations. This approves the plan, not an implementation; no files were modified.

VERDICT: APPROVED
Converged in 3 rounds.

## Implementation review (Codex, thread 01a0da92)
Round 1: 7 findings (resolved attack skill, Centering modifier set, ram context, knockdown on both monitors, learning preview, integration tests, CHANGELOG) — all fixed.
Round 2: healing TN before Centering — fixed, regression added.
Round 3: VERDICT: APPROVED.
