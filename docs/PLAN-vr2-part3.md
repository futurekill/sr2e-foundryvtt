# Plan: the Virtual Realities 2.0 Matrix, part 3 — the rest of the IC
_Round 5 — revised after Codex rounds 1–5 (log: PLAN-vr2-part3-REVIEW-LOG.md). Round 3 replaced mutable connection state with an event log._

## Goal
Finish VR2.0's Intrusion Countermeasures chapter (pp.40–53) on top of parts 1–2
(`docs/PLAN-vr2-core.md`, `docs/PLAN-vr2-part2.md`; 0.106.0 and later). Part 2 built
killer IC, the four cripplers, probe, IC defenses, crash/suppress, maneuvers and the
security sheaf. It deferred everything that needs its own state machine. This plan
builds those:
- black IC (lethal, non-lethal, psychotropic, positive-conditioning);
- gray IC (blaster, sparky, rippers, tar pit), and tar baby;
- trace IC (hunt and location cycles, relocate, trace effects) and trap IC;
- data bombs, scramble IC (exploding and poison), and worms;
- host shutdown.

Everything is behind `isVR2()`, or follows the attack card's `ruleset`. The core
Matrix is untouched. Load: one GM world, a decker or two, a handful of IC.

## Out of scope (a part 4, its own plan)
- The optional rules: cascading IC, expert IC, constructs and party IC (pp.51–53).
- The utilities chapter: black hammer, killjoy, restore, the remaining offensive and
  special utilities, and utility options (p.102).
- Grid topology (LTG/RTG/PLTG), so "trace on a grid" (p.47) is a GM note only, and the
  optional bandwidth rule (p.90).
- Otaku, frames and SKs, deck building.

## Rules (read from VR2.0 renders; PDF = book + 8)
- **IC tests (p.40, p.42–43 examples):** IC attacks with the host's Security Value as
  its dice. Its own special tests ("Blaster (8) Test", "Tar Baby (6) Test") roll the IC's
  RATING as dice, against the TN in parentheses.
- **Lethal black IC (p.47–48):**
  - It fights like killer IC. Damage Code: (Rating)M on Blue/Green, (Rating)S on
    Orange/Red, applied to both the decker and the icon. It stages up 1 level per 2
    attack successes.
  - Every hit (even one that does no damage) starts the ASIST subversion: from then on,
    jacking out is a Complex Action and a Willpower (IC Rating) test. On success the IC
    makes one more attack before the link drops. Before the first hit, jacking out is a
    Free Action.
  - Pulling the plug, or an ICCM biofeedback-monitor jack-out, gives the IC an
    automatic attack.
  - Two resistance tests per hit. The decker rolls Body against the Power less
    Hardening (Karma Pool yes, Hacking Pool no). The icon rolls Bod, as against killer
    IC, and armor applies.
  - With the icon killed first, the connection stays. The IC dominates the bandwidth:
    its effective rating is +2. The decker can only try to jack out.
  - If it kills the decker, the connection drops. First the IC takes a shot at the
    MPCP, as blaster IC with double its rating. Destroying the MPCP deletes all data
    downloaded this run (connected storage too) and sets the MPCP to 0.
  - Its damage overflows like physical damage. A Deadly wound may leave permanent
    aftereffects (core p.113–114); the GM may cut Intelligence by 1.
  - On a cool deck, lethal black IC acts as non-lethal (Stun).
- **Non-lethal black IC (p.49):**
  - The damage is Mental (Stun), resisted with Willpower.
  - Unconscious means the connection breaks automatically, but the IC still gets its
    final shot at the MPCP and the downloaded data.
  - It works the same on hot and cool decks. Its Stun can overflow into Physical.
- **Psychotropic black IC (p.49–50):**
  - It is non-lethal. When the decker jacks out or is dumped unconscious, the decker
    makes a Willpower (IC Rating) test, −2 TN on a cool deck. Failure implants the
    effect.
  - **Cyberphobia:** a Willpower (IC Rating) test before each jack-in. The IC's rating
    goes on the TN of every computer or Matrix task. Fear-free drugs or spells may halve
    the penalty.
  - **Judas:** a secret Willpower (IC Rating) test before each compulsive act. On a
    failure the decker acts with effective Stealth = IC Rating, and witnesses get
    Intelligence (IC Rating) to notice.
  - **Matrix maniac:** rage until killed or knocked out, resuming on waking. Tranq
    patches of total rating ≥ the IC's rating suppress it for 24 hours.
  - **Positive conditioning (PCPIC, p.50):** jacking out voluntarily needs a Willpower
    (IC Rating) test, +1/+2/+3/+5 by the decker's wound (L/M/S/D). It is repeated
    every turn after the IC hits. After jacking out, a Willpower (IC Rating) test
    negates further effects. On a failure, +2 TN to anything against the owner (an
    attribute test at TN 6 when no test exists). PCPIC can't join a party with other
    black IC.
  - **Recovery (p.50):** a Willpower (IC Rating) test, daily for the maniac and weekly
    for the others. −1 TN under medication or magical treatment; −2 under intensive
    psychotherapy (Hospitalized lifestyle; not cumulative with medication); a further
    −1 for a maintained spell with the effect. PCPIC is +1.
- **Gray IC (p.43):** permanent damage to the deck. Chips must be replaced.
  - **Blaster:** attacks like killer (armor reduces its damage). If it crashes the
    icon, a Blaster Test against TN MPCP + Hardening (armor doesn't help) costs the MPCP
    1 point per 2 successes. The persona programs' total must then be re-fitted under
    MPCP × 3.
  - **Sparky:** like blaster, with TN MPCP + 2 + Hardening. The decker also takes
    (IC Rating)M, staged up per 2 Sparky successes, resisted by Body with Hardening
    reducing the Power. It is non-lethal by design but physical.
  - **Rippers** (acid-, bind-, jam-, mark-rip): a gray crippler. When it damages an
    icon, a Ripper Test against MPCP + Hardening costs the persona chip 1 point of that
    attribute per success.
  - **Tar pit:** works like tar baby. When it trashes a utility, a Tar Pit Test against
    MPCP + Hardening. 0 successes: tar baby's effect only (Swap Memory reloads it). Any
    success: every copy on the deck is corrupted until the decker jacks out and reloads
    from outside the deck.
- **Tar baby (white, p.42–43):**
  - Reactive. It is triggered by an operational utility used in a System Test, or by a
    program executed for a purpose; never by passive utilities such as armor or sleaze.
  - Opposed: Tar Baby (utility rating) against Utility (IC rating). If the tar baby
    wins, it crashes both itself and the utility. That adds no tally. Swap Memory
    reloads the utility.
  - If the utility wins, the GM makes a secret Sensor test to locate the IC.
  - Inside a construct/party/trap it is −2 TN (part 4).
- **Trace (pp.45–47):**
  - **Trace Factor:** Evasion − the trace IC's rating + Camo rating + Datatrail
    Redirects this run + the jackpoint's trace modifier (+ bandwidth, out of scope).
    *Stated reading:* p.117 (Redirect Datatrail) says a redirect "reduce[s] his trace
    factor by 1". p.45 gives the formula with redirects ADDED, and its worked example is
    "2 Datatrail Redirects, for +2". A higher factor is the IC's TN, so redirects help the
    decker. We follow p.45 (formula plus example).
    A trap link adds half a gray IC's rating, or a black IC's full rating.
  - **Hunt cycle:** cybercombat Attack Tests against TN = the Trace Factor, until one
    succeeds. The decker may fight it. Relocate doesn't work in this cycle.
  - **Location cycle:** ⌊10 ÷ successes⌋ Combat Turns, each counted complete at
    Phase 0. The IC turns reactive. The decker may Locate it (Complex Action) and
    neutralize it.
  - **Crashing it** in cybercombat costs the normal tally (p.19).
  - **Relocate (Simple Action):** a Control Test (Computer vs IC rating − Relocate
    rating), opposed by the host's Security Value vs the Detection Factor, whose
    successes go on the tally. Success spoofs it for that turn. Suppressing it
    (a Detection Factor point) keeps it frozen; otherwise relocate again each turn, and
    a failure lets the trace tick one turn. Relocate never adds the crash tally.
  - **Graceful Logoff** stops the location cycle, at +IC rating TN.
  - **Jacking out** leaves the datatrail for 1D6 − 1 turns (minimum 1). If that is
    ≥ the turns left, it still locates.
  - **Trace effects (p.46):** the jackpoint goes in the security logs (GM; the Security
    Asset Response Times table, p.47); −1 TN to every proactive IC Attack Test against
    the decker; +1 to every tally increase.
- **Trap IC (p.50–51):**
  - A reactive white or trace IC linked to a hidden gray or black IC. Crashing it, or
    the trace finishing its location cycle, triggers the hidden IC.
  - Neutralizing it without destroying it doesn't.
  - Applications, files and remotes can be trapped the same way, triggered by crashing
    the protected icon or failing a System Test to control it.
  - Analyze IC or Analyze Icon detects it.
- **Data bomb (p.41):**
  - Reactive, on a file or a slave device. Found with Analyze Icon; defused with a
    System Test against (the subsystem − the Defuse utility). It stays primed if the
    defuse fails unless all 1s. Defusing it isn't a crash (no tally).
  - It explodes only when a later test to open/read/write or control it SUCCEEDS.
    (Rating)M then auto-hits the persona, resisted normally, with armor reducing it.
  - The explosion adds the IC's rating to the tally unless the decker spends a
    Detection Factor point to suppress it.
- **Scramble (p.42):**
  - Reactive, on part or all of Access, Files or Slave.
  - Decryption (the Decrypt operations, plus a Decryption utility) adds no tally.
    Crashing it in cybercombat adds the tally unless suppressed.
  - Exploding scramble is linked to a data bomb: decrypting or crashing it before
    defusing the bomb sets the bomb off.
  - Poison scramble: a failed decryption → a Poison Test (rating dice) against the
    decker's Computer skill. Success destroys the data; failure means the decker
    suppressed its destruct code. It reacts the same way to each cybercombat attack
    action against it.
- **Worms (p.43–45):**
  - They infest a subsystem. Any System Test against it, or an Analyze Subsystem of it,
    prompts an infection test: Security Value dice against TN MPCP. 1 success infects;
    with Hardening, the successes must exceed it.
  - Disinfect or cybercombat destroys a worm (no tally; it has no rating). A failed
    attempt prompts an infection test.
  - An infected MPCP can't be cleaned: a new MPCP chip is needed. The infection is
    found only by a Computer (or Hardware/B/R) task, base time 10 hours.
  - **Dataworm:** 1D6 = 1 on each logon sends a report. The decker makes Sensor (8) to
    notice it, then may fight it (3D6 Initiative, Evasion 8, evades detection, no
    offence).
  - **Deathworm:** +2 TN to the decker's cybercombat Attack and Resistance tests, +1
    per further deathworm.
  - **Tapeworm:** 1D6 − 1 paydata points lost at the end of each run; a specific file:
    corrupted on 5–6.
- **Host shutdown (p.53):**
  - At the shutdown threshold: (⌈Security Value ÷ 2⌉)D6 Combat Turns, and a final
    warning turn on ⌈1D6 ÷ 2⌉.
  - From then on, a secret Sensor test per decker at each turn's end, against the turns
    left, until one succeeds (knows, not when).
  - Everyone is told at the final warning. Deckers still on at the end are dumped (dump
    shock); frames and running programs crash.

- **The operations this part needs (p.111–117, read from renders), added to
  `CONFIG.SR2E.vr2SystemOperations` (R2 #11):**

  | Operation | Test | Utility | Action |
  |---|---|---|---|
  | Analyze IC | Control | Analyze | Free |
  | Analyze Icon | Control | Analyze | Free (TN − Sensor − Analyze, min 2) |
  | Analyze Subsystem | the targeted subsystem | Analyze | Simple |
  | Decrypt Access | Access | Decrypt | Simple |
  | Decrypt File | Files | Decrypt | Simple |
  | Decrypt Slave | Slave | Decrypt | Simple |
  | Disinfect | the appropriate subsystem | Disinfect | Complex |
  | Redirect Datatrail | Control | Camo | Complex (on a grid; GM records the count) |

  A data bomb's defuse is a System Test against the controlling subsystem with Defuse
  reducing the TN (p.41). It is added as an operation "Defuse" whose subsystem is
  picked at the test (Files or Slave). "The targeted/appropriate subsystem" is a
  choice in the dialog for those three operations.

## Approach

### 0. The model: an event log, not mutable state (R3 #1, #2, #7–#10)
Part 3's state is an APPEND-ONLY log of durable records, the pattern Cybertechnology
Phases 4 and 6 already use (`recordEvent` in claims.mjs): deterministic ids, so the
SERVER rejects a duplicate, never pruned, and folded by pure functions (`foldVr2Ic`).
Parts 1–2 keep their own state (sessions, the tally, maneuvers, `matrixMode`); part 3
adds records beside them and never stores what it can fold.
- **Where records live:**
  - on the DECKER (a character actor): the connection, black hits and resistances,
    traces and ticks, exits, psychotropic conditions, program crashes;
  - on the DECK ITEM itself (gear cyberdeck or C2; embedded ActiveEffects on the item,
    which travel with it when it changes hands; R4 #8): its damage, worms, chip
    replacements and corruption;
  - on the IC or HOST (GM-owned): bomb states, shutdown lifecycles, trap triggers.

  Whoever may update that actor creates them: the owner's clients and the GM's.
- **Ordering (R4 #2):** a TOTAL order: the SERVER-stamped `_stats.createdTime`
  (`eventsOf` gains it), then the record key. Conflicting transitions never rely on it:
  terminal states use ONE key (a bomb's end, a trace's completion); paired states key
  each pair by its cycle (freeze/unfreeze); damage is bound to the chip incarnation it
  hit (§2). The fold tests shuffle equal-time records.
- **Keys:** every record key is hashed by `claimId`, so uuids and compendium source ids
  in keys never become dotted update paths (R3 #9). The raw identities are in the
  payload. Any remaining flag map uses part 2's `keyOf` encoding.
- **Random outcomes are rolled first and stored in the record that commits them**
  (Phase 4's pattern). The losing client of a race discards its roll. Effects are
  derived from the record, so a retry never rerolls (R3 #7).
- **Effects on monitors and IC are applied ONLY by the active GM's client (R4 #1):**
  condition monitors (meat and persona), an IC's crash and generation. There, one
  `commitDamage`/`matrixDamage` queue per target serializes them, and each carries its
  receipt in the same update (`extra`/`skipIf`) under a `once(target,
  "<recordKey>:apply")` claim, as with move-by-wire's seizure damage.
  - Players' clients only create records. With no GM online, applications wait and are
    listed as pending on the sheet.
  - (Two tabs of the GM user are part of the documented same-user limit.)
- **No "designated writer" (R3 #2).** Any authorized client may create a record or claim
  an application. The server's duplicate-id rejection makes it exactly one.
- **The documented limit (R3 #1):** a client that wins an apply claim and dies before
  writing leaves the record (the outcome is safe) and a claim. After `STUCK_MS` the
  sheet shows "Apply anyway" (GM), the same manual recovery as doses and seizures
  (docs/PLAN-same-user-writers.md). Nothing is lost; only its application waits.
- **The connection (R4 #4):**
  - `vr2:conn-open:<n>` is created when the decker enters the Matrix (in `matrixQueue`,
    beside part 1's `startSession`), with n = 1 + the number of connections ever opened.
    Two entering clients compute the same n, so the server admits ONE; the loser
    aborts its entry.
  - It snapshots `deckRef` and the deck's FIXED settings (`hardening`, `deckMode`,
    `iccm`). The MPCP is NOT snapshotted (R4 #9): the effective MPCP is folded from the
    deck's history at each test's resolution.
  - The live connection is open n with no `conn-end:<n>`. Connection n + 1 can't be
    opened before `conn-end:<n>`.
  - **`matrixMode` is DERIVED, never written (R5 #1, #2):** for a VR2 decker,
    CharacterData's preparation sets `matrixMode` = "a live connection exists" (both
    directions, from the log). Entry and exit write ONLY records (`conn-open`,
    `conn-end`), so there is no projection to interrupt and no delayed write that can
    switch off a newer connection. The stored field keeps serving the core ruleset.
    Every VR2 path that sets `matrixMode` (the sheet toggle, `jackIn`, dump shock)
    records instead.
  - **Entry is the `conn-open` record alone.** Part 1's session is created lazily by the
    first action that needs it (`sessionFor` already adopts a host). The jackpoint's
    per-client session record is reconciled by its existing `scheduleReconcile`.
    Neither can be "half set up", because neither is a precondition of being
    connected.
  - A host change starts a part-2 session but never touches the connection.
- **The deck is fixed per connection (R3 #6):** activating another deck (gear or C2) is
  refused while `matrixMode` is on. Every consequence uses the connection's snapshot,
  so a trigger and its exit always hit the same deck.
- **IC incarnation:** `icKey = <icUuid>#<generation>`, in payloads.
  - ACTION requests against an older incarnation are refused.
  - Consequences already recorded (a trap trigger, a tar pit roll, a detonation) are
    resolved from their record whatever the IC's generation is now.

### 1. Pure rules (`module/rules/vr2ic-rules.mjs`, Vitest)
- `blackDamage(code, rating, iconDown)` → `{ power, level }`.
- `grayTN(kind, mpcp, hardening)`; `mpcpLoss(kind, successes)`.
- `traceFactor({...})`; `locationTurns(s)` = ⌊10 ÷ s⌋. 0 (10+ successes) means the trace
  completes at once.
- `datatrailTurns(roll)` = max(1, roll − 1).
- `pcpicMod(level)`; `psychoRecoveryTN(rating, mods)`.
- `wormInfects(successes, hardening)`.
- `shutdownTurns(sv, rolls)`; `finalWarning(roll)`.
- `traceTally(base, traced)`.
- `personaVR2({ authored, programs, mpcp, damage })`: the ONE derivation, R1 #6 (§2).

### 2. Data
- **IC fields:**
  - `program` gains `black-lethal`, `black-nonlethal`, `black-psychotropic`, `blaster`,
    `sparky`, `ripper-acid/bind/jam/mark`, `tar-baby`, `tar-pit`, `trace`, `data-bomb`,
    `scramble` and `worm`.
  - New fields: `psychotropic`, `scramble`, `worm`, `trapFor` (an IC uuid this one
    hides), `bombUuid` (an exploding scramble's bomb; a SEPARATE link, R1 #17),
    `protects` (text), `bombState` (armed/defused/spent).
  - Every choices StringField has `blank: true` and `""`. `icClass` is derived from the
    program.
- **Deck damage, worms, chip replacements and corruption are FOLDED from records on the
  DECK ITEM** (no mutable fields; R4 #8):
  - `vr2:chip-replace:<chip>:<n>` = `{}`, where `chip` is "mpcp" or "persona". The chip's
    INCARNATION is its replacement count;
  - `vr2:deck-dmg:<source>` = `{ attr, amount, chip, chipGen }`. `chipGen` is captured
    in the REQUEST (the `vr2:gray`/`vr2:ripper` record, made when the hit landed) and
    copied through the result, so damage only counts against the chip incarnation that
    was hit. A replacement installed before resolution stays clean (R4 #11, R5 note);
  - `vr2:worm:<source>` = `{ kind, chipGen }` (the MPCP chip's incarnation);
  - (on the decker) `vr2:crash:<programId>:<loadGen>:<source>` (R1 #13, R2 #7): a program is crashed
    iff a record exists for its CURRENT loadGen. A late strike on an older copy is
    harmless. Part 2's `crashed` boolean stays readable (OR-ed in) until it's next
    cleared;
  - `vr2:corrupt:<programKey>:<source>` and `vr2:reload:<programKey>:<n>` on the deck
    (R2 #8): `programKey` = the compendium source id, else the name slug. Every program
    with that key is unusable while that deck is active. "Reload from storage"
    (owner/GM, only OUT of the Matrix) records a reload, a declared simplification.
  - A manual-fallback decker (no deck item) keeps the same records on the actor, under
    the prefix `vr2:manual-deck:`.
- **Derivation (R1 #6, R4 #10):** effective MPCP = max(0, mpcp − Σ current-incarnation
  damage.mpcp). Each attribute:
  - no program of that kind LOADED: the authored value, capped at the effective MPCP,
    less chip damage;
  - loaded, but every loaded copy crashed or corrupted: 0 (presence, not usability,
    decides the fallback, as part 2 does);
  - otherwise max(0, min(best usable rating, effective MPCP) − Σ chip damage).

  An effective MPCP of 0 makes every attribute 0, and the sheet says so. Session icon
  damage and improvised sacrifices apply after this, as today. `usablePrograms` and
  `bestUtility` exclude crashed and corrupted programs.

### 3. Black IC (R1 #1, #7, #8; R2 #2, #14; R3 #3, #4)
- **A hit:** resolving a black attack card begins with "Finalize the attack": the test
  closes to Karma, and the record `vr2:hit:<card>` = `{ conn: n, icKey, rating,
  attackSuccesses, lethal, kind, deckSnap }` is created. A hit that does no damage still
  makes a record.
  - It is both the jack-out lock (while its IC is on that incarnation) and a PENDING
    attack. There is one record per CARD, so several cards from one IC coexist (R3 #4).
- **Every admitted attack on a connected decker records `vr2:attack:<card>` = `{ conn: n,
  icKey, class }` on the decker BEFORE any damage is applied (R5 #3)**, black, gray and
  white alike. It is pending until its resolution record exists (`vr2:hit` resolved,
  part 2's resolution card, or a gray/ripper result). The exit barrier waits on every
  pending attack of that connection, so a crash during an open exit can't be passed by
  before its consequence is recorded.
- **Two resistances, each its own record with its rolled result:**
  - `vr2:res:<card>:icon` (Bod vs Power, armor), applied to the persona monitor by
    claim + receipt;
  - `vr2:res:<card>:meat` (Body, or Willpower when non-lethal/psychotropic/cool), against
    Power − the snapshot's Hardening (floor 2). Applied by `commitDamage` with a claim
    and receipt. Karma yes, pools no. Lethal on a cool deck is Stun.

  Either order. A hit is RESOLVED when both records exist and both applications have
  their receipts.
- **`blackRating(ic, decker)`** = rating + 2 while the persona monitor is full (icon
  down). It feeds the Power, the gate test, the final shot and the psychotropic test.
- **One action guard, `vr2ActionGuard`,** refuses attack, maneuver, System Test, Medic,
  Swap Memory, Relocate and improvised builds:
  - while the icon is down ("you can only try to jack out");
  - while an exit is open.

  Non-black IC crashing the persona open a dump exit (§3a). A black kill does not.
- **Dead or unconscious after a meat application:** the applying client records
  `vr2:exit-open:<n>` (trigger "black-kill"); `finalShot:<card>` is then a derived step
  (§3a).
- **The gate:** while any lock is live, a voluntary exit first rolls Willpower vs the
  highest `blackRating`, a Complex Action with Karma allowed. The roll is recorded
  `vr2:gate:<n>:<attempt>` (attempt = 1 + the gate records on this connection; R5 #6).
  - Success opens the exit with the step `lastAttack:<icKey>` for each locking IC.
  - Failure: the decker stays.
  - "Pull the plug" or the ICCM monitor opens the exit with `lastAttack` and no test.
  - PCPIC replaces the gate (§3b).

### 3a. The exit (R1 #1, #9, #10; R2 #1; R3 #3–#5)
- **Opening:** `vr2:exit-open:<n>` (n = the connection), whose payload names the
  trigger (voluntary/gate, plug, dump, black-kill, shutdown, graceful). One per
  connection; a second open is rejected.
- **The required steps are DERIVED, never created (R4 #3)**: the fold computes them from
  the records that exist:
  - `lastAttack:<icKey>`, for each locking IC incarnation LISTED in the exit-open payload
    (captured when it opened by gate or plug, R5 #5). If that IC is destroyed before
    its last attack, the step resolves as `cancelled` (an exit-res record), explicitly;
  - `finalShot:<card>`, for each black hit whose meat application left the decker dead
    or unconscious (the application's receipt records that state);
  - `gray:<card>`, for each gray consequence on this connection;
  - `datatrail:<icKey>`, for each trace still locating at the exit;
  - `dumpShock`, unless graceful, a tortoise, or the decker is dead;
  - `psychotropic:<icKey>`, for each psychotropic hit;
  - `tapeworm:<wormKey>`, for each tapeworm on the connection's deck.

  A step that arises during the exit (its last attack knocks the decker out) is simply
  derived on the next fold. Nothing can be "created too late".
- **Three states per step (R3 #3):**
  - REQUIRED: the fold derives it;
  - RESOLVED: its result record `vr2:exit-res:<n>:<step>:<ref>` exists, carrying any
    rolled values;
  - APPLIED: its effect's receipt exists (damage, a card's consequence id).
- **The barrier:** the exit completes only when:
  - every step is applied; and
  - every `vr2:hit` on this connection is resolved, both resistances included (R3 #4);
    and
  - every gray consequence recorded by a resolution on this connection is applied
    (R3 #5).
- **Gray consequences (R3 #5):** when blaster or sparky crashes the persona, the
  resolution creates `vr2:gray:<card>` (the request, with the deck reference and the
  chip incarnations at that moment, so the damage it materializes is bound to them)
  BEFORE opening the dump exit. It is resolved from that record, needing no live
  connection.
- **Completion:** when the barrier holds, any client creates `vr2:conn-end:<n>` (one
  admitted), then (in `matrixQueue`) part 1's session close and `matrixMode` false; the
  projection rule (§0) repairs an interruption between the two. The old immediate `vr2LeaveMatrix` crash path
  becomes "open the exit". Dump shock is the `dumpShock` step: its card is the
  application, with consequence id `exit:<n>:dump`, posted once by a claim.
- **The steps, in order:**
  1. `lastAttack`: the GM makes the IC's last attack against this connection (the card
     carries the connection number);
  2. `finalShot`: rating × 2 vs the effective MPCP folded at resolution + the snapshot's
     Hardening (R4 #9);
  3. `gray`;
  4. `datatrail`: per live trace, 1D6 − 1 vs its turns left;
  5. `dumpShock`;
  6. `psychotropic`;
  7. `tapeworm`.
- **Resumption:** any client that can update the decker resumes an open exit on
  `ready`, `userConnected` and on any of its records changing. Every step is
  idempotent, so resuming twice is harmless.
- **Graceful Logoff** is part 1's System Test (`gracefulLogoff`), with every live trace's
  rating added to its TN.
  - Success opens an exit of kind "graceful": no dump shock, and it stops location
    cycles.
  - It is refused while a black lock is live.
  - The leave dialog's "Graceful Logoff" button RUNS that test.

### 3b. Psychotropic conditions (R2 #12)
- **The condition:** `vr2:psy:<n>:<icKey>` = `{ kind, rating, icName }`, created by
  the `psychotropic` step's RESULT when its Willpower test (vs `blackRating`, −2 on a
  cool deck, Karma allowed) fails. Recovery records `vr2:psy-recover:<condKey>:<n>`
  carry the roll; a success ends the condition.
- **Cyberphobia's modifier** lives in `testTnModifiers`, applied even under a tnPolicy:
  +rating (the highest active, once) to tests whose tnContext skill is Computer,
  Electronics or a B/R skill, or whose `kind` is "matrix". The pre-jack-in Willpower
  (rating) test in `vr2EnterMatrix` and the jackpoint `jackIn` aborts before
  `matrixMode` changes.
- **Judas and maniac:** reminders, plus a GM "Secret test" (whispered).
- **PCPIC:** while its lock is live, a voluntary exit needs Willpower (rating +
  pcpicMod(the current wound)). It is re-prompted at each turn boundary after its hit
  (§5's ticks). Its post-exit step negates further effects.
- **Recovery:** Willpower vs `psychoRecoveryTN(rating, checkboxes)`; the cadence is a
  reminder.

### 4. Gray IC and tar (R1 #5, #13–#15; R3 #5, #10)
- **Blaster and sparky:** see §3a (`vr2:gray:<card>`). Its result record carries the
  MPCP roll (rating dice vs MPCP + Hardening, or + 2 + Hardening for sparky). Its
  application is `vr2:deck-dmg` for mpcp. Sparky adds a meat resistance record
  (Body; Hardening reduces the Power), applied like black IC's.
- **Rippers:** after part 2's attribute loss lands, `vr2:ripper:<card>` records its roll
  (rating vs MPCP + Hardening). Its application is `vr2:deck-dmg` for that attribute,
  by its successes.
- **Tar baby and tar pit:** every System Test card records `{ hostUuid, conn: n, deckSnap,
  utility: useRef(item) }`.
  - The GM sees each tar IC on that host as "<Tar Pit-6> strikes <utility>". The IC
    sheet's "Strike a utility" covers programs run outside a System Test.
  - The strike rolls both sides and records `vr2:tar:<card>:<icKey>` on the decker
    (results inside). Several tar IC have separate keys.
  - Tar wins on MORE successes. The application is:
    - `vr2:crash:<programId>:<ref.loadGen>:tar-<card>`, only ever about that copy;
    - the IC's crash (GM; generation +1, no tally; claimed, receipted on the IC);
    - for tar pit, its MPCP roll is part of the same record, and any success adds
      `vr2:corrupt:<programKey>:tar-<card>` on the connection's deck.
  - The utility wins: a GM-whispered Sensor test.

### 5. Trace and trap (R1 #3, #11, #12; R2 #9, #10; R3 #8)
- **Hunt:** a trace IC attacks with TN = the Trace Factor. Its inputs:
  - the target's Evasion and Camo;
  - the connection's redirect count (`vr2:redirect:<n>:<k>` (k = 1 + the redirects so far) records, made by the
    GM or by Redirect Datatrail);
  - the jackpoint's `traceMod` (a NEW numeric field on the jackpoint behaviour; no
    server restart);
  - the trap bonus.
- **Location:** "Start location cycle" closes the attack test and records
  `vr2:trace:<n>:<icKey>` = `{ successes, turns: locationTurns(s), clock }`. 0 turns
  means complete at once.
  - `clock` is FIXED here: `{ combatId, startRound }` if a combat is active, else
    `{ manual: true }`.
  - Several traces coexist.
  - **Completion is persisted WITH the completing tick (R4 #7, R5 #4):** the active GM
    computes the fold when creating each tick, and the tick that brings a trace to 0
    carries `completes: true`. A 0-turn location cycle completes in the
    `vr2:trace:<n>:<icKey>` record itself (`completes: true`). Completion is therefore
    immutable history. A later crash of the IC stops only traces whose completion isn't
    already recorded.
- **Ticks (R2 #10):** `vr2:tick:<n>:<icKey>:<boundary>`, where `boundary` = the
  combat round that ended, or `m<n>` on the manual clock.
  - The active GM records one per round crossed (a jump of three rounds is three
    ticks).
  - A deleted combat, or time with no GM, is caught up by "Advance N turns" (manual
    ticks). Switching to the manual clock is a recorded GM choice and never re-counts a
    round.
- **Relocate (R3 #8):** a Simple Action Control Test (Computer vs rating − Relocate). The
  host's opposing roll is a part-2 tally event.
  - On success it records `vr2:spoof:<n>:<icKey>:<boundary>`, where `boundary` = the
    end of the current turn: the first boundary with no tick yet.
  - The fold counts a spoof only if its `createdTime` precedes that boundary's tick. A
    Relocate that loses the race to its own turn's end is wasted, and the card says so
    (the book's action had to happen within the turn).
- **The fold:** turns left = turns − (ticks not covered by a valid spoof or a freeze).
  0 → complete. Because ticks and spoofs are ordered by the server, completion can't be
  undone by a late spoof.
- **"Keep it frozen" (R2 #9, R4 #6):** offered right after a SUCCESSFUL Relocate. It
  records `vr2:freeze:<spoofKey>`, keyed by THAT Relocate's spoof record, so each
  freeze cycle has its own key. `vr2:unfreeze:<spoofKey>` releases it with no tally. A
  later Relocate can freeze again.
  - `vr2DetectionFactor` subtracts one per frozen trace on the CONNECTION, beside part
    2's per-session suppressions.
  - A freeze's tick doesn't count.
- **A crashed trace IC** ends its trace in the fold, and the normal crash tally choice
  applies.
- **Completion** is derived. Its consequences are claimed once each:
  - the GM card with the Security Asset Response Times row;
  - the trap trigger (`vr2:trap:<icKey>` on the IC);
  - `traced` effects read live from the fold: −1 TN on proactive IC attacks against that
    connection, and +1 on tally events (`traceTally` in part 2's `tallyUpdate`, recorded
    in the receipt).
- **Trap (R2 #6):** an IC with `trapFor` that crashes (in the same update as its
  generation bump, the IC's own flag `trapFired.<gen>`), or whose trace completes,
  gives the GM one card naming the hidden IC.

### 6. Data bombs, scramble, worms (R1 #16–#18)
- **Data bomb:** `bombState` per incarnation (armed, defused or spent).
  - **State is folded from ONE terminal record on the BOMB (R3 #1, R4 #5):**
    `vr2:bomb-end:<icKey>` = `{ outcome: "defused"|"exploded", card }`. The server admits
    the first; a defuse and a detonation racing on the same incarnation produce exactly
    one outcome. Only an "exploded" end authorizes the damage card. The state is armed
    (no end) / defused / spent.
  - **Defuse** is the "Defuse" System Test linked to the bomb (the card carries
    `bombKey`). Success → a defused record. Failure → it stays armed. All 1s: the card
    offers "It goes off" (the book's exception).
  - **Detonation:** "It goes off" is offered on a later successful System Test linked to
    an armed bomb, or by the GM.
    - It creates the terminal record with outcome "exploded"; if a defuse won, nothing
      happens and the card says so.
    - The explosion's auto-hit (Rating)M card is a consequence claimed by
      `once(bomb, "<key>:card")`. A stuck claim gets "Post anyway".
    - Resisted normally. The suppress choice costs a Detection Factor point; "register"
      adds the rating.
- **Scramble:**
  - Decryption is part 1's System Test as it stands: the host's successes still go on
    the tally (that's the System Test); "no tally" means no CRASH tally, which nothing
    adds.
  - **Exploding:** a successful decrypt, or a crash, with its `bombUuid` bomb still armed
    → the detonation above.
  - **Poison:** a failed decrypt, or each attack card against it → a GM Poison Test
    button (rating dice vs the decker's Computer), which posts the result.
- **Worms:**
  - The System Test card lists, for the GM, each worm IC on that host: "Infection test"
    (Security Value dice vs MPCP on `deckRef`). An infection appends to that deck's
    worms, receipted `worm:<card>:<icKey>`.
  - Disinfect is the System Test operation; its success lets the GM delete the worm IC.
    A failure offers the infection test.
  - **Dataworm combat** is manual: a GM note. Its 1D6-on-logon roll is a GM card when a
    connection opens on that deck.
  - **Deathworms:** +2 TN, +1 per further one, on the decker's VR2 attack and
    resistance tests (from the deck in use).
  - **Tapeworm** is an exit step.
  - Replacing the MPCP clears the worms.
- **Deferred to manual GM notes** (R1 #18):
  - trapped files and devices (the GM uses a trap IC on that host);
  - Judas and the maniac's behaviour.

  Cyberphobia's pre-jack-in test IS built: entering the Matrix with the condition rolls
  Willpower (rating) first, and a failure stops it.

### 7. Host shutdown (R1 #19)
- **One lifecycle on the HOST, as records (R3 #1):**
  - `vr2:shutdown:<n>` = `{ turns, warning, clock }`, rolled before it's created (n
    counts resets). A second sheaf crossing finds it there.
  - Ticks are `vr2:shutdown-tick:<n>:<boundary>`, like traces.
  - `vr2:shutdown-reset:<n>` ends lifecycle n.
- **The warning:** a public card for that host's deckers.
- **At 0** (derived): the host is offline, and each live connection on that host gets an
  exit of kind "shutdown" (its exit-open record is the per-connection receipt).
- **Offline:** every entry path refuses that host: `sessionFor`, the System Test,
  `vr2EnterMatrix`, and the jackpoint `jackIn` (checked BEFORE matrixMode or the
  connection changes) (R2 #13). "Reset shutdown" (GM)
  brings it back.
- The secret Sensor tests are one GM button per decker.

### 8. Tests (R1 #20)
- **Vitest:** §1 with the book's examples:
  - Cybersushi 10D → 9;
  - Selena's Blaster TN 8;
  - HeadCrash's Sparky TN 9 and 8M → 8S;
  - Vanessa's Trace Factor 4 and ⌊10 ÷ 6⌋ = 1;
  - Relocate's TN 4;
  - the data bomb's 6M;
  - Scaramouche's defuse TN 6;
  - `personaVR2` at MPCP 0, at the manual fallback, and with chip damage and caps.
- **Quench (`sr2e.vr2-ic`), the success paths:**
  - black lock and gate;
  - icon down: the guard, and +2;
  - both resistances receipted;
  - a black kill → exit → final shot;
  - blaster, ripper, tar, trace, relocate, freeze;
  - the datatrail;
  - trap;
  - bomb defuse and detonation;
  - worms;
  - shutdown;
  - psychotropic recovery;
  - core ruleset inert.
- **Quench, the round-5 regressions:**
  - a delayed clear can't disconnect a newer connection (matrixMode derived);
  - a gray crash during an open exit is waited on;
  - an IC crash right after the completing tick keeps the trace completed;
  - a locking IC destroyed before its last attack cancels that step;
  - two failed gates, then a third attempt; three redirects counted.
- **Quench, the round-4 regressions:**
  - two different damage records on one monitor, both landing in full;
  - competing connection opens (one admitted);
  - an exit opened before its triggering hit's consequences resolve still requires them;
  - a defuse and a detonation racing (one outcome);
  - freeze, release, freeze;
  - a completed trace surviving its IC's crash;
  - a chip replaced before a delayed gray result materializes (the new chip clean);
  - a deck given to another actor keeps its damage;
  - a crashed persona program giving 0, not the authored value.
- **Vitest:** the fold with shuffled equal-time records gives the same state.
- **Quench, the round-3 regressions:**
  - interruption right after an apply claim, then "Apply anyway";
  - two clients creating the same record (one wins, its roll is used);
  - an ordinary black hit resolved meat-first, the exit waiting for the icon resistance;
  - a gray consequence applied after the connection ended;
  - a Relocate recorded after its turn's tick, which doesn't count;
  - deck activation refused while connected.
- **Quench, the round-2 regressions:**
  - final-attack unconsciousness merges a final shot into the open exit;
  - an interrupted bomb delivery is delivered once on reconcile;
  - reverse-order tar resolutions leave the current copy alone;
  - a frozen trace survives a host change with its DF cost;
  - a round jump of 3 ticks 3 times;
  - an offline host refuses a jackpoint jack-in;
  - icon down blocks Medic and Swap Memory.
- **Quench, the failure paths:**
  - interruption after each permanent write (re-run the step: no double effect);
  - a host change keeps black locks and traces;
  - two traces;
  - a shutdown delivered twice;
  - a reconnect during a pending exit;
  - a Swap Memory between a tar strike and its resolution leaves the new copy alone.

## Key decisions & tradeoffs
- **Rules-light where the book is GM fiat.** Judas, Matrix maniac, physical response,
  data loss and paydata are cards and reminders, not automation; the system has no
  paydata model.
- **Permanent deck damage is folded from records** about that deck, never a change to its
  authored ratings: the GM can see it and repair it (a chip-replace record).
- **Countdowns ride combat rounds** when a combat exists, with a manual "Next turn"
  otherwise. VR2 counts Combat Turns at Phase 0; a round change is that boundary in
  this system (initiative passes are inside a round).
- **Reactive IC is GM-triggered** from the System Test card (tar, worms, data bombs),
  not auto-fired. The book triggers it by the GM's placement, which the system doesn't
  model.
- **An event log with server-arbitrated keys** (Phases 4/6) rather than mutable state
  with a designated writer. Rolls live in the records that commit them; effects are
  claimed and receipted; ordering is the server's `createdTime`.
- **The stuck-claim limit is accepted and surfaced** ("Apply anyway"), as for doses and
  seizures.
- **One deck per connection:** swapping decks while connected is refused.
- **A connection outlives host sessions**; an exit is a resumable set of steps.

## Risks / open questions
- The book doesn't say what dice the gray "tests" roll. The examples imply the IC's
  rating (Tar Baby-8 rolls a "Tar Baby (6) Test" against its target's rating).
- Rounds as Combat Turns: a GM who doesn't run combat for Matrix fights needs the
  manual "Next turn" button.
- A black IC's "one more attack" happens on the GM's next action; the system only
  prompts.
- Cyberphobia's "any task involving computers": applied to tests whose tnContext skill
  is Computer, Electronics or a B/R skill, or `kind: "matrix"`.
