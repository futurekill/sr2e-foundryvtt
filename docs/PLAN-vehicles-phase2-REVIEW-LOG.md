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
