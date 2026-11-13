# Plan: vehicle rules in play (vehicle work, Phase 2)
_Draft 7 (2026-11-12): Part 1 APPROVED (R5, built 0.146.0); Part 2a APPROVED (R6, built 0.147.0); Part 2b draft 1._

## Goal
Every vehicle rule a table uses in play works as written, in two rulesets chosen by a world setting, like the Matrix
(`matrixRuleset`: core / VR2.0). **Core Rulebook** (default) = SR2 p.84, p.104–109, p.183. **Rigger 2** = R2 p.12–90,
which replaces the core vehicle chapter (Maneuver Score combat, Speed Rating with max = Speed × 1.5, Stress, sensors,
missiles, electronic warfare, drone networks). User ruling (2026-11-12): a world setting switches between the two.

## Roadmap
- **Part 1 — core rules audit + fixes** (this plan, below). Core stays the default and the rules without Rigger 2.
- **Part 2 — the switch + R2 basics**: world setting `vehicleRuleset` (core | rigger2, `requiresReload`, read through one
  `isRigger2()` helper like `isVR2()`); R2 vehicle attributes (p.22–24: Speed Rating, max = ×1.5), the Driving Test
  (p.20–21), Stress (p.25) incl. engine-customization failure Stress (customization ruling 9), repairs (p.25), dice
  pools and the VCR (p.16–18). Must settle speed storage first (R1 #20): core packs hold cruising speed (max in the
  notes), R2 rows hold the R2 Speed Rating (max = ×1.5); the plan defines which field each ruleset reads and what
  switching does to existing world vehicles (likely: the R2 ruleset requires R2 stats, offered via the Rigger 2
  stats window) before the setting ships.
- **Part 3 — R2 vehicle combat** (p.41–55): Maneuver Score, the turn sequence and Driver Points, vehicle actions
  (accelerate/brake, position, ram, hide, relocate), damage (impact, collisions, weapons, passengers, rigger damage),
  vehicles and magic.
- **Part 4 — R2 gunnery and sensors** (p.27–32, p.56–61): sensor tests and ranges, ECM/ECCM, gunnery (manual,
  sensor-enhanced), missiles, signature.
- **Part 5 — drones, EW, special operations** (p.33–36, p.62–72, p.77–80): draft 1 below, awaiting Codex review.
- **Part 6 — R2 advanced (optional) rules** (p.81–90), each behind its own world setting as VR2.0's options are: draft 1 below.
Each part gets its own plan section + Codex review before code, and its own release.

## Part 1 — core rules audit (SR2 core p.84–85, p.104–109, p.183)

### What exists today (checked against 110-dpi renders; numbers re-checked at 300 dpi before coding)
Vehicle Test dialog (handling / position / crash), crash resolution, ramming, escape, vehicle weapon damage
resistance (p.108 hard-target rules incl. barrier, APDS, AV), combat spells vs vehicles (TN 8, Body + ½ armor vs
Force), rigged initiative, vehicle damage modifiers (p.109), Gunnery dice, Control Pool (Reaction + 2 × VCR, VCR
required, cap = the skill's rating, p.85). **Correct as printed:** Crash Test Table (Open −1, Normal 0, Tight +2,
Restricted +4 — the book's own order), Impact Table, Ramming and Escape tables, Vehicle Damage Modifiers, crash
resistance (Body + ½ armor vs Power − armor, no Control Pool), escape logic, the Control Pool cap (p.85: "the
maximum number of Control Dice … is equal to his rating for the skill"; R1 #3 rejected).

### Foundation: who controls a vehicle (R1 #4, #9, #19)
A character's `rigging` is a bare boolean and `linkedVehicles` means "may use", not "is driving". New
`system.controlledVehicles` (UUIDs, ⊆ linkedVehicles) on characters, set by a Control toggle per vehicle on the
Vehicles tab (several drones at once, p.104). `controllerOf(vehicle)` = the character whose list holds it. Claims go
through ONE GM-side writer (the GM-queue pattern of vehicle-customize's `inGmQueue`), which removes the vehicle from
every other character's list in the same step (a player can't edit another player's character; concurrent claims
can't leave two controllers); unlinking a vehicle clears its control (R2 #1). Every rule below that needs "the driver/rigger" asks
`controllerOf`, never `game.user.character`: the VCR test modifier (only when that character is rigging AND controls
this vehicle), initiative (worst damage modifier among CONTROLLED vehicles only, p.106; applied to the effective
Reaction the vehicle tests default to as well, p.109), Control Pool for damage resistance (the controller's pool),
and who is offered a vehicle's Crash Test. A vehicle with no controller: the GM is offered the test and enters dice.

### Foundation: one vehicle damage commit (R1 #5–#8)
`commitVehicleDamage` (combat-spells.mjs, with its receipts) becomes THE vehicle damage path (moved to a vehicle
module); `rollVehicleDamageResistance`, `_resolveVehicleCrash`, the collision and manipulation paths call it with a
`source` (weapon | spell | crash | collision | manual) and an event id. Before writing it snapshots the vehicle's
pre-hit speed and damage level. After writing:
- **Destroyed by weapons/spells** (p.107 "automatic crash"): crash resolved without a test at the SNAPSHOT speed
  (`effectiveSpeed` is 0 once destroyed). Destruction supersedes the Serious prompt.
- **A Serious wound** (one application staged to S; ruling, documented: "takes Serious damage" = a Serious wound, not
  reaching the Serious row): during an active combat, a Crash Test is offered to the controller, at most once per
  vehicle per Combat Phase (key: combat id + round + initiative pass/phase; `once()` claim). Out of combat no prompt;
  the card says a Crash Test is due if this happened during action.
- `source: "crash"` and `"collision"` never trigger another crash (no recursion); manual monitor clicks trigger nothing.
- **Who may write** (R3 #1): controlling a vehicle doesn't make its player an owner of it (linking stores only the
  UUID). The controller's owner may roll a resistance for it; the commit itself (damage, receipt, the vehicle's
  claims) runs on the GM's client through the same GM writer as control claims, which re-validates first (the roller
  is that vehicle's current controller's owner or the GM, the event isn't resolved yet). EVERY vehicle damage commit,
  owners' included, goes through the active GM's per-vehicle queue (R4 #1: per-client queues don't serialize two
  clients), with snapshot → validation → damage → receipt → trigger decision inside that one queued step. A GM is
  always present at this table (standing assumption).

### Findings → fixes
1. **VCR modifier only out of combat and only when rigging** (p.183): "Rigger in control −(VCR Level × 2)" is a
   Vehicle Operation Table row, "apply only to non-combat situations". Today `rollVehicleTest` applies the implant's
   rating to Position and Crash Tests too, rigging or not. Fix: only the non-combat Handling Test, only when the
   tester is rigging and controls this vehicle.
2. **Handling Test modifiers** (p.183): the non-combat test uses the Position terrain modifiers, which the book never
   gives it. Fix: its dialog offers the Vehicle Operation Table — complex controls +1; unfamiliar vehicle
   (non-stressful +1 / stressful +3); large +2 / very large vehicle of type +3; bad +2 / terrible conditions +4; rigger
   −2 × VCR (automatic per 1) — plus the vehicle damage modifier (p.109) and other.
3. **Armour mods ignored by weapons** — `rollVehicleDamageResistance` reads `system.armor`, the crash/ram read
   `effectiveArmor` (armour mods counted once). Fix: `effectiveArmor` everywhere a vehicle's armour is read for play
   (grep all reads incl. the spell resist), one getter.
4. **Called Light hits** (p.108: Light weapons can't affect vehicles "unless using special ammunition or … called
   shot"): `vehicleHit` drops a called Light hit off the track unless APDS (R1 #16). Fix: a called shot (like APDS)
   floors the reduced level at L. Test: called Light hit, 0 staging successes → Light.
5. **Ramming** (p.107):
   a. The loser must MAKE a Crash Test; today the loser crashes outright (R1 #1). Fix: the loser's controller is
      offered the Crash Test (terrain, Control Pool); damage only on failure.
   b. Shared `vehicleSkillDice(actor, vehicle)` for every vehicle test: trained rating, else Skill Web, else Reaction
      +4 TN (ram today uses Reaction with no penalty); its rating is the Control Pool cap (p.85).
   c. Each side's TN adds its own vehicle's damage modifier (p.109).
   d. Opposed like melee (`renderMeleeAttackCard` pattern, R1 #10): the ram card holds the initiator's roll; the
      opposing controller's owner (or the GM when there is none) clicks "Resist ram" and rolls with their own Control
      Pool. Exactly-once: `once()` on the DEFENDING actor keyed by the card id (claims need an Actor, R2 #2); the
      card is closed by a public outcome receipt (`resolvesMessageId`, as the ranged/spell outcomes do), which also
      carries the loser's Crash Test offer.
6. **Control Pool spending** (R1 #11, R2 #3): the system's dice-owner convention (spell-defense.mjs): pool dice are
   debited only on the pool owner's client, inside one per-actor queue (`enqueueAttack("pool:<uuid>")`) that also
   runs `refreshDicePools` and the Position reservation writes: read live value → clamp → debit → roll exactly the
   debited dice. So a vehicle's damage resistance with Control Pool is rolled by its controller's owner (the card's
   Resist button is theirs; the GM's when there is no controller, without pool dice).
7. **Position Test dice stay out of the pool for the turn** (p.105, R1 #2): "the player removes the dice spent in
   the Position Test each time the pool refreshes". Each Position Test records its dice on the rigger per vehicle,
   idempotently by its message id: `flags.sr2e.positionReserve = {combatId, round, byTest: {msgId: dice}}` (a rigger
   with several drones makes several, R2 #4); `refreshDicePools` subtracts the SUM while that combat round lasts; a
   new round replaces the record.
8. **Position Test outcome** (p.105–106, R1 #18): intentions are chosen in secret, so the card does not ask for one:
   it lists all three outcomes for the successes (flee/pursue: successes × cruising speed m and ⌊successes/2⌋
   attacks per character, never more than that character's actions; fight: attacks = successes, ⌊successes/2⌋ ×
   cruising speed m to open or close). The Escape Test dialog picks the fleeing and pursuing vehicles' Position
   cards of the current round (no free entry unless no card exists).
9. **Crash passengers** (p.107, R1 #12): the crash card offers "Resist (passenger)" to every character; each resolves
   once for THAT actor (`once()` per actor): Power = the crash's, level = the vehicle's staged-down level, Body vs
   Power − Impact armour, no Combat Pool (a dedicated mode of the resistance roll). None if the vehicle resisted all.
10. **Moving Target Table** (p.108, R1 #17): the ranged attack dialog adds "Relative speed (p.108)": ≤ 0 / up to 2×
    +2 / 2–3× +4 / > 3× +6, in addition to the p.90 row ("additional"). Default when the target is a vehicle: target =
    its effective cruising speed; attacker = the firing vehicle passed by mounted-weapon callers, else a vehicle the
    attacker picks from their linked ones (passenger), else 5 (stationary). Always overridable.
11. **Hitting walls and barriers** (p.109, R1 #13, #14): "Hit an object" on a vehicle: speed in m/CT (default
    cruising; the GM enters more, e.g. the top speed from the notes), `impactDamage(speed)` = Power ⌊speed/10⌋ +
    Impact Table level (shared with the crash).
    - Wall / physical barrier (Barrier Rating): the vehicle resists like a crash; the barrier takes the impact as an
      attack of that Damage Code through `resolveBarrier` — **destroyed only when its rating reaches 0** (not
      "breached"). Reached 0 → the controller's Crash Test. Not 0 → occupants face the ORIGINAL impact Power at the
      impact level minus one (L minus one = nothing), whatever the vehicle resisted (R2 #6): only the passenger
      resistance MECHANICS of 9 are reused, not its gating or level.
    - Mana barrier (Force): no effect on the vehicle; an exposed rider (GM ticks "rider exposed") resists it as the
      wall with a mana mode: no armour, Combat Pool only if the rider was aware (GM tick). A spell barrier knocked
      to 0 is down; otherwise the card notes it rebuilds on the caster's next action.
12. **Damaging manipulations vs vehicles** (p.109, R1 #15, R2 #5): "as if they were regular weapons … They do not,
    however, suffer the reductions in Power and Damage Code." Reading: none of p.108's vehicle reductions apply — no
    barrier test, no Power cut by Body or armour, no level step-down. Resist: Body + ½ armour dice (the vehicle's
    resistance pool, Control Pool allowed) vs TN = the spell's Power; staging as for weapons. Today
    `resistManipDamage` rejects vehicles; the mode runs through single-target and area resolution and commits with
    the spell receipt.
13. **Autopilot commands** (p.104–105, R1 #21): "Command" on a vehicle: the GM sets the TN (Skill Success Table p.68);
    the vehicle rolls its EFFECTIVE Autopilot (`pilot` for drones, `autonav` otherwise); 1 success obeys, more
    successes = more latitude (stated on the card).
14. **Not automated** (help text): the driver's control Complex Action, breaking windows, relative-distance
    bookkeeping; the kph conversion (×1.2) is shown beside speed on the sheet.

### Checks (R1 #22)
Vitest: impactDamage; Vehicle Operation modifiers; vehicleSkillDice (trained / web / Reaction +4) and the pool cap;
moving-target bands; position outcomes; vehicleHit called-Light; the Serious/destroyed trigger decision (pure:
pre/post state + source + phase key → none | crashTest | autoCrash). Quench `sr2e.vehicles`, deterministic (rigged
dice): ram win/loss/tie → loser's Crash Test → damage only on fail; Position reservation survives two refreshes and
clears next round; destruction crash uses the pre-hit speed; one Serious prompt per phase, none from crash damage;
spell damage keeps its receipt; two passengers each resist once; barrier 0 vs not-0 branches; ram resolved by a
second user (GM) once. Lint; CHANGELOG, QA-PLAN, wiki + How-To, `npm run gen-guides`.

## Part 2 — the switch and Rigger 2's standard vehicle operations (R2 p.12–26, p.120)
_Draft 5 (2026-11-12), after Codex rounds 1–4 (log). Pages read from 100-dpi renders (PDF = book + 1 for
p.12–90); numbers re-checked at 300 dpi before coding. Two releases: **2a** (switch, Driving Test, Stress, repairs)
and **2b** (rigger-side rules, overhead)._

### 2a.0 Foundations
- **One vehicle writer** (R1 #19, #20): every new vehicle mutation (Stress, repair state, engine adjudication) is a GM
  op running in Part 1's per-vehicle queue (`vdmg:<uuid>`, the same one damage uses), validating permission and state
  INSIDE the queued step, and recording a receipt keyed by its event/job id so a retry or a GM reconnect never applies
  twice. Sheet edits of Stress go through the same op. Authorization per op: Stress Test → GM; Driving-Test
  consequences → the driver's owner (or GM); overhaul/repair rolls → a character the user owns, on a vehicle they own,
  control or are linked to (or GM); repair state changes → the vehicle's owner, its controller's owner, the repairer's
  owner or the GM; engine adjudication and engine replacement → GM.
- **Effective ratings and equipment** (R1 #4): Handling, Autonav, Pilot and Speed are the EFFECTIVE ones
  (`VehicleData.effective…`). "Has X" (Rigger Adaptation, Off-Road Suspension, Datajack Port, Engine Customization)
  = an item with that `modKey` that is working: factory, a Workshop design mod, or a customization in state `done`
  (not parts/tested/removed).
- **Effective R2 Speed Rating** (R1 #6): `r2Speed` = `effectiveSpeed` (mods and the p.50 damage reduction), halved
  (round down) off-road without off-road suspension; overspeed threshold = r2Speed, maximum = ⌊r2Speed × 1.5⌋.

### 2a.1 The switch
- World setting `vehicleRuleset`: `core` (default) | `rigger2`, `requiresReload`, read only via `isRigger2()`
  (module/vehicle-mode.mjs, try/catch like `isVR2()`). Offered with or without the Rigger 2 module; without it the GM
  gets a notice that vehicles keep their compendium stats.
- **Speed** (R1 #7): the stored `speed` is never rewritten. Under `rigger2` it is READ as the R2 Speed Rating (p.22:
  "the maximum safe Speed … for a sustained distance", the role core's cruising speed plays); labels/tooltips say
  "Speed Rating (Rigger 2)" vs "Cruising speed (core)". Vehicles taken from the R2 list carry its numbers; others keep
  theirs. User notes untouched.
- **The hybrid until Part 3** (R1 #8): under `rigger2` the core vehicle-combat actions — Position, Ram, Escape, the
  core Crash Test and the core crash/impact resolution (armour, no Control Pool, Power rounded down) — stay, each card
  and dialog labelled "core rules (Rigger 2 vehicle combat comes in Part 3)". They never incur Stress. Crash Tests that
  2a triggers (system failure) use that same core Crash Test. Part 3 replaces all of it.

### 2a.2 The Driving Test (R2 p.20–21, p.23) — `rigger2` only, a Complex Action
- **Who drives** (R1 #1, #3): a character (from the Vehicles tab) or, for a drone no rigger controls, the drone itself
  (vehicle sheet; Pilot replaces the skill, p.23: "the drone's Pilot Rating is substituted for the rigger's relevant
  skill"; no Control Pool, no Stress dice — no one to push it; Rule of One against Pilot).
- **Control mode** (R1 #1): manual / datajack / rigged, picked in the dialog; default rigged when `riggedInto` and the
  vehicle is adapted (drone or Rigger Adaptation), datajack when the character has a datajack and the vehicle a
  Datajack Port or Rigger Adaptation, else manual. A VCR user on an unadapted vehicle can only pick manual/datajack.
- **Dice:** vehicle skill (Part 1 defaulting; R2 half-modifier defaulting is 2b) + effective **Autonav** (a Driving
  Test is a non-combat maneuver, also under fire — p.23 excludes only vehicle-combat actions, Part 3) + **Control Pool**
  in rigged mode only, ≤ skill rating, spent on the pool client; dice put in may not resist damage (p.21, stated) +
  **Stress dice**: 1 per 2 Stress, at most Body Stress per action (Body 1 may take 2 for 1 die; Body 0 none).
- **TN:** effective Handling — off-road Handling for a ground vehicle off-road (R1 #5: when `handlingOffRoad` is null
  the dialog asks for it, never 0) — + unfamiliar +1; non-stressful −1; stressful +3; large +2 / very large +3;
  weather bad +2 / terrible +4; terrain open −1 / normal 0 / restricted +1 / tight +3; **action performed during combat
  +2** (R1 #2: a standard maneuver under fire); datajack mode −1; rigged mode −2 × VCR; vehicle damage modifier; other.
- **Resolution, exactly once** (R1 #9, #10): the purchased Stress is committed when rolling (Stress dice taken). The
  card has **Resolve** for the driver's owner (or GM), after any Karma: it reads the test's live dice and successes,
  closes the test to Karma and, in this order: (1) if it failed, the GM's Stress Test (2D6) against the Stress Rating
  as it stands after the purchased Stress — result < Stress → system failure; (2) Rule of One: 1s ≥ the skill (or
  Pilot) → +1D6 Stress, then if Stress ≥ 2 × Body → automatic system failure (p.26 Westwind: tested at 2, then 2→6
  fails). A system failure posts "major system fails (GM picks)" and Part 1's Crash Test due card. A cancelled roll
  does nothing. Resolve is claimed once per test through a Driving-Test claim op on the vehicle that admits the
  driver's owner, the controller's owner, or — for a drone driving itself — the drone's owner, or the GM (R2 #2; the
  Crash Test claim keeps its controller check).

### 2a.3 Stress (R2 p.25–26, p.120)
- Fields (R1 #15): `VehicleData.stress` and `stressPermanent`, integers, default 0 (legacy vehicles read 0; no
  migration, no roll on load); prepare clamps `stressPermanent ≤ stress`. Shown on the vehicle sheet and Vehicles tab
  under `rigger2`; the sheet's +/− call the GM op.
- **Incurred:** Driving Test (2a.2); **Exceed Speed** (+1 each time past the Speed Rating, up to ×1.5; tracking speed
  is Part 3); the GM's **Stress Test** button (2D6 vs Stress, "any time the vehicle is running").
- **Engine customization** (p.120, ruling 9; R1 #13, #14; R2 #3): completion of an engine customization becomes a GM
  op keyed by the installation attempt id. In the vehicle queue it (1) re-runs the existing finish checks, (2) makes the
  secret B/R Test (the installer's vehicle B/R skill vs 2 × the Installation TN, GM-whispered) and writes, in ONE actor
  update, the record `flags.sr2e.engineStress.<attemptId> = {source: <item id>, roll, points}` together with the Stress
  it adds, then (3) finalizes the item idempotently. The actor record is the proof: a GM pass on ready/vehicle update
  finalizes any "tested" engine item whose record exists (reconnect recovery), and a record is never rolled twice. Workshop: on
  create AND on a save that adds engine-customization levels to an existing design, the GM rolls 6 dice vs TN 6 for
  the added levels, recorded as `flags.sr2e.engineStress.<designCheckId> = {source: "design", levels, roll, points}`,
  never rerolled by later saves. Atomic (R3 #2): the Workshop's save sends the new design (levels, baked ratings) AND
  a pending check `flags.sr2e.pendingEngineChecks.<id> = {addedLevels}` in one update — a MAP, one key per save, so a
  second level-adding save adds its own key and never overwrites the first (R4 #1); the added levels are this save's
  diff against the LIVE actor's design read at save time, never the copy the Workshop loaded (R5 #1: after a factory
  replacement zeroes the levels, a still-open Workshop that saves its old levels adds them back and gets a check). Accepted
  limit: a replacement and a save in flight in the same instant (both clients mid-round-trip) are not serialized. The GM queue resolves each key separately and, in one update, writes its record +
  Stress and removes only that key (`-=<id>`). Keys left by an interruption are resolved by the GM pass on ready;
  factory replacement first resolves every pending key. On create, the pending key is part of the actor's data. `stressPermanent` = the sum of ALL records; a
  record leaves only through factory replacement (R3 #1: p.120 allows no other reduction — removing a customization
  item or design level keeps its permanent Stress). Legacy customized
  engines (installed before 0.147.0): a GM "Adjudicate engine" button on the vehicle sheet, once. Both rulesets.
- **Factory engine replacement** (R1 #12, R2 #1): GM "Replace with a factory engine": removes the aftermarket engine
  customization items AND sets the design's `choices.engineCustom` levels to 0 through the Workshop's own recompute (so
  the baked Speed/Acceleration/Load fall back), then deletes the engine records: their permanent Stress (and that much
  Stress) goes with them. This is the only way a record leaves.
- **Maintenance overhaul** (p.26, R1 #11): requires ticking "in a Vehicle Facility (SRII p.244, p.259)"; the vehicle's
  B/R skill (car B/R etc., by vehicle type) against Stress + 4; every 2 successes −1, never below 1 once the vehicle
  had Stress, never into the permanent part; parts 50¥ per point (shown; charged when a payer is picked).

### 2a.4 Repairing vehicles (R2 p.26; R1 #16–#18) — `rigger2`
A repair **job** on the vehicle (`flags.sr2e.repairJob`, written by the GM op):
1. **Quote:** boxes to repair; TN = boxes + 2; parts = boxes × 5% of the vehicle's total cost — `vehicleValue()` =
   its `cost` (which includes design and factory equipment) + the receipt amount of each delivered, installed
   aftermarket customization, each once — with the vehicle's Availability and Street Index; acquisition uses vehicle
   B/R (stated). Snapshotted in the job.
2. **Parts:** "Parts arrived" (owner/GM) after the Availability time; repair can't start before.
3. **Repair Test:** vehicle B/R vs the TN; time = 16 h × boxes ÷ successes; no success = try again. While the job is in
   progress the vehicle is marked unavailable on the sheet.
4. **Interrupt / resume:** "Take it back" (+1 hour to make it run, not counted) saves the remaining hours; "Resume".
5. **Finish:** removes the boxes (GM op, receipt = job id).

### 2b — the rigger (R2 p.12–19), draft 10 (2026-11-12, after Codex 2b rounds 1–9)
_2a is built (0.147.0). Pages read from 100-dpi renders (PDF = book + 1); every number re-checked at 300 dpi before
coding. Two releases: **2b-1** (pools, VCR and cyberware, qualities, Build/Repair tests) and **2b-2** (maintenance
overhead, mechanic labour). Gate: every rule below applies only under `isRigger2()`, EXCEPT (a) quality effects — the
quality item on the sheet is itself the GM's opt-in, and they touch the Matrix too — and (b) the multi-skill B/R rule,
because vehicle customization already uses Rigger 2 rules under both rulesets._

**2b.0 Identity, never names.** A quality's rule comes from a new `QualityData.rule` StringField (`blank: true`, choices
incl. "" — the StringField blank trap; reload + check `invalidDocumentIds` after the schema add), set in the R2
module's r2-qualities JSON: `vehicle-empathy`, `simsense-vertigo`, `sensitive-neural-structure`, `spike-resistance`,
`computer-illiterate`, `gremlins`, plus core/Companion qualities R2 touches if present (`adrenaline-surge`,
`bio-rejection`). Tiered values come from `pointValue` (|value|). Existing copies (B3 #3): the rule is DERIVED like
`wareRule` — `qualityRule(system.rule, compendiumSource)`: the explicit field, else a table of the R2 (and core/
Companion) pack UUIDs — so qualities already on actors work without a migration; the quality sheet gets a rule
selector for copies with neither. Ware: add `encephalon`, `cerebral-booster` and `vcr`
keys to `WARE_SOURCES`/`wareRule` where detection is name-based today (`mods.vcrLevel`), keeping the old detection as
the fallback. Move-by-wire keeps its existing identity (`move-by-wire:<level>`, Phase 4's `wareLevel`/working checks —
B1 #7): no new key. **Content gap:** Vehicle Empathy (Edge, 2, p.16) is
missing from the R2 module's r2-qualities pack: add it (R2 module release alongside).

**2b.1 Dice pools (p.16; replaces core p.84–85 under rigger2).**
- **Control Pool** = Reaction + the VCR's enhancement; "indirect modifiers from cerebral boosters and encephalons
  apply" = Reaction from Intelligence including the Intelligence they raise. Quickness is the NATURAL one (B3 #1): no
  ware Quickness — muscle replacement/augmentation and move-by-wire's own Quickness bonus excluded (today's
  `naturalReaction` reads `quickness.value`, which includes them: fixed under rigger2), cyberlimb averages as the Reaction
  branch already uses. Nothing else adds (wired reflexes etc. never). Core keeps today's formula. Settles R1 #21. Tested
  with real MBW items.
- **Move-by-wire with a VCR** (p.17–18, Monkeywrench example): effective VCR for Reaction/Initiative = max(0, VCR −
  MBW level) (−2 Reaction and −1D6 per level); Control Pool = Reaction + 2 × VCR − MBW level (VCR 3, MBW 1: +4/+2D6,
  pool 9 of 10; MBW 3: no bonus, pool 7; MBW 4: pool 6). The MBW level is the Phase 4 `wareLevel`; a disabled MBW
  (`mbwDisabled`) doesn't count ("assuming the move-by-wire system has not negated it" — read as: the rig still gives
  its pool). Derived in `_calculateDicePools` and the rigging Reaction branch, both directions (derived-state rule).
- **Combat Pool on Gunnery** via a rig: capped at the Gunnery rating (or the concentration/specialization level in
  use) — `_gunneryAttackDice().skillCap` already caps; verify every vehicle-weapon path passes it, defaulting included
  (R2 says "cannot exceed the character's Gunnery Rating": a defaulting gunner with no Gunnery gets none).
- **Control Pool use**: Maneuver Tests and resisting damage aimed at the character's vehicle; never firing vehicle
  weapons or sensors. Today's pool-spend sites are checked against this list; the damage-resistance use arrives with
  R2 vehicle combat (Part 3) and is noted, not built.
- Task Pool (Shadowtech) and IVIS Pool (Part 5) don't exist in the system: out of scope, stated in the docs.

**2b.2 The VCR and other cyberware (p.12, p.16–18).**
- **Half-modifier defaulting** (p.12): a character with a VCR, jacked in (`rigging`) and controlling the vehicle BY
  THE RIG (the test's actual control mode: `rigged`, never manual/datajack — B1 #6), defaulting from Reaction or a
  Vehicle Skill/Concentration to a Vehicle Skill/Concentration takes +1 per web dot instead of +2 (Car → Motorboat, 4
  dots: +4 not +8); Reaction (attribute) default at half the attribute penalty (+2 for the core +4). Not to/from
  non-vehicle skills (incl. Vehicle B/R). p.12 restricts the SOURCE and the DESTINATION, not the nodes in between
  (B2 #1): the web search keeps each candidate's source kind/key (`_webDefaultForNode` returns it); a vehicle-skill or
  Reaction source to a vehicle-skill destination costs +1 per dot along its whole path; every other source +2. `_vehicleSkill(vehicle, { mode })` takes the mode; callers
  without a mode (core Position/Crash) pass `riggedInto` as rigged. Existing return fields kept; pure helper + Vitest.
- **Rigging versus decking** (p.16): a character with a working VCR who decks takes +1 to every TN while in the
  Matrix and their Hacking Pool is reduced by the VCR level (both Matrix rulesets; Otto: VR2 pool 4 → 2). Exempt when
  the character has a second, decker datajack (new character boolean `deckerJack`, shown with the VCR) or has switched
  a reflex-triggered VCR off (new VCR item boolean `reflexTrigger` (+13,000¥, +0.2 Essence, factory only — never
  retrofitted) and character boolean `vcrOff`, a Simple Action toggle; off = no VCR at all: no rigging, pool, Reaction).
  The +1 sits in `testTnModifiers` next to the existing `computing` test, on Matrix tests (`tnContext.kind ===
  "matrix"` or the actor in `matrixMode`). Prerequisite (B3 #2): the VR2.0 Hacking Pool is ⌊(Intelligence + MPCP) ÷ 3⌋
  (VR2.0 p.18, checked at 300 dpi), but the system computes Computer + Reaction under both Matrix rulesets — an
  existing VR2.0 bug, fixed in its own patch release BEFORE 2b (Intelligence with ware/magic increases; the optional
  Multiple Improvements rule and Task Pool dice are noted, not built). Otto's 4 → 2 is an actor-level test.
- **Encephalon and skillsofts** (p.17): a rigger with an encephalon may run Driving (vehicle) activesofts without
  skillwires, only while rigging. `skillsoft` capacity code gets that exception for vehicle-skill activesofts, AND
  `_vehicleSkill` resolves the skill the way skill tests do — a chipped (synthetic) vehicle skill counts — so the chip is
  actually rolled (B4 #1; this also covers skillwire users today). A chip running ONLY by the encephalon exception
  keeps that provenance (`viaEncephalon`) and is never applied globally: `_vehicleSkill(vehicle, { mode })` uses it
  only when the test's mode is `rigged` (B7 #1); manual/datajack tests see the native skill (or default). Test: an encephalon rigger with no native skill and
  no skillwires rolls the chip's rating while rigging and defaults otherwise.
- **Reflex recorder** (p.17): no effect on a Driving skill while controlling by VCR. The system doesn't automate
  reflex recorders today — verify; if it does, suppress while `riggedInto`.
- **Improved datajacks** (Perception dice) → Part 4. **Cybermancy rigger-zombies** (p.18: lost in details on
  Perception TN 4+, IMS after 2 failed Willpower tests): if Phase 6 automates "lost in the details", apply the rigger
  thresholds while rigging; else a docs note.

**2b.3 Qualities (p.14–16), effects by `rule`.**
- `vehicle-empathy`: −1 Handling (TN) for a character in PHYSICAL contact (B1 #5): manual controls, or jacked into
  the vehicle itself (datajack, or rigged into a non-drone vehicle). Rigging a drone (remote) never counts. The Driving
  Test dialog shows "in physical contact" defaulted from the mode, the GM may untick it; core vehicle tests use manual
  /rigged-non-drone.
- `simsense-vertigo` (B2 #2): +1 to all TNs and −1 Initiative while operating a simsense device: automatically while
  rigging (jacked in) or decking (`matrixMode`), and +1 on an attack that uses a smartlink; for anything else (display
  links, simrigs, a smartlinked weapon held ready) a character toggle "Using simsense" applies both.
- `sensitive-neural-structure` / `spike-resistance`: effective Willpower −1/−2 (value 2/4, never below 1) / +1 per 2
  points when resisting neural damage: black IC, dump shock (core + VR2), BTLs; rigger dump shock in Part 5. One helper
  `neuralWillpower(actor)` used by every such resistance roll (enumerated in the build).
- `computer-illiterate`: +1 TN on tests that involve an electronic device (B1 #8): a NEW `electronic` context, not
  the cyberphobia `computing` predicate (which matches every B/R): Computer, Electronics, Computer B/R, Electronics B/R,
  Matrix tests, and Driving Tests in datajack or rigged mode (a simsense interface). Everything else stays the GM's
  (card note); "the GM may require Success Tests (TN 2 or 3)" is a note.
- `gremlins` (value −1/−2/−3/−4): a GM "Gremlins check" on the quality: 2D6, on a 2 the card states, per tier (B1
  #10): 1 pt — a +1/−1 modifier against the character on Success Tests and effect values (Power, Flux, MPCP…); a Simple
  Action banging it on a hard surface and it works normally DURING the character's next Combat Phase only (B5 #1). 2 pt — it doesn't
  work; a Simple Action jolt brings it back in the character's next Combat Turn. 3 pt — major malfunction, ±2 against
  the character until repaired (cost × 0.2 + labour, see the mechanic). 4 pt — breaks down; only a major overhaul
  (cost × 0.5 + labour). A driven vehicle: one major subsystem or modification fails (GM rolls or picks). No effect on
  cyberware, bioware or magical equipment; hermetic libraries on electronic media can be hit. Never auto-rolled. The
  R2 pack's Gremlins notes (which mention an impossible 2D6 result of 1) are corrected.
- `adrenaline-surge`: no effect while rigging or decking or driving by datajack (only if the system automates it).
- `bio-rejection`: a character may not have both it and a VCR — a warning (sheet + chargen), never a block.
- Blind/Deaf/Night Vision/Night Blindness: values and notes only (rigging sight is Part 4).

**2b.4 Multi-skill Build/Repair tests (p.14).** When a task needs several B/R tests (customization installation):
all must succeed; a passed test is KEPT and only the failed skill is rolled again, its TN +1 for each repeat. The
penalty is DERIVED from durable failure records (B1 #9, B4 #2): a failed required test is recorded ONLY when another
required test of the same attempt has succeeded (p.14: "if one required B/R test succeeds and another fails"; B9 #1 —
an attempt where every test fails is an ordinary failure, no record, no +1); a record is written on the item as
`custom.brFails.<testMessageId> = {worker, skill, rating}` in the SAME GM-queue update as the partial result (keyed by
the test, so a replay adds nothing); the penalty for (worker, skill) = the number of its records whose `rating` ≥ the
worker's current rating in that skill (a raised skill clears it). Records outlive attempts (only the partial results
reset) and go with the item. A failure rolled before any other test passed is recorded retroactively when a later test
of the same attempt succeeds (same GM-queue update).
Time reduction combines the successes of all required tests (as today). Any required test of all 1s = **disastrous
failure**: the attempt ends, the card says so, the GM rules (parts stay unless the GM removes them). Partial results
are committed through a GM op in the vehicle queue that checks the live item and attempt id (no lost update when two
clients install the same item).

**2b.5 Maintenance overhead (p.18–19; release 2b-2).** Redesigned after B1 #1–#4.
- **Months are GM-advanced**, world-wide: a hidden system setting `vehicleOverheadMonth` (integer, config: false), raised
  only by the GM's **Month ends** (Settings-free button in the GM's vehicle tools); month m's id is the integer.
- **Stress this month** (B1 #4, B2 #3): a per-vehicle counter `flags.sr2e.overhead.stress` that EVERY Stress writer
  increases by its positive delta in the SAME update as the Stress itself: the GM Stress op, `drivingResolve`'s Rule of
  One, `recordEngineCheck`; decreases (overhaul, replacement) don't touch it. One helper builds the update, and a test
  greps that no other code writes `system.stress`. Starts at 0 (legacy baseline = 0, stated).
- **Cost value** (B1 #1): "the vehicle's base nuyen value plus the value of all its accessories and modifications" at
  their LISTED prices, not what was paid (Street Index, Availability): new `overheadValue(vehicle)` = the vehicle's
  listed cost (design and factory equipment included) + each installed aftermarket customization's list price
  (re-quoted without Street Index; never the receipt) + every other accessory on the vehicle at its listed cost —
  mounted weapons (and their ammunition/mount items), sensors, gear items (B6 #1) — except items flagged as part of the
  design or factory equipment (already in the vehicle's cost). `vehicleValue` (2a repairs, "total cost") is unchanged.
- **Month ends** is convergent (B3 #5) and one GM writer's request (B6 #2): the button sends `{requestId,
  expectedMonth: m}`; the active GM, in one world-level queue, advances ONLY if the setting still equals m (a replay or a
  second click with the same expected month gets the earlier result back, never a second advance). Each vehicle carries
  `flags.sr2e.overhead.assessedThrough`; the GM raises the setting to m+1 only when every vehicle has
  `assessedThrough` = m (else it first resumes them), then assesses each vehicle behind, and the GM's ready pass resumes
  any vehicle still behind. Each per-vehicle step (in its queue,
  idempotent by month id) writes
  `flags.sr2e.overhead.months.<m> = {amount: ⌈value ÷ 100⌉ + 10 × stress, paid: false, missed: false, tx: null}` and
  resets the counter; any OLDER month not paid — reserved or not (B2 #6: reservation is separate from delinquency) —
  gets `missed: true` and adds 1 Stress (eventId `overhead-missed-<m>`, counted in the new month), once each.
- **Paying** (character sheet, Rigger 2; owner of a character the vehicle is linked to — B1 #2): the dialog lists due
  and missed months of the character's linked vehicles; Lifestyle discount (Middle 200, High 1,500, Luxury 3,000 per
  month, distributable — B1 #3: the character's use per month is `flags.sr2e.overheadDiscount.<m>`, capped at the
  lifestyle's allowance across split payments); Good Karma at 500¥ a point (`karma.current`, permanent spend).
  Transaction `tx`: (1) GM op **reserve**, ALL OR NOTHING (B2 #5): each chosen month, vehicle by vehicle in its queue,
  gets `tx` if unpaid and unreserved; if any is refused, the months already reserved by `tx` are freed (nothing was
  charged) and the payment aborts; (2) inside the payer's `moneyQueue`, the receipt slot
  `flags.sr2e.overheadReceipts.<tx>` is checked (a `released` marker → abort), then ONE character update: nuyen −X,
  `karma.current` −K, discount usage, receipt `{months, amount, karma}`; an EXISTING receipt for `tx` means already
  charged: skip straight to settle (B3 #4, no replayed debit); (3) GM op **settle**: months reserved by `tx`
  with a receipt → `paid`. Recovery: the GM's pass on ready settles reserved months whose receipt exists. **Release**
  (B2 #4, the customization `cancelRequested` pattern): the GM or payer requests it; the PAYER'S money writer
  acknowledges inside the same `moneyQueue`: no receipt → it writes `{released: true}` in the slot (so a charge that
  hasn't run yet aborts), then the GM frees the months; a receipt → settle instead. A second payer's reserve of a
  reserved month is refused (no double charge).
- **Catch-up** (p.19; B2 #7, #8): a missed month is paid like any other, but the current month must be paid too —
  already (its record `paid`) or in the same transaction. A PAID MISSED month then offers **Restore** until it
  succeeds: each attempt is RESERVED first on the month in the vehicle's GM queue (`restoreTx`, refused while another
  attempt holds it — B7 #2), then spends 1 Good Karma (its own receipt in the payer's `moneyQueue`, ruling: Karma per
  attempt; an existing receipt = already spent) and makes a Vehicle B/R (4) Test; failure frees the reservation for the
  next attempt; a reservation with a receipt but no result is recovered by the GM pass (the test is re-asked, the Karma
  not re-spent); a reservation WITHOUT a receipt (payer disconnected, or the Karma debit failed) is freed only by the
  same **Release** protocol as payments (B8 #1): the payer's money writer, inside its `moneyQueue`, writes
  `{released: true}` in the restore receipt slot (so a late debit aborts) or reports the receipt (→ recover instead),
  then the GM clears `restoreTx`; the GM or payer can request it from the month's row; success → −1 Stress (Stress op, eventId `overhead-restore-<m>`) and the month's
  `restored: true` in the same GM step. The overhead is never charged twice.
- Josie's examples are three separate checks (B1 #11): 6,413 total; Middle → 6,213; 4 Karma (no lifestyle) → 4,413;
  Luxury → 3,413.
- **Mechanic labour** (p.19): the repair job (2a.4) and the customization installation get an optional mechanic:
  Level 1 100¥/h (overtime beyond 8 h/day, 5 days/week at ×1.5), Level 2 50¥/h no overtime, Level 3 25¥/h (or free,
  GM's grant); the labour cost is QUOTED on the card with the hours (parts are quoted, not charged, as in 2a). Contact
  fee and campaigns outside Seattle: GM, noted.

### Checks (R1 #22)
Vitest: Driving Test dice/TN (Whiz Kid p.21: TN 8, 8 dice; with Autonav 2 and Rotor 6 → 6 + 2), datajack/rigged
modes, Stress dice caps (Body 3 → max 3 Stress → 1 die; Body 1 → 2 → 1 die; Body 0 → none), the Westwind ordering,
r2Speed (damage, off-road, suspension), overhaul floors, vehicleValue, repair time/parts, engine failure stress.
Quench: legacy vehicle reads Stress 0 and a null off-road rating prompts; a drone drives itself on Pilot; Resolve once
(second click refused; Karma reroll before Resolve counts); a non-owner controller's driver resolves through the GM;
damage and repair Finish on the same vehicle serialize; engine completion twice → one roll; Workshop redesign adding
a level → one roll, a later save none; switching ruleset with a pending repair job keeps it. Docs as Part 1.

2b Vitest: Control Pool with/without MBW (Monkeywrench p.18: 10 / 9 / 7 / 6), half-modifier defaulting (Deacon
p.14: +8 → +4; Reaction default +2; not via datajack; not B/R), rigger decking (Otto p.17: VR2 Hacking Pool 4 → 2, +1
TN; exempt with a decker datajack or VCR off), quality effects (Empathy −1, Vertigo +1/−1, SNS/Spike Willpower, Illiterate
+1), Gremlins outcome by value, multi-B/R repeats (+1 per repeat, reset on a rating rise, all 1s disastrous), overhead
(Josie p.18–19 as three scenarios: 6,413; Middle 6,213; 4 Karma 4,413; Luxury 3,413; Crawler 13), neglect/catch-up,
mode-sensitive defaulting (manual and datajack never halved), Empathy refused for a remote drone. Quench: a quality's `rule`
survives the schema add (no invalid documents); VCR off removes rig and decking penalty; overhead: two payers reserve
the same month → one charge; an interrupted pay (receipt, no settle) is settled by the GM pass; a reservation without a
receipt is released; a Restore reserved but interrupted before its Karma receipt is released (a late debit aborts) and
the next attempt can reserve; Month ends twice for the same id → one assessment; an unpaid month → 1 Stress once; the Stress
counter counts only this month's positive deltas; B/R retry penalty survives a new attempt and resets on a rating rise; an attempt where all
required tests fail adds no penalty;
mechanic quote on a repair card.

### Out of scope (Part 2)
Acceleration/braking and current speed (Part 3, p.22/p.45); R2 combat, R2 crashes and impact (Part 3); sensors (Part 4).

## Part 3 — Rigger 2 vehicle combat (R2 p.41–55), draft 13 (2026-11-13, after Codex Part 3 rounds 1–12)
**Status:** plan APPROVED at Codex round 13. **3a shipped in 0.150.0** (code approved at Codex code round 3). **3b shipped in 0.151.0** (code approved at round 5). **3c shipped in 0.152.0**: Part 3 complete. 3a.8 as
built gates only the Position and Escape Tests (what 3a replaces); ram/crash and the explicit-ruleset card plumbing
ship with 3b.
_Read from 100-dpi renders (PDF = book + 1); every table re-checked at 300 dpi before coding. R2 p.41: "replaces the
system described on pages 105–9" of the core book. Everything below applies only under `isRigger2()`; under core,
Part 1's vehicle combat is untouched. Three releases: **3a** (the chase: Maneuver Score, the turn, accelerate/brake,
positioning, hiding, relocating, passengers' phases, NPC groups), **3b** (damage: levels, rigger feedback, impact,
ramming, crashes, walls, pedestrians, weapons, passengers), **3c** (vehicles and magic). Gunnery, sensors and the
moving-target modifier stay as they are until Part 4; drones driving themselves are Part 5._

**User rulings (2026-11-12):** R3-1 a driver defaulting on the Driver Points Open Test rolls the default's dice, no
penalty; R3-2 speeding costs 1 Stress once per Combat Turn spent above the Speed Rating; R3-3 rigger feedback is
resisted with Body, no armour, Combat Pool allowed; R3-4 passengers resist the COLLISION's damage code (after the
rammer's Body × successes cut, which is part of that code), even when the vehicle staged it away; "vehicle-related
reductions" = seat belt / restraint, APPS, crash cage. Further rulings below are marked **(ruling)**.

### 3.0 The chase record and transactions
- **A chase belongs to a Foundry Combat**: `flags.sr2e.chase` on the Combat document, written ONLY by the active GM
  through GM ops, in ONE queue per combat (`chase:<combatId>`). **Lock order** (B6 #1): `chase:<combatId>` →
  `vdmg:<vehicleUuid>`, never the reverse. Every write that affects a chase vehicle's speed, ratings or damage —
  chase resolutions, the turn close, AND `commitVehicleDamage` for a vehicle that is an entry in an active chase —
  runs inside the chase queue (damage then takes `vdmg:<uuid>` inside it); damage to a vehicle in no chase takes
  only `vdmg` once routed (routing itself is under `chase-membership`, below). `chaseResolve` holds the chase queue from stamp validation through its awaited
  Combat update, so no damage can land between the check and the write, and an `overCheck` is computed inside the
  same queue against the speed the chase record holds at that moment. No step ever waits on another client while
  holding a queue: a stage that needs a player's ack (cancels, refreshes) returns and resumes later. Players' clients read it and ask. **Keys are opaque
  entry ids** (randomID; never uuids — uuids contain dots, B1 #3); uuids are values:
  - `entries.<eid>` = `{ kind: "vehicle"|"pedestrian", uuid (vehicle or character; token actors allowed), driver (uuid
    of the character OR NPC driving it, token actors allowed; B1 #5), rigged (bool, derived at action time from the
    driver's `rigging` + VCR), speed, terrain, autonav (bool), group (gid|null), aboard: [uuids], rev }`.
    **One entry per document** (B6 #3): a vehicle or pedestrian uuid appears in at most ONE entry of ONE active chase
    in the world, and a character is aboard at most one vehicle. Membership changes are serialized by ONE
    world-wide queue, `chase-membership` (B7 #1; every chase GM op runs on the active GM, so one queue there orders
    them all): `chaseAddEntry`, aboard changes and entry removal run inside it, check every active combat's chase
    and refuse a uuid already present. **No transfers** (B9 #2–#3): the book has no rule for moving a vehicle between
    two simultaneous chases, and carrying a turn's DP, reservations, bonuses, contact and receipts across correctly
    is a large cost for a case no table needs, so `chaseTransfer` is dropped (rounds 7–8's transfer records with it).
    To move a vehicle, the GM removes it — allowed only under `chase-membership` → that chase's queue with no
    non-terminal action or DP slot for it; its records for the current turn stay in the source chase (Stress already
    charged stays charged) — and adds it to the other chase, where a new entry gets `joinedRound` = that chase's NEXT
    round: it takes part from that round's opening (no DP, no actions, no speeding check before), so nothing of one
    turn is ever counted in two chases.
    **Damage routing** (B8 #3): `commitVehicleDamage` for ANY vehicle runs inside `chase-membership`: it looks up
    the vehicle's chase there, then takes that chase's queue (if any) and `vdmg:<uuid>`, so membership can't change between lookup and
    commit. (Damage commits are short GM-side writes; one world-wide order for them is fine at table scale.)
    Lock order: `chase-membership` → `chase:<combatId>` → `vdmg:<vehicleUuid>`. So `driverOf`, the damage-speed lookup and every receipt keyed by entry are unambiguous.
  - `pairs.<pid>` = `{ pursuer: eid, quarry: eid, distance, contact: true | { hiddenBy, successes, round, npcTurns } }`.
  - `turns.<round>.<eid>` = `{ vp, tp, sp, dp: null | { value, messageId }, dpSlot, positionBonus, escapeBonus, ms,
    over (the vehicle was above its Speed Rating this turn) }`.
  - `actions.<aid>` = one record per vehicle action (below). `opened.<round>` / `closed.<round>` = that turn's open /
    close ran (B2 #2: a Positioning bonus may create `turns.<r+1>` early; it never counts as opened).
  - Every entry and pair has a `rev`, bumped by any change to its speed, terrain, autonav, distance, contact or driver.
  - `transition` = `{ from, to, seq, stage: "closing"|"advancing"|"initiative"|"pointing"|"refreshing"|"opening",
    refreshed: {actorUuid: true} }` while a round change is in progress (B3 #6, B4 #1).
- **Driver identity** (B1 #5, B2 #7): `entry.driver` is set on the panel (default `controllerOf(vehicle)`; an NPC or a
  token actor may drive). ONE resolver, `driverOf(vehicle)` = the active chase entry's driver, else `controllerOf`, is
  used by every vehicle path under Rigger 2: `riggedInto`, `mayResistFor`, damage-resistance pool selection
  (`rollVehicleDamageResistance`), crash claims and Crash Tests, rigger feedback, and the driver's damage Initiative
  penalty (`worstControlledInitMod`, extended to a manual driver's vehicle). Authorization for an entry's actions: the
  GM, or an owner of the driver actor (relocation: of the acting aboard character, 3a.5). Skill dice come from
  the driver (`_vehicleSkill`, available on every SR2EActor); an NPC driver adds its `professionalRating` dice to Success
  Tests and the Open Test (p.44), and has no Control Pool.
- **Action transactions** (B1 #4, B2 #3–#4): a vehicle action is
  (1) the GM op `chaseBegin {combatId, round, eid, kind, actor, target, expectRevs}` → in the chase queue: checks the
  live round, the driver (or acting character), that no action involving the entry or its target is "rolling",
  "publishing" or "resolving" (B3 #5, B5 #1: one at a time; a resolving action's effects finish first), and that the entry/pair revs equal
  `expectRevs`; computes and STORES the immutable test inputs (TN parts, opponent MS, speeds, distance, terrain,
  autonav) with the revs and a **vehicle stamp** per vehicle involved (driver uuid, damage level, effective Handling,
  Acceleration, Speed Rating, Autonav, Body, Armor, Signature — B3 #4): `actions.<aid> = {eid, round, kind, actor,
  inputs, revs, stamps, state: "rolling"}`; returns them, so the dialog shows exactly what will be rolled;
  (2) the acting client spends any Control Pool (3a.2) through its pool writer with a spend receipt keyed by the
  action id in a SEPARATE ledger, `flags.sr2e.chaseSpend.<aid>` (B7 #2) — not `positionReserve.byTest`, whose
  entries are turn-long reservations that `_refreshDicePools` holds back. Ordinary action dice are spent like any
  pool dice and come back at the next refresh (p.44); only DP allocations are held for the turn. The receipt is
  idempotent and supports the same acked void protocol as DP slots (B6 #2); then the client arms and rolls at those inputs,
  the message carrying
  `flags.sr2e.chaseAction = {combatId, aid}`;
  (3) the GM op `chaseResolve {combatId, aid, messageId}` reads the roll FROM the message; refuses if the action's
  round is closed or not the live round (B4 #3) or the action isn't in "publishing" (B5 #1: a roll exists only
  after `chaseArm`); refuses (state "stale") if
  any rev it depended on changed since begin, or any vehicle's LIVE stamp differs from the stored one (weapon damage or
  a driver change made outside the chase queue shows up here); else in ONE Combat update writes the chase changes (speed, contact, bonuses,
  entitlements, `over`) together with `state: "resolving"` and the immutable result + its pending external effects
  (Stress, damage, follow-ups), each with a deterministic event id — and RELEASES the chase queue; (4) each external
  effect is applied idempotently by its id through its own normal path (`adjustStress`; `commitVehicleDamage`, which
  takes membership → chase → vdmg itself) — **never while the caller holds a chase queue** (B9 #1: that would
  invert the lock order and deadlock); (5) the chase queue is taken again to write `state: "done"`. The GM's pass
  (ready, and the closing stage) works the same way: under the chase queue it only reads which actions are
  "resolving" and which effects are pending, releases it, applies them, and re-enters; the closing stage completes
  only on a pass that finds nothing resolving or pending. It replays the effects of every "resolving" action and resolves "publishing" ones whose message exists; ones with
  no message can be cancelled by their actor or the GM. Publication is serialized with cancellation exactly like a
  DP slot (3a.2, B4 #4): before posting, the acting client calls `chaseArm {aid}` (rolling → "publishing" in the chase
  queue); cancel is accepted only in "rolling" (never while publishing) and becomes terminal only after the acting
  actor's pool writer acknowledges it inside its spend queue — `chaseSpend.<aid> = "void"` if nothing was spent yet (a
  late spend under that id is then refused), else the amount spent, which stays spent (B6 #2; identical to the DP
  protocol in 3a.2). A publishing action whose client vanished can be force-cancelled by the GM (acking as the
  pool writer), which writes a tombstone `state: "cancelled"`, and any card that later arrives for
  a cancelled id is refused by `chaseResolve` and marked on the card "cancelled — not counted". A retry is a new aid.
- **Rolled steps — one protocol for EVERY roll in Part 3** (B12 #1–#2; generalizes the DP slot and action protocol
  above so no roll is handled ad hoc). A rolled step is any roll whose result another step depends on: chase actions,
  DP Open Tests, Crash Tests, every vehicle Damage Resistance Test (crash, automatic crash, BOTH vehicles in a ram,
  weapon/spell damage under Rigger 2), every occupant/pedestrian resistance, rigger feedback resistance. Each has a
  parent record (the action, slot, crash or effect) and goes:
  1. **reserve** — the parent's owning queue (chase queue, or `vdmg:<uuid>` for crash/vehicle records, or the
     occupant actor's writer for occupant records) grants ONE exclusive attempt `{attemptId, roller (user), state:
     "reserved"}`; a second request while an attempt is live is refused (the button shows "being rolled by …");
  2. **spend** — any pool dice through the roller's pool writer with a receipt keyed by `attemptId` (idempotent;
     voidable with the acked protocol above);
  3. **arm** — the owning queue moves the attempt to "publishing" (refused unless "reserved"); only then is the
     roll made; the card carries `attemptId`;
  4. **record** — the owning queue records the result from the card (`rolled {messageId}`), refusing cards for
     any other or cancelled attempt (marked "not counted");
  5. **apply** — effects derived from the parent id, applied by their owning writers with receipts (above).
  Recovery (the GM's pass): an attempt whose card exists is promoted to `rolled`; one with no card is cancelled
  (acked void) and a NEW attempt may be reserved only when its roller is no longer active or the GM forces it; a
  `rolled` parent proceeds to apply; nothing re-rolls once a card exists. The crash transaction (3b.3) therefore
  holds two rolled steps in order — the Crash Test, then (on failure or an automatic crash) the vehicle's Damage
  Resistance Test — and computes the vehicle-damage effect only from the second's recorded result; a ram holds one
  resistance step per vehicle.
- **Turn lifecycle bound to `SR2ECombat`** (B1 #1, B2 #1, B4 #1–#3): `SR2ECombat.nextRound` is refactored into ONE
  staged, resumable round change used by EVERY combat (chase or not, so there is one path to test), each stage
  idempotent and recorded in `transition` (on the combat's chase flag; a combat without a chase keeps the same
  record under `flags.sr2e.roundTransition`). For a chase under Rigger 2 it runs as the GM op `chaseAdvance
  {combatId, from}` in the chase queue; it is a no-op unless `combat.round === from` or a transition from `from` is
  in progress. Stages:
  1. **closing** (chase only) — the pass over round r: actions with a message resolve; actions in "rolling" without a
     message, actions in "publishing" without a message, actions in "resolving", and DP slots that are
     open/publishing/cancelRequested must reach a terminal
     state first. The stage does not complete until they do: the panel lists what it is waiting on, with the GM's
     cancel for each (cancel = tombstone, 3a.2). Then the close (distances, counters) → `closed.<r>`. From the moment
     `closed.<r>` is written, `chaseResolve`, `chaseDPDone` and `chaseBegin` for round r are refused (they also check
     the live round and that no transition has passed "closing" for their round).
  2. **advancing** — today's boundary step unchanged in substance: clear defeated Initiative, `processCombatBoundary`
     with `seq` (stored in `transition.seq` before the call, so a resume reuses it; the elemental counters already
     dedupe on seq), then ONE update `{round: r+1, turn: null, boundarySeq: seq, phaseSeq}` (skipped if the round is
     already r+1), then any recovery cards.
  3. **initiative** — every living combatant whose `flags.sr2e.initRound !== r+1` rolls (the combatant's own
     Initiative formula, i.e. `_getInitiativeParts`, so Step 5's driver rules apply) and the total + `initRound` are
     written in the same Combatant update; a resume rolls only the ones still missing. The "Combat Turn r+1" card is
     posted once (`once()` claim keyed by combat + round).
  4. **pointing** — `_pointAtFirstLiving`.
  5. **refreshing** — the existing pool-refresh mode for combatants ("round": all; "action": the opening combatant);
     PLUS, for a chase, the deduplicated union (by actor uuid, unlinked tokens kept distinct) of every driver, every
     actor aboard a chase vehicle, and every pedestrian, whatever the mode (p.42: "the dice pools of all drivers,
     passengers and pedestrians are refreshed"). **Exactly once per document** (B5 #3): each refresh runs through
     that actor's POOL WRITER (its active owner, else the GM — the same writer and queue `spendPosition` uses) and
     writes a receipt `flags.sr2e.poolRefresh = "<combatId>:<r+1>"` in the SAME update as the actor's pool values;
     each focus item gets the same receipt in the same item update as its `spent` reset. A refresh skips any
     document already carrying the receipt, so a resume (or a duplicate request) never refreshes twice and never
     restores dice spent after the first refresh. `refreshed.<uuid>` on the transition only records that the
     writer confirmed; the receipts are the truth. While a transition is between "advancing" and the end of
     "refreshing", pool spends for that combat's participants are refused ("the turn is changing — try again"),
     so nothing is spent against pools about to refresh. `refreshDicePools()` outside a transition (the sheet
     button, the existing modes) is unchanged.
  6. **opening** (chase only) — the open → `opened.<r+1>`; then `transition` cleared.
  The GM's ready pass resumes an unfinished transition from its stage. `startCombat` runs initiative → pointing →
  refreshing → opening for round 1, where refreshing keeps today's start-of-encounter rule (B6 #4): EVERY
  combatant's pools refresh unless the mode is "off" (p.84: all pools full at the first Combat Turn), plus the chase
  union; the mode-dependent subset applies only to later rounds. The panel's "End turn" calls `nextRound`. Existing combat tests (elemental
  boundaries, defeated combatants, pool modes, phase counter) run unchanged against the staged version, plus
  interruption tests that stop after each stage and resume.
  **(ruling)** The system keeps Foundry's Initiative roll at the round's start; the book's order (Driver Points step 4
  before Initiative step 5) has no mechanical effect except that passengers' limits need the DP, so a passenger can't
  act offensively until their vehicle's DP is recorded (3a.6) and the DP dialog is offered at the round's start.

### 3a.1 Maneuver Score (p.41–42)
- **Vehicle Points** (Vehicle Points Table, 20 rows): a new `VehicleData.r2Class` StringField (`blank: true`, choices =
  the rows + "") set on the vehicle sheet; blank = derived `r2ClassOf(vehicle)` from a reviewed chassis → class table
  in `module/rules/vehicle-combat-rules.mjs` (Workshop/Vehicle List chassis), else by `vehicleType` (ground → car, rotor
  → helicopter, aircraft/vectored thrust → small airplane, boat → small motorboat, hovercraft → ACV); a drone with no
  class → 0 and a panel warning (drones: Part 5). Reload + `invalidDocumentIds` check after the schema add.
- **Terrain Points**: open 0, normal −2, restricted −4, tight −10 (the entry's terrain).
- **Speed Points** = ⌊current speed ÷ 10⌋.
- **Driver Points** = an **Open Test** (p.42): dice = the driver's vehicle skill (`_vehicleSkill(vehicle, { mode })`;
  defaulting: the default's dice, R3-1) + the Control Pool dice allocated (step 3) or, for an NPC, its Professional
  Rating; keep the highest die, Rule of Six (re-roll 6s and add). Pure `openTest(dice)` (Rich: 6,6,4,3,1 → 16). Plus
  last turn's Positioning successes (3a.4) and any Escape Bonus (3a.5). A pedestrian's MS = Quickness (p.41).
- **MS** = VP + TP + SP + DP, fixed for the turn. Rigger X (p.44–45: 26 + 11 = 37; 25 + 8 = 33; 25 + 15 = 40) is a test.

### 3a.2 The Combat Turn (p.42–44) and Driver Points
- Step 1 (first turn: starting speeds and distances) and the pairs are on the GM panel (combat tracker header, GM only):
  add vehicles/pedestrians, drivers, aboard lists, groups, speeds (parked = 0; players declare their own starting speed,
  the GM sets NPCs' and any incapacitated driver's, p.42), distances, terrain.
- **Driver Points** (B1 #2, B3 #7): (1) `chaseDPStart {combatId, round, eid}` reserves the slot (`turns.<r>.<eid>.dpSlot =
  {id, driver, state: "open"}`; refused if a live slot or a DP exists); (2) **arm**: the driver's pool client spends the allocated Control Pool
  through `spendPosition(driver, n, slotId, { combatId, round })` — **extended** to take the combat and round explicitly
  (existing callers keep `game.combat`), to be IDEMPOTENT by test id (an existing `byTest[slotId]` returns that amount,
  no second debit, B2 #5), and to validate the slot with the GM record before debiting; `positionReserved` reads the
  reservation's OWN combat (`game.combats.get(combatId)?.round === round`), never `game.combat`. The dice are held out of
  the pool until the turn ends (p.44); the next round's refresh (B2 #1) returns them before DP opens;
  then calls `chaseArm {slotId}`, which moves the slot open → "publishing" in the chase queue (refused unless
  "open"); only after that does the client roll; (3) the Open Test card carries the slot id; (4) `chaseDPDone {slotId, messageId}` records the DP (`state: "done"`).
  The GM's pass reconciles: a slot whose card exists (found by the slot id in its flags) is completed from the card.
  **Publication and cancel** (B4 #4, B5 #2): no roll is made before the slot is "publishing". Cancel (driver or GM)
  sets `cancelRequested`; the slot becomes terminal ONLY when the driver's pool writer acknowledges inside the same
  queue `spendPosition` debits in: it writes `byTest[slotId] = "void"` on the actor (if no debit happened yet) or
  reports the amount already debited (those dice stay held until the turn ends: committed). `spendPosition` reads
  `byTest[slotId]` on the actor inside that queue, so a delayed debit after the void is refused — it can never
  spend the next turn's refreshed dice against a cancelled slot. Only after the ack does the GM write the tombstone
  `cancelled`; the closing stage waits for it (cancelRequested is not terminal). If the driver's client is gone, the
  GM is the pool writer and acknowledges itself. A "publishing" slot completes from its card, or the GM force-cancels
  it through the same ack. `spendPosition` stays idempotent by slot id. `chaseDPDone` and the reconcile pass refuse any card whose
  slot id is a tombstone (the card is marked "cancelled — not counted"), so a cancelled attempt can never produce a
  second DP; a new attempt is a new slot id, allowed only when the vehicle's live slot is a tombstone. NPC drivers: the GM rolls from the panel. No Karma rerolls on an Open Test.
- **Step 5, Initiative** (p.44): under Rigger 2, a character DRIVING a vehicle in the chase who isn't jacked in rolls
  natural Reaction (the 2b natural-Quickness Reaction) + 1D6 — no wired/boosted reflexes, adept powers or magic; a
  jacked-in rigger keeps the VCR's (2b); passengers and pedestrians unchanged; the vehicle damage Initiative penalty
  (3b.1) as today. In `_getInitiativeParts`.
- **Step 7, close of turn** (`chaseCloseTurn`): for EVERY pair, in contact or not (p.44 step 7 has no exception; B10
  #1), distance −= pursuer speed − quarry speed (not below 0). A pair out of contact (hidden) keeps changing
  distance, shown only on the GM panel, so relocation (3a.5) starts from the true distance; the GM can edit and change terrain afterwards); NPC relocation counters advance.
- **Speeding Stress** (R3-2, B2 #6): `turns.<r>.<eid>.over` is set when the turn opens with the vehicle above its
  damage-reduced Speed Rating, or when any resolution leaves it above; the Stress has ONE receipt for every path,
  eventId `chase-over-<combatId>-<round>-<eid>`, applied as a resolving effect when `over` is first set and replayed at
  close of turn if missing (braking or crashing later in the turn doesn't undo it). **Damage lowering the Speed
  Rating** (B4 #5): when `commitVehicleDamage` changes the damage level of a vehicle that is an entry in an active
  chase under Rigger 2, the same commit records a pending effect `overCheck {combatId, round, eid, speed,
  speedRating, over}` — the speed and the post-damage Speed Rating at that moment and the computed `over = speed >
  speedRating` (B5 #4), immutable — with its own event id; it is applied in the chase queue from that stored
  result (never re-compared with live ratings): if `over`, set the turn's `over` and apply the speeding Stress with the SAME receipt id as above (so it
  is charged at most once per turn whichever path finds it first). The GM's ready pass replays pending overChecks,
  and the closing stage applies any still pending before closing, so later braking or a crash can't erase it.
- **Action costs** (p.45, B1 #16): accelerating/braking, positioning, ramming, hiding and performing a non-driving
  action are Complex Actions — every action card says so. **Autonav on/off** is a Simple Action, a Free Action for a
  rigger jacked in: a per-entry toggle (vehicle sheet / Vehicles tab) that writes `entry.autonav` through the chase op
  and says which action it cost.

### 3a.3 Accelerating / braking (p.45–46)
Driving Test (skill dice — no Autonav dice: the p.46 cruiser rolls skill + Professional Rating only) vs Handling + the
**Accelerate/Brake Target Modifiers Table** (MS vs the highest-MS opponent among the entry's pairs: exceeds by ≤10 −2,
≥11 −4; opponent exceeds by ≤10 +2, ≥11 +4; fleeing more than one pursuer +1 per additional; above its Speed Rating +1;
autonav active + Autonav Rating; terrain −1/0/+1/+3; a rigger jacked into this vehicle −VCR) + the vehicle damage TN
modifier (3b.1: "all tests that involve the vehicle"); the driver's wounds come from `rollSuccessTest`. Unallocated
Control Pool may be added (p.44). Resolve (B3 #2): accelerating adds Acceleration × successes but can't take the speed
above the damage-reduced Speed Rating × 1.5 (a speed already above it isn't raised further, nor forced down); braking
subtracts it (not below 0). **Ram entitlement** (B3 #1): a speed change (either way) of at least 2 × the distance to
an opponent in one of its pairs (p.45 "equal to or greater"; p.47's own wording "greater than" is the same case for the
example's 110 > 2 × 50) lets the driver ram it on the next available action (3b.2) — Rigger X brakes to ram a pursuer. Examples p.46
(TN 5, +36 → 286; cruiser TN 6, +42 → 317; 31 m closed) are tests.

### 3a.4 Positioning (p.47)
Driving Test vs Handling + the **Positioning Target Modifiers Table** (above Speed Rating +1, autonav + Rating, terrain
−1/0/+1/+3, VCR −rating) + damage. The successes always add to the driver's Driver Points next turn
(`turns.<r+1>.positionBonus`). **Stop at a point** (B1 #9) is an option of the same test: the GM enters the distance;
successes × Acceleration ≥ distance → the vehicle is there and stops (speed 0); otherwise it is short by the rest and
its speed is unchanged **(ruling: the book says only how far it gets)**. Cruiser #1 (TN 5, +1 next turn) and Josie
(56 of 140) are tests.

### 3a.5 Hiding and relocating (p.48–49)
- **Hiding**: Driving Test vs Handling + the **Hiding Target Modifiers Table** (MS −2/−4/+3/+6, above Speed Rating +2,
  autonav + Rating, escaping more than one +1 per additional, terrain +4/+2/0/−2, VCR −rating) + damage. Success →
  every pair where it is the quarry loses contact (`{hiddenBy: aid, successes}`); **Escape Bonus** = the successes,
  added to its DP each turn until that pursuer relocates it or gives up (Mach 6: TN 4, 4 successes).
- **Relocating**: a Perception Test (Intelligence; sensors are Part 4) by a character in the pursuing vehicle vs the
  hiding vehicle's Signature + the pursuing vehicle's damage TN modifier (B3 #3) + the **Relocating Target Modifiers Table** (relocating MS exceeds ≤10 −2, ≥11 −4; hiding
  MS exceeds ≤10 +2, ≥11 +4; vehicle above its Speed Rating +4; autonav active −Rating as printed; + the hiding test's
  successes; the hiding vehicle's terrain −3/−1/0/+3). Success → contact restored; the pursuer's driver and passengers
  may act against it on their next actions. NPC pursuers try for 5 Combat Turns then give up (close of turn); a player
  gives up on the panel. Relocation goes through the same transaction with kind "relocate" and `actor` = the aboard
  character making the test (B2 #8): authorized for an owner of THAT character, who must be aboard the pursuing entry.

### 3a.6 Passengers (p.49)
- `entry.aboard` lists the characters in the vehicle (the panel; the driver is listed too). **Only the rigger** — the
  driver jacked into the vehicle (B1 #10) — is exempt: every other aboard character, a manual driver included, may take
  no offensive action (shooting, casting spells) in a Combat Phase higher than the vehicle's Driver Points, and can't
  hold actions to get round it; while the DP isn't recorded yet, none (3.0 ruling).
- Enforcement: the combat tracker marks those combatants; weapon attacks and spellcasting refuse such a roll (GM override
  with a confirm). Blade (17 vs 11) is a Quench test.

### 3a.7 NPC groups (p.49)
The GM may group NPC vehicles with one goal: one roll for the group; the group's Maneuver Score uses the FASTEST member's
statistics; +1 TN per additional vehicle on the group's tests. Each member keeps its own speed (B1 #15): a shared
result applies to each member with its own statistics (Acceleration × successes for each).

### 3a.8 The core paths under Rigger 2 (B1 #19)
`rollVehicleTest` (Position/Crash), `rollVehicleRam` and `rollEscapeTest` keep their signatures plus an optional
`{ ruleset }`. Called WITHOUT one under Rigger 2 (a new action, a macro) they refuse with a message naming the R2 action.
Every vehicle-combat card stores `ruleset` at creation (cards without it are core); its buttons pass it EXPLICITLY down
the whole chain — the roll, `rollVehicleDamageResistance`, `resolveCrash`, `commitVehicleDamage` and its follow-ups,
and the damage-modifier lookups (`vehicleDamageMods(level, ruleset)` replaces the getters' implicit setting read,
B2 #11) — so an old core card resolves by core after the switch. The Driving Test (2a) stays for non-combat maneuvers.

### 3b.1 Vehicle damage levels and rigger feedback (p.49–50)
- **Vehicle Damage Modifiers Table** under Rigger 2: Light +1 TN / −1 Initiative / no reduction; Moderate +2 / −2 /
  Speed Rating −25%; Serious +3 / −3 / −50%. `damageTnMod`, `damageInitMod` and the Speed Rating read the ruleset's
  table; max = reduced Speed Rating × 1.5.
- **Rigger feedback** (B1 #12): EACH damage application to a vehicle whose (staged) Damage Level is Serious → the rigger
  jacked in controlling it resists 6M Physical; an application that destroys it → 6S (R3-3: Body, no armour, Combat Pool
  allowed). A follow-up record in the SAME damage commit (`flags.sr2e.vfollow.<eventId>.feedback = {rigger, code,
  state: "pending"}`); resolved once per rigger (receipt).
- **Follow-up delivery** (B2 #10): the active GM's pass, in the vehicle queue, posts each pending follow-up card with
  `flags.sr2e.vfollowId = <eventId>.<kind>`; before posting it looks for a message with that id (reconcile) and, if found,
  marks the follow-up `posted` instead; after the create returns it marks `posted` with the message id. An interruption
  between create and mark is healed by the reconcile; nothing is claimed before the card exists.

### 3b.2 Impact (p.50) and ramming (p.47–48)
- **Impact damage**: Power = speed ÷ 10 rounded UP (148 → 15); Damage Level by the **Impact Damage Levels Table** (1–20
  L, 21–60 M, 61–200 S, 201+ D); a ram uses the DIFFERENCE in speed. Resisted with Body dice + Control Pool (≤ the
  driver's driving skill), TN = Power, no armour or other reduction; every 2 successes stage down one level.
- **Ram entitlement** (B1 #8, B2 #9): the target must be closer than the rammer's Acceleration Rating, or the rammer
  holds an entitlement from an acceleration (3a.3) = `{target, fromAid, after: {round, turn}}` valid for the driver's NEXT
  available action — the driver combatant's next turn in the combat tracker after `after` — and consumed then whether
  used or declined (the GM's combat-turn hook drops it when that turn passes without a ram). No other expiry.
- **Ramming Test** vs Handling + the **Ramming Target Modifiers Table** (MS −2/−4/+2/+4, above Speed Rating +1, autonav
  + (Rating + 2), terrain −1/0/+1/+2, VCR −rating) + damage. Success → a collision event `vcol.<aid>` snapshotted in the
  action record: both vehicles' speeds, the occupants of both, the rammer's successes. Both resist impact at the speed
  difference; the rammer's Power is reduced by its Body × the ramming successes (min TN 2; Mach 6 2S staged away;
  Cruiser #2 15S, 0 successes → Serious). A vehicle that takes damage from the ram makes a Crash Test (3b.3). A
  pedestrian target: 3b.5. Walls: 3b.4.
- **Passengers** (R3-4, B1 #11): every occupant in the collision's snapshot resists the COLLISION's code (the rammer's
  after its Body × successes cut; the target's as rolled), even when the vehicle staged it away, with: restraint (seat
  belt) −1 level (per-occupant checkbox on their resist dialog, off by default), the vehicle's **APPS** halving the
  Power (round up), a **crash cage** +6 dice, IMPACT armour reducing the Power, Body dice, no Combat Pool, plus the
  Control Pool dice the rigger used on the Crash Test (crash damage only). The resist buttons are on the event card,
  bound to the snapshot; one receipt per occupant per event. 15S → 15M → 8M → 5M (p.51) is a test. APPS and crash cage
  are found by `modKey` (keys checked in the R2 catalog at build).

### 3b.3 Crashing (p.51–52)
- **Triggers** (B1 #7), classified per damage EVENT, recorded as a pending follow-up in the SAME commit
  (`flags.sr2e.vfollow.<eventId>.crash`): damage from a ram (source "ram"); Serious damage from a single attack (a
  weapon or spell event whose staged level is Serious); the monitor reaching Destroyed (below). Crash damage itself (source "crash") never triggers another. No per-phase dedupe under Rigger 2: each
  qualifying event is its own. **Destroyed** (B2 #13): from a weapon or spell attack → the vehicle crashes automatically
  (p.53); from any other qualifying source (a ram, a collision) → a Crash Test (p.51); crash damage never recurses.
  Cards post through the follow-up delivery (3b.1).
- **Speed source** (B1 #6): every damage event and Crash Test card snapshots the vehicle's CURRENT speed (the chase
  entry's speed; outside a chase, the GM enters it on the card, default 0 = parked) and the chase/event ids; the crash
  resolution uses that snapshot. Core defaults are unchanged.
- **Driving Success Tests keep today's context** (B10 #2, B11 #1): every Part 3 test the book makes a Driving Test
  (as each section above names it — accelerating/braking, positioning, the ram, the Crash Test) builds its TN on `rollVehicleTest`'s existing
  base — Handling + damage modifier + the defaulting penalty `_vehicleSkill(...).penalty` + Vehicle Empathy (Handling
  −1 in physical contact, R2 p.16) + the electronic/skill note — and adds only its own table's modifiers. R3-1's
  no-penalty default applies to the Driver Points Open Test alone. Relocation keeps its Perception Test against
  Signature (3a.5) and wall collisions keep their own procedure (3b.4): neither is a Driving Test.
- **Crash resolution is one recoverable transaction** (B10 #3), keyed by the follow-up id `fid` (=
  `<eventId>.crash`), stored on the vehicle (`flags.sr2e.crashes.<randomID>` holding `fid`, written in `vdmg:<uuid>`):
  `claimed` (who rolls; the card's button) → `rolled {messageId}` (the Crash Test card carries `fid`) → `resolving`
  {the immutable outcome + pending effects: speed 0, vehicle damage, each occupant's damage, each with an event id
  DERIVED from `fid` — `<fid>:speed`, `<fid>:vehicle`, `<fid>:occupant:<uuid>`} → `done`. Effects apply by those ids
  (idempotent: `commitVehicleDamage` takes the derived id instead of minting a fresh one). The GM's pass reconciles
  each state (B11 #2): a `claimed` record is first matched against messages carrying its `fid` — a card found
  promotes it to `rolled`; with no card it is reopened (the button returns) only when its claimer is no longer
  active or the GM forces it; a `rolled` record resolves from its card; `resolving` replays its effects.
- **Occupant damage is its own recoverable step** (B11 #3; replaces today's claim-then-roll `occupantResist` for
  every vehicle-occupant resistance, crash and impact alike): each occupant effect `<fid>:occupant:<uuid>` is a
  record `pending` → `rolled {messageId, result}` → `done`, whose roll is a **rolled step** (3.0: exclusive attempt
  reserved on the occupant's writer before any pool spend; the card carries the attempt id). The damage is
  written by the occupant actor's writer in ONE actor update together with the receipt
  `flags.sr2e.dmgReceipts.<randomKey> = <effectId>` (checked first: a present receipt means already applied). The
  pass reconciles per the rolled-step recovery and applies `rolled` ones through the receipt check, serialized on
  the occupant's writer. One authoritative result per effect, never applied twice. Today's `crashTestFromCard` / `resolveCrash` are reshaped into these steps, for core and Rigger 2 alike.
- **Crash Test** = Driving Test vs Handling + the **Crash Test Modifiers Table**: vehicle damaged + its damage modifier;
  terrain −1/0/+2/+4; speed vs the driver's Reaction: < ×20 0, < ×30 +1, < ×40 +2, more +4 ("driver wounded + Damage
  Modifier" is the wound penalty `rollSuccessTest` adds — not doubled). Autonav dice (= Rating) and Control Pool (≤
  driving skill) may be added. Cruiser #2: 4 + 3 + 4 + 2 = 13. Failure → speed 0, impact damage at the snapshot speed
  (300 → 30D), resisted as 3b.2 (armour doesn't help); occupants as 3b.2.

### 3b.4 Walls and barriers (p.52)
Barrier Rating × 20 vs the speed: ≤ → the vehicle halts; standard crash damage (impact at its speed) for it and its
occupants. > → it breaks through, LOSES speed = Barrier Rating × 20 and keeps going; damage Power = the Barrier Rating,
level from the speed lost (Impact table); restrained occupants take no damage, unrestrained ones resist as 3b.2. Under
Rigger 2 this replaces Part 1's "Hit" for walls. **Barrier spells** (p.54, B2 #15): a physical barrier is a wall with
Barrier Rating = the spell's Force for the vehicle and everyone aboard; a mana barrier ignores the vehicle and its
enclosed occupants, but an exposed rider (bike, open top) hits it as a wall with Barrier Rating = Force through this
same R2 procedure (not `resolveBarrier`'s core path). Cruiser #2 vs 16: 320 ≥ 300 → stops.

### 3b.5 Pedestrians (p.52–53)
The pedestrian resists Power = speed ÷ 10 at ONE level higher than the Impact table (Destroyed → Power + half, rounded
down); impact armour reduces the Power; Combat Pool allowed; hardened or military-grade armour (a checkbox) → no level
step-up. The vehicle resists one level LOWER than the table (1–20 none, 21–60 L). Rex Karz (60 m/turn → 6S) is a test.

### 3b.6 Weapons against vehicles (p.53)
`r2VehicleHit` (pure) replaces `vehicleHit` under Rigger 2, with the same inputs (`ratedLevel`, `calledShot`, staging,
`apds`, `antiVehicle`, `basePower`) and the same caller callbacks/receipts (B1 #13):
- A weapon RATED Light can't affect a vehicle unless it uses special ammunition (APDS and the like; a called shot does
  NOT bypass it under Rigger 2, B2 #12 — components are their own rule below); any
  other weapon's level drops one (D→S, S→M, M→L) — a Moderate weapon does Light damage. Grenades and explosives too;
  anti-vehicle munitions keep their level.
- Armour reduces the Power fully (AV: by half, rounded down); a weapon whose standard Power (unaugmented by burst/full
  auto) doesn't exceed the armour does nothing (AV excepted).
- Resistance: Body dice + Control Pool (≤ the driver's driving skill) vs TN = the modified Power; standard staging
  against the attacker's successes; no damage AND Control Pool dice > the attacker's successes → a complete miss.
  Serious from one attack → Crash Test (3b.3); full monitor → crashes; Body 0 → any success destroys it.
- **Called shots at external components** (B1 #14, B3 #8): a Called Shot against the component, the Damage Code
  unchanged (the usual step-up is cancelled by the vehicle's level reduction). Resolved as ordinary vehicle damage
  (above) unless the GM enters SEPARATE Body/Armor ratings for that component (p.53: "certain components … may have
  separate"), in which case those are used for the resistance. The attack must cause Moderate or worse to destroy the
  component (the GM may set Light for fragile parts, Serious for reinforced ones); the card states whether it's
  destroyed. Whether a hit on a component with its own ratings also marks the vehicle's monitor is the GM's call (the
  book is silent) — the card offers "also damage the vehicle".
- **Optional terrain-based Control Pool limits** (p.53): world setting `r2ControlPoolTerrain` (default off): on vehicle
  Damage Resistance Tests, Control Pool ≤ driving skill (open/normal), ⌈skill ÷ 2⌉ (restricted), ⌈skill ÷ 3⌉ (tight).
- **Attacks against passengers**: Power − the vehicle's Armor or Body, whichever is higher; no level change; no Combat
  Pool; a rigger jacked in who is targeted +3 TN on the resistance; a Deadly hit on a passenger also gives the vehicle
  Light damage, unresisted (through `commitVehicleDamage`, its own event).

### 3c Vehicles and magic (p.53–55)
- **What spells affect**: only physical spells affect vehicles; mana spells don't, nor a rigger jacked in unless the
  caster can see the rigger. A spell affects the whole vehicle (no targeting a wheel); an area spell its passengers and
  cargo too.
- **Resolution** (B1 #17): the caster's Spell Success Test vs TN 8; the vehicle's Spell Resistance Test = its Body dice
  (+ Spell Defense dice allocated to it) vs a TN by spell type; the spell takes effect only if the caster has MORE
  successes (a tie fails); damage stages by the net successes as for spells against characters.
  - **Damaging manipulation**: like an ordinary weapon: Damage Level −1, Force (Power) − Armor; TN = that (min 2); a
    Power reduced to 0 or less does nothing (the "no effect before it leaves his hands" case).
  - **Physical combat spell**: like an AV weapon: no level change, Force − ⌊Armor ÷ 2⌋, TN never below 2 (Armor 4,
    Force 2 → TN 2, p.54).
  The existing card plumbing (`manipulationVsVehicle` in vehicle-play-rules, net staging, `beforeRoll`, outcome marks)
  is kept: R2 branches inside it.
- **Spells at characters in vehicles** (B1 #18): open vehicles (bikes, open-topped) — targetable with line of sight;
  enclosed occupants can't be targeted by a spell that needs line of sight, EXCEPT damaging manipulations (which need
  none, p.54); tinted windows let occupants see and cast OUT while blocking sight IN; blown-out windows of cars, trucks,
  buses open the view; windows of campers and the like give only +4 Partial Cover; an armoured vehicle's vision slits
  are too small to target through even blown out, and most APCs have no windows (B2 #14). The
  spell dialog, when the target is aboard a vehicle in a chase, shows these as a checklist (enclosed / windows blown /
  partial cover +4) that sets the modifier or refuses the cast.
- **Natural domains**: a vehicle and its passengers are in the domain they travel through; a shaman needs no line of
  sight to command a nature spirit against them if BOTH are in its domain; a spirit can't act against a vehicle that
  leaves (except a great or toxic nature spirit); a shaman who leaves the domain forfeits the remaining services (the
  spirit finishes its last command). Actionable GM guidance on the spirit card, plus the existing spirit-services
  forfeiture as the GM's button.
- **Casting from a moving vehicle** (p.55, B4 #6): restricted +2, tight +4, combat environment +2 (open/normal 0) —
  only against characters or objects OUTSIDE the caster's vehicle. Automatic when the caster is aboard a chase vehicle
  with speed > 0 and the target is known to be outside it (a token/actor not in that entry's aboard list and not the
  vehicle itself); none when the target is aboard the same vehicle; when membership can't be told (an untracked
  target, an area spell, no chase), the spell dialog asks "target outside the vehicle?" and applies the modifier only
  on yes (B1 #18).
- **Astral projection from a moving vehicle** (p.55): a magician returning to a body in a moving vehicle makes an
  Intelligence (8) Test; failure misses (try again); if the route isn't known, finding the body is the core search
  (p.146, the GM). Offered as a button when a projecting character's body is aboard a moving vehicle (or the GM
  says so).

### Checks
Vitest: open tests (Rich 16); MS (37/33/40); every modifier table row; accelerate (Mach 6 TN 5 → 286; cruiser TN 6 →
317, 31 m); positioning (stop: 56 of 140, speed kept; reached → 0); hiding (TN 4) and relocating (+4); impact (148 →
15S; 300 → 30D); ram (2S staged away; 15S Serious); passengers (15S → 5M) incl. vehicle-escapes case; crash TN 13; walls
(stops; break-through loses BR×20, Power BR); pedestrians (6S; D → Power + half; vehicle one lower); weapons (rated
Light none, Moderate → Light, armour, AV half, complete miss, Body 0); spells (tie fails; combat Force 2 vs Armor 4 →
TN 2; manipulation to 0 → nothing); casting modifiers; R3-2 once per turn. Quench: two vehicles + a pedestrian through
two rounds (DP once per slot, concurrent DP starts → one; held Control Pool returned next round; close of turn once even
if called twice; distances; speeding Stress once); stale/duplicate `chaseResolve` refused; resume of an action whose
message exists; passenger refused at phase > DP, the rigger not, a manual driver yes; ram → both resist → Crash Test
pending survives a reload → crash → occupants (one receipt each, vehicle staged to nothing still offers them); rigger
feedback per event (two Serious hits → two); weapons; spells; an old core card resolves by core after the switch; core
path unchanged with the ruleset off.

## Part 4 — Rigger 2 sensors, electronic warfare and gunnery (R2 p.27–32, p.56–61), draft 2 (2026-11-13, after Codex Part 4 round 1)
_Read from 110-dpi renders (PDF = book + 1); every table re-checked at 300 dpi before coding. Everything below applies
only under `isRigger2()`; the core attack flow (incl. the p.108 Moving Target Table) is untouched under core. Two
releases: **4a** (sensors, Flux and range, ECM/ECCM/ED/ECD, locks), **4b** (gunnery modes, missiles, indirect fire,
signatures). Builds on Part 3's chase and staged round change and on Part 3b's damage records._

**User rulings (2026-11-13):** R4-1 the ECM Test uses the ECM suite's Flux per the p.30 table (rating × 1.5, round up:
ECM 3 → 5 dice); the p.32 example's "Flux 10" is a misprint. R4-2 a sensor lock and an ECM/ED result hold **until
contact is lost**: the target hides from that observer (Part 3a), leaves the transmitter's range, the observer's or
the emitter's equipment is switched off or stops working, or the GM clears it — not merely at the end of a Turn.

### 4.0 Records and transactions
- Everything here is written by the active GM through GM ops in the vehicle queue (`vdmg:<uuid>`), like Part 3b:
  **reserved event ids, immutable roll inputs, a revision per record, terminal receipts**. A roll is a rolled step
  (Part 3.0): reserve → spend → arm → card → record; a card for a superseded or cancelled reservation is "not counted".
- Identities are key-safe and token-aware: `followId(actor.uuid)` (unlinked token actors stay distinct).
- Validity (R4-2) is CHECKED on read (range, hidden contact, equipment working, GM clear marker); a stale record is
  ignored, never mutated in place by a reader.
- **Baseline Signature** = `VehicleData.effective.signature` (installed modifications included); contextual EW is a
  separate per-observer term and never changes the actor's derived data (4a.5).

### 4a.1 Sensor ratings, components and footage (p.27–28)
- Sensor Rating = `system.effective.sensor`. Components by rating (p.27): 0 rangefinders, ultrasound, laser proximity;
  1 + proximity detectors, video (not trideo) cameras, basic radar, signature-recognition, low-light and telescopic;
  2–4 + thermographic; 5+ + flare compensation; magnification 50 × rating. A pure `sensorComponents(rating, upgrades)`.
- **Component upgrades** (p.27): stored on the R2 Sensors item as `system.components = { magnification: levels,
  flareCompensation: bool, … }` (rigger-2 module schema add, blank allowed); parts cost = original sensor cost × 0.10
  × levels; installed through the existing customization request flow (installation rules unchanged). The base
  rating is untouched; components add only their own capability (Skyrie: 15,000 × 0.10 × 2 = 3,000¥).
- **Footage** (p.28): rating 1+ systems transmit/record 2D audio/video only if the vehicle has storage (onboard memory
  or a computer), a video recorder for chips, or a remote-control link for transmission; onboard recorders/computers
  must be connected through an Electronics Port (R2 p.139 item). 2 Mp/min (1 for audio- or video-only); enlargement
  up to Sensor × 20; footage used in a Perception Test +1 TN. Shown as guidance on the panel with which of those the
  vehicle has; the +1 is an option on Perception Tests.

### 4a.2 The Sensor Test and locks (p.28, p.30, p.58)
- Dice = Sensor Rating; TN = baseline Signature (vehicle) / 6 (a character) / the Critter Signature Ratings Table or
  size rule (p.61) / a GM value, + the observer-specific EW term (4a.4–4a.5) + the Sensor Test Modifiers Table: direct
  LOS −2, urban (sensor or target in a built-up area) +1, fog/smog/precipitation +1, restricted terrain +1, concealed
  by a spirit + its Force, tight terrain +2, sensing vehicle damaged + its damage modifier. Min 2. A Complex Action
  (p.58). Results Table (0–4+) printed on the card.
- A target beyond the sensors' effective range (4a.3) can't be tested (GM override with a stated distance).
- **Lock**: a Sensor Test with ≥1 success creates a lock record on the sensing vehicle,
  `flags.sr2e.locks.<targetKey> = { id, successes, messageId, inputs, rev }`, valid per R4-2.

### 4a.3 Flux and range (p.30–31)
- **Transmitters** are the vehicle's working devices with their own identity (item id): sensors, ECM, ECCM, ED, ECD,
  radios, remote-control decks. Flux Rating Table: RC deck 2; sensors/ECM-family rating × 1.5 rounded up; other
  transmitters the device rating; cyberware 0. Any device may run lower (to 0).
- **Boosts** (p.30): `flags.sr2e.fluxBoosts = { [itemId]: { engine, amplifiers: { [ampItemId]: n } } }`, written only by
  the GM op `fluxBoost`, which validates the WHOLE allocation in one vehicle-queue step against the live vehicle:
  engine boost only for a device connected through an Electronics Port; per device ≤ ⌊Body ÷ 2⌋; total engine ≤ Body;
  each amplifier's total ≤ its rating (R2 `power-amplifier`); every referenced item installed and working. Readers
  re-check the same rules and ignore (and flag on the panel) an allocation the vehicle no longer supports.
- **Range** (Flux Rating and Range Table p.31: 0 250 m … 9 25 km; 10+ (2 × Flux) + 10 km). Situational modifiers apply
  to the transmitter's Flux first, **per transmitter**: high elevation +4; ECCM in use −ECCM ÷ 2 (the vehicle's ECCM
  draws power from that transmitter); electrical storm −2; encryption −0.5 (radios and RC decks only); humid air
  −0.5 (never together with electrical storm); urban −1 (built-up area or within 1 km of a high-voltage line). The
  modified Flux rounds DOWN to the nearest half. **Interpretation left to the GM** (round 1 #1): the table has no
  half-point rows and no negative rows; a x.5 Flux shows both bracketing ranges and the GM's choice is stored on the
  transmitter's condition set; a Flux below 0 shows "no usable range" and the GM may set one. Josie: 6 + 4 − 0.5 −
  1.5 = 8 → 20 km. ECD subtracts its rating from the vehicle's Flux (p.32).

### 4a.4 ECM and ECCM (p.31–32, p.58–59)
- ECM / ECCM on-off: Simple Actions; per-vehicle toggles (GM op, the action cost on the card).
- **ECM field**: a jammer's field covers every point within its ECM's Flux range (4a.3). An ECM effect applies to an
  observer (a sensing vehicle, an attacking vehicle, a missile in flight) **inside any field other than its own**
  (p.58), whatever it is targeting; ECM is not cumulative (p.32): of several applicable fields the largest effect
  applies.
- **One jammer roll** (p.32, round 1 #5): when an observer first needs it (a Sensor Test, a sensor-enhanced attack, a
  missile crossing the field) and the jammer has no valid jam event, the jammer makes ONE ECM Test: Flux of its ECM
  (R4-1) dice, the dice stored as an immutable `jamEvent { id, dice[], ecm, flux }` on the jammer; its successes
  against an observer are counted at THAT observer's Sensor Rating (the TN), re-read from the stored dice. Each
  observer makes its own opposed roll (its sensors' Flux vs the jammer's ECM rating), stored per (jammer, observer).
  Jammer more successes → its effect on that observer = the jammer's successes; otherwise 0 (M.C. Jammer: 4 vs 2 →
  Signature 4 → 8 against that copter only).
- **ECCM** (p.32): the counterjammer's ECCM rating vs TN = the jammer's ECM; the jammer's ECM rating vs TN = the
  counterjammer's ECCM; net counterjammer successes cancel jammer successes one for one, once, from the ORIGINAL
  stored successes (floor 0) (Aguilar: 3 vs 2 → 4 − 1 = 3: Signature 7).
- Records: `jamEvent` on the jammer; `jamVs.<observerKey> = { eventId, observerRoll, eccm, rev }`; validity per R4-2.

### 4a.5 ED and ECD (p.32) — optional rule
- Behind a world setting `r2ElectronicDeception` (default off), as the book calls ED optional.
- ED: the deceiver rolls its ED rating vs TN = the opposing Sensor Rating — or, against a missile, that missile's
  Intelligence — keyed per THREAT (`edVs.<observerKey | launchId>`); each success +1 to its Signature against that
  threat; area effect within its Flux range. ECD: the threatened side rolls its ECD rating vs TN = the deceiver's ED
  rating; each success cancels one ED success (floor 0); ECD doesn't counter ECM. Toggles: Simple Actions. A rigger
  who suspects ED may make a Perception Test vs ED rating + 4 (a button on the ED card, GM's call to offer).
- **EW term** for an observer O targeting T: `maxJam(O) + ed(T vs O)`, computed by one pure function from the valid
  records; Signature-based TNs add it to the baseline (never stored on the actor).

### 4b.1 Gunnery modes and one TN composition
- One explicit **mode** per ranged attack, chosen in the attack dialog and passed to the roller (the dialog and
  `_rollWeaponAttack` share ONE composition per mode, each modifier applied at exactly one point; wounds stay central
  in `rollSuccessTest`, never added again; vehicle damage modifiers once, in the mode composition):
  - `core` — today's composition (base 4 + range + p.89 modifiers + p.108 speed). Every existing caller's default.
  - `manual` (R2) — standard ranged combat (pp.87–92: base TN by range) with the **Manual Gunnery Modifiers Table**
    (p.57) replacing the p.89 situational modifiers and p.108 (4b.2).
  - `sensor` (R2) — 4b.3. `missile` (R2) — 4b.4/4b.5.
- **Dispatch (ruling, round 1 #9):** Rigger 2's gunnery chapter covers "fire from all vehicle-mounted weapons" and
  characters firing "personal or vehicle weapons" in vehicle combat (the firing-unmounted-weapons row: a passenger
  leaning out of a window). Under Rigger 2 the dialog proposes `manual` when the attacker fires a vehicle-mounted
  weapon or is aboard a vehicle (chase or dialog tick), `sensor`/`missile` when chosen with a valid lock, and `core`
  otherwise (a pedestrian shooting at a car uses standard ranged combat; its damage is Part 3b's). The book's own
  exception: both attacker and target under 5 m/turn → standard ranged combat (p.58).

### 4b.2 Manual gunnery (p.56–58)
Manual Gunnery Modifiers Table (p.57; 300-dpi re-check before coding): blind fire +8; partial cover +4; smartlink I
−2, II per Fields of Fire pp.84–85 (both gunner and weapon smartlinked); aimed shot −1 per Simple Action; image
magnification (core p.240); visibility (core p.89 table); multiple targets +2 per extra target that phase; attacking a
walking drone +1 (difficult ground +2), running +4 (+6); target running +2; target stationary −1; recoil (SA +1 2nd
shot, burst +3 each, FA +1 per round, heavy 2× uncompensated); recoil compensation — pintle −2, ring −6, fixed/turret
halve recoil before accessories (cancels the heavy doubling, R2 p.131); firing an unmounted weapon from a vehicle +2;
relative motion toward −1 / away +1 (not on one axis at matched speeds; applies at right angles); Maneuver Score
difference — attacker exceeds target by more than 10 −1, target exceeds attacker by more than 10 +1 (Part 3a);
attacking vehicle damaged + its level's modifier (cumulative with the attacker's wounds); relative speeds equal 0,
≤2× +2, ≤3× +4, >3× +6 (a speed under 5 counts as 5); size/type of target (human 0 … freighter −8, the full list).
Speeds, Maneuver Scores and terrain come from the chase when both are tracked, else the dialog.

### 4b.3 Sensor-enhanced gunnery (p.58–59)
Requires a valid lock (4a.2). Dice = Gunnery + ⌊Sensor ÷ 2⌋ (+ Combat Pool); a drone without a rigger uses Pilot
(Part 5). TN = baseline Signature + EW term + the Sensor-Enhanced Targeting Modifiers Table: urban +2; **direct LOS −3**
only for an air-to-ground / ground-to-air line, or ground-to-ground when the target sits in clear, open terrain;
**interrupted LOS 0** for other ground-to-ground attacks (the dialog asks which, with the book's conditions); recoil
and recoil compensation as 4b.2; attacking vehicle damaged + modifier. Min 2 (Steeler: 3 − 3 → 2; 4 + 1 = 5 dice).
A Complex Action. Sensor aiming raises the firing vehicle's Signature (p.56) — no amount is printed: the card says so,
nothing is invented.

### 4b.4 Missiles: data, launch and Phase 0 (p.59–60)
- **Data** (round 1 #12): ammo gains `guided: { kind: "missile"|"rocket"|"", intelligence, sensor }` (the FoF
  Ballista, Great Dragon etc. backfilled from their notes in the FoF module, page-checked); reload copies it into the
  weapon's loaded-ammo snapshot exactly as the existing reload copies damage/armour properties; the launch snapshots
  it. Rockets have no Intelligence: they fire through `manual`/`sensor` (p.59).
- **Launch** (round 1 #13): firing a missile is a durable **launch record** on the shooter's vehicle (or the shooter
  if none), `flags.sr2e.launches.<id> = { shooter, target, mode: continuous|fireAndForget|indirect, lock, ammo
  snapshot, ruleset, combatId, round, state }`: reserve → spend the missile once (the weapon's ammo with the launch id
  as receipt) → `launched`. Nothing is rolled at launch.
- **Phase 0** (p.59): every launch strikes at the end of its Combat Turn. The staged round change (Part 3a 3.0) gets a
  **closing stage for every combat** (not only chases) that is blocked while any launch of that round is not
  terminal: each launch's Missile Attack Test (Gunnery + Intelligence, + ⌊Sensor ÷ 2⌋ in continuous lock; Combat Pool
  allowed except indirect/area; TN 4b.3; ECM if the missile crossed a field) is a rolled step by the shooter's
  client (the GM rolls for NPCs or absent players; the panel lists what it waits on, with the GM's cancel). Damage and
  follow-ups (Part 3b records) run OUTSIDE the chase lock and their receipts are reconciled before `closed.<r>` and
  before distances change. Living targets take standard damage; vehicles p.53.
- **Continuous lock** (round 1 #15): the launch holds a guidance commitment until Phase 0: the shared attack path
  refuses the gunner's attacks at other targets (GM override), every chase action and Driving Test of that vehicle
  gets +2, and contact is re-checked at Phase 0 (R4-2 validity). Lost contact: the missile doesn't strike the target
  (p.59: "will not strike it"); the GM may resolve it as an area-effect attack (4b.6).
- Fire-and-forget: a lock at launch only; no Sensor dice; no commitment.

### 4b.5 Indirect fire (p.60)
- **Equipment** (round 1 #16): either the FDDM route — the spotter, the weapon and the rigger's remote-control deck each
  carry a BattleTac FDDM (the R2 receiver module on vehicles/drones; the deck and the spotter's FDDM items as gear),
  each checked on its document — or a target designator (laser, microwave, radar; FoF p.60 items). The dialog lists
  which endpoints are satisfied and refuses otherwise (GM override, stated).
- **Indirect Fire Test** (the spotter): Indirect Fire Concentration of Gunnery, else Gunnery at +2 TN, + ⌊missile
  Sensor ÷ 2⌋ + missile Intelligence; TN = target Signature (+ the Visibility Table, GM); no Combat Pool; a Complex
  Action. Success: the spotter's **commitment** until Phase 0: +2 to the spotter's other Success Tests; a designator
  user attacking with another weapon also takes the Second Firearm modifier (core p.90).
- **Missile Attack Test** (the firer, at Phase 0): Gunnery + Intelligence + the spotter's successes; no Combat Pool; TN
  4b.3 (Moly: 5 + 1 = 6 dice vs 3; Tubbs: 6 + 4 + 3 = 13 vs 6).

### 4b.6 Area-effect attacks (p.60–61)
- When: the Indirect Fire Test fails; the lock isn't kept to Phase 0; targets spread over an area; no Signature; no
  designator.
- **Roll contract** (round 1 #17): a Gunnery Test with Combat Pool allowed, NO Sensor or missile-Intelligence dice;
  TN from the Area-Effect Target Numbers Table by device and range band (laser 50–300/301–1,500/1,501–3,000/
  3,001–5,000; microwave 50–500/501–2,500/2,501–5,000/5,001–8,000; radar 50–500/501–3,000/3,001–6,000/6,001–10,000;
  vehicle sensor only 100–Flux×200/…×500/…×2,000/…×4,000 m; TN short 4, medium 5, long 6, extreme 9); no designator →
  the vehicle-sensor-only row. A lock lost AFTER a successful Indirect Fire Test: the TN as if the spotter had used a
  radar designator (the page gutter cuts the word after "ra"; Radar is the only table row starting so — noted) and
  the spotting successes are NOT used.
- Always scatters (Remote Gunnery Scatter Table: short 2D6 × 2, medium 2D6 × 5, long 3D6 × 15, extreme 3D6 × 40 m);
  each Gunnery success −4 m (short/medium) or −15 m (long/extreme); ≤ 0 → on target; direction by the core scatter
  diagram (p.97). Example: 16 − 3 × 4 = 4 m.

### 4b.7 Signatures (p.61)
Vehicles: the baseline Signature; biological forms: humans/metahumans 6, critters by the Critter Signature Ratings
Table (by name) or size (3× larger 5, 6× larger 4, 3× smaller 7, 6× smaller 8); else a GM value.

### Also in Part 4 (deferred from 2b)
Improved datajacks' Perception dice and rigging sight: a jacked-in rigger perceives through the vehicle's sensors
(Perception options read `sensorComponents`).

### Checks
Pure tables in `module/rules/vehicle-sensor-rules.mjs`, unit-tested with the book's examples (Josie's Flux 8 → 20 km;
M.C. Jammer/Aguilar; Monkeywrench ED; Steeler; Moly/Tubbs; the scatter example). Quench: a lock that dies when the
target hides; one jammer roll read at two observers' TNs; a boost allocation refused over Body; a manual R2 attack
with the gunnery rows and no p.108; a missile launched mid-turn resolved at Phase 0 exactly once in a chase and in a
non-chase combat; a stale card "not counted".

## Part 5 — Rigger 2 drones, electronic warfare and special operations (R2 p.33–36, p.62–72, p.77–80), draft 1 (2026-11-13)
_Read from 110-dpi renders (PDF = book + 1); the scan's gutter clips the right edge of pp.64, 66, 78 and 80 (only
words, no numbers, are lost; each reading is noted). Everything below applies only under `isRigger2()`; under core,
Part 1's control model (`controlledVehicles`, the Autopilot command) is untouched. Three releases: **5a** (remote
control networks, drones and robots), **5b** (electronic warfare against networks), **5c** (special vehicle operations
and the security rigger). 5a needs Part 4a (transmitters, Flux, ECM/ECCM toggles); 5b needs 5a; 5c needs only Part 2._

### 5.0 Records and transactions
- Same contract as Parts 3–4: GM ops through `gmCall`, reserved event ids, immutable roll inputs, a `rev` per record,
  terminal receipts, rolled steps (reserve → spend → arm → card → record), stale cards "not counted".
- **The network belongs to its deck.** A remote-control deck is an item: R2 `Remote Control Deck` (cyberware) or
  `Remote Control Deck (External)` (gear) on a character, or a deck hardwired into a vehicle (5a.7). Its record is
  `flags.sr2e.rcNet` on that ITEM, written only by GM ops in the queue `rcnet:<deckItemUuid>`. Lock order:
  `chase-membership` → `chase:<combatId>` → `rcnet:<deckUuid>` → `vdmg:<uuid>`; nothing applies damage while holding
  `rcnet:` (dump shock is a follow-up delivered after release, as Part 3b's follow-ups are).
- **Control stays ONE truth**: `controlledVehicles` (Part 1's GM op `control`) remains "who controls this vehicle".
  Under R2 a DRONE (`vehicleType === "drone"` or `riggerAdapted` and no one aboard driving) can be controlled only
  through a network: the `control` op refuses a drone that is not affiliated, and affiliation / disaffiliation write
  `controlledVehicles` and the network record in ONE GM step (`setControl` runs inside `rcnet:`). Non-drone vehicles
  are unchanged (driven from inside, datajack/manual/rig).
- A deck item that is deleted, uninstalled or unequipped ends its network: the GM's reconcile (on `updateItem` /
  `deleteItem` of a deck) disaffiliates every drone, as one op; the rigger is dumped only when the deck was in use
  (5a.6).

### 5a.1 Subscriber lists and affiliation (p.62, p.64)
- `rcNet = { rev, subscribers: [vehicleUuid…], affiliated: { [vehicleKey]: { since: {combatId, round} } }, primary:
  vehicleKey|null, ivis: {…} (5a.5), hardwired: [vehicleUuid] (5a.7) }`, `vehicleKey = followId(vehicle.uuid)`.
- Subscriber list ≤ 2 × deck rating; affiliated (actively controlled) ≤ deck rating. Only subscribers can affiliate.
  Editing the list (deck panel, out of combat or as the GM) is not an action (the book gives none).
- **Affiliate / disaffiliate** = one Simple Action each; "substitute" = disaffiliate + affiliate as 2 Simple Actions
  or 1 Complex (one card, one op, the action cost stated). A drone affiliated this Combat Turn can't act this Turn
  (`since` = the current combat round; the drone's actions check it). **User ruling R5-1 (2026-11-13): the rule** —
  the drone sits out the rest of the Turn; the p.64 example (Josie's GPV acting in her next Phase of the same Turn)
  is not followed.
- A non-affiliated subscriber is independent: the rigger can't see through or command it; it can't talk to the rest
  of the network.
- Range: affiliation, commands and observation need the drone inside the deck's transmitter range (Part 4a.3, the deck
  as a transmitter, base Flux 2); out of range = a lost carrier (5b.6) on all three channels.

### 5a.2 Operative modes (p.65–66)
- Per affiliated drone the rigger's mode is DERIVED: **primary** (`rcNet.primary`, the one drone the rigger is jumped
  into), **secondary** (the others while a primary is set), **captain's chair** (no primary). `droneMode(rigger, drone)`
  in `module/rules/drone-rules.mjs` (pure) returns `primary | secondary | captain | null`.
- Jumping into a primary needs a VCR (`isVcr` cyberware) and the rigger jacked in (`rigging`); captain's chair is the
  only mode without a VCR (p.65). Jump into a primary drone / return to captain's chair: Simple Actions (p.65).
- **primary**: the drone is driven as if the rigger were jacked into it: `riggedInto(rigger, drone)` true; Combat and
  Control Pool allowed; all rigger bonuses (VCR TN modifiers, Part 2b `riggerTnParts`); no Comprehension Test.
- **secondary** and **captain**: the drone's own tests use its **Pilot** (effective) in place of the rigger's skill or
  attribute (p.65, p.67); no Combat/Control/Task Pool; only IVIS Pool dice (5a.5). Captain's chair keeps the rigger's
  Initiative bonuses (Rigger X's +2D6). `riggedInto` is false for them; `controllerOf` still names the rigger.
- Every drone test site (Driving Test, Part 3a chase actions, gunnery incl. Part 4b's sensor gunnery, Arm Tests 5c.2)
  asks ONE helper `droneTestDice(drone, { skillDice })` → `{ dice, pools: [...], source: "pilot" | "rigger" }`; Part 4b's
  "a drone without a rigger uses Pilot" and Part 3a's deferred "drones driving themselves" both resolve here. Pilot
  replaces only the skill/attribute; equipment dice (⌊Sensor ÷ 2⌋ on sensor gunnery) are unchanged.
- **Observe**: captain's chair — through any subscriber (Free Action); primary — through the primary (Free), through a
  secondary (Complex, p.64–65). Observe in Detail: Simple, captain's chair any drone / primary only. Shown as action
  buttons on the deck panel with their cost; they gate the rigger's Perception through that drone's sensors (Part 4's
  "rigging sight").

### 5a.3 Issuing commands (p.66–67)
- Replaces Part 1 #13's Autopilot command for drones under R2: the **Comprehension Test**. The GM rates the
  command's complexity (core Skill Success Table p.68 → TN) and the rigger may downgrade it first (the card states the
  final complexity). Dice = the drone's Pilot + Non-Matrix Programming specialization dice (≤ Pilot; Computer skill's
  specialization on the rigger's sheet) + IVIS successes added (5a.5); no other pools. TN modifiers: +2 when the rigger
  is jumped into a primary and commands a secondary (p.65); command-channel degradation (5b.3). ≥1 success obeys;
  successes = latitude (card text).
- One Complex Action per command; a command goes to one drone or, if IDENTICAL, to a group (each drone rolls its own
  test; group size ≤ deck rating). Commanding the primary needs no command (the rigger drives it); commanding any
  other drone does.
- Commands are issued as the rigger declares actions; all network drones act in the SAME Combat Phase, after the
  rigger (Step 2B, core p.78). Implementation: drones are not combatants (5a.4); the rigger's turn card lists "drone
  actions" whose rolls follow the rigger's. A drone's standing command is stored on its own record
  `flags.sr2e.droneOrder = { text, successes, messageId, rev }` (shown on the deck panel's status report).

### 5a.4 Drones, robots and Initiative (p.65, p.67)
- A network drone (not a robot) has no Initiative of its own: it acts in its rigger's phases (5a.3). The Combat
  tracker refuses adding a non-robot network drone as a combatant (a GM override warns).
- **Robots** (`flags.sr2e.robot` / the vehicle's `design.traits` "robot"; the R2 module stamps its two robots): Reaction
  = 2 × Pilot; Initiative dice = Learning Pool + 1, max 4 (not drawn from the pool); **Learning Pool** = Pilot by
  default, a vehicle field `learningPool` (blank = Pilot) for printed exceptions (Toyota MK-Guyver: LP 2 "for Search
  & Rescue" — the scope note shown). LP augments any Success Test a character would augment with Combat, Control or
  Task Pool; refreshes at the start of each Combat Turn and each phase the robot acts; not available while a rigger is
  jumped into it (primary). A robot rolls its own Initiative and is a combatant; it may also draw IVIS dice. Robots
  can't interface with the Matrix (no Matrix rules apply: noted). "Dice Pools and Threat Ratings" (p.67): the GM may
  set `threatRating` as for NPCs (help text).

### 5a.5 BattleTac IVIS (p.66–67)
- Needs a BattleTac IVIS master unit on the deck (R2 `BattleTac IVIS Master Unit` RC-deck/CRD items) and the drones'
  IVIS software (R2 `BattleTac IVIS Receiver Module` vehicle mod).
- **IVIS Test** before the group's Comprehension Test: dice = the rigger's Vehicle Tactics specialization (Tactics
  concentration / Military Theory defaulting via the Skill Web, SRComp p.48) vs TN 5. Successes split between the
  group's Comprehension Test dice and an **IVIS Pool** (`rcNet.ivis = { groupId, drones, pool, spent: {…}, task }`).
- IVIS Pool dice: any drone of the group, any of its actions; refresh at the end of each Combat Turn until the task is
  completed or a new task is given; then gone. Not for a drone the rigger is jumped into.

### 5a.6 Dump shock (p.64)
- Whenever a rigger is dumped from a network (system channel lost, 5b.4; jumped into a drone when its simsense carrier
  is lost, 5b.3; the deck destroyed or ripped out while in use): (1) **disoriented** 10 Combat Turns: +2 TN on all the
  rigger's Success Tests (a timed Active Effect, `flags.sr2e.dumpShock`, read by `testTnModifiers`); (2) resist
  **(deck rating + 4)S Stun** (the existing resist-damage button, no armour, the Part 2 neural-damage helper's
  points); (3) **Willpower (4)** to shorten: duration = ⌈⌈30 ÷ successes⌉ ÷ 3⌉ Combat Turns (0 successes: 10).
- Follow-up delivered after the `rcnet:` op (never inside it), once per dump event id.

### 5a.7 Hardwiring a deck (p.64)
- A vehicle with Rigger Adaptation and an Electronics Port may have a deck hardwired: the deck item lives on the
  VEHICLE (a gear item, or the R2 deck item dropped on it). Effects: the deck may take an engine Flux boost of up to
  ⌊Body ÷ 2⌋ (Part 4a.3's boost, already rule-checked there); the rigger in that vehicle gets its protection; the
  driver can drive while jacked into the deck. A hardwired vehicle can't be disaffiliated (the op refuses).

### 5a.8 The deck panel and actions (p.64–65)
- One window per deck (character sheet → deck → "Network"): subscribers, affiliated, mode, primary, IVIS pool,
  standing orders, signal monitors (5b), and the action list with costs: Free — sensors on/off for one drone (online at
  the next Turn), ECM/ECCM on/off for one drone (Part 4 toggles, online next Turn), arm/disarm a weapon (one armed
  weapon per drone; switching = one Free Action), status report, observe; Simple — affiliate/disaffiliate, observe in
  detail, the same Free Action on several drones (captain's chair), jump into a primary, return to captain's chair;
  Complex — interception, MIJI, fire a weapon (any single drone; Combat Pool only with the primary when jacked by a
  cybernetic link), issue a command, intercept a channel, observe through a secondary, operate the primary (accelerate/
  brake, position, ram, hide — Part 3a's actions with the rigger's pools), reconnect a lost carrier, regenerate
  degradation.
- Action costs are shown and stated on cards; the system doesn't count actions per phase (as Parts 3–4).

### 5b — Electronic warfare against networks (p.68–72)
Channels: every network has **command**, **simsense** and **system** channels, each with a **Signal Monitor** of 10
boxes (the Signal Condition Monitors diagram, p.70): Light from 1 box (+1 TN), Moderate from 3 (+2), Serious from 6
(+3), 10 = channel disengaged. (Read from the diagram's box marks; checked against both examples: 2 boxes Light, 4
Moderate.) Stored in `rcNet.monitors = { command, simsense, system }` with per-event receipts
(`rcNet.ewReceipts.<eventId>`).

**5b.1 Signal interception (p.68–69).** Complex Action. The intruder needs a device whose range (Part 4a.3, both
devices' ranges: the LEAST powerful device's range must cover the distance) reaches the target deck. Dice = the
intruder's device rating (+ Task Pool: not in the system, noted) vs TN = target deck rating + 3. Successes = channels
intercepted (the intruder picks; if they don't, the GM). Record: `flags.sr2e.ewIntercepts.<netKey>` on the
INTRUDER's deck item `{ channels: [...], alertMod, rev }`, where `netKey = followId(targetDeck.uuid)`.
- **Encryption** (p.69): a deck with an encryption module (R2 `Remote Control Encryption Module`) first needs an
  Electronic Warfare Concentration Test (decryption module rating added as dice) vs encryption rating + 4. **User
  ruling R5-2 (2026-11-13): the rule** — successes GREATER than ⌈deck rating ÷ 2⌉ (Rating 6 → 4); the p.69 example's
  "at least 3" is not followed. Failure:
  the target network is on alert and every later interception/MIJI against it +2, cumulative per failure.
- **Reading a channel** (p.69): a Complex Action each time; every such action the GM rolls a detection Success Test
  for the network: deck rating dice vs the intruder's Electronic Warfare Concentration (rating used as TN); success =
  the network detects, goes on alert, switches frequencies: the intercepts are void and the next Interception Test
  takes +2. Intercepted simsense = see what the drones sense; system = position/direction/ammo/damage of any single
  drone; command = hear orders.

**5b.2 MIJI (p.69–70).** A Complex Action needing an intercept of the relevant channel. **Opposed**: intruder rolls
their device's Flux (Part 4a.3, modified) vs TN = the target deck's rating; the target rigger rolls their deck's Flux
vs TN = the intruder's protocol emulation module rating (meaconing, intrusion, interference) or the intruder's ECM
rating (jamming). Both may use Task Pool (not in system). Intruder wins: Signal Monitor boxes = net successes on the
channel the operation hits. One opposed test card, both sides roll on their own clients (Part 3a's opposed-roll
pattern), the GM op resolves once both are recorded.
- **Meaconing** (p.70): needs a protocol emulation module; command or system channel; the degradation modifier applies
  to Driving, Gunnery and other physical tests made with a drone's Pilot, and IVIS Tests — not Comprehension Tests nor
  drones the rigger directly controls (the scan clips "made with a drone's Pilot Rating, as well as IVIS Tests").
- **Intrusion** (p.70–71): needs a deck + protocol emulation; system, command or simsense channel; wins create a bogus
  object; the target rigger sees through it on Perception (3) with ≥2 successes (+ degradation modifier); drones keep
  believing until the illusion is dispelled by ECCM regeneration (5b.5). A prepared bogus object: an Open Computer (or
  Non-Matrix Programming) Test made 1D6 + 1 hours beforehand; its result replaces the Perception TN (Josie: 8, +1
  Light). Stored as a note on the channel record (no automation of the drones' belief beyond the card).
- **Jamming** (p.71–72): needs ECM + a deck; the intruder picks the channel. Command: degradation modifiers to
  Comprehension and IVIS Tests; 10 boxes → drones cut off (do the last command or hold, act only in self-defence).
  Simsense: modifiers to the rigger's Perception and Manual Gunnery tests through the drone; for a remotely-rigged
  drone they also apply to the rigger's TNs and Initiative like damage modifiers; 10 boxes while jumped in → dump shock.
  System: modifiers to indirect-fire Gunnery Tests with the network (Part 4b.4's FDDM), and the network's
  BattleTac FDDM performance.
- **Interference** (p.72): needs a deck + protocol emulation; system channel only. After the first MIJI test, each
  later Combat Phase either side may spend a Complex Action to attack/counterattack (another opposed MIJI test); the
  LOSER's system channel takes the boxes (the intruder's own system channel included — an interference contest
  degrades both networks' monitors); the first to 10 boxes on the opponent (or the one staying while the other exits)
  takes the whole network; the loser is shut out and dumped (5a.6). Taking over = the intruder's deck becomes the
  drones' network: one GM op moves the drones (subscribers, affiliation, `controlledVehicles`) from the loser's record
  to the winner's, with the takeover receipt.

**5b.3 Degradation modifiers.** `channelTn(net, channel)` (pure) = 0/+1/+2/+3 by boxes; each consumer above asks it:
the drone test helper (5a.2) for meaconing/command/system; the Comprehension Test; the rigger's TN for simsense
(through `riggerTnParts` with a `droneUuid` context) and Initiative (the worst-damage-modifier path in
`worstControlledInitMod` takes the simsense term too).

**5b.4 Regenerating MIJI degradation (p.72).** Complex Action: ECCM Test (the network's ECCM rating dice, Task Pool —
none) vs TN = the higher of the intruder's deck or ECM rating + 3 (the intruder recorded on the boxes' events); every 2
successes clear 1 box on the chosen channel; one channel per action.

**5b.5 Lost carriers (p.72).** A channel at 10 boxes loses its carrier. Before reconnecting: regenerate until at least
one box is clear (5b.4); then a Control Systems Concentration Test (the rigger's skill) with the channel's degradation
modifier and the rigger's own Physical/Stun damage modifiers; success when successes > filled boxes.

### 5c.1 Lifting and pulling (p.33–34)
- Within Load Rating (or the sum of several vehicles' Load Ratings): no test. Only a crane/winch/boom (R2 `Winch` mod,
  or GM) lifts; any vehicle pulls with a tow bar/cable.
- **Pull Test** up to 2 × Load Rating, short distances (< ½ km): a Body Test (the vehicle's Body dice; Stress dice
  allowed, Part 2a `stressDice`) vs the Pull Test Target Numbers/Modifiers Table: ≤1 × Load 3, 1.1–1.5 × 5, 1.6–2 × 8;
  bad conditions +1, terrible +3, stuck in ground +1 to +4 (GM), pulling without rollers (ground) +4, vehicle braced in
  place −2 (bracing takes 1 Turn; braced = immobile). Table key in the dialog's help.
- Side effects even on failure (p.34): ≤1.5 × Load half speed, +1 Stress per hour; 1.6–2 × quarter speed, +1 Stress per
  minute (Stress through GM op `stress`, the card gives the rate; the system doesn't time it). Over 1.5 × Load: extra
  Body (4) Test, failure +1 Stress.

### 5c.2 Mechanical arms and legs (p.34–35)
- **Arm Test** (articulate motion): Handling Rating as TN (GM may raise/lower); controlled by a rigger: Control Pool
  dice up to the rigger's Quickness; a drone not directly controlled uses Pilot in place of Quickness (`droneTestDice`).
  Dice: the controller's Quickness (or Pilot).
- **Arm Skill Test**: the skill's TN +1 per Handling point above 3 (Handling 4 → +1, 5 → +2).
- **Arm melee**: the same Handling modifier; effective Strength = Body × Body (R2 `Mechanical Arms` mod: Strength = Body²
  + enhancement, already derived by the design pass) — the melee attack uses that Strength.
- **Legs**: walking/running by core p.83 (the Speed Rating is the walking speed; running = Speed × 2.5); character
  combat rules, not vehicle combat (the vehicle is excluded from the chase); can't kick (attempting = a fall).

### 5c.3 Air-cushion vehicles, aircraft, trains (p.35–36)
- **ACV**: damage from crashes never exceeds Serious (Part 3b's crash record caps the level for hovercraft); the ACV
  Terrain Classifications Table replaces the terrain help for ACVs (Open/Normal/Restricted/Tight descriptions); slopes
  are the GM's.
- **Runways**: the Runway Distances Table (B = Body): Normal takeoff B × 150 / B × 225, landing B × 300 / B × 450;
  STOL 40/125, 75/200; VSTOL 20/45, 40/100; VTOL none — first value under Load, second at or above. A profile field on
  aircraft (`ltProfile` exists: read it) → the sheet shows the distances.
- **Unusual surfaces**: a Driving Test, base TN 3 takeoff / 4 landing, + Takeoff and Landing Modifiers (cross winds +2,
  heavy cross winds +3, rough/uneven +1, STOL profile +1, VSTOL +3, arrestor cable/crash net −1 landing only) + the
  Driving Test Modifiers Table; rough/uneven also a 6L damage resistance for the aircraft (Part 3b's vehicle
  resistance). Uses Part 2a's Driving Test with a "takeoff/landing" preset.
- **Monorails and trains**: engines and cars are separate vehicles; Driving Test against the engine's Handling (the
  train's highest engine Handling); Load Rating of engines sums for pulling; each car/engine has its own Body/Armor and
  damage. Help text only (no train linkage automation), noted.

### 5c.4 The security rigger (p.77–80)
- **CCSS**: a new world item type `ccss` (the smallest model: no token, no monitor of its own): Technical Rating 1–10,
  Vigilance Code (Blue/Green/Amber/Red = 1/2/3/4 successes), encryption, coverage notes, its RC deck rating (drone
  command limit) and the drone/vehicle UUIDs it commands; it acts as a network (5a) with its own `rcNet`. Adding an
  item type needs a server restart (system.json `documentTypes`), noted for the release.
  The security rigger is a character/NPC "assuming the body".
- **Rigger Perception Tests Table** (p.78): door/gate open-close 5, lock tampering no alarm 3, successful tampering 3 ×
  tamper successes, device destroyed 4, carefully deactivated 6, system on alert −2; a triggered alarm needs no test.
  A GM button rolls the rigger's secret Perception.
- **Actions in a CCSS** (p.78): the Free/Simple/Complex list shown as reference (Speak a Word "(p.? SRII)" clipped).
  Control a room / fire a weapon system / issue a command / operate a drone use the network rules (5a); "Rigger
  Bonuses in a CCSS": VCR initiative and cyberware bonuses; Task Pools for encryption/protocols; an intruding rigger
  only Karma Pool; NPC riggers may add Threat dice; when assuming the body no dice pools but Karma; pools return when
  jumped into a drone, room or corridor.
- **Accessing a security system** (p.79–80): five steps, each a Complex Action, each needing successes ≥ the Vigilance
  Code's count; failure on 2–4 puts the system on alert: (1) find a hardwire access point (GM); (2) tap a dataline —
  dataline tap rating + Electronics vs Technical Rating; (3) defeat encryption — decryption module rating + Intelligence
  vs Technical Rating; (4) adjust to protocols — protocol emulation rating + Intelligence vs Technical Rating; (5)
  rigger combat. Gear required: RC deck, rigger protocol emulation module, dataline tap (if needed), rigger decryption
  module. A step tracker on the CCSS item per intruder (`flags.sr2e.ccssAccess.<intruderKey>`), GM-written.
- **Rigger combat** (p.80): rigged Initiative per standard rules (acts every tenth phase as standard: the clipped
  sentence read as "a rigger acts during every tenth phase"); the winner of Initiative may attack (Complex) or
  disengage (Free; re-entering = Complex); attack = opposed Willpower Test, attacker may add Control Pool dice up to
  their Willpower; the winner deals (Willpower)L Stun, +1 level per 2 net successes; the loser resists with Body
  (+ Control Pool up to Body). Ends when one disengages or passes out; the winner controls the system and gets all
  information the defeated rigger had.
- **Decking a rigged system** (p.80): the decker uses a cyberdeck with a rigger protocol emulation module, does steps
  1–3, then rigger combat with: no Matrix programs, +2 TN on all tests, Initiative −2 with no Response Increase dice,
  Control Pool = ⌈emulation utility rating ÷ 2⌉, damage as non-lethal black IC (VR2.0 p.49 — under core the core book's
  non-lethal black IC).

### Checks
Pure rules in `module/rules/drone-rules.mjs` (modes, Comprehension dice, robot Initiative/Reaction, dump shock
duration, Signal Monitor bands, interception/MIJI/regeneration/reconnect thresholds, Pull Test TN and side effects,
Arm Test modifiers, runway distances, takeoff/landing TN, Vigilance thresholds, rigger combat staging), unit-tested
with the book's examples (Josie's deck 4 → 8 subscribers/4 active; Rigger X; York's TN 6; Jammer's TN 9/8 and 3
successes; Trixie's 4 boxes → Moderate; Josie's intrusion 2 net, 2 boxes Light, TN 8 +1; Jammer's interference rounds;
dump shock durations). Quench `sr2e.drones`: affiliation limit refused at rating + 1; a drone affiliated this Turn
can't act; a captain's-chair drone test rolls Pilot with no pools; a primary drone uses the rigger's pools; a dump
delivers one card per event; a MIJI opposed test resolved once with the boxes; an interference takeover moves the
drones in one op; a stale card "not counted". Everything under core stays as Part 1 (Quench under a stubbed setting).

## Part 6 — Rigger 2 advanced vehicle rules (R2 p.81–90), draft 1 (2026-11-13)
_Read from 120-dpi renders (book p.81 = PDF 82, p.82 = PDF 83; colour plates follow, so p.83 = PDF 92 … p.90 = PDF 99);
the scan clips the right edge of pp.82, 86, 87, 88 and 90 (each clipped reading is noted; R6-1 is a lost number).
Every option here is OPTIONAL (p.81: "choose only those that will enhance their game") and gets its OWN world
setting (the VR2.0 options pattern: boolean, `requiresReload`, read through one helper `r2Option(key)` that is false
unless `isRigger2()`). Two releases: **6a** (fuel, optempo, quality factors, subsystem damage — the logistics and
damage options) and **6b** (advanced gunnery, remote control and electronic warfare — needs Parts 4 and 5)._

**User rulings (2026-11-13):** R6-2 barrage-jamming range = every standard range ÷ 20 (500 + Flux × 100 m at Flux
10+; the restated "× 200" is a misprint); R6-3 engine repair = 40 % of (the vehicle's original cost + engine
customization spending; the ".6" is a misprint); R6-4 coasting extends by Acceleration per 2 successes (not the Gray
Ghost example's per success); R6-5 VSTOL takeoff fuel ×.7 per the table (the Wu Pi example's .8 is the STOL row).
**Pending:** R6-1 the Damage Severity Table's (p.86, Table 8) Light row ends "apply a +… target modifier" with the
digit clipped by the scan (Moderate is +3); the user is checking a printed copy. Until then the card asks the GM.

### 6a.1 Variable fuel consumption (setting `r2Fuel`; p.81–83)
- **Fuel state**: `system.fuelLevel` (NumberField, blank = full = `fuelSize`), shown on the vehicle sheet beside the
  tank; edited by the owner; written by automation only through the GM op `fuel` in the vehicle queue (`vdmg:<uuid>`)
  with receipts `flags.sr2e.vfuel.<eventId>`.
- **Economy Rating Table** (p.82): below Speed Rating → base Economy; 1–1.5 × Speed Rating → base ÷ 2; vehicle combat →
  (base ÷ 2) + .5. Fuel used = km ÷ economy. A "Travel" button (vehicle sheet: km + speed band) debits fuel; in a
  Part 3a chase, the staged round change debits each chase vehicle once per round for that round's distance
  (`speed` m) at the combat economy (receipt key `chase:<combatId>:<round>`), outside the chase lock (Part 3's rule).
- **Drones** (p.83): fuel the whole time they operate; a stationary operating drone uses its Idle Economy
  (`economyIdle`, already stored: "1 hour/liter" style — parsed as time per unit; unparseable → GM entry).
- **Running out of gas** (p.81–82): speed falls 2 × Acceleration per Combat Turn to 0. Coasting distance =
  (.75 × starting speed²) ÷ Acceleration (Gray Ghost: .75 × 1,000² ÷ 100 = 7,500 m). A Driving ("Vehicle") Test (the
  vehicle's Handling TN, Control Pool allowed) extends it by Acceleration per 2 successes (R6-4). In a chase the
  speed loss is applied by the round change.
- **Aircraft out of fuel** (p.82): when speed falls below Stall Speed, a Crash Test (Part 3b's crash record, with a
  new `cause: "fuel"`): success = an emergency landing at the end of the deceleration, the vehicle takes 1D6 Stress
  (GM op `stress`) and resists 6L; no damage to passengers or cargo; failure = crashes immediately, crash damage per
  standard rules using the Stall Speed (Gray Ghost: Crash Test two turns after the fuel ran out).
- **Aircraft maneuvers** (p.82, Flight Maneuvers Table): fuel remaining after the maneuver = initial fuel × multiplier:
  STOL takeoff .8 (over Load .7), STOL landing .9, VSTOL takeoff .7 (over Load .55), VSTOL landing .85, VTOL takeoff
  .6 (over Load, tilt-wing .4), VTOL landing (tilt-wing) .8 (the scan clips the column header only; the values were
  re-read from the 200-dpi page image). Not for helicopters, zeppelins or LAVs. Wu Pi's Mistral (VSTOL takeoff):
  R6-5. Offered from 5c.3's
  takeoff/landing flow when this setting is on.
- **Fuel grades** (p.83, Fuel Grade Effects Table): a per-vehicle choice `flags.sr2e.fuelGrade` (cheap / regular /
  premium / custom ±N Acceleration). Cheap: Maintenance ×.95, Acceleration −2, Economy ×.9; Premium: ×1.05, +2, ×1.1;
  custom: Maintenance ±2 % and Economy ±1 % per point of Acceleration change (rule of thumb ±5 max: a warning, not a
  cap). Applied in `VehicleData` derivation AFTER `applyModEffects` (assigned both directions, cleared first), and to
  Part 2b's maintenance cost.

### 6a.2 Optempo (setting `r2Optempo` = off / replace / split / frequent / mileage; p.83–84)
- Rate per km = (list price + all modifications at Vehicle List/Customization values, NOT what was paid) ÷ 20,000,
  rounded to the nearest tenth. Adventure cost = km × rate.
- **replace**: optempo instead of the monthly Maintenance (Part 2b-2's month assessment skips the vehicle; the GM's
  "End adventure" tool charges optempo through the same money-writer + receipt pattern, `overheadReceipts.<tx>`).
- **split**: monthly overhead AND the optempo rate both halved; the month assessment charges half, the adventure tool
  half-rate optempo.
- **frequent**: optempo for vehicles flagged "used every adventure" (`flags.sr2e.optempoFrequent`), standard overhead
  for those used no more than once a month.
- **mileage**: optempo only for vehicles over a threshold that adventure (GM value; suggestions 200 km vehicles, 50 km
  drones); the rest pay standard Maintenance.
- The km per vehicle per adventure: the GM enters them in the tool (prefilled from 6a.1's Travel/chase log when
  `r2Fuel` is on). Records `flags.sr2e.optempo.<adventureId>` per vehicle, written by the GM in the vehicle queue.

### 6a.3 Quality Factors (setting `r2QualityFactors`; p.84–85)
- Chosen in the Workshop (design) as a new design section; ≤ 2 factors per vehicle (p.84: "no vehicle should be
  designed using more than two" — enforced as a design problem); the modifier is added to the Mark-Up Multiplier in
  `markUpFactor` BEFORE the special-design multipliers (drone, security-grade); a negative factor can't take the
  Mark-Up below .1 (design problem).
- Factors and effects: Master Workmanship +.10/level (max 3), Maintenance ×.9 per level; Lemon −.15/level (max 3),
  Maintenance ×1.2 per level; Ruggedness +.50/level (max 2), −1 TN per level on Stress Tests; Fragility −.50/level
  (max 2), +1 per level; Streamlined Layout +.25, −1 on all Build/Repair Tests on the vehicle; Complex Chassis −.30,
  +2; Custom Built −.20, parts cost and base time ×2 for modifications installed later (the customization quote);
  Prototype Model/Used Vehicle −.60, starts with 1D6 hidden Stress Points (rolled at creation by the GM, stored hidden
  `flags.sr2e.hiddenStress`; the GM reveals some or all through GM op `stress`; revealed points add normally); Safety
  Certified +.15, passengers and driver −1 TN resisting collision damage (not the vehicle, not weapon attacks);
  Passenger Trap −.15, +1.
- Stored in `system.design.quality = { key: levels }` (rigger-2 tables register the list); each consumer reads one
  pure `qualityEffects(design)` (Stress TN, B/R TN, maintenance factor, collision-resist TN, customization factor).
  Named `vehicleQuality*` to stay apart from character qualities (`qualityValues`).

### 6a.4 Vehicle subsystem damage (setting `r2Subsystems`; p.85–87)
- Trigger: a single source deals Moderate or greater to the vehicle (Part 3b's damage commit records it as a
  follow-up `vfollow` of kind `subsystem` in the SAME update — never a second write path). The controlling player
  (else GM) rolls 1D6 − 4 (Moderate) / 3 (Serious) / 2 (Deadly), ÷ 2 round up = subsystems possibly hit (≤ 0 → none).
- For each: Table 1 (1D6) category → Tables 2–7 (1D6; Accessories 2D6) → the subsystem; the GM may choose instead of
  rolling; a subsystem the vehicle doesn't have = "no subsystem hit" (or the GM re-rolls); then Table 8 (1D6):
  1–2 Light, 3–4 Moderate, 5 Serious, 6 Deadly. Table 7's "roll again on Table 1" / "roll twice" and Table 4's
  "GM's choice" / "roll twice" recurse; Table 2 "other electronics or roll again", Table 3 "other control
  modification or roll again". Design options can't take damage.
- One card per follow-up with every roll (immutable inputs) and one GM op `subsystem` that records
  `flags.sr2e.subsystems.<id> = { path, subsystem, itemId?, level, eventId, repaired: false }`.
- **Effects** (derived each preparation, cleared first): accessories/mods — Light: bonuses or extra dice −1 (none → +R6-1
  TN on tests with it); Moderate: halved (none → +3 TN); Serious: inoperable but repairable; Deadly: destroyed (item
  state "removed"-like `custom.state = "destroyed"`: must be replaced). Rigger Control Box: the rigger resists PHYSICAL
  damage, Power = the attack's Power after armor, level = Table 8 (Part 3b's occupant step). Handling: +1/+2/+3, Deadly
  → automatic crash (Part 3b crash record). Turret: weapons fired from it take the damage modifier, Deadly → inoperable
  and frozen. Target Acquisition: missiles, sensor-enhanced and other smart weapons take the modifier; Deadly → can't
  lock or fire smart weapons; rockets, cannons and firearms unaffected; repair base cost ½ sensor parts cost. Engine
  hit: Acceleration, Speed and Load × .9 / .7 / .4 (round down); Deadly → loses power, decelerates 2 × Acceleration per
  turn, Crash Test. Fuel tank: leak per turn = fuel remaining × .01 / .05 / .1; Deadly → ruptures, Crash Test (fire is
  the GM's); repair = original cost × .9 (printed so; the tank's cost reading noted). Passenger compartment:
  passengers resist physical damage, Power = ½ the attack's Power after armor, code = Table 8. Aggravated Body: Body −1
  (Body 1 vehicles no loss) / ½ round up / ⅓ round up / destroyed (automatic crash); repair = original cost × .6.
  Armor-Defeating Hit: Armor −1 / −3 / −6 / −10, permanent until the armor is replaced (separate from p.75 armor
  degradation; both may apply).
- **Repairs** (p.87): standard vehicle repair with: parts = damage boxes × .05 × the mod's parts cost; TN by level
  (L/M/S/D per standard repair); base time = the mod's installation base time. Uses Part 2a's repair flow
  (`repairFlow`) with a "subsystem" target; engine repair cost per R6-3.

### 6b.1 Footprint (setting `r2Footprint`; p.87–88)
- Footprint = round((Σ Flux of the vehicle's active transmitters: radios, RC decks, sensors, ECM) ÷ 10), subtracted
  from the TN of tests against the vehicle's (or device's) Signature (Part 4's Sensor Test and sensor-enhanced gunnery
  TN, as part of the per-observer EW term). Josie: (8 + 6) ÷ 10 = 1.4 → 1; Signature 4 → TN 3.
- **Reducing** (Complex Action): Electronic Warfare Test — the rigger's Electronics dice (Task Pool: not in the system)
  vs Footprint + 4, +2 per attempt after the first; each success −1 total Flux, cumulative; a roll of all 1s doubles
  the total Flux. Record `flags.sr2e.footprint = { attempts, fluxCut, doubled, rev }` on the vehicle (GM op);
  the GM clears it (ruling: the book gives no expiry; it lasts until the transmitters change or the GM clears it,
  stated). Josie: 10 → 7 (still 1) → 4 (0).

### 6b.2 Breaking missile-target lock (setting `r2BreakLock`; p.88)
- The targeted vehicle's controller may make a Hide Action (Complex; Part 3a hide) before the missile strikes at the
  end of the Turn (Part 4b's Phase-0 resolution): successes ≥ the missile's Intelligence break the lock and the missile
  misses; fewer = no effect; each further attempt in the same Turn needs +2 successes. The missile's launch record
  carries `breakAttempts`; the Phase-0 resolver checks a `lockBroken` receipt first.

### 6b.3 Extended-range missiles (setting `r2ExtendedMissiles`; p.89)
- For missiles with range > 2 km (the ammo's range field): the missile is a chase participant with one goal — close on
  its designated target (Accelerate) and Ram it. Handling 4; Initiative = Intelligence + 2D6; fixed speed 1,000 m/turn
  (anti-surface) / 5,000 m/turn (anti-air); its Intelligence is the Driving Test dice. Implemented as a GM-created
  temporary vehicle actor (`flags.sr2e.missile = { launchId, target }`) joined to the chase by the launch record, and
  removed (not left in the world) when it hits, misses or is destroyed. Its Ram uses the missile's damage, not a
  vehicle ram.

### 6b.4 Pre-programmed drone commands (setting `r2Preprogrammed`; p.89)
- Needs Storage Memory on the deck (R2 `Storage Memory` item: its Mp). Programming (before the run): a Non-Matrix
  Programming Test vs the GM's TN (Skill Success Table, the player may lower the complexity first); complexity ≤ the
  deck rating; one command = one specific task (help text). Memory = (TN² × 100) ÷ successes Mp; time = TN ÷
  successes hours. Stored on the deck item `flags.sr2e.programs.<id> = { text, tn, successes, mp }`; total Mp ≤ the
  storage.
- In play: activating = a Free Action; the drones act on it without a Comprehension Test (the stated purpose:
  "drones may misunderstand … pre-programmed commands can solve both"); stored as their standing order (5a.3).

### 6b.5 Back-up channels (setting `r2BackupChannels`; p.89)
- A channel's functions may be moved onto one of the other two (`rcNet.backup = { from, to }`), e.g. after MIJI
  degradation: every action on BOTH channels +2; an intruder locating the carrying channel −1 (5b.1); the moved
  channel's monitor is out of play while moved; never all three on one frequency (at most one move). Otto: command on
  system → +2 to commands and indirect fire, the jammer −1.

### 6b.6 Server system for CRDs (setting `r2CrdServer`; p.89–90)
- A cranial remote deck (CRD) may be configured as a super-subscriber of a conventional deck (the "server"): the
  server controls one drone fewer (the CRD counts as a subscriber); the network's effective rating = the lower of the
  two decks; accessories of either deck are available; range from the SERVER's Flux, centred on the server; the CRD out
  of the server's range = the rigger is dumped (5a.6). `rcNet.server = serverDeckUuid` on the CRD's record, the
  CRD in the server's subscribers.

### 6b.7 Advanced electronic warfare (setting `r2AdvancedEW`; p.90)
- **Partial MIJI**: when the target deck is outside the intruder's device range but some drones are inside, MIJI may
  target the network; only drones inside range are affected (the degradation applies to those drones only:
  per-drone overlay `rcNet.partial.<vehicleKey>` on the channel's boxes); a drone leaving range is free; a rigger
  jumped into an affected drone can be dumped by jamming/interference.
- **Multiple channels**: one MIJI type at once on 2 or 3 intercepted channels, +3 TN per additional channel (+3 / +6).
- **Barrage jamming**: no Interception Test; jams all channels and all radio at once; 1 box on ALL the opponent's
  Signal Monitors per 3 points of Flux used (when made; the scan clips "are fi[lled]"); range per R6-2; the jammer's
  Signature −1 per 2 Flux used, floor 2, the excess offsets modifiers that raise Signature or Signature-based TNs;
  never with meaconing, intrusion or interference.
- **Hot mike jamming**: jamming with standard radios or RC decks in lieu of ECM (works on radio communications and RC
  decks); +2 TN to MIJI Tests against remote-control networks.

### Checks
Pure rules in `module/rules/vehicle-advanced-rules.mjs`, unit-tested with the book's examples (Gray Ghost 7,500 m and
the coasting extension; Mistral 1,600 l; fuel grade factors; optempo rate rounding; Mark-Up with factors and the .1
floor; subsystem counts per level; Table 8 effects; engine ×.9/.7/.4; Josie's Footprint 1 → 0; Otto's back-up +2/−1;
barrage boxes and Signature floor; pre-programmed memory/time). Quench `sr2e.vehicleOptions`: each option off by
default changes nothing (a vehicle test with all settings stubbed off matches Part 5's result); fuel debited once per
chase round; a Moderate hit records one subsystem follow-up; an engine hit's derived speed clears when repaired; a
quality factor beyond two is a design problem; a broken lock makes the Phase-0 missile miss once.

## Key decisions & tradeoffs
- Ruleset switch = a world setting with reload (VR2.0 pattern), added in Part 2 when the first R2 rule exists, so
  Part 1 never ships a setting that does nothing.
- Part 1 changes core behaviour only where the book disagrees with the code; finding 1 makes riggers' combat
  Position/Crash Tests harder than today (by design: RAW).
- No turn/position tracking engine in core mode: the cards state outcomes, the table moves the tokens.

## Risks / open questions
- The reading of "takes Serious damage" (a Serious wound) is a ruling, stated in the card and docs.
- Moving every vehicle damage path onto one commit touches combat-spells' receipts: their Quench tests must stay green.
- `controlledVehicles` is new state players must set; until set, rules fall back to the GM (documented in the How-To).

## Out of scope
Everything Rigger 2 (Parts 2–6); drone/robot autosofts beyond the Autopilot command; Matrix rigging.
