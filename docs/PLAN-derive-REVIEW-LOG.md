# Plan Review Log: the pure derive layer (chargen M2)
Started 2026-11-15. Codex reviews: fresh session per round with a settled brief.

## Round 1 — Codex (draft 1, fresh session): REVISE, 9 findings
1. **Item getters are missing from M2a, and snapshotting them early is incorrect.** `actualEssenceCost`, `actualBodyCost`, and adept `totalCost` remain on DataModel prototypes. Plain prepared items lack them; moreover, `actualEssenceCost` reads `limbEssence`/`limbDiscount` assigned later by the actor. A cyberlimb option or muscle replacement can therefore produce missing or stale Essence.
   **Fix:** Extract these getters as pure computations and evaluate them at their existing consumption points, after actor-assigned markers.

2. **Several required computations have no extraction milestone.** Section 4 omits `_applySkillsofts`, `_applyAdeptSkills`, `_applyWeaponFoci`, `_applyUnarmedPower`, actor getters, and portions of the main preparation body. A standalone character can consequently lose chipped skills, bonded-weapon pricing, adept dice, or sustain penalties even after M2i.
   **Fix:** Assign every preparation block, helper, and D12 getter to a milestone, preserving its current execution position.

3. **The item context cannot support the advertised verbatim move.** Cyberware preparation calls `parent.parent.items.get(id)` and reads the sibling’s `_source.system`; QualityData reads `_stats.compendiumSource`; ProgramData calls `designOf`, omitted from the helper-split list. A plain array silently misses the optional `.get`, changing linked-limb pricing, while keeping `designOf`’s current import retains gameplay dependencies.
   **Fix:** Specify plain item/owner records, source and identity accessors, and all transitive helper extractions before M2a.

4. **The preparation and AE boundary is undefined.** `contextFromActor` expects prepared items, but the harness supplies an “unprepared” actor; neither the reset phase nor supported AE application has an assigned implementation step. Reapplying an ADD effect inside a live caller can double it; skipping application on the standalone path loses it. On/off fixtures alone also cannot establish ADD/OVERRIDE priority or suppression parity.
   **Fix:** Define source reset → base preparation → embedded preparation → eligible ordered AE changes → actor derivation explicitly, with mixed-priority, suppressed, transferred, and disabled-event fixtures.

5. **The parity oracle can agree with its own regression.** After extraction, Foundry’s thin caller and the pure path execute the same changed implementation. Both can omit a modifier and still compare equal; reconstructing fresh copies for removals also misses stale item fields.
   **Fix:** Preserve pre-extraction expected projections and run edits, mechanism removals, and repeated preparation on persistent working instances, comparing embedded outputs as well as actor outputs.

6. **The normaliser does not yet meet the approved validation requirement.** Its descriptor omits `required`, and its tests cover minimal/default and catalog inputs rather than invalid inputs or boundary coercions. For example, invalid `grade` choices or blank required fields could be accepted outside Foundry while all catalog tests pass; comparing a TypeDataModel descriptor against whole Document construction also leaves document-level normalization unspecified.
   **Fix:** Define versioned normalization *and validation* contracts, export all relevant field constraints, and test missing/null/blank/invalid-choice/coercion/clamping cases with an explicit document-versus-system boundary.

7. **Lookup failure does not have an executable propagation contract.** Merely returning `unavailable` does not prevent `_applyCybermancy` from treating an unresolved spell origin as non-spell, or `elementalHolderOf` from treating an unavailable bound spirit as no holder. Both produce plausible but wrong editable numbers; the fixtures omit genuinely absent targets.
   **Fix:** Specify dependency-failure propagation to whole-document D12 fallback and test resolved, absent, and unavailable references for both consumers.

8. **The runtime gate can miss hidden-global divergence.** `_wareCyberInteractions` uses `globalThis.game?.time?.worldTime ?? 0`, which succeeds without globals while folding MBW/cybermancy at the wrong time. JSON contexts also cannot directly preserve `lookup`, Sets, Maps, or getters, and the required browser import test is absent.
   **Fix:** Replay tagged D12 fixtures through a plain-data lookup resolver in Node and browser, compare outputs, and include nonzero clock boundaries, differing substance/world clocks, voided permanent-damage records, and shapeshifter forms.

9. **Incremental release dependencies are underspecified.** M2b includes cybermancy, which consumes signed Essence assigned before attributes, while Essence extraction lands in M2c. Grouping moved calls into one “attributes” invocation before the retained Essence block changes Willpower and overflow behavior.
   **Fix:** Keep thin calls at their original positions and document cross-stage inputs and intermediate-state parity for every release.

VERDICT: REVISE
