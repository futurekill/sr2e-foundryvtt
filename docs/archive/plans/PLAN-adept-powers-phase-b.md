# Plan: adept powers, Phase B — Centering on skill tests, Attribute Boost, Suspended State (Grimoire p.34, p.44)
_Draft 1 (2026-11-25). Follows docs/archive/plans/PLAN-sourcebook-adept-powers.md (Phase A, 0.162.0). Missile Parry and Extended
Missile Parry need the attack cards and get their own part (B-2). Pages read 2026-11-25 (Grimoire 2nd ed. text layer;
core text layer for prose)._

## The books
- **Adept Centering** (Grimoire p.44): an initiated physical adept may make a Centering Test against penalties on any
  **Physical Skill** test (core p.71: Athletics and Stealth). "In the same manner" as a magician's centering against
  penalties: Centering Skill vs the test's target number WITH all its penalties, minus the initiate grade; every 2
  successes reduce the penalties (never the base target number) by 1. A Free Action. Not chip-based. With **Enhanced
  Centering** the adept applies it to the purchased categories (Build/Repair, Combat, Knowledge, Language, Magical,
  Social, Special, Technical, Vehicle); Magical Skills only for mundane effects.
- **Attribute Boost** (p.34): Magic Rating dice vs the attribute's CURRENT value; any success → +level for (successes)
  Combat Turns. Then Drain: Willpower vs ⌊boosted value ÷ 2⌋; level by the boosted rating vs the Racial Maximum (≤ ½ L,
  ≤ max M, ≤ 1.5× S, beyond D); every 2 successes lower it one level; Stun. Not with cyber/bioware enhancements or
  spell increases of that attribute; works with Improved Physical Attributes.
- **Suspended State** (p.34): Willpower + any meditative Special Skill dice vs 4, injury modifiers applied; successes as
  Hibernate (core p.157): the body slows by a factor of 2 × successes (bleeding every 10 × factor minutes, etc.).

## B-1 Adept Centering on skill tests
1. Pure rules: `SKILL_GROUPS` (core p.68–75): combat (armed_combat, firearms, gunnery, projectile_weapons,
   throwing_weapons, unarmed_combat), physical (athletics, stealth), technical (biotech, computer, demolitions,
   electronics), vehicle (bike, car, and the vehicle skills by key), magical (conjuring, sorcery), social (etiquette,
   interrogation, leadership, negotiation); a skill item's category build_repair / knowledge / language / special
   (from `system.category`). `adeptCenteringCovers({ group, skillName }, enhanced)` → true for "physical", or a group in
   the adept's Enhanced Centering items (a "special" item names its Special Skill).
2. In `rollSkillTest` (and the defaulted `rollNamedSkill` path — a defaulted test is still a test of that skill),
   after the TN is known and BEFORE the Success Test: if the actor is a `physical_adept`, `adeptPowersWork`,
   `magic.initiateGrade ≥ 1`, `magic.metamagic` includes "centering", `magic.centeringSkill` names a skill the adept
   has (rating > 0, not chipped — "never chip-based"), the test's skill is covered, and the penalties
   `testTnModifiers({ tnContext }).total > 0`: roll the Centering Test exactly as the spell path does
   (`centeringTestTN(TN + penalty, grade)`, `tnPolicy: "table"`, `isResistance: true`), and pass
   `centeringReduction = centeringPenaltyReduction(successes, penalty)` to the skill's Success Test (already supported
   by `testTnModifiers`). Automatic, as the spell path (the Free Action is the player's to spend; the card says so).
   Not when the test IS the Centering skill ("no effect on penalties favoring a Centering Test").
3. Weapon attacks are Combat Skill tests (item.mjs weapon rolls): covered only with Enhanced Centering (Combat). The
   same block in the weapon roll path, reusing one helper `adeptCenteringReduction(actor, { skill, tn, tnContext })`.

## B-3 Attribute Boost
1. The power card gets an **Activate** button (owner): Magic Rating dice vs the attribute's current value
   (`system[attr].value`). Refused (a notice) when that attribute has a cyberware/bioware modifier (`mods.sources[attr]`
   from ware) or a spell Active Effect on `system.<attr>.mod`, or a boost of that attribute is already running.
2. Any success: an Active Effect on the actor, `system.<attr>.mod` +level (an AE key the pipeline preserves, CLAUDE.md),
   `duration.rounds = successes` when in combat (else `turns`/seconds = successes × 3 s, a Combat Turn), flagged
   `flags.sr2e.attributeBoost = { powerId, attr, level, boosted, racialMax }` (boosted = value after the boost).
3. Ending: the effect's chat card has **End boost & resist Drain**; in combat, the active GM ends it when its rounds
   are spent (a `updateCombat` round hook, claimed with `once()` per effect id). Ending deletes the effect and posts a
   Drain card: Willpower vs ⌊boosted ÷ 2⌋, level from `attributeBoostDrainLevel(boosted, racialMax)`, staged down one
   level per 2 successes, Stun through `commitDamage(..., { source: "drain" })`, the receipt in the same update.
4. Pure rules + Vitest: `attributeBoostDrainLevel`, `attributeBoostTN`.

## B-4 Suspended State
The power card gets **Enter suspended state**: Willpower + the highest meditative Special Skill the adept names on the
power (`system.notes`? no: a new `suspendedSkill` StringField, blank allowed) vs 4 with injury modifiers
(`rollSuccessTest`, normal TN pipeline); the card reports the factor 2 × successes and what it means (bleeding every
10 × factor minutes; needs for air, food and water ÷ factor). The healing clock is NOT slowed automatically (its fixed
10-minute ticks are fenced; a later change) — the card tells the GM.

## Tests
Vitest: SKILL_GROUPS coverage, `adeptCenteringCovers`, the drain level table, the boost TN. Quench: an initiate adept
with a wound penalty rolls Athletics → a Centering Test first and a lower TN; Firearms → none without Enhanced Centering
(Combat), one with it; not an initiate → none; a boost AE appears with +level and its Drain card resolves Stun once.

## Out of scope
B-2 Missile Parry / Extended Missile Parry; the clock slowing for Suspended State; NPC adepts (no magic type).

## Draft 2 — changes after round 1 (these win)
**B-1, narrowed and declared (r1 #1–#6).**
- **Declared, not automatic.** The skill roll dialog (`promptRollOptions`, the sheet's skill roll and named-skill roll)
  shows a "Center first (Free Action, Grimoire p.44)" box when the adept may center on that skill. Only when ticked is
  the Centering Test rolled. The Free Action is the player's (the system tracks no Free Actions); the card says it.
- **Paths covered:** the sheet's skill rolls (`rollSkillTest`, `rollNamedSkill`) and the skillsoft roll (the TESTED
  skill may be chipped; only the Centering skill must not be). Every other path that rolls a skill (weapon attacks,
  vehicle tests, First Aid, Matrix, Gunnery, spellcasting by an adept: none) is NOT covered here: the GM applies
  Centering by hand there. A ruling on the wiki says so. (Combat Skills: Enhanced Centering (Combat) is still
  bought and checked; the weapon path is a later part.)
- **No double count.** The Centering Test is rolled with `tnPolicy: "equipment"` (every character modifier zeroed,
  CDS included), on the TN already holding them: `centeringTestTN(TN + reducible, grade)`.
- **What it reduces.** Reducible = the SAME modifiers the final test will take: `testTnModifiers` computed with the
  final test's complete options (`tnContext`, `extraTN`, `socialTN`, everything `rollSkillTest` passes), plus the
  defaulting penalty when the test defaults (a penalty, not the base TN). The reduction (2 successes = 1) is applied
  up to that total; the card also prints any reduction LEFT OVER ("−N more against situational modifiers the GM
  set"), since the GM's typed TN may hold penalties the system can't see — the GM applies those.
- **Magical skills:** adepts cast no spells; an adept's Magical Skill test is mundane by definition (Grimoire p.44), so
  Enhanced Centering (Magical) applies to Sorcery/Conjuring rolls made from the sheet as such.

**B-3, one claim and durable steps (r1 #7–#11).**
- **The ware/spell check** reads typed state, not `mods.sources`: refused when a WORKING cyberware/bioware item has a
  non-zero `attributeMods[attr]` (`workingImplant`), or an enabled Active Effect whose origin is a spell item changes
  `system.<attr>.mod`. Improved Physical Attributes (an adept power) is allowed.
- **One boost per attribute, server-arbitrated:** the effect is created with a deterministic id
  `claimId("boost:<actor uuid>:<attr>")` and `keepId` — the server rejects a second create (the `once()` pattern), so
  two owners can't both start one.
- **Duration:** in combat, `duration: { rounds: successes, startRound, startTurn }` from the current combat; out of
  combat, `seconds: successes × 3`. The effect stores `flags.sr2e.attributeBoost.endsAt` (combat round + turn, or world
  time). Nothing relies on Foundry deleting it.
- **Ending (one claimed sequence):** whoever ends it (the card's End button, or the active GM's `updateCombat` hook
  when the combat has passed `endsAt` — compared on every turn change, not only round boundaries; out of combat the
  card's button only) runs `once(actor, "boost-end:<effect id>")`, then in ONE actor update writes
  `flags.sr2e.boostDrain.<effect id> = { attr, boosted, racialMax, state: "pending" }` and deletes the effect, then
  posts the Drain card. The Drain card's roll commits Stun via `commitDamage(..., { source: "drain", extra:
  { "flags.sr2e.boostDrain.<id>.state": "done" }, skipIf: () => state === "done" })`.

**B-4 (r1 #12).** Entering asks for the skill at activation: any of the adept's Special Skills (a select, "none"
allowed), its rating added. Zero successes: "no suspended state" (factor not reported).
- **Round 2 (folded, no round 3):** the box goes on `onDefaultSkill`'s own dialog too, passed to `rollNamedSkill`;
  `rollSkillTest` and the chipped-skill roll forward `centeringReduction`, and the Centering Test calls
  `rollSuccessTest` directly with `tnPolicy: "equipment"`; the defaulting penalty joins the reducible total (the reducer
  takes `extraReducible` so `testTnModifiers` caps against it too); each activation has its own id (`boostId`) for its
  end claim and Drain record, while the effect id stays fixed per attribute for exclusion; `endsAt` and the duration
  carry the combat id, matched in the hook; ending = `once()` → actor update (pending Drain record) → effect delete
  (separate calls), and a GM reconcile on load re-posts a pending Drain whose card is missing; `skipIf` reads the
  actor's CURRENT `flags.sr2e.boostDrain.<boostId>.state` each time.

## B-2 Missile Parry and Extended Missile Parry (Draft 1, 2026-11-25; after B-1/B-3/B-4 shipped in 0.163.0)
**The books.** Missile Parry (Grimoire p.34, 1 point): pluck a slow missile (arrows, thrown knives, shuriken) from the
air: Reaction (+ Combat Pool dice by choice) vs 10 − the attack's range-determined base TN (long range: 10 − 8 = 2;
short: 10 − 4 = 6); it works only with MORE successes than the attacker's Attack Test; ties to the attacker; a Free
Action. Extended Missile Parry (CSH p.104, 1.5): the same for someone the adept protects, up to 3 m away.
**What a slow missile is (ruling):** a ranged attack card from a weapon of `weaponType` "projectile" (bows,
crossbows) or "throwing" (knives, shuriken) — not "grenade" (an explosive on its own card), not firearms.
1. **Card state.** `_rollWeaponAttack` adds to the `rangedDamage` state `parry: { rangeTN }` (= 4 + the range's
   `CONFIG.SR2E.rangeTnMods`, the base TN WITHOUT other modifiers) when the weapon is projectile/throwing.
2. **Button.** `renderRangedDamageCard` shows "Missile Parry" beside Resist while `n > 0`, not resolved, `parry` set.
3. **Who parries.** The clicking user's acting actor (controlled token, else assigned character), a working physical
   adept (`adeptPowersWork`): the TARGET itself with Missile Parry or Extended Missile Parry; or another actor with
   Extended Missile Parry whose token is within 3 m of the target's token (canvas distance). Refused otherwise.
4. **The roll.** A small dialog: Combat Pool dice (0 … the actor's available Combat Pool). `rollSuccessTest(Reaction,
   max(2, 10 − rangeTN), { poolDice: { combat: n } })` — the normal TN pipeline (wounds apply). Guards: the live card
   unresolved and its successes unchanged (Karma), as `resistRangedDamage`'s `beforeRoll`; one attempt per actor per
   card, `once(actor, "parry:<card id>")`.
5. **Outcome.** More successes than the card's `successes` → an outcome message `flags.sr2e.resolves = <card id>`
   ("caught — no damage"), which closes the card through the existing author-side close; else a message "missed the
   catch — resist normally" (the card stays open).
6. **Tests.** Vitest: `missileParryTN(rangeTN)`; `isSlowMissile(weaponType)`. Quench: a bow card with `parry`; the
   target adept parries (stubbed roll) → the card resolves; equal successes → not; a protector 2 m away with Extended →
   allowed, 4 m → refused; a firearm card → no button.
