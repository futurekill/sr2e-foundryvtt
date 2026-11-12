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
