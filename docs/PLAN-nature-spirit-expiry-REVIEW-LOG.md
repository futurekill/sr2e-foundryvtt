# Plan Review Log: nature spirit expiry
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
1. **Bound-only scope misses spirits.** Orphaned or manually created nature spirits survive despite “no matter what.” Fix: enumerate world and synthetic nature-spirit actors independently of binding membership, excluding already-departed records.

2. **Unlinked conjurers need separate cleanup.** `rollConjuring` stores `this.uuid` and updates `this.system.boundSpirits`; a synthetic conjurer’s list is not its base actor’s list ([actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1370)). Fix: resolve exact conjurer UUIDs and clean matching references in world actors and unlinked actors across all scenes.

3. **“All scenes” lacks an identity rule.** Synthetic spirit UUIDs differ from their base actor UUID; UUID-only token matching can leave copies behind. Fix: enumerate every scene’s TokenDocuments, explicitly handle linked references and unlinked spirit instances, and delete tokens before their backing actors.

4. **Expiry must not reuse the limit filter.** `conjuringLimit` deliberately ignores spirits with zero services, allowing several exhausted nature spirits to remain ([sr2e-rules.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:368)). Fix: expire every eligible nature spirit regardless of services, and explicitly zero retained actors’ services.

5. **Pending placement can recreate a departed spirit’s token.** Placement captures token data before awaiting a human click and afterward checks only the scene ([placement.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/placement.mjs:37)). Fix: re-resolve the spirit and reject deleted/departed summons immediately before token creation.

6. **Boundary semantics are unspecified.** Equality-only or time-of-day comparisons miss exact arrivals and multi-day jumps; rewinds need explicit behavior. Fix: use hook arguments `(worldTime, dt)`, ignore `dt <= 0`, detect boundaries in `(worldTime - dt, worldTime]`, and process affected spirits once per update without resurrecting on rewind ([v13 hook](https://foundryvtt.com/api/v13/functions/hookEvents.updateWorldTime.html)).

7. **Active-GM selection alone does not serialize work.** Manual calls, overlapping updates, and GM handoff can duplicate cleanup/chat; an old queued sweep can catch newly summoned spirits. Fix: route all entry points through one active-GM executor with serialized, retryable cleanup and a fixed candidate set per event.

8. **Partial failure can strand spirits.** Removing binding references before token/actor deletion succeeds makes a bound-only retry miss unfinished departures. Fix: persist departure state first, retain retry information through cleanup, and report only confirmed outcomes.

9. **The clock fallback is underspecified.** World time is seconds, and Foundry provides a calendar without Calendaria; neither a nonzero timestamp nor module presence proves automatic expiry is enabled. Fix: define the fallback day origin/hour conversion, guard optional Calendaria access, and use the same scheduler and explicit enabled setting for expiry and summon-card text ([v13 GameTime](https://foundryvtt.com/api/v13/classes/foundry.helpers.GameTime.html)).

10. **Tests omit the destructive edge cases above.** The proposed happy-path tests cannot establish safe deletion. Fix: add inactive-scene/unlinked-token coverage, zero-service and retained spirits, pending placement, exact boundaries, multi-day jumps, rewind/re-crossing, concurrent GMs, partial failure, and Calendaria absent.

VERDICT: REVISE
### Claude's response
Rewrote the plan and accepted all 10. Scope is every nature spirit, including unlinked ones; there is a single active-GM executor with a fixed candidate set; departure is resumable (departed flag first, idempotent steps); placement is re-checked; boundaries use the (t-dt, t] interval with no rewinds, core calendar and guarded Calendaria; tests are expanded.

## Round 2 — Codex
Remaining concrete flaws in [the revised plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-nature-spirit-expiry.md):

1. **Retry contradicts discovery (lines 18, 38).** Departed actors are skipped, yet unfinished departures must be resumed; `{ at, reason }` cannot distinguish pending cleanup from completed retention. Fix: persist explicit pending/completed states and always discover pending work.

2. **Synthetic identity is incorrect (lines 15–16, 29–31).** Two unlinked tokens can share `actorId` and identical deltas; ordinary unlinked nature spirits based on nature actors are also excluded from explicit enumeration. Fix: enumerate every unlinked effective nature-spirit actor and identify each by scene/token UUID.

3. **Deleting a synthetic token destroys its retry state (steps 3.2–3.3).** If binding cleanup subsequently fails, both the departed flag and the synthetic actor disappear. Fix: persist affected token/actor UUIDs and cleanup progress outside the documents being deleted until cleanup completes.

4. **GM handoff is asserted, not implemented (lines 21–25).** Client-local queues do not stop the former active GM’s running sweep or tell the replacement GM to resume it. Fix: persist the job, resume on authority changes, recheck authority before writes, and deduplicate completion/chat across retries.

5. **Queued events need an explicit snapshot point (lines 19, 24).** If candidates are collected when a queued callback starts, an earlier boundary can expire spirits summoned while it waited. Fix: snapshot candidate UUIDs and event time synchronously when accepting the event, before enqueueing.

6. **Conjuring can append a binding after cleanup.** `rollConjuring` awaits actor creation before appending its UUID; expiry can delete that actor between those operations ([actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1395)). Fix: coordinate binding finalization with departure and remove any binding whose summon became departed during finalization.

7. **Tests do not establish resumability or multi-GM correctness.** Retrying a flagged actor with a surviving token misses the failure where the token—and its journal—already disappeared. Fix: add failure injection after token deletion, retained-actor completion, GM handoff during a sweep, and queued-event/conjuring interleavings.

VERDICT: REVISE
### Claude's response
Accepted all 7 via a persisted job journal (a world setting) that is snapshotted synchronously and resumed by the active GM on ready and handoff. It is idempotent per candidate, and unlinked tokens are identified by token uuid. There is a re-check after binding in conjuring, and tests cover resumability and interleavings.

## Round 3 — Codex
1. **Missing documents skip required cleanup.** World-actor processing deletes unlinked tokens before their candidates run; “missing document counts as done” then leaves synthetic UUIDs in `boundSpirits`. Fix: journal each candidate’s actor UUID and always remove its bindings before marking it done, even when its document is missing.

2. **World-actor deletion overrides effective-token classification.** Deleting *any* unlinked token based on a nature actor also deletes a token whose delta makes it an elemental, contradicting “elementals untouched.” Fix: process unlinked tokens exclusively through their snapshotted effective classification and preserve backing actors needed by surviving instances.

3. **Departure is marked too late.** During token/binding cleanup the actor remains available with positive services; placement and conjuring rechecks can pass, then leave a late token or binding behind. Fix: mark departure and zero services before cleanup, and coordinate final placement/binding writes with that state.

4. **The shared journal still permits lost updates.** Event acceptance can append candidates while the executor writes an older `done` snapshot or clears the job; active-GM checks do not serialize asynchronous writes. Fix: serialize acceptance, progress, and finalization through one writer, with revision/ownership checks covering GM handoff.

5. **`chatPosted` does not guarantee deduplication.** A disconnect after chat creation but before persisting the flag produces another card on resume. Fix: give the completion message a stable job identity and reconcile an existing message before posting again.

6. **Retained spirits depart repeatedly.** The revised discovery rule includes already-completed actors retained with `flags.sr2e.departed`, so every later boundary reports them again. Fix: exclude completed retained actors from new snapshots while resuming unfinished candidates from the journal.

7. **The handoff test does not exercise competing executors.** Calling `runDepartJob()` again cannot expose an old GM’s in-flight write overwriting the replacement GM’s progress. Fix: test overlapping acceptance/progress writes and authority changes while writes are pending, including finalization and chat creation.

VERDICT: REVISE
### Claude's response
Simplified instead of adding transactions. The journal is gone: the state is the world, and reruns converge. Departure is marked first; unlinked tokens are judged by their own snapshotted class; a dangling-binding sweep runs every time; retained departed spirits are excluded. #4, #5 and #7 are moot without a journal (documented).

## Round 4 — Codex
1. **Marked-first failures do not converge.** If execution stops after marking but before token deletion, the next snapshot excludes the departed actor; retained actors can therefore keep their tokens forever. Fix: exclude completed departures only, and retry token/actor cleanup for marked actors with unfinished work.

2. **Preserved elemental tokens still lose their backing actor.** An unlinked token classified as elemental is spared token deletion, but its nature-spirit base actor is still marked and deleted; inherited services/flags can also change. Fix: preserve backing actors and inherited state needed by surviving non-nature instances, or detach those instances before modifying the base.

3. **Binding sweeps can erase a concurrent summon.** The sweep reads `boundSpirits`, filters it, and writes the array; a summon appended between those operations can be overwritten, and `rollConjuring`’s existence check will pass because its spirit survives. Fix: coordinate binding appends and removals through one authoritative mutation path.

4. **The convergence test starts after the critical failure window.** Testing an already-deleted spirit proves dangling-reference cleanup, but misses interruption immediately after marking and before deletion. Fix: inject failures after marking and between scene deletions, with deletion enabled and disabled, and verify reruns remove every eligible token.

VERDICT: REVISE
### Claude's response
Accepted all 4: retained actors are excluded only when complete; a base actor backing a non-nature instance is left untouched; bindings go through a single fresh-read helper plus a post-append re-check in conjuring; tests inject failures in the marked-first window.

## Round 5 — Codex
Two material problems remain:

1. **The binding recheck still permits permanent lost updates.** A sweep reads the old list, the player appends and successfully verifies the new binding, then the sweep’s delayed write overwrites it; later sweeps cannot restore a missing live binding. Fix: serialize all binding mutations through one authoritative executor, and test this exact write ordering.

2. **The backing-actor exception leaves a nature spirit in service indefinitely.** The exempt world actor retains positive services and its binding, so `conjuringLimit` still blocks another nature spirit even after sunrise/sunset; naming it in chat does not implement departure. Fix: detach the surviving non-nature instances onto independent backing actors while preserving their effective data, then expire the original nature spirit normally.

VERDICT: REVISE
### Claude's response
#2 accepted: surviving non-nature instances are detached onto their own actors, then the original expires. #1 is **not resolved**: cross-client serialisation needs the removed GM relay or a boundSpirits schema change. It is documented as a known limit and surfaced to the user as a deadlock point. MAX_ROUNDS was reached without APPROVED.

---
# Resumed 2026-09-25 (fresh Codex session 01a0d90a…) — the user asked for the binding race to be fixed properly

## Round 6 — Claude
Removed the GM sweep of boundSpirits entirely: readers filter through liveBoundSpirits, and the owner prunes on their own writes.

## Round 6 — Codex
Removing the sweep fixes the specific R5 race. I found no hidden binding writer in expiry-related hooks: `_refreshConjurer` only prepares data and renders. The proposed reader coverage is complete **if `rollConjuring`’s resolution at actor.mjs:1244 uses the helper**; `conjuringLimit` itself accepts plain system objects, not actors.

Remaining flaws:

1. **“Owner client” does not mean single writer.** `banishSpirit` captures the array before awaiting resolution and elemental cleanup (sheet-actions.mjs:3641–3646); a concurrent summon can append before that stale array is written back. Even reading immediately before updating permits overlapping requests, and GM/co-owner actions are not excluded.
   **Fix:** Serialize binding mutations per conjurer through one designated writer, reading current bindings inside that serialized operation; keep expiry outside it.

2. **Placement still has a check/create race.** Re-resolving before `createEmbeddedDocuments` does not make the two operations atomic (placement.mjs:54). A player can pass the check, then expiry marks/deletes the spirit before the token creation commits. An unlinked token created after the snapshot also escapes the snapshotted token candidates.
   **Fix:** Serialize summoned-token creation with expiry on the same executor and add post-creation reconciliation for missing/departed sources.

3. **Interrupted actor deletion never converges.** Plan lines 12–15 exclude marked actors with no remaining tokens. With deletion enabled, disconnecting after the last token deletion but before actor deletion leaves precisely that state; every subsequent run skips the actor forever.
   **Fix:** Treat a marked, tokenless actor as complete only when retention is enabled; otherwise retry actor deletion.

4. **Detachment is not idempotent.** Plan lines 34–38 create a replacement actor and then repoint the token in separate writes. Interruption between them leaves an orphan replacement; retry creates another. The orphan is non-nature and therefore survives future expiry runs.
   **Fix:** Tag replacements with the source token UUID and reuse an existing replacement on retry before repointing and clearing the delta.

5. **The tests contradict the revised behavior.** Plan line 86 still expects “binding removed,” whereas line 91 requires the array remain untouched. Lines 96–97 require the original base actor remain untouched, whereas detachment explicitly permits marking/deleting it. These assertions cannot all pass.
   **Fix:** Assert unchanged raw bindings plus filtered readers, and preserved effective non-nature token data on its replacement base; add interruption and overlapping-write tests for the cases above.

The helper should remain synchronous for `boundElementals` and the elemental binding check; feed `liveBoundSpirits(this).map(a => a.system)` into the existing pure `conjuringLimit`.

VERDICT: REVISE

### Claude's response
All five were accepted:
- #1: mutateBindings is a per-conjurer local queue that reads fresh inside the step, and banish uses it. Two clients editing one conjurer at the same instant is generic last-write-wins, out of scope.
- #2: the token is reconciled after it is created.
- #3: a marked, tokenless actor counts as complete only with retention on.
- #4: detachment is tagged with the token uuid and reused on retry.
- #5: the tests are rewritten to assert raw bindings unchanged plus filtered readers, with the detached replacement for the elemental-by-delta token.

## Round 7 — Codex
The binding changes address R5 and the same-client stale-array race. The helper covers every production `boundSpirits` reader, provided `rollConjuring` uses it before passing system objects to `conjuringLimit`. I found no additional GM binding write. The deletion retry and revised test expectations also address the previous findings.

One blocking recovery gap remains:

1. **Late placement can become permanently undiscoverable** (plan lines 74–79). The post-create reconciliation runs on the summoner’s client. If token creation commits and that client disconnects before reconciliation, expiry can delete the source actor while leaving an unlinked token absent from its original snapshot. The next run cannot classify that token through its now-missing effective actor; there is also no marked world actor left to retry. Thus “caught by the next run” is not guaranteed.
   **Fix:** Persist the summoned source UUID on created tokens and have the active GM reconcile those tokens on creation and subsequent runs, deleting tokens whose source is missing or departed; test disconnect immediately after creation commits.

The plan’s cross-client binding limitation is now explicit; I would not treat that separately scoped limitation as an expiry blocker.

VERDICT: REVISE

### Claude's response
Accepted. Summoned tokens persist `flags.sr2e.summonedSpirit`, and the active GM reconciles them on createToken and at the start of every run. The client-side post-create reconcile is dropped.

## Round 8 — Codex
The persisted flag closes the missing-source recovery gap, but introduces one conflict:

1. **Reconciliation deletes detached survivors.** Detachment (lines 37–45) changes the token’s actor and clears its delta, but leaves `flags.sr2e.summonedSpirit` pointing to the original nature spirit. Once that original departs, reconciliation (lines 78–80) deletes the preserved elemental token on the next run—contradicting “elementals are untouched.”
   **Fix:** Update `summonedSpirit` to the replacement actor UUID in the same token update that repoints the actor and clears its delta; test a flagged elemental-by-delta survivor through two expiry runs.

No additional binding-reader omissions or expiry writes to conjurer bindings found.

VERDICT: REVISE

### Claude's response
Accepted. The re-point update also sets `summonedSpirit` to the replacement. Test: the survivor stays through two runs.

## Round 9 — Codex: APPROVED

No further blocking flaws found within the stated scope. This approves the plan; implementation still needs the specified tests.

VERDICT: APPROVED
