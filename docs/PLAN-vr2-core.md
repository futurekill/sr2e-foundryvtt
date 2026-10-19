# Plan: the Virtual Realities 2.0 core, at roll time
_Final — APPROVED by Codex in round 4 (see the REVIEW-LOG)_

## Goal
Make the existing **Settings → Matrix ruleset → Virtual Realities 2.0** switch
(`matrixRuleset === "vr2"`) actually change play. Today it changes only program prices;
the page-verified VR2.0 primitives in `module/rules/sr2e-rules.mjs` (`cybercombatTN`,
`icDamageLevel`, `dumpShockDamage`, `detectionFactor`, `matrixCombatOutcome`,
`matrixConditionBoxes`, `MATRIX_MONITOR_MAX`, `simsenseOverloadTN`) and the host's
ACIFS fields + `securityValue` exist but nothing rolls with them (docs/AUDIT-VR2.md).
**The core-book Matrix stays exactly as it is when the setting is `core`** (the default):
every change below branches on one helper, `isVR2()`.

Load: one GM world, a decker or two, a handful of IC.

Rules, read from 170 dpi renders of the VR2.0 book (PDF = book + 8):
- **System Tests (p.19):** opposed. The decker rolls Computer ("Computing") against TN =
  the target subsystem's rating (Access/Control/Index/Files/Slave) minus the utility the
  operation uses; the host rolls its **Security Value** in dice against TN = the decker's
  **Detection Factor**. The decker succeeds with MORE successes than the host. Win or
  lose, the host's successes add to the **security tally** for that host; the GM sets
  tally trigger steps.
- **Detection Factor (p.17-18):** avg(Masking, running Sleaze utility), round up.
- **Initiative (p.120):** decker = persona Reaction + 1D6 (+ response increase); IC =
  (Blue 1 / Green 2 / Orange 3 / Red 4)D6 + IC Rating.
- **Attacks (p.123):** Simple Action; attacker rolls the offensive utility (Hacking Pool
  may augment) against the **Cybercombat Target Numbers Table** (Security Code ×
  target Intruding/Legitimate; an icon logged on with a valid passcode, and IC, is
  Legitimate). An attack utility is Light/Moderate/Serious/Deadly (p.98, a property of
  the program, multipliers 2/3/4/5); its Power = its rating. IC attacks: Power = IC
  rating, Level from the IC Damage Table (Blue/Green M, Orange/Red S); IC's dice = the
  host's Security Value (p.40).
- **Damage (p.124):** stage up 1 level per 2 attack successes. The target resists with
  its Bod Rating (IC: the host's Security Value) against TN = the Power; an Armor utility
  reduces the Power; stage down 1 level per 2 successes. Condition Monitor: 10 boxes
  for every icon; L1/M2/S3/D6. 10 filled = crash; a crashed persona dumps its decker.
- **Simsense overload (p.124):** when a decker's icon takes damage from white or gray IC
  on a HOT deck (cool decks and tortoises immune): Willpower test vs L2/M3/S5 (+2 if
  running hot DNI-only, −2 with an ICCM); failure = Light Stun, 1 box. Deadly icon
  damage crashes automatically. Not for black IC.
- **Dump shock (p.124):** crashed off, or jacking out without a Graceful Logoff: Stun
  damage, Power = host Security Value, Level by Security Code (Blue L … Red D); cool
  deck and ICCM each −2 Power and −1 level (cumulative); tortoise immune.

## Approach
1. **Mode.** `isVR2()` in `module/rules/` reads the setting (try/catch → false). The
   setting is registered with `requiresReload: true`, so switching reloads every client
   and nothing mixes old derived data with new roll logic. Every Matrix card stores the
   `ruleset` it was made under; a card without one is core, and resolution follows the
   card, not the current setting.

2. **Core leaks closed in vr2.**
   - The legacy `system.dumpShock` +2 TN (`actor.mjs` ~387) and its recovery button apply
     only in core mode (the stored flag is kept for a switch back).
   - IC `effectiveRating` drops the core +50% alert boost in vr2 (`ICData` derived data).
   - `rollMatrixPerception` (core IC-vs-Masking) is refused in vr2 with "VR2.0 detection
     runs through System Tests (p.19)"; its sheet button is hidden.

3. **Data (additive; defaults leave core worlds unchanged; no migration):**
   - `ProgramData.damageLevel` ("" | L | M | S | D). In vr2, an Attack program's size
     multiplier is DERIVED from it (L2 / M3 / S4 / D5, p.98) in `prepareDerivedData`,
     assigned in both directions (core and no-level restore the authored `multiplier`),
     so memory and price follow the level. The item sheet's multiplier input binds to
     the AUTHORED value (`context.authored`, as for other derived prices) and shows the
     vr2 effective multiplier beside it, so editing another field never persists the
     derived one. **Existing Attack programs:** the vr2 attack
     dialog shows a level picker when the program has none and writes it to the item
     (owner) before rolling. The compendium Attack keeps "" (pick per copy).
   - Shared deck fields on BOTH the cyberdeck gear and cranial-deck cyberware, and the
     actor's `system.cyberdeck` fallback: `deckMode` ("hot" | "cool" | "tortoise",
     default "hot"), `dniOnly` (bool), `iccm` (bool), all typed, snapshotted by
     `_snapshotActiveDeck` and RESTORED from source every preparation (CLAUDE.md derived-
     state rule). VR2.0 p.74/p.81 read from renders before coding.
   - **Security tally on the DECKER, per session** (simpler than a GM-owned host field,
     and the decker's own client can write it): `actor.flags.sr2e.vr2Session = { id,
     hostUuid, hostName, tally, receipts: { <cardId>: n } }`. A new session `id` is
     minted when the decker enters the Matrix (or picks a different host); every
     system-test card carries that `id`; an increment applies only when the card's id
     matches the live session, so an old card can't touch a new session. Leaving the
     Matrix (step 7) ends the session (the record is kept as `lastSession` for the GM to
     read, receipts intact). The host sheet shows each linked decker's live tally; the GM
     can also edit it on the decker's Matrix tab.
   - `_derivePersona` restores the AUTHORED persona values before applying loaded
     programs (today an unloaded Masking/Bod keeps its last value — a pre-existing bug
     in both modes), pinned with a second-preparation test.

4. **Pure helpers (Vitest):** `icInitiativeDice(code)`; `systemTestVerdict(deckerS,
   hostS)`; `vr2Damage({power, level, attackS, resistS})`; `attackMultiplier(level)`;
   `personaBudgetOver(bems, mpcp)`; `damageResistArmor` gains an explicit
   `armorCalc: "none"` → 0 armour.

5. **Cybercombat (vr2 branches of `rollMatrixAttack` / `rollMatrixResistance`):**
   - A vr2 attack posts its card even at 0 successes (inert), so Karma can bring it to
     life, as the ranged card does.
   - Attack dialog (vr2): host (prefilled from the IC's `hostUuid` or the decker's
     jackpoint session host), target status (IC targets Legitimate; a decker target
     Intruding unless "valid passcode" is ticked), attack utility (level picker as
     above) or the IC itself, Hacking, Karma, misc. An IC with no host asks for one and
     saves it to its `hostUuid` (owner/GM), so its initiative uses it too.
   - The card snapshots `{ruleset:"vr2", hostName, securityCode, securityValue, power,
     level, icType, attackerType, successes, testMessageId}`: later host edits don't
     change a pending fight. Karma on the attack keeps updating `successes` (existing
     `matrix` card sync).
   - Resist: the existing resist-once machinery (as `resistRangedDamage`): an in-flight
     guard, `isCardResolved(card, "matrix")` re-checked after the dialog and before
     commit, an outcome message carrying `resolves`, and the `createChatMessage` closure
     hook gaining a `matrix` renderer, so a player resisting GM-owned IC closes the card.
     Resolution follows the CARD's `ruleset`, not current derived values: a vr2 card uses
     the snapshot's Security Value and a 10-box monitor explicitly; a core card computes its
     values from CORE rules explicitly (IC: rating × the core alert boost; monitor max:
     the core IC `rating × 2` / persona 10), never from current vr2-derived fields. Persona: Bod dice vs TN max(2, Power − loaded Armor utility); IC: the
     card's Security Value dice vs TN = Power. Just before committing, the attack's
     successes are re-read from the SOURCE test (`testTotalSuccesses`), and the outcome
     closes BOTH tests to Karma (`closesTests: [attackTestId, resistTestId]`).
     Cross-client limit (accepted, as for every card in this system): two devices
     resisting in the same instant can both pass the guard. The test is created CLOSED to Karma (applied at
     once, as nets). The monitor write runs in a per-actor queue that re-reads the live
     value (10 boxes for every icon in vr2; IC monitor max 10 via derived data).
   - Simsense overload: a decker hit by white/gray IC on a hot deck rolls Willpower vs
     `simsenseOverloadTN(level)` (+2 `dniOnly`, −2 `iccm`), closed to Karma, as part of
     the same resolution; failure = 1 Stun box through `commitDamage`. Deadly → crash.
   - Crash → dump shock (step 7), passing the ATTACK card's host snapshot (code + Security
     Value). The defender's identity and session are captured when the defender
     RESOLVES the card (the card itself may be untargeted): `{deckerUuid, sessionId}` of
     the resisting persona at that moment; the crash ends that session only if it is
     still the live one (a decker who has since reconnected keeps the new session, and
     still takes the dump shock of the fight they lost).

6. **System Tests (vr2 branch of `rollSystemOperation`):**
   - Utility matched by name among LOADED programs; TN = max(2, subsystem − utility).
     Decker: Computer (+ Hacking, Karma, misc; untrained default as today).
   - Host: the card's Security Value dice vs TN = Detection Factor, rolled ONCE when
     the card is made (plain dice engine, no Karma) and stored on the card.
   - The card (`flags.sr2e.vr2SystemTest = {testMessageId, successes, hostSuccesses,
     sessionId, operation, ...}`; `successes` is the decker's, the field
     `_syncDependentCards` already updates) is registered in `_syncDependentCards`: Karma
     on the decker's test re-renders the verdict from `successes`; `hostSuccesses` never
     changes, so the tally can't double.
   - Tally: the decker's own client, right after creating the card, adds `hostSuccesses`
     to its live session in a per-actor queue, recording the card id in `receipts` (a
     retry or second click can't add twice). On load, each owner's client reconciles its
     own unreceipted cards for the live session.
   - TN context: system tests pass `skillTnContext("computer")` and decker attacks
     `{ ...skillTnContext("computer"), kind: "attack" }` (kind last, so it isn't overwritten) so drug modifiers apply
     (CLAUDE.md); IC rolls pass `{ kind: "other" }`. A targeted test pins one.

7. **Leaving the Matrix (vr2), one path:** a single queued `vr2LeaveMatrix(actor,
   {graceful})` used by the sheet's Matrix toggle, `jackpoints.mjs` `jackOut()`, and a
   crash. It captures the session host (code + Security Value) BEFORE clearing
   `matrixMode`, asks "Graceful Logoff completed?" for a voluntary exit, and posts the
   dump-shock Stun card (`dumpShockDamage`) unless graceful or tortoise. Resisted with
   the standard Damage Resistance Test, `armorCalc: "none"`. Ends the session (step 3).
   A crash passes the attack card's host snapshot; a voluntary exit uses the live
   session's host, or asks when there is none.

7b. **Host sheet (vr2 only):** controls for the five ACIFS ratings and the Security Value
    override (both already in the schema), plus the live tallies of deckers whose session
    names this host (read-only there; edited on the decker).

8. **IC initiative:** `ICData` derives vr2 initiative (dice = `icInitiativeDice(code of
   its host)`, base = rating); `_getInitiativeParts()` gains an explicit IC branch used
   by the tracker and the sheet alike.

9. **Persona budget:** in vr2 the decker sheet warns when Bod+Evasion+Masking+Sensor >
   3 × MPCP (p.17, p.76). A warning, not enforcement.

10. **Tests.** Vitest: the helpers, HeadCrash's logon (p.19), the derive-persona second
    preparation, the attack multiplier both directions, zero-armour mode. Quench (vr2
    set inside the batch, restored after): a player-owned decker resisting GM IC closes
    the card; two concurrent resist clicks apply once; Karma on a system test flips the
    verdict without changing the tally; a jackpoint
    jack-out without graceful logoff posts dump shock; a cranial deck's iccm reduces it;
    the tally: the owner's client adds a card's host successes once (a second click and
    a reload don't add again), an unreceipted card from before a reload is reconciled on
    load, and a card from an older session is rejected; a core card resolved after a
    switch to vr2 still uses core values; the attack TN context is `kind: "attack"`;
    core-mode batches unchanged.
11. **Docs:** CHANGELOG, AUDIT-VR2 progress, QA-PLAN vr2 section, wiki Matrix page.

## Key decisions & tradeoffs
- Opt-in only: no core-world behaviour changes, no migration.
- Detection Factor uses the persona's Masking and the highest LOADED Sleaze utility.
- Security tally: on the decker, per session, written by the decker's client with
  receipts; trigger steps stay the GM's (p.19).
- Resistance/overload tests are closed to Karma (applied at once), the netgun precedent.
- The quench batch toggles a world setting that `requiresReload`: it sets it via
  `game.settings.set` (the reload prompt is the UI's; the stored value is what the code
  reads) and restores it in `after`.
- Dump shock resisted with Body as standard Stun damage (VR2.0 names the damage, not a
  special test).

## Risks / open questions
- A decker with no jackpoint session: the dialogs ask for the host each time.
- `requiresReload` vs Quench: verify reading the setting after `set` without a reload
  behaves (it should; settings are read live).

## Out of scope (later, own plans)
Combat maneuvers (p.121-122), improvised attacks, special offensive utilities (hog,
poison, black hammer, killjoy…), IC special abilities, deck building/SOTA, frames/SKs,
otaku, Matrix topology/LTG/RTG, non-combat action counts, automated tally triggers.
