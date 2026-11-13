# Plan: area-effect spells without a target token + spell dialog facelift
_Round 3 — revised after Codex round 3_

## Goal
A magician casting an area-effect spell (Sleep, Manaball, Powerball, Fireball,
Hellblast; also the non-combat area spells) must not need a targeted token. The
caster picks a point (or a token) as the centre; everyone inside the radius is
caught. The implementation must follow the book rules for area spells (core p.130,
rendered and read). Separately, the cast dialog gets the same look as the
melee/ranged attack dialog (`.sr2e-attack` tabs + readout).

## Rules (verified from renders, corrected 11th printing)
- **p.130 Area-Effect Spells.**
  - The base radius is the magician's **Magic Rating in metres**, whatever the category.
  - It affects ALL valid targets in the area: friend, foe and neutral.
  - To **shrink** the area, withhold dice from the Spell Success Test: **−1 m per 2 dice**.
  - To **grow** it, withhold dice from the Spell Force Test: **+1 m per 1 die**.
  - The dice removed for area modification may not exceed the spell's Force.
  - Magic Pool dice may still be used even if every Force die is removed, up to the original Force.
  - **Roll once**, then compare that roll against each target's own TN (Willpower for mana, Body for physical). Successes are counted separately for each target.
- **p.151 combat spells.**
  - Area spells: Fireball, Hellblast, Manaball, Powerball, Sleep.
  - Manaball and Sleep affect **living targets only**.
  - Armour does not help in the Spell Resistance Test.
- **pp.153–158 audit of the `isAreaEffect` flags in packs-src/spells:**
  - These are correct: the 5 combat spells above, Detect Enemies, Detect Individual, Detect Life, Detect Life Form, Detect Object, Chaotic World, Confusion, Entertainment, Stink, Barrier, Flame Bomb, Light and Shadow.
  - **Poltergeist** (p.157, "Within the area of this spell") is NOT flagged. Fix: set it true.
  - **Mana Barrier** (p.158) is a Barrier variant and is not flagged. Fix: set it true.

## Current behaviour (module/documents/item.mjs ~1380–1440; sheet-actions.mjs promptSpellOptions ~1531)
- The area branch runs only when `isAreaEffect && targetTok`. With no targeted token it falls
  through to the single-target branch and posts one resist card with `targetUuid: ""`.
- The radius is the Magic Rating, with no withheld-dice adjustment.
- There is ONE TN for the whole cast, taken from the targeted token or typed. Every caught token's
  resist card copies the same `successes`, which is wrong under p.130.
- The dialog shows a "No target — TN is the victim's Willpower" warning.

## Approach (Round 1 revision)
1. **Pure math in `module/rules/sr2e-rules.mjs`** (Vitest, citing p.130):
   - `areaSpellGeometry({ magic, force, radiusDelta })` returns `{ radius, withheld, valid }`.
     - `radiusDelta` is a signed whole number of metres.
     - Growing costs 1 die per metre; shrinking costs 2 dice per metre.
     - `valid` requires `withheld ≤ force` and radius ≥ 0.
     - Non-finite or non-integer inputs are rejected.
   - `successesAtTN(dice, tn)` counts dice with `die.total >= tn`. `die.total` is already the
     compounded (Rule of Six) value; see module/dice/sr2e-roll.mjs:35–54.
     - Tests: `[6,2]` at TN 8 gives 1 success; multiple explosions; Rule of Six disabled.
   - `areaTargetEligible(actorType, spellType)`:
     - IC and host: never eligible.
     - Mana spell: character, npc, spirit.
     - Physical spell: character, npc, spirit, plus vehicle marked "GM: Object Resistance", with no card.
   - `spellTargetEffectiveTN(attr, castDelta)` = attr + castDelta, where
     `castDelta = result.targetNumber − displayTN`.
     - This is the caster-side modifier delta that `rollSuccessTest` applied (wounds, sustaining,
       dumpshock, centering). Each target inherits the same delta, so the caster's +2 TN applies
       against everyone.
2. **Placement happens BEFORE anything is spent** (`onCastSpell` in sheet-actions, after the
   dialog and before `item.roll`).
   - Centre modes:
     - the targeted token (the default when one is targeted);
     - click a point (the default otherwise);
     - my token.
   - Export `promptForCanvasPoint(label)` from placement.mjs. It returns the clicked world point.
     Escape, the timeout, a canvas teardown, or a missing canvas all return null.
   - "My token" with no caster token also returns null, which cancels with a notification.
   - On null, return before `item.roll`. No focus, pool, Centering or drain has been spent.
   - The scene id is captured and re-checked in the roll; if the scene changed, abort before
     spending.
   - Forwarded to `item.roll`: `area: { x, y, sceneId, radius, radiusDelta, withheld }`.
   - A macro calling `item.roll` on an area spell without `area` falls back to the targeted
     token's centre. With no target, it posts the cast with a note: "area spell cast without a
     centre — GM places it". That is today's behaviour minus the bogus empty-target resist card.
3. **Roll (`_rollSpellcast`), area branch.**
   - Normalize the pool allocations inside `_rollSpellcast`, not just in the dialog. The existing
     caps still apply, and for area casts Magic Pool on the spell test is also capped at the
     ORIGINAL Force (p.130).
   - Spell dice = Force − withheld + totem + focus, floored at 0.
   - `karmaDiceCap` = Force − withheld. These are the rating dice actually in use (p.191).
   - Gather the caught targets:
     - Euclidean distance centre-to-centre in scene units:
       `dist = hypot(dx, dy) / canvas.dimensions.size * canvas.dimensions.distance`.
       This is the same geometry as the circular template, so the template and inclusion agree.
     - Use `areaTargetEligible` for actor types.
     - Exclude `token.document.hidden` unless the caster's user is a GM. When the caster is a
       player, use `token.visible` (that client's perception, fog and vision) as the "can see"
       proxy. Full LOS stays GM adjudication.
     - The caster is included when inside the radius (p.130 "friend, foe, and neutral").
   - Roll ONCE with a display TN = the lowest caught attribute (4 if none caught), labelled
     "TN varies by target (p.130)". **Karma post-roll actions are disabled on area casts** (a new
     `noKarmaActions` option makes `hasKarma` false). A card note says: "Karma rerolls and bought
     successes on a multi-target roll are GM adjudication."
     - Karma DICE bought before the roll are still allowed. They are plain dice.
     - This removes the multi-TN reroll/buy ambiguity and makes `_syncDependentCards` a no-op
       for these cards, since they never change after posting. No sync change is needed.
   - Post ONE summary card listing every caught target: name, effective TN and successes, e.g.
     "Guard A — TN 5 — 3 successes", or "0 — unaffected". Then post a Resist Spell card for each
     target with more than 0 successes. Zero-success targets are recorded on the summary and
     never need a card, since there is no Karma sync.
   - Template: create one only when `game.user.can("TEMPLATE_CREATE")`; otherwise the summary
     card says "(no template: no permission)". Template failure never aborts resolution.
   - Drain once, unchanged (Force-based; withheld dice don't touch it).
4. **Non-combat area spells.** Use the same centre, template and caught-target summary. Each
   target shows the single TN typed in the dialog (these spells have fixed or GM TNs), with no
   resist cards.
5. **Data.**
   - Set `isAreaEffect: true` on Poltergeist and Mana Barrier in packs-src, then run build-packs.
   - No migration: the flag drives no automation for those two spells yet. The CHANGELOG says to
     re-drag them.
6. **Dialog facelift (`promptSpellOptions`).**
   - Use the `.sr2e-attack` shell with its OWN scoped modifier `.sr2e-attack--spell`, two radio
     tabs (unique ids `${tabName}-spell` / `-dice`), and new two-panel selectors in
     css/sr2e-main.css. The existing CSS hard-codes shot/tactics/dice to panels 1/2/3, so it is
     not reused blindly.
   - **Spell tab:**
     - Force;
     - live drain readout (TN · level · Stun/Physical);
     - the TN input (kept with `name="tn"` for ALL spells). For area combat spells it is disabled
       and shows "per target"; the callback reads `elements.tn?.value` conditionally;
     - the Area block (area spells only): centre select, `radius_delta` input, and a live
       "radius N m · withholds K dice" line with an invalid-state warning.
   - **Dice tab:** Magic Pool split, foci, Karma dice, misc dice. All existing names are
     unchanged.
   - The readout outside the panels shows Force, TN (or "per target"), dice rolled
     (Force − withheld + pool + focus + karma + misc) and Drain.
   - `onCastSpell` forwards the new `area` option explicitly (its `item.roll` argument list is
     enumerated).
7. **Tests.**
   - Vitest: geometry validation, `successesAtTN` with Rule-of-Six totals, `areaTargetEligible`,
     effective-TN delta.
   - Quench (deterministic: stub `actor.rollSuccessTest` to return fixed dice, and stub
     `promptForCanvasPoint`):
     - area Sleep, no target: two NPC tokens inside with Willpower 3 and 5, fixed dice
       `[5,4,2]` → 2 and 1 successes on the summary, and two resist cards;
     - a token outside is not caught; the caster inside is caught;
     - a cancelled prompt spends nothing (Magic Pool, focus and condition monitor unchanged);
     - the dialog renders both tabs and `tn`/`force`/`radius_delta` submit.

## Round 2 amendments (these supersede the text above where they conflict)
A. **The Karma restriction is enforced, not just hidden.**
   - Area COMBAT casts persist `state.areaCast = true` on the test message's `flags.sr2e.test`.
   - `SR2EActor#applyKarmaToTest` refuses `reroll` and `buySuccess` when `state.areaCast`, with a
     notification. The renderer hides only those two buttons.
   - **Avoid an Oops (all-1s disaster) stays available**: it has no multi-TN ambiguity.
   - Area resist cards carry `areaCard: true`, and `_syncDependentCards` skips them explicitly.
   - Non-combat area spells use ONE TN, so they keep all normal Karma behaviour. `areaCast` is
     not set for them.
B. **One disclosure policy.**
   - Hidden tokens (`token.document.hidden`) are NEVER caught, whoever casts, and never appear on
     any card. The GM resolves them by hand.
   - When the casting user is not a GM, a token must also be `token.visible` on the caster's
     client.
   - Every caught token is therefore already visible on the shared map, so the public summary
     leaks nothing new.
C. **Geometry is recomputed at the roll boundary.**
   - The dialog forwards only `area: { x, y, sceneId, radiusDelta }`.
   - `_rollSpellcast` recomputes `areaSpellGeometry` from the live Magic, the clamped Force and
     `radiusDelta`, and aborts BEFORE any focus, pool, Centering or drain spend when:
     - the geometry is invalid;
     - x or y is not finite;
     - `sceneId !== canvas.scene?.id`.
D. **Explicit TN branch, placed before the Centering/TN computation.**
   - Area combat: base TN = the lowest eligible caught attribute (Willpower or Body `.value`), or
     the submitted TN if nothing is caught.
   - Everything else: the submitted TN.
   - The effective TN for each target = its base + castDelta. Summaries show the effective TN.
E. **Resist cards name their target.**
   - `renderSpellResistCard` renders an escaped `targetName` when present.
   - Its instruction text changes from "select the defender" to "resolved by <name>" when
     `targetUuid` is set. The old text is kept for legacy cards with no uuid.
F. **The dialog preview and the roll share one allocation function.**
   - `spellCastDice({ force, withheld, totemBonus, totemPenalty, focusCast, poolReq, poolAvail,
     poolCap, karmaReq, karmaAvail, misc })` in sr2e-rules returns
     `{ ratingDice, pool, karma, total }`.
     - `ratingDice = max(0, force − withheld)`;
     - `pool ≤ min(poolReq, poolAvail, poolCap)`, where poolCap = min(Magic, original Force) for
       area casts and the existing cap otherwise;
     - `karma ≤ min(karmaReq, karmaAvail, ratingDice)`;
     - `total = max(0, ratingDice + totemBonus − totemPenalty + focusCast + pool + karma + misc)`.
   - The dialog readout calls it on every input; `_rollSpellcast` calls it again with the live
     values.
   - The stale "totem: add by hand" note is removed. The roll already applies totem dice
     (item.mjs ~1185).
G. **Tests use the real `rollSuccessTest`.**
   - Quench sets a deterministic `CONFIG.Dice.randomUniform` sequence for the duration of a test
     and restores it in `finally`, so real dice, pool spends and flags are exercised.
     `promptForCanvasPoint` is still stubbed.
   - Cases:
     - per-target successes from one roll, with a caster wound delta;
     - `applyKarmaToTest` refuses a reroll on an area card;
     - a hidden token inside is not caught;
     - a player without TEMPLATE_CREATE still resolves (simulated by stubbing `game.user.can`);
     - an invalid-geometry macro call spends nothing;
     - the non-combat fixed-TN branch works.
   - Vitest covers `spellCastDice`, `areaSpellGeometry`, `successesAtTN` and `areaTargetEligible`.

## Round 3 amendments (supersede B and F where they conflict)
H. **Cards that name targets are whispered.**
   - The area summary goes to: the casting user plus all GMs.
   - Each area resist card goes to: the casting user, all GMs, and the users with OWNER on that
     target's actor. That target's defender must be able to click Resist.
   - The public output is only the ordinary test card (dice/TN) plus a one-line public note,
     "✨ <spell> — area spell cast", with no identities, counts or attributes.
   - Hidden tokens are still never caught (B).
I. **Non-combat area summaries are immutable by construction.** They list only the geometric
   candidates (names inside the radius, whispered per H) and say "successes: see the casting
   test card". They show no TN or success counts, so a later Karma reroll on that single-TN test
   cannot contradict them.
J. **One floor, at the same stage as `rollSuccessTest`.**
   - `_rollSpellcast` calls
     `rollSuccessTest(baseDice, tn, { poolDice, karmaDice, karmaDiceCap: ratingDice, miscDice, ... })`
     where `baseDice = max(0, ratingDice + totemBonus − totemPenalty + focusCast)` and
     `ratingDice = max(0, force − withheld)`.
   - `rollSuccessTest` adds pool, karma and misc as it does today; its existing zero floor
     applies to the grand total.
   - `spellCastDice` returns `{ ratingDice, baseDice, pool, karma, total }`, mirroring exactly
     that: total = max(0, baseDice + pool + karma + misc).
   - Example: withheld = Force, totem −2, pool 2 → baseDice 0, total 2. The preview and the roll
     agree and the test asserts both.
   - Only `baseDice` is passed as the first argument; pool, karma and misc go through their
     options, never twice.
K. **Additional regression cases.**
   - Two players with different vision: a whisper-recipient check proves player B (not an owner,
     not the caster) receives neither the summary nor a card for a target they don't own.
   - A non-combat area cast, then a Karma reroll: the summary is unchanged and has no counts.
   - The negative-base allocation example from J.

## Key decisions & tradeoffs (revised)
- **Karma post-roll actions are off for area casts.** p.190 was written for one TN, and every
  automatic policy either grants successes against targets where no die succeeded or lets an easy
  target decide Karma for a hard one.
- **One summary card plus resist cards only for hit targets**, instead of an authoritative
  area-state object with view cards. The summary never changes after posting, so no
  synchronization machinery is needed.
- **"Can see" is approximated by token visibility for players and non-hidden for GMs.** Walls and
  LOS remain GM adjudication; the GM can ignore a listed target.
- The facelift ships in the same release as a separate commit. The Area block lives in the new
  dialog, so doing it twice would be waste.

## Deferred, reported to the user
- Round-1 point 13, resist-card resolution by a non-author player: a pre-existing issue in
  `rollSpellResistance`, not introduced here. It is less relevant now that area cards never
  re-sync.
- Astral-plane targeting for area spells.

## Out of scope (follow-ups to report)
- Damaging manipulation spells (Flamethrower, Spark, Flame Bomb) post NO damage today; there is no
  damageCode path for manipulation. This is a separate feature.
- Poltergeist's Stun damage automation.
- Grenade and rocket blasts also require a targeted token (`resolveBlast`, centerTokenUuid). The
  same point-picker could serve them later.
- Barrier shapes (dome/wall).
