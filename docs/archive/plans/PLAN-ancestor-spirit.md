# Plan: the ancestor spirit (Cyberpirates p.152) — system hooks + module registration
_Round 1 — revised after Codex round 1, 2026-10-29_

## Goal
Make the Cyberpirates ancestor spirit a summonable spirit with its printed statistics:
B F+2 · Q F×3 · S F+1 · C F · I F · W F · E F(A) · R F · Attacks **(Strength)M Stun** · Powers Accident,
Confusion, Divination, Guard, Manifestation, Search. Today `rollSpiritAttack` always takes the
attack's Power from Force, so a (Strength) attack can't be expressed. Two more gaps surfaced:
- **Bug (core, today):** Rat's totem stores `conjuringBonus: { spirits_of_man: 2 }` ("+2 dice for
  conjuring all Spirits of Man", core p.121), but `rollConjuring` only reads `conjuringBonus[domain]`
  (city/hearth/field), so Rat shamans never get the +2. The ancestor rules need the same group
  lookup: "All totem bonuses for conjuring Spirits of Man apply to ancestor spirits" (CP p.152).
- Spirit portraits are hard-wired to `systems/sr2e/assets/spirit_portraits/<domain>-<n>.webp`, so a
  module can't ship art for a new domain.

## Approach — system (sr2e)
1. **Attack Power source.** A spirit profile's `attack` gains optional `power: "force" | "strength"`
   (default `"force"`, so every existing profile is unchanged). `rollSpiritAttack` uses
   `this.system.strength.value` when `"strength"`, else the effective Force as now; the card and the
   Resist button carry that Power. Dice stay `atk.dice` (`"force"` | `"reaction"`).
2. **Spirit groups for totem bonuses.** New `CONFIG.SR2E.spiritDomainGroup` =
   `{ city: "spirits_of_man", hearth: "spirits_of_man", field: "spirits_of_man" }` and
   `CONFIG.SR2E.spiritDomainInherits = {}` (domains that take their group's best bonus). Pure helper
   `totemConjuringBonus(totem, domain, { groupOf, inherits })` in `module/rules/`:
   1. the totem's entry for the domain, if any (explicit always wins);
   2. else the totem's entry for the domain's group (Rat's `spirits_of_man`);
   3. else, if the domain inherits, the HIGHEST bonus among the group's member domains — never a
      sum, so Dog (field 2, hearth 2) gives +2, not +4;
   4. else 0.
   `rollConjuring` uses it for BOTH the Conjuring pool and the Drain pool (both read `totemBonus`
   today). Fixes Rat (+2 on city/hearth/field). Known simplification carried over: Gator stores
   `city: 2` unconditionally though the book gives it only to urban Gator shamans; an ancestor
   inherits that the same way — noted, not changed here.
3. **Module portraits.** New optional `CONFIG.SR2E.spiritPortraitBase[domain]` (a path prefix);
   `rollConjuring` uses it when set, else today's system path. Variant count stays
   `spiritPortraitVariants[domain]`.
4. **Sheet tooltip** (`templates/actor/spirit-sheet.hbs`): today it hard-codes "Force dice, (F)S or
   (F)M". It is built from `attackProfile` instead: the dice (Force or Reaction, with the number),
   the Power source (Force or Strength, with the number), the level and Stun — the same values
   `rollSpiritAttack` uses (one shared pure helper `spiritAttackSummary(sys)` feeds both), and
   "attacks are its powers" for air.
5. Nothing else changes: `spiritAttributes(profile, force)` already derives B/Q/S/R from a profile's
   modifiers and C/I/W/E = Force; `spiritDomains` drives the conjure dialog; `spiritDomainPowers`
   seeds the powers.

## Approach — module (sr2e-cyberpirates, at `init`)
Foundry prepares world documents BEFORE `setup`, so a saved ancestor spirit would derive from the
fallback fire profile if registration waited for `setup`. Everything (spirit config AND the totems)
moves to an `init` hook; the module's init runs after the system's (which assigns `CONFIG.SR2E`).
Register, by extending the system's config in place (only if the keys exist — warn otherwise):
- `spiritDomains.ancestor = "Ancestor"`; `spiritDomainProfile.ancestor = "ancestor"`;
- `spiritProfiles.ancestor = { b: +2, q: 0, mult: 3, s: +1, r: 0, attack: { mode: "melee",
  level: "M", damageType: "stun", dice: "force", power: "strength" } }` — dice Force by the user's
  ruling (the book prints no attack skill; the only unarmed Stun spirit attack in core, the water
  elemental, uses Force);
- `spiritDomainGroup.ancestor = "spirits_of_man"` and `spiritDomainInherits.ancestor = true` — "all
  totem bonuses for conjuring Spirits of Man apply to ancestor spirits" (CP p.152), so Cat, Raccoon,
  Gator (city), Dog (field/hearth) and Rat (all) give their +2;
- `spiritPowers.divination = "Divination"` (a label; its TN table is on the Reference journal page)
  and `spiritDomainPowers.ancestor = [accident, confusion, divination, guard, manifestation, search]`;
- portraits: 3 module images + `spiritPortraitBase.ancestor` / `spiritPortraitVariants.ancestor = 3`.
Module requires the new sr2e version. The Reference journal's "Ancestor spirit" page (gen-reference)
is rewritten: summonable, how (Conjuring → nature spirit → Ancestor), what's automated, and what
isn't. Manifestation stays the system's existing workflow (the token's astral-only toggle; the
Manifestation power button only spends the service) — said on the page. Not automated: ancestor-shaman
restrictions (no other Spirits of Man), the three fetishes (−1 service each missing), conjuring time
÷ relatives present, the totem-bonus swap for non-ancestor shamans, no domain boundary (5 km/Force).

## Tests
- Vitest: `totemConjuringBonus` — Rat on city/hearth/field = 2, on forest = 0; Bear on forest = 2;
  a totem with both a domain and a group entry returns the domain's; ancestor via a supplied group
  map = the spirits_of_man value. Force 4 ancestor profile via `spiritAttributes`: B6 Q4 S5 C4 I4
  W4 E4 R4, mult 3.
- Vitest also: `totemConjuringBonus` for Cat/Raccoon/Gator/Dog/Rat on `ancestor` with the module's
  maps = 2 each (Dog not 4); Bear on ancestor = 0; `spiritAttackSummary` for water (Force dice,
  Force Power, S Stun), earth (Reaction dice), air (none) and a strength-power profile.
- Quench (system) `sr2e.spirit-attack-power`: a temp profile with `power: "strength"` on a spirit
  of Force 4 (Strength 5): the attack card and Resist button show Power 5, M Stun before staging,
  and resisting it lands Stun on the target. Default-Power regression: a Force-4 EARTH spirit
  (Strength 8) attacks for Power 4 — card and Resist button — not 8; with forceUsed 1 (effective
  Force 3) it is Power 3. The astral attack is still (Force)M. A Rat shaman's conjuring of a city spirit: the Conjuring and Drain pools on the cards
  include +2.
- Quench (module) `sr2e-cyberpirates.ancestor`, end to end: a Cat shaman conjures an ancestor
  spirit (dice stubbed) → the created actor has domain ancestor, the module portrait on actor and
  token, the six powers, is bound with services; Conjuring and Drain pools include Cat's +2; at
  Force 4 it derives B6 Q4 S5 C4 I4 W4 E4 R4 (mult 3); its attack rolls 4 dice for 5M Stun; using
  a power spends a service. Registration timing: the module records which hook registered the
  spirit config, and the test asserts `init`.
- Startup, live (scripted, part of verification): create a Force-4 ancestor world actor, reload
  the world client, and — before any update — read the already-prepared actor from `game.actors`:
  B6 Q4 S5 R4, attack profile Strength-power M Stun (not fire's ranged). Listed in QA-PLAN too.

## Key decisions & tradeoffs
- Group bonus as a fallback, not additive.
- `power` is a profile field (data), not a special case for "ancestor" in code.
- Portrait base per domain instead of letting modules write into the system's asset folder.

## Out of scope
Ancestor-shaman restrictions and conjuring-time math (reference page); spirit domain-boundary
enforcement (none exists today); any change to other spirits' stats.
