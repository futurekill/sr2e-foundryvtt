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

### Claude's response (draft 2) — all taken
1: item getters become pure computations at their existing consumption points (§1.2). 2: every block/helper/getter gets
a milestone in the inventory, M2j added for skills and foci, actor getters with M2h (§1.2). 3: plain records with real
`items.get` and source/identity accessors; `designOf` joins the helper split (§2). 4: the five-phase pipeline with the AE
step applied once, plus mixed-priority/suppressed/transferred/disabled fixtures (§1.1). 5: golden projections recorded
before any extraction; persistent instances for edits/removals/repeat preparation; embedded outputs compared (§5). 6:
`required` in the descriptor; normalize AND validate contracts with constraint tests; the `system` boundary (§3). 7:
`DependencyUnavailable` → whole-document D12 fallback, fixtures for both consumers (§2.1). 8: no global fallbacks (ctx.now,
a lint rule); tagged fixtures replay in Node and a headless browser with clock/void/shapeshift cases (§2, §5). 9: thin
calls stay at their original positions; intermediate-state parity and documented cross-stage inputs per release (§5).

## Round 2 — Codex (draft 2, fresh session): REVISE, 3 findings
1. **The specified AE ordering differs from Foundry v13.** §1.1 says “priority, then mode.” Installed v13.351 instead flattens individual changes, defaults priority to `mode * 10`, and stably sorts **only by priority**. With equal explicit priorities, an OVERRIDE to 5 followed by ADD 2 produces 7 in Foundry; mode-based tie-breaking produces 5. This makes round-1 resolution #4 incorrect.  
   **Fix:** Specify Foundry’s change-level stable ordering and add equal-priority, mixed-mode fixtures, including actor/transferred-effect ties.

2. **The plain-record contract misses a callable skill method.** SkillData.applyLanguageRatings is called again by `_applySkillsofts` after changing ratings and clearing chip markers. Plain item systems lack that method, so `applyLanguageRatings?.()` silently skips it. Slotting or removing a LinguaSoft can therefore leave spoken-language and family ratings inconsistent with the effective skill rating, while Foundry’s prototype-backed path remains correct. The getter resolution does not cover this method.  
   **Fix:** Extract `applyLanguageRatings` in M2a and explicitly replace every actor-side invocation with the pure helper; test LinguaSoft slot, replacement, removal, and repeated preparation.

3. **Raw effect membership remains an uninventoried dependency.** programUnusable, consumed by `_derivePersona`, checks `actor.effects.has(claimId(...))` for a disabled one-shot receipt. Neither the effective-effect collection nor plain event records support that access verbatim. Mapping it to `ctx.effects` loses the disabled receipt and makes a spent program usable again; retaining `.has` against an array throws. The existing disabled-marker fixture only promises that the marker is never *applied*.  
   **Fix:** Inventory `programUnusable`, replace its membership check with an explicit complete-source/event lookup, and add a spent-one-shot persona fixture replayed in Node and browser.

VERDICT: REVISE

### Claude's response (draft 3) — all taken
1: Foundry v13's change-level ordering (priority defaults to mode × 10; stable sort by priority only), with equal-priority
mixed-mode and actor/transferred-tie fixtures. 2: `applyLanguageRatings` extracted in M2a, every actor call replaced;
LinguaSoft fixtures. 3: `programUnusable`'s raw membership becomes `ctx.events.hasMarker`, inventoried, with a spent
one-shot fixture.

## Round 3 — Codex (draft 3)

1. **`astralReaction` is extracted after its first pure consumer.** [§1.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:47) schedules it for M2h, but M2d moves initiative computation, which reads `this.astralReaction` when projecting ([code](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:531)). A plain working system produces `undefined + 15`, while the Foundry model still succeeds. This is a defect in the earlier milestone-assignment resolution.
   **Fix:** Extract the pure astral-Reaction computation by M2d and add projecting magician and shapeshifter parity fixtures.

2. **Document methods remain outside the plain-record contract.** `chargenBudgetOf` calls `i.getFlag(...)` for every item ([code](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:566)); M2i therefore throws on plain items. More subtly, `liveBoundSpirits` uses optional `a.getFlag?.(...)` to exclude departed spirits ([code](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:55)). A resolved plain elemental with `flags.sr2e.departed` can incorrectly exempt its caster from sustaining penalties. Resolved/absent/unavailable fixtures alone do not exercise this.
   **Fix:** Replace these document-method reads with explicit flag reads and test recorded ammunition value plus a resolved-but-departed sustaining elemental.

3. **The normalisation contract omits string trimming.** [§3](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:95) lists neither `trim` nor whitespace tests. Installed Foundry v13’s `StringField` defaults to `trim: true` and trims before cleaning. For example, raw `system.race: " troll "` becomes `"troll"` in Foundry; preserving the whitespace outside Foundry loses racial modifiers and maximums. Catalog and empty-string fixtures need not expose this.
   **Fix:** Export effective trimming semantics and add whitespace-only and padded-string normalisation parity cases.

VERDICT: REVISE

### Claude's response (draft 4) — all taken
1: `astralReaction` moves to M2d with projecting magician/shapeshifter fixtures. 2: the two Document-method reads become
explicit flag reads, a lint rule forbids method calls on context records, with the two fixtures. 3: the normaliser applies
each StringField's effective `trim`; padded/whitespace parity cases.
