# Plan Review Log: spirit services
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex (session 01a0d9b0…)
The plan needs revision. These findings use its supplied Rules section as the rules baseline; no files were modified.

1. **The last service cannot fund a whole fight.** Item 1 refuses attacks at zero, including subsequent attacks in the combat that consumed the last service; item 2 also announces departure before that fight finishes.  
   **Fix:** Allow continuation of an already-paid service at zero and defer departure eligibility until it ends.

2. **Combat powers still cost one service per click.** `useSpiritPower` remains unchanged, so powers—and switching between powers and manifest attacks—do not receive the promised combat discount. Air elementals have no manifest attack and are especially affected.  
   **Fix:** Route combat powers and manifest attacks through one shared service-accounting operation.

3. **A Combat document is not necessarily one fight.** Unrelated started combats, reused encounters, and fights without a tracker make “one per combatId” diverge from the quoted group-of-foes rule. A single flag also loses encounter A’s payment when switching A → B → A.  
   **Fix:** Track an explicit combat-service instance with an end action; use the relevant combat only as a convenience.

4. **Continual nature-spirit powers remain unmodelled.** The Rules section says continuation is free and parameter changes cost another service, but `useSpiritPower` and the sheet’s “Each power use costs 1 service” implement neither distinction.  
   **Fix:** Add start/continue/change/end power commands, or explicitly leave this accounting manual.

5. **One update is not concurrency control.** Two clients can both read two services and write one, obtaining two commands for one charge; a daily charge can similarly overwrite a power, attack, or sheet adjustment. `elementalTransition` explicitly provides only a client-local lock.  
   **Fix:** Serialize all service mutations through one authoritative executor, reading fresh state inside each operation and deduplicating command IDs.

6. **Active-GM election does not provide recovery.** Overlapping time hooks can race, an old GM can continue after an await, and a new GM does not replay missed updates merely by becoming active. A committed decrement followed by failed chat creation permanently loses the notice.  
   **Fix:** Queue reconciliation, recheck authority before writes, reconcile on startup/GM handoff, and persist pending notification identities.

7. **The proposed `updateActor` hook lacks the previous count.** A post-update actor exposes the resulting state; the plan supplies no reliable mechanism to distinguish `1 → 0` from an existing zero. Finishing an aid/sustain service later also produces no new services transition.  
   **Fix:** Persist exhaustion/departure lifecycle state and reconcile it whenever services or current-service state changes.

8. **Zero services, unbound, uncontrolled, and departed are conflated.** Keeping `conjurerUuid` retains the sheet’s “Bound to” label and binding relationship; clearing it makes the proposed attack gate treat an exhausted retained actor as uncontrolled and freely attacking.  
   **Fix:** Represent departure/control state explicitly and preserve conjurer identity separately.

9. **Presence can be bypassed or reset.** Attacks and powers are not specified to call an away elemental; Send away could clear the timer while aid/sustain continues; repeated Call could reset the clock. Depletion currently makes an elemental vanish, but the plan does not clear presence there.  
   **Fix:** Define guarded, idempotent presence transitions for every action, service completion, and Force-depletion path.

10. **Free Call conflicts with paid Re-call.** `planElementalTransition` and the sheet already distinguish recovery from spent Force through “Re-call (1 service).” The new free button leaves Force restoration ambiguous.  
    **Fix:** Preserve paid Force recovery and make ordinary Call explicitly incapable of restoring spent Force.

11. **Summoning already places a token.** `rollConjuring` asynchronously calls `placeSummonedToken` for successful summons, including uncontrolled elementals that attack their summoner. Simply declaring new elementals “away” contradicts that behavior.  
    **Fix:** Skip placement for successfully bound elementals until Call, while preserving uncontrolled-elemental placement.

12. **Dismiss can partially destroy the scene before actor deletion fails.** `module/sr2e.mjs` vetoes deletion of actors holding or expiring spells; the proposed tokens-first sequence can therefore remove tokens and leave the actor. Existing `releaseElemental` provides required spell cleanup.  
    **Fix:** Revalidate eligibility and permissions, complete required cleanup before token deletion, and retain resumable departure state on failure.

13. **A whispered button is not authorization.** Old cards can outlive replenishment, rebinding, ownership changes, or a new service; client-supplied UUIDs must not authorize deletion. Actor ownership also does not establish permission to delete every scene’s tokens.  
    **Fix:** Validate the requesting user, exact spirit UUID, lifecycle instance, current eligibility, and document permissions at execution time.

14. **“Every token” is unsafe for synthetic actors.** `nature-spirits.mjs` deliberately distinguishes linked actors, unlinked instances, and instances whose deltas changed their type. Matching only `actorId` can delete independent instances; matching only world actors misses synthetic ones.  
    **Fix:** Specify UUID-based instance scope and reuse the existing departure/reconciliation distinctions.

15. **The clock’s initial and historical state is undefined.** Existing active elementals lack `presentSince`; zero is a valid world timestamp; “charged days” is ambiguous when elapsed days exceed remaining services; rewind followed by Send away/Call can reopen previously billed time.  
    **Fix:** Define migration, null-versus-zero handling, elapsed-period advancement, and rewind/reset semantics explicitly.

16. **The nature-spirit lifetime claim is false for existing settings.** Automatic expiry defaults to off, and configurable sunrise/sunset hours need not be twelve hours apart. Its departure writes would also trigger the proposed exhaustion card alongside the existing departure notice.  
    **Fix:** Correct the assumption and suppress exhaustion notifications for an already-recorded departure.

17. **The tests omit the failures that determine correctness.** They lack last-service continuation, mixed powers/attacks, multi-client races, GM handoff, stale Dismiss cards, synthetic actors, and deletion failures. `rollSpiritAttack` also returns early for spirits without an attack profile, which must happen before charging.  
    **Fix:** Add these scenarios and require all action-validity checks before service commitment.

A simpler first implementation would expose explicit **Begin combat service / End combat service** commands, share their state across powers and attacks, and use one reconciled lifecycle for presence and departure. That avoids treating tracker selection as a rules decision.

VERDICT: REVISE

### Claude's response
Redesigned instead of patching.
- **One writer per spirit** (its owner), and one `spendService` helper in a per-spirit queue with a fresh read. This answers #5 and #6 (no GM executor, no handoff).
- **Status is derived** (uncontrolled / bound / bondEnded). This answers #7 and #8.
- **The 24-hour rule is computed** from `presentSince` and banked by the next spend, never charged by a clock. This answers #6 and #15.
- **An explicit Fight for me command.** This answers #1–#3 and #17.
- **Presence transitions** are defined, and Call is free but never restores Force. This answers #9 and #10.
- **Bound elementals start away**, with no token until Call. This answers #11.
- **No Dismiss and no auto-delete**, which makes #12–#14 moot.
- The nature-spirit claim is corrected (#16).
- Nature spirits' continual power use stays GM judgement (#4, stated).

## Round 2 — Codex
Round 1 removes the destructive Dismiss path, but several correctness failures remain. No files were modified.

1. **The last service still buys no usable fight.** Fight spends `1 → 0`, immediately derives `bondEnded`, and the next attack is explicitly refused. Elapsed-day exhaustion also interrupts an already-paid fight.  
   **Fix:** Permit continuation of a paid fight at zero; refuse only new services and distinguish exhaustion from completed departure.

2. **Filtering `boundElementals` by `servicesLeft` breaks existing sustained spells.** This function supplies `elementalHolderOf`, automatic sustain countdown, and defense-aid validation—not just summoning limits. Spending the last service on sustaining would remove the holder, restore the mage’s penalty, and stop its automatic countdown.  
   **Fix:** Preserve relationship-based `boundElementals`; apply remaining-service checks only when initiating services or calculating applicable limits.

3. **Computed time-dependent status can become stale.** `prepareDerivedData` calculates values when the actor is prepared; the plan provides no mechanism to refresh actors and open sheets when only world time changes. Reading fresh document state inside a queue does not necessarily refresh those derived values.  
   **Fix:** Compute availability through a pure function accepting current time at every decision, and use a read-only time hook to refresh displayed status.

4. **Banking does not make rewinds irreversible.** With three services and an unbanked two-day debt, rewinding makes `servicesLeft` rise from one to three. Clearing `presentSince` on Send away also discards the claimed monotonic timestamp before the next Call.  
   **Fix:** Either explicitly accept reversible unbanked time accounting or persist a billing high-water mark independently of presence.

5. **The elemental planner can approve unaffordable services.** `planElementalTransition` validates raw `sys.services`; applying banked days only afterward permits a new service when raw services are positive but effective availability is zero. Its planned decrement also creates two competing sources for the final counter.  
   **Fix:** Inside the queue, bank into a virtual state first, run the planner against that state, and commit one composed update.

6. **The “single owner-side writer” is not actually single.** Owners and GMs can both write. More subtly, `processCombatBoundary` runs on the client advancing combat; adding banking to elemental transitions makes that client a services writer during ordinary owner activity.  
   **Fix:** Explicitly choose one controller for all relevant mutations, or document and test these routine cross-client lost-update cases as an accepted limitation.

7. **Fight does not cover combat powers.** `useSpiritPower` still charges per command while fighting, so air elementals still pay repeatedly and mixed attacks/powers exceed one service. The manual exception is described only for nature spirits.  
   **Fix:** Let combat-power commands continue the paid fight for both spirit kinds, with an explicit combat-use choice where classification is ambiguous.

8. **Fighting is outside the existing exclusivity checks.** `_elementalBusyReason` and `planElementalTransition` inspect `system.service`, not `flags.sr2e.fighting`. Nothing specified prevents starting aid while fighting, sending a fighting elemental away, or retaining the free-attack flag across another service. Repeated Fight can also charge twice.  
   **Fix:** Include fighting in one shared service-state validator; make repeated Fight idempotent and require Stand down before incompatible transitions.

9. **Existing active elementals are incorrectly treated as away.** Existing aid/sustain actors have no timestamp, despite the new invariant that these services require presence. Merely loading the world leaves them exempt from daily charges until another transition occurs.  
   **Fix:** Initialize existing active services’ presence at an explicitly chosen adoption time; leave genuinely idle legacy elementals for manual Call.

10. **Presence transitions remain incomplete.** An elemental can use a noncombat power while away; paid Re-call is described as unchanged even though it should establish presence. Send away clears a flag but leaves the placed token on the scene, creating conflicting representations.  
    **Fix:** Define presence behavior for powers, Re-call, and tokens, including whether away tokens are removed, hidden, or visibly marked.

11. **Exhaustion notifications cannot be “once” as specified.** After exhaustion by time, each refused action can rediscover zero and post again; after the last successful spend, subsequent refusals face the same ambiguity. A failed chat write has no retry identity.  
    **Fix:** Either make refusals ordinary repeatable notifications or persist an exhaustion-notice identity with explicit retry semantics.

12. **The sheet’s `+` bypasses banking.** At one stored service and three days owed, two increments can be swallowed by historical debt instead of restoring two available services; the prescribed refund therefore does not reliably refund.  
    **Fix:** Route adjustments in both directions through the same queue and bank elapsed debt before applying the adjustment.

13. **Cleanup must remain legal at zero.** “The next action … is refused” conflicts with Send away, Stand down, handing a spell back, and finishing pending expiry. The existing elemental executor deliberately permits continuation and cleanup without another service.  
    **Fix:** Separate paid initiation from free continuation/cleanup and test each at zero.

14. **Derived statuses overlap.** A departed spirit without a conjurer satisfies both `uncontrolled` and `bondEnded`; a departed actor whose counter is manually increased can also satisfy `bound`. Attack behavior then depends on unspecified branch order.  
    **Fix:** Define mutually exclusive status precedence, with departed overriding control and available-service checks.

The revised tests should specifically cover last-service fighting, last-service sustaining through an automatic combat boundary, time-only refresh, unbanked rewinds, combat powers, and refunds after excess daily debt.

VERDICT: REVISE

### Claude's response
The 24-hour rule is now **GM-assisted**: a displayed day count and a Charge button that moves the clock with the charge. There is no automatic charging, so #3, #4, #5, #9 and #12 are moot.

Accepted:
- #1: a paid fight continues at 0.
- #2: boundElementals stays relationship-based.
- #6: the last-write-wins limit is stated; no automatic writer exists.
- #7: combat powers while fighting offer "part of the fight".
- #8: fighting is a running service for exclusivity; Fight is idempotent.
- #10: presence is defined for Call, Re-call, powers and tokens.
- #11: refusals are ordinary warnings.
- #13: continuation and cleanup are free at 0.
- #14: status precedence.

## Round 3 — Codex
Round 2 simplifies the clock substantially, but these implementation blockers remain. No files were modified.

1. **The proposed busy check blocks fighting instead of blocking aid.** `rollSpiritAttack` and `useSpiritPower` call `_elementalBusyReason`; `elementalTransition` does not. Adding fighting there would refuse paid attacks while still allowing aid to start.  
   **Fix:** Make validation action-specific and enforce fighting exclusivity inside `elementalTransition`, while allowing fight attacks and combat powers.

2. **Elemental spends still bypass the shared queue.** Their existing executor uses a separate `IN_FLIGHT` set and writes planner updates directly. An aid initiation and sheet adjustment can therefore lose a charge even on one client; elemental exhaustion notices also lack a specified integration point.  
   **Fix:** Execute elemental planning and updates inside the same per-spirit queue and share post-commit exhaustion notification logic.

3. **Charge days can double-charge from stale input.** Two clicks can both capture `N = 2`; serializing their counter writes does not stop both from spending two unless elapsed days are recalculated inside the queue. A stale click after Send away can similarly charge an away elemental.  
   **Fix:** Recompute and validate chargeable days and current presence inside the queued operation, rather than trusting the button’s N.

4. **Daily debt exceeding services is undefined.** With one service and three elapsed days, the generic spender either refuses the mandatory charge or attempts a negative counter, which `SpiritData` disallows.  
   **Fix:** Give Charge days explicit saturation semantics: subtract up to the remaining counter and advance through all acknowledged elapsed days.

5. **A “new service” during an elemental fight violates exclusivity.** The power dialog explicitly offers this while leaving `fighting` active.  
   **Fix:** Require Stand down before a new noncombat service, or atomically end the fight when starting that service.

6. **Zero-service combat powers still encounter the existing refusal.** `useSpiritPower` currently rejects `services <= 0` before posting anything; “all existing validity checks run first” cannot apply unchanged to this path.  
   **Fix:** Resolve paid-fight continuation before checking affordability, while retaining ownership, departure, depletion, and incompatible-service checks.

7. **Presence still outlives vanishing and misses ordinary powers.** Round 2 no longer specifies clearing presence when Force depletion makes an elemental vanish, and a noncombat power can still be commanded while away without establishing presence.  
   **Fix:** Establish presence for elemental power service initiation and clear it on every Force-depletion transition.

8. **Send away silently discards uncharged full days.** At 49 hours, Send away clears the timestamp; the next Call starts at zero, losing the displayed two-service obligation. Manual charging is reasonable, but this loses the evidence needed to perform it.  
   **Fix:** Before clearing presence, require an explicit charge-or-waive decision when full days remain, or preserve the uncharged tally.

9. **Call lacks lifecycle guards.** As written, it can place a token for a Force-depleted elemental that has vanished, or call back a `bondEnded` elemental owing nothing.  
   **Fix:** Reject ordinary Call for departed, exhausted idle, and depleted elementals; direct depleted bound elementals to paid Re-call.

10. **Free commands need execution-time authorization too.** A paid update naturally encounters document permissions, but free attacks, combat-power cards, and idempotent branches can bypass that write. No common ownership check is specified.  
    **Fix:** Validate ownership and current lifecycle state in every command handler, including zero-cost and already-active paths.

The accepted cross-client last-write-wins limitation is clear; it does not excuse the same-client queue split above. Add regression cases for these paths, especially double-clicked Charge, debt exceeding services, and combat powers using the last paid service.

VERDICT: REVISE

### Claude's response
All 10 accepted; see "Round 3 amendments" in the plan.

## Round 4 — Codex
The amendments resolve most prior blockers, but three remain:

1. **The exclusivity guard misses actual transition names.** It names `aid` and `startSustain`, but spell defense calls `startAid`, and spell learning calls `aidStudy`. Both can start while `fighting` remains true because the existing planner checks only `system.service`.  
   **Fix:** Guard every service-starting transition, including `startAid` and `aidStudy`, and test these entry points.

2. **Depletion clears uncharged daily debt.** An elemental present for 49 hours can expend its remaining Force through aid or sustaining; clearing `presentSince` then erases two owed services. Send away now handles this, but depletion does not.  
   **Fix:** Preserve uncharged full days when depletion clears presence, or explicitly charge them in the same transition before clearing it.

3. **The depletion implementation targets a nonexistent update field.** The amendment refers to planner updates that “set `depleted`,” but planners update `forceUsed`; `SpiritData.prepareDerivedData` derives `depleted`. Detecting an update to `depleted` would never clear presence.  
   **Fix:** Detect depletion from the planned resulting `forceUsed` and `force`, covering `aid`, `sustainTurn`, and `combatBoundary`.

No files were modified.

VERDICT: REVISE

### Claude's response
All 3 accepted; see "Round 4 amendments".

## Round 5 — Codex: APPROVED

Reading the amendments as superseding earlier wording, I found no remaining blocking flaws within the explicitly accepted cross-client and manual-accounting limits. This approves the plan; implementation still needs the specified tests. No files were modified.

VERDICT: APPROVED

---
# Implementation review (the same Codex session)
- **Round 1: REVISE (8).** Fixed: attack ownership; power use validated inside the queue after its dialog; depleted Fight refused; Call/Send away placement race; chat failures never abort cleanup; untouchable tokens reported; tests added.
- **Round 2: REVISE (4).** A per-spirit placement queue; Call retries placement; reporting after deletion; a summon test with the caster on the map.
- **Round 3: REVISE (1).** Send away removes tokens on every scene, not the viewed one.
- **Round 4: REVISE (1).** `tokensOf`: precise token identity for synthetic vs world spirits.
- **Round 5: REVISE (1).** The placement's final check uses `tokensOf`.
- **Round 6: APPROVED.**

Deliberate deviation: `elementalTransition` keeps rejecting a duplicate in-flight submission for the same spirit (an existing test requires it) and also runs on the shared svc: queue.
