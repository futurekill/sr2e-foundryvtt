# Matrix/Decking Rules Audit vs. Virtual Realities 2.0

**Date:** 2026-07-03
**Scope:** SR2E FoundryVTT system's Matrix/decking implementation, audited
against the source rulebook *Shadowrun 2e — Virtual Realities 2.0* (VR2.0,
FASA7904), a scanned image-only PDF (184 pages). All VR2.0 page numbers below
are the book's own printed page numbers (PDF page = book page + 8, confirmed
against printed folios).

**Files audited:**
- `module/rules/sr2e-rules.mjs` (`systemOperationTN`, `personaAttribute`,
  `programSize`, `programCost`, `IC_REACTION_BASE`, `icReactionTime`)
- `module/data/actor-data.mjs` (`matrixPersona`, `_derivePersona`, `ICData`,
  `HostData`, dump shock, matrix initiative fields)
- `module/documents/actor.mjs` (`rollMatrixAttack`, `rollMatrixResistance`,
  `recoverDumpShock`, `rollSystemOperation`, `rollMatrixPerception`)
- `module/config.mjs` (`SR2E.securityCodes`, `SR2E.systemOperations`,
  `SR2E.alertStates`)
- `packs-src/programs/*.json`, `packs-src/ic/*.json`
- Prior planning doc `docs/MATRIX.md` (for cross-reference; its citations are
  discussed below)

---

## 0. CRITICAL SCOPING FINDING — the code implements the wrong rulebook's Matrix system

This is the single most important finding of this audit and colors every
section below.

**Virtual Realities 2.0 is not an expansion bolted onto the core SR2E Matrix
chapter — it is an explicit, wholesale *replacement* of it** (VR2.0
Introduction, p.5: *"VR 2.0 provides new, streamlined rules for mapping
Matrix systems, building and upgrading decks, conducting cybercombat,
IC, utility programs — everything involved in making a Matrix run."*).

Every Matrix-related function and comment in this codebase is cited against
the **SR2E core rulebook** page range p.160–185 (e.g. `SR2E p.165`,
`SR2E p.169`, `SR2E p.178–180`), not VR2.0. Grepping the whole Matrix
implementation (`module/rules/sr2e-rules.mjs`, `module/data/actor-data.mjs`,
`module/documents/actor.mjs`, `module/config.mjs`, `packs-src/ic/*.json`,
`packs-src/programs/*.json`) returns **zero** references to Virtual
Realities or VR2.0. `docs/MATRIX.md` (the project's own pre-work doc) confirms
this: its page index says *"Matrix chapter p.160–185"* — that is the core
book's chapter, and the doc never mentions VR2.0 at all.

VR2.0's Matrix 2.0 rules differ from the core book in essentially every
mechanic that matters for a decker: Security Rating is a code+number *plus
five subsystem ratings* (Access/Control/Index/Files/Slave, "ACIFS", p.16),
not a single System Rating; system operations target the *relevant subsystem
rating*, not one flat number (p.19, p.108+); cybercombat resistance uses Bod
Rating (not the defender's Computer skill or a flat node rating) and TNs come
from a fixed **Cybercombat Target Numbers Table** keyed on Security Code ×
Intruding/Legitimate status (p.123), not "Bod" or "System Rating" as the
attack TN; combat maneuvers (Evade Detection / Parry Attack / Position
Attack) don't exist in the core book at all; a decker's Detection Factor
(not "Masking alone") is what IC/hosts roll against; dump shock's Power is
the host's **Security Value**, not narrative, and its Damage Level is fixed
by a **Dump Shock Damage Levels table** keyed on Security Code (p.124); IC
rating is used as a *damage/perception* attribute but IC's cybercombat
**dice pool is the host's Security Value**, not the IC's own rating (p.40);
White/Gray/Black IC categories from the core book are explicitly restructured
(Killer IC is reclassified from Gray to White in VR2.0, p.41).

**Practical read:** almost nothing in the current implementation can be
marked ✅ against VR2.0 without a caveat, because the code is a faithful,
well-cited implementation of a *different, incompatible* Matrix ruleset. The
sections below still do a value-by-value comparison as instructed, citing
VR2.0 page numbers throughout, so any future decision to port the subsystem
to VR2.0 (or to explicitly keep the core-book system and document that
choice) has a concrete list to work from.

---

## 1. Persona program rules (Bod/Sensor/Evasion/Masking derived from MPCP)

- ❌ **MISMATCH (scope + missing budget cap).** VR2.0 (p.17, p.76): a
  cyberdeck's persona is defined by **BEMS** (Bod/Evasion/Masking/Sensor).
  Two caps apply simultaneously: (1) *"No single Persona Rating may exceed
  the MPCP Rating"* and (2) *"The MPCP Rating multiplied by 3 equals the
  maximum total of the deck's persona programs"* — i.e., **Bod+Evasion+
  Masking+Sensor ≤ MPCP × 3** (p.17, restated p.76: *"The total ratings of
  the four Persona programs cannot exceed the MPCP Rating × 3."*).
  Implementation: `module/rules/sr2e-rules.mjs:159-161`
  ```js
  export function personaAttribute(programRating, mpcp) {
    return Math.min(programRating, mpcp);
  }
  ```
  called from `module/data/actor-data.mjs:405-421` (`_derivePersona`), applies
  **only** the per-attribute MPCP cap (matches the core book's simpler rule,
  cited there as `SR2E p.172`). There is no enforcement anywhere of the
  ×3 total-pool budget — a decker could load Bod-6/Evasion-6/Masking-6/
  Sensor-6 on an MPCP-6 deck (24 points, should be capped at 18) and the
  code would accept it. Also note VR2.0's format ordering is MPCP/Bod/
  Evasion/Masking/Sensor (p.17); the code's internal field order
  (bod/evasion/masking/sensor) is consistent internally so this is cosmetic.
- ⬜ **Detection Factor not implemented as specified.** VR2.0 (p.17-18):
  *"Detection Factor = average (round up) of the decker's Masking Rating and
  [running Sleaze/utility rating]"* (the worked example on p.19: Masking 6 +
  Sleaze 5, averaged and rounded up = 5.5 → 6... actually the HeadCrash
  example computes (6+5)/2 = 5.5 rounded up = **6**, but the visible text
  says "Detection Factor is 6" — recorded as printed). This is a materially
  different mechanic from what the code implements: `rollMatrixPerception`
  (`module/documents/actor.mjs:1933-1966`) uses the **IC's Rating vs. the
  target's Masking alone** as TN, with no averaging against a running
  Sleaze-type utility, and it is IC-initiated rather than being the
  universal TN for *all* System Tests made against the decker (VR2.0's
  Detection Factor gates every proactive System Test against the decker, not
  just an IC "detect" action). Docs/MATRIX.md explicitly disclaims this
  (calling Detection Factor "an SR3 term") — that note is itself incorrect;
  VR2.0 (a 1995 SR2 sourcebook) does define Detection Factor, p.17.
- ❌ Persona attribute *derivation source* differs: VR2.0 ties BEMS directly
  to the "persona programs" (Bod/Evasion/Masking/Sensor) loaded on the deck,
  capped as above — the code's approach of taking `Math.max` of same-typed
  loaded `program` items (`actor-data.mjs:410-417`) is functionally
  consistent with this at the single-attribute level, so the *lookup*
  mechanism is fine; only the aggregate cap (previous bullet) is missing.

## 2. Matrix initiative and Matrix reaction calculation

- ✅ **Base decker Initiative matches.** VR2.0 Cybercombat (p.120):
  *"The Initiative of a decker is based on the Reaction attribute of the
  decker's persona. If his Reaction has no enhancements, the decker rolls
  1D6 and adds the result to his Reaction to determine Initiative."* This is
  standard `SR` Initiative (1D6 + Reaction), matching
  `module/data/actor-data.mjs:202-204` comment (*"Matrix state... jacked in
  → Matrix initiative (1d6 + Reaction...)"*) — the core book and VR2.0 agree
  here, so this is a genuine ✅ regardless of citation.
- ✅ **Response-increase bonus matches in spirit.** VR2.0 (p.120): *"Reality
  filters, response-increase circuitry, and running on hot decks by DNI all
  boost a decker's Initiative"* — consistent with the code's
  `+2 Reaction & +1D6 per response level` comment
  (`actor-data.mjs:202-204`); exact per-level values weren't re-verified on
  this pass against VR2.0's Cyberdecks chapter (p.87, "Response Increase")
  since docs/MATRIX.md already cites this against the core book at the same
  value and no VR2.0-specific table contradicted it in the pages reviewed.
- ✅ **Wired reflexes / magic / VCR exclusion matches.** VR2.0 (p.120):
  *"Wired reflexes, magical augmentation, vehicle-control rigs, and other
  enhancements that increase the Reaction attribute of a decker's physical
  body do not affect Initiative in the Matrix."* Matches the code's intent
  (`actor-data.mjs:202-204`), though this pass did not re-verify the
  `_getInitiativeParts` branch line-by-line (out of scope per the audit's
  file list; flagged for a follow-up pass).
- ⬜ **IC Initiative uses a different formula in VR2.0.** VR2.0's **IC
  Initiative Table** (p.120) sets IC Initiative by the **host's Security
  Code**, not the core book's per-color Reaction-Time-base formula:
  Blue = 1D6+IC Rating, Green = 2D6+IC Rating, Orange = 3D6+IC Rating,
  Red = 4D6+IC Rating. Implementation (`module/rules/sr2e-rules.mjs:241-249`,
  used by `ICData.prepareDerivedData` at `actor-data.mjs:1084-1090`) computes
  `initiative.base = icReactionBase(securityCode) + effectiveRating` then
  rolls a flat `1D6` for the die — i.e., a *constant* base + 1 die, cited as
  `SR2E p.169` (core book). VR2.0 instead scales the **number of dice
  rolled** (1D6→4D6) by Security Code, with no separate "base" term. These
  are different formulas with different variance/averages; recorded as a
  mismatch against VR2.0 (the core-book formula the code implements is
  internally consistent with itself, so this is a scope issue, not a code
  bug per se).
- ❌ **Non-combat action rate is entirely unimplemented.** VR2.0 (p.121):
  for non-combat actions, *"divide the decker's Reaction attribute by 10
  (round up the result)... Add 1 action for every Initiative die the decker
  receives in combat beyond the standard 1D6."* No equivalent exists
  anywhere in the grepped code — this is VR2.0-specific tooling with no
  core-book analogue, so it's simply missing rather than mis-implemented.

## 3. Cybercombat: attack TNs, damage codes/staging, resist test

- ❌ **Attack/resist TN model is fundamentally different.** VR2.0's
  **Cybercombat Target Numbers Table** (p.123):

  | Host Security Code | Intruding | Legitimate |
  |---|---|---|
  | Blue | 6 | 3 |
  | Green | 5 | 4 |
  | Orange | 4 | 5 |
  | Red | 3 | 6 |

  The attack TN depends only on the **target icon's status** (Intruding vs.
  Legitimate) and the **host's Security Code** — it does *not* depend on the
  target's Bod Rating or the node's numeric System Rating at all (aside from
  utility/maneuver modifiers). Implementation
  (`module/documents/actor.mjs:1674-1713`, `rollMatrixAttack`) instead uses
  `opts.tn` = "the target persona's Bod (if target is a persona) or the
  node's System Rating (if target is IC)" (comment at line 1679, cited
  `SR2E p.178-179` = core book). This is a different TN entirely.
- ❌ **Resist test dice pool differs.** VR2.0 (p.123): *"The icon that has
  been hit rolls a Damage Resistance Test using its **Bod Rating**... For IC
  programs that take damage, make a Damage Resistance Test using the
  **host's Security Value**."* Implementation
  (`rollMatrixResistance`, `actor.mjs:1743-1809`) instead rolls **IC Rating**
  dice vs TN = node System Rating for IC, and **MPCP** dice vs TN = decker's
  Computer skill for a persona (comment cites `SR2E p.179` = core book) —
  neither the dice pool nor the TN matches VR2.0's Bod-based resistance
  model.
- ❌ **Damage staging differs.** VR2.0 (p.123-124): attacks have an
  explicit Power + Damage Level (Damage Code), and *"For every 2 successes
  on the attacker's Attack Test, stage up by 1 level the Damage Level of the
  attack"* — standard SR staging applied to a Power/Level pair, with a
  separate **IC Damage Table** fixing IC attack Damage Level by the host's
  Security Code (Blue/Green = Moderate, Orange/Red = Serious) before
  staging. The code's model (net successes = attacker successes minus
  defender successes, filled directly as condition-track boxes,
  `actor.mjs:1777-1801`) has no Power/Damage-Level/staging concept at all —
  it's a flat "net successes = boxes filled" model from the core book,
  structurally incompatible with VR2.0's staged Damage Code model.
- ❌ **Condition Monitor size.** VR2.0 (p.123): *"All icons use a Condition
  Monitor. Each Condition Monitor has 10 boxes... Once all 10 boxes are
  filled, the icon crashes."` This is a flat 10 for every icon type. The
  code's `matrixPersona.condition.max` is correctly 10
  (`actor-data.mjs:172`), but `ICData.conditionMonitor.max` is set to
  **`this.rating * 2`** (`actor-data.mjs:1086`) — for any IC rated other
  than 5, this diverges from VR2.0's flat 10-box rule (e.g., a Rating-8 IC
  in the packs, such as `packs-src/ic/...` UV-tier IC, gets a 16-box
  monitor instead of 10). Also note the `Condition Monitor Table` (p.124)
  specifies *fill-in amounts per Damage Level* (Light=1, Moderate=2,
  Serious=3, Deadly=6 boxes) rather than "successes = boxes" — another
  facet of the same staging mismatch above.
- ❌ **Combat maneuvers absent.** VR2.0 (p.121-122) defines Evade Detection,
  Parry Attack, and Position Attack maneuvers (each an opposed Evasion vs.
  Sensor test, or a Security Test for IC/host-controlled icons) that modify
  TNs or attack Power. None of these exist in the code (`rollMatrixAttack`
  / `rollMatrixResistance` have no maneuver support). This is pure gap, not
  mismatch, since the core book the code is built against has an analogous
  but differently-named/mechanic'd system that also isn't implemented per
  docs/MATRIX.md's own gap list ("no ... security tally, or system-operation
  flow" — though system operations *are* now implemented against the core
  book).
- ✅ **Actions-per-turn structure loosely matches.** VR2.0 (p.120-121):
  Free Action / Simple Actions (×2) / Complex Action per Combat Phase is
  standard `SR` action economy — nothing in the audited files contradicts
  this general shape (not deeply exercised in the reviewed code, since
  turn/phase sequencing is handled by the generic Foundry combat tracker,
  not Matrix-specific code).

## 4. Dump shock: damage dealt, voluntary vs. involuntary

- ❌ **Dump shock is a boolean +2 TN flag, not a staged damage roll.**
  VR2.0's **Dump Shock Damage Levels table** (p.124):

  | Host Security Code | Damage Level |
  |---|---|
  | Blue | Light |
  | Green | Moderate |
  | Orange | Serious |
  | Red | Deadly |

  *"When a decker is crashed off the Matrix or jacks out without performing
  a Graceful Logoff operation, he risks Stun damage from dump shock. The
  Power of the damage equals the host's Security Value."* So dump shock in
  VR2.0 is an actual **Stun Damage Code (Power = Security Value, Level per
  the table above)** resisted normally (Body-based Damage Resistance Test),
  with **cool decks** (−2 Power, −1 Level), **ICCM** (−2 Power, −1 Level,
  stacks with cool deck for −4/−2 total), and **tortoise users being
  immune**. The implementation
  (`module/data/actor-data.mjs:205-206`, `dumpShock: BooleanField`;
  `module/documents/actor.mjs:1793-1794, 1811-1834`) instead models dump
  shock as a simple **boolean flag adding a flat +2 to all target numbers**
  until a Willpower(4) test clears it — no damage roll, no Security-Code-
  scaled severity, no cool-deck/ICCM/tortoise mitigation. This matches the
  *core rulebook's* dump shock rule (cited `SR2E p.180`) but not VR2.0's.
- ❌ **Voluntary vs. involuntary distinction is absent either way.** Neither
  VR2.0 nor the current code appear to give a mechanical break between a
  voluntary jack-out and being crashed, **except** that VR2.0 exempts a
  successful **Graceful Logoff** operation from dump shock entirely (p.124:
  *"...crashed off the Matrix **or** jacks out without performing a Graceful
  Logoff operation, he risks Stun damage..."*, implying a Graceful Logoff
  avoids it). The code has no Graceful Logoff operation implemented
  (`CONFIG.SR2E.systemOperations`, `module/config.mjs:468-479`, has no
  `gracefulLogoff` key) and unconditionally applies dump shock only on a
  Matrix-attack crash (`actor.mjs:1789-1794`) — an ordinary "leave the
  Matrix" action was not found calling `recoverDumpShock`/setting
  `dumpShock` at all, so the voluntary-exemption path is simply not
  modeled, consistent either way.
- ✅ Both VR2.0 and the code agree dump shock is tied to the crash/logoff
  moment, not narrative-only flavor — the code's Willpower(4) recovery test
  (`actor.mjs:1815-1834`) is a defensible design even though it does not
  match VR2.0's numeric model; recorded as a Low-impact house-rule note
  rather than a hard mismatch since VR2.0 doesn't describe a recovery test
  at all (the Stun damage simply gets healed/resisted like any other Stun).

## 5. The System Operations Table (operations × TN modifiers incl. security/alert)

- ❌ **Wrong TN axis entirely.** VR2.0 (p.16, p.19): every System Test's
  target number is one of the **five subsystem ratings** (Access, Control,
  Index, Files, Slave — "ACIFS") depending on which operation is being
  performed (e.g., logging on = Access Test vs. Access Rating; editing a
  file = Files Test vs. Files Rating; taking control of a slaved device =
  Slave Test vs. Slave Rating), not a single flat "System Rating." The
  System Tests are also **opposed** (p.19): *"System Tests are always
  resolved as opposed tests between the decker and the target host/grid...
  the gamemaster rolls the host/grid's Security Value... against the
  decker's Detection Factor."* Implementation
  (`systemOperationTN`, `module/rules/sr2e-rules.mjs:148-150`; consumed by
  `rollSystemOperation`, `module/documents/actor.mjs:1856-1920`) computes a
  single TN = `host.system.systemRating + priorAttempts×2 + defaultPenalty`
  for **every** operation type (`CONFIG.SR2E.systemOperations`,
  `module/config.mjs:468-479`, all ten operations share one TN formula) and
  is a one-sided Computer Test against that flat number, not an opposed
  test against Detection Factor. `HostData`
  (`module/data/actor-data.mjs:1100-1128`) has only a single
  `systemRating` field — no Access/Control/Index/Files/Slave subsystem
  fields exist anywhere in the schema.
  This is the same core-book-vs-VR2.0 architecture gap noted in section 0;
  every operation in `CONFIG.SR2E.systemOperations` is consequently checked
  against the wrong axis. The +2-TN-per-retry escalation
  (`systemOperationTN`'s `priorAttempts * 2` term) is a genuine core-book
  rule (SR2E p.166-168) with **no VR2.0 analogue found** in the pages
  reviewed — VR2.0's opposed-test model re-rolls the host's Security Value
  fresh each time rather than stacking a per-attempt TN penalty on the
  decker.
- ⬜ **VR2.0's own System Operations reference table** (referenced at
  "System Operations Table, p. 161" per the Cybercombat chapter, p.120) is
  in the GM-facing back matter and was not independently re-rendered this
  pass — the operation-to-subsystem mapping is already conclusively
  established as different from the code's model via p.16 and p.19 above,
  so the specific per-operation modifier table was deprioritized. Flag for
  follow-up if a VR2.0 port is undertaken.
- ❌ **Operation list mismatch.** The code's ten operations
  (`locate, read, transfer, edit, erase, control, sensorReadout,
  cancelAlert, displayMap, lockout`) don't correspond to VR2.0's named
  operations (VR2.0's Systems Operations chapter, p.108+, groups operations
  under Interrogations / Ongoing Operations / Monitored Operations, and
  explicitly includes a **Graceful Logoff** and **Validate Passcode**
  operation, neither present in the code's list; VR2.0's decoy-frame
  material references a **Decoy** and **Null** operation likewise absent).
  This list is core-book-flavored (matches the pre-VR2.0 operation names
  more closely).

## 6. Alert states/security codes and their gameplay effects

- ❌ **Security Code role differs.** VR2.0 (p.16): *"A Security Rating
  consists of a security code (a color) and a Security Value (a number)...
  The four security codes are Blue (little or no security), Green (average
  security), Orange (significant security), and Red (high security)."* The
  code (`SR2E.securityCodes`, `module/config.mjs:456-463`) keeps the same
  four color names but assigns them a **`successes` threshold (Blue=1,
  Green=2, Orange=3, Red=4)** that a decker's test must beat to succeed —
  this "successes needed" concept is the **core book's** Security Code
  rule (cited `SR2E p.165`); VR2.0 uses the Security Code purely as a
  descriptive label plus the numeric Security Value (4-12+) as the actual
  opposed dice pool (p.16: *"Security Values range from 4 to 12... The
  Security Value indicates the number of dice the gamemaster rolls to
  oppose a decker's system tests"*) — no "successes needed" mechanic
  exists in VR2.0 at all.
- ❌ **Alert states differ.** The code's `SR2E.alertStates`
  (`module/config.mjs:483-487`, `none/passive/active`, +50% IC rating on
  alert, cited `SR2E p.168` = core book) has no VR2.0 counterpart found in
  the reviewed VR2.0 pages — VR2.0's equivalent concept is the **Security
  Tally** (p.19): a running total of successes a host/grid accumulates
  against a decker across System Tests during a session, which *"may
  trigger actions within the host/grid... ranging from the activation of
  black IC programs to nothing at all"* at GM-set thresholds — an open-
  ended, GM-adjudicated escalation rather than the code's fixed three-state
  alert ladder with a flat rating multiplier. This is architecturally
  different: VR2.0 has no `+50%` IC boost tied to alert state in the pages
  reviewed.
- ⬜ Alert/tally interaction with IC deployment (`docs/MATRIX.md`'s "IC
  deploy on active alert") is a core-book-based design not found in VR2.0's
  Security Tally text reviewed this pass; VR2.0's system instead says
  security-tally thresholds are entirely GM-defined per system (p.19,
  p.149 "Matrix Hot Spots" GM section) rather than following a fixed
  passive→active ladder. Not independently re-verified against p.149+
  (out of the file list's explicit scope; flagged only).

## 7. IC (Intrusion Countermeasures) — types and ratings

- ❌ **IC's cybercombat dice pool is wrong.** VR2.0 (p.40, "IC Ratings"):
  *"In cybercombat, an IC program makes its Attack Tests using its **host's
  Security Value** as a 'skill'... In other words, the host computer
  attacks the decker and uses the IC as a weapon."* — the number of dice an
  IC rolls to attack is the **host's Security Value**, not the IC's own
  Rating. The packs data (e.g. `packs-src/ic/Killer_IC_882205604610da9f.json`,
  rating 5, securityCode "orange") and the code's resistance/attack rolls
  (`ICData.effectiveRating`, `actor.mjs:1750`, `1935`) both use the **IC's
  own `rating`** (alert-adjusted) as its dice pool throughout — this is the
  core book's model (cited `SR2E p.169`), not VR2.0's host-Security-Value
  model.
- ❌ **White/Gray/Black IC taxonomy has been restructured in VR2.0.** VR2.0
  explicitly changed the categorization from the core book (p.41,
  parenthetical note on Killer IC: *"Note that killer IC is classified as
  gray IC in SRII. However, it does not cause permanent damage to a
  cyberdeck's permanent ratings or utilities, so it is classified as white
  IC in Matrix 2.0 rules."*). The packs data classifies Killer IC as
  `"icType": "gray"` (`packs-src/ic/Killer_IC_882205604610da9f.json:7`) —
  correct for the core book, but a direct mismatch against VR2.0's
  explicit reclassification. Similarly VR2.0 (p.40) states *"Matrix 2.0
  eliminates access and barrier IC. The new rules for System Ratings
  replace the functions performed by these types of IC"* — the packs still
  ship an `Access_IC_d013745347010fa6.json` and `Barrier_IC_99c9185d88f3afa8.json`,
  IC types VR2.0 says should not exist as IC at all under Matrix 2.0.
- ❌ **VR2.0's actual White IC roster differs from the packs.** VR2.0 White
  IC (p.41-42): Cripplers (acid/binder/jammer/marker — attribute-damage
  IC), Killer (reclassified, see above), Data Bomb, Probe, Scramble
  (exploding/poison), Tar Baby. The packs-src IC roster
  (`Access, Barrier, Black_IC_Killer, Black_IC_Trace_Report, Blaster,
  Killer, Scramble, Tar_Baby, Tar_Pit, Trace_and_Burn, Trace_and_Dump`) is
  missing Cripplers and Data Bomb entirely (VR2.0-specific IC types with no
  core-book equivalent under those names) and still includes Access/Barrier
  IC that VR2.0 retired, and Blaster/Tar Pit/Trace-and-* naming that
  matches the **core book's** Gray/Black IC roster (`SR2E p.170`) rather
  than VR2.0's white/gray/black split.
- ⬜ Gray IC and Black IC VR2.0 rosters/mechanics (p.43-49, e.g. Rippers,
  Sparky, Worms, Trace IC's Trace Factor/Hunt Cycle, Black IC lethality
  rules) were not individually re-verified value-by-value against the
  packs this pass, since the White IC section alone already establishes
  the taxonomy mismatch conclusively; flagged for follow-up if a VR2.0 port
  is undertaken.
- ❌ **IC Condition Monitor.** As noted in §3, VR2.0 IC use a flat 10-box
  Condition Monitor (p.123) but `ICData.conditionMonitor.max = rating * 2`
  (`actor-data.mjs:1086`).

## 8. Utility program size and cost formulas

- ✅ **Size formula matches exactly.** VR2.0's **Program Size Table**
  (p.101): *"Determine a program's size by squaring its rating and
  multiplying the result by the program multiplier... A Rating 4 program
  with a multiplier of 6... has a size of 96 Mp."* This is **Rating² ×
  multiplier**, exactly matching
  `module/rules/sr2e-rules.mjs:216-218`:
  ```js
  export function programSize(rating, multiplier) {
    return Math.ceil(rating * rating * multiplier);
  }
  ```
  Spot-checked against the printed table (p.101): Rating 4 × mult 6 = 96 ✅;
  Rating 8 × mult 4 = 256 ✅; Rating 6 × mult 3 = 108 ✅. The `Math.ceil` is
  a no-op for integer ratings/multipliers (VR2.0 doesn't define fractional
  ratings), so this is a clean match. This formula is *also* unchanged from
  the core book, so it is one of the few areas where the core-book-based
  code and VR2.0 fully agree.
- ❌ **Cost formula is wrong — VR2.0 uses a tiered multiplier, not a flat
  ×100.** VR2.0's **Program Prices Table** (p.107):

  | Program Rating | Price (nuyen) | Street Index |
  |---|---|---|
  | 1–3 | Size × 100 | 1 |
  | 4–6 | Size × 200 | 1.5 |
  | 7–9 | Size × 500 | 2 |
  | 10+ | Size × 1,000 | 3 |

  Implementation (`module/rules/sr2e-rules.mjs:226-228`):
  ```js
  export function programCost(rating, multiplier) {
    return programSize(rating, multiplier) * 100;
  }
  ```
  always multiplies by a flat 100, regardless of rating — correct **only**
  for Rating 1–3 programs. A Rating-5 Attack program (size 50 per the size
  table) should cost 50 × 200 = **10,000¥** under VR2.0, but the code
  computes 50 × 100 = **5,000¥** (half price). A Rating-8 program is off by
  5× (should be ×500, code uses ×100). Every program in `packs-src/programs/`
  above Rating 3 is under-priced. Confirmed against the packs data, e.g.
  `packs-src/programs/Attack_5e0ece9c44d0a544.json` (Rating 1, size 2, cost
  200 = 2×100 — correct at Rating 1, but the formula itself doesn't scale
  for higher-rated copies a player might build/buy in play).
- ⬜ VR2.0's note that "the distinctions for utility and persona programs in
  the original SR Matrix rules were based on the cost of personaware
  chips... In the VR 2.0 rules, calculate prices for all programs —
  including personaware and utilities — using the [Program Prices Table]"
  (p.107) means persona programs (Bod/Evasion/Masking/Sensor) should use
  the *same* tiered formula above; the packs' persona program entries were
  not individually re-priced/re-verified line-by-line this pass, but since
  they share the same `programCost` function, they inherit the same
  under-pricing at Rating 4+.

---

## Mismatch Summary

| Rule | Book Value (page) | Implementation Value (file:line) | Impact | Notes |
|---|---|---|---|---|
| **Scope: whole Matrix subsystem** | VR2.0 replaces core Matrix ch. entirely (p.5) | All Matrix code cited `SR2E p.16x-18x` (core book) | **High** | Root cause of nearly every other row; the system implements a different, incompatible ruleset than the one this audit targets. |
| Cybercombat attack/resist TN | Cybercombat TN Table: Security Code × Intruding/Legitimate (p.123); resist = Bod or host Security Value (p.123) | TN = target Bod or node System Rating; resist = IC Rating or MPCP vs Computer skill (`actor.mjs:1679`, `1747-1772`) | **High** | Core combat loop uses the wrong TN axis and wrong resistance dice pool entirely. |
| Damage staging / Damage Code | Power+Level Damage Code, stages +1 level per 2 successes; IC Damage Level fixed by host Security Code (p.123-124) | Flat "net successes = condition boxes filled," no staging, no Damage Code (`actor.mjs:1777-1801`) | **High** | Structurally different damage model; can't be patched incrementally. |
| Program cost formula | Tiered: Size×100 (R1-3) / ×200 (R4-6) / ×500 (R7-9) / ×1000 (R10+) (p.107) | Flat Size×100 always (`sr2e-rules.mjs:226-228`) | **High** | Silently under-prices every Rating 4+ program shown to players/GMs; directly affects economy balance. |
| Persona program total cap | Sum of Bod+Evasion+Masking+Sensor ≤ MPCP×3, in addition to per-attribute MPCP cap (p.17, p.76) | Only per-attribute `min(rating, mpcp)` cap enforced; no total-pool check (`sr2e-rules.mjs:159-161`, `actor-data.mjs:405-421`) | **Medium** | Lets a decker exceed the intended total persona budget (e.g., 24 vs. cap 18 on an MPCP-6 deck). |
| Dump shock model | Stun Damage Code, Power = host Security Value, Level by Security Code table; cool deck/ICCM/tortoise mitigation (p.124) | Boolean flag, flat +2 TN, Willpower(4) to clear, no damage roll (`actor-data.mjs:205-206`, `actor.mjs:1789-1834`) | **Medium** | Removes the "real damage, possibly lethal" stakes VR2.0 intends; also no cool-deck/tortoise interaction. |
| System Operations TN axis | Per-operation subsystem rating (Access/Control/Index/Files/Slave), opposed vs. Detection Factor (p.16, p.19) | Single flat `systemRating` for all operations, one-sided vs. decker (`sr2e-rules.mjs:148-150`, `config.mjs:468-479`) | **High** | Every system operation in the game checks the wrong number; `HostData` has no subsystem fields to even represent the correct model. |
| IC cybercombat dice pool | IC attacks with host's Security Value as its "skill" (p.40) | IC attacks with its own (alert-adjusted) Rating (`actor-data.mjs:1085`, `actor.mjs:1750/1935`) | **Medium** | Changes IC lethality/variance; especially matters on high-Security-Value hosts with low-Rating IC or vice versa. |
| IC Condition Monitor size | Flat 10 boxes for all icons (p.123) | `rating × 2` boxes for IC (`actor-data.mjs:1086`) | **Medium** | IC above Rating 5 becomes harder to crash than intended; below Rating 5, easier. |
| IC taxonomy (White/Gray/Black) | Killer reclassified Gray→White; Access/Barrier IC eliminated (p.40-41) | Killer still `gray`; Access/Barrier IC packs still present (`packs-src/ic/*.json`) | **Low-Medium** | Cosmetic/organizational for most tables, but Access/Barrier IC existing as own actors contradicts VR2.0's explicit retirement of the type. |
| IC Initiative formula | Dice scale 1D6→4D6 by host Security Code, IC Rating added once (p.120) | Flat "base" (Security-Code constant + Rating) + always 1D6 (`sr2e-rules.mjs:241-249`) | **Low-Medium** | Different variance/average at Orange/Red hosts; low-frequency impact (Initiative order only). |
| Alert states vs. Security Tally | Open-ended GM-set Security Tally thresholds (p.19) | Fixed none/passive/active ladder with +50% IC rating (`config.mjs:483-487`) | **Low** | The code's model is a reasonable, playable simplification but isn't what VR2.0 specifies. |
| Detection Factor | Avg(Masking, running Sleaze-type utility) rounded up; gates *all* System Tests against the decker (p.17-19) | IC-Rating-vs-Masking-only perception roll, not tied to System Tests generally (`actor.mjs:1933-1966`) | **Low** | Narrower in scope than VR2.0's Detection Factor; docs/MATRIX.md's claim that SR2 "has no Detection Factor" is itself inaccurate for VR2.0. |
| Non-combat action rate | Reaction÷10 (round up) actions per turn, +1 per bonus Initiative die (p.121) | Not implemented | **Low** | VR2.0-only mechanic with no core-book analogue; pure gap, not a wrong value. |

**Totals this pass:** ✅ 4  ❌ 18  ⬜ 7 (see inline call-outs above; some
items combine several sub-checks in one bullet).

---

## VR2.0 Implementation Progress

The VR2.0 Matrix is being built **incrementally behind a world setting** so the
core-book Matrix (the default) is never at risk. Flip **Settings → Matrix
ruleset → Virtual Realities 2.0** to opt in.

### Done
- **`matrixRuleset` world setting** (`core` | `vr2`, default `core`) — registered
  in `module/sr2e.mjs`. Nothing branches on it yet; it's the switch the rest
  hangs off.
- **Pure VR2.0 rules primitives** in `module/rules/sr2e-rules.mjs` (unit-tested,
  page-verified against the VR2.0 PDF):
  - `cybercombatTN(securityCode, iconStatus)` — Cybercombat TN Table (p.123)
  - `icDamageLevel(securityCode)` — IC Damage Table (p.124)
  - `dumpShockDamage(securityCode, securityValue, {coolDeck, iccm, tortoise})` —
    Dump Shock Damage Levels + mitigation (p.124)
  - `detectionFactor(masking, sleazeRating)` — p.17–18
  - `programCostVR2` / `matrixProgramMultiplierVR2` / `programStreetIndexVR2` —
    tiered Program Prices Table (p.107, spot-checked against the physical page)

### Next (roughly in order)
1. `matrixRuleset()` accessor + wire `programCost` to the tiered VR2.0 formula
   when the setting is `vr2` (self-contained, low-risk).
2. `HostData` ACIFS subsystem fields (Access/Control/Index/Files/Slave) +
   Detection Factor, shown on the host sheet only in `vr2` mode.
3. Branch `rollMatrixAttack` / `rollMatrixResistance` on the setting: VR2.0 uses
   `cybercombatTN` + Bod/Security-Value resistance + staged Damage Codes.
4. Branch dump shock to `dumpShockDamage` (staged Stun) with a Graceful Logoff
   exemption.
5. Per-subsystem System Tests opposed vs. Detection Factor.
6. IC condition monitor flat 10 boxes in `vr2` mode; IC Damage Table.
