# SR2E — Backlog

Deferred ideas, captured so they aren't lost. Not prioritized; pull from here
when there's appetite. Nothing here blocks a release.

Last reviewed 2026-07-26 (system 0.64.0).

## Broken / needs a live session

- **Player-triggered summoning does not work.** The GM path works; the
  player→GM Actor-creation relay is still broken and undiagnosed. A
  `console.debug` trace is in place at every hop. Needs a live 2-client
  session (player + GM) — cannot be tested single-client. Full protocol,
  suspect ranking and acceptance criteria in `PLAN-summon-placement-movement.md`
  §1. **Note:** repo CLAUDE.md records that a socket relay was later *removed*
  because `system.*` messages silently drop on some hosts — confirm which state
  `main` is actually in before resuming.
- **Movement limiter: live true-drag verify.** The cumulative-path enforcement
  was reworked and Quench-covered, but nobody has watched a real drag across a
  bent path in a live world. ~2 min check.
- **Refresh Item Art: live verify.** Widened in 0.64.0 to cover NPCs, vehicles,
  unlinked tokens and world items. Logic and syntax checked; never executed
  against a live world (needs Foundry globals). One click to confirm.
- **Roll-table live check** — Quench confirms each table has result rows; nobody
  has watched one actually *roll*. ~30s.

## Content gaps

- **4 items in the Street Gear reference table that we don't ship:** Heckler &
  Koch HK227, HK227-S, Ingram Valiant, Binoculars. Surfaced by
  `npm run audit-costs`. Transcribe and add.
- **Cost audit is ~22% complete** — 118 transcribed reference rows vs 533
  compendium items. Audited: cyberware, gear, firearms, melee, heavy, armor,
  projectile, throwing. **Unaudited: ammo, programs, lifestyles, foci, spells,
  and the rest of gear.** Extend `tools/data/street-gear-prices.tsv`.
- **Rating-priced gear does not multiply by Rating.** Items whose book price is
  per-Rating-point store the unit price; the sheet shows that unit price rather
  than price × Rating. Affects several security/electronics items.
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
