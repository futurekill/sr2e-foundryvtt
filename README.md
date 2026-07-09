# Shadowrun 2nd Edition - FoundryVTT Game System

A comprehensive game system for **Shadowrun Second Edition** (FASA 7901) built for [Foundry Virtual Tabletop](https://foundryvtt.com/) V13.

## Overview

This system implements the core rules from Shadowrun 2nd Edition, bringing the cyberpunk-meets-magic world of 2053 to your virtual tabletop. It supports the full range of character types from street samurai to deckers, magicians to riggers.

## Features

### Actor Types
- **Characters** — Full player character sheets with the priority-based character creation system, attributes, skills, dice pools, condition monitors, and support for all character archetypes
- **NPCs** — Streamlined NPC sheets with threat ratings and professional ratings
- **Vehicles** — Complete vehicle stat blocks with handling, speed, body, armor, and condition monitors
- **Spirits/Elementals** — Force-based spirit sheets for nature spirits and elementals
- **IC (Intrusion Countermeasures)** — Matrix IC stat blocks for decking encounters
- **Critters** — Stat blocks for the core book's normal animals and paranormal beings (powers and weaknesses noted; descriptions are original)
- **Sample Runners** — Five original ready-to-play characters: street samurai, combat mage, decker, rigger, and dog shaman
- **Vehicles & Drones** — All 32 vehicles and drones from the core rulebook table (cars, bikes, boats, aircraft, rotorcraft, military, and drones) with handling, speed, body, armor, signature, and pilot stats

### Item Types
- **Skills** — Active, knowledge, language, and special skills with concentrations and specializations
- **Weapons** — Melee, projectile, throwing, firearms (with firing modes and ammo tracking), heavy weapons, and grenades
- **Armor** — Ballistic and impact armor with equip/unequip tracking
- **Spells** — All five spell categories (Combat, Detection, Health, Illusion, Manipulation) with force, drain codes, and type/range/duration
- **Cyberware** — Headware, bodyware, and cyberlimbs with essence costs, grades (standard/alpha), and attribute modifiers
- **Programs** — Matrix programs with ratings, memory sizes, and categories
- **Adept Powers** — Physical adept powers with power point costs and levels
- **Gear** — General equipment with ratings, quantities, and costs
- **Contacts** — Contacts, buddies, and followers
- **Lifestyles** — From Streets to Luxury with monthly costs
- **Ammunition** — Ammo types with damage and armor modifiers
- **Foci** — Spell, spirit, power, weapon foci and spell locks

### Core Mechanics
- **Success Tests** — Roll Xd6 against a target number, count successes
- **Rule of Six** — Exploding 6s allow achieving target numbers above 6
- **Dice Pools** — Combat Pool, Hacking Pool, Magic Pool, and Control Pool with tracking and reset
- **Initiative** — Reaction-based initiative with variable dice from cyberware/magic; full SR2E multiple actions: each action costs 10 Initiative, the spotlight always moves to the highest remaining total, and every new Combat Turn re-rolls automatically
- **Condition Monitors** — Physical and stun damage tracking with wound level penalties (Light/Moderate/Serious/Deadly); wound levels show automatically as token status markers, with unconscious/dead overlays when a monitor fills
- **Damage Staging** — Automatic damage staging based on net successes
- **Healing & Recovery** — Rest to recover Stun, natural Physical healing, and First Aid (Biotech) — each rolls the proper test and heals a wound level (SR2E p.112–115)
- **Opposed Melee** — Both combatants roll their Combat Skill vs TN 4 + the Melee Modifiers Table (reach, friends, position, multiple targets); ties favour the attacker, net successes stage damage, and a winning defender strikes back with their own weapon
- **Karma Pool** — Buy extra dice before a roll; reroll failures, avoid disasters, and buy successes from the chat card (SR2E p.190)
- **Skill Web Defaulting** — Untrained skills default through the full printed Skill Web (SR2E p.68–69), modeled as the actual route map: it traces the shortest legal path by black circles crossed (+2 TN each), defaults to a *related skill you have* when that's cheaper than an attribute, honours one-way arrows, and disallows defaulting where the web has no path (a flat +4 fallback covers any skill not on the web). A "Roll a Skill…" picker rolls any skill trained-or-defaulted, and a GM "Request a Skill Roll" macro asks selected characters to roll
- **Magic Depth** — Adept powers (with power-point budgeting), Initiation & metamagic (Centering, Shielding, Quickening), fetish/spell foci, and area-effect spells resolved through the blast engine
- **Matrix & Decking** — Persona attributes, cybercombat, system operations with alert escalation, IC and Host (node) actors, and dump shock; an optional Virtual Realities 2.0 ruleset toggle
- **Area-Effect & Blast** — Grenades and area spells fall off by distance with scatter, apply to everyone in radius, and can be cleared from the chat card
- **Weapon Accessories** — Smartgun links, laser sights, gas vents, bipods, and more attach to weapons with their mechanical effects
- **Shadowtalk Banter** — Optional sourcebook-style Shadowland margin chatter reacting to roll outcomes and to the character (metatype, chrome, archetype, wealth), with an off/rare/chatty frequency setting
- **Ammunition Loading** — Each weapon selects a reserve ammo item to reload from; loaded rounds carry their book effects (explosive +1 Power, gel −2/Stun/Impact armor, APDS halves Ballistic, flechette vs armor rules) through attack and damage resistance
- **Astral Projection & Combat** — Perceive or project astrally (initiative = Astral Reaction +15); astral combat uses Sorcery with Charisma-based damage resisted by Astral Body (Willpower), echoing onto the physical body (SR2E p.147)
- **Conjuring** — Summon nature spirits (shamans, by domain) or elementals (mages): Conjuring Skill + totem bonus vs the spirit's Force, Charisma-based drain, and an auto-created spirit actor whose services, powers, and manifest attack are tracked on its sheet
- **Sustained Spells & Active Effects** — Sustained-duration casts track automatically: +2 TN on all other tests per spell (spell locks exempt), drop as a Free Action, and Active Effects defined on the spell apply real stat changes (attributes, Reaction, initiative dice, armor) to the caster while sustained
- **Target Detection** — Target a token (T) before attacking: the dialog pre-selects the range bracket from measured distance and the weapon's range data, pre-fills melee target Quickness, and warns beyond Extreme range
- **Vehicle Combat & Rigging** — Handling/Position/Crash Tests with terrain modifiers and Control Pool, automatic crash damage, ramming and escape-test resolution, hard-target damage resistance (armor penetration, Body+½ armor, level step-down), vehicle damage levels (TN/Initiative/speed effects), Gunnery from linked vehicle weapons, and a jacked-in toggle that switches initiative to VCR bonuses (Reaction +2 and +1d6 per level)
- **Essence/Magic Link** — Cyberware automatically reduces Essence, which reduces Magic rating for magicians

### System Settings
- Rule of Six toggle
- Auto-calculate Essence from cyberware
- Item-deletion confirmation (per player)
- Shadownet terminal theme (per player)
- Shadowtalk banter frequency (off / rare / chatty)
- Matrix ruleset (core book / Virtual Realities 2.0)

## Installation

### Automatic (Recommended)

1. In FoundryVTT, go to **Game Systems** → **Install System**
2. Paste the following **Manifest URL** into the field at the bottom:
   ```
   https://github.com/futurekill/sr2e-foundryvtt/releases/latest/download/system.json
   ```
3. Click **Install**
4. FoundryVTT will automatically download and install the latest release

### Manual Installation

1. Download `sr2e.zip` from the [latest release](https://github.com/futurekill/sr2e-foundryvtt/releases/latest)
2. Extract the zip into your FoundryVTT `Data/systems/` directory (it should create a `sr2e/` folder)
3. Restart FoundryVTT

### Development Installation

1. Clone this repository into your FoundryVTT `Data/systems/` directory:
   ```bash
   cd /path/to/foundrydata/Data/systems
   git clone https://github.com/futurekill/sr2e-foundryvtt.git sr2e
   ```
2. Restart FoundryVTT

## Compendium Pack Workflow

The LevelDB packs in `packs/` are what Foundry loads; the JSON files in
`packs-src/` are the version-controlled, human-reviewable source of truth.
Keep them in sync with the npm scripts (requires `npm install` once, and
Foundry must be **closed** — LevelDB allows only one process):

```bash
npm run extract-packs            # pull edits made inside Foundry → packs-src/
npm run build-packs              # rebuild packs/ from packs-src/
npm run build-packs cyberware    # rebuild a single pack
```

Edit compendium content either inside Foundry (then extract) or directly in
the JSON sources (then build). Commit both `packs/` and `packs-src/`.

## Releasing a New Version

This project uses GitHub Actions for automated releases:

1. Update the `version` field in `system.json`
2. Commit your changes
3. Create and push a version tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. The GitHub Action will automatically:
   - Update `system.json` with the correct manifest/download URLs
   - Package the system into `sr2e.zip`
   - Create a GitHub Release with both files attached
5. FoundryVTT users with the system installed will be notified of the update

## Compatibility

- **FoundryVTT Version:** V13 minimum, verified on V14
- **Browser:** Any modern browser supported by FoundryVTT

## Project Structure

```
sr2e/
├── system.json              # System manifest
├── module/
│   ├── sr2e.mjs             # Main entry point
│   ├── config.mjs           # System configuration constants
│   ├── data/                # TypeDataModel definitions
│   │   ├── base-data.mjs    # Base data model
│   │   ├── actor-data.mjs   # Character, NPC, Vehicle, Spirit, IC
│   │   ├── item-data.mjs    # All item type data models
│   │   └── _index.mjs       # Barrel export
│   ├── documents/           # Document class overrides
│   │   ├── actor.mjs        # SR2EActor
│   │   ├── item.mjs         # SR2EItem
│   │   └── _index.mjs
│   ├── sheets/              # ApplicationV2 sheet classes
│   │   ├── actor-sheet.mjs  # Character, NPC, Vehicle, Spirit, IC sheets
│   │   └── item-sheet.mjs   # Universal item sheet
│   ├── dice/                # Custom dice/roll classes
│   │   └── sr2e-roll.mjs    # SR2E Success Test roll
│   └── helpers/             # Utilities
│       ├── templates.mjs    # Template preloading
│       └── handlebars.mjs   # Custom Handlebars helpers
├── templates/               # Handlebars templates
│   ├── actor/               # Actor sheet templates
│   │   ├── parts/           # Character sheet tab partials
│   │   ├── npc-sheet.hbs
│   │   ├── vehicle-sheet.hbs
│   │   ├── spirit-sheet.hbs
│   │   └── ic-sheet.hbs
│   ├── item/                # Item sheet templates
│   │   ├── parts/
│   │   └── item-body.hbs
│   └── chat/                # Chat message templates
│       └── roll-result.hbs
├── css/
│   └── sr2e-main.css        # System stylesheet
├── lang/
│   └── en.json              # English localization
├── packs/                   # Compendium packs (future)
└── assets/                  # Images and static assets
```

## Roadmap

### Planned System Work
- **Foundry VTT V14 compatibility** — verify and support V14 when it releases

### Planned Compendium Modules
- **Archetypes Pack** — Additional pre-built characters (a starter set of five
  original sample runners ships in the Sample Runners pack)

### Planned Sourcebook Modules
- **The Grimoire (FASA 7903)** — Additional spells and magical rules
- **Virtual Realities 2.0 (FASA 7904)** — Expanded Matrix rules
- **Rigger 2 (FASA 7906)** — Expanded vehicle and drone rules
- **Street Samurai Catalog (FASA 7104a)** — Additional weapons and gear
- **The Neo-Anarchist's Guide to Real Life (FASA 7208)** — Additional sourcebook content

## Credits

- **Game System:** Shadowrun 2nd Edition by FASA Corporation (1992)
- **FoundryVTT System Development:** James Candalino
- **FoundryVTT:** [Foundry Virtual Tabletop](https://foundryvtt.com/)

## Legal

Shadowrun is a registered trademark of The Topps Company, Inc. This is a fan-made, non-commercial project for use with Foundry Virtual Tabletop. No copyright infringement is intended.

## License

This FoundryVTT system code is released under the [MIT License](LICENSE).
