# Plan: prepare for Foundry v16 (the v14 deprecations)
_Round 3 — revised after Codex rounds 1–3 (see PLAN-v16-prep-REVIEW-LOG.md)_

## Goal
v14 deprecates three APIs this system uses, with removal in v16 (read from the v14.369 app
bundle). The system must keep running on v13 (the user's install) and v14 (verified
2026-10-16), and stop depending on the deprecated forms, for reads AND writes.

1. **MeasuredTemplate is merged into Region.**
   - v14's client shim rebuilds `scene.templates` from Regions marked
     `flags.core.MeasuredTemplate`. Those are not the same documents, and the shim's
     update path skips them; v16 removes the shim.
   - Both use `REGION_CREATE` on v14, and its default role is PLAYER.
   - v13 Regions have no cone shape.
2. **ActiveEffect changes:** `effect.changes` → `effect.system.changes`; the numeric `mode`
   becomes a string `type`.
3. **ActiveEffect duration:** `duration.seconds/startTime/type` → `duration.value` +
   `duration.units`, and `start.time`.

## Approach
1. **`module/areas.mjs`: one adapter, version-split, no shim.**
   - **Create:** `createArea(scene, spec, {author = game.user})`. The spec is the
     MeasuredTemplate data the call sites build today (`t`, x, y, distance, direction,
     angle, width, colours, texture, flags).
     - v13 (`game.release.generation < 14`): it creates that MeasuredTemplate.
     - v14+: it creates a Region from `CONFIG.Region.documentClass._migrateMeasuredTemplateData(
       {...spec, author: author.id}, {grid: scene.grid, gridTemplates:
       game.settings.get("core", "gridTemplates"), coneTemplateType:
       game.settings.get("core", "coneTemplateType"), users: [author]})`, reading the same
       settings v14's own template shim reads. That is Foundry's own conversion: cone
       curvature/rotation, grid-based shapes, rectangle grid translation, quadrant
       rotation and author OWNER, so the geometry matches exactly what v14 makes of the
       same template today. Then it adds `flags.sr2e.area = true`.
     - **Appearance on v14 is the Region's own:** a fill colour, with no texture or border
       colour (Regions have neither). The smoke image stays on the v13 template path; a
       v14 smoke cloud is a grey region.
     - If that static is ever missing (v16 renames it), a local port of the same function
       (copied, with a cite) takes over. A Vitest test pins the port against the v14
       function's outputs, captured as fixtures.
   - **Read:** `areasOf(scene)` → normalized areas. On v13 it reads `scene.templates`
     only; on v14+, `scene.regions` only, the ones carrying `flags.sr2e` (migrated old
     templates included, since v14 migrates them to regions carrying their flags). It
     never uses the shim.
     - Each normalized area is `{doc, scene, shape: "circle"|"cone"|"rect", x, y, radius,
       flags, polygon}`. `radius` is in SCENE DISTANCE UNITS, as the code uses
       `template.distance` today (metres on this system's 1 m scenes, feet on a 5 ft
       grid; no unit conversion is claimed). `polygon` is the area's px outline, for
       segment and point tests.
     - Template → from `t`/`distance`/`direction`/`angle` (rect: the current diagonal
       decoding). Region → from `shapes[0]`: a circle's radius px ÷ (size ÷ distance);
       cone and rectangle outlines from the shape data (its own polygon helper, on v14).
       Other shapes (a migrated ray becomes a `line`) are skipped by geometry readers.
   - **Delete:** `deleteAreas(docs)`, grouped by parent scene and `documentName`.
2. **Every call site uses the adapter, with `area.doc` for document operations:**
   - `sr2e.mjs`: resolveBlast (+ smoke visibility), resolveShotgunSpread, Clear blast
     areas.
   - `spell-effects.mjs`: Poltergeist (`occupants`, `poltergeistCards`, timing,
     bind/boundary updates, the GM cleanup relay), Ice Sheet (placement, `iceCrossing`),
     `allEffectTemplates`, `deleteEffectTemplates`, `endSpellEffect`, `visibilityAlong`
     (normalized areas in; circles as now).
   - `ritual.mjs`: the ritual circle.
   - `documents/item.mjs`: 2115.
   - The attack dialog's visibility detection.
   - `tools/gen-macros.mjs` and the generated "Clear Templates (this scene)" macro use a
     separate DOCUMENT-level selector, `cleanupDocs(scene)`, exported as
     `game.sr2e.areas.cleanupDocs`, independent of geometry. v13: every MeasuredTemplate
     on the scene (today's scope). v14+: Regions with `flags.sr2e` or
     `flags.core.MeasuredTemplate`, whatever their shape.
   - A final grep: no `"MeasuredTemplate"`, `.templates` or `canvas.templates` outside
     `areas.mjs`.
3. **`module/effects-compat.mjs`: Active Effects, reads AND writes.**
   - **Reads** detect the schema before touching a field (no deprecated getters):
     - `effectChanges(e)`: `system.changes` when the doc or source has it, else the
       legacy `changes`;
     - `changeIsAdd(c)`: `typeof c.type === "string" ? c.type === "add" : c.mode === 2`
       (a literal: `CONST.ACTIVE_EFFECT_MODES` is a deprecated proxy on v14);
     - `effectTiming(e)` → `{remaining, label, units}`, all from Foundry's PREPARED
       duration: `e.duration.remaining`, `e.duration.label`, and the units from
       `e.duration.units` (v14) or `e.duration.type` (v13). No source/prepared mixing:
       v14 may reframe a combat duration into seconds when there's no combat, and the
       prepared units say so.
     - Source-based checks, kept separate:
       - `isZeroDuration(src)`: v13 `duration.seconds === 0`; v14 `duration.units ===
         "seconds" && duration.value === 0`. This is the drug "tracking-only" marker
         (drugs.mjs:47).
       - `isIndefinite(src)`: v13 an empty duration; v14 `duration.value == null`.
       - An EXPIRED positive-duration drug stays in force until it's ended by hand (as
         now); only the zero marker excludes.
     - `drugs.mjs:29`'s display uses `effectTiming`; line 47 uses `isZeroDuration`.
   - **Writes:** `makeDrugEffectData({name, changes, timing, ...})` builds the GENERATED
     drug effects only (drugs.mjs:774).
     - `changes` are COMPLETE change records (key, value, priority and anything else);
       only `mode` ↔ `type` is translated, and the value adjusted where drugs.mjs:757
       already adjusts it.
     - `timing` is one of: `{seconds, startTime}`; `{rounds, combat, startRound,
       startTurn}` (drugs.mjs:135's combat-tied doses keep their combat coordinates);
       `{zero: true}`; or `{indefinite: true}` (today's `{}` → v14 `duration.value: null`).
     - On v13 it emits `changes` + `mode: 2` + legacy `duration`.
     - On v14+, `system.changes` + `type: "add"` + `duration: {value, units}` +
       `start: {time | combat, round, turn}`.
     - The zero-duration marker (`seconds: 0`) becomes `{value: 0, units: "seconds"}`.
   - **Native copies stay native:** the sustained-spell copy (`item.mjs:1431`, `toObject()`
     of a whole effect, non-ADD changes, priorities and statuses included) is untouched.
     Foundry migrates it on creation in every version.
   - Pack data stays v13-shaped: compendium documents are migrated by Foundry on load.
     The packs switch once v13 support is dropped.
4. **Tests.**
   - Vitest:
     - `areaShape` for template data and for region data from the captured v14
       conversion outputs: circle, round AND flat cones, grid-based (gridTemplates on)
       shapes, rect in all four quadrants, a 5 ft/70 px grid as well as 1 m/100 px
       (radius in scene units);
     - the local conversion port pinned to those fixtures;
     - the effect read helpers on legacy and modern data: `effectTiming` from prepared
       data, `isZeroDuration` and `isIndefinite` from source; zero vs indefinite vs
       expired-positive kept apart;
     - `makeDrugEffectData` for both versions and both timing kinds.
   - Quench:
     - discovery and cleanup in the existing batches (smoke, blast, spread, Poltergeist,
       Ice Sheet, ritual, drugs: lines ~5769, 5788, 5806, 6810 and more) go through
       `areasOf`, `effectTiming` / `isZeroDuration`. Their effect UPDATES (e.g. lines
       ~7670–7673, which set `duration.startTime`/`seconds`) go through a version-native
       helper `effectTimingUpdate(timing)`; legacy writes only in explicit migration
       tests;
     - new: a player-owned area is OWNER for its author; a legacy MeasuredTemplate in a
       v13 world is read;
     - on the isolated v14: the full suite, plus a migrated-world check (a template made
       on v13, opened in the v14 copy, read by `areasOf`).
5. **Docs:** CHANGELOG (no behaviour change on v13; on v14 the areas are Regions), the
   v14-compat memory, QA-PLAN.

## Key decisions & tradeoffs
- Templates on v13; Regions on v14+, via Foundry's own conversion for exact parity. Reads
  never touch the v14 shim.
- No document migration: v14 migrates old templates and effects itself, and so will v16.
- Direct creation keeps working for players (REGION_CREATE defaults to PLAYER); no GM
  relay.
- `system.json` compatibility stays v13–14; v16 gets its own verification when it ships.

## Risks / open questions
- `_migrateMeasuredTemplateData` is marked @internal. Mitigated by the pinned local port.
- A GM-created area for a player keeps the GM as author (as v13 templates do).
