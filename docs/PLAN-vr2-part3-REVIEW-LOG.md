# Plan Review Log: VR2.0 part 3
Started 2026-10-22. MAX_ROUNDS=5.
## Round 1 — Codex
The plan has material problems. Part 2 explicitly accepts some simultaneous-resolution limitations, but part 3 introduces routine GM/player concurrent writes and promises stronger idempotency than its proposed storage supports.

1. **The final black-IC attack happens too late.** §3 disconnects immediately and asks the GM to attack afterward. Existing `vr2MatrixResist` rejects attacks against an ended session; reconnecting also risks targeting the new session.  
   **Fix:** Persist a pending exit, resolve the final attack against the captured connection, then complete the exit.

2. **Card receipts cannot atomically protect actor/item damage.** Writing damage and subsequently setting `vr2BlackResist` on a ChatMessage leaves a retry window. A player also cannot generally update the GM-authored attack message. `commitDamage.extra` writes to the **actor**, not the card.  
   **Fix:** Store each authoritative receipt on the damaged actor/item in the same update as its effect; use card flags only for presentation.

3. **Local queues do not serialize GM and player writes.** The active GM decrements traces while the owner relocates, suppresses, exits, or changes sessions. Both clients can pass checks against stale state; similarly, concurrent deck-damage increments can overwrite each other.  
   **Fix:** Route mutations for each affected document through one designated writer, including timer and owner actions.

4. **Host changes silently erase connection-level consequences.** [`sessionFor`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2.mjs:125) replaces the session when another host is selected. That would clear black locks, traces, and “this run” redirects without jack-out or exit effects.  
   **Fix:** Separate connection/run identity from host-session identity, and define which transitions carry or resolve each effect.

5. **Permanent damage targets whichever deck is active later.** Gray damage and infection explicitly update the ACTIVE deck at resolution, allowing a deck swap during a pending card to redirect damage. Manual fallback deckers have no item to update.  
   **Fix:** Capture the deck UUID or explicit manual-deck target when the triggering action occurs and retain it through resolution.

6. **MPCP zero can restore authored persona attributes.** `_derivePersona` starts from authored values and only derives program attributes when MPCP is positive. Merely subtracting permanent damage from MPCP leaves the zero-MPCP case wrong. The proposed cap/subtraction order is also ambiguous.  
   **Fix:** Specify an explicit VR2 derivation formula for every attribute, including zero MPCP, manual fallback, chip damage, and subsequent session damage.

7. **Black lock lifetime and icon-down scope are undefined.** UUID-only `blackHit` records survive the IC crashing or being reused; “live” is never defined. Conversely, `iconDown[ic]` means another black IC does not recognize an already-destroyed persona. No action restriction implements “can only try to jack out.”  
   **Fix:** Use generation-qualified IC engagement records, actor-wide icon-down state, explicit invalidation rules, and shared action guards.

8. **Black resolution does not define one immutable attack outcome.** Resolving icon damage through the existing path closes the attack test/card, while meat resistance still needs it; resolving separately can use different Karma-adjusted successes. The plan also grants Karma without defining when damage becomes final.  
   **Fix:** Coordinate both resistances under one resolution record, freeze attack successes, finalize permitted Karma, and close only after both effects commit.

9. **Exit consequences are not recoverable or idempotent.** Disconnecting clears the session before psychotropic tests, tapeworm rolls, and datatrail outcomes necessarily finish. Crash-path `vr2LeaveMatrix` can also post dump shock again on retry.  
   **Fix:** Persist a receipted exit record outside the live session containing all pending consequences and resume it after reload.

10. **Graceful Logoff has no existing test to modify.** [`promptLeave`/`vr2LeaveMatrix`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2.mjs:1098) currently accepts a “Graceful Logoff” button; adding an IC-rating TN in the dialog cannot enforce anything.  
    **Fix:** Define and implement the actual logoff test, failure behavior, and interaction with black-IC gates.

11. **Trace storage and countdowns lose valid state.** A single `session.trace` lets a second trace overwrite the first. No boundary receipt prevents repeated ticks, and manual turns have no identity for `spoofedRound`. Ten or more successes produce zero turns without a specified immediate-completion path.  
    **Fix:** Key traces by IC incarnation and give each a persisted turn cursor, manual turn counter, and explicit zero-turn completion.

12. **Trace suppression bypasses its prerequisite.** “Keep it suppressed” is offered without requiring a successful Relocate, and reusing crash-choice release would charge the trace’s rating even though it was never crashed.  
    **Fix:** Give trace suppression its own transition after successful Relocate and a release operation that resumes counting without crash tally.

13. **Tar’s generation snapshot does not protect `crashed`.** Capturing `loadGen` alone cannot make a Boolean `crashed` affect an old copy; a delayed tar resolution can still crash a freshly swapped program. “One outcome per System Test” also blocks multiple applicable tar IC.  
    **Fix:** Store generation-specific crash effects and key outcomes by test, tar incarnation, and utility use.

14. **Tar pit corruption has no deck identity or complete usability rule.** “Every copy on the actor” can corrupt copies associated with another deck, while existing `usablePrograms` and `_derivePersona` do not exclude `corrupted`. Jack-out clearing also assumes an external clean copy exists.  
    **Fix:** Define deck/copy identity, exclude corruption in every program consumer, and make external reload an explicit operation or declared simplification.

15. **Reactive effects lack enough triggering context.** System Test cards currently omit `hostUuid`, protected-target identity, and utility item identity. Tar also triggers on program executions beyond System Tests, but §4 supplies no such integration.  
    **Fix:** Introduce a shared action snapshot containing host, session, deck, target, operation, and utility reference, and attach reactive choices to all eligible actions.

16. **Data bombs can explode repeatedly, and their exceptional trigger is missing.** `defused` is specified, but no spent state or explosion-generation receipt is. The all-ones defuse failure never reaches the implementation approach.  
    **Fix:** Model armed/defused/spent state per bomb incarnation and atomically claim each explosion, including the all-ones path.

17. **Scramble inherits incorrect tally behavior and overloaded links.** Existing `vr2SystemTest` always emits host tally and potentially probe tally; the plan says decryption adds none but supplies no policy change. Reusing `trapFor` for an exploding bomb also risks both generic trap and bomb handling on crash.  
    **Fix:** Define decryption’s tally policy explicitly and use separate typed trap and bomb links.

18. **Several promised rules have no implementation path.** These include cyberphobia’s pre-jack-in test, worm Disinfect/no-tally destruction and failed-removal infection, dataworm combat, trapped file/device failures, and deathworm removal when replacing MPCP.  
    **Fix:** Add explicit flows for each or mark them as deferred/manual in the goal and acceptance criteria.

19. **Shutdown is neither an idempotent start nor a durable host state.** Different deckers crossing shutdown sheaf rows can restart its countdown; `sheafApplied` and shutdown initialization are not specified as one update. At zero, nothing prevents new connections or repeated dump processing.  
    **Fix:** Give the host one shutdown lifecycle with atomic start, receipted ticks and per-session exits, an offline state, and explicit reset.

20. **The tests miss the failure modes introduced here.** The proposed checks mostly exercise successful sequences, not interrupted multi-document writes or competing clients.  
    **Fix:** Add targeted cases for GM/player races, interruption after each permanent mutation, reconnect/host/deck swaps, multiple traces, repeated shutdown delivery, and zero-MPCP derivation.

VERDICT: REVISE
### Claude response (round 1)
All 20 accepted. Rejected nothing. Biggest changes: a connection record separate from host sessions (§0); one designated writer per decker, with events from everyone else; receipts on the damaged document; a resumable exit record (§3a); deck reference captured at the trigger; crashedGen; typed bomb link; shutdown lifecycle; the failure-path tests.

## Round 2 — Codex
The revision fixes much of round 1, but these material problems remain:

1. **An existing exit cannot acquire newly required steps (§3a).** A voluntary exit starts with `lastAttack`; that attack causes unconsciousness, so §3 opens an exit with `finalShot`, but “a second open finds it there” leaves the original steps unchanged.  
   **Fix:** Merge newly required consequences into the existing exit by stable step keys, including a final MPCP shot caused by its last attack.

2. **“Either order” for black resistance permits premature exit (§3).** Meat damage can initiate and finish the exit before icon resistance resolves. Neither pending resistance completion nor a ban on ordinary actions during exit is specified.  
   **Fix:** Make both resistances prerequisites for attack completion, and permit only required resolution/exit actions while an exit is pending.

3. **Step completion flags do not make delivery reliable (§3a, §6).** Posting dump shock and then marking `done` can duplicate it after interruption; marking a bomb spent before posting its damage card can permanently lose the explosion.  
   **Fix:** Atomically persist pending delivery with the state transition, then deliver/reconcile cards by a stable consequence ID whose damage is independently receipted.

4. **Writer ownership remains incomplete (§0).** The designated decker owner generally cannot update hostile IC actors, yet defusing writes to the bomb and tar resolution crashes its IC. Choosing one writer for connection/session state does not serialize item damage, program changes, or IC state.  
   **Fix:** Assign an authority and queue to every mutated document, with GM-owned IC/host changes routed to the active GM and embedded-item changes to the character’s authority.

5. **Writer failover can strand events (§0).** Reconciliation only “on load” misses the case where the designated player disconnects while the GM remains loaded; an event received during the transition can remain unapplied.  
   **Fix:** Reconcile outstanding events on authority changes as well as load, and recheck authority inside queued jobs before committing.

6. **The crash-generation rule invalidates its own follow-up work (§0, §4–6).** Crashing tar increments its generation before tar-pit corruption; trap and exploding-scramble consequences also arise from an incarnation that just ended. Blanket rejection of older incarnations can discard these legitimate effects.  
   **Fix:** Distinguish stale action requests from already-committed transition consequences, which must remain deliverable after generation changes.

7. **`crashedGen` can undo a newer crash (§2, §4).** Generation 1 is tar-crashed; then a delayed generation-0 strike writes `crashedGen = 0`. The current generation-1 program becomes usable again.  
   **Fix:** Record crashed generations as immutable keyed entries, or prevent older generation writes from replacing newer ones.

8. **Deck-scoped corruption still lacks copy membership (§2, §4).** Existing program items have no deck assignment, so “every copy … on that deck” cannot be selected reliably. A single `{ deckUuid, receipt }` also cannot retain corruption on two decks.  
   **Fix:** Define program-to-deck membership, or store corruption by deck and stable program identity on the deck itself.

9. **Trace suppression becomes free after changing hosts (§0, §5).** Traces and their `frozen` state survive on the connection, but the suppression entry charging Detection Factor is lost when the host session is replaced.  
   **Fix:** Keep freeze state and its cost together, or explicitly unfreeze and release the cost during a host transition.

10. **Tick receipts prevent duplicates, not missed turns (§5, §7).** No reconciliation covers turns advanced without an active GM, skipped rounds, deleted combat, or switching to manual counting. “Current boundary” also leaves Relocate’s intended end-of-turn boundary ambiguous.  
    **Fix:** Specify a canonical completed-turn cursor and reconciliation policy, with Relocate explicitly targeting the next applicable boundary.

11. **Two claimed existing operations do not exist (§6).** `CONFIG.SR2E.vr2SystemOperations` contains neither Decrypt nor Disinfect; `vr2SystemTest` rejects unknown operations.  
    **Fix:** Add their operation definitions and required target/subsystem handling explicitly to the implementation scope.

12. **The revision dropped persistent psychotropic implementation details (§2–3, §6).** It no longer specifies condition storage, receipted implantation, recovery mutation, or the actual cyberphobia modifier hook. PCPIC is offered after each hit, whereas the rules summary requires repetition each turn after a hit.  
    **Fix:** Restore the condition schema and application/recovery flows, and schedule PCPIC’s recurring gate independently of subsequent hits.

13. **Shutdown still allows entry through existing jack-in paths (§7).** Refusing `sessionFor` and System Tests does not block jackpoint entry: `jackIn` enables Matrix mode and calls `startSession` directly.  
    **Fix:** Validate host availability in every entry path before establishing Matrix mode or connection state.

14. **Black icon-down handling implements only a Power bonus (§3).** The rules summary says effective **rating** rises by two, which also affects rating-based gates and special tests; the implementation specifies only Power. Its action guard also omits Medic and Swap Memory despite “only try to jack out.”  
    **Fix:** Define one effective-black-rating helper and apply the icon-down action guard to every actionable entry point.

Add regression cases for these exact sequences, especially final-attack unconsciousness, authority handoff, interrupted bomb delivery, and reverse-order tar resolutions.

VERDICT: REVISE
### Claude response (round 2)
All 14 accepted: exit steps merge by stable keys; both black resistances gate the attack and exits wait on it; an outbox written with each transition; one authority per document (GM for IC/host); failover reconcile; committed transition consequences survive the generation bump; crashedGens as immutable keyed entries; corruption stored on the deck by program key; trace freeze and its DF cost live together on the connection; canonical turn cursors with catch-up; the eight missing operations added from p.111-117 renders; psychotropic storage/implant/cyberphobia hook/PCPIC per-turn gate/recovery restored; every entry path refuses an offline host; blackRating helper and a shared action guard. Also: a stated reading on the p.45/p.117 redirect conflict.

## Round 3 — Codex
The revision is substantially stronger, but the new recovery guarantees still have concrete holes.

1. **`once()` can permanently strand bombs and shutdowns (§6–7).** [`once`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/claims.mjs:13) creates a separate ActiveEffect claim. If the client stops after winning but before writing `spent`/shutdown state and its outbox, every retry loses the claim; there is no outbox to reconcile.  
   **Fix:** Persist recoverable intent in the claim itself, or remove the separate claim under a properly enforced single-writer model.

2. **The authority is a user, not a single client (§0a).** Two tabs belonging to the designated owner—or active GM—both qualify and have independent queues. Checking authority inside a job does not distinguish them, nor fence a write already sent before failover. The repo’s [same-user writer plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-same-user-writers.md) explicitly documents this limitation.  
   **Fix:** Define client-level arbitration and takeover semantics, or explicitly retain a constrained single-client/manual-recovery model instead of promising safe automatic takeover.

3. **Exit steps still conflate delivery with completion (§3a).** Writing `done` alongside an outbox entry marks a resistance or attack finished before its card has even been delivered. That conflicts with the requirement to wait for both resistance receipts and with §3b, which writes psychotropic `done` only after resolving the test.  
   **Fix:** Separate `requested`, `delivered`, and `resolved`; only resolved steps satisfy exit completion.

4. **The exit barrier does not cover all pending black attacks (§3).** The text names pending `lastAttack`/`finalShot` steps, but an ordinary black hit can resolve meat first and open an exit while its icon resistance remains outstanding. Multiple cards from the same IC also overwrite the single `connection.black[icKey]` record.  
   **Fix:** Track pending attacks by card ID separately from engagement locks, and require every applicable pending attack to resolve before completing exit.

5. **Gray consequences are not ordered before disconnect (§4).** Existing `vr2MatrixResist` calls `vr2LeaveMatrix` immediately after a gray crash. The plan emits a separate gray event but does not make its MPCP damage and Sparky resistance prerequisites of that exit; the connection can disappear before the event arrives.  
   **Fix:** Commit the gray consequence and an exit dependency together, and allow the committed consequence to finish independently of live-connection validation.

6. **Deck identity remains inconsistent across one attack and its exit (§0, §3a).** The plan permits deck swaps: the attack captures the deck used then, but the final MPCP shot targets `connection.deckRef`, captured at jack-in. After a swap, the triggering attack and final shot can damage different decks. Hardening and hot/cool mode are also not explicitly pinned with the attack.  
   **Fix:** Either prohibit active-deck changes during a connection or propagate the triggering attack’s deck reference and relevant defensive snapshot into every consequence.

7. **The outbox does not preserve random outcomes by itself (§0a, §3a).** Posting a roll card, then recording its result, still leaves an interruption window; reconciling that a message exists does not specify how its result resumes the unresolved step. A retry can roll again or become stuck.  
   **Fix:** Persist the rolled result under the consequence ID before applying effects, and resume from that result rather than rerolling.

8. **Turn receipts do not solve Relocate/tick ordering (§5).** The GM can emit the end-of-turn tick while an already-started Relocate result is still being delivered. If the tick completes the trace first, later writing `spoofed` cannot undo completion and its trap outbox. A single writer merely serializes arrival order.  
   **Fix:** Define a turn-finalization barrier for pending actions, or explicitly require Relocate resolution before advancing the turn and reject late results.

9. **Incarnation keys are unsafe as Foundry update-path segments (§0–2).** `icKey` contains UUID dots, and compendium-based `programKey` does too. Interpolating these into dotted updates creates nested objects rather than the intended dictionary entries; reads and receipts then disagree. Existing VR2 code already uses `keyOf` for this reason.  
   **Fix:** Encode all UUID/source-derived map keys consistently, retaining the original identity in each record’s payload.

10. **The document still gives contradictory implementation instructions.** §2 requires immutable `crashedGens`, but §4 still writes scalar `crashedGen`; §5 defines Relocate’s target as the next boundary, then says to store the current boundary. These reproduce previously identified bugs if the local section is followed.  
    **Fix:** Remove the obsolete instructions and state each transition once, with other sections referencing it.

The regression suite should include interruption immediately after `once()`, two tabs of the same authority, ordinary black-hit meat-first resolution, delayed gray delivery, and a Relocate result arriving after its tick—not just successful delivery and duplicate replay.

VERDICT: REVISE
### Claude response (round 3)
All 10 accepted, by one architectural change: part 3 state is an append-only log of durable records with deterministic (claimId-hashed) keys, server-arbitrated, ordered by the server-stamped createdTime, rolls stored in the committing record, effects applied by once()-claim + receipt (Phase 4/6 pattern). This removes the designated writer (R3 #2: same-user tabs) and the outbox. Stuck claims are the documented PLAN-same-user-writers limit with "Apply anyway". Exit steps have requested/resolved/applied states; the exit barrier covers every pending hit per card and every gray consequence; one deck per connection (activation refused while connected) with a deck snapshot; Relocate spoofs count only if created before their boundary tick; obsolete instructions removed.

## Round 4 — Codex
The event log preserves outcomes better, and the explicit manual recovery limit is reasonable. But server rejection of duplicate record IDs does **not** serialize different records or make their downstream effects atomic. These material gaps remain:

1. **Different damage records can still overwrite each other (§0, §3).** Two clients can win claims for different attacks, both read a monitor at 0, and each write 3 boxes. Both receipts exist, but only 3 of 6 boxes landed. [`commitDamage`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:62) and `matrixDamage` serialize only within one client; the seizure pattern does not solve this cross-result race.  
   **Fix:** Serialize all monitor applications per target across clients, or explicitly constrain application to one client and provide manual takeover.

2. **Creation timestamps are not a total event order (§0).** Different records can share `_stats.createdTime`; damage/replacement, freeze/unfreeze, and competing bomb transitions then lack defined ordering. The existing MBW/Cybermancy folds include tie-breakers; the proposed fold specifies none.  
   **Fix:** Define a deterministic total order and explicit precedence for equal timestamps, with tests that shuffle equal-time records.

3. **Exit requirements are still created after the barrier can pass (§3–3a).** After meat damage is receipted, its client separately records `exit-open` and `finalShot`. Another client reacting to `exit-open` can see all currently recorded work complete and create `conn-end` before `finalShot` exists. A successful gate similarly opens an exit separately from its last-attack steps.  
   **Fix:** Derive required steps directly from committed trigger records, or include the complete initial requirement set in the exit-opening record.

4. **Connection identity is not server-arbitrated (§0, §3a).** Two entry clients can generate different `connId`s and successfully create both opens. “Latest open with no end” then resurrects the older connection after the newer one ends. Separately, interruption after `conn-end` but before clearing `matrixMode` leaves contradictory state; resuming only *open* exits misses it.  
   **Fix:** Arbitrate entry through a shared predecessor/generation key and reconcile session/Matrix-mode projection for ended connections, guarded against newer connections.

5. **Bomb terminal states use different keys (§6).** Defuse and explosion can both be accepted for the same incarnation. The plan does not define which transition wins, yet an explosion record independently authorizes a damage card. Folding the bomb as defused afterward cannot retract that damage.  
   **Fix:** Use one terminal-transition record per bomb incarnation, or define a winning transition and prohibit consequences from losing records.

6. **A trace can only be frozen once (§5).** `vr2:freeze:<connId>:<icKey>` has no cycle identifier, while unfreeze does. After releasing the first freeze, another successful Relocate cannot create a second freeze record.  
   **Fix:** Key each freeze/unfreeze pair by a suppression cycle or the successful Relocate record.

7. **Completed traces can lose their permanent connection effect (§5).** “A crashed trace IC ends its trace in the fold” does not distinguish a trace still locating from one that already completed. Filtering by current incarnation can erase `traced` after the security response and trap have already fired.  
   **Fix:** Make completion a terminal historical fact; later IC destruction stops unfinished traces but cannot undo an established trace.

8. **Permanent deck damage now belongs to the character, not the deck (§2).** Transferring a damaged or infected deck to another actor transfers the item but leaves all its records behind. Its new owner therefore receives a clean deck unless transfer behavior is explicitly extended.  
   **Fix:** Keep permanent hardware history on the deck, or implement a stable deck identity and atomic transfer/export of its history.

9. **Connection snapshots freeze MPCP before later permanent damage (§0, §3a–4).** A deck entering at MPCP 6 and losing 2 points still supplies MPCP 6 to a later final shot under “MPCP … from the snapshot.” That contradicts the newly derived effective MPCP of 4.  
   **Fix:** Pin deck identity, but capture the effective MPCP at each special test’s defined resolution point; distinguish fixed connection settings from mutable hardware condition.

10. **Excluding unusable persona programs can restore manual attributes (§2).** The derivation says to exclude crashed/corrupted programs, then fall back to authored attributes when no program is loaded. Existing part-2 code deliberately distinguishes “absent” from “present but unusable” so crashing a persona program produces zero rather than restoring its manual value.  
    **Fix:** Preserve loaded-program presence independently of usability and derive zero when all loaded copies of that persona program are unusable.

11. **Delayed consequence records can cross repair boundaries incorrectly (§2, §4).** A recorded gray result later creates a separate `deck-dmg` record. If the chip is replaced between those writes, ordering by the damage application’s creation time damages the replacement chip, although the attack hit its predecessor.  
    **Fix:** Bind permanent effects to a chip incarnation or order their eligibility by the original committed consequence, not the later materialization record.

Add tests for **two different damage applications**, competing connection opens, exit-open before step creation, simultaneous bomb terminal transitions, freeze–release–freeze, completed-trace destruction, and repair before delayed damage materialization. Duplicate creation of the *same* record does not cover these cases.

VERDICT: REVISE
### Claude response (round 4)
All 11 accepted: monitor/IC applications only by the active GM client (one queue per target), players only record; total order createdTime+key with single-key terminal states, cycle-keyed freeze pairs, chip-incarnation-bound damage; exit steps derived from trigger records; connection opens keyed by sequence number (server admits one) with a matrixMode projection repair; one bomb terminal record; freeze keyed by its Relocate; traced as a permanent terminal record; deck history as effects on the deck item (travels with it); effective MPCP folded at resolution (fixed settings snapshotted); loaded-but-unusable persona programs derive 0.

## Round 5 — Codex
Most earlier problems are addressed. The remaining blockers concern transitions between the event log and mutable Foundry state.

1. **Connection projection can still disconnect a newer connection (§0, §3a).** Multiple authorized clients may clear `matrixMode`. Two can pass the “no newer open” check; one clears it, a new connection opens, then the other’s delayed update clears the new connection. A client-local `matrixQueue` does not prevent this.  
   **Fix:** Route entry and exit projection through the same single GM-client queue, with no owner-side projection writes.

2. **Entry recovery is only half specified (§0).** The existing entry paths set `matrixMode` before `startSession`. Creating the connection record “beside” that call leaves interruption windows: mode-on without a connection, or a committed connection without completed session/jackpoint setup. Only ended-connection projection is reconciled.  
   **Fix:** Commit entry intent first and define resumable projection of the live connection, session, and jackpoint setup before allowing actions.

3. **Derived exit requirements still miss unrecorded crash consequences (§3a).** During an already-open exit, a gray attack can apply its persona crash before creating `vr2:gray:<card>`. Another client can pass the barrier in that interval: it checks recorded gray consequences and black hits, not the pending gray resolution. “Before opening the dump exit” does not help when an exit already exists.  
   **Fix:** Record every admitted attack’s pending resolution before applying damage, and include those pending resolutions in the exit barrier.

4. **Trace completion still has a loss window (§5).** A tick reaches zero, but the IC crashes before the separate `vr2:traced` record is created. The fold now ends the trace because its incarnation changed, potentially preventing the completion record altogether. The new terminal record protects completion only *after* it exists.  
   **Fix:** Persist completion with the completing tick, or record crash timing and derive whether completion preceded destruction from immutable history.

5. **“Locks live when the exit opened” lacks a historical source (§3a).** Hits are recorded, but lock validity depends on the IC’s current generation. If that IC crashes while the exit is pending, recomputing required last attacks can erase a requirement that existed at opening—or leave implementations guessing whether it should be cancelled.  
   **Fix:** Capture the locking IC incarnations in the exit-open payload and specify an explicit cancellation rule for an IC destroyed before its final attack.

6. **Attempt keys were accidentally collapsed (§3, §5).** `vr2:gate:<n>:<n>` and `vr2:redirect:<n>:<n>` use the connection number in both positions as written. A failed gate then occupies the key needed for another attempt; redirects cannot accumulate.  
   **Fix:** Use explicitly distinct `<connectionSeq>:<attemptSeq>` components and test repeated failed gates and multiple redirects.

Also resolve the conflicting chip-generation capture instructions: §2 says the **result** record captures it, while §3a says the gray **request** captures it. The request-time incarnation is the one that protects a replacement installed before resolution.

The accepted GM-tab and manual-recovery limitations need not be redesigned again. The cases above occur outside those accepted limits and need explicit handling before implementation.

VERDICT: REVISE
### Claude response (round 5)
All 6 accepted (no disagreement): matrixMode derived from the connection log for VR2 deckers (entry/exit write only records; no projection races); entry is the conn-open record, sessions lazy, jackpoint record reconciled; every admitted attack recorded pending before damage, in the exit barrier; trace completion persisted with the completing tick; locking ICs captured in exit-open with an explicit cancel rule; distinct attempt keys for gates and redirects; chipGen captured at request time.
MAX_ROUNDS reached without an APPROVED verdict; round-5 fixes applied but not re-reviewed.

## Round 6 — Codex (extra round, user request)
Four material issues remain:

1. **Lazy sessions can inherit a previous connection’s state (§0).** `sessionFor` returns an existing session when its host matches; `_applyIconState` applies any stored session’s damage without checking connection identity. If exit cleanup is interrupted, reconnecting to the same host inherits tally, suppression, and icon damage.  
   **Fix:** Store the connection number on every host session and require it to match in `liveSession`, `sessionFor`, tally application, and persona derivation; make cleanup optional housekeeping.

2. **Existing jackpoint reconciliation cannot reconstruct missing entry state (§0).** `scheduleReconcile` only reconciles existing browser/shared session records; it does not recreate a missing `matrixSessions` entry. `sessionHost` depends on that entry. An interruption after `conn-open` can therefore leave a connected character without the jackpoint host, scene transition, or trace modifier.  
   **Fix:** Include jackpoint, origin token, destination scene, and initiating user in `conn-open`, then explicitly reconstruct or derive jackpoint state from it.

3. **`completes: true` can be committed from a stale fold (§5).** The GM computes that the next tick completes a trace; a player’s successful spoof reaches the server before that tick but has not reached the GM’s client. The tick nevertheless permanently records completion, although the specified ordering makes the spoof valid. Persisting the calculation does not make its inputs current.  
   **Fix:** Serialize accepted spoof/freeze commands and tick creation through the GM’s trace queue, with an explicit turn-closing boundary.

4. **The pending-attack barrier has no admission cutoff (§3–3a).** A client can observe no pending attacks and submit `conn-end` while another submits a new `vr2:attack` for that connection; their different IDs allow both. Recording attacks before damage protects already-visible attacks, not concurrent admission.  
   **Fix:** Close ordinary attack admission when exit begins, permit only explicitly requested final attacks afterward, and enforce that boundary through one serialized admission/completion path.

The document also retains conflicting instructions: §0 says `matrixMode` is never written, but §3a still clears it and invokes a removed projection rule; §3 requires waiting for every admitted attack, but §3a’s barrier still lists only black hits and gray consequences. Consolidate those passages before implementation.

VERDICT: REVISE
### Claude response (round 6)
All 4 accepted, plus the two contradictions removed. Principle added: records hold facts, never conclusions; order-dependent results are derived from server-ordered history. Sessions carry the connection number; conn-open carries the jackpoint/entry data and the jackpoint entry is rebuilt from it; trace completion derived (IC crash is a durable record, ordered); attack admission = created before exit-open or a listed lastAttack; conn-end attempts, the first valid one counts.

## Round 7 — Codex (extra round)
The session and jackpoint changes address those earlier findings. The history-based design still has three material gaps:

1. **A deterministic fold is not proof that a client has complete history (§0, §5).** The GM can receive a tick before an earlier spoof, derive completion, and fire the trap. When the spoof arrives, the fold corrects itself, but the trap has already fired. Also, equal-time records sorted by key can arrive later yet sort earlier, contradicting “later records can’t change it.”  
   **Fix:** Gate irreversible consequences on an explicitly finalized input set—simplest here: route trace commands and turn closure through the single GM-client queue.

2. **Historical exit validity cannot be reconstructed from the proposed receipts (§3a).** The fold must determine whether every application had finished *before* an end candidate, but monitor applications leave mutable flags, not ordered application records. A receipt appearing later cannot establish when an earlier candidate became valid. The same issue affects historical dead/unconscious state.  
   **Fix:** Publish durable application acknowledgements after successful receipted writes, carrying their outcomes, and require those acknowledgements to precede an accepted end candidate.

3. **The IC crash record and generation bump are separate writes (§5).** `recordEvent` creates an embedded ActiveEffect; `matrixDamage` updates the actor. Saying the crash record is created “with” the generation bump does not make them atomic. Interruption between them leaves the historical fold and live incarnation disagreeing.  
   **Fix:** Commit the crash fact and generation change in one actor update, then materialize any event-log copy idempotently from that committed fact.

Add tests that delay delivery of an earlier spoof until after a completion check, introduce an application receipt after a premature end candidate, and interrupt between crash-record creation and generation update.

VERDICT: REVISE
### Claude response (round 7)
All 3 accepted. A lifecycle sequencer (one GM-client queue per connection) writes every order-dependent fact (admission, exit, ticks, spoofs, freezes, IC crash application, acks, end) with a seq, and alone draws conclusions; players create request records. Durable application acks (with outcomes) gate the barrier and the end. An IC crash is one actor update (generation + crash flag). Tradeoff recorded: a GM must be online for a part-3 lifecycle.

## Round 8 — Codex (extra round)
The acknowledgements and atomic crash update address the previous gaps. Two material issues remain:

1. **Per-connection sequencing cannot order shared IC events (§0, §5).** Decker A can crash an IC tracing decker B. A’s crash `seq` and B’s tick `seq` belong to different counters, so they cannot establish whether B’s trace completed first. Separate queues also allow these operations to interleave despite using one GM client.  
   **Fix:** Use one GM-client lifecycle queue and sequence across all deckers, IC, and hosts—the simplest option for the stated small-world workload.

2. **Corruption and reload are not order-independent (§0, §2).** `corrupt:<programKey>:<source>` and `reload:<programKey>:<n>` have neither shared sequencing nor a generation relationship. The fold cannot distinguish “corrupt, reload, corrupt again” without ordering, and a delayed old corruption can contaminate a freshly reloaded copy.  
   **Fix:** Give each deck/program identity a reload generation, capture it in the tar request, and apply corruption only to that generation.

Add regressions for one decker destroying another’s tracing IC, and corruption → reload → delayed old corruption → new corruption.

VERDICT: REVISE
### Claude response (round 8)
Both accepted: one world-wide GM-client sequencer with a single seq counter (seeded from the highest seq seen); program reload generations captured in tar requests, corruption counts only for its generation.

## Round 9 — Codex (extra round)
Both remaining blockers are addressed: the world-wide sequence orders shared IC events against every decker’s trace, and reload generations prevent delayed corruption from affecting fresh copies. The regression tests cover both cases.

I found no further material blocker within the documented single-GM-client and manual-recovery limits. The plan is sound enough to implement.

VERDICT: APPROVED
**Converged: APPROVED in round 9.**
