# Changelog

## 0.5.0

Major release. Game rules below were verified against the SR2E core
rulebook (page references in code comments).

### Rules fixes
- Damage boxes corrected to L1/M3/S6/D10 (was 1/4/7/10) for damage
  resistance and spell drain
- Wound levels reached at 1/3/6/10 boxes; injury modifiers now cumulative
  across the Physical and Stun monitors (p.112)
- Burst fire: +3 Power / +1 Damage Level; full auto: declared 3–10 rounds,
  +1 Power per round, +1 level per 3 rounds, per-round recoil (p.92–93)
- Troll dermal armor is +1 Body die on resistance, not +1 armor rating
- Smartgun Link compendium item now carries its −2 TN modifier
- Stun weapons no longer deal physical damage

### New mechanics
- **Initiative passes** — each action costs 10 Initiative, the spotlight
  moves to the highest remaining total, new Combat Turns re-roll everyone
- **Karma Pool** — buy dice before a roll; reroll failures (escalating
  cost), avoid all-1s disasters, buy successes (permanent) from chat cards
- **Ammunition loading** — per-weapon reserve selection, all-or-nothing
  clip swaps, book ammo effects (explosive, gel, APDS, flechette) carried
  through attack and damage resistance
- **Vehicle combat & rigging** — Handling/Position/Crash Tests with
  terrain modifiers and Control Pool, automatic crash damage, hard-target
  damage resistance, vehicle damage levels, Gunnery from linked vehicles,
  jacked-in initiative (VCR bonuses), VCR level derived from cyberware
- **Sustained spells** — automatic +2 TN tracking with spell-lock
  exemption; Active Effects on spells apply real stat changes while
  sustained; buff spells in the compendium ship with ready-made effects
- **Untrained defaulting** — missing skills default to the linked
  attribute at +4 TN (simplified Skill Web)
- **Target detection** — targeting a token pre-selects the range bracket
  from measured distance and pre-fills melee target Quickness
- **Wound markers** — wound levels appear as token status icons, with
  unconscious/dead overlays when a monitor fills

### Infrastructure
- Compendium sources now live in `packs-src/` (JSON) with
  extract/build tooling; pack data no longer at risk in releases
- World migration framework for future schema changes
- Success tests use real Foundry Rolls (Dice So Nice support)
- Shared actor-sheet base class; V13 API modernization throughout
- Added missing Increase Reflexes spell; spell pack validated against
  the CSV source

## 0.4.0 and earlier

See the [release history](https://github.com/futurekill/sr2e-foundryvtt/releases).
