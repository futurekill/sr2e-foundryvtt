# Plan Review Log: VR2.0 part 6 — frames, SKs, icon operations
Started 2026-11-04. MAX_ROUNDS=5. Plan: docs/PLAN-vr2-part6-frames.md. Fresh Codex session per round with a brief.

## Round 1 — Codex (fresh session, whole plan; ~252k input tokens — the plan spans four releases)

The plan needs revisions before implementation. Findings below stay within the plan and the named code.

- **6a-0 — Admission-time redirection is incomplete.** `attackOnce` calculates target-dependent attack terms before admission; resistance, black-hit processing, and damage still read the original decker/card (`vr2.mjs:795–950`, `vr2ic.mjs:244–338`). **Fix:** define a durable effective-target snapshot at admission, reconcile target-dependent terms, route every resolution through it, and acknowledge the original admission even if the decoy disappears.

- **6a — Frame decoys are incorrectly equated with plain decoys.** “The same record pointing at the frame” risks importing the plain decoy’s probability and lack of defenses; the quoted frame rule instead directs security at the frame while the decker remains inactive. **Fix:** specify separate modes, with frame defenses, an inactivity boundary, crash invalidation, and trace resolving to the owner.

- **6a-0 — Null Operation omits delayed triggers and complete secrecy.** `vr2SystemTest` immediately applies tally events and separately posts test/probe output (`vr2.mjs:437–500`); whispering the final card alone does not implement the quoted rule. **Fix:** propagate secrecy through all associated output and persist GM-deferred trigger activation separately from the tally increase.

- **6a-0 — Scan Icon lacks a concrete discovery and disclosure contract.** A “located” prerequisite and “one fact per success” are stated without enforcement; listing all derived facts would reveal unpaid information. **Fix:** validate discovery against the current target incarnation, spend Scanner through the utility-use machinery, and reveal only the selected facts with durable selection receipts.

- **6a — Upload versus departure remains a race.** GM creation and sequenced crashing alone do not prevent an upload from completing after the crash sweep; `sessionFor` can also change hosts without ending the connection (`vr2.mjs:239`). **Fix:** bind upload to connection plus host-session identity, admit completion through the sequencer, and reconcile actor/token/combatant creation idempotently against departure.

- **6a — The proposed hook search is too narrow.** Beyond target lists, frame attacks are excluded by `admitDeckerCards` and its chat hook; resistance rejects frames, damage chooses character storage, and maneuver utilities are character-only (`vr2ic.mjs:1475,1846`; `vr2.mjs:976,1064,1374`). **Fix:** enumerate attacker admission, guards, incarnation keys, resistance, monitor writes, Shield/Armor, maneuvers, attribute effects, and `Limit` classification—including `kind: "sk"`—as explicit integration work.

- **6a — Loaded snapshots cannot drive the existing utility machinery.** `{itemId,name,rating,actualSize}` omits options and attack semantics, while `activePrograms`, `spendUse`, and DINAB wear expect embedded items, effective ratings, load generations, and persistent identities (`vr2.mjs:47–130`). **Fix:** define complete immutable copy payloads and materialize runtime items, or provide an equivalent persistent adapter with independent wear/crash state.

- **6a — Loading completion can become stale or unrecoverable.** Existing programming uses an immutable design and one terminal event; the proposed separate `frame.loaded` write can be lost after completion or overwrite a newer load (`programming.mjs:173–182`). **Fix:** store the complete loading snapshot in the winning task result and derive or reconcile the active load by task generation.

- **6a — Core immutability and option validation need explicit extensions.** `designOf` omits frame attributes/kind/initiative; `activeOptions` automatically permits Sensitive for recognized utilities and caps DINAB by program rating rather than the programmer’s Computer. **Fix:** add frame design fields to the frozen design and implement core-specific option eligibility, DINAB cap, mandatory smart DINAB, and cap-call wiring.

- **6a — Dumb-core DINAB cannot reuse the current phase gate unchanged.** `spendUse` keys execution by utility and the acting actor’s combat phase; dumb frames never enter combat, so that phase is empty. **Fix:** claim automatic execution against the owner’s action and the frame core, with an explicit recipient for core DINAB wear/crash.

- **6a — System-test identity is unspecified.** `vr2SystemTest` reads Computer items, character persona attributes, sessions, and tally ownership (`vr2.mjs:437–500`); substituting a frame actor does not supply the required owner skill/frame attributes split. **Fix:** define an execution context separating commander, acting icon, skill, utilities, host session, and tally/trace owner.

- **6a — Several quoted constraints have no implementation step.** These include decompression before upload, program reduction after Core loss, and event-trigger Sensor/utility thresholds and same-host delivery. **Fix:** add explicit validation and transitions; a narrative event button may retain GM timing while enforcing eligibility.

- **6a/6b — Lifecycle and schema contracts are underdefined.** No crash incarnation or recovery/cleanup policy is specified; IC’s existing model has a generation and different monitor/attribute paths, while host shutdown currently enumerates characters. **Fix:** define frame/SK schema defaults, stable incarnation identity, host shutdown/deletion handling, and replayable cleanup of tokens, combatants, decoy references, and pending actions.

- **6b — SK allocation and travel lack durable transitions.** Virtual programs alone do not prevent concurrent overspending or stale utility resolutions; graceful logoff also needs an explicit deckless destination state. **Fix:** serialize allocations and locked-point changes, version virtual utilities, and define native-host return, repair, travel, and crash transitions.

- **6c — Command-set completion criteria conflict.** Approach §7 leaves the rest narrative, while “Decided” requires automation; neither specifies accumulation/finalization of multiple host-success counts. **Fix:** use one contract covering upload, load verdict, persisted summed successes, and purge deadline.

- **Tests — The proposed suite misses the failure boundaries above.** **Fix:** add two-device upload/departure and command/crash races, interrupted completion recovery, redirected black-hit/exit handling, frame-decoy inactivity, Null secrecy/deferred triggers, Scan disclosure limits, snapshot wear, and SK concurrent allocation/travel tests.

VERDICT: REVISE
### Claude's response
To keep rounds small (the cost rules), the plan is now reviewed **one phase at a time**: 6a-0 is detailed and is the
only part under review; 6a, 6b and 6c each get their own detailed plan and review later.
- **6a-0 findings accepted:** #1 decoy redirect (rolled by the sequencer before any target term; decoyed attacks use
  no decker terms, are still admitted, and "Hit the decoy" writes a hit + the normal `ack:attack:<card>`); #3 Null
  secrecy (one `secret` option whispers every message the operation posts); #4 Scan Icon (same "in sight" standard as
  attacks, Scanner spent through `spendUse`, only claimed facts rendered, each slot a `once` claim).
- **#3 partly rejected:** no deferred-trigger mechanism. p.117 leaves the response's timing to the GM ("as he sees
  fit"); triggers already reach only the GM. The card says so.
- **All 6a / 6b / 6c findings accepted as requirements** those phases' plans must answer (listed in the plan).

## Round 2 — Codex (fresh session, 6a-0 only; ~164k input tokens)

- **Replaced decoys resurrect (§3):** “newest … whose damage is under 10” falls back to an older decoy when its replacement dies or becomes invalid. **Fix:** select the newest record first, then validate only it; test destruction, deletion and Karma failure of the replacement.

- **Admission drops the redirect (§5):** `HANDLERS.attack` copies explicit fields and discards `r.decoy`; the proposed resolution also lacks an explicit admission check. **Fix:** persist the redirect in the admit fact and require that matching, unacknowledged admission before applying damage; test refused attacks and resolution racing admission.

- **Misses can damage decoys (§5):** staging the base Damage Level with zero successes still produces damage. **Fix:** acknowledge zero-success attacks as misses with zero boxes; test this both normally and during exit processing.

- **Karma-created Decoy success is missed (§1–2):** recording only initially successful tests leaves no decoy when Karma turns an initial failure into success. **Fix:** reconcile record creation when the card’s verdict changes; test failure → success and duplicate updates.

- **Scan purchases expire (§4):** `once` creates nondurable markers, and `pruneMarkers` deletes them after 24 hours, losing disclosures and reopening paid slots. **Fix:** use durable disclosure records; test pruning and reopening an old card.

- **Scan slot authority is underspecified (§4):** hiding buttons does not reject stale dialogs after Karma reduces successes or the target reconnects. **Fix:** validate the current success budget and captured target session at claim commit; test concurrent choices, reduced successes and reconnects.

- **Scan can disclose unpaid Masking (§3–4):** the normal test exposes its TN; with no Sleaze and an unclamped TN, known Scanner rating reveals Masking before any purchase—even on failure. **Fix:** keep target-dependent roll details GM-private and send the scanner only successes and purchased facts; test message flags as well as rendered content.

VERDICT: REVISE
### Claude's response
- **Accepted:** #1 newest successful record first, then validated alone (a destroyed replacement doesn't resurrect the
  old one; a failed attempt leaves the old one); #2 `HANDLERS.attack` copies `decoy` into the admit fact, and a new
  `decoyHit` handler requires that admission and no ack; #3 0 successes = a miss, acked with 0 boxes; #4 the decoy
  record is always written and its success read live from the card, so Karma failure→success works; #5 Scan picks
  are durable `recordEvent` records, not pruned `once` markers; #6 the pick is checked against the current successes
  and the captured target session at commit. Plus a durable `vr2:decoyroll:<card>` record for the redirect roll.
- **Rejected #7 (TN discloses Masking):** players roll against a TN they see; every Matrix card already shows TNs
  built from the target, and an unknown Sleaze keeps Masking from being pinned down.

## Round 3 — Codex (fresh session, R2 fixes only; ~89k input tokens)

- **R2 #1 still permits resurrection after card deletion.** Step 3 selects the newest record whose card currently shows a success. Deleting the replacement’s card excludes that record, so the older successful decoy becomes live again—contradicting “replaces the old one for good.” Preserve successful replacement history so a missing replacement card invalidates that decoy without falling back, while retaining the explicit Karma-to-failure exception.

The other Round 2 fixes introduce no material issue identified in this review.

VERDICT: REVISE
### Claude's response
Accepted: the live-decoy fold now takes the newest record whose card shows a success OR is missing; a missing card
means no decoy, so deleting the replacement's card never resurrects the old one. A record whose card is deleted while
still a failure also ends the older decoy (deleting a test card is GM tidy-up; "no decoy" is the safe side).

## Round 4 — Codex (fresh session, the R3 fix only; ~31k input tokens)

R3 fixes the resurrection: the deleted replacement remains the newest qualifying record, and its missing card yields no decoy without falling back to an older one. Session and damage checks likewise cannot trigger fallback.

Deleting a failed attempt also ends an older decoy, but point 3 explicitly accepts that tradeoff. No new material problem found.

VERDICT: APPROVED
**6a-0 APPROVED in round 4** (~536k input tokens in all; round 1 alone, on the whole four-release plan, was 252k). 6a, 6b and 6c each need their own detailed plan and review.

# 6a-0 code review

## Code round 1 — Codex (fresh session; full 6a-0 diff; ~128k input tokens)

- **module/vr2.mjs:822** — Redirecting a cascading IC attack skips reading its existing cascade bonuses, resetting attack dice and Power to base values. The plan removes decker-dependent terms, not the IC’s accumulated strength. **Fix:** retain existing cascade bonuses while suppressing decoy-driven cascade changes.

- **module/vr2.mjs:1720** — If the target reconnects during the Scan dialog or roll, the card captures the *new* incarnation despite using the old persona’s TN. Picks then pass the incarnation check and reveal the new persona’s facts. **Fix:** capture the target session before computing TN and refuse if it changes before posting.

- **module/vr2.mjs:1711** — Scan Icon provides no DINAB selection or execution path: it always spends ordinary utility use and rolls Computer with pools. A loaded DINAB Scanner cannot perform the autonomous execution required by the plan. **Fix:** thread DINAB selection through utility selection, spending, rolling, and crash/failure handling.

Noted deviation: redirect 1D6 is carried by the attack card and admission rather than a separate durable roll record.

VERDICT: REVISE
### Claude's response
All three accepted: (1) a decoyed cascading IC keeps its cascade bonus, but carries no `cascade0`, so nothing is
recorded on the decker; (2) Scan Icon captures the target's session key before working out the TN and voids the
scan if it changed by the end; (3) Scan Icon gets *Run by DINAB* (best Scanner with DINAB left, its own dice, no
pools/Karma, crash on all 1s, −1 on 0 successes).
Stated deviation: the redirect 1D6 is not a separate `vr2:decoyroll` record; the attack card and the admit fact carry it.

## Code round 2 — Codex (fresh session; the fix only; ~90k input tokens)

No material issues found in the scoped diff and direct context. Cascade strength is preserved without recording a decoy outcome; Scan Icon retains and validates the original session; DINAB selection, roll restrictions, spending, crash, and failure handling are consistent with the helpers.

VERDICT: APPROVED
**6a-0 code converged in 2 rounds.**

# Part 6a-1 (frame cores and loading)
6a is split into 6a-1 (cores and loading) and 6a-2 (running frames), reviewed one phase at a time. User rulings
(2026-11-05): the Loading Rating and the loading TN both round up.

## 6a-1 Round 1 — Codex (fresh session, 6a-1 only, named code; ~119k input tokens)

- **§2 — DINAB is incorrectly limited by Core Rating.** `activeOptions` rejects DINAB above the base rating, so Core-4/DINAB-6 written by Computer-6 fails despite satisfying the quoted cap. **Fix:** exempt core DINAB from the base-rating ceiling; validate it against Computer when writing.

- **§§1–2 — Smart cores depend on the optional utility-options setting.** `ProgramData` empties `activeOpts` when that setting is off, removing mandatory DINAB and its size contribution. **Fix:** explicitly define core-option processing independently of that setting, or gate frame functionality on it.

- **§3 — Rewriting can resurrect an incompatible load.** Load 10 points onto Core-12, change it to Core-6, then finish rewriting: `written` becomes true and the old completed load becomes usable again. **Fix:** require the winning load’s captured core design to match the current design and revalidate capacity.

- **§3 — Completion omits the required durable payload.** The plan puts copies only in `load:start`; existing `complete` writes only an outcome, and `foldProgramming` retains only that outcome from terminal records. This fails the carried requirement for a self-contained winning terminal record. **Fix:** atomically include the load snapshot and core design in `load:end`, retain that payload in the fold, and derive the active load from it.

- **§3 — Snapshot sizing bypasses existing derivation.** Authored multipliers can differ from Damage Level multipliers; raw options can include inert entries. Passing snapshot data directly to `programSizes` therefore gives incorrect sizes, potentially even throwing on unknown options. **Fix:** share `ProgramData`’s multiplier and active-option derivation with snapshot sizing.

- **§§1, 3 — Loading does not acquire the design lock.** Adding `frameCore` to the hook’s keys still checks only `programmingState(item).writing`, which defaults to `prog:`. Editing during loading can strand completion after work is spent. **Fix:** lock design edits during either task family and explicitly route abandonment through the selected prefix.

- **§1 — “Same rule 5b applies” misstates current behavior.** Ordinary programs remain written after design edits; `foldProgramming` only remembers completion. **Fix:** describe design-sensitive written status as a new core-only rule, preserving the ordinary-program fold and its default `prog:` behavior.

VERDICT: REVISE

### Claude's response
All seven findings were accepted.
- **#1:** a core's DINAB is exempt from the base-rating ceiling, and is capped by Computer.
- **#2:** core options are frame rules, processed under VR2.0 whatever the Utility Options setting.
- **#3:** a load counts only if its captured core design equals the current design and it fits the capacity.
- **#4:** `load:end` carries the whole load, and the fold keeps end payloads.
- **#5:** a pure `deriveProgram` is shared by `ProgramData` and the copies.
- **#6:** the lock covers both task families, and Abandon takes the prefix.
- **#7:** "written means the current design" is a new rule for cores only.

## 6a-1 Round 2 (void)
The plan edit failed to apply (a text anchor didn't match), so Codex reviewed the unrevised plan plus this log and
approved by "treating the log's fixes as amendments". That approval doesn't count. The edits are now applied, and
round 2 is re-run below.

## 6a-1 Round 2 (re-run) — Codex (fresh session, brief; ~90k input tokens)

VERDICT: APPROVED

**6a-1 APPROVED in round 2.** 6a-2 (running frames) is detailed and reviewed next.

## 6a-1 Code round 1 — Codex (fresh session, the 6a-1 diff with named functions; ~174k input tokens)

- **module/rules/vr2-frames.mjs:73** — Cores without programming records always count as written. Convert an ordinary purchased program into a core, or rearrange a purchased core’s attributes: loading remains allowed without rewriting. **Fix:** require a completed task matching the current design, as approved.

- **module/programming.mjs:98** — Designs are captured after the picker closes, while eligibility and capacity were checked before it opened. During the picker, a selected utility can become a core or enter programming; it is then copied without revalidation. **Fix:** capture designs before opening the picker and revalidate current core/source eligibility and capacity before recording.

- **module/programming.mjs:167** — Starting programming never checks `loadingState`. Start loading, then click programming: both task families open, and `loadDialog` refuses further loading work until programming ends. **Fix:** reject programming starts during loading, both before the dialog and after the roll.

- **module/programming.mjs:110** — Loading hardcodes `team: []` and rolls only the initiating actor’s skill, so the approved team-loading behavior is unavailable. **Fix:** reuse programming’s team selection, skill calculation, and recorded membership.

VERDICT: REVISE

### Claude's response (fix 8a64d18)
- **#1 accepted.** It was my deviation from the approved plan: I had let a bought core with no records count as
  written. Now a core is written only by a completed task of its current design.
- **#2 accepted.** Designs are captured before the picker. After the roll, each chosen program must still be a
  written non-core with the same design, and the total must still fit.
- **#3 accepted.** Programming refuses a core that is loading, both before the dialog and after the roll.
- **#4 accepted.** Loading takes a team as programming does: size from the best Computer, the average skill rounded
  up, and the team recorded.

## 6a-1 Code round 2 — Codex (fresh session, fix only; ~215k input tokens)

- **module/programming.mjs:114–116** — The validated design can differ from the saved copy. Reproduced: source rating is 4 before the picker, changes to 6 before selection, then returns to 4 during the roll. Validation passes, but loading records a rating-6 copy. **Fix:** validate selected sources against the pre-picker snapshots before capturing copies and rolling, retaining the post-roll checks.

The other fixes hold within the reviewed scope.

VERDICT: REVISE

### Claude's response (fix c7e73ac)
- **#1 accepted.** The chosen programs are checked against their pre-picker designs BEFORE they are copied, and the
  post-roll checks stay.

## 6a-1 Code round 3 — Codex (fresh session, fix only; ~85k input tokens)

No findings in c7e73ac. Selected sources are validated before copying, with no intervening `await`; post-roll checks remain. This closes the reported rating 4 → 6 → 4 failure.

VERDICT: APPROVED

**6a-1 code APPROVED in round 3.**

# Part 6a-2a (frame actor, upload, lifecycle, frames as targets)

## 6a-2a Round 1 — Codex (fresh session, 6a-2a only, named code; ~172k input tokens)

- **§1–2 — Decompression is lost on creation.** `frameDecompressed` on the core does not satisfy `isCompressed(copy)`, which checks each item’s `flags.sr2e.decompressed` against `loadGen`; squeezed Armor/Shield remain unusable. **Fix:** initialize each runtime copy’s decompression flag for its load generation.

- **§1/5 — Sensitive defenses use the wrong host context.** `bestUtility(frame, …)` defaults to `liveSession(frame)`, but frames store `system.hostUuid`; manufacturer restrictions can silently disappear. **Fix:** pass the frame’s host explicitly or teach the utility accessor to resolve it.

- **§2 — Admission lacks the captured connection and authoritative upload validation.** The request omits `conn` (`request()` does not supply it), while admission checks neither the core/load/decompression nor the submitted duration and snapshot. **Fix:** capture `conn` and have admission validate the generation and derive the accepted snapshot/duration.

- **§2/4 — Current-location checks can miss a departure and return.** A debounced pass can see the owner back on the same host; §4 also ignores `sessionId`, allowing a dumb frame to survive a replacement host session. **Fix:** latch termination from departure/session transitions, using durable movement records where topology applies.

- **§3 — Pre-create checks do not close the creation/cleanup race.** Departure can occur while `Actor.create` or token creation is in flight, after cleanup found nothing; the plan omits the persona writer’s create/delete-triggered reconciliation and surplus-token removal. **Fix:** reschedule on creation/deletion and reconcile late arrivals and duplicate tokens after every write.

- **§4 — Owner deletion destroys the only terminal-fact store.** Once the owner is deleted, `frame-end` cannot be written there, yet “nothing else ends a frame.” **Fix:** keep lifecycle facts on a durable GM-owned document that outlives the owner.

- **§4 — Shutdown cleanup is not replayable.** `tickShutdown` returns once the host is offline; interruption after its final tick can skip frame termination, including completed uploads whose actors are not created yet. **Fix:** reconcile shutdown termination from durable shutdown history against uploads as well as existing actors.

- **§5 — A full monitor can persist without a crash fact.** Damage and `frameCrash` are separate writes; interruption between them leaves a 10-box frame whose `ended` guard remains false. **Fix:** have reconciliation derive and write the terminal fact whenever the monitor is full.

- **§5 — The existing resistance path is not cross-client idempotent.** Its in-flight guard and monitor queue are client-local, and damage precedes resolution marking; simultaneous player/GM resolution or retry after interruption can apply damage twice. **Fix:** send resistance results to the GM and commit a card-keyed, replay-safe damage receipt.

VERDICT: REVISE

### Claude's response
All nine findings were accepted. The common fix is to derive more from durable facts.
- **#1:** copies are created decompressed when the frame was.
- **#2:** `activePrograms` resolves a frame's host from `system.hostUuid`.
- **#3:** the request carries `conn` and nothing else trusted. Admission validates the core and load generation,
  and builds the snapshot and duration itself.
- **#4:** departure is a durable transition. Under topology that's 7b `move` facts after the start; with topology
  off, a different session id. A trip out and back counts.
- **#5:** create, delete and token hooks reschedule. Late-created ended actors and tokens, and surplus tokens, are
  deleted.
- **#6–#8:** `ended` is derived from the owner or host missing, the host offline, the derived monitor, or
  departure. The `frame-end` fact is for the record only.
- **#9:** frame damage is a card-keyed `frameHit` fact written once by the sequencer, and the monitor is derived
  from those facts.

## 6a-2a Round 2 — Codex (fresh session, brief; ~89k input tokens)

- **§4 — Broken shutdown fix:** `hostShutdown(host).offline` tests current state. If shutdown completes, reconciliation is interrupted, and `resetShutdown` runs, a smart frame can survive the shutdown. **Fix:** derive termination from any completed shutdown after the upload began, including reset lifecycles.

- **§5 — Incomplete damage receipt fix:** `frameHit` and `addWear` update separate documents. Interruption after recording the hit can lose Armor/Shield wear permanently because retries “write nothing.” **Fix:** replay outstanding wear from the winning `frameHit` receipt, using `addWear`’s card-keyed idempotency.

VERDICT: REVISE

### Claude's response
- **#1 accepted.** A frame is ended by any shutdown run that went offline after its start, even one reset since.
- **#2 accepted.** The Armor/Shield wear is replayed from the winning `frameHit` receipt; `addWear` is card-keyed.

## 6a-2a Round 3 — Codex (fresh session, brief; ~83k input tokens)

VERDICT: APPROVED

**6a-2a APPROVED in round 3.** 6a-2b (commands, decoy frames, event triggers) and 6a-2c (smart frames) still need
their own detailed sections and reviews.

## 6a-2a Code round 1 — Codex (fresh session, the 6a-2a diff with named functions; ~391k input tokens)

- **module/vr2.mjs:1443–1455** — Fully resisted frame attacks never call `hitFrame`, so they leave no durable receipt. Interruption before the resolution message allows a retry to roll damage and commit it for the same card. **Fix:** sequence every frame resolution, including zero damage, through the card-keyed receipt.

- **module/frames.mjs:302; module/vr2.mjs:1440,1462** — A competing resolver receives success when another resolver’s receipt won, then reports its own rolled damage and applies its own defensive wear. For example, a losing resolver can consume Shield even though the winning resolution declined it. **Fix:** return and render the winning receipt; apply frame Armor/Shield wear exclusively through sequencer replay.

- **module/frames.mjs:318–325** — Deleting a frame’s owner or host triggers no frame cleanup: these deletion hooks only handle deleted **frames**, and orphan sweeping runs only on ready/user connection. Tokens, combatants and frame actors therefore remain after owner/host deletion. **Fix:** handle owner/host deletion by scheduling affected owners and immediately sweeping orphaned frames.

VERDICT: REVISE

### Claude's response (fix 8aed488)
- **#1 accepted.** A full resist writes the card's receipt too, with 0 boxes.
- **#2 accepted.** `hitFrame` returns `mine` (a nonce in the receipt). A losing resolver warns and stops. The
  frame's Armor/Shield wear is applied only by the sequencer's replay of the winning receipt, never by the resolver.
- **#3 accepted.** Deleting a character or host sweeps frames whose owner or host is gone, and reschedules the
  owners.

## 6a-2a Code round 2 — Codex (fresh session, fix only; ~134k input tokens)

- **module/vr2.mjs:1448; module/frames.mjs:298–305** — Recovery is permanently blocked if the winning resolver disconnects after its receipt commits but before posting resolution. Every retry generates a different nonce and exits, leaving the card unresolved; a fully resisted DINAB attack also permanently skips `dinabZeroed`. **Fix:** persist the winning resolution data and replay its remaining effects and resolution message idempotently, including on retries.

The zero-damage receipt, exclusive Armor/Shield wear replay, and owner/host deletion cleanup otherwise hold.

VERDICT: REVISE

### Claude's response (fix 9301219)
- **#1 accepted.** The receipt carries what the resolution card says: level, attack and resistance successes,
  Shield successes, and the tests to close. The sequencer posts that card itself (`replayResolutions`), from the
  handler and from every owner pass, skipping any card that already has its `resolves` message. It also runs a
  full resist's `dinabZeroed`. The resolver posts nothing for a frame, so its survival doesn't matter.

## 6a-2a Code round 3 — Codex (fresh session, fix only; ~88k input tokens)

- **module/frames.mjs:196** — DINAB wear still has an interruption gap: if the sequencer disconnects after creating the resolution message but before `dinabZeroed` completes, line 183 skips that receipt forever, permanently losing the wear. **Fix:** replay the idempotent `dinabZeroed` before the existing-resolution skip.

VERDICT: REVISE

### Claude's response (fix 07cbef6)
- **#1 accepted.** `dinabZeroed` is keyed by the use id (`dinabFail`) or the card (the `dinabWear` request), so
  it's idempotent. It now runs on every pass for 0-box receipts, before the "already resolved" skip.

## 6a-2a Code round 4 — Codex (fresh session, fix only; ~148k input tokens)

- **module/frames.mjs:186; module/vr2.mjs:1341–1342** — After a fully resisted DINAB attack, deleting the attacker or its program makes every replay create a fresh `dinabWear` request, even for an already resolved card. Each request schedules another owner pass, producing an endless loop and unbounded records; requests use random IDs, so they are not card-idempotent. **Fix:** return from `dinabZeroed` when the attacker or referenced item no longer exists.

VERDICT: REVISE

### Claude's response (fix c0ace86)
- **#1 accepted.** `dinabZeroed` returns when the attacker or its program no longer exists; such a request could
  never wear anything. On the sequencer's client the GM owns the item, so the path is the keyed `dinabFail`, never
  a request.

## 6a-2a Code round 5 — Codex (fresh session, fix only; ~89k input tokens)

No findings. The guard stops replay requests when the attacker or program is gone. Existing programs retain both direct wear and GM-request paths; all callers tolerate the early return.

VERDICT: APPROVED

**6a-2a code APPROVED in round 5.**

# 6a-2b plan review (commanding dumb frames, DINAB cores, decoy frames, event triggers)
Started 2026-11-05. MAX_ROUNDS=5. Fresh `codex exec -s read-only` session per round, brief names the code locations.

## 6a-2b Round 1 — Codex (fresh session; ~319k input tokens — read widely despite the brief)

1. **Frame attacks lack an admission path.** Plan §1 table and §3 (lines 767, 820–824); `vr2ic.mjs:1616–1621` and the `createChatMessage` hook near 1996. Both admission readers require `attackerType === "character"`. Setting the attack’s identity to the frame without updating these readers leaves attacks on connected deckers unadmitted; resistance waits and refuses. `attackerInc` also needs the commander’s crash incarnation to match the commander’s key.  
   **Fix:** Explicitly distinguish icon identity from commander identity, and update both admission readers and the incarnation snapshot.

2. **Slow suppression is assigned to the frame instead of its commander.** Plan §1/§3 (lines 767, 820–827); `slowResult`, `slowPrompt`, and `slowSuppress` in `vr2ic.mjs:1003–1096`. Slow stores `st.attackerUuid` as `deckerUuid` and `st.attackerSession` as the suppression session. The proposed frame values route suppression to an actor with no live decker session, so suppression fails and cannot debit the commander’s Detection Factor.  
   **Fix:** Preserve separate commander UUID/session fields and use those for Slow’s suppression bookkeeping.

3. **The Track Sensor change lacks a durable source.** Plan §3 (lines 823–824); `vr2ic.mjs:941–942,1304`. Relocate reads a folded trace, not the attack card. The trace receipt currently retains neither the card ID nor `via`, so adding `via` only to the card cannot implement the proposed read.  
   **Fix:** Carry the tracking-icon reference into the trace receipt and define its handling when that frame ends.

4. **Maneuver context omits both attribute rules and tally readers.** Plan §1 table and §2 (lines 768, 792–794); `vr2.mjs:1735–1752,1799` and `maneuverState`. The claim that `vr2Maneuver` rolls Computer is false: it rolls Evasion. Cloak and Lock-On are also restricted to character actors. Moreover, evade records/readers obtain tally through the maneuvering actor’s session; a frame has none, so its commander’s rising tally will not shorten evasion.  
   **Fix:** Specify frame Evasion/Cloak and opponent Sensor/Lock-On explicitly, retain existing no-context dice, and resolve evade tally through the commander while keeping maneuver identity on the frame.

5. **The command refusals lack an execution-time boundary.** Plan §2 (lines 787–814); `systemTestNow`, `attackOnce`, and `vr2ScanIcon` in `vr2.mjs`. Filtering the Command dialog does not prevent a utility crashing, the frame ending, or the owner leaving while a subsequent dialog is open. System Tests explicitly permit a missing utility, and attack execution can call `sessionFor` using the dialog-selected host.  
   **Fix:** Revalidate the frame, owner connection/session, fixed host, allowed operation, and active copy inside each execution path immediately before spending, with an incarnation check before posting results.

6. **Tar needs more than item lookup redirection.** Plan §1 (lines 775–782); `tarStrike` and `reconcileTarFact`, `vr2ic.mjs:732–789`. These functions use their actor for Sensor, one-shot victims, crash records, tar receipts, MPCP/Hardening, and corruption destinations. Merely resolving `utilityRef` on the frame still crashes the owner’s log; passing the frame wholesale instead changes connection/deck semantics and moves receipts outside the owner reconciliation path.  
   **Fix:** Give tar an explicit commander/icon context and persist the copy recipient in its owner-log receipt so replay uses the same recipient.

7. **“All security measures” misses attacks outside `attackOnce`.** Plan §4 (lines 875–895); `offerTar`, `bombEnd`, and reactive dispatch in `vr2ic.mjs:577–605,639–668,1912–1935`. Data bombs—including exploding scramble—create their attack cards directly against the commander. They never enter the proposed redirect and therefore damage the decker during frame-decoy mode.  
   **Fix:** Apply the decoy-frame target decision to reactive attack creation too, retaining tally ownership on the commander.

8. **A deterministic fold does not serialize redirect against own actions.** Plan §4 (lines 865–887); `attackOnce` in `vr2.mjs:1055–1297`, `recordEvent` in `claims.mjs:33`. One client can capture the frame target before another client’s off record arrives, then finish its dialog and roll after the decker acts. There is no admission or shared ordering point to settle that race.  
   **Fix:** Serialize redirect selection and own-action termination through a shared authoritative boundary, then bind the attack to that decision before calculating target terms.

9. **Own-action termination can be bypassed or retroactively undone.** Plan §4 (lines 849, 859–867); `vr2Decompress` at `vr2.mjs:1986`, `relocate` at `vr2ic.mjs:1290`. Both are omitted from the own-action list. Also, writing an off record only when a decoy is currently successful lets a failed Decoy later become successful through Karma *after* an intervening own action, activating a mode that should already have ended.  
   **Fix:** Record every qualifying own-action boundary regardless of current decoy success, include these action paths, and compare decoy establishment against that durable history.

10. **The decoy fold can resurrect an older frame.** Plan §4 (lines 851–857). Selecting the newest record that also has a surviving frame and no off record skips a newer successful decoy once it crashes or is switched off, exposing an older successful record again.  
    **Fix:** Select the newest success/deleted-card barrier first, then test that selected record for termination without falling back to earlier decoys.

11. **Core-DINAB failure handling is incomplete.** Plan §5 (lines 908–913); `dinabZeroed` at `vr2.mjs:1338`, `dinabWear` at `vr2ic.mjs:1098`, and `programUnusable` at `actor-data.mjs:32`. The plan covers misses but not attacks fully defeated by resistance, which existing DINAB wears. Its stated crash call also supplies no payload; `programUnusable` requires `type`, `programId`, and matching `loadGen`, not merely the key.  
    **Fix:** Add an explicit core-DINAB source to resolution receipts and wear dispatch, and write complete crash payloads using the captured copy generation.

12. **Attribute loss must be calculated in sequencer order.** Plan §6 (lines 924–929); `resistAttribute` at `vr2.mjs:1655–1672`. Card-keyed deduplication prevents duplicate application of one card, but not two different cards calculating capped loss from the same old attribute. Two concurrent crippler hits can each claim the same remaining points and push the aggregate below their floor of 1.  
    **Fix:** Send attack/resistance results and floor to `frameAttr`, and calculate the actual loss against current folded attributes inside the sequencer.

13. **Owner-log attribute changes will not automatically refresh frame derived data.** Plan §6 (lines 927–929); `FrameData.prepareDerivedData` at `actor-data.mjs:2468`, frame hooks in `frames.mjs`. Adding an effect to the owner prepares the owner, not the separate frame actor. Merely reading `frameState` during frame preparation can leave `matrixPersona` stale after damage.  
    **Fix:** Explicitly invalidate/reprepare affected frame actors when owner attribute facts change, including initial load and reconciliation.

14. **Trigger firing is GM-only only in the UI.** Plan §7 (lines 954–962); `processRequests` at `vr2ic.mjs:1454–1470`, versus `uploadDone` in `frames.mjs`. The request dispatcher does not enforce GM authority; the listed handler checks omit `r.user`. An owner can submit `triggerFire` directly and manufacture a report.  
    **Fix:** Require a GM requester in the handler, and resolve the trigger’s existence, frame, watch, and note from its durable setting record.

15. **Trigger delivery and inactivity have no recoverable receipt contract.** Plan §7 (lines 956–969); `processRequests`, `frames.mjs:180` (`replayResolutions`), and `vr2.mjs:659` (`commitAction`). A fire fact followed by an interrupted chat creation can lose the report; a retry can duplicate it unless card creation is idempotent. The inactivity annotation also cannot be derived from `commitAction`, which only clears a failed improvised build and records no general action history.  
    **Fix:** Persist the firing outcome/recipients in a receipt, replay a deterministically identified report, and derive inactivity from explicit action-boundary records.

VERDICT: REVISE
### Claude's response
All 15 accepted; the section is revised in place (each change marked "R1 #n").
- #1–#3: the card carries TWO identities, the icon (`attackerUuid` = frame, `attackerType: "frame"`) and the
  commander (`commanderUuid`, `commanderSession`, the decker's key and crash incarnation). Every reader branching on
  `attackerType === "character"` (admission, the admission hook, Slow's suppression, key parsers) treats a frame the
  same and reads the commander. A Track through a frame keeps `via` in its trace receipt, reads that frame's Sensor
  and ends with the frame.
- #4: corrected. A maneuver is Evasion vs Sensor (not Computer): the frame's Evasion and Cloak, a frame opponent's
  Sensor and Lock-On; an evasion's tally clock reads the commander's session; the type checks gain `frame`.
- #5: `ctx.check()` re-derives the command's preconditions just before `spendUse` and before the card is posted.
- #6: tar gets an explicit context: the fact stays on the owner's log with the recipient frozen in the receipt, a
  complete crash record on the frame, the Core Rating as MPCP, no Hardening, no corruption destination.
- #7: `securityTarget()` routes reactive measures (tar, bombs, scramble): a test by a frame is answered on the frame;
  the decker's own test during a decoy frame goes to the frame.
- #8: the off record is a sequencer fact (request), and an IC attack on a decker with an un-off decoy frame is rolled
  by the active GM after `Y.flush()`, so the two have one order.
- #9: `ownAction` covers every `commitAction` caller, every DINAB branch, relocate and decompress; it ends ANY
  un-off decoy-frame record, so a later Karma success can't revive it.
- #10: the fold selects the newest barrier record first and tests it alone; no fallback.
- #11: the core-DINAB ref rides the card like 5b's, so `dinabFail`, `dinabZeroed` and `dinabWear` all reach it; the
  crash record has the full payload.
- #12: `frameAttr` is computed by the sequencer from the current folded attribute.
- #13: `reconcileOwner` and the owner's record-effect hook re-prepare and re-render the owner's frames.
- #14: `triggerFire` refuses a non-GM requester and reads the trigger from its durable record.
- #15: the firing outcome is in the fact and the report is a `once` card replayed on the owner's pass; the derived
  "inactivity" note is dropped (it's the GM's call).

## 6a-2b Round 2 — Codex (fresh session, revisions only; ~178k input tokens)

1. **R1 #5’s post-roll check rejects successfully consumed one-shot copies.** Plan: `docs/PLAN-vr2-part6-frames.md:775–783`. Code: `module/vr2.mjs:741–745`, `1235–1237`, `2051–2053`. The same `ctx.check()` requires the copy to remain in `activePrograms(frame)` both before spending and before posting. `spendUse` consumes a one-shot before rolling, so the command’s own successful expenditure makes its final check fail and discards its result.  
   **Fix:** Separate pre-use eligibility validation from post-roll incarnation validation; the latter must allow consumption by this command.

2. **R1 #15’s `once` gate defeats interrupted-report recovery.** Plan: `docs/PLAN-vr2-part6-frames.md:1043–1045`. Code: `module/frames.mjs:180–201` (`replayResolutions`). If execution stops after claiming `once(owner, "card:trigger:…")` but before creating the message, replay finds a missing card but cannot reacquire the claim. The named frame-resolution replay instead checks for an existing message and creates the missing result without that permanent gate. The revision therefore still permits a permanently lost trigger report.  
   **Fix:** Replay reports on the sequencer using a durable trigger-fire identifier on the message and an existence check, without a permanent pre-creation `once` claim.

VERDICT: REVISE
### Claude's response
- **#1 accepted.** The check is split: before `spendUse` the full check (the copy active); after the roll only the
  incarnation (frame alive, same upload, commander on host and connection), so this command's own one-shot spend or
  DINAB crash doesn't void it.
- **#2 accepted.** No `once` for the trigger report: the sequencer posts it tagged with the fact key and replays any
  fact no message carries, as `replayResolutions` does.

## 6a-2b Round 3 — Codex (fresh session, fix only; ~62k input tokens)

No findings. The post-roll check permits the command’s own consumption or copy crash while preserving frame-incarnation validation. Trigger-report replay removes the permanent claim gap and follows the specified sequencer message-existence pattern. Both fixes are sufficient within scope and introduce no identified defect.

VERDICT: APPROVED
**6a-2b plan APPROVED in round 3.**

## 6a-2b Code round 1 — Codex (fresh session, commit 11988d9; ~424k input tokens)

1. **module/frames.mjs:447 — Uploading or decompressing a frame leaves decoy mode active.** Neither path calls `ownAction`, and `commitAction` does not call it either. A decker can perform these actions while security continues targeting the decoy, contrary to §4’s explicit action boundaries. **Fix:** Call `ownAction` when committing frame upload and decompression.

2. **module/frames.mjs:408 — Command validation omits `vr2ActionGuard`.** `setTrigger` relies exclusively on `commandProblem`, so an icon-down or jacking-out commander can still set triggers. Attack, maneuver, and scan also fail to recheck this guard after their dialogs, allowing a command after the commander becomes incapacitated. **Fix:** Include `vr2ActionGuard(actor)` in pre-expenditure command validation, including trigger setting.

3. **module/vr2ic.mjs:789 — Tar replay ignores the captured frame’s incarnation and ended state.** `reconcileTarFact` checks only whether the UUID resolves. If the frame has ended but awaits sequencer cleanup, replay still writes crash records to it; `tarStrike` also reports a successful copy crash even when the frame is already gone. This misses §1’s explicit ended-frame handling. **Fix:** Validate the captured upload and `frameState` before applying frame crashes, and report “already crashed” when that recipient has ended.

VERDICT: REVISE
### Claude's response (fix 61ba1c3)
- **#1 accepted.** Upload frame and Decompress frame call `ownAction`.
- **#2 accepted.** `commandProblem` checks `vr2ActionGuard` first (before and after the roll), so every command path,
  Set event trigger included, refuses a commander who is jacking out or whose icon is down.
- **#3 accepted.** `tarStrike` and `reconcileTarFact` use a frame recipient only if it is still that upload and not
  ended; otherwise the strike lands on nothing and the card says so.

## 6a-2b Code round 2 — Codex (fresh session, fix only; ~134k input tokens)

No findings. All three fixes are correct and complete within the requested scope. The added calls introduce no apparent deadlock, import-cycle issue, or refusal of a legitimate command. Tar replay now checks both frame incarnation and ended state before recording copy crashes.

VERDICT: APPROVED

**6a-2b code APPROVED in round 2.**

# 6a-2c plan review (smart frames)
Started 2026-11-05. MAX_ROUNDS=5. Fresh `codex exec -s read-only` session per round, brief names the code locations.
User rulings before review: a smart frame keeps its own tally (trace can't trace it); orders need the decker on the
frame's host.

## 6a-2c Round 1 — Codex (fresh session; ~305k input tokens)

1. **Plan §8: reactive security never reaches the proposed handling.** Code: `module/vr2ic.mjs:579`, `offerTar` returns when `st.conn == null`. Smart frames have no connection, so Tar, poison scramble, and data-bomb offers are all skipped.
   **Fix:** Admit validated smart-frame session cards through this gate while preserving the existing character connection check.

2. **Plan §8: Tar loses interrupted-operation recovery.** Code: `module/vr2ic.mjs:732–810` writes the Tar fact on its `actor` argument; `schedule/passFor` at `1609–1627` only reconciles characters. Calling `tarStrike(frame, …)` therefore puts the durable fact on an unreconciled log. Disconnecting after that write can leave the utility or Tar IC uncrashed indefinitely.
   **Fix:** Keep the Tar fact on the owning character’s log, with the frame upload and copy frozen as its recipient.

3. **Plan §3: frame-key expiry omits identity validation.** Code: `module/vr2ic.mjs:1694–1716`; `module/frames.mjs:368–372` deletes ended frame actors. Checking only `frameState` does not specify how a missing actor or a different upload at the parsed UUID ends the captured attacker incarnation. Old locks and Tracks must not survive either case.
   **Fix:** Treat a missing/non-frame actor, upload mismatch, or ended frame as an ended frame attacker.

4. **Plan §7: one join fact does not establish recoverable combat joining.** Code: `module/frames.mjs:328–364` repeatedly reconciles documents, with separate awaited creation operations. The proposed combatant creation, join fact, and initiative roll likewise cannot be atomic: writing the fact first can permanently skip creation after interruption; writing it afterward can duplicate or re-add a combatant before the receipt lands.
   **Fix:** Specify a durable join intent, deterministic combatant identity, and completion/removal state, with recovery of an unrolled existing combatant and an ended-frame recheck after creation.

VERDICT: REVISE
### Claude's response
All 4 accepted (marked "R1 #n" in the section).
- #1: `offerTar` accepts a `byFrame` card with a live frame and matching session.
- #2: smart-frame cards carry `owner` and `icon`; the reactive buttons act on the OWNER (the log the sequencer passes),
  with the frame as the frozen recipient; the bomb's tally prompt goes on `tallyHolder(target)`.
- #3: a frame key is ended when its actor is missing or not a frame, its upload differs, or it has ended.
- #4: combat joining is reconciled: derived intent (owner in a started combat on the token's scene, no `frame-left`
  fact), deterministic combatant id (= upload id, keepId), initiative rolled whenever still null, the GM's removal
  recorded by a `deleteCombatant` hook, ended re-checked after creating.

## 6a-2c Round 2 — Codex (fresh session, revisions only; ~132k input tokens)

1. **R1 #4: manual removal still has an interruption gap.** The combatant is deleted before `deleteCombatant` writes `frame-left`. If the active GM disconnects between those operations, the next reconciliation derives join intent again and recreates it. Deterministic IDs prevent duplicates, but cannot preserve an unrecorded removal.
   **Fix:** Persist removal intent before deletion, then reconcile deletion from that fact; recheck the fact after any concurrent creation.

2. **R1 #4: joining a combat started later lacks a reconciliation trigger.** The hooks in `module/frames.mjs:608–626` do not schedule owners when combats start or owner combatants join. The `updateCombat` hook in `module/vr2ic.mjs:2003` ticks uploads and traces but does not call `reconcileOwner`. Derived intent therefore need not be evaluated when the newly promised eligibility arises.
   **Fix:** Schedule affected owners on combat start and owner-combatant creation, including owners whose smart frames persist after logout.

VERDICT: REVISE
### Claude's response
- **#1 accepted, differently.** Instead of a removal record written by a hook (which can't come before the delete),
  joining is at most once per combat by two receipts: `frame-joining` (intent, before creating) then `frame-joined`
  (done). After `joined` a pass never creates it again, so a GM removal needs no record at all. An interrupted join
  (joining, no joined) is completed. The only window is a GM deleting it between create and `joined`: it comes back
  once, and removing it again is final.
- **#2 accepted.** Hooks on the active GM schedule owners when a combat starts, when an owner's combatant is created,
  and (already) when a frame's token is created.
