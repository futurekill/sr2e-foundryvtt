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
