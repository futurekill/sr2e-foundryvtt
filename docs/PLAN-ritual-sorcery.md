# Plan: Ritual sorcery (SR2E p.133–136)
_Final — Round 5 rewrite (rules re-read from the rendered pages p.133–137,
state design simplified) plus every Codex R5 fix; MAX_ROUNDS reached with no
point left in dispute_

## Rules (verified on the rendered pages)
- **p.133**:
  - Ritual sorcery uses the **Ritual Sorcery concentration** of Sorcery for
    all its tests.
  - A shaman needs a **medicine lodge**, and a mage a **hermetic circle**,
    rated at least the spell's Force.
  - **Materials**, used up whatever the outcome: Detection 100¥ × Force,
    Health 500¥ × F, Illusion 100¥ × F, Manipulation 1,000¥ × F.
  - **Combat spells cannot be cast by ritual.**
- **p.135 Teams**:
  - Every member must know the spell and be of the same tradition (shamans of
    different totems may team up).
  - Team size is at most the **lowest Sorcery rating** in the team.
  - A focus adds its dice once over the whole ritual.
  - All members' Magic Pools combine into the **Ritual Magic Pool**, which is
    not refreshed.
  - A member who **withdraws** takes their Magic Pool dice back out of the
    pool. If that exhausts the pool, the spell aborts and everyone resists
    Drain.
  - Modifiers on one member (wounds) affect only them, unless they are the
    leader.
  - **Astral guiding**: a member in astral space spots the target, and no
    material link is needed. They contribute no pool dice but still resist
    Drain. If they are driven off, the spell aborts.
  - **Preparation**: members drop every sustained spell.
- **p.136**:
  - **Material link**: Force hours, then a leader-allocated test. TN from the
    Material Link Table (city 5, state 7, continent 9, unknown 11), plus
    spirit +2, mana barrier +rating, circle/lodge +rating, stale tissue +4.
    One success links; time = Force ÷ successes hours; 0 aborts.
    Skipped if the target is in sight or astrally observed.
  - **Sending**: a test with TN from the Sending Table (place 6, (meta)human
    6, object 8, spirit 8), +2 if the target moves faster than running, −1
    for an area spell. Time = Force ÷ successes hours, **minimum 1**. 0 aborts.
- **p.137**:
  - **Effect**: a normal Spell Success Test with pool dice.
    - An area spell's radius is the leader's Magic, with withheld dice per
      p.130.
    - Circle, lodge, barrier, cover and visibility modifiers don't apply;
      only the leader's Injury and (shaman) totem modifiers do.
    - Resistance TN = the higher of Force and the leader's Ritual Sorcery.
    - Allies may use Spell Defense if they are aware of it.
  - **Sustaining**:
    - leftover pool dice, for leader Magic × dice **hours**;
    - an elemental, for Force **days**;
    - or the team stays **locked in**, which counts as sustaining (+2 to each
      member's Drain Resistance Test).
  - **Drain**:
    - each member resists as if they had cast alone;
    - the leader divides the leftover pool dice among them;
    - members may add foci, totem or spirit-aid dice they haven't used in this
      ritual.
    - This happens even on an abort.

## Design: a GM worksheet over one record
Rituals take hours of game time between scenes, and the **GM runs them** on
their own client. The worksheet automates the arithmetic and the rolls. The GM
makes the judgement calls the book leaves to them: the link table row,
awareness for Spell Defense, and astral interception.

1. **The record**: a GM-whispered chat message (`flags.sr2e.ritual`). It is
   whispered to keep it out of players' chat, **not** as confidential storage
   (R5 #11). Foundry sends world documents to every client, hidden tokens
   included, so the snapshot exposes nothing a player's client doesn't already
   hold. The card shows progress and a **Resume** button, which reopens the
   worksheet from the record. Every
   mutation runs in one local queue per ritual (`enqueueAttack("ritual:" +
   id)`), re-reads the record inside the step, validates the stage, and checks
   `game.users.activeGM?.isSelf` before writing (R4 #2).
2. **Start (A. Prepare)** is refused unless all of these hold:
   - the spell is not a combat spell;
   - the roster is unique and includes the leader;
   - team size ≤ the lowest Sorcery rating;
   - every member knows the spell (`_knowsSpell` on name and restriction);
   - everyone shares a tradition;
   - no member personally sustains a spell (a "drop them" button lists them);
   - the GM confirms the lodge/circle rating ≥ Force;
   - the subject suits the spell (a health spell needs an actor);
   - each contribution is an integer from 0 to that member's current Magic Pool.

   **Materials** are a GM-confirmed step (R5 #10): the worksheet shows the
   cost, and "Charge the leader" deducts it **in the same actor update** that
   sets `flags.sr2e.ritualPaid.<ritualId>`. A retried Start sees the marker
   and doesn't charge twice. "Supplied" records it as paid without charging. **Members' Magic Pools are not debited**: the pool is a
   number on the record, and the book's only rule about individual pools is
   that members can't use them while in the ritual. That removes the debit and
   refund failure modes (R4 #1 for Start).
3. **Stages (B. Link, C. Sending)**, each one button. The GM picks the dice
   (≤ pool) and the table row and modifiers. The test is the leader's
   `rollSuccessTest` with:
   - `tnPolicy: "table"` (no Injury, sustaining or other modifiers);
   - `karmaDiceCap: 0` (all dice are pool dice).

   Every ritual test (link, sending, effect and each member's Drain)
   carries **one structured tag, set when it is created**:
   `flags.sr2e.ritualTest = { ritualId, stage, dice, memberUuid? }`.
   `rollSuccessTest` gains an `options.flags` pass-through into its
   `ChatMessage.create`, so no test ever exists untagged (R5 #7). The record
   is updated afterwards. On Resume, a tagged test of any stage with no record
   entry is **adopted**, not re-rolled, so a crash between the two can't
   charge dice twice (R4 #1).
   - **Finalise** (the GM) reads the live total after any Karma, closes the
     test, and records successes and hours: Force ÷ successes, kept
     fractional, with the sending's 1-hour minimum.
   - 0 successes means abort, costing Force hours.
   - Ritual tests take Karma only from the active GM, the one client that runs
     the ritual (the existing R3 rule).
4. **Withdraw / astral guide** (R5 #5):
   - **Withdraw** a member: the pool loses that member's contribution. At
     **≤ 0** the ritual aborts (the pool floors at 0). The member still owes
     Drain.
   - The **astral guide** is a roster role with no contribution; the link
     stage is skipped. The guide withdrawing or being driven off aborts.
   - The **leader** can't withdraw; the GM terminates instead.
   - **Terminate**: an abort at any point.
   - **Freezing the Drain level on an abort** (R5 #2): whenever an abort
     creates Drain obligations and no level is frozen yet, the level is
     resolved and stored then (for healing, from the patient's current
     wounds).
5. **D. Effect**: a ritual-only roll path, not an option threaded through
   `_rollSpellcast` (as Codex R4 suggested).
   - **Preflight** checks the fetish, the exclusive spell and the area
     geometry. A failure is retryable: fix it and retry, or Terminate.
   - **TN**: the spell's normal TN against the snapshotted subject, resolved
     by the existing TN helpers, plus the leader's Injury (R4 #8).
   - **Dice**: the pool dice plus the leader's totem dice for the category
     (dice, not TN — R4 #8). The totem dice used here are **recorded**; at
     Drain the leader is offered only the unused balance (R5 #1). A totem
     *penalty* is a dice penalty on the effect and is not "unused dice" at
     Drain.
   - **Restricted spells** (R5 #6):
     - `spellForces` gives the actual Force (Drain, sustaining) and the
       effective Force (dice cap, resistance, damage), as ordinary casting
       does.
     - An expendable fetish is consumed **once**, at Effect preflight, in the
       same step as the check.
     - A reusable fetish is only checked.
   - **Drain level frozen here**, before anything is published. For healing,
     it is read from the patient's current wounds (R4 #9).
   - After **Finalise**, publication posts cards from the finalised dice
     using the existing posting helpers:
     - `_postAreaResults`, or the single resist card;
     - `_postManipDamage` or the heal card;
     - for Ignite, a GM card naming the subject and successes. The GM applies
       the burn with its button, which calls `igniteFromCast` (R5 #8: the
       actor mutation stays an explicit, single GM action).

     Resist cards carry `resistTN = max(Force, leader Ritual Sorcery)`, which
     resistance uses in place of `force` when present; damage still uses
     Force.
   - **Poltergeist and Ice Sheet cannot be cast by ritual** (both need a live
     sustainer or a map click at the caster's scene), and Start refuses them
     with a message. Their lasting effects are location-bound, and a ritual's
     target is remote.
   - **Publication is idempotent** (R4 #3, R5 #8):
     - Every artifact carries `flags.sr2e.ritualCard = ritualId:kind:key`,
       where kind is `resist`, `heal`, `manip`, `summary-public`,
       `summary-gm`, `template` or `ignite`. The posting helpers accept an
       `artifactFlags(kind, key)` callback.
     - A resumed publication creates only the missing artifacts.
     - The record's `published` is set last.
6. **Sustaining** is chosen after the effect, before Drain, and is
   **recorded, not automated** (R4 #6, #7). The card states the mode and the
   duration:
   - Magic × dice hours from the ritual's end;
   - or Force days by an elemental.
   - Locked-in adds +2 TN to every member's Drain test and notes that the
     members are sustaining.

   **Leftover dice spent on sustaining are removed from the pool before the
   Drain split** (R5 #4).

   The spell item is **not** marked sustained. For leftover dice or an
   elemental, no member is concentrating, so the personal +2 penalty doesn't
   apply. A **locked-in** team *is* sustaining (p.137), and its restrictions
   (+2 on other tests, no other spells, mundane tasks only) are **GM-enforced**,
   as the card says; only the +2 on Drain is automated. Expiry is the GM's to
   track (a stated limit).
7. **E. Drain** (all members, the guide and withdrawn members included, even
   on an abort), rolled one member at a time by the GM:
   - Dice: Willpower + the leftover pool dice the leader assigns (validated
     so the total ≤ pool) + that member's **totem dice** for the spell's
     category (computed, not typed) + **other dice** the GM attests (unused
     foci or spirit aid). The attested dice are a GM-entered number with a
     label. Consuming a focus or an elemental service stays the GM's call
     (R4 #10, stated limit).
   - TN and level come from the spell's Drain code at the **actual** Force,
     and the level is the frozen one. The Drain is **Physical** if the actual
     Force > that member's Magic, **or the member is astrally projecting**
     (the guide, usually), matching ordinary casting (R5 #3). Locked-in adds
     +2 TN.
   - Centering is not offered on ritual Drain (R4 #11, stated limit).
   - **Finalise** reads the live total and closes the test. It then computes
     the **complete** damage update (monitor, physical overflow, and Stun
     spilling into Physical — refactoring `applyDamage` into a pure
     `damageUpdate(actor, boxes, type)` plus a caller) and commits it **in one
     actor update** that also sets `flags.sr2e.ritualDrain.<ritualId> =
     true`. A fully resisted Drain writes the marker alone. An actor already
     carrying the marker is skipped, so Drain applies once (R4 #1, R5 #9).
8. **Time** is **reported, not advanced** (R4 #5): the card lists each
   stage's hours and the total, and the GM advances world time themselves.
   There is no exactly-once world-time write to get wrong.
9. **End**: when every member's Drain is done, the record is marked complete.
   It stays in chat as the log. The GM can delete it.

## Tests
- Unit:
  - materials by category;
  - the link and sending tables and modifiers;
  - hours: fractional, the sending's minimum, and an abort costing Force;
  - the team-size rule;
  - resistance TN = max(Force, skill).
- Quench (GM client; every fixture named "Quench Ritual"):
  - Start refuses:
    - a combat spell;
    - a member who doesn't know the spell;
    - mixed traditions;
    - a team larger than the lowest Sorcery;
    - a sustained spell until it is dropped;
    - an over-contribution;
    - an unconfirmed lodge.
  - Start charges materials; no member's Magic Pool changes.
  - Link:
    - dice come from the pool, and the TN is the table value with no Injury;
    - 0 successes aborts, with Force hours and a Drain obligation for every
      member, the guide included;
    - a tagged test without a record entry is adopted on Resume, not re-rolled.
  - Finalise closes the test; a Karma reroll before it changes the recorded
    successes.
  - Withdraw reduces the pool, and one that exhausts it aborts.
  - Effect:
    - the persisted subject is used (not the GM's T target);
    - resistTN = max(F, skill) on the card while damage uses F;
    - totem dice are added;
    - an area ritual catches a hidden token on a scene the GM isn't viewing,
      and its card is whispered;
    - publication resumed after an interruption posts only the missing cards;
    - Poltergeist and Ice Sheet are refused at Start.
  - A healing ritual's Drain level is frozen before its heal card exists.
  - Drain:
    - each member uses their own Willpower + assigned + totem + attested
      dice;
    - the leader's totem dice used in the effect aren't offered again;
    - a projecting guide's Drain is Physical;
    - the Drain split is validated against the pool after sustaining dice are
      removed;
    - Drain that overflows the Stun track lands on Physical in the same
      update as the marker;
    - `damageUpdate` matches `applyDamage` (regression);
    - locked-in adds +2 TN;
    - damage applies at Finalise with the marker, and a second Finalise on
      the same member does nothing.
  - A Link abort on a healing ritual freezes the Drain level from the
    patient's wounds at the abort.
  - Withdrawing the guide aborts; withdrawing the leader is refused; a pool
    driven below 0 aborts.
  - An expendable fetish is consumed once, even when the effect preflight is
    retried.
  - A retried Start with the paid marker does not charge materials again.
  - Ignite: the effect posts a GM card, and its button creates one burn.

## Out of scope (stated limits)
- Automatic expiry of ritual sustaining.
- Consuming foci charges or elemental services for attested Drain dice.
- Centering on ritual Drain.
- Advancing world time.
- Tracking a sending back; astral interception.
- Player-driven ritual UI (players ask the GM).
- Poltergeist and Ice Sheet by ritual.

## Implementation notes (built)
- **resistTN is not threaded into cards.** In this system only combat spells
  get an automated Spell Resistance card, and ritual sorcery can't cast combat
  spells (p.133). A damaging manipulation is resisted as damage (Power −
  armour), not as a Spell Resistance Test. So the resistance TN
  `max(Force, Ritual Sorcery)` is stated on the GM summary card for the GM to
  apply to any resisted non-combat spell.
- Drain entries are keyed by the member's uuid with dots replaced, because
  Foundry expands dotted keys when a flag object is updated.
- A step that refuses (returns false) still saves whatever `adopt()`
  recovered, such as a paid marker or a tagged test.
- An accidental live crash during UI testing (the browser froze mid-roll after
  the materials charge) left a consistent record: charged once, the link not
  yet rolled. The walkthrough then continued from the card.
