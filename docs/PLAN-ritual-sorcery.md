# Plan: Ritual sorcery (SR2E p.134–136)
_Round 0 — initial draft by Claude_

## Goal (text verified; tables to be re-read on the render before coding)
A ritual team pools Magic Pools, sends a spell to a target out of sight via a
material link:
A. **Prepare** — team members (in a lodge/circle) combine Magic Pools into the
   **Ritual Magic Pool**; the leader declares Force; members drop sustained spells.
B. **Material link** (skipped if the target is in sight / astrally observed) —
   Force hours; leader rolls Ritual Pool dice vs the Material Link Table TN
   (city 5 / state 7 / continent 9 / unknown 11) + modifiers (spirit +2, mana
   barrier +rating, circle/lodge +rating, stale tissue +4); 1 success links, time
   = Force hours ÷ successes; 0 = abort → everyone resists Drain.
C. **Sending** — Sending Table TN (place 6, (meta)human 6, object 8, spirit 8),
   +2 fast-moving target, −1 area spell; time = Force ÷ successes hours (min 1);
   0 = abort → Drain.
D. **Effect** — a normal Spell Success Test with Ritual Pool dice; no circle/
   lodge/barrier/cover/visibility modifiers, only the leader's Injury and totem
   modifiers; resistance TN = max(Force, leader's Ritual Sorcery skill); allies
   may allocate Spell Defense if aware.
E. **Drain** — every member resists Drain as if casting alone; leftover Ritual
   Pool dice split by the leader. Happens even on abort.
Sustaining: leftover dice → hours = leader Magic × dice; or an elemental (days =
Force); or members stay locked in (+2 sustain).

## Approach
1. A **Ritual** chat card (flag-backed state machine: prepare → link → send →
   effect → drain → done/aborted) owned by the leader. Members "Join" from their
   own clients (committing their current Magic Pool dice, which are deducted
   from them — their own actor), the leader advances steps.
2. Each step's test uses the pooled dice with the table TN (pure functions
   `materialLinkTN`, `sendingTN`, `ritualResistTN`), records successes and the
   elapsed hours (advancing `game.time` optional, GM-confirmed).
3. The effect step reuses `_rollSpellcast` in a `ritual` mode (dice source =
   ritual pool, modifier suppression, resistance TN override).
4. Drain: each member gets a "Resist Drain" button on the card (their client),
   with their share of leftover dice assigned by the leader.
5. Tests: pure TN tables; Quench end-to-end with two members incl. an abort path.

## Risks
Large (multi-actor, multi-client, long-running state). Ship behind the card; no
background timers.

## Out of scope
Ritual sustaining by elemental (existing Spell Sustaining service covers it
manually); astral guidance of the sending.
