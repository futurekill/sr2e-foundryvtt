# Plan Review Log: VR2.0 core
Started 2026-10-19. MAX_ROUNDS=5.

## Round 1 — Codex

The plan needs revision. These are concrete integration gaps, independent of the accepted book rules:

1. **Dump shock still benefits from armor.** §5 proposes `armorCalc: "none"`, but `damageResistArmor` has no such case and falls through to ordinary armor subtraction (`module/rules/sr2e-rules.mjs:3852`).  
   **Fix:** Implement and test an explicit zero-armor mode before routing dump shock through damage resistance.

2. **The initiative integration point is wrong.** `combat.mjs` manages passes; tracker and sheet rolls use `SR2EActor._getInitiativeParts()`, which reads `system.reaction.value`, whereas IC stores its base in `system.initiative.base` (`actor.mjs:844–938`, `actor-data.mjs:1844`). Changing combat alone will leave inconsistent or incorrect IC initiative.  
   **Fix:** Derive VR2 IC initiative in `ICData` and add an explicit IC branch in `_getInitiativeParts()` used by both entry points.

3. **“Same resolves-once guards as today” preserves a permission bug.** Matrix resistance only marks the original card resolved when the defender is its author or a GM (`actor.mjs:2940`); a player resisting GM-owned IC leaves the attack reusable, and the outcome-marker hook has no Matrix handler (`sr2e.mjs:2030`).  
   **Fix:** Add Matrix outcome markers, author-side closure, and marker-aware resolution checks before rolling or applying damage.

4. **Concurrent resistance can duplicate damage or lose damage.** The existing method checks once, awaits a roll, then performs an unqueued read-modify-write; `matrixQueue` covers only the subsequent mode change, and is per-client.  
   **Fix:** Define one authoritative resolver and serialize card consumption plus monitor updates, rechecking resolution immediately before committing.

5. **System Test Karma produces contradictory results.** The proposed immediate verdict has no dependent-card state; `_syncDependentCards()` only knows specific card types (`actor.mjs:790`), so later Karma changes the decker’s test without changing the win/lose result.  
   **Fix:** Store a System Test card linked to `testMessageId`, keep the host roll fixed, and recompute the verdict without adding tally twice.

6. **Resistance and overload Karma arrive too late.** `rollSuccessTest` exposes subsequent Karma spending, but the proposed automatic damage/crash/overload consequences would already have happened; existing Matrix synchronization updates only attack successes.  
   **Fix:** Introduce a finalize step for resistance and overload before committing their consequences.

7. **One host-wide tally mixes different deckers and sessions.** `HostData.securityTally` cannot distinguish two intruders or a fresh connection; the existing reset action only clears `attempts` and `alert` (`sheet-actions.mjs:2501`).  
   **Fix:** Key tally by decker UUID and intrusion/session identifier, with an explicit VR2 reset action.

8. **Tally updates lack an exactly-once writer.** Two host owners can overwrite each other’s increments; a manual “new tally” calculated before the GM applies earlier cards is stale.  
   **Fix:** Have one GM apply identified, receipted success increments through a host queue, and show pending increments rather than claiming an uncommitted total.

9. **Jacking out through a jackpoint bypasses dump shock.** §5 changes the sheet toggle, but `jackpoints.mjs:202` exposes a separate `jackOut()` that directly clears Matrix mode; `sessionHost()` stops resolving once mode is false.  
   **Fix:** Route voluntary exits through one queued operation that captures host context before clearing mode and handles Graceful Logoff and dump shock once.

10. **Core dump-shock penalties leak into VR2.** Saying the boolean “isn’t used” does not disable the unconditional `system.dumpShock` penalty in `actor.mjs:387`; switching an already-shocked character to VR2 retains +2 TN.  
    **Fix:** Gate the legacy penalty and recovery UI on core mode while preserving the stored core flag.

11. **Core perception and alert behavior remain active in VR2.** `rollMatrixPerception()` still rolls effective IC Rating against Masking and escalates alerts; `ICData` still derives the +50% alert rating boost. Neither path receives a defined VR2 replacement.  
    **Fix:** Disable unsupported perception actions in VR2 or implement their VR2 behavior, and explicitly remove core alert multipliers from VR2-derived ratings.

12. **Attack level is disconnected from memory and price.** Adding `damageLevel` leaves `ProgramData` calculating size and cost from the independently authored `multiplier` (`item-data.mjs:950`), allowing a Deadly attack at a Light attack’s multiplier.  
    **Fix:** Derive the VR2 ordinary Attack multiplier from damage level, restoring the authored multiplier in core mode.

13. **Existing Attack programs become unusable without a conversion policy.** The new empty default makes every existing Attack refuse to roll, and the plan specifies neither pack updates nor conversion of existing copies.  
    **Fix:** Define an explicit conversion/setup workflow; any automatic migration must use value-based recognition, cover embedded items, and update `packs-src` separately under `CLAUDE.md`.

14. **Deck mitigation data is incomplete.** Only gear receives the proposed fields, although `_snapshotActiveDeck()` also supports cranial cyberware; its current fallback is numeric `0`, and no field represents the stated hot DNI-only +2 overload modifier.  
    **Fix:** Add shared typed deck fields to gear, cranial cyberware, and actor fallback data, including interface mode, and restore them from source every preparation.

15. **Persona values can remain stale after unloading programs.** `_derivePersona()` only assigns attributes with a loaded positive rating (`actor-data.mjs:811–826`), so unloading Masking can leave Detection Factor inflated and unloading Bod can preserve resistance dice.  
    **Fix:** Restore authored persona values before deriving loaded programs, with a second-preparation test.

16. **Ruleset changes can mix old derived data with new roll logic.** The setting has no reload or re-preparation callback (`sr2e.mjs:1120`), and branching resistance on the current setting would reinterpret outstanding core cards after switching.  
    **Fix:** Require reload or explicitly refresh affected documents, and resolve cards using their stored ruleset, treating legacy cards as core.

17. **Host context is insufficiently durable.** A stored `hostUuid` alone leaves pending resistance dependent on later host edits/deletion, and an unlinked IC’s dialog-selected host does not automatically become its initiative host.  
    **Fix:** Snapshot the required host combat values on cards and define a persistent or explicit per-encounter host association for unlinked IC.

The test plan should explicitly exercise non-author player resistance, concurrent resolutions/tally increments, post-roll Karma, jackpoint exits, cranial decks, second preparation, and ruleset switching; the listed happy-path checks do not cover these failures.

VERDICT: REVISE

### Claude's response
Accepted all 17. Highlights: requiresReload + cards carry their ruleset; core dump-shock penalty, alert boost and IC perception gated off in vr2; Attack multiplier derived from a new damageLevel (both directions) with a level picker for existing copies; shared typed deck fields on gear, cranial cyberware and the actor fallback; per-intruder tally with a single GM writer and receipts; system-test card in _syncDependentCards with a fixed host roll; resist via the resist-once machinery, closed to Karma, queued monitor writes; one vr2LeaveMatrix path for toggle, jackpoint and crash; IC initiative in ICData + _getInitiativeParts; _derivePersona restores authored values; explicit armorCalc none.

## Round 2 — Codex

The revision fixes several earlier gaps, but these remain:

1. **Cross-client double resolution remains possible (§5).** An in-flight set and per-actor queue are client-local; a player and GM can both pass `isCardResolved()` before either publishes an outcome and both apply damage.  
   **Fix:** Designate one authoritative resolver and test simultaneous resistance from two clients, not merely two clicks on one client.

2. **Tally clearing violates the single-writer design (§7).** A player can leave their own actor but generally cannot clear flags on the GM-owned host; the active-GM hook only handles System Test creation.  
   **Fix:** Publish a durable leave/reset request that the active GM processes through the same host queue as tally increments.

3. **Tally receipts lack a session boundary (§3, §6).** Clearing `{n, receipts}` loses deduplication history, and a delayed old-session card can add successes to a newly connected decker’s tally.  
   **Fix:** Include an intrusion/session identifier in cards and tally keys, and close sessions without deleting their receipt history.

4. **Pending tally cards never recover (§6).** A `createChatMessage` hook does not replay when the GM reconnects; cards created without an active GM remain pending indefinitely.  
   **Fix:** Reconcile unapplied cards on active-GM startup/change using the same receipt-checked queue.

5. **Crash dump shock can use the wrong host (§5–7).** Attack cards snapshot host values, but `vr2LeaveMatrix(actor, {graceful})` instead reads the current jackpoint host; this fails for sessionless deckers, changed sessions, or fights on a different selected host.  
   **Fix:** Pass the attack’s host snapshot and session identifier into crash handling, using session lookup or a prompt only for voluntary exits.

6. **Derived Attack multipliers can overwrite authored core values (§3).** The existing program sheet submits `system.multiplier` from the prepared value (`templates/item/item-body.hbs:718`); editing another field in VR2 can persist the derived multiplier, defeating restoration on switching back.  
   **Fix:** Bind the editable multiplier to source-backed `context.authored` and display the VR2 effective multiplier separately.

7. **System Test Karma registration has a field mismatch (§6).** `_syncDependentCards()` compares and writes `card.successes`, while the proposed card stores `deckerSuccesses`; adding a renderer alone will leave the verdict reading the old count.  
   **Fix:** Use the existing `successes` field or explicitly implement a type-specific updater.

8. **Attack Karma still has unresolved lifecycle gaps (§5).** Existing attacks with zero successes produce no dependent card; resolution also neither closes the attacking test nor guarantees that attack successes stayed unchanged during resistance.  
   **Fix:** Preserve a card for zero-success attacks, validate its success snapshot before resolution, and publish `closesTests` plus marker-aware Matrix synchronization when finished.

9. **Stored ruleset dispatch does not isolate pending cards (§1).** An old core card resolved in VR2 still reads VR2-derived `effectiveRating` and monitor maximum; a VR2 card resolved in core reads core-derived limits.  
   **Fix:** Compute resistance and monitor limits from the card’s ruleset explicitly, rather than borrowing current-mode derived values.

10. **The host configuration UI disappeared from the revised scope.** ACIFS and Security Value exist in schema, but the revised plan no longer explicitly adds their host-sheet controls, leaving ordinary configuration inaccessible.  
    **Fix:** Restore explicit VR2 host-sheet controls for ACIFS, Security Value, and per-session tally inspection/reset.

11. **New Matrix attack calls still need drug-context plumbing.** `rollSuccessTest()` applies drug modifiers through `options.tnContext`, but the existing Matrix attack omits it (`actor.mjs:2826`), and the revised plan does not address this requirement from `CLAUDE.md`.  
    **Fix:** Specify and pass the appropriate attack/System Test TN contexts, with a targeted modifier test.

VERDICT: REVISE

### Claude's response
Simplified the tally instead of adding machinery: it lives on the decker per session (the decker's own client writes it with receipts; session ids reject stale cards; owners reconcile on load) — resolves 2, 3, 4. Accepted 5-11 (crash uses the card's host snapshot; authored multiplier binding; successes field; inert zero-success cards + source re-read + closesTests; card-ruleset dispatch; host-sheet controls; TN contexts). 1 kept as the accepted cross-client limit shared by every card in the system.

## Round 3 — Codex

The documented cross-client race and closed-to-Karma resistance policy are accepted limits. Four concrete issues remain:

1. **The attack TN context overwrites itself (§6).** `{ kind: "attack", ...skillTnContext("computer") }` ends with `kind: "skill"` because that helper supplies its own `kind` (`module/documents/actor.mjs:16`), so attack-specific modifiers are missed.  
   **Fix:** Use `{ ...skillTnContext("computer"), kind: "attack" }` and test the resulting context.

2. **Old core cards still consume VR2-derived values (§5).** “Core path as today” reads `effectiveRating` and `conditionMonitor.max` (`actor.mjs:2885–2891`), which VR2 changes; dispatching by the card’s ruleset alone does not preserve core resolution.  
   **Fix:** Calculate core IC resistance rating and monitor maximum explicitly from core rules when resolving a core card.

3. **The crash session identifier is undefined for IC attacks (§5).** The listed attack snapshot contains no session identifier, and an attacking IC has no decker session of its own; passing an unspecified ID to leave handling cannot protect a defender who has since reconnected.  
   **Fix:** Capture the target decker’s UUID and session ID, and require a matching live session before ending it; define deferred-target capture for untargeted cards.

4. **The tally verification still tests the abandoned GM-writer design (§10).** “The GM applies the tally once” no longer validates §6’s owner-written tally and load reconciliation, leaving the revised recovery mechanism untested.  
   **Fix:** Replace it with owner-write, unreceipted-card recovery, receipt deduplication, and old-session rejection tests.

VERDICT: REVISE

### Claude's response
Accepted all four: kind last in the TN context; core cards compute core values explicitly; the defender and session are captured at resolution and a crash ends only a still-live session; tests now cover the owner-written tally (dedupe, reload reconcile, old-session rejection).

## Round 4 — Codex

The revision addresses the remaining blockers. I found no further concrete implementation-plan flaws beyond the accepted limits.

One editorial cleanup: §10 still says “the GM applies the tally once,” despite the owner-written design and its new tests; remove that stale clause.

VERDICT: APPROVED

Converged in 4 rounds; the stale clause was removed.
