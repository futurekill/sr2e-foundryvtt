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
