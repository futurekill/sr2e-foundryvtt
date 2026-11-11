# Plan Review Log: Rigger 2 Vehicle List (release 4)

## Round 1 — Codex (draft 1)

1. **Cross-compendium imports omit the factory equipment needed to interpret their new stats.** Precedence explicitly leaves `items` untouched; core vehicles such as Ford Americar have empty item arrays. Importing a covered vehicle with factory turbocharging therefore gets baked Speed but no factory levels, so subsequent customization uses the wrong baseline and maximum. Existing ordinary items representing factory equipment can instead apply effects and capacity twice. See `customizeContext` and `applyModEffects`.
   **Fix:** Apply a shared, idempotent factory-equipment reconciliation alongside stats, preserving aftermarket items and requiring review for ambiguous existing equipment.

2. **The proposed `fuelType: "jet"` is incompatible with customization restrictions.** `customizeContext` uses `fuelType` as the engine identifier, while Thermal Baffles and Active Thermal Masking accept `jetPropeller` or `jetTurbine`, not `jet`. A correctly transcribed jet aircraft will incorrectly fail eligibility.
   **Fix:** Resolve the canonical engine identifier from the row’s propulsion/template and retain the printed fuel label separately.

3. **The template mapping omits classification required for correct prices and installation skills.** `customizeContext` reads `design.category`, `design.traits`, and `design.transport`; mapping a tractor to ground/Car loses its tractor trait. Thermal Baffles then cost Body × 5,000¥ rather than Body × 10,000¥. A UAV classified only as drone lacks its aircraft body category.
   **Fix:** Generate explicit canonical type, skill, category, and traits per row, including separate body classification for drones.

4. **Several proposed type names are not system identifiers.** `CONFIG.SR2E.vehicleTypes` contains `boat`, `aircraft`, and `vectored_thrust`, not `watercraft`, `fixed-wing`, `vectored`, or `LTA`. The schema accepts arbitrary strings, so a range validator can miss invalid classifications that break selectors and skill defaults.
   **Fix:** Specify exact stored identifiers and validate them against configuration, with explicit supported handling for lighter-than-air vehicles.

5. **“Unlinked tokens’ base actors” targets the wrong documents.** Two unlinked tokens can share one world actor while carrying different synthetic stats and items. Updating their base actor neither independently updates their overrides nor respects per-token selection. The existing `vehicle-base.mjs` traversal correctly uses `t.actor`.
   **Fix:** Enumerate and update synthetic token actors by scene/token UUID, including inactive scenes, and test independent selection of tokens sharing a base.

6. **The design exclusion misses legacy custom designs.** `VehicleData.design.version` defaults to 1, and legacy designs retain `chassisKey`, `powerPlantKey`, and improvements. A previously imported vehicle subsequently designed using the old interface still matches its compendium identity and gets overwritten because only version 2 is excluded.
   **Fix:** Share a predicate that detects populated legacy designs as well as version 2, without treating every default version-1 production vehicle as designed.

7. **Mount multiplicity needs an explicit representation.** If “2 external fixed hardpoints” becomes one catalog item with rating 2, `quoteCustomization` counts only its `mountPoints: 2`; it never multiplies mount points by rating. The vehicle incorrectly has room for another hardpoint.
   **Fix:** Emit separate embedded items for instance equipment and reserve rating aggregation for level families.

8. **Name-derived identities are not stable across the planned renaming.** The existing R2 generator derives `_id` from SHA-1 of `"r2-vehicle:" + name`. Replacing a heading with `Name (Variant)` changes its UUID; removing the old document breaks existing compendium links, while retaining its JSON leaves duplicate obsolete entries because the pack builder loads every source file.
   **Fix:** Preserve existing document IDs through an explicit identity manifest, retain historical UUID aliases, and define replacement/cleanup of the old generator’s output.

9. **An approved diff can become stale before application.** The update window can remain open while another owner edits stats or creates a Workshop design. Applying the previously selected patch can overwrite those edits or modify a now-excluded design.
   **Fix:** Re-read and recheck eligibility and compared source values immediately before each write; require a refreshed review when they differ.

10. **The creation rule also resets duplicated production vehicles.** A vehicle carrying the proposed `vehicleId` flag matches even without compendium provenance. Duplicating an already updated vehicle with manually adjusted base stats therefore reapplies the stock row, despite this being a world copy rather than a fresh compendium import.
    **Fix:** Distinguish duplication from compendium import and preserve already-stamped world copies; test import, duplicate, and reimport separately.

VERDICT: REVISE
### Claude's response (draft 2)

All 10 taken: factory reconciliation on import + update window (#1); canonical engine ids (#2); per-template Workshop chassis key → category/traits/transport/vehicleType/skill, validated against config (#3, #4); synthetic token actors per token (#5); shared hasDesign incl. legacy designs (#6); instance equipment as separate items (#7); id manifest keeps the 21 drones' _ids, generator removes stale files (#8); re-read and recheck before each write (#9); compendium import only (no duplicateSource, not stamped) (#10).
