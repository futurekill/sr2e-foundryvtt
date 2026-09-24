# Plan: damaging manipulation spells (Flamethrower, Spark, Flame Bomb)
_Round 3 — revised after Codex round 3_

## Goal
Casting Flamethrower, Spark or Flame Bomb currently rolls the Spell Success Test and Drain, then
posts nothing: there is no damage path for manipulation spells. Make them deal damage the way the
book says, reusing the weapon damage-resistance path.

## Rules (rendered from the corrected 11th printing, read from the images)
- **p.129, step E / p.131:** "If the spell cast is a damaging manipulation spell, then this test is
  actually a Damage Resistance Test, as in Ranged Combat (see p.87)." The energy is "hurled … much
  like a ranged weapon."
- **p.130:** "Ranged damaging manipulation spells, such as flamethrower, have a base Target
  Number 4. Situation target modifiers apply (see p.89)."
- **p.158 Flamethrower / Spark / Flame Bomb:**
  - The damage code is **(F)M**.
  - **Every 2 successes increases the Damage Code by one level.**
  - Resisted by **Body**.
  - **One-half the value of Impact Armor reduces the Power (Force)**.
  - "Resolve using the ranged combat procedure."
  - Flame Bomb is an **area-effect** spell: "a blast whose effects surround the target". The base
    radius is the Magic Rating, as for every area spell (p.130).
- **p.130 area rule:** the roll is compared per target. Here every target shares the same TN 4, so
  one staged damage code applies to everyone caught.

## Current code
- `SR2EItem#_rollSpellcast` (item.mjs): combat spells post Resist Spell cards. Manipulation spells
  post nothing. Flamethrower's `damageCode` is "(F)M"; Spark's and Flame Bomb's are empty in
  packs-src.
- `SR2EActor#rollDamageResistance(power, level, armorType, damageType, {armorCalc, armorMod,
  attackerSuccesses, basePower, ...})`:
  - Body + Combat Pool vs TN = Power − armour.
  - Every 2 successes stage the damage down.
  - It implements the p.91 complete-miss check (Combat Pool alone beats the attacker's successes)
    when `attackerSuccesses` is present.
  - Vehicles route to `rollVehicleDamageResistance`.
  - `armorCalc` supports standard / half_ballistic / impact / flechette.
- The Resist Damage button handler (sr2e.mjs ~2013) reads `data-power`, `data-level`,
  `data-armor-type`, `data-armor-calc`, `data-target-uuid` and `data-attacker-successes` from any
  `.sr2e-resist-btn` that has `data-power`.
- 0.94.0 area machinery: `_resolveAreaCast` / `_postAreaResults`, with snapshot, whisper policy and
  template.

## Approach
1. **Rules (sr2e-rules.mjs + Vitest):**
   - `manipulationDamage(damageCode, force)` returns `{ power, level }` or null.
     - It parses `(F)M`, `(F+n)X`, `(F-n)X` and a bare `(F)` with a level letter. `F` = the Force
       cast. It returns null for an empty or unparseable code, so no damage path runs and a GM
       note is posted instead.
   - `stageDamageUp(level, successes)` moves up one level per 2 successes, capped at D.
     - First check whether `netToSteps`/`stageUps` from the weapon path already exists and is
       reusable; reuse it if so.
   - `damageResistArmor({ armorCalc, armorType, ballistic, impact, armorMod })`: extract the
     inline switch from `rollDamageResistance` into this pure function and add **`half_impact`**
     = floor(impact/2), labelled "½ Impact". `rollDamageResistance` then calls it, with identical
     behaviour for the existing calcs.
2. **Detection:**
   - `isDamagingManipulation = category === "manipulation" && manipulationDamage(damageCode, force) !== null`.
   - This data-driven test (not name-based) also lets homebrew or Grimoire elemental spells work
     once their damageCode is filled in.
3. **Single-target spells (Flamethrower, Spark):**
   - After the drain, and only when the spell test has ≥1 success, post a damage card like the
     weapon one:
     - Power = Force; level = staged; `armor-type impact`; `armor-calc half_impact`;
       `damage-type physical`;
     - `target-uuid` = the caster's T-target (if any);
     - `attacker-successes` = the spell successes, which enables the p.91 complete miss (ranged
       combat procedure).
   - The card is public, like weapon damage cards, and names the defender when there is one.
   - With 0 successes: a one-line "the spell fizzles" note, and no card.
4. **Flame Bomb (area):** reuse `_resolveAreaCast` (centre before spending; geometry; snapshot;
   hidden tokens excluded).
   - Eligibility for damaging manipulation: character, npc, spirit, **and vehicle** get a damage
     card. `rollDamageResistance` routes vehicles to the vehicle rules. IC and host are never
     eligible.
   - One roll at TN 4 (plus situation modifiers typed in the dialog). It is a single TN, so Karma
     stays normal and there is no `areaCast`.
   - One staged damage code for all targets.
   - One whispered damage card per caught target (to the caster, GMs and the target's owners),
     each with its own Resist Damage button. Plus the public template and radius line, and the
     whispered summary.
   - Karma reroll after posting: the damage cards carry a staged level baked from the successes at
     post time. **Option A:** freeze them (mark `areaCard`-like and skip them in sync). **Option
     B:** have `_syncDependentCards` re-render them. The resist-damage cards are plain HTML
     buttons, not a flag-backed card type, so they are not synced today, and the weapon damage
     cards behave the same way (a reroll after posting does not change them). Proposal: match
     weapons and do not sync. Say so in a hint on the card.
5. **Dialog:** for damaging manipulation spells, the TN hint reads "TN 4 + situation modifiers
   (cover, visibility — p.89)". The existing TN input already defaults to 4. No other dialog change.
6. **Data:**
   - Set `damageCode "(F)M"` on Spark and Flame Bomb in packs-src, then run build-packs.
   - **Migration** (value-based, idempotent): spell items named exactly Spark / Flame Bomb /
     Flamethrower, with category manipulation and an EMPTY damageCode, get "(F)M". This covers
     world items, actor items and unlinked token actors.
     - No `=== undefined` guard: the check is the empty-string value.
     - Named items only, so homebrew spells with an intentionally empty code are untouched.
7. **Tests:**
   - Vitest: `manipulationDamage`, staging, and `damageResistArmor` including `half_impact` and the
     unchanged existing calcs.
   - Quench (deterministic dice via `CONFIG.Dice.randomUniform`):
     - Flamethrower at a targeted NPC: the card has power = Force, level staged correctly for
       faces giving 4 successes (M → S), half_impact, and attacker-successes.
     - 0 successes: no card.
     - Flame Bomb area: one card per caught token; a vehicle inside gets a card; a hidden token is
       excluded.
     - Migration: an actor spell "Spark" with an empty code gets "(F)M"; a homebrew "Spark (custom)"
       is untouched.

## Round 1 amendments (these supersede the text above where they conflict)
A. **Staging uses the existing helpers:** `stageLevel(level, netToSteps(successes))`.
   - From M: 1 success → M, 2–3 → S, 4+ → D.
   - The Quench faces are chosen so the expected results match this.
B. **The parsed Power is used.**
   - The card's `data-power` / `data-base-power` = `manipulationDamage(...).power`, so `(F+2)M`
     keeps +2.
   - `stageDamageUp` is dropped; `stageLevel` + `netToSteps` already exist.
C. **Vehicles are NOT auto-resolved.**
   - `rollVehicleDamageResistance` ignores `half_impact` and attacker successes and applies its
     own hard-target rules.
   - Vehicles caught by Flame Bomb, or targeted by Flamethrower/Spark, get a GM line ("vehicle:
     GM resolves, p.108") and no button.
   - Eligibility for these spells: character, npc, spirit.
D. **Damage cards are flag-backed and re-synced after Karma.**
   - Each damage card stores `flags.sr2e.manipDamage = { testMessageId, casterName, spellName,
     targetUuid, targetName, basePower, baseLevel, successes, resolved:false, area:bool }`.
   - The card renders through `renderManipDamageCard(state)`, which computes the staged level and
     `attacker-successes` from `state.successes`.
     - At 0 successes it shows "the spell fizzles — no damage" and **no button**.
     - Cards are therefore posted even at 0 successes, so a Karma reroll can bring them to life.
   - `manipDamage` is registered in `_syncDependentCards`'s renderer map, so reroll and buy re-render
     unresolved cards with the new total.
   - Flame Bomb is one TN, so Karma stays normal and its cards sync the same way.
   - The resist handler marks the card resolved after rolling: the author or a GM updates the
     flag, the same pattern as `rollSpellResistance`.
     - The existing pre-0.94 resolution-permission gap stays documented; this plan does not widen
       it.
E. **Ownership check in the resist-damage handler** (sr2e.mjs ~2013).
   - Before rolling, refuse unless the clicking user owns the resolved defender or is a GM, with a
     warning naming who can.
   - This applies to every Resist Damage button, weapons included. Today a non-owner click posts a
     roll and then fails the damage update.
F. **Resolution output stays public.** A resolved attack's damage lands on a visible token for
   everyone anyway, and every other attack resolves publicly.
   - The whisper policy (0.94 amendment H) covers pre-resolution target lists and cards.
   - Rejected: threading an audience through `rollDamageResistance`.
G. **Flame Bomb carries `attackerSuccesses` (complete miss applies).** p.158 says "Resolve using
   the ranged combat procedure" for Flame Bomb as well, unlike grenades, whose rows omit it on
   purpose.
H. **Situation modifiers apply to the aim point.**
   - The caster aims one blast and the p.130 base TN 4 is the spell's, so there is one TN and one
     staged code.
   - Cover and other per-victim circumstances are GM adjudication. Stated in a card hint.
I. **The single target is snapshotted before the first awaited roll** (uuid + name at the top of
   `_rollSpellcast`, like the area path).
J. **Migration registered at a new version `0.95.0`** (the release this ships in).
   - It runs over world items, actor items and unlinked token actors via the existing runner.
   - Condition: the name is one of Spark / Flame Bomb / Flamethrower, category is "manipulation",
     and `damageCode` is `""` (a value test, not `=== undefined`).
   - Vitest covers it with a schema-defaulted document (per CLAUDE.md), plus an untouched
     "Spark (custom)".

## Round 2 amendments (supersede D, H and the handler parts of E where they conflict)
K. **Resolution is proven by the resolver's own message, not by editing the caster's card.**
   - A successful manipulation resistance posts its result message with
     `flags.sr2e.resolves = <damage card message id>`. The resolving user authors it, so no
     cross-user permission is needed.
   - `isManipCardResolved(card)` = `card.flags.sr2e.manipDamage.resolved` OR any message has
     `flags.sr2e.resolves === card.id`.
   - `_syncDependentCards` skips resolved manip cards; the renderer omits the button when resolved.
   - The author or a GM additionally flips `manipDamage.resolved` and re-renders, so the button
     disappears. Anyone else relies on the marker message.
L. **Handler guards for `data-manip="1"` buttons**, in order:
   1. The authoritative state says not resolved (K).
   2. A client-side in-flight `Set` of card ids blocks double clicks and is released in `finally`.
   3. Target resolution: if the card has a non-empty `targetUuid` that no longer resolves, **abort**
      with a warning. The selected-token/character fallback is used only when no target was
      recorded (untargeted Flamethrower).
   4. The defender's type must be character, npc or spirit. A vehicle is refused with "GM
      resolves vehicles (p.108)".
   5. Owner or GM (E).
   6. `rollDamageResistance` returning null or undefined (dialog cancelled) marks nothing, so the
      card stays live.
M. **Cards read the CURRENT test total when they are created.**
   - `successes = testTotalSuccesses(game.messages.get(testMessageId)?.flags.sr2e.test)`, falling
     back to `spellResult.successes`.
   - Karma spent on the casting card while drain was still resolving is therefore reflected.
   - Quench regression: reroll the cast test before the cards are posted (hook between test and
     drain via a stubbed drain roll) and assert the card uses the new count.
N. **H relabelled.** One TN at the aim point is an **automation limitation**, not a verified rule.
   The area card says: "One TN for the whole blast; victim-specific cover or visibility is GM
   adjudication."

## Round 3 amendments
O. **Revalidate after the dialog, before any dice.**
   - `rollDamageResistance` gains an optional `options.beforeRoll` async callback, called after
     its dialog is confirmed and BEFORE `rollSuccessTest`. Returning false aborts with no dice,
     no pool spend and no damage.
   - The manip handler passes a callback that re-reads the card message and refuses (with a
     warning, leaving the card live) when:
     - the card is now resolved (K marker or flag), or
     - `manipDamage.successes` differs from the value captured at click, with the message
       "the caster spent Karma — click Resist again".
   - This closes the Karma-during-dialog race. It also shrinks the two-resolver race to the
     moment between the callback and the roll.
   - Weapon cards pass no callback: unchanged.
P. **No cross-client claim.** A shared claim needs a socket relay, and the repo's CLAUDE.md
   documents that `system.*` socket messages do not reach the GM at this table's host (the relay
   was removed for that reason).
   - The residual race (a GM and a defender both confirming within the same instant) is
     documented and matches every existing attack card.
   - The GM's Undo is available.
   - Regression coverage: a Karma change during an open dialog (stub `beforeRoll` timing), and a
     marker posted between click and confirm → refused.

## Key decisions & tradeoffs
- **Reuse `rollDamageResistance` wholesale** (Body + Combat Pool, complete miss, vehicles, the
  staging-down math), instead of a spell-specific resist. The book literally says "as in Ranged
  Combat".
- **Spell Defense dice are not added** to these resistance tests. p.132 says Spell Defense protects
  "when protected characters are attacked by magic", which is ambiguous for a Damage Resistance
  Test. The GM can add them as misc dice in the resist dialog. This will be flagged to the user.
- **Detection is data-driven** (damageCode), with a name-scoped migration to fill the empty codes.
- **No re-sync of damage cards after Karma**, matching weapon behaviour.

## Out of scope
- Ignite (burning over turns), Poltergeist (Stun L, Quickness, TN = Force), and Ice Sheet
  (Quickness test to cross). These are distinct mechanics and are reported as follow-ups.
- Barrier interaction for spell energy.
- Fire effects on objects, and ignition of combustibles (GM).
