# Plan Review Log: v16 prep
Started 2026-10-19. MAX_ROUNDS=5.

## Round 1 — Codex
Concrete issues found against the supplied v14 source:

1. **The adapter still depends on the deprecated template shim.** `Scene.templates` reconstructs template documents from Regions; they are not the same document. Reading templates first and deduplicating can retain the shim, including its conversions and update behavior. In this bundle, `MeasuredTemplateDocument.updateDocuments` even skips Regions bearing `flags.core.MeasuredTemplate`.
   **Fix:** Read only `scene.templates` on v13 and only authoritative `scene.regions` on v14+.

2. **Region creation omits creator ownership.** Core’s `_migrateMeasuredTemplateData` explicitly grants the template author OWNER; the proposed Region data does not. Region update/delete require ownership, so players can lose control of their own areas.
   **Fix:** Include explicit OWNER ownership for the originating player, including any GM-created areas.

3. **The permission concern rests on an incorrect v14 distinction.** Both the v14 template shim and Region creation use `REGION_CREATE`; its default role is PLAYER. Switching document types does not itself require GM delegation. Moreover, `asGM` returns a chat message, not the created area, and has no creation handler.
   **Fix:** Use direct creation with the existing permission; if delegation is required, design an acknowledged creation response before callers consume the document.

4. **Poltergeist’s occupant calculation is missed.** [spell-effects.mjs:342](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/spell-effects.mjs:342) reads `t.parent`, `t.distance`, `t.x`, and `t.y`. A Region has no template distance, while the proposed normalized object has no parent. Cast-time and recurring damage can consequently find no occupants or throw.
   **Fix:** Convert `occupants`, `poltergeistCards`, and timing/update callers to a consistent normalized-area contract, using `area.doc` for document operations.

5. **Geometry parity is underspecified.** Core migration honors `gridTemplates` and `coneTemplateType`, sets cone `curvature` and `rotation`, and converts rectangles through grid translation/measurement with quadrant-dependent rotation. Simple pixel scaling does not reproduce all these cases; rectangle template direction is a diagonal bearing, not rectangle rotation.
   **Fix:** Specify those conversions explicitly and test non-default grids, flat cones, and rectangles in all four quadrants, preserving the v13 Ice Sheet diagonal encoding.

6. **The cleanup macro is missed.** [tools/gen-macros.mjs:131](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/tools/gen-macros.mjs:131) and `packs-src/macros/Clear_Templates_this_scene_456f7c60f1f61205.json` still enumerate/delete templates. Newly created native Regions will be invisible to this macro on v14.
   **Fix:** Update the generator and generated macro to use the area adapter, with an explicit cleanup scope.

7. **Active-drug display needs more than the proposed duration helpers.** [drugs.mjs:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:29) reads `duration.type`; v14’s client ActiveEffect implementation explicitly deprecates this until v16 in favor of `units`. Without migration, timed effects will display as “until ended.”
   **Fix:** Add a version-compatible duration-display adapter covering units, remaining time, expiry, and indefinite duration.

8. **The new helpers themselves can invoke deprecated getters.** `effectSeconds` falls back to `duration.seconds` for modern rounds/minutes/etc.; `effectStart` falls back to `duration.startTime` when modern `start` is null. Modern time units also require conversion beyond seconds.
   **Fix:** Distinguish legacy versus modern schema before accessing fields, handle modern null starts directly, and convert modern time units explicitly.

9. **“Every version migrates” is unsupported.** The v14 implementation proves legacy writes work in v14; it cannot establish v16 behavior. Keeping every write legacy preserves the dependency this preparation is meant to remove.
   **Fix:** Centralize writes too: emit legacy fields on v13 and native `system.changes`, string change types, duration, and start fields on v14+.

10. **The existing Quench suite cannot remain unchanged.** It discovers and cleans up through `scene.templates`, passes template placeables to visibility checks, and reads legacy duration fields—for example lines 5769, 5788, 5806, and 6810. Native Regions lack the core template marker, so these assertions will miss newly created areas.
    **Fix:** Migrate test discovery/cleanup and assertions, retaining explicit legacy fixtures and adding player ownership plus migrated-world coverage.

VERDICT: REVISE
### Claude's response
All 10 accepted. Reads are version-split with no shim (1); Regions built by Foundry's own _migrateMeasuredTemplateData, giving author OWNER and exact geometry, with a pinned local port as fallback (2, 5); direct creation under REGION_CREATE, the asGM idea dropped (3); Poltergeist occupants/cards/timing on the normalized contract (4); the macro generator and pack (6); a duration adapter including drugs.mjs:29 (7); schema detected before field access, modern units converted (8); writes centralized and version-split (9); Quench discovery, cleanup and assertions migrated, with ownership and migrated-world coverage (10).

## Round 2 — Codex
The revision resolves several earlier issues, but these concrete flaws remain:

1. **Geometry still does not match the existing v14 behavior.** The plan hardcodes `gridTemplates: false` and `coneTemplateType: "round"`. The supplied template shim reads both settings from `game.settings`; flat cones and grid-based templates will change shape.
   **Fix:** Pass the actual core settings and include flat-cone and grid-based conversion fixtures.

2. **The duration writer introduces a v13 regression.** [drugs.mjs:135](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:135) deliberately creates round-based durations tied to the actor’s combat. The proposed seconds-only writer discards `combat`, `startRound`, and `startTurn`, changing combat expiry behavior.
   **Fix:** Accept structured time-based or combat-based durations and preserve their units and start coordinates on both versions.

3. **The duration reader uses the wrong conversion model.** v14 converts calendar units through `game.time.calendar.componentsToTime`, not a seconds-per-unit table in `CONFIG.time`. It also distinguishes rounds from individual combatant turns; treating both as three seconds loses that distinction. `{seconds, start, label}` alone does not provide combat-aware remaining time or expiry.
   **Fix:** Preserve source duration units and use prepared document duration data for remaining time/expiry, with calendar conversion only for time-based units and explicit v13 handling.

4. **The ADD-only writer cannot safely replace sustained-effect copying.** [item.mjs:1431](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1431) copies complete effect documents, including user-configured non-ADD changes, priorities, statuses, and other metadata. Routing those through `{key, add: value}` would lose semantics.
   **Fix:** Keep native `toObject()` copies intact; limit the ADD builder to generated drug effects, or support complete change records without loss.

5. **“Then it adds … the texture” targets a nonexistent Region field.** The supplied `BaseRegion.defineSchema()` has no texture field, and its template converter intentionally omits texture and border color. Assigning `texture` cannot preserve the smoke image.
   **Fix:** Explicitly accept and document native Region appearance on v14, retaining texture only on the v13 template path.

6. **The cleanup macro’s promised scope is impossible through the specified reader.** `areasOf` admits only Regions carrying `flags.sr2e`, while the macro must also include core templates. Its normalized shape union also excludes migrated ray templates, which become `line` shapes.
   **Fix:** Add a separate document-level cleanup selector for SR2E areas and core template-marked Regions, independent of supported geometry.

7. **The five-foot fixture does not establish metre correctness.** Dividing pixels by `grid.size / grid.distance` produces scene distance units. On a five-foot grid, that result is feet despite the field being named `radiusM`.
   **Fix:** Define these values as scene units to preserve existing behavior, or explicitly implement and test metre conversion rather than claiming metre normalization.

VERDICT: REVISE
### Claude's response
All 7 accepted: the real core gridTemplates and coneTemplateType settings, with flat-cone and grid fixtures (1); combat-based drug timing preserved in both versions (2); effectTiming reads Foundry's prepared duration, so no home-made unit tables (3); the builder is limited to generated drug effects, and native copies stay native (4); v14 appearance is the Region's own, texture only on v13 (5); a separate document-level cleanupDocs selector for the macro (6); radius in scene distance units, as today, with no metre claim (7).

## Round 3 — Codex
The area revisions address the previous blockers. The effect adapter still has these concrete gaps:

1. **The zero-duration marker cannot be recovered from `effectTiming`’s proposed result.** [drugs.mjs:47](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:47) intentionally distinguishes an originally zero-duration dose from an expired positive-duration dose; both can have nonpositive `remaining`. Expired drugs must remain in force until manually ended.
   **Fix:** Add a separate source-based `isZeroDuration` check (`seconds === 0` on v13; `units === "seconds" && value === 0` on v14), and test expired positive-duration effects remain in force.

2. **The timing adapter mixes source units with prepared values.** Legacy `duration.type` is prepared data, not a source field. Additionally, v14 `_prepareCombatBasedDuration` can reframe a combat duration into seconds when no suitable combat exists, so source units may differ from the units of prepared `remaining`.
   **Fix:** Read display units from prepared `e.duration.units` on v14 and prepared `e.duration.type` on v13; inspect source data separately for configured duration and indefinite status.

3. **The generated-drug builder still drops change priorities.** [drugs.mjs:757](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:757) currently copies complete ADD records, preserving priorities even when halving values. The proposed `{key, value}` contract loses explicit priority, potentially changing ordering relative to other effects on either version.
   **Fix:** Preserve change metadata, including `priority`, while translating only `mode`/`type` and the deliberately adjusted value.

4. **Untimed drugs are missing from the writer’s timing contract.** The existing `effectDuration` returns `{}` when no duration exists; the new contract admits only seconds or rounds. Treating missing duration as zero would incorrectly classify an active drug as a tracking-only entry.
   **Fix:** Explicitly support indefinite timing—legacy empty duration and modern `duration.value: null`—and test it separately from zero and expired durations.

5. **The revised test plan references a removed helper and leaves legacy updates unaddressed.** It still names `effectDuration`, while the adapter now defines `effectTiming`; Quench lines 7670 and 7673 directly update `duration.startTime` and `duration.seconds`. Changing reads alone leaves those tests dependent on migration.
   **Fix:** Update test assertions to the actual helper contracts and emit version-native update payloads, reserving legacy writes for explicit migration tests.

VERDICT: REVISE
### Claude's response
All 5 accepted: a source-based isZeroDuration, with expired positive doses staying in force (1); effectTiming entirely from prepared data, units included (2); complete change records preserved, only mode/type translated (3); indefinite timing supported and tested (4); test helpers renamed, and test updates go through a version-native effectTimingUpdate (5).
