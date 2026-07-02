# SR2E System — QA Test Plan

A checklist for play-testing the Shadowrun 2nd Edition system in Foundry V13.
Split the sections among testers; mark each case **PASS / FAIL / N/A** and note
anything weird (screenshot + the browser console, F12, helps a lot).

## How to log a bug
For each FAIL note: **what you did**, **what you expected**, **what happened**,
and any **red console errors**. File them wherever the group tracks issues
(GitHub Issues on the repo is ideal).

## Prerequisites / setup
- A world running the **Shadowrun 2nd Edition** system.
- At least one **GM** and one **player** account (some tests need both).
- Import the **SR2E Sample Runners** compendium (street sam, mage, decker,
  rigger, shaman, face, physical adept) — handy ready-made test subjects.
- A scene with a grid and a couple of tokens.

> **Two recurring gotchas to keep in mind while testing:**
> 1. **Number fields save on blur** — after typing a value, click elsewhere (or
>    press Enter) before expecting it to stick.
> 2. **Edit the sidebar actor, not an unlinked token copy.** IC and Host now
>    default to linked tokens; older tokens may be unlinked and diverge.

---

## 0. Automated tests (no Foundry) — run first
- [ ] `npm test` (Vitest) is **green**. This covers the pure rules math in
      `module/rules/` (dice engine, Rule of Six, glitch, staging, derived-data
      helpers, config tables). CI runs it on every push/PR to main.
- [ ] When a manual case below uncovers a rules-math bug, add/extend a test
      asserting the book value (cite the page) before fixing — keep the
      regression covered. Sheet/Dialog/persistence layers are **not** covered by
      Vitest and still need the manual passes below.

## 1. Character sheet & derived data
- [ ] Create a Character; set the six attributes — **Reaction** = ⌊(Quickness+Intelligence)/2⌋ updates automatically.
- [ ] Condition monitors show **10 boxes** each (Physical & Stun); wound thresholds at 1/3/6/10.
- [ ] Set a metatype (e.g. Troll) — racial modifiers and maximums apply.
- [ ] Add skills from the **Skills** compendium; ratings editable, save on blur.
- [ ] Dice pools (Combat / Magic / Hacking / Control / Karma) display and compute.
- [ ] Edit name/bio/notes — prose-mirror notes save on blur, no data loss on re-open.

## 1a. Character creation — priority table
- [ ] Each **priority dropdown** (A–E) shows the priority **and its value** (e.g.
      "A — 30 attribute points", not a bare "A"), per the SR2E priority table.
- [ ] The five categories (attributes / skills / magic / resources / race) **auto-swap**:
      assigning a priority already used elsewhere swaps the two categories so no
      letter is ever used twice.
- [ ] Negative **metatype attribute modifiers** display on the sheet (e.g. an
      attribute reduced by race shows the minus, not just the positive mods).

## 1b. Edges & Flaws (quality item type)
- [ ] Create a **quality** item (Add Edge / Flaw on the bio tab, or from a
      compendium): the item sheet shows Kind (edge/flaw), Category, Point Value,
      Source, Notes; values save on blur.
- [ ] The bio tab's **Edges & Flaws** list shows the character's qualities with
      kind badge + signed value, and a **Net value** that sums the point values
      (Edges positive, Flaws negative).
- [ ] Drag a quality from a content module (e.g. Rigger 2 "Edges & Flaws") onto
      a character → it lands in the list; edit/delete from the row work.

## 2. Success tests & dice
- [ ] Roll an attribute or skill — real dice roll posts to chat; successes counted vs TN.
- [ ] **Rule of Six:** a 6 explodes and compounds (visible in the roll); reachable TNs above 6.
- [ ] **Critical glitch:** force a roll where all dice come up 1 — flagged as a glitch.
- [ ] Toggle the **Rule of Six** world setting off — 6s no longer explode.
- [ ] Wound/injury penalties: damage the character, then a test shows the **+TN injury modifier** (cumulative across both monitors).

## 3. Karma Pool
- [ ] From a success-test chat card, **buy dice / reroll failures / avoid disaster / buy success**.
- [ ] Karma Pool decrements; **buy-success** spends are permanent.
- [ ] A player cannot spend another character's Karma (ownership enforced).

## 3a. Team Karma Pool (SR2E p.246)
- [ ] The shared **Team Karma Pool** is visible to players (UI/macro readout reflects the world setting).
- [ ] A player can **donate** Karma to the pool; their personal pool decrements and the team total rises.
- [ ] A player can **spend/draw** from the team pool; it decrements for everyone.
- [ ] As a **player** (not GM), donate/spend routes through the socket to the active GM and updates for all clients (no "only a GM can modify settings" error).
- [ ] With no GM connected, the player action fails gracefully (clear message, no corruption).

## 4. Ranged combat
- [ ] Fire a weapon — dialog shows TN breakdown (base 4 + range + cover + recoil + …).
- [ ] **Range** auto-detects from measured distance to a targeted token; **target Quickness** pre-fills for melee.
- [ ] **Burst fire (BF):** +3 Power, +1 Damage Level, +recoil; **Full auto (FA):** declare 3–10 rounds, scaling Power/level/recoil.
- [ ] **Recoil** accumulates across the Action Phase; the in-dialog **Reset** zeroes it; recoil comp reduces it.
- [ ] **Ammunition:** load a clip, fire decrements rounds; out-of-ammo blocked; ammo types (explosive/gel/APDS/flechette) carry through to damage.
- [ ] **Smartgun:** a smartgun-compatible weapon + Smartgun Link cyberware applies −2 TN.
- [ ] **Aimed/called shots** via the Other Mod field (tooltip lists the values).
- [ ] **Movement modifiers (p.90):** attacker Walking +1 / Running +4 (+2/+6 on
      difficult ground); target Stationary −1 / Running +2; firing while engaged
      in melee +2 **per opponent**.

## 4a. Weapon accessories (v0.26.0, SR2E p.240–241)
- [ ] **Attach/detach/transfer:** buy a Bipod, attach it to an HK227 via the gear-tab
      dropdown, then detach it and attach it to a different weapon — both directions
      persist after re-opening the sheet (aftermarket accessories are transferable).
- [ ] **Bipod/Tripod deployment:** attached bipod adds a "deployed" checkbox to the
      attack dialog; RC 2 (tripod 6) only counts when it's ticked.
- [ ] **Gas Vent II/III:** attach → +2/+3 recoil comp always on; once attached the
      dropdown **locks** (🔒 — "cannot be removed", p.240); editing the item directly
      still allows a GM override.
- [ ] **Recoil comp stacks:** weapon's own comp + gas vent + shock pad all add
      (p.92–93 example: vent 3 + pad 1 = 4).
- [ ] **Laser Sight:** −1 TN at ≤ 50 m; no effect beyond 50 m (measured target) and
      suppressed entirely when a smartlink/goggles bonus applies.
- [ ] **Smartgun System (External/Internal):** attaching to a NON-smart weapon makes
      it a smartweapon — smartlink cyberware then gives −2; **Smart Goggles**
      (equipped, no smartlink) give −1.
- [ ] **Imaging Scope (Mag 1–3):** shifts the range bracket down (dialog shows
      "Long → Short, scope"); short is the floor.
- [ ] **Gyro Mount (Std 5/Deluxe 6):** reduces recoil + attacker movement penalties
      by up to its rating (dialog shows the −N gyro row); other modifiers untouched.
- [ ] **Vehicle-mounted weapon:** accessories on the vehicle's copy of the weapon
      still apply when a gunner fires it.

## 5. Melee combat (opposed)
- [ ] Attack in melee — posts a card with **Defend / Undefended** buttons.
- [ ] **Defend:** the defender (selected token) rolls; most successes wins, **ties favour the attacker**.
- [ ] A winning defender **strikes back** (riposte) with their own weapon.
- [ ] **Undefended:** attacker's successes stage damage directly.

## 6. Damage resistance & staging
- [ ] An attack card's **Resist Damage** button: defender rolls Body (+ armor), net successes stage damage **down**.
- [ ] Damage boxes apply L=1 / M=3 / S=6 / D=10; filling Physical → unconscious/dead overlays; Stun → unconscious.
- [ ] Stun weapons deal Stun only; armor types (ballistic vs impact) apply correctly.
- [ ] Wound **status markers** appear on the token at each level.

## 7. Magic — spellcasting
- [ ] Cast a spell — Sorcery test vs the spell's TN; **Drain** resisted (Willpower, TN ⌊Force/2⌋+mod).
- [ ] **Force defaults to the spell's learned Force** (set on the spell item sheet) — the cast dialog pre-fills it, no re-entry needed; still adjustable up to Magic.
- [ ] **Combat-spell TN auto-pulls from the target** (SR2E p.130): with a token targeted, the cast dialog shows TN = the victim's **Willpower** (mana spell) or **Body** (physical spell), not a flat 4/6.
- [ ] **Combat spells** post a **Resist Spell** card; target resists with Willpower/Body + Spell Defense, and **damage is applied** (Power = Force, staged by net successes).
- [ ] **Area spells** (Manaball, Powerball, Fireball, Sleep…): radius = the **caster's Magic Rating** in metres; everyone inside gets a resist card.
- [ ] **Sustained spells:** +2 TN per sustained spell; **spell locks** exempt; Active Effects apply real stat changes while sustained and drop when released.
- [ ] **Spell Defense:** allocate Magic Pool dice; they boost spell-resistance and release on pool refresh.

## 8. Conjuring
- [ ] Summon a spirit (shaman nature spirit / mage elemental) — Conjuring + totem vs Force; **no Magic Pool**.
- [ ] **Drain** per the Conjuring Drain Table (Force = ½ Charisma is Moderate).
- [ ] A linked **Spirit actor** is created; its sheet tracks services, powers, manifest attack, banish.

## 9. Astral
- [ ] **Perceive / project** astrally; while projecting, initiative uses **Astral Reaction +15**.
- [ ] **Astral combat:** Sorcery attack, Charisma-based damage, resisted by Astral Body (Willpower).
- [ ] **Repercussion:** astral damage echoes onto the physical monitor.

## 10. Matrix (decking)
- [ ] On a decker (MPCP > 0) Matrix tab: set cyberdeck stats; load persona programs → persona attrs derive (capped at MPCP).
- [ ] **Jack In** → roll initiative shows **" — Matrix"** (1d6 + natural Reaction, +response; ignores wired/magic/VCR).
- [ ] **Matrix Attack** (decker w/ loaded Attack program, or IC) → Resist card → net fills the single 10-box Matrix track; 10 = crash.
- [ ] **Crash a persona** → decker dumped + **dump shock** (+2 all TNs; Shake Off = Willpower vs 4).
- [ ] **Host actor:** set Security Code + System Rating → readout shows successes-to-breach (Blue1/Green2/Orange3/Red4).
- [ ] **System Operation** (decker) → Computer test vs System Rating, beat the code; retries +2 TN; tally advances; **alert** escalates none→passive→active on the 1D6 roll.
- [ ] **IC:** Reaction Time = node-code base (Green5/Orange7/Red9) + Rating + 1d6; **alert** raises ratings +50%.
- [ ] **IC ↔ Host link:** set "Defends Host" → the IC's Code/alert sync from the host live; change the host's alert and the IC follows.
- [ ] **IC perception** ("Detect Intruder"): IC Rating vs target Masking; a success raises the alert.
- [ ] **IC deploy on active alert:** push a host to Active → GM whisper lists the defending IC (and adds their scene tokens to combat if a combat is running).

## 11. Vehicles & rigging
- [ ] Vehicle sheet: handling/speed/body/armor/condition.
- [ ] **Handling / Crash / Position** tests with terrain modifiers and Control Pool.
- [ ] **Ramming:** both vehicles roll; loser crashes; crash damage applies.
- [ ] **Escape test:** pursuer vs fleeing vehicle resolves the chase.
- [ ] **Gunnery:** fire a weapon mounted on a linked vehicle (Gunnery skill).
- [ ] **Rigging (VCR):** jacked-in initiative uses VCR bonuses only; Control Pool = natural Reaction + 2/level; installed VCR cyberware is authoritative.

## 12. Healing
- [ ] **Recover Stun:** Body+Willpower test heals a Stun level per interval.
- [ ] **Heal Physical (natural):** Body test vs the wound TN; Deadly requires medical attention.
- [ ] **First Aid:** medic's Biotech vs the First Aid TN (eased by patient Body); heals a level; magician patient +2.

## 13. Cyberware, foci, adept powers
- [ ] Install cyberware → **Essence** decreases automatically (auto-essence setting); Magic loss follows.
- [ ] VCR / Wired Reflexes / Smartlink apply their bonuses on the sheet.
- [ ] **Cybereyes (container cyberware, SR2 p.247):** add/remove module rows
      (Low-Light, Thermographic, Flare Comp, Camera, etc.) on the Cybereyes item
      sheet; capacity used/over updates; the first **0.5 Essence** of modules is
      free (no extra Essence) and only capacity **over** 0.5 adds to the eyes'
      effective Essence cost; module cost sums into the item cost.
- [ ] Toggle a module **active/inactive** — its combat TN modifier (if any) and
      capacity contribution update; `actualEssenceCost` rounds to 2 decimals and
      respects the grade multiplier.
- [ ] **Foci:** change Force → cost re-derives (Force × per-Force unit); bonding/active toggles.
- [ ] **Programs:** change Rating → Size and cost re-derive (Rating² × multiplier; cost = Size×100).
- [ ] **Adept powers:** Increased Reflexes / Combat Sense / Killing Hands etc. present and editable.

## 14. Compendia & item drops
- [ ] Rated templates are **single entries** (one Power Focus, one Commlink, one Attack program) — editable rating.
- [ ] Drag a rated template onto a sheet → it lands at the default rating (**known: no rating prompt — set it on the item sheet**; see the drop-rating proposal).
- [ ] Drop a weapon/armor/gear → appears with correct stats; icons render (no broken images).
- [ ] **Critters / Runners / Vehicles / IC** compendium actors import with their items intact and proper token art.

## 15. Other sheets
- [ ] **NPC sheet:** stat-block fields, skills, threat/professional rating.
- [ ] **Spirit sheet:** services, powers, manifest attack, banish.
- [ ] **IC sheet & Host sheet:** all fields save on blur; selectors disable correctly when an IC is host-linked.
- [ ] **Vehicle sheet:** linked-actor controls, vehicle weapons.

## 16. Settings, migrations, misc
- [ ] World settings: **Rule of Six**, **auto-Essence**, **confirm-delete**, **scene background** behave.
- [ ] **Interface Theme** (client setting): switching among Default / Terminal /
      Street Samurai / Decker / Mage / Rigger re-skins the sheets immediately
      (Default = unchanged); the choice is per-player and persists on reload. A
      client that previously had the old "Terminal Theme" toggle on comes up on
      the Terminal option.
- [ ] Configurable **play-area background** applies.
- [ ] First-load welcome message + GM utility macros appear: **Award Karma**,
      **Refresh Karma Pool**, **Reset Condition Monitors** — each runs and does
      what it says on a selected/owned actor.
- [ ] Re-open the world after edits — no data loss; migrations run cleanly (GM console shows no migration errors).
- [ ] **Token-link migration:** an existing Character with an unlinked prototype
      token gets relinked by the 0.9.8 migration (spending Karma on a dragged
      token now updates the sidebar actor — see the recurring gotcha above).

## 17a. Contacts & Enemies (v0.13.0)
- [ ] Character sheet → **Contacts** tab shows two sections: **Contacts** (allies)
      and **Enemies**, each with its own count + add button.
- [ ] **Add Contact** creates an ally; **Add Enemy** (skull button) creates a
      contact that lands in the **Enemies** section (contactType=enemy).
- [ ] Type badges colour correctly: contact (muted), buddy (green), **Friend For
      Life** (gold/bold), follower (gold), **enemy** (red).
- [ ] Enemy rows: name is red, columns read **Animosity / Reach**, animosity pips
      are red (`.rating-pip.danger`).
- [ ] Open a contact item sheet → Type dropdown lists Contact / Buddy / **Friend
      For Life** / Follower / **Enemy**; changing to Enemy moves it to the Enemies
      section on the actor sheet.
- [ ] Import the **Contacts** compendium — the 6 enemy archetypes (Vengeful
      Ex-Employer, Rival Shadowrunner, Corp Security Chief, Gang Lieutenant,
      Bounty Hunter, Jilted Fixer) drop in as enemies.

## 17b. Pregens (v0.12.0)
- [ ] Sample Runners compendium now has **7**: import **Silk (Face)** and
      **Tiger (Physical Adept)** — sheets open, items intact, Tiger's adept
      powers + power points show on the magic tab.
- [ ] After the actor-sheet/sheet-actions split, every sheet action still fires
      (roll skill/weapon/spell, add/edit/delete item, tab switch, healing,
      team-karma) — the handlers moved files but behaviour is unchanged.

## 17c. Metamagic — Quickening (v0.14.0)
- [ ] An initiate (magic.initiateGrade ≥ 1) sustaining a spell sees an **∞**
      button on the spell row; clicking it spends Karma = the spell's Force from
      Good Karma and marks the spell **quickened** (∞ glows purple).
- [ ] A quickened spell **stops adding +2 to the sustain penalty** (the "Sustaining
      — +N TN" summary drops by 2), like a spell lock.
- [ ] A non-initiate clicking quicken gets the "not learned" warning; quickening
      with insufficient Good Karma is refused with a warning.
- [ ] Dropping a quickened spell clears the quickened state (Karma is not refunded).

## 17d. Blast / area-effect combat (v0.15.0)
- [ ] Fire an **Offensive Grenade** (or rocket/missile) at a targeted token: the
      damage card shows a **💥 Resolve Blast** button instead of the normal resist.
- [ ] Clicking it (as GM) drops a circular **MeasuredTemplate** at the target and
      posts a card with **one Impact-resist button per token in the radius**, each
      showing reduced Power for its distance (e.g. offensive 10S → 7S at 3 m, 4S
      at 6 m; nothing past 9 m).
- [ ] Each per-target button rolls **Body vs (Power − Impact armour)** and applies
      staged damage (attacker successes already baked into the level).
- [ ] **Defensive** grenades fall off twice as fast (−2/m); **Concussion** deals
      **Stun**.
- [ ] A custom weapon set to a Blast type on its item sheet behaves the same;
      blank = ordinary single-target weapon.

## 17e. Compendium completeness & foldering (v0.20.x)
- [ ] **Weapons** compendium opens with category folders: **Firearms** (9
      sub-folders: Hold-Out → Shotguns), **Melee**, **Thrown**, **Projectile**
      (Bow + Light/Medium/Heavy Crossbow), **Heavy Weapons** (sub-folders Machine
      Guns / Assault Cannons / Launchers / Rockets & Missiles), **Grenades**.
- [ ] **Armor** values are correct — spot-check **Armor Clothing 3/0** (not 1/0),
      **Armor Vest 2/1 @ 200¥**; Vest with Plates, Partial/Full Heavy Armor,
      Helmet, leather, and the clothing tiers are present.
- [ ] **Gear** has the **Survival** folder and the runner gear (surveillance,
      countermeasures, security scanners) under **security**; rated items note
      the per-Rating cost.
- [ ] **Cyberware** folders: **Headware** (Communications / Eyes / Ears /
      Internals), **Bodyware** (Implant Weapons / Body Modification /
      Enhancements), **Cyberlimbs** (Arms / Legs / Torso). Eye Camera, Flare
      Compensation, Ingested-Toxin Filtration present.
- [ ] Drag any newly-added weapon/armor/gear/cyberware onto a character → stats
      intact, icon renders.

## 17f. Skillsofts (v0.21.x)
- [ ] **Configure:** add a skillsoft (Gear → Skillsofts **+**, or drag the
      compendium ActiveSoft/KnowSoft/LinguaSoft). On its item sheet set **Skill
      Type**, then **Quick Pick** a standard skill → Granted Skill + Linked
      Attribute fill in and the chip auto-names ("Firearms ActiveSoft"). Custom
      Knowledge/Language skills can still be typed.
- [ ] **Memory/cost auto-calc:** the item sheet and gear row show **Mp + ¥** from
      the Skill Memory Table — e.g. an **ActiveSoft Firearms rating 8 = 800 Mp,
      80,000¥**; rating 1 = 10 Mp, 1,000¥; a LinguaSoft uses the Language row.
- [ ] **Slot it** (⚡ on the gear row). The **Skillsofts header** tracks
      `ActiveSoft used/budget · Chips used/jacks · Mem used/capacity`.
- [ ] **New skill:** slotting a soft for a skill the character lacks adds a
      ⚡-badged, **rollable** entry on the Skills tab at the soft's rating.
- [ ] **Override:** slotting a soft for a skill they have **replaces** the native
      rating (RAW: natural ability lost while slotted); badge tooltip shows the
      suppressed native rating. Un-slotting restores it.
- [ ] **Skillwire budget (SR2E p.243):** ActiveSofts run at **full rating**, but
      the **sum** of running ActiveSoft ratings can't exceed the **Skillwire
      Rating**. A Rating-8 ActiveSoft on a Rating-1 Skillwire is **refused** when
      slotting; if already slotted it shows **red ⚠ / inert** and does NOT apply.
- [ ] **ActiveSoft with no Skillwires** is refused; **Know/LinguaSofts** are
      gated one-per-chipjack.

## 17g. Shotgun shot-round spread (v0.22.0)
- [ ] A shotgun (choke ≥ 2 on its item sheet — the three core shotguns ship with
      choke 3) shows a **Shot (spread)** checkbox in the attack dialog; other guns
      don't.
- [ ] Firing **without** the checkbox = a normal single-target hit (slug rounds).
- [ ] With **Shot (spread)** ticked and a token targeted: the attack TN drops by
      the spread steps at the target's range (⌊distance/choke⌋), shown in the roll
      breakdown, and a **🔫 Resolve Spread** card is posted instead of a resist.
- [ ] Clicking Resolve Spread (as GM) drops a **cone** template from the shooter
      toward the target and posts **one Impact (flechette) resist per token in the
      cone**, each with Power reduced by its distance steps and **+1 resistance die
      per target standing in front of it**; tokens past the effective range (Power 0)
      are omitted. **🧹 Clear spread cones** removes the templates.
- [ ] Smartlink gives shot rounds only **−1** TN (not −2).

## 17. Sheet styling / layout
- [ ] **Checkboxes align** with their labels across sheets (no staircase): the
      modules table, attribute/skill toggles, equipped flags, and any
      `.form-group` checkbox sit flush, normal-sized, not stretched.
- [ ] Inputs in `.form-group` still stretch to fill (the checkbox fix didn't
      collapse text/number fields).

---

## Smoke test (5-minute sanity pass)
1. Import a Sample Runner; open the sheet; roll a skill.
2. Fire a weapon at a targeted token; resist the damage.
3. Cast a combat spell; resist it.
4. Jack a decker into the Matrix; run one System Operation against a Host.
5. Re-open the world; confirm everything's still there.

If those five all work, the core loop is healthy.

## 18. Shopping, payouts & integrations (v0.26.0)
- [ ] **Street pricing:** set a Street Index ≠ 1 on a gear item → the item sheet
      and gear tab show the street price with the list price alongside.
- [ ] **Auto-charge:** drop a costed item on a character → nuyen drops by the
      street price and a notification reports the purchase; with insufficient
      funds the item is added UNPAID with a warning. Toggle via the
      "Auto-charge purchases" world setting.
- [ ] **Sell-back:** the coins button on gear/cyberware rows refunds what was
      paid (or the current street price) after a confirm, and posts to chat.
- [ ] **Installed cyberware** rows are green/labelled "Installed"; uninstalled
      rows are dimmed.
- [ ] **Award Nuyen macro:** splits a total evenly across selected characters;
      remainder lands in the communal pot (world setting); "include communal
      pot" pays it back out; chat message summarises.
- [ ] **Dice So Nice:** with DSN enabled, "SR2E — Matrix Neon" and "SR2E —
      Street Chrome" appear under Dice Configuration.
- [ ] **Token Magic FX:** with TMFX enabled and a token targeted, ranged
      attacks/spells flash the configured preset on the target (defaults
      shockwave/electric); sound plays when a path is set in settings.
- [ ] **Conc/Spec rolls:** clicking a skill's (Concentration) or [Specialization]
      tag rolls that rating; the attack dialog's "Skill used" select works and
      the chat card notes the variant.
