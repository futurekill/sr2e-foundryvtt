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

# S13 — adept power costs (same branch)

## Round 1 — Codex gpt-6-sol high
**Findings**

1. **Duplicate attribute powers are underpriced** — [module/data/actor-data.mjs:713](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:713). A human with natural Quickness 5 can hold two +1 Quickness powers; each costs 1 PP, so Used shows 2 PP, while the cumulative R4 cost is 2.5 PP. No duplicate is reported. **Fix:** Price successive increases cumulatively and report a second power for the same attribute.

2. **Costs stop increasing above a table’s level limit, but effects continue** — [module/rules/sr2e-rules.mjs:1957](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1957). An Increased Reflexes item set to level 4 costs the level 3 price of 6 PP, while its per-level modifier grants four initiative dice. `maxLevel` is an editable item field, not a schema constraint. **Fix:** Validate table-limited levels before pricing or applying their effects.

3. **Renamed embedded powers can lose their core identity** — [module/rules/sr2e-rules.mjs:1917](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1917). A level 2 Increased Reflexes item with a null `_stats.compendiumSource`, a valid `flags.core.sourceId`, and a renamed title costs `pointCost × level` (2 PP) instead of 4 PP. Other source resolvers in this system read that flag. **Fix:** Include `flags.core.sourceId` in source resolution.

4. **The name fallback identifies custom powers as core powers** — [module/rules/sr2e-rules.mjs:1904](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1904). A custom “Improved Physical Senses Deluxe” with `pointCost: 2` and level 2 is priced at 0.5 PP instead of its authored 4 PP. **Fix:** Restrict fallback matches to exact core names and use flags for custom variants.

5. **The documented custom attribute flag does not supply an attribute** — [module/data/actor-data.mjs:712](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:712). A flagged `improved_attribute` power with `attributeMods.quickness: 1`, natural Quickness 4, and level 3 costs 3 PP instead of 3.5 PP because only a `:<attribute>` suffix supplies tier context. **Fix:** Derive the affected attribute from `attributeMods` for the generic key.

6. **Required rule violations are not reported** — [module/rules/sr2e-rules.mjs:1974](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1974). Improved Ability (Etiquette) silently receives a fallback price, and Improved Ability (Firearms) level 3 on Firearms 2 has no warning that it exceeds the book’s combat-skill limit. The plan requires reports for both. **Fix:** Derive and display per-power rule warnings on the actor sheet.

7. **The required Combat Pool integration test is absent** — [test/chargen-budget.test.mjs:89](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/test/chargen-budget.test.mjs:89). Removing the new Combat Sense pool bonus would leave the added tests passing: they test its price, while the existing Quench points test still covers only generic linear powers. **Fix:** Add an actor preparation test asserting Combat Sense dice, including the physical-adept gate and Active Effect interaction.

I found no double-counting in the shipped Combat Sense power: its pack entry has no Active Effect. The Combat Sense spell’s Active Effect is a separate bonus. I could not run Vitest in this read-only sandbox because its startup attempts to write a temporary config file; pure rule calls reproduced findings 1 and 2.

VERDICT: REVISE
### Response
All seven accepted and fixed.

## Round 2 — Codex gpt-6-sol medium, fix-only
1. **Fixed** — [actor-data.mjs:722](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:722). Case: two level 1 Body powers on natural Body 2 now cost 0.5 then 1 point. Fix: carry purchased levels into the next power’s cost tier, as implemented.
2. **Fixed** — [actor-data.mjs:725](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:725). Case: Combat Sense level 4 is reported as past the table. Fix: report levels above the table maximum, as implemented.
3. **Incomplete** — [sr2e-rules.mjs:1918](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1918). Case: an unknown `_stats.compendiumSource` masks a valid `flags.core.sourceId`, returning `null`. Fix: try each source against `ADEPT_POWER_SOURCES` in priority order.
4. **Incomplete** — [sr2e-rules.mjs:1907](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1907). Case: `Improved Physical Senses (Thermo Vision) Deluxe)` is still recognized as core. Fix: constrain bracket contents so an extra closing bracket or suffix cannot match.
5. **Incomplete** — [actor-data.mjs:722](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:722). Case: a generic flagged Quickness power with modifier `+2` and level 1 applies two points but prices and tracks one. Fix: price the applied modifier times level, or reject nonunit modifiers.
6. **Incomplete** — [actor-data.mjs:726](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:726). Case: two `+5` Reaction powers on a human exceed the `+9` limit without a report; two level 2 Firearms powers on Firearms 3 likewise evade the dice report. Fix: validate Reaction and Combat Skill limits against totals across powers.
7. **Fixed** — [actor-data.mjs:1595](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1595). Case: Combat Sense level 2 grants zero dice in animal form and two in human form for a physical adept. Fix: pass both gates to the pure helper, as implemented.

VERDICT: REVISE
### Response
Accepted 3–6: every source tried in order; bracket contents constrained (one nested level for B/R skills); a generic attribute power priced by the points it adds; Reaction and Combat Skill dice limits checked on totals after all powers. Not re-reviewed; checked by unit tests and the live test world (Tiger: Used 6/6, Combat Pool 7, no reports).
