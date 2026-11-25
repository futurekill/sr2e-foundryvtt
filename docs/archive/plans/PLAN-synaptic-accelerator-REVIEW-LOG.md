# Plan Review Log: the synaptic accelerator

## Round 1 — Codex (gpt-6-sol, high; 619k input / 5.7k output tokens)
**Findings**

1. **The proposed rule combines benefits the quoted text says are incompatible.** Keeping wired or boosted Reaction while taking the accelerator’s higher Initiative dice can produce a better result than either implant alone. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-synaptic-accelerator.md:13)  
   **Fix:** Choose one implant’s complete reflex benefit, or state explicitly that mixing Reaction and dice is a house ruling.

2. **Chargen and resale lose the new pricing flag.** `budgetItemInput` spreads `wareCtx`, but `chargenItemCost` rebuilds the context with only `wareRule` and `fullCyberlimbs`, dropping `mbwInstalled` before `itemBaseCost` sees it. This also disproves the plan’s claim that every price path passes the needed context; the eye-accessory caller omits `wareCtx` too, though it is unrelated to accelerator pricing. [Cost path](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1796)  
   **Fix:** Preserve the full projected ware context in `chargenItemCost` and audit each direct caller for the context its item needs.

3. **The surcharge depends on purchase order and later inventory.** Dropping the accelerator before move-by-wire charges its normal price; adding move-by-wire later does not charge the difference. Conversely, `itemListValue` would reprice an already owned accelerator when move-by-wire is added or removed. [Drop pricing](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:857) · [Value pricing](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2008)  
   **Fix:** Define and record when the combination surcharge is paid, then use that purchase basis for later valuation.

4. **Subtracting overlap from `wareInitiativeDice` changes reflex checks.** That total feeds `mbw.reflexDice`, which sets the Reflex check button’s displayed TN and the actual Perception TN; the plan treats it as only an Initiative display total. [Assignment](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1275) · [Roll](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/mbw.mjs:215)  
   **Fix:** Keep a separate raw reflex-check total and apply overlap only to effective Initiative dice.

5. **Matrix rolls are separate, but the sheet still shows physical dice while decking.** The roll uses deck Response, as the plan asks to check; the Initiative panel reads `system.initiative.dice`, which still includes physical ware. [Matrix roll](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1118) · [Sheet](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/actor/parts/actor-attributes.hbs:109)  
   **Fix:** Show Matrix Initiative in that panel while jacked in, or label the displayed value as physical Initiative.

6. **The repeat-preparation test cannot detect stale dice.** In the proposed SA 2 + Wired 1 case, removing Wired 1 leaves the same +2D6 whether the overlap is cleared or not. `wareNotes` also needs an explicit fresh assignment on every preparation. [Tests](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-synaptic-accelerator.md:32)  
   **Fix:** Test SA 2 + Wired 1 followed by removal of SA (expect +1D6), and specify where `wareNotes` is reset before collection.

VERDICT: REVISE
### Response
#1 accepted (the accelerator is inert beside working wired/boosted). #2/#3: pricing withdrawn from the change (Foundry warns; the GM charges; the app charges at creation). #4 folded (subtract before mbw.reflexDice). #5 out of scope (pre-existing). #6 tests rewritten.

## Round 2 — Codex (gpt-6-sol, high; 446k input / 4.9k output tokens)
1. **The working-reflex flag needs its own rule.** Draft 2 uses `mods.reflexwareWorking`, but the existing `this.mbw.wiredWorking` is set only for wired reflexes; it misses boosted reflexes. [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1180)  
   Fix: Initialize `mods.reflexwareWorking` to false and set it inside `!off` for either wired or boosted reflexes, regardless of their dice value.

2. **A transferred Active Effect can bypass the subtraction.** An effect on the accelerator that adds `system.initiative.mod` applies before item collection, then contributes directly to Initiative dice. The proposal only removes dice collected from `attributeMods`. [sr2e.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sr2e.mjs:623), [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:555)  
   Fix: Specify and test suppression of accelerator-origin Initiative effects while it is inert.

3. **The note needs the same working gates as the dice.** Draft 2 names the destination for the note but does not specify its condition, so a switched-off reflex implant or damaged accelerator could still produce a misleading conflict. [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-synaptic-accelerator.md:52)  
   Fix: Append the note only when `mods.reflexwareWorking` is true and the accelerator contributed working `mods.synapticDice`.

`this.mbw` is reassigned **before** the item loop, so appending to its conflicts afterward is safe. The attribute source tooltips do not track Initiative dice and provide no second dice path. [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1154)

VERDICT: REVISE
### Response
#1 and #3 folded (own flag for wired OR boosted; the note only when both work). #2 noted, not handled (the item ships no Active Effect). Folded without round 3; Quench sr2e.mbw 9/9.
