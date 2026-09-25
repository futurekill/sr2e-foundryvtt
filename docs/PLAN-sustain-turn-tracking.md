# Plan: automatic Combat Turn countdown for sustaining elementals
_Final — redesign + amendments R2–R5 (later amendments win; D1–D3 adopted after MAX_ROUNDS, reviewed at implementation)_

## Goal
0.96.0 made the countdown for an elemental sustaining a spell manual: someone presses
"−1 Combat Turn" on the elemental's sheet. The book (p.142) says it maintains the spell "for one
Combat Turn for each point of Force it has". When the mage is in a running combat, the system
should count those turns itself, exactly once per Combat Turn. The manual button stays for time
outside combat and for corrections.

## Facts from the code
- `SR2ECombat` (module/documents/combat.mjs): **Foundry round = SR2 Combat Turn**.
  `nextRound()` does `update({ round: round + 1 })` and re-rolls initiative. `previousRound()` is
  already **disabled** ("Initiative re-rolls each Combat Turn"). A GM can still set `round`
  directly through a combat update.
- Existing combat automation is GM-gated (`_resetCombatRecoil`: `if (!game.user.isGM) return`,
  on the `combatRound` / `combatTurn` hooks).
- 0.96.0 state on SpiritData: `service`, `forceUsed`, `sustainingSpellUuid`,
  `pendingExpireSpellUuid`, plus derived `effectiveForce` / `depleted`. The one executor is
  `elementalTransition(spirit, "sustainTurn", { n })`, which already ends the spell at 0
  (recoverable pending expiry).

## Rules
- p.142: one Combat Turn of sustaining per point of Force; at 0 it disappears and the spell ends.
- A Combat Turn is the whole initiative cycle (p.78), so the count happens when a Combat Turn
  **ends**: the transition from round r to round r+1. Starting a combat (round 0 → 1) ends
  nothing.

## REDESIGN (authoritative; replaces §Approach 1–9 below, which are kept for the record)
**Count inside the round advance itself, not from hooks.** `SR2ECombat.nextRound()` is the only
normal way a Combat Turn ends (the tracker's Next Round button, and `nextTurn()` when nobody is
left above 0). The countdown runs **inside `nextRound()`, awaited, BEFORE
`update({ round: round + 1 })`**, on the client that is advancing the round.
- **One writer per advance.** The initiator executes, so there is no election and no hook
  replay: one call means one Combat Turn has ended.
- **Starting a combat charges nothing:** `startCombat` does not call `nextRound`.
- **Direct edits to the round number are administrative:** they never pass through `nextRound`,
  so they charge nothing and refund nothing (Codex 8). `previousRound` is already disabled.
- **The expiry is a barrier:** it completes before the new Combat Turn's initiative is rolled
  (Codex 7).

**Who is charged:**
- Every character combatant of THIS combat (`combatant.actor`, the exact document, linked or
  synthetic).
- For each such mage, `boundElementals(mage)` (their own bound elementals, resolved from their
  `boundSpirits`) with `service === "sustain"` and `sustainingSpellUuid` naming a spell on THAT
  actor (Codex 9).
- Each distinct spirit is charged at most once per `nextRound`: dedupe by uuid in case the mage
  appears as two combatants.

**The turn in which a sustain begins is free (interpretation, flagged to the user):**
- p.142: "one Combat Turn for each point of Force it has". A Force-3 elemental therefore holds the
  spell for 3 FULL Combat Turns. The partial turn in which it took the spell over is not charged,
  so a Force-1 elemental assigned on the last action does not vanish at the very next boundary
  (Codex 2).
- Implemented with the only new schema: `sustainStartedCombatId` + `sustainStartedRound` on
  SpiritData, written by `startSustain` (unconditionally: set when the mage is a combatant of a
  started combat, cleared otherwise).
- `nextRound` skips the charge once when `sustainStartedCombatId === this.id &&
  sustainStartedRound === this.round`, then clears the pair in the same transition.
- A mage who **joins** a combat already sustaining is charged at the first boundary they are
  present for. Their sustain was running before the combat, so that time was either charged
  manually or is the GM's call (Codex 3, documented).

**Charging:** `elementalTransition(spirit, "sustainTurn", { n: 1 }, { quiet: true })`, the same
executor, so expiry and pending recovery are unchanged.
- The lock returns `busy` only if the same spirit has a transition in flight on the initiator's
  client at that instant (a simultaneous manual click on the same machine). In that case, and on
  any refusal or permission failure, nothing is retried silently: the initiator posts a whisper
  to the GMs and the spirit's owners: "<Elemental>: a Combat Turn ended but could not be counted
  automatically — press −1 Combat Turn" (Codex 6 and 11: explicit manual fallback, no hidden
  catch-up).
- **Permissions:**
  - Before charging, the initiator must be able to update the spirit and, for expiry, the caster
    (`spirit.isOwner && caster.isOwner`). A GM always can.
  - A player advancing the round (their `nextTurn` running out the Combat Turn) who does not own
    that mage's elemental gets the whisper fallback instead.
  - A pending expiry left by a failed cleanup keeps the existing recovery: the Finish button and
    the recast block.
- One whisper per charged spirit: "Earth elemental: 2 Combat Turns left sustaining Armor", or the
  expiry message.

**Manual button:** unchanged ("−1 Combat Turn"). There are no automatic markers to fall out of
sync, so manual and automatic charges simply add up (Codex 12). Its hint becomes "counted
automatically when the combat's round advances; use this for time outside combat or to
correct". An accidental over-charge is corrected by editing the spirit's `forceUsed`; there is
no undo.

**Service-ending paths** (Codex 13): `takeOver`, `endService`, the expiry update,
`detachElementalHolder`, `releaseElemental` and `recall` all clear `sustainStartedCombatId` /
`sustainStartedRound`. `startSustain` sets or clears them unconditionally. These are the only two
new fields.

**Combat end** (Codex 10): nothing is attached, so there is nothing to clean up. Deleting a
combat charges nothing. The final Combat Turn of an encounter ends when the GM ends the combat,
and is charged only if the GM advances the round first, or presses −1. Documented.

**Two simultaneous combats containing the same mage** are each charged on their own
`nextRound`. This is rare, and documented.

**Tests** (Codex 14):
- Vitest: the pure `sustainChargeFor(spiritSys, { combatId, round })` returns `"free"`
  (starting turn, then clears) or `"charge"`.
- Quench, with a real SR2ECombat containing the mage and an elemental that is not a combatant:
  - `startCombat` → no charge;
  - a sustain started mid-round → the first `nextRound` is free, the second charges 1;
  - `nextRound` ×N reaching Force 0 → the spell ends BEFORE the new round's initiative;
  - a direct `combat.update({ round: 9 })` → no charge;
  - a combat without the mage → no charge;
  - two combatants of the same mage → charged once;
  - a spirit in flight (stubbed lock) → a whisper fallback and no charge;
  - a non-owner initiator (stub `isOwner` false) → a whisper and no charge;
  - deleting the combat → nothing changes.

## Round 2 amendments (supersede the REDESIGN where they conflict)
**Stated guarantee: BEST-EFFORT automation with explicit manual recovery,** not exactly-once
across clients. Exactly-once needs cross-client coordination, which this host cannot provide (no
socket relay). The CHANGELOG says so plainly.

**State (SpiritData, additive; replaces the two "started" fields):**
- `sustainCombatId`: the timing source for this sustain;
- `sustainFreePending: Boolean`: the partial starting turn is still owed as free;
- `sustainChargedRound: Number(0)`: the outgoing round last processed in the timing combat.

**One pure transition** replaces the ad-hoc charge: `planElementalTransition(sys, "combatBoundary",
{ combatId, round, timingAlive })`. `round` is the OUTGOING round; `timingAlive` is whether the
recorded timing combat still exists and is started, resolved by the caller. Evaluated in order:
1. not `service === "sustain"`, or `round < 1` → **skip**. Calling `nextRound` at round 0, or
   before start, charges nothing (Codex 6).
2. `sustainCombatId` set, ≠ this combat, and `timingAlive` → **skip**. Another combat is this
   sustain's clock (Codex 9).
3. otherwise, if `sustainCombatId` ≠ this combat → **adopt**: `sustainCombatId = combatId`,
   `sustainChargedRound = 0`, and `sustainFreePending` stays as it was.
4. `sustainChargedRound === round` → **skip**. That boundary was already processed: a retry after
   a partial failure, or a duplicate call (Codex 1 and 2, narrowed).
5. `sustainFreePending` → **free**: `{ sustainFreePending: false, sustainChargedRound: round,
   sustainCombatId }`, with no Force spent (Codex 4). The free boundary is "the first boundary
   processed after the sustain began", not a round label, so editing round numbers cannot move
   it (Codex 5).
6. otherwise → **charge**: `forceUsed + 1`, `sustainChargedRound: round`. At 0 Force it takes the
   same terminal EXPIRE path as `sustainTurn` (the pending record plus cleanup).
- The charge and the marker are ONE update (charge 6 and free 5 both); the expiry cleanup follows
  as today.

**`startSustain`** unconditionally sets:
- `sustainFreePending = mageIsCombatantOfAStartedCombat`;
- `sustainCombatId` = that combat's id, or `""`;
- `sustainChargedRound = 0`.

Every service-ending path (takeOver, endService, expiry, detachElementalHolder, releaseElemental,
recall) clears all three.

**Failure reporting** distinguishes three cases (Codex 3):
- `{ ok: false }` with nothing committed (busy, permission, a refusal) → whisper "a Combat Turn
  ended but <Elemental> could not be counted — press −1 Combat Turn once";
- charged, but the expiry cleanup failed (a pending record is set) → whisper "<Elemental>'s Force
  is spent and <spell> must end — press Finish on its sheet";
- success → whisper the turns left, or the expiry message.

The round advance **continues** in every case; combat is never blocked by an elemental.

**Concurrency and manual (Codex 2 and 7), documented residuals:**
- Two clients advancing the same boundary at the same instant, or a manual −1 racing an automatic
  charge on another client, can lose or duplicate one charge.
- Retries on one client are idempotent through `sustainChargedRound`.
- The fallback whisper says "press once — one person"; it has no claim token.

**Correction wording (Codex 8):**
- Editing `forceUsed` fixes a non-expiring over-charge.
- An expiry cannot be undone that way: the spell ended and its effects are gone. Recast it and
  start a new sustain (a new service).

**Tests (Codex 10), added:**
- Vitest: the whole `combatBoundary` table (skip, adopt, retry-skip, free, charge, expire, other
  timing combat, round 0).
- Quench:
  - fault injection: spirit A is charged, then the advance throws before the round update → a
    retried `nextRound` does not charge A again;
  - a free boundary survives a round-label edit;
  - a failed expiry cleanup → the "Finish" whisper, and the advance continues;
  - `nextRound` at round 0 → no charge;
  - an unlinked mage token → charges only that token's elementals.

## Round 3 amendments (supersede Round 2 where they conflict)
B1. **Boundaries are identified by a monotonic counter, not the round label (Codex 1).**
    - `SR2ECombat` keeps `flags.sr2e.boundarySeq` (initially 0). The boundary being processed in
      `nextRound` is `seq = boundarySeq + 1`. The combat update that advances the round writes
      `{ round: round + 1, "flags.sr2e.boundarySeq": seq }` in ONE update.
    - If advancement fails, `boundarySeq` is unchanged, so a retry processes the same `seq`, and
      the spirits already charged skip.
    - Round-label edits never touch `boundarySeq`.
    - SpiritData: `sustainChargedSeq` replaces `sustainChargedRound`. `combatBoundary` args become
      `{ combatId, seq, round, timingAlive }`, and step 1's "round < 1" test still uses the
      outgoing `round`.
B2. **Recovery is boundary-aware (Codex 2 and 3).**
    - When the automatic step fails for a spirit (busy, permission, an update error), the
      initiator whispers the owners and GMs a card carrying a **"Count this Combat Turn"** button
      with `{ spiritUuid, combatId, seq, round }`.
    - Clicking it (an owner or the GM) runs the SAME `combatBoundary` transition with those args.
      So it clears a free turn or charges Force together with `sustainChargedSeq`, idempotently:
      once processed, a click or a retried `nextRound` skips.
    - The card's text says whether that boundary is the free one or a charge.
    - The plain "−1 Combat Turn" button stays for time OUTSIDE combat and never touches the
      markers.
B3. **The timing source must still contain the mage (Codex 4).**
    - `timingAlive` is true only if the recorded combat exists, is started, and has a combatant
      whose actor IS the exact conjurer (the uuid match).
    - Otherwise the current combat adopts the sustain (step 3): no free turn, and
      `sustainChargedSeq = 0`.
    - Regression test: mage in A → leaves A (A keeps running) → joins B → B charges.
B4. **Failures are isolated per spirit (Codex 5).**
    - `nextRound` processes each spirit in its own `try/catch`.
    - `elementalTransition` wraps its `spirit.update` and returns
      `{ ok: false, outcome: "failed", committed: false }` on rejection.
    - Whisper creation is also `try/catch`: a notification failure is logged and never aborts.
    - The round update always runs after the loop.
B5. **Executor contract (Codex 6):**
    - `elementalTransition` forwards `{ n, spellUuid, combatId, seq, round, timingAlive }` to the
      planner.
    - The planner may return `{ skip: true }`, and then the executor does NOTHING (no update, no
      chat) and returns `{ ok: true, outcome: "skip" }`.
    - Other outcomes: `"free"`, `"charged"`, `"pending"` (charged, but the expiry cleanup failed)
      and `"failed"`.
    - `nextRound` whispers only for `charged` (turns left or the expiry), `pending` (press Finish)
      and `failed` (the Count button).
B6. **Tests added:**
    - manual recovery, then a retried `nextRound` → charged once;
    - a round-label edit, then a real advance → still charged once, and the free turn still free;
    - the mage moves A → B while A stays running → B charges;
    - an injected `spirit.update` rejection → the round still advances, the Count button is
      posted, and clicking it charges once;
    - a skip produces no whisper.

## Round 4 amendments — recovery cards expire (supersede B2 where they conflict)
C1. **Service instance:** `startSustain` writes `sustainInstanceId = foundry.utils.randomID()`, and
    every service-ending path clears it. Recovery cards carry `{ spiritUuid, instanceId, combatId,
    seq, round }` (Codex 2).
C2. **A recovery card is valid ONLY while its boundary is still current.** All of these must hold:
    - `spirit.sustainInstanceId === card.instanceId`;
    - `spirit.sustainCombatId === card.combatId`;
    - the combat still exists and its `flags.sr2e.boundarySeq === card.seq` (no later boundary has
      been processed);
    - `spirit.sustainChargedSeq < card.seq`.

    Only then does it run `combatBoundary` with the card's args. The state it evaluates is then
    exactly the state the failed automatic step saw (nothing processed since), so a "free" card
    stays free and a "charge" card charges (Codex 3).
C3. **Otherwise the card is expired.** Clicking it says: "this Combat Turn can no longer be
    counted automatically — correct the elemental's Force used by hand if needed". There is no
    delayed replay, no rewinding of `sustainChargedSeq`, and never an adoption of a timing source
    from a card (Codex 1 and 4: historical recovery is GM correction, not automation).
    - The next real boundary is processed normally. A missed turn stays missed unless corrected.
      Documented.
C4. **Permissions inside the executor (Codex 5).** For `combatBoundary`, from `nextRound` or a
    card, `elementalTransition` itself requires `spirit.isOwner && caster.isOwner` (the caster
    from `conjurerUuid`) before planning. A failure is `{ outcome: "failed" }` with no writes.
C5. **Tests (replace the B6 recovery cases):**
    - a card clicked while current → applies once, and a second click is expired;
    - a card after a later boundary → expired, with no Force change;
    - a card after a new sustain on the same spirit → expired;
    - a free card while current → no Force spent;
    - a card after transfer to another combat or after combat deletion → expired;
    - a non-owner of the caster → failed, with no writes.

## Round 5 amendments (adopted after the final round)
D1. **Corrections go through `sustainTurn`, never a direct Force edit.**
    - An expired card and every correction message say "press −1 Combat Turn". That is
      `sustainTurn`, which runs expiry at 0 Force.
    - Editing `forceUsed` directly is documented only for NON-expiring fixes (reducing an
      over-charge).
D2. **A missed free turn can be marked consumed.** New transition `consumeFree` (only while
    `service === "sustain"` and `sustainFreePending`) clears `sustainFreePending` without spending
    Force. It is offered on the spirit sheet ("Starting turn already passed") while the flag is
    set, and an expired free card points to it.
D3. **Recovery cards are posted only AFTER the round update commits.**
    - `nextRound` collects the per-spirit failures, performs
      `update({ round: round + 1, "flags.sr2e.boundarySeq": seq })`, and only if that succeeds
      whispers the Count cards (then their seq equals the committed `boundarySeq`, so they are
      valid until the next boundary).
    - If the combat update fails, no cards are posted. The charged spirits recorded
      `sustainChargedSeq = seq`, so retrying Next Round processes the rest and skips those
      already charged.
D4. **Tests:**
    - −1 Combat Turn as the correction reaching 0 → the spell ends;
    - `consumeFree` clears the flag and spends no Force;
    - an injected combat-update failure → no cards, and the retry charges each spirit once.

## Approach (Round 0 — superseded by the REDESIGN above)
1. **Schema (SpiritData, additive):**
   - `sustainCombatId: String("")`: the combat this countdown is attached to;
   - `sustainLastRound: Number(0)`: the last round already charged for.

   This persists exactly-once bookkeeping on the document, so replayed or duplicate hooks cannot
   double-charge.
2. **Pure rule** (sr2e-rules.mjs + Vitest):
   `sustainTicks({ sustainCombatId, sustainLastRound }, { combatId, round })` returns
   `{ ticks, update }`.
   - If the spirit is unattached, or attached to a combat that no longer exists: attach to
     `combatId` with `lastRound = round` and 0 ticks. Being first seen is not a turn ending.
   - Same combat and `round > lastRound`: ticks = `round − lastRound`, and `lastRound = round`.
     A GM jumping several rounds charges them all.
   - `round ≤ lastRound` (a rewind or a replay): 0 ticks. `lastRound` stays at its max, so
     re-advancing never double-counts.
   - A different combat while attached to a live one: 0 ticks. The first combat keeps it.
3. **Which combats count:** only a combat in which the elemental's **conjurer** is a combatant
   (`combatant.actor?.uuid === conjurerUuid`, or the same base actor for a linked token). The
   elemental itself need not be in the combat.
4. **Attach at start:** `startSustain` records `sustainCombatId` and `sustainLastRound` if the
   mage is in a started combat (`combat.started`) at that moment. Otherwise it attaches lazily at
   the first round change it sees.
5. **Trigger:** `Hooks.on("updateCombat", (combat, changes, options, userId))` when `"round"` is
   in `changes`, plus `combatStart`. Deleting a combat (`deleteCombat`) clears
   `sustainCombatId` on the elementals attached to it (the executor does this), so the next
   combat can attach.
6. **Executor: exactly one client per spirit.** Every client evaluates the same deterministic
   election and only the winner writes:
   - the active GM (`game.users.activeGM`) if there is one;
   - otherwise the first active non-GM user, by id, who **owns the spirit**;
   - otherwise nobody, and the countdown falls back to the manual button. The spirit's sheet and
     the spell row show "Turns are not being counted (no GM or owner online)".

   The same election is used for the `deleteCombat` cleanup.
7. **Per tick:** call `elementalTransition(spirit, "sustainTurn", { n: ticks }, { quiet: true })`
   and write `sustainCombatId` / `sustainLastRound` in the SAME transition. Add an optional
   bookkeeping argument to the transition, merged into its single update, so the charge and the
   marker cannot diverge.
   - Post one whisper to the spirit's owners and the GMs: "Earth elemental: 2 Combat Turns left
     sustaining Armor".
   - At 0 the existing expiry runs: the spell ends, with pending recovery.
8. **Manual button stays.** "−1 Combat Turn" still works for out-of-combat time. Its hint changes
   while attached ("counted automatically in <combat>; use this only to correct"). Manual presses
   do not touch `sustainLastRound`.
9. **Detaching:** `takeOver`, `endService`, expiry and `recall` clear `sustainCombatId` /
   `sustainLastRound`, which are meaningless without a sustain.
10. **Tests:**
    - Vitest `sustainTicks`: attach, single tick, multi-round jump, rewind or replay → 0, a
      different combat ignored, a dead combat → reattach.
    - Quench, with a real Combat: a mage combatant, and an elemental sustaining (not a
      combatant).
      - `nextRound` twice → Force −2.
      - An `updateCombat` replay with the same round → no change.
      - Round jump +3 → expires at 0.
      - A combat without the mage → no ticks.
      - Deleting the combat → detached.
      - Election: with the GM active, a stubbed non-GM client does nothing.

## Key decisions & tradeoffs
- **Count at round END (r→r+1), not at the start of a round.** Starting combat charges nothing.
  (Contestable: a spell sustained for a whole first Combat Turn is charged when that turn ends,
  which is correct under this reading.)
- **One combat owns the countdown.** A mage in two simultaneous combats (rare) is counted once,
  by the first.
- **The election is computed identically on every client.** It is not a lock. A user connecting
  or disconnecting at the exact moment of a round change could make two clients briefly disagree.
  The persisted `lastRound` narrows the effect to that race; documented.
- **No refund on rewinds.** `previousRound` is already disabled; a direct round edit downward
  charges nothing and refunds nothing.

## Out of scope
- Long-term binding by days (p.142).
- NPC mages (they have no `boundSpirits`, as in 0.96.0).
