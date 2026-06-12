# SR2E FoundryVTT System — Development Notes

Shadowrun 2nd Edition system for Foundry VTT **V13** (ApplicationV2 sheets,
TypeDataModels). The user's live Foundry install runs from THIS folder
(`Data/systems/sr2e` points here) — reload Foundry to test; close Foundry
before touching `packs/` (LevelDB locks).

## Rules accuracy policy
Never implement a rule from memory. The SR2E core rulebook PDF lives in the
parent folder (`../Shadowrun 2e - Shadowrun Second Edition {FASA7901}.pdf`);
extract with `pdftotext`, or render pages with `gs` and read the image when
tables come out garbled (book page N ≈ PDF page N+2). Cite page numbers in
comments. Sourcebook PDFs (Rigger 2, Street Samurai Catalog, Grimoire,
Virtual Realities) are also in the parent folder.

## Architecture
- ALL derived data lives in the TypeDataModels (`module/data/`) — embedded
  items are prepared before `prepareDerivedData`, so no Document-level
  post-processing. Do not re-add derivation to `SR2EActor`.
- `SR2EBaseActorSheet` (in `actor-sheet.mjs`) owns drag-drop, prose-mirror
  auto-save, and hidden-tab input wiring; all five sheets extend it.
- Success tests evaluate real `Roll` objects (`SR2ESuccessRoll.successTest`)
  and persist card state in `flags.sr2e.test` for the Karma Pool buttons.
- Karma Pool = `system.karma.pool` (NOT a dicePools entry). Buy-success
  spends are permanent per the book.
- Dialog buttons use bare i18n keys (DialogV2 localizes them itself).

## Compendium packs
`packs-src/` (per-document JSON) is the source of truth; `packs/` is the
LevelDB build. Keep both committed and in sync:
`npm run extract-packs` (Foundry edits → JSON), `npm run build-packs [name]`
(JSON → LevelDB). `.gitignore` re-includes `packs/**/*.log` — LevelDB
write-ahead logs MUST stay tracked or releases lose data.

## Releases
Tag `vX.Y.Z` after bumping `system.json` version; GitHub Actions packages
the zip (dev files excluded in `release.yml`).

## Known deferred work
Sustained spells / Active Effects, defender-side opposed melee tests,
conjuring, Matrix subsystem, ramming and escape-test automation, karma
advancement UI, full i18n of TN-breakdown strings, migration framework
before schema renames.

Initiative passes are implemented in `module/documents/combat.mjs`
(SR2ECombat): "next turn" costs the current actor 10 Initiative and jumps
to the highest remaining total; new rounds re-roll everyone.
