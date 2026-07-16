# Plan Review Log: Shadowtech (FASA7110) — Bioware + Body Index
Act 1 (grill) complete — plan locked with jcandalino. MAX_ROUNDS=5.

Grill outcomes:
- Q1 **Architecture:** split — bioware/Body-Index mechanics in the core system, catalog in a new `sr2e-shadowtech` content module (modules can't add data-model item types or derived stats).
- Q2 **Representation:** dedicated `bioware` item type (not a `kind` flag on cyberware).
- Q3 **Body Index behavior:** warn-not-block the cap (GM allows over-cap); bioware Essence charged to awakened only; overstress penalty + magical-healing TN are display-only now, full automation deferred to backlog.
- Q4 **Scope:** mechanize bioware only; expanded cyberware as `cyberware` catalog items; chemistry/gene-tech/microbiologicals as `gear` catalog items (no auto-effects); genetics/tech-&-law/system-damage as lore/notes.

## Round 1 — Codex
The plan still has material implementation gaps:

- `BiowareData` is not actually registered by adding it to `system.json`; it must also be exported and added to `CONFIG.Item.dataModels` in `module/sr2e.mjs`. — Fix: explicitly list every registration point, including item-sheet icon/context handling.

- `bodyIndex` does not exist in `CharacterData.defineSchema`, so assigning `bodyIndex.value/max` during derivation conflicts with Foundry’s strict TypeDataModel schema. — Fix: add a `bodyIndex` `SchemaField` with numeric `value` and `max` fields before deriving it.

- The proposed shared fields do not match `CyberwareData`: there is no `modifiers` field, modifiers live in `attributeMods`, and `streetIndex` is currently a `StringField`, not the proposed number. — Fix: base the design on the exact existing field names/types or deliberately normalize CyberwareData with compatibility tests.

- `ratingStats` cannot be shared unchanged because its rows contain cyberware-specific `essenceCost`; bioware needs rating-dependent `bodyCost`, otherwise rated bioware will derive the wrong field. — Fix: give bioware its own rating-row schema or make a parameterized schema factory with type-specific cost fields.

- The Active Effect claim is wrong: installed item bonuses are collected from `item.system.attributeMods`; actor `system.<attr>.mod` is only where stored/AE contributions are preserved and combined later. — Fix: feed bioware through `_collectItemModifiers()` using `attributeMods`, without creating item effects targeting actor-derived keys.

- Reusing the cyberware template does not happen automatically: `item-body.hbs` gates its entire section on `type === "cyberware"`, while `item-sheet.mjs` only supplies cyberware context in that case. — Fix: add explicit `bioware` branches/context or extract genuinely shared partials.

- The installed toggle currently recognizes only `cyberware`; bioware would fall through to `system.equipped`, which is absent from the proposed schema. — Fix: update `onToggleEquip` so both augmentation types use `system.installed`.

- “Reuse drag/drop wiring” understates the work: actor sheet context currently exposes only `context.cyberware`, and the template/add-item controls are cyberware-specific. — Fix: explicitly add bioware collection/grouping, creation controls, row rendering, and toggle support to actor-sheet context and templates.

- Awakened detection is left as an open question despite a clean existing signal: `magic.type !== "none"` is available before Essence/Magic derivation and remains true even when Essence reduces Magic to zero. — Fix: define awakened exactly from `magic.type`, unless a cited rule requires a separate persistent awakening flag.

- Using “race/tradition/adept/base magic” as a composite awakened signal is dangerous: tradition can be stale, `magic.value` can be reduced to zero, and chargen priority is not reliable after play starts. — Fix: use the canonical `magic.type` field only and test zero-Magic awakened characters.

- Essence ordering is underspecified: awakened status must be captured before recalculating Essence and Magic, while bioware Essence must join `mods.essenceLoss` before `essence.value` and `magic.max` are calculated. — Fix: compute `const isAwakened = this.magic.type !== "none"` at the start of `prepareDerivedData` and pass it into modifier collection.

- The natural Body cap has no need for a new or uncertain “innate source”: existing natural Body is `body.base + body.racial`, clamped by `CONFIG.SR2E.racialMaximums`, before item modifiers. — Fix: extract/reuse a `naturalAttributeValue("body")` helper so Body Index and `_calculateAttributeValues` cannot diverge.

- Reading `body.value` before `_calculateAttributeValues` would use stale derived data, while reading it afterward includes cyberware, bioware, adept, and AE modifiers. — Fix: compute the cap directly from base/racial/max inputs, never from `body.value` or `body.mod`.

- The plan does not decide whether actor Active Effects that alter Body count toward the cap; the stated “before cyber/bio/magic” rule implies they generally must not, but permanent natural improvements may also use `.mod`. — Fix: document that the cap uses only `base + racial`, or introduce a distinct natural-improvement field if gameplay needs one.

- Bioware attribute modifiers can contaminate the cap if Body Index is calculated from the already-mutated modifier totals or final Body. — Fix: derive `bodyIndex.max` independently before applying collected item modifiers.

- `effectiveBodyCost` is described as derived but not assigned a schema field or specified as a getter; arbitrary derived properties on strict models are fragile. — Fix: implement it as a getter such as `actualBodyCost`, mirroring `actualEssenceCost`, with explicit rounding rules.

- No rounding policy is defined for repeated fractional cultured costs, yet display, Essence loss, over-cap penalties, and healing penalties depend on stable totals. — Fix: cite the book’s rounding rule and test whether rounding occurs per item or only after summation.

- Cultured nuyen ×4 is configured but the plan never identifies where it is applied; current chargen/resource code commonly reads `system.cost` directly. — Fix: either derive displayed/charged cost into `system.cost` or add one canonical `actualCost` used by sheets and chargen purchasing.

- Bioware Essence appears tied to the existing `autoEssence` setting, but the plan does not state whether disabling cyberware automation also disables awakened bioware Essence. — Fix: explicitly define that behavior or rename/generalize the setting and migration-safe label.

- The pure helper signatures are too vague: passing Foundry items into “Foundry-free” helpers encourages coupling to document shapes and getters. — Fix: make helpers accept normalized primitives such as `{installed, bodyCost, grade}` and test malformed/missing values.

- `bodyIndex(biowareItems)` and `_collectItemModifiers()` risk duplicating installed filtering, grade multiplication, and rounding. — Fix: normalize each installed bioware once and use one shared cost helper for both Body Index and awakened Essence.

- Negative, `NaN`, missing, or unknown-grade body costs are not covered; imported module content can otherwise poison all derived actor values. — Fix: constrain schema values, default unknown grades safely, and make helpers ignore or normalize non-finite inputs.

- The plan says NPCs/critters may exceed the cap but implements Body Index only in `CharacterData`; `NPCData` and other actor models have separate schemas and derivation. — Fix: either scope the feature explicitly to character actors or add compatible Body Index schemas/derivation to every intended actor type.

- “No migration needed” is too absolute: existing documents need no data rewrite, but newly imported bioware requires the new system version and older worlds/modules need graceful unknown-type behavior. — Fix: say “no stored-document migration expected” and add compatibility/version requirements plus import validation.

- Testing only pure math and Quench misses the highest-risk behavior: schema registration and the exact Essence → Magic preparation order. — Fix: add Foundry-side tests for model construction, installed toggling, mundane/awakened derivation, Magic reduced to zero, natural-Body cap, and repeated prepares.

- Repeated preparation is an important edge case because `_calculateAttributeValues` adds item totals onto `.mod`; bioware increases the chance of double accumulation if Foundry does not reset derived state exactly as assumed. — Fix: add an idempotence test that prepares the same actor twice and confirms Body, Reaction, Body Index, Essence, and Magic do not drift.

VERDICT: REVISE
### Claude's response
Verified every code claim against the repo — Codex read the actual source; all confirmed:
- CyberwareData uses `attributeMods` (not `modifiers`); `streetIndex` is StringField; `ratingStats` rows carry cyberware `essenceCost`. → BiowareData now mirrors the EXACT field names/types and gets its OWN rating rows carrying `bodyCost`. Chose the non-refactor path (Codex's safer option).
- `magic.type !== "none"` is the clean, pre-derivation awakened signal (even has a getter, stays true at 0 Magic). → Adopted; `isAwakened` captured at top of `prepareDerivedData`, passed into the collector. Dropped the composite race/tradition idea.
- Natural Body = `body.base + body.racial` clamped by `racialMaximums`, before item mods. → `bodyIndex.max` now computed from a shared `naturalAttributeValue("body")` helper before the modifier pass; never reads `body.value`/`.mod`.
- Registration is `CONFIG.Item.dataModels` in sr2e.mjs + `_index.mjs` export + system.json; template gates on `type==="cyberware"`; `onToggleEquip` routes cyberware→installed else equipped; actor context exposes only `context.cyberware`. → Plan now enumerates every registration/sheet/toggle/context point explicitly.
- `bodyIndex` must be a declared SchemaField (strict models). → Added to CharacterData.defineSchema as `{value,max}`.
- `_collectItemModifiers`/`_calculateAttributeValues` are CharacterData-only; NPCData derives nothing from items. → Body Index scoped to `character`, matching how cyberware already behaves on NPCs (NPC parity = backlog). This is design-consistent, not a gap.
- Idempotence: `.mod` accumulates → bioware folded into the SINGLE existing collect pass; added a double-prepare drift test.
- Added: `actualBodyCost`/`actualCost` getters (mirror `actualEssenceCost`), cultured nuyen ×4 application point, autoEssence honored for bioware, rounding policy (no per-item rounding; ceil/floor for the two penalties), pure helpers take normalized primitives + bad-input handling, Quench tests for registration/order/cap/idempotence.
Accepted essentially all of Round 1. Rejected nothing material. Only deviation: keep CyberwareData untouched (mirror its fields in BiowareData) rather than refactor a shared base — lower blast radius.

## Round 2 — Codex
Most Round 1 findings are addressed, but several material inconsistencies remain:

- `actualBodyCost` is defined as per-item rounded to two decimals, while the pure helpers explicitly retain unrounded cultured costs until after summation; `_collectItemModifiers()` then sums `actualBodyCost`, producing different Body Index and Essence totals from the tested helper. — Fix: make the canonical mechanical getter return the unrounded effective cost and round only the rendered total, or consistently round per item everywhere.

- `actualCost` is not integrated with the real purchasing path: `actor-sheet.mjs` and `sheet-actions.mjs` calculate purchases and sales from `item.system.cost`, so merely saying “chargen reads actualCost” will not make cultured bioware cost ×4. — Fix: explicitly update purchase, drop-purchase, sale/refund, resource-spend summaries, and price display paths to use one type-aware effective-cost helper.

- The content description says `actualCost` is the “source nuyen,” but a getter-derived value should not be stored in compendium source data; storing it would either be discarded by the strict schema or double-apply the cultured multiplier. — Fix: store the printed pre-grade/base `cost` and derive `actualCost`, with validation that compendium JSON never contains `actualCost`.

- Rated-stat derivation remains ambiguous: CyberwareData copies the selected rating row into its flat fields during `prepareDerivedData`; the plan instead says both “getter” and “rating-row lookup like cyberware.” — Fix: specify that `BiowareData.prepareDerivedData()` copies the selected row’s `bodyCost`, `cost`, availability, and street index before getters apply grade multipliers.

- The fallback behavior for a missing rating is inherited without scrutiny: CyberwareData uses the last row, even when rows are unsorted or the requested rating is below all entries. — Fix: require sorted unique rating rows and define an exact-match fallback explicitly, preferably clamping to the nearest valid rating.

- `_collectItemModifiers()` currently takes no parameters, but awakened status must enter that collection without consulting mutable derived Magic state. — Fix: explicitly change it to `_collectItemModifiers({isAwakened})` and pass the captured boolean from the top of `prepareDerivedData`.

- `bodyIndex.value` is described as being mutated inside `_collectItemModifiers()`, mixing aggregation with actor mutation and weakening idempotence. — Fix: return `bodyIndex` in the modifier result and assign `this.bodyIndex.value` exactly once in `prepareDerivedData`.

- The idempotence explanation is incorrect: keeping bioware in one collection pass does not prevent `.mod` drift; `_calculateAttributeValues()` still adds totals onto the existing `.mod`, relying on Foundry to restore source/AE state before each preparation. — Fix: document that dependency and make the Quench test exercise real actor `prepareData()` cycles with a bioware modifier and an Active Effect, not direct repeated calls to `prepareDerivedData()`.

- The proposed helper inputs duplicate grade calculation even though actor derivation consumes `actualBodyCost`; this creates two canonical representations and caused the rounding conflict above. — Fix: either have all aggregation consume normalized `{installed, effectiveBodyCost}` rows or have both model and pure aggregation call the same pure `effectiveBodyCost()` helper.

- “Unknown-type docs degrade gracefully” is unsupported and not necessary to promise; Foundry behavior for documents whose type is absent from the installed system version may not be graceful. — Fix: replace this with a hard module dependency/minimum-system-version declaration and validate it in `module.json`.

- The Body Index penalties are displayed, but the plan does not define the zero-floor: `ceil(value-max)` becomes negative below the cap. — Fix: derive overstress as `Math.ceil(Math.max(0, value - max))`.

- The item-sheet registration surface still omits the header icon branch, and bioware rating rows need separate add-row defaults because the existing action creates `essenceCost`, not `bodyCost`. — Fix: add the bioware icon and make `_addRatingRow` type-aware so bioware rows contain `bodyCost`.

VERDICT: REVISE
### Claude's response
All 12 findings are legitimate consistency bugs; accepted all. Notable arbiter call on the cost path:
- **actualBodyCost rounding / two-representation conflict:** made `actualBodyCost` return the UNROUNDED effective cost via a single shared pure `effectiveBodyCost()` that both the model getter and the Vitest helper call. Rounding is render-only (2 dp). One canonical representation → model totals == tested totals.
- **actualCost ×4 purchase-path integration:** REMOVED the feature instead of threading it through drop-purchase/sale/refund/resource paths. The book's equipment table already prints cultured/neural nuyen at its real price, so the compendium stores the listed `cost` and `cost` stays authoritative — zero purchase-path changes (smaller blast radius, matches the user's minimize-bugs steer). Documented limitation: a manual in-Foundry grade flip re-derives body cost but not nuyen; GM adjusts. This is a scope REDUCTION vs Codex's proposed fix, and I own that trade.
- **Compendium never stores derived values:** `validate` asserts JSON carries only base `bodyCost`/`grade`/listed `cost`.
- **Rated-stat derivation:** `prepareDerivedData()` copies the selected row's fields (mirroring CyberwareData) with sorted-unique rows + exact-match-else-clamp fallback (not "use last row").
- **`_collectItemModifiers({isAwakened})`** explicit signature; collector RETURNS the bodyIndex total, `prepareDerivedData` assigns `this.bodyIndex.value` once (aggregation ≠ mutation).
- **Idempotence explanation corrected:** the no-drift guarantee comes from Foundry restoring SOURCE + reapplying AEs each `prepareData()`, not from a single pass. Quench test runs the real `actor.prepareData()` cycle twice with a bioware mod AND an AE present.
- **Overstress zero-floor:** `Math.ceil(Math.max(0, value - max))`.
- **Registration:** added the item-sheet header icon branch + type-aware `_addRatingRow` (bioware rows get `bodyCost`).
- **Unknown-type "graceful":** dropped; replaced with a hard `relationships.systems` min-version dependency in the module's `module.json`.
Rejected nothing. One deliberate scope reduction (drop actualCost) logged above.

## Round 3 — Codex
Round 2’s material findings are addressed. The derivation order, canonical cost math, collector behavior, idempotence test, purchase scope, registration, and module compatibility requirements are now implementable.

Two minor cleanup items remain:

- Section 6 says “`actualBodyCost` display-rounds,” which conflicts with the explicitly unrounded getter. — Fix: say “templates round `actualBodyCost` to two decimals.”
- `SR2E.biowareGrades` still advertises a nuyen ×4 multiplier despite the deliberate decision not to derive cost. — Fix: omit the unused cost multiplier or label it informational-only to prevent accidental application.
- “Sorted, unique ratings” is stated but not enforced. — Fix: validate rating rows in the content validator and reject duplicate ratings in the item-sheet action.

These are not structural blockers.

VERDICT: APPROVED
### Claude's response
APPROVED. Folded the three non-blocker cleanups: (1) reworded to "templates round actualBodyCost to 2 dp" (model value stays unrounded); (2) biowareGrades nuyen ×4 marked informational-only, never auto-applied; (3) sorted/unique rating rows now explicitly enforced in the content validator and the item-sheet add-row action. Plan converged in 3 rounds.

## Act 3 — Build (Claude implemented, Codex reviewed the diff read-only)
Codex reviewed the actual Part A implementation (6 findings). Claude's dispositions:
- **ACCEPTED — mechanical rounding:** `bodyIndexTotal` + the collector rounded the total to 2 dp, contradicting the locked "unrounded model, round-at-render" decision. Removed the rounding (raw sum); display uses `formatEssence`; Vitest sums switched to `toBeCloseTo`.
- **ACCEPTED — item-sheet showed raw `actualBodyCost`:** wrapped both spots in `formatEssence`.
- **ACCEPTED — bioware not grouped/localized:** context now sorts bioware by `bodySystem` and passes `config.bodySystems`; the row localizes the label.
- **ACCEPTED — Quench gaps:** idempotence snapshot now includes Magic; added an installed-toggle case and an "awakened stays awakened after Magic hits 0" case (guards the magic.type signal against oscillation).
- **REJECTED (logged) — object-shape helper API:** kept `effectiveBodyCost(bodyCost, grade)` positional. The row-level helpers already take normalized objects and no Foundry document is passed into any helper, so the plan's anti-coupling intent holds; a 2-arg leaf math fn is cleaner than a 1-key object.
- **REJECTED (logged) — floor `_naturalAttribute` at 1:** would change attribute math for 0-base actors. The refactor is behavior-identical to the original (`Math.max(1, natural+mod)` preserved in `_calculateAttributeValues`), and cap = pre-floor natural is intentional per the plan; real characters always have Body ≥ 1 so the cap is never 0 in play.
Re-verified: 246 Vitest pass; all edited files `node --check` clean. Confirmed SOUND by Codex: rating-row selection, add-row `bodyCost`, installed toggle, `noReactionBonus`, registrations, localization, all Handlebars helpers exist.
