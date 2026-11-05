# Plan: VR2.0 part 6: frames and SKs
_Draft 5 (2026-11-05): 6a-0 released in 0.131.0. **6a-1 (frame cores and loading) Codex-APPROVED round 2; BUILT and released in 0.135.0 (code review approved round 3).** 6a-2 is outlined in three sub-parts
(6a-2a/b/c), each to be detailed and reviewed. **6a-2a Codex-APPROVED round 3; BUILT and released in 0.136.0 (code review approved round 5).**
6a-2 (running frames), 6b and 6c each get their own detailed section and review, meeting the requirements Codex R1
raised (listed below). Codex review: docs/PLAN-vr2-part6-frames-REVIEW-LOG.md. No code before review._

Sources (all rendered from the image-only PDF, `Shadowrun 2e - Virtual Realities 2.0 {FASA7904}.pdf`; book page = PDF − 8
here): Frames pp.105–107 (PDF 113–115), DINAB p.103–104, Command Sets p.104, Upgrading p.107, Buying Programs p.107,
Condition Monitors p.124, SKs pp.140–141 (PDF 148–149), Decoy p.112, Null Operation and Scan Icon p.117 (PDF 125).

## Goal
A decker can write a frame core, load utilities onto it, upload it to a host and run it: a **dumb frame** that acts on
the decker's commands, or a **smart frame** that takes its own turns. The GM can run **SKs** (semi-autonomous
knowbots): personas without decks that carry a Utility Pool instead of programs. Frames and SKs are icons: they can be
attacked, take damage on a 10-box monitor, crash, and be targeted by the Limit option's "frame"/"SK" target types
(part 5b already lists them).

## The rules, as printed
**Frame core (p.105–106).**
- Size = Core Rating² × multiplier: **2** for dumb cores, **3** for smart. Dumb or smart is fixed when written.
- Options allowed on a core: DINAB, optimization, squeeze.
- Core Rating ≤ the programmer's Computer × 1.5, rounded down.
- Bod + Evasion + Masking + Sensor ≤ Core Rating; any may be 0. Core Rating replaces MPCP in any test that needs one.
- A smart frame's Reaction = its Core Rating.
- The total rating of the loaded programs, options excluded, must stay ≤ Core Rating, less any Core points given to
  Initiative.
- A core's attributes can't be rearranged: different attributes need a new core. The same core can be reloaded with
  different programs.

**DINAB and cores (p.106).**
- Every smart core must carry DINAB, and its DINAB rating is the frame's Computer skill.
- DINAB raises the core's design rating by the DINAB rating. Genie's 12-point smart core with DINAB-8 is
  1,200 Mp = (12 + 8)² × 3, so the raise counts in the size too.
- A dumb core may carry DINAB, which lets it trigger one of its programs on a given action.
- DINAB rating ≤ the programmer's Computer, set when written and never changed.

**Smart frame Initiative (p.106).**
- 1D6 base, plus 1 die for each Core point given to Initiative.
- Those points are set when the core is written, and they reduce the Core Rating used for the program total.
- Whenever the Core Rating drops, the loaded program ratings must be cut to fit.

**Frame loading (p.106).** A programming task.
- Loading Rating = Σ program ratings ÷ 2. Options and the core don't count.
- Loading size = LR²; loading base time = size × 2 days.
- Computer Test against the average rating of the programs being loaded. The Software concentration or Matrix
  Programming specialization may be used instead.
- Task period = base time ÷ successes.
- Programs are object-code copies, whole only: no partial copies.
- **Misprint:** the worked example prints "(10 + 2)² = 25", which can only be (10 ÷ 2)² = 25 (Attack-6 + Cloak-4 = 10).
  This is the same ÷ → + glyph substitution as the core book ([[sr2e-source-captures]]).
- Frame actual size = the core's actual size + the actual sizes of its programs and options: 1,200 + 144 + 48 = 1,392 Mp.

**Running a frame (p.106).**
- The decker logs on to a host and uploads the frame, which starts running when the upload completes.
- Compressed or squeezed frames must be decompressed first.

**Dumb frames (p.106–107).**
- A command is a Simple Action, even when the program does a Complex one.
- A command is one action, with no repeating: a second attack needs a second command.
- Dumb frames crash when the decker logs off that host, and they don't follow him to other systems.
- *Decoy frames:* with the Decoy operation, security targets the frame while the decker stays inactive. The decker uses
  his own Computer skill, but all attribute scores come from the frame, and only the frame's utilities count. IC hits
  the frame, though trace still finds the decker (same datatrail). Once the decoy crashes, security reacts to the
  decker normally.
- *Event triggers:* the decker must be on the same system to get the message, which may need a Null operation. The
  frame needs Sensor + analyze and/or scanner, each at least half the host's Security Value.
- *Weapon carriers:* each attack takes a Simple Action, and the programs are lost if the frame crashes.

**Smart frames (p.107).**
- They can do anything a dumb frame can, with their own skill (the DINAB rating) and their own Reaction and Initiative.
- The decker gives a basic order as a Free Action, and the frame carries it out on its own actions without using any
  of the decker's.

**Icon damage (p.124).**
- Every icon has a 10-box Condition Monitor and crashes when it fills.
- It resists damage with Bod against the damage's Power; Armor lowers the Power.

**SKs (p.140–141).**
- MPCP = 1D6 + 6. Bod + Evasion + Masking + Sensor ≤ MPCP × 3, each ≤ MPCP. Computer skill = MPCP.
- They load no utilities. Instead they have a Utility Pool of MPCP + 1D6 points:
  - Points are allocated to any utility as a Free Action, 1 point = 1 rating point, with the rating ≤ MPCP.
  - Black hammer and killjoy cost 2 points per rating point.
  - Points put into restore or medic can't be reallocated until the SK returns to its native host.
  - Points can also go to Initiative: 1 point → 2D6, 3 → 3D6, 5 → 4D6 (the maximum).
- Reaction = MPCP, with 1D6 Initiative.
- On its native host it repairs damage: a Complex Action gives it a medic/restore at MPCP rating, without using the pool.
- It can't jack out: it has to use Graceful Logoff and Logon to Host. It crashes when its monitor fills.
- The six printed configurations (MPCP-7/6/5/5/5 … MPCP-12/9/9/9/9) are examples.

**Command sets (p.104).**
- The decker writes the set in advance: design size 1D6 × 20 Mp. After upload, a Control Test loads it.
- The host's successes against the decker's Subsystem Tests are summed: 24 ÷ that sum = the hours before it's found
  and purged. With no successes, it lasts 48 hours.
- The GM picks which Subsystem Test the set needs, with Control as the default.

**Null operation (p.117).** Test Control, utility Deception, Complex Action.
- The GM may require one or more whenever a decker waits for something (a Matrix event, the end of an ongoing
  operation) or does things that take actions but no System Tests (e.g. maintaining an Edit Slave), and may roll it
  secretly for the decker.
- The host's opposed Security Test uses its base Security Value, plus the inactivity modifier: under 10 seconds +0;
  10 s–1 minute +1; 1 minute–1 hour +2; 1–12 hours +4; +1 more per additional 12 hours. The GM may cap the period.
- A tally trigger it causes may be activated by the GM later in the waiting period.

**Scan Icon (p.117).** Test Special, utility Scanner, Simple Action.
- On a decker, frame or SK the decker has located: Computer Test against the target icon's Masking.
- If the target runs Sleaze, subtract Sleaze from the scanner's Scanner rating and lower the TN by the difference;
  if Sleaze is higher, raise the TN by the difference.
- Each success buys one fact: its MPCP Rating, any one Persona Rating, or its Response Increase. Identifying the icon
  needs Analyze Icon.

**Upgrading (p.107)** is its own plan: docs/PLAN-vr2-upgrading.md.

## Approach (proposed)
0. **Phasing.** 6a-0 the missing icon operations (Decoy, Null Operation, Scan Icon), 6a frames (core + loading +
   dumb + smart), 6b SKs, 6c command sets. Each is releasable alone; 6b reuses 6a's icon actor. Upgrading is
   docs/PLAN-vr2-upgrading.md.
1. **Frame core = a program item** with `frameCore: {kind: "dumb"|"smart", bod, evasion, masking, sensor, initPoints}`.
   - It uses the part-5b options machinery: the allowed options are DINAB, optimization and squeeze. Smart requires
     DINAB.
   - The size goes through `programSizes`, with the design rating raised by DINAB (the Genie example becomes a test).
   - The cap goes into `programmingCap(kind: "frameCore")`: Computer × 1.5, rounded down. That also closes the 5b
     note "1.5× cap stated, not modelled".
   - Pure rules go in `module/rules/vr2-frames.mjs`, with Vitest tests on the Genie example.
2. **Loading = a programming task on the core** (reusing `module/programming.mjs`).
   - The task stores `{load: [{itemId, name, rating, actualSize}]}`, the loading rating, the base time, and the test
     against the average rating.
   - Completion writes `flags.sr2e.frame.loaded = [...]` as a SNAPSHOT of object-code copies.
   - Editing or deleting the source programs afterwards doesn't change a loaded frame. The book says they're copies,
     and a snapshot also keeps the frame stable across devices.
   - The total is validated against Core Rating − initPoints.
3. **A running frame = a new actor type `frame`**, an icon like IC: system.json `documentTypes` (needs a server
   restart), plus a data model and a sheet.
   - Uploading a core on a host creates the frame actor and its token, through `createActorViaGM`, gated by
     `canCreateActor()` ([[sr2e-actor-relay-backlog]]).
   - The actor carries the core's attributes, the loaded snapshot, `ownerUuid` (the decker), `hostUuid`, and the
     owner's connection id.
   - Lifecycle is an event-log fact like part 3: a dumb frame crashes when the decker's connection to that host ends,
     and only the sequencer writes that crash.
   - Alternative rejected: reusing the `ic` type. IC behaviour (host-owned, the sequencer's IC turns, trace, the alert
     ladder) would leak into frames, and every IC check would need a "not a frame" exception.
4. **Frames in combat.**
   - Frames are valid attack and maneuver targets: add `frame` to the target-type checks in vr2.mjs/vr2ic.mjs, after
     grepping every `["ic", "character"]`.
   - Damage resistance is Bod (+ a loaded Armor/Shield) against Power, on the 10-box monitor; a full monitor crashes
     the frame.
   - Dumb frame command:
     - The command button on the decker's Matrix tab uses the decker's Simple Action.
     - Dice: the program's rating for attacks (p.123, as personas do), and the decker's Computer for System Tests
       (the decoy rule).
     - The frame's attributes stand in for the persona's, and only its own loaded programs count.
   - Smart frame: its own combatant, with initiative Reaction (= Core) + (1 + initPoints)D6. Its Computer is its DINAB
     rating, and its owner rolls its actions from the frame sheet.
   - DINAB on a dumb core: one automatic program trigger per action, on the 5b DINAB wear/crash rules.
5. **Decoy and Locate Frame operations.**
   - **Locate Frame** already exists as a system operation (`config.mjs`: Index, Scanner). It needs frames to find.
   - **Decoy** (p.112, rendered) is missing. Rules:
     - Control Test, Mirrors utility, Complex Action.
     - It makes a decoy copy of the decker's icon and records the Control Test's successes.
     - Whenever a proactive IC attacks the decker, roll 1D6. If the roll is less than the successes, the IC attacks the
       decoy instead; a tie also fools the IC.
     - Decoys have no defences and no damage resistance: they take full damage and vanish when their monitor fills.
     - Not effective against trace IC.
     - Decoy can also be used to lock IC's attention onto frames (p.105–107: security goes after the decoy frame while
       the decker stays inactive, and the frame's attributes count).
   - **Plan:**
     - Decoy is a `decoy` record on the decker: successes, connection, and a 10-box monitor. The 1D6 redirect is rolled
       by the sequencer at IC attack admission and written into the admit record, so every device agrees.
     - A frame decoy is the same record pointing at the frame actor.
     - Trace still resolves to the decker, and scanner lowers Locate Frame/Decker as it does today.
   - Plain Decoy doesn't need frames, so it ships first, as 6a-0, with:
     - **Null Operation**: a system operation in `config.mjs` (`nullOp: control / Deception`). Its dialog asks for
       the waiting period, and the Security Test uses the base Security Value + the inactivity modifier (a pure
       `nullInactivityMod(seconds)` in vr2 rules, Vitest on each band). A GM "roll it secretly" option whispers the
       card to the GM.
     - **Scan Icon**: a Simple Action on a located decker (6a-0), frame or SK (6a/6b), Computer vs the target's
       Masking with the Sleaze/Scanner difference; the card lists one fact per success for the decker to choose, read
       from the target's derived data (MPCP or Core Rating, persona ratings, Response Increase).
6. **SKs (6b).**
   - `frame` actor with `kind: "sk"`: MPCP, persona ratings (validated ≤ MPCP each, Σ ≤ MPCP × 3), Computer = MPCP,
     `utilityPool {total, alloc: {utility: points}}`, `nativeHostUuid`.
   - Allocation is a Free Action from the SK sheet, and each utility it allocates behaves like a loaded program of that
     rating (a virtual program list feeding `activePrograms`).
   - Black hammer and killjoy cost 2:1, and restore/medic points are locked until the SK is on its native host.
   - Initiative takes the 1/3/5-point dice steps.
   - Native-host regeneration is a Complex Action button.
7. **Command sets (6c).**
   - A command-set item: size roll, Control Test, a hours-undetected card. The rest is the GM's narrative.
8. **Tests.**
   - Vitest: core size/cap/attributes, the loading rating with the ÷ example, SK pool costs, initiative steps.
   - Quench `sr2e.vr2-frames`: write, load and upload a dumb frame; command an attack; IC kills the frame; logoff crashes
     it; smart frame initiative; decoy redirect; SK allocation; Limit:frame.

## 6a-0 in detail: Decoy, Null Operation, Scan Icon (released 0.131.0)

**Decoy (p.112): Control, Mirrors, Complex.**
1. A system operation (`decoy: control / Mirrors` in config.mjs) run through `vr2SystemTest` like any other. After
   the roll the decker's client ALWAYS writes one durable record on itself, success or not:
   `vr2:decoy:<conn>:<cardId>` `{ card, host, sessionId }` (`recordEvent`; the deterministic id makes a double click
   one record). Whether it is a decoy is decided live from the card (next point), so a Karma reroll that turns a
   failure into a success creates the decoy with no extra write (R2 #4).
2. **Successes are read live from the card** (`flags.sr2e.vr2SystemTest.successes`, which the Karma buttons update):
   p.112 says "record the number of successes the decker achieves". A Karma reroll that turns the test into a failure
   makes the decoy invalid; one that adds successes strengthens it. The card is the source of truth; a deleted card
   ends the decoy.
3. **The live decoy** (folded, never stored): take the NEWEST decoy record of the live connection whose card currently
   shows a success OR no longer exists (R3: a deleted card counts as a decoy that's gone, so it still blocks the older
   one); that one alone is then checked — a missing card means no decoy — its `sessionId` must be the decker's current host session
   (logging on to another host or off ends it) and its damage (below) under 10 boxes; otherwise there is no decoy
   (R2 #1). So:
   - a successful Decoy replaces the old one for good: when the new one is destroyed, the old one does NOT come back;
   - a failed attempt (or one Karma turns into a failure) never happened as far as decoys go: the existing decoy
     stays. (The book is silent on several decoys; one, replaced by the next, is the simplest reading of "a decoy
     copy".)
   - A record whose card was deleted while it was still a failure also ends the older decoy. Deleting a test card
     is a GM tidy-up, so erring toward "no decoy" is the safe side.
4. **The redirect roll (R1 #1).** In `attackOnce`, an IC attack on a character whose program `isProactive` and isn't
   `trace` ("not effective against trace IC"), when the target has a live decoy:
   - it must be rolled by the active GM (the sequencer), exactly as cascading IC already is, so one client decides;
   - BEFORE any target-dependent term is computed, the sequencer rolls a visible 1D6 (a chat roll). Roll ≤ the
     decoy's successes ("less than … in the event of a tie, decoys fool IC") → **the attack goes to the decoy**.
   - A decoyed attack uses NONE of the decker's target terms: no traced −1, no maneuvers/parry, no black-IC +2 for a
     downed icon, no crippler attribute effect (a decoy has no attributes: the attack just does its damage). TN is the
     cybercombat table for the host's code and the IC's status; dice and Power are the IC's.
   - The card carries `decoy: { key, roll, successes }` and `targetUuid` stays the decker (for the admission below).
   - *(Built differently: the roll is carried on the attack card and in the `admit:<card>` fact, not a separate
     `vr2:decoyroll` record; noted in code review round 1.)*
5. **Admission and resolution (R1 #1, R2 #2–#3).** A decoyed attack is still requested and admitted as an IC attack
   on that decker (`Y.request(target, "attack", …, decoy: key)`), so exits, locks and the Black IC last-attack
   bookkeeping see it exactly as before. `HANDLERS.attack` copies `decoy` into the `admit:<card>` fact (today it
   copies only named fields). Its resolution button is **Hit the decoy** (the GM's), not the decker's resistance. It
   is a new sequencer handler `decoyHit`, shaped like `HANDLERS.apply`: it refuses unless the card was admitted on
   that connection WITH that decoy key, and returns ok without writing if `ack:attack:<card>` exists already.
   - "No special defenses and no damage resistance, so they take full damage": the IC's Damage Level staged up one
     level per two attack successes (the card's current successes), onto the decoy's 10-box monitor;
   - **0 successes is a miss**: no hit record, just the ack with `{ decoy: key, boxes: 0 }` (R2 #3);
   - written by the sequencer as `vr2:decoyhit:<conn>:<card>` `{ decoy: key, boxes }` (deterministic id: one hit per
     card), and the same `ack:attack:<card>` fact a normal resolution writes (outcome `{ decoy: key, boxes }`), so
     the admission is acknowledged and nothing on the decker waits for it;
   - if the decoy is already gone (full, replaced, session over), the hit still acks and lands on nothing: the IC
     wasted the attack on a vanished copy;
   - the decoy's damage is the sum of its hit records; at 10 it disappears (a chat line).
6. Trace IC ignores decoys (rule 4), and trace still finds the decker.

**Null Operation (p.117): Control, Deception, Complex.**
1. `nullOp: control / Deception` in config.mjs; its dialog adds **waiting period** (a number + seconds/minutes/hours).
2. The host's Security Test uses its BASE Security Value (`host.system.securityValue`, which is the base: cascades
   add separately) **+ the inactivity modifier** from a pure `nullInactivityMod(seconds)`: < 10 s +0; 10 s–1 min +1;
   1 min–1 h +2; 1–12 h +4; +1 per further 12 h (Vitest on every boundary). `vr2SystemTest` takes it as
   `opts.svMod`, shown on the card.
3. **Secret (R1 #3).** The dialog has **roll it secretly** (GM only, as the book allows): EVERY message the operation
   posts — the decker's roll, the System Test card, a Probe roll — is whispered to the GMs as a blind roll, via one
   `secret` option threaded through `vr2SystemTest` (and its probe), so nothing leaks to the player. The tally still
   rises (the tally event is processed from the message flags, whispered or not).
4. **Triggers (R1 #3, partly rejected).** The tally increase and the triggers it crosses apply as for every System
   Test. The book leaves the response's TIMING to the GM ("as he sees fit, perhaps after a percentage interval");
   the card says so. No deferred-trigger mechanism: triggers already only post to the GM, who decides when the IC
   shows up.

**Scan Icon (p.117): Special test, Scanner, Simple Action (R1 #4).**
1. A button on the Matrix tab beside Attack: target an icon first. 6a-0 targets: a decker's persona (frames and SKs
   join in 6a/6b through the same check).
2. **"Located"**: the same standard as an attack: the target is targeted and not lost (`maneuverState(...).blind` is
   false). The card records the target's `sessionKey` (its incarnation) so a reconnect makes it stale.
3. The utility executes like any other (`bestUtility(actor, "Scanner", host)` + `spendUse`, so one-shot, DINAB and
   Sensitive all apply). **TN = target Masking − (Scanner − target's Sleaze)**, min 2: Sleaze higher than Scanner
   raises it by the difference. Computer test (Hacking Pool allowed); no host roll ("Special").
4. **Disclosure only as paid:** the card is whispered to the scanning player and the GMs and shows N empty slots
   (N = successes, following Karma). Each slot's **Choose** button opens a pick (MPCP, Bod, Evasion, Masking,
   Sensor, Response Increase) and claims the slot with a DURABLE record, `recordEvent(actor, "vr2:scan:<card>:<slot>",
   { pick, value })` (R2 #5: `once` markers are pruned after 24 hours, which would reopen paid slots). The value is
   read from the target's derived data at the claim, and the card re-renders from the records. Nothing unchosen is
   ever rendered.
5. **Checked at the claim, not just by hiding buttons (R2 #6):** the slot index must be below the card's CURRENT
   successes, and the target's `sessionKey` must still be the one the card captured (a reconnect makes the card
   stale: no more picks). Picks already made stay: they were true when paid for.
6. Identifying the icon is Analyze Icon (exists).
7. The TN is shown as on every Matrix card (R2 #7 rejected: tests are rolled against a TN the player sees, and every
   Matrix card already shows TNs built from the target — IC defenses, Trace Factor; with the target's Sleaze
   unknown it doesn't pin Masking down anyway).

**6a-0 tests.**
- Vitest: `nullInactivityMod` bands; decoy fold (live / replaced / the replacement destroyed doesn't resurrect the
  old one / a failed newer attempt keeps the old / the newer card deleted → no decoy / session ended / 10 boxes /
  failure→success by Karma);
  `decoyFooled(roll, successes)` (≤, tie fools); Scan Icon TN with Sleaze above and below Scanner; staged decoy damage.
- Quench `sr2e.vr2-decoy`: a Decoy success records one decoy (double click → one); a killer IC attack with roll ≤
  successes is decoyed (its card has no decker terms) and Hit the decoy writes one hit + the ack; trace IC is never
  decoyed; 10 boxes remove the decoy; logging on to another host ends it; a Karma reroll to failure invalidates it;
  a 0-success decoyed attack acks with 0 boxes; a refused admission (the decker leaving) can't be hit onto the decoy;
  Hit the decoy clicked twice writes one hit.
- Quench: a secret Null Operation posts only GM-whispered messages and still raises the tally; the modifier shows.
- Quench: Scan Icon spends Scanner, reveals only claimed slots, a second click on a claimed slot changes nothing,
  a pick beyond the current successes or after the target reconnects is refused, and picks survive a marker prune.

## 6a-1 in detail: frame cores and loading

6a is split in two, as part 7 was:
- **6a-1** is the frame core as a program and the loading task. It covers items only, with nothing running.
- **6a-2** is running frames: the frame actor, upload, lifecycle, combat, dumb and smart frames, and decoy frames.
  It gets its own detailed section and review. The "Requirements carried" list below is mostly 6a-2's. 6a-1 answers
  the "loaded programs", "loading completion" and "core design" requirements.

The pages were rendered again for this section (2026-11-05): Frames, Frame Core, DINAB and Cores, Smart Frame
Initiative and Frame Loading (pp.105–106).

**User rulings (2026-11-05):**
- the Loading Rating (Σ ratings ÷ 2) rounds UP: 11 → 6;
- the loading test's TN (the average rating) rounds UP: 4.5 → 5.

### 1. A frame core is a program item
**Schema.** `ProgramData` gains
`frameCore: SchemaField { kind, bod, evasion, masking, sensor, initPoints }`:
- `kind` is a StringField from `"" | dumb | smart`, initial `""`, `blank: true` (the blank trap). `""` means not a
  core, which is every existing program, so there's no migration;
- the four attributes and `initPoints` are integers, min 0, initial 0.

The **Core Rating** is the program's `rating`.

**Derived data (`prepareDerivedData`, VR2.0 only; core-book Matrix: inert):**
- **The multiplier:** 2 (dumb) or 3 (smart), "the size multiplier for all dumb frame cores is 2; … 3 for smart cores".
  It overrides the authored multiplier exactly as an attack's Damage Level does today, and the authored multiplier is
  restored when `kind` is cleared.
- **The utility id** is `frameCore`. `UTILITY_OPTIONS.frameCore = ["dinab", "optimization", "squeeze"]`.
- `activeOptions` adds Sensitive to every utility today. It doesn't for `frameCore`: "Frame cores may be equipped with
  any of the following options: DINAB, optimization, and squeeze" is a closed list.
- **A core's DINAB isn't capped by the Core Rating (R1 #1).** Its cap is the programmer's Computer (§2), so
  `activeOptions` exempts `frameCore` DINAB from its "1 to the base rating" ceiling. Core-4 with DINAB-6 by
  Computer 6 is legal.
- **Core options are frame rules, not the optional Utility Options rule (R1 #2).**
  - DINAB is mandatory on smart cores, and its size counts.
  - `ProgramData` computes a core's active options under VR2.0 whether or not *VR2.0 utility options* is on.
  - With the setting off, ordinary programs still get none, as today.
- **Sizes** go through the existing `programSizes`. DINAB's "rating" modifier already raises both the design and the
  actual rating. Genie's smart core 12 + DINAB-8 → (12 + 8)² × 3 = 1,200 Mp, which becomes a Vitest case.
- `frameCheck`, a pure `coreProblems(core)` in a new `module/rules/vr2-frames.mjs`, lists what's wrong. A core with
  a problem can't be programmed, and later can't be loaded or uploaded:
  - Bod + Evasion + Masking + Sensor ≤ Core Rating (any may be 0);
  - `initPoints` ≤ Core Rating, and 0 on a dumb core (only smart frames have Initiative);
  - a smart core must carry an active DINAB.
- **`programCapacity`** = Core Rating − initPoints: what the loaded programs may total.
- **Frame Initiative** (for 6a-2, derived here): smart = (1 + initPoints)D6 and Reaction = Core Rating; dumb = none.

**Not a utility.** `usablePrograms`, the ONE rule every utility lookup goes through, excludes `frameCore.kind`. A core
in storage is never "loaded" onto the deck: the row shows no loaded toggle, and a stray `loaded: true` counts for
nothing. Cores take storage memory like any program, at their actual size.

**The design lock (R1 #6).**
- `designOf` (programming.mjs) adds `frameCore` (kind, the four attributes, initPoints).
- The `preUpdateItem` lock in sr2e.mjs adds `frameCore` to its key list.
- The lock refuses a design edit while EITHER task family is open: `programmingState(item).writing ||
  loadingState(item).writing`.
- Abandon takes the family's prefix, so "Abandon" on a loading task ends that task, not a programming one.

**Written means the current design, for cores only (R1 #7: a new rule, not 5b's).**
- 5b's fold keeps "written once" for ordinary programs, unchanged: they stay usable after a design edit, as today.
- For a frame core, "A core's attributes may not be rearranged … the programmer must write a new frame core" adds a
  core-only check: `coreWritten = the latest COMPLETED prog: task's captured design equals designOf(core) now`.
- Changing a written core's design leaves it unwritten until a new programming task completes.

### 2. Writing a core (the programming caps)
`programmingCap(utility, skills)` gains the core's rules (p.105–106):
- **Core Rating ≤ ⌊Computer × 1.5⌋.** The cap uses the highest Computer of a team, and a team's usual +1 doesn't lift
  it: the book ties the cap to "the programmer's Computer Skill × 1.5", as it ties black hammer's ⌈skill ÷ 2⌉.
- **DINAB rating ≤ Computer** (the same highest Computer), set when written ("cannot be altered later" is the design
  lock).
  - `activeOptions` caps a rated option at the base rating. A core's DINAB is checked against the programmer at
    `startDialog`.
  - The DINAB cap is part of the cap check: "DINAB-9 exceeds Computer 8 (p.106)".
- **Smart cores need DINAB:** `startDialog` refuses with `coreProblems`.

Everything else is 5b programming unchanged: the test against the Core Rating, base time from the design size, the
task period, tools, teams, freeze and Karma.

### 3. Loading: a programming-like task on the core (p.106)
**Its own record family on the core item**, folded like 5b's `prog:` records: `load:start:<n>`, `load:log:<n>:<id>`,
`load:frozen:<n>`, `load:end:<n>`. `foldProgramming` takes a prefix (`"prog:"` or `"load:"`). The append-only design,
server-arbitrated ids, the freeze-before-work rule and its recorded shortcut are all inherited, not re-invented.

**The start (`loadDialog`)** is a button on a written core's row: "Load programs…".
1. Pick programs from the decker's own program items: written, not frame cores. "Object-code copies of any programs
   he has available" means the decker's own copies; worn or loaded state is irrelevant.
2. **Checks (pure, in `module/rules/vr2-frames.mjs`):**
   - **The total:** Σ base ratings (options excluded: "not including Option Ratings") ≤ `programCapacity`.
   - **Whole programs only:** a program is copied at its own rating, and there is no partial-copy input.
   - At least one program.
3. **Loading Rating** = ⌈Σ ÷ 2⌉ (user ruling). Loading size = LR², and base time = size × 2 days. Genie: 6 + 4 = 10
   → 5 → 25 Mp → 50 days, the printed example with the ÷ misprint fixed.
4. **The test:** a Computer Test against ⌈the average base rating⌉ (user ruling). It uses `programmingSkillOf`, so the
   Software concentration or Matrix Programming specialization may stand in, as p.106 says. Teams and tools work as
   in programming ("Loading … is a task, similar to programming").
5. **The start record carries the WHOLE load (requirement: loaded programs as full immutable copies).**
   `load: [{ sourceId, name, source, system }]`:
   - `system` is the program's source data, the authored fields from `item.toObject().system`: rating, multiplier,
     category, offense, damageLevel, options, manufacturer;
   - `source` is its compendium identity (`_stats.compendiumSource` or the core's sourceId flag), for
     `programKey`-style identity checks;
   - `sourceId` is the item id it was copied from, for display only.

   Also `loadingRating`, `tn`, `baseTime`, and the core's design snapshot (`designOf(core)`).
6. **The design is captured before the dialog and re-checked before the record,** as `startDialog` does for programs.
   The core's design and every source program's design are both checked: a program edited during the roll means
   "start again".

**Work and completion** reuse 5b's `workDialog`, `freezePeriod` and `complete`, generalized by the prefix.
- `complete` refuses if the core's design changed since the start.
- Changes to the source programs after the start don't matter: the copies are already in the record.

**The winning terminal record is self-contained (R1 #4; the carried "loading completion" requirement).**
- `load:end:<n>` with outcome `complete` carries the whole load: the copies, `coreDesign` (the core's design at the
  start) and the `loadingRating`. They are copied from the start record in the same write.
- `foldProgramming` keeps an end record's `payload` (today it keeps only `outcome`). Ordinary programs never write
  one.

**The active load is derived, never written.** `activeLoad(core)` is the payload of the latest `load:` task with
outcome `complete`, plus its task number (the load generation).
- A newer completed load replaces it.
- An abandoned or failed load leaves the previous one in place.
- No separate "loaded" field exists that could be lost or overwrite a newer load.
- **It counts only if its `coreDesign` equals the core's design now (R1 #3), its total still fits the core's
  `programCapacity`, and the core is written (§1).**
- Rewriting a core to a different design never revives a load made for the old one: the load reads "made for
  another design of this core: load again".

**Copies are sized and read exactly like programs (R1 #5).**
- `ProgramData`'s derivation (the Damage-Level multiplier, the utility id, active options under the setting, sizes)
  moves into a pure `deriveProgram(name, system, { vr2, optionsOn })` in `module/rules/vr2-options.mjs`.
- `ProgramData.prepareDerivedData` calls it, unchanged in result: a pure refactor with Vitest pinning today's
  outputs.
- `copyStats(copy)` calls the same function on a snapshot. Inert or unknown options are dropped by `activeOptions`
  as they are for a live program, never thrown on.

**Frame actual size (p.106)** = the core's actual size + Σ each copy's actual size with its options. Each copy's size
comes from `programSizes` on its snapshot data. Genie: 1,200 + 144 + 48 = 1,392 Mp, a Vitest case. 6a-2 uses it for
upload.

### 4. UI (VR2.0)
- **The program sheet** gets a **Frame core** section:
  - kind (— / dumb / smart), Bod, Evasion, Masking, Sensor;
  - Initiative points (smart only);
  - the `coreProblems` list;
  - capacity, the size line, and the loaded snapshot (read-only).
- **The Matrix tab's program rows:** a core shows a **Core** badge with "dumb/smart, Core N", its loaded programs and
  the frame's actual size. It shows **Load programs…** instead of the loaded toggle. Loading progress uses the
  existing programming progress display with the `load:` fold.
- **Prices:** a core is priced by `programSizes` like any program (p.107: price from rating and design size).

### 5. Tests (6a-1)
**Vitest:**
- the Genie core size (1,200);
- the dumb/smart multipliers;
- `coreProblems` on each rule;
- `UTILITY_OPTIONS.frameCore` with Sensitive refused;
- `programmingCap` for cores: ⌊C × 1.5⌋, team, and the DINAB ≤ C check;
- the Loading Rating and TN roundings (11 → 6; 4.5 → 5);
- the Genie loading (10 → 25 Mp → 50 days; ÷ 5 successes → 10 days);
- the capacity with initPoints;
- `activeLoad`: latest complete wins, an abandon keeps the old one, a changed core design voids it, an over-capacity
  load voids it;
- `deriveProgram` gives the same results as today's `ProgramData`: attack multipliers, inert options, setting off;
- a core's DINAB above its rating but within Computer;
- smart-core DINAB counting with utility options off;
- the frame actual size, 1,392.

**Quench `sr2e.vr2-frames`:**
- write a smart core with DINAB;
- a smart core without DINAB refused;
- DINAB above Computer refused;
- load Attack + Cloak and complete, with the snapshot equal to the sources;
- edit the source Attack afterwards: the load unchanged;
- a second load replaces the first;
- an abandoned load keeps the first;
- design edits refused while loading, and Abandon ends the loading task;
- rewriting a core to another design voids its old load;
- changing the core's attributes makes it unwritten;
- a core never counts as a usable utility.

## 6a-2: running frames (outline; each sub-part gets its own detailed section and review)
6a-2 meets most of the "Requirements carried" list, and touches the IC/sequencer, combat and session code. One review
of all of it would be expensive (the part-6 R1 lesson), so it is split.

**Rule found for upload time (p.91, rendered 2026-11-05):** "A deck with an I/O bandwidth of 10 MePS can upload or
download 10 Mp of data per second". So uploading a frame takes ⌈frame actual size ÷ the deck's I/O bandwidth⌉
seconds: Genie's 1,392 Mp at 20 MePS is 70 seconds, about 24 Combat Turns. The deck's I/O speed field is the I/O
bandwidth. Multiplexing and Retrain stay out of scope, as part of the Bandwidth rule.

- **6a-2a: the frame actor, upload and lifecycle.**
  - The `frame` actor type: schema, sheet, a stable incarnation id equal to the upload id.
  - Upload as a sequencer-admitted, timed record, bound to the connection and the host session. Completion is the
    sequencer seeing world time pass the upload's seconds. Creating the actor, token and combatant is reconciled
    idempotently against a departure.
  - Decompress before upload.
  - Dumb frames end when the owner leaves that host; host shutdown and deletion end frames too; cleanup is
    replayable.
  - Frames as targets: attack and maneuver targeting, admission, resistance (Bod + the copies' Armor and Shield), the
    10-box monitor and crash, attribute effects, Limit `frame`, Scan Icon, Locate Frame.
- **6a-2b: commanding a dumb frame.**
  - The execution context: commander, acting icon, skill, utilities, host session, tally and trace owner.
  - Commands as the decker's Simple Action, one action each.
  - The copies as runtime programs for `activePrograms`, `spendUse` and wear.
  - Dumb-core DINAB, claimed against the owner's action.
  - Decoy frames: a separate mode from plain decoys.
  - Event triggers: Sensor and analyze/scanner ≥ half the Security Value, same-host delivery.
  - Cutting program ratings when the Core Rating drops.
- **6a-2c: smart frames.**
  - Their own Reaction and Initiative, and a combatant.
  - A basic order as a Free Action, then actions on their own turns with DINAB as the skill.
  - Existence independent of the owner ("whether their creator is logged on or not").

## 6a-2a in detail: the frame actor, upload, lifecycle, frames as targets

Builds on 6a-1 (0.135.0): a written core with an active load (`activeLoad`). The pages were rendered for this
section (2026-11-05): Running a Frame and Dumb Frames (p.106–107), Smart Frames (p.107), I/O bandwidth (p.91),
Locate Frame (p.114–115), Icon damage (p.124).

**Out of 6a-2a, on purpose (each stated so a reader doesn't assume it):**
- commanding a dumb frame, decoy frames, event triggers, dumb-core DINAB, and attribute, track, hog and slow effects
  on frames (6a-2b);
- smart frames acting, their combatant, and Initiative in combat (6a-2c).

In 6a-2a a frame exists, can be attacked, takes damage, crashes and is cleaned up. An attack whose effect isn't plain
damage is refused against a frame: "not yet (frames, part 6a-2b)".

### 1. The `frame` actor type
**Type.** `system.json` `documentTypes.Actor.frame` (a new type needs a server restart, so the release note says
so), with a `FrameData` model and a sheet (`SR2EFrameSheet`). After the schema add, check `invalidDocumentIds`.

**Schema.** Everything is written ONCE at creation from the upload's snapshot, except `condition`:
- `kind`: `dumb | smart` (6b adds `sk`);
- `coreRating`, plus `bod`, `evasion`, `masking`, `sensor` and `initPoints`;
- `dinab`: the core's DINAB rating, or 0;
- `ownerUuid`: the decker;
- `coreUuid`: the core item, for display only;
- `uploadId`: the incarnation id (§2);
- `hostUuid`, plus `conn` and `sessionId`: the owner's connection and host session at upload.

**The monitor is DERIVED, not stored (R1 #9).** A frame's damage is the sum of its `frameHit:<card>` facts on the
owner's log (§5): 10 boxes per p.124, and full means crashed (§4).

**Ownership.** The frame actor copies the owner actor's ownership levels, so the decker's player owns it. The GM
writes it (§3).

**The loaded copies become real program items on the frame actor** (the carried "loaded programs" requirement).
- At creation, each snapshot copy is created as an embedded `program` item: its `system` from the copy, `loaded:
  true`, and `flags.sr2e.frameCopy = { uploadId, source }`.
- `activePrograms`, `bestUtility`, `spendUse`, wear and crash all take an actor, so they work on the frame
  unchanged, with the frame's own wear and crash state.
- Their design is locked: a `preUpdateItem` / `preDeleteItem` guard on items of a `frame` actor refuses design edits
  and deletion, except by the GM's cleanup. "Programs are object-code copies" (p.106), so a running frame's programs
  never change.
- A frame core's own derivation doesn't apply to these items: they are ordinary programs.
- **Decompressed copies stay decompressed (R1 #1).** When the frame was decompressed (§2), each copy is created with
  `flags.sr2e.decompressed` = its own `loadGen` (0), so `isCompressed(copy)` is false. Otherwise a squeezed Armor
  copy would be unusable.
- **The frame's host is its context (R1 #2).** `activePrograms(actor, host)` (and so `bestUtility`) resolves the
  host of a `frame` actor from `system.hostUuid`, not from a live session (frames have none), so Sensitive
  copies are judged on the frame's own host.

**The frame's derived data:**
- `matrixPersona`-shaped attributes (`bod`, `evasion`, `masking`, `sensor`) and `mpcp` = `coreRating` ("the Core
  Rating is used in place of an MPCP Rating", p.105), so persona readers can use one accessor;
- `ended`, derived from the owner's records (§4).

### 2. Upload (p.106; p.91)
**Starting it.** **Upload frame** on a written core's row (VR2.0, connected) asks for the decker's current place, and
refuses unless:
- the decker is ON a host. Under topology that's `currentPlace(actor)` with a host kind; otherwise the live
  session's host;
- the core is written, `coreProblems` is empty, and `activeLoad` has no `void`. An empty load is allowed: a bare core
  can still serve as a decoy body in 6a-2b;
- **decompressed (requirement):** "Compressed or squeezed frames must be decompressed before they can run". If the
  core or any copy carries an active squeeze, the decker first uses **Decompress frame** on the row (a Complex
  Action, as `vr2Decompress`). It writes `flags.sr2e.frameDecompressed = <load gen>` on the core, and a newer load
  needs it again.

**The request.** The decker's client sends `upload` with `{ id, conn, core, gen, host, sessionId }` (R1 #3: `conn`
is captured explicitly; `request()` doesn't add it). `id` is a fresh `randomID(16)`. No snapshot and no duration:
the client's word on either isn't trusted.

**Admission (sequencer; R1 #3).** `HANDLERS.upload` **derives** everything on its own client:
- it validates that the decker's live connection is `conn`; the live session is `sessionId`, on `host`; the host is
  online; under topology the decker is ON that host;
- the core item (read from the owner actor) must be written, with no `coreProblems`, and an `activeLoad` of
  generation `gen` with no `void`; if squeezed, `frameDecompressed === gen`;
- it builds the snapshot itself from that core and load: `{ kind, coreRating, attrs, initPoints, dinab, copies,
  coreName, frameSize }`;
- `seconds = ⌈frameSize ÷ the owner's deck I/O speed⌉`, refused at 0;
- it **writes `upload-open:<id>`** `{ type: "upload", conn, sessionId, host, seconds, snapshot, clock }`. The clock is
  the decker's started combat if he is in one (`{ combatId, startRound }`, as traces do); otherwise
  `{ manual: true }`.

The card says the upload takes N seconds, which is ⌈N ÷ 3⌉ Combat Turns.

**Completion (sequencer; requirement: "completion admitted by the sequencer").**
- **In combat:** each round boundary of that combat adds 3 seconds (a Combat Turn). It is ticked from the existing
  `updateCombat` hook beside the trace ticks.
- **No combat:** the upload card has **Upload finished (GM)**, an `uploadDone` request. The GM is the clock, as for
  manual traces.
- When elapsed ≥ `seconds` and the decker is STILL on that connection, session and host, the sequencer writes
  `upload-done:<id>`.
- If at any check he is not, it writes `upload-end:<id>` `{ why: "left the host" }`, and the upload is lost: "As
  soon as the upload completes, the frame starts running", and an interrupted upload never completes.
- **Departure is a durable transition, not a current-location check (R1 #4)**, so a quick trip away and back still
  counts. The same rule decides uploads and dumb frames (§4), `departedSince(owner, { conn, sessionId, host, since })`:
  - **the connection** ended or changed;
  - **under topology:** any 7b `move` fact on that connection after `since` (the upload's or the frame's start seq).
    Moves are written only for real place changes, so a failed logon elsewhere isn't a departure;
  - **topology off:** the live session's id isn't `sessionId`. Session ids are never reused, so leaving and coming
    back still differs.

  `passFor` runs `reconcileUploads(actor)`. A new `updateActor` hook also schedules the decker on any
  `flags.sr2e.vr2Session` change, because session switches are flag writes, not records (the 7b lesson).

### 3. Creation, idempotent (requirement: "actor/token creation reconciled idempotently against a departure")
**The writer.** The active GM's client runs `reconcileFrames()` from `passFor` and on `ready` and `userConnected`, as
the persona-token writer does. It creates the frame for every `upload-done` that has no `frame-end`, unless the frame
actor already exists.

**Deterministic identity.**
- The frame actor is created with `_id = uploadId` and `keepId: true`, so two passes or two GM clients can never
  create two. The server refuses the duplicate id.
- Its copies are created in the same `Actor.create` call (embedded `items`), so the actor and its programs appear
  in one write.

**The token.**
- If the owner has a persona token on a Matrix scene (`personaOn`), the GM creates the frame's token beside it, on
  a free square (`placePersona` with the persona's square as the area), linked, with the core's name.
- Otherwise there's no token: the frame lives on its sheet, and the GM may drag it out.
- The token is reconciled the same way: one per frame, created only while the frame isn't ended.

**Re-checks and late arrivals (R1 #5).**
- Before creating, the writer checks again, after each await, that the upload is done and not ended, that no actor
  with that id exists, and that it is still the writer (the persona-token pattern).
- A departure can still land while `Actor.create` is in flight. So, as in persona-tokens, `createActor`,
  `deleteActor`, `createToken` and `deleteToken` hooks on frames reschedule the owner's reconcile, and every pass
  re-derives:
  - an ended frame's late-created actor or token is deleted;
  - surplus tokens (more than one for a frame) are deleted, keeping the oldest.

### 4. Lifecycle (requirement: "stable incarnation id, host shutdown/deletion, replayable cleanup")
**`ended` is DERIVED, by a pure `frameEnds(...)`, from durable state (R1 #6–#8).** The sequencer records a
`frame-end:<uploadId>` `{ why }` fact on the owner's log when it notices, for the card and history. But nothing
depends on that write having happened: an interrupted pass is simply redone.

**What ends a frame:**
- **dumb, the owner leaves** ("If a decker logs off a host, any dumb frames he is running on that host crash …
  don't follow the decker to other systems", p.106): `departedSince(owner, …)` since the frame's `upload-done` seq
  (§2).
- **its monitor is full (R1 #8):** derived from its `frameHit` facts, so a crash can't be missed between two writes;
- **its host has shut down since it started** (R1 #7, R2 #1): derived from the host's own shutdown records: any shutdown
  run that went offline after the frame's (or the upload's) start seq, even if it was since reset. It's not just
  "offline now", so a reset can't revive a frame the shutdown wiped. It replays even if `tickShutdown` was
  interrupted, and it applies to uploads too. p.53: "a shutdown wipes out all frames";
- **its host or its owner is deleted (R1 #6):** derived from the missing document. The owner's log is gone then,
  so no fact is needed or written;
- **the GM deletes it:** a `deleteActor` hook on a frame writes `frame-end … why: "deleted"` if none exists.
- **Smart frames don't end with the owner's departure** ("independent existence … whether their creator is logged
  on or not", p.105). Their acting is 6a-2c, so in 6a-2a a smart frame simply persists until one of the other
  causes ends it.

**Cleanup, replayable.** For every ended frame, `reconcileFrames` deletes its tokens (every scene), its combatants
(every combat), any pending upload card buttons' targets, and finally the actor. Each step is checked against the
fact and is safe to repeat. A GM client that crashed halfway finishes on its next pass.

### 5. Frames as targets (the hook points 6a-2a covers; requirement: "every hook point")
Every `["ic", "character"]` check in vr2.mjs and vr2ic.mjs was grepped (about 40). 6a-2a changes these, through two
helpers:
- `iconKind(a)` is `ic | decker | frame` (6b adds `sk`);
- `limitClass(a)` gives the Limit option's target type: `ic | decker | frame` (p.104 lists frame and SK).

| Hook | Today | 6a-2a |
|---|---|---|
| attack target types (`attackOnce` ~1057, area extras ~980/~1167) | ic, character | + frame (not ended) |
| Limit classification (~967, ~1172) | `ic` else `decker` | `limitClass` |
| maneuver targets (~1682) | ic, character | unchanged in 6a-2a (frames maneuver in 6a-2b) |
| `sessionKey` (~840) | IC generation, else session | frame: `<uuid>:<uploadId>` |
| IC → frame: request/admission | a character on the log is admitted by the sequencer | frames have no connection log: no admission, resolved like IC targets (the resist button) |
| black IC hitting a frame | biofeedback on a decker | plain Matrix damage at the IC's level/Power: "as an icon, no biofeedback" (a Risks decision in this plan) |
| attribute / track / hog / slow effects | personas or IC | refused vs a frame until 6a-2b |
| resistance (`vr2MatrixResist` ~1373) | ic / character | frame: Bod (+ its Armor copy) vs Power, Shield copy via `askShield`; resisted by the frame's owner or the GM |
| damage write (`matrixDamage` ~1307) | ic / persona path | frame (R1 #9): the resolver sends `frameHit { uploadId, card, boxes, armorRef, shieldRef }`; the sequencer writes `frameHit:<card>` ONCE (keyed by the card, server-arbitrated), and the wear of the Armor/Shield copy with it. A second resolution of the same card (player and GM at once, or a retry) writes nothing. The copy's wear goes to
another document, so the sequencer replays it from the winning receipt (R2 #2): `addWear` is card-keyed and
idempotent, and `reconcileFrames` re-applies the wear named in every `frameHit` whose card isn't in the copy's
wear yet |
| crash at 10 boxes | IC crash / persona dump | derived: the monitor is full (§4) |
| Scan Icon (6a-0) | deckers | + frames: MPCP = Core Rating, persona ratings, Response Increase 0 |
| Locate Frame (system op) | no frames existed | on success, a GM whisper listing the SMART frames on that host ("locates any smart frames or SKs running on the host", p.115) |
| host shutdown (~1368) | deckers | + frames (§4) |

**Ended frames are guarded.** The attack, resist and Scan Icon paths refuse a frame whose `ended` is set: "<frame>
has crashed".

### 6. Tests (6a-2a)
**Vitest** (pure, in `module/rules/vr2-frames.mjs`):
- upload seconds (Genie's 1,392 Mp at 20 MePS → 70 s → 24 turns), and an I/O speed of 0 refused;
- `frameEnds(...)` for every dumb and smart cause, and `departedSince` (a move after the start, a move before
  it, topology off with a new session, a failed logon's session switch not counted under topology);
- the derived monitor from `frameHit` facts, with a duplicate card counted once;
- `limitClass` and `iconKind`.

**Quench `sr2e.vr2-frames` additions:**
- the upload is refused off-host, compressed, unwritten, or with a void load;
- a combat upload completes after ⌈s ÷ 3⌉ round boundaries and creates exactly one frame actor (two
  `reconcileFrames` passes at once → one), with copies as locked items and the right attributes;
- a manual upload completes on the GM's button;
- leaving the host mid-upload ends it with no frame;
- a dumb frame crashes when the owner logs onto another host; a smart one persists;
- IC attacks a frame: Bod + Armor resist, 10 boxes crash it, and cleanup removes the actor and its token;
- the same attack resolved twice (owner and GM): damage lands once;
- a squeezed Armor copy is usable after the frame's decompression, and a Sensitive copy is judged on the frame's
  host;
- the owner out to another host and straight back (topology on and off): the dumb frame is ended;
- a Limit:frame attack works on a frame and is refused on a decker;
- host shutdown ends the frames on it;
- deleting the frame by hand writes its end.

## Requirements carried to the 6a / 6b / 6c plans (Codex R1, accepted)
Each phase gets its own detailed plan, Codex-reviewed before code. It must answer:
- **6a, frame decoys:** a separate mode from plain decoys (security goes after the frame, the decker stays inactive,
  the frame's own defences and attributes apply, its crash ends it, trace still reaches the owner).
- **6a, upload vs departure:** bind an upload to the connection AND host session; completion admitted by the
  sequencer; actor/token/combatant creation reconciled idempotently against a departure.
- **6a, every hook point:** attacker admission (`admitDeckerCards` and its chat hook), guards, incarnation keys,
  resistance, monitor writes, Shield/Armor, maneuvers, attribute effects, Limit classification (incl. `kind: "sk"`),
  host shutdown (which enumerates characters today).
- **6a, loaded programs:** full immutable copies (options, attack semantics, identities) materialized as runtime
  items or an equivalent adapter that `activePrograms`/`spendUse`/DINAB wear accept, with their own wear/crash state.
- **6a, loading completion:** the whole loading snapshot in the winning task's terminal record; the active load
  derived by task generation, never a separate write that can be lost or overwrite a newer load.
- **6a, the core design:** frame fields in the frozen design (`designOf`); core-only option eligibility (DINAB,
  optimization, squeeze; no Sensitive), DINAB capped by the programmer's Computer, mandatory on smart cores; the
  Computer × 1.5 cap wired in.
- **6a, dumb-core DINAB:** claimed against the owner's action and the core, not the frame's (empty) combat phase,
  with an explicit recipient for wear/crash.
- **6a, an execution context** for frame actions separating commander, acting icon, skill, utilities, host session
  and tally/trace owner (System Tests read all of these from the character today).
- **6a, every quoted constraint:** decompress before upload; cut program ratings when the Core Rating drops; event
  triggers' Sensor + analyze/scanner ≥ half the host's Security Value and same-host delivery.
- **6a/6b lifecycle:** schema defaults, a stable incarnation id, host shutdown/deletion, replayable cleanup of tokens,
  combatants, decoy references and pending actions.
- **6b, SK pool:** serialized allocation and locked restore/medic points, versioned virtual utilities, native-host
  return/repair/travel/crash transitions, Graceful Logoff for a deckless icon.
- **6c, command sets:** one contract for upload, load verdict, the summed host successes and the purge deadline.
- **Tests** for each of the above, including two-device races and interrupted completions.

## Key decisions & trade-offs
- **A new actor type** rather than reusing IC (above). The cost is a server restart on upgrade and a migration-free
  type addition. Check `invalidDocumentIds` after adding it ([[sr2e-stringfield-blank-trap]]).
- **Loaded programs are copied into the frame**, not linked to live items, so a frame never changes under a running
  game.
- **Whether a dumb frame's attack rolls the program's rating or the decker's Computer.** The book says decoy tests use
  the decker's Computer skill, but attacks have used the utility's rating since part 5a (p.123). The plan keeps that
  split.
- **SKs share the frame actor type** instead of being NPC-like characters: same icon mechanics, plus a pool.
- **Event triggers are narrative.** They are a GM note: the frame posts a card when the GM marks an event.

## Risks / open questions
- **Pages:** all the rules this plan uses are read from renders (Null Operation and Scan Icon p.117 on 2026-11-04).
- **Gaps in the book:**
  - It doesn't say whether a dumb frame takes damage from black IC's lethal effects. Plan: as an icon, no biofeedback.
  - Smart frame action economy: "its own actions", so it uses the same action types as a decker. Assumed.
- **Concurrency:** a frame actor created by the GM client for a player's upload, and its crash on logoff through the
  sequencer, so a logoff on one device and a command on another can't race.
- **Scale:** many frames on a host make many combatants. Fine for table scale.

## Decided (2026-11-03)
The user isn't familiar with VR2.0 and asked for the most complete and correct reading, so these are Claude's calls,
explained so the user can override them.
1. **Separate releases:**
   - 6a-0: the Decoy operation;
   - 6a: frames;
   - 6b: SKs;
   - 6c: command sets (upgrading has its own plan).

   Each is smaller to review and test, and each is useful alone.
2. **Combat tracker:** a smart frame is a combatant like any other icon, with its own Initiative (p.106–107). It joins
   an active combat when it's uploaded, and outside combat it simply exists on the host. A dumb frame never joins: it
   acts on the decker's Simple Action.
3. **Command sets are automated.** Everything p.104 states is a rule:
   - the 1D6 × 20 Mp size;
   - the Control Test to load it;
   - 24 ÷ the host's summed successes = hours undetected, 48 if none.

   Which Subsystem Test the set needs is the GM's pick, as the book says, with Control as the default.

## Documentation (part of done)
- **Wiki:** "The Matrix" section, plus a How-To-Guides walkthrough for anything that takes the GM or the decker more
  than one step, with screenshots and a GIF of the flow in use.
- **In Foundry:** `npm run gen-guides && npm run build-packs guides` ships the how-to, with its images, in the SR2E
  Player Guides pack.

## Out of scope
- True AI (p.141–142: GM fiat).
- Otaku complex forms and sprites.
- Grid topology.
- Deck construction.
- Native-host master programs.
- Satellite links.
