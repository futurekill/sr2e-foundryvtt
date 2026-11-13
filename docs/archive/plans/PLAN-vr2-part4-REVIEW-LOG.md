# Plan Review Log: VR2.0 part 4 (optional IC)
Started 2026-10-30. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. The rules text is taken as given; the problems below are in the proposed implementation and its interaction with existing code. No files were modified.

1. **Cascade requests would never run.** `schedule()` in `module/vr2ic.mjs:951` accepts only characters, and players generally cannot create event records on GM-owned IC; `Y.request(ic, "cascade", …)` therefore is not a working delivery path.  
   **Fix:** Put requests on the targeted decker, then have a registered GM handler validate the card and write the IC’s cascade fact.

2. **`once()` does not guarantee an increment survives interruption.** In `module/claims.mjs:14`, it creates a separate, prunable claim; interruption before the cascade event loses the increment permanently unless explicitly recovered.  
   **Fix:** Make one durable `recordEvent` keyed by attack-time IC generation and card ID serve as both the increment and its deduplication receipt.

3. **Miss recording must follow admission.** `attackOnce()` posts cards before `HANDLERS.attack` admits them; refused attacks still have cards, while `advanceExit()` acknowledges misses only during an exit.  
   **Fix:** Record connected misses from admitted attacks, including reconciliation of already-admitted cards, and direct-path misses after successful card creation; never count refused cards.

4. **Direct and sequenced neutralizations need different evidence.** Direct resistance creates a resolution chat message; `resistOnLog()` merely submits a request, and `HANDLERS.apply` commits the outcome before posting its result card.  
   **Fix:** Give direct resolutions structured durable outcomes and reconcile cascade from those or sequencer acknowledgements, including outcomes already acknowledged before an interruption.

5. **Attribute resistance bypasses admission checks.** `vr2MatrixResist()` dispatches to `resistAttribute()` before the on-log branch; attribute loss can land before `HANDLERS.resolved` rejects an unadmitted attack. Also, zero *actual* loss can arise at the attribute floor despite positive net successes.  
   **Fix:** Require admission before on-log attribute mutation and award cascade only for a committed `lost === 0`, never `lost == null` or an unadmitted resolution.

6. **Shield-to-zero currently still inflicts base damage.** Both damage paths pass zero remaining attack successes to `matrixCombatOutcome()`, which stages the base damage rather than treating zero as a miss (`module/rules/sr2e-rules.mjs:2156`).  
   **Fix:** Explicitly return zero damage when Shield removes every success, and classify that originally successful attack as rating cascade rather than SV cascade.

7. **Black IC bypasses the proposed resistance hooks.** Its outcomes are applied in `applyResults()`, separately for icon and meat, using frozen `hit` data; the branch also never calls `askShield()`. A black hit retains its ASIST effect even when damage is resisted.  
   **Fix:** Define the black neutralization criterion explicitly, evaluate both acknowledged damage outcomes once from frozen data, preserve the lock, and specify Shield handling before freezing the relevant successes.

8. **There is no “trace resistance” resolution to hook.** `traceStart()` records a successful hunt and starts location; `HANDLERS.relocate` records a temporary spoof, and freeze/unfreeze are separate facts.  
   **Fix:** Treat zero-success hunts as misses, successful hunts as effects, and explicitly define whether later spoofing/suppression qualifies for rating cascade, retaining the originating card ID if it does.

9. **Cascade baselines and reset semantics are unspecified.** Reading current host SV, component rating, or generation when a delayed resolution arrives changes the cap or credits a new incarnation; bumping generation merely to reset cascade also invalidates locks, traces, and maneuvers.  
   **Fix:** Capture original SV/rating/code and IC generation, define component-specific versus construct-wide rating increments, and use a separate cascade-reset epoch.

10. **The snapshot audit must cover these concrete reads—not just `actor.system.program`:**

   | Location | Reads or downstream dependency that must be addressed |
   |---|---|
   | `vr2.mjs:511` | Attack-dialog rating display. |
   | `vr2.mjs:580–600` | Black classification/rating, trace selection and rating, linked trap class/rating, crippler selection/rating/name. |
   | `vr2.mjs:643–655` | Card program/class and admission payload. |
   | `vr2.mjs:802` | **Defending** IC rating used for crash tally; an attacker-component snapshot cannot fix this. |
   | `vr2.mjs:1246`; `vr2ic.mjs:167` | Jack-out gate calls `blackRating()` on the live actor rating. |
   | `vr2ic.mjs:329` | Hidden trap IC program/rating display. |
   | `vr2ic.mjs:430` | Reactive IC discovery filters live actor program. |
   | `vr2ic.mjs:481,490–494` | Bomb Power and tally rating. |
   | `vr2ic.mjs:501` | Poison Test rating. |
   | `vr2ic.mjs:558–574` | Tar dice, utility TN, tar-pit selection, pit dice, Sensor TN, rating disclosure. |
   | `vr2ic.mjs:609` | Trace rating falls back to `st.power`, potentially including positioning rather than just component rating. |
   | `vr2.mjs:896`; `vr2ic.mjs:226–229,372–395` | Gray/Sparky consequences inherit `st.power` as rating. |
   | `vr2ic.mjs:801,815` | Psychotropic subtype and PCPIC classification still read live actor subtype. |
   | `vr2ic.mjs:518–522` | Worm infection stores/displays live worm subtype. |

   **Fix:** Keep authored actor fields stable, snapshot a component ID plus program/class/base rating/effective rating/variant, propagate it into durable consequences, and define separate defending-icon and linked-component profiles.

11. **Existing snapshots are insufficient for multiple special components.** Black hits already freeze program-derived kind and Power, but psychotropic steps/locks and trace cycles are keyed by whole-IC incarnation; two psychotropic variants or trace components can collide or select the first hit.  
   **Fix:** Explicitly distinguish icon identity from component/effect identity in hit, trace, lock, and exit-step records.

12. **Selecting a reactive component does not implement its attack.** `attackOnce()` special-cases trace and cripplers; tar, scramble, worm, and bomb selections otherwise become ordinary damage attacks, while tar’s real path crashes the whole IC.  
   **Fix:** Specify component dispatch and utility targeting, including the construct-wide consequence of a tar success, before claiming every component is attackable.

13. **Expert arithmetic is sound, but eligibility and both dice paths need explicit coverage.** Attack dice belong in `attackOnce()`; defending IC dice belong in `vr2MatrixResist()`, using the defender’s expert value, not the attacker’s or cascade SV. `resistOnLog()` rolls a decker’s resistance and must not receive expert dice.  
   **Fix:** Gate expert/cascade to eligible proactive IC or constructs and test offense and defense signs independently on both IC attack and IC resistance.

14. **Threat dice cover more than attack and resistance.** The plan promises all tests except Initiative, but `vr2Maneuver()`, opposed IC maneuver rolls, and special component tests use additional roll sites; replacing `miscDice` also risks discarding the dialog’s existing modifier.  
   **Fix:** Add threat through a shared IC-test dice helper, preserve user miscellaneous dice, and exclude Initiative explicitly.

15. **Construct initiative uses the wrong rules branch.** `ICData.prepareDerivedData()` sets VR2 Initiative to rating plus code-dependent dice; `icReactionBase(code)` is used only in the core branch (`actor-data.mjs:2290–2304`).  
   **Fix:** Set VR2 construct Initiative base to the lowest component rating, retaining `icInitiativeDice(code)` and leaving core behavior unchanged.

16. **Party TN placement matters.** Adding the member penalty near the initial cybercombat TN loses it when trace replaces TN; applying the target penalty unconditionally also penalizes IC attackers despite the stated decker-only defensive benefit.  
   **Fix:** Add attacker-party N and eligible decker-versus-party N after effect-specific TN selection, before the final minimum, and persist the area-effect choice on the card.

17. **Stored N is correct, but formation needs durable membership rules.** Selected linked tokens can reference the same actor; unlinked tokens have separate actors, and duplication/reformation can silently preserve stale IDs or rewrite original N.  
   **Fix:** Deduplicate actor UUIDs, validate a common host and complete party before writes, preserve N through crashes, and define explicit reform/leave/copy behavior.

18. **Budget validation omits representational constraints.** Party components are restricted to IC actors despite the quoted non-IC allowance; part 3 also prohibits PCPIC sharing a party with other black IC, and tar’s construct/party −2 TN remains unimplemented.  
   **Fix:** Model or explicitly defer non-IC members, enforce PCPIC compatibility, and apply tar’s membership modifier in `tarStrike()`.

19. **Schema defaults can break untouched actors.** New optional fields need neutral defaults; `party.id` must accept `""`, and an enabled empty construct cannot safely evaluate `min(component ratings)`. Component variants are absent, while the sheet exposes variants only through the top-level program.  
   **Fix:** Use `blank: true, initial: ""` for party ID, size/expert/threat `0`, booleans `false`, components `[]`, validated integer ratings and variants, plus safe empty-list derivation and component-aware sheet controls.

20. **The tests miss the dangerous failures.** Happy-path caps and one black-component attack do not exercise admission rejection, restart recovery, Shield cancellation, component switching, stale generations, or mixed black outcomes.  
   **Fix:** Add focused integration cases for those paths, both expert signs, trace party TN, unchanged legacy actors, and duplicate-linked-token party formation.

The simpler implementation is a stable actor plus an immutable selected-component profile, with cascade derived from durable terminal outcomes and one deterministic increment record. This avoids mutable “current component” fields, separate claim markers, and player-written IC requests.

VERDICT: REVISE
### Claude's response
Accepted. Split: constructs move to their own plan (part 4b) — findings 10–12, 14, 15 and the construct half of 18/19 are its starting brief (component-profile refactor). Part 4a = expert + cascading + party IC + the Shield-to-zero bug (verified p.100: 'Reduce the attacker's net successes'). Cascade rewritten around durable sequencer-written records on the IC, written from decker-side requests/handlers (1–9). Party TN placement/formation per 16–18; schema defaults per 19; tests per 20.

## Round 2 — Codex
The named hooks exist, but §4 still leaves recovery and required snapshot data unspecified. Splitting constructs out resolves the earlier snapshot and initiative concerns.

| Planned hook | What the code actually provides | One-line fix |
|---|---|---|
| `HANDLERS.attack` (`vr2ic.mjs:203`) | Admission records contain `conn`, `card`, `icKey`, `cls`, `program`; **no successes, cascade eligibility, epoch, or original ratings**. Duplicate admission returns immediately. | Persist attack-time cascade metadata and successes in the admission fact, then reconcile misses from all admissions, including existing ones. |
| `HANDLERS.apply` (`vr2ic.mjs:215`) | Correct damage hook: writes `ack:attack:<card>` with `outcome: { crashed, boxes }`; an existing ack causes an immediate return. | Derive rating increments from durable `boxes === 0` acknowledgements, including previously acknowledged attacks. |
| `HANDLERS.resolved` (`vr2ic.mjs:337`) | Correct attribute hook: verifies admission and writes `outcome: { lost: r.lost ?? 0 }`; the actual mutation happened earlier in `resistAttribute()`. | Require admission before mutation, validate an explicit committed numeric `lost`, and reconcile `lost === 0` acknowledgements without treating missing values as neutralization. |
| `applyResults` (`vr2ic.mjs:263`) | Correct black hook: joins frozen `hit` with `res` records and their separate icon/meat acks; both outcomes expose `boxes`. However, it iterates **only unacknowledged** resistance records. | Evaluate cascade in a separate pass over all frozen hits with both acknowledgements, so interruption after the second ack cannot lose the increment. |
| `traceStart` (`vr2ic.mjs:594`) | Successful hunts write a trace fact and `ack:attack:<card>` with `{ trace: turns }`; zero successes return without a trace fact. | Record trace misses through admission and explicitly exclude successful trace acknowledgements from damage/attribute neutralization detection. |

Remaining findings, with one-line fixes:

1. **The revised plan never specifies applying `cascade.rating`.** It wires SV into attack dice, but current `attackOnce()` still reads authored rating for damage Power, black Power, crippler resistance TN, and Trace Factor (`vr2.mjs:580–600`). Recording rating increments alone changes no attacks.  
   **Fix:** Compute an attack-time effective rating and use it for ordinary Power, black Power plus the existing icon-down bonus, attribute `st.rating`, and trace rating inputs, while preserving authored ratings.

2. **Neutralization recovery is missing.** Only miss reconciliation is explicitly planned; deterministic cascade records prevent duplicates but cannot recover an increment that was never attempted after an ack. `processRequests()` can also mark a failed handler done.  
   **Fix:** Add one idempotent cascade reconciliation pass to `schedule()` after outcome application, scanning durable admissions and acknowledgements across ended as well as live connections.

3. **“Read them from the fold” is not supported by the current API.** `foldVr2Ic()` internally indexes acknowledgements but exposes neither their outcomes nor a per-attack outcome collection; `recordsOf(actor)` exposes the required durable records.  
   **Fix:** Use `recordsOf(actor)` with a pure outcome-join helper, or explicitly extend the fold to expose committed attack outcomes.

4. **The attack snapshot is incomplete.** Current cards contain `icKey`, host code/SV, program/class, and Power, but no cascade epoch, opt-in state, or independent original rating for ordinary damage attacks; Power can include positioning and black bonuses.  
   **Fix:** Capture `{ enabled, eligible, gen, epoch, code, sv0, rating0 }` before rolling and carry it into admission records, rather than reconstructing it from live IC data or Power.

5. **The original-baseline policy contradicts itself.** Records preserve attack-time originals, but bonus calculation caps accumulated increments against the *current* authored rating and host SV; changing either during an epoch changes the cap.  
   **Fix:** Fix the baseline for each generation/epoch and require an explicit cascade reset when changing its program, rating, or host baseline.

6. **“Subsequent attack” ordering is not guaranteed.** `attackOnce()` returns after recording an admission request; the GM sequencer processes it later, so an immediately repeated attack can read the old cascade bonus.  
   **Fix:** Await admission/cascade reconciliation before allowing the next attack by that IC, and synchronize pending committed outcomes before calculating its next bonus.

7. **The Shield calculation hook is `resistOnLog()`, not `HANDLERS.apply`.** The latter receives boxes and level, but neither Shield successes nor `atkS`; armor wear and overload rolls already happen before that request. Attribute opposition already produces zero loss when Shield cancels the attack.  
   **Fix:** Short-circuit damage at `vr2MatrixResist():760` and `resistOnLog():878`, before armor wear/overload, and leave the attribute opposition formula intact.

8. **Black Shield scope remains unstated.** The black branch of `resistOnLog()` bypasses `askShield()` entirely; the proposed two-site fix therefore covers ordinary damage only.  
   **Fix:** Explicitly scope this patch to existing non-black Shield paths, or specify how Shield interacts with frozen black successes and the two resistance outcomes.

9. **Expert eligibility is asymmetric.** §3 restricts expert attack dice to proactive IC but applies defender expert unconditionally; a program changed to reactive could retain a nonzero expert value. Cascade reconciliation likewise needs explicit eligibility and opt-in checks.  
   **Fix:** Apply the same eligibility predicate to both expert paths and require snapshotted cascading eligibility for every cascade fact.

10. **The direct-path exclusion is an explicit limitation, not a code invariant.** `attackOnce()` accepts character targets without `vr2Conn`, and `vr2MatrixResist()` retains a direct resolution path.  
    **Fix:** Either enforce a connected-target requirement for optional cascading attacks or document this supported direct path as deliberately excluded, removing “all decker-targeted attacks go through the connection log.”

11. **Party clearing must use the ID as the membership gate.** “Leave party” clears only `party.id`, leaving a positive size; testing size alone would retain both TN and tar modifiers.  
    **Fix:** Centralize membership as nonblank ID plus valid size, and use it for both attack-side modifiers, target-side modifiers, and tar.

12. **Tar’s rules paragraph conflicts with its implementation paragraph.** The former says “against … party IC”; the latter applies −2 when the **tar belongs to** the party, matching the supplied part-3 text.  
    **Fix:** Change the rules summary to “tar inside a party gets −2 TN” and subtract before the final TN minimum in `tarStrike()`.

13. **Tests still omit the newly critical paths.** Replaying an uninterrupted sequencer pass does not test interruption between outcome acknowledgement and cascade recording.  
    **Fix:** Add recovery tests after damage/attribute acks and the second black ack, plus mixed black outcomes, trace miss/success, delayed old-epoch outcomes, rating-bonus application, and reactive expert exclusion.

Neutral schema defaults and `party.id.blank: true` are appropriate. Party TN placement after trace’s replacement TN is correct; stored N survives crashes without changing Initiative. The simplest implementation remains one pure durable-outcome classifier and one sequencer reconciliation pass, rather than independent cascade writes scattered through every handler.

VERDICT: REVISE
### Claude's response
Accepted all 13. Cascade is now DERIVED (pure classifier over the deckers' durable admission/ack records, with an attack-time snapshot in the admission) — nothing written to the IC, so no lost increments and no reconciliation writes; baseline mismatch = stale. Effective rating wired into every rating consumer. Shield short-circuit at the two resist sites incl. black (askShield before freezing). Membership helper; tar wording; tests.

## Round 3 — Codex
The derived-cascade design removes the separate-write recovery problem. `Y.flush` is implementable using the existing sequencer queue, but its proposed selection criterion misses pending resolutions. Several other concrete gaps remain.

1. **Flush misses already-rolled resistance.** §4 flushes only deckers with unanswered `attack` requests; an admitted attack can instead have a pending `apply`/`resolved` request or unacknowledged black `res` records, so the next attack misses its earned rating bonus.  
   **Fix:** Flush all deckers with relevant pending requests or resistance records—or simply all deckers—before computing cascade.

2. **A GM client is not necessarily the sequencer.** `isSequencer()` checks `game.users.activeGM?.isSelf`; `sequencer()` silently returns `null` on another GM’s client, while `attackOnce()` has no corresponding restriction.  
   **Fix:** Require the active GM for cascading attacks or provide a request/barrier mechanism that waits for the active GM to finish flushing.

3. **The claimed implicit reset does not work.** `{ gen, epoch, code, sv0, rating0 }` contains neither program nor host identity; switching programs or moving between equal-rated hosts preserves old outcomes, and changing rating away and back resurrects them.  
   **Fix:** Increment `cascadeEpoch` on relevant program/host/baseline changes, or explicitly describe matching-baseline reuse instead of calling it a reset.

4. **Classifier eligibility is underspecified for neutralizations.** Only the miss bullet explicitly requires `cascade0.on`; all outcomes must belong to this IC, be eligible, and produce at most one increment per card.  
   **Fix:** Start from distinct admissions matching `icKey` and enabled cascade metadata, then classify zero-original-success misses separately from positive-original-success neutralizations.

5. **Black Shield cancellation needs an attack-level ack.** With no frozen `hit`, `foldVr2Ic()` considers the attack resolved only when `ack:attack:<card>` exists; icon/meat acknowledgements alone neither release the exit barrier nor satisfy the proposed black classifier.  
   **Fix:** On complete Shield cancellation, write `ack:attack:<card>` with `{ boxes: 0, shieldCancelled: true }`, create no hit, and use the ordinary neutralization classifier.

6. **The black resistance client would wait forever for the deliberately absent hit.** `resistOnLog()` currently waits exclusively for a `hit` after submitting `black`.  
   **Fix:** Wait for either a frozen hit or terminal attack acknowledgement, returning without resistance rolls on cancellation.

7. **Black Shield needs a durable, reusable result.** `HANDLERS.black` currently receives only card/connection and rereads attack successes; the plan does not specify transporting Shield successes, charging wear, or preventing retries from rerolling Shield.  
   **Fix:** Persist the Shield decision/result/reference once per card, pass it to the freeze handler, reuse it on retries, apply wear once, and reject further freeze requests after cancellation or freezing.

8. **The attribute admission fix disappeared.** `vr2MatrixResist()` still dispatches directly to `resistAttribute()` before admission checking, allowing mutation before `HANDLERS.resolved` rejects the attack.  
   **Fix:** Restore the requirement to verify the matching admission and connection before committing attribute loss.

9. **An attribute mutation can still lack its durable outcome.** `resistAttribute()` writes the session receipt before sending `resolved`; interruption between those steps leaves nothing for the new classifier to consume, and `HANDLERS.resolved` currently converts missing `lost` to zero.  
   **Fix:** Resume missing `resolved` requests from committed attribute receipts and require an explicit numeric `lost` before acknowledging.

10. **The gray-rating consumer is named incorrectly.** §4 says `st.rating` feeds gray effects, but `resistOnLog():896` sends `rating: st.power`; `HANDLERS.apply` copies that value into the gray record.  
    **Fix:** Explicitly change the request to pass the snapshotted effective IC rating, with a defined legacy fallback, keeping positioning Power separate.

11. **Trace persistence likewise needs the effective-rating snapshot.** `traceStart():609` reads `st.icRating ?? st.power`, not the new `st.rating`; Power can include positioning.  
    **Fix:** Populate `st.icRating` with the effective IC rating and retain that value in the trace record.

12. **Trace exclusion must recognize zero-turn success.** Successful trace acknowledgements can contain `{ trace: 0 }`, which fails a truthiness test.  
    **Fix:** Detect the presence of the `trace` property rather than testing its value.

The existing hooks otherwise provide the required evidence: `HANDLERS.attack` can persist the proposed snapshot; `HANDLERS.apply` supplies numeric `outcome.boxes`; `HANDLERS.resolved` supplies `outcome.lost`; and `applyResults` supplies separate acknowledged black outcomes. Reading these durable records across ended connections eliminates the previous interruption window after acknowledgement.

Expert eligibility on both sides, neutral schema defaults, party membership gating, persistent N, and party TN placement are now coherent. Initiative remains unchanged with constructs deferred. Add regression tests for the pending-resolution flush, black cancellation’s exit barrier/retry, and baseline changes followed by reversion.

VERDICT: REVISE
### Claude's response
Accepted 1–4, 8–12. Rejected for THIS part 5–7 (black-IC Shield): it is a pre-existing gap needing its own freeze/ack/retry design; moved to part 4b's brief with Codex's three fixes recorded. Part 4a's Shield fix covers the non-black paths only.

## Round 4 — Codex
The main design now fits the code: derived outcomes avoid a second-write recovery gap, the named acknowledgement hooks provide the required results, and `Y.flush()` is implementable as a shared sequencer pass. Deferring black Shield is a clear scope boundary.

Three gaps remain:

1. **Turning cascading off does not explicitly stop existing bonuses.** `cascadeOf(ic)` filters historical enabled admissions against the current baseline, but that baseline excludes the current `cascading` flag; §3 then adds its result unconditionally.  
   **Fix:** Return zero bonuses immediately when the IC’s current cascading flag is off or its program is ineligible.

2. **Host baseline changes can still resurrect old outcomes.** The reset hook watches IC `program`, `rating`, and `hostUuid`, but host Security Value/code changes happen on the host; IC code is derived live in `ICData.prepareDerivedData()`. Changing the host baseline and reverting it therefore restores matching historical admissions.  
   **Fix:** Include host baseline changes in a persistent reset revision, covering linked world and synthetic IC, and test change-then-revert.

3. **Attribute recovery needs more than the existing receipt.** `resistAttribute()` stores only `{ attr, lost, seq, source }`; reconstructing the `resolved` request also needs connection, effective rating, and ripper identity. Moreover, a recovery request created after `processRequests()` runs will not be acknowledged by that same flush.  
   **Fix:** Store the missing recovery metadata with the attribute receipt and recover requests before `processRequests()`, so `flush()` returns only after their acknowledgements exist.

The other revised points check out:

- `HANDLERS.attack` can persist the admission snapshot and final successes.
- `HANDLERS.apply` provides numeric `outcome.boxes`.
- `HANDLERS.resolved`, with the proposed validation, provides numeric `outcome.lost`.
- Black outcomes can be derived from the frozen hit and both resistance acknowledgements, including after interruption.
- Trace acknowledgements are correctly excluded by property presence, including `{ trace: 0 }`.
- Non-black Shield cancellation belongs before armor wear and overload in both damage calculation paths.
- Expert eligibility, party TN placement, persistent N, neutral schema defaults, and unchanged Initiative are consistent with the narrowed scope.

VERDICT: REVISE
### Claude's response
Accepted 1 and 3. #2: chose the 'explicitly describe matching-baseline reuse' option from R3 #3 for HOST changes (a host SV/code edit and revert restores the same cascade — harmless, GM-driven); IC-side edits still bump the epoch.

## Round 5 — Codex
The latest changes resolve the prior three findings: disabling cascading stops bonuses, host-baseline reuse is explicitly deliberate, and attribute recovery now carries the necessary metadata and runs before request processing. `Y.flush()` remains implementable; black Shield is clearly deferred.

One correctness requirement is still missing from §4’s explicit algorithm:

- **Cascade outcomes must match the individual IC, not just its baseline.** `cascadeOf(ic)` scans every decker and filters by `{ gen, epoch, program, hostUuid, code, sv0, rating0 }`; two identical IC on the same host can share all those values and therefore inherit each other’s increments. Existing admission facts already carry `icKey`, and `icKeyOf(ic)` includes the actor UUID and generation.  
  **One-line fix:** Require `outcome.icKey === icKeyOf(ic)` before baseline filtering and add a regression proving two identically configured IC accumulate independently.

Otherwise, the named resolution hooks, expert dice paths, non-black Shield correction, party TN/N behavior, unchanged Initiative, and neutral schema defaults support the narrowed plan. No files modified.

VERDICT: REVISE
### Claude's response
Accepted: outcomes must match icKeyOf(ic) first; regression test added.

## Round 6 — Codex (confirmation, past the 5-round cap)
Confirmed: §4 now requires `icKey === icKeyOf(ic)`, and §7 includes the independent-cascade regression for identically configured IC.

No remaining blocking findings within part 4a’s stated scope. The hooks, recovery ordering, expert dice, party modifiers, schema defaults, and non-black Shield fix are implementable against the reviewed code. Host-baseline reuse and deferred black Shield are explicit.

No files modified.

VERDICT: APPROVED
## Implementation review — Codex (rounds 1–4 on the diff)
R1: 5 findings (decker attribute utilities blocked; recovery missing lastSession; retry cap; nondeterministic Shield test; stale IC sheet) — all fixed. R2: durable receipt + backoff. R3: receipt must be in the same update as the loss — vr2AttrPending flag. R4:
The atomic pending-receipt write closes the remaining recovery gap. Recovery survives session replacement, retries with backoff, and clears pending data only after acknowledgement.

The new regression exercises recovery and cleanup from a seeded pending receipt; the atomic write itself is confirmed by code inspection. No remaining blocking findings.

I did not independently rerun Quench. No files modified.

VERDICT: APPROVED