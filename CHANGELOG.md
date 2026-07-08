# Changelog

Keep this current: add to **Unreleased** as work lands, retitle at release.

## Unreleased

### Features
- **Shadowtalk banter** (prototype): occasional Shadowland margin-chatter à la
  the sourcebooks. Chat cards get a reactive footer line — critical glitches
  always draw commentary; big successes, whiffs and ordinary rolls chime in per
  the new **Shadowtalk banter** world setting (Off / Rare / Chatty, default
  Rare). Character sheets show a daily-rotating line in the header that reacts
  to the character (metatype, chrome count, low essence, mage/adept/decker/
  rigger, broke/rich). Lines are seeded per message/actor so re-renders never
  reshuffle what players already read.

### Features
- **Skill Web defaulting is now live for skill tests** (SR2E p.68–69). Rolling
  an untrained skill no longer adds a flat +4 — it traces the cheapest legal
  path on the Skill Web and charges +2 per circle, defaulting to a *related
  skill you have* when that's cheaper than the attribute (e.g. roll Cybertech
  with Biology → +2, not the attribute route). Connectivity is fully verified
  against the book; circle *costs* on the non-combat clusters are provisional
  (a flat +4 fallback covers any skill not yet on the web, e.g. Launch Weapons).
  Weapon/melee/vehicle defaulting sites are still to come; full-fidelity circle
  counts are in progress.
- **"Roll a Skill…" button** on the Skills tab: pick any skill and roll it
  whether or not the character has it — trained skills roll their rating,
  untrained ones default through the Skill Web automatically. No more adding a
  throwaway skill just to roll a one-off Negotiation check.
- **GM request-a-roll:** when a GM opens "Roll a Skill…" they get a *Request
  from Players* button that posts a card to the table; each player clicks it and
  their own character rolls that skill at the requested TN (trained or
  web-defaulted). Resolves the "everyone make a Perception… I mean Stealth
  check" moment in one click each.

## 0.29.16 — 2026-07-03

### Features
- **More VR2.0 Matrix groundwork** (still behind the Matrix-ruleset setting, no
  effect in Core mode): host actors gained the five ACIFS subsystem ratings
  (Access/Control/Index/Files/Slave) plus a Security Value; a config map of the
  VR2.0 System Operations to their subsystem tests (pp.114–116); and the
  cybercombat rules primitives — Condition Monitor fill (L1/M2/S3/D6), attack/
  resist damage staging (verified against the book's worked example), the flat
  10-box icon monitor, and the Simsense Overload target numbers. All unit-tested
  and page-verified against the VR2.0 book. The roll-time rewiring that consumes
  these comes next (see `docs/AUDIT-VR2.md`).

## 0.29.15 — 2026-07-03

### Fixes
- **Migrate a legacy `magic.type` of "adept" to "physical_adept".** Actors
  imported from older builds could carry the invalid value, which showed up as a
  Document Issue ("adept is not a valid choice") and quietly disabled the
  adept-power-point tally for that actor. World load now normalizes it.

## 0.29.14 — 2026-07-03

### Features
- **VR2.0 program pricing** now applies when the Matrix ruleset is set to Virtual
  Realities 2.0: programs use the tiered Program Prices Table (p.107) instead of
  the flat core-book Size × 100. Rating 4–6 ×200, 7–9 ×500, 10+ ×1,000. Core
  ruleset is unchanged.

## 0.29.13 — 2026-07-03

### Features
- **Groundwork for an optional Virtual Realities 2.0 Matrix ruleset.** A new
  **Matrix ruleset** world setting (Core Rulebook / Virtual Realities 2.0,
  default Core) will let a table swap the core-book Matrix for VR2.0's Matrix 2.0.
  This release lands the switch plus the page-verified VR2.0 rules primitives
  (Cybercombat TN table, IC Damage table, staged dump-shock with cool-deck/ICCM/
  tortoise mitigation, Detection Factor, tiered program prices) with unit tests.
  Nothing branches on the setting yet — the core Matrix is unchanged; see
  `docs/AUDIT-VR2.md` for the build roadmap.

## 0.29.12 — 2026-07-03

### Fixes
- **Unarmed Strike can no longer be sold or deleted.** It's innate to every
  character (SR2E p.100–101), so its sell/delete controls are hidden (replaced
  by a small badge) and both handlers refuse it as a safety net.
- **Unaffordable purchases are now refused instead of added unpaid.** Dropping
  an item a character can't afford used to leave it on the sheet with a warning
  — and it could then be sold for money it never cost. The drop is now rejected
  ("not added"); use Alt-drop to add it for free on purpose.

## 0.29.11 — 2026-07-03

### Fixes
- **Adept power-point costs corrected to the book (SR2E p.126):** Increased
  Reflexes is now **1 / 4 / 6** total for 1 / 2 / 3 Initiative dice (was flat 2),
  Killing Hands (Deadly) costs **4** (was 3), and Pain Resistance costs **0.5**
  per point (was 0.25).
- **Power-point tally now handles the non-linear powers exactly:** Increased
  Reflexes uses the cumulative 1/4/6 table and Increased Reaction uses the tiered
  0.5 / 1 / 2 per-point cost (banded against the racial Reaction maximum), instead
  of a flat pointCost × level. Everything else stays linear.

## 0.29.10 — 2026-07-03

### Features
- **Alt-drop to add an item for free.** Hold **Alt** while dragging an item onto
  a character sheet and the auto-charge is skipped (found loot / GM gift). No
  "paid" flag is set, so selling it later still credits full value. Dropping
  normally charges as before.

## 0.29.9 — 2026-07-03

### Fixes
- **Chargen budget panel now only shows while "Creation in progress" is ticked.**
  Ported and karma-advanced characters have legitimately grown past their
  starting priority allotment, so the panel's red "over-budget" flags were false
  alarms. Untick "Creation in progress" (as you would for any character entering
  play) and the panel — and its red — disappears.

## 0.29.8 — 2026-07-03

### Features
- **Player-facing "Character Creation — Quick Start" journal** in a new
  **SR2E Player Guides** compendium: a three-page walkthrough (step-by-step,
  the priority table, and a "where it lives on the sheet + how to roll" cheat
  sheet) so new players can build a character without page-flipping.

### Fixes
- **Adept power points now show what you've spent** (SR2E p.124). The magic tab
  read "Points: 0 / Magic" no matter how many powers you took — the used total
  was never computed. It now sums pointCost × level and turns red if you exceed
  your Magic rating. (Found in a physical-adept chargen dry-run,
  `docs/CHARGEN-DRYRUN.md`.)
- Corrected metahuman **Reaction racial maxima** to match the book table (p.43);
  they were each +1 high. This data isn't enforced anywhere (cosmetic), and the
  six enforced attribute maxima were already correct.

## 0.29.7 — 2026-07-03

### Fixes
- **Initiative panel now switches to astral values while projecting** (SR2E
  p.147). The roll already used Astral Reaction + 15 with one die, but the
  displayed Initiative box still showed meat Reaction, so it looked like nothing
  changed on projecting. The panel now matches the roll (e.g. Int 4 → base 23,
  1D6).

## 0.29.6 — 2026-07-03

### Fixes
- **Astral Reaction corrected to 2 × Intelligence** (SR2E p.147). It was being
  calculated as ⌊(Intelligence + Willpower) / 2⌋, which understated a projecting
  magician's astral initiative (e.g. Int 4 gave 4 instead of 8 → astral init 19
  instead of 23). Found during a four-archetype chargen dry-run
  (`docs/CHARGEN-DRYRUN.md`); every other derived stat checked out.

## 0.29.5 — 2026-07-03

### Fixes
- Chargen Resources figures now show thousands separators (e.g. `69,520 / 90,000`).

## 0.29.4 — 2026-07-03

### Features
- **Character-creation budget panel** (bio tab): live "spent / allotted" readouts
  for Attribute Points, Skill Points, Resources (¥) and — for spellcasters —
  Force Points, driven by the chosen priorities (SR2E p.44–45). Over-budget rows
  turn red with a warning icon. Purely informational; nothing is enforced.
  Attribute points count the six Physical/Mental base ratings (Reaction/Essence/
  Magic excluded); skill points count Active + Build/Repair skills (Knowledge/
  Language/Special follow the p.74 rules); resources use list price (no Street
  Index); Force Points sum spell Force + focus bonding.

## 0.29.3 — 2026-07-03

### Fixes
- **Special skills no longer disappear** (issue #5): the skills tab was missing a
  render section for the `special` category (SR2E p.45, p.74), so special skills
  added correctly but were invisible. They now show in their own section with an
  Add button.

### Changes
- **Dropping a vehicle onto a character sheet now imports it into the Actors
  directory** when it comes from a compendium, so the drone/vehicle also appears
  in the Actors tab and can be placed on a map (the linked copy is what the sheet
  references).

## 0.29.2 — 2026-07-03

### Fixes
- **Weapon skills corrected to real SR2 skills (p.66):** LMGs and grenade
  launchers now use **Firearms**; MMGs, HMGs, assault cannons and rocket/missile
  launchers use **Gunnery**. The bogus "Heavy Weapons" skill (not in the book)
  was removed; LMGs are no longer treated as heavy weapons (no double recoil).
- **Concentrations now roll from the skills tab** — the (Concentration)/[Special-
  ization] tags are their own click targets, so clicking one rolls that rating
  instead of always rolling the general skill.
- **Attacks find a concentration/specialization skill by weapon name** when
  there's no matching base skill, so a katana or bow rolls the right pool
  instead of defaulting to an attribute.

## 0.29.1 — 2026-07-03

### Features
- **Setting a character's prototype-token image now also sets the sheet
  portrait** (world setting "Token image sets the portrait", default on) — art
  only has to be picked once. Turn it off to keep token/portrait independent,
  or set the portrait in the same edit to override.


## 0.29.0 — 2026-07-02

### Fixes
- **Adept powers now update Reaction and Initiative dice.** Power effects
  scale by level (Increased Reaction +1 Reaction/level, Improved Physical
  Attributes +1/level); AdeptPowerData gained an initiativeDice mod and
  Increased Reflexes now grants +1 Initiative die per level (was inert).
- **Foci now show for physical/shamanic adepts** — the Foci section (and
  Conjuring) were wrongly nested inside the Sorcery gate, so non-sorcerers
  never saw them.
- **Weapon data corrections (Equipment Table p.254-255):** 14 concealability
  values fixed (Ares Viper 6, Remington Roomsweeper 8, HK227-S 5, FN HAR 2,
  bows/crossbows 2, etc.); Sap now uses Armed Combat (it's a club), not Unarmed;
  Colt M22A2 / Mossberg CMDT concealability sourced from the SSC.
- **Weapon Focus now works**: a bonded weapon focus adds its Force in dice to
  melee attacks. A melee weapon item can itself be a Weapon Focus
  (Force + bonded fields, ✦ badge on the combat tab), or a bonded active
  weapon-type focus item supplies the dice.

## 0.28.0 — 2026-07-02

### Fixes
- **Muscle Replacement/Augmentation no longer raises Reaction** (SR2E p.249) —
  its Quickness bonus still counts for Combat Pool and tests but is excluded
  from Reaction. The core item was also inert (empty mods); rebuilt as Rating
  1–4 items granting +Rating Strength AND Quickness. World migration flags
  existing copies.
- **Adept power descriptions now show** on the item sheet — the adept_power
  sheet block had no description editor, so the book text (already in the
  compendium) was never visible.

## 0.27.0 — 2026-07-02

### Features
- **Sell button on weapon/armor/ammo rows** (combat tab) — anything paid for
  can be sold back, not just gear/cyberware.

### Fixes
- **Street Indexes transcribed from the book tables** (p.254–257) for weapons,
  armor, ammunition and grenades — everything previously defaulted to SI 1
  (street price = list price). Catalog guns absent from the core tables keep
  SI 1 pending Street Samurai Catalog capture.

## 0.26.0 — 2026-07-02

### Features
- **Weapon accessories** (p.240–241): attach/detach/transfer between weapons;
  bipod/tripod deployment; gyro mounts (recoil + movement); imaging scopes
  (range-bracket shift); smartgun systems grant smart capability; laser sight
  gated to 50 m / no smartlink stacking; gas vents & internal smartguns lock
  once mounted. 12 new accessory items.
- **Shopping & economy**: Street Index pricing (list vs street shown);
  auto-charge on drop — list price during character creation, world setting to
  disable; sell-back refunds the price paid; **Award Nuyen** macro with a
  communal pot.
- **Combat**: Visibility dropdown (p.89) with context-aware auto-detect (smoke
  clouds + scene darkness); **knockdown test** on damage cards (p.91);
  explosive-round **misfire** on all-ones (p.93); **smoke grenades** drop cloud
  templates (optional darkness light); **concentrations/specializations** now
  roll (skills-tab tags + attack-dialog select).
- **Integrations**: Dice So Nice colorsets; Token Magic FX visuals + optional
  sounds on attacks and spells.
- Default **Unarmed Strike** on every character (#3).

### Fixes
- Adept powers were invisible on the sheet (#2); cyberware essence/cost sweep
  vs the book tables — VCR, Skillwires, headware radio + 16 more (#4).
- Wired Reflexes/Smartlink/Dermal Plating were mechanically inert.
- Worn armor stacked additively — now highest + layered (p.242); heavy armor
  reduces the Combat Pool (p.84); heavy weapons double uncompensated recoil.
- Movement modifiers (+1 walk/+4 run), target stationary −1, firing-in-melee
  +2 per opponent (p.90); Melee Weapons Table corrections (9 items).
- Grenade launchers fired as direct hits instead of blasts; initiation Karma
  now rounds down (Grimoire p.41).
- A 0.26.0 world migration repairs existing cyberware and backfills the
  Unarmed Strike.

## 0.25.0 — 2026-07-01
- Combat spells: fixed Force (set when learned), target-derived TN
  (Willpower/Body), area spells use the blast engine with Magic-rating radius.

## 0.12.0 – 0.24.0 (summary)
- Matrix play (persona, cybercombat, system operations, IC/Host actors),
  vehicle/rigger play + design engine, conjuring + spirit sheets, astral
  projection/combat, opposed melee, initiative passes, Karma Pool flows,
  healing, blast engine + scatter, metamagic (Centering/Shielding/Quickening),
  contacts & enemies, skillsofts, shotgun spread, priority chargen + Sum-to-10,
  compendium build-out and audits. Full notes per release:
  https://github.com/futurekill/sr2e-foundryvtt/releases

## 0.11.3

### Fixes
- **NPC armor now includes equipped armor items.** NPC armor was a flat field only;
  equipped `armor` items are now added on top of it (backward-compatible — NPCs
  without armor items are unchanged), so a GM can swap an NPC's armor on the fly.

## 0.11.2

### Fixes
- **NPC sheet skills are clickable to roll** — the skill name now rolls the skill
  test (matching the weapon rows), instead of only being editable.

## 0.11.1

### Fixes
- **Resist/defend cards target the right actor.** The attacker's target (T key) is
  now baked into ranged-damage, spell, astral, and Matrix attack cards, so the
  *target* resists even when the attacker has their own token selected (previously
  whoever was selected resisted). Un-targeted attacks fall back to the controlled
  token / assigned character. Melee Defend is unchanged — the defender clicks it
  with their own token, which is the correct opposed-melee flow.

## 0.11.0

### Features
- **Token condition bars**: the bar-attribute dropdown is curated to the
  Physical/Stun monitors; tokens already default their bars to them, fill toward
  incapacitation (matching the SR sheet), and drag to apply damage.
- **Spell casting** now adds a bonded+active Spell Focus's Force as bonus dice
  (p.137), with a "+N focus" note.
- **Sustained-spell penalty badge** in the sheet header (+N TN while sustaining).
- **Initiate metamagic**: a learned-technique list on the magic tab (Centering,
  Masking, Quickening, Shielding, Anchoring, Dispelling — Grimoire).
- **Single-use foci**: `FocusData.expendable`; such foci (Grimoire fetish foci)
  get a one-click **Spend** button.
- **Sum-to-10 character creation** (Companion p.20): a priority-method toggle that
  validates the grade values total 10 instead of each A–E used once.
- Header condition readout is bigger/brighter.

## 0.10.0

### Features
- **Vehicle design-from-scratch engine.** A new Design tab on the vehicle sheet
  builds vehicles by the Rigger 2 rules (p.108-123): a point-buy calculator
  (Design Points = chassis + power plant + improvements + mods; cost = DP ×
  Mark-Up × 100), the Mark-Up Factors Table (p.114), Cargo-Factor and Load budget
  tracking (p.115), and the minor design options (p.116-117). Content modules
  register the chassis/power-plant tables; Rigger 2 supplies them.
- **Edges & Flaws.** New `quality` (Edge/Flaw) item type with attribute / skill /
  physical / mental / social / magical / miscellaneous categories and a signed
  build-point value. The Shadowrun Companion module supplies the full catalog.
- **Fire vehicle weapons from the vehicle sheet.** Clicking a mounted weapon opens
  the standard attack dialog; a gunner (a controlled character/NPC token, else the
  user's assigned character) fires it with Gunnery (p.105). A vehicle can't fire
  its own weapons — with no gunner the shot is refused.
- **Vehicle mods modify stats.** Installed mods fold into the build's Design
  Points/cost and add to the vehicle's armor and signature; rated mods expose an
  editable Rating that drives their Design Points / CF / Load.

### Fixes
- Fixed a black screen on world load caused by the new `quality` data model not
  being re-exported from the data index.

## 0.9.11

### Fixes
- **Global checkbox styling.** Checkboxes across the system rendered
  inconsistently — item-sheet `.form-group` rows applied `flex: 1`, stretching
  the box off-center, and the generic input rule wrapped every checkbox in a
  bordered, padded box. Checkboxes now render as clean, consistently-placed
  native controls everywhere (Installed/Equipped/VCR toggles, chargen, the
  cybereyes modules table, etc.).

## 0.9.10

### Fixes
- **Cybereyes modules table — checkbox alignment.** The "On" column checkboxes
  drifted within their cells (auto table layout + inline-flow centering). The
  table now uses a fixed layout and the checkbox is centered with a flex wrapper
  (the whole cell is clickable too).

## 0.9.9

### New
- **Cybereyes are now a container you augment with modules** (fixes #1). The base
  cybereyes cost **0.2 Essence** and accept vision modules up to a free **0.5
  Essence** capacity — only module essence beyond that adds to the total (SR2E
  p.247). On the cybereyes item sheet, toggle which modules the eyes carry; the
  sheet shows capacity used / over and the resulting Essence. Modules can also
  carry a TN modifier (e.g. a Smartlink), which flows through to the smartgun
  bonus. The mechanism is generic, so cyberears can use it too.
- The **Cybereyes** compendium item ships pre-loaded with the book's eye modules
  (Low-Light, Thermographic, Flare Compensation, Camera, Cosmetic Modification,
  Retinal Duplication), each toggleable.

### Fixes
- The base cybereyes were charging a flat **0.4** Essence (should be 0.2) with no
  capacity rule — corrected.
- Removed **Smartgun Link** from the Cyberware compendium: it was a redundant,
  mis-cited duplicate of the **Smartlink** (the real implant, p.249). Also folded
  the standalone Eye Camera / Flare Compensation / Eye Cosmetic items into the
  cybereyes modules.

## 0.9.8

### Fixes
- **Player characters now use linked prototype tokens.** Dragging a PC to the
  canvas previously created an *unlinked* token, so spending karma (or taking
  damage) on that token edited a private copy and never updated the sidebar
  actor. Characters (and IC/Host) now default to linked tokens, and a migration
  links existing characters on world load. NPCs/critters/spirits stay unlinked.
  - Tokens already placed on a scene stay unlinked — delete and re-drag them
    (or tick "Link Actor Data" in the token's config) to pick up the fix.

## 0.9.7

### New
- **Team Karma Pool** (SR2E p.246) — a shared pool of Karma Pool points, shown
  on every character's Bio tab. Players can **Contribute** points from their own
  Karma Pool into the team pool and **Draw** from it (the team total stays in
  sync across all clients; players' changes are applied via the GM). Drawing is
  meant to follow the book's "majority agreement" — adjudicated at the table.
- **Two new GM macros** (auto-created on world load):
  - **Refresh Karma Pool** — restores every character's Karma Pool to its full
    value (Career Karma ÷ 10, min 1) at the start of a session/encounter.
  - **Reset Condition Monitors** — clears Stun, Physical, and overflow on the
    selected tokens.

### Notes
- This is a first pass at Team Karma as a simple shared bank. It does not yet
  model the book's automatic per-scene refresh or enforce the agreement vote.

## 0.9.6

Playtest feedback from the group.

### Fixes
- **Metatype attribute penalties now show on the sheet.** The Mental attribute
  block (Charisma/Intelligence/Willpower) only rendered *positive* racial and
  cyber modifiers, so an ork's −1 Charisma/Intelligence or a troll's −2/−2/−1
  were invisible — the penalty was applied to the total but looked like it
  wasn't. The block now renders negative modifiers like the Physical block.
- **Character-creation priority dropdowns** now show what each grade grants
  (e.g. "A — 30 points", "C — 90,000¥", "A — Any metatype") instead of bare
  A–E. Picking a grade another category already holds now **auto-swaps** the
  two so the five priorities always stay a valid A–E permutation (SR2E p.54),
  with a warning banner as a fallback if the data is ever otherwise invalid.
- **Weapon stat corrections against the core rulebook (p.94).** Audited the
  Weapons compendium; fixed the Uzi III (clip 16→24, mode SA/BF→BF, damage
  7M→6M, conceal 4→5, cost), HK227 (mode→SA/BF/FA, cost), Ruger Super Warhawk
  (damage 9S→10M), Remington 950, Ranger Arms SM-3, Defiance T-250 (damage/
  cost), Panther Assault Cannon (mode SA→SS, ammo, cost), and conceal/cost on
  the Walther Palm Pistol, Colt America L36, Fichetti Security 500, Ares
  Predator, and Browning Max-Power. Filled in weapon weights for those items.
  Split the single ambiguous "AK-97" into the two book entries: **AK-97**
  (assault rifle, 38(c)/8M) and **AK-97 SMG/Carbine** (30(c)/6M).

## 0.9.5

### Fixes
- **IC and Host icons now ship in releases.** `assets/icons/` was silently
  excluded from git (a global macOS `Icon?` ignore rule matched the `icons`
  directory case-insensitively), so the IC chip and Host server SVGs were
  missing from every release — on a fresh install the Intrusion Countermeasures
  compendium showed generic placeholders. Force-tracked the icons and added a
  repo `.gitignore` negation so it can't recur.

### New mechanics
- **IC deploy on active alert** (p.168) — when a host escalates to an active
  alert, the GM is whispered the list of defending IC, and any of those IC's
  tokens on the active scene are automatically added to the combat tracker.

### Internal
- Backfilled tests for wound level, the First Aid Body modifier, and the
  opposed-melee outcome; documented aimed/called-shot modifiers in the attack
  dialog; added a CI workflow that runs the test suite on push.

## 0.9.4

### Internal
- Expanded the Node test suite to 63 tests, backfilling coverage for the
  damage- and drain-code parsers, the healing / metatype / vehicle tables, the
  firearm burst/full-auto/recoil math, astral reaction, spell-drain TN, and the
  net-successes damage-staging steps. Extracted the ranged-attack TN modifier
  table into `CONFIG.SR2E.rangeTnMods`. No gameplay changes.

## 0.9.3

### New mechanics
- **IC perception / "Detect Intruder"** (p.169) — the SR2 equivalent of later
  editions' Detection Factor. An IC scans for an intruder by rolling its
  (alert-boosted) Rating against the persona's Masking; any success means it
  notices the decker and raises the alert on its linked Host (propagating to
  every IC there). A "Detect Intruder" button on the IC sheet, pre-filling the
  target's Masking from a targeted decker token.

### Changes
- **Derived costs** — program cost (Size × 100) and magical-focus cost
  (Force × per-Force unit) now recompute from the rating/force, so the collapsed
  one-template-per-type items price themselves correctly when you change rating.

## 0.9.2

### New mechanics
- **Weapon accessories** (p.241, Street Samurai Catalog) — gear marked as a
  weapon accessory (Laser Sight, Gyro Mount, Bipod, Silencer, Smartgun System,
  …) can be **attached to one weapon at a time** from the gear list. While
  attached, its Attack-TN modifier and recoil compensation apply to that
  weapon's attacks. Compendium gear pre-set: Laser Sight −1 TN, Gyro Mount
  +5 recoil comp, Bipod +2. Configure custom accessories on the gear item sheet.

### Changes
- **Rated compendium items collapsed to one editable template each** instead of
  a separate copy per rating. Matrix Programs (108 → 18), Magical Foci (30 → 5:
  Power/Spell/Weapon/Spirit Focus, Spell Lock), the Increased Reflexes and
  Combat Sense adept powers, the Commlink cyberware, and rated gear (Medkit,
  Fake SIN, etc.). Drop the item and set its rating/force on the item sheet.

## 0.9.1

### New content
- **Intrusion Countermeasures compendium** (p.169–170) — 11 ready-to-drop IC
  actors: white (Access, Barrier, Scramble), gray (Killer, Blaster, Tar Baby,
  Trace and Dump, Trace and Burn), and black (Tar Pit, Trace & Report, Killer),
  each with its rating, node Security Code, and a note describing its effect.
  Link one to a Host and its Code/alert sync automatically.

## 0.9.0

### New mechanics
- **Matrix cybercombat** (p.178–180) — the first slice of the decking
  subsystem. A jacked-in decker attacks with a loaded Attack program
  (Program Rating + Hacking Pool) and IC attacks with its Rating; the defender
  resists (a persona rolls MPCP vs the decker's Computer skill, IC rolls its
  Rating vs the node's System Rating). Net successes fill the single 10-box
  Matrix condition track, and 10 boxes crash it — a crashed persona dumps its
  decker and suffers **dump shock** (+2 to all TNs until a Willpower(4) test
  shakes it off). Resolved with the opposed-card pattern: a Matrix Attack card
  with a Resist button.
- **Matrix initiative** — a jacked-in decker rolls 1d6 + natural Reaction,
  +2 Reaction and +1d6 per response level (wired reflexes, magic, and VCR
  bonuses do not apply).
- Persona attributes (Bod/Evasion/Masking/Sensor) now derive from the
  highest-rated loaded persona program, capped at MPCP.

- **IC Reaction Time & alert boost** (p.168–169) — IC initiative now follows
  the book: Reaction = the node's Security Code base (Green 5 / Orange 7 /
  Red 9) + the IC's Rating, then 1D6. An IC carries its node's Security Code and
  alert state; a passive/active alert raises all its ratings +50% (used in its
  attack, resistance, and Reaction). Shown on the IC sheet.
- **IC ↔ Host linking** — an IC can be set to defend a Host node; the host's
  Security Code and alert then sync to it automatically, so when a decker's
  system operation escalates the host to a passive/active alert, every IC
  guarding it is boosted in the same instant (set it once on the host).
- **System operations & hosts** (p.165–168) — a new **Host** actor type
  represents a node (Security Code color + numeric System Rating). A jacked-in
  decker runs a system operation (Locate, Read, Transfer, Edit, Erase, Control,
  Cancel Alert, Lockout, …) as a Computer Test (Hacking Pool / Karma addable)
  against the node's System Rating, needing to beat the Security Code in
  successes (Blue 1 · Green 2 · Orange 3 · Red 4); each retry adds +2 TN. The
  intrusion tally advances automatically and an alert roll (1D6 ≤ attempts)
  escalates the node none → passive → active, with the result posted to chat.

- **Matrix utility programs** (p.174–177) — the operational decking software is
  now in the Programs compendium at Ratings 1–6: Slow, Mirrors, Shield, Smoke,
  Medic, Analyze, Evaluate, Browse, Decrypt, Scramble, Deception, and Relocate,
  each categorised and annotated with its function. Program memory size is now
  the correct **Rating² × multiplier** (was Rating × multiplier), and the Attack
  program's multiplier is corrected to ×2.

### UI
- Decker Matrix tab: jack in/out toggle, persona condition monitor, a
  Matrix Attack control, a System Operation control, and a dump-shock
  indicator with a Shake Off button
- IC sheet: a Matrix Attack button
- New Host sheet: Security Code, System Rating, successes-to-breach readout,
  alert state, intrusion-tally counter with a Reset button

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
