# SR2E FoundryVTT System — Development Notes

Shadowrun 2nd Edition system for Foundry VTT **V13** (ApplicationV2 sheets,
TypeDataModels). The user's live Foundry install runs from THIS folder
(`Data/systems/sr2e` points here) — reload Foundry to test; close Foundry
before touching `packs/` (LevelDB locks).

## Rules accuracy policy
Never implement a rule from memory. The SR2E core rulebook PDF lives in the
parent folder — use the **corrected 11th printing**, the final printing and the
canonical text: `../Shadowrun 2e - Shadowrun Second Edition (corrected 11th
printing) {FASA7901}.pdf`. It has a real text layer (the older scan was OCR),
so `pdftotext -layout` is reliable **for prose and page-finding**; still render
the page (`pdftoppm -r 220`) and read the image for dense tables, whose columns
mis-align in any extraction.

**NEVER read a formula, drain code, or cost/Essence expression from the text
layer — it silently corrupts math glyphs.** Confirmed: `÷` extracts as `+`, and
`S` (Serious) extracts as `5`. The Treat/Heal drain on p.155 extracts as
`(F + 2)(Wound Level)` but prints `(F ÷ 2)`; Cybertech p.261 Filtration Essence
extracts as `Rating + 10` but prints `Rating ÷ 10` (a `+` reading is impossible —
6 Essence is the ceiling). This has produced three wrong values in practice.
Render the page (`pdftoppm -r 600` cropped, for one cell) and read the image for
any number. **A mechanically impossible value means a substituted glyph, not a
strange rule.**

**The PDF-to-book page offset is NOT constant** — unnumbered plates push it
from +1 early (PDF 97 = book 96) to +25 by the gear chapter (PDF 279 = book
254). Never assume an offset: read the printed folio in the page footer
("96 SHADOWRUN"). Cite the BOOK page in comments.

Sourcebook PDFs (Rigger 2, Street Samurai Catalog, Grimoire, Virtual Realities)
are also in the parent folder.

**Prices: the Street Gear list (book p.254+) is canonical.** The core book
prints most gear twice — once in its rules chapter, once in the Street Gear
shopping list — and the two DISAGREE in places (Remington 950 is 1,300¥ in
the combat chapter but 800¥ in Street Gear; Defiance T-250, 1,400¥ vs 500¥ —
both discrepancies survive into the corrected 11th printing).
Street Gear wins: it is the buying table and the only one carrying Street
Index and Availability, which the purchase system models. An earlier import
mixed both tables (and invented a few values), which is why player-reported
prices were wrong. `npm run audit-costs` diffs packs-src against the
transcribed reference in `tools/data/street-gear-prices.tsv` — re-run it
after touching prices, and pin new values with a test.

**Costs printed as formulas must stay formulas.** A bow is "purchased with a
specified Strength Minimum" (p.96) — 100¥ x Str Min, damage (Str Min + 2)M.
Flattening such an entry to one number (as the old Bow did at 400¥) both
misprices it and, when the damage formula reads the WIELDER's attribute
instead of the weapon's rating, breaks combat. Model the driving rating as a
field and derive cost/damage from it (`strengthMinWeaponStats`).

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
`packs-src/` (per-document JSON) is the **source of truth and the only tracked
copy**. `packs/` is the LevelDB build — **gitignored** (Foundry compacts it
every session, churning the tree with no content change). Workflow:
`npm run build-packs [name]` (JSON → LevelDB) after editing sources;
`npm run extract-packs` (Foundry edits → JSON) to pull in-Foundry edits, then
commit the resulting `packs-src/` changes. The release workflow runs
`npm run build-packs` before packaging, so releases still ship the LevelDB.
Never re-track `packs/`.

## Tests
`npm run lint` (ESLint 9, `eslint.config.mjs`) runs first in CI: errors fail the
build — above all `no-undef`, which would have caught the 0.90.0 spell-casting
crash (`item` used where the parameter was `spell`). Foundry's runtime globals
are declared in the config; add a new one there rather than disabling the rule.
Unused names are warnings only.

`npm test` (Vitest, plain Node — no Foundry). Tests live in `test/`; pure
rules math lives in `module/rules/sr2e-rules.mjs` (no Foundry deps) and is the
preferred home for any new mechanic's arithmetic so it can be unit-tested.
`test/foundry-shim.mjs` provides the few globals the dice engine needs (a
deterministic `Roll` via `queueDice([...])`, `game.settings`). This tier covers
rules logic ONLY — sheet rendering, ApplicationV2 persistence, DialogV2 flows,
and chat-card buttons are NOT covered here and still need manual/Foundry checks.
When adding a rule, extract its math into `module/rules/` and add a test
asserting the book values (cite the page). CI (`.github/workflows/test.yml`)
runs `npm test` on every push/PR to main. The UI/persistence layer (sheets,
ApplicationV2 saves, DialogV2, chat-card buttons) is covered by **Quench**
in-Foundry batches — see `docs/QUENCH.md` and `module/quench/sr2e-quench.mjs`.
Register a new batch for any UI/persistence bug you fix; Vitest stays for pure
rules math.

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
save) and return update objects. Never reorder entries — they are applied
in ascending version order regardless of array position, and every pending
entry reads the SAME source, so one cannot see another's update. System
compendia are rebuilt from packs-src instead of runtime-migrated.

**NEVER guard a migration on `field === undefined`.** "Source data" here is
`doc.toObject()`, which returns `_source` AFTER `schema.clean()` has filled in
every `initial`. A field declared `required: true` with an `initial` — which is
most of them — is therefore ALWAYS defined, so such a guard is always true and
silently disables the entire migration while still stamping its version, so no
world ever runs it again. This shipped twice, in 0.91.0 (Karma Pool preservation)
and 0.92.0 (skill lifecycle); 0.92.1 is the repair. A migration that must be
idempotent has to detect its own work by VALUE, not by presence — or just be
written so re-running is harmless, since the runner already guarantees
once-per-world. Test it with a document carrying the schema defaults, not a
hand-written legacy object; the test that "proved" 0.92.0 skipped migrated data
passed for exactly the reason the migration failed.

## Derived state on prepared documents
`prepareDerivedData` mutates the prepared document IN PLACE, and embedded items
are NOT re-initialized from source between preparations. Anything written there
must therefore be CLEARED (or reassigned in both directions) before it is
rebuilt, or it outlives whatever produced it — un-slotting a skillsoft kept the
chip's rating forever, `_adeptBonus` used `+=` and compounded on every prepare,
un-bonding a weapon focus left the weapon holding its Force, and removing a VCR
left the rig level behind. Restore from AUTHORITATIVE state (`_source`, or a
value the item re-derives itself), never from a `_nativeRating`-style cache
written by the previous pass — a second contributor or an edit made in between
poisons it. A test only catches this on the SECOND preparation.

The same applies to a field COMPUTED from a formula or a rating table
(`strengthMinWeaponStats`, `ratingStats`, `costPerRating`/`costPerForce`,
skillsoft pricing, a bonded weapon focus). Those writes sit inside an `if`
testing the derivation MECHANISM, so removing the mechanism skipped the
assignment and left the last computed value behind. **Assign in BOTH
directions** — the else restores `_source`. This is a decision, not just a fix:
clearing a formula REVEALS what was authored, it does not convert the computed
number into authored data. Keeping it was never a real freeze (the next reload
rebuilds from `_source` anyway) and it contradicted the purchase hook, which
re-prices a de-derived item at `_source.cost`. A genuine freeze would have to
WRITE `_source` during the transition; nothing does. Because derivation
overwrites these fields in place, the item sheet must EDIT them at their authored
value (`context.authored` / `effective` in `item-sheet.mjs`), or `submitOnChange`
re-authors the derived price and there is nothing left to reveal. Pure derived
readouts that are not schema fields (`system.mp`) are `delete`d, not restored.

## Creating actors from player actions
Players can't create world Actors without the **"Create New Actors"** permission
(Settings → Configure Permissions), so a player-triggered flow that spawns an
Actor (summoning a spirit, linking a compendium vehicle) needs that permission
granted. Route creation through `game.sr2e.createActorViaGM(data)` (direct
create; Foundry auto-owns it to the creator) and gate the surrounding action
with `game.sr2e.canCreateActor()` BEFORE any irreversible step (rolling, drain)
so a permission-less player aborts cleanly instead of wasting drain.

**Shelved:** a player→GM socket RELAY (`system.sr2e` request/response) once let
unpermitted players summon, but Foundry's `system.*` relay silently drops
messages behind some hosts (a raw `game.socket.emit`/`on` ping did not arrive
GM-side at futurekill's table — the same reason Team Karma's cross-client sync
fails there), so the relay was removed. Don't re-add a socket relay without
first confirming `system.*` messages actually deliver in the target deployment.
See docs/PLAN-summon-placement-movement.md.

## Known deferred work
VR2.0 Matrix ruleset (optional; core Matrix is implemented — see docs/MATRIX.md).
The success-test TN/dice breakdown is localized (`SR2E.Roll.*`); roll *labels*
(e.g. "X Test — defaulting to Y") are still English — a broader i18n pass, low
priority for a single-language project.

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
