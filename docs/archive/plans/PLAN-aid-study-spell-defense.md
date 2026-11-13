# Plan: Learning spells with Aid Study, and elemental Aid in Spell Defense
_Round 4 — E1–E10, F1–F6, G1–G5, H1 (later wins)_

## Goal
Finish the elemental sorcery services from p.141 that 0.96.0 deferred:
1. **Aid Study.** A bound elemental adds its Force in dice to its mage's attempt to learn a spell.
   This needs a spell-learning test, which the system does not model today (spells are simply
   dropped onto a sheet).
2. **Spell Defense aid.** Aid Sorcery dice may be allocated as Spell Defense (p.141: "may be used
   to augment any test at any stage in sorcery, including Spell Defense … allocated at the same
   time and in the same manner as Magic Pool dice").

## Rules (read from renders of the corrected 11th printing)
- **Learning a spell** (p.132, PDF 141; p.133, PDF 142):
  - The shaman studies in a medicine lodge, and the mage in a sorcery library, "with a rating at
    least equal to the Spell Force".
  - "a Success Test using dice from the character's Sorcery and Magical Theory Skills. The Target
    Number is twice the desired Force. A shaman gets totem modifiers, if appropriate. A mage may
    get extra dice if aided by an elemental appropriate to the spell." **User decision:** the dice
    are Sorcery + Magical Theory, added together.
  - "All target number modifiers for damage to the magician apply, as do distractions for
    sustaining spells, bad conditions, and so on." That is the wound and sustain modifiers
    rollSuccessTest already applies, plus a situational TN field.
  - Teacher: with a Teaching Special Skill, the teacher rolls against TN = Spell Force − the
    pupil's Intelligence (minimum 2), and "Successes from this test reduce the magician's target
    number".
  - Time: "a base number of days equal to the desired Force. Divide this by the number of
    successes. The minimum time is one day." **User decision:** round up.
  - Cost: "Learning spells also costs Karma (see p.190) equal to the desired Force."
  - Failure (no successes): the attempt fails, the time is wasted ("a number of days equal to
    Force"), and it costs no Karma.
- **Aid Study** (p.141): "For the spirit to add its Force in dice to the mage's learning attempt
  costs a service … only help with a spell within its appropriate category … A mage may only use
  one spirit, one time, for learning a particular spell." It may stay astral. There is no Force
  depletion clause (unlike Aid Sorcery).
- **Spell Defense** (p.132): "an area effect that encompasses all characters or objects within the
  allocating magician's vision … When protected characters or objects are attacked by magic, the
  magician … can choose to use those dice to protect that target. Spell Defense dice, once
  expended, are lost until reallocated at the time the Magic Pool refreshes."
- **Aid in Spell Defense** (p.141, above). **User decision:** an elemental's dice defend only
  against spells of its own category (fire: combat, and so on).

## Current code
- `SR2EActor#allocateSpellDefense(n)` moves Magic Pool dice into `dicePools.spellDefense`.
  `rollSpellResistance` adds ALL of `spellDefense + shieldingBonus` to the resisting actor's own
  test and then zeroes both. `clearSpellDefense` returns them to the pool. Refresh zeroes both
  (`dicePoolRefreshUpdates`). There is no protection of allies; that stays out of scope.
- 0.96/0.97 elemental services: `planElementalTransition` / `elementalTransition` in
  module/elementals.mjs, `boundElementals`, `elementalAidsCategory`, the `service` state
  (`""` / `"aid"` / `"sustain"`), `forceUsed` and `effectiveForce`.
- Magical Theory is a skill (config `magicalTheory`). Good Karma is `system.karma.current`
  (quickening spends it).

## Approach
### A. Learning a spell (characters only)
1. **Pure rules** (sr2e-rules.mjs + Vitest):
   - `spellLearningTN({ force, teacherSuccesses, extraTN })` = max(2, 2·Force −
     teacherSuccesses + extraTN).
   - `spellLearningDays(force, successes)`: null when successes = 0 (failed), else
     max(1, ceil(force / successes)).
   - `teachingTN(force, pupilInt)` = max(2, force − int).
2. **"Learn a spell" button** on the Magic tab (characters with Magic > 0). It opens a dialog in
   the new `.sr2e-attack--spell` shell:
   - the spell: a select of the `sr2e.spells` compendium plus world spell Items, excluding
     spells the character already knows by name;
   - the desired Force (1 up to Magic Rating; a higher Force is allowed with a warning, since
     restricted-use spells can exceed Magic);
   - the library or lodge rating (must be ≥ Force; the Learn button is disabled below that, with
     "p.132: rating at least equal to the Force");
   - teacher successes (a number: the GM or the teacher rolls Teaching separately; the dialog
     shows the teacher's TN once the pupil's Intelligence is known);
   - an "other TN modifiers" field;
   - elemental Aid Study (C, mages only);
   - shaman totem dice (existing `totems[..].spellBonus` / `spellPenalty` for the category,
     applied automatically as in casting).
   - Readout: dice (Sorcery + Magical Theory + totem net + aid), TN, Karma cost, and the days if
     1 / 2 / 3 successes.
3. **The roll** (`SR2EActor#learnSpell(opts)`):
   1. Preflight, with nothing spent: Karma ≥ Force; the library rating ≥ Force; the spell is not
      already known; the Aid Study preflight (C).
   2. Aid Study service, then `rollSuccessTest(dice, tn, { label: "Learn <spell> (Force F)" })`.
      Wound and sustain modifiers apply automatically. No pool dice (the book gives none).
   3. On success: create the spell item from the source with `system.force = F`, deduct Karma F,
      and post "learned in N days, F Karma".
   4. On failure: post "failed — F days wasted", with no Karma spent.
   - Karma dice / Karma Pool: the normal Karma buttons on the test card work. p.191 applies to
     any test.
4. Restricted-use options (exclusive or fetish, p.133) are out of scope. The spell's existing
   fields are copied as authored.

### B. Aid Study (mages; p.141)
- Offered: bound elementals (`boundElementals`) where `elementalAidsCategory(domain, category)`
  holds, `service === ""`, not depleted, no pending expiry, and services ≥ 1.
- **Once per spell, per mage:** `flags.sr2e.aidStudyUsed` on the character is a list of spell
  source ids (the compendium uuid or world id), recorded when used. An elemental already used for
  that spell is refused, and so is any second elemental for it ("one spirit, one time").
- A new pure transition `aidStudy`: requires service `""`, not depleted, not pending,
  services ≥ 1. Update: services − 1. Force is not reduced (no depletion clause). It returns
  `{ dice: effectiveForce }`.
- Order: the preflight runs before anything is spent. The service is debited, then the roll is
  made. If the roll throws after the debit, the service is lost; documented, and matching foci.

### C. Spell Defense aid (p.141 + user decision)
- **Allocation:** the "Allocate Spell Defense" dialog gets an optional elemental row: one bound
  elemental, any element, with dice ≤ effectiveForce.
  - Allocating starts the Aid Sorcery service if it is idle (1 service; the elemental is then
    `"aid"`, exclusive as before) or continues an active one.
  - The dice are a **reservation**. Force is spent only when the dice are actually USED (p.141:
    "reduced by 1 for each die used").
  - Stored on the character (additive CharacterData dicePools fields):
    `dicePools.spellDefenseAid` (count) and `dicePools.spellDefenseAidSpirit` (uuid). One
    elemental at a time. A new allocation replaces a different spirit's reservation.
- **Use** (`rollSpellResistance`):
  - If the attacking spell's category matches the reserving elemental's category AND the spirit is
    still valid (bound, service `"aid"`, effectiveForce > 0): add
    `min(reserved, effectiveForce)` aid dice to the resistance, run
    `elementalTransition(spirit, "aid", { n: used })` (Force −n; it vanishes at 0), and zero the
    reservation (spent, like Spell Defense).
  - A non-matching category leaves the reservation untouched ("defend only against its
    category").
  - The card label reads "+N Aid Sorcery (Fire elemental)".
  - `spellDefense` and `shieldingBonus` behave as today.
- **Clear / refresh:** `clearSpellDefense` and `dicePoolRefreshUpdates` also zero the
  reservation. No Force was spent, so nothing is returned to the elemental. Its `"aid"` service
  stays active, as in 0.96.
- The Magic tab shows "Spell Defense N (+M Fire elemental)".
- The resistance card is the only automated use. Protecting allies (p.132) is not automated,
  today or here.

### D. Files and shared-file handling
- `actor-data.mjs`: the CharacterData dicePools additions sit in another area from the other
  session's hunk (line ~446). Apply with a patch script to both the HEAD copy (commit) and the
  working copy, as in 0.96/0.97.
- No other shared files.

### E. Tests
- Vitest: learning TN / days / teaching TN; the `aidStudy` transition; the aid-in-defense
  category filter (a pure helper `defenseAidApplies(element, spellCategory)`).
- Quench:
  - learn success (the item is created at Force, Karma spent, days rounded up);
  - learn failure (no item, no Karma);
  - insufficient Karma or library rating → refused, nothing spent;
  - an already-known spell → refused;
  - Aid Study adds Force dice, costs 1 service, and is refused the second time for the same spell
    or with a second elemental;
  - a wrong-category elemental is not offered;
  - Spell Defense aid: allocate → the reservation is visible; a matching combat spell resisted →
    +dice and the elemental's Force drops; a non-matching category → the reservation is kept;
    clear or refresh → the reservation is gone and Force is unchanged.

## Round 1 amendments
E1. **Learning is a two-step card, so Karma counts.**
    - `learnSpell` rolls the test, then posts a flag-backed **learning card**
      (`flags.sr2e.learning` = { actorUuid, spellSource (the definition snapshot), spellName,
      force, testMessageId, successes, resolved }).
    - The card is registered in `_syncDependentCards`, so rerolls and bought successes re-render
      it: the days are recomputed, and a failure can turn into a success.
    - It carries a **"Complete learning"** button (the actor's owner or a GM) that finalizes ONCE:
      if successes ≥ 1, create the spell, deduct the Karma and post the days; otherwise post the
      wasted days. Then it marks the card resolved.
    - The dialog also offers **Karma dice** (`karmaDiceSection`), capped at the rating dice in use
      (Sorcery + Magical Theory; p.191, not the aid or totem dice).
E2. **Elemental-only Spell Defense works:**
    - `onAllocateSpellDefense` no longer requires Magic Pool dice when an elemental is offered;
    - `allocateSpellDefense(n, { aid })` handles `n = 0` together with an aid reservation;
    - `clearSpellDefense` clears a reservation even when ordinary defense and shielding are 0.
E3. **A new pure transition, `startAid`:** service `""` → `"aid"`, −1 service, no Force spent,
    with the usual guards (not depleted, no pending, one service at a time). It is used by the
    reservation. `aid(n)` keeps its behaviour.
E4. **Reserved dice are unavailable elsewhere.**
    - The caster's `dicePools.spellDefenseAid` reservation (when it names this spirit and its
      current aid instance) is subtracted from the dice the cast dialog offers and from what
      `_rollSpellcast` accepts: available = effectiveForce − reserved.
    - Releasing the reservation (clear, refresh, or use) frees them.
E5. **Aid-service instance:**
    - `startAid` (or an `aid` that starts the service) writes `aidInstanceId = randomID()`; any
      path that ends the aid (depletion, endService, recall, and switching to sustain via
      endService first) clears it.
    - The reservation stores `{ spiritUuid, instanceId, dice }` and is valid only while
      `spirit.service === "aid" && spirit.aidInstanceId === instanceId`. Otherwise it is ignored
      and cleared at the next touch.
E6. **Payment before dice.**
    - Allocation preflights `spirit.isOwner && caster.isOwner`.
    - At resistance, `elementalTransition(spirit, "aid", { n })` must return `ok` BEFORE any aid
      dice are added.
    - If it fails, the resistance proceeds WITHOUT aid dice, the reservation is kept, and the card
      notes "aid unavailable". Ordinary Spell Defense and shielding are unaffected.
E7. **Only fire (combat) Spell Defense aid is automated in this release.**
    - The only automated magical-resistance path is the combat-spell Resist card
      (`rollSpellResistance`).
    - The allocation dialog offers only fire elementals, with a hint that other elements' defense
      is the GM's call until those resistance paths exist.
    - The pure helper `defenseAidApplies(element, category)` is kept for future paths, and
      `rollSpellResistance` treats its cards as combat.
E8. **Once per spell is keyed by a canonical identity:** the normalized spell NAME (lowercase,
    trimmed, whitespace collapsed), stored in `flags.sr2e.aidStudyUsed` on the character.
    Compendium and world copies of "Fireball" are the same spell.
E9. **Preview TN = rolled TN.**
    - Extract `SR2EActor#testTnModifiers({ isResistance, extraTN, centeringReduction })`, which
      returns `{ total, parts }` with exactly the wound / sustain / dumpshock / MPCP / extra /
      centering logic `rollSuccessTest` uses.
    - `rollSuccessTest` calls it, as a behaviour-preserving refactor pinned by the existing
      tests. The learning dialog previews `spellLearningTN(...) + testTnModifiers().total`.
E10. **A learned spell is a clean definition.**
    - Build the new item from the source's definition fields (name, img, type, system minus its
      runtime fields, effects as definitions).
    - Reset `sustaining`, `sustainedForce`, `spellLocked`, `quickened`, `quickeningKarma`, and
      any elemental links.
    - Drop `_id`, `folder`, `sort`, `ownership` and `flags` (except `core.sourceId`, set to the
      source uuid). Set `system.force = F`.

## Round 2 amendments (supersede E1 where they conflict)
F1. **Completion rechecks live state.**
    - The Complete button re-verifies Good Karma ≥ F and "not already known" (the canonical name,
      E8) immediately before writing.
    - On failure the attempt stays pending, with a message ("needs F Karma" / "already known").
F2. **Authoritative completion state lives on the ACTOR, not the message.**
    - `learnSpell` records `flags.sr2e.learning.<attemptId> = { status: "pending", spellName,
      force, testMessageId }` on the character (its owner can always write it).
    - The learning card stores only `attemptId` and `actorUuid`. It renders from the actor's flag
      plus the live test total.
    - Completion requires `actor.isOwner` only.
    - The card message is re-rendered when the user can modify it; otherwise the actor flag is the
      truth and the card is refreshed by the author or GM later (the sync skips done attempts).
F3. **Exactly-once completion.**
    - A client-side lock is keyed by `attemptId`, and completion is idempotent step by step:
      1. **Create:** if an owned spell with `flags.sr2e.learnAttempt === attemptId` exists, skip
         creation; otherwise create the clean definition (E10) with that flag.
      2. **Pay:** one `actor.update` that deducts Karma AND sets `learning.<id>.karmaPaid = true`,
         skipped if already paid.
      3. **Done:** set `learning.<id>.status = "done"`.
    - A failure between steps leaves recoverable progress, and pressing Complete again resumes.
    - A failed test (0 successes) completes with `status = "failed"`: no item and no Karma.
F4. **Karma is closed after completion.**
    - The learning test's state carries `learningAttemptId` (a new `rollSuccessTest` option,
      persisted in `flags.sr2e.test`).
    - `applyKarmaToTest` refuses reroll, buySuccess and avoidGlitch while the actor's attempt is
      `done` or `failed`, and `renderSuccessTestCard` hides those buttons.
    - Before completion, Karma works and the learning card re-renders through the sync.
F5. **Resetting the Magic Pool clears reservations.** The Attributes-tab Magic Pool reset
    (`onResetPool` for magic) routes through the shared defense cleanup: it zeroes `spellDefense`,
    `shieldingBonus` and the aid reservation without spending elemental Force, exactly like
    `dicePoolRefreshUpdates`, so the reserved dice become available to casting again.
F6. **Tests added:**
    - two attempts with Karma for only one → the second stays pending;
    - a double click on Complete → one item, one charge;
    - an injected failure after item creation → Complete again: no duplicate item, charged once;
    - Karma reroll after completion → refused;
    - the Magic Pool reset clears the reservation.

## Round 3 amendments (supersede F1–F3 where they conflict)
G1. **Completion is phase-aware.** With `live` = the current test total, evaluated in order under
    the actor lock (G3):
    1. `live === 0` → finalize `status = "failed"` immediately (no Karma or duplicate checks), and
       post the wasted days (G4).
    2. **Create** unless an item flagged with this `attemptId` exists. The duplicate-name check
       EXEMPTS that item, and runs only when creation is still needed.
    3. **Pay** unless `karmaPaid`. The Karma ≥ F check runs only here, when payment is still due.
    4. Set **done**.
G2. **The definition snapshot lives in the actor record:** `learning.<attemptId>.definition` holds
    the clean E10 definition, captured at roll time from the chosen source. Completion builds the
    item from it, never from the (possibly deleted) source.
G3. **The lock is keyed by actor uuid**, covering all of a character's attempts. Live checks, item
    creation and payment all run inside it, so two attempts cannot both pass one balance.
G4. **A failure is finalized first** (G1 step 1), whatever the Karma or duplicates.
G5. **F6 extended:**
    - a failure injected after payment → Complete resumes to done without charging again;
    - two different attempts completed concurrently with Karma for one → one done, one pending
      ("needs F Karma");
    - a failed attempt completed after Karma dropped to 0 → recorded failed.

## Round 4 amendment
H1. **Pay BEFORE create** (supersedes G1's order). Under the actor lock:
    1. `live === 0` → failed.
    2. **Duplicate check:** the canonical name is already known on an item NOT flagged with this
       `attemptId` → refuse and stay pending, with nothing written.
    3. **Pay** unless `karmaPaid`: check Karma ≥ F (refuse and stay pending if short, with
       nothing written); otherwise ONE `actor.update` deducts F and sets `karmaPaid = true`.
    4. **Create** unless an item with this `attemptId` exists.
    5. **Done.**
    - No unpaid spell can ever exist: a spell is created only after its Karma is recorded as paid.
      A failure after step 3 resumes at step 4 without charging again.
    - G5's two-attempt test asserts exactly ONE spell item and one charge.

## Key decisions & tradeoffs
- **Aid Study does not deplete Force.** Only Aid Sorcery says "reduced by 1 for each die used".
- **Spell Defense aid spends Force on use, not on allocation.** Unused dice cost nothing.
  Contestable, because "allocated … in the same manner as Magic Pool dice" might imply commitment
  at allocation.
- **The teacher's Teaching test is an input**, not an automated roll (the teacher is another
  character, often an NPC).
- **The spell source list** is the system compendium plus world items. Content-module spells
  (grimoire) are included if their packs are of type Item with spells: scan every Item pack for
  `type === "spell"` through its index.

## Out of scope
Restricted-use (exclusive or fetish) spell options, Spell Defense protecting allies, learning for
NPCs, automated teacher rolls, and elemental Aid in the teacher's test.
