# Code review log: chargen prerequisites (branch chargen/s-prereqs)

## Round 1 — Codex gpt-6-sol high
- [module/rules/sr2e-rules.mjs:1867](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1867): The program projection drops `objectCodeOnly` and `activeOpts`. A VR2 rating 4, multiplier 2 object-code program counts as 6,400¥ instead of 4,800¥, reducing the money offered when creation finishes. **Fix:** Pass both fields through to program pricing.
- [module/rules/sr2e-rules.mjs:1856](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1856): Pricing omits the authored cost. A DataSoft authored at 50,000¥ counts as 1,000¥ because `derivedItemCost` receives no `authoredCost`. **Fix:** Pass each item’s `_source.system.cost` as its pricing context.
- [module/rules/sr2e-rules.mjs:1849](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1849): Spreading an item with accessor-backed `flags` drops its ware identity before `wareCtx` reads it. A flagged single cybereye priced at 6,000¥ counts as 10,000¥; the old panel passed the item directly. **Fix:** Pass the original items to `wareCtx`, or explicitly copy `flags` and `_stats`.
- [module/data/item-data.mjs:1386](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1386): Derivation replaces authored bonding costs on existing spell, spirit, and power foci. A Force 2 power focus with an authored cost of 3 displays and budgets 10; editing its bonding-cost field cannot change that result. **Fix:** Preserve authored bonding costs unless the item explicitly opts into table derivation.
- [module/rules/sr2e-rules.mjs:1841](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1841): `race !== "human"` also admits shapeshifters, although the stated allergy bonus is for metahumans. A shapeshifter with a filled allergy gains extra creation points. **Fix:** Limit the bonus to the supported metahuman races.
- [module/data/item-data.mjs:1234](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1234): The new `gang` type is absent from the [contact form’s selector](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/item/item-body.hbs:1205). An imported gang displays as a Contact and a form submission can save it as one, removing its 50,000¥ charge. **Fix:** Add the gang option and inputs for its new fields to the contact form.

Read-only reproductions confirmed the three pricing deltas. Vitest could not start because it attempted to write a temporary config file in the read-only workspace.

VERDICT: REVISE
### Response
All six accepted and fixed (commit after 7755ed33).

## Round 2 — Codex gpt-6-sol medium, fix-only
1. [sr2e-rules.mjs:1871](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1871) — A VR2 program with active options and object code only was charged at the wrong price. Fix: pass both fields into the budget projection. **Correct.**
2. [sr2e-rules.mjs:1873](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1873) — A DataSoft with an authored 9,000¥ data value could lose that price during derivation. Fix: pass its source cost as `authoredCost`. **Correct.**
3. [sr2e-rules.mjs:1853](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1853) — Spreading a live cybereye document dropped its flag accessor and could lose its ware discount. Fix: pass live documents directly to `wareCtx`. **Correct.**
4. [actor-sheet.mjs:776](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:776) — Re-deriving an existing focus’s bonding cost overwrote its authored value. Fix: calculate the table value when the purchase dialog chooses Force. **Correct.**
5. [sr2e-rules.mjs:1843](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1843) — A shapeshifter with an allergy received a metahuman bonus. Fix: restrict the bonus to dwarf, elf, ork, and troll. **Correct.**
6. [item-body.hbs:1223](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/item/item-body.hbs:1223) — Entering a follower archetype submits numeric keyed object data for `system.archetypes`, but its schema requires an array; the form handler converts `options` this way and omits `archetypes`. Fix: convert the submitted archetypes object to an ordered array before updating the item. **Incomplete.**

The targeted Vitest run could not start because Vitest tried to create a temporary config file in this read-only workspace.

VERDICT: REVISE
### Response
Accepted #6: the item sheet converts submitted archetypes to an ordered array (same pattern as utility options). Not re-reviewed.
