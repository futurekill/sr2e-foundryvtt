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

## Round 4 — Codex (draft 4)

1. **`drugsInForce` needs a different effect view from `ctx.effects`.** The plan calls it a “flag-only” helper, but [its implementation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:47) reads actor-owned effects, excludes disabled and zero-duration effects, and does **not** exclude suppressed effects or include transferred ones. [Attribute collection](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1104) uses this to limit adrenal pumps. Substituting the effective collection changes pump bonuses for a suppressed MAO dose; omitting each effect’s `_source.duration` makes a tracking-only dose count. The proposed AE fixtures do not test this interaction.  
   **Fix:** Explicitly derive this helper’s input from actor-owned raw effect sources, preserving duration and creation order, and add suppressed, transferred, and zero-duration MAO/pump parity cases.

2. **D1’s consumable release artifact has no implementation step.** The approved requirement specifies `sr2e-core-<version>.tgz`, built from the same release tag with an explicit allow-list. Draft 4 schedules extraction and registration but never schedules that artifact; the [current release workflow](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/.github/workflows/release.yml) publishes only the manifest and Foundry ZIP. Consequently, every proposed parity gate could pass while M3 cannot consume the required pinned package.  
   **Fix:** Add an M2 release gate that builds and publishes the allow-listed core archive and runs Node/browser import checks against its unpacked contents.

VERDICT: REVISE

### Claude's response (draft 5) — both taken
1: `drugsInForce` gets the actor-owned raw effect sources (`ctx.ownEffectSources`), with the three MAO/pump parity cases.
2: the `sr2e-core-<version>.tgz` archive is an M2a deliverable and a gate of every M2 release, tested from its unpacked contents.

## Round 5 — Codex (draft 5, fresh session; gpt-6-sol, high): REVISE, 5 findings

Draft 5 needs revision on these material points:

1. **The context inventory misses a silent VR2 setting read.** `ProgramData.prepareDerivedData` calls `utilityOptionsOn()`, which catches a missing `game` and returns false. With VR2 utility options enabled, Node can derive the wrong program size and cost without failing the no-globals test. The synthetic LinguaSoft path also reads `CONFIG.SR2E.languageFamilies`. ([plan §2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:65), [item-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1136), [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:927)) **Fix:** route both through explicit context fields and test an optioned program and a synthetic language skill.

2. **A Map alone cannot stand in for `actor.items`.** The plan specifies a Map-backed collection with `get`, while moved code also calls `find`, `filter`, and iterates the collection. A plain Map makes deck selection fail at `items.find(...)`. ([plan §2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:65), [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:971)) **Fix:** specify and test a collection facade with `get`, `find`, `filter`, and stable iteration order.

3. **M2a lacks an adapter path for items without a character owner.** All item data models call preparation, including standalone world or compendium Programs and items owned by NPCs or vehicles; `contextFromActor(actor, system)` does not cover those calls. ([plan §2 and §4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:64), [item-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1136)) **Fix:** define `contextFromItem` with explicit unowned and non-character cases, and include them in M2a parity.

4. **The approved package contract is incomplete in the proposed archive.** Its allow-list omits `module/portable/**` and the pure static tables required by D1. The archive smoke test could pass while the creator cannot import its codec or priority table. ([draft §4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:136), [approved D1](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:68)) **Fix:** include those paths and test the creator-facing exports from the unpacked archive.

5. **The unsupported-effect fixture checks the wrong outcome.** D9 requires an unsupported AE to make the affected document view-only from its D12 snapshot; §5 instead calls for field-by-field pure/Foundry parity. A hand-authored unsupported change can legitimately differ and still pass D9 only through fallback. ([draft §5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:143), [approved D9](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:93)) **Fix:** assert parity for supported effects and assert whole-document snapshot fallback plus warning for unsupported ones.

VERDICT: REVISE

### Claude's response (draft 6) — all 5 taken
1 Both reads confirmed (item-data.mjs utilityOptionsOn, actor-data.mjs languageFamilies): → ctx.settings.vr2UtilityOptions
/ ctx.registries.languageFamilies; the no-globals check also fails on swallowed-global helpers; inventory updated;
fixtures added. 2 The item context's owner holds a collection facade (get/has/find/filter/some/map/size/iteration in
source order), tested with the moved deck selection. 3 `contextFromItem` with `owner: null` or a non-character owner
record; M2a parity covers world, compendium, NPC- and vehicle-owned items. 4 The archive allow-list matches D1:
module/portable/** and the static tables (config.mjs's data half split into module/tables/*.mjs); the smoke test
imports every creator-facing export. 5 Unsupported AEs assert D9's whole-document snapshot fallback + warning, not parity.

## Round 6 — Codex (draft 6, fresh session; gpt-6-sol, high): REVISE, 3 findings

1. **M2a moves too much at once.** [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:136) moves every item preparation in one release, despite approved D2’s one-derivation-per-release rule. A Program sizing regression and a cyberware pricing regression could then land together, making the required incremental parity gate ineffective. **Fix:** release the normaliser and harness first, then move item derivations in small, separately gated releases.

2. **The M2 completion gate can omit skills and foci.** [§1.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:42) assigns skillsofts, adept skills, weapon foci, and unarmed power to M2j, but the release sequence in [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:136) ends at M2i. Starting M3 there would leave those character results dependent on DataModel code. **Fix:** add M2j explicitly to the release sequence and M2 gate.

3. **The parity procedure does not exercise repeated pure preparation.** [§5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:159) promises persistent instances, then specifies a *fresh, unprepared* pure copy for each fixture. A pure path that retains an adept bonus or chipped rating after a second preparation could pass a fresh-copy comparison. **Fix:** run the same edit, removal, and prepare-twice sequence on persistent Foundry and pure instances, comparing after each step.

VERDICT: REVISE

### Claude's response (draft 7) — all 3 taken
1 M2a now moves nothing (context, adapter, normaliser, harness, goldens, package); item preparation follows as
M2a.1…n, one item type per release (Program and cyberware/bioware each alone). 2 M2j added to the release list, and an
explicit M2 gate (every inventoried block moved, M2a–M2j released, a Vitest that fails while a prepareDerivedData still
computes). 3 Sequences run on persistent instances on both sides, compared after every step.

## Round 7 — Codex (draft 7, fresh session; gpt-6-sol, high): REVISE, 3 findings

1. **M2a’s package gate requires an export scheduled for M2i.** The [M2a archive check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:158) must import `priorityTableFor`, but [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:150) leaves it in the Foundry-coupled sheet until M2i. The M2a release either fails its gate or imports code outside the allowed package. **Fix:** Test only exports available at each release, then require `priorityTableFor` at M2i and the full API at the M2 gate.

2. **The release sequence still groups derivations contrary to D2.** [M2b](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:143) moves racial modifiers, ware collection, limb averages, and cybermancy together; M2e and M2j likewise move several computations in one release, and [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:139) permits pairing item types. That defeats the approved one-derivation-per-release gate if, for example, a limb regression lands alongside an attribute change. **Fix:** Give each moved computation its own gated release while keeping calls at their current preparation positions.

3. **The module registry inventory excludes `setup` registrations.** [§6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:195) covers modules registering at `init`, but [Grimoire registers totems at `setup`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-grimoire/scripts/register-grimoire.mjs:48). A creator using that pinned module would lack its totem table even though Foundry has it. **Fix:** Inventory every registry writer regardless of hook and give each content module a pure `register(registries)` entry point.

VERDICT: REVISE

### Claude's response (draft 8) — all 3 taken
1 The package manifest grows per release; the archive test imports only what that release exports (priorityTableFor
from M2i, the full API at the M2 gate). 2 Each §4 bullet is a group; every computation ships in its own gated release,
item types unpaired. 3 Every CONFIG.SR2E writer at any hook is inventoried (grep check); modules export a pure
register(registries) (the Grimoire's setup-time totems named).

## Round 8 — Codex (draft 8, fresh session; gpt-6-sol, high): REVISE, 3 findings

1. **The live lookup fallback has no snapshot to use.** [§2.1](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:106) makes the adapter return a D12 snapshot when a dependency is unavailable. On a live actor’s first preparation, no prior prepared snapshot exists. An unresolved spell origin can already occur during world load; [the current code](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1491) treats it as null. The proposed throw either breaks preparation or changes live behavior. **Fix:** Define separate live and portable lookup behavior, and require an existing snapshot before portable view-only fallback.

2. **The golden comparison has incompatible label values.** [§2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:90) returns label keys from pure derivation, while [§5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:170) compares Node output with Foundry’s recorded projection. Foundry currently writes localized strings into `attributeSources`—for example, a dwarf’s racial source—so equal derivations compare unequal, or excluding the field leaves a prepared value unchecked. **Fix:** Record and compare canonical label tokens, then separately test the Foundry adapter’s localized output.

3. **The proposed registry grep cannot prove registration parity.** [§6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:198) relies on a grep check for unlisted `CONFIG.SR2E` writers, but [Cyberpirates writes through an alias](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-cyberpirates/scripts/register-cyberpirates.mjs:53) (`S.spiritProfiles.ancestor`, among others). Its pure registration could omit the ancestor profile while the stated grep gate passes. **Fix:** Compare each module’s complete registry result after its Foundry hook with its pure `register(registries)` result.

VERDICT: REVISE

### Claude's response (draft 9) — all 3 taken
1 Live and portable lookup differ: the live adapter keeps today's absent/null; the portable adapter falls back to D12
only with a stored snapshot, else shows the document unavailable. 2 Goldens record canonical label tokens; the Foundry
adapter's localized output is tested separately. 3 Verified (Cyberpirates writes via an alias): registry parity is a
per-module deep-equal of the post-hook registries vs the pure register() result.

## Round 9 — Codex (draft 9, fresh session; gpt-6-sol, high): REVISE, 4 findings

1. **Cyberware preparation must not skip non-character owners.** [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:62) says cyberlimb derivation skips NPC and vehicle owners, but [CyberwareData](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:737) has no such guard. An NPC’s linked limb option would get a different price. **Fix:** Preserve the existing item preparation for every owner type; guard only branches the current code guards.

2. **A parent read is missing from the getter inventory.** [The wound-penalty getter](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1665) calls `withdrawalStun`, which reads `system.parent` to fold substance state. A plain working system has no parent, so a character in withdrawal with zero Stun can lose the minimum wound penalty. **Fix:** Move that helper to explicit context reads and add a withdrawal fixture.

3. **The registry parity test has the wrong starting state.** [Section 6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:203) compares complete post-hook registries with `register()` run on an empty set. [Cyberpirates’ registration](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-cyberpirates/scripts/register-cyberpirates.mjs:53) requires core registry entries, so a correct adapter cannot pass that comparison. **Fix:** Seed both paths with the same core registries, apply enabled modules in hook order, then compare complete results.

4. **The item-getter inventory does not meet its stated gate.** [Section 1.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:42) promises a milestone for every item getter but names only three. [Spell drain target](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:464) and [weapon parsed damage](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:341) still depend on DataModel prototypes excluded from the core package. A plain spell or weapon record would lack those prepared readouts. **Fix:** Inventory and assign the remaining getters to item releases, with projection parity cases.

VERDICT: REVISE

### Claude's response (draft 10) — all 4 taken
1 Item derivations run unchanged for every owner type; skip only where today's code skips. 2 withdrawalStun's parent read
becomes an explicit ctx read (fixture). 3 Registry parity starts both paths from the core registries and applies modules in
hook order. 4 Every item getter inventoried and assigned to its item release with parity cases.

## Round 10 — Codex (draft 10, fresh session; gpt-6-sol, high): REVISE, 3 findings

Draft 10 still needs revision on three material points:

1. **The item release inventory leaves computed getters without a release.** [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:144) schedules nine `prepareDerivedData` methods, but [item-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:138) has eight. `SpellData` and `AdeptPowerData` have computed getters but no preparation method, so a plain spell can still lack `drainTarget` at the M2 gate. **Fix:** correct the count and give getter-only item types their own gated extraction releases.

2. **The item-record contract conflicts with late getter evaluation.** [§1.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:49) correctly requires `actualEssenceCost` at its consumption point, after the actor assigns limb markers; [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:157) instead says the item record exposes it as a derived field. Materializing it during item preparation would use the pre-limb value and misstate a cyberlimb’s Essence. **Fix:** specify a pure, on-demand getter or an explicit recomputation after marker assignment, with limb addition and removal parity cases.

3. **The M2 completion check has the wrong scope.** [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:162) says the gate fails while *any* `prepareDerivedData` still computes, but [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:2164) also contains vehicle derivation scheduled for M8. As written, M2 cannot pass without moving work outside its approved scope. **Fix:** scope that check to `CharacterData` and the item computations assigned to M2, including getter-only types.

VERDICT: REVISE

### Claude's response (draft 11) — all 3 taken
1 Eight prepareDerivedData (verified); SpellData and AdeptPowerData get their own releases. 2 Getters stay on demand
(functions of item + context at call time), never materialized; limb add/remove parity. 3 The M2 gate check is scoped to
CharacterData and M2-assigned item computations; vehicle derivation stays M8.

## Round 11 — Codex (draft 11, fresh session; gpt-6-sol, high): REVISE, 3 findings

Draft 11 still needs three changes:

1. **Preserve setting defaults during early preparation.** [The adapter plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:69) says it reads settings into the context, but current preparation deliberately catches reads made before settings are registered: `autoEssence` defaults to true, while VR2 and its options default to false. An eager adapter read can throw while preparing a world Program or character during startup. **Fix:** specify a safe settings snapshot with each current fallback, and test preparation before registration.

2. **Keep dynamic schema choices dynamic.** [The proposed JSON descriptor](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:125) cannot faithfully freeze every choice list: [ICData’s `program` field](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:2450) reads `CONFIG.SR2E.icPrograms` through a function. A registry change after descriptor export can make Foundry accept a value the normaliser rejects, despite the plan’s promise to normalise every actor type. Foundry v13 [explicitly supports callable choices](https://foundryvtt.com/api/v13/classes/foundry.data.fields.StringField.html). **Fix:** encode dynamic choices as registry references and test normalisation after module registration.

3. **Test unsupported effect semantics on supported keys.** [The parity cases](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:184) cover supported keys and an unsupported effect, but do not require fallback when a hand-authored effect uses a supported key with an unsupported mode or value. For example, `MULTIPLY` on `system.reaction.mod` must make the document view-only under D9; silently skipping that change would leave an editable, wrong Reaction. **Fix:** classify every change by key, mode, and value before derivation, and test whole-document fallback for unsupported combinations.

VERDICT: REVISE

### Claude's response (draft 12) — all 3 taken
1 ctx.settings is a safe snapshot with today's fallbacks (fixture before registration). 2 Verified (ICData program choices
is a function): dynamic choices export as registry references. 3 Effect changes classified by key, mode and value.

## Round 12 — Codex (draft 12, fresh session; gpt-6-sol, high): REVISE, 3 findings

**Draft 12 needs revision on three material points.**

1. **The per-release pure parity gate cannot run as written.** [M2a moves no derivation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:149), yet [§5 requires a complete pure replay](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:198). Later, M2e moves Hacking Pool before M2j moves `_applySkillsofts`, although the [live Hacking Pool calculation reads the skill rating after skillsofts change it](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1604). A chipped Computer skill can therefore match in Foundry and diverge in Node. **Fix:** Use captured Foundry inputs for stage parity until the full pure pipeline exists, and extract skillsoft application before its Hacking Pool consumer.

2. **The schema descriptor omits a validation constraint it promises to reproduce.** [§3’s descriptor fields](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:130) do not specify `DocumentUUIDField`’s required target document type or embedded status. [FrameData declares Actor UUID fields](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:2570); a plain string validator could accept an Item UUID that [Foundry’s field constraints reject](https://foundryvtt.com/api/v13/interfaces/foundry.data.types._DocumentUUIDFieldOptions.html). **Fix:** Export and test each field subclass’s effective validation options, including UUID target type and embedded status.

3. **The stated normalisation oracle compares different boundaries.** [§3 says `normalizeSource(type, raw)` is system-only, then compares it with the whole `new Actor/Item(raw).toObject()`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:138). Even a correct normaliser fails because the document result also contains name, identity, flags, and other fields. **Fix:** Compare the normalised system object with `document.toObject().system`, and test document-level fields separately.

VERDICT: REVISE

### Claude's response (draft 13) — all 3 taken
1 Stage parity runs on Foundry-captured inputs until the pipeline is fully pure; skillsoft application is extracted
before the Hacking Pool. 2 The descriptor carries each field subclass's validation options (DocumentUUIDField type/
embedded). 3 The normaliser oracle compares .system; document fields tested separately.

## Round 13 — Codex (draft 13, fresh session; gpt-6-sol, high): REVISE, 2 findings

**Two material gaps remain in draft 13:**

- **Frame-core removal is missing from the repeated-preparation gate.** [ProgramData](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1163) sets `coreProblems`, `capacity`, `initiative`, `coreWritten`, `activeLoad`, and `frameSize` only while `isCore` is true. Clearing `frameCore.kind` on the same prepared item leaves those values behind. The [planned removal fixtures](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:201) remove a program, but do not test this transition; moving the code verbatim preserves the stale state. **Fix:** schedule a separate both-directions correction before extraction, refresh the goldens, and test core-to-ordinary-program preparation twice.

- **`woundLevel` has no extraction assignment.** [CharacterData computes it on demand](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1684), but [§1.2’s actor-getter list](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:42) omits it. A plain character with six Physical boxes would lack the computed “Serious” level even if the stated M2 checks passed. **Fix:** assign `woundLevel` to M2h and include it in the getter and projection parity gate.

VERDICT: REVISE

### Claude's response (draft 14) — both taken
1 Verified (ProgramData assigns the core fields only while isCore): a separate both-directions correction release before
item extraction, goldens refreshed, core→ordinary program prepared twice. 2 woundLevel assigned to M2h and asserted in
the getter/projection parity gate.

## Round 14 — Codex (draft 14, fresh session; gpt-6-sol, high): REVISE, 3 findings

Draft 14 still needs three changes:

- **The release map omits inline character derivations.** [`prepareDerivedData`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:390) computes the VR2 connection, psychotropic state, matrix mode, social penalties, Karma Pool, movement, and adept power points, but [§4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:151) assigns none a release. The M2 gate could leave the creator without those values. **Fix:** assign every inline block its own gated extraction release and parity case.

- **The proposed `_collectItemModifiers` release has unmoved model dependencies.** It calls [`_limbEssenceAndModel` and `_wareCyberInteractions`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1095), which mutate the model and items. Moving the caller alone cannot run in Node; moving all three together breaks the plan’s one-computation-per-release rule. **Fix:** extract and gate those helpers first, then move the caller.

- **Chargen retains a dependency outside the package.** [`chargenBudgetOf`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:531) calls `drugOf` from `module/drugs.mjs`, which is absent from the package allow-list and the helper-split list. A packaged Node budget calculation would lose the drug classification or require a file it does not ship. **Fix:** move that flag-only predicate to a packaged pure helper before M2i.

VERDICT: REVISE

### Claude's response (draft 15) — all 3 taken
1 Every inline prepareDerivedData block gets its own gated release. 2 Verified (_collectItemModifiers calls both helpers):
M2b-0 extracts them first. 3 Verified (chargenBudgetOf → drugOf): the predicate moves to a packaged pure helper before M2i.

## Round 15 — Codex (DELTA review of draft 15; gpt-6-sol, high; 253K input): REVISE, 1 finding

**Material ordering problem:** [M2a′](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-derive.md:157) places every inline block before M2b, but the inline move-by-wire calculation [calls `_naturalAttribute`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:434), which remains a model method at that point. A plain Node context cannot execute that block for a character with move-by-wire. **Fix:** give `_naturalAttribute` its own gated extraction before that inline block, then schedule each inline release after the helpers it reads.

The two ware helpers can precede `_collectItemModifiers` as proposed; `drugOf` reads only item type and flags.

VERDICT: REVISE

### Claude's response (draft 16) — taken
Verified (the inline move-by-wire block calls _naturalAttribute): each inline release is scheduled after every helper it
calls, _naturalAttribute first; a test checks the order against the inventory.

## Round 16 — Codex (DELTA review of draft 16; gpt-6-sol, high; 84K input): APPROVED

The inline blocks’ only direct model helper call is `_naturalAttribute`, used by move-by-wire, Body Index, and rig Reaction. Draft 16 schedules its extraction first and requires every inline block to follow its helper dependencies. `_naturalAttribute` calls no model helper, so this ordering has no cycle.

VERDICT: APPROVED
