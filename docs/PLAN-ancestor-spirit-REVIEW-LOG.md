# Plan Review Log: ancestor spirit
Started 2026-10-29. MAX_ROUNDS=5. User ruling: attack dice = Force.

## Round 1 — Codex (thread 01a18821-ccda-7f63-8f15-0c7512015898): REVISE, 6
1 setup too late (world docs prepared before setup); 2 inheritance must cover all Spirits-of-Man totems, no stacking; 3 sheet tooltip hard-coded; 4 manifestation workflow; 5 reference page says not summonable; 6 tests bypass consumers.
### Claude's response
All accepted: init registration (totems too); inherits = highest group-member bonus; shared spiritAttackSummary for tooltip and roll; reference page rewritten incl. manifestation; end-to-end module Quench + timing marker.

## Round 2 — Codex: REVISE, 2 (tests)
Startup needs a real reload check; water cannot tell Force from Strength power.
### Claude's response
Accepted: scripted reload check of an already-prepared saved ancestor; earth (Strength 8) Power 4 and reduced effective Force regression.

## Code review 1 — Codex: REVISE, 7
1 portraits missing; 2 module min version; 3 cleanup deleted by snapshot; 4 placement prompt; 5 powers/binding/startFight; 6 base-power, displayed damage, astral; 7 journal qualifier.
### Claude's response
All fixed: 3 portraits shipped + HEAD-checked in the test; min 0.123.0; cleanup only own docs (messages by made actors, spirits by conjurerUuid); placement off+restored; independent PRINTED list, boundSpirits, services 6, startFight; base-power + card text + astral Power stays Force; qualifier removed. Live: 10/10 across the three batches; reload check passed (B6 Q4 S5 R4, ancestor profile).
