# Plan Review Log: persona tokens created at jack-in
Started 2026-11-04. MAX_ROUNDS=5. Plan: docs/PLAN-matrix-persona-tokens.md

## Round 1 — Codex (fresh session, brief; ~71k input tokens)

The plan needs these corrections:

- **Late pan never happens.** After timeout, `enter` records `"entered"`; `reconcileTab` then returns `"stay"`, and token creation does not trigger tab reconciliation. **Fix:** track a pending pan and consume it on persona creation only while that same session and destination remain current.

- **The new wait introduces a cancellation window.** A dump or losing session during the wait can still lead to `showScene`; same-client jack-out also queues behind the wait. **Fix:** revalidate session identity, winner, mode and validity after waiting, and provide cancellation that does not wait behind entry.

- **GM handoff is missing.** Unlike `astral-forms.mjs`, the listed hooks omit `userConnected`; an already-connected GM becoming active does not run `ready` again. **Fix:** schedule a full reconciliation when active-GM ownership changes.

- **An in-flight create can leave an orphan.** If the session disappears before creation completes, the proposed `createToken` filter rejects the scene because it is no longer a session destination. **Fix:** reconcile scenes containing managed tokens regardless of current sessions, including after every completed write.

- **Hand-marking does not trigger cleanup.** The HUD updates an existing token, but the plan has no `updateToken` hook; changing actor linkage, visibility or sight also goes unnoticed. **Fix:** reconcile on relevant token updates, including flag deletion, while ignoring ordinary movement.

- **“Usable” cannot be computed from the proposed inputs.** They omit `hidden`, sight and scene vision; `personaOn` also selects by sort/id before checking usability, and an unusable hand persona could cause the managed replacement to be repeatedly deleted. **Fix:** share one usability predicate and selection policy, prefer usable hand personas, and force generated tokens visible.

- **Destination Region identity is missing.** Sessions retain only `destScene`; `sessionValid` accepts a deleted destination Region or a retargeted jackpoint, leaving placement undefined or on the wrong scene. **Fix:** snapshot the destination Region UUID in the session and validate it against the snapshot scene before creation.

- **Placement does not guarantee containment.** Bounds include points outside concave Regions or inside holes; “centre, offset by index” can also fall outside, and prototype tokens can exceed one cell. **Fix:** test actual Region geometry and token footprint using destination-scene coordinates, with an explicitly contained overlap fallback.

- **HUD deletion contradicts reconciliation and writer ownership.** Unmarking a managed token during a live session immediately recreates it; direct deletion by another GM also bypasses the active writer. **Fix:** make unmarking persist a defined suppression intent and let only the active writer delete.

- **Hand-token protection has an in-flight race.** A fresh check cannot prevent deletion already submitted before another GM clears `personaManaged`. **Fix:** serialize adoption through the active writer using persistent intent, and explicitly test adoption against pending deletion.

- **Player scene access remains unhandled.** Linked-token ownership does not supply destination Scene permission; `canJackIn` does not check the entering player’s access. **Fix:** validate that player’s destination access before committing the session and give a specific failure message.

- **Tests miss the critical interleavings.** Two quick jack-ins do not cover session removal during creation, two GM clients, handoff, adoption during deletion, late pan, unusable hand tokens or difficult Region geometry. **Fix:** add controlled delayed-write tests for those races plus player access and placement cases.

VERDICT: REVISE
### Claude's response
Numbering follows Codex's list (#1 late pan … #12 tests).
- **Accepted:** #1 (late pan via a createToken hook on the decker's client, once per record), #2 (the wait exits as
  soon as the session stops being live; the re-check runs again before showScene), #3 (`userConnected` handoff, as
  astral-forms), #4 (passes also cover every scene holding a managed persona; each write reschedules), #5 (updateToken
  on persona flags/link/hidden/sight, not movement), #6 (one shared `personaUsable`, passed into the pure rule; only a
  usable hand-placed persona suppresses the managed one; `hidden:false` on create; `personaOn` prefers usable), #7
  (`destRegion` snapshot in the session, validated; legacy fallback), #8 (footprint containment via `testPoint`,
  contained-but-occupied fallback), #9 (managed tokens get "Keep this persona" instead of unmark; the HUD never
  deletes), #10 (adoption only on the active GM, inside the writer's scene queue), #12 (the listed race/geometry
  tests; two GM clients via the `isWriter` seam).
- **Rejected #11 (player scene access):** not introduced by this plan — today's jackpoint entry already switches the
  player to the destination scene with the same `showScene`, and nothing here changes scene permissions. Out of scope.

## Round 2 — Codex (fresh session, brief; ~68k input tokens)

- **R1 #1 — Late pan still has a gap:** creation during `showScene()` occurs while the record is `pending`, so the hook skips it permanently; recheck for a usable persona after marking `entered`, and set `panned` for both immediate and late pans.
- **R1 #2 — Queued cancellation cannot interrupt the wait:** `jackOut()` waits behind `enter()` in `matrixQueue`, so no state change reaches the wait; signal local cancellation before enqueueing jack-out and test cancellation during the wait.
- **R1 #2 — Invalid sessions can still switch scenes:** the existing pre-`showScene` check tests mode and winner but omits `sessionValid`; include validity in that final guard.
- **R1 #6 — Unusable managed tokens prevent convergence:** creating a usable replacement while retaining the lowest-ID unusable duplicate can repeatedly delete replacements; define removal/replacement of unusable managed tokens and test hidden, unsighted, and unlinked cases.
- **R1 #8 — Five points do not prove footprint containment:** a hole or concave notch can intersect the footprint between samples; use full footprint containment and test holes/notches that miss all five sampled points.

VERDICT: REVISE
### Claude's response
All five accepted (Draft 2, marked "R2 #n" in the plan, in Codex's order): #1 re-check and pan right after marking
`entered`, `panned` set by both pans; #2 a local `LEAVING` set written by `jackOut` before it enqueues, ending the
wait; #3 `sessionValid` added to the pre-`showScene` guard; #4 unusable or unlinked managed tokens are removed,
duplicate pruning only among usable ones; #5 footprint containment by ClipperLib area difference against
`region.polygons`, not by sample points.

## Round 3 — Codex (fresh session, brief; ~68k input tokens)

The R2 fixes address the identified gaps: the post-entry check closes the missed-pan window; `LEAVING` breaks the same-client queue wait; `sessionValid` guards entry; unusable managed tokens cannot displace usable ones; and polygon difference checks the whole footprint.

No new material problem found against the three specified modules.

VERDICT: APPROVED
**Converged in 3 rounds (~207k input tokens total, vs ~0.5–1.3M per resumed round before).**

# Code review

## Code round 1 — Codex (fresh session; full diff 4033fd6..7509ae7; ~116k input tokens)

- **module/persona-tokens.mjs:77** — If token-data preparation is delayed while the actor exits and reconnects through another entry Region on the same scene, creation still uses the old Region. Subsequent reconciliation retains that misplaced token because it checks only actor and scene. **Fix:** After the awaits, recheck writer authority, creation necessity, and session identity; discard stale data and reschedule.

- **module/persona-tokens.mjs:27** — Clearing `persona` through a token update while leaving `personaManaged` set permanently excludes that token from cleanup. A replacement appears during the session, but the original survives jack-out and even actor deletion. **Fix:** Include managed tokens regardless of their `persona` flag and remove managed tokens whose persona flag was cleared.

VERDICT: REVISE
### Claude's response
Both accepted (commit "code review R1"): (1) managed tokens record `personaSession`; a managed token whose session
isn't the actor's live one is removed as `stale`, and `reconcileScene` re-checks writer / still wanted / same session
after its awaits; (2) managed tokens are included whatever their persona flag, and one with the flag cleared is
removed as `unmarked` (and never counts as the actor's persona). Vitest for both; Quench: clearing the flag on a live
managed persona removes it and a fresh one replaces it.

Deviations from the plan, stated in the brief: exact boundary-crossing containment (`rectInRegion`) instead of a
ClipperLib area difference; `LEAVING` only on the core jack-out path (a VR2.0 exit is a sequencer request that may
be cancelled or fail; the wait ends when the connection does); persona scheduling outside the Matrix queue (a
GM's own jack-in holds it while waiting for the token).

## Code round 2 — Codex (fresh session; the fix diff only; ~52k input tokens)

No material findings within scope. The post-await checks reject superseded creates; session tagging enables cleanup of stale tokens that still land. Unmarked managed tokens remain eligible for cleanup. Adopted tokens bypass managed-token removal, and neither fix introduces a create/remove loop.

VERDICT: APPROVED
**Code review converged in 2 rounds.**
