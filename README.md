# Shadowrun 2nd Edition - FoundryVTT Game System

A comprehensive game system for **Shadowrun Second Edition** (FASA 7901) built for [Foundry Virtual Tabletop](https://foundryvtt.com/) V13.

## Overview

This system implements the core rules from Shadowrun 2nd Edition, bringing the cyberpunk-meets-magic world of 2053 to your virtual tabletop. It supports the full range of character types from street samurai to deckers, magicians to riggers.

**How-to guides for players and GMs are in the [wiki](https://github.com/futurekill/sr2e-foundryvtt/wiki).**

## Features

### Actor Types
- **Characters** — Full player character sheets with the priority-based character creation system, attributes, skills, dice pools, condition monitors, and support for all character archetypes
- **NPCs** — Streamlined NPC sheets with threat ratings and professional ratings
- **Vehicles** — Complete vehicle stat blocks with handling, speed, body, armor, and condition monitors
- **Spirits/Elementals** — Force-based spirit sheets for nature spirits and elementals
- **IC (Intrusion Countermeasures)** — Matrix IC stat blocks for decking encounters
- **Hosts** — Matrix systems with Security Code and ratings; IC link to their host
- **Critters** — Stat blocks for the core book's normal animals and paranormal beings (powers and weaknesses noted; descriptions are original)
- **Sample Runners** — Five original ready-to-play characters: street samurai, combat mage, decker, rigger, and dog shaman
- **Vehicles & Drones** — All 32 vehicles and drones from the core rulebook table (cars, bikes, boats, aircraft, rotorcraft, military, and drones) with handling, speed, body, armor, signature, and pilot stats

### Item Types
- **Skills** — Active, knowledge, language, and special skills with concentrations and specializations
- **Weapons** — Melee, projectile, throwing, firearms (with firing modes and ammo tracking), heavy weapons, and grenades
- **Armor** — Ballistic and impact armor with equip/unequip tracking
- **Spells** — All five spell categories (Combat, Detection, Health, Illusion, Manipulation) with force, drain codes, and type/range/duration
- **Cyberware** — Headware, bodyware, and cyberlimbs with essence costs, grades (Standard/Alpha/Beta, Street Samurai Catalog p.98), and attribute modifiers
- **Bioware** — Body Index costs, cultured bioware, and the Body Index limit (Shadowtech)
- **Edges & Flaws** — Qualities that change attributes, skills and costs
- **Metatypes & Traditions** — Race and magical-tradition items that set a character up when dropped on the sheet
- **Vehicle Modifications** — Options and weapon mounts for vehicles and drones
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
- **Ranged Combat in Depth** — Burst and full-auto with recoil, multiple targets and walking fire (p.92–93), called shots, grenades thrown at a point on the map with the Scatter Diagram (p.96–97), APDS and anti-vehicle warheads (p.108), and damage that stages on net successes
- **Spellcasting in Depth** — Area spells placed on the map, Spell Defense for anyone you choose (p.132), learning spells (p.132–133), exclusive and fetish-required spells (p.133), ritual sorcery (p.133–137), damaging manipulation spells (p.129–131), and Ignite, Poltergeist and Ice Sheet doing what the book says
- **Spirits in Depth** — Spirit services, fighting and running out, the 24-hour rule (p.139–142), elementals aiding spells and sustaining them, Aid Study, and nature spirits that vanish at sunrise and sunset (p.139)
- **Astral Space** — NPC magicians perceive and project; a projecting character's astral form is its own token that walks through ordinary walls but is stopped by living, warded and fat-bacteria barriers (p.145); astral-only tokens are hidden from mundane viewers
- **Fat Bacteria Zones** — A Region behaviour that slows and reveals astral forms (Corporate Security Handbook p.103)
- **Matrix Jackpoints** — A Region behaviour on a terminal: jacking in moves the decker's view to a Matrix map with their persona (see docs/MATRIX.md)
- **Drugs, Toxins & Addiction** — Use a dose, onset and duration, crash, and the full Shadowtech addiction rules (p.85–100), tracked per character; optional Calendaria integration for deadlines
- **Purchasing** — Dropping gear onto a character offers a buy dialog with rating and grade pricing, charges nuyen, and refunds on removal (optional)
- **Vehicle Design** — A Design tab that builds a vehicle from scratch with the design engine (tables supplied by the Rigger 2 module)
- **Movement Limit** — Optionally caps each token's move in combat at its SR2 walk/run rate (p.83)
- **Mobile Companion** — On a phone or tablet, players get a touch-first character screen instead of the map: rolls, attacks, spells, conjuring, chat, and targets shared with their computer (see "Playing on a phone" below)
- **Integrations** — Dice So Nice dice textures, Token Magic FX combat effects, Calendaria

### System Settings
World settings (GM):
- Rule of Six; auto-calculate Essence from cyberware
- Matrix ruleset (core book / Virtual Realities 2.0)
- More Metahumans (optional rule); Team Karma
- Limit movement in combat
- Charge for purchases automatically; communal nuyen pot
- Spirit token placement and astral-by-default; nature spirits' sunrise/sunset hours and expiry
- Smoke darkness; Combat FX (Token Magic FX)
- Substance notes in Calendaria; play-area background image

Per player:
- Interface theme and Shadownet terminal theme
- Shadowtalk banter frequency (off / rare / chatty)
- How dice sources are shown on roll cards
- Item-deletion confirmation

### GM Tools
These GM-only macros install themselves into the world's **Macro Directory** on
load (and re-sync when the system updates). Each previews what it will do and
asks before changing anything. In Foundry, see the **GM Tools & Utility Macros**
journal in the *SR2E Player Guides* compendium.

- **Award Karma / Award Nuyen / Team Karma Pool / Refresh Karma Pool / Reset
  Condition Monitors / Request a Skill Roll** — the everyday GM helpers.
- **Consolidate Ammo** — merges a character's duplicate ammo piles into one stack
  each (select the token first). Same-shape piles only; sums quantity and paid
  value so nothing is lost.
- **Repair Stale Implants** — fills mechanical fields on implants installed
  *before* a system update added them (e.g. bone lacing's unarmed Power,
  Enhanced Articulation's die). Foundry never updates a compendium copy already
  on a character, so this back-fills only fields still at their default.

Each is a wrapper over the scripting API, also callable from the console:
`game.sr2e.consolidateAmmo(actor, { dryRun: true })` and
`game.sr2e.repairStaleImplants()` (add `{ apply: true }` to write).

## Playing on a phone
A phone or tablet smaller than 1024 × 768 that opens your Foundry address gets the
**mobile companion**: the player's character as a touch screen, with no map. Keep
the map on a computer and roll from the phone. Picking a target on either device
targets it on both. Things that need a map (aiming a grenade at a point, placing an
area spell, placing a conjured spirit's token) are done from the computer.
"Open full Foundry on this device" switches back; `?companion=1` in the address
forces it on.

**Already logged in on the computer?** Foundry's join page won't offer your user
twice, so use **Open on phone** in the Settings sidebar: scan its QR code with the
phone and enter your password. The phone gets its own login.

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
the JSON sources (then build). Commit `packs-src/` only: `packs/` is gitignored,
and the release workflow builds it.

## Tests

```bash
npm run lint    # ESLint; runs first in CI
npm test        # Vitest: the rules math, no Foundry needed
```

UI, sheet and chat-card behaviour is covered by [Quench](https://github.com/Ethaks/FVTT-Quench)
batches inside Foundry (docs/QUENCH.md); run them as `sr2e.**`. The manual
checklist is docs/QA-PLAN.md.

## Releasing a New Version

This project uses GitHub Actions for automated releases:

1. Retitle `## Unreleased` in `CHANGELOG.md` to `## X.Y.Z — date` (the release
   notes come from that section; the release fails without one)
2. Update the `version` field in `system.json` and commit
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

- **FoundryVTT Version:** V13 (minimum and verified; V14 support is planned)
- **Browser:** Any modern browser supported by FoundryVTT

## Project Structure

```
sr2e/
├── system.json         # System manifest
├── module/
│   ├── sr2e.mjs        # Entry point: hooks, settings, registration
│   ├── data/           # TypeDataModels; ALL derived data lives here
│   ├── documents/      # SR2EActor, SR2EItem, SR2ECombat
│   ├── sheets/         # ApplicationV2 sheets and their shared actions
│   ├── rules/          # Pure rules math (unit-tested, no Foundry deps)
│   ├── companion/      # Mobile companion mode
│   ├── quench/         # In-Foundry test batches
│   └── *.mjs           # Feature modules: astral, drugs, jackpoints, ritual, …
├── templates/          # Handlebars templates
├── css/  lang/  assets/
├── packs-src/          # Compendium source (JSON); packs/ is built from it
├── test/               # Vitest
├── tools/              # Pack build/extract and data generators
└── docs/               # Plans, audits, QA plan, Matrix and macro guides
```

## Sourcebook Modules

Optional content modules, each its own repository and install:

| Module | Contents |
|---|---|
| [The Grimoire](https://github.com/futurekill/sr2e-grimoire) | Totems, foci and physical adept powers |
| [Street Samurai Catalog](https://github.com/futurekill/sr2e-street-samurai-catalog) | Gear, weapons, armor and cyberware |
| [Shadowtech](https://github.com/futurekill/sr2e-shadowtech) | Bioware, expanded cyberware, gene-tech, drugs and toxins |
| [Rigger Black Book](https://github.com/futurekill/sr2e-rigger-black-book) | The vehicle and drone catalog (SR1, converted) |
| [Rigger 2](https://github.com/futurekill/sr2e-rigger-2) | Vehicles, drones, modifications, vehicle weapons, rigger cyberware and sensors |
| [Fields of Fire](https://github.com/futurekill/sr2e-fields-of-fire) | Mercenary weapons, ammunition, armor, gear and vehicles |
| [Shadowrun Companion](https://github.com/futurekill/sr2e-shadowrun-companion) | The Edges & Flaws catalog and other character options |
| [Neo-Anarchists' Guide to Real Life](https://github.com/futurekill/sr2e-neo-anarchists) | Holdout weapons, armor clothing, surveillance gear, transport and lifestyles |
| [Corporate Security Handbook](https://github.com/futurekill/sr2e-corporate-security) | Security gear, fat bacteria, VTOLs and drones, personnel, the Goose totem |
| [Paranormal Animals of Europe](https://github.com/futurekill/sr2e-paranormal-animals) | The Awakened animals, as critter actors |
| [Double Exposure](https://github.com/futurekill/sr2e-double-exposure) | Adventure: scenes, NPCs, maps and GM journals |
| [Queen Euphoria](https://github.com/futurekill/sr2e-queen-euphoria) | Adventure, modernized from 1st edition, with battle maps |
| [Missions](https://github.com/futurekill/sr2e-missions) | Adventures to drop between Double Exposure's runs |
| [Pink Fohawk](https://github.com/futurekill/sr2e-pink-fohawk) | Player characters and cast for one table |

## Roadmap

- **Foundry VTT V14 compatibility** when it releases
- **Virtual Realities 2.0** as a full ruleset (the core Matrix is implemented; a VR2.0 toggle exists)

## Credits

- **Game System:** Shadowrun 2nd Edition by FASA Corporation (1992)
- **FoundryVTT System Development:** James Candalino
- **FoundryVTT:** [Foundry Virtual Tabletop](https://foundryvtt.com/)

## Legal

Shadowrun is a registered trademark of The Topps Company, Inc. This is a fan-made, non-commercial project for use with Foundry Virtual Tabletop. No copyright infringement is intended.

## License

This FoundryVTT system code is released under the [MIT License](LICENSE).
