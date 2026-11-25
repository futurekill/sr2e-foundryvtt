# Plan: the synaptic accelerator beside other reflex ware (Shadowtech p.28; Cybertechnology p.57)
_Draft 1 (2026-11-20). The system side of the chargen app's RULINGS R13 (sr2e-chargen docs/RULINGS.md). Today Foundry
only warns (move-by-wire, actor-data.mjs `_wareInteractions` ~1376) and sums every Initiative die._

## The books (prose read 2026-11-19/20)
- Shadowtech p.28: "Each level of synaptic accelerator adds a cumulative +1D6 to the recipient's Initiative. The
  synaptic acceleration process is incompatible with boosted or wired reflexes, and cannot be combined with either to
  produce greater effects. This Initiative bonus does not assist in rigging or decking."
- Cybertechnology p.57: the accelerator combines with move-by-wire only at Level 1, at "triple the normal cost", the two
  implanted simultaneously.

## Changes
1. **Initiative (Shadowtech p.28).** In `_collectItemModifiers`, sum the WORKING synaptic accelerator dice (bioware block,
   after the triggered/damage gates and `amt`) as `mods.synapticDice`, and the WORKING wired/boosted reflexes dice
   (cyberware block, `!off`, rule `wired-reflexes:*` or `boosted-reflexes`) as `mods.reflexwareDice`. After the loop:
   `overlap = min(synapticDice, reflexwareDice)`; subtract it from `mods.initiativeDice` and `mods.wareInitiativeDice`
   (so the total is `max` of the two, never their sum). Ruling: "greater effects" = more Initiative dice than the
   better one alone; wired/boosted Reaction is untouched (the accelerator gives none). Rigging already ignores ware
   dice (the rig branch replaces `initiative.dice`); decking: check that the Matrix initiative doesn't read
   `initiative.dice` (if it does, out of scope here, noted).
2. **A visible note.** `system.wareNotes` (derived array, cleared every preparation): "Synaptic Accelerator with Wired
   Reflexes: not combined; the larger counts (Shadowtech p.28)". The character sheet shows it beside the move-by-wire
   conflicts (same template block).
3. **Price ×3 (Cybertechnology p.57).** `wareCtx` adds `mbwInstalled` for a synaptic accelerator (an installed
   move-by-wire cyberware among the items, rule `move-by-wire:*`); `itemBaseCost` multiplies by 3 when
   `ctx.wareRule === "synaptic-accelerator" && ctx.mbwInstalled && rating <= 1`, before the grade. Every caller already
   passes `wareCtx` (drop, purchase hook, chargen, surgery). Level 2 with move-by-wire stays the existing warning
   ("not compatible … the GM's call", the p.39 policy), priced normally.
4. **The app.** sr2e-chargen's `synapticTriple` multiplies OUTSIDE `chargenItemCost`; when the app re-pins to this
   release it must drop that (or it triples twice). Noted in the app's CHANGELOG at the re-pin.

## Tests
Vitest: `itemBaseCost` ×3 only for Level 1 with `mbwInstalled`; Level 2 not. Quench: SA 2 + Wired Reflexes 1 → +2D6
(not +3D6) and the note; SA 1 + Wired 2 → +2D6; remove the wired reflexes → +2D6 from SA, the note gone (second
preparation); SA 1 dropped onto a character with move-by-wire → price ×3.

## Out of scope
The "implanted simultaneously" requirement (surgery timing: the GM's); move-by-wire's other conflicts (unchanged).

## Draft 2 — changes after round 1 (these win)
- **r1 #1 (accepted): the accelerator is inert beside working wired or boosted reflexes.** Keeping wired Reaction AND the
  larger dice could beat either implant alone, which p.28 forbids. A ruling (the book doesn't say which one wins): the
  cyber reflexes keep working and the accelerator adds nothing while any wired/boosted reflexes work (installed, not
  switched off by a reflex trigger, not a failed second-hand part). So the result is never greater than wired/boosted
  alone. Implementation: the bioware block adds the accelerator's dice to `mods.synapticDice` as well; after the loop,
  if `mods.reflexwareWorking`, subtract `synapticDice` from `mods.initiativeDice` and `mods.wareInitiativeDice`
  BEFORE `this.mbw.reflexDice` is assigned (r1 #4: an inert implant gives the reflex check nothing either). Rulings
  page entry in the same change; the app's R13 (an error at creation) is unchanged.
- **r1 #2/#3 (pricing dropped from this change):** `chargenItemCost` rebuilds its context, and the surcharge depends
  on purchase order and resale valuation. Foundry already warns "combines only at triple cost" (actor-data.mjs ~1379);
  the GM charges it. The app charges ×3 at creation (R13). Changes 3 and 4 above are withdrawn.
- **The note (change 2, simplified):** pushed onto `this.mbw.conflicts` (reassigned with `this.mbw` every preparation,
  so nothing stale; the panel shows when the list is non-empty — actor-sheet.mjs:181). No new field or template.
- **r1 #5:** the decking Initiative display is pre-existing and separate; not here.
- **r1 #6 tests (Quench, two preparations):** SA 2 + Wired 1 → dice = Wired 1's (+1D6 total extra), the note;
  then remove the WIRED → +2D6 from SA, no note; SA 2 + Wired 1 then remove the SA → +1D6. Wired switched off by a
  reflex trigger → SA counts. Boosted reflexes the same as wired.
- **Round 2 (folded, no round 3):** `mods.reflexwareWorking` starts false and is set inside `!off` for `wired-reflexes:*`
  OR `boosted-reflexes` (not `this.mbw.wiredWorking`, which is wired only). The note is pushed only when
  `reflexwareWorking && synapticDice > 0` (both working). An Active Effect on the accelerator adding
  `system.initiative.mod` would bypass this: the item ships none; noted, not handled (r2 #2).
