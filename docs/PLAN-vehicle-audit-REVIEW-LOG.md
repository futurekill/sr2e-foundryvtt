# Plan Review Log: vehicle stats audit (release 4b)
Started 2026-11-11. Codex read-only, fresh session per round.

## Round 1 — Codex
The inventory count checks out: **135 non-R2 vehicle documents**, but three are embedded Adventure actors, not scene copies. The plan needs these corrections:

1. **Queen Euphoria’s duplicate location and build dependency are wrong.** Its three additional vehicles live under `actors` in the Adventure document. Updating `qe-actors` or regenerating scenes leaves those copies stale; `gen-actors.mjs` also imports core vehicle data.
   **Fix:** Build in order: core corrections → QE actors → `gen-adventure.mjs` → packs, then compare both actor representations.

2. **“Converted line” is insufficiently defined for QE.** `tools/data/qe-actors.json` records explicit rulings: Americar takes the SR2 catalogue’s 20,000¥ rather than QE’s 80,000¥; Nightsky takes catalogue armour; PRC-42D combines the SR2 chassis with specific overrides, including Armour 3.
   **Fix:** Declare these per-vehicle conversion recipes as expected results before diffing, preserving their overrides and rulings.

3. **The comparison lacks a semantic mapping layer.** RBB stores cruise speed and multiplies printed armour by three on output; SSC and Fields of Fire store maximum speed; Neo-Anarchists stores cruise speed in kph and keeps structural Body in notes. Uniform normalization cannot safely compare these.
   **Fix:** Keep raw transcription separate from explicit per-book mappings for units, compound values, conversions, and intentional omissions.

4. **The field checklist can miss existing printed data.** Fields of Fire’s notes contain fuel, economy, access, setup times, off-road/water speeds and free cargo; RBB includes alternate operating modes. Several now have structured system fields, but the plan does not define whether matching notes alone satisfies the audit.
   **Fix:** Inventory every printed field and mode, assigning each a structured-field target, notes target, or documented unsupported status.

5. **“None”/0 normalization can hide omissions.** Generators default unprinted acceleration, sensors and other values to zero; an absent transcription field could therefore appear to agree with shipped data.
   **Fix:** Preserve distinct states for missing, unprinted, illegible, explicit “None,” and numeric zero, and require complete transcription coverage.

6. **Regeneration threatens more than art.** Fields of Fire’s generator writes placeholder artwork, 1×1 tokens, empty items and empty flags; RBB recomputes token dimensions from Body. A stat correction can therefore change excluded fields.
   **Fix:** Require a before/after diff allowing only approved fields; use targeted generator and JSON patches when full regeneration would cause unrelated changes.

7. **Name corrections can break IDs without changing vehicle identity.** RBB, SSC, Fields of Fire and Neo-Anarchists derive IDs from names; correcting a name can create a second file while leaving the old one, breaking UUID references and R2 lookup.
   **Fix:** Preserve existing IDs independently of names and verify unchanged document counts, UUIDs and references.

8. **Updating the R2 source map alone does not update runtime behavior.** `gen-vehicle-list.mjs` embeds `tools/data/vehicle-identity.json` into `data/vehicle-list.json`; step 8 follows the release step and does not require regeneration.
   **Fix:** Validate mappings for every affected UUID, regenerate runtime identity data, and package any R2 change before releasing.

9. **Adding printed equipment can double-count its effects.** Vehicle modifications marked as ordinary installed items apply effects and consume capacity; factory equipment already included in printed stats needs factory treatment.
   **Fix:** Specify factory-state and capacity semantics for added equipment, then verify effective stats with R2 both disabled and enabled.

10. **The world-data statement overstates delivery.** Existing non-R2 world actors retain their old values; the R2 update window applies R2 rows, not these corrected source-book values.
    **Fix:** State explicitly that corrections affect future imports, and provide a manual correction list for existing actors without introducing an automatic migration.

11. **The proposed checks are not executable uniformly.** The system’s `package.json` has no `validate` script, and build/lint alone do not establish data fidelity or preservation.
    **Fix:** Specify actual checks per repository, including coverage, allowed-field diffs, stable IDs, Adventure-copy equality and affected R2 import behavior.

VERDICT: REVISE

### Claude's response
All 11 taken (draft 2): QE embedded Adventure actors + build order (#1, step 9); QE rulings from qe-actors.json are the
expected values (#2, step 4); per-book mapping scripts from each module's conventions (#3, step 4); per-book field
inventory with targets (#4, step 2); distinct missing/None/—/illegible states + coverage (#5, step 3); allowed-field
regeneration diff, direct JSON patches when regeneration would touch anything else (#6, step 7); ids pinned, counts and
UUIDs unchanged (#7); R2 identity regeneration + release (#8, step 10); added equipment is factory-state, effective
stats checked R2 off/on (#9, step 8); world copies: manual list, no migration (#10); per-repo checks (#11, step 11).

## Round 2 — Codex (fresh session)
VERDICT: APPROVED

**Plan APPROVED after 2 rounds.**

## Code review round 1 — Codex (2026-11-12, after the quota reset)

> 1. **[P2] QE Wasp retains conflicting maximum speeds.** [Northrup_PRC_42D_Wasp_f0da659aff0323a4.json:45](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-queen-euphoria/packs-src/qe-actors/Northrup_PRC_42D_Wasp_f0da659aff0323a4.json:45) gives the D variant’s **65/100**, then appends the core 42B’s **65/130**. Both appear when importing the actor or Adventure, leaving the GM two maximum speeds despite the report’s settled convention.  
>    **Fix:** Replace the inherited 42B speed note with the D’s 65/100 in the generator and both shipped copies.
> 
> 2. **[P2] Printed factory equipment remains unimplemented.** [Devil_Rat_APC_afadd5ddfac2a910.json:30](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-fields-of-fire/packs-src/ff-vehicles/Devil_Rat_APC_afadd5ddfac2a910.json:30) has `items: []`, although its notes explicitly include a small remote turret and EnviroSeal. Corresponding catalog modifications exist. With R2 disabled, importing this audited vehicle supplies none of that equipment, contrary to plan step 8.  
>    **Fix:** Embed the printed catalog equipment as factory items and verify effective stats remain unchanged with R2 off and on.
> 
> 3. **[P2] Required field coverage was not completed.** [VEHICLE-AUDIT.md:74](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/VEHICLE-AUDIT.md:74) explicitly says seating, access, economy, and fuel were only spot-checked. Plan steps 2–5 require every inventoried field to be transcribed and compared; seating is even structured data. Thus the report cannot substantiate complete verification of the 69 RBB vehicles.  
>    **Fix:** Complete and record the omitted comparisons before claiming the audit is complete.
> 
> 4. **[P3] The report specifies mappings that contradict the committed data.** [VEHICLE-AUDIT.md:24](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/VEHICLE-AUDIT.md:24) specifies core `speed (=max)`, and line 43 specifies RBB `pilot+autonav`. Following these mappings would restore maximum speeds and duplicate APilot into both fields—the opposite of the stated conventions and actual packs.  
>    **Fix:** Change the inventories to cruising speed and the explicit crewed-autonav/drone-pilot split.
> 
> Checks: RBB regeneration, with writes intercepted, matched all 69 committed documents exactly, including IDs, filenames, art, and tokens. QE embedded vehicle systems match their standalone actors. All seven content-module validators and all eight linters passed. Vitest was blocked by required temporary writes under the read-only sandbox; Quench was inspected but not executed.
> 
> VERDICT: REVISE
### Claude's response
1. **Taken.** The QE generator takes a `speedNote` (qe-actors.json) that replaces the chassis's "Core book: Speed" line;
   only the Wasp file regenerated (the six NPC weight-drift files reverted again), grafted into the Adventure; the three
   embedded vehicles equal the actors.
2. **Rejected, with the plan's own bound made explicit.** Step 8 embeds printed equipment "only as factory" from a
   catalogue; the only catalogue holding remote turrets and EnviroSeal is Rigger 2's, and Fields of Fire (like RBB) does
   not depend on Rigger 2. Embedding copies would ship R2 content and R2 design effects in a module that doesn't run R2's
   rules. With R2 on, the Vehicle List update supplies the list's factory equipment (the Devil Rat is in the identity
   map). The CSH TR-55 mods are optional purchases, not standard equipment. Recorded as a settled convention in the report.
3. **Taken.** Seating, economy, fuel/power, both cargo lines and sensor diffed for all 69 RBB vehicles; this also caught
   two misses of my own (the first diff read only "Storage", and sensor wasn't compared). Fixed from the renders: Red
   Ranger cargo 10 + economy 0.5, Seacop cargo 10 (+ "enclosed cabin", not EnviroSeal), Appaloosa sensor 6, Aguilar-EX
   sensor 7, Bergen Cargo fuel 1,000 L, Swordsman fuel 50 L, drones' fuel/economy added. The other books were checked the
   same way: clean. Access is recorded as not carried.
4. **Taken.** Core inventory now says cruising speed; RBB says autonav (crewed) / pilot (drones).

## Code review round 2 — Codex (fresh session, the fix only)

> - **[P3] Wasp still has two speed statements.** The [actor’s notes](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-queen-euphoria/packs-src/qe-actors/Northrup_PRC_42D_Wasp_f0da659aff0323a4.json:45) contain `Speed 65/100` in both “QE p.16 prints” and the replacement speed paragraph. The Adventure repeats both. The conflicting value is fixed, but the requested exactly-one-speed-line check fails. Remove one statement in the generator data and regenerate both copies.
> 
> All changed RBB values match the supplied images. All 69 filenames and IDs are preserved; only `system.cargo`, `system.sensor`, and `system.notes` changed. The Adventure Wasp matches the actor apart from its packaging `_key`.
> 
> VERDICT: REVISE
### Claude's response
Taken: the Wasp kept Speed 65/100 twice (the "QE p.16 prints" line and the replacement). The generator now drops the
core speed line (`dropCoreSpeed`) instead of replacing it; regenerated, grafted, embedded copies equal the actors.

## Code review round 3 — Codex (fresh session, the round-2 fix only)
VERDICT: APPROVED

**Audit code APPROVED after 3 rounds.**
