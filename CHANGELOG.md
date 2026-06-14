# Changelog

## 0.8.0

### New mechanics
- **Healing & Recovery** (p.112–115) — rest to recover Stun (Body/Willpower),
  natural Physical healing (Body Test vs wound TN), and First Aid (Biotech,
  treat self or a targeted ally); each heals a wound level, with buttons under
  the condition monitors
- **Astral projection & combat** (p.145–147) — perceive or project astrally
  (projecting initiative = Astral Reaction +15); astral combat uses Sorcery
  with Charisma-based damage, resisted by Astral Body (Willpower), echoing
  onto the physical body (repercussion)
- **Spell Defense** (p.132) — allocate Magic Pool dice as a standing defensive
  pool that boosts spell-resistance rolls; released on pool refresh
- **Combat-spell resistance** (p.130–131) — combat spells now post a Resist
  Spell card; the target resists with Willpower (mana) or Body (physical) plus
  Spell Defense, net successes staging the damage

### Polish
- Compendium actors (vehicles, critters, runners) now carry proper token art
  instead of the mystery-man placeholder

### Groundwork
- `docs/MATRIX.md` — verified rules reference and implementation plan for the
  Matrix subsystem (the one remaining major gap), plus persona scaffolding

## 0.7.0

### New mechanics
- **Conjuring** (p.138–140) — shamans summon nature spirits by domain, mages
  summon elementals: Conjuring Skill + totem bonus vs the spirit's Force (no
  Magic Pool), Charisma-based drain per the Conjuring Drain Table, and an
  auto-created, linked Spirit actor whose services, powers, and manifest
  attack are tracked on its sheet
- **Vehicle ramming & escape test** (p.107) — completes the chase loop: both
  vehicles roll the ram test (loser crashes), and a pursuer's Escape Test
  resolves whether a fleeing vehicle gets away, with the correct ram/escape
  terrain tables

### New content
- **Vehicles & Drones compendium** — all 32 vehicles and drones from the core
  rulebook table (cars, bikes, boats, aircraft, rotorcraft, military, drones)

### Fixes
- **Injury Modifier** no longer applies to damage- and drain-resistance tests
  (p.112) — a wounded character was resisting damage and drain at an inflated
  TN. The sustain penalty still applies, per the book
- Conjuring drain table boundary corrected (Force = half Charisma is Moderate)
- Fixed broken vehicle compendium icons (invalid core icon paths)

## 0.6.0

### New content & mechanics
- **Critters compendium** — 40 NPC stat blocks from the core book's Critter
  Statistics Table (p.233): 20 normal animals and 20 paranormal beings, each
  with attributes, natural armor, matching initiative dice, a natural-attack
  weapon, threat ratings, and power/weakness keywords (original descriptions)
- **Sample Runners compendium** — five ready-to-play characters (street
  samurai, combat mage, decker, rigger, dog shaman) assembled from the item
  compendia, so derived stats compute on import
- **Opposed melee combat** (p.100–101) — both combatants roll Combat Skill vs
  TN 4 + the Melee Modifiers Table; ties favour the attacker, net successes
  stage damage, and a winning defender strikes back. Defend / Undefended
  buttons on the attack card
- **Karma advancement dialog** (p.190) — spend Good Karma to raise attributes
  (new rating, doubled above racial max) and skills (2×/1× new rating)
- **Configurable play-area background** — world setting with a file picker;
  ships with a new default cityscape

### Fixes
- **Critical:** compendium pack tooling now uses Foundry's split
  embedded-document format — actor items and spell Active Effects were being
  silently dropped when Foundry migrated a pack (empty critter weapons,
  bare sample runners). Rebuilt all packs in the correct format
- VCR rigging bonuses now show on the sheet (Reaction + initiative dice)
  while jacked in, not just in the roll formula
- Installed Vehicle Control Rig cyberware is authoritative over the
  vehicles-tab rig field
- Control Pool uses the book formula (natural Reaction + 2/rig level),
  excluding other Reaction bonuses (p.84)
- Wound penalty was double-counted on weapon attacks; corrected
- Improved text contrast (muted text colour and dialog hint greys)

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
