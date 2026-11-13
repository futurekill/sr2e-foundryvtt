# Plan: Spirit services — fighting, running out, and the 24-hour rule (SR2E p.139–142)
_Round 4 (final) — Round 2 plus the Codex R3 and R4 amendments at the end_

## Rules (verified on the rendered pages p.139–142)
- **p.139 / p.140**:
  - Each Conjuring success is one service.
  - A nature spirit performs a service by using a power. Continual use of one
    power is one service.
  - "Having a spirit use **combat powers** on behalf of its summoner only
    counts as **one service**, regardless of the number of foes."
- **p.141**:
  - An elemental that owes services is **bound**.
  - At summoning it "then departs, through astral space … until called."
  - Calling costs no service; sending it away costs no service.
  - "If a period of **twenty-four hours** passes during which the elemental
    is just hanging around, or even if it is performing a service, this uses
    up an additional service."
  - Elementals perform one service at a time.
- **p.142**: each power use is a separate service, "unless it is an attack
  against a group of foes. Such an attack constitutes a single service."

## Principles
- **Services stay a plain stored counter**, changed only by an explicit
  user action. Nothing is written on a timer or by a GM hook.
- Every spend runs through **one helper**, `spendService(spirit, n, extra)`,
  in a per-spirit local queue (`enqueueAttack("svc:" + uuid)`). It reads fresh
  state inside the step and writes the counter plus any flags in ONE update.
  - Users: `useSpiritPower`, Fight for me, the sheet −/+, and Charge days.
  - The elemental transitions keep their existing planner updates.
- **Paying starts a service; continuing and cleaning up are free**, even at 0
  services: a paid fight, a running aid or sustain, Stand down, handing a
  spell back, and finishing an expiry.
- Accepted limit: two people driving the same spirit at the same instant from
  two clients is Foundry last-write-wins, like any field. No automatic writer
  exists to race with.

## Design
1. **Status, derived, with precedence** (first match wins):
   1. `departed` (`flags.sr2e.departed`, nature expiry);
   2. `uncontrolled` (no `conjurerUuid`);
   3. `engaged` (fighting, aid, sustain or a pending expiry: a paid service
      still running);
   4. `bondEnded` (0 services);
   5. `bound`.

   The sheet shows it. At bondEnded it says: "owes no more services — no
   longer bound, it departs (p.141); the GM removes it." `boundElementals`,
   `elementalHolderOf` and the sustain countdown stay relationship-based
   (unchanged). `conjuringLimit` is unchanged (it already counts services
   > 0).
2. **Fight for me** (both kinds; bound or engaged spirits):
   - It spends one service and sets `flags.sr2e.fighting = true` in the same
     update.
   - It is **idempotent**: already fighting means no charge.
   - It is refused at 0 services (a new service) and while the elemental is
     busy with aid or sustain (one service at a time).
   - **Stand down** clears the flag (free).

   `_elementalBusyReason` treats fighting as a running service, so aid and
   sustain need Stand down first.
   - **Attacks**: a bound or bondEnded spirit attacks only while `fighting`;
     then it's free, even at 0 (the fight was paid). Otherwise it is refused
     with a hint. An uncontrolled spirit attacks freely; a departed one never.
     All existing validity checks run first.
   - **Combat powers while fighting**: `useSpiritPower`, when the spirit is
     fighting, asks "Part of the fight (no new service)" or "A new service",
     because whether a power is a combat use is the GM's call.
3. **Running out.** When a spend lands on 0 services, the spending client
   posts a note to the owner and the GM, adding "after its current service"
   if it is engaged. A refused new service is an ordinary warning. No
   automatic deletion and no Dismiss.
4. **The 24-hour rule — GM-assisted** (elementals).
   - `flags.sr2e.presentSince` (world seconds; absent = away).
   - **Call** (free, p.141) sets it to now if absent; repeating it does
     nothing. Call also places the token if none is on the current scene.
     Call never restores Force: the paid **Re-call** stays as is, and it also
     sets presence.
   - Starting aid, sustain or a fight sets presence if absent.
   - **Send away** (free) is refused while engaged. It clears presence and
     removes the elemental's tokens on the current scene, where the user may
     (otherwise it says to ask the GM).
   - The sheet shows **"present N full days — each costs a service (p.141)"**
     from a pure `daysPresent(presentSince, now, dayLength)`, which floors at
     0 so a rewind shows 0.
   - A **Charge N days** button (owner/GM) spends N via `spendService` and
     advances `presentSince` by N days in the same update. It never
     double-charges, because the clock moves with the charge.
   - Open spirit sheets re-render on `updateWorldTime` (read-only).
   - **Summoning**: a bound elemental starts away (p.141) and gets no token;
     the card says "Call it to serve." Uncontrolled elementals and nature
     spirits are placed as today.
   - Legacy elementals have no flag and read as away. One already running aid
     or sustain gets presence when its owner next acts. The sheet says
     "present since unknown" when it is engaged and has no flag.
5. **Nature spirits**: the sheet hint now says continuing one power, or one
   fight, is a single service. The + button refunds (via `spendService` with
   n = −1).

## Tests
- Unit: `daysPresent` covers exactly 24 h, 47 h, absent, and a rewind.
  Status precedence covers all five cases.
- Quench (fixtures "Quench Svc"):
  - Fight for me costs 1; a repeat costs 0. Attacks while fighting cost 0,
    including after the last service went to the fight (0 left). After
    Stand down, an attack is refused.
  - An uncontrolled spirit attacks with 0 services; a departed one is
    refused.
  - Fighting blocks starting aid until Stand down.
  - A power while fighting offers "part of the fight" (0) vs "new service"
    (1).
  - Spending the last service posts the note; mid-sustain it says "after its
    current service"; a sustain at 0 keeps counting down and can be handed
    back.
  - A bound elemental summoned gets no token. Call places one and sets
    presence; Call again doesn't reset it.
  - With presence 49 h ago, the sheet shows 2 days; Charge spends 2 and
    moves presence +48 h; the sheet then shows 0.
  - Send away while sustaining is refused; afterwards it clears presence.
  - A rewind shows 0 days.
  - Two queued spends on one client both land.

## Out of scope
Automatic 24-hour charging; remote service; binding an elemental to a spell
for Force days; classifying which powers are combat uses (the GM chooses).

## Round 3 amendments (Codex R3, all accepted)
- **Queue**:
  - `elementalTransition` runs inside the same per-spirit queue
    (`svc:` + uuid) as `spendService`, replacing its separate IN_FLIGHT check
    for the spirit key; the spell-key guard stays.
  - A shared post-commit `afterSpend(spirit, before, after)` posts the
    running-out note for every path, the elemental transitions included.
  - No queued step calls another queued step for the same spirit (no
    re-entrancy).
- **Exclusivity**:
  - Fighting blocks **aid and startSustain inside `elementalTransition`**
    ("Stand down first").
  - `_elementalBusyReason` is unchanged, so fight attacks and combat powers
    still work while fighting.
  - For an elemental, the "A new service" choice while fighting is not
    offered: Stand down first.
  - A nature spirit may start a new power service while fighting (it isn't
    limited to one at a time).
- **Charge days**:
  - The button carries no count. Inside the queue it recomputes the days
    from fresh `presentSince` and the current world time.
  - Nothing is owed, or the elemental is not present: a no-op message.
  - Otherwise it subtracts `min(days, services)` (saturating at 0) and
    advances `presentSince` by **all** elapsed days.
  - A double click charges once.
- **Send away** charges the owed days first (the same saturating step), then
  clears presence, all in one queued update. The services are owed by the
  rule; the GM refunds with + if they choose to waive them.
- **Zero-service combat power while fighting**: the continuation check
  ("part of the fight") runs before the affordability check. Ownership,
  departure, depletion and busy checks still run first.
- **Presence**:
  - Starting an elemental power service sets presence if absent.
  - **Every Force-depletion transition clears presence**: the planner updates
    that set `depleted` also unset `flags.sr2e.presentSince`.
  - Paid Re-call sets presence.
- **Call guards**: refused for departed, bondEnded-and-idle, and depleted
  elementals (a depleted bound one is directed to the paid Re-call).
- **Authorization**: every handler (Fight, Stand down, Call, Send away,
  Charge, attack, power, sheet ±) checks `spirit.isOwner` and the current
  status at execution time, including zero-cost and already-active branches.
- Added tests:
  - double-clicked Charge charges once;
  - 3 days owed with 1 service → 0 services, presence +72 h;
  - a combat power using the fight after the last service went to Fight;
  - Send away at 49 h charges 2, then clears;
  - Call refused when depleted (→ Re-call), bondEnded, or departed;
  - fighting blocks aid inside the transition;
  - depletion clears presence.

## Round 4 amendments (Codex R4, all accepted)
- **Every service-starting transition** refuses while fighting: `startAid`
  (Spell Defense aid), `aid`, `aidStudy` (learning), `startSustain` and
  `recall`. It is enforced inside `elementalTransition`, with a Quench case
  per entry point.
- **Depletion** is detected from the planned result, not a field: after
  planning, if `force − resulting forceUsed ≤ 0` (covering `aid`,
  `sustainTurn` and `combatBoundary`), the same update first **charges the
  owed full days** (the saturating Charge step) and then unsets
  `flags.sr2e.presentSince`. Debt is never erased.

## Implementation notes (built)
- `elementalTransition` still rejects a duplicate in-flight submission for the
  same spirit (a double click spends Force once), and runs on the shared
  `svc:` queue.
- Token work (Call's placement, Send away's removal) runs on a separate
  per-spirit `place:` queue, so a click-to-place prompt never holds up a
  spend. `tokensOf` (placement.mjs) is the one definition of "this spirit's
  tokens": a synthetic spirit's own token, or a world spirit's linked tokens
  plus unlinked copies with an empty delta.
- Send away removes the elemental's tokens on every scene.
