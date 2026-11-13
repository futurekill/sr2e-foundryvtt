# Plan: NPC Essence above 6 (critters)
_Round 1 — revised after Codex round 1, 2026-10-29_

## Goal
Let an NPC (critter) carry the Essence its stat block prints: vampires and other HMHVV templates
print **2D6** (2–12), shapeshifters **(8)**, Paranormal Animals' Nosferatu **7**. Today
`NPCData.essence.value/max` are `NumberField({min: 0, max: 6})`. Observed live (2026-10-29):
(Foundry 13.351, GM client) `new Actor.implementation(source)` on the Nosferatu's stored source
(Essence 7) gives an actor with **Essence 6**: `NumberField` cleaning CLAMPS a value to the field's
bounds before validation, on every construction path (strict included), so nothing is rejected and
nothing is reported — the stat block is silently rewritten (−1 becomes 0 the same way). Only a direct
`validate({changes})`, which skips cleaning, rejects an out-of-range value. Either way the stat block can't be used.
That is a live bug today, not only a prerequisite for Cyberpirates (docs/NEEDS-SYSTEM.md there lists
7 critters waiting on it).

## Approach
1. `module/data/actor-data.mjs` NPCData: `essence.value` and `essence.max` lose `max: 6` (keep
   `min: 0`). No upper bound in the schema: Essence Drain adds the drained points to the being's
   own rating "to a maximum of twice the maximum for its type" — 12 for humanoids (core p.217) —
   so the cap depends on the creature's type, which the schema doesn't know; Paranormal Animals'
   Nosferatu drains "without limit" (PAE p.75). The per-type cap is the GM's (the critter's
   biography can state it); a schema number would be wrong for some creature.
2. NPC sheet (`templates/actor/npc-sheet.hbs`): Essence becomes an editable number input on
   `system.essence.value` (min 0, `step="any"` — stat blocks carry fractions) ALWAYS, replacing the
   span. Today's truthiness branch on `manualSigned` would hide the operative value (healing, ritual,
   substances, companion all read `value`), so a non-null `manualSigned` is shown separately beside
   it, labelled "signed (manual)". `max` stays as authored (NPC derivation never clamps value to
   max; NPC sheets don't render the "x / max" gear readout).
   **Save guard** (`actor-sheet.mjs` change wiring): the generic listener turns a blank number into 0
   (`parseFloat(v) || 0`) and calls `update` unchecked. For `system.essence.value` a blank or
   non-finite entry re-renders without saving, and a rejected update (negative) warns and re-renders.
   Scoped to this field — other fields keep today's behaviour.
3. No migration: the change only widens a bound. Compendium documents keep their stored source (the
   Nosferatu's 7) and load correctly once the bound is gone. A world actor imported while the bound
   existed was serialized from the fallback-normalized document, so its saved Essence is probably 6;
   an untouched persisted source may still hold the original. The release note says: after updating,
   check such critters' Essence; if it reads 6, set it by hand (re-importing would lose world edits).
4. Character and spirit schemas are untouched (characters derive Essence ≤ 6 from ware; spirits use
   Force).
5. Downstream readers checked (none imposes an upper bound): `healingSpellTN(base, essence)` floors
   at TN 2 (healing dialog, ritual); substance processing (`drugs.mjs` `actualEssence`) uses Essence
   for the Essence-0 death warning and confirmation reasons; banter classifies low Essence; the
   companion displays it. Essence Drain transfer and its per-type cap aren't automated (manual).

## Tests
- Vitest: none needed beyond the existing `healingSpellTN` floor (pure, unchanged) — add one case
  `healingSpellTN(10, 12) === 2` pinning the floor at high Essence.
- Quench batch `sr2e.npc-essence`:
  - strict validation passes for value/max 7, 12 and 20 independently (catches an accidental 12
    cap), and 0 and 7.5; a negative value is rejected;
  - both load paths keep 7: `Actor.implementation.fromSource(src)` (permissive, how stored data
    loads) and `new Actor.implementation(src, {strict: true})` (fallback off) — tested separately;
  - a world NPC created at 8 round-trips through update and reload (fresh construction from source);
  - the rendered NPC sheet: a DOM `change` of the Essence input to 9 saves 9; clearing it saves
    nothing (still 9); `-1` is refused and the sheet re-renders at 9;
  - `manualSigned` null / 0 / 3.5: the value input is always present, the signed value is shown
    only when non-null;
  - an unlinked token's NPC: editing its Essence on the token sheet leaves the base actor unchanged;
  - substances: an NPC at Essence 9 keeps 9 through substance processing; at 0 the existing
    Essence-0 warning still appears.
- Manual: Paranormal Animals' Nosferatu imports from its compendium with Essence 7.

## Key decisions & tradeoffs
- **No upper bound** vs a cap of 12: 12 is right for humanoid drainers (p.217) but wrong for a
  creature whose type maximum differs, and for the Nosferatu ("without limit"); a fixed cap would
  recreate today's bug at a different number.
- **Editable input on the NPC sheet**: the template critters print a die roll, so the GM must be
  able to enter the result per creature. The content modules ship a typical value (7 for 2D6) and
  say "roll 2D6" in the biography.

## Risks / open questions
- Any code path that assumed NPC Essence ≤ 6 for a percentage or a table lookup? Searched
  `essence` across module/ — none found; listed above.

## Out of scope
The NPC attribute floor (printed 0 → 1) and NPC running multipliers (both disclosed in Cyberpirates
biographies), and the ancestor spirit's Strength-based attack — separate changes.
