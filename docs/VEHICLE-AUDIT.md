# Vehicle stats audit (vehicle builder release 4b, 2026-11-11)

Every vehicle the system and the content modules ship, checked against the stat line its own book prints
(docs/PLAN-vehicle-audit.md, Codex-approved round 2). 135 documents in 8 books. Method: a blind Codex transcription
of every stat page, diffed against the shipped data; **every difference read from the page render** (never a text
layer). Fixes are in each module's pack sources (and its generator where a re-run is safe); ids, file names and art are
unchanged, and a script checked that only stat fields, notes and the corrected names changed.

## Conventions the audit settled (every pack now follows them)
- **Speed** holds the **cruising** speed where the book prints cruise/max (the system's crash rules use it as cruising
  speed, `effectiveSpeed`, core p.107); the pair is in the notes. Rigger 2-format books (Rigger 2, Cyberpirates) print
  a single Speed, stored as printed.
- **APilot / Pilot** (autopilot) goes to **autonav** on crewed vehicles and to **pilot** on drones (the Rigger 2 split;
  `pilot` is a drone's Pilot rating, which customization formulas read).
- A drone's **Store** is the cargo space needed to carry it aboard another vehicle, not its cargo; cargo is the
  printed Cargo/Storage (0 if none).
- Off-road Handling fills `handlingOffRoad` on ground vehicles; a second Handling value on anything else stays in the notes.
- **Printed equipment** (plan step 8): a vehicle's standard equipment is embedded only when a catalogue it can reach
  without another module holds it. None does: the turrets, EnviroSeal and the like are Rigger 2 catalogue items, and
  Rigger Black Book, Fields of Fire etc. don't depend on Rigger 2 (the CSH TR-55 mods are purchasable options, not
  standard equipment). The equipment stays in the notes; with Rigger 2 on, the Vehicle List update adds the list's
  factory equipment to the vehicles it covers (e.g. the Devil Rat).
- SR1 books (Rigger Black Book, Queen Euphoria): armor ×3 (core p.283). NAGRL prints the ×3 value in parentheses.

## By book

### Core (SR2 corrected 11th printing) — 32 vehicles, p.264-265 (table), p.251-253 (descriptions)

**Fields:** Handling, Speed cruise/max, Body, Armor, Signature, Pilot, Cost (table); price + equipment prose (descriptions). Targets: handling, speed (cruising; cruise/max pair in notes), body, armor, signature, autonav (crewed) / pilot (drones) from Pilot, cost (Restricted -> cost 0 + availability 'Restricted'). Not printed: acceleration, sensor, cargo, load, seating and the R2-only fields -> defaults. Availability/Street Index: a general rule on p.264 (Cost/10,000), not filled per vehicle.

**Passes:** Claude and Codex (blind) agree on all 33 rows.

**Fixed:**
- All 32 carried the Rigger 2 Vehicle List stats (commit 9d5606c, 2026-07-11), contrary to ruling 2 (2026-11-07: the system compendium keeps the core-book stats). Reverted to p.264-265 for every field; with Rigger 2 active, an import still takes the R2 stats (0.145.0).
- FRC-44B Yellowjacket -> Northrup PRC-44B Yellowjacket (the table's sub-line under the Wasp; 280,000¥ also in the Wasp description).
- Drones: the Pilot column goes to pilot, autonav 0 (the Rigger 2 convention); Hunter, Patrol Vehicle and Spotter had autonav 2 as well.
- GMC Banshee and Federated Boeing Eagle: cost 'Restricted' -> cost 0, availability 'Restricted' (were the R2 prices).

**Kept / noted:**
- GMC Riverine: the description says 75,000¥, the table 125,000¥; the table (the stat line) is used.
- Samuvani Criscraft Otter: table spells 'Chriscraft', description 'Criscraft'; the pack name is unchanged.
- Hunter Drone: Handling '*' and Speed '-10%' (of its host surveillance/spotter drone; p.253 gives no number). Handling 4 and Speed 0 kept, as the notes say to set them from the host.
- Names expanded from the table (Aztechnology Nightrunner, Chrysler-Nissan Patrol-1, EFA (Eurofighter), Federated-Boeing ...) are the descriptions' fuller names; unchanged.
- Speed holds the CRUISING speed (cruise/max printed; max in the notes), as the system's crash rules use it (effectiveSpeed, p.107) and as the core pack did before 2026-07-11; the July R2 sync had switched it to the maximum.

### Rigger Black Book (SR1) — 69 vehicles, p.8-94 (PDF = book + 1)

**Fields:** Handling (on/off), Speed (cruise/max), B/A, Sig, APilot, Cost, Seating, Access, Economy, Fuel/Power, Storage/Cargo, drones' Store, Operational Duration, Set-up time, Sensor Package, Landing/Takeoff, Options/variants. Targets: handling, handlingOffRoad (ground vehicles; now filled), speed (cruise; max in notes), body, armor (SR1 x3, p.283), signature, autonav (crewed) / pilot (drones) from APilot, sensor (the Sensor Package's rating), cost, cargo (Storage + Cargo; trucks: standard load), seating; economy and fuel/power in the notes; the rest in notes. Access (doors and hatches) is not carried: no rule reads it.

**Passes:** Codex blind pass, 105 rows over 56 pages; every difference read from the render.

**Fixed:**
- Leyland-Zil Tsarina (Multifuel) p.9: B/A 1/0 -> armor 0 (was 2 -> 6).
- Honda-GM 3220 ZX Turbo p.12: APilot 2 (was 1).
- Entertainment Systems Papoose p.16: 6,000¥ (was 4,000¥).
- Hyundai Offroader p.18: Sig 2 (was 1).
- Thundercloud Pinto p.19: B/A 3/0 -> armor 0 (was 2 -> 6).
- Landrover Model 2046 (Long Wheelbase) p.27: APilot 2 (was 1).
- GMC Bulldog Step-Van (Bonded-Courier) p.33: Speed 35/85 (max was 105), Sig 1 (was 2).
- Nordkapp-Conestoga Bergen (Command Module) p.36: Sig 2 (was 3).
- Nordkapp-Conestoga Bergen (Cargo Module) p.36: B/A 5/1 -> armor 3 (was 0).
- Mostrans Ivan KVP-14T p.38: cargo 3 CF in cab (was 20, the optional Passenger Module's).
- GMC-Beachcraft Vacationer p.39: cargo 2 CF (was 30, the rear cabin's built-ins).
- Harland & Wolff Classique p.45: Body 6 (was 3); its token grows 3x11 -> 4x14 by the module's Body rule.
- Embraer-Dassault Mistral p.48: the '(Military)' actor had the FLOAT variant's numbers (Speed 225/350, +25,000¥); renamed 'Mistral (Float)' (same id, file and art) with a corrected description; the base Mistral lists the Military (sensor) variant.
- Luftschiffbau Zeppelin LZ-2049 p.57: APilot 2 (was 3).
- General Products COP p.65: Sig 4 (was 5).
- CASA J-239 Raven p.72: Sig 4 (was 1).
- Moonlight Aerospace Avenger p.73: Sig 8 (was 3).
- Sikorsky-Bell Microskimmer p.83: Sig 3 (was 5).
- Cyberspace Designs Dalmatian (Armed) p.82: APilot 3 (was 2).
- Drones (Snooper, Microskimmer, Wandjina, Doberman, Dalmatian, Dalmatian Armed): 'Store' (cargo space needed to carry the drone) had been stored as the drone's cargo; cargo is now the printed Cargo/Storage (0, 0, 2, 1, 1, 1) and Store is in the notes.
- Off-road Handling of ground vehicles now also fills the handlingOffRoad field (it was only in the notes); a second Handling value on non-ground vehicles (Cigarette 4/5, Red Ranger 4/6, Wandjina 3/5, Snooper 4/3, Doberman 3/5) is in the notes as printed.

**Kept / noted:**
- Leyland-Rover Transport (Electric / Internal Combustion) p.29: priced and sized with the Enclosed-Box cab (chassis 25,000/30,000¥ + 15,000¥ cab, 90 CF), as the identity map pairs them; the chassis-only price is in the notes.
- Trucks (Ares Roadmaster, GMC 4201, Conestoga Trailblazer, GMC-Nissan Hovertruck): cargo is the printed Standard Load / rear flat container, not the cab storage.
- OPEN: Bergen (Cargo Module) p.36 prints no APilot (the cost sits under that heading); the module ships APilot 2. Kept; needs a ruling or a photo.
- Seating, economy, fuel/power, cargo (both the Storage and the Cargo line) and sensor were diffed for all 69 after code review round 1 (the first diff had read only Storage and skipped sensor); the differences are fixed below under 'Code review round 1'. The 3220 ZX Turbo's economy (45 km/L) was a Codex row mix-up. The Dolphin II and Classique print no Seating line; their seating comes from the prose (deck seating for five; twelve passengers).
- Doberman p.85: Sensor Package 'Advanced' with no rating; 3, as the Wandjina's printed Advanced (3).

**Fixed in code review round 1:**
- Sikorsky-Bell Red Ranger p.75: cargo 10 CF (was 30); economy 0.5 km/L (notes said 5); wheels-engaged economy 2 km/L added.
- Surfstar Marine Seacop p.67: cargo 10 CF (was 12); the description's 'EnviroSeal cabin' is the book's 'completely enclosed cabin'.
- Ferrari Appaloosa p.90: sensor 6, Military I (6) (was 4); ECM/ECCM Military I (4)/Military I (4).
- Aztechnology Aguilar-EX p.94: sensor 7, Military II (7) (was 4); economy 1 km/L (2 PF/km under the electric drive).
- Nordkapp-Conestoga Bergen (Cargo Module) p.36: fuel 1,000 L (notes said 2,000, the Command Module's); economy 4 km/L.
- Zemlya-Poltava Swordsman p.42: fuel IC/50 L (notes said 75).
- Dalmatian (50 L, 15 km/L), Dalmatian (Armed) (12 km/L), Wandjina (MultiF/350 L, 3 km/L; 30 L/km in stealth mode), Doberman (25 L, 20 km/L): fuel and economy added to the notes.

### Fields of Fire — 8 vehicles, p.62-69 (PDF = book)

**Fields:** Handling (on/off), Speed (cruise/max), B/A, Sig, APilot, Cost, Seating, Access, Economy, Fuel/Power, Cargo, drones' Store, sensors, set-up, L/T profile. Targets as RBB (SR2 book: no x3).

**Passes:** Codex blind pass, 10 rows; differences read from the renders.

**Fixed:**
- Titan Transport p.66: B/A 5/12 (was Body 3, Armor 4).
- Striker Light Tank p.65: APilot 2 (was pilot 6).
- Speed held the MAXIMUM on all 8; now the cruising speed (15, 40, 25, 25, 150, 30, 40, 10), the pair in the notes.
- Off-road Handling filled for the ground vehicles (MPUV 3, Devil Rat 3, Striker 4); the drones' second value is in the notes.
- Drones (Condor II, Steel Lynx, Ferret): cargo was their Store (4, 20, 1); now 0, Store in the notes.
- APilot moved to autonav on the crewed vehicles (pilot stays for the drones).

**Kept / noted:**
- The generator writes placeholder art, so packs-src is now the source; the generator is marked reference-only.

### Corporate Security Handbook — 6 vehicles, p.86-91 (PDF = book + 9)

**Fields:** As FoF plus Availability and Street Index (printed per vehicle).

**Passes:** Codex blind pass, 6 rows; all stats agree.

**Fixed:**
- Ares Guardian Drone p.91: cargo was its Store 20 CF; now 0, Store explained in the notes.
- TR-55T/E/C: APilot moved to autonav.

**Kept / noted:**
- TR-55C cargo 60 = 10 CF storage + 50 CF cargo (p.88).

### Cyberpirates — 9 vehicles, p.175-178 (PDF = book + 9)

**Fields:** Rigger 2 format (Handling, Speed, Accel, Body, Armor, Signature, Autonav, Sensor, Cost, Seating, Entry, Cargo, Load, Fuel, Economy).

**Passes:** Codex blind pass, every vehicle agrees.

**Fixed:** nothing; every stat agrees.

**Kept / noted:**
- Signature 'a/b' (surface/submerged): the first figure is stored; both are in the notes. Speed is the Rigger 2 single Speed.

### Neo-Anarchists' Guide to Real Life — 3 vehicles, p.90-91 (PDF = book + 9, not +1)

**Fields:** Handling, Speed (cruise/max kph), Body, Armor 'n (3n)', Sig, APilot, Cost, passengers.

**Passes:** Codex blind pass; differences read from the render.

**Fixed:**
- SV250 Semiballistic p.90: Body 5, Armor 2 (6) -> 6 (was Body 2 with an invented '6 structural', Armor 1); 150 passengers (was 350).
- China Clipper p.91: Body 5, Armor 2 (6) -> 6 (was Body 2, Armor 0); 150 passengers (as many as the semiballistic; was ~350).
- Arrow HSCT p.91: Armor 1 (3) -> 3 (was 1).
- APilot moved to autonav (pilot 0).
- The module's CLAUDE.md said PDF = book + 1; it is +9 at these chapters (corrected).

**Kept / noted:**
- Speeds are stored as printed (the module reads them as kph).

### Street Samurai Catalog — 2 vehicles, p.47-48 (PDF 42-43)

**Fields:** Handling, Speed (cruise/max), Body, Armor, Signature, Pilot, Cost.

**Passes:** Codex blind pass; both agree.

**Fixed:**
- Speed held the maximum (210, 160); now the cruising speed (70, 50).
- Pilot moved to autonav; cites now give the book page.

### Queen Euphoria (SR1) — 6 vehicles, p.16 (PDF 18)

**Fields:** Handling, Speed, Body, Armor, Signature, Pilot, Cost (SR1 line).

**Passes:** Read from the render (3 vehicles, each as an actor and inside the Adventure).

**Fixed:**
- All three are copied from the core pack (ruling 2026-08-03, 'method A'), so they carried the R2 stats too; regenerated from the corrected core pack (only the vehicles changed; the Adventure's embedded copies equal the actors).
- Northrup PRC-42D Wasp: the D doesn't exist in SR2, so its printed line converts (p.283): Signature 5 and 340,000¥ added to the existing Armor 1 -> 3 (it had the 42B's Signature 3 and 220,000¥).

**Kept / noted:**
- Americar (security variant) keeps the catalogue 20,000¥ and stats, not QE's 80,000¥ / 45/135 / Body 3 / Armor 1 (ruling 2026-08-03).
- PRC-42D Wasp: its notes had the D's Speed 65/100 and the 42B's 'Core book: Speed 65/130' line; the core line is replaced by the D's own (code review round 1).
- Regenerating QE also changed six NPCs' item weights (system weapon catalogue drift); not part of the audit, so those files were left as committed.

## Existing world vehicles

Nothing in a world changes (no migration): the fixes reach **new imports** only. To correct a copy already in a world,
delete it and drag it in again from the compendium, or edit the fields above by hand. With the Rigger 2 module on, the
**Rigger 2 stats** window updates the vehicles the Rigger 2 list covers to *that* list's stats instead.
Vehicles with a changed stat: all 32 core vehicles (they had the Rigger 2 numbers); the Queen Euphoria three; RBB:
Tsarina (Multifuel), 3220 ZX Turbo, Papoose, Offroader, Pinto, Landrover 2046 (LWB), Bulldog (Bonded-Courier), Bergen
(both modules), Ivan, Vacationer, Classique, Mistral (Float), LZ-2049, COP, Raven, Avenger, Microskimmer, Snooper,
Wandjina, Doberman, Dalmatian (both), Red Ranger, Seacop, Appaloosa, Aguilar-EX; every RBB vehicle's autonav/pilot split; FoF: all 8; CSH: the TR-55s and Guardian;
NAGRL: all 3; SSC: both.

## Open
- **Bergen (Cargo Module)** (RBB p.36) prints no APilot (its cost sits under that heading); it keeps APilot 2. A ruling
  or a photo of the book settles it.
- **Phase 2:** the Rigger 2 list's single Speed is that book's figure (Patrol-1: 180, the core book's maximum), while
  core-format packs hold the cruising speed (60); the crash rules read `speed` as cruising speed. Rigger 2's own
  cruising-speed rule decides how an R2-stat vehicle's crash Power is worked out.
- The core book's Availability/Street Index rule (p.264: Availability = Cost/10,000, …) is not filled in per vehicle.
