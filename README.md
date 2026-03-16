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
- **Initiative** — Reaction-based initiative with variable dice from cyberware/magic
- **Condition Monitors** — Physical and stun damage tracking with wound level penalties (Light/Moderate/Serious/Deadly)
- **Damage Staging** — Automatic damage staging based on net successes
- **Essence/Magic Link** — Cyberware automatically reduces Essence, which reduces Magic rating for magicians

### System Settings
- Rule of Six toggle
- Optional "More Metahumans" rule
- Initiative style (standard/cinematic)
- Auto-calculate Essence from cyberware
- Configurable condition monitor size

## Installation

1. In FoundryVTT, go to **Game Systems** → **Install System**
2. Paste the manifest URL into the **Manifest URL** field
3. Click **Install**

### Manual Installation

1. Download or clone this repository
2. Place the `sr2e-foundryvtt` folder into your FoundryVTT `Data/systems/` directory
3. Rename the folder to `sr2e`
4. Restart FoundryVTT

## Compatibility

- **FoundryVTT Version:** V13 (minimum and verified)
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
│   └── sr2e.css             # System stylesheet
├── lang/
│   └── en.json              # English localization
├── packs/                   # Compendium packs (future)
└── assets/                  # Images and static assets
```

## Roadmap

### Planned Compendium Modules
- **Core Equipment Pack** — All weapons, armor, cyberware, and gear from the core rulebook
- **Core Spells Pack** — Complete spell directory from the core rulebook
- **Archetypes Pack** — All 16 pre-built archetypes
- **Critters Pack** — Awakened beings and paracritters
- **Contacts Pack** — NPC contact archetypes

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
