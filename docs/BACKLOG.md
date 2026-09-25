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

- ~~Skillsofts ship as blank chips~~ — **done 2026-09-25**
  (PLAN-skillsoft-purchase.md): the Buy dialog asks for the skill, sets its
  attribute, and slots it. The two error-swallowing spots below are fixed too
  (unreadable drops warn, and dialog failures are errors, not Cancel). Still
  open: the item sheet's skill picker lists Build/Repair skills for an
  ActiveSoft, which the chip's category can't represent.
- ~~Player-triggered summoning does not work.~~ **Not a bug — resolved
  2026-07-27.** The socket relay was removed deliberately; `canCreateActor()`
  now gates on the `ACTOR_CREATE` permission *before* the roll and drain, and
  throws a readable message otherwise. Player summoning works as soon as the GM
  enables Settings → Configure Permissions → **"Create New Actors"** for the
  Player role. No code to write.
- ~~Summoned-spirit token placement is unwired~~ — stale: `placeSummonedToken`
  places nature spirits and uncontrolled elementals at summoning, and bound
  elementals when Called (setting `spiritPlacement`).
- ~~Movement limiter: live true-drag verify~~ — **verified 2026-09-25** on a
  scratch scene. A bent 12 m path whose straight line is 8.5 m was blocked
  (run 9 m), and an 8 m bent path was charged 8 m, not the chord. Real mouse
  drags were blocked past the cap and allowed within it.
- ~~Refresh Item Art: live verify~~ — **verified 2026-09-25**. The real macro
  file ran scoped to fixtures and updated a world actor's item, an unlinked
  token's item and a loose world item, while keeping a custom image. The
  notification wording double-counted world items; that is fixed. A dry run
  over the live world found 45 placeholder icons on 8 actors, left for the GM
  to run.
- ~~Roll-table live check~~ — **verified 2026-09-25**. All six tables rolled
  (30 rolls, no empty result), a draw posted its chat card, and every possible
  total of each formula is covered exactly once.
- **A LinguaSoft identifies its language by NAME.** `_applySkillsofts` matches
  an owned skill by lower-cased name + category, and the synthetic path looks the
  family up in `CONFIG.SR2E.languageFamilies` by the same string. So a renamed
  skill, an alias ("Spanish (Castilian)"), a typo or a localized name silently
  gets no family — and the two paths can disagree, since the overwrite path keeps
  whatever family the skill item carries. A canonical id (or reading the family
  off a compendium link) would fix it properly. Raised by adversarial review of
  0.77.0; not worth the refactor for a single-table game, but it is the reason
  any "why has my language no family" report should start here.
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

- ~~Bioware overstress penalty and magical-healing interference~~ — **automated**
  (`_bodyTestOpts`, `biowareHealingTnMod`); entry was stale (checked 2026-09-24).
- **Drug / gene-tech active effects** — Shadowtech catalog items ship as plain
  `gear` with no auto-effects.
- **Body Index on NPC/critter actors** — scoped to `character` only, consistent
  with how cyberware already behaves on NPCs.
- ~~Cultured bioware ×4 nuyen~~: **stale, checked 2026-09-25.** ×4 was
  already applied at purchase and on a grade change (verified live). The real
  bug was neural bioware (always cultured, p.7) getting ×4 and ×0.75 again;
  that is fixed.
- ~~Summon services tracking~~ — **done 2026-09-25** (PLAN-spirit-services.md):
  services were already spent per power and elemental service; added Fight for
  me (one service per fight), the running-out note and status, and the elemental
  Call / Send away / 24-hour rule. Nature spirits depart at sunrise/sunset
  (nature-spirits.mjs).

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
