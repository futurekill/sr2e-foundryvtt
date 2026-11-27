# Plan Review Log: claim clock (docs/archive/plans/PLAN-claim-clock.md)
Started 2026-11-27. Codex gpt-6-sol high.

## Round 1 — Codex
1. **A fresh claim can be declared stuck immediately.** The plan’s `max(STUCK_MS, wallNow − ct)` makes a marker created one second before a restart—or created just after it with a stale `at`—eligible for takeover at once. In [dose force-finish](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:785), a live holder can then overlap the GM and double-process a step. The proposed `at > now` Quench case creates a marker *now* and would endorse this false positive. **Fix:** require a verified two minutes of elapsed age; give ambiguous post-restart claims a grace period.

2. **Missing metadata and client clock skew fail open.** The proposed `Infinity` for absent `ct`, and an unbounded `Date.now() − ct`, can make a live marker appear both stuck and older than the 24-hour retention. [Pruning](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/claims.mjs:50) could then remove its deduplication evidence; a client clock 24 hours fast is enough. **Fix:** treat missing or untrusted age as neither stuck nor prunable, and use a trusted or conservatively bounded clock for elapsed time.

3. **The proposed age moves backward.** For a pre-restart marker with `at = 3 hours`, `stampAge` uses `ct` just before the new uptime reaches three hours, then abruptly returns zero at the crossover. A cybermancy Resume that was allowed becomes blocked again, and a bleeding retry can reuse an earlier age-derived key. **Fix:** use one stable creation-time basis for a marker; do not switch branches when uptime crosses `at`.

4. **Durable event ordering is missed.** [MBW’s fold](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/mbw-rules.mjs:59) and [cybermancy’s fold](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/cym-rules.mjs:52) order records by uptime-derived `at`. A new MBW occurrence after restart becomes occurrence 1 ahead of the old one; a revive after restart at unchanged world time sorts before the old death, leaving the character dead. I reproduced both fold results with those record sequences. **Fix:** order durable records by server creation time or explicit causal sequence, with a defined legacy fallback.

5. **The listed spell-resistance sites omit the orphan claim.** [Mark resolved](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/combat-spells.mjs:518) reads an ActiveEffect claim’s `at` directly. After restart, a GM can remain unable to resolve an orphan resistance until uptime catches the old stamp. The pending message has its own creation time, so treating its timestamp as `Infinity` can conversely permit premature manual resolution. **Fix:** cover both branches and require verified age for each.

6. **Sorting claims by `ct` only when both have it is unsafe.** With one legacy marker missing `ct`, [cybermancy](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:134) falls back to incomparable uptimes and can select an old claim over a live newer claim. Its `claims.length + 1` also reuses a key when pruning leaves a gap. **Fix:** select the highest numbered claim key and generate its successor; do the same for [regeneration takeovers](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:198).

7. **Bleeding retry keys should not come from age buckets.** [Claim tick](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:223) uses `floor(age / STUCK_MS)` as the retry number. Different client wall clocks under the plan can choose different keys for the same cursor, so both `once()` calls win. **Fix:** derive the next retry number from existing marker keys and recheck the cursor after claiming.

8. **`doseHoldState` needs an explicit compatible contract.** It currently copies only `at` into `best` and takes `stuckMs` as argument four in [the rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/claim-rules.mjs:35). Following the plan without specifying both details drops `ct`—making old claims `Infinity`—or passes the test threshold as `wallNow` at [two call sites](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:773). **Fix:** retain the whole selected marker and add `wallNow` after `stuckMs` or use named options.

9. **The VR2 inventory conflates distinct timestamps.** [The backoff’s `done` record](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2ic.mjs:1763) comes from `eventsOf` and has `ct`; treating it as a no-`ct` stamp retries immediately after restart instead of honoring its backoff. Conversely, [the icon-crash flag](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2.mjs:1441) has no age reader: its count is a durable incarnation boundary, so expiring it would reuse an incarnation number. **Fix:** age the `done` event with its creation metadata and leave crash boundaries persistent.

VERDICT: REVISE
### Claude's response
All 9 accepted; the basis changes: ages come ONLY from the server's wall-clock createdTime (ct) against serverNow() = Date.now() + the largest observed (modifiedTime - Date.now()) offset — latency makes it conservative (never early), skew cancels, unknown = not stuck/not prunable. Folds order by ct; successor keys from key numbers; doseHoldState takes an age function; spell pending message and VR2 done record aged by their own createdTime; vr2IconCrash untouched.

## Round 2 — Codex
1. **The startup clock sample can make a live claim look an hour old.** The plan keeps the largest `modifiedTime − Date.now()` offset from stored documents. If the server clock was corrected backward after a document was modified, that old sample puts `serverNow()` ahead of the server; a claim created now can immediately pass `STUCK_MS` and be taken over. **Fix:** derive the offset from a fresh server response, and discard stale samples after clock changes or reconnects. See [plan §2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/archive/plans/PLAN-claim-clock.md:21).

2. **A retry must age the latest claim, not the original claim.** The plan specifies the highest numbered *next key* but does not explicitly change which marker is checked for staleness. In [bleeding](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/healing-clock.mjs:223), the age check uses the original marker; once it is old, two clients can win consecutive retry keys seconds apart and both pass the cursor check before either writes. [Regeneration](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/shapeshift.mjs:202) also selects its “latest” marker by the restart-sensitive `at` value. **Fix:** select the highest numbered existing attempt, require *that attempt* to be old before another retry, and use one retry key sequence for forced and automatic attempts.

For the timestamp assumption: Foundry 13 documents `createdTime` as nullable. A [confirmed embedded-document bug](https://github.com/foundryvtt/foundryvtt/issues/10348) affects effects created *inside a parent creation*, as [newProject](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/programming.mjs:209) does; it does not establish that the plan’s direct `createEmbeddedDocuments("ActiveEffect", …)` path lacks a server stamp. That direct path still needs the proposed Foundry 13.351 integration test to assert a non-null, server-aligned `ct`.

VERDICT: REVISE
### Claude's response
Both accepted. #1 live samples only, a 10-minute rolling window, all dropped on socket reconnect; no startup sample from stored stamps. #2 staleness is judged on the highest-numbered attempt; forced Settle shares the one sequence (skipping only the age test). Added a Quench integration check that a directly created marker has a server ct.

## Round 3 — Codex
1. **An idle world can lose the clock needed for takeover.** After 10 minutes without a document change, every sample expires and `serverNow()` becomes null. Retrying an existing claim creates no document, so a stuck bleeding or regeneration step can remain blocked until an unrelated write occurs. **Fix:** obtain a fresh server timestamp on demand when the sample window is empty.

2. **A client clock adjustment can make a live claim appear stuck.** If the client clock jumps forward an hour after a live sample, `Date.now() + offset` jumps forward too; a seconds-old claim can pass the two-minute takeover threshold. **Fix:** advance each server timestamp using a monotonic clock and refresh the sample after clock discontinuities.

VERDICT: REVISE
### Claude's response
Both accepted: samples are (wall, performance.now()) and serverNow advances on the monotonic clock; an empty window takes a fresh sample on demand by writing a ping flag on the user's own User document.

## Round 4 — Codex (delta)
1. **Sleep can delay takeover after wake.** On macOS, `performance.now()` may stop advancing during sleep. If a client sleeps for an hour with a young claim and no document activity, its sample can still appear less than 10 minutes old on wake; the retry skips the ping and treats the claim as young. **Fix:** detect a wall-clock versus monotonic-clock gap and obtain a fresh server sample before the age decision. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)

2. **The ping must change its flag value.** If a second ping writes the same `clockPing` value after the first sample expires, Foundry can treat it as an unchanged update and return no updated document, leaving the idle world without a sample. **Fix:** specify a distinct nonce for every ping and verify that the returned document has a usable `modifiedTime`. [Foundry 13 User API](https://foundryvtt.com/api/v13/classes/foundry.documents.User.html)

VERDICT: REVISE
### Claude's response
Both accepted: a fresh random nonce per ping, sample only from the returned document's modifiedTime; a sample is dropped when wall and monotonic clocks drifted > 5 s since it (sleep).

## Code review round 1 — Codex (high)
1. **A server clock correction can take over a live claim.** [The clock keeps the largest sample for ten minutes](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/claim-rules.mjs:63). If the server clock moves back an hour without a socket reconnect, a marker created afterward appears an hour old and can pass the two-minute takeover check. **Fix:** detect and discard samples that are ahead of a fresh server stamp before deciding age.

2. **Cybermancy does not recheck its operation fence after a takeover.** [Apply](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:168) and [Cancel](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:233) use state read before winning the claim. An earlier Apply can resume after Cancel has refunded and removed the implant, then write the wound and completion. **Fix:** re-read operation state and verify the current attempt before each post-claim mutation.

3. **VR2 treats an unknown `done` age as expired.** [A missing `ct` becomes zero](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2ic.mjs:1764), so a recently failed request whose record lacks a creation stamp is retried on the next pass instead of observing its backoff. **Fix:** keep the backoff pending when the relevant `done` timestamp is unknown.

4. **Idle recovery paths can remain blocked after samples expire.** [VR2 recovery](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2ic.mjs:1755) uses `serverNow()` without refreshing it; [the MBW seizure action](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/mbw.mjs:300) relies on a synchronous age check. After ten quiet minutes, a retry pass can do nothing and the GM’s seizure repair can remain unavailable. **Fix:** obtain a fresh server sample before these actionable age decisions.

5. **The Quench offset can affect live claims.** [The mutable offset applies to every `serverNow()` call](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/server-clock.mjs:30), and [a Quench test sets it to ten minutes across an awaited operation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:17718). A concurrent combat update on that client can take over a seconds-old regeneration claim. **Fix:** scope the test clock to the test operation or test actor, rather than the shared runtime clock.

6. **An update without `modifiedTime` is sampled at its old creation time.** [The sample function falls back to `createdTime`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/server-clock.mjs:19), although [Foundry V13 permits a null `modifiedTime`](https://foundryvtt.com/api/v13/interfaces/foundry.data.types.DocumentStats.html). If a ping update returns that shape, its old User creation stamp counts as a live sample and suppresses another ping until expiry. **Fix:** accept `createdTime` only on create hooks; require `modifiedTime` for updates and ping responses.

The create/update hook callbacks use the document as their first argument, matching [Foundry’s hook signatures](https://foundryvtt.com/api/v13/functions/hookEvents.createDocument.html).

VERDICT: REVISE
### Claude's response
All 6 fixed. #1/#4 every actionable age decision takes a FRESH sample (freshServerNow always pings), and a sample >5 s behind the kept estimate drops the older ones (a backward clock correction); MBW applyAnyway refreshes first; VR2 backoff refreshes only when a retry is judged. #2 cybermancy re-reads the op after the claim (Apply before charge, wound and done; Cancel after the claim). #3 a done record without ct keeps the backoff. #5 offsetForTest removed; the spell test plants testCt on the message (testMode only). #6 create hooks sample createdTime; updates and pings need modifiedTime.

## Code review round 2 — Codex (medium, fix-only)
1. **Cybermancy still allows a superseded Apply to mutate the actor.** After Apply wins attempt 1 and passes `open()` in the money queue, it can pause on an awaited write. Two minutes later, Cancel can win attempt 2, remove the implant, and refund the operation. Attempt 1 can then resume and create the implant at [cybermancy.mjs:186](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:186). `open()` checks neither the current attempt nor the operation state again inside that loop. The same gap exists around the wound write at line 204. Recheck the winning attempt and operation state before each post-claim mutation.

VERDICT: REVISE
### Claude's response
Fixed: claimOp returns the attempt number it won; holdsLatest(n) checks no later attempt exists; Apply's open() (and Cancel's) require it and the op state, checked before every item create, inside the wound's skipIf, before op-done, and at the start of Cancel's money-queue entry.

## Code review round 3 — Codex (medium, fix-only)
1. **Cancel can still refund after losing its claim.** The queue checks `open()` before deleting items, then awaits the deletion and calls `adjustNuyen` without checking again ([cybermancy.mjs:255](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:255)). If Cancel attempt 1 stalls during deletion, attempt 2 can take over after two minutes. Both attempts can then read an unrefunded receipt and issue a refund. Cancel also writes the terminal record after the queue without a final `open()` check ([cybermancy.mjs:274](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:274)).

VERDICT: REVISE
### Claude's response
Fixed: Cancel re-checks open() right before the refund and before the terminal record.

## Code review round 4 — Codex (medium, fix-only)
1. [Apply writes a suspension record without a fresh `open()` check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/cybermancy.mjs:222). Attempt 1 can pass the check at line 215, stall while writing `opDone`, and lose its claim to attempt 2. When attempt 1 resumes, it still writes `cym:suspend:0`. Recheck the claim and operation state before that write.

VERDICT: REVISE
### Claude's response
Fixed: the suspension record is written only while holdsLatest(mine) (open() is false after op-done by design).

## After review — full Quench suite
The full sr2e.* suite (1,005 tests) found one regression: sr2e.vr2-grids '7b: a trace from the RTG … can dump the decker' failed because the VR2 backoff awaited freshServerNow() (a User write) inside the sequencer's pass, stalling it. Fixed: the pass reads serverNow() synchronously; with no sample it starts one without awaiting and judges the retry on the next pass (still never early). The changed batches then 148/149 (1 old skip).
