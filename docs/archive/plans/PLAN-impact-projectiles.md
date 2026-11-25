# Plan: impact projectiles — thrown weapons as ranged attacks, Impact armor, Missile Parry
_Draft 1 (2026-11-25). Replaces docs/archive/plans/PLAN-adept-powers-phase-b.md's "B-2" section (its Codex round 1 found that thrown
weapons never reach a ranged card). Ruling agreed with the GM 2026-11-25: Impact armor for bows, crossbows and thrown
weapons. Pages rendered 2026-11-25: core p.87–88 (Weapon Range Table), p.96, p.238; Grimoire p.34; CSH p.104._

## The books
- **Thrown weapons are ranged attacks.** p.87: "All ranged combat, whether it involves firearms, projectile weapons,
  or thrown weapons, is resolved in the same manner." p.96: "Bows (regular and crossbows) and throwing weapons use the
  same ranged combat procedure as firearms." Today `weaponType: "throwing"` is routed through the opposed melee test
  (item.mjs `isMelee`, sheet-actions.mjs `promptWeaponAttackOptions`).
- **Their ranges** are the Weapon Range Table rows (p.88, rendered): Thrown Knife 0–Str / to Str×2 / to Str×3 / to
  Str×5; Shuriken 0–Str / to Str×2 / to Str×5 / to Str×7. Today they use the Grenade Range Table (Str ×3/×5/×10/×20,
  `thrownRange`), which is only the grenades'.
- **Armor (the ruling).** The book calls bows, crossbows and thrown weapons "Impact Projectile Weapons" (p.238); the
  ranged procedure says only "the target's Armor Rating". Ruling: Impact armor against `projectile` and `throwing`
  weapons; Ballistic against firearms and heavy weapons (as today). Today every ranged card is Ballistic.
- **Missile Parry** (Grimoire p.34) / **Extended Missile Parry** (CSH p.104): as the B-2 section, with the range TN
  from the core table: Parry TN = max(2, 10 − the attack's base range TN), base TNs 4/5/6/9 (p.88). The Grimoire's own
  example (long = 8) follows an older table; the core table wins (a ruling).

## Changes
1. **Routing.** `isMelee` is `weaponType === "melee"` only (item.mjs `_rollWeaponAttack` and its `_engage` gate,
   sheet-actions.mjs `promptWeaponAttackOptions`). Thrown weapons get the ranged dialog (range, cover, visibility,
   movement, Combat Pool; no firing mode — `hasRecoil` is already firearm/heavy only, and the dialog hides modes for a
   weapon without them, as for bows: checked when building), the ranged TN and the `rangedDamage` card. The stack
   decrement (`isThrown`) and the grenade path are unchanged.
2. **Ranges.** A pure `throwingWeaponRange(strength, { shuriken })` → the two rows; `thrownRange` stays for grenades.
   Both callers (item.mjs ~688, sheet-actions.mjs ~615) pick by `weaponType`: "grenade" → `thrownRange`, "throwing" →
   `throwingWeaponRange` with `shuriken = system.aerodynamic` (the pack's Shuriken carries `aerodynamic: true`, the
   Throwing Knife not).
3. **Armor.** `rangedArmorType(weaponType)` → "impact" for projectile/throwing, else "ballistic"; used for the card's
   `armorType` (item.mjs ~1402).
4. **Melee lists.** The melee defence's weapon choices and `rollMeleeDefense`'s natural-weapon check stop listing
   "throwing" items (actor.mjs ~1947, ~2050): a thrown weapon is no melee weapon. A knife meant for melee is a melee item.
5. **Missile Parry** (the B-2 design): `parry: { rangeTN }` on the card for projectile/throwing weapons; a "Missile
   Parry" button while the card is open with successes; the parrying actor is the clicking user's acting actor (owned,
   or GM), a working physical adept: the target with Missile Parry/Extended, or another with Extended within 3 m of the
   target token (both tokens on the attack's scene, centre distance in scene units); `once(actor, "parry:<card id>")`;
   Reaction + Combat Pool dice (a dialog, capped by the available pool) vs `max(2, 10 − rangeTN)`; before the roll AND
   before posting a catch, the live card must be unresolved with unchanged attacker successes; a catch (MORE successes)
   posts an outcome with `resolves: <card id>` and `closesTests: [the attack test]` so Karma can't revive it. A free
   action, declared by the click (the system tracks none — as Centering). Race with a simultaneous Resist: the same
   level as today's Resist-vs-Resist (no cross-client gate exists for resisting); recorded in the plan, not new risk.
6. **The card's attack data** gains `weaponType` so the button and armor follow it.

## Tests
Vitest: `throwingWeaponRange` (Str 4 knife: 4/8/12/20; shuriken 4/8/20/28), `rangedArmorType`, `missileParryTN`.
Quench: a thrown knife posts a `rangedDamage` card (not a melee card) at the ranged TN, `armorType: "impact"`; a bow's
card is Impact; a pistol's Ballistic; the parry (stubbed rolls) resolves the card on more successes and not on equal;
a protector 2 m away with Extended allowed, 4 m refused.

## Out of scope
Grenade ranges (their own table, unchanged); Missile Parry against firearms (not slow missiles).

## Draft 2 — round 1 folded (these win)
- `_rollWeaponAttack` forces `firingMode = "ss"` (no burst/full auto, no engagement walk) for any weapon without
  recoil (projectile, throwing), whatever a macro passes.
- The out-of-range check (`rangeBracketFor(...).outOfRange` → refuse) runs for a thrown weapon BEFORE the stack is
  decremented, with `throwingWeaponRange`.
- The card stores `targetTokenUuid` and `sceneId` (from the attack's target token); the parry's 3 m check uses those live
  tokens, both on that scene.
- The parry compares the LIVE attack test's `testTotalSuccesses` (not only the card's copy) before rolling and before
  posting a catch.
