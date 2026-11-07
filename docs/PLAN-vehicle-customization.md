# Plan: customizing existing vehicles (Rigger 2 p.118–146)
_Draft 6 (2026-11-07), after Codex rounds 1 (19 findings), 2 (9), 3 (4), 4 (3) and 5 (1; docs/PLAN-vehicle-customization-REVIEW-LOG.md). Follows
docs/PLAN-vehicle-builder.md (releases 1–3 shipped as 0.142.0–0.143.0); the user asked that players be able to modify
their existing vehicles ("that's important")._

## Goal
A player (or the GM) takes a vehicle that already exists — a compendium production model or a Workshop design — and
fits modifications by the **customization** rules exactly as printed: buy the parts in ¥ (Availability, Street Index),
make the Installation Test (or the fixed install), spend the time, and from then on the vehicle's stats show the
modification. Design (Design Points) stays the Workshop's design mode.

## The rules (rendered pages; R2 book page + 9 = PDF page)
- **p.118 Vehicle Customization:** after design and manufacture. Procure the parts (Availability, Street Index, core
  rules for obtaining equipment); install by an **Installation Test** with the listed Build/Repair skill(s) vs the TN;
  time = base time ÷ successes. Several skills: a successful test in each (p.120 "Skill").
- **p.118 Working time** (information; ruling 7). **Weight and space:** a mod that doesn't fit free CF or Load can't be
  accepted (also p.120). Scraping CF from seats is out of scope (Phase 2).
- **p.119–120 Customization Specifications:** Parts Cost, Parts Availability, Street Index, **Maximum Improvement or
  Rating** ("if the vehicle received the modification during design, its existing levels count against the maximum"),
  Base Time, Skill, Target Number, Equipment Needed, CF Consumed, Load Reduction — which can DIFFER from design (concealed
  armor 2 CF/point in design, 3 customized, p.127; thermal baffles 0 → 3 CF, p.130; turbocharging Speed max ×1.25 in
  design, ×1.5 customized, "always at least 1 level", p.122; engine customization ×1.75 vs ×1.5, p.120).
- Exceptions printed per mod: **no test** (ablative armor: 6 hours, no Skill Test, p.127); **summed successes**
  (drive-by-wire p.124); rating-indexed Availability / Street Index with restricted tiers (ECM p.137, Sensors p.140);
  "Military only" (RAM p.130); design-only (structural agility p.118: not if DBW was fitted by customization).
- **Drive-by-wire's one-time +10%** (p.124) applies to a customized DBW too; never cumulative.

## User rulings (2026-11-07)
7. Installation time is **reported**; the mod waits until its owner clicks **Finish**. No game clock.
8. Engine customization's "original power plant cost" (p.120) = plant Design Points × the vehicle's Mark-Up × 100¥
   for a Workshop design; for a production vehicle the GM enters it once.
9. Engine-failure Stress (p.120 / p.25) = Phase 2.
10. Several skills without a printed combination rule: time = base time ÷ the **lowest** success count among the tests
    (each must succeed). Drive-by-wire sums (p.124).

## Approach

### C1. One place applies every mod's effects (system 0.144.0)
1. **Base = the design without item effects.** `designVehicle` returns `baseStats`: every DESIGN OPTION applied
   (Speed/Accel/Load/Cargo/Handling/Economy/Signature/fuel purchases, Smart Materials, engine customization chosen as a
   design option) and NO mod-item effect. (`optionStats` stays for the steppers.) The Workshop saves `baseStats`.
2. `applyModEffects(base, mods, ctx)` (vehicle-design.mjs) is the ONE effect pass, used by `designVehicle` and by
   `VehicleData`. It works per **family** (C2.4): a "levels" family's effects are evaluated ONCE with R = the family's
   total effective levels, so per-level terms scale and constant terms (off-road suspension's −15 Speed, its Economy
   multiplier) apply once; an "instance" family evaluates per item. Then drive-by-wire's single +10% (split read from
   the family's designated item, C1.5), armor's +1 Handling per 6 added points, absolute ratings (C2.6), and the
   turbocharging maximum check.
3. **Which items count** (`custom.state`, a StringField with `blank: true` per the StringField trap):
   `""` = legacy/ordinary (an item that predates this work, or any mod dropped on a sheet the old way) → installed;
   `"factory"` = equipment already in a production vehicle's printed stats → counts for family levels, restrictions and
   maxima; its stats and capacity are already in the base (C1.5b); `"parts"` / `"tested"` = a customization in progress → its capacity only;
   `"done"` → installed. Design mods (`flags.sr2e.designMod`) are installed. `installed` (schema default false) is NOT
   used for this.
4. **Effective stats** are NEW derived fields on `VehicleData`, recomputed from the stored base every preparation
   (`effectiveHandling`, `effectiveHandlingOffRoad`, `effectiveSpeed` → then the damage factor, `effectiveAcceleration`,
   `effectiveLoad`, `effectiveCargo`, `effectiveArmor`, `effectiveSignature`, `effectiveEconomy`, `effectiveSensor`,
   `effectiveAutonav`, `effectivePilot`). Readers move to them: actor.mjs tests (≈2012), ramming (≈2115) AND the opposing
   vehicle's defaults (sheet-actions.mjs ≈3180, ≈3280), speed (≈2042), the vehicle sheet stat line (base → effective),
   the character's linked-vehicle summary (actor-vehicles.hbs ≈80), capacity (gross = effective Cargo/Load), and any
   reader in ../sr2e-* modules (grep before C1 ships).
5. **Drive-by-wire's split** lives on the DBW item (`system.custom.choice = { acceleration, speed, load }` in whole
   percents; default 10/0/0). The family's designated item = the design one, else the earliest-installed.
5b. **Baked baselines (round 2 #4):** a family's levels that are already IN the base — factory items, and the design's
   engine-customization option levels (a synthetic source) — are its `baked` levels. Effects are INCREMENTAL over them:
   additive keys add E(total) − E(baked), multipliers multiply by E(total) ÷ E(baked), and armor's Handling is
   ⌊total armor added ÷ 6⌋ − ⌊baked ÷ 6⌋ (five factory points + one customized point crosses six, p.127). Design-mod
   items are never baked (the base excludes item effects).
6. **Migration, per vehicle, gated:** the new derivation runs only for a vehicle whose `design.baseVersion >= 2` OR
   that has no v2 design (production vehicles never baked anything). A v2 vehicle not yet converted keeps today's
   behaviour (Armor/Signature only). Conversion (GM client, at `ready`, after the Rigger 2 tables register):
   re-run the 0.143.0 calculation from the stored choices and items and rebuild exactly what that writer STORED — the
   baked fields only (Handling on/off-road, Speed, Acceleration, Load, Cargo, Economy; Armor and Signature were already
   saved without mod effects and are never touched). If every stored baked field equals that reconstruction, write the
   new `baseStats` for them, move `choices.dbwSplit` to the DBW item, and stamp `design.baseVersion: 2` in the same update,
   then verify that the new derivation reproduces the pre-conversion effective stats (else roll back and report). If
   any field differs (the owner edited stats after design), the vehicle is NOT converted automatically (no inversion of
   rounded multipliers is attempted, round 2 #2): it keeps today's behaviour and its sheet shows the GM a notice with the
   differences and two choices — **Reapply the design** (stats from the design) or **Keep as edited**: it becomes a production
   vehicle whose printed stats are what it has NOW, counting only what is CONVERTED (round 4 #1): base Armor/Signature
   = stored + the DESIGN mods' contributions; base Cargo/Load = gross − the design options − the DESIGN mods'
   consumption (a production line's printed figures already exclude its equipment); unflagged mods stay as they are
   and keep applying on top; its design mods become `factory` items, and its design engine-customization levels become `factory`
   engine-customization items (so maxima still count them); the update is committed only if the effective stats and
   usable Cargo/Load computed afterwards equal those before (round 3 #1). A missing chassis/plant row:
   refused and reported. This is a **pending pass** run on every GM `ready` over world actors AND unlinked
   token actors, independent of the world migration version (which stamps regardless).

### C2. Customization specifications and families (Rigger 2 module 0.7.0)
1. Transcribe every mod's **Customization Specifications** (p.120–146) twice — Claude from the renders, Codex from the
   images only — compared cell by cell; disagreements re-read at 600 dpi; recorded in docs/DESIGN-DATA-CHECK.md. The
   same pass AUDITS passive effects (Codex #15): sensors/autonav/remote pilot ratings, external fixed mounts' −1
   Signature (p.131), anything else a mod permanently changes.
2. `VehicleModData.custom` (SchemaField): `customizable` (false = design-only), `partsCost` (formula), `market` rows
   indexed by rating (`[{ availability, streetIndex, restricted: "" | "military" | "unavailable" }]`, one row = every
   rating), `max` (C2.5), `procedure` (`"test"` | `"fixed"`), `fixedHours`, `baseTime` (formula), `skills` (tokens),
   `combine` (`"lowest"` default per ruling 10 | `"sum"`), `tn` (formula), `equipment`, `cf` / `load` (formulas; `null` =
   inherit design, `"0"` = none), `state` (C1.3), `choice` (C1.5), `attempt` (C3.4), `payer`/`paid`.
3. **Formula language:** identifiers become `[A-Z][A-Za-z0-9]*` (tokenizer, evaluator and the module validator change
   together). Variables: R (levels added by this item), R0 (the family's existing levels before it), R1 (= R0 + R), B, P,
   C/E (chassis/plant Design Points), EDP (engine customization Design Points), EY (engine customization ¥ cost —
   active thermal masking p.130), V (the vehicle's original cost, `system.cost`, never including parts bought), N (power
   plant cost, ruling 8), H / HO (Handling on/off-road, before this item), A0 / A1 (Armor before / after — armor's TN is
   by the desired rating, p.127), S0 (Speed before any turbocharging), S (current Speed). An unresolved formula or a
   missing input (N not entered) BLOCKS the purchase with the reason; never 0.
4. **Families:** every DESIGN entry gets a stable `modKey` (the rule family: `turbocharging`, `off-road-suspension`,
   `thermal-baffles`, `ram`, `ecm`, `engine-custom-speed` / `-acceleration` / `-load`…) and `stack: "levels" |
   "instance"` (levels: one system bought in level batches — turbo, armor, DBW, suspensions, baffles, RAM, ECM, CMC,
   nitrous; instance: independent equipment — mounts, seats, turrets, sidecars, spotlights). Capacity for a levels family
   (round 2 #3): each item consumes its own origin's PER-LEVEL part, f(R) − f(0), and the family's FIXED part, f(0) of
   the earliest counted item's origin, is added once (absent family = 0). E.g. customized nitrous (2 CF, 15 kg, p.121):
   first install 2 CF / 15 kg; more levels 0. Mixed origins: each item's per-level part by its own spec, the fixed part
   by the earliest's. Removing the earliest moves the fixed part to the next (derived every time, nothing stored).
   Factory items consume nothing (C1.3).
5. **Maxima:** `max = { basis: "rating" | "stat:<key>", factor, round: "down" | "up", minOneLevel, value }` evaluated on the
   family TOTAL incl. design and factory levels (p.120). Turbocharging customized: basis stat:speed, S0 × 1.5 rounded
   down, minOneLevel (p.122); in design the existing check (plant max × 1.25) stays.
6. **Absolute ratings:** effects may `set` a rating (`sensor: "max(Sensor, R)"`-style through `effects.sensorSet`) so a
   Sensors mod raises the vehicle's Sensor instead of adding to it; autonav and remote pilot likewise (audited in C2.1).
7. **Engine customization** becomes three families (`engine-custom-speed` / `-acceleration` / `-load`); their existing
   levels include the design's `choices.engineCustom[stat]` (a synthetic design-level source in the family context). Its
   parts cost uses N and the per-level multiplier on R0…R1 (×1.25, +.15 each further level, p.120).
8. **Vehicle classification traits** for per-class values: `design.traits` (array) — category (bike/car/boat/…), `drone`,
   `transport` (medium/heavy transport), `tractor`, `truck`, `zeppelin`, `electricAircraft`. Ordered precedence: a
   key's `@trait` overrides are tried most-specific first by a fixed order (zeppelin, tractor, truck, transport, drone,
   electricAircraft, then the category), then the plain key. The Workshop writes traits. A production vehicle
   (round 2 #8) takes its category from its driving `skill` (bike/car/hovercraft/motorboat/sailboat/rotor/winged/
   vectorThrust) before `vehicleType`, and has GM-editable **body category**, **propulsion** (engine type) and trait
   ticks under More; precedence applies per property, only to overrides printed for it. Anything a calculation needs
   that is still unknown (a drone without a body category; an engine type for engine-restricted mods) BLOCKS that
   calculation with the reason.
8b. **Family identity of existing items (round 2 #9):** one resolver, used everywhere: the item's own `modKey`; else
   its compendium source (`_stats.compendiumSource` / `flags.core.sourceId`) → that catalog item's current modKey;
   else an exact name match in the registered catalogs; else unresolved — counted as a lone instance and reported on
   the vehicle sheet. While ANY vehicle_mod on that vehicle is unresolved, Customize admits no purchase at all (its
   family can't be known, round 3 #4) until the GM assigns a family or marks the item independent equipment
   (`modKey: "independent"`, never aggregated). Nothing is rewritten
   automatically; the GM's "fix" writes the resolved key.
9. **Factory equipment:** a production vehicle's built-in mods are recorded as items with `custom.state: "factory"`
   (GM adds them from the catalog with "Factory equipment"; release 4's Vehicle List pack ships them), so a factory DBW
   blocks a second +10% and factory suspension blocks DBW, without reapplying stats or capacity.

### C3. The Customize flow (system 0.145.0)
1. **Customize** on the vehicle sheet (owners) opens the Workshop in **customize mode**: catalog rows show parts cost ¥,
   Availability / Street Index (per rating), skill(s), TN, base time and CF/Load from the customization specs; a row the
   vehicle can't take says why (capacity, maximum incl. design/factory levels, class, design-only, restrictions,
   unresolved formula or missing N, "Military only" without the GM).
2. **Buy — one admission writer (round 2 #5, #6):** a GM is always present, so purchases follow the VR2 sequencer
   pattern: the buyer's client writes a REQUEST record on the vehicle (`flags.sr2e.custRequests.<purchaseId>`: family,
   levels, choice, payer uuid, quoted price), which an owner may write; the active GM's client processes requests one
   at a time in a vehicle-keyed queue (on `updateActor` and on `ready`), so ADMISSION is serialized by one writer:
   (a) the GM re-checks capacity, maxima, restrictions, classification and the price on the LIVE vehicle (every admitted,
   not yet delivered purchase counted) and writes the decision on the request (`admitted` with the price, or rejected
   with the reason). (b) PAYMENT stays with the payer's existing money writer (round 3 #3): the requesting client — the
   one that already runs that character's purchases — charges inside `moneyQueue(payer)` with ONE checked update that
   lowers the payer's nuyen AND writes the durable receipt `flags.sr2e.custReceipts.<purchaseId>` (amount, vehicle
   uuid, family, levels); the receipt IS the payment proof. Before charging, that client re-reads the request INSIDE
   `moneyQueue(payer)`: only an `admitted` request is paid. If that client is gone, the admitted request resumes on its
   next load. **Cancelling** (round 4 #2): the GM writes `cancelRequested`; the reservation is released ONLY when the payer's
   writer acknowledges inside its queue (no receipt → writes `cancelled`; a receipt already exists → the purchase is
   delivered instead). There is no offline shortcut (round 5: a debit sent just before a disconnect can still land), so a
   request whose payer's client is away stays reserved — shown on the vehicle as "waiting for <player> to confirm" —
   until that client next loads and acknowledges. "No charge" is a GM decision
   written as a zero receipt by the GM. (c) The GM's client sees the receipt and creates the item with the
   deterministic id from purchaseId (`keepId`; a replay is rejected) in `state: "parts"` with `custom.receipt`, then writes
   the vehicle's delivery record `flags.sr2e.custDelivery.<purchaseId> = "delivered"`. Recovery on every GM `ready`
   (round 3 #2): a receipt whose delivery record is missing → if the item exists, write "delivered"; else create it. An
   item without a matching receipt can't be tested or finished.
3. **Installation Test** (`procedure: "test"`): from the mod's row, the user picks who works (a character they own; the
   GM any, e.g. a mechanic contact) and rolls each listed skill through `rollSkillTest` vs the TN (defaulting per core
   rules). Skill tokens map by vehicle: vehicleBR → Ground Vehicles (B/R) for bikes/cars/hovercraft, Boats (B/R),
   Aircraft (B/R) (rotor/winged/vector), drones by their body type; plus Computers (B/R), Electronics (B/R) etc.
4. **The attempt is durable:** the roll writes `custom.attempt = { id, by, results[{skill, successes}], ok, hours,
   spec }` (hours = base ÷ the combined successes per `combine`; `spec` = levels, choice, R0, the evaluated TN and base
   time) and `state: "tested"` in one update; a failed attempt keeps `state: "parts"` (retry allowed). `procedure:
   "fixed"` skips the test (ablative armor: 6 hours). A customization item's levels and choice are locked while it is
   bought (`preUpdateItem` refuses a change for non-GMs; the GM's change clears the attempt).
5. **Finish** (owner): requires a receipt and `state: "tested"` (or fixed) whose `attempt.spec` still matches the item
   (levels, choice) and whose evaluated TN/base time/R0 match a fresh evaluation — else the attempt is invalidated and a
   new test is needed (round 2 #7); then re-checks that prerequisites are installed (not just
   bought — e.g. structural agility needs an installed design DBW; rigger adaptation needs installed sensors), capacity
   and maxima on the live vehicle, then sets `state: "done"`.
6. **Remove:** write the vehicle's delivery record `"removed"` for its purchaseId, THEN delete the item (no refund; GM's
   call). Recovery never recreates a purchase whose record is "removed" (round 3 #2), and it
   finishes an interrupted removal: an item still present whose record is "removed" is deleted (retried on each GM
   `ready`; until then it is treated as removed — no effects, no capacity) (round 4 #3).

## Key decisions & tradeoffs
- Effects derived, never written; base = design options only. Costs: migration with edit-preservation, reader sweep.
- Families with stack semantics and marginal capacity, instead of one item per mod or editing the design item.
- One admission writer (the active GM's client, requests as records) instead of client-side reservations: Foundry has
  no cross-client lock and creation time isn't a sequence (round 2 #5); a GM is always present (standing rule).
- Legacy and other modules' mods (`custom.state: ""`, no specs) keep working as installed equipment; they just can't be
  bought through the Customize flow until a module gives them specs.

## Risks / open questions
- Request processing needs the active GM online; until then a purchase shows "waiting for the GM" (a GM is always
  present at this table).
- Classification of core-compendium production vehicles relies on `skill` + GM-entered body category/propulsion until
  release 4's data.

## Out of scope
Engine-failure Stress (ruling 9), scraped CF from seats, working time scheduling, mechanic fees, repairs, Phase 2
in-play rules, the Rigger 2 Vehicle List pack (release 4, which will also ship factory equipment).

## Releases
C1 (system 0.144.0: base/effects split, effective stats + readers, DBW split on the item, gated per-vehicle conversion)
→ C2 (Rigger 2 0.7.0 + system formula language: families, customization specs, passive-effect audit, two-pass data)
→ C3 (system 0.145.0: customize mode, reserve-then-charge, durable Installation Test, Finish). Each with Vitest for the
math, Quench for the flows, and docs (CHANGELOG, QA-PLAN, wiki Vehicles and Rigging + How-To "Customize your vehicle"
with a GIF).
