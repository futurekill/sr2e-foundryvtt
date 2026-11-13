# Plan Review Log: VR2.0 part 4b (constructs + black-IC Shield)
Started 2026-10-30. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. I trusted the supplied rules text and reviewed the code read-only; no files were modified.

1. **Threat coverage misses consequential IC tests.** `applyRippers`, `resolveGray`, and `STEP_RESOLVERS.finalShot` roll IC dice at `module/vr2ic.mjs:360,382,889`, but §5 omits them; their records also lack frozen construct/threat context.  
   **Fix:** Snapshot threat with the attack and propagate it into ripper, gray and black-hit records, adding it once to each consequential test—including double-rating final shots.

2. **Worm dice would regress.** §4 says `wormTest` gets dice “from the profile,” but the existing infection test uses host SV, not worm rating (`vr2ic.mjs:516`).  
   **Fix:** Keep infection dice at host SV plus construct threat; use the profile for worm subtype and identity.

3. **Multiple worm components collide.** Infection records use `${card}:${worm.id}` (`vr2ic.mjs:518`), so two components of one construct share a receipt and only one infection survives.  
   **Fix:** Include the originating generation and component ID in infection record keys.

4. **Disinfect still destroys the whole incarnation.** `icOp("wormGone")` increments actor generation (`vr2ic.mjs:1164`), releasing every construct lock and restoring every crashed component.  
   **Fix:** Route construct worm destruction through the same component-crash mechanism as tar, without changing icon generation.

5. **Component availability checks are insufficiently specified.** Filtering offers and attack selections does not protect already-posted buttons or selections made before a crash; `card|icUuid|comp` also cannot distinguish an old generation.  
   **Fix:** Carry generation in reactive actions and revalidate generation, component existence and crash status inside the executing handler.

6. **Tar’s durable result can strand component destruction.** `tarStrike` writes its result before utility destruction and IC destruction, then immediately returns on retry when that result exists (`vr2ic.mjs:559–575`). Adding a subsequent `compCrash` write inherits that interruption gap.  
   **Fix:** Reconcile missing utility/component crash and corruption records from the durable winning tar result instead of returning immediately.

7. **A crash changes generation before the icon is reusable.** `icDamage` increments generation while leaving the monitor at 10 (`vr2ic.mjs:312–320`); generation-scoped component records therefore disappear immediately, allowing new reactive offers from the dead construct.  
   **Fix:** Require a non-full icon monitor as well as an uncrashed component for every construct attack and reactive trigger, and define an explicit reset operation.

8. **The manual tar route is omitted.** The IC sheet’s “Strike a utility” dispatch reaches `sheetOp("strike")`, which calls `tarStrike` without component selection (`vr2ic.mjs:1138–1148`); the button itself depends on actor-level `program`.  
   **Fix:** Expose component-specific strike actions and pass the selected profile through this route too.

9. **Actor-wide traps still use effect identity.** Trace completion and datatrail completion pass suffixed keys to `fireTrap`, whose once-key uses that entire key; a later whole-icon crash passes the unsuffixed key (`vr2ic.mjs:322,329,677,729`). One construct trap can consequently activate multiple times.  
   **Fix:** Normalize the trap receipt to icon identity while preserving component identity for trace records.

10. **Linked trap reads remain unresolved.** `attackOnce` reads the linked actor’s `icClass/rating` for Trace Factor (`vr2.mjs:606–607`), and `fireTrap` displays its actor-level program/rating (`vr2ic.mjs:331`); either is wrong when the hidden actor is a construct.  
    **Fix:** Define a construct trap profile/classification or explicitly reject constructs as linked hidden traps.

11. **Existing party/cascade settings can survive conversion.** Disabling formation and the cascading checkbox does not neutralize fields already present when an ordinary IC becomes a construct; runtime `partyOf`, `cascadeBaseline`, `cascadeOf`, and attack eligibility still consume them.  
    **Fix:** Make runtime party and cascade eligibility return false for constructs, independently of sheet controls.

12. **Black-Shield wear recovery is incomplete.** If the client stops after writing `vr2:shield:<card>` but before `addWear`, a retry skips the “no record exists” block and can permanently omit wear; concurrent clients can also roll before either creates the record.  
    **Fix:** Always reload the canonical Shield record, replay its idempotent wear before freezing, and serialize Shield decisions through one designated writer.

13. **Already-frozen black hits need a compatibility branch.** An existing hit without a Shield record must not prompt and charge Shield that cannot alter its frozen successes; a missing record must also not silently become zero Shield in a new freeze request.  
    **Fix:** Check terminal ack/existing hit first, and require a durable Shield decision—including no utility or decline—before creating any new hit.

14. **Schema and sheet details need concrete constraints.** §2 does not specify `blank: true`, integer threat, stable unique component IDs, valid program/subtype combinations, or array editing that preserves IDs; `optionalIC.proactive` still disables Expert based on the hidden actor program (`actor-sheet.mjs:2317`).  
    **Fix:** Specify explicit field defaults/validation, persist IDs only when components are created, reject unsupported variants at runtime, and derive construct sheet eligibility independently of actor program.

The remaining key audit does **not** support treating every equality as broken:

| Consumer | Assessment |
|---|---|
| `icAlive`, `icCrashSeq`, `advanceExit` generation parsing | Require the planned parser changes. |
| `sessionKey`, maneuver state and result validation | Already actor/generation-based; preserve the existing `uuid:gen` format. |
| `traceStart`, `relocate`, spoof/freeze/tick matching | Exact effect-key equality is appropriate; retain `/comp` throughout. |
| Exit locks, admission and last-attack matching | Exact component matching works, but the last-attack prompt must identify the required component. |
| `bombEnd` and `armed` equality against `icKeyOf(bomb)` | Safe under the explicit standalone-bomb restriction; enforce that restriction in handlers. |
| `cascadeOf` equality against `icKeyOf(ic)` | Correct for ordinary IC; constructs need the runtime exclusion above. |

The black-Shield **terminal outcome design is sound**: no hit plus `ack:attack` resolves the admission in `foldVr2Ic`, and the existing classifier awards rating cascade for a positive-success admission with `boxes: 0`. IC attack cards already provide host SV as `attackerComputer` for Shield’s TN. Add interruption tests around decision persistence/wear and regression tests for every omitted component lifecycle path above.

A simpler alternative is to retain icon `icKey` and add an explicit `effectKey`/component field only where effects need separate identity. If retaining suffixes, centralize `iconKeyOf`, profile resolution and component availability rather than scattering parsing and eligibility checks.

VERDICT: REVISE
### Claude's response
Accepted all 14 (binding 'Revisions' section added). Kept the suffix key with centralized iconKeyOf/parseIcKey/compAvailable helpers.

## Round 2 — Codex
The binding revisions address most earlier findings, but these gaps remain. No files modified.

1. **R1/R4 prevent R5’s recovery.** After a winning tar result crashes its component, `compAvailable` rejects retries—even if corruption remains unwritten; an ordinary tar’s generation change similarly fails R4. (`vr2ic.mjs:559–575`)  
   **Fix:** Find and reconcile an existing tar result by its original effect key before checking availability; apply availability checks only to new strikes.

2. **Tar reconciliation lacks durable target context.** The current tar fact stores neither the utility reference nor the connection/deck destination, and a manual strike generates a fresh card ID on every invocation; retrying after reconnection can target the wrong deck or never find the original result. (`vr2ic.mjs:566–575,1148`)  
   **Fix:** Persist the utility reference, connection and destination UUID in the tar fact, and reconcile unfinished results automatically using their original keys.

3. **Threat disappears through attribute recovery.** R2 updates `resolved` requests, but `vr2AttrPending` and `recoverResolved()` reconstruct those requests without threat; interrupted construct ripper attacks therefore lose their bonus. (`vr2.mjs:968`; `vr2ic.mjs:995`)  
   **Fix:** Include frozen threat in the atomic pending receipt and every reconstructed `resolved` request.

4. **R10 can wait on a writer that was never invoked.** `designatedWriter` selects an active owner, but `resistOnLog` runs only on the client clicking Resist; a GM clicking while that owner is online merely waits, without prompting the owner. The predicate also selects both devices logged in as that same owner. (`vr2.mjs:998–1002`)  
   **Fix:** Route Shield decisions to the designated writer through a durable request and use recoverable cross-device arbitration before prompting or rolling.

5. **Frozen black Power is not component rating.** §3 passes `hit.rating` into the jack-out rating calculation, but `HANDLERS.black` stores `st.power` there, already including attack-time icon-down and positioning bonuses; adding the current icon-down bonus can double-count it. (`vr2ic.mjs:165,258`; `vr2.mjs:596,1282`)  
   **Fix:** Freeze component/effective IC rating separately from damage Power and use that rating plus the current icon-down modifier for the gate, with an explicit legacy fallback.

6. **Component identity still lacks uniqueness validation.** R11 requires nonblank IDs and preserves them during editing, but duplicate IDs alias crash records, locks, traces and worm receipts; blank programs and unsupported imported programs also remain structurally allowed.  
   **Fix:** Validate unique stable IDs and supported program/subtype combinations before any construct action, while allowing incomplete rows only during editing.

The icon/effect split otherwise holds: session and maneuver keys remain unchanged; trace/relocate equality correctly retains component identity; bomb equality remains safe under the standalone-bomb restriction; runtime cascade exclusion and icon-normalized trap receipts resolve their earlier gaps.

The Shield cancellation ack still correctly releases the existing barrier and produces rating cascade. The simpler recovery design is to reconcile durable tar and Shield decisions centrally, rather than depend on clicking the original action again. Add interruption regressions for findings 1–4 and a gate-rating regression for finding 5.

VERDICT: REVISE
### Claude's response
Accepted 1–3, 5, 6. #4: replaced the designated-writer idea with 'first durable decision record wins' (recordEvent is server-arbitrated); a losing client adopts the winner's record; wear replays only from the winning record.

## Round 3 — Codex
The revisions close the previous six findings, but two recovery gaps remain. No files modified.

1. **R10’s decision arbitration does not serialize wear.** Both clients re-read the winning decision and call `addWear`, whose queue is client-local and whose update replaces the entire `wearEvents` array (`module/vr2.mjs:75–83`). Concurrent wear for different cards can overwrite one another, losing a charge despite correct decision deduplication.  
   **Fix:** Have the GM sequencer reconcile Shield wear from durable decisions before freezing, so clients never concurrently write Shield wear.

2. **R5’s reconciler needs a legacy-record policy.** It scans every winning tar fact, but existing facts lack `utility`, `conn`, `deckUuid`, `gen` and `comp` (`module/vr2ic.mjs:571`); processing those as new recoverable results can fail before `processRequests` and block the decker’s sequencer pass.  
   **Fix:** Version the new tar payload and reconcile only complete supported records, explicitly skipping legacy facts unless their missing context can be reliably reconstructed.

The icon/effect split, component availability and generation handling, threat propagation through attribute recovery, and separate black rating/Power fields now address the earlier findings. Shield’s terminal ack still fits the existing barrier and cascade classifier.

Add regressions for concurrent Shield wear on two cards and a sequencer pass containing an old winning tar fact.

VERDICT: REVISE
### Claude's response
Accepted both: black-IC Shield wear applied by the sequencer (HANDLERS.black) from the decision record, idempotent per card; tar facts carry v:2 and only those are reconciled.

## Round 4 — Codex
The versioned tar records and sequencer-owned Shield wear address the previous two findings. One recovery gap remains:

- **R10 does not guarantee “the next pass” completes Shield processing.** If the client stops after saving its decision but before submitting `black`, no handler runs. If the handler throws, `processRequests()` records the request as done even on failure (`module/vr2ic.mjs:845–858`), so subsequent passes do not retry it. The new interruption test therefore requires recovery logic not yet specified.  
  **Fix:** Add a sequencer reconciliation step that finds admitted cards with Shield decisions but no hit/terminal ack and retries their idempotent wear-and-freeze operation independently of request completion records.

Test both interruption before request creation and a failed handler marked done. The other reviewed identity, component lifecycle, threat, schema, barrier and classifier changes remain satisfactory. No files modified.

VERDICT: REVISE
### Claude's response
Accepted: reconcileShieldFreeze pass step.

## Round 5 — Codex
R10.6 closes the remaining recovery gap: reconciliation invokes the idempotent wear-and-freeze operation independently of request/done records. The tests now cover both a missing request and a failed handler marked done.

No remaining blocking findings in the revised plan against the reviewed code. This approves the plan, not an implementation. No files modified.

VERDICT: APPROVED
## Implementation review R1 — Codex
Concrete issues remain in the implementation:

1. **Worm execution bypasses availability checks inside the sequencer.** `icOp` checks before enqueueing, but `wormTest` then uses the current generation without revalidation; a queued crash/disinfect can therefore precede an infection from that now-dead component (`module/vr2ic.mjs:594–603`). Tar similarly discards the button’s expected generation.  
   **Fix:** Pass the expected generation into reactive handlers and validate it with `compAvailable` inside the sequenced operation before rolling.

2. **Legacy Disinfect buttons can destroy an entire construct incarnation.** A pre-conversion `card|icUuid` button has no component, passes `icOp`’s stale check, and reaches the whole-actor generation increment—even if that actor is now a construct (`module/vr2ic.mjs:1272–1277`).  
   **Fix:** Require a valid component and generation whenever the resolved actor is a construct, regardless of button format.

3. **PCPIC omits the current icon-down bonus.** `pcpicTN` uses frozen `icRating` plus wounds, but never adds the required current +2; because `leaveOnLog` prefers this result, its normal black-rating calculation cannot correct it (`module/vr2ic.mjs:930`).  
   **Fix:** Add the current icon-down bonus to new-format PCPIC hits while preserving the specified legacy fallback.

4. **Psychotropic and worm variant selectors resolve the wrong context.** Within a component row, `ifEquals` calls `options.fn(this)` without changing context, so `../../config` climbs beyond the root and produces empty option lists (`templates/actor/ic-sheet.hbs:81–82`; `module/helpers/handlebars.mjs:22`).  
   **Fix:** Reference `@root.config.icPsychotropic` and `@root.config.icWorm`.

5. **New scramble components silently remain inactive.** Changing a row to `scramble` preserves `scramble: ""`; the sole visible “Poison” option does not persist itself, while `offerTar` requires the stored value to equal `"poison"` (`actor-sheet.mjs:2323`; `ic-sheet.hbs:83`; `vr2ic.mjs:534`).  
   **Fix:** Set `scramble: "poison"` when selecting the scramble program, or normalize blank construct scramble variants consistently.

6. **An unlinked construct cannot make its first attack.** The attack dialog filters components through `compAvailable`, which validates against the actor’s currently linked host; with no host, capacity is zero and the component selector is empty—even after selecting a host in that dialog (`module/vr2.mjs:516,588–593`).  
   **Fix:** Populate component choices independently of host-budget validation, then validate against the selected host at execution.

7. **Attack identity can change while the roll dialog is open.** Availability is checked before `rollSuccessTest`, but the card’s `icKey` is constructed afterward from the actor’s then-current generation; a crash/reset during the roll can attribute an old attack to the fresh incarnation (`module/vr2.mjs:592,665–682`).  
   **Fix:** Capture the generation alongside the selected profile and revalidate it before committing the attack, using that captured generation in its key.

8. **The black-component Quench fixture bypasses construct validity.** Its SV-1 host has capacity 2, but killer-1 plus black-1 costs 4; the helper fabricates and admits the attack directly, so this test passes for a construct the real attack path rejects (`module/quench/sr2e-quench.mjs:11970`).  
   **Fix:** Use a valid host budget and exercise the actual component attack path before asserting its frozen hit.

The tar-v2 reconciliation uses direct `icDamage` through `crashIC`, so it does not nest the sequencer; its generation guard prevents repeated whole-icon crashes. The Shield decision, wear, freeze and reconciliation paths address the reviewed recovery gaps.

The reported Quench results do not cover the failures above. I reviewed the tests but did not independently rerun Foundry/Quench. No files modified.

VERDICT: REVISE