# SR2E — Backlog

Deferred ideas, captured so they aren't lost. Not prioritized; pull from here
when there's appetite. Nothing here blocks a release.

Last reviewed 2026-07-26 (system 0.64.0).

## Broken / needs a live session

- **Player-reported: dropping a skillsoft does nothing (NOT reproducible by the
  GM).** Investigated 2026-07-28 and parked — the purchase path was proven
  working end-to-end on the GM client (correct item, correct 300¥ for a Rating-2
  LinguaSoft), so there is nothing to fix blind. Ruled out: the data model
  (validation and create both succeed), the item's own data, missing access
  ports, the drop path being changed recently (it was not), and both schema
  fields that could reject the document.

  Most likely a **client/permission difference** — the same shape as the
  summoning issue, where the GM path worked and the player path did not. When it
  next happens, get the PLAYER's console (F12); do not debug from the GM seat.

  Two defects found along the way that made the report undiagnosable. Worth
  fixing whenever this is picked up, independently of the drop bug:
  - `SR2EBaseActorSheet#_onDrop` does `catch(e) { return; }` around
    `JSON.parse(dataTransfer)` — a malformed drag payload vanishes with no
    message anywhere.
  - `_promptPurchaseOptions` initialises `result = null`, and `_onDropItem`
    treats `null` as "user cancelled". So ANY failure inside the Buy callback is
    indistinguishable from clicking Cancel.

  Diagnostics that worked are worth rebuilding if needed: one macro that
  validates + creates the compendium item directly, and one that wraps
  `sheet._onDropItem` with error capture and reports what the prompt returned.

- **Skillsofts ship as blank chips.** A dropped LinguaSoft/ActiveSoft cannot
  grant a skill until the GM types a skill name on the item sheet AND toggles
  the slot AND the character has an access port. The purchase prompt asks for
  rating and skill *category* but never the skill *name*, so the one field that
  makes the chip functional is the one it does not ask for. Reproducible; a
  design change, not a bug.

- ~~Player-triggered summoning does not work.~~ **Not a bug — resolved
  2026-07-27.** The socket relay was removed deliberately; `canCreateActor()`
  now gates on the `ACTOR_CREATE` permission *before* the roll and drain, and
  throws a readable message otherwise. Player summoning works as soon as the GM
  enables Settings → Configure Permissions → **"Create New Actors"** for the
  Player role. No code to write.
- **Summoned-spirit token placement is unwired on the canvas side.**
  `nearestFreeCell` is pure and unit-tested; the scene write is not done, so
  placement still prompts the GM for a click. See
  `PLAN-summon-placement-movement.md` §1.
- **Movement limiter: live true-drag verify.** The cumulative-path enforcement
  was reworked and Quench-covered, but nobody has watched a real drag across a
  bent path in a live world. ~2 min check.
- **Refresh Item Art: live verify.** Widened in 0.64.0 to cover NPCs, vehicles,
  unlinked tokens and world items. Logic and syntax checked; never executed
  against a live world (needs Foundry globals). One click to confirm.
- **Roll-table live check** — Quench confirms each table has result rows; nobody
  has watched one actually *roll*. ~30s.

## Content gaps

- ~~4 items in the Street Gear reference table that we don't ship.~~ **Done in
  0.65.0** — three were shipped under invented names with wrong stats (the audit
  matches on name, so it reported them as missing rather than as drift), and the
  Vision Enhancers table had never been transcribed.
- ~~Cost audit~~ **The pass is done (0.65.0–0.71.0).** Every priceable core
  pack has been checked against a rendered page: cyberware, gear, firearms,
  melee, heavy, armor, projectile, throwing, **ammo, foci, lifestyles and
  programs**. Spells are not priceable — the schema has no cost field, because
  spells are learned with Karma. 146 reference rows vs 539 items, clean in both
  directions.

  Still open, deliberately left rather than invented:
  - Ammo the core book never prices: Ex-Explosive, Hollow Point, Subsonic,
    Tracers, Buckshot, Shotgun Slug, Machine Gun Belt (Regular). Need their
    actual sourcebook.
  - Utility programs printed but not shipped: **Armor**, **Restore**, **Sift**.
    And **Scramble** is shipped but appears in no printed table.
  - Rigger Black Book vehicle weapons from the p.283 damage table (Vengeance
    MMG, Vanquisher HMG, Victory/Vigilant Rotary Cannons, AAM/AGM warheads,
    7.62/12.7cm rockets) — that module ships no weapons at all.
  - `programCostVR2` now duplicates core utility pricing, because the banded
    rate turned out to be the core rule rather than a VR2 one. Revisit if VR2
    is ever implemented.
- ~~Rating-priced gear does not multiply by Rating.~~ **Done in 0.67.0** —
  `GearData.costPerRating` + a `derivedItemCost` branch; 18 items converted,
  Maglock Passkey and White Noise Generator were undercharging.
- **Language families are free text.** p.74's full family table (~400 languages
  across ~40 families) is not transcribed; the 18 shipped languages carry their
  family, anything a GM adds is typed by hand. Worth doing only if something
  starts validating the field. Lakota is filed under Siouan as a judgement call —
  p.74 lists Dakota, not Lakota.
- **Mist and Storm spirits have no portrait art** — they were added to
  `spiritDomains` in 0.63.0 and fall back to the `wind` art.

## Art campaign

All three priority modules are done. Remaining, in the user's stated order:

| Module | Docs missing art |
|---|---|
| Shadowrun Companion | 100 |
| NAGRL | 42 |
| Grimoire | 9 |
| core system leftovers | 75 (skills 47, adept_power 14, tradition 8, lifestyle 6) |
| Paranormal Animals | 59 — **last**, user isn't running them yet |

Tooling is in place per-module (`tools/art-todo.mjs` + `tools/set-art.mjs`,
`npm run art`). Paranormal Animals already has `tools/set-portraits.mjs`
committed with no images yet. See the content-roadmap memory for the batch
recipe and the `codex exec -i` stdin gotcha.

## Mechanics not automated (display-only today)

- **Bioware overstress penalty** (+1 TN per Body test) and **magical-healing
  interference** (+½ Body Index) — indicators exist, no automation.
- **Drug / gene-tech active effects** — Shadowtech catalog items ship as plain
  `gear` with no auto-effects.
- **Body Index on NPC/critter actors** — scoped to `character` only, consistent
  with how cyberware already behaves on NPCs.
- **Cultured bioware ×4 nuyen** is not auto-applied; a grade flip re-derives
  Body Cost but not price. GM adjusts.
- **Summon services tracking** — services are set at summoning but never
  decremented, and nothing prompts a dismissal when a spirit is spent. Nature
  spirits also expire at the next sunrise/sunset (separate condition). Verify
  the rules against the corrected 11th printing before implementing.

## UI / polish

- **Bodyware / Cyberlimb cyberware sub-folders** — Headware is split
  (Communications/Eyes/Ears/Internals); Bodyware (13) and Cyberlimbs (5) are
  flat. Split only for visual symmetry.
- **Deeper per-theme skinning** beyond the palette (fonts, sidebar, chat cards),
  the way the Terminal theme does it.
- **Roll labels are still English** — the TN/dice breakdown is localized
  (`SR2E.Roll.*`) but labels like "X Test — defaulting to Y" are not. Low
  priority for a single-language project.

## Larger, needs a go-ahead

- **Virtual Realities 2.0 (FASA7904)** — the VR2.0 Matrix ruleset as an optional
  alternative to the implemented core Matrix. See `AUDIT-VR2.md`.
- **Foundry v14 compatibility.** Static deprecation audit is clean and
  `compatibility.verified` is at 14; a deeper pass on a real v14 build is worth
  doing if issues surface.
