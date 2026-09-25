# Plan: Ignite, Poltergeist and Ice Sheet effects (SR2E p.157–158)
_Round 0 — initial draft by Claude_

## Goal (text verified; numbers to be re-checked on the render before coding)
- **Ignite** (instant): must beat the target's Body (living) or base Barrier
  Rating (objects) in successes. Time to ignite = 10 turns ÷ successes. Once
  burning: (F)M damage the first turn, **Power +1 per Combat Turn**; at the end of
  each turn a Damage Resistance Test with ½ Impact armour; burns out in **1D6
  Combat Turns** unless extinguished; carried ammo/explosives may go off (GM).
- **Poltergeist** (area, sustained): +2 visibility modifier inside the area;
  Stun damage, **Light**, resisted with **Quickness** (not Body) vs TN = Force,
  Impact armour counts.
- **Ice Sheet** (area): covers Magic × successes m²; anyone crossing makes a
  Quickness Test vs TN 3 or falls prone; vehicles a Handling Test or a Crash Test;
  melts 1 m² per minute.

## Approach
1. **Ignite** — on a successful cast with successes > Body/Barrier, a
   `burning` status (Active Effect) on the target, flagged `{ power: F,
   startRound, igniteAt, burnoutAt (1D6 rolled at ignition) }`. `SR2ECombat`
   `nextRound` (the elemental-clock boundary hook) posts a per-burning-actor card:
   "Burns: resist (F+n)M, ½ Impact" with a resist button (net staging off — this
   is not an attack roll; stage down per 2 as a plain damage resistance), and
   removes the status at burnout. An "Extinguish" button on the card clears it.
2. **Poltergeist** — the area template (area-spell code) carries
   `flags.sr2e.visibility = 2` (the smoke mechanism already auto-applies
   visibility to attacks into/through a flagged template) and posts per-target
   Stun L resist cards resisted with Quickness vs Force, Impact armour. Dropping
   the sustain removes the template.
3. **Ice Sheet** — a square template sized √(Magic × successes) m, flagged
   `iceSheet`; the movement hook (`module/movement.mjs`) offers a Quickness
   (TN 3) test when a token's path crosses it, applying prone on failure.
   Melting: the GM clears it (1 m²/min is noted on the card).
4. **Tests**: Quench per effect (burn ticks & burnout; poltergeist visibility +
   Quickness resist; ice sheet crossing prompt).

## Risks / open questions
- Needs the render re-read for exact numbers before coding (text layer).
- Combat-turn ticking shares the `nextRound` boundary with elemental Force
  charging — same idempotency (`boundarySeq`) should guard burn ticks.

## Out of scope
Ammo cook-off automation; vehicle Handling/Crash on ice (card note only).
