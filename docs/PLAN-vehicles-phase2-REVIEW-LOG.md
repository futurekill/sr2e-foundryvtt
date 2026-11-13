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
