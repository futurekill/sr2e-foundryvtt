# Plan Review Log: VR2.0 part 7 — grid topology
Started 2026-11-04. MAX_ROUNDS=5. Plan: docs/PLAN-vr2-part7-grids.md. Reviewed phase by phase (7a first); a fresh
Codex session per round with a brief of the settled findings ([[sr2e-codex-review-cost-rules]]).

## Round 1 — Codex (fresh session, 7a only; ~117k input tokens)

- **§2 — Jackpoint entry bypasses logon.** `startSession()` seeds `hostUuid` from `sessionHost()`. Treating jackpoint-created sessions as already “on” that place admits the decker without the required LTG/Host test. **Fix:** Under topology, start at a hostless jackpoint; enter its wired place only after successful logon.

- **§2 — Logon metadata misses existing-session paths.** `sessionFor()` returns immediately for the same target and adopts a hostless session without constructing a new one. Passing `logon` only into “the new session” misses first attempts and retries; a retry can retain the previous card. **Fix:** Explicitly initialize/update the attempt record on every logon, including both fast paths.

- **§2 — Deleting a Karma-corrected card reverses entry.** A failed roll stores `logon.ok = false`; Karma subsequently makes the live card successful. Deleting that card restores the original failure, contradicting the promised behavior. **Fix:** Persist the latest adjudicated verdict whenever the card’s verdict changes.

- **§§2–3 — The navigation model has no return-to-grid action.** From a host on RTG R’s LTG L, Logon to LTG L is forbidden by “as from G”; grid-only operations are also forbidden from the host. Likewise, a host on PLTG P cannot enter P itself. **Fix:** Provide the quoted open-access disconnection back to the attached grid without ending the connection or inventing a logon test.

- **§§2–4 — Queue boundaries can lose completed tests.** `vr2SystemTest()` releases the session queue before rolling/posting; `applyTallyEvent()` discards events whose session is no longer live. Overlapping actions from the same driver can switch sessions before the first card arrives, losing its tally and verdict. Merely putting admission inside the queue does not fix this; wrapping existing queued helpers inside it risks deadlock. **Fix:** Serialize the full operation with non-enqueuing internal helpers, or persist attempts/events independently of the live session.

- **§4 — Same-scope switches can seed stale tallies.** LTG A has tally 5 while its ledger still says 2; constructing LTG B’s session from that ledger before saving A installs tally 2. Atomic writing alone does not determine the correct seed. **Fix:** Prefer the outgoing live tally when source and destination share a scope.

- **§4 — Session replacement is currently two writes.** `replaceSessions()` deletes the live session, then installs its replacement. Adding the ledger only to the installation update still leaves a failure window where the outgoing tally has vanished. **Fix:** Explicitly redesign replacement as one atomic update that removes obsolete session fields and preserves the outgoing scope.

- **§4 — Failed-attempt expiry is bypassed by ordinary retries.** Retrying the same LTG reuses its live session, so “new session” expiry checks never run. Conversely, disconnecting and reconnecting at the same jackpoint changes `conn` and immediately forgets the attempt, although the quoted exception requires another jackpoint. **Fix:** Check expiry on every attempt and retain failed-access memory by jackpoint and scope across reconnects.

- **§4 — PLTG carry fires early and can inflate the tally.** Applying carry when the session starts fires triggers before logon finishes. Moreover, `tallyUpdate()` applies `traceTally()`, so importing 5 points for a traced decker can import 6. **Fix:** At logon completion, import the exact inherited total through a dedicated threshold-crossing update; apply trace acceleration only to newly incurred points.

- **§5 — The claimed jackpoint snapshot is incomplete.** `sessionHost()` dereferences the current behavior; it does not snapshot wiring. The trace code similarly reads live `traceMod`. Recording only `kind` still lets edits change wiring or trace pricing mid-run. **Fix:** Snapshot wired UUID, kind, and extra trace adjustment in the connection record and consistently read them there.

- **§5 — Existing wiring changes meaning without migration.** Existing jackpoints default to `illegal`, but their existing `host` references ordinary hosts, not LTGs. Enabling topology therefore makes those wired targets invalid for the required first logon. **Fix:** Define an explicit conversion/setup path for legacy wiring; schema-filled defaults cannot identify deliberate configurations.

- **§5 — Console rounding remains unspecified.** Odd Access/Security ratings produce fractional TNs or dice counts; naming an open question does not define implementable, complete rules handling. **Fix:** Resolve and specify the applicable rounding rule before implementation.

The **§6 attack-admission claim is correct**: `HANDLERS.attack` checks connection and exit state, without comparing session and IC hosts.

VERDICT: REVISE
### Claude's response
All twelve findings were accepted. The user ruled on #12: round up.
- **#1:** under topology, the jackpoint session is hostless; the wired place is reached only by a successful logon.
- **#2:** every logon writes a fresh attempt record `{ id, from, carry }` on all three `sessionFor` paths.
- **#3:** `logon.ok` is the single source of truth. A Karma hook rewrites it, and deleting the card changes nothing.
- **#4:** a new **Disconnect to grid** action (p.14), with no test. "As from G" is dropped for hosts.
- **#5:** the whole `vr2SystemTest` runs in a per-actor `vr2op:` queue (separate from `sessionQueue`). It applies
  with topology off too, since it also fixes today's lost tally on two quick clicks.
- **#6, #7:** one atomic `replaceSessions` using v13's `==` forced replacement, with the ledger in the same update.
  The seed prefers the outgoing same-scope session's tally.
- **#8:** `forgetAt` is checked on every LTG attempt, retries included. Failed-access memory crosses a reconnect from
  the same jackpoint only.
- **#9:** the PLTG carry is applied once, when `logon.ok` first becomes true, with no trace acceleration.
- **#10:** `{ kind, wired, traceMod }` are snapshotted in `connOpen`, and `connJackpoint()` reads them everywhere.
- **#11:** legacy wiring reads through the place's grid. A warning plus a GM chat list when topology is turned on; no
  silent migration.
- **#12:** the user ruled round up.

## Round 2 — Codex (fresh session, brief + 7a; ~146k input tokens)

- **§2, R1 #5 — Cross-client races remain.** `enqueueAttack` uses a client-local `Map`; two clients controlling one decker can still overwrite sessions and lose tally events. **Fix:** Serialize operations through one authoritative executor per actor.

- **§3 — Disconnect bypasses the operation queue.** “Disconnect to grid” can replace the session while a System Test is rolling, causing its tally and logon writes to be discarded—the R1 #5 failure remains through this new action. **Fix:** Put disconnection admission and session replacement inside the same `vr2op` queue.

- **§§2–3 — Hostless Graceful Logoff has no executable path.** At the initial jackpoint or after a failed first logon, `currentPlace()` is null; non-logons must target it, but `vr2SystemTest` requires a Host actor. “Always allowed” therefore fails. **Fix:** Define a hostless logoff path that closes the connection without requiring a place or System Test.

VERDICT: REVISE

### Claude's response
- **#1 rejected.** Under the system-wide contract one person drives an actor (jackpoints.mjs header, part 3). Every
  session write today relies on that same per-client queue. The plan now says so.
- **#2 accepted.** Disconnect to grid runs in the `vr2op` queue.
- **#3 accepted.** A decker with no place has no icon loaded yet (p.28), so leaving needs no Graceful Logoff. A new
  part-3 exit trigger, `unplaced`, checked by the sequencer: no dump shock, no test, and refused under black-IC
  locks.

## Round 3 — Codex (fresh session, brief + 7a; ~111k input tokens)

No new material problems or broken fixes found in 7a. The queued disconnect and sequencer-validated `unplaced` exit address the outstanding findings.

VERDICT: APPROVED

**7a APPROVED in round 3.** 7b (grid trace, dump-on-locate, host networks) and 7c (satellites) each need their own
detailed section and review before code.

## Code round 1 — Codex (fresh session, full 7a diff 2403ce1; ~712k input tokens: it read widely)

- `module/vr2.mjs:991` — Matrix Attack still accepts any host and calls `sessionFor` without a logon, placing the decker there without successful admission. It also switches sessions outside `opQueue`, potentially dropping an overlapping System Test’s tally. **Fix:** Under topology, require the current place and serialize session-changing attack work with operations.

- `module/vr2.mjs:260` — After failing LTG A, waiting past `forgetAt`, then attempting LTG B under the same RTG, the outgoing-scope seed preserves A’s expired tally. Expiry is checked only on same-target retries. **Fix:** Apply failed-access expiry before seeding every LTG attempt, including same-scope switches.

- `module/vr2.mjs:338` — Successfully enter an RTG, then fail entry to one of its LTGs: the failure puts an expiry on the entire already-established public tally. Retrying after expiry resets that earned tally to zero. **Fix:** Distinguish failed initial access from a failed move within an already-entered scope; only the former may expire the scope’s tally.

- `module/rules/vr2-grids.mjs:171` — An unwired device jackpoint—or one whose wired host was deleted—allows Logon to Host against **any** host, including with console bonuses. The approved rule permits only its controlling host. **Fix:** Require a valid wired host matching the target for device kinds.

- `templates/actor/parts/actor-matrix.hbs:114` — Known-address checkboxes never save: the sheet’s change handlers exclude `flags.*`, and `_prepareSubmitData()` returns `{}`. **Fix:** Add an explicit change handler that persists `flags.sr2e.vr2Known.<id>`.

- `templates/actor/host-sheet.hbs:75` — Selecting “—” sends `system.grid: ""`; Foundry’s `DocumentUUIDField` permits `null`, not blank strings. Clearing an attachment therefore fails validation. **Fix:** Convert the empty selection to `null` before updating.

- `module/data/actor-data.mjs:2421` — Rating shifts remain active with topology disabled, contrary to the promised inert fields. Even a zero shift now clamps previously valid zero subsystem ratings to one. **Fix:** Preserve the original getters outside the enabled topology/variable-LTG rules.

VERDICT: REVISE

### Claude's response (fix 76cb349)
- **#1 accepted.** Under topology, Matrix Attack works only where the decker is. Its `sessionFor` now runs behind
  the op queue.
- **#2 accepted.** `seedTally` drops an outgoing same-scope tally once its `forgetAt` has passed.
- **#3 accepted.** Only a failed FIRST access is remembered: a logon whose `from` is already in the target's scope
  sets no `forgetAt`.
- **#4 accepted.** A device jackpoint reaches only its wired host. An unwired one, or one wired to a deleted host,
  reaches nothing.
- **#5 accepted.** The sheet's change handler now saves `flags.sr2e.*` inputs. That also fixes the GM tally box,
  which never saved before.
- **#6 rejected.** Tested live: `update({"system.grid": ""})` stores `null` with no error.
- **#7 accepted.** The shift applies only when non-zero and with variable LTG ratings on, so a 0 subsystem stays 0.

Tests: Vitest +3 assertions, and the Quench check for #3. sr2e.vr2-grids passes 10/10.

## Code round 2 — Codex (fresh session, fix 76cb349 + callers; ~152k input tokens)

- `module/vr2.mjs:994–999` — Location validation runs before `opQueue`. While a logon A→B is pending, an attack against A passes validation; after successful entry to B, queued `sessionFor(A)` silently moves the decker back without logon. **Fix:** Validate location inside the queued callback before calling `sessionFor`, and abort the attack on rejection.

- `module/vr2.mjs:341` — Enter LTG L, accumulate public tally, enter PLTG P, then fail returning to L: the different source scope causes the already-earned public tally to expire. **Fix:** Track successful scope entry for the connection and allow failed-access expiry only for scopes never entered.

The other fixes hold on inspection.

VERDICT: REVISE

### Claude's response (fix b0bdebb)
- **#1 accepted.** The place check moved inside the op-queue callback.
- **#2 accepted.** `flags.sr2e.vr2Entered.<scope> = conn` is written when a logon succeeds and on Disconnect to grid.
  Failed-access memory applies only to a scope that hasn't been entered this connection. The Quench test covers the
  return from a PLTG.

## Code round 3 — Codex (fresh session, fix only; ~95k input tokens)

- `module/vr2.mjs:361` — Disconnect marks the scope entered but retains its failed-access expiry. Fail entry to LTG B from a PLTG, reach a host attached to B through host links, then disconnect to B: its inherited `forgetAt` still expires earned tally. **Fix:** Clear both session and ledger `forgetAt` when recording successful grid entry.

The queued attack place check holds.

VERDICT: REVISE

### Claude's response (fix de34570)
- **#1 accepted.** Disconnect to grid clears the session's and the ledger's `forgetAt` along with the entered marker.

## Code round 4 — Codex (fresh session, fix only; ~56k input tokens)

No new findings. The fix clears both session and ledger `forgetAt` when marking the grid scope entered, addressing Code round 3’s failure.

VERDICT: APPROVED

**7a code APPROVED in round 4.**

# Part 7b

User rulings before review (2026-11-04):
- Redirect Datatrail's opposing TN is the literal DF − the jackpoint's trace modifier.
- Network moves count as a Graceful Logoff in both directions.

## 7b Round 1 — Codex (fresh session, 7b only, named code locations; ~106k input tokens)

- **§§2,4 — Moves are not ordered with ticks.** Replicated flags can still show P when the GM ticks; a final tick completes the trace before `moved`, after which reconciliation exempts it. A quick departure and return can also erase evidence of leaving. **Fix:** sequence durable, connection-bound move records with ticks and reconcile each transition exactly once.

- **§2 — Failed logons discard suppression.** `newSession` installs the destination session before the verdict; a failed cross-scope attempt therefore drops P’s suppressions while `currentPlace` still returns P. **Fix:** retain suppression by connection/scope and clear it only on successful departure.

- **§§2,4 — Dead frozen traces still cost Detection Factor.** `traceState` preserves `frozen` after `traceDead`, and the fold’s `frozenCount` excludes complete traces but not dead ones. **Fix:** exclude dead traces from `frozenCount`.

- **§§1,4 — The fold drops the proposed `place`.** Adding it only to the trace fact leaves `f.live.traces` without it, defeating frozen-origin classification and P-specific TN filtering. **Fix:** propagate `place` through `traceState`, with the stated legacy fallback.

- **§4 — Track can be penalized or killed as Trace IC.** The existing `tracing` expression includes Tracks; the proposed network cleanup says “every incomplete trace” despite §1 promising never to touch Track. **Fix:** explicitly exclude `track` from network TN and cleanup predicates.

- **§4 — Network cleanup lacks durable validation.** `request()` generates a fresh ID each time; `{ network: true, from: P }` neither identifies the successful logon nor proves its connection. Delayed or duplicate requests can kill a later trace on P. **Fix:** bind cleanup to a persisted successful logon ID and connection, validate its endpoints, and affect only traces predating that departure.

- **§6 — Tests omit the critical interleavings.** The proposed boundary test does not cover stale GM flags, departure-and-return before reconciliation, failed-logon suppression loss, or frozen-trace cleanup. **Fix:** add those cases plus duplicate/delayed network requests and Track exclusion.

VERDICT: REVISE

### Claude's response
All seven findings were accepted.
- **#1, #6:** the `moved` request is gone. Each place change writes a durable move entry in the same update.
  `syncMoves` sequences them into `move` facts before every pass, tick and new trace. The fold ends a trace
  purely, at the first qualifying move after its start, so a departure followed by a return still counts.
- **#2:** suppressions ride in the ledger entry and are restored by the tally's seed rule.
- **#3:** `frozenCount` excludes dead traces.
- **#4:** `place`, `scope` and `grid` are on the trace fact and returned by `traceState`.
- **#5:** Tracks are excluded from the network TN, the cleanup, and the Graceful Logoff `tracing` term.
- **#7:** the tests now cover these interleavings.

## 7b Round 2 — Codex (fresh session, brief; ~89k input tokens)

- **§2 — Broken ordering fix:** `tickTraces` awaits reconciliation and individual tick writes after its initial `syncMoves`. A move arriving during those awaits can receive a later seq than the completing tick, permanently preserving the trace. **Fix:** serialize move acceptance with tick writes, and test a move arriving during an active tick pass.

- **§2 — Broken suppression fix:** After a failed cross-scope logon, `currentPlace` remains P but the live session belongs to the destination. Restoring P’s suppressions only on return still removes their Detection Factor cost while the decker remains on P. **Fix:** resolve active suppressions from the current place’s connection/scope, including its ledger entry.

VERDICT: REVISE

### Claude's response
- **#1 accepted in part.** `syncMoves` also runs right before each tick fact. The sequencer's seq is the definition
  of order: a move it sees only after a tick came after that boundary, as with part 3's ticks and crashes.
- **#2 accepted.** Detection Factor reads the current place's suppressions (`placeSuppressed`): the live session's
  when it is the current place's, else that place's ledger entry. Suppress and release refuse when the session isn't
  the current place's.

## 7b Round 3 — Codex (fresh session, brief; ~181k input tokens)

- **§3 — Dump shock uses the wrong place after a failed logon.** The decker remains on governing grid P, so `gridDump` passes, but `exitHost()` reads the attempted destination’s session and calculates shock from that destination. **Fix:** capture `currentPlace(actor)` when accepting `gridDump` and use it for that exit’s dump shock.

VERDICT: REVISE

### Claude's response
- **#1 accepted, and generalised.** Under topology, every `exitOpen` records `place` (`currentPlace` when it
  opens). The dump-shock step reads it before `exitHost`, so any dump after a failed logon comes from where the
  decker really was.

## 7b Round 4 — Codex (fresh session, brief; ~61k input tokens)

No broken fix or new material problem found in §7b against the specified exit paths.

VERDICT: APPROVED

**7b APPROVED in round 4.** 7c (satellites) still needs its own detailed section and review.
