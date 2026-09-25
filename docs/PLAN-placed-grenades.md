# Plan: Grenades and rockets aimed at a point, not a token (SR2E p.96–97)
_Round 0 — initial draft by Claude_

## Goal
p.96: "To determine the grenade's final location, first choose the intended
target" — a location, not necessarily a character. Today an area weapon needs a
**targeted token** as ground zero (`resolveBlast` warns "Target a token"), so you
can't lob a grenade at a doorway, behind cover, or into a room with no token in
it. Area spells already solved the same problem with a map click
(`promptForCanvasPoint`, `resolveAreaCentre`).

## Approach
1. **Attack dialog, blast weapons only**: an "Aim at" choice — *targeted token*
   (default when one is targeted) or *a point on the map* (default otherwise).
   Choosing a point runs `promptForCanvasPoint` **after** the dialog confirms,
   and before `item.roll`, so a cancelled click spends nothing (the area-spell
   pattern). The point is passed as `options.blastPoint = { x, y, sceneId }`.
2. **Range**: for a point, the distance thrower → point (grid-measured, whole
   metres) picks the Grenade Range Table bracket (`thrownRange` / the launcher
   brackets) instead of the dialog's range select, exactly as a targeted token
   does today if it does. Grenade-launcher minimum range (p.97, 5 m arming)
   applies as it does now, if implemented; otherwise out of scope.
3. **Launcher card**: carries `data-center-x/y/scene` when aimed at a point
   (`data-center-token-uuid` otherwise). `resolveBlast` takes either; scatter
   (Scatter Diagram, relative to thrower → point) and the template are placed
   from that centre. A launcher whose scene is not the viewed scene refuses with
   a message rather than dropping the template on the wrong map.
4. **Macro path**: `item.roll({ blastPoint })` works without a dialog; with neither
   a point nor a target, the card still posts and the GM is told to place it
   (as area spells do).
5. **Tests**: Quench — a grenade aimed at an empty point drops its template at
   that point (0 scatter with enough successes); the range bracket comes from
   the measured distance; a cancelled map click spends no grenade; a point on
   another scene is refused at resolve time.

## Key decisions & tradeoffs
- Reuse the area-spell placement code path instead of a second picker.
- The click happens after the dialog, before the roll — a mis-click can be
  cancelled with nothing spent.

## Out of scope
Blast against barriers and confined-space channelling (p.97) — still refused.
