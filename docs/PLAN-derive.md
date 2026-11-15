# Plan: the pure derive layer (chargen milestone M2)
_Draft 2 (2026-11-15), after Codex round 1 (9 findings, all taken). Implements milestone **M2 Derive extraction** of the standalone character generator
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
item-transferred, not disabled, not suppressed), ordered as Foundry orders them (priority, then mode), applied ONCE —
only the supported keys; (5) **actor derivation** (`prepareDerivedData`). In Foundry the adapter runs inside the data
model's own hooks at those points, so nothing is applied twice; the standalone path runs all five. Fixtures: mixed
priorities, ADD vs OVERRIDE on one key, a suppressed effect, a transferred effect, a disabled event marker (never
applied).

### 1.2 Every block has a milestone (round 1 #2)
`docs/DERIVE-INVENTORY.md` gains a column assigning EVERY preparation block, helper, item getter and actor getter to a
milestone, and each keeps its execution position (a thin call where the code is today, round 1 #9). Beyond §4's list:
`_applySkillsofts`, `_applyAdeptSkills`, `_applyWeaponFoci`, `_applyUnarmedPower` → **M2j** (skills and foci, after
M2f's pools, as today); the actor getters (`woundPenalty`, `sustainPenalty`, `mpcpOverloadPenalty`, `bodyOverstressTN`,
`astralReaction`, `isMagical`/`isDecker`/`isRigger`) → **M2h** with the monitors; the item getters `actualEssenceCost`,
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
- **Settings and rulesets come from the context, never globals**: `isVR2()`, `isRigger2()`, `r2Option()`,
  `game.settings.get(...)` calls inside code that moves into `module/derive/` are replaced by `ctx.settings` reads;
  the global helpers stay for live-play code.
- **Plain records, real accessors** (round 1 #3): the item context's `owner` is a plain record with `items.get(id)`
  (a Map-backed collection, not an array) and each item's `_source`, `flags`, `_stats.compendiumSource` and `uuid`, so
  cyberware's `parent.parent.items.get(id)._source.system` and QualityData's compendium source move verbatim; the
  transitive helpers move with them (`designOf` for ProgramData joins the helper-split list).
- **Localization stays out**: derivation labels attribute sources through `game.i18n` today (three methods); the pure
  layer returns label keys + params and the adapters localize (docs/DERIVE-INVENTORY.md "Hidden reads").
- **Helpers split first**: flag-only helpers that live in Foundry-coupled modules (`substancesOf`, `drugsInForce`,
  `workingImplant`, `eventsOf`, `programmingState`, `effectChanges`, `elementalHolderOf` → `lookup`, `variableLTGOn`)
  move to pure files with re-exports, in the release that first needs them (inventory "Helpers to split").
- **No hidden globals, ever** (round 1 #8): `globalThis.game?.time?.worldTime ?? 0` in `_wareCyberInteractions` (and any
  `?? default` fallback on a global) becomes `ctx.now`; a lint rule forbids `game`, `CONFIG`, `globalThis.game`,
  `fromUuidSync`, `canvas` under `module/derive/**`.
- **Declared reads**: each derive function exports `reads = [...]` (context paths). In tests the context is wrapped
  in a recording Proxy; a parity test fails when a function reads a path it didn't declare (D9). Production uses the
  plain object (no Proxy cost).

## 2.1 Unavailable dependencies (round 1 #7)
`lookup(ref)` returning `unavailable` THROWS `DependencyUnavailable` out of the derive function that asked; the
adapter catches it and the whole document falls back to D12 (view-only from its snapshot) — never a plausible wrong
number. `absent` is a normal result (genuinely empty or deleted). Consumers named: `_applyCybermancy` (a spell origin),
`sustainPenalty` → `elementalHolderOf` (a bound elemental). Fixtures for both: resolved, absent, unavailable.

## 3. Source normalisation (M2a; round 7 #1 of the chargen plan)
The creator starts from minimal or raw sources, Foundry from instantiated ones. A build step
(`tools/derive/schema-export.mjs`, run in Foundry by a Quench helper and committed) exports each TypeDataModel's field
tree as a plain descriptor (`schema/data-models.json`: type, required, initial, nullable, blank, integer, min/max,
choices, nested fields, arrays) — round 1 #6. `module/derive/normalize.mjs` applies it like Foundry's `cleanData` (defaults, coercion,
clamping — Foundry 13 CLAMPS out-of-range numbers, CLAUDE.md "NPC Essence"; the `blank` rule; nested defaults). Two versioned contracts (round 1 #6): `normalizeSystem` (defaults, coercion,
clamping) and `validateSystem` (required, null, blank, choices — the errors Foundry raises); the boundary is the
`system` object (document-level fields — name, img, ownership, `_stats` — are the adapters' job). Tests: missing,
null, blank, invalid-choice, string-number coercion and out-of-range clamping cases for every constraint kind, each
compared with Foundry's own result. A
Quench test compares `normalizeSource(type, raw)` with `new Actor/Item(raw).toObject()` for a minimal new actor of
every type and EVERY raw `packs-src` item of the system and the content modules; a CI check fails when
`schema/data-models.json` is stale against the live models.

## 4. Extraction order (one release each; D2)
- **M2a** context, adapter, declared reads, normaliser + schema export, the parity harness (§5), and **item
  preparation** (the 9 item `prepareDerivedData` → `module/derive/items/*.mjs`; the item data models call them).
- **M2b** attributes: racial modifiers, `_collectItemModifiers`, `_calculateAttributeValues`, limb averages,
  articulation, cybermancy, CCSS (the limb/ware/cym rule modules are already pure — moved callers only).
- **M2c** Essence, Magic, Body Index (incl. substances, autoEssence, signed Essence).
- **M2d** Initiative and Reaction (VCR, move-by-wire vs rig, adept/ware/AE `initiative.mod`).
- **M2e** deck, persona, Hacking Pool (`_snapshotActiveDeck`, `_derivePersona`, `_calculateHackingPool`; fixtures:
  buying, replacing, unloading a deck or program — chargen round 6).
- **M2f** dice pools; **M2g** armor; **M2h** condition monitors.
- **M2i** the chargen budget: `chargenBudgetOf` / `priorityTableFor` move from `sheets/actor-sheet.mjs` into
  `module/derive/chargen.mjs` (reading `ctx.registries`, not `CONFIG`).
Each step: move the code verbatim behind the context, the data model calls it, parity + existing tests green, no
behaviour change, CHANGELOG "Changed (internal)" only.

## 5. The parity harness
**Golden projections** (round 1 #5): before M2a moves anything, the harness records the CURRENT code's prepared
projections (actor AND embedded items) for every fixture into `test/fixtures/derive/golden/` (with the system version);
each extraction release must reproduce them exactly — so a regression shared by the thin caller and the pure path still
fails. Edits, mechanism removals and repeated preparation run on PERSISTENT working instances (the same objects
prepared again), not fresh copies, so stale item fields show up.

Quench batch `sr2e.derive-parity` (the Foundry path needs Foundry): for each fixture, prepare the actor in Foundry,
then run the pure path on `contextFromActor` of a FRESH, unprepared copy of the same sources, and compare the D12
projection (`module/portable` shares it) field by field. Fixtures (the chargen plan's M2 gate): every pregen in
`packs-src/runners` and each content module's archetypes; edits (an attribute raised, an item's rating changed);
removals (a ware item, a skillsoft, a VCR, a deck, a bonded focus — the derivation-removed trap); **prepare twice**;
Active Effects on/off (supported keys and an unsupported one, actor and item-transferred); module-enabled characters
(Cybertechnology, Shadowtech, Companion qualities); an elemental sustaining its magician's spell via `lookup`, and the
same with the elemental unavailable. Vitest adds the Node side: every `module/derive/**` file imports with NO Foundry
globals defined, and the declared-reads check over recorded contexts; the fixtures (tagged with the D12 codec so Sets,
Maps and references survive JSON, round 1 #8) REPLAY through a plain-data `lookup` resolver in Node and in a headless
browser (the puppeteer-core setup the wiki media uses) and must match the golden projections — including nonzero
clocks, a substance clock different from world time, voided permanent-damage records and a shapeshifter in animal
form. **Intermediate-state parity** (round 1 #9): each release also compares the working copy right after its own
stage, and documents the cross-stage inputs it reads (e.g. M2b's cybermancy reads the signed Essence assigned before
it, still in its original position).

## 6. Content modules (D1 "registration as pure adapters")
Each content module that registers tables at `init` (spirit types, totem groups, vehicle list rows, Workshop tables,
qualities) exports `register(registries)` from a pure file; its Foundry `init` hook becomes `register(CONFIG.SR2E…)`.
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
