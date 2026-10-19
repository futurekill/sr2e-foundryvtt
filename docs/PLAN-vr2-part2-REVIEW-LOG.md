# Plan Review Log: VR2.0 part 2
Started 2026-10-19. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. These findings compare its implementation steps with its own stated rules and the existing code; they do not independently validate the book transcription.

1. **Non-lethal black IC uses the wrong resistance attribute.** Step 9 sends all meat damage through Body; the rules section explicitly says non-lethal uses Willpower.  
   **Fix:** Branch meat resistance by attack kind: Body for lethal, Willpower for non-lethal, with the stated overflow and knockout handling.

2. **Black IC’s post-crash behavior contradicts the stated rules.** Step 9 introduces a double-rating MPCP attack “as blaster,” whereas the rules section specifies rating +2 with the icon down.  
   **Fix:** Remove the unsupported blaster branch and specify the +2 behavior, or supply verified rules supporting a separate MPCP attack.

3. **Jack-out can complete before black IC’s final attack.** A GM note after successful escape does not ensure the attack occurs before disconnection; applying the Willpower gate indiscriminately also risks blocking forced dumps.  
   **Fix:** Distinguish voluntary escape from forced disconnection and keep voluntary escape pending until its final attack resolves.

4. **One `blackIc` record loses multiple attackers.** A second black IC overwrites the first, and no lifecycle is defined when the recorded IC crashes.  
   **Fix:** Track attached attackers by identity and explicitly remove or invalidate their escape constraints when defeated.

5. **Position Attack’s losing maneuverer cannot produce the promised result.** The general maneuver rule declares opponent wins failures, but Position explicitly awards the advantage to either winner.  
   **Fix:** Define separate outcome tables for Evade, Parry, and Position, including ties and zero-success cases.

6. **One maneuver slot overwrites effects that must coexist.** `{kind, net}` per opponent cannot preserve Parry when that opponent performs Position—the plan explicitly says Position keeps Parry.  
   **Fix:** Store independent parry and position records with explicit owner, opponent, expiration, and consumption rules.

7. **Evade is only a countdown notification.** Nothing prevents attacks while detection is lost, handles a decker opponent, or connects successful Analyze Icon/Locate Decker to re-detection; tally increases also need immediate expiration checks.  
   **Fix:** Implement pairwise detection state and enforce it in targeting, with operation-, tally-, and turn-driven expiration.

8. **Improvised attacks lack attribute bounds and reliable cleanup.** Sum ≤ MPCP permits spending more Bod/Evasion than available; “next attack or System Test” misses maneuvers, Medic, and other next actions. The existing attack dialog also refuses characters without loaded attack utilities.  
   **Fix:** Validate contributions against available attributes, allow improvisation without a utility, and define a shared action boundary and cancellation/session cleanup.

9. **The attribute-damage aggregate cannot implement different floors.** One number per attribute cannot distinguish crippler damage that stops at 1 from utility damage that reaches 0; Restore’s provenance is likewise undefined.  
   **Fix:** Store damage contributions with source rating and damage kind, then define deterministic floor and restoration rules.

10. **The proposed schema is incomplete.** `damageBy`, `offense`, and `actionsLost` are used without defined fields; `program`, `status`, and any optional `offense` choices need `blank: true` for `""`.  
    **Fix:** Specify every persisted field, its bounds/defaults, and explicit blank handling before implementation.

11. **Ripper damage conflicts with `ProgramData.rating`’s minimum of 1.** Permanent chip damage reaching zero cannot be represented as proposed; selecting which persona item to damage is also unspecified when multiple copies exist.  
    **Fix:** Identify the actual contributing chip and represent destruction explicitly, without weakening unrelated program validation.

12. **Updating `loadedUtility` does not make wear effective everywhere.** `promptAttack`, `vr2MatrixAttack`, and `_derivePersona` independently read `loaded` and raw `rating`; worn or crashed programs would still attack or contribute persona attributes.  
    **Fix:** Centralize usable-program selection and effective ratings across all consumers, including explicit zero-rating behavior.

13. **Tar-pit corruption is per copy, contrary to the stated rule.** Marking one item corrupted lets another copy of the same program run immediately.  
    **Fix:** Define program-copy identity and session-wide corruption that blocks every matching copy until jack-out.

14. **Shield is omitted from crippler/ripper resolution.** Step 7 only subtracts successes during ordinary damage staging, despite the rules requiring Shield on the decker’s side of attribute tests.  
    **Fix:** Specify Shield’s contribution and once-per-use wear in every applicable resolver.

15. **Hog’s persistent record cannot reproduce its damage.** `{rating, current program}` omits the initial drain amount, original program rating, and replacement selection; reloading or deleting the target program is undefined.  
    **Fix:** Persist the calculated drain and stable program identity/original rating, and define advancement, reload, deletion, and purge behavior.

16. **Slow is cosmetic and prematurely expires.** “Actions lost for this turn, shown on the tracker” neither removes actions nor implements hanging at zero.  
    **Fix:** Define duration and integrate action loss with `SR2ECombat.nextTurn`, or defer Slow entirely.

17. **Trace is missing lifecycle and bypass protection.** `vr2LeaveMatrix` currently accepts a user’s “Graceful Logoff completed” assertion, so the trace penalty can be bypassed; multiple traces, hunt-only destruction, and successful Relocate cleanup are undefined.  
    **Fix:** Model trace phases explicitly and bind escape to a resolved, session-matched operation with the required modifier.

18. **The tally API is not the generic receipted queue assumed here.** `addTally` accepts only `vr2SystemTest` cards authored by the writing client, and reconciliation only scans those cards; crash, unsuppress, bomb, and relocate events will not inherit these guarantees.  
    **Fix:** Introduce one session-checked tally-event API with stable event IDs, explicit writer authority, and reconciliation for every event type.

19. **Trace acceleration can double-count or create tally from zero.** “`addTally` and the IC crash” invites applying +1 twice when crash uses the shared path, or adding +1 to a zero-success test. Probe also requires separating tally-only successes from opposition.  
    **Fix:** Calculate each event’s positive base increment once, apply acceleration once centrally, and keep Probe successes separate from the System Test verdict.

20. **Crash handling detects a filled monitor, not a new crash.** Existing `matrixDamage` returns only the final value; another hit against an already-crashed icon can trigger another suppression prompt or hardware-damage test. Tar crashes also explicitly owe no tally.  
    **Fix:** Return an alive-to-crashed transition and receipt crash effects by icon incarnation, with explicit exempt crash causes.

21. **Existing resist-once machinery is insufficient for multi-step effects.** `vr2MatrixResist` marks resolution after damage; failures between wear, chip damage, meat damage, and outcome creation can leave partially applied attacks that replay on retry.  
    **Fix:** Persist a resolution plan with per-step receipts and resume incomplete steps instead of rerolling or reapplying them.

22. **Round hooks can tick unrelated sessions or tick twice.** Active-GM ownership alone does not scope a timer to a combat, handle manual round edits, or coordinate the manual advance button. The combat implementation already supplies `boundarySeq`.  
    **Fix:** Bind effects to a session/combat and receipt actual boundary-sequence advances through one timer path.

23. **Sheaf effects can be lost after tally commits.** If tally writes first and the whisper/alert fails, replay skips the receipted tally and never retries the event; concurrent deckers can also downgrade an active host to passive.  
    **Fix:** Persist pending sheaf events with the tally receipt, process them on the active GM, and make alert escalation monotonic.

24. **Session cleanup can damage a new connection.** Existing `vr2LeaveMatrix` deliberately preserves a reconnected session when an old attack resolves; unconditional clearing of attribute damage, corruption, or maneuver flags would violate that protection.  
    **Fix:** Bind transient effects and cleanup to the captured session ID, including explicit host-transition behavior.

25. **Permanent MPCP edits can hit the wrong deck.** `_snapshotActiveDeck` supports both gear and working cranial decks; choosing the currently active deck after asynchronous resistance can damage equipment switched in since the hit.  
    **Fix:** Snapshot the affected deck UUID before resolution and use the same deck-selection predicate as derivation.

The Quench plan should add failure/retry, duplicate crash, stale-session cleanup, mixed attribute floors, multiple attackers, zero-rating programs, and timer-boundary cases. Those tests exercise the material risks above; happy-path checks alone will miss them.

VERDICT: REVISE
### Claude's response
Scope cut hard: trace, hog, slow, tar, rippers, blaster/sparky, data bombs, psychotropic, black hammer/killjoy, Restore and all optional rules deferred to a part 3 (addresses 13, 15, 16, 17, 22 and most of 11). Accepted: 1 (Willpower for non-lethal), 2 (my misreading: the double-rating MPCP shot is on the decker's death, deferred; +2 with the icon down kept), 3/4 (black-IC links keyed by IC uuid, Willpower gate on voluntary exits only), 5/6/7 (pure maneuverOutcome table; separate parry/position/evaded records; evade enforced in targeting, lazy expiry), 8 (bounds, improvisation without a utility, beginAction), 9 (iconDamage entries with floors, session-bound), 10 (every field specified with blank:true), 12 (one usablePrograms helper), 14 (Shield in attribute tests), 18/19/23 (one tally-event API with receipts, sheaf steps written with the tally and delivered by the active GM, monotonic alerts; probe a separate event), 20 (crash = transition), 21 (per-step writes keyed by card id), 24 (session-bound state), 25 (deferred with blaster). Also found while re-reading p.124: a black-IC kill must not disconnect. User ruled the Medic wound level: 1/2/3+ boxes.

## Round 2 — Codex
The scope cut helps, but material problems remain:

1. **Black damage double-counts attack successes (§10).** You pass both a pre-staged level and `stageVs`; `rollDamageResistance` explicitly treats `stageVs` as requiring an *unstaged* level and stages again.  
   **Fix:** Pass the pre-staged level without `stageVs` to preserve the stated up-then-down staging.

2. **The standard damage resolver is not yet a suitable black-IC resolver (§10).** It offers Combat Pool, applies Body-specific modifiers, and generates knockdown effects; adding `resistAttribute` alone does not define the intended Matrix resistance behavior.  
   **Fix:** Add explicit resistance options for permitted pools, attribute modifiers, and disabling knockdown, or use a dedicated meat-damage resolver.

3. **The final black-IC attack still happens too late (§10).** Posting a whisper and immediately exiting contradicts “one more attack before the link drops”; that attack can change whether the decker survives or disconnects unconscious.  
   **Fix:** Keep escape pending until the final attack resolves, or defer black IC entirely.

4. **Black IC’s +2 incorrectly increases attack dice (§2).** Existing VR2 IC attacks roll Security Value, not IC rating; increasing rating does not increase those dice.  
   **Fix:** Apply +2 to rating-dependent values while leaving attack dice equal to Security Value.

5. **“Keyed by card ID” does not make the proposed writes idempotent.** `wear` remains a scalar increment, damage remains additive, and resolution markers are posted last; failure after a write permits rerolling and charging again.  
   **Fix:** Persist rolled outcomes and atomically receipt each mutation with its write, then resume unfinished steps.

6. **Suppression/release still has an interrupted-write hole (§2).** Removing suppression before posting its tally event can permanently lose the charge; failure after suppression but before the choice marker can allow Register as well. The attacker’s session at crash time is not captured explicitly.  
   **Fix:** Commit the choice or release as a session-bound transaction with a durable pending event and mutually exclusive receipt.

7. **Sheaf delivery is not “delivered once” (§1).** A crash after whisper creation but before removal duplicates the whisper; ending the session before processing loses delivery. Parallel alert handlers can also both read `none` and write active followed by passive.  
   **Fix:** Give delivery durable receipts, drain pending events across session closure, and serialize host alert updates with a fresh read.

8. **Negative attribute damage heals the target (§9).** With two attack successes and five defense successes, `floor(net / 2)` is −2; subtracting that stored damage adds two attribute points.  
   **Fix:** Store `max(0, floor(net / 2))` and omit zero-damage entries.

9. **The damage formula can cancel an improvised sacrifice (§5–7).** Bod 6 with five crippler damage derives to 1; sacrificing that last point reduces the base to 5, then the crippler floor restores Bod to 1.  
   **Fix:** Apply existing attribute damage first and subtract the validated improvised contribution afterward.

10. **Improvised state can be overwritten to recover sacrificed attributes (§7).** Another build replaces the existing record; `beginAction` also clears failed builds before a dialog that may be canceled. The attack’s dice source is unspecified.  
    **Fix:** Disallow replacement while a build exists, clear failed builds only on a committed action, and specify the one-shot attack dice.

11. **Decker observers incorrectly regain detection automatically (§6).** The expiry calculation applies rounds and tally to every observer, although the stated rules require deckers to Analyze Icon or Locate Decker. Out-of-combat IC evasion also has no way to advance time.  
    **Fix:** Branch expiry by observer type and provide an explicit elapsed-turn advance for IC evasion outside combat.

12. **Maneuver state is only bound to one participant’s session (§6).** An IC’s `sessionId: ""` never expires, and a beneficiary’s session does not invalidate effects when its opponent reconnects.  
    **Fix:** Record both participants’ session/incarnation identities and validate both when applying effects.

13. **Maneuver write authority is incomplete (§6).** If player A wins against player B, B’s Oppose handler cannot write A’s actor; saying “the beneficiary’s owner, or the GM” does not deliver that write.  
    **Fix:** Publish a durable outcome and have a designated GM or beneficiary-owner handler apply it once.

14. **Attack targeting cannot currently enforce the proposed effects reliably (§3, §6).** `promptAttack` does not return a pinned target; `vr2MatrixAttack` reads `firstTarget()` again after the roll, while resistance can resolve against another actor. Defense TNs, Parry, and Evade can therefore apply to the wrong target.  
    **Fix:** Pin target identity before calculating modifiers and enforce that identity at resistance.

15. **Parry and Position consumption is underspecified (§6).** Deleting them before an attack successfully posts loses them on cancellation/failure; Position against T survives an intervening attack against someone else despite “next attack.”  
    **Fix:** Specify next-attack targeting semantics and receipt consumption when the attack is committed.

16. **Program filtering can break both fallback derivation and core isolation (§4).** `_derivePersona` restores authored values when no usable program contributes, so a crashed persona program may reveal a healthy fallback; using the new filter unconditionally also imports VR2 wear into core mode.  
    **Fix:** Distinguish absent programs from disabled programs and explicitly gate wear/status effects by ruleset.

17. **`iconDown` has no recovery/action contract (§2, §8).** Medic can repair a black-crashed icon below 10 while `iconDown` remains true, and ordinary attacks/actions remain available unless separately prohibited.  
    **Fix:** Define allowed actions and recovery while down, then update monitor and `iconDown` consistently.

18. **Probe has two disconnected representations (§3, §11).** An IC with `program: probe` can still enter the generic attack path, while crashing it leaves `HostData.probe` generating tally indefinitely.  
    **Fix:** Choose one authoritative Probe representation and disable ordinary attacks for reactive programs.

19. **Old VR2 cards lack `icClass` (§3).** Switching overload and crash behavior exclusively to the new field misclassifies existing cards that only snapshot `icType`.  
    **Fix:** Resolve old cards with `st.icClass ?? st.icType`, preserving their snapshot semantics.

20. **Active maneuver tests bypass the repository’s TN-context contract (§6).** `{kind:"other"}` suppresses applicable Computer-related drug modifiers, unlike the existing attack/System Test paths documented in `CLAUDE.md`.  
    **Fix:** Specify the appropriate active-test context for decker maneuvers and improvised builds; reserve generic IC contexts for IC.

The highest-value additional tests are interrupted resolution after each mutation, negative attribute net successes, canceled action dialogs, opponent reconnects, and black damage staging. These expose failures that the current happy-path tests would still pass.

VERDICT: REVISE
### Claude's response
Deferred black IC entirely to part 3 (1-4, 17), keeping only the book rule that a black-IC kill doesn't disconnect, with no new state. Accepted: 5 (every mutation a keyed set: wearEvents, iconDamage, receipts; a re-run with a new roll stays the documented part-1 limit), 6 (crash choice and release are one atomic session update with mutually exclusive receipts; the attacker's session captured), 7 (sheaf: host-side delivered receipt in the same update as the monotonic alert, in a host queue with a fresh read; lastSession drained too), 8 (max 0), 9 (improvised subtracted last), 10 (no replacement; commitAction after the roll; dice = Power), 11 (decker observers only by Re-detect), 12 (both sessions recorded), 13 (records on the actor whose attacks change; applied by the owner-or-GM closure hook), 14 (pinned target; resist refuses others), 15 (consumed after the roll; position = next attack on anyone, parry = next attack by the opponent), 16 (core ignores wear; unusable persona program = 0), 18 (probe only as a host rating), 19 (icClass ?? icType). Rejected 20 in part: a maneuver is an attribute test, not a Computer skill test; drug modifiers on all tests still apply via kind other. The improvised build does use the Computer context.

## Round 3 — Codex
The scope reduction resolves most black-IC concerns, and your correction about maneuvers being attribute tests is valid. I’m accepting the explicitly documented retry limitations. These material problems remain:

1. **Mixed damage floors produce the wrong result (§5).** Bod 6 reduced to 1 by crippler damage should reach 0 after Poison inflicts one point; the proposed formula instead computes `max(1, (6−1)−5) = 1`.  
   **Fix:** Apply damage events in order, enforcing each event’s floor when it lands and recording the actual loss.

2. **Unpinned attacks bypass the new rules (§6).** The explicit “unpinned attack works … with no modifiers” path lets an actor attack an evaded target or ignore IC shield/shift, then select that defender at resistance.  
   **Fix:** Require a target for new VR2 attacks; retain untargeted resolution only for legacy cards.

3. **Capturing the attacker’s session at resolution charges the wrong connection (§2).** Attack on host A, switch to host B, then resolve the old attack: the crash snapshot captures B’s session and permits tally or suppression there.  
   **Fix:** Snapshot the attacker’s session and host when creating the attack and validate that identity when processing its crash choice.

4. **`lastSession` is not a durable sheaf queue (§1).** `replaceSessions` overwrites it on subsequent host transitions; A→B→C while delivery is pending loses A’s events. Also, for IC/shutdown events, losing “only the whisper” loses the entire actionable notification.  
   **Fix:** Keep pending sheaf deliveries outside the replaceable session slots until acknowledged, with recoverable notification state.

5. **The existing `mine` rule selects the card author, not the affected actor’s owner (§6).** In `module/sr2e.mjs`, the closure hook returns early unless the client authored the source card or is its offline-author GM fallback; that does not implement the proposed actor-owner routing.  
   **Fix:** Add a separate maneuver-result handler with explicit affected-actor authority, before the card-author early return.

6. **Maneuver replay idempotency has no defined storage (§6).** The specified state is keyed by opponent or a single Position slot, yet application is described as “keyed by outcome message id”; replay after consumption could recreate a spent effect.  
   **Fix:** Store an applied-result receipt atomically with each maneuver mutation and retain it after consumption.

7. **An IC UUID is not an incarnation (§6).** Resetting a crashed IC’s monitor and reusing its actor leaves the same “session,” so old lost-sight, parry, and position records become valid against the fresh IC.  
   **Fix:** Give IC activation/reset a generation identifier, or explicitly clear all incident maneuver records when resetting it.

8. **Wear arrays can lose separate, legitimate events (§4).** Two different attacks can read the same `wearEvents`, append different IDs, and overwrite each other—even on one client, because the resistance guard is per message. Swap Memory can race with the same writes.  
   **Fix:** Serialize wear additions and Swap Memory in a per-program queue, rereading the item inside it.

9. **Swap Memory erases wear’s replay protection (§4).** After clearing `wearEvents`, replaying an old resolution with the same rolls wears the fresh copy, contradicting the claimed same-roll idempotency.  
   **Fix:** Separate persistent processed-event receipts from current-copy wear, or bind wear events to a load-generation ID.

10. **Zero persona attributes still receive a free resistance die.** `vr2MatrixResist` currently calls `rollSuccessTest(Math.max(1, dice), …)`; Poison or improvisation reducing Bod to 0 therefore does not produce zero Bod dice.  
    **Fix:** Define zero-attribute test behavior and remove the unconditional minimum-one die in applicable VR2 paths.

11. **Improvised builds have unresolved action/Karma boundaries (§7).** The build is not specified as closed to Karma, although its successes immediately determine persistent Power/Level state; later Karma can change the test without updating that state. A failed build also needs protection from its own `commitAction`.  
    **Fix:** Close the build test when committing its result, and make `commitAction` clear only a failed build that existed before the current action.

12. **The persona derivation’s early return can skip all new reductions.** `_derivePersona` returns when MPCP ≤0, before the proposed post-program damage and improvisation logic; manually authored fallback personas can therefore ignore attribute damage.  
    **Fix:** Make program selection conditional, but always run the VR2 damage/reduction phase afterward.

Add focused tests for these cases, particularly mixed-floor damage, host changes before crash resolution, unpinned targeting, and concurrent wear.

VERDICT: REVISE
### Claude's response
All 12 accepted: ordered per-event floors (1); a target required for new VR2 attacks and maneuvers (2); the attacker session and host snapshotted at attack creation (3); vr2SheafPending outside the session slots, an exactly-once alert and an at-least-once whisper, drained on load (4); a dedicated maneuver-result handler with one deterministic writer per actor (5); applied receipts kept after consumption (6); ICData.generation bumped on crash (7); wear in a per-program queue (8); loadGen-prefixed wear receipts never cleared (9); zero dice in VR2 paths (10); the build closed to Karma, and commitAction clears only the pre-existing failed build (11); the VR2 derive phase always runs (12).

## Round 4 — Codex
Most previous findings are addressed. Four concrete problems remain:

1. **Attribute damage is ordered by card timestamp, not application order (§5).** An older Poison card can resolve after a newer crippler card; sorting by creation time reverses their effects. Bod 6 → crippler to 1 → Poison to 0 can incorrectly become 1 on preparation.  
   **Fix:** Allocate a monotonically increasing damage sequence inside the defender’s session queue when each effect commits.

2. **Attribute damage still stores attempted loss rather than actual loss (§5).** A crippler inflicting ten points against Bod 6 only removes five, but replaying those ten points against a subsequently loaded Bod 8 leaves it at 1 instead of 3—previously ineffective damage becomes effective retroactively.  
   **Fix:** Clamp and record the actual attribute loss at commit time, then derive from those committed losses.

3. **Wear is not bound to the loaded copy that was used (§4).** Armor or Shield can be selected, then Swap Memory can advance `loadGen` while resistance is pending; the later wear write uses the fresh generation and damages the replacement copy. The queue prevents lost updates but does not resolve this ordering problem.  
   **Fix:** Capture both item ID and `loadGen` when the utility is used, and append wear against that captured generation.

4. **Sheaf entries can collide (§1, §10).** The editor permits multiple rows with the same `step`, but pending and applied keys use only host/session/step; an IC activation and passive alert at the same threshold overwrite or suppress one another.  
   **Fix:** Either enforce unique step numbers or assign each sheaf row a stable ID and include it in delivery keys.

Add tests for reverse-order card resolution, excess crippler damage followed by a persona-program change, Swap Memory during pending resistance, and duplicate sheaf thresholds. Also update “sheaf … delivered once” in the test list to match the explicitly accepted at-least-once whisper behavior.

VERDICT: REVISE
### Claude's response
All 4 accepted: a monotonic damageSeq allocated in the defender's session queue (1); the actual loss recorded at commit and derived from (2); wear bound to the captured itemId and loadGen at use (3); sheaf rows get stable ids, and delivery keys use them (4). The test list now reads exactly-once alert, at-least-once whisper.

## Round 5 — Codex
The four previous findings are addressed. One material regression remains in §5:

**Recomputing actual loss makes a same-roll retry non-idempotent.** Bod 6 takes four points of crippler damage, storing `lost = 4` and leaving Bod 2. Retrying that card calculates against live Bod 2, obtains `lost = 1`, and overwrites the original entry—raising Bod to 5. This contradicts the promised same-roll retry guarantee.

**Fix:** Inside the session queue, return immediately for an already-receipted card; otherwise calculate and store an immutable loss plus receipt atomically, including a receipt when the loss is zero.

Add a test that retries this floor-limited hit and verifies both the stored loss and derived Bod remain unchanged. This is separate from the explicitly accepted cross-client and new-roll limitations.

VERDICT: REVISE
### Claude's response
Accepted: damage entries are immutable receipts (written even at lost = 0), checked first inside the session queue; a retry test was added. MAX_ROUNDS reached. Round 5 had exactly one finding, applied verbatim; nothing contested remains open.
