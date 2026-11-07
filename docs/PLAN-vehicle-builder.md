# Plan: the vehicle builder (Rigger 2 design rules), correct vehicle stats
_Draft 2 (2026-11-07; Codex plan round 1 applied). Phase 1 of the vehicle work; Phase 2 (in-play vehicle rules) gets its own plan._

## Goal
A custom vehicle can be designed in a guided **Workshop** that a player understands without the book open. Every
number it produces is exactly Rigger 2's (book p.108–146, tables p.167–171), and every vehicle shipped by the system
and its content modules carries correct stats that the rest of the system can use.

## User rulings (2026-11-07)
1. **Acceleration Increase costs 2 DP per +1** (the option entry, p.115, and Rich's example, p.113). Steffi's "25 per
   point" (p.113) is a misprint: Handling Improvement is the 25-per-point option.
2. **With the Rigger 2 module active, vehicles use the Rigger 2 Vehicle List stats** (p.148+), which supersede all
   earlier stats (p.108). The system's own compendium keeps the core-book stats.
3. **A Workshop window**, step by step with a live summary, creates a vehicle or edits one. The vehicle sheet shows a
   design summary and an Edit button.
4. **Phase 1 = builder + data + stats audit.** Phase 2 = the in-play rules (driving, crashes, ramming, gunnery,
   rigging, Control Pool) against the core book and Rigger 2.

5. **The Handling floor binds everything** (p.116–117): Smart Materials' −1 counts, the final rating never goes
   below ½ the chassis' original (rounded up), and the builder won't sell a point the floor would take away. (Rich's
   example pays 50 DP for 4→2 on top of Smart Materials; he can buy only 1 point.)
6. **Cargo Factor stays fractional** (rule text; Rich's final 0.5 CF, p.115). Steffi's "rounded up to 2" (p.113) is
   the example's choice, not a rule.

## What's wrong today (verified against the rendered pages)
- **Data** (`sr2e-rigger-2/data`): rows differ from the printed tables (gasoline Sports Car speed starts at 160,
  p.168; the data says 100). Economy (start/max), fuel size, idle rates and the stall/max speed pairs of aircraft are
  missing. Every ×B row (drones, skimmers, UAVs) is "unbuildable", yet B is the chassis' Body, which is fixed.
- **Math** (`resolveVehicleDesign`): one fixed per-point table. Acceleration is 25 (ruling 1: 2). Economy is linear
  (book: 5 DP per 5% step, compounding ×1.05, p.116). The fuel tank is a flat 25 (book: Fuel Tank Capacity Table by
  engine, p.116). No Handling floor (½ the chassis' original, rounded up, p.116). Missing options: Smart Materials,
  STOL/VSTOL, hydrofoil, living amenities, medical gear, structural agility, engine customization. Build-relative mod
  costs (×chassis, ×Body, ×Pilot, ×power plant) are a manual "Extra DP". Mark-Up is a typed number.
- **UI**: one long form; an unfiltered 86-entry power-plant list showing raw formulas; no live result.

## Approach

### 1a. The rules engine (system, pure, `module/rules/vehicle-design.mjs`)
One pure function `designVehicle(design, tables)` → `{ valid, problems[], dp, dpLines[], stats, budgets, markUp,
price }`. `dpLines` itemizes every Design Point with its page, so the Workshop and tests read the same breakdown.
- **Chassis** (p.108–111, table p.170–171): starting Handling (ground: on-road/off-road pair), Body (fixed), Armor,
  Cargo start/max CF, Autonav, Pilot, Sensor, seating, entry points, setup/breakdown, landing/takeoff profile,
  standard accessories, DP.
- **Power plant** (p.112, table p.167–169): only the plants the table lists for that chassis (a table row names its
  chassis types; the mapping is data). Speed/Accel/Load start/max, Signature, Economy start/max (km/liter, km/bar or
  km/PF, plus idle), Fuel size, DP. **×B, B², B³ formulas evaluate with the chassis' Body** (a tiny safe evaluator over
  `B` and numbers, no `eval`). Aircraft speeds are stall/max pairs.
- **Design options** (p.115–118), each with its book entry as data:
  - Speed +1: 2 DP, ≤ plant max. Acceleration +1: **2 DP** (ruling 1), ≤ plant max. Load +10 kg: 1 DP, ≤ plant max.
  - Handling −1: 25 DP; the floor is ½ the chassis' original rating rounded up, applied to the FINAL rating after
    Smart Materials (ruling 5); a ground vehicle improves on-road OR off-road, never both (p.116).
  - Cargo +1 CF: 5 DP, ≤ chassis max CF.
  - Economy: 5 DP per 5% step; each step multiplies the starting economy by 1.05 (compounding), ≤ plant max.
  - Fuel tank: the Fuel Tank Capacity Table (p.116) by engine type: increment, DP and CF per increment.
  - Signature: 200 DP per level; general-public 1 level, security 2, military 3+ (p.117) shown as the GM's limit
    guidance, not a hard cap ("gamemaster's discretion").
  - Smart Materials: 100 DP; Handling −1, a +1 on Stress Tests (noted), speed/accel/load maxima ×1.15 rounded up,
    helicopters +1 Signature, Mark-Up +0.5, Availability +4 (p.117).
  - STOL 250 / VSTOL 400 (fixed-wing only), hydrofoil 50 DP / 8 CF (motorboats except skiffs; its in-play effect is a
    noted state for Phase 2).
  - Living amenities (p.117), occupants counted INCLUDING the driver: basic 40 × occupants, improved 50 + 40 ×
    occupants, high 100 + 40 × occupants; 200 CF consumed and 100 kg, of which **160 CF stay usable** for gear or
    extra passengers but not for further mods. Modelled as a restricted-cargo amount separate from mod-usable CF.
  - Medical-treatment gear (p.117): 400 + 80/patient; 225 CF; 500 kg; **seating +2.5 per patient** (1 patient +2.5,
    2 patients +5), carried into the saved seating and the review.
  - Structural agility (150 DP/level, ≤ the drive-by-wire level, design only), robot learning pool (GM's discretion:
    GM-entered DP).
  - **Bikes** can't have Autonav above 2 unless they carry rigger adaptation (p.109): enforced when choosing the
    Autonav mod and when removing rigger adaptation.
  - **Aircraft**: the table gives some speeds as stall/max pairs (e.g. 40/120) and some as one number. Both forms are
    kept; the stall speed of a fixed-wing aircraft can't be changed (p.117), so Speed Increase raises only the max.
  - Decreases are free and never reduce DP (p.109, p.112).
- **Modifications in design** (p.113, catalog p.118–146): each mod's **Design Cost** in DP, never its ¥. A mod
  declares its DP rule as data: flat, per level, by-rating table, or **build-relative** (`×chassisDP`, `×Body`,
  `×Pilot`, `×powerPlantDP`, engine customization's 1.25 + 0.5/level). The engine computes all of them; the manual
  "Extra DP" stays only for GM-discretion entries.
- **Engine customization** (p.120, read 2026-11-07): each level raises ONE rating, Speed +30, Acceleration **+2** or
  Load +(Body × 50) kg; the three are bought separately. Above the plant's maximum, up to that maximum × 1.75 rounded
  up. Design cost per level: the power plant's DP × 1.25 for the first level, the multiplier +0.5 for each further
  level, "repeat the calculation": N levels cost Σₖ DP × (1.25 + 0.5(k−1)), summed per rating. (Today's
  `engineCustomizationCost` charges only the last level's multiplier, and the notes said Accel +5: both wrong.) Its
  failure risk (a GM's secret Build/Repair test, TN 6 when done in design) is shown as a note for the GM.
- **Budgets** (p.112–113, p.115): Σ CF consumed ≤ Cargo, Σ Load reduction ≤ Load; over budget blocks "Create" ("No
  vehicle can carry more…"). CF stays fractional (ruling 6). **The saved stats are what's LEFT** (p.113: "subtracted
  from the vehicle's Cargo and Load"): Steffi's buggy ends at Cargo 4.5 and Load 45, and those are what the actor
  stores as its usable cargo and load; the gross ratings and the consumption are kept in the design for the review.
- **Mark-Up** (table p.114): base from the chassis category; Special Features add (Smart Materials +0.5 is automatic;
  medical/ambulance +1, specialized non-combat +0.25–2.5, unusual equipment +0.2–1.2: GM-picked within the range);
  Special Designs multiply (luxury 1.5–2.5, security 2–3, military 3–5, drone 0.1), applied one after another, never
  added (p.114). Price = DP × Mark-Up × 100, with an optional round to the nearest 500 or 1,000¥ (p.114).
- **Tests (Vitest)** with the book's worked examples, under ruling 1:
  - Rich's Sports Car: 110 + 65 = 175; Smart Materials → 275 (Handling 4→3; maxima 311/21/230); Accel +11 (22) and
    Speed +151 (302) → 599; Load +100 kg → 609; Handling: one point to the floor of 2 (25, ruling 5) → **634** (book
    659); mods 580 → **1,214** (book 1,239); Mark-Up 1 + 0.5 + 1.0 = 2.5 → **303,500¥** (book 309,750¥); cargo
    3 − 2.5 = 0.5 CF (as printed). The test names both differences and their rulings.
  - Steffi's Light Strike: 20 + 25 = 45; Handling off-road 4→3 → 70; Acceleration +2 at **2** = 4 → 74 (the book
    prints 120 using 25); Cargo +2 / Load +30 → 87; mods 21 → **108 DP**; ×2 security = 21,600¥; **Cargo 6 − 1.5 =
    4.5** (ruling 6; book 4), **Load 70 − 25 = 45**.
  - The Wandjina's Mark-Up: 2.5 × 3 × 0.1 = 0.75.
  - ×B evaluation, the Handling floor, economy compounding, fuel table, budget refusal, smart-material maxima.

### 1b. The data (Rigger 2 module), re-transcribed from the rendered pages
- **Chassis Table** (p.170–171), **Power Plant Table** (p.167–169, every column), **Fuel Tank Capacity Table**
  (p.116), the design options (p.115–118), every modification's design cost / CF / Load / rule (p.118–146), the
  Mark-Up table (p.114).
- **Process:** render each page; transcribe into `tools/data/*.json` with its page; a second, independent pass
  (Codex reading the same rendered images) compares cell by cell; every disagreement is settled against a 300-dpi
  crop. `npm run validate` checks shapes, page refs, plant↔chassis links, and that every ×B formula parses.
- **Runtime delivery**: `register-design-data.mjs` and `CONFIG.SR2E.registerVehicleDesignData` are extended to carry
  every table (chassis, plants with all columns, fuel table, design options, Mark-Up table, mod DP rules); their
  normalizers keep the new columns instead of stripping them. `npm run sync-design-data` copies `tools/data` → `data`
  and runs in the module's build/validate step, so the shipped copy can't drift.
- The power plants carry their chassis links explicitly (the table's grouping), so the Workshop never offers a plant
  the table doesn't list for the chassis (p.112: "the vehicle may not use that power plant").

### 1c. The Workshop (system UI, `module/apps/vehicle-workshop.mjs`, ApplicationV2)
Opened from a vehicle sheet ("Design" / "Edit design"), the Actors directory ("New custom vehicle"), or a character's
Vehicles tab. Three columns: **steps** on the left, the **step** in the middle, a **live summary** on the right
(the vehicle's stat block in the book's format, Design Points with the itemized breakdown, CF and Load bars,
Mark-Up and price, and any problems).
1. **Chassis**: category tabs (Bikes, Cars, Hovercraft, Boats, Fixed-wing, Rotor, Vectored-thrust, Special); cards with
   the key stats and DP; the book's one-line description.
2. **Power plant**: only this chassis' plants, grouped by engine (electric, methane, gasoline, diesel, jet propeller,
   jet turbine, sail), each with its ranges in plain numbers (formulas already evaluated) and its fuel/economy.
3. **Design options**: each rating is a stepper between its floor and its maximum, with "max" and "reset", the DP
   per step and the running cost. Options that don't apply say why (e.g. "fixed-wing only") instead of vanishing.
4. **Modifications**: the vehicle-mod catalog (every active module's), searchable, with a rating picker; each shows
   its design DP, CF and Load before adding; over-budget additions are refused with the reason.
5. **Price**: the Mark-Up table as controls (base set from the chassis; ranges as sliders; multipliers as choices),
   rounding choice, the resulting ¥.
6. **Review**: the final stat block; **Create vehicle** (a new Vehicle actor with its mods as items) or **Update
   vehicle**. A player needs Foundry's "Create New Actors" permission to create one (the same as summoning); editing
   needs ownership.
The design is stored on the vehicle (`system.design`, **versioned**: `version: 2`), so reopening the Workshop
restores every choice. Every number has its page reference on hover.
- **Driving classification**: every chassis category maps to the existing vehicle type and driving skill
  (`CONFIG.SR2E` vehicle types; bikes → Bike, cars → Car, hovercraft → Hovercraft, boats → Motorboat/Sailboat,
  fixed-wing → Winged Plane, rotor → Rotor Craft, vectored-thrust → Vectored Thrust, special → the chassis' special
  skill), written on create and update.
- **Modifications are embedded items with an identity**: a Workshop-installed mod is a `vehicle_mod` item flagged
  `flags.sr2e.designMod = true`; the design lists them by item id. On save the Workshop creates, updates and deletes
  only its own flagged items. Mods added on the sheet afterwards are **customizations** (book p.118: installed after
  manufacture, ¥ priced, Installation Test) and the Workshop shows them read-only, never touching them.
- **Base vs effective stats**: the engine writes BASE stats (chassis + plant + options, cargo/load net of
  consumption). Mod effects that the data model already applies from embedded items (armor, signature …) are NOT
  baked into the base, so nothing counts twice; the Review shows the effective stats by running the same shared
  mod-effect function the data model uses (extracted to a pure helper).
- **Editing a vehicle with no design** (any production vehicle) never starts a design silently: "Design from scratch
  (replaces this vehicle's stats)" asks first and shows the full stat diff before anything is written. Production
  vehicles are otherwise left alone.
- **Old (v1) designs** are not repriced on load. Opening one in the Workshop maps what maps (chassis, plant, speed,
  accel, load, cargo, armor DP as Armor mod points) and lists what doesn't (a flat Mark-Up and the manual "Extra DP"
  become GM-entered values; a scalar Handling purchase is applied on-road), for the owner to confirm before saving.

### 1d. Vehicle data and the stats audit
- **VehicleData** gains the R2 stat line: off-road Handling, stall speed, Economy (+ unit, idle), Fuel (type, size),
  entry points, landing/takeoff profile, setup/breakdown time, other features, Design Point value, Street Index, and
  restricted cargo (living amenities). New fields only add; no existing value changes meaning (no `=== undefined`
  guards; [[sr2e-migration-schema-default-trap]]).
- **The R2 module ships the whole Vehicle List** (book p.148–177) as its vehicles compendium, transcribed and
  cross-checked like 1b, each with its "Reference" book.
- **Stable identity**: every shipped vehicle gets `flags.sr2e.vehicleId` (e.g. `ares-roadmaster`), the same id in the
  core pack, the content modules and the R2 list.
- **Precedence while R2 is active (ruling 2)**: a vehicle created from any compendium with a `vehicleId` the R2 list
  covers takes the R2 stats at creation (a `preCreateActor` hook in the R2 module, noting it on the actor). Vehicles
  already in a world: the GM's **"Update vehicles to Rigger 2 stats"** lists every match and every stat change, and
  applies only what the GM approves; matching is by `vehicleId`, with a name match only as a flagged, reviewed
  fallback. A vehicle carrying a design (custom) is never touched.
- **Audit**: the system's 32 core vehicles against the core book; each content module's vehicles against its own
  book (RBB, FoF, CSH, Cyberpirates, NAGRL, Queen Euphoria, SSC). Findings are fixed in their module, with a report.
- Vehicles stay usable by every character as today (link on the Vehicles tab); Phase 2 audits those rules.

## Key decisions
- Pure engine with an itemized breakdown: one source for the UI, the stored design, and the tests.
- Data-driven options and mod rules (including build-relative ones) instead of the manual "Extra DP".
- Rulings are encoded and tested explicitly (Steffi's misprint is named in the test).
- Two independent transcription passes over rendered pages; validation in CI.

## Risks / open questions
- Transcription volume (tables + ~200 R2 vehicles): budgeted as its own sub-release with cross-checks.
- Some table cells are ambiguous in the scan; each gets a 300-dpi crop and, if still unclear, a question to the user.
- Players without "Create New Actors" can't create a vehicle (GM can, or they edit one they own).

## Releases
1. 1a engine + 1d data model (system) — Vitest with the worked examples.
2. 1b data re-transcription (R2 module) + validation.
3. 1c Workshop (system) — Quench + a How-To with a GIF.
4. 1d R2 Vehicle List pack, "Use Rigger 2 stats", and the per-module stats audit.

## Documentation (part of done)
Wiki (Vehicles + Rigger 2 pages), a How-To "Design a custom vehicle" with a GIF, `npm run gen-guides`, CHANGELOG,
QA-PLAN in each repo touched, CLAUDE.md.

## Out of scope (Phase 2)
Vehicle combat and movement rules, rigging, Control Pool, sensors in play, drone autonomy.
