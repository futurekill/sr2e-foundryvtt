# Plan: the pure derive layer (chargen milestone M2)
_Draft 13 (2026-11-15), after Codex rounds 1–12 (9 + 3 + 3 + 2 + 5 + 3 + 3 + 3 + 4 + 3 + 3 + 3 findings, all taken). Implements milestone **M2 Derive extraction** of the standalone character generator
(../sr2e-chargen/docs/PLAN.md, approved at Codex round 12): decisions **D1** (the system repo is the shared package),
**D2** (behaviour-preserving, incremental, parity-tested), **D3** (Active Effects audit), **D9** (an explicit
`DeriveContext`) and the M2 gate. Those decisions are the requirement; this plan makes them buildable._

## Goal
A character's derived state (attributes, Essence, Magic, Body Index, Initiative, Reaction, the deck/persona/Hacking
Pool, dice pools, armor, condition monitors, the chargen budget) computed by pure functions in `module/derive/` that
take ONE `DeriveContext` and run in Node and the browser with no Foundry globals. `CharacterData` and the item data
models become thin callers. Foundry's output must not change by one value: every release keeps the 1,690 unit tests
and every Quench batch green and adds a parity test for what it moved.

## 1. What runs today (inventory)
`CharacterData.prepareBaseData` → `_applyRacialModifiers`. `CharacterData.prepareDerivedData` (actor-data.mjs ~388),
in order: VR2 connection (`liveOpen(eventsOf(parent))`, `isVR2()`), psychotropic conditions, `matrixMode` (from
`parent._source` when no log), `_collectItemModifiers({isAwakened})`, substance Essence loss (`substancesOf(parent)`),
Essence (setting `autoEssence`), `_calculateAttributeValues`, `_applyLimbAverages`, `_applyArticulation`,
`_applyCybermancy`, the CCSS override (`_mbwFold`), move-by-wire dice, Body Index, the VCR (`parent._source`,
`isRigger2()`), social penalties, `_calculateDicePools`, `_calculateArmor`, `_snapshotActiveDeck`, `_derivePersona`,
`_applySkillsofts`, `_calculateHackingPool`, `_applyAdeptSkills`, `_applyWeaponFoci`, `_applyUnarmedPower`, then
monitors. Items: 9 `prepareDerivedData` in item-data.mjs (skills, weapons incl. `strengthMinWeaponStats`, ware rating
tables, armor, focus, lifestyle, …). Reads from outside `this`: `game.settings` (autoEssence, vehicle/matrix
rulesets, R2 options, cyber options), `this.parent` (items, `_source`, flags, effects), event logs (`eventsOf`,
`substancesOf`, `foldMbw`, `foldCym`, permanent damage, shapeshift), world time, `CONFIG.SR2E` tables (some
registered by content modules at `init`), and other documents (bound elementals for the sustain penalty). First pass done: `docs/DERIVE-INVENTORY.md` (2026-11-15, CharacterData); the item models are the next pass. It records every method, its inputs, its outputs, its
both-directions assignments (CLAUDE.md "Derived state must be cleared").

### 1.1 The preparation pipeline, made explicit (round 1 #4)
One order, the same in Foundry and in the pure path: (1) **source reset** — the working copy is rebuilt from `source`
(Foundry does this for the actor's system; embedded items are NOT re-initialized, so their derived fields are reassigned
both ways, CLAUDE.md); (2) **base preparation** (`prepareBaseData`: racial modifiers); (3) **embedded preparation**
(each item's `prepareDerivedData`, with its item context); (4) **Active Effects**: the eligible effects (actor +
item-transferred, not disabled, not suppressed), their CHANGES flattened and ordered exactly as Foundry v13 does
(round 2 #1: each change's priority defaults to `mode × 10`; a STABLE sort by priority only, so equal priorities keep
collection order — actor effects, then transferred ones), applied ONCE — only the supported keys; (5) **actor derivation** (`prepareDerivedData`). In Foundry the adapter runs inside the data
model's own hooks at those points, so nothing is applied twice; the standalone path runs all five. Fixtures: mixed
priorities, ADD vs OVERRIDE on one key, EQUAL explicit priorities with mixed modes (OVERRIDE 5 then ADD 2 = 7), an
actor/transferred tie, a suppressed effect, a transferred effect, a disabled event marker (never
applied).

### 1.2 Every block has a milestone (round 1 #2)
`docs/DERIVE-INVENTORY.md` gains a column assigning EVERY preparation block, helper, item getter and actor getter to a
milestone, and each keeps its execution position (a thin call where the code is today, round 1 #9). Beyond §4's list:
`_applySkillsofts`, `_applyAdeptSkills`, `_applyWeaponFoci`, `_applyUnarmedPower` → **M2j** (skills and foci, after
M2f's pools, as today); the actor getters (round 9 #2: `woundPenalty` reads `withdrawalStun`, which folds substance state from
`system.parent` — it becomes an explicit `ctx` read, with a withdrawal-at-zero-Stun fixture; `woundPenalty`, `sustainPenalty`, `mpcpOverloadPenalty`, `bodyOverstressTN`,
`isMagical`/`isDecker`/`isRigger`) → **M2h** with the monitors, except `astralReaction` → **M2d** (round 3 #1: M2d's
Initiative reads it when projecting — a plain system would give `undefined + 15`; fixtures: a projecting magician and a
projecting shapeshifter, Node and browser); the item getters `actualEssenceCost`,
`actualBodyCost`, adept `totalCost` (round 1 #1) → pure computations evaluated at their EXISTING consumption points,
after the actor has assigned the markers they read (`limbEssence`, `limbDiscount`) — never snapshotted at item
preparation.

## 2. The context and its Foundry adapter (M2a)
- `module/derive/context.mjs`: `DeriveContext = { source, system, items, effects, events, flags, uuid, now, settings,
  registries, lookup }` exactly as D9 defines it (`source` immutable actor + embedded sources; `system` the working copy
  being prepared; `items` prepared items; `effects` the EFFECTIVE AEs incl. item-transferred ones, eligibility and
  order as Foundry's; `events` from the complete sources, disabled markers included; `settings` a plain object of the
  keys derivation reads; `registries` the module-registered tables; `lookup(ref)` → document | absent | unavailable).
- `module/derive/foundry-adapter.mjs`: `contextFromActor(actor, system)` builds it from a live actor (the only place
  that touches `game`, `CONFIG`, `fromUuidSync`). The creator writes its own adapter (M3).
- **Items without a character owner** (round 5 #3): every item data model prepares, including world and compendium
  items (a standalone Program) and items owned by an NPC, a vehicle or a spirit. `contextFromItem(item, system)` builds
  the ITEM context with an explicit `owner`: `null` (unowned: only what the item derives from itself), or a plain
  record of the owning actor's `type`, `uuid`, item facade and flags (non-character: every item derivation runs exactly as today for every owner type — round 9 #1: CyberwareData has
  no owner-type guard, so an NPC's linked limb option is priced as now; a branch is skipped ONLY where the current code
  itself skips it). M2a parity covers a world Program, a compendium Program, an NPC-owned and a vehicle-owned item.
- **Settings and rulesets come from the context, never globals**: `isVR2()`, `isRigger2()`, `r2Option()`,
  `game.settings.get(...)` calls inside code that moves into `module/derive/` are replaced by `ctx.settings` reads;
  the global helpers stay for live-play code. The live adapter builds `ctx.settings` as a SAFE snapshot (round 11
  #1): each key read through today's guarded path with today's fallback when settings aren't registered yet
  (`autoEssence` true, VR2 and its options false), so preparing a character or a world Program at startup behaves as
  now; a fixture prepares both before registration. That includes helpers that SWALLOW a missing global (round 5 #1):
  `utilityOptionsOn()` (VR2 utility options, read by `ProgramData.prepareDerivedData`) catches a missing `game` and
  returns false, so Node would silently derive an optioned program's size and cost wrong; it becomes
  `ctx.settings.vr2UtilityOptions`. `CONFIG.SR2E.languageFamilies` (the synthetic LinguaSoft skill path) becomes
  `ctx.registries.languageFamilies`. The no-globals Vitest therefore also fails on a `try { … game … } catch` /
  `globalThis.game?.` read inside `module/derive/**` (a lint rule over the moved files), and the inventory lists both
  reads. Fixtures: an optioned utility program with the setting on and off; a synthetic language skill from a LinguaSoft.
- **Plain records, real accessors** (round 1 #3): the item context's `owner` is a plain record with `items.get(id)`
  (a collection FACADE, round 5 #2 — not a bare Map and not an array: `get(id)`, `has`, `find`, `filter`, `some`,
  `map`, `size` and iteration over values, in Foundry's own order, i.e. the `items` source array order, which
  `EmbeddedCollection` keeps; a Vitest runs the moved deck selection (`items.find(…)`) and the skill loops against it) and each item's `_source`, `flags`, `_stats.compendiumSource` and `uuid`, so
  cyberware's `parent.parent.items.get(id)._source.system` and QualityData's compendium source move verbatim; the
  transitive helpers move with them (`designOf` for ProgramData joins the helper-split list). Prototype METHODS the
  actor calls on items are extracted too (round 2 #2): `SkillData.applyLanguageRatings` (called again by
  `_applySkillsofts` after a LinguaSoft changes ratings) becomes a pure helper in M2a, every actor-side call replaced;
  fixtures: a LinguaSoft slotted, replaced, removed, prepared twice.
- **Raw effect membership** (round 2 #3): `programUnusable` (used by `_derivePersona`) asks `actor.effects.has(claimId(…))`
  for a DISABLED one-shot receipt — neither `ctx.effects` (eligible only) nor a plain array answers that. It becomes an
  explicit lookup over the complete sources (`ctx.events.hasMarker(id)`), inventoried; fixture: a spent one-shot program
  stays unusable in Foundry, Node and the browser.
- **Localization stays out**: derivation labels attribute sources through `game.i18n` today (three methods); the pure
  layer returns label keys + params and the adapters localize (docs/DERIVE-INVENTORY.md "Hidden reads"). The golden
  projections record those CANONICAL tokens (round 8 #2: a dwarf's racial source is `{ key, params }`, not its English
  string), parity compares tokens, and a separate test checks the Foundry adapter's localized `attributeSources`.
- **Helpers split first**: flag-only helpers that live in Foundry-coupled modules (`substancesOf`, `drugsInForce`,
  `workingImplant`, `eventsOf`, `programmingState`, `effectChanges`, `elementalHolderOf` → `lookup`, `variableLTGOn`)
  move to pure files with re-exports, in the release that first needs them (inventory "Helpers to split").
  `drugsInForce` is NOT given `ctx.effects` (round 4 #1): it reads the actor-OWNED raw effect sources (no transferred
  effects, suppressed ones included, disabled and zero-duration `_source.duration` excluded, creation order kept) —
  the adapter passes exactly that view as `ctx.ownEffectSources`; parity cases: a suppressed MAO dose, a transferred
  effect, a zero-duration (tracking-only) dose, each against an adrenal pump.
- **No hidden globals, ever** (round 1 #8): `globalThis.game?.time?.worldTime ?? 0` in `_wareCyberInteractions` (and any
  `?? default` fallback on a global) becomes `ctx.now`; a lint rule forbids `game`, `CONFIG`, `globalThis.game`,
  `fromUuidSync`, `canvas` under `module/derive/**`.
- **Declared reads**: each derive function exports `reads = [...]` (context paths). In tests the context is wrapped
  in a recording Proxy; a parity test fails when a function reads a path it didn't declare (D9). Production uses the
  plain object (no Proxy cost).

## 2.1 Unavailable dependencies (round 1 #7)
`lookup(ref)` returning `unavailable` THROWS `DependencyUnavailable` out of the derive function that asked. What the
adapter does with it depends on the mode (round 8 #1): the **live Foundry adapter** never sees it — its `lookup`
keeps today's behaviour (an unresolved reference during world load is `absent`/null, as `_applyCybermancy` treats a
spell origin now), so live preparation is unchanged; the **portable/creator adapter** catches it and falls back to
D12 (view-only from the document's stored snapshot) ONLY when that snapshot exists, and otherwise shows the document
as unavailable with a warning — never a plausible wrong number. `absent` is a normal result (genuinely empty or deleted). Consumers named: `_applyCybermancy` (a spell origin),
`sustainPenalty` → `elementalHolderOf` (a bound elemental). Fixtures for both: resolved, absent, unavailable.

**Document methods on plain records** (round 3 #2): every derive-path read through a Document METHOD becomes an
explicit data read — `chargenBudgetOf` (actor-sheet.mjs) calls `i.getFlag(…)` on every item and `liveBoundSpirits`
(elementals.mjs) uses `a.getFlag?.(…)` to exclude departed spirits (on a plain record the optional call silently
returns undefined, so a departed sustaining elemental would exempt its caster from the sustaining penalty). Both read
`flags.sr2e.*` directly; a lint rule in module/derive/ forbids `getFlag`/`?.(` method calls on context records.
Fixtures: the recorded ammunition value in the chargen budget, and a resolved-but-departed sustaining elemental.

## 3. Source normalisation (M2a; round 7 #1 of the chargen plan)
The creator starts from minimal or raw sources, Foundry from instantiated ones. A build step
(`tools/derive/schema-export.mjs`, run in Foundry by a Quench helper and committed) exports each TypeDataModel's field
tree as a plain descriptor (`schema/data-models.json`: type, required, initial, nullable, blank, integer, min/max,
choices, nested fields, arrays, and each field SUBCLASS's effective validation options — round 12 #2: a
`DocumentUUIDField`'s target `type` and `embedded` status, e.g. FrameData's Actor UUID fields, so an Item UUID is
rejected as Foundry rejects it; a test per subclass) — round 1 #6. `module/derive/normalize.mjs` applies it like Foundry's `cleanData` (defaults, coercion,
clamping — Foundry 13 CLAMPS out-of-range numbers, CLAUDE.md "NPC Essence"; the `blank` rule; nested defaults;
StringField TRIMMING, round 3 #3: v13's `StringField` defaults to `trim: true` and trims before cleaning, so the
descriptor records each field's effective `trim` and the normaliser applies it — `system.race: " troll "` must become
`"troll"` or racial modifiers are lost; whitespace-only and padded-string parity cases). Two versioned contracts (round 1 #6): `normalizeSystem` (defaults, coercion,
clamping) and `validateSystem` (required, null, blank, choices — the errors Foundry raises); the boundary is the
`system` object (document-level fields — name, img, ownership, `_stats` — are the adapters' job). Tests: missing,
null, blank, invalid-choice, string-number coercion and out-of-range clamping cases for every constraint kind, each
compared with Foundry's own result. A
Quench test compares `normalizeSource(type, raw)` with `new Actor/Item(raw).toObject().system` (round 12 #3: the
contracts' boundary is `system`; document-level fields are tested separately against the adapter) for a minimal new actor of
every type and EVERY raw `packs-src` item of the system and the content modules; a CI check fails when
`schema/data-models.json` is stale against the live models. Dynamic choices (round 11 #2: a function such as
ICData's `program`, reading `CONFIG.SR2E.icPrograms`) are exported as REGISTRY REFERENCES (`{ registry: "icPrograms" }`),
never frozen lists; the normaliser resolves them against `ctx.registries`, and a test normalises after module
registration.

## 4. Extraction order (one release each; D2)
- **M2a** context, adapter, declared reads, normaliser + schema export, the parity harness (§5) with its golden
  projections, and the consumable package — and NO derivation moved (round 6 #1: D2's one derivation per release).
- **M2a.1 … M2a.n** item preparation, ONE item type per release (the 8 item `prepareDerivedData` (round 10 #1: eight, not nine) →
  `module/derive/items/*.mjs`, the data model calling it): one item type per release, no pairing. Each release passes
  the full parity gate on its own.
- **M2b** attributes: racial modifiers, `_collectItemModifiers`, `_calculateAttributeValues`, limb averages,
  articulation, cybermancy, CCSS (the limb/ware/cym rule modules are already pure — moved callers only).
- **M2c** Essence, Magic, Body Index (incl. substances, autoEssence, signed Essence).
- **M2d** Initiative and Reaction (VCR, move-by-wire vs rig, adept/ware/AE `initiative.mod`).
- **M2e** deck, persona, Hacking Pool (`_snapshotActiveDeck`, `_derivePersona`, `_calculateHackingPool`; fixtures:
  buying, replacing, unloading a deck or program — chargen round 6).
- **M2f** dice pools; **M2g** armor; **M2h** condition monitors.
- **M2i** the chargen budget: `chargenBudgetOf` / `priorityTableFor` move from `sheets/actor-sheet.mjs` into
  `module/derive/chargen.mjs` (reading `ctx.registries`, not `CONFIG`).
- **Item getters** (round 9 #4): EVERY prototype getter on an item data model is inventoried and assigned to its item
type's M2a.n release, with projection parity cases — `parsedDamageCode` (weapon), `parsedDrainCode` and `drainTarget`
(spell), `actualEssenceCost` (cyberware), `actualBodyCost` (bioware), `totalCost`, `signedValue` and any other; the
getter-only types (round 10 #1: `SpellData` and `AdeptPowerData` have computed getters but no preparation) get
their own gated M2a.n releases. A getter stays ON DEMAND (round 10 #2): the pure layer exports it as a function of the
item and the context at call time, never materialized during item preparation, because `actualEssenceCost` must see
the limb markers the actor assigns later (parity cases: a cyberlimb's Essence with an option added and removed).
- **M2j** skills and foci (round 6 #2): `_applySkillsofts`, `_applyAdeptSkills`, `_applyWeaponFoci`,
  `_applyUnarmedPower` (§1.2), after M2f's pools as today.
**The M2 gate** (what M3 waits for): every block in docs/DERIVE-INVENTORY.md's milestone column moved, M2a–M2j
released, and a Vitest that fails while `CharacterData` or an M2-assigned item computation (incl. the getter-only
types) still computes instead of calling `module/derive/` (round 10 #3: vehicle derivation is M8's, out of scope).
**One computation per release** (round 7 #2, D2): each bullet above is a GROUP; every computation it names
(racial modifiers, item-modifier collection, limb averages, articulation, cybermancy, CCSS …; each item type in
M2a.n — no pairing) ships in its own gated release, its call kept at its current preparation position.
Each step: move the code verbatim behind the context, the data model calls it, parity + existing tests green, no
behaviour change, CHANGELOG "Changed (internal)" only.
**The consumable package (D1; round 4 #2)** is an M2a deliverable and a gate of every M2 release: the release workflow
also builds `sr2e-core-<version>.tgz` from the same tag with an explicit allow-list matching D1 (round 5 #4: `module/derive/**`, `module/rules/**`,
`module/portable/**` — the D12 codec and projection — the schema descriptor, the static tables, package.json `exports`;
the static tables are the data half of `module/config.mjs`, split in M2a into `module/tables/*.mjs` with no Foundry
reads, `config.mjs` re-exporting them), publishes it beside the Foundry ZIP, and a CI job unpacks THAT archive
and runs the Node parity suite and a browser import smoke test against its contents — importing every creator-facing
export AVAILABLE AT THAT RELEASE (round 7 #1: a manifest in the package lists them and grows release by release — the
derive entry, the D12 codec and projection and the tables from M2a; `priorityTableFor` from M2i; the full API at the M2
gate) — so a missing file fails the release.

## 5. The parity harness
**Golden projections** (round 1 #5): before M2a moves anything, the harness records the CURRENT code's prepared
projections (actor AND embedded items) for every fixture into `test/fixtures/derive/golden/` (with the system version);
each extraction release must reproduce them exactly — so a regression shared by the thin caller and the pure path still
fails. Edits, mechanism removals and repeated preparation run on PERSISTENT working instances (the same objects
prepared again), not fresh copies, so stale item fields show up.

Quench batch `sr2e.derive-parity` (the Foundry path needs Foundry): for each fixture, prepare the actor in Foundry,
then run the pure path on `contextFromActor` of a FRESH, unprepared copy of the same sources, and compare the D12
projection (`module/portable` shares it) field by field. Sequences (round 6 #3) run on PERSISTENT instances on BOTH
sides: one Foundry actor and one pure working state, each edited, stripped of a mechanism and prepared again in the
same steps, compared after EVERY step — so a pure path that keeps an adept bonus or a chip's rating on the second
preparation fails, just as the Foundry side would. Fixtures (the chargen plan's M2 gate): every pregen in
`packs-src/runners` and each content module's archetypes; edits (an attribute raised, an item's rating changed);
removals (a ware item, a skillsoft, a VCR, a deck, a bonded focus — the derivation-removed trap); **prepare twice**;
Active Effects on/off — SUPPORTED keys (actor and item-transferred) compared field by field; an UNSUPPORTED one — classified per CHANGE by
key, mode AND value before derivation (round 11 #3: `MULTIPLY` on the supported `system.reaction.mod` is unsupported)
(round 5 #5) is not a parity case: per D9 the pure path marks the affected document view-only and returns its D12
snapshot, so the fixture asserts the whole-document snapshot fallback and the warning, not field equality; module-enabled characters
(Cybertechnology, Shadowtech, Companion qualities); an elemental sustaining its magician's spell via `lookup`, and the
same with the elemental unavailable. Vitest adds the Node side: every `module/derive/**` file imports with NO Foundry
globals defined, and the declared-reads check over recorded contexts; the fixtures (tagged with the D12 codec so Sets,
Maps and references survive JSON, round 1 #8) REPLAY through a plain-data `lookup` resolver in Node and in a headless
browser (the puppeteer-core setup the wiki media uses) and must match the golden projections — including nonzero
clocks, a substance clock different from world time, voided permanent-damage records and a shapeshifter in animal
form. **Until the pure pipeline is complete** (round 12 #1: M2a moves nothing, and a later stage may read a value an
earlier, not-yet-moved stage changed), each release's stage parity runs on INPUTS CAPTURED from Foundry at that
stage's position (the working copy just before it), not on a full pure replay; the full replay becomes the gate once
every stage is pure. Release ORDER respects producer before consumer: skillsoft application (M2j's
`_applySkillsofts`) is extracted BEFORE M2e's Hacking Pool, which reads the chipped Computer rating (its call position
stays where it is). **Intermediate-state parity** (round 1 #9): each release also compares the working copy right after its own
stage, and documents the cross-stage inputs it reads (e.g. M2b's cybermancy reads the signed Essence assigned before
it, still in its original position).

## 6. Content modules (D1 "registration as pure adapters")
Each content module that writes a registry, at ANY hook (round 7 #3: the Grimoire adds its Druid totems at `setup`),
— spirit types, totems and totem groups, vehicle list rows, Workshop tables, qualities — exports `register(registries)`
from a pure file; its Foundry hook becomes `register(CONFIG.SR2E…)`. The inventory lists every `CONFIG.SR2E` writer in
the system and the modules regardless of hook. A grep can't prove parity (round 8 #3: Cyberpirates writes through an
alias, `S.spiritProfiles.ancestor`), so each module's Quench test compares complete registries from the SAME starting state (round 9 #3): both paths
start from the core system's registries, apply the enabled modules in hook order (Foundry: their hooks; pure: their
`register()` calls), and the results must be deep-equal, per registry.
The system's adapter builds `ctx.registries` from the same calls, so the creator can register the modules it pins.
One module per small release, after M2a.

## 7. The Active Effects audit (D3) — done
`docs/DERIVE-AE-AUDIT.md` (2026-11-15): no category (c) blocker in shipped content (every shipped effect is a sustained
spell or a drug dose, both with supported keys). One gap: `system.dicePools.<pool>.bonus` (Combat Sense, four
shipped spells) is a real AE hook missing from D9's supported list — M2a adds it to the supported keys (CLAUDE.md
too) with a Combat Sense parity fixture.

## Key decisions & tradeoffs
- **Mutating the working copy** (`fn(ctx)` writes `ctx.system`) instead of returning new objects: the code moves
  verbatim, so behaviour is preserved; purity means "no globals, no hidden reads", not immutability.
- **Schema as an exported descriptor** rather than re-declaring fields by hand: one source of truth, checked for
  staleness in CI.
- **Parity in Quench, Node tests from exported fixtures**: Foundry is the only oracle; Vitest guards purity.
- **Live play stays put**: queues, GM ops, chat cards, Matrix/vehicle/combat operations are never moved.

## Risks / open questions
- Hidden reads (a helper deep in `module/rules/` calling `game.settings`): the recording Proxy only sees context reads,
  so a Node import test with `game` undefined is what catches them — every derive entry point is called in Vitest
  with a fixture context.
- Performance: one extra object per preparation; measured on a 100-item character before/after M2a.
- Item preparation reads the PARENT actor in places (ware discounts via `wareCtx`, limb models): those items get the
  actor context too; the inventory lists each.

## Out of scope
NPCs, spirits, vehicles (M8 extracts vehicle preparation), the creator itself (M3+), live-play code.
