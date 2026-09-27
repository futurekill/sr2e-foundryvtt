# Plan Review Log: Matrix jackpoints
Started 2026-09-27. MAX_ROUNDS=5.

## Round 1 — Codex
Reviewed the plan, requested repo files, and installed Foundry **13.351** source. No files changed.

1. **P1 — Token permissions are incorrectly described (lines 22, 58, 65–69).** Core defaults both `TOKEN_CREATE` and `TOKEN_DELETE` to ASSISTANT; the probed PLAYER grant is world configuration. An online owner may create successfully yet lack deletion permission, preventing the GM fallback from running. **Fix:** Preflight both permissions and assign cleanup to a capable executor regardless of owner presence.

2. **P1 — Jack out discards its cleanup instructions (lines 64–72).** `updateActor` receives the updated actor; when Jack out clears the session alongside `matrixMode`, the hook cannot retrieve the old origin/persona data. **Fix:** Persist an ending session until cleanup completes, then clear it.

3. **P1 — The session has no identity (lines 52–57).** `sessionId` is used on the persona but never defined or stored in the session; no persona UUID is recorded either. **Fix:** Persist a random session ID, actor UUID, initiating user ID, lifecycle phase, and persona UUID.

4. **P1 — A local queue does not serialize multiple owners (lines 49–59).** Two clients can both pass eligibility, overwrite the session, and create separate personas; two tabs under one user also defeat user-ID election alone. **Fix:** Use one authoritative session executor with serialized requests and session-scoped duplicate reconciliation.

5. **P1 — Jack in can finish after dump cleanup (lines 51–60).** Dumping between the actor update and persona creation can clear the session, after which the original operation creates an orphan and switches scenes. Delayed cleanup can also clear a newer session. **Fix:** Revalidate session ID and phase after every asynchronous step, and serialize start/end through the same authority.

6. **P1 — A standard status effect cannot mark only the body (lines 54–55).** Installed V13’s deprecated `Token#toggleEffect` forwards to `Actor#toggleStatusEffect`, affecting the persona and every linked token too. Repeated toggles are also non-idempotent. **Fix:** Render a body-specific indicator from an origin-token flag, with explicit set/clear operations.

7. **P1 — Unlinked tokens cannot share an actor this way (lines 56–57).** A second token using the same `actorId` gets either the world actor or its own ActorDelta, not the body’s synthetic actor; damage, dump shock, and session state diverge. [V13 TokenDocument API](https://foundryvtt.com/api/v13/classes/foundry.documents.TokenDocument.html). **Fix:** Initially require linked tokens, or explicitly route all persona operations to the origin synthetic actor UUID.

8. **P1 — “Owner” is not the initiating viewer (lines 65, 73–75).** Multiple owners—and GMs passing ownership checks—can all restore or return views; a GM owning many session actors can trigger competing scene draws on reload. **Fix:** Keep view participation per client, separate from actor ownership and persistent cleanup authority.

9. **P1 — Player-written flags are not authorization (lines 52–53, 73–79).** An actor owner can forge `destScene` and reload into it; any future GM executor trusting those flags could also create/delete documents for forged requests. Navigation hiding cannot protect scene data already delivered to a client. **Fix:** Validate privileged actions against GM-authored jackpoint configuration and authoritative actor/token relationships; explicitly describe scene hiding as cosmetic.

10. **P1 — Failed creation and reload policies contradict each other (lines 58–59, 75–76).** Creation failure preserves a session awaiting manual placement, but reload ends any session missing its persona; no adoption mechanism identifies a GM-placed replacement. **Fix:** Either roll back failed creation or define a persistent pending-placement phase with explicit persona adoption.

11. **P1 — Offline cleanup is not actually guaranteed (lines 68–76).** If nobody capable is online when the update happens, no future update necessarily retriggers cleanup; ready handling only describes owners with `matrixMode:true`. **Fix:** Reconcile active, ending, and orphaned sessions on GM readiness/authority changes and relevant document deletion, including false-mode sessions.

12. **P2 — Registration is incomplete, though the manifest approach is valid (lines 29–34).** `documentTypes.RegionBehavior` declares the subtype but does not install `JackpointBehaviorData`; the plan omits runtime registration. `DocumentUUIDField({type:"Region"})` is valid and used by core. **Fix:** Explicitly import/register the model during `init`, preserve core models, and supply its label/icon.

13. **P2 — UUID validation is weaker than the plan assumes (lines 33–38, 79–81).** `DocumentUUIDField` validates UUID structure/type, not target existence or access; nullable defaults permit no destination, and an Actor UUID does not establish the `host` subtype. [V13 field API](https://foundryvtt.com/api/v13/classes/foundry.data.fields.DocumentUUIDField.html). **Fix:** Resolve and validate destination and host at configuration, entry, and reconciliation, checking the actual initiating player.

14. **P2 — `token.regions` needs the correct object (lines 46–47).** The region set belongs to `TokenDocument`; `hud.object` is the canvas Token. The existing astral HUD correctly uses `hud.object.document`. **Fix:** Use `hud.object.document.regions`, check behavior activity, and define selection when multiple jackpoints overlap.

15. **P2 — “Region centre” is not a reliable spawn location (lines 56–57).** Concave, disconnected, or holed regions can have a bounds centre outside their area; token coordinates also describe its top-left, and destination placeables need not exist off-canvas. **Fix:** Store or compute a document-based valid entry position with token-size and elevation handling.

16. **P2 — Awaiting `Scene#view()` does not guarantee a switch (lines 60, 73–75).** Installed V13 returns early while `canvas.loading`; immediate panning can target the old canvas, and a persona with unsuitable vision settings can leave the player blind. **Fix:** Serialize local view transitions, verify the destination canvas is ready, and configure/control persona vision before panning.

17. **P2 — Deck eligibility disagrees with existing data derivation (lines 44–45).** `_snapshotActiveDeck()` requires cranial decks to be active as well as working, and preserves manual cyberdeck specifications as a supported fallback; the proposed predicate misses both distinctions. **Fix:** Centralize eligibility around the effective deck snapshot and explicitly preserve or reject manual decks.

18. **P2 — NPC support exceeds existing dump support (lines 44, 63).** `actor.mjs` Matrix resistance and crash-triggered dump handling accept character deckers, not NPC deckers. **Fix:** Restrict this version to characters or extend and test NPC Matrix resistance/dump handling.

19. **P2 — Combat deferral overlooks a new shared-state consequence (lines 84–85).** `_getInitiativeParts()` reads actor-wide `matrixMode`, so the body’s next initiative roll also becomes Matrix initiative; existing initiative values do not automatically change. Persona deletion may additionally affect its combatant. **Fix:** Specify body/persona combat participation and teardown rules, or reject session entry during unsupported combat states.

20. **P1 — GM-only Quench tests bypass the main failure modes (lines 90–101).** They cannot establish player permissions, isolated views, competing owners, or disconnect recovery. **Fix:** Add actual player/GM client scenarios covering denied create/delete, two owners/tabs, dump during creation, immediate re-entry, reload at every phase, forged flags, unlinked tokens, and combat teardown.

A simpler first version would require linked character tokens, let the GM pre-place a persona, store jackpoint configuration on Region flags, and make the player action update Matrix mode plus that client’s view. This removes runtime token creation/deletion and custom behavior registration. If introducing GM coordination, respect `CLAUDE.md`’s documented unreliable `system.*` relay and verify transport before depending on it.

VERDICT: REVISE
### Claude's response
Accepted the core critique and Codex's own simpler shape: no runtime persona creation/deletion (GM places personas once; dimmed when logged off), flags-only state keyed by a session id with match-only cleanup, per-client view records in localStorage, GM reconciliation on ready, body marker from a token flag (not an actor status), characters with linked tokens only, deck eligibility from the Matrix's own deck snapshot, destination always re-read from the GM-authored behaviour, explicit registration + validation, combat stated not automated. Multi-client cases go to a manual QA pass (Quench is one client).

## Round 2 — Codex
Round 1 resolves runtime token permissions and unlinked-actor scope, but **the remaining session and view races still block approval**. No files changed. References below are to the revised plan.

1. **P1 — `localStorage` is not per client/tab (66–78).** Two tabs on the same origin share the record; another tab can restore the decker’s view or erase its return record. The key also lacks world/user scoping. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API).  
   **Fix:** Use tab-scoped `sessionStorage`, namespace by world/user, and define duplicated-tab handling.

2. **P1 — Matching IDs before an update is not atomic conditional deletion (73–76).** Owners A and B both check session S; A clears S, a new session T starts, then B’s delayed flag deletion clears T. Idempotence does not prevent this.  
   **Fix:** Serialize all session transitions through one authority, or use session-keyed records whose cleanup cannot delete another session.

3. **P1 — Concurrent Jack ins still overwrite each other (58–62).** Two owners’ local queues both see no session and write different IDs; both clients shift, but only the winning session receives normal return handling.  
   **Fix:** Define arbitration and reconcile displaced local sessions immediately when the actor’s session ID changes.

4. **P1 — Dump during Jack in still leaves stale state (59–68).** After the actor update, dump cleanup can finish before the body flag and view record are written; the original action then marks the body and moves the client despite `matrixMode:false`.  
   **Fix:** Revalidate the session after each awaited step and reconcile cancellation before writing markers or switching views.

5. **P1 — The extra body flag creates unnecessary distributed cleanup (63–65, 73–83).** It can survive a partial failure, and reconciliation only removes stale markers—it does not restore missing ones.  
   **Fix:** Derive the body marker directly from the actor’s live session and matching `originToken`, eliminating the token write entirely.

6. **P1 — Deleted or edited destinations lack defined recovery (61–62, 79–83).** Reconciliation checks mode/session matching but does not specify what happens when the behavior, origin token, destination region, or scene disappears; editing a behavior can send a reloaded client somewhere different.  
   **Fix:** Define invalidation and retargeting rules, end unusable sessions, and choose a fallback when the origin scene is gone.

7. **P1 — Waiting for canvas readiness after `view()` misses its failure case (67–68).** Installed V13.351 returns early if `canvas.loading`; the proposed sequence can wait on or pan the wrong scene. Clearing the return record after such a failed switch loses recovery.  
   **Fix:** Serialize view transitions, wait before calling `view()`, verify the resulting scene ID, and retain recovery state until success.

8. **P2 — Eligibility omits explicit ownership (49–57).** The shared predicate can advertise an action that later fails its actor update; a HUD’s visibility is not sufficient authorization for a callable action. GM cleanup also trusts player-authored `originToken` references.  
   **Fix:** Check actor/token ownership at action time and validate that referenced origin tokens belong to the session actor before any privileged cleanup.

9. **P2 — Persona identity is undefined (43–48).** There is no flag or UUID distinguishing a persona from another linked token; multiple destination tokens are ambiguous, and every persona on every Matrix scene would appear logged in whenever the actor has any session.  
   **Fix:** Give pre-placed personas explicit identities and determine activity from the session’s resolved destination and selected persona.

10. **P2 — No-persona entry can produce an unusable view (47–48).** Panning does not provide token vision, and the missing persona also removes its Jack out HUD.  
    **Fix:** Either require a correctly configured persona before entry or provide a defined spectator view and an always-available return action.

11. **P2 — A single view record cannot track multiple owned actors (66–68).** Jacking in a second character overwrites the first return record while its session remains live. Returning also now forcibly interrupts unrelated scene browsing, unlike Round 0’s destination check.  
    **Fix:** Allow one participating session per tab and return automatically only while that tab still views its session destination.

12. **P2 — Visual restoration is underspecified (45–46, 64–65).** A `refreshToken` tint needs explicit refresh triggers and restoration when state changes; copying the astral cue’s one-way mutation can leave stale dimming.  
    **Fix:** Refresh affected tokens on session changes and restore document-derived appearance when the cue becomes inactive.

13. **P1 — Tests still assert the removed design (107–112).** They require persona placement at the entry and disappearance on exit, although personas now persist; the proposed manual pass does not enumerate the outstanding concurrency cases.  
    **Fix:** Rewrite assertions for persistent personas and add two-owner/tab, delayed cleanup, dump-during-entry, missing-document, failed-view, and reload-between-writes scenarios.

14. **P2 — Contradictory claims remain (22, 32–33).** PLAYER token creation is still called a default, and “only runtime writes are flags” contradicts the `matrixMode` update; actor and marker changes also propagate across clients.  
    **Fix:** Remove the stale permission claim and describe the actual shared-state writes and local-only view transition.

The smallest further simplification is to eliminate the body flag, use a tab-scoped view record, and define one explicit session-transition authority. Persistent personas remove token lifecycle problems; they do not make actor flag updates race-free.

VERDICT: REVISE
### Claude's response
All accepted as 'Round 2 amendments': keyed session records (self-delete only), earliest-wins arbitration, re-check after every await, derived body marker (no token write), tab-scoped sessionStorage record, serialised verified view switches, GM-marked personas (no persona → no jack-in), invalidation/retargeting rules, ownership checks at action time, tests rewritten.

## Round 3 — Codex
Round 2 fixes cross-session flag deletion and removes body-marker cleanup. The arbitration and return-view rules still have concrete failures. No files changed; references are to the Round 2 amendments.

1. **P1 — GM cleanup contradicts arbitration (121–126).** The earliest key wins, but the GM deletes keys “older than the live one”; newer losing keys survive if their client disconnects, then can become winners when the original session ends.  
   **Fix:** Reconcile all non-winning keys, including abandoned losers, using the same arbitration function everywhere.

2. **P1 — A late loser can already be viewing the Matrix (121–129).** Client B writes, sees itself as winner, and switches; A’s earlier-ranked record arrives afterward, so B loses but “keeps its view,” stranded without a live session.  
   **Fix:** On losing arbitration, cancel pending entry or return an already-entered tab using its view record.

3. **P1 — Session keys do not protect the shared `matrixMode` boolean (124–129).** A delayed concurrent entry can write `true` after dump shock writes `false`; its subsequent checks all pass, effectively undoing the dump. Existing dump and sheet actions write that boolean directly.  
   **Fix:** Define a shared ordering mechanism for entry and termination, such as an authoritative transition executor or session generations with durable termination records.

4. **P1 — Return detection loses the destination it needs (133–156).** The local record stores no viewed destination: deleting the behavior makes it unresolvable, while retargeting changes it from scene A to B, so a tab still on A fails the “currently viewing destination” return condition.  
   **Fix:** Store the last successfully entered destination scene locally and use that historical value solely for return/recovery.

5. **P1 — Recovery-record persistence still has an undefined crash window (128–140).** The sequence does not specify writing the tab record before the actor update; reload after that update can leave a live session with no participating tab, and GM cleanup retains it while mode remains true.  
   **Fix:** Persist a pending tab record before the actor write, then reconcile pending, entered, and returning phases explicitly.

6. **P2 — Live retargeting is promised without an execution path (146, 150–156).** Only actor changes trigger refresh, and validation occurs on use/ready; editing a behavior does not change the actor, so an idle live session neither retargets nor refreshes its personas. Retargeting also bypasses the required-persona entry check.  
   **Fix:** Handle relevant behavior/region/scene updates and deletions, revalidate the new destination’s persona, and serialize any resulting view transition.

7. **P2 — Origin-token and persona loss remain unspecified (147–158).** Origin tokens are resolved but no outcome is given for deletion or unlinking; persona deletion is absent from invalidation, and body ownership checks can block HUD Jack out after the body disappears.  
   **Fix:** Define invalidation for missing/unlinked/mismatched origin or persona tokens and allow an actor owner to end their session without an extant body.

8. **P2 — Persona existence does not guarantee vision (141–149).** A marked linked token may be hidden or have sight disabled; on a scene requiring token vision, the player can still land blind. Multiple marked tokens also leave the pan target ambiguous.  
   **Fix:** Select a definite persona and validate its visibility and vision configuration before entry and retargeting.

9. **P1 — The tests miss the asynchronous ordering that breaks arbitration (168–176).** Writing two keys together does not test a client switching before the competing key arrives, nor a delayed entry arriving after a dump.  
   **Fix:** Add controlled-delay tests for late winners, disconnected losers, entry-after-dump, reload between persistence steps, and deleted/retargeted destinations during return.

The keyed-record approach is useful, but it needs a defined ordering relationship with `matrixMode`; checking current state after an update cannot establish that relationship.

VERDICT: REVISE
### Claude's response
Accepted as 'Round 3 amendments'. #3 (ordering against the shared matrixMode boolean) is resolved by the system-wide one-driver contract plus a single per-actor 'matrix:' queue for EVERY transition on the driving client (jack in/out, sheet toggle, dump), with GM reconciliation converging otherwise — the same stated limit as drugs/Karma. Arbitration unified; phased tab record with entered destination; no live retargeting; lost-token rules; definite usable persona; tests added.

## Round 4 — Codex
The documented one-driver contract plus one queue resolves the ordering objection **within that supported scope**. I’m not requiring distributed serialization. Four remaining issues need revision; no files changed.

1. **P1 — The fixed destination exists only in one tab (191–205).** Shared session records still contain only the jackpoint reference. After the GM retargets it from A to B, other clients cannot know that the existing session belongs to A: persona lighting and GM destination validation can follow B while the decker remains on A.  
   **Fix:** Snapshot the validated destination scene in the shared session at creation; use that snapshot for ongoing session state and the tab history for return recovery.

2. **P1 — Reconciliation does not gate entry on `matrixMode` (195–200).** Reload after a dump’s `matrixMode:false` update but before key deletion leaves a winning key; the specified pending/entered branches resume viewing the Matrix. GM cleanup might eventually correct this, but the owner must recover without a GM.  
   **Fix:** Before phase handling, treat `matrixMode:false` or invalid session dependencies as termination, never as resumable entry.

3. **P1 — Return failure can discard recovery state (198–199).** Round 3 says to return and drop the record, overriding Round 2’s retention rule without distinguishing a confirmed switch from exhausted retries; a failed `view()` leaves the player in the Matrix with no recovery record.  
   **Fix:** Keep a returning record until the origin/fallback switch succeeds, and clear immediately only when intentionally preserving an unrelated current view.

4. **P2 — Pending reconciliation has no losing-key branch (195–200).** A pending record whose key exists but is not the winner matches none of the listed cases; this contradicts the promised convergence even though simultaneous driving is unsupported.  
   **Fix:** Explicitly cancel a pending loser, delete only its key, and clear its tab record without switching scenes.

Add focused tests for each: retarget while the decker is offline, reload with a winning key and mode off without a GM, failed return followed by retry, and pending-loser reconciliation.

VERDICT: REVISE
### Claude's response
All four accepted as 'Round 4 amendments': shared destination snapshot, termination-first reconciliation, returning phase kept until confirmed, pending-loser cancel; tests added.

## Round 5 — Codex: APPROVED

## Implementation review (same thread)
R1: 10 findings (queued/coalesced reconciliation, one session per tab, standing-at check in the action, deferred reconciles during entry, resume-only re-entry, missing-canvas recovery, exact-target entry, storage failure aborts, config validation + host suggestion, tests). R2: 1 (invalidation during a successful switch). R3: APPROVED. Quench jackpoints 8/8.
