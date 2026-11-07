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
