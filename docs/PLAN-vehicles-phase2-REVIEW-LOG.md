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
