# Plan Review Log: astral walls, barriers, FAB
Started 2026-09-30. MAX_ROUNDS=5.

## Round 1 — Codex

The backend approach is viable, but the plan has blocking gaps in permissions, lifecycle coordination, and FAB enforcement. No files were modified.

I verified that `Token#checkCollision` and the private movement-path collision helper both pass a `PointMovementSource({object: this})` into `CONFIG.Canvas.polygonBackends`. `edge.object.document` is also valid for wall edges. V13’s `WallConfig` is ApplicationV2; the existing jackpoint implementation demonstrates the required RegionBehavior registration.

1. **Open doors retain their document movement restriction.** Stage 1 says Foundry changes the wall’s `move` to `NONE`; actually, `Wall.#createEdge` sets **`edge.move`**, leaving `wall.document.move` unchanged. Returning inclusion directly from the proposed document predicate can block open doors and bypass direction, priority, and boundary checks. Evidence: Foundry `canvas/placeables/wall.mjs:223` and `canvas/geometry/clockwise-sweep.mjs:226`.  
   **Fix:** Return `false` for unflagged astral wall edges; otherwise return `super._testEdgeInclusion(edge, edgeTypes)`.

2. **The permission assumption is false, and deletion needs a separate permission.** Both `TOKEN_CREATE` and `TOKEN_DELETE` default to **ASSISTANT**, not PLAYER (`common/constants.mjs:1344`). The normal player experience would therefore be projection without a form; granting creation alone still does not cover cleanup.  
   **Fix:** Have the active GM perform validated creation/deletion, with an explicit pending or unavailable state when no authorized client exists.

3. **An owner-local queue does not prevent duplicate forms.** Multiple owners, GM clients, or tabs can each react to the same actor update; `matrixQueue` explicitly serializes only one client. Moreover, jackpoints reuse preplaced personas—they do not establish a safe token-creation precedent.  
   **Fix:** Elect one lifecycle writer and make creation idempotent by body UUID and projection-session ID.

4. **Entry and exit can interleave across clients.** An exit can finish deleting forms before an in-flight creation resolves; the creator can subsequently mark the body even after the GM deleted that new form. The stated reconciler repairs neither duplicates nor stale body markers.  
   **Fix:** Recheck session/state after every awaited mutation and reconcile forms plus body markers together, including partial failures and GM handoff.

5. **Copying “the same actor” breaks for unlinked tokens.** Foundry’s `TokenDocument.actor` returns a distinct synthetic actor when `actorLink` is false (`documents/token.mjs:140`); cloning the token duplicates actor state, while linking it uses the base actor and loses the body’s overrides.  
   **Fix:** Initially require linked actors, or explicitly route every form action and state change to the body’s synthetic actor UUID.

6. **“Every token on the viewed scene” is not a body-selection policy.** It can include Matrix personas, manually placed astral tokens, and existing forms; which scene supplies bodies also depends on which owner processes the update. A scene-local body ID is inadequate for robust reconciliation.  
   **Fix:** Start projection from an explicit eligible body token and persist its full UUID, excluding persona/form tokens.

7. **The proposed FAB limiter never applies to projected forms.** [movement.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/movement.mjs:72) caps only the active combatant’s exact token UUID, while Stage 2 deliberately keeps that combatant attached to the body.  
   **Fix:** Resolve a form to its body combatant for turn eligibility and maintain a separate astral movement ledger.

8. **Checking whether a token is currently inside FAB misses crossings.** A drag can begin outside, traverse a FAB zone, and end outside without triggering an endpoint-based cap; entry and exit also make cumulative movement accounting ambiguous.  
   **Fix:** Split the finalized movement path at FAB boundaries and specify how normal-speed distance is charged across entry, exit, and repeated moves.

9. **The backend does not cover every movement operation.** Foundry’s `displace` action explicitly has `walls: null` (`config.mjs:2068`), and direct document repositioning is not equivalent to collision-constrained movement; the existing limiter also deliberately exempts non-tactical methods.  
   **Fix:** Enumerate supported tactical paths and intentional repositioning bypasses, then test keyboard, bent drags, previews, and direct updates separately.

10. **Center-line collision cannot enforce body-sized openings.** The plan quotes a minimum opening size but uses Foundry’s point-to-point collision test; a large token’s center can pass through a gap narrower than its body.  
    **Fix:** Add footprint-aware clearance tests for astral barriers or explicitly leave aperture size to GM adjudication.

11. **Astral-only magical barriers cannot be represented correctly.** Requiring a flagged wall to have physical `move != NONE` makes a ward block physical bodies; setting physical movement to `NONE` makes that ward ineffective against astral forms.  
    **Fix:** Separate astral obstruction from physical movement, using an astral-specific edge restriction while preserving ordinary wall behavior for physical tokens.

12. **FAB perception omits perceiving magicians.** Stage 3 derives `inFab` only from astral-form or astral-only tokens, so a physically present, astrally perceiving magician receives no modifier. Actor-wide inference also becomes ambiguous with several tokens.  
    **Fix:** Pass the observing token UUID into the roll context and evaluate its FAB membership, including physically embodied astral perception.

13. **FAB-UV search has no defined per-intruder result.** The plan rolls every searcher but never defines aggregation, then refers to “the intruder” and reveals every astral token; one stealthy intruder and one unopposed intruder cannot share that outcome.  
    **Fix:** Specify the supported group-test procedure and calculate awareness, Stealth cancellation, net successes, and reveal separately for each intruder.

14. **Reveal flags can remain stale or overwrite each other.** A single `{region, extra}` cannot represent overlapping successful searches; deleting/disabling a behavior or reshaping a region is absent from the cleanup rules. Existing visibility refresh hooks also do not watch `fabRevealed`.  
    **Fix:** Store reveal records per behavior UUID, validate current membership/UV/enabled state during visibility evaluation, and refresh on every relevant token, region, and behavior change.

15. **Fast movement becomes unlimited tactical movement.** The plan’s own rules give a finite Magic-kilometres allowance and restrict fast astral combat, yet Stage 3 removes the cap outside FAB without tracking movement mode or enforcing either condition.  
    **Fix:** Model normal versus fast movement explicitly, or retain normal tactical limits and make fast travel a separate GM-adjudicated action.

16. **The opt-in policy contradicts the implementation.** “Scene-level world setting” describes two different scopes; a default-on world setting also immediately affects existing spirits already flagged `astralOnly` by [astral.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/astral.mjs).  
    **Fix:** Define an explicit scene flag and its default, with any world setting serving only as the default for scenes.

17. **Manifest declaration alone does not implement a RegionBehavior.** Stage 3 names `documentTypes` but omits the runtime data-model registration needed for the proposed fields and behavior implementation.  
    **Fix:** Follow `registerJackpointBehavior()` with a `RegionBehaviorType` subclass, schema, `CONFIG.RegionBehavior.dataModels` registration, and explicit event handlers where needed.

The book renders were not supplied or located in the repository, so I cannot independently endorse the quoted rules, FAB rounding, or group-search interpretation. The rules findings above identify contradictions within the plan’s own stated rules.

A simpler first delivery is Stage 1 plus GM-preplaced, explicitly paired linked astral tokens; automate their lifecycle only after the authority and reconciliation contract is defined.

VERDICT: REVISE
### Claude's response (round 1)
All 17 were accepted in substance. The changes:
- #1: unflagged wall edges are excluded, and flagged ones defer to super (open doors via `edge.move`).
- #2, #3 and #4: the active GM is the only lifecycle writer. A desired-state reconcile runs through a serial queue, keyed by body UUID, with no socket.
- #5 and #6: automatic forms are for linked actors only. Bodies are explicitly eligible tokens (personas and forms are excluded), and each form stores its body's full UUID.
- #7, #8 and #15: forms resolve to their body's combatant. A form's speed is normal Int×4, with a fast toggle. Any path that touches FAB caps the whole move.
- #9: the bypasses are listed.
- #10: aperture size is left to the GM.
- #11: the "ward" kind is included regardless of `edge.move`.
- #12: the observer token UUID is passed into the roll, so perceiving mages count.
- #13: one roll for the singular test; Stealth, net and penalty are per intruder.
- #14: reveal records are per behaviour, validated live, with refresh hooks.
- #16: the scene flag is backed by a world default.
- #17: the full registration follows the jackpoint pattern.

Not adopted: the "Stage 1 + manual paired tokens first" alternative. The GM-driven reconcile addresses the authority concern without dropping the automation.

## Round 2 — Codex
The revision resolves several earlier blockers, but concrete implementation gaps remain. No files were modified.

1. **The persona exclusion checks the wrong flag.** Item 9 uses `flags.sr2e.matrixPersona`; [jackpoints.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/jackpoints.mjs:68) actually uses `flags.sr2e.persona`. Projecting therefore creates astral forms for Matrix personas.  
   **Fix:** Use the existing `persona` flag and test exclusion with a token created through the actual jackpoint workflow.

2. **The documented movement bypasses still contradict V13.** `blink` lacks `walls: null`; Foundry’s `game.mjs:827` defaults its restriction to `"move"`, and `Token` checks that restriction independently of `teleport`. Also, `sr2eBypassMovement` bypasses only the system’s distance limiter—it is not passed into the polygon backend.  
   **Fix:** Separate distance-limit bypasses from wall-collision bypasses and document/test `blink` as collision-constrained.

3. **GM handoff does not trigger reconciliation.** When the active GM disconnects, another already-connected GM becomes designated without receiving `ready` or `canvasReady`; unfinished lifecycle work can remain indefinitely. Foundry exposes the relevant `userConnected` hook in `documents/collections/users.mjs:129`.  
   **Fix:** Reconcile affected scenes on GM designation changes and recheck writer authority immediately before each mutation.

4. **Lifecycle eligibility changes are missing from the trigger list.** Changing a body’s `actorId` or `actorLink` changes the desired forms but is not a flags update; deleting its actor is also absent. Moreover, `reconcileAstralForms(scene)` never specifies which scenes an actor update schedules.  
   **Fix:** Handle actor deletion and token actor/link changes, and explicitly schedule every scene containing a relevant body or form.

5. **Duplicate cleanup needs a deterministic survivor.** Body UUID identifies the group, not the winning form; two overlapping GM passes can each regard a different form as surplus and delete both. Foundry designates a GM **user**, which also does not distinguish two tabs logged into that account.  
   **Fix:** Define a stable survivor ordering, revalidate it before deletion, and either coordinate same-user tabs or state and enforce a single-writer-tab constraint.

6. **The new form is not necessarily hidden from mundane viewers.** `astralAllowsView` explicitly permits `friendly` tokens, and [astral.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/astral.mjs) supplies that disposition independently of viewer astral state. A friendly PC form can consequently be visible before any FAB search.  
   **Fix:** Give projection forms an explicit visibility policy that excludes the friendly-token exception, while preserving ownership and GM access.

7. **Live reveal validation does not prevent stale reveals from reactivating.** Exit then re-entry, or UV off then on, restores validity to the same record unless cleanup actually deleted it; the listed lifecycle reconciler does not run on token position or behavior changes. A rapid toggle can also disappear inside the debounce window.  
   **Fix:** Invalidate reveal records on the actual exit/UV-disable/behavior-disable transitions, with serialized cleanup or a generation identifier that prevents reuse.

8. **Region bounds are not region area.** Foundry’s `RegionDocument.bounds` is an enclosing `PIXI.Rectangle` (`documents/region.mjs:157`); it overcounts ellipses, separated shapes, and holes. Summing constituent polygon areas also needs union/hole handling.  
   **Fix:** Compute area from the region’s resolved triangulation or polygon tree and convert pixel² to scene-unit² before calculating the search TN.

9. **Fast movement remains unlimited despite the stated rule.** The HUD flag makes the mode explicit, but item 15 still removes the cap entirely instead of applying Magic kilometres per action; it also offers fast mode only to forms, excluding astral-only spirits.  
   **Fix:** Enforce the stated finite allowance for eligible astral tokens, or make fast travel a separate GM-adjudicated action outside tactical dragging.

10. **FAB enforcement depends on how the same route is divided into drags.** A single long fast drag touching FAB is normal-capped, while splitting it into an outside fast drag and a short FAB drag can produce a different result; unspecified fast-distance ledger handling can instead make subsequent normal movement impossible. Foundry already provides `RegionDocument.segmentizeMovementPath` (`documents/region.mjs:297`).  
    **Fix:** Specify fast/normal ledger accounting and use region path segments so equivalent movement has equivalent cost regardless of drag boundaries.

11. **The FAB penalty specification contradicts itself.** The rules section says six successes cancel +4, but `max(0, 4 − (net − 1))` reaches zero at **five**; testing only “6+ → 0” conceals the discrepancy.  
    **Fix:** Resolve the five-success case against the book render and explicitly test net successes 0 through 6.

12. **A computed body marker can still render stale.** Item 10 says it “can’t go stale,” but computing it in `refreshToken` only helps when a refresh occurs; the existing astral actor-update hook requests visibility refresh, not an explicit redraw of the proposed body cue.  
    **Fix:** Refresh the body cue on every eligibility-changing event rather than relying on unrelated token rendering.

The corrected door handling, linked-actor restriction, body-combatant lookup, observer-token context, and RegionBehavior registration are sound improvements. The remaining tests should cover actual persona flags, GM handoff, duplicate survivor selection, mundane-friendly visibility, reveal re-entry, and equivalent split versus unsplit movement.

VERDICT: REVISE
### Claude's response (round 2)
Accepted:
- #1: persona flag.
- #2: blink is collision-checked; bypasses split.
- #3: `userConnected` handoff, plus an authority recheck before each write.
- #4: actor delete and token actorId/actorLink triggers; scene scheduling spelled out.
- #5: lowest-id survivor, so same-user tabs converge.
- #7: per-behaviour epoch plus transition cleanup; the no-GM limitation is stated.
- #8: area from the polygon tree, not bounds.
- #9 and #10: fast movement is a finite Magic×1000 m on one per-phase ledger; FAB metres via segmentizeMovementPath make the whole phase normal-mode, so split and unsplit routes are equal.
- #11: the book says "5 total successes eliminates the penalty", so the formula was right and the prose was wrong; the prose is fixed and 0–6 are tested.
- #12: explicit refreshState on triggers.

Rejected:
- #6: the friendly exception in astralAllowsView is a deliberate, documented playability rule (allied spirits show translucent to the party). Projection forms follow the same policy for consistency. Ownership and GM access are unaffected.

## Round 3 — Codex
The friendly-visibility exception is now an explicit playability policy; I accept that rejection. The corrected persona flag, GM authority getter, handoff trigger, and finite fast-speed cap match the source. Five issues remain:

1. **The behavior declares no handlers but requires one.** Item 14 says “no event handlers”; item 17 depends on `tokenMoveOut`. Foundry dispatches only registered events (`client/documents/region-behavior.mjs:78`).  
   **Fix:** Explicitly register the cleanup events in the behavior’s static `events` map and remove the contradictory statement.

2. **`tokenMoveOut` misses non-movement exits.** Reshaping a region around a stationary token emits `tokenExit`, not `tokenMoveOut`; restoring its boundary would reactivate the old reveal. Foundry documents these cases in `common/constants.mjs:1953` and distinguishes the events in `client/documents/token.mjs:2095`.  
   **Fix:** Invalidate reveals on `TOKEN_EXIT`, including region-boundary changes, and test shrinking then restoring a region.

3. **The epoch mechanism lacks its schema and atomic update contract.** Item 14 defines only `strain` and `uvLit`, while item 17 requires persisted `system.uvEpoch`; it also never specifies who increments it or whether activation and increment share one write. A later increment leaves a window where old reveals become valid.  
   **Fix:** Declare `uvEpoch` in the schema and update it atomically with every UV-on or re-enable transition, with equality explicitly required by the live visibility predicate.

4. **Search results can outlive the conditions under which they were rolled.** A search can await dialogs or Stealth rolls while the intruder exits/re-enters or UV cycles; writing the result afterward can reveal the intruder using an obsolete search, even if exit cleanup already completed.  
   **Fix:** Capture the behavior epoch and intruder membership generation when the search starts, then reject stale results immediately before writing each reveal.

5. **The whole-phase FAB rule still changes the stated movement rules.** A mage with a 24 m normal allowance who fast-travels 100 m outside FAB cannot subsequently enter it by 1 m: the proposed check rejects the accumulated 101 m. Conversely, moving 1 m inside FAB prevents fast travel after leaving for the rest of the phase. Segmenting the path does not fix this while the whole-phase restriction remains.  
   **Fix:** Account for normal-speed FAB segments separately from outside fast travel, or explicitly document and obtain acceptance for this additional house rule.

One API correction: use `RegionDocument.polygonTree` directly. `region.object.polygonTree` is a deprecated forwarding getter (`client/canvas/placeables/region.mjs:361`) and unnecessarily requires a canvas object.

No files were modified.

VERDICT: REVISE

### Claude's response (round 3)
All five accepted, plus the API correction:
- #1 and #2: TOKEN_EXIT registered in `events`.
- #3: uvEpoch in the schema, bumped in the same update by `_preUpdate`, strict equality.
- #4: epoch and membership captured at search start and re-checked before each write.
- #5: replaced the whole-phase rule with two independent cumulative caps (FAB metres ≤ normal; total ≤ mode cap).
- The polygon tree is read from RegionDocument.

## Round 4 — Codex
The event registration, epoch schema, atomic `_preUpdate` update, and `RegionDocument.polygonTree` corrections are supported by V13. Two substantive issues remain:

1. **The stale-search guard still misses exit-and-re-entry.** Item 17 captures a membership boolean, not a membership generation. Sequence: start search → intruder exits → cleanup deletes the record → intruder re-enters → search finishes. Both membership checks are true and the epoch is unchanged, so the obsolete result creates a new reveal. Deleting an earlier record cannot invalidate an outstanding search.  
   **Fix:** Capture a per-token/per-behavior generation that changes on `TOKEN_EXIT`, and reject results whose captured generation no longer matches; test this exact sequence.

2. **Changing from fast to normal still retrospectively charges fast distance against the normal allowance.** With a normal cap of 24 m, travel 100 m fast, switch fast off, then attempt 1 m normally: `metres = 101` exceeds the newly selected 24 m mode cap. The two-cap revision fixes FAB entry while fast remains selected, but not slowing down afterward.  
   **Fix:** Record distance by the mode used for each segment, charging FAB segments to normal movement regardless of the toggle, without reclassifying previously travelled fast distance.

One implementation clarification would prevent a geometry bug: `RegionDocument.segmentizeMovementPath` requires explicit sample offsets; finalized token waypoints use token positions. V13’s `TokenDocument.segmentizeRegionMovementPath(region, waypoints)` already supplies center offsets and handles size, shape, and teleport actions (`client/documents/token.mjs:2459`). Prefer that wrapper, and count overlapping FAB regions as a union.

Also remove the obsolete “path-touch … rather than splitting” decision, which contradicts the revised segmented accounting.

No files were modified.

VERDICT: REVISE

### Claude's response (round 4)
Accepted:
- #1: a per-token, per-behaviour exit generation, captured and re-checked.
- #2: segments are charged by the mode travelled into normalMetres and fastMetres; FAB segments always count as normal.
- Segmentation uses TokenDocument#segmentizeRegionMovementPath, with overlapping regions charged once.
- The obsolete path-touch decision is removed.

## Round 5 — Codex
The movement-accounting revisions address round 4: prior distance retains its mode, FAB overlaps count once, and the token segmentation wrapper matches V13.

One race remains in item 17. **Exit-generation updates and search commits are not serialized.** Foundry dispatches `TOKEN_EXIT` without awaiting its handler (`client/documents/token.mjs:2114`). An exit/re-entry can therefore occur while the generation write is pending; a finishing search can read the old generation and submit its reveal after cleanup. The reveal stores only `{extra, epoch}`, so the eventual generation increment cannot invalidate that late write.

**Fix:** Serialize exit invalidation and search commits per token/behavior, store the captured exit generation in each reveal, and require generation equality during live visibility evaluation.

Add a regression test that delays the exit-handler write while the intruder re-enters and the search finishes; the current sequential test would miss this.

No files were modified.

VERDICT: REVISE

### Claude's response (round 5, final)
Accepted: the reveal stores the captured exit gen, the live predicate requires gen equality, exit and commit are serialized per token+behaviour, and a delayed-write regression test is added. MAX_ROUNDS reached. Codex had no other open findings; the round-5 issue is fixed exactly as it proposed.
