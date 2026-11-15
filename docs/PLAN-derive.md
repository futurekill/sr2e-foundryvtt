# Plan: the pure derive layer (chargen milestone M2)
_Draft 1 (2026-11-15). Implements milestone **M2 Derive extraction** of the standalone character generator
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
registered by content modules at `init`), and other documents (bound elementals for the sustain penalty). The first
M2 task turns this paragraph into `docs/DERIVE-INVENTORY.md`: every method, its inputs, its outputs, its
both-directions assignments (CLAUDE.md "Derived state must be cleared").

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
- **Declared reads**: each derive function exports `reads = [...]` (context paths). In tests the context is wrapped
  in a recording Proxy; a parity test fails when a function reads a path it didn't declare (D9). Production uses the
  plain object (no Proxy cost).

## 3. Source normalisation (M2a; round 7 #1 of the chargen plan)
The creator starts from minimal or raw sources, Foundry from instantiated ones. A build step
(`tools/derive/schema-export.mjs`, run in Foundry by a Quench helper and committed) exports each TypeDataModel's field
tree as a plain descriptor (`schema/data-models.json`: type, initial, nullable, blank, integer, min/max, choices,
nested fields, arrays). `module/derive/normalize.mjs` applies it like Foundry's `cleanData` (defaults, coercion,
clamping — Foundry 13 CLAMPS out-of-range numbers, CLAUDE.md "NPC Essence"; the `blank` rule; nested defaults). A
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
Quench batch `sr2e.derive-parity` (the Foundry path needs Foundry): for each fixture, prepare the actor in Foundry,
then run the pure path on `contextFromActor` of a FRESH, unprepared copy of the same sources, and compare the D12
projection (`module/portable` shares it) field by field. Fixtures (the chargen plan's M2 gate): every pregen in
`packs-src/runners` and each content module's archetypes; edits (an attribute raised, an item's rating changed);
removals (a ware item, a skillsoft, a VCR, a deck, a bonded focus — the derivation-removed trap); **prepare twice**;
Active Effects on/off (supported keys and an unsupported one, actor and item-transferred); module-enabled characters
(Cybertechnology, Shadowtech, Companion qualities); an elemental sustaining its magician's spell via `lookup`, and the
same with the elemental unavailable. Vitest adds the Node side: every `module/derive/**` file imports with NO Foundry
globals defined, and the declared-reads check over recorded contexts (fixtures exported by the Quench batch as JSON
into `test/fixtures/derive/`, refreshed by a script).

## 6. Content modules (D1 "registration as pure adapters")
Each content module that registers tables at `init` (spirit types, totem groups, vehicle list rows, Workshop tables,
qualities) exports `register(registries)` from a pure file; its Foundry `init` hook becomes `register(CONFIG.SR2E…)`.
The system's adapter builds `ctx.registries` from the same calls, so the creator can register the modules it pins.
One module per small release, after M2a.

## 7. The Active Effects audit (D3)
`docs/DERIVE-AE-AUDIT.md`: every AE the system or a module creates on a character, classified (a) derived from item
data, (b) transient play state carried opaquely, (c) to convert. Category (c) is a blocker list fixed in the system
before the creator ships (M3 depends on it, not M2's releases).

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
