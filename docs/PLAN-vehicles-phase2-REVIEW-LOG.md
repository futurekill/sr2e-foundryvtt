# Plan Review Log: vehicle rules in play (Phase 2)
Started 2026-11-12. Codex read-only, fresh session per round with a settled-findings brief.

## Round 1 — Codex (plan draft 1): REVISE, 22 findings
Full text: scratchpad p2/r1-verdict.txt. Summary: ram loser skips its Crash Test (#1); Position dice reservation
missing (#2); Control Pool cap unsupported (#3); VCR applied without rigging (#4); several vehicle damage paths (#5);
destroyed-crash at 0 speed (#6); crash recursion/dup prompts (#7); "any Combat Phase" dedupe (#8); pool lookup via
game.user.character (#9); opposed-roll ownership (#10); pool spend races (#11); passenger mode/per-actor (#12); mana
barrier riders (#13); barrier sequencing (#14); damaging manipulations vs vehicles (#15); called Light hits (#16);
firing-vehicle identity (#17); position secrecy (#18); initiative uses linked not controlled (#19); speed storage
before the switch (#20); effective autopilot (#21); deterministic tests (#22).

### Claude's response (draft 2)
Taken: all but #3. New foundations: `controlledVehicles` + `controllerOf` (#4, #9, #19) and one vehicle damage commit
with source/event id/pre-hit snapshot and a once-per-phase Serious prompt (#5–#8). #18: the card lists all three
outcomes instead of asking for the secret intention. #20 moved into Part 2 as a must-settle-first item.
**Rejected #3:** p.85 (300 dpi render): "the maximum number of Control Dice that a character can add to a
control-related test is equal to his rating for the skill he is attempting to use." The cap stays (now from the
shared vehicleSkillDice).

## Round 2 — Codex (draft 2, fresh session): REVISE, 6 findings
1. Controller transfer needs GM authority; concurrent claims → two controllers. 2. `once()` needs an Actor, not a
ChatMessage. 3. Live-read pool spend still races. 4. Position reservation overwritten across several drones.
5. Manipulation "soak as for weapons" keeps the Power reduction p.109 exempts. 6. Surviving-barrier occupant damage
must not use crash-passenger gating/level.

### Claude's response (draft 3)
All taken: GM-side claim writer that clears other holders, unlink clears control (1); once() on the defending actor
keyed by card id + outcome receipt (2); per-actor pool queue on the owner's client shared with refresh/reservations,
controller's owner rolls vehicle resistance (3); reservations per test message, summed (4); manipulation formula
explicit — no barrier, no Power cut, no step-down, Body + ½ armour vs Power (5); occupants at original Power, level −1,
independent of vehicle resistance (6).

## Round 3 — Codex (draft 3, fresh session): REVISE, 1 finding
A controller's player needn't own the vehicle (linking stores only the UUID), so they can't write its damage/receipts.

### Claude's response (draft 4)
Taken: the controller's owner rolls; the commit (damage, receipt, vehicle claims) runs through the GM writer, which
re-validates controller + unresolved event; vehicle owners commit directly.

## Round 4 — Codex (draft 4, fresh session): REVISE, 1 finding
Owner-direct commits compete with GM commits (per-client queues don't serialize across clients).

### Claude's response (draft 5)
Taken: every vehicle damage commit goes through the active GM's per-vehicle queue, snapshot → validate → damage →
receipt → trigger in one queued step.

## Round 5 — Codex (draft 5, fresh session): APPROVED
"No new material findings within the requested scope." **Part 1 plan APPROVED after 5 rounds.**

## Code review round 1 — Codex (Part 1 implementation): REVISE, 10 findings
1. Serious-wound dedupe keyed on combat.turn (phases share a turn). 2. No GM path for an uncontrolled vehicle's Crash
Test. 3. Area damaging manipulations still skip vehicles. 4. Non-owner controllers blocked on blast/spread; combat-spell
vehicle claims on the player's client. 5. GM and player can both spend a player's Control Pool. 6. Position debit and
reservation not atomic. 7. Crash Test can resolve twice after a control change (claim on the driver, whispered receipt).
8. Damage authorization and phase checked outside the queued step. 9. Reaction default ignores other controlled
vehicles' damage. 10. Missing integration tests (passengers, barrier branches, crash after test).

### Claude's response
Fixed: 1 (the system's phaseSeq of the vehicle's/driver's combat); 2 (GM prompts the NPC driver's skill, vehicle rolls,
failure crashes); 3 (area cards for vehicles, whispered to the driver's owners too); 4 blast/spread gate → mayResistFor;
5 (`isPoolClient`: the active player owner, else the active GM; pools offered only there); 6 (`spendPosition`: debit +
reservation in one queued update); 7 (claim on the vehicle through the GM, public receipt); 8 (validation and phase
inside the queue); 9 (`worstControlledInitMod`, shared with initiative); 10 (Quench: occupants once each without
Combat Pool, barrier holds/breaks, GM Crash Test → crash).
Not taken: 4's combat-spell part — combat-spell resistance against a vehicle stays with its owner or the GM (its gate
is `isOwner`, so a non-owner never reaches those claims). 5's refresh half — refresh vs spend across clients exists
for every pool today; out of Part 1. 10's two-client coverage — Quench runs in one client; the cross-client paths are
the GM op + per-actor queues, unit-shaped.

## Code review round 2 — Codex (fixes only, fresh session): REVISE, 1 finding
A Crash Test dialog left open across a change of control lets the former driver claim it.

### Claude's response
Fixed: `GM_OPS.claim` takes the expected driver and claims only while that driver (or none) still controls the
vehicle and the user may act for them; otherwise the step is refused without a receipt and the user clicks again.

## Part 2 plan, round 1 — Codex (draft 1): REVISE, 22 findings
Datajack modifier needs an actual datajack connection (#1); Driving Test also for standard maneuvers under fire (#2);
Pilot-driven drones (#3); effective ratings and working equipment (#4); null off-road Handling (#5); one effective
Speed derivation (#6); speed-storage claim too strong (#7); hybrid boundary covers the whole crash/impact (#8); Stress
ordering per the Westwind example (#9); roll finality/Karma (#10); overhaul needs a facility (#11); factory-engine
exception (#12); engine check atomic with completion (#13); Workshop redesign path (#14); Stress fields' defaults and
invariant (#15); repair procurement (#16), interruption (#17), valuation (#18); one queue (#19); per-op authorization
and receipts (#20); 2b Control Pool formula (#21); integration tests (#22).

### Claude's response (draft 2)
Taken: 1–20, 22 (as written in draft 2: 2a.0 foundations, control modes, drone Driving Test, Resolve step, repair job).
#21 deferred to 2b's own plan, where that formula is built. #22's GM-reconnect case is covered by receipts but not by a
Quench test (one client).

## Part 2 plan, round 2 — Codex (draft 2, fresh session): REVISE, 3 findings
1. Factory replacement must also undo Workshop engine levels (design.choices.engineCustom, baked ratings). 2. A drone
driving itself has no controller, so the Crash-Test claim op would refuse its owner. 3. Engine completion spans Item and
Actor: not atomic.

### Claude's response (draft 3)
All taken: replacement zeroes the design levels through the Workshop recompute and permanent Stress is per-source records
(1); a Driving-Test claim op admitting driver/controller/drone owner or GM (2); the actor record (roll + Stress in one
update) is the proof, the item is finalized idempotently with recovery on ready (3).

## Part 2 plan, round 3 — Codex (draft 3, fresh session): REVISE, 2 findings
1. Dropping a record when its item/levels disappear reduces permanent Stress without a factory engine (p.120 forbids).
2. Workshop adjudication isn't atomic with the design save.

### Claude's response (draft 4)
Both taken: records leave only through factory replacement (1); the save writes the design with a pendingEngineCheck in
one update, the GM queue resolves it into record + Stress in one update, and a GM pass on ready finishes interrupted ones;
creation carries the pending check in the actor's data (2).

## Part 2 plan, round 4 — Codex (draft 4, fresh session): REVISE, 1 finding
A single pendingEngineCheck slot can be overwritten by a second level-adding save, or cleared by the first resolver.

### Claude's response (draft 5)
Taken, by a different route than routing Workshop saves through the GM: pending checks are a map keyed per save; the
resolver removes only its own key; factory replacement resolves all pending keys first.

## Part 2 plan, round 5 — Codex (draft 5, fresh session): REVISE, 1 finding
A Workshop left open across a factory replacement saves its old engine levels; diffed against the design it loaded, the
added levels are zero and no check is made. Fix proposed: serialize existing-vehicle saves with replacement in the GM queue.

### Claude's response (draft 6)
Taken by correcting the plan: the save diffs against the LIVE actor's design read at save time (which the 2a code already
does, `vehicle-workshop.mjs` #onSave), so the re-added levels get their check. Not taken: routing Workshop saves through the
GM queue; the only window left is a save and a replacement in flight at the same instant, recorded as an accepted limit.

## Part 2 plan, round 6 — Codex (draft 6, fresh session): APPROVED
"No new material problem found." Part 2a plan converged after 6 rounds.

## Part 2a code, round 1 — Codex (diff 3a96170..567ec3b, fresh session): REVISE, 7 findings
1. A linked driver who owns neither the vehicle nor its controller can't buy Stress dice or resolve. 2. Driving Test
consequences read Stress outside the vehicle queue (two resolutions can both miss a 2 × Body failure). 3. Overhaul removes
a snapshot delta (two overhauls go below the floor of 1). 4. Factory replacement snapshots points outside the queue and
runs on whichever GM clicked (double subtraction). 5. Engine completion doesn't re-run the finish checks in the queue (two
installs against the same R0 both finish). 6. A rigger-controlled drone can still drive itself on Pilot. 7. Defaulting
Rule of One compares against the default's rating, not the dice rolled.

### Claude's response
All taken. 1: `mayDrive` (vehicle/controller owner, GM, or the owner of a character the vehicle is linked to or
controlled by) authorizes the Stress op and the resolution. 2: one GM op `drivingResolve` claims, reads the test from its
message, rolls and commits the Stress with its receipt, all in the vehicle queue. 3: the Stress op takes
`overhaulSuccesses` and computes removal against the live Stress there. 4: `replaceEngine` is a GM op; records, items and
levels are read inside the queue, so a second replacement finds nothing. 5: `finishProblem` (extracted from
finishInstallation) runs inside the queue before the roll; the op finishes the item with its record; legacy adjudication
skips it. 6: refused in `rollDrivingTest`, button hidden. 7: the card records `defaulted`; the threshold is the dice
rolled. Quench: 4 new tests (overhaul floor, defaulting threshold, rigged drone, unverified install refused; double
replacement). Also: vehicle-play after hook timeout 30 s (hidden-tab cleanup).

## Part 2a code, round 2 — Codex (fix 3b0b697 only, fresh session): REVISE, 1 finding
Engine completion validates the item captured before queuing: a factory replacement queued ahead deletes it, but the
precheck reads the stale document and the secret check records permanent Stress for a removed customization.

### Claude's response
Taken: the precheck re-reads the item inside the queue and requires the same attempt id; both legacy paths check the
item still exists too.

## Part 2a code, round 3 — Codex (fix 17aa974 only, fresh session): APPROVED
"No material defects found in the scoped commit." Part 2a code converged after 3 rounds.

## Part 2b plan, round 1 — Codex (draft 1, fresh session, R2 p.12–19 attached): REVISE, 11 findings
1. Overhead cost value must be listed prices, not purchase receipts. 2. Payment not transactional (partial writes; two
payers). 3. `lastPaid = worldTime` can't identify months, split discounts or missed months. 4. Stress history from
receipts/engine records mixes clocks and deletable records. 5. Vehicle Empathy granted to remote drone operators.
6. Half-defaulting needs the control mode and the web path's source kind. 7. New MBW key breaks `move-by-wire:<level>`.
8. Computer Illiterate on the cyberphobia predicate hits every B/R. 9. B/R retry penalty must outlive attempts; partial
commits race. 10. Gremlins tiers incomplete; the pack text is wrong. 11. Josie's arithmetic mixes two examples.

### Claude's response (draft 2)
All taken. 1: `overheadValue` at list prices. 2–4: GM-advanced months (hidden `vehicleOverheadMonth`), per-vehicle month
records, a per-month Stress counter written with the Stress, reserve → charge (one character update with receipt) →
settle, recovery and release. 5: physical contact only (no remote drone). 6: `_vehicleSkill(vehicle, {mode})`, web paths
keep their source. 7: existing MBW identity. 8: a new `electronic` context. 9: retry penalty on the worker per task and
skill; partial results via a GM op. 10: per-tier text, pack corrected. 11: three separate checks.

## Part 2b plan, round 2 — Codex (draft 2, fresh session): REVISE, 8 findings
1. Invented rule: p.12 restricts source/destination, not intermediate web nodes. 2. Simsense Vertigo also covers
smartlinks, display links. 3. `drivingResolve` writes Rule-of-One Stress outside the counter's paths. 4. Release can race
an in-flight charge. 5. Partial reservation then a full charge. 6. Reserved months escape neglect. 7. Catch-up blocked
when the current month is already paid. 8. A failed catch-up test leaves no way to retry.

### Claude's response (draft 3)
All taken: source/destination only (1); vertigo automatic while rigging/decking and on smartlink attacks, a toggle for the
rest (2); one Stress-update helper for every writer, with a grep test (3); release acknowledged by the payer's money
writer, which marks the slot `released` (the customization cancel pattern) (4); all-or-nothing reserve (5); missed is
independent of reservation (6); the current month may already be paid (7); a paid missed month keeps a Restore action,
1 Good Karma per attempt (ruling) (8).

## Part 2b plan, round 3 — Codex (draft 3, fresh session): REVISE, 5 findings
1. Control Pool Reaction reads augmented Quickness (MBW's Quickness included). 2. The VR2.0 Hacking Pool is computed as
Computer + Reaction, not VR2.0 p.18's (Intelligence + MPCP) ÷ 3, so Otto's example can't work. 3. Qualities already on
actors never get the new `rule`. 4. A replayed charge isn't explicitly idempotent. 5. Month advance isn't recoverable
mid-way.

### Claude's response (draft 4)
All taken. 1: natural Quickness under rigger2. 2: confirmed at 300 dpi; an existing VR2.0 bug, fixed in its own patch
release before 2b. 3: the rule is derived (`qualityRule`, explicit field then pack UUIDs) plus a selector. 4: an existing
receipt skips to settle. 5: per-vehicle `assessedThrough`; advance only when all are current; ready pass resumes.

## Part 2b plan, round 4 — Codex (draft 4, fresh session): REVISE, 2 findings
1. An encephalon's chipped Driving skill never reaches `_vehicleSkill` (embedded skills only). 2. The B/R retry counter
and the partial result are separate commits (lost or unmatched penalties).

### Claude's response (draft 5)
Both taken: `_vehicleSkill` resolves chipped skills as skill tests do (1); the penalty is derived from failure records
written with the partial result in one GM-queue update, keyed by test (2).

## Part 2b plan, round 5 — Codex (draft 5, fresh session): REVISE, 1 finding
Gremlins tier 1: a bang makes the equipment work normally only DURING the next Combat Phase (p.15), not from then on.

### Claude's response (draft 6)
Taken: card text and test say "during the character's next Combat Phase only".

## Part 2b plan, round 6 — Codex (draft 6, fresh session): REVISE, 2 findings
1. Overhead value omits installed weapons/accessories that aren't customizations. 2. A repeated Month ends request can
advance another month.

### Claude's response (draft 7)
Both taken: every accessory at its listed cost except design/factory items (1); Month ends carries the expected month,
advanced by one GM queue only if it still matches (2).

## Part 2b plan, round 7 — Codex (draft 7, fresh session): REVISE, 2 findings
1. An encephalon-only chip would apply to manual/datajack Driving Tests (skillsofts apply globally). 2. Two characters'
concurrent Restore attempts can both spend Karma.

### Claude's response (draft 8)
Both taken: the chip keeps `viaEncephalon` provenance and counts only in rigged mode (1); Restore attempts are reserved
in the vehicle queue before the Karma is spent, freed on failure, recovered by receipt (2).

## Part 2b plan, round 8 — Codex (draft 8, fresh session): REVISE, 1 finding
1. A Restore reservation whose payer disconnects (or whose Karma debit fails) before the receipt blocks Restore
forever; recovery covers only reservations with receipts.

### Claude's response (draft 9)
Taken: Restore reservations without a receipt use the payment Release protocol (payer's money writer marks the slot
`released` so a late debit aborts, then the GM clears `restoreTx`); Quench test for the interruption added.

## Part 2b plan, round 9 — Codex (draft 9, fresh session): REVISE, 1 finding
1. p.14's accumulating +1 applies only when one required B/R test succeeds and another fails; draft 9 recorded every
failure, including attempts where none succeeds.

### Claude's response (draft 10)
Taken (confirmed on the page): failures are recorded only once another required test of the attempt has passed
(retroactively for earlier failures, in the same GM-queue update); an all-fail attempt adds no penalty; Checks case added.

## Part 2b plan, round 10 — Codex (fresh session): REVISE, void
My draft-10 edit script failed before writing, so Codex reviewed draft 9 again and flagged only the unapplied round-9
resolution. Edit applied; round rerun.

## Part 2b plan, round 11 — Codex (draft 10, fresh session): APPROVED
No new material findings against the pages, the code, or settled rounds 1–9. Part 2b plan approved at draft 10.

## Part 2b-1 code, round 1 — Codex (fresh session): REVISE, 4 findings
1. Partial installation rounds reused the attempt id, so two clients retrying the same failed skill both committed
(the second at the pre-retry TN). 2. The reflex-trigger surcharge applied under the core ruleset. 3. A Skill Web default
from Reaction ignored the vehicle's damage Initiative modifier. 4. A VCR switched off left `rigging` true, so Simsense
Vertigo still applied.

### Claude's response
All taken: every committed round writes a new attempt revision (stale clients refused); surcharge and its control gated
by `isRigger2()`; `_webDefaultForNode` returns its source and a Reaction source rolls the adjusted Reaction; rigging
counts for Vertigo only with an effective VCR.

## Part 2b-1 code, round 2 — Codex (fresh session, the four fixes only): APPROVED

## Part 2b-2 code, round 1 — Codex (fresh session): REVISE, 6 findings
1. A vehicle's first assessment could be skipped if Month ends stopped after advancing the setting. 2. A GM's release
ran in the GM's money queue and could race the payer's debit. 3. `overheadFree` didn't bind reservations to their payer
(and took any field). 4. A restore result accepted any receipt id (e.g. a payment receipt). 5. A charged but unsettled
payment could be judged missed before recovery settled it. 6. Interrupted restore releases weren't finished or offered.

### Claude's response
All taken: starting cursors are written before the month advances; only the payer's money writer (active owning player,
else the GM) pays, restores or releases; frees are limited to `tx`/`restoreTx` and to the payer's own reservations;
restore results require the reservation's own Karma receipt (restore, vehicle, month, payer) and ids are never reused;
the assessment settles charged reservations first; the GM pass frees released reservations and the dialog offers
Release for a released or unpaid attempt.

## Part 2b-2 code, round 2 — Codex (fresh session, the six fixes only): APPROVED

## Part 3 plan, round 1 — Codex (draft 1, fresh session): REVISE, 19 findings
1. Turn sequence vs SR2ECombat (initiative at round start, nextRound; End turn could run twice). 2. Driver Points
claimed after paying/rolling; spendPosition reads game.combat. 3. uuids as flag keys (dots). 4. Speed/Stress/damage as
separate transactions, no stale checks or resume. 5. NPC drivers excluded by controllerOf. 6. Crash speed came from
effectiveSpeed. 7. Crash triggers per phase and lost on interruption. 8. canRam lifetime. 9. Positioning stop's speed
effect / bonus exclusivity. 10. Passenger exemption = rigger only. 11. Passengers vs the vehicle's final damage. 12. Rigger
feedback per event, not monitor crossing. 13. Rated-Light weapons vs reduced-to-Light. 14. Component Body/Armor.
15. Groups synchronizing speed. 16. Action costs; Autonav Simple/Free. 17. Magic resolution contract. 18. Magic
exceptions dropped. 19. Core methods/cards under Rigger 2.

### Claude's response (draft 2)
All taken. User rulings asked and answered (R3-1 default's dice; R3-2 once per turn; R3-3 Body, no armour; R3-4
passengers resist the collision's code). Opaque entry ids; action transactions (begin → roll → resolve from the message,
deterministic effect ids, resume pass); turn open/close bound to the combat's round change, idempotent; DP slots reserved
first, spendPosition takes the combat/round; explicit drivers (NPC/token); per-event crash and feedback follow-ups in
the damage commit; speed snapshots; ram entitlement consumed by the next action; stop = speed 0 when reached (ruling),
successes always add DP; only the jacked-in rigger exempt; components; groups keep speeds; action costs + Autonav toggle;
a full magic contract incl. ties and the LOS/domain/astral exceptions; core methods refuse under Rigger 2 and cards keep
their ruleset.

## Part 3 plan, round 2 — Codex (draft 2, fresh session): REVISE, 15 findings
1. Round hooks run before every driver's pools refresh; recovery after the round changed. 2. A Positioning bonus created
`turns.<r+1>`, which counted as opened. 3. No stale-input protection between begin and resolve. 4. Cross-document
recovery order undefined. 5. spendPosition not idempotent; positionReserved reads game.combat. 6. Two Stress receipts
for speeding, no "was above" marker. 7. The chase driver didn't reach controllerOf's callers. 8. Relocation by a
passenger unauthorized. 9. Ram entitlement lifetime vs "next available action". 10. Follow-up claim-before-post could lose
cards. 11. Old core cards couldn't resolve as core (global refusal, setting-driven getters). 12. Called shots bypassing
Light immunity (core only). 13. Destroyed: automatic crash only for weapons/spells. 14. Armoured slits untargetable.
15. Mana-barrier riders through the core barrier path.

### Claude's response (draft 3)
All taken: SR2ECombat closes round r (after the action pass) before advancing, then refreshes every chase driver and
opens r+1, idempotent by `opened`/`closed`; revs + immutable inputs at begin, stale refusal at resolve; resolving record
with pending effects then replay then done; idempotent `spendPosition` by slot id, `positionReserved` by its own combat;
one speeding receipt and an `over` marker; one `driverOf` resolver threaded through every vehicle path; relocation's
acting character; entitlement = the driver's next combat turn; follow-ups reconcile by message flag; explicit ruleset
passed down card chains (`vehicleDamageMods(level, ruleset)`); no called-shot bypass; Destroyed split by source; slits
untargetable; barrier spells as walls with BR = Force through the R2 procedure.

## Part 3 plan, round 3 — Codex (draft 3, fresh session): REVISE, 8 findings
1. Braking can earn the ram (Rigger X, p.47–48). 2. Clamping manufactured braking. 3. Relocation lacked the vehicle damage
modifier. 4. Stale checks missed driver changes and vehicle damage/ratings. 5. A resolving action didn't block others.
6. The round transition itself wasn't recoverable/idempotent. 7. DP slots lacked recovery and cancel coordination.
8. Components: blanket own ratings and monitor immunity unsupported.

### Claude's response (draft 4)
All taken: entitlement on either speed change ≥ 2 × distance; cap only stops further acceleration; relocation damage
modifier; vehicle stamps (driver, damage level, ratings) checked live at resolve; begin refused while rolling OR
resolving; `chaseAdvance` with durable stages (closing → advanced → refreshing → opening) resumed by the ready pass;
DP slot states with card reconcile and pool-writer-acknowledged cancel; components as ordinary vehicle damage unless the
GM enters separate ratings, monitor effect then the GM's call (offered on the card).

## Part 3 plan, round 4 — not run (2026-11-13 01:29)
Codex refused at start: weekly usage limit, "try again at Nov 18th, 2026 10:29 AM". Draft 4 unchanged; round 4
reruns with the same prompt once the limit resets.

## Part 3 plan, round 4 — Codex (draft 4, fresh session, rerun 2026-11-13 01:33): REVISE, 6 findings
1. `super.nextRound()` bypassed SR2ECombat's Initiative re-roll, elemental boundaries, phase counter and tracker
pointing; calling the override instead wasn't resumable mid-way. 2. The Combat Turn refresh omitted passengers (p.42:
drivers, passengers and pedestrians). 3. A turn could close with rolls still outstanding; `chaseResolve` lacked a
closed-round check. 4. DP (and action) cancellation raced roll publication — two results for one slot. 5. Damage
lowering the Speed Rating could leave a vehicle over it with no `over` / Stress. 6. Moving-vehicle spell modifiers
applied to targets inside the caster's own vehicle (p.55: only outside).

### Claude's response (draft 5)
All taken. (1) `SR2ECombat.nextRound` becomes one staged, resumable round change for every combat: closing →
advancing (boundary + round, seq stored first) → initiative (per-combatant `initRound` marker written with the total;
one "Combat Turn" card via once()) → pointing → refreshing → opening; existing combat tests run against it plus
interrupt-and-resume tests per stage. (2) The chase refresh is the deduped union of drivers, aboard actors and
pedestrians. (3) Closing waits for every action/DP slot to be terminal (GM cancel offered); everything for a closed
round is refused. (4) `chaseArm` moves a slot/action to "publishing" before any roll; cancel only while open; GM
force-cancel writes a tombstone and late cards for tombstones are refused and marked. (5) A damage commit on a chase
vehicle records a pending `overCheck` with the speed at that moment, applied in the chase queue with the same speeding
receipt; replayed on ready and before closing. (6) The modifier applies only to targets outside the vehicle; same
vehicle → none; unknown → the dialog asks.

## Part 3 plan, round 5 — Codex (draft 5, fresh session): REVISE, 4 findings
1. The new "publishing" state wasn't accepted by `chaseResolve` or counted by the overlap/closing guards. 2. A DP
cancel could become terminal before a delayed debit on the pool writer's client, which then spent the next turn's
refreshed dice. 3. Round-refresh recovery wasn't exactly-once (pools on the Actor, the marker on the Combat; focus items
written separately). 4. The deferred overspeed check compared the stored speed with the LIVE rating.

### Claude's response (draft 6)
All taken. (1) Resolution only from "publishing"; rolling/publishing/resolving all block overlap and closing. (2) A
cancel is terminal only after the pool writer acks inside its spend queue, writing `byTest[slotId] = "void"` that a
late `spendPosition` refuses; closing waits for the ack; the GM acks when the driver's client is gone. (3) Transition
refreshes run through each actor's pool writer with a receipt (`flags.sr2e.poolRefresh`) written in the same update as
the pools, and on each focus item with its reset; documents with the receipt are skipped; spends for participants are
refused mid-transition. (4) `overCheck` stores speed, post-damage Speed Rating and the computed `over`; replay uses
the stored result.

## Part 3 plan, round 6 — Codex (draft 6, fresh session): REVISE, 4 findings
1. Damage (in `vdmg:<uuid>`) could land between `chaseResolve`'s stamp check and its Combat update; overCheck could
capture an obsolete speed. 2. Ordinary action cancels lacked the pool-writer void ack that DP slots got. 3. Nothing
stopped one vehicle appearing in two entries or two chases. 4. The staged `startCombat` would refresh only the opening
combatant in "action" mode; today it refreshes everyone (p.84).

### Claude's response (draft 7)
All taken. (1) Lock order chase → vdmg; damage to a vehicle in an active chase commits inside the chase queue;
`chaseResolve` holds the queue from validation through its write; no queue is held while waiting on another client.
(2) Action spends carry `byTest[aid]` receipts and use the same acked void protocol. (3) One entry per uuid across all
active chases, one vehicle per aboard character, `chaseTransfer` for moves. (4) `startCombat` refreshes every combatant
(unless "off") plus the chase union; the mode subset is for later rounds only.

## Part 3 plan, round 7 — Codex (draft 7, fresh session): REVISE, 2 findings
1. Cross-chase uniqueness raced: two combats' queues could both add the same vehicle; transfer had an unprotected
gap. 2. Putting ordinary action spends in `positionReserve.byTest` would turn them into turn-long reservations that
`_refreshDicePools` holds back (p.44: they refresh).

### Claude's response (draft 8)
Both taken. (1) One world-wide `chase-membership` queue for adds, aboard changes, removals and transfers; transfers
write `pendingIn` on the target first (counts as membership) and are finished by the ready pass; lock order
membership → chase → vdmg. (2) Action spends use a separate `flags.sr2e.chaseSpend.<aid>` receipt ledger; only DP
allocations stay in `positionReserve`.

## Part 3 plan, round 8 — Codex (draft 8, fresh session): REVISE, 3 findings
1. A transfer interrupted after deleting the source entry lost the entry's data (`pendingIn` held only {from, eid}).
2. `pendingIn.<vehicleUuid>` used a dotted uuid as an update-path key. 3. Damage chose its chase queue outside the
membership queue, so a transfer could slip between routing and commit.

### Claude's response (draft 9)
All taken. Transfers are `transfers.<randomID>` on the target holding the vehicle uuid as a value and a full copy of
the entry, with idempotent stages recorded → removed → added, finished by the ready pass before anything else.
`commitVehicleDamage` routes inside `chase-membership` (waiting out any pending transfer), then takes chase → vdmg.

## Part 3 plan, round 9 — Codex (draft 9, fresh session): REVISE, 3 findings
1. The closing pass applied effects (→ `commitVehicleDamage`: membership → chase → vdmg) while holding the chase
queue: a lock-order inversion that deadlocks. 2. Transfers dropped the turn's DP, reservations, bonuses, contact and
receipts (or would double-charge them in the target). 3. The transfer snapshot could go stale while a source action
still ran.

### Claude's response (draft 10)
(1) Taken: effects are applied only after releasing the chase queue, each through its own normal path; resolution and
the GM/closing passes read under the lock, release, apply, re-enter. (2–3) Resolved by removing the feature: the book
has no rule for moving a vehicle between simultaneous chases. A vehicle may be removed (only with nothing in flight;
its turn's records stay in the source) and added to another chase, joining from that chase's NEXT round, so no turn
counts in two chases. Rounds 7–8's transfer records go with it.

## Part 3 plan, round 10 — Codex (draft 10, fresh session): REVISE, 3 findings
1. Close of turn updated only pairs in contact; p.44 step 7 updates every distance (verified on the render).
2. New Driving Success Tests dropped the defaulting penalty and Vehicle Empathy that `rollVehicleTest` applies today.
3. Crash resolution wasn't recoverable: a claim before the roll could suppress a crash; a retried resolve minted fresh
damage ids.

### Claude's response (draft 11)
All taken. (1) Every pair's distance changes at close; hidden pairs' distance shows only on the GM panel. (2) Every
Part 3 Driving Success Test starts from `rollVehicleTest`'s base TN (Handling, damage, defaulting penalty, Vehicle
Empathy); R3-1 covers only the DP Open Test. (3) Crashes are a durable transaction on the vehicle (claimed → rolled →
resolving → done) with effect ids derived from the follow-up id; the GM pass reconciles each state; core and R2.

## Part 3 plan, round 11 — Codex (draft 11, fresh session): REVISE, 3 findings
1. The shared Driving-Test TN base wrongly listed relocation (a Perception Test vs Signature, p.48) and walls (no
Driving Test, p.52). 2. Crash recovery missed a `claimed` record whose card was posted before `rolled` was written.
3. Occupant damage relied on today's claim-then-roll `occupantResist`, which can lose or double damage on interruption.

### Claude's response (draft 12)
All taken. (1) The base applies only to the book's Driving Tests; relocation and walls keep their own procedures.
(2) `claimed` records reconcile against cards carrying the fid first; reopen only with no card and the claimer gone.
(3) Occupant resistance becomes a recoverable record (pending → rolled → done) whose damage is written with a receipt
in one actor update, for crash and impact occupants alike.

## Part 3 plan, round 12 — Codex (draft 12, fresh session): REVISE, 2 findings
1. Occupant resistance had no exclusive attempt: two people could roll the same effect and spend pools twice. 2. The
crash transaction persisted the Crash Test but not the following vehicle Damage Resistance Test, which could be
re-rolled on recovery (also automatic crashes and both vehicles in a ram).

### Claude's response (draft 13)
Both taken by generalizing instead of patching: a single **rolled-step protocol** in 3.0 (reserve an exclusive
attempt in the parent's owning queue → pool spend with an attempt receipt → arm → record from the card → apply
with receipts; recovery promotes found cards and only re-reserves when the roller is gone or the GM forces) covers
every roll in Part 3 — chase actions, DP, Crash Tests, every vehicle Damage Resistance Test, occupant/pedestrian and
rigger-feedback resistance. A crash holds two rolled steps in order; a ram one per vehicle.

## Part 3 plan, round 13 — Codex (draft 13, fresh session): APPROVED
"No new material problems found in draft 13 against the supplied pages and named code paths, respecting the settled
findings and user rulings. The shared rolled-step protocol addresses round 12's remaining recovery gaps."

### Claude's response
Plan locked at draft 13. Build order: 3a (the chase), 3b (damage), 3c (magic), each with a Codex code review.

## Part 3a code, round 1 — Codex (working tree, fresh session): REVISE, 8 findings
1. Passenger limits read only the Open Test, not the Positioning/Escape bonuses that are part of Driver Points (p.47–49).
2. "Apply" closed the test outside the Karma queue: a reroll could land after the recorded result.
3. The pool-writer refresh socket accepted any actor/receipt: a forged or stale request could refresh spent pools.
4. `chaseDriverUuid` was unused: the chase driver didn't drive resistance permissions, pool choice or crash cards.
5. Autonav and Signature read the base stats, not the modified ones.
6. The TN helpers floored at 2 before defaulting; Vehicle Empathy was missing.
7. A GM speed edit above the Speed Rating mid-turn skipped speeding Stress.
8. A refresh interrupted between the actor and its foci left the foci unrefreshed for good.

### Claude's response
All taken. (1) `dp.total` = Open Test + Positioning + Escape, used for the passenger limit. (2) Apply closes the test in
`karma:<messageId>` on the clicking client before the GM records it. (3) The writer refreshes only for a combat in
"refreshing" with that round's receipt, a participant, and itself the pool client. (4) `controllerOf` (and `riggedInto`)
return the chase entry's driver first, so every existing vehicle path follows it. (5) `effective.autonav/signature`.
(6) Helpers return the raw sum; defaulting + Empathy join before the floor. (7) The edit sets `over` with the same
per-turn Stress receipt. (8) Foci first, the actor's receipt last; nothing refreshes once the actor carries it.

## Part 3a code, round 2 — Codex (round-1 fixes only, fresh session): REVISE, 2 findings
1. The GM's close pass still closed and recorded a Success Test card outside its roller's Karma queue.
2. `riggedInto` let a stale `controlledVehicles` entry win over the chase driver.

### Claude's response
Both taken. (1) The GM pass records automatically only Open Tests and cards their roller already applied (closed in the
Karma queue); any other card holds the turn and the panel offers the GM an explicit **Apply now** (an override, like any
GM force). (2) With a chase driver, `riggedInto` is true only for that driver; `controlledVehicles` is the fallback.

## Part 3a code, round 3 — Codex (round-2 fixes only, fresh session): APPROVED
"No material problems found in the round-2 fixes. Published unclosed cards have the GM's Apply now path; vanished
rollers without cards have forced cancellation. Existing `riggedInto` callers remain compatible with chase-driver
precedence and the fallback."

## Part 3b code, round 1 — Codex (working tree, fresh session): REVISE, 13 findings
1. Impact records' resistance used the speed, not the stored code (ram, wall breakthrough). 2. A passenger's Deadly
collateral was committed from the passenger's client (refused; blocked their own damage). 3. A core ram's loser Crash
Test could be refused for the resolving player. 4. Crash attempts weren't exclusive (own replacement; any player could
force). 5. Occupant attempts could overwrite an in-flight roll. 6. R2 weapon resistance had no recovery link/pool
receipt. 7. Legacy core crashes switched ruleset mid-resolution. 8. Vehicle armour returned before a component could be
chosen. 9. The optional terrain cap wasn't applied to impact resistance. 10. Ram entitlement expiry missed same-index
phases and round ends. 11. Ramming ignored lost contact. 12. Crashes outside a chase used speed 0. 13. Crash occupants
were found at posting time, not snapshotted.

### Claude's response
All taken. (1) `kind:"impact"` uses its stored code. (2) GM op `passengerCollateral` (validates ownership + aboard),
fire-and-forget. (3) `vfollowCrash` accepts a resolved core ram card (`cardId`), fid `vram-<id>`. (4) Live attempts
refused for everyone; only the GM may force (confirm). (5) Per-client in-flight set + the current attempt re-validated
in the damage queue (`damageSkipIf`) and by `applyFromCard`. (6) R2 resistance cards carry `vresist {eventId, startIdx,
stageVs}`; a card without its `vdmg` receipt is applied from the card; Control Pool via `spendStep` keyed `wr-<event>`.
(7) `postCrashTestDue`/`resolveCrash`/`rollVehicleTest` carry the card's ruleset (unstamped = core). (8) Component
prompt first; its Body/Armor decide penetration. (9) Terrain cap on resist steps when the setting is on. (10) Expiry in
`SR2ECombat.nextTurn` via GM op `chaseExpireRam` with the departing actor and ending phaseSeq. (11) Refused until
relocated. (12) Outside a chase the speed is null and entered on the first roll (persisted at reserve). (13) Occupants
snapshotted when the crash record opens.

## Part 3b code, round 2 — Codex (round-1 fixes only, fresh session): REVISE, 7 findings
1. A defending player's resolution didn't mark the ram card, so the loser's Crash Test was still refused. 2. `vfollowCrash`
turned a null speed into 0. 3. R2 weapon resistance had no exclusive durable attempt. 4. Recovery ignored a component-only
hit. 5. A Body-0 component destroyed the whole vehicle. 6. Recovery after the damage landed only warned (no outcome
card). 7. Passenger collateral accepted any message id.

### Claude's response
All taken. (1) The resolution message carries `vramLoser`; `vfollowCrash` authorizes from it. (2) Null kept under R2.
(3) GM op `vresist` (vehicle queue): one attempt per event, reserve → spend `wr-<attempt>` → arm → card tagged with the
attempt; a live attempt is refused except the same player's unspent reserved one or a GM takeover; recovery accepts
only the recorded attempt's card. (4) The card records the component decision; recovery replays it. (5) Body 0 destroys
the component; the vehicle only if ticked. (6) Recovery always posts the outcome; the damage commit is idempotent.
(7) Collateral only from the passenger's own Deadly outcome card (`passengerDeadly`) resolving an R2 `rangedDamage`
card, once per attack.

## Part 3b code, round 3 — Codex (round-2 fixes only, fresh session): REVISE, 2 findings
1. Recovery ran after the component prompt and the immunity return, so a retry could discard the recorded result.
2. A replaced attempt could still commit damage first (only the event receipt was checked).

### Claude's response
Both taken. (1) The recorded-attempt recovery runs right after the ruleset is known, before any prompt or immunity
check. (2) `commitVehicleDamage(…, { attempt })`: GM_OPS.damage skips unless it is still the event's current `vresist`
attempt (checked in the vehicle queue); a replaced attempt's fully-resisted / component-only outcome is dropped too.

## Part 3b code, round 4 — Codex (round-3 fix only, fresh session): REVISE, 1 finding
1. A commit refused as a stale attempt still let the caller post a resolving outcome, closing the attack unapplied.

### Claude's response
Taken: GM_OPS.damage returns `stale: true`; both callers (the recorded-attempt recovery and the normal path) warn and
post no outcome, leaving the card open for the current attempt.

## Part 3b code, round 5 — Codex (round-4 fix only, fresh session): APPROVED
"No material problems found in the round-4 fix. The stale flag reaches both callers, which stop before posting an
outcome card."

## Part 3c code, round 1 — Codex (working tree, fresh session): REVISE, 5 findings
1. A damaging manipulation still damaged a vehicle on a tie (or when the vehicle rolled more). 2. The sight check used
the selected token, not the actual spell target, and judged area spells. 3. Limited windows could stack with the
dialog's own cover box (+8). 4. The new await came before target-dependent values were captured (macros). 5. No
manual input for a moving vehicle outside a tracked chase (casting and astral return).

### Claude's response
All taken. (1) Under Rigger 2 a manipulation needs MORE caster successes (also in the recorded-attempt recovery: the
card stores `manipulation`). (2) The sight target is the chosen combat row / the manipulation's target; area spells
skip it. (3) `hasCover` from the row's situation: never twice. (4) `firstActor` captured before the await and reused
for the healing and cybermancy subjects. (5) The spell dialog has "From a moving vehicle" (Rigger 2 only), used when
the caster isn't in a tracked chase; the astral return asks whether the body is in a moving vehicle when untracked.

## Part 3c code, round 2 — Codex (round-1 fixes only, fresh session): REVISE, 1 finding
1. `singleCombat` was read before its `const` declaration: every cast reaching the block threw (both rulesets).

### Claude's response
Taken: the block now sits right after `singleCombat` is declared. Proven live: the spell batches (area, combat,
manipulation, foci, effects, healing, restricted, metamagic, Spell Defense) pass.

## Part 3c code, round 3 — Codex (round-2 fix only, fresh session): APPROVED

## Part 4 plan, round 1 — Codex (draft 1, fresh session): REVISE, 18 findings
Invented half-point range reading; per-transmitter modifier limits and port requirement dropped; no boost allocation
model; ECM fields tied to the target only; pairwise rolls contradict the single jammer roll; record races; ED not
gated/keyed per threat; Signature helper could drop mods/leak EW; manual-gunnery scope; the dialog alone can't replace
the TN composition; LOS conditions; missile data through ammo/reload; launch transaction; closing-stage integration;
continuous-lock obligations; indirect-fire equipment and commitments; area-effect roll contract; sensor component
upgrades and footage prerequisites.

### Claude's response (draft 2)
All taken (see 4.0–4b.7): GM-adjudicated half/negative Flux; per-transmitter conditions; `fluxBoost` GM op validating
the whole allocation; ECM fields covering observers wherever they aim, max effect; one stored jammer roll read at each
observer's TN; reserved ids/immutable inputs/revisions/receipts, validity checked on read; ED behind a setting, keyed per
threat; baseline `effective.signature` + a separate EW term; explicit core/manual/sensor/missile modes with one
composition each (wounds stay central); dispatch ruling stated; LOS conditions; `guided` ammo data through reload and
launch; durable launch records resolved in a closing stage for every combat, effects outside the lock; guidance and
spotter commitments enforced in shared paths; FDDM/designator endpoints; the area-effect contract (radar reading of
the cut word noted); component upgrade state and footage prerequisites. User rulings R4-1 (rating × 1.5) and R4-2 (until
contact is lost) recorded.

## Part 4 plan, round 2 — Codex (draft 2, fresh session): REVISE, 8 findings
1. The walking/running drone modifier belongs to the ATTACKING drone on mechanical legs (p.57 key), not the target.
2. The continuous-lock +2 applies to Driving Tests only, not every chase action.
3. Combat Pool: 4b.4 excluded it for "indirect/area" while p.61 allows it on the area-effect scatter test.
4. Read-time validity could resurrect a lock/EW result after range or a device returned.
5. Item-only transmitter identity leaves stock sensors (no Sensors item, e.g. the Westwind) unaddressable.
6. Sensor components must be declared in the system's `VehicleModData`, not the content module.
7. Ammunition had three writers (gunner, vehicle queue, money queue): lost updates.
8. The launch didn't snapshot the full weapon payload for the deferred attack.

### Claude's response (draft 3)
All taken (p.57 re-read: "Attacking Drone Walking/Running … only if the drone is propelling itself with mechanical
legs"). 4.0 adds contact/device generations bumped by the GM on every loss, stored on each record; 4a.1 components in
`VehicleModData` (built-in sensor components on a vehicle flag); 4a.3 a `builtin-sensor` identity; 4b.2 the attacker's
locomotion; 4b.4 a full launch payload + gunner/source identities, ONE ammunition writer per weapon (`ammo:<uuid>`,
receipts, money → ammo lock order), Combat Pool excluded only on targeted indirect missile attacks, the +2 only in the
Driving Test path.

## Part 4 plan, round 3 — Codex (draft 3, fresh session): REVISE, 8 findings
1. Range loss checked only at round changes/EW actions misses a leave-and-return in between.
2. Contact generations per observer conflate independent transmitter ranges.
3. Launch admission isn't serialized with round closure.
4. Reloads must keep the reserve owner's money/inventory queue (shared reserves).
5. The payload snapshot isn't atomic with the spend.
6. Rating-0 stock sensors still unaddressable.
7. Component upgrades limited to two examples.
8. Non-missile indirect fire (mortars, artillery; p.60) omitted.

### Claude's response (draft 4)
All taken. 4.0: generations per directed transmitter→recipient link plus device and hide generations; the GM's
`ewSweep` runs on every range-affecting change (token moves, chase distances, boosts, conditions). 4a.1: components keyed
by any p.27 component. 4a.3: explicit `sensorInstalled` for Rating-0 systems. 4b.4: reloads stay under the reserve
owner's money queue then the ammo queue; one atomic validate+debit+snapshot; an admission fence under `round:<combatId>`
drained by the closing stage. 4b.5: non-missile indirect fire (p.60 re-read): same spotting/equipment, missile-only
terms 0, the Gunnery Test resolved when fired — a stated reading; weapon-specific artillery rules come from their items.

## Part 4 plan, round 4 — Codex (draft 4, fresh session): REVISE, 6 findings
1. Direct LOS −3 limited to air/ground lines; p.58's list is examples (air-to-air qualifies), only ground-to-ground needs
   clear open terrain.
2. A queued sweep reading live state can miss a move out and back.
3. Records ignore the receiving device and the ECCM/ECD supplying cancellation.
4. Releasing an admitted launch could race a pending spend on another client.
5. Missile ECM exposure "during any part of flight" needs a history.
6. The boost validator required items, contradicting the built-in sensor.

### Claude's response (draft 5)
All taken: LOS per p.58 with ground-to-ground restricted; ordered transition snapshots (before/after) drained before any
dependent action; receiving-device and separate cancellation-layer generations; release only on the ammo writer's
durable cancel receipt (later spends refused); per-launch exposure history used at Phase 0 with GM add/strike; one
`transmitterOf` resolver. Also removed a sentence draft 4 left duplicated in 4.0.

## Part 5 plan, round 1 — Codex (draft 1, fresh session): REVISE, 22 findings
No operator/connection, one primary per rigger unenforced; `setControl` isn't an atomic multi-actor transaction (other
queue, `linkedVehicles`, no NPCs); chase driver logic competes with network control; substituting Pilot dice doesn't
adapt callers (drivingModes, rollDrivingTest, gunner state); drone identity conflated with adaptation; range loss
invented as carrier loss and observation of non-affiliated drones; hardwiring incomplete; secondary-drone weapon fire
while jumped; IVIS/Learning Pool spend and refresh; alert/frequency state on the wrong side; channel totals can't carry
operation-specific effects or attacker provenance; no lost-carrier state, no reconnect TN; takeover invented a
drone transfer; interference without a durable contest; dump causes and idempotency; intrusion removal by the wrong
rule; CCSS treated as a radio network and coverage limits missing; access-step rules altered; security-rigger
perception/radio/pool rules missing; ACV slopes, tailhook, train restrictions dropped; Task Pool omitted; wrong release
dependencies.

### Claude's response (draft 2)
All taken; Part 5 rewritten. Task Pool read from R2 p.16 and Shadowtech pp.23/49 (encephalon L2–4 = 1–3 dice, cerebral
booster L2 = 1) and added as 5a.0. User rulings R5-3 (reconnect base TN 4) and R5-4 (encephalon and booster Task Pool
dice add). The network record gains operator/connection; drones' control truth is the connected network (NPC and token
operators via a derived index); one world-wide `rc-control` queue (Part 1's control op joins it) with a stated lock
order; chase operator vs crew; one drone test context with every caller adapted; drone identity / network capability
separated; reachability separate from MIJI; observation only of affiliated drones; hardwiring as permanent affiliation;
fire gated by mode; per-group IVIS and per-robot Learning Pool balances with keyed refreshes; target-side alert and
`freqGen`; degradation entries with operation/attacker provenance and per-test channel rules; carrier state; a durable
two-deck interference contest transferring only the operator; dump events with distinct causes and once-only steps;
intrusion ended by Part 4's ECCM procedure (a stated reading); CCSS as a hardwired network (no MIJI) with components and
coverage limits; access steps per p.79–80; security-rigger perception, radio and a pool table; ACV slope, tailhook and
train rules; four releases with real dependencies.

## Part 4 plan, round 5 — Codex (draft 5, fresh session): REVISE, 3 findings
1. Exposure history kept only a rating: it can't reproduce the ECM effect after the event expires; item ids aren't
   unique across vehicles.
2. Owner and GM `ammo:` queues run on different clients: a late owner spend could beat a GM cancellation.
3. Indirect guidance had no durable spotter-owned record (designator characters, ongoing penalties, lost guidance).

### Claude's response (draft 6)
All taken: exposures keyed by emitter uuid + device + ECM event, carrying immutable copies of the rolls, inputs and
cancellation; spend vs cancel decided by one server-serialized `once()` claim per launch, the debit applied idempotently
by whoever is writer; a spotter-owned guidance record (route, endpoints, test, generations, linked launches) driving
the commitments and Phase-0 validation/branching.

## Part 5 plan, round 2 — Codex (draft 2, fresh session): REVISE, 16 findings
A vehicle could affiliate with two decks; affiliated non-drone vehicles kept Part 1 control; chase callers still read
`entry.driver` and `chaseUnion` missed operators; chase invalidation had a window; the first interference loss wasn't
handled; a takeover left the captured network unusable; monitors accumulated hidden boxes; multi-attacker regeneration
invented; intrusion's ECCM operands undefined; voluntary vs forced disconnects; dump events not coupled to their cause;
`initiativePass` doesn't exist (the combat has `phaseSeq`); IVIS group membership; deck/module recognition and binding;
aircraft adverse-weather trigger; tailhook applies to arrestor cables only.

### Claude's response (draft 3)
All taken. User rulings R5-5 (each regeneration targets one intruder's boxes, the rigger's choice) and R5-6 (blocking an
intrusion = p.31 ECCM with the protocol emulation rating in place of the ECM rating; all net successes cancelled ends
it). One network per vehicle; network control for every affiliated vehicle, exclusive with crew control both ways;
`actingActorOf` across chase callers, operators in `chaseUnion`; rev-stamped chase actions + a deck-side outbox; the
contest opens before the first roll; takeover = connected operator, carrier restored for the winner, boxes kept;
applied-box capping; forced ejection dumps in any mode, voluntary jack-out never; rigger event written first and
reconciled against the deck rev; Learning Pool keyed on `phaseSeq`; exclusive IVIS membership; rule keys + `deckId`
binding for modules; adverse weather; tailhook only for arrestor cables.

## Part 6 plan, round 1 — Codex (draft 1, fresh session): REVISE, 18 findings
Bundled options; fuel write races and recovery; no exhaustion state machine; aircraft crash distance; optempo settlement;
quality data plumbing; hidden Stress visible and duplicable; no attack snapshot for subsystem effects; repeated hits and
replacement; destroyed state vs the equipment model; no effective Body; subsystem repairs through the monitor path;
special resistance modes; footprint expiry and arithmetic; extended-missile damage and lifecycle; lock-breaking
arbitration; pre-programmed command failure/storage; partial-MIJI overlays.

### Claude's response (draft 2)
All taken; Part 6 rewritten (6.0 shared contracts: effective Body, operability separate from installation). One
setting per selectable rule (fuel, flight fuel, fuel grades, optempo modes, quality factors, subsystems, footprint,
break-lock, extended missiles, pre-programmed commands, back-up channels, CRD server, partial MIJI, multi-channel,
barrage, hot mike), each re-checked in its handlers. User rulings R6-6 (a Footprint reduction lasts until the GM clears
it) and R6-7 (an extended-range missile's collision does its warhead damage).

## Part 4 plan, round 6 — Codex (draft 6, fresh session): REVISE, 3 findings
1. The `once()` claim decides spend vs cancel, but the debit itself could still race across clients.
2. The exposure snapshot used ED's Intelligence substitution for ECM and omitted the observer's opposed roll.
3. Guidance penalties began at spotting (p.60: after launch) and had no cleanup for unused or cancelled guidance.

### Claude's response (draft 7)
All taken: every loaded-ammunition mutation is the GM op `ammo` in one `ammo:<weaponUuid>` queue on the active GM
(reserves still debited under the owner's money queue with an idempotent load); the missile is an ECM observer with its
own Sensor Rating and opposed roll (no ED substitution), both sides copied into the exposure; guidance is `acquired`
(no penalty) until a launch commits it, with cleanup for unused, cancelled and non-missile cases.

## Part 5 plan, round 3 — not run: Codex usage limit (resets 9:49 PM).

## Part 6 plan, round 2 — Codex (draft 2, fresh session): REVISE, 11 findings
1. Optempo double-charged in frequent/mileage and refunded assessed rather than paid overhead.
2. Hidden-Stress reveal not atomic across the secret store and the actor; `stress` re-entered the vehicle queue.
3. The book's reveal triggers (pushing, Stress Rule of One botch) missing.
4. The fuel writer was gated by `r2Fuel`, blocking flight fuel and subsystem leaks.
5. Flight maneuvers multiply initial fuel CAPACITY, not current fuel.
6. Drone moving/idle fuel could be billed twice.
7. A frozen Footprint total disconnects from live transmitters.
8. No chase adapter for extended missiles (driver, Driver Points, Initiative, fixed speed).
9. Break-lock didn't cover extended missiles or count attempts per launch.
10. Back-up channels lacked routing for MIJI, degradation and carriers.
11. Partial MIJI overlays covered only degradation.

### Claude's response (draft 3)
All taken: one vehicle-month optempo settlement superseding unpaid liabilities and refunding only actual payments; a
recoverable three-step reveal with the book's triggers prompting the GM; shared `fuel` infrastructure authorized per
origin; maneuvers consume capacity × (1 − multiplier) (reading stated for partial tanks); exclusive fuel intervals with
an atomic cursor; Footprint as ordered operations over the live sum; a missile chase adapter (no Driver Points, own
Initiative, fixed speed, Intelligence dice); one launch-wide break-lock resolver; logical→physical channel routing; scoped
partial-MIJI operations covering every effect and its range-exit cleanup.

## Part 4 plan, round 7 — Codex (draft 7, fresh session): REVISE, 3 findings
1. Reloads still read clip contents outside the GM queue (stale reads). 2. A timed-out reload's refund could race a late
load. 3. The under-5-m/turn fallback belongs to manual gunnery only (p.58).

### Claude's response (draft 8)
All taken: reloads are a three-step transaction (GM plan + weapon fence → reserve debit on the money writer → GM settle),
cancellation terminal in `ammo:` before any refund; the low-speed fallback applies only where `manual` would be chosen.

## Part 5 plan, round 3 — Codex (draft 3, fresh session): REVISE, 10 findings
1. Exclusivity missed chase drivers. 2. The chase commit could interleave with `rc-control`. 3. A deck revision isn't
proof a dump's cause committed. 4. The two-deck contest had no recovery journal. 5. Task Pool caps undefined on
equipment-rolled tests. 6. Scoped Learning Pools not enforced (MK-Guyver, Wolfhound). 7. Robots' own phases. 8. The
intruder can't pick channels after rolling (p.69: the GM, unless named). 9. Automatic CCSS interception/decryption
invented. 10. No CCSS controlled-component state.

### Claude's response (draft 4)
All taken. User ruling R5-7: Task Pool on equipment-rolled tests capped at Electronics (or the concentration in use).
Chase drivers included and driver assignment moved into `rc-control`; chase commits hold `rc-control` then the chase
lock; dump cause receipts/tombstones in the same deck update; a world-level contest journal with per-deck application
receipts and blocking recovery; Learning Pool as `{ dice, scope }` independent of the robot trait (the Wolfhound is an
aircraft) with declared-scope use and GM veto; robots act in their own phases; intended channels named before rolling,
else the GM picks; CCSS receivers and decryption as equipment used by tests; a mutually exclusive CCSS control state.

## Part 6 plan, round 3 — Codex (draft 3, fresh session): REVISE, 5 findings
1. Superseding a liability could race an admitted payment. 2. Per-vehicle refunds not derivable from aggregated
receipts. 3. Fuel submissions lacked covered intervals. 4. The missile adapter couldn't use the Ram path or a Maneuver
Score, and dropped the printed Driving Test. 5. Disabling quality factors would block `replaceEngine`.

### Claude's response (draft 4)
All taken. User ruling R6-8: extended-range missiles use Part 3a's formulas with Intelligence for the driver's skill,
no pools, and may Ram once their fixed speed covers the distance. Release-or-settle before superseding; a deterministic
pro-rata allocation with a cumulative refund ledger per original receipt (legacy too); submissions with intervals
trimmed against the cursor, mode changes settling first; designs stay valid with the setting off (only editing
restricted).

## Part 4 plan, round 8 — Codex (draft 8, fresh session): REVISE, 2 findings
1. The plan's frozen `need` could overdraw reserves or break partial reloads. 2. A cancelled reload could duplicate
ejected rounds credited before the cancellation was seen.

### Claude's response (draft 9)
Both taken: the reserve step computes the actual `loaded = min(need, available)` and records it with the ammo properties;
ejected rounds are escrowed in the reserve receipt until after settlement; cancellation is terminal in `ammo:` and then
acknowledged idempotently by the reserve writer (refund, escrow discarded) before the fence lifts.

## Part 5 plan, round 4 — Codex (draft 4, fresh session): REVISE, 11 findings
Physical driver reads (occupants, relocation) wrongly replaced; cached chase operator goes stale; hardwired onboard
driving impossible and an unprinted Pilot prerequisite; captain's chair decided per deck, not per operator; the deletion
tombstone didn't prove the cause; MIJI missed the encryption-alert +2; Control a Room is Complex (p.78); CCSS radio
routed through RC-network EW; rigger-combat Control Pool contradicted the pool table; robots' Threat Ratings dropped;
mechanical-arm Strength not actually derived.

### Claude's response (draft 5)
All taken: only authority/dice reads use `actingActorOf`, physical reads keep the crew driver; the chase reads the live
operator; onboard `hardwired` driving mode, hardwiring needs only adaptation + port; modes derived per operator across
networks; deck deletion journalled as an intent and the dump published only after verified deletion; MIJI TN includes
the alert modifier; Control a Room Complex; ordinary radio by the core rules; pool table applied in rigger combat; robot
`threatRating`; per-arm Strength derived into `effective.arms`.

## Part 6 plan, round 4 — Codex (draft 4, fresh session): REVISE, 5 findings
1. Missiles could move more than their speed per Turn. 2. Part 3a's Hide ends contact on any success, contradicting
failed lock-breaks. 3. Fractional Karma and cross-month credit in refunds. 4. Missed-payment Stress not reversed. 5. The
hidden-Stress store wasn't serialized.

### Claude's response (draft 5)
All taken: one movement budget per Turn shared with the closing stage; a launch-bound Hide using only the test
calculation; credit within its month, whole-point Karma by largest remainder, cash last; receipt-backed reversal of
missed-payment consequences; one `hidden-stress` GM queue.

## Part 4 plan, round 9 — Codex (draft 9, fresh session): REVISE, 2 findings
1. A cancellation after settlement could refund rounds already loaded. 2. Settling "exactly loaded" dropped the rounds a
top-up retains.

### Claude's response (draft 10)
Both taken: cancellation only from `planned` (after settlement, recovery finishes the escrow release, no refund); plans
record `retained` and settle `retained + loaded`.

## Part 5 plan, round 5 — not run: Codex usage limit (resets 2:52 AM).

## Part 6 plan, round 5 — Codex (draft 5, fresh session): REVISE, 4 findings
1. Out-of-order fuel intervals could be dropped by the cursor. 2. Ram bypassed the missile's movement ledger. 3. Whole
Karma points can't map to cash allocations (one point may cover two bills with no cash). 4. Reversal could remove Stress
a completed restoration already removed.

### Claude's response (draft 6)
All taken: pending out-of-order intervals with contiguous cursor advance and deferred mode changes; Ram uses the same
per-Turn ledger; Karma points' monetary coverage tracked across bills, cash allocations summing to the original debit,
a point refunded only when none of its coverage is needed; reversal net of completed restorations.

## Part 4 plan, round 10 — Codex (draft 10, fresh session): APPROVED

## Part 5 plan, round 5 — Codex (draft 5, fresh session): REVISE, 5 findings
1. Hardwired driving stored the operator as `entry.driver`, reintroducing stale authority; rigging predicates and roll
callers knew only "rigged". 2. A deck-local `rev` can't validate operator-wide modes. 3. Non-robot Learning Pools (the
Wolfhound) had no refresh key. 4. Group commands rolled per drone; p.66–67 describes one group test. 5. Read helpers could
see a half-applied takeover.

### Claude's response (draft 6)
All taken. User ruling R5-8: one group Comprehension Test at the group's lowest Pilot. Networked authority only from the
live network, occupancy in `entry.aboard`, `hardwired` treated as `rigged` in every predicate and caller; actions stamped
with the network `rev` AND an operator-wide control generation; Learning Pool keyed on the phase in which its vehicle
acts (own robot phase or operator phase); control reads resolve from the contest journal's committed state while
recovery is pending.

## Part 6 plan, round 6 — Codex (draft 6, fresh session): REVISE, 3 findings
1. The reversal reused the original `vstress` key, which the op skips. 2. Subsystem crash consequences could duplicate
and chain. 3. Generic repair could restore armor lost to Armor-Defeating Hits.

### Claude's response (draft 7)
All taken: a distinct `ostress-rev:<id>` receipt updating the counter atomically; subsystem records carry the
originating event, crash consequences coalesce per event and are suppressed during a crash; Armor-Defeating Hit
records excluded from repair, retired only by armor replacement.

## Part 5 plan, round 6 — Codex (draft 6, fresh session): REVISE, 4 findings
1. Hardwired `riggedInto` dropped the VCR prerequisite (and would enable rigger feedback without one). 2. Waiting for
contest recovery inside `routeDamage` reverses the lock order. 3. The network index missed actor/token/scene lifecycle
changes. 4. The CCSS's p.77 rating is radio DECRYPTION, not system encryption.

### Claude's response (draft 7)
All taken: driving authority vs rigging eligibility (VCR still required for rigging benefits and feedback); the contest
check and recovery run under `rc-control` before `routeDamage` takes chase/vehicle locks, readers never wait; the index
rebuilds on ready and every relevant lifecycle change; CCSS encryption a separate flag, the p.77 rating optional radio
decryption equipment.

## Part 6 plan, round 7 — Codex (draft 7, fresh session): REVISE, 1 finding
Crash coalescing could let a Crash Test's success prevent a mandatory automatic crash from Deadly Handling/Body.

### Claude's response (draft 8)
Taken: one origin-keyed crash record with automatic-crash precedence (a pending test is invalidated), further crashes
suppressed only once that origin has actually crashed.

## Part 5 plan, round 7 — Codex (draft 7, fresh session): REVISE, 3 findings
1. The damage-path fix took `rc-control` before `chase-membership`, against the declared order. 2. A takeover could
re-key a non-robot's Learning Pool. 3. One `rcNet.contest` pointer let concurrent contests overwrite each other.

### Claude's response (draft 8)
All taken: `routeDamage` takes `chase-membership → rc-control`, recovers, and holds both through `chase → vdmg` and the
snapshot; a persisted `learningKey` advanced only at qualifying boundaries and carried through control changes; several
contests per deck, exchanges bound to both networks' generations, other contests voided atomically on exit/takeover.

## Part 6 plan, round 8 — Codex (draft 8, fresh session): REVISE, 2 findings
1. Combat rounds don't advance world time, so chase debits had no distinct intervals. 2. Coasting distance wasn't
applied to chase movement.

### Claude's response (draft 9)
Both taken: persisted round→interval mapping (3 s per Combat Turn, reused on replay); a receipted coasting ledger moving
total ÷ turnsToStop per Turn in place of ordinary movement, the travelled distance feeding an early aircraft crash.

## Part 4a code, round 1 — Codex: REVISE, 11 findings
1. A countermeasure switched on later never countered a standing ECM/ED result. 2. Unlinked token vehicles were left out
of EW discovery and sweeps. 3. A token's first move after placement skipped invalidation. 4. Toggles/equipment changes
that shrink a range didn't sweep. 5. EW records lacked hide and receiving-sensor identity dependencies. 6. A Sensor Test
went ahead with no usable range or no known distance. 7. ECM wasn't settled when the scanned target wasn't a vehicle.
8. Range/generations were read outside the queue (a sweep could slip between), no idempotency. 9. Players could pass the
GM-only Signature override. 10. No way to connect an Electronics Port to a device. 11. A pending/removed Sensors item
displaced working sensors.

### Claude's response
All fixed: ECCM/ECD are separate layers rolled against the standing record; `allVehicles()` includes unlinked token
vehicles; positions cached at ready and on token creation, uncached moves still swept; sweeps on every toggle, boost,
port, condition, item and Body change (`sweepAround`, transmitter and recipient sides); records store the receiving
sensor id+generation and the directed hide generation; targeted tests fail closed (range, distance — the GM may state
one); ECM settled for every Sensor Test, ED only for vehicle targets; the test is admitted, rolled and recorded in ONE
observer-queue step, idempotent by `eventId` with `sensorReceipts`; `gmValue` only from a GM; a `portBind` GM op and a
Ports section on the panel; the sensor transmitter is the WORKING Sensors item, else stock sensors. Quench: 4 new cases
(sr2e.sensors 9/9); vehicle batches 93/93.

## Part 5 plan, round 8 — Codex (draft 8, fresh session): REVISE, 1 finding
Hardwired riggers lose the passenger-limit exemption (`passengerLimit` keys on `entry.driver`).

### Claude's response (draft 9)
Taken: the exemption is the live controller rigged into the vehicle (`controllerOf` + `riggedInto`), never
`entry.driver`.

## Part 6 plan, round 9 — Codex (draft 9, fresh session): REVISE, 2 findings
1. Combat fuel intervals diverge from world time (ten rounds push later debits into the past). 2. Equal-distance
coasting invents a movement rule.

### Claude's response (draft 10)
1: one per-vehicle logical fuel clock with combat entry/exit mapping; every submission translated onto it. 2: user
ruling R6-9 — the printed total is split across Turns in proportion to each Turn's speed (Gray Ghost 2,500/2,000/1,500/
1,000/500 m).

## Part 4a code, round 2 — Codex (fix review, fresh session): REVISE, 2 findings
1. Range reductions can escape invalidation: ECCM on and off queued together both run before the appended sweeps, which
   see the restored range.
2. Restoring built-in sensors revives expired EW results: no receiving-device generation changes.

### Claude's response
1. Taken: sweeps read the broken links SYNCHRONOUSLY when each change lands (`brokenLinks` in `sweepAround`), and the
   updateActor hook now sweeps on the panel's own flags (ewOn, fluxBoosts, txConditions) as well as Body/sensor; a boost
   reallocation is one forced-replacement write (no transient unboosted state).
2. Taken: the stock sensors' generation is bumped whenever `sensorInstalled` or `system.sensor` changes, and when a
   Sensors item is created, deleted or changes state.
Quench `sr2e.sensors` 12/12 (3 new tests).

## Part 6 plan, round 10 — Codex (draft 10, fresh session): APPROVED
"No material unresolved findings. Draft 10 covers the supplied rules and settled rulings, separates the optional
settings, and specifies recoverable transactions and derived-state handling compatible with the existing callers."

## Part 5 plan, round 9 — Codex (draft 9, fresh session): REVISE, 2 findings
1. Hardwired driving loses the Initiative restriction: `drivenEntry()` recognizes only `entry.driver`, so a hardwired
   operator aboard without a VCR keeps enhanced Initiative.
2. The operator-wide generation `rcOpGen` has no recoverable commit protocol (a deck update plus a counter on another
   document can't be atomic).

### Claude's response (draft 10)
1. Taken: `drivenEntry` also returns a networked entry whose live operator is aboard driving it hardwired; remote
   operators excluded; Quench case.
2. Taken (the second fix offered): `rcOpGen` is replaced by an operator stamp DERIVED from the authoritative deck records
   — the sorted `(deckUuid, rev)` of every deck the operator runs, from `rcIndex()` — validated under `rc-control`.

## Part 5 plan, round 10 — Codex (draft 10, fresh session): REVISE, 1 finding
1. Hardwired rigging bypasses the single-primary model: `riggedInto` true for any aboard operator with a VCR, apart
   from `rcNet.primary` — jumping elsewhere leaves it rigged too, and the primary-only Control Pool excludes it.

### Claude's response (draft 11)
Taken: rigging a hardwired vehicle is the operator's primary (`rcJump`), so the one-primary rule, `droneCtx`, pools,
jump/return and the dump derive from one selection; `riggedInto` = primary, no separate hardwired branch; onboard
driving without rigging (datajack/manual) is unchanged.

## Part 4a code, round 3 — Codex (fix review, fresh session): REVISE, 2 findings
1. Forced boost replacements escape the synchronous check: Foundry keeps the `==fluxBoosts` key in the hook's changes.
2. The stock-sensor bump is too broad: a pending Sensors item (parts, tested, deleted) expires valid results though the
   stock sensors stayed the receiver.

### Claude's response
1. Taken: the updateActor check also recognizes `flags.sr2e.==fluxBoosts`.
2. Taken: the GM tracks each vehicle's receiving sensor (seeded at ready, token and actor creation) and bumps the stock
   sensors only when they STOP being the receiver.
Quench `sr2e.sensors` 14/14 (2 new: a queued boost cut-and-restore; a pending Sensors item leaving a lock standing).

## Part 5 plan, round 11 — Codex (draft 11, fresh session): REVISE, 1 finding
1. Channel takeover outside interference is missing: p.70 — filling ANY channel's monitor shuts out the deck and lets
   the intruder assume control of that channel's operations.

### Claude's response (draft 12)
Taken (re-read from the p.70 render): `rcNet.channelAuthority.<channel>` when a meaconing or intrusion entry fills a
channel — command / system / simsense operations pass to the intruder's deck, the owner is shut out of that channel;
ends on reconnection (5b.6), an invalid intercept or the intruder's exit. Jamming's own 10-box effects (p.71–72) stand as
the specific rule. Interference keeps its whole-network contest.

## Part 4a code, round 4 — Codex (fix review, fresh session): REVISE, 2 findings
1. Unseeded vehicles (a token switched to unlinked) can revive stale results: the in-memory receiver defaulted to null.
2. The receiver cache goes stale on a standby GM, which then misses the transition after a handover.

### Claude's response
Both taken by one change: the last receiver is DURABLE (`flags.sr2e.ewReceiver`, written in the vehicle queue), and the
drop decision is read synchronously from it as each change lands; never recorded (an older vehicle) counts as the stock
sensors receiving (a one-time conservative bump). Quench `sr2e.sensors` 14/14.

## Part 5 plan, round 12 — Codex (draft 12, fresh session): REVISE, 2 findings
1. Channel takeover conflicts with `controllerOf` (feedback, resistance, driving, permissions).
2. Channel-authority actions lack the intruder's dependency stamp.

### Claude's response (draft 13)
Both taken: `controllerOf` untouched; a separate `channelActor(net, channel)` read only by the command, observation/
system-data, indirect-fire and simsense-observe paths; captured-channel actions stamp both networks' generations and the
intruder's operator stamp, re-validated under `rc-control` at commit.

## Part 4a code, round 5 — Codex (fix review, fresh session): REVISE, 1 finding
1. Queued flag writes can hide receiver interruptions: hooks landing while the queue is busy all read the same durable
   value, so a disable-and-restore between them bumps nothing.

### Claude's response
Taken: each transition is captured synchronously against the last one SEEN (an in-memory value per vehicle, the durable
flag as baseline) and persisted in queue order (bump, then the captured receiver). Quench `sr2e.sensors` 14/14.

## Part 4a code, round 6 — Codex (fix review, fresh session): REVISE, 1 finding
1. Cleanup can discard a newer pending transition: comparing receiver VALUES allows an A→B→A→B race in which an
   earlier job clears the cache of the latest capture.

### Claude's response
Taken: each captured transition carries a unique token; a job clears the cache only when its token is the latest one.
Quench `sr2e.sensors` + vehicle batches 69/69.

## Part 5 plan, round 13 — Codex (draft 13, fresh session): REVISE, 1 finding
1. Simsense jamming scoped too narrowly: p.72 applies it to the remotely rigged rigger's target numbers like a damage
   modifier, not only to tests through the drone.

### Claude's response (draft 14)
Taken: the Perception / Manual Gunnery rows stay drone-only; the damage-like penalty applies in `riggerTnParts` to all of
the rigger's Success Tests from the live primary connection, the channel counted once.

## Part 5 plan, round 14 — Codex (draft 14, fresh session): REVISE, 2 findings
1. Reachability changes bypass action invalidation (moving a drone out of range changes no deck rev).
2. Primary selection can outlive rigging eligibility (the jack-out toggle writes `system.rigging` directly).

### Claude's response (draft 15)
1. Taken: the dependency stamp carries the deck→drone link and device generations (Part 4's sweep bumps them on range
   loss) and the commit re-checks live reachability under the locks.
2. Taken: `riggedInto` = primary AND live eligibility; eligibility loss (jack-out, VCR off/removed, deck unequipped) is an
   `rc-control` op that clears primary and bumps the deck rev; the sheet's toggle becomes its request.

## Part 5 plan, round 15 — Codex (draft 15, fresh session): REVISE, 1 finding
1. The round-13 resolution applies simsense jamming to resistance tests too; a damage modifier is exempt there.

### Claude's response (draft 16)
Taken: the damage-like simsense term is applied where the Injury Modifier is (`testTnModifiers`, beside `woundPenalty`),
under the same exemptions, not through `riggerTnParts`.

## Part 5 plan, round 16 — Codex (draft 16, fresh session): REVISE, 1 finding
1. The primary-only rigging predicate would break vehicles rigged directly without a network (crew chase entries).

### Claude's response (draft 17)
Taken: rigging checks dispatch by affiliation — networked vehicles use the live eligible primary; unaffiliated vehicles
keep the existing direct-rigging predicate, the chase's included.

## Part 4b code, round 1 — Codex (fresh session): REVISE, 12 findings
1. Launch ops escalate permissions (only the gunner checked; guidanceCommit/End unchecked).
2. One missile can produce several attacks (double click, retry after reload).
3. The round advances before the missile's damage resolves; refused attacks counted as resolved.
4. A refused indirect launch leaves the spotting committed forever.
5. Continuous guidance accepts a replacement lock.
6. Continuous-lock restriction bypassed (launch dispatched first; melee/personal weapons; other vehicles).
7. Non-missile indirect fire can use one target's spotting against another.
8. A character FDDM spotter's guidance never validates.
9. Area-effect entry paths missing (failed spotting; no lock/no Signature from the dialog).
10. The ammo queue refuses a player controlling a GM-owned vehicle.
11. A deleted reserve leaves a reload fence closed forever.
12. Sensor-enhanced / indirect personal weapons roll the wrong skill.

### Claude's response — all taken
1: `missileLaunch` authorizes the requesting user (gunner, weapon/its vehicle/its controller, holder relationship) and
checks the lock GM-side; `guidanceCommit` GM-only; `guidanceEnd` GM or the spotter's player; non-missile indirect goes
through a new GM op `guidanceUse`. 2: one durable `attempt` per arm, written on the test card (`missileAttempt`); a retry
finds the card and only records it; a client in-flight guard. 3: a rolled launch is `struck`, terminal (`resolved`) only
when its damage card (blast/ranged/spread) is resolved or there is none; the round change waits; a GM hook resumes it
when such a card resolves; no card for the attempt → back to `launched`. 4: `guidanceUnlink` on a refused launch
(back to acquired). 5: Phase 0 requires the ORIGINAL lock (id). 6: the commitment is checked before any dispatch, any
weapon, across every vehicle's launches. 7: the attack must be aimed at the spotter's target. 8: FDDM-route spottings
validate on the spotter's working FDDM. 9: failed spotting posts an area-effect card; the dialog offers an area-effect
mode (the round spent through the ammo queue). 10: the ammo queue admits the controller's player. 11: the GM closes a
cancelled/settled plan whose reserve is gone. 12: Gunnery for sensor/indirect/missile modes.
Quench `sr2e.sensors` 23/23 (+ a relock test); vehicle batches 93/93.

## Part 5 plan, round 17 — Codex (draft 17, fresh session): REVISE, 1 finding
1. Round 16's dispatch permits simultaneous direct rigging of unaffiliated vehicle A and a network primary B.

### Claude's response (draft 18)
Taken: under R2 direct rigging of an unaffiliated vehicle is suspended while the character has a network primary
anywhere; jump/return invalidate their direct-vehicle chase reservations through the operator stamp.

## Part 5 plan, round 18 — Codex (draft 18, fresh session): APPROVED
"No material unresolved findings. Draft 18 covers the supplied rules and settled rulings, specifies recoverable control
and EW transitions, and identifies the caller changes needed to preserve existing vehicle behavior." Part 5 plan is
APPROVED after 18 rounds.

## Part 4b code, round 2 — Codex (fix-only, fresh session): REVISE, 6 findings
1. A blast missile's launch reads resolved as soon as the per-target resistance rows are posted (round released early).
2. A non-blast miss creates an unresolvable `rangedDamage` card (zero successes, no button) — the round hangs.
3. A retry after the test posted but before its damage card silently marks the launch struck with no damage.
4. Two same-user clients can both roll the same armed attempt (the in-flight guard is per client).
5. `missileLaunch` doesn't bind `sourceVehicleUuid` to the authorized platform (borrowed lock / guidance bonus).
6. Gunnery modes still fall back to the weapon skill when the character lacks Gunnery.

### Claude's response — all taken
1: a struck blast/spread is `resolved` only when its launcher has an outcome card and every resist row on it is done
(`resolvedRows` / a `resolvesRow` outcome); the round resumes on row outcomes too. 2: a ranged card whose test has no
successes is finalized by the closing stage (a "missed" card that `resolves` it and `closesTests` the test, so Karma
can't revive it later). 3: `missileDone` marks `struck` only when the damage card exists; otherwise the attempt stays
`rolling` and its runner's retry finishes the SAME attack from the posted test (`_rollWeaponAttack` `resumeTest`: no
spend, roll or recoil — only the dependent card). 4: `missileArm` takes a per-client runner id: the attempt's runner
retries freely, another client (same user too) is refused until the claim is 60 s stale; the Combat Pool is chosen
before arming so the claimed window is just the roll. 5: a player's `sourceVehicleUuid` must be the holder or a vehicle
the gunner controls; the lock snapshot is taken GM-side. 6: sensor/indirect/missile modes resolve Gunnery only (or
its Skill Web defaulting, p.69 — e.g. Firearms at +4 TN), never the weapon's skill or the name fallback.
Quench `sr2e.sensors` 28/28 (+5 tests), vehicle/combat batches 140/140; Vitest 1688.

## Part 4b code, round 3 — Codex (fix-only, fresh session): REVISE, 1 finding
1. The runner's own retry doesn't renew `runner.at`, so a retry after 60 s can be taken over mid-post (duplicate
   damage cards).

### Claude's response — taken
`missileArm` refreshes `runner.at` (in the holder queue) whenever the current runner reclaims its attempt.

## Part 4b code, round 4 — Codex (fix-only, fresh session): APPROVED
"No material findings. The fix awaits renewal of `runner.at` inside the holder queue before returning, so a competing
claim sees the refreshed timestamp." Part 4b is APPROVED; released as sr2e 0.154.0 from release/0.154.0.

## Part 6a code, round 1 — Codex (fresh session): REVISE, 17 findings
1. Subsystem damage doesn't reach equipment operability (transmitters, hasWorkingMod, Autonav dice).
2. A Deadly engine keeps powered movement after a passed Crash Test.
3. replaceEngine doesn't bump subsysGen.engine.
4. A passed Crash Test blocks a later automatic crash for the same event.
5. Subsystem consequences of crash damage open a crash on a crash.
6. An interrupted subsystemRoll loses its consequences.
7. Crash/impact/ram/spell damage commits carry no attack context.
8. A crashed or landed aircraft keeps coasting; landing applied before deceleration ends.
9. fuelAdvanceStage: Turn receipt saved before the speed/crash effects (lost on reload).
10. Drone mode changes discard unsettled movement; dialog travel/idle omit intervals.
11. The exhaustion Turn's movement differs on a retried closing.
12. Per-debit rounding to 0.001 L swallows idle consumption.
13. Stationary drones in a chase lose their idle debit.
14. adventureClose saves `closed` before the vehicle rows (not recoverable).
15. Refunds drop partially used Karma points.
16. Multi-month refunds restore credit to the wrong month.
17. Optempo Stress reversal ignores pending restorations; superseded before reversal; overhead counter untouched.

### Claude's response — all taken
1: operability is derived (`system.subsysItems`, `subsysControlBox`): `itemOperable` gates `hasWorkingMod` and every
transmitter (ratings reduced by Table 8 via `operableRating`); a damaged vehicle weapon takes +1/+3 TN (R6-1) or can't
fire; Autonav dice reduced. 2: a Deadly engine opens the coasting episode (`cause: "engine"`): 2 × Acceleration a Turn,
no powered actions, not ended by refuelling, ended by `replaceEngine`; the stages run under either option. 3:
`replaceEngine` bumps `subsysGen.engine` and retires its records (Quench now uses it). 4: a PASSED Crash Test (done, no
outcome) no longer blocks a later automatic crash for that origin — it gets its own `<fid>-auto` record, once; a failed
test now counts as crashed. 5: the subsystem follow-up carries its damage source; crash damage starts no further crash.
6: the roll stores its hits with record ids in the same update; `consequencesDone` marks the end; the GM pass replays
unfinished ones. 7: crash/impact (rams), collision, Body-0 destruction and combat-spell commits carry the attack
context. 8: p.82 read again — the emergency landing comes "at the end of its deceleration": a passed fuel Crash Test
records `fuelOut.landing`, the landing (6L, 1D6 Stress, no occupants) is delivered when the episode stops; a failed test
or any crash ends the coasting. 9: a coast Turn's effects (speed, Crash Test due, landing) are written with its receipt
(`fuelOut.pending`) and delivered from it, replayed on the next pass. 10: movement coverage (`movedTo`) is kept apart
from the mode cursor, so a mode change never swallows unbilled movement; the dialog refuses manual idle hours for an
operating drone and travel for a stationary one. 11: the burn that empties the tank uses the coasting share at once (as
a retry does). 12: the tank keeps full precision; only receipts and displays round. 13: a stationary drone in a chase
keeps its idle debit. 14: closing is a replayable transaction (`applied` after the rows; the GM finishes an unfinished
one on ready). 15: Karma points are indivisible — standing bills keep ceil(coverage ÷ 500) points, the rest come back.
16: credit is refunded and ledgered per month (`creditByMonth`). 17: a month with a restoration under way waits; the
reversal lands in the same update as the supersession through `stressPatch`; a superseded month can't be restored.
Quench `sr2e.r2-advanced` 13/13 (+3), vehicle/combat batches 128/128; Vitest 1690 (+2).


## Part 6a code, round 2 — Codex (fix-only, fresh session): REVISE, 6 findings
1. **Late fuel Crash Tests lose the emergency landing** — vehicle-damage.mjs:201. If deceleration finishes before the player resolves the test—including when the test becomes due on the final coast Turn—the episode is already `stopped`. Success records no landing, permanently skipping its 6L resistance and Stress.
   **Fix:** Record successful landing obligations for the matching stopped episode and deliver them immediately, using the existing landing receipt.

2. **Refuelling can revive a Deadly engine** — vehicle-fuel.mjs:30. When an already fuel-exhausted vehicle suffers Deadly engine damage, `engineOut` returns without recording the engine cause. Refuelling then deletes `fuelOut`, permitting powered actions despite the live Deadly engine record.
   **Fix:** Preserve engine failure on an existing episode and prevent refuelling from clearing that restriction.

3. **Crash damage suppresses engine failure itself** — vehicle-subsystems.mjs:134. Filtering Deadly engine hits out of `hits` prevents both the additional Crash Test and `engineOut`. A surviving vehicle whose crash destroys its engine can subsequently accelerate.
   **Fix:** Suppress only crash escalation for crash-origin damage; still apply the engine’s loss of power.

4. **Destroyed sensors reappear as working built-in sensors** — vehicle-sensors.mjs:97. With `sensorInstalled: true`, destroying the installed Sensors item makes `workingSensorItem` return null; the fallback then creates an operational `builtin-sensor`. Sensor operations remain available.
   **Fix:** Distinguish an absent Sensors item from an installed but disabled one before creating the built-in fallback.

5. **Destroyed APPS still protects occupants** — vehicle-damage.mjs:28. A Serious/Deadly APPS subsystem record does not affect `named`/`hasApps`; subsequent crash resistance still receives APPS protection. The operability fix therefore misses an actual equipment consumer.
   **Fix:** Require `itemOperable(i)` in the equipment lookup used by `hasApps` and `hasCrashCage`.

6. **Chase movement can also be billed as idle time** — vehicle-fuel.mjs:204. An idle-mode drone that moves in a chase receives a moving interval, but `sameMode` is false, leaving `fuelCursor.at` unchanged. Switching its mode afterward invokes `settleIdle`, charging idle fuel for the same seconds already billed by distance.
   **Fix:** Mark chase movement intervals as covered for idle accounting as well, while retaining the separate movement cursor for delayed movement submissions.

VERDICT: REVISE

### Claude's response — all taken
1: a fuel Crash Test passed after the episode already stopped (its fid matching the episode) records the landing with a
pending landing step in the same update and delivers it at once through `deliverCoastStep` (the same receipted
follow-up `fuel-<id>:landing`). 2: `engineOut` on a vehicle already out of fuel records `fuelOut.engineDead`; refuelling
never clears an episode with a dead engine; `replaceEngine` clears the marker (or the engine episode). 3: crash-origin
damage suppresses only the crash escalation — the dead engine's loss of power still applies. 4: an installed Sensors
item put out of action is never replaced by working stock sensors. 5: `hasApps` / `hasCrashCage` require an operable
item. 6: every billed interval advances the idle cursor (`at`); `movedTo` still tracks movement coverage separately.
Quench `sr2e.r2-advanced` 16/16 (+1).

## Part 6a code, round 3 — Codex (fix-only, fresh session): REVISE, 2 findings
1. **Replacing the engine after refuelling leaves powered actions blocked** — vehicle-play.mjs:754. Run out of fuel, suffer Deadly engine damage, refuel, then replace the engine. Replacement removes only `engineDead`, leaving `fuelOut` despite a working engine and positive fuel. Chase acceleration and ramming remain forbidden until another fuel operation clears it.
   **Fix:** When replacing an engine, also clear the fuel-origin episode if fuel is already positive.

2. **An overlapping coast delivery can erase the late landing obligation** — vehicle-damage.mjs:209, vehicle-fuel.mjs:390. The final coast delivery can hold an older `pending` step with `land: false` while awaiting its effects. A successful late Crash Test then replaces `pending` with `land: true`. The older delivery unconditionally deletes that replacement; if this happens before the newly invoked delivery reads it, neither the landing resistance nor Stress is delivered, and no pending obligation remains for recovery.
   **Fix:** Give pending steps unique versions and clear one inside the vehicle queue only if its episode and version still match the delivered step.

VERDICT: REVISE

### Claude's response — both taken
1: `replaceEngine` on a fuel episode with a dead engine removes the whole episode when the tank isn't empty (else just
the marker). 2: every pending coast step carries a version `v`; a delivery clears `pending` only when the live step still
has the version it delivered, in the vehicle queue — a late landing written meanwhile survives for its own delivery.
Quench `sr2e.r2-advanced` 16/16.

## Part 6a code, round 4 — Codex (fix-only, fresh session): APPROVED
"No material findings in the scoped fix. Engine replacement clears the refuelled dead-engine episode; versioned pending
steps prevent an older delivery from deleting a late landing." Part 6a is APPROVED; released as sr2e 0.155.0 from
release/0.155.0.

## Part 5a code, round 1 — Codex

Found material failures within 5.0/5a scope:

1. **[P1] GM operations authorize against the GM’s ownership.** [rc-net.mjs:168](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:168): `mayRun` accepts `deck.isOwner`, which is true on the executing GM client regardless of the requesting player. `rcDeleteDeck` repeats this mistake. A player can disconnect or delete another character’s deck, causing dump shock.
   **Fix:** Check ownership exclusively with `testUserPermission(user, "OWNER")`.

2. **[P1] Affiliation permits two conflicting controllers.** [rc-net.mjs:264](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:264): affiliation/hardwiring check `controlledVehicles` but omit chase drivers. Affiliate a vehicle already driven by an NPC in a chase: `controllerOf` returns the network operator while `actingActorOf` still returns the crew driver. Chase driver writes also omit `rc-control`, allowing concurrent assignment.
   **Fix:** Reject existing chase drivers and serialize driver assignment through `chase-membership → rc-control → chase:<id>`.

3. **[P1] Jumping into a drone leaves direct-vehicle chase rigging active.** [chase.mjs:90](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:90): the crew branch of `riggedOf` checks only `rigging` and VCR. A rigger driving vehicle A can jump into drone B and retain A’s chase rigging benefits. A’s reservations also lack the operator stamp because `netStamp` returns empty for crew entries.
   **Fix:** Use `riggedInto` for crew entries and stamp their driver’s network dependencies.

4. **[P1] Reconnecting a vehicle-mounted deck can create two primaries.** [rc-net.mjs:272](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:272): `rcConnect` changes the operator without clearing or validating `primary`. Connect a deck with A’s primary to B while B already has a primary elsewhere; both records retain primaries, and mode selection becomes index-order dependent.
   **Fix:** Clear the old primary on operator replacement and enforce the one-primary invariant during connection.

5. **[P2] The affiliation-turn sit-out rule is cosmetic.** [rc-net.mjs:266](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:266): `since` is recorded and displayed, but action paths never check it. A drone affiliated this round can immediately fire, drive, and perform chase actions.
   **Fix:** Enforce the affiliation-round restriction in a shared action-eligibility check used by all drone action paths.

6. **[P1] Out-of-range drones still accept commands.** [rc-net.mjs:306](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:306): neither order operation nor `rcJump` checks reachability. Move a drone out of range, then issue a group command: its standing order is still replaced. Chase commits trust the cached range flag, and changes to amplifier/Flux equipment do not trigger a sweep.
   **Fix:** Recheck live reachability under `rc-control` for commands, jumps, and chase commits, and refresh cached reachability when transmitter dependencies change.

7. **[P2] Equipment eligibility changes leave stale network control.** [rc-net.mjs:323](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:323): only the jack-in toggle invokes `rcEligibility`. Switching off the VCR leaves `primary` set, so other drones remain secondary and new jumps are refused; unequipping an RC deck leaves its connection active.
   **Fix:** Route VCR eligibility loss and deck availability changes through queued transitions that clear the primary or disconnect and bump revisions.

8. **[P2] Hardwired onboard driving becomes Pilot-only in chases.** [chase.mjs:97](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:97): `pilotOnly` includes every non-jumped network operator, including an onboard hardwired driver. A legal Pilot-0 hardwired vehicle therefore rolls zero Pilot dice instead of its driver’s skill.
   **Fix:** Distinguish onboard hardwired manual/datajack driving from remote captain/secondary operation when deriving chase dice.

9. **[P2] Non-robot drone weapons lose their combat-phase identity.** [item.mjs:585](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:585): firing now passes the drone as gunner, but `phaseKey` only searches combatants for that actor or a different weapon parent. Network drones normally have no combatant, so their key remains `free:…` across operator phases, carrying engagement/target penalties forward.
   **Fix:** Supply the operator’s phase identity for non-robot network drones while retaining the drone as dice source.

10. **[P2] Learning/IVIS pools are missing from eligible attacks and chase tests.** [vehicle-play.mjs:962](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-play.mjs:962): the pools are integrated only into standalone Driving Tests. An IVIS-group drone cannot spend its shared pool when firing; a robot cannot use Learning Pool on an attack or chase Driving Test.
    **Fix:** Add scoped Learning and shared IVIS allocation/spending to the eligible weapon and chase test paths.

11. **[P1] Learning Pool spending is not serialized across clients.** [learning-pool.mjs:39](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/learning-pool.mjs:39): `spendLearning` uses a client-local queue without enforcing `isPoolClient`. A GM and owner can simultaneously read three available dice, each spend three, and both roll them.
    **Fix:** Route spending through one authoritative queue or enforce and route to the designated pool client.

12. **[P2] Learning refresh excludes synthetic vehicles and crosses combats.** [learning-pool.mjs:84](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/learning-pool.mjs:84): refresh iterates only world actors, while every new round refreshes all of them regardless of combat membership. An unlinked robot without a persisted key gets a full pool on every test; advancing an unrelated combat refreshes another robot’s spent pool.
    **Fix:** Resolve world and synthetic participants and advance keys only for vehicles belonging to the qualifying combat.

13. **[P1] Command and IVIS results are unvalidated and replayable.** [rc-net.mjs:395](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:395): any test card is accepted as Comprehension, and `ivis.pool` is trusted without reading its purported IVIS test. A request can grant an arbitrary pool; replaying a valid group-order request replaces the group with fresh, unspent dice.
    **Fix:** Bind cards to reserved command inputs, derive the IVIS allocation from the verified result, and receipt each command once.

14. **[P2] Interrupted deck deletion requires another reload to apply dump shock.** [rig-dump.mjs:53](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rig-dump.mjs:53): when recovery finds the intended deck still present, it deletes it and immediately `continue`s. No subsequent reconcile is scheduled, leaving the dump pending without its effect or resistance card.
    **Fix:** After successful deletion, verify absence and continue opening that same event during the current reconciliation.

Inspected the listed commits, treating the repeated `0497a4e8` once. No files changed. Vitest could not execute under the read-only sandbox because it requires temporary files; Quench was inspected but not run.

VERDICT: REVISE

### Claude's response (commit 5b379268) — all 14 taken
1 requesting user's OWNER only. 2 affiliation/hardwire take chase-membership then rc-control and refuse a chase driver (chase
driver writes already refuse affiliated vehicles under chase-membership). 3 crew entries use riggedInto; their stamp carries
the driver's operator decks. 4 rcConnect clears the primary on a new operator or a primary elsewhere. 5 sitsOut(vehicle,
combat) on chase DP/actions, the drone Driving Test and network gunnery. 6 live reachable() in rcOrder/rcGroupOrder/rcJump;
rcValidate re-sweeps when the holder or its items change. 7 rcValidate clears the primary when the operator loses an active
VCR and disconnects an uninstalled implanted deck — a carried gear deck's `equipped` (default false) is not treated as
availability. 8 pilotOnly excludes the operator aboard a hardwired vehicle. 9 phaseKey maps a non-robot network drone to
its operator. 10 askDronePools on drone attacks and chase rolls. 11 learningSpend GM op. 12 refresh only vehicles of that
combat (combatant actors incl. tokens, operators' affiliated drones). 13 cards bound to deck + drones, IVIS Pool derived
from the IVIS card less ivisToTest, usedCards ledger. 14 reconcile re-checks absence after the retried deletion.

## Part 5a code, round 2 — Codex (fix-only; gpt-6-sol, medium)

1. **[P1] Deck deletion still has the ownership hole.** [rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:399) checks `deck.isOwner` on the executing GM client. A player who calls `rcDeleteDeck` with another character’s deck UUID can delete it and trigger dump shock. **Fix:** authorize with the requesting user’s `testUserPermission(user, "OWNER")`, as `load` now does.

2. **[P1] IVIS cards can still grant an unearned pool.** [rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:463) verifies the IVIS card’s actor and deck flag, but not that it was rolled with the required dice at TN 5 or that `ivisToTest` matches dice added to Comprehension. An operator can submit a high-dice, low-TN test tagged `rcIvis` and receive its successes as IVIS Pool. **Fix:** reserve and validate the IVIS test parameters and allocation in GM-owned state before accepting either card.

3. **[P2] Scoped Learning Pool spends on chase rolls cannot be vetoed.** `askDronePools` returns a `learningSpend` card flag, but [chase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:1080) and [chase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:1115) omit it from the Driver Points and action cards. A drone can declare an out-of-scope chase test, spend Learning dice, and leave the GM no veto button. **Fix:** attach the returned `learningSpend` flag to both chase roll cards.

VERDICT: REVISE

### Claude's response (commit 11e1a3d2) — all 3 taken
1 rcDeleteDeck now authorizes the requesting user (round 1's #1 fix missed this op). 2 taken although "IVIS dice entered
on the dialog" was settled: the dialog stays, but the GM op now refuses an IVIS card below TN 5, over the operator's
Vehicle Tactics dice (or the Tactics Concentration / Military Theory defaulted to, SRComp p.48), or with misc dice, and a
Comprehension card over Pilot + NMP (≤ Pilot) + the declared IVIS successes. No reservation record: the cards are the
record, and both checks run on the GM in rc-control. 3 both chase cards carry the learningSpend flag. Quench 46/46.

## Part 5a code, round 3 — Codex (fix-only; gpt-6-sol, medium)

- **[P1] IVIS defaulting can still produce an unearned pool.** [rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:277) takes the highest of Vehicle Tactics and its default skills, but the card check accepts TN 5 for all of them. An operator with Military Theory 6 and no Vehicle Tactics can roll six dice at TN 5 and turn the successes into IVIS Pool, even though defaulting raises the TN. **Fix:** Validate the card’s dice count and TN together against a legal Vehicle Tactics or Skill Web default path.

- **[P2] The chase veto arrives after the result is committed.** [chase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:1082) resolves Driver Points immediately after posting the flagged card; an action card can likewise be applied before the GM vetoes it. [learning-pool.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/learning-pool.mjs:51) then voids the spend but leaves the rolled chase result intact. A drone can therefore gain Driver Points from dice the GM has ruled out of scope. **Fix:** Settle scoped Learning dice before chase resolution, or recompute the result without vetoed dice before committing it.

VERDICT: REVISE

### Claude's response (commit a91210c1) — both taken
1 Read SRComp p.48 from the render: a Specialization is half a dot (+1) from its Concentration, a Concentration one dot
(+2) from its general skill. R2 p.66 applies Skill Web modifiers to a default, so the legal IVIS paths are Vehicle
Tactics TN 5, Tactics Concentration TN 6, Military Theory TN 8 (ruling: R2's explicit instruction over p.48's "no
modifier for your own general skill"). The dialog offers those paths (no free dice entry); the op checks dice and TN
together. 2 Rather than deferring chase resolution for a veto, a scoped Learning Pool isn't offered on a non-GM chase
roll (a notice says to ask the GM to roll it); the GM's own declaration needs no veto. Non-chase tests keep the
declare-then-veto flow (they don't auto-resolve). Quench 46/46.

## Part 5a code, round 4 — Codex (fix-only; gpt-6-sol, medium)

- **[P1] IVIS validation can mistake another TN modifier for the Skill Web default.** [ivisCardLegal](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:295) checks the card’s *effective* TN. For example, an operator with only Military Theory 6 and a +3 wound modifier can roll six dice at base TN 5; the recorded TN is 8, so the GM accepts it, though the defaulted roll should be TN 11. **Fix:** Record the IVIS path and base TN on the card, then validate the path’s dice and default modifier separately from other TN modifiers.

The non-GM chase callers withhold scoped Learning dice as intended.

VERDICT: REVISE

### Claude's response (commit 4def5f29) — taken
Every success-test card records `baseTn` (the passed target number, before wound/sustain/drug/etc. modifiers); ivisCardLegal
checks the path's TN against it and refuses a card without one. Quench asserts base 5 + wound 3 is refused.

## Part 5a code, round 5 — Codex (fix-only; gpt-6-sol, medium): APPROVED

No material issues found in commit 4def5f29. IVIS validation now checks the card’s base TN, so a wound modifier cannot satisfy the Skill Web default TN.

VERDICT: APPROVED

## Part 5b-1 code, round 1 — Codex (commits ac462ed7 deb1de0b b5d73c97 43ef4fed; gpt-6-sol, high): REVISE, 7 findings

The review found material failures in the listed commits:

1. **An already full channel can be stolen with zero applied boxes.** In [settleMiji](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:358), `full` remains true when a later attacker applies zero boxes; a meaconing or intrusion result then overwrites the first intruder’s authority. **Fix:** grant authority only when this exchange adds boxes and takes the channel from below 10 to 10.

2. **Disconnecting and reconnecting restores captured authority.** [channelAuthority](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:74) checks the intruder’s current connection and operator, but no connection generation. [rcDisconnect](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:383) leaves the authority record in place, so reconnecting the same operator revives it. **Fix:** stamp the intruder connection generation and clear or reject authority after an exit.

3. **Open EW actions can settle against changed state.** [ewMijiStart](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:225) records `freqGen` but no target revision or participant generations; [settleMiji](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:353) checks only `freqGen`. For example, the defender can regenerate or change operators while an exchange is open, and the old attack still applies. A decryption card rolled before a frequency switch can likewise be accepted at the new generation by [ewDecrypt](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:160). **Fix:** record the plan’s action stamps at reservation and reject mismatches at commit.

4. **Captured commands bypass existing command rules.** [ewCommand](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:270) accepts an affiliated drone without the reachability and primary checks used by [rcOrder](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:409); its [client roll](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/deck-panel.mjs:247) also omits the secondary-command and command-jamming TN modifiers. A captured command can therefore succeed out of range or at too low a TN. **Fix:** apply the same live command eligibility and TN rules, and validate the card and dependency stamps at commit.

5. **The captured system channel does not provide the specified data.** The free [ewRead path](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:209) reports damage only; position, heading, and ammunition for a chosen drone are absent. The system-channel indirect-fire effect also has no consumer because Part 4b passes no deck, as scoped in the request. **Fix:** implement the per-drone system-data read; leave indirect-fire routing for its later integration.

6. **EW penalties leak into the core ruleset.** [riggerSimsenseMod](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:103) reads persisted network monitors without an `isRigger2()` guard, and [testTnModifiers](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:444) applies it to ordinary tests. Switching a world with an active jammed network to core rules leaves the penalty active. **Fix:** gate EW-derived modifiers on Rigger 2 mode.

7. **Named interception channels are not bound to the roll.** The [client](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/deck-panel.mjs:184) asks for names before rolling, but the card contains only `kind`; [ewIntercept](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:175) trusts names supplied after the result is known. A requester can use a one-success card to select whichever channel they now prefer. **Fix:** store the named channels on the roll card and verify them in the GM operation.

VERDICT: REVISE

### Claude's response (commit f532a480) — 6 taken, 1 in part
1 Verified: authority (and the carrier loss / dump) now only when THIS exchange adds boxes and takes the channel from
below 10 to 10. Quench: a later zero-box intrusion leaves the first filler's authority.
2 Verified (rcDisconnect left the record): the authority stores the intruder's connection generation at the fill and
`channelAuthority` refuses a different one. Quench: disconnect + reconnect → the owner holds it.
3 Taken in part. Every EW card now carries what it was rolled for (`flags.sr2e.ew`: decrypt/intercept = target +
freqGen; MIJI = aid + side) and `checkCard` refuses a mismatch. A MIJI exchange stores a dependency stamp at start
(both operators, both connection generations, freqGen, alert — the TN inputs) and voids on any change, at either roll
and at settlement. NOT taken: voiding on the target's `rev` / on a regeneration — every network write bumps `rev`
(the owner's own orders would void every attack), and a regeneration doesn't change the exchange's TNs or dice; the
result is applied, capped, to the channel as it is at settlement, which is what the opposed test decides.
4 Verified: ewCommand now refuses the owner's primary and an unreachable drone (as rcOrder), the card carries the hold
(`authEvent`) and freqGen it was rolled under, and its base TN must be at least the lowest table TN + the live
secondary-command (+2 when the intruder is jumped in, derived at commit) and command-jamming modifiers
(`commandTest`, shared with the client). Quench: a card from an earlier hold is refused.
5 Taken: reading the system channel names ONE drone and reports its position, heading, ammunition and damage.
Indirect fire stays unrouted (out of scope, as the request said).
6 Taken: `riggerSimsenseMod` and `netTestMod` return 0 outside Rigger 2 (droneTestMod already was: networkOf is null).
7 Taken: the named channels are recorded on the interception card and the op reads them from it; a `named` argument
is ignored. Quench asserts the card's names win.
Quench r2-advanced + vehicle-chase 48/48.

## Part 5b-1 code, round 2 — Codex (fix-only, commit f532a480; gpt-6-sol, medium; 383K input): REVISE, 3 findings

1. **Legacy MIJI exchanges bypass the new dependency check.** [stampOk](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:363) accepts an open exchange with no `stamp`. If an operator disconnects before that exchange settles, it can still apply boxes; if it fills a channel, the new authority gets `connGen: 0` and cannot be used. **Fix:** void unstamped open exchanges and require a valid stamp before granting authority.

2. **Existing authority records lose access immediately after the update.** [channelAuthority](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:81) treats a missing `connGen` as zero. A previously captured channel therefore has a lost carrier but no usable intruder authority, even when the intruder never exited. **Fix:** migrate legacy authority records with a verified connection generation, or explicitly retire them and resolve the carrier state.

3. **Captured command cards can settle out of order.** The client records only `authEvent` and `freqGen` on the card [here](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/deck-panel.mjs:263), and [ewCommand](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:294) checks only those stamps. Two commands rolled under the same hold can be committed in reverse order, letting the older result overwrite the newer standing order despite the target `rev` changing. **Fix:** record and validate the plan’s target and intruder revision, connection, and operator stamps at commit.

VERDICT: REVISE

### Claude's response (commit cf09fec7) — all 3 taken
1–2 No released world can hold such records (5b-1 is unreleased), but the strict form is simpler: an exchange
without a stamp is void, an authority without `connGen` is not authority.
3 Verified: the captured-command card also records the drone's current order revision (`orderRev`), and the
commit refuses it once the drone's order has changed. Quench: an older card after a newer order is refused.
Quench r2-advanced + vehicle-chase 48/48.

## Part 5b-1 code, round 3 — Codex (fix-only, round 2 fix; gpt-6-sol, medium; 211K input): REVISE, 2 findings

1. **Captured command cards still lack the required dependency stamps.** [ewCommand](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:297) checks the drone’s order revision, but not the target and intruder deck revisions. A card rolled for a TN 8 command before the intruder jumps into a drone can settle afterward: the live check requires only the table’s lowest TN plus the new +2, so the card passes even though that command now requires TN 10. **Fix:** stamp both deck revisions and the intruder’s operator and connection generation on the card, then reject any mismatch at commit.

2. **A legacy authority record still strands a lost channel.** [channelAuthority](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:81) now rejects a record without `connGen`, but leaves its lost carrier in place. On a saved world with that record, the intruder loses access immediately and the owner remains shut out until they can regenerate and reconnect. **Fix:** migrate a verified generation or retire the record and resolve its carrier state in the same queued update.

The strict MIJI stamp check closes round 2’s unstamped-exchange case. The new Quench assertion covers an intervening order, but not the deck-state change above.

VERDICT: REVISE

### Claude's response (commit 5b727c39) — #1 taken, #2 rejected
1 Verified (the commit compared against the LOWEST table TN): the card now records the table TN it was rolled at, and
the commit requires that TN + the live modifiers (the +2 for a jumped-in intruder and command jamming, derived now).
The other stamps asked for are already enforced: the intruder's operator and connection generation by
`channelAuthority` at commit, the target's freqGen and hold by the card binding, the drone's order by `orderRev`; a
whole-deck `rev` stays out (round 1 #3: every network write bumps it). Quench: a card short of its own table TN refused.
2 REJECTED as moot: no authority record without `connGen` exists anywhere — 5b-1 has never been released, and the
only world that ran it (the dev world) holds none. A migration for a record format that never shipped is dead code.
Quench r2-advanced + vehicle-chase 48/48.

## Part 5b-1 code, round 4 — Codex (fix-only, round 3 fix; gpt-6-sol, medium; 183K input): APPROVED

No material problems found in commit 5b727c39. The captured-command check now uses the card’s table TN with live modifiers, and the new Quench assertion exercises that check. I inspected the test but could not run Quench in this read-only environment.

VERDICT: APPROVED

## Part 5b.4 code, round 1 — Codex (commit 09f42b38; gpt-6-sol, high; 723K input): REVISE, 4 findings

1. **A takeover can be undone by the loser.** After the contest ends, the original owner of a character-held deck still passes `mayRun` and can call `rcConnect` to replace the winner immediately, without another contest ([rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:185), [rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:385)). **Fix:** Restrict control changes on a taken network to its current operator or the GM until a rules-defined recapture occurs.

2. **A crash can strand dump shock in `pending`.** If execution stops after `pendDump` writes the event but before its state becomes `open`, `recover()` treats the event’s mere existence as completion; `reconcileDumps()` skips pending contest events ([ew-contest.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew-contest.mjs:103), [rig-dump.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rig-dump.mjs:50)). The jumped-in loser never receives the dump. **Fix:** Recover dump publication by its state, reopening an existing pending event and reconciling it.

3. **Simultaneous contests produce stale control reads and stale deck state.** If deck A is in contests A–B and A–C, taking A–B also voids A–C. Both steps compute absolute `contests` arrays and snapshots from A’s pre-takeover deck; the later void step can briefly expose A’s old operator through `view()` and can leave the ended A–B ID on the deck after all receipts are applied ([ew-contest.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew-contest.mjs:48), [ew-contest.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew-contest.mjs:147)). **Fix:** Build same-deck steps from the preceding journal step’s resulting state, so each snapshot and absolute update includes earlier effects.

4. **Automatic disconnection bypasses contest exits.** Uninstalling a connected cyberware deck makes `rcValidate()` disconnect it directly, without `onControlChange`; its live contests remain open and the opponent does not take the exiting network ([rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:264)). **Fix:** Route this disconnection through the contest exit hook before saving it.

The sole Quench case covers a completed takeover and ordinary disconnect, but none of these failure paths ([sr2e-quench.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:19713)). Add cases for pending-dump recovery, overlapping contests, automatic exit, and attempted reclamation by the loser.

VERDICT: REVISE

### Claude's response (commit 915cb0c5) — all 4 taken (#4 as void)
1 A takeover writes `rcNet.takenBy`; `mayRun` (now shared by rc-net and the EW ops) lets only the GM or the taker's
owner run a taken network, so its old owner can't reconnect it; the taker's disconnect clears it (the network is its
owner's again). No recapture rule is printed beyond fighting it back with another contest.
2 Contest dumps resume by STATE: missing → recorded; pending → opened; then reconciled. recover() treats a pending dump
as unfinished.
3 One journal write keeps a per-deck working state, so a second step on the same deck starts from the first one's
result; steps carry a global `seq` and apply and read (view) in journal order across contests.
4 An uninstalled implanted deck's contests are VOID (journalled before rcValidate disconnects it), not a takeover: an
uninstalled implant can't run for anyone, so there is no network to hand over.
Quench: + pending-dump recovery, loser can't reclaim (when a player user exists), overlapping contests ending cleanly,
implant uninstall voiding. Batches 93/93.

## Part 5b.4 code, round 2 — Codex (fix-only, 915cb0c5; gpt-6-sol, medium; 214K input): REVISE, 2 findings

1. **An uninstalled captured implant stays locked to its taker.** After a takeover, `rcValidate()` disconnects an uninstalled implant but leaves `takenBy` intact ([rc-net.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:271)). If its owner reinstalls it, `mayRun` still rejects them, while the taker cannot connect a deck held by someone else. Only a GM can restore it. **Fix:** Clear `takenBy` when `rcValidate()` disconnects the implant.

2. **An interrupted open dump is skipped by recovery.** If `reconcileDumps()` fails after the contest changes a dump from `pending` to `open` but before creating its effect or card, the next `recover()` excludes it because `dumpUnfinished()` accepts only missing or pending events ([ew-contest.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew-contest.mjs:93)). The dump remains incomplete for the active session. **Fix:** Treat an `open` dump with incomplete receipted effects as recoverable and run `reconcileDumps()` again.

VERDICT: REVISE

### Claude's response (commit 1873b951) — both taken
1 rcValidate's implant disconnect clears takenBy. 2 dumpUnfinished also counts an OPEN dump without its effect and card;
Quench removes the card and recovery posts it. Batches 93/93.

## Part 5b.4 code, round 3 — Codex (fix-only; gpt-6-sol, medium; 191K input): APPROVED

The uninstall path clears `takenBy` before saving the deck, and the revised recovery check retries an open dump when either its effect or card receipt is missing. I found no material regression in the round 2 fix.

VERDICT: APPROVED

## Part 5c code, round 1 — Codex (commit 8fbbdf23; gpt-6-sol, high; 1.70M input): REVISE, 7 findings

- **Takeoff and landing TN:** [rollDrivingTest](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-play.mjs:959) retains Vehicle Empathy’s −1 after replacing Handling with the flight base TN. A pilot in physical contact lands at TN 3 instead of 4 before other modifiers. **Fix:** Exclude Empathy from flight tests; keep applicable Driving Test modifiers such as VCR.

- **Arm attack authority:** [the melee branch](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:919) verifies the controller actor but neither the acting user nor the weapon. A player who can see another controller’s actor can invoke its attack, and a controller can pass `vehicleArm` to a Strength based melee weapon other than Unarmed Strike. **Fix:** Before rolling, require GM or controller ownership and require that actor’s Unarmed Strike.

- **Unavailable arms remain usable:** [effective.arms](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:2226) reads all matching items, ignoring removal receipts and subsystem damage. An arm marked removed but awaiting deletion, or hit at Serious, can still attack at full Strength. **Fix:** Derive arms from live installed items and apply subsystem operability and rating reductions.

- **Uninstalled legs block a chase:** [hasLegs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-ops-rules.mjs:87) accepts any Mechanical Legs item. Merely buying one in the `parts` state makes [addEntry](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:727) refuse the vehicle. **Fix:** Count only installed, live Mechanical Legs mods.

- **Safe loads receive a failure roll:** [rollPull](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-ops.mjs:39) rolls Body against TN 3 even at or below Load. A 900 kg load on a 1,000 kg vehicle can be declared immovable, despite Part 5c requiring no test. **Fix:** Return a safe-load result before rolling or buying Stress dice.

- **Drone arm tests omit drone bonuses:** [armHands and the arm rolls](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-ops.mjs:80) use bare Pilot. A robot with Pilot 3 and Threat 3 rolls only three dice, and its Learning or IVIS Pool is unavailable. They also let an unattended non-drone vehicle use Pilot. **Fix:** Restrict autonomous arm use to drones and use the established drone test context and pool flow.

- **Rail vehicles can steer in a chase:** The rail checkbox adds help text, but [chase begin](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:261) still accepts position, hide, and ram actions for a flagged train. **Fix:** Hide those actions and reject them in the GM action operation, leaving speed changes available.

The new unit and Quench tests do not cover these failure cases.

VERDICT: REVISE

### Claude's response (commit b1109b98) — all 7 taken
1 Empathy (a Handling modifier) is dropped when the base TN replaces Handling; VCR and the rest stay.
2 An arm attack needs the controller's own Unarmed Strike, rolled by its owner or the GM.
3 effective.arms counts only installed, working arm mods (state "", done, factory); Serious/Deadly subsystem damage
removes it; Light/Moderate reduce its Strength as a device rating (Table 8, reducedBonus).
4 hasLegs counts only installed, working Mechanical Legs (shared liveMod).
5 Within the Load Rating no test is rolled unless the GM's conditions make one (the table's ≤ 1 × Load row).
6 Only a DRONE works an arm on its own: Pilot + a robot's Threat, the Learning / IVIS Pools as its Driving Test offers,
and its network's meaconing modifier.
7 A rail vehicle's chase panel hides Position / Stop at / Hide / its Ram buttons, and chaseBegin refuses those kinds.
Also found in testing (Rigger 2 module, aeb790e): factory and catalog Mechanical Arms had rating 1 — a phantom bought-up
Strength point; now 0 with the rule flag.
Unit + Quench cases for 4, 5, 2, 6, 7. Batches 94/94.

## Part 5c code, round 2 — Codex (fix-only; gpt-6-sol, medium; 401K input): REVISE, 2 findings

- [Arm Strength under damage](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:2230): A Body 3 arm with rating 2 has Strength 11; Moderate damage reduces it to 5, halving the vehicle’s Body-based Strength as well as the arm’s bought-up bonus. A rating 0 arm also misses the Table 8 TN penalty for damage when there is no bonus to reduce. **Fix:** Apply damage to the enhancement bonus only, and apply the no-bonus TN penalty to tests using the arm.

- [Rail restriction in group actions](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:273): The check examines only the acting entry. If a faster non-rail vehicle represents a group containing a train, its Position or Hide action still applies to the train through `members`. **Fix:** Reject those actions when any affected group member is rail flagged, or exclude rail members from their effects.

VERDICT: REVISE

### Claude's response (commit 9613a14e) — both taken
1 Damage reduces the bought-up Strength only (Body² + reducedBonus(rating)); an arm with rating 0 takes NO_BONUS_TN (+1 L / +3 M)
on the Arm Test, arm skill and arm melee (via the arm's tnMod). 2 chaseBegin refuses position / hide / ram when any group
member is a rail vehicle. Batches 94/94.
