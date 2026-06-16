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

## Tests
`npm test` (Vitest, plain Node — no Foundry). Tests live in `test/`; pure
rules math lives in `module/rules/sr2e-rules.mjs` (no Foundry deps) and is the
preferred home for any new mechanic's arithmetic so it can be unit-tested.
`test/foundry-shim.mjs` provides the few globals the dice engine needs (a
deterministic `Roll` via `queueDice([...])`, `game.settings`). This tier covers
rules logic ONLY — sheet rendering, ApplicationV2 persistence, DialogV2 flows,
and chat-card buttons are NOT covered here and still need manual/Foundry checks.
When adding a rule, extract its math into `module/rules/` and add a test
asserting the book values (cite the page). CI (`.github/workflows/test.yml`)
runs `npm test` on every push/PR to main. Covering the UI/persistence layer
(sheets, ApplicationV2 saves, DialogV2, chat-card buttons) would need an
in-Foundry runner such as Quench — not yet set up.

## Releases
Tag `vX.Y.Z` after bumping `system.json` version; GitHub Actions packages
the zip (dev files excluded in `release.yml`).

## Active Effects
`CONFIG.ActiveEffect.legacyTransferral = false`. The derived-data pipeline
preserves AE contributions on these keys (anything else derived gets
overwritten): `system.<attr>.mod`, `system.reaction.mod`,
`system.initiative.mod` (= EXTRA initiative dice), `system.armor.ballistic`,
`system.armor.impact`. Spell items hold their effects with transfer=false;
`SR2EItem#setSustaining` copies them to the caster (origin = spell uuid)
and removes them on drop. Sustain penalty (+2 TN/spell, spell locks exempt)
is applied centrally in `rollSuccessTest`.

## Migrations
`module/migrations.mjs` runs pending entries from its MIGRATIONS registry
on world load (GM client, before anything re-saves documents) over world
actors, world items, and unlinked token actors, then stamps the
`systemMigrationVersion` world setting. When making a BREAKING schema
change, append a `{version, migrateActor?, migrateItem?}` entry — they
receive document SOURCE data (removed fields survive there until next
save) and return update objects. Never reorder entries. System compendia
are rebuilt from packs-src instead of runtime-migrated.

## Known deferred work
Matrix subsystem (planning + rules reference in docs/MATRIX.md;
build Phase 1 cybercombat first), full i18n of TN-breakdown strings.

Astral is implemented: astralState (none/perceiving/projecting) with
Astral Reaction +15 initiative when projecting; rollAstralAttack /
rollAstralResistance (Sorcery attack, Charisma damage, Willpower resist,
repercussion onto the physical monitor). Spell Defense + combat-spell
Resist Spell cards also landed.

Conjuring is implemented: SR2EActor#rollConjuring (Conjuring skill +
totem bonus vs TN=Force, no Magic Pool; Charisma drain per the Conjuring
Drain Table) creates and links a Spirit actor via CharacterData
boundSpirits. The spirit sheet has services/power-use/manifest-attack.

Injury Modifier exemption: rollSuccessTest takes options.isResistance to
suppress the wound penalty (NOT the sustain penalty) on damage- and
drain-resistance tests, which the book exempts from the Injury Modifier
(p.112). Passed by rollDamageResistance, vehicle/crash resist, spell
drain, and conjuring drain. Active tests still take the wound penalty.

Opposed melee is implemented: the attack card (flags.sr2e.melee) carries
Defend/Undefended buttons; SR2EActor#rollMeleeDefense resolves the
exchange (ties favour the attacker, winner stages damage by net/2, a
winning defender strikes back with their own weapon).

Initiative passes are implemented in `module/documents/combat.mjs`
(SR2ECombat): "next turn" costs the current actor 10 Initiative and jumps
to the highest remaining total; new rounds re-roll everyone.
