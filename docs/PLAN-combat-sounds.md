# Plan: combat sound effects by weapon class, firing mode and spell category
_APPROVED by Codex in round 3, with its three final notes applied (see PLAN-combat-sounds-REVIEW-LOG.md)_

## Goal
Play a short, fitting sound for everyone at the table when a character attacks,
casts, reloads, dry-fires or sets off a blast: one sound per weapon class and firing
mode (all SMGs on full auto sound alike), not per weapon. About 25 sounds, ~1–1.5 MB,
generated once with the ElevenLabs sound-effects API and shipped with the system.
Optional: a world setting turns it off.

## Findings (2026-10-16)
- **What exists:** `playCombatFx(kind, targets)` (`module/integrations.mjs`) plays ONE
  world-setting sound path for every ranged attack (`fxSoundGunshot`, only for
  `weaponType` firearm/heavy, `item.mjs` ~1063) and one for every spell
  (`fxSoundSpell`, ~1730), both blank by default, plus an optional Token Magic FX
  flash. It is gated by the client setting `combatFx`, but the sound is played with
  `AudioHelper.play(…, true)`, which broadcasts to every client regardless of THEIR
  toggle. Melee, thrown, blasts, reloads and dry-fire play nothing.
- **Weapon data has no class field.** `WeaponData` has `weaponType`
  (firearm/heavy/melee/throwing/projectile/grenade), `skill`, `firingModes`,
  `damageType`, `blastType` and numeric `ranges {short, medium, long, extreme}`.
- **SR2's Weapon Range Table (core p.88, read from a 200 dpi render)** gives each
  class its own brackets, upper bounds in metres:
  hold-out & light pistol 5/15/30/50 · heavy pistol 5/20/40/60 · SMG 10/40/80/150 ·
  taser 5/10/12/15 · shotgun 10/20/50/100 · sporting rifle 30/60/150/300 ·
  sniper rifle 40/80/200/400 · assault rifle 15/40/100/250 · LMG 20/40/80/150 ·
  MMG 40/150/300/500 · HMG 40/150/400/800 · assault cannon 50/150/450/1,300 ·
  grenade launcher 50/100/150/300 · missile launcher 70/150/450/1,500.
  Bows, crossbows and thrown weapons are Strength-based.
- **Prerequisite bug (separate change):** 18 of the 46 core firearm/heavy weapons do
  not use those brackets: every assault rifle (25/100/250/500), every shotgun
  (10/20/40/60), the sporting/sniper rifles, hold-out pistols, the assault cannon and
  the under-barrel grenade launcher. That mis-sets the range bracket, and so the TN,
  on real shots. It gets its own fix (packs-src + a note for copies already on
  characters) BEFORE this feature, so classification by brackets works for core
  weapons. Content modules may use other tables (Fields of Fire has its own, p.87);
  their weapons fall back as below.

## Approach
1. **Pure classifier** (`module/rules/combat-sound-rules.mjs`, Vitest), one function per
   event so each gets only the data it needs:
   - `weaponClass({weaponType, ranges, skill, name})` → a class. `firearm`/`heavy`:
     exact match of `ranges` against the p.88 rows; no match → `firearm` / `heavy`.
     `melee`: the attack path's own skill normalisation (shared, not re-implemented),
     so "Unarmed Combat" and `unarmed_combat` both → `unarmed`; else `melee`.
     `projectile`: `/crossbow/i` → `crossbow`, else `bow`. `throwing` and `grenade` →
     `thrown` (a grenade's bang is its blast).
   - `cadence({rounds})` → `single` (1 round, including a burst cut short by an
     emptying clip) | `burst` (2–3) | `auto` (4+). Cadence comes from the rounds
     ACTUALLY fired, never from the declared mode or the weapon class.
   - `attackSound({cls, rounds})`, `spellSound({category})`, `blastSound({blastType})`
     (`smoke` → `smoke`, anything else → `blast`; there is no gas type), and the
     fixed keys `reload` and `dry-fire`.
   - `resolveSound({cls, family, weaponType, cadence}, available)` walks a fallback
     chain against the shipped manifest, keeping `weaponType` to the end:
     `<class>-<cadence>` → `<family>-<cadence>` → `<weaponType>-<cadence>` →
     `<weaponType>-single`. The generic `firearm-single|burst|auto` and
     `heavy-single|burst|auto` ship, so an unmatched gun is never silent. Families: pistol (hold-out, light, heavy), smg, shotgun, rifle (sporting,
     sniper, assault), mg (LMG, MMG, HMG), cannon, launcher.
2. **Sound set** (`tools/data/sfx.json` → `tools/gen-sfx.mjs` → `assets/sfx/<key>.mp3`
   plus `module/sfx-manifest.mjs`, the list of shipped keys, written by the same tool so
   code and files can't drift). **34 files**, ~1.2 MB at 2–3 s each:
   - single shots (11): `firearm`, `heavy`, `pistol`, `heavypistol`, `smg`, `shotgun`,
     `rifle`, `sniper`, `taser`, `cannon`, `launcher`;
   - bursts (4): `firearm`, `heavy`, `smg`, `rifle`; full auto (5): `firearm`,
     `heavy`, `smg`, `rifle`, `mg`;
   - melee and thrown (5): `melee`, `unarmed`, `bow`, `crossbow`, `thrown`;
   - blasts (2): `blast`, `smoke`; spells (5): one per category;
   - handling (2): `reload`, `dry-fire`.
   ElevenLabs `sound-generation`, then ffmpeg `loudnorm` to one loudness target, mono
   96 kbps. The user approves every file by ear before it ships.
3. **Playback: the sound rides on the chat message, not a broadcast.**
   - Exactly ONE message per action carries `flags.sr2e.sfx = {key, legacy}`, where
     `legacy` is `"gunshot"` (firearm/heavy attacks only), `"spell"` (casts only) or
     null: the old override settings apply only where `legacy` says so.
     - Attacks and casts: the INITIAL success test of the action, through the
       existing `rollSuccessTest(…, { flags })` option. Nothing downstream is tagged:
       not the damage, barrier, melee-exchange, launcher or spread cards, not drain,
       not resistance tests, not per-target cards. One attack or cast, one sound,
       whatever follows.
     - Blasts: the OUTCOME message, created in both `resolveBlast` branches (damage
       and smoke) only after it succeeds; refusals stay silent. The guarantee is one
       sound per created outcome.
     - Reloads: the reload message, only when `take > 0`, after the updates commit.
   - A `createChatMessage` hook on EVERY client plays `flags.sr2e.sfx` once, locally
     (`AudioHelper.play({src, volume, channel: "environment"}, false)`), when the
     world setting **Combat sounds** is on and `message.isContentVisible` is true for
     that user (plain `visible` is true for whispered rolls, which would leak them).
     One message, one sound per client: a Karma reroll updates the card instead of
     creating one, re-renders don't fire the hook, and two clients that both resolve a
     blast make two outcome messages, which is the existing double-resolution problem,
     not something sound can or should hide.
   - Dry-fire has no message: the empty-clip refusal plays `dry-fire` locally for the
     shooter only.
   - The world switch is checked first; when off, nothing plays, overrides included.
     The old broadcast in `playCombatFx` (`AudioHelper.play(…, true)`) is REMOVED;
     that function keeps only the Token Magic FX visual, so nothing plays twice.
     The two old settings stay as overrides, applied only where `legacy` matches
     (firearm/heavy attacks; spell casts). Manifest validation applies to bundled keys
     only; a custom override path is used as given. Token Magic FX stays where it is, separate from
     sound.
   - Playback is fire-and-forget with its rejection caught (a missing or failed file
     never surfaces as an error), and only keys in the manifest are ever requested.
4. **Tests:**
   - Vitest: every p.88 row; cadence by rounds (including a burst cut to 1); the
     fallback chain against a partial manifest; normalised unarmed skill; spells; blast
     and smoke; reload/dry-fire.
   - Quench (stubbed `AudioHelper.play`): a single shot, a burst and full auto stamp
     and play the right key once on the `environment` channel with no broadcast;
     exactly one attack or cast sound across a barrier shot, a shotgun spread, a
     grenade throw, a failed cast and a multi-target spell, and none from drain,
     resistance or target cards; a Karma reroll on the card plays nothing more; a
     refusal before the roll (out of range, cancelled dialog) plays nothing;
     cancelling a grenade's deferred point placement keeps the throw's sound but plays
     no blast; dry-fire plays only on an empty clip; a reload of 0 rounds plays
     nothing; smoke and a damaging blast each play once on success and not on a
     refused resolve; whispered and blind rolls are silent for those who can't see
     them (the blind roll's author included); setting off with an override set plays
     nothing; an enabled override plays exactly once, locally, with no broadcast; an
     override never plays for a bow or grenade.
   - Live, two clients: an attack on one is heard once on both.
5. **Docs:** CHANGELOG, QA-PLAN (listen at the table), README feature line, wiki
   Combat page.

## Key decisions & tradeoffs
- **Classify from the existing range brackets, not a new field.** No schema change or
  migration, and core weapons classify exactly once their ranges are fixed. The cost:
  homebrew or module weapons with non-table brackets get a generic sound. A
  `soundClass` override field can come later if anyone asks.
- **One sound per action.** A 10-round burst is one burst sound, not ten shots.
- **The chat message carries the sound** rather than a socket broadcast: it is already
  the one record every client receives exactly once per action, it respects whispers,
  and it needs no deduplication of its own. The GM's world setting decides whether
  sounds play at all; each player's Environment slider decides how loud.
- **Shipped files, not generated at run time.** Nobody at the table needs an
  ElevenLabs key.
- **Keep the two old settings as overrides** so a world that set its own files keeps
  them.

## Risks / open questions
- A companion (phone) attack posts the same card, so the phone and everyone's
  computers each play it once.
- Generated gunfire can sound "movie" rather than real; the user approves every file
  by ear before it ships.
- An attack refused before the roll (no ammo, out of range, cancelled dialog) plays no
  attack sound; dry-fire plays only on the empty-clip refusal. A grenade whose point
  placement is cancelled AFTER the throw keeps the throw's sound (the attack was
  rolled) and plays no blast.

## Out of scope
- Per-weapon sounds, positional/distance audio, per-round sounds.
- Fixing Fields of Fire's own range table mapping (falls back to generic).
- The range-bracket data fix itself (its own change, done first).
