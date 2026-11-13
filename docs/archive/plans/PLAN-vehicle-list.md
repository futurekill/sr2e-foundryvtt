# Plan: Rigger 2 Vehicle List (vehicle builder release 4)
_Draft 2 (2026-11-11; Codex round 1: 10 findings, all taken). Detail plan for release 4 of docs/archive/plans/PLAN-vehicle-builder.md §1d (Codex-approved round 4). Rulings 1–14
stand. This plan fixes the parts §1d left open._

## Goal
With the Rigger 2 module active, every vehicle the Rigger 2 Vehicle List (book p.148–166) covers uses its stats (ruling
2): the R2 module ships the whole list as its vehicles compendium, a vehicle created from ANY compendium that the list
covers takes the list's stats, and the GM can bring vehicles already in the world up to date.

## Source and transcription
- Book p.148–166 (PDF 157–175; the Power Plant Table starts p.167). 169 rows: 140 headings, some with variant rows
  (Standard/Armed, Elec./Meth., SW/LW, Tractor/Trailer…). Shared fields printed "a/b" are per variant.
- Two independent passes (Claude, Codex) from 200-dpi renders, compared field by field; every disagreement is settled
  on a 600-dpi crop and recorded in r2 docs/DESIGN-DATA-CHECK.md, as for the design tables.
- Data: r2 `tools/data/vehicle-list.json` (the agreed rows, values as printed) → `tools/gen-vehicle-list.mjs`.

## Mapping a row to VehicleData
| Printed | Stored |
|---|---|
| Handling `a/b` (ground) | `handling` a, `handlingOffRoad` b |
| Speed `a/b` (aircraft: "the lower rating is the stall speed", p.22) | `stallSpeed` a, `speed` b |
| `x (y)` (hydrofoil engaged, Aguilar electric, …) | x stored; "y when …" in notes (the printed "Other Features" says when) |
| Cargo `a/b` (two spaces, e.g. Leyland Open Tray 4/45 vs Encl. Box 49) | `cargo` a+b, the split in notes |
| Autonav / Pilot / Sensor "—" | 0 |
| Accel "NA" (micro-walkers) | 0 |
| Seating, Entry Points, Landing/Takeoff, Setup/Breakdown, Other Features | `seating`, `entryPoints`, `ltProfile`, `setupTime`, `otherFeatures` (strings as printed) |
| Fuel "Jet (1,500 liters)" | `fuelType` = the CANONICAL engine id the design tables use (gasoline, diesel, electric, methane, jetPropeller, jetTurbine, sail): jet fuel → jetPropeller for prop/autogyro/tilt-wing/rotary templates, jetTurbine for turbine/jet/Thunderbird/jump-jet/airliner-turbine, per the chassis' allowed plants; `fuelSize` 1500, `fuelUnit` liters; two-part fuel: the first is primary (p.24), the second in notes (R1 #2) |
| Economy "0.2 km/liter (Idle: …)" | `economy` 0.2, `economyUnit`, `economyIdle` |
| Point Value, Cost | `designPointValue`, `cost` |
| Template | a Workshop **chassis key** per printed template (an explicit, reviewed table: "Luxury sports car" → sportsCar, "Med. tracked crawler" → crawlerSmall/…, "Zepplin" → zeppelin, "Special" → per-row override). From the chassis: `design.category`, `design.transport` (the Workshop's `isTransport`), `design.traits` (tractor, truck, zeppelin, drone for UAV/crawler/walker/drone chassis, electricAircraft for electric aircraft) and `vehicleType` ∈ CONFIG.SR2E.vehicleTypes (ground, hovercraft, boat, aircraft, rotor, vectored_thrust, drone; lighter-than-air = aircraft + zeppelin trait) and `skill` (bike, car, hovercraft, motorboat, sailboat, rotor, winged, vectorThrust). `design.chassisKey` is NOT set (that marks a Workshop design). The validator checks every id against the config (R1 #3, #4) |
| Reference | notes: "Rigger 2 p.N (originally RBB1)" |
Variants are separate actors, "Name (Variant)".

**Document ids (R1 #8):** `tools/data/vehicle-list-ids.json` maps every vehicleId to its packs-src `_id`. The 21
existing r2-vehicles drones keep their `_id`s (mapped by hand: "Aerodesign Condor II LDSD-41" → condor LDSD-41 row, …),
so links and world copies keep resolving; new rows get a fresh id written to the manifest once. The generator writes
the pack from the manifest and deletes any packs-src file not in it (old renamed files never linger).

## Identity (deviation from §1d, for review)
§1d put `flags.sr2e.vehicleId` on every shipped vehicle in every module. That edits eight repos' packs and needs eight
releases. Instead:
- The R2 list's own actors carry `flags.sr2e.vehicleId` (slug of name + variant).
- The R2 module holds `tools/data/vehicle-identity.json`: **compendium source UUID → vehicleId** for every vehicle in
  the system and the content modules that the list covers (built by a script that matches names through a reviewed
  alias table; every match listed in DESIGN-DATA-CHECK.md for review). Packs-src `_id`s are stable, so the UUIDs are.
- Matching = the created actor's `_stats.compendiumSource` (Foundry sets it on import), else its `vehicleId` flag. A
  name match is never automatic: it only appears, flagged, in the GM's update window.

## Where the code lives (draft 2.1)
As with the design tables ([[design-engine architecture]]: the system ships the UI, math and registry; Rigger 2 ships
the data): the R2 module only registers its data, `CONFIG.SR2E.registerVehicleList({ rows, identity })` from
`data/vehicle-list.json` (generated: per vehicleId the full VehicleData patch, notes, factory items with deterministic
ids; and the identity map). The system's `module/vehicle-list.mjs` owns the hook, the reconciliation, the update window
(a GM settings menu that says "needs the Rigger 2 module" when nothing is registered) and the Quench tests. Until the
data is registered (it loads at `setup`), the hook does nothing.

## Precedence (ruling 2)
One shared, idempotent function `listUpdate(target, row)` (system `module/vehicle-list.mjs`) computes the update for a vehicle: the stat-line
fields above + classification + the factory-equipment reconciliation below. Never applied to a vehicle with any design —
the system's shared `hasDesign(sys)` = `design.version === 2` OR a legacy design (non-empty `chassisKey` /
`powerPlantKey` or any improvement > 0) (R1 #6).
- **New vehicles:** an R2 `preCreateActor` hook acts ONLY on a compendium import: `_stats.compendiumSource` maps to a
  vehicleId AND `_stats.duplicateSource` is empty AND the data carries no `flags.sr2e.r2Stats` stamp. A world duplicate
  (duplicateSource set, or already stamped) keeps its stats (R1 #10). It writes the row's stats, factory items,
  `flags.sr2e.vehicleId` and `flags.sr2e.r2Stats = {source, rowHash}`. No setting: ruling 2 is unconditional.
- **Vehicles already in the world:** "Update vehicles to Rigger 2 stats" (R2 settings menu, GM only) lists world actors
  AND every unlinked token's SYNTHETIC actor (scene/token uuid, all scenes, `t.actor` as vehicle-base.mjs does) — each
  its own row (R1 #5) — with each changed stat old → new and the factory items to add/mark; name-only matches unticked
  and marked. On Apply, each ticked target is RE-READ: if it now has a design or any compared source value changed, it
  is skipped and the list refreshes for review (R1 #9); otherwise one update (+ the item writes) per target.

## Factory equipment
"Other Features" items that are factored into the stats (turbocharging, thermal baffles, RAM, armor, …) or that the
customization rules count (p.120: existing levels count against a maximum; mount points p.131) are created as embedded
`vehicle_mod` items with `custom.state: "factory"` from the R2 mods catalog: already in the base, never applied again,
counted for maxima/room. A curated table maps printed phrases to catalog items + rating ("Turbocharging 2 (factored in)"
→ Turbocharging ×2; "2 external fixed hardpoints" → External Fixed Hardpoint ×2; "ECM 5" → ECM rating 5; remote control
interface, rigger adaptation, turrets, firmpoints, pintle/ring mounts, enviroseal, APPS, concealed armor, roll bars,
smart materials, amphibious operation, living amenities, life support, medical gear, electronics port, satellite uplink).
Unmapped phrases stay text only. Factory items take no CF/Load beyond the printed stats (the printed Cargo/Load are
already net); `vehicleCapacity` already skips factory/removed items.
**Instances vs levels (R1 #7):** mount/instance equipment ("2 external fixed hardpoints", "3 micro-turrets", "2 pintle
mounts", "2 mechanical arms") is N separate items, so mount points add up; only level families (turbocharging, thermal
baffles, RAM, amphibious operation) and rated items (ECM/ECCM n) are one item with a rating.
**Reconciliation (R1 #1):** the same reconciliation runs on import and in the update window: for each expected factory
entry, an existing embedded item of the same name is marked `factory` instead of adding a duplicate: its rating set to
the row's AND its family metadata (`modKey`, `stack`) copied from the catalog entry, so Customize resolves and groups it
(R2 #1). Extra existing items stay as they are (aftermarket). **A customization purchase (any item with a receipt, from
`parts` on) is never paired**: the factory entry is created beside it, so a Patrol-1 with a bought Turbocharging level
keeps it and gains the factory Turbocharging 2 (R2 #2). An **ambiguous** legacy item (same name, no receipt, another
rating) is flagged in the update window, unticked, with a per-vehicle choice: *adopt it as the factory equipment*
(default) or *keep it as aftermarket and add the factory equipment*. Imports adopt: an import's items are the
compendium's own authored data (never purchases, which carry receipts and are excluded anyway). Idempotent: already-
factory items pair first, so a second run (either choice) changes nothing.
Weapons "not included" are not created; included weapons (Liebre's Vanquisher minigun) are created from the R2/system
weapon catalogs when one matches.

## Tests
Vitest: the row → VehicleData mapper (every special case above) and the template table. Validator: every list actor's
fields in range, every identity UUID resolves to an existing packs-src doc, every factory mapping names an existing
catalog item. Quench: importing Ford Americar from the core compendium with R2 active gives the list stats + vehicleId; importing
Patrol-1 gives Turbocharging ×2 and Thermal Baffles 1 as factory items and a customization quote counts them; duplicating
a stamped vehicle keeps its edited stats; a legacy-designed and a Workshop vehicle are untouched; the update window
updates two unlinked tokens of one base actor independently and skips a target edited after the list was built.

## Out of scope (release 4b)
The stats audit of the system's core vehicles against the core book and of each content module's vehicles against its
own book (§1d "Audit") — separate pass with its own report, since the R2 list supersedes them while R2 is active anyway.

## Risks / open questions
- Cargo `a/b` = two spaces summed is an inference (the key, p.23–24, doesn't define it); the split stays in the notes.
- Some module vehicles are the same model under another name or a different variant; the alias table is reviewed by
  hand, never fuzzy-matched at runtime.
