# Plan: vehicle rules in play (vehicle work, Phase 2)
_Draft 5 (2026-11-12): Part 1 Codex-APPROVED (round 5) (docs/PLAN-vehicles-phase2-REVIEW-LOG.md)._

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
