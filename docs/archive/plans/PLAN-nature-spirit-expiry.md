# Plan: Nature spirits vanish at sunrise and sunset (SR2E p.139)
_Round 9 — revised after Codex R8 (detached survivors re-flagged); R7 (summoned-token reconcile moved to the GM); R6 (binding race removed by design; convergence and idempotency fixes)_

## Goal
p.139 (rendered): "Nature spirits vanish at sunrise and sunset, no matter what, and
regardless of whether or not the sun is actually visible. All services end at
that time. Any services left unused or unspecified by that time are lost."
Today the summon card only mentions it; the spirit stays forever.

## Approach
1. **Who departs, "no matter what"**: every nature spirit, whatever its binding
   or services (zero-service spirits too). An actor already marked
   `flags.sr2e.departed` is excluded **only when its departure is complete**:
   no token of it is left on any scene **and** either retention is on
   (`natureSpiritDepartDelete` off) or the actor is gone. A marked, tokenless
   actor with deletion on is retried, so a run interrupted between the last
   token and the actor deletion converges. A marked actor with tokens left is a
   candidate again, so a run interrupted after marking is finished by the next
   run. The candidates are snapshotted
   **synchronously** when the event is accepted, before any `await`:
   - **world actors** of type `spirit` with `spiritType === "nature"`;
   - **unlinked tokens** on any scene whose *snapshotted effective* actor is a
     nature spirit, identified by the token's own uuid. A world actor's
     processing never touches unlinked tokens: each unlinked instance is judged
     by its own effective classification, so an unlinked token whose delta made
     it an elemental is left alone.
2. **No journal; reruns converge.** The rule's state is the world itself, so a
   run that is interrupted (GM disconnect, a failed write) is finished simply by
   running again (the GM button, or the next boundary). Each run:
   1. **Marks first**: every candidate is set to `services: 0` and
      `flags.sr2e.departed = true` before anything is deleted, so placement and
      conjuring re-checks (step 4) see it at once.
   2. Deletes linked tokens of the world actors, then the unlinked candidate
      tokens.
   3. Deletes the world actors (setting `natureSpiritDepartDelete`, default
      on). With it off they stay, marked departed.
      - **A world actor that backs a surviving non-nature unlinked token** (an
        unlinked instance whose delta made it something else): before the base
        is marked, each such instance is **detached**. A new world actor is
        created from the instance's effective data (`token.actor.toObject()`),
        tagged `flags.sr2e.detachedFrom = <token uuid>`, and the token is
        re-pointed to it with its delta cleared **and, in that same token update,
        its `flags.sr2e.summonedSpirit` (if any) set to the replacement's
        uuid**, so the GM reconcile never mistakes the survivor for the
        departed spirit's token. **Idempotent**: a retry first
        looks for an actor already tagged with that token uuid and reuses it,
        so an interruption between create and re-point leaves no orphan. The original
        nature spirit then expires normally.
   4. **No binding sweep.** The GM never writes a conjurer's `boundSpirits`.
      The only writers are the conjurer's own flows (conjuring's append,
      banish/release), which run on the owner's client. So there is no second
      writer and nothing to race. A departed or deleted spirit's uuid may linger
      in the list, and it is harmless:
      - **Every reader goes through one helper**, `liveBoundSpirits(actor)` →
        the resolved spirit actors, minus those that don't resolve and those
        flagged `departed`. It is used by the conjuring limits
        (`conjuringLimit`), the sheet's spirit list, `boundElementals`, and the
        elemental binding check.
      - **Owner-side pruning**: each owner write (the conjuring append, a
        banish) writes `live entries (+ the new one)`, so dead uuids leave the
        list at the conjurer's next write.
      - **One mutation path**: `mutateBindings(conjurer, fn)` runs in a
        per-conjurer local queue (`enqueueAttack("bind:" + uuid)`) and reads
        `conjurer.system.boundSpirits` **inside** the queued step, after every
        await, immediately before `update`. Conjuring's append and banish both
        use it; banish no longer captures the array before its awaits.
        Two people editing the same conjurer at the same instant from two
        clients is ordinary Foundry last-write-wins for any field, not an
        expiry race, and is out of scope.
      - A conjuring whose spirit departs between creation and the append leaves
        a dead entry, which is filtered the same way.
3. **One executor**: `natureSpiritsDepart()` runs only on the **active GM** and
   re-checks that before each write. Runs are serialised in one local queue.
   Each run posts one card listing what **it** confirmed. A rerun after an
   interruption posts its own card for what it finished, which is honest, not
   a duplicate.
4. **Races with summoning**: `placeSummonedToken` re-resolves the spirit just
   before creating its token and refuses a missing or departed one. That
   check and the create are not atomic, so every summoned token carries
   `flags.sr2e.summonedSpirit = <spirit actor uuid>`, persisted with the
   token. The **active GM** reconciles on `createToken` and at the start of
   every run: a token whose `summonedSpirit` is missing or departed is
   deleted. No client has to stay connected, and a token whose source actor
   is already gone is still found by its own flag. A spirit
   summoned after the snapshot is not a candidate, so it survives the run.
5. **Time trigger** (setting `natureSpiritExpiry`, default **off**):
   - Hook `updateWorldTime(worldTime, dt)`.
   - `dt <= 0` (a rewind) does nothing, and nothing is resurrected.
   - Otherwise, if any sunrise or sunset lies in the half-open interval
     `(worldTime − dt, worldTime]`, the active GM runs **once** for this
     update, with the snapshot taken synchronously in the hook. Several
     boundaries in one jump still mean one run.
   - **Boundaries** come from Foundry's own calendar
     (`game.time.calendar` / `game.time.components`, V13 GameTime): hour
     `sunriseHour` (default 6) and `sunsetHour` (default 18), two world
     settings, on every day. Calendaria is used only if it exposes a
     sunrise/sunset API, through a guarded optional lookup. When it is absent
     or throws, the core calendar and fixed hours apply.
   - The same scheduler function gives the summon card's "vanishes at …" note,
     shown only when the setting is on.
6. **Manual**: a scene-controls button (GM), "Sunrise / Sunset — nature spirits
   depart", and the API `game.sr2e.natureSpiritsDepart()`.
7. **Tests**:
   - Unit: boundary detection for exact arrival at 06:00, an interval ending
     just before, a multi-day jump (one run), `dt <= 0`, and custom hours.
   - Quench:
     - A bound nature spirit with tokens on the active scene and an inactive
       scene: tokens gone, actor deleted; the conjurer's raw `boundSpirits`
       is unchanged, and `liveBoundSpirits` no longer returns it.
     - An orphaned nature spirit and a zero-service one go.
     - An unlinked nature-spirit token goes.
     - A conjurer (world or unlinked token) whose spirit departed: the limit
       lets them summon again, and the sheet no longer lists it; their
       `boundSpirits` is untouched by the run and pruned at their next summon.
     - Elementals are untouched.
     - Convergence: interrupting a run right after marking (tokens still
       present), and between two scenes' deletions, with deletion on and off:
       the next run removes every eligible token.
     - A base actor backing an elemental-by-delta unlinked token: that token
       is re-pointed to a detached actor carrying its effective (elemental)
       data, and the nature base expires. Interrupted after the detached
       actor's creation: a rerun reuses it (one detached actor, not two).
       A flagged (summoned) survivor stays through two expiry runs.
     - A summon during a run: the new spirit's binding survives (the run never
       writes bindings).
     - A retained departed spirit is not reported again.
     - Two unlinked copies of one spirit both go.
     - An unlinked token made into an elemental by its delta stays.
     - A spirit summoned after the snapshot survives the run.
     - A conjuring whose spirit departs before the binding is written: the
       dead entry is filtered by every reader.
     - A pending placement for a departed spirit creates no token.
     - The setting off plus crossing 18:00: nothing happens. On: one run.
       A rewind: nothing.
     - A non-GM call is refused.
     - Deletion on, interrupted after the last token but before the actor
       delete: the next run deletes the actor.
     - A token placed for a spirit that departs between the check and the
       create is removed by the GM's createToken reconcile; one created while
       no GM is connected, for a spirit since deleted, is removed at the next
       run (found by its `summonedSpirit` flag).
     - Banish while a summon appends (same client): both land (queued, fresh
       read).
     - Calendaria absent: fixed hours are used.

## Key decisions & tradeoffs
- The automatic trigger is opt-in. Worlds that don't track time would
  otherwise lose spirits unexpectedly.
- Delete by default. The spirit is gone "no matter what", and a setting keeps
  the actor for tables that want the record.

## Out of scope
Domains (a spirit leaving its domain).

## Codex R5 #1 (the binding race) — resolved by removing the writer
R5 found that a GM sweep writing `boundSpirits` could overwrite a player's
concurrent append. There is no GM write to the bindings any more (step 2.4):
dead entries are filtered at read time and pruned by the owner's own next write.

## Deliberately not done (Codex R3 #4, #5, #7)
There is no persisted job journal and no cross-GM transaction. The rule's
outcome is fully determined by the world (every nature spirit gone, no dangling
bindings), and each run re-establishes it idempotently. An interrupted run is
finished by the next run, not resumed, so no job state can be lost.

## Implementation notes (built)
- `natureSpiritsDepart({ scope })` narrows the candidates. Quench passes a
  "Quench NS" scope, and `departTesting.scope` scopes the time trigger during
  tests. An unscoped smoke test once sent a real spirit away in the local
  world (it was recovered).
- Calendaria has no sunrise/sunset lookup here; the core calendar's
  day/hour lengths and the two hour settings are used.
- Detaching re-points the token with `{ actorId, delta: { _id }, summonedSpirit }`
  in one update, verified live: the delta is cleared and the effective data is
  kept on the new actor.
