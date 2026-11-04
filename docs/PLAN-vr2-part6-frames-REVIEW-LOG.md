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
