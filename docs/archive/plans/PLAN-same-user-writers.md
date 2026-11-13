# Plan: once-only dose finishing across clients
_Final — APPROVED by Codex in round 4 (see REVIEW-LOG)_

## Goal
`completeDose` (drugs.mjs) finishes a committed dose. Several clients can run it at once
for one actor:
- every connection of the elected user on load;
- any client's `settleSubstances`;
- the `preDeleteItem` hook.

The actor queue serializes runs only within one client. The result is two dose cards,
the overuse Light Stun landing twice, and a stale duplicate resetting a Kamikaze
absorption counter. Exactly ONE client must run a dose's steps, in order, and the
settlement barrier must hold until they're done.

## Verified facts (2026-10-19, v13.351 AND v14.369)
- `createEmbeddedDocuments("ActiveEffect", [{_id: X}], {keepId: true})` ×3 in
  parallel: ONE returns the document; the others reject with "The _id [X] already
  exists within the parent collection".
  - It held on both versions, for a world actor (`Actor … effects`) and for an
    unlinked token's synthetic actor (`ActorDelta … effects`).
  - The synthetic create did not leak to the base actor.
- `ChatMessage.create({_id: X}, {keepId: true})` replaces the world document, so the
  arbiter must be EMBEDDED.
- Actor sheets never list actor effects. A disabled, change-less effect isn't shown on
  the token.

## Approach
1. **`once(actor, key)` (`module/claims.mjs`):** true only if THIS call created the
   marker.
   - The marker is an embedded ActiveEffect:
     - `_id = claimId(key)`, a deterministic 16-character base-62 id (pure,
       `module/rules/claim-rules.mjs`);
     - `disabled: true`, `transfer: false`, no changes;
     - `flags.sr2e.claim = {key, at: game.time.serverTime, user}`;
     - created with `keepId`.
   - True only when the create returns a document with that id (a pre-create cancel →
     false).
   - An "already exists" rejection → false; other errors are rethrown. A marker already
     in the local collection → false, without a request.
2. **One claim per dose, per generation:** key `dose.<exposureId>.g<n>`.
   - **The dosing client holds g0 from the start** (fixes R1 #3).
     - `useDose` takes `once(actor, "dose.<exp>.g0")` BEFORE the commit update. The
       exposure id is fresh, so it can't lose: a false result aborts the dose with
       nothing spent.
     - Then it writes the commit and finishes it as the holder.
     - Another client's resume sees the commit, fails to create g0, and treats the
       dose as PENDING.
   - **`completeDose(actor, item, exp, {held})`:** the steps run only when `held` (the
     caller won the current generation's claim). Otherwise `resumeDoses` tries
     `once(...g<current>)`, where current = the highest generation marker present for
     this exposure, else 0:
     - it wins → it runs the steps. With no marker at all, this is only a commit
       written by an older build, before markers existed;
     - it loses → PENDING.
   - **The steps are unchanged and in order** (event + absorb, overuse, effect, pump,
     card), with receipts written only on actual success. The holder clears the
     commit last. The marker stays (deduplication evidence, cleanup in 4).
   - **PENDING:**
     - `resumeDoses` returns not-finished, so `settleSubstances` holds ("still being
       finished") and the barrier keeps (R2 #3);
     - the `preDeleteItem` hook and `resumeAllDoses` just skip;
     - useDose's own path is never pending (it holds g0).
3. **An interrupted holder → a GM OVERRIDE on the sheet** (R3: a click cannot fence a
   paused browser, so this is labelled an override, not an exactly-once recovery).
   - **Persistent and live, no chat or scheduling** (R3 #2, #3): the drugs section of
     the character and NPC sheets lists **Unfinished doses**: every open commit, with
     its holder's user and the age of its newest marker, computed at render.
     - Players see it read-only ("being finished on <user>'s device").
     - The GM gets **Force finish — may duplicate effects** when the marker is older than `STUCK_MS` (2 min
       of server time).
     - A blocked substance action says "still being finished — if that device was
       closed mid-dose, the GM can finish it from the sheet (Unfinished doses)".
   - **Live threshold** (R4 #3): a sheet listing a dose that isn't yet overridable sets
     ONE render timer for the moment it becomes so (cleared on close/re-render). An
     already-open sheet gains the button without user action.
   - **The override is "Force finish — may duplicate effects"** (R4 #1–#2). The
     confirm discloses:
     - the holder user and whether that user is online right now;
     - "Close EVERY Foundry tab and device of <user> first. Being offline is not
       enough: a sleeping tab can reconnect and carry on.";
     - "Writes already sent by that device may still land, and this client may not
       have seen them yet. Forcing can double the overuse wound or the card. Check
       the condition monitor and chat afterwards."

     Then, in the actor queue:
     - it re-checks that the commit is open and g<n> is still the highest generation;
     - `once(actor, "dose.<exp>.g<n+1>")` and, if it wins, runs the steps with
       `held: true`.
     - A failed or interrupted g<n+1> stays listed: the GM can force again (g<n+2>).
   - **Superseded check (a mitigation only):** before EACH step, a holder checks that
     no higher-generation marker exists for its exposure, and stops if one does. It
     can't stop a write already issued.
   - **No freshness guarantee is claimed.** The marker's age is its acquisition time,
     not its last write. The receipts skip work this client has SEEN completed; the
     disclosure above covers the rest.
   - An effect not created by the dead holder is "lost" (not this session's) → the
     existing GM Re-apply.
4. **Marker cleanup:** `settleSubstances` deletes markers older than `MARKER_TTL_MS`
   (24 h of server time), but never a marker whose exposure still has an open commit.
   - The guarantee is therefore "at most once while the marker is retained": a client
     paused mid-dose for over 24 hours is the documented residual (R2 #6).
5. **VR2 maneuver results** (R2 #7): for each write in `applyManeuverResult`:
   `once(actor, "maneuver.<resultId>.<actorKey>")`. Then, AFTER winning, it
   re-validates the sessions and the `applied` receipt (R3 #5), and writes.
   - A stale duplicate of the same result can't re-apply.
   - **Unresolved and documented:** a delayed FIRST application of an older result can
     still overwrite a newer one (cross-result ordering, pre-existing; independent of
     how many devices a user has).
   - A winner crashing before its write loses it. The result card states the outcome,
     so the GM can apply it by hand.
   - `designatedWriter` and `doseDriverOf` stay as user-level filters (fewer
     requests).
6. **Tests.**
   - Vitest: `claimId` is deterministic, `[A-Za-z0-9]{16}`, with no collisions over
     5,000 keys; a pure `doseHoldState({markers, exposureId, now})` → `{gen, holder, ageMs,
     overridable}`.
   - Quench (`sr2e.drugs`), on a world actor and an unlinked token actor:
     - `once` ×3 in parallel → exactly one true;
     - **the bug:** an overuse dose whose g0 marker is held by "another client" (created
       by the test with a fresh `at`) → two concurrent `resumeDoses` are PENDING (no
       card, no wound) and `settleSubstances` returns false;
     - two concurrent unclaimed resumes of an old-build commit (no marker) → ONE card,
       ONE overuse box, the counter set once, the commit cleared;
     - **controlled interleaving:** the holder's steps paused after the claim (a test
       hook awaiting a promise) while a second resume runs → PENDING, no steps; then
       release the hold → it finishes once;
     - **override:** a marker aged past STUCK_MS → the sheet context lists it with
       `overridable` for the GM, read-only for a player. The override finishes it, and
       a completed overuse receipt is not re-applied. A second override → nothing (the
       commit is gone). An open sheet crossing the threshold re-renders with the button
       (the timer, with STUCK_MS shortened by a test hook).
     - **old holder resumes during the override** (R3 #6): g0 is paused at a step
       boundary (test hook), the override claims g1 and finishes, then g0 is released
       → g0 stops as superseded. One card, one wound.
     - **a failed override:** g1's pump step stubbed to throw → the commit stays, the
       dose is still listed; after the test clock passes STUCK_MS again, it's overridable and g2 finishes it.
     - **a failing step** (pump update stubbed to throw) → the commit stays, the marker
       stays, nothing is re-applied on retry by a non-holder;
     - cleanup: old markers without commits deleted; old markers with open commits
       kept;
     - VR2: a result applied twice concurrently → one write.
   - Manual, v14 (isolated install at 127.0.0.1): `once` ×3 on a world and a synthetic
     actor; a two-browser overuse dose. A QA-PLAN entry.
7. **Docs:** CHANGELOG Unreleased (Fixed); CLAUDE.md "Damage and drugs" (`once` for
   cross-client once-only steps); QA-PLAN; memory.

## Key decisions & tradeoffs
- One server-arbitrated claim per dose, taken BEFORE the commit by the dosing client.
- No automatic takeover: an interrupted holder needs a GM OVERRIDE from the sheet,
  labelled unsafe while the named device still runs (a paused browser can't be fenced).
- Hidden ActiveEffect markers with a 24 h retention, kept while their commit is open.

## Risks / open questions
- v14 rejection semantics: re-verified on the isolated install before shipping.
- One marker per dose, for 24 h: negligible document load.
- Out of scope: general last-write-wins between different editors (two devices spending
  the same quantity snapshot; two damage sources' monitor writes) and GM-only
  automation in two GM tabs.
