# Code review log: the Reflex Recorder

## Round 1 — Codex (gpt-6-sol, high)
**The staged change needs revision.** I found these defects:

- **Defaulting can lose its TN penalty.** `rollSkillTest` adds the recorder die before checking whether the rating is zero; a recorded zero-rating skill therefore rolls as trained. The weapon and melee-defense paths do the same. [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1479), [item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:767). **Fix:** decide defaulting from the unmodified rating, apply its TN penalty, then add the recorder die.

- **An unowned recorded skill gets no die through `rollNamedSkill`.** Its defaulting path goes straight to `rollSuccessTest`, contrary to the round-2 ruling. [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1448). **Fix:** add the matching working recorder’s die to the resolved default pool.

- **A slotted vehicle chip can receive the die.** Chip preparation overwrites the native skill’s prepared rating with the chip rating, so the `chipRating > native` check is false when that skill item exists. [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2166). **Fix:** detect the chip from the skill’s `_chipped` marker or the actual selected skill source.

- **The vehicle die raises Control Pool caps in existing callers.** `_vehicleSkill` increases `.dice`, while chase and Rigger 2 resistance use `.dice` as their cap despite the new `.cap` field remaining unchanged. [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2168), [chase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:1085). **Fix:** use the unmodified `.cap` in every Control Pool limit, including the chase admission check and terrain cap.

- **A player can lock a Concentration recorder with its concentration blank.** The form submits on change, but `recorderLocked` becomes true as soon as `recordedSkill` is saved; the concentration input then becomes disabled. [item-sheet.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/item-sheet.mjs:260), [item-body.hbs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/item/item-body.hbs:403). **Fix:** save both choices together and lock only after the required choice is complete.

- **The generated pack items have no recorder identity of their own.** Both JSON files have empty flags and null `compendiumSource`, so `wareRule` returns null on the pack documents and on copies without preserved provenance; the recorder fields and die disappear. The Quench fixture’s explicit rule flag masks this. [Reflex_Recorder_General JSON](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-shadowtech/packs-src/st-bioware/Reflex_Recorder_General__6fac01c3ca92526c.json:45), [gen-bioware.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-shadowtech/tools/gen-bioware.mjs:44). **Fix:** generate `flags.sr2e.rule: "reflex-recorder"` on both items.

- **The Quench test does not test what its description claims.** It calls `_activeSkillBonus` directly and never rolls, inserts a chip, checks the badge, or exercises secondhand failure; it can pass while the defaulting, vehicle, and content paths above fail. [sr2e-quench.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:1914). **Fix:** test real roll pools and sheet context with pack-derived items, then repeat after chip and implant-state changes.

- **Sheet rendering rescans every item for each skill.** Each badge check calls `_recorders()`, and concentration-only matches require a second call, making the skills render scale with skills × inventory. [actor-sheet.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:1491). **Fix:** collect working recorders once per sheet context and reuse that snapshot for badge decisions.

VERDICT: REVISE
## Round 2 — Codex (gpt-6-sol, medium)
Two round 1 fixes remain incomplete:

- **Control Pool caps still rise with the recorder die.** Rigger 2 vehicle resistance in [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2493) and the crash card in [vehicle-damage.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-damage.mjs:348) pass `_vehicleSkill(...).dice` to `terrainControlCap`. Both need the unchanged `.cap`.
- **The Quench chip check does not exercise a roll pool.** [sr2e-quench.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:1936) calls `_recorderDice` with a fabricated `_chipped` marker; it never slots a chip and rolls the affected skill.

The read-only environment prevented Vitest from starting because it tried to create a temporary config file. The staged diff passed `git diff --cached --check`.

VERDICT: REVISE
## Round 3 — Codex (gpt-6-sol, medium)
VERDICT: APPROVED
### Responses
- r1: the die added after defaulting in every path with the tier rolled (rollSkillTest, rollNamedSkill via _skillByName, weapons, melee defense); _activeSkillBonus back to Enhanced Articulation only; vehicle chips by the _chipped marker or an encephalon chip above the native rating; caps read .cap; the sheet locks a complete choice; pack items carry flags.sr2e.rule; one recorders snapshot per sheet; Quench on real pools.
- r2: two more caps (R2 resistance, crash card) read .cap; the chip test slots a real ActiveSoft.
- Found on the way: sr2e.skill-tiers had 4 stale tests since 82c23302 (adept powers only for a physical adept); the helper now makes adept-power holders physical adepts.
