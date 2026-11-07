# Plan Review Log: the vehicle builder (Phase 1)
Started 2026-11-07.

## Plan round 1 — Codex (fresh session; ~233k input tokens)

The price arithmetic is correct: Rich totals 1,239 DP / 309,750¥; Steffi totals 108 DP / 21,600¥ under the settled acceleration ruling. The plan still has these concrete gaps:

- **Rich’s Handling test contradicts Smart Materials:** it charges 50 DP for 4→2 while also promising a free −1; **fix:** specify stacking and floor order, then reconcile the example’s final Handling and DP with the option text (R2 pp.113, 115, 117; plan lines 51, 75–77).
- **Universal CF rounding contradicts Rich’s example:** rounding 2.5 CF consumed to 3 leaves zero cargo, whereas his printed final cargo is 0.5; **fix:** resolve the inconsistent examples explicitly instead of deriving a universal ceiling rule from Steffi (R2 pp.113–115; plan line 69).
- **Budget validation does not specify final usable stats:** passing capacity checks alone can leave gross Cargo/Load on the actor; **fix:** return and persist available capacity after consumption, with tests for Steffi’s Cargo 4 / Load 45 (R2 pp.115–117; current `module/sheets/actor-sheet.mjs:2003`).
- **Living amenities lose usable space and underspecify price:** 160 of the consumed 200 CF remains available for gear/passengers, and improved/high include fixed surcharges; **fix:** model restricted cargo separately and encode costs as 40×occupants, 50+40×occupants, and 100+40×occupants, including the driver (R2 p.117).
- **Medical gear omits seating changes:** it adds 2.5 passenger capacity per patient; **fix:** include that derived seating increase in both saved stats and the review (R2 p.117; plan lines 54–55).
- **Bike Autonav restrictions are missing:** bikes cannot exceed Autonav 2 without rigger adaptation; **fix:** enforce that dependency when selecting or removing modifications (R2 p.109).
- **Aircraft representation is incomplete:** not all aircraft have speed pairs, fixed-wing stall speed cannot be increased, and VehicleData’s proposed additions omit stall speed; **fix:** preserve scalar versus paired table values, store stall speed separately, and exclude it from speed improvements (R2 pp.117, 167–169; plan lines 41, 116–118).
- **Embedded mods can double-count stats:** existing derived data adds armor/signature item ratings to actor base values; **fix:** define whether engine results are base or effective stats and apply each embedded mod exactly once (`module/data/actor-data.mjs:2055`).
- **Mod editing lacks an identity/reconciliation contract:** saving Workshop choices alongside embedded items can duplicate mods or overwrite sheet-side changes; **fix:** identify installed choices by embedded item ID and specify create/update/delete reconciliation on reopen and save (plan lines 105–112).
- **Legacy migration is semantic, not merely additive:** existing designs contain scalar Handling purchases, flat Mark-Up, manual extra DP, and armor purchases that do not map directly to the new choices; **fix:** version designs and explicitly migrate or flag ambiguous choices without silently repricing existing actors (`module/data/actor-data.mjs:2018`; plan line 118).
- **Existing production vehicles have no reconstructable design:** selecting chassis/plant defaults and updating could replace their bespoke stats; **fix:** distinguish editing a saved design from explicitly converting an ordinary vehicle, with a reviewed stat diff (plan lines 95, 109–112).
- **R2 activation does not implement the settled precedence:** an optional conversion button leaves existing and newly imported core vehicles using old stats; **fix:** define an activation/import resolution path using stable source identities, with name matching only as a reviewed fallback (plan lines 12–13 versus 119–121).
- **The new data has no complete runtime delivery path:** registration currently loads `data/*.json`, strips new columns, and accepts only chassis/power plants; **fix:** extend normalization and registration for options, fuel, markup, and mod rules, and specify how `tools/data` reaches runtime (`../sr2e-rigger-2/scripts/register-design-data.mjs:33`; `module/config.mjs:1039`).
- **Created vehicles can retain the wrong driving classification:** VehicleData defaults to ground, while the proposed chassis output omits `vehicleType` and `skill`; **fix:** map every chassis to the existing vehicle category and driving skill when creating/updating actors (`module/data/actor-data.mjs:1989`; `module/config.mjs:884`).

VERDICT: REVISE
### Claude's response (draft 2)
- **#1 Handling vs Smart Materials and #2 CF rounding:** the book's examples contradict its rule text; asked the user.
  Rulings 5 (the floor binds the final rating, Smart Materials' −1 included) and 6 (CF stays fractional). The
  worked-example tests now assert Rich 634 / 1,214 DP / 303,500¥ and Steffi Cargo 4.5, naming the differences.
- **#3–#14 accepted:** saved stats are net of consumption; living amenities (occupant formula, 160 CF restricted
  cargo); medical gear seating; bike Autonav ≤ 2 without rigger adaptation; stall speed kept separately and not
  improvable; base vs effective stats with one shared mod-effect function; Workshop mods flagged and reconciled by
  item id, sheet-added mods untouched; versioned designs with a reviewed v1 conversion; production vehicles converted
  only on an explicit, diffed request; `vehicleId` identities with an R2 `preCreateActor` path and a reviewed GM bulk
  update; full runtime delivery of every table; chassis → vehicle type and driving skill.
- Also found while reading p.120: engine customization is Acceleration +2 per level (not +5), and its cost is summed
  level by level.

## Plan round 2 — Codex (fresh session, fixes only; ~172k input tokens)

- **Existing v1 design mods lose their provenance:** migration maps scalar choices but never classifies existing embedded mods; the new flag rule treats them as post-manufacture customizations, dropping their design DP. **Fix:** review and classify existing items during v1 conversion, preserving their IDs and flagging confirmed design mods ([plan:140–153](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-builder.md:140); current aggregation: `module/sheets/actor-sheet.mjs:1994`).
- **Item IDs alone do not resolve sheet-side edits:** restoring stored choices can overwrite a flagged mod’s changed rating or recreate one deleted on the sheet. **Fix:** specify that reopening reconciles stored choices against current embedded items, including changed ratings and missing IDs, before calculating or saving ([plan:134–143](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-builder.md:134)).
- **Read-only customizations lack a capacity contract:** the plan preserves their items but does not specify including their consumption when recalculating saved Cargo/Load, allowing Workshop updates to restore occupied capacity or shrink beneath installed equipment. **Fix:** include all installed customizations in capacity validation and net saved stats while excluding their costs from design DP (R2 p.120; [plan:142–147](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-builder.md:142)).

VERDICT: REVISE
### Claude's response (draft 3)
- **#1 accepted:** v1 conversion classifies existing mods in its review; each keeps its id and is proposed as a design
  mod (v1 counted them), the owner can mark any as a customization.
- **#2 accepted:** the flagged items are the record (ratings included); the design keeps no copy, so sheet edits and
  deletions are what the Workshop finds, and deleted ones are reported, never recreated.
- **#3 accepted, and it replaces round 1's "net" storage:** the actor stores GROSS Cargo/Load; the data model derives
  usable `cargoFree`/`loadFree` from every installed mod; the Workshop's budget counts all mods, DP only design mods.

## Plan round 3 — Codex (fresh session, fixes only; ~157k input tokens)

- **Gross/net contradiction:** [line 151](docs/PLAN-vehicle-builder.md:151) still requires net Cargo/Load, so the new derived subtraction would charge consumption twice; **fix:** explicitly replace that instruction with gross storage.
- **Option consumption disappears:** [the new formula](docs/PLAN-vehicle-builder.md:85) subtracts only installed mods, omitting fuel-tank increases, hydrofoil, living amenities and medical gear stored as design options; **fix:** subtract option consumption and item consumption exactly once in both derived capacities and Workshop budgets.
- **Deleted-item reporting has no record:** [lines 145–147](docs/PLAN-vehicle-builder.md:145) promise to report previously deleted items while retaining no history identifying them; **fix:** retain an ID-only deletion history or remove the reporting promise.
- **Existing aggregation ignores classification:** [Apply](module/sheets/actor-sheet.mjs:1994) and [the sheet summary](module/sheets/actor-sheet.mjs:2119) aggregate every item’s DP and ¥ cost, discarding flags through `map(i => i.system)`; **fix:** explicitly replace both paths with shared classification-aware aggregation—design DP from flagged items, customization costs from unflagged items, capacity consumption from all.

VERDICT: REVISE
### Claude's response (draft 4)
- **#1 accepted:** the stale "net of consumption" line now says gross.
- **#2 accepted:** the derived capacity subtracts design OPTIONS' consumption too, once, through one shared function
  used by the data model and the Workshop.
- **#3 accepted:** the deletion "report" promise is dropped (no history is kept; a deleted mod just isn't there).
- **#4 accepted:** one classification-aware aggregation replaces both existing sum-everything paths.

## Plan round 4 — Codex (fresh session, fixes only; ~63k input tokens)

VERDICT: APPROVED
**Plan approved in 4 rounds.**

## Code (release 1) round 1 — Codex (fresh session; ~396k input tokens)

- [module/rules/vehicle-design.mjs:310](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:310): Medical capacity silently caps at two patients; R2 p.117 explicitly allows further patients (“and so on”). Three patients incorrectly cost 560 DP and add 5 seats instead of 640 DP and 7.5 seats. **Fix:** remove the two-patient clamp.

- [module/rules/vehicle-design.mjs:268](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:268): Economy rounds prematurely: the methane small rotary-wing UAV’s 0.05 economy (p.167) remains 0.05 after buying a 5% improvement, instead of 0.0525. **Fix:** retain calculation precision and round only for display.

- [module/rules/vehicle-design.mjs:225](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:225): Fractional customization levels grant free performance: `engineCustom.speed: 0.5` adds 15 Speed, charges zero DP because the cost function floors levels, and returns valid. **Fix:** reject noninteger customization levels before calculating effects and costs.

- [templates/actor/vehicle-sheet.hbs:31](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/actor/vehicle-sheet.hbs:31): Clearing Off-road cannot save the documented blank/null state: the existing change handler converts empty numeric inputs to `0`. **Fix:** save `null` when this nullable field is cleared.

VERDICT: REVISE
### Claude's response (fix dbb5be3)
- **All four accepted:** no patient cap ("and so on", p.117); economy keeps full precision; every count/level must be
  whole (`notWhole` problem); `data-nullable` inputs save null when emptied (off-road Handling). Vitest + a Quench
  test driving the real sheet input.
