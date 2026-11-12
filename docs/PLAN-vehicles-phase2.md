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
- **Part 5 — drones, EW, special operations** (p.33–36, p.62–72, p.77–80).
- **Part 6 — R2 advanced (optional) rules** (p.81–90), each behind its own world setting as VR2.0's options are.
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

### 2b — the rigger (R2 p.12–19), draft 8 (2026-11-12, after Codex 2b rounds 1–7)
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
penalty is DERIVED from durable failure records (B1 #9, B4 #2): every failed required test is recorded on the item as
`custom.brFails.<testMessageId> = {worker, skill, rating}` in the SAME GM-queue update as the partial result (keyed by
the test, so a replay adds nothing); the penalty for (worker, skill) = the number of its records whose `rating` ≥ the
worker's current rating in that skill (a raised skill clears it). Records outlive attempts (only the partial results
reset) and go with the item.
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
  not re-spent); success → −1 Stress (Stress op, eventId `overhead-restore-<m>`) and the month's
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
receipt is released; Month ends twice for the same id → one assessment; an unpaid month → 1 Stress once; the Stress
counter counts only this month's positive deltas; B/R retry penalty survives a new attempt and resets on a rating rise;
mechanic quote on a repair card.

### Out of scope (Part 2)
Acceleration/braking and current speed (Part 3, p.22/p.45); R2 combat, R2 crashes and impact (Part 3); sensors (Part 4).

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
