# Plan: Ignite, Poltergeist and Ice Sheet effects (SR2E p.157–158)
_Round 4 — final (MAX_ROUNDS); last Codex points applied, see log_

## Goal (verified on the rendered p.157–158)
- **Ignite** (Permanent): the caster must score **more** successes than a
  living target's Body (or an object's base Barrier Rating). Time to ignite =
  10 turns ÷ successes. Once burning: (F)M the first turn, **Power +1 per
  Combat Turn**; at the end of each turn a Damage Resistance Test counting ½
  Impact armour; burns out in **1D6 Combat Turns** unless extinguished. Carried
  ammo/explosives may go off (GM).
- **Poltergeist** (area, Sustained): +2 visibility inside the area; Stun,
  Damage Category **Light**, resisted with **Quickness** (not Body) vs TN =
  Force, Impact armour counts.
- **Ice Sheet** (Instant): Magic × successes m² of ice; crossing it →
  Quickness (TN 3) or fall prone; vehicles Handling or Crash Test; melts
  1 m²/minute.

## Shared pieces
1. **Environmental damage resistance**: `rollDamageResistance(…,
   { environmental: { attr, armorFraction, source } })` resists with the named
   attribute (body or quickness), uses armour × fraction (Impact ½ for fire,
   1 for Poltergeist), stages **down only** (no attacker successes, no net
   staging, no complete miss) and applies the given damage type.
2. **One processor, keyed by the committed `boundarySeq`**: `nextRound()`
   already commits a monotonic `flags.sr2e.boundarySeq` with each new Combat
   Turn. An `updateCombat` hook on the **active GM** (`game.users.activeGM?.isSelf`)
   reacts only to a **boundarySeq** change (not `round`: editing or rewinding
   the round number neither adds nor suppresses ticks) and runs
   `effectBoundary(combat, seq)`, serialised per combat. Combat creation and
   start are not boundaries.
   - With no active GM, nothing runs. On `ready`, and when a GM connects, the
     active GM catches up **burns only** (their state is self-contained), seq
     by seq. Poltergeist's missed boundaries are **not** replayed (see §8).
3. **Cards any owner resolves**: burn and Poltergeist resist cards are
   flag-backed with `resolves` markers (the manipulation pattern). Each button
   checks ownership.
4. **Actor identity**: an effect is keyed by the **full actor uuid** (synthetic
   token-actor uuid for unlinked tokens), de-duplicated. A burning object with
   no actor is a GM card.

## Ignite
5. **State** on the target actor: `flags.sr2e.burning = { instance, casterUuid,
   force, burnoutTurns (1D6, rolled and stored at creation), turnsBurned,
   igniteIn, status: "pending"|"burning"|"out", version, tickId, clock,
   pendingTick }`. `tickId` is a monotonic per-burn counter, independent of
   any clock, and `version` is bumped by every state change.
   - **Ignition delay**: `ceil(10 ÷ successes)` Combat Turns, so 5–9
     successes give 2 turns and 10 or more give 1. The card states it.
   - **Clock ownership**: `clock = { kind: "combat", combatId, lastRound }` or
     `{ kind: "manual", ticks }`.
     - **At creation**: if the actor is already in a started combat, the clock
       is bound to it at once, recording its current `boundarySeq`. Otherwise
       the clock is manual, and a **control card** with "Advance burn" (GM) is
       posted. When the GM resumes, a manual burn whose actor is now in a
       started combat is bound the same way.
     - It **binds** to a combat at the moment the actor's combat starts or the
       actor is added to a started one (`createCombatant` / `combatStart`,
       active GM). The clock records that combat and its current `boundarySeq`,
       and each later boundary counts once. Manual advances already made stay
       made: binding never re-counts or drops a turn.
     - Leaving or ending combat switches it back to manual and re-posts the
       control card.
   - **A tick is a persisted transition**:
     1. Compute the next state (ignite, burn Power `F + turnsBurned`, burnout)
        and write it as `pendingTick = { tickId: tickId + 1, basedOnVersion:
        version, cardPayload, next }`.
     2. Post the burn card (flag `burnTick = instance:tickId`) unless one with
        that key exists.
     3. Write `next` (`tickId`, `version + 1`, `turnsBurned++`, status, clock
        position) and clear `pendingTick`, **only if** `version` still equals
        `basedOnVersion`. Otherwise the pending tick is discarded.

     A retry resumes from step 2; a finished tick is a no-op. Order within a
     tick: ignite, then burn and card, then burnout, so the last burning turn
     is still resisted.
   - **Extinguish**: the button (target owner or GM) posts an extinguish
     request. **All burn-state mutations**, including ticks, Extinguish, burn
     creation and binding, run on the **active GM** in one per-actor queue, so a
     player's Extinguish cannot race the GM's tick commit. It sets the status
     to out, bumps `version` and clears `pendingTick`.
   - **The cast**: Ignite (a manipulation spell with no damage code) gets a
     `_rollSpellcast` branch: successes > Body → state created; otherwise
     "fails to ignite". For an object, the GM compares against its Barrier
     Rating.
   - **Permissions**: a caster without permission on the target posts a request
     (`flags.sr2e.igniteRequest`), which the active GM validates and applies.

## Poltergeist
6. **Only a successful, sustained cast activates it**: at 0 successes nothing
   is placed and nothing is posted. The template and cards are created only
   after the spell is confirmed sustained. Recasting while an instance is
   active **ends the old instance first**.
   - The template carries `flags.sr2e.spellEffect = { spellUuid, instance,
     visibility: 2 }`.
   - `setSustaining(false)` removes templates of that spell and instance on
     every scene. When the dropper cannot delete the GM's template, a cleanup
     request (`flags.sr2e.templateCleanup`) is posted. The active GM processes
     it idempotently, retrying until none remain.
7. **Visibility preset** (overridable, as today): it applies if the attacker,
   the target, or the straight line between them passes through a flagged
   template (segment–circle). It reads **both** `flags.sr2e.visibility`
   (smoke, unchanged) and `flags.sr2e.spellEffect.visibility`.
8. **Damage**: on the cast, and at each boundary of **its timing combat**
   while sustained, every actor **currently inside** gets a Poltergeist resist
   card: environmental, Quickness vs Force, Light Stun, full Impact.
   - **Timing combat**: at the cast, the started combat containing the caster
     is persisted on the template with its `boundarySeq`. Only that combat's
     boundaries count, once each (`lastSeq`). If that combat ends, a started
     combat on the template's scene is adopted at its current seq (no
     back-damage); if none exists, it pauses. A paused or untimed instance
     (cast before any combat) is **bound when a combat starts or gains a
     combatant** on the template's scene, and on GM recovery, at that
     combat's current seq, with no back-damage.
   - **Occupants** are recomputed at each boundary as it happens, from the
     template's own scene (`scene.tokens`), and de-duplicated by actor uuid.
     Missed boundaries (no active GM) are **not** replayed with present
     occupants. The GM gets a note naming the skipped boundaries instead.
   - **Only characters, NPCs and spirits** get automated cards. A vehicle
     inside gets a GM-resolution note, not the vehicle damage resolver. Recurring each turn is a
   reading of "whacking targets with flying debris", **flagged for the GM**.

## Ice Sheet
9. **Geometry after the cast**: excluded from the generic area circle. After a
   **successful** cast, a square template of side `√(Magic × successes)` m is
   placed at the chosen point (the area picker is reused). A failed cast
   places nothing.
10. **Crossing, on the finalised path**: the moving client captures the
    finalised path in `preMoveToken`, where the existing movement code already
    gets it. The path travels **with the update** as an operation option
    (`options.sr2eIcePath = { id, points }`), which Foundry forwards to every
    client's `updateToken`. The **active GM** consumes it once per operation
    id, independent of the movement limiter. A direct position update with no
    path falls back to the old→new segment. The origin is captured on the
    **initiating** client in `preUpdateToken` (the pre-update document) and
    forwarded the same way (`options.sr2eIcePath = { id, points: [origin, new] }`),
    and that fallback is stated.
    If any leg crosses an ice template, a card is posted: "Quickness Test
    (TN 3) or fall prone", with a button for the token's owner that applies
    prone on failure. For vehicles the card notes a Handling Test, else a Crash
    Test.
11. **Melting**: the card notes 1 m²/minute. The GM clears it. "Clear blast
    areas" also clears **Ice Sheet** templates, never a sustained spell's (a
    Poltergeist template goes only when its spell ends).

## Tests (Quench)
- **Environmental resistance**: stages down only; Quickness vs Body; armour
  fraction; no complete miss.
- **Ignite**:
  - the delay is 2 turns at 5 and at 9 successes and 1 at 10; ≤ Body fails;
  - boundary ticks: ignition, then Power F, F+1, …; burnout after the stored
    1D6, with the last turn resisted;
  - interrupted after `pendingTick`: resumes with no second card and no
    rerolled burnout;
  - binding at combat start gives no double or lost tick; a round-number
    edit adds no ticks; GM catch-up follows `boundarySeq`;
  - an Extinguish during a pending tick is not undone;
  - burn-card keys stay unique across a manual → combat switch;
  - Extinguish;
  - an unlinked token actor burns separately;
  - a non-GM caster goes through a request.
- **Poltergeist**:
  - a failed cast places nothing; a recast ends the old instance; a player's
    drop goes through the GM cleanup request;
  - template removal across scenes, even with duplicate spell names;
  - the visibility preset for the attacker inside, the target inside, and a
    line through the area; smoke still works;
  - occupants recomputed per boundary: a leaver is not hit, an entrant is;
    a missed boundary is noted, not replayed;
  - only its timing combat's boundaries count; a vehicle gets a note.
- **Ice Sheet**:
  - a failed cast places nothing; a success places the right square;
  - a player's waypoint move crossing the sheet gets exactly one card on the
    GM, with the limiter off and on; a direct update across it uses the fallback segment;
    moving elsewhere gets none.

## Out of scope
Ammo cook-off automation; vehicle Handling/Crash rolls (card note only); melting
automation.

## Implementation notes (built)
- **Ice crossing uses V13's `moveToken` hook**: it fires on every client after
  the update, with the movement's origin and passed waypoints. The active GM
  consumes it once per movement id and template, so no path has to travel in
  the operation options and no initiating-client capture is needed. A direct
  `update({x, y})` is a movement too (method "api").
- A pending burn tick overtaken by a rebind or Extinguish (its version is
  stale) is discarded on the next tick. Its `tickId` stays used, so card keys
  stay unique.
- The GM-recovery pass on `ready` catches up burns only. Poltergeist is not
  replayed (§8), and the skipped-boundary note is posted at the next live
  boundary.
- Smoke now uses the same line-of-fire test as Poltergeist (attacker, target,
  or the line between).
