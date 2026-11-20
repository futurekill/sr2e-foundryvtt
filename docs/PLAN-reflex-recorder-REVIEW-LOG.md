# Plan review log: the Reflex Recorder

## Round 1 — Codex (gpt-6-sol, high)
**Findings — the plan needs revision.** I checked the wording of Shadowtech p.27 against the local PDF.

1. [Plan §4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-reflex-recorder.md:21) calls `_activeSkillBonus` the hook for every skill roll, but [vehicle control and ramming](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2121) calculate skill dice separately; Rigger 2 driving uses that calculation too. **Fix:** apply the recorder in `_vehicleSkill` when the driver uses the recorded native skill, while keeping Control Pool caps tied to the skill rating.

2. Other direct skill tests also bypass that hook: [Conjuring](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1591), spell learning’s Sorcery and Magical Theory, First Aid’s Biotech, Matrix Computer tests, [Centering](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1899), and [electronic warfare concentrations](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:43). **Fix:** inventory direct rating-to-dice paths and apply the recorder to each eligible Success Test, including magic skills; keep rating based limits as ratings.

3. [Skill and weapon rolls](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1461) add the proposed bonus *before* checking whether to default. A recorded skill at rating 0 would roll one die without its Skill Web defaulting penalty; unowned skills rolled through `rollNamedSkill` would miss the bonus. **Fix:** decide trained versus defaulted from the unmodified rating, then add any eligible recorder die to the resulting test pool.

4. [The weapon path](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:766) calculates its bonus before resolving the selected concentration or specialization, and its weapon-name fallback calls the hook without a variant. **Fix:** resolve the actual skill tier first and pass it to the recorder rule in both weapon paths.

5. [Plan §1](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-reflex-recorder.md:12) stores only a concentration’s name. Identically named concentrations on different skills could both receive the die; the plan also assumes every specialization belongs to the recorded concentration, while the [schema](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:90) does not encode that relationship. **Fix:** store the parent skill identity and concentration identity, and grant a specialization die only when its parent concentration is established.

6. The proposed editable “Recorded skill” field conflicts with p.27’s rule that the choice is fixed barring surgical reprogramming. **Fix:** allow the choice at implantation, then lock ordinary edits to it; provide a separate GM reprogramming action if that is implemented later.

7. The working-implant and chip tests need broader coverage. [`workingImplant`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:174) excludes uninstalled, damaged or destroyed bioware and Kamikaze-disabled implants; [_applySkillsofts](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:843) changes `_chipped` on repeated preparations. **Fix:** use the live predicate for every recorder lookup, and test chip insertion/removal plus damage, destruction, secondhand grade and implant failure on a second preparation; clear any derived badge each pass.

8. [Shadowtech’s generator](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-shadowtech/tools/gen-bioware.mjs:24) currently emits the General item and writes a fixed field set, so regeneration would erase new recorder fields from its JSON. The [module manifest](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-shadowtech/module.json:1) is a separate release. **Fix:** generate both stable items with their size and identity, preserve the p.118 Street Index 1.5 and Legal entries, and specify the Shadowtech pack build, version and system minimum in the release plan.

9. [Chargen validation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-reflex-recorder.md:35) rejects “two recorders on one skill,” which would also reject two different concentrations under one General skill. P.27 forbids stacking a modifier on the *same target*, not selecting different concentrations. **Fix:** reject duplicate General targets or duplicate concentration targets, while allowing distinct concentrations and ensuring a General plus Concentration combination still adds at most one die per test.

VERDICT: REVISE
## Round 2 — Codex (gpt-6-sol, high)
Round 1 finding #3 remains unresolved. [Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-reflex-recorder.md:43) says **no bonus while defaulting**. Shadowtech p.27 gives the recorded skill +1 die on all future Success Tests and sets no minimum skill rating. The plan should determine defaulting from the unmodified rating, apply the Skill Web penalty, then add the recorder die—even when `rollNamedSkill` has no owned skill item.

VERDICT: REVISE
Responses: Draft 2 and the round-2 line in docs/PLAN-reflex-recorder.md.
