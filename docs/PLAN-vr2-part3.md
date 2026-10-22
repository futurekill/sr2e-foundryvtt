# Plan: the Virtual Realities 2.0 Matrix, part 3 — the rest of the IC
_Round 1 — revised after Codex round 1 (log: PLAN-vr2-part3-REVIEW-LOG.md)_

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

## Approach

### 0. Identity, writers and receipts (R1 #2–#5, #7, #9)
- **The connection** (new): `flags.sr2e.vr2Connection = { id, startedAt, deckRef,
  redirects, black: {}, traces: {}, exit: null }` is written when the decker enters the
  Matrix (in `matrixQueue`, beside `startSession`) and ended only by an exit.
  - Part 2's per-host session (`vr2Session`, the tally) stays as it is. A host change
    starts a new host session, but never touches the connection.
  - Everything "this run" or "until you jack out" lives on the connection: black-IC
    locks, traces, redirects, the icon-down state's black lock. Everything per host
    stays on the session.
- **One writer per decker:** every mutation of a decker's connection or session runs on
  `designatedWriter(decker)` (part 2: its lowest-id active non-GM owner, else the active
  GM), inside `sessionQueue`.
  - Other clients (the GM's timers, an IC's resolution) never write it. They post an
    EVENT message (`flags.sr2e.vr2Event = { id, kind, deckerUuid, connectionId, … }`).
    The designated writer applies each event once, with the event id as a receipt on the
    connection. It is reconciled on load, like part 2's tally events.
  - The writer re-validates the connection id, the IC incarnation and the state before
    applying.
- **Receipts live on the damaged document, in the same update as the effect** (never
  on a card):
  - meat damage: `commitDamage(…, { extra: { "flags.sr2e.vr2Receipts.<key>": true },
    skipIf })`;
  - deck damage and infection: the deck item's own `system.deck.receipts.<key>`, in the
    same update as the change;
  - program crash and corruption: the program item;
  - the IC's own state: the IC actor.

  Cards only render.
- **The deck reference is captured at the triggering action:** `deckRef = { uuid }` for a
  gear deck or C2, or `{ manual: true }` for a decker with no deck item. It is stored on
  the attack card, the System Test card and the connection. Resolution writes to THAT
  deck (the manual fallback: the actor's authored `system.cyberdeck.damage`), even if
  another deck is active by then.
- **IC incarnation:** `icKey = <icUuid>:<generation>` (part 2 bumps the generation on a
  crash). Every record about an IC is keyed by it. A record whose IC has moved to a
  newer generation is dead.

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
- **Deck damage:** the deck block gains `damage: { mpcp, bod, evasion, masking, sensor }`,
  `worms: [{ id, kind }]` and `receipts: {}`, snapshotted with the other keys. The
  manual fallback has the same block on the actor.
  - **Derivation, R1 #6:** effective MPCP = max(0, mpcp − damage.mpcp). Each attribute =
    max(0, min(loaded program rating, effective MPCP) − damage[attr]). If no program of
    that kind is loaded, the authored value is used, capped the same way.
  - With an effective MPCP of 0, every attribute is 0 (the deck can't run a persona)
    and the sheet says so.
  - Session icon damage (cripplers, part 2) and improvised sacrifices apply after this,
    as today.
  - **Repair:** "Replace MPCP chip" clears damage.mpcp AND the worms. "Replace persona
    chip" clears the four attribute damages. Both are GM buttons on the deck.
- **Programs:**
  - `crashedGen`, R1 #13: a program is crashed iff `crashedGen === loadGen`, so a Swap
    Memory (which bumps `loadGen`) is a fresh copy whatever arrives late. Part 2's
    `crashed` is migrated into it.
  - `corrupted: { deckUuid, receipt }`, R1 #14: `usablePrograms`, `bestUtility` and
    `_derivePersona` exclude a program corrupted on the active deck. Swap Memory refuses
    it.
  - "Reload from storage" clears it. It's a GM/owner button available only OUT of the
    Matrix (a declared simplification: the external clean copy is assumed).

### 3. Black IC (R1 #1, #7, #8)
- **The record:** a black attack card snapshots `black: { icKey, rating, lethal,
  psychotropic, kind }` and the target's connection id.
- **One resolution, frozen first:**
  - Resolving a black hit begins with "Finalize the attack": the attack test is closed
    to Karma, and its CURRENT successes are frozen into the card's resolution request
    (an event).
  - The decker's designated writer then records `connection.black[icKey] = { rating,
    hitAt, attackSuccesses, card }`. This is the jack-out lock, set even by a hit that
    does no damage.
  - The two resistances follow, each its own test and each receipted on its own
    document:
    1. **Icon:** Bod vs Power, armor applies. Matrix boxes on the persona, receipt
       `black:<card>:icon` on the decker.
    2. **Meat:** Body (lethal on a hot deck) or Willpower (non-lethal, psychotropic, or
       lethal on a cool deck → Stun), against Power − Hardening (floor 2). Karma yes,
       pools no. `commitDamage` with receipt `black:<card>:meat`.

    Either order. The card shows each as done when its receipt exists.
- **Icon down** is actor-wide and derived: the persona monitor is full. While it's
  down:
  - every black IC's Power is +2;
  - the decker's attack, maneuver and System Test buttons refuse ("Your icon is down:
    you can only try to jack out", a shared guard);
  - non-black IC treat a crash as part 2 does (a dump). A black kill does not dump.
- **Dead or unconscious after the meat damage** (read after the commit): the designated
  writer opens the EXIT (§3a) with `finalShot: { icKey, rating × 2 }`. The connection
  isn't cleared until the exit completes.
- **The jack-out gate:** while `connection.black` has a live record (its IC still on that
  generation), every voluntary exit runs a Willpower (highest live rating) test, a
  Complex Action with Karma allowed.
  - Success opens the exit with `lastAttack: { icKey }`.
  - Failure: the decker stays.
  - "Pull the plug" or an ICCM monitor jack-out opens the exit with `lastAttack` and no
    test.
  - A damage dump skips the gate.
  - PCPIC replaces the gate test with Willpower (rating) + pcpicMod(the current wound),
    offered after each of its hits.

### 3a. The exit record (R1 #1, #9, #10)
- **Opening it:** every way out (the sheet, a jackpoint, a damage crash, a shutdown, a
  black kill) opens `connection.exit = { id, kind, steps: [...] }`. Opening it is one
  update by the designated writer, and a second open finds it there. The steps, in
  order, are only the ones that apply:
  1. `lastAttack`: the GM makes the IC's last attack AGAINST THIS CONNECTION (the attack
     dialog targets the exiting connection; attack cards carry the connection id, so a
     reconnection can't take it);
  2. `finalShot`: the MPCP shot (blaster rules, double rating) on `connection.deckRef`;
  3. `datatrail`: for each live trace, 1D6 − 1 against its turns left;
  4. `dumpShock`: posted once;
  5. `psychotropic`: one Willpower (rating) test per live psychotropic hit;
  6. `tapeworm`: one roll per tapeworm on the deck.
- Each step records `steps[i].done` in its own update, so the steps are resumable
  across a reload; the designated writer resumes an open exit on load.
- **Ending the connection:** only after the last step does the writer move the
  connection to `flags.sr2e.vr2LastConnection` and clear `matrixMode`. The old part-2
  path is refactored into this.
- **Graceful Logoff** is part 1's System Test (`gracefulLogoff`), plus every live trace's
  rating on its TN. Success opens an exit of kind "graceful": no dump shock, and it stops
  the location cycles. It is refused while a black lock is live (the gate is the way
  out). The leave dialog's "Graceful Logoff" button now RUNS that test instead of
  asserting it.

### 4. Gray IC and tar (R1 #5, #13–#15)
- **Blaster and sparky crash the persona:** the attack card already carries `deckRef`.
  The resolution emits a gray event, and the designated writer rolls the Blaster/Sparky
  Test and applies `damage.mpcp += loss` to that deck with the receipt
  `gray:<card>`. Sparky's meat damage is a separate receipted step (Body, Hardening
  reduces the Power).
- **Rippers:** after part 2's attribute loss lands (its own receipt), a ripper event
  applies `damage[attr] += successes` with the receipt `ripper:<card>`.
- **Tar baby and tar pit (shared action snapshot, R1 #15):** every System Test card now
  records `{ hostUuid, connectionId, deckRef, utility: useRef(item) }`.
  - For the GM, the card lists each tar IC on that host whose incarnation hasn't struck
    this card (outcome key `tar:<card>:<icKey>`). Several tar IC each get their own key.
  - **Programs executed outside a System Test** (an attack utility, Medic, Relocate): the
    IC sheet has "Strike a utility", where the GM picks the decker and program, captured
    as a useRef.
  - **The opposed test is side-effect-free.** Tar wins on MORE successes; ties hold.
  - **Tar wins:**
    - the program gets `crashedGen = ref.loadGen` (stale if swapped since), receipted
      on the program;
    - the IC is crashed (generation +1, no tally);
    - tar pit then rolls rating vs MPCP + Hardening on `deckRef`. Any success corrupts
      every copy of that program (same `flags.core.sourceId`/name) on that deck.
  - **The utility wins:** a GM-whispered Sensor test (p.40 results).

### 5. Trace and trap (R1 #3, #11, #12)
- **The record:** `connection.traces[icKey] = { rating, hostUuid, phase, turnsLeft,
  cursor, spoofed: null, frozen: false }`. Several traces coexist. Only the designated
  writer writes them.
- **Hunt:** a trace IC attacks with TN = the Trace Factor. Its inputs:
  - the target's Evasion and Camo;
  - `connection.redirects`;
  - the jackpoint's `traceMod` (a NEW numeric field on the jackpoint behaviour; a field
    on an existing type needs no server restart);
  - the trap bonus.
- **A hit:** "Start location cycle" freezes the successes (the attack test closes) and
  emits an event. The writer sets turnsLeft = locationTurns(s); 0 completes at once.
- **Turns:** the cursor is `{ combatId, round }` when there's a combat, else a manual
  counter `n`.
  - The active GM emits ONE tick event per (trace, boundary), with id
    `tick:<icKey>:<combatId>:<round>` or `tick:<icKey>:m<n>`. The writer applies it
    once.
  - A tick decrements unless the trace is `frozen`, or `spoofed` names that same
    boundary. At 0 it completes.
- **Relocate:** offered only in the location phase. A Simple Action Control Test
  (Computer vs rating − Relocate); the host's opposing roll is a tally event. Success
  sets `spoofed` = the current boundary.
- **"Keep it frozen":** offered only right after a SUCCESSFUL Relocate. It sets `frozen`
  and spends a Detection Factor point, as a distinct suppression entry (`kind:
  "trace"`). Releasing it unfreezes the trace and charges NO tally (R1 #12).
- **Crashing a trace IC** (its generation moves) kills the record at its next
  validation, with the normal crash tally choice.
- **Completion:**
  - `connection.traced = { icKey, at }`;
  - a GM card with the Security Asset Response Times row;
  - the trap trigger, if the IC is a trap.
  - The effects are read live: −1 TN on proactive IC attacks whose target connection is
    traced, and `traceTally` in `tallyUpdate` (the receipt records the +1).
- **Trap:** when an IC with `trapFor` crashes or its trace completes, the GM gets a card
  naming the hidden IC (one per incarnation: the receipt `trap:<icKey>` on the trap IC).

### 6. Data bombs, scramble, worms (R1 #16–#18)
- **Data bomb:** `bombState` per incarnation (armed, defused or spent).
  - **Defuse** is a System Test linked to the bomb (the card carries `bombKey`). On
    success the writer sets `defused` (receipted on the bomb). On failure it stays
    armed. All 1s: the card offers "It goes off" (the book's exception).
  - **Detonation:** "It goes off" is offered on a later successful System Test linked to
    an armed bomb, or by the GM.
    - It CLAIMS the explosion with `once(bomb, "explode:<icKey>")`, sets `spent`, and
      posts the auto-hit (Rating)M card (resisted normally).
    - The suppress choice costs a Detection Factor point; "register" adds the rating.
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
- **One lifecycle on the host:** `flags.sr2e.shutdown = { id, state:
  "counting"|"offline", turns, warning, cursor, receipts }`.
  - A "shutdown" sheaf row's delivery STARTS it with `once(host, "shutdown:<n>")`, where
    n counts resets. A second crossing finds it running.
  - The ticks are boundary-keyed, like traces, and receipted on the host.
- **The warning:** a public card for that host's deckers.
- **At 0:** state goes "offline", and each live connection on that host gets an exit of
  kind "shutdown" (its own receipt per connection).
- **Offline:** `sessionFor` and the System Test refuse that host. "Reset shutdown" (GM)
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
- **Quench, the failure paths:**
  - interruption after each permanent write (re-run the step: no double effect);
  - the GM ticking while the owner relocates (one writer, both effects land once);
  - a host change keeps black locks and traces;
  - a deck swap between the hit and its resolution damages the hit deck;
  - two traces;
  - a shutdown delivered twice;
  - a reconnect during a pending exit;
  - a Swap Memory between a tar strike and its resolution leaves the new copy alone.

## Key decisions & tradeoffs
- **Rules-light where the book is GM fiat.** Judas, Matrix maniac, physical response,
  data loss and paydata are cards and reminders, not automation; the system has no
  paydata model.
- **Permanent deck damage is a field on the deck item**, not a change to its authored
  ratings: the GM can see and repair it, and a deck swap carries its own damage.
- **Countdowns ride combat rounds** when a combat exists, with a manual "Next turn"
  otherwise. VR2 counts Combat Turns at Phase 0; a round change is that boundary in
  this system (initiative passes are inside a round).
- **Reactive IC is GM-triggered** from the System Test card (tar, worms, data bombs),
  not auto-fired. The book triggers it by the GM's placement, which the system doesn't
  model.
- **Receipts on the damaged document**, in the same update as the effect; cards only
  render.
- **One writer per decker** (events from everyone else), rather than trying to make the
  GM's and the owner's concurrent writes safe.
- **A connection outlives host sessions**; an exit is a resumable record, not an
  instant.

## Risks / open questions
- The book doesn't say what dice the gray "tests" roll. The examples imply the IC's
  rating (Tar Baby-8 rolls a "Tar Baby (6) Test" against its target's rating).
- Rounds as Combat Turns: a GM who doesn't run combat for Matrix fights needs the
  manual "Next turn" button.
- A black IC's "one more attack" happens on the GM's next action; the system only
  prompts.
- Cyberphobia's "any task involving computers": applied to tests whose tnContext skill
  is Computer, Electronics or a B/R skill, or `kind: "matrix"`.
