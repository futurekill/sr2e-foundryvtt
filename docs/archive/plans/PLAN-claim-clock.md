# Plan: claim ages that survive a server restart
_Round 4 — revised after Codex r1–r4 (docs/archive/plans/PLAN-claim-clock-REVIEW-LOG.md), 2026-11-27._ Found while fixing the two failing `sr2e.shapeshifters` Quench tests.

## The bug
On Foundry 13.351 `game.time.serverTime` is the server's UPTIME: the `time` socket reply was `serverTime: 111498`
two minutes after a restart (Date.now() ≈ 1.79e12). Every claim marker stores `at: game.time.serverTime`
(module/claims.mjs `once`/`recordEvent`, programming.mjs), and every "is this claim stuck?" / TTL check computes
`serverTime − at`. After a restart:
- a marker made before it has `at` LARGER than the new `now` → a negative age → never "stuck" (and never pruned) until
  the new uptime passes the old value — hours, after a long session. A claim whose client died before the restart
  blocks its step (bleeding tick, regeneration, dose, bioware result, cybermancy op, MBW seizure) that long;
- keys built from the clock (`bleed:…:f${serverTime}` for the GM's forced Settle) can repeat a pre-restart key, so
  `once` refuses the GM's override.
The two Quench failures are this bug in miniature: the tests plant `at = serverTime − STUCK_MS − 1000`, negative on a
server up < 2 min, and shapeshift.mjs's "latest attempt" reduce treats `at ≤ 0` as absent.

## Approach
1. **One basis: the server's wall clock** (r1 #1–#3). Every marker is an ActiveEffect whose `_stats.createdTime` the
   SERVER stamps with its wall clock (`ct`, already in `markersOf`/`eventsOf`). A marker's age = `serverNow() − ct`,
   one formula for its whole life (no branch switch when uptime crosses `at`, r1 #3).
2. **`serverNow()`** (module/server-clock.mjs): this client's estimate of the server's wall clock. A SAMPLE is
   `{ wall: doc._stats.modifiedTime, mono: performance.now() }` taken when a live document change arrives (hooks:
   create/update of ActiveEffect, ChatMessage, Actor, Item, Combat, User). `serverNow()` = the max over samples of
   `wall + (performance.now() − mono)` — a MONOTONIC clock between samples, so changing the computer's clock moves
   nothing (r3 #2), and network latency only makes a sample older, so the estimate is never ahead of the server: ages
   are never overstated and a live claim is never called stuck early (r1 #1). Only LIVE samples count — never stored
   documents' old stamps (r2 #1); samples older than 10 minutes are dropped, and all are dropped when the socket
   reconnects (a server restart or a clock change). No sample → `serverNow()` is null and every age is UNKNOWN:
   neither stuck nor prunable (r1 #2). **On demand** (r3 #1): a caller about to decide "stuck?" with no sample awaits
   `freshServerNow()`, which writes a NEW random nonce to `flags.sr2e.clockPing` on the user's OWN User document (any
   user may; a fresh value every time so Foundry never skips it as unchanged — r4 #2) and samples the returned
   document's `modifiedTime` (none → the age stays unknown) — so an idle world never blocks a takeover. The claim's
   own `once` create is a sample too. Each sample also records `Date.now()`; when the wall and monotonic clocks have
   drifted apart by more than 5 s since a sample (the computer slept, r4 #1), that sample is dropped first.
3. **`claimAge(marker)`** in module/claims.mjs = `serverNow() == null || ct missing ? null : max(0, serverNow() − ct)`
   (pure core `wallAge(ct, now)` in claim-rules, Vitest). Callers treat `null` as "not stuck, keep". Every
   `serverTime − at` comparison moves to it: claims.mjs `pruneMarkers` (TTL), mbw.mjs, bioware-damage.mjs ×2,
   shapeshift.mjs, healing-clock.mjs ×3, cybermancy.mjs, combat-spells.mjs's orphan CLAIM (r1 #5).
4. **`doseHoldState(markers, exposureId, ageOf, stuckMs)`** (r1 #8): the third argument becomes an age function
   (callers pass `claimAge`); it keeps the whole selected marker; Vitest updated (an unknown age is not overridable).
5. **Non-marker stamps** (r1 #5, #9): the pending spell-resistance MESSAGE is aged by its own `_stats.createdTime`
   (`wallAge`), not its flag `at`; the VR2 backoff's `done` record is an event with `ct` → `wallAge`; `vr2IconCrash`
   has no age reader and stays as it is (a durable incarnation boundary).
6. **Durable folds** (r1 #4): MBW's and cybermancy's event order uses `ct` (server wall clock) where they use `at` —
   MBW `(ct, key)`, cybermancy `(wt, ct, key)`; every recorded event is an ActiveEffect, so every one has `ct`.
7. **Successor keys from key numbers, never counts, ages or clocks** (r1 #6, #7, r2 #2): regeneration takeovers,
   cybermancy attempts and bleeding retries find the HIGHEST-numbered existing attempt (the original claim = 0), and
   only when THAT attempt's age is ≥ STUCK_MS claim number + 1, then re-check their fence (cursor / op state) after
   winning. The GM's forced Settle uses the same sequence (it skips only the age test), so forced and automatic
   attempts can never both win.
   A Quench integration case asserts a directly created marker has a non-null `ct` within a second of `serverNow()`
   (Foundry 13 documents `createdTime` as nullable; markers are always created by a direct
   `createEmbeddedDocuments`, never inside a parent's create).
8. **Tests:** Vitest for `wallAge` and `doseHoldState` (unknown age); `serverNow` sampling (max wins, null before a
   sample) as pure logic with injected samples; the two shapeshifter Quench tests plant markers by `ct` (they can't set
   `_stats.createdTime`, so they plant an OLD marker via the server: create it, then age it with the test seam
   `serverClock.offsetForTest`); a Quench case where a marker's `at` is larger than the current uptime (a pre-restart
   claim) and young by `ct` → NOT taken over; old by `ct` → taken over once.

## Out of scope
Rewriting stored `at` values (old markers stay; the rule reads them). Server-side changes (we can't).
